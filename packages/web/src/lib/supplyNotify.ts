/**
 * 재고·구매 요청 푸시 알림 (Next.js API 라우트 전용, Admin SDK)
 *
 * 앱이 동작을 마친 뒤 /api/inventory/notify 로 이벤트를 보내면, 서버가 **현재 문서 상태**를 읽어 받을 사람을 정한다.
 * (앱이 받는 사람을 지정하지 않으므로 아무에게나 보낼 수 없다)
 *
 * - request_created  새 구매 요청 → 구매 담당(요청별 지정 → 캠프 기본 담당, 없으면 관리자)
 * - buyer_assigned   요청별 구매 담당 지정 → 지정된 사람
 * - default_buyer    캠프 기본 구매 담당 지정 → 그 사람
 * - lines_done       품목 구매 완료 → 요청자 + 정산할 사람 (학생: 담임, 선생님 물품: 요청자, 학부모 청구·캠프 공용: 관리자)
 * - settled          정산 완료 → 사 온 사람
 * - status           반려·보류 → 요청자
 * - comment          댓글 → 요청자 + 구매 담당 (작성자 제외)
 * - stock_low        사용 기록 후 최소 수량 미만 → 관리자 · 매니저 · 부매니저
 *
 * 받는 사람의 알림 설정(전체 on/off + 종류별 on/off)을 존중한다 — notificationAllowed() 한 곳에서 판단한다.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { getAdminFirestore } from './firebase-admin';
import {
  notificationAllowed, pushReachOf, STOCK_MANAGER_GROUP_ROLES, isStockGroupOf,
  type NotificationKey, type NotificationSettings, type PushReachState,
} from '@smis-mentor/shared';

/** 못 받은 이유 — 푸시 상태 + '이 종류를 껐음' */
export type MissedState = PushReachState | 'typeOff';
export interface MissedTarget { name: string; state: MissedState; key: NotificationKey }
/**
 * notifySupply 한 번 호출 동안 모이는 '못 받은 사람'.
 * 같은 프로세스에서 요청이 동시에 처리돼도 섞이지 않도록 호출 단위로 보관한다.
 */
const missedStore = new AsyncLocalStorage<MissedTarget[]>();
const missed = { push: (m: MissedTarget) => { missedStore.getStore()?.push(m); } };

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type Doc = FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot;
interface UserLite {
  id: string; name: string; role?: string; tokens: string[];
  settings?: NotificationSettings;
  /** 푸시 수신 가능 여부 판단용 원본 (pushTokens · notificationPermission 포함) */
  raw: Record<string, unknown>;
  exp?: { group?: string; groupRole?: string; classCode?: string };
}

export type SupplyNotifyEvent =
  | { type: 'request_created'; requestId: string }
  | { type: 'buyer_assigned'; requestIds: string[] }
  | { type: 'default_buyer'; campCode: string }
  /** 부매니저가 다른 그룹 재고를 자기 그룹으로 가져왔을 때 → 가져간 그룹의 부매니저에게 (서버 내부에서만 보냄) */
  | { type: 'stock_taken'; campCode: string; itemId: string; fromGroupId: string; toGroupId: string; quantity: number; byName: string }
  | { type: 'lines_done'; requestId: string; lineIds: string[] }
  | { type: 'settled'; requestId: string; lineIds: string[] }
  | { type: 'status'; requestId: string }
  | { type: 'comment'; requestId: string }
  | { type: 'stock_low'; campCode: string; itemId: string; groupId: string };

const won = (n?: number) => `${(n ?? 0).toLocaleString('ko-KR')}원`;

async function jobCodeIdOf(campCode: string): Promise<string | undefined> {
  const db = getAdminFirestore();
  const snap = await db.collection('jobCodes').where('code', '==', campCode).get();
  if (snap.empty) return undefined;
  // 같은 코드가 여러 기수에 있으면 가장 최근 기수
  const docs = [...snap.docs].sort((a, b) => Number(b.data().generation ?? 0) - Number(a.data().generation ?? 0));
  return docs[0].id;
}

async function campUsers(campCode: string): Promise<UserLite[]> {
  const db = getAdminFirestore();
  const jobCodeId = await jobCodeIdOf(campCode);
  if (!jobCodeId) return [];
  const snap = await db.collection('users').where('jobCodeIds', 'array-contains', jobCodeId).get();
  return snap.docs.map((d: Doc) => {
    const u = d.data() ?? {};
    return {
      id: d.id,
      name: String(u.name ?? '').trim(),
      role: u.role,
      tokens: Object.keys(u.pushTokens ?? {}).filter(t => /^(Exponent|Expo)PushToken\[.+\]$/.test(t)),
      settings: u.notificationSettings as NotificationSettings | undefined,
      raw: u as Record<string, unknown>,
      exp: (u.jobExperiences ?? []).find((e: { id?: string }) => e.id === jobCodeId),
    };
  });
}

/**
 * 알림 전송. 보낸 사람 수를 돌려주고, **못 받은 사람은 missed 에 모아 둔다**
 * (보낸 사람이 "○○ 선생님은 알림을 못 받아요"를 바로 알고 켜 달라고 말할 수 있게).
 * @param key 알림 종류 — 받는 사람이 이 종류를 껐으면 보내지 않는다
 */
async function send(key: NotificationKey, targets: UserLite[], title: string, body: string, data: Record<string, unknown>, exceptUid?: string): Promise<number> {
  const seen = new Set<string>();
  const intended = targets.filter(u => u && u.id !== exceptUid && !seen.has(u.id) && seen.add(u.id));
  const list: UserLite[] = [];
  intended.forEach(u => {
    const reach = pushReachOf(u.raw);
    // 종류별로 껐는지까지 함께 본다
    const state: MissedState | null =
      reach.state !== 'ok' ? reach.state
      : !notificationAllowed(u.settings, key) ? 'typeOff'
      : null;
    if (state) missed.push({ name: u.name, state, key });
    else list.push(u);
  });
  const messages = list.flatMap(u => u.tokens.map(to => ({ to, sound: 'default', title, body, priority: 'high', channelId: 'default', data: { ...data, screen: 'Camp', tab: 'inventory' } })));
  for (let i = 0; i < messages.length; i += 100) {
    try {
      await fetch(EXPO_PUSH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(messages.slice(i, i + 100)) });
    } catch (e) { console.error('재고 푸시 전송 오류:', e); }
  }
  return list.length;
}

function forLabel(r: FirebaseFirestore.DocumentData): string {
  if (r.forType === 'camp') return '캠프 공용';
  if (r.forType === 'student') return `${r.studentName ?? '학생'}${r.studentClass ? `(${r.studentClass})` : ''}`;
  return `${r.requesterName ?? ''} 쌤`;
}
function itemsLabel(r: FirebaseFirestore.DocumentData, lineIds?: string[]): string {
  const lines = (r.items ?? []) as Array<{ id: string; name: string; quantity: number; unit: string }>;
  const pick = lineIds ? lines.filter(l => lineIds.includes(l.id)) : lines;
  const head = pick.slice(0, 2).map(l => `${l.name} ${l.quantity}${l.unit}`).join(', ');
  return pick.length > 2 ? `${head} 외 ${pick.length - 2}개` : head;
}

export interface NotifyResult {
  /** 실제로 푸시를 받은 사람 수 */
  sent: number;
  /** 보내려 했지만 못 받은 사람 — 알림을 꺼 두었거나 등록된 기기가 없는 경우 */
  missed: MissedTarget[];
}

/** 알림을 보내고, 받은 사람 수와 **못 받은 사람 목록**을 돌려준다 */
export async function notifySupply(ev: SupplyNotifyEvent, actorUid: string): Promise<NotifyResult> {
  const list: MissedTarget[] = [];
  const sent = await missedStore.run(list, () => runNotifySupply(ev, actorUid));
  // 같은 사람이 여러 번 걸리면 한 번만
  const seen = new Set<string>();
  return { sent, missed: list.filter(m => !seen.has(m.name) && seen.add(m.name)) };
}

/** @returns 알림 받은 사람 수 */
async function runNotifySupply(ev: SupplyNotifyEvent, actorUid: string): Promise<number> {
  const db = getAdminFirestore();

  if (ev.type === 'default_buyer') {
    const s = await db.doc(`supplySettings/${ev.campCode}`).get();
    const uid = s.data()?.defaultBuyerId;
    if (!uid) return 0;
    const users = await campUsers(ev.campCode);
    return send('supplyBuyer', users.filter(u => u.id === uid), '🛒 기본 구매 담당이 되었어요', '담당이 따로 없는 구매 요청을 사 와서 품목별로 완료해주세요.', { type: 'supply' }, actorUid);
  }

  if (ev.type === 'stock_low') {
    const [st, it, gr] = await Promise.all([
      db.doc(`inventoryStocks/${ev.campCode}__${ev.itemId}`).get(),
      db.doc(`inventoryItems/${ev.itemId}`).get(),
      db.doc(`inventoryGroups/${ev.groupId}`).get(),
    ]);
    const n = Number(st.data()?.stocks?.[ev.groupId] ?? 0);
    const min = Number(st.data()?.minStocks?.[ev.groupId] ?? it.data()?.minStockDefault ?? 0);
    if (!(min > 0 && n < min)) return 0;
    const users = await campUsers(ev.campCode);
    const name = it.data()?.name ?? '품목';
    const stockManagers = users.filter(u => u.role === 'admin' || (!!u.exp?.groupRole && STOCK_MANAGER_GROUP_ROLES.includes(u.exp.groupRole)));
    return send('stockLow', stockManagers, `📉 ${name} 부족`, `${gr.data()?.name ?? ''} 그룹 ${n}${it.data()?.unit ?? ''} 남음 (최소 ${min}) — 재고 요청 탭에서 요청으로 올릴 수 있어요.`, { type: 'stock', itemId: ev.itemId }, actorUid);
  }

  if (ev.type === 'stock_taken') {
    const [it, from, to] = await Promise.all([
      db.doc(`inventoryItems/${ev.itemId}`).get(),
      db.doc(`inventoryGroups/${ev.fromGroupId}`).get(),
      db.doc(`inventoryGroups/${ev.toGroupId}`).get(),
    ]);
    const fromGroup = from.data();
    if (!fromGroup) return 0;
    const users = await campUsers(ev.campCode);
    // 가져간 그룹과 연결된 캠프 그룹의 부매니저
    const managers = users.filter(u => !!u.exp?.groupRole && STOCK_MANAGER_GROUP_ROLES.includes(u.exp.groupRole)
      && isStockGroupOf({ campGroupName: fromGroup.campGroupName, name: fromGroup.name }, u.exp.group));
    const name = it.data()?.name ?? '품목';
    return send('stockTransfer', managers, `🔁 ${name} ${ev.quantity}${it.data()?.unit ?? ''} 이동`,
      `${ev.byName} 선생님이 ${fromGroup.name}에서 ${to.data()?.name ?? '다른 그룹'}(으)로 가져갔어요.`,
      { type: 'stock', itemId: ev.itemId }, actorUid);
  }

  if (ev.type === 'buyer_assigned') {
    const snaps = await Promise.all(ev.requestIds.slice(0, 50).map(id => db.doc(`supplyRequests/${id}`).get()));
    const reqs: Array<FirebaseFirestore.DocumentData & { id: string }> = snaps.filter(s => s.exists).map(s => ({ ...(s.data() as FirebaseFirestore.DocumentData), id: s.id }));
    if (!reqs.length) return 0;
    const users = await campUsers(reqs[0].campCode);
    let total = 0;
    const byBuyer = new Map<string, typeof reqs>();
    reqs.forEach(r => { if (r.buyerId) { if (!byBuyer.has(r.buyerId)) byBuyer.set(r.buyerId, []); byBuyer.get(r.buyerId)!.push(r); } });
    for (const [uid, list] of byBuyer) {
      total += await send('supplyBuyer', users.filter(u => u.id === uid), '🛒 사 올 물건이 생겼어요',
        list.length === 1 ? `${forLabel(list[0])} · ${itemsLabel(list[0])}` : `요청 ${list.length}건 — 재고 요청 › 내 구매에서 확인하세요.`,
        { type: 'supply', requestId: list.length === 1 ? list[0].id : undefined, view: 'buy' }, actorUid);
    }
    return total;
  }

  // ── 요청 1건 기준 이벤트 ──
  const snap = await db.doc(`supplyRequests/${ev.requestId}`).get();
  if (!snap.exists) return 0;
  const r = snap.data() as FirebaseFirestore.DocumentData;
  const users = await campUsers(r.campCode);
  const byId = (uid?: string) => users.filter(u => u.id === uid);
  const admins = users.filter(u => u.role === 'admin');
  const settings = (await db.doc(`supplySettings/${r.campCode}`).get()).data();
  const buyerUid: string | undefined = r.buyerId || settings?.defaultBuyerId;
  const data = { type: 'supply', requestId: ev.requestId };

  switch (ev.type) {
    case 'request_created': {
      const targets = buyerUid ? byId(buyerUid) : admins;
      return send('supplyRequest', targets, `🛒 새 구매 요청 · ${forLabel(r)}`, `${itemsLabel(r)} — ${r.requesterName ?? ''}`, { ...data, view: 'buy' }, actorUid);
    }
    case 'status': {
      if (r.status !== 'rejected' && r.status !== 'onhold') return 0;
      const title = r.status === 'rejected' ? '구매 요청이 반려됐어요' : '⏸ 구매 요청이 보류됐어요';
      const note = r.statusNote ? ` · ${r.statusNote}` : '';
      return send('supplyProgress', byId(r.requesterId), title, `${forLabel(r)} · ${itemsLabel(r)}${note}`, data, actorUid);
    }
    case 'comment': {
      const last = (r.comments ?? []).slice(-1)[0];
      if (!last) return 0;
      return send('supplyComment', [...byId(r.requesterId), ...byId(buyerUid)], `💬 ${last.name}: ${forLabel(r)} 요청`, String(last.text).slice(0, 120), data, actorUid);
    }
    case 'settled': {
      const done = (r.done ?? {}) as Record<string, { byId?: string; amount?: number }>;
      const byBuyer = new Map<string, number>();
      ev.lineIds.forEach(id => { const d = done[id]; if (d?.byId && r.settlements?.[id]) byBuyer.set(d.byId, (byBuyer.get(d.byId) ?? 0) + (d.amount ?? 0)); });
      let total = 0;
      for (const [uid, amount] of byBuyer) total += await send('supplySettle', byId(uid), '💰 정산 완료', `${forLabel(r)} · ${won(amount)} 정산됐어요 (${r.forType === 'student' ? '용돈봉투' : '송금'})`, data, actorUid);
      return total;
    }
    case 'lines_done': {
      const lines = ((r.items ?? []) as Array<{ id: string; parentBill?: boolean }>).filter(l => ev.lineIds.includes(l.id));
      const done = (r.done ?? {}) as Record<string, { amount?: number; by?: string }>;
      const amount = ev.lineIds.reduce((a, id) => a + (done[id]?.amount ?? 0), 0);
      const buyerName = done[ev.lineIds[0]]?.by ?? '';
      let total = 0;
      // 요청자에게 — 구매 완료 소식
      total += await send('supplyProgress', byId(r.requesterId), '✅ 구매 완료', `${forLabel(r)} · ${itemsLabel(r, ev.lineIds)} — ${buyerName} 쌤이 사 왔어요`, data, actorUid);
      if (!(amount > 0)) return total;
      // 정산할 사람
      const parentLines = lines.filter(l => l.parentBill);
      if (parentLines.length || r.forType === 'camp') {
        total += await send('supplyIntake', admins, r.forType === 'camp' ? '📥 캠프 공용 물품 구매 완료' : '🧾 학부모 청구할 물품',
          `${forLabel(r)} · ${itemsLabel(r, ev.lineIds)} · ${won(amount)}${r.forType === 'camp' ? ' — 재고 입고해주세요' : ''}`, data, actorUid);
      }
      if (r.forType === 'student' && lines.some(l => !l.parentBill)) {
        // 담임: 요청 당시 담임 이름 → 없으면 반코드로 배정된 담임
        const mentorName = String(r.classMentor ?? '').trim();
        const mentors = users.filter(u => (mentorName && u.name === mentorName) || (!mentorName && r.studentClassCode && u.exp?.classCode === r.studentClassCode && (!u.exp?.groupRole || u.exp.groupRole === '담임')));
        total += await send('supplySettle', mentors, '📒 용돈봉투 정산 요청', `${forLabel(r)} · ${won(amount)} — 봉투에서 빼서 ${buyerName} 쌤께 전달해주세요`, { ...data, view: 'settle' }, actorUid);
      } else if (r.forType === 'mentor' && lines.some(l => !l.parentBill) && r.requesterId !== actorUid) {
        const payTo = Object.values(done).find(d => (d as { payTo?: string }).payTo) as { payTo?: string } | undefined;
        total += await send('supplySettle', byId(r.requesterId), '💸 송금 요청', `${buyerName} 쌤께 ${won(amount)}${payTo?.payTo ? ` · ${payTo.payTo}` : ''}`, { ...data, view: 'settle' }, actorUid);
      }
      return total;
    }
  }
  return 0;
}
