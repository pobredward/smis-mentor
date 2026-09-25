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
 */
import { getAdminFirestore, adminFieldValue } from './firebase-admin';
import { notificationAllowed, pushReachOf, lostNotifyRecipients, type NotifyUserLike } from '@smis-mentor/shared';
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
  /** 'owner'(기본) 담당 선생님에게만 · 'all' 캠프 전체 */
  notifyScope?: 'owner' | 'all';
  /** 'owner' 일 때 대상 — 없으면 셋 다 */
  notifyTargets?: Array<'classMentor' | 'unitMentor' | 'groupManager'>;
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
    scope: item.ownerName && item.notifyScope !== 'all' ? 'owner' : 'all',
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

  const title = item.ownerName ? `🔍 ${item.ownerName} 학생 분실물` : '🔍 분실물 등록';
  const place = item.foundPlace ? ` · ${item.foundPlace}` : '';
  const body = item.ownerName ? `${item.name}${place} — 학생에게 전달해주세요` : `${item.name}${place} — 주인을 찾고 있어요`;

  const messages: Record<string, unknown>[] = [];
  targets.forEach(u => {
    Object.keys(u.pushTokens ?? {})
      .filter(t => /^(Exponent|Expo)PushToken\[.+\]$/.test(t))
      .forEach(to => messages.push({
        to, sound: 'default', title, body, priority: 'high', channelId: 'default',
        data: { type: 'lost-item', lostItemId, screen: 'Camp', tab: 'inventory' },
      }));
  });
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
  return { sent: targets.length, missed };
}
