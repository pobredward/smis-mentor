/**
 * 재고 서버 로직 (Next.js API 라우트 전용, Admin SDK)
 *
 * 1) reconcileDoseLedger — 약 복용 기록 ↔ 재고 원장
 *    앱이 환자 기록을 저장/수정/삭제한 뒤 호출한다. 원장(inventoryDoseLedger/{recordId})에 있는
 *    "이미 재고에 반영된 복용 기록"과 현재 환자 문서를 **트랜잭션 안에서** 비교해 차이만 재고에 반영한다.
 *    - 여러 번·늦게·순서가 바뀌어 호출돼도 원장 기준이라 두 번 차감되지 않는다.
 *    - 호출이 한 번 실패해도 다음 저장 때 호출되면 그동안의 차이까지 모두 맞춰진다.
 *    - 기록이 삭제됐으면 현재 복용 0건으로 보고 전량 복구 후 원장 삭제.
 *    - 재고가 0 미만이 되어도 막지 않는다 (앱에서 "실사 필요"로 표시).
 *
 * 2) notifyLostItem — 분실물 등록 푸시 (문서당 1회)
 *    - notify === false 면 보내지 않음
 *    - 이름표(ownerName)가 있으면 담임·방 담당·해당 그룹 매니저/부매니저에게만, 없으면 캠프 스태프 전원 (등록자 제외)
 *
 * 3) notifyLostMatched — "잃어버렸어요" 신고와 "주웠어요" 등록을 연결했을 때 (짝당 1회)
 *    - 양쪽 등록자 + 학생을 지정한 신고면 그 학생의 담임·방 담당·부매니저 (연결한 사람 제외)
 */
import { getAdminFirestore, adminFieldValue } from './firebase-admin';
import { notificationAllowed, pushReachOf, lostNotifyRecipients, isCampStaffRole, isStockGroupOf, STOCK_MANAGER_GROUP_ROLES, type NotifyUserLike } from '@smis-mentor/shared';
import { notifySupply } from './supplyNotify';
import * as admin from 'firebase-admin';

interface DoseLike {
  id: string;
  itemId: string;
  itemName: string;
  itemKind?: string;
  groupId: string;
  groupName: string;
  quantity: number;
  source?: 'initial' | 'progress';
  givenBy?: string;
}
type Applied = Record<string, { itemId: string; itemName: string; itemKind?: string; groupId: string; groupName: string; quantity: number; source?: string }>;

function toArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object') {
    const o = v as Record<string, T>;
    return Object.keys(o).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b)).map(k => o[k]);
  }
  return [];
}
function validDoses(v: unknown): DoseLike[] {
  return toArray<DoseLike>(v).filter(d => d && d.id && d.itemId && d.groupId && Number(d.quantity) > 0);
}

/** @returns 재고 변동 건수 */
export async function reconcileDoseLedger(recordId: string, fallbackCampCode?: string): Promise<number> {
  const db = getAdminFirestore();
  return db.runTransaction(async (tx) => {
    const recRef = db.doc(`patientRecords/${recordId}`);
    const ledRef = db.doc(`inventoryDoseLedger/${recordId}`);
    const [recSnap, ledSnap] = await Promise.all([tx.get(recRef), tx.get(ledRef)]);
    if (!recSnap.exists && !ledSnap.exists) return 0;
    const rec = recSnap.data() ?? {};
    const led = ledSnap.data() ?? {};
    const campCode: string | undefined = rec.campCode ?? led.campCode ?? fallbackCampCode;
    if (!campCode) return 0;
    const studentName: string = rec.studentName ?? led.studentName ?? '';

    const current = recSnap.exists ? validDoses(rec.medicationDoses) : [];
    const applied: Applied = (led.applied ?? {}) as Applied;
    const now = admin.firestore.Timestamp.now();

    type Change = { itemId: string; itemName: string; groupId: string; groupName: string; delta: number; reason: string; doseId: string; label: string; by: string };
    const changes: Change[] = [];
    const labelOf = (src?: string) =>
      `${studentName}${src === 'progress' ? ' 경과보고' : src === 'initial' ? ' 최초보고' : ''}`.trim() || '약 복용';

    const currentIds = new Set(current.map(d => d.id));
    current.forEach(n => {
      const p = applied[n.id];
      const by = n.givenBy || '자동';
      if (!p) {
        changes.push({ itemId: n.itemId, itemName: n.itemName, groupId: n.groupId, groupName: n.groupName, delta: -n.quantity, reason: 'dose', doseId: n.id, label: labelOf(n.source), by });
      } else if (p.itemId === n.itemId && p.groupId === n.groupId) {
        const diff = n.quantity - p.quantity;
        if (diff !== 0) changes.push({ itemId: n.itemId, itemName: n.itemName, groupId: n.groupId, groupName: n.groupName, delta: -diff, reason: 'dose_adjust', doseId: n.id, label: labelOf(n.source), by });
      } else {
        changes.push({ itemId: p.itemId, itemName: p.itemName, groupId: p.groupId, groupName: p.groupName, delta: p.quantity, reason: 'dose_revert', doseId: n.id, label: labelOf(n.source), by });
        changes.push({ itemId: n.itemId, itemName: n.itemName, groupId: n.groupId, groupName: n.groupName, delta: -n.quantity, reason: 'dose', doseId: n.id, label: labelOf(n.source), by });
      }
    });
    Object.entries(applied).forEach(([doseId, p]) => {
      if (currentIds.has(doseId)) return;
      changes.push({ itemId: p.itemId, itemName: p.itemName, groupId: p.groupId, groupName: p.groupName, delta: p.quantity, reason: 'dose_revert', doseId, label: labelOf(p.source), by: '자동' });
    });
    if (changes.length === 0 && current.length > 0 && ledSnap.exists) return 0;

    // 품목별 그룹 delta 합산 → 재고 문서 1회 쓰기
    const perItem = new Map<string, Record<string, number>>();
    changes.forEach(c => {
      const acc = perItem.get(c.itemId) ?? {};
      acc[c.groupId] = (acc[c.groupId] ?? 0) + c.delta;
      perItem.set(c.itemId, acc);
    });
    perItem.forEach((groupDeltas, itemId) => {
      const stocks: Record<string, FirebaseFirestore.FieldValue> = {};
      Object.entries(groupDeltas).forEach(([g, d]) => { if (d !== 0) stocks[g] = adminFieldValue.increment(d); });
      if (Object.keys(stocks).length === 0) return;
      tx.set(db.doc(`inventoryStocks/${campCode}__${itemId}`), { campCode, itemId, stocks, updatedAt: now }, { merge: true });
    });
    changes.forEach(c => {
      tx.set(db.collection('inventoryMovements').doc(), {
        campCode, itemId: c.itemId, itemName: c.itemName, groupId: c.groupId, groupName: c.groupName,
        delta: c.delta, reason: c.reason, refPatientId: recordId, refDoseId: c.doseId, refLabel: c.label,
        at: now, by: c.by,
      });
    });

    if (current.length === 0) {
      if (ledSnap.exists) tx.delete(ledRef);
    } else {
      const nextApplied: Applied = {};
      current.forEach(d => {
        nextApplied[d.id] = {
          itemId: d.itemId, itemName: d.itemName, groupId: d.groupId, groupName: d.groupName, quantity: d.quantity,
          ...(d.itemKind ? { itemKind: d.itemKind } : {}), ...(d.source ? { source: d.source } : {}),
        };
      });
      tx.set(ledRef, { campCode, studentName, applied: nextApplied, updatedAt: now });
    }
    return changes.length;
  });
}

interface LostItemDoc {
  campCode: string;
  jobCodeId?: string;
  name: string;
  foundPlace?: string;
  notify?: boolean;
  notifiedAt?: unknown;
  reportedById?: string;
  ownerName?: string;
  ownerClassMentor?: string;
  ownerUnitMentor?: string;
  ownerGroup?: string;
  /** 'found'(주웠어요, 기본) · 'lost'(잃어버렸어요) */
  kind?: 'found' | 'lost';
  description?: string;
  /** 'owner'(기본) 담당 선생님에게만 · 'all' 캠프 전체 */
  notifyScope?: 'owner' | 'all';
  /** 'owner' 일 때 대상 — 없으면 셋 다 */
  notifyTargets?: Array<'classMentor' | 'unitMentor' | 'groupManager'>;
  keptAt?: string;
  matchedId?: string;
  matchedBy?: string;
  matchNotifiedAt?: unknown;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** @returns 알림 받은 사람 수 */
export async function notifyLostItem(lostItemId: string): Promise<{ sent: number; missed: Array<{ name: string; state: string }> }> {
  const db = getAdminFirestore();
  const ref = db.doc(`lostItems/${lostItemId}`);
  // 문서당 한 번만 발송 (notifiedAt을 트랜잭션으로 선점)
  const item = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return undefined;
    const d = snap.data() as LostItemDoc;
    if (d.notifiedAt || d.notify === false || !d.jobCodeId) return undefined;
    tx.update(ref, { notifiedAt: admin.firestore.Timestamp.now() });
    return d;
  });
  if (!item) return { sent: 0, missed: [] };

  const usersSnap = await db.collection('users').where('jobCodeIds', 'array-contains', item.jobCodeId).get();
  // 대상 계산은 shared 의 lostNotifyRecipients 한 곳에서 — 등록 화면 미리보기와 같은 기준
  type CampUser = NotifyUserLike & { id: string; pushTokens?: Record<string, { platform?: string }> };
  const all = usersSnap.docs.map(d => ({ ...(d.data() as object), id: d.id })) as CampUser[];
  let targets = lostNotifyRecipients(all, {
    jobCodeId: item.jobCodeId,
    // 등록 화면에서 고른 범위를 그대로 따른다 (미리보기와 같은 기준).
    // 고른 값이 없으면: 주운 물건은 담당 선생님, 잃어버린 물건은 누가 주웠을지 모르니 캠프 전체
    scope: item.ownerName && (item.notifyScope ?? (item.kind === 'lost' ? 'all' : 'owner')) === 'owner' ? 'owner' : 'all',
    targets: item.notifyTargets?.length ? item.notifyTargets : ['classMentor', 'unitMentor', 'groupManager'],
    ownerClassMentor: item.ownerClassMentor,
    ownerUnitMentor: item.ownerUnitMentor,
    ownerGroup: item.ownerGroup,
    excludeId: item.reportedById,
  });

  // 보내려 했지만 못 받는 사람을 따로 모은다 — 등록한 사람이 "알림 켜 달라"고 말할 수 있게
  const missed: Array<{ name: string; state: string }> = [];
  targets = targets.filter(u => {
    const reach = pushReachOf(u);
    const state = reach.state !== 'ok' ? reach.state
      : !notificationAllowed(u.notificationSettings, 'lostItem') ? 'typeOff'
      : null;
    if (state) { missed.push({ name: String(u.name ?? '').trim() || '이름 없음', state }); return false; }
    return true;
  });

  const place = item.foundPlace ? ` · ${item.foundPlace}` : '';
  const isLost = item.kind === 'lost';
  const title = isLost
    ? (item.ownerName ? `🙋 ${item.ownerName} 학생이 물건을 찾아요` : '🙋 물건을 찾고 있어요')
    : (item.ownerName ? `🔍 ${item.ownerName} 학생 분실물` : '🔍 분실물 등록');
  const body = isLost
    ? `${item.name}${place} — 보신 분은 알려주세요`
    : (item.ownerName ? `${item.name}${place} — 학생에게 전달해주세요` : `${item.name}${place} — 주인을 찾고 있어요`);

  const messages: Record<string, unknown>[] = [];
  targets.forEach(u => {
    Object.keys(u.pushTokens ?? {})
      .filter(t => /^(Exponent|Expo)PushToken\[.+\]$/.test(t))
      .forEach(to => messages.push({
        to, sound: 'default', title, body, priority: 'high', channelId: 'default',
        data: { type: 'lost-item', lostItemId, screen: 'Camp', tab: 'inventory' },
      }));
  });
  await sendExpoPush(messages);
  return { sent: targets.length, missed };
}

async function sendExpoPush(messages: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < messages.length; i += 100) {
    try {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
    } catch (e) {
      console.error('분실물 푸시 전송 오류:', e);
    }
  }
}

/**
 * 짝 연결 알림 — 신고한 선생님(과 학생 담당)에게 "찾았어요"
 * @param lostItemId 연결된 두 건 중 아무거나
 * @param actorUid 연결한 사람 (본인은 제외)
 */
export async function notifyLostMatched(lostItemId: string, actorUid: string): Promise<{ sent: number; missed: Array<{ name: string; state: string }> }> {
  const db = getAdminFirestore();
  const ref = db.doc(`lostItems/${lostItemId}`);
  // 짝당 한 번만: 두 문서 중 먼저 본 쪽에 matchNotifiedAt 을 찍고, 상대 문서도 같이 찍는다
  const pair = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return undefined;
    const a = snap.data() as LostItemDoc;
    if (!a.matchedId || a.matchNotifiedAt || !a.jobCodeId) return undefined;
    const bRef = db.doc(`lostItems/${a.matchedId}`);
    const bSnap = await tx.get(bRef);
    if (!bSnap.exists) return undefined;
    const b = bSnap.data() as LostItemDoc;
    if (b.matchNotifiedAt) return undefined;
    const now = admin.firestore.Timestamp.now();
    tx.update(ref, { matchNotifiedAt: now });
    tx.update(bRef, { matchNotifiedAt: now });
    return { a: { ...a, id: snap.id }, b: { ...b, id: bSnap.id } };
  });
  if (!pair) return { sent: 0, missed: [] };

  const lost = pair.a.kind === 'lost' ? pair.a : pair.b.kind === 'lost' ? pair.b : null;
  const found = lost === pair.a ? pair.b : pair.a;
  const usersSnap = await db.collection('users').where('jobCodeIds', 'array-contains', pair.a.jobCodeId).get();
  type CampUser = NotifyUserLike & { id: string; pushTokens?: Record<string, { platform?: string }> };
  const all = usersSnap.docs.map(d => ({ ...(d.data() as object), id: d.id })) as CampUser[];

  // 받는 사람: 양쪽 등록자 + (학생을 지정한 신고면) 그 학생 담당 셋 — 연결한 사람은 제외
  const ids = new Set<string>();
  [pair.a.reportedById, pair.b.reportedById].forEach(id => { if (id && id !== actorUid) ids.add(id); });
  const owner = lost?.ownerName ? lost : found.ownerName ? found : null;
  if (owner) {
    lostNotifyRecipients(all, {
      jobCodeId: pair.a.jobCodeId!,
      scope: 'owner',
      targets: ['classMentor', 'unitMentor', 'groupManager'],
      ownerClassMentor: owner.ownerClassMentor,
      ownerUnitMentor: owner.ownerUnitMentor,
      ownerGroup: owner.ownerGroup,
      excludeId: actorUid,
    }).forEach(u => ids.add(u.userId ?? u.id));
  }
  let targets = all.filter(u => ids.has(u.userId ?? u.id));

  const missed: Array<{ name: string; state: string }> = [];
  targets = targets.filter(u => {
    const reach = pushReachOf(u);
    const state = reach.state !== 'ok' ? reach.state
      : !notificationAllowed(u.notificationSettings, 'lostItem') ? 'typeOff'
      : null;
    if (state) { missed.push({ name: String(u.name ?? '').trim() || '이름 없음', state }); return false; }
    return true;
  });

  const who = owner?.ownerName ? `${owner.ownerName} 학생 ` : '';
  const title = `🔗 ${who}물건을 찾았어요`;
  const kept = found.keptAt ? ` · 보관: ${found.keptAt}` : '';
  const by = pair.a.matchedBy ? ` — ${pair.a.matchedBy} 연결` : '';
  const body = `${lost?.name ?? pair.a.name} ↔ ${found.name}${kept}${by}`;

  const messages: Record<string, unknown>[] = [];
  targets.forEach(u => {
    Object.keys(u.pushTokens ?? {})
      .filter(t => /^(Exponent|Expo)PushToken\[.+\]$/.test(t))
      .forEach(to => messages.push({
        to, sound: 'default', title, body, priority: 'high', channelId: 'default',
        data: { type: 'lost-item', lostItemId: lost?.id ?? pair.a.id, screen: 'Camp', tab: 'inventory' },
      }));
  });
  await sendExpoPush(messages);
  return { sent: targets.length, missed };
}

// ==================== 4) 부매니저 재고 운영 (입고 · 조정 · 이동) ====================
// 관리자는 앱에서 바로 쓰고(보안 규칙이 허용), 부매니저는 이 서버 경로로만 쓴다.
// 서버가 "내 그룹" 여부를 확인하고, 앱과 같은 모양의 입출고 기록을 남긴다.

export class StockOpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type StockOp =
  | { op: 'restock'; campCode: string; itemId: string; groupId: string; quantity: number; expiry?: string; memo?: string }
  | { op: 'adjust'; campCode: string; itemId: string; groupId: string; target: number; reason: string }
  | { op: 'transfer'; campCode: string; itemId: string; fromGroupId: string; toGroupId: string; quantity: number; memo?: string };

export async function runStockOp(uid: string, input: StockOp): Promise<{ from?: number; to?: number; value?: number }> {
  const db = getAdminFirestore();
  const campCode = String(input.campCode ?? '');
  const itemId = String(input.itemId ?? '');
  if (!campCode || !itemId || campCode.includes('/') || itemId.includes('/')) throw new StockOpError(400, '품목 정보가 필요합니다.');

  // 권한: 관리자 또는 이 캠프의 부매니저
  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.data() as { name?: string; role?: string; jobExperiences?: Array<{ id: string; group?: string; groupRole?: string }> } | undefined;
  if (!user || !isCampStaffRole(user.role)) throw new StockOpError(403, '캠프 스태프만 사용할 수 있습니다.');
  const jobCodes = await db.collection('jobCodes').where('code', '==', campCode).get();
  const exp = user.jobExperiences?.find(e => jobCodes.docs.some(d => d.id === e.id));
  const isAdmin = user.role === 'admin';
  const isSub = !!exp?.groupRole && STOCK_MANAGER_GROUP_ROLES.includes(exp.groupRole);
  if (!isAdmin && !isSub) throw new StockOpError(403, '관리자나 부매니저만 재고를 바꿀 수 있습니다.');
  const byName = String(user.name ?? '').trim() || '이름 없음';

  // 관련 그룹 읽기 + 캠프 확인
  const groupIds = input.op === 'transfer' ? [input.fromGroupId, input.toGroupId] : [input.groupId];
  if (groupIds.some(id => !id || String(id).includes('/'))) throw new StockOpError(400, '그룹 정보가 필요합니다.');
  const groupSnaps = await Promise.all(groupIds.map(id => db.doc(`inventoryGroups/${id}`).get()));
  const groups = groupSnaps.map(s => ({ id: s.id, ...(s.data() as { campCode?: string; name?: string; campGroupName?: string } | undefined) }));
  if (groups.some(g => g.campCode !== campCode)) throw new StockOpError(400, '이 캠프의 그룹이 아닙니다.');
  const mine = (g: typeof groups[number]) => isAdmin || isStockGroupOf({ campGroupName: g.campGroupName, name: g.name ?? '' }, exp?.group);

  if (input.op === 'transfer') {
    if (!mine(groups[0]) && !mine(groups[1])) throw new StockOpError(403, '내 그룹이 포함된 이동만 할 수 있습니다.');
  } else if (!mine(groups[0])) {
    throw new StockOpError(403, '내 그룹 재고만 바꿀 수 있습니다.');
  }

  const itemSnap = await db.doc(`inventoryItems/${itemId}`).get();
  if (!itemSnap.exists) throw new StockOpError(404, '품목을 찾을 수 없습니다.');
  const itemName = String(itemSnap.data()?.name ?? '');
  const ref = db.doc(`inventoryStocks/${campCode}__${itemId}`);
  const movements = db.collection('inventoryMovements');
  const now = admin.firestore.Timestamp.now();
  const base = { campCode, itemId, itemName, at: now, by: byName, byId: uid };
  const clean = <T extends Record<string, unknown>>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

  if (input.op === 'restock') {
    const q = Math.round(Number(input.quantity));
    if (!(q > 0 && q <= 100000)) throw new StockOpError(400, '입고 수량을 1 이상 입력해주세요.');
    const g = groups[0];
    const expiry = input.expiry && /^\d{4}-\d{2}-\d{2}$/.test(input.expiry) ? input.expiry : undefined;
    const value = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const data = snap.data() ?? {};
      const cur = Number(data.stocks?.[g.id]) || 0;
      const oldExpiry: string | undefined = data.expiries?.[g.id];
      // 유효기간: 남은 재고가 있으면 더 빠른 날짜를 유지한다 (입고로 만료 경고가 사라지지 않게)
      const nextExpiry = expiry && (cur <= 0 || !oldExpiry || expiry < oldExpiry) ? expiry : undefined;
      tx.set(ref, {
        campCode, itemId,
        stocks: { [g.id]: cur + q },
        ...(nextExpiry ? { expiries: { [g.id]: nextExpiry } } : {}),
        updatedAt: now,
      }, { merge: true });
      tx.set(movements.doc(), clean({ ...base, groupId: g.id, groupName: g.name, delta: q, reason: 'restock', refLabel: '재고 입고', memo: input.memo?.trim() || undefined }));
      return cur + q;
    });
    return { value };
  }

  if (input.op === 'adjust') {
    const target = Math.round(Number(input.target));
    if (!(target >= 0 && target <= 100000)) throw new StockOpError(400, '조정 후 수량을 0 이상 입력해주세요.');
    const reason = String(input.reason ?? '').trim();
    if (!reason) throw new StockOpError(400, '조정 사유를 입력해주세요.');
    const g = groups[0];
    const value = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const cur = Number(snap.data()?.stocks?.[g.id]) || 0;
      if (cur === target) return cur;
      tx.set(ref, { campCode, itemId, stocks: { [g.id]: target }, updatedAt: now }, { merge: true });
      tx.set(movements.doc(), clean({ ...base, groupId: g.id, groupName: g.name, delta: target - cur, reason: 'adjust', refLabel: '수량 조정', memo: reason.slice(0, 500) }));
      return target;
    });
    return { value };
  }

  // 이동 — 한 문서 · 한 트랜잭션 (보내는 쪽 −, 받는 쪽 +)
  const q = Math.round(Number(input.quantity));
  if (!(q > 0)) throw new StockOpError(400, '이동 수량을 1 이상 입력해주세요.');
  const [from, to] = groups;
  if (from.id === to.id) throw new StockOpError(400, '같은 그룹으로는 이동할 수 없습니다.');
  const result = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new StockOpError(400, '이 캠프에 둔 재고가 없는 품목입니다.');
    const stocks = (snap.data()?.stocks ?? {}) as Record<string, number>;
    const fromCur = Number(stocks[from.id]) || 0;
    const toCur = Number(stocks[to.id]) || 0;
    if (fromCur < q) throw new StockOpError(400, `${from.name} 보유 수량(${fromCur})보다 많이 옮길 수 없습니다.`);
    const transferId = movements.doc().id;
    tx.update(ref, { [`stocks.${from.id}`]: fromCur - q, [`stocks.${to.id}`]: toCur + q, updatedAt: now });
    const common = { ...base, reason: 'transfer', transferId, memo: input.memo?.trim() || undefined };
    tx.set(movements.doc(), clean({ ...common, groupId: from.id, groupName: from.name, counterGroupId: to.id, counterGroupName: to.name, delta: -q, refLabel: `${to.name}(으)로 보냄` }));
    tx.set(movements.doc(), clean({ ...common, groupId: to.id, groupName: to.name, counterGroupId: from.id, counterGroupName: from.name, delta: q, refLabel: `${from.name}에서 받음` }));
    return { from: fromCur - q, to: toCur + q };
  });

  // 알림: 다른 그룹 재고를 가져왔으면 그 그룹 부매니저에게, 보낸 쪽이 최소 미만이면 재고 부족
  const pulled = !isAdmin && !mine(from);
  await Promise.all([
    pulled
      ? notifySupply({ type: 'stock_taken', campCode, itemId, fromGroupId: from.id, toGroupId: to.id, quantity: q, byName }, uid).catch(e => console.error('재고 이동 알림 오류:', e))
      : Promise.resolve(),
    notifySupply({ type: 'stock_low', campCode, itemId, groupId: from.id }, uid).catch(e => console.error('재고 부족 알림 오류:', e)),
  ]);
  return result;
}
