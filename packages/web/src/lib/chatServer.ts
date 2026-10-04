/**
 * 채팅 방 만들기 · 사람 맞추기 (Next.js API 라우트 전용, Admin SDK)
 *
 * - syncCampChatRooms: 캠프 방 6개(매니저방 포함)를 캠프 배정(users.jobCodeIds)대로 맞춘다 (없으면 만든다).
 *   관리자는 같은 기수 캠프 하나에라도 배정돼 있으면 그 기수 모든 캠프의 매니저 — 그래서 기수 단위로 사람을 읽는다.
 * - 그룹방: 캠프 그룹마다 매니저 + 그 그룹 멘토(부매니저 포함), 원어민 없음 (campGroupRoomPlan)
 * - syncGenerationChatRooms: 같은 기수 캠프 전부 (채팅 탭을 열 때 · 선생님 명단 저장 뒤)
 *   평소에는 Functions(chatOnUserWritten · chatOnJobCodeWritten)가 배정·캠프 생성 때 바로 맞춘다 — 여기는 안전망.
 *   누가 어느 방인지는 shared 의 campChatRoomPlan() 한 곳에서 정한다 (functions/src/chatMembership.ts 가 같은 규칙).
 * - ensureDmRoom: 1:1 대화방 (같은 캠프였거나 한쪽이 관리자일 때만)
 *
 * 메시지 읽기·쓰기 권한은 방 문서의 memberIds 로 규칙(firestore.rules)이 판단한다 —
 * 나중에 배정된 사람도 방에 들어가는 순간 지난 대화를 모두 보고, 캠프에서 빠지면 바로 못 본다.
 */
import {
  campChatRoomPlan,
  campGroupRoomPlan,
  type CampChatRoomPlan,
  type CampGroupRoomPlan,
  canStartDm,
  chatMemberInfoOf,
  chatRoomNeedsSync,
  dmRoomId,
  type ChatMemberInfo,
  type ChatMemberKind,
  type ChatRoom,
  type ChatUserLike,
} from '@smis-mentor/shared';
import { adminFieldValue, getAdminFirestore } from './firebase-admin';

export class ChatServerError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** 같은 서버 인스턴스에서 1분 안에 다시 부르면 건너뛴다 (채팅 탭을 열 때마다 부르므로) */
const lastSync = new Map<string, number>();
const SYNC_TTL_MS = 60_000;

export interface ChatSyncResult {
  jobCodeId: string;
  campCode: string;
  skipped: boolean;
  /** 새로 만들거나 사람을 바꾼 방 수 */
  changed: number;
}

interface CampInfo { jobCodeId: string; campCode: string; generation: string | null }

/** 같은 기수 캠프들 (기수가 없으면 그 캠프 하나) */
async function generationCamps(jobCodeId: string): Promise<{ camp: CampInfo; siblings: CampInfo[] }> {
  const db = getAdminFirestore();
  const jc = await db.collection('jobCodes').doc(jobCodeId).get();
  if (!jc.exists) throw new ChatServerError(404, '캠프를 찾을 수 없습니다.');
  const camp: CampInfo = { jobCodeId, campCode: String(jc.data()?.code ?? ''), generation: (jc.data()?.generation as string) || null };
  if (!camp.generation) return { camp, siblings: [camp] };
  const snap = await db.collection('jobCodes').where('generation', '==', camp.generation).get();
  const siblings = snap.docs.map((d) => ({ jobCodeId: d.id, campCode: String(d.data().code ?? ''), generation: camp.generation }));
  if (!siblings.some((c) => c.jobCodeId === jobCodeId)) siblings.push(camp);
  return { camp, siblings };
}

/** 같은 기수 캠프 중 하나에라도 배정된 사람 */
async function usersOfCamps(jobCodeIds: string[]): Promise<ChatUserLike[]> {
  const db = getAdminFirestore();
  const out = new Map<string, ChatUserLike>();
  for (let i = 0; i < jobCodeIds.length; i += 30) {
    const snap = await db.collection('users').where('jobCodeIds', 'array-contains-any', jobCodeIds.slice(i, i + 30)).get();
    snap.docs.forEach((d) => out.set(d.id, { ...(d.data() as ChatUserLike), userId: d.id }));
  }
  return [...out.values()];
}

async function writeCampRooms(camp: CampInfo, generationIds: string[], users: ChatUserLike[]): Promise<number> {
  const db = getAdminFirestore();
  const opts = { ...camp, generationJobCodeIds: generationIds };
  // 캠프 방 6개 + 그룹방 (그룹마다 매니저 + 그 그룹 멘토)
  const groupPlan = campGroupRoomPlan(users, opts);
  const plan: Array<(CampChatRoomPlan | CampGroupRoomPlan)> = [...campChatRoomPlan(users, opts), ...groupPlan];
  // 멘토가 모두 빠진 그룹의 방 — 매니저만 남긴다 (방과 대화는 그대로)
  const planned = new Set(plan.map((p) => p.id));
  const oldGroups = await db.collection('chatRooms').where('jobCodeId', '==', camp.jobCodeId).where('type', '==', 'camp_group').get();
  const managersOnly = campChatRoomPlan(users, opts).find((p) => p.type === 'camp_foreign')!; // 매니저 + 원어민 → 매니저만 골라 쓴다
  oldGroups.docs.filter((d) => !planned.has(d.id)).forEach((d) => {
    const memberInfo = Object.fromEntries(Object.entries(managersOnly.memberInfo).filter(([, v]) => v.kind === 'manager'));
    const groupKey = String(d.data().groupKey ?? '');
    plan.push({
      id: d.id, type: 'camp_group', groupKey, jobCodeId: camp.jobCodeId, campCode: camp.campCode, generation: camp.generation,
      memberIds: Object.keys(memberInfo).sort(), memberInfo,
    });
  });
  const refs = plan.map((p) => db.collection('chatRooms').doc(p.id));
  const existing = await db.getAll(...refs);
  const batch = db.batch();
  let changed = 0;
  plan.forEach((p, i) => {
    const cur = existing[i];
    const now = adminFieldValue.serverTimestamp();
    const extra = p.type === 'camp_group' ? { groupKey: (p as CampGroupRoomPlan).groupKey } : {};
    if (!cur.exists) {
      batch.set(refs[i], {
        type: p.type, jobCodeId: camp.jobCodeId, campCode: camp.campCode, generation: camp.generation, ...extra,
        memberIds: p.memberIds, memberInfo: p.memberInfo,
        lastMessage: null, lastMessageAt: null, messageCount: 0, createdAt: now, updatedAt: now, syncedAt: now,
      });
      changed += 1;
    } else if (chatRoomNeedsSync(cur.data() as Pick<ChatRoom, 'memberIds' | 'memberInfo' | 'campCode' | 'generation'>, p)) {
      batch.update(refs[i], {
        memberIds: p.memberIds, memberInfo: p.memberInfo, campCode: camp.campCode, generation: camp.generation, ...extra, updatedAt: now, syncedAt: now,
      });
      changed += 1;
    }
  });
  if (changed) await batch.commit();
  return changed;
}

/** 캠프 하나 (사람은 같은 기수 기준으로 읽는다) */
export async function syncCampChatRooms(jobCodeId: string, opts: { force?: boolean } = {}): Promise<ChatSyncResult> {
  const { camp, siblings } = await generationCamps(jobCodeId);
  if (!opts.force && Date.now() - (lastSync.get(jobCodeId) ?? 0) < SYNC_TTL_MS) {
    return { jobCodeId, campCode: camp.campCode, skipped: true, changed: 0 };
  }
  const ids = siblings.map((c) => c.jobCodeId);
  const changed = await writeCampRooms(camp, ids, await usersOfCamps(ids));
  lastSync.set(jobCodeId, Date.now());
  return { jobCodeId, campCode: camp.campCode, skipped: false, changed };
}

/** 같은 기수 캠프 전부 — 방이 없으면 만들고 사람을 맞춘다 */
export async function syncGenerationChatRooms(jobCodeId: string, opts: { force?: boolean } = {}): Promise<ChatSyncResult[]> {
  const { siblings } = await generationCamps(jobCodeId);
  const todo = siblings.filter((c) => opts.force || Date.now() - (lastSync.get(c.jobCodeId) ?? 0) >= SYNC_TTL_MS);
  if (!todo.length) return siblings.map((c) => ({ jobCodeId: c.jobCodeId, campCode: c.campCode, skipped: true, changed: 0 }));
  const ids = siblings.map((c) => c.jobCodeId);
  const users = await usersOfCamps(ids);
  const out: ChatSyncResult[] = [];
  for (const c of siblings) {
    if (!todo.includes(c)) { out.push({ jobCodeId: c.jobCodeId, campCode: c.campCode, skipped: true, changed: 0 }); continue; }
    const changed = await writeCampRooms(c, ids, users);
    lastSync.set(c.jobCodeId, Date.now());
    out.push({ jobCodeId: c.jobCodeId, campCode: c.campCode, skipped: false, changed });
  }
  return out;
}

const dmKindOf = (u: ChatUserLike): ChatMemberKind => (u.role === 'admin' ? 'manager' : u.role === 'foreign' ? 'foreign' : 'mentor');

/** 1:1 대화방 — 없으면 만들고, 이름·사진이 바뀌었으면 고친다. 방 id 를 돌려준다 */
export async function ensureDmRoom(me: ChatUserLike & { userId: string }, otherUid: string): Promise<string> {
  if (!otherUid || otherUid === me.userId) throw new ChatServerError(400, '대화 상대를 고르세요.');
  const db = getAdminFirestore();
  const otherSnap = await db.collection('users').doc(otherUid).get();
  if (!otherSnap.exists) throw new ChatServerError(404, '사용자를 찾을 수 없습니다.');
  const other: ChatUserLike & { userId: string } = { ...(otherSnap.data() as ChatUserLike), userId: otherUid };
  if (!canStartDm(me, other)) throw new ChatServerError(403, '같은 캠프 선생님과만 대화할 수 있습니다.');
  const id = dmRoomId(me.userId, otherUid);
  const ref = db.collection('chatRooms').doc(id);
  const memberIds = [me.userId, otherUid].sort();
  const memberInfo: Record<string, ChatMemberInfo> = {
    [me.userId]: chatMemberInfoOf(me, dmKindOf(me)),
    [otherUid]: chatMemberInfoOf(other, dmKindOf(other)),
  };
  await db.runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    const now = adminFieldValue.serverTimestamp();
    if (!cur.exists) {
      tx.set(ref, {
        type: 'dm', jobCodeId: null, campCode: null, memberIds, memberInfo,
        lastMessage: null, lastMessageAt: null, messageCount: 0, createdAt: now, updatedAt: now, syncedAt: now,
      });
      return;
    }
    // 이름·사진만 비교 (캠프·기수는 없음)
    const plan = { id, type: 'camp_all' as const, jobCodeId: '', campCode: '', generation: null, memberIds, memberInfo };
    if (chatRoomNeedsSync({ ...(cur.data() as Pick<ChatRoom, 'memberIds' | 'memberInfo'>), campCode: '', generation: null }, plan)) {
      tx.update(ref, { memberInfo, syncedAt: now });
    }
  });
  return id;
}
