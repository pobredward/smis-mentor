/**
 * 채팅 방 사람 맞추기 — 배정이 바뀌는 순간 (Firestore 트리거, 서울 리전)
 *
 *  - chatOnJobCodeWritten: 캠프 코드를 만들면 그 캠프 방 5개를 바로 만든다 (아무도 채팅을 열지 않아도 방이 있다).
 *    캠프 코드·기수가 바뀌면 방 이름·사람을 다시 맞춘다.
 *  - chatOnUserWritten: 사람의 캠프 배정·역할·상태·이름·사진이 바뀌면 그 사람을 방에 넣고 뺀다.
 *    새로 배정된 캠프(관리자는 그 기수 캠프 전부)의 방이 없으면 먼저 만든다.
 *    방 문서 전체를 다시 쓰지 않고 그 사람 칸만 고친다 (명단을 한꺼번에 저장할 때 트리거가 동시에 돌아도 서로 덮지 않게).
 *    나중에 배정된 사람도 방에 들어가는 순간 지난 대화를 모두 본다 (읽기 권한 = 방 memberIds).
 *
 * 사람 규칙은 chatMembership.ts (shared utils/chat.ts 와 같은 규칙).
 * web /api/chat/sync (채팅 탭 열 때) · 선생님 명단 저장 뒤 동기화는 그대로 두는 안전망.
 */
import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import {
  CAMP_ROOM_TYPES,
  campRoomId,
  campRoomPlan,
  campsOfUser,
  dmKindOf,
  memberInfoOf,
  memberKindOf,
  ROOM_MEMBERS,
  roomNeedsSync,
  sameInfo,
  type MemberInfo,
  type RoomLike,
  type UserLike,
} from './chatMembership';

const REGION = 'asia-northeast3';
const fdb = () => admin.firestore();
const FV = () => admin.firestore.FieldValue;

interface Camp { id: string; code: string; generation: string | null }

// 캠프 목록은 잠깐(60초) 기억 — 명단을 한꺼번에 저장하면 트리거가 수십 번 돈다
let campCache: { at: number; list: Camp[] } | null = null;
async function allCamps(fresh = false): Promise<Camp[]> {
  if (!fresh && campCache && Date.now() - campCache.at < 60_000) return campCache.list;
  const snap = await fdb().collection('jobCodes').get();
  const list = snap.docs.map((d) => ({ id: d.id, code: String(d.data().code ?? ''), generation: (d.data().generation as string) || null }));
  campCache = { at: Date.now(), list };
  return list;
}
const siblingsOf = (camps: Camp[], id: string): Camp[] => {
  const me = camps.find((c) => c.id === id);
  if (!me) return [];
  return me.generation ? camps.filter((c) => c.generation === me.generation) : [me];
};

async function usersOfCamps(ids: string[]): Promise<UserLike[]> {
  const out = new Map<string, UserLike>();
  for (let i = 0; i < ids.length; i += 30) {
    const snap = await fdb().collection('users').where('jobCodeIds', 'array-contains-any', ids.slice(i, i + 30)).get();
    snap.docs.forEach((d) => out.set(d.id, { ...(d.data() as UserLike), userId: d.id }));
  }
  return [...out.values()];
}

/**
 * 캠프 방 전체 맞추기 — 없는 방은 만들고(createMissing), 있는 방은 계획과 다르면 고친다(rewrite).
 * 방 만들기는 create 라서 다른 트리거가 먼저 만들었으면 건너뛴다.
 */
async function syncCampRooms(camp: Camp, camps: Camp[], opts: { createMissing: boolean; rewrite: boolean }): Promise<void> {
  const siblings = siblingsOf(camps, camp.id);
  const ids = (siblings.length ? siblings : [camp]).map((c) => c.id);
  const refs = CAMP_ROOM_TYPES.map((t) => fdb().collection('chatRooms').doc(campRoomId(camp.id, t)));
  const existing = await fdb().getAll(...refs);
  const missing = existing.filter((s) => !s.exists).length;
  if (!(opts.createMissing && missing) && !opts.rewrite) return;
  const plan = campRoomPlan(await usersOfCamps(ids), { jobCodeId: camp.id, campCode: camp.code, generation: camp.generation, generationIds: ids });
  await Promise.all(plan.map(async (p, i) => {
    const snap = existing[i];
    const now = FV().serverTimestamp();
    if (!snap.exists) {
      if (!opts.createMissing) return;
      await refs[i].create({
        type: p.type, jobCodeId: camp.id, campCode: camp.code, generation: camp.generation,
        memberIds: p.memberIds, memberInfo: p.memberInfo,
        lastMessage: null, lastMessageAt: null, messageCount: 0, createdAt: now, updatedAt: now, syncedAt: now,
      }).catch((e: { code?: number }) => { if (e?.code !== 6) throw e; }); // 6 = ALREADY_EXISTS
      return;
    }
    if (opts.rewrite && roomNeedsSync(snap.data() as RoomLike, p)) {
      await refs[i].update({ memberIds: p.memberIds, memberInfo: p.memberInfo, campCode: camp.code, generation: camp.generation, updatedAt: now, syncedAt: now });
    }
  }));
}

/** 이 사람 한 명만 — 들어가야 할 방엔 넣고(이름·사진도 고침), 아닌 방에선 뺀다. 빠진 방의 안 읽은 수도 지운다 */
async function applyUserToCamp(uid: string, user: UserLike | null, camp: Camp, camps: Camp[]): Promise<void> {
  const ids = siblingsOf(camps, camp.id).map((c) => c.id);
  const kind = user ? memberKindOf(user, camp.id, ids) : null;
  const info = user && kind ? memberInfoOf(user, kind, camp.id) : null;
  const refs = CAMP_ROOM_TYPES.map((t) => fdb().collection('chatRooms').doc(campRoomId(camp.id, t)));
  const snaps = await fdb().getAll(...refs);
  const removed: string[] = [];
  await Promise.all(CAMP_ROOM_TYPES.map(async (type, i) => {
    const snap = snaps[i];
    if (!snap.exists) return;
    const room = snap.data() as RoomLike;
    const has = (room.memberIds ?? []).includes(uid);
    const want = !!kind && ROOM_MEMBERS[type].includes(kind);
    const now = FV().serverTimestamp();
    const infoPath = new admin.firestore.FieldPath('memberInfo', uid);
    if (want && info) {
      if (!has || !sameInfo(room.memberInfo?.[uid], info)) {
        await refs[i].update(infoPath, info, 'memberIds', FV().arrayUnion(uid), 'updatedAt', now);
      }
    } else if (has || room.memberInfo?.[uid]) {
      await refs[i].update(infoPath, FV().delete(), 'memberIds', FV().arrayRemove(uid), 'updatedAt', now);
      removed.push(refs[i].id);
    }
  }));
  if (removed.length) {
    const st = fdb().collection('chatUserState').doc(uid);
    await st.update(...removed.flatMap((rid) => [new admin.firestore.FieldPath('unread', rid), FV().delete()]) as [admin.firestore.FieldPath, unknown])
      .catch(() => undefined); // 상태 문서가 없으면 지울 것도 없다
  }
}

/** DM 의 이름·사진·자리 */
async function applyUserToDms(uid: string, user: UserLike): Promise<void> {
  const snap = await fdb().collection('chatRooms').where('memberIds', 'array-contains', uid).get();
  const info = memberInfoOf(user, dmKindOf(user));
  await Promise.all(snap.docs.filter((d) => d.data().type === 'dm').map(async (d) => {
    const cur = (d.data().memberInfo ?? {})[uid] as MemberInfo | undefined;
    if (!sameInfo(cur, info)) await d.ref.update(new admin.firestore.FieldPath('memberInfo', uid), info);
  }));
}

/** 채팅에 영향을 주는 칸만 비교 (로그인 시각·푸시 토큰 등은 무시) */
function chatKey(u: UserLike | undefined): string {
  if (!u) return '';
  return JSON.stringify({
    role: u.role ?? '', status: u.status ?? '', name: u.name ?? '', photo: u.profileImage ?? '',
    camps: [...campsOfUser(u)].sort(),
    exps: (u.jobExperiences ?? []).map((e) => [e?.id ?? '', e?.group ?? '', e?.groupRole ?? '', e?.classCode ?? '']),
  });
}

export const chatOnUserWritten = onDocumentWritten(
  { document: 'users/{userId}', region: REGION, memory: '256MiB', timeoutSeconds: 120 },
  async (event) => {
    const before = event.data?.before?.data() as UserLike | undefined;
    const after = event.data?.after?.data() as UserLike | undefined;
    if (chatKey(before) === chatKey(after)) return;
    const uid = String(event.params.userId);
    // 이벤트 순서가 뒤바뀌어도 지금 상태로 맞추도록 문서를 다시 읽는다
    const fresh = await fdb().collection('users').doc(uid).get();
    const user: UserLike | null = fresh.exists ? { ...(fresh.data() as UserLike), userId: uid } : null;

    const b = campsOfUser(before);
    const a = campsOfUser(after);
    const added = [...a].filter((id) => !b.has(id));
    const admin_ = before?.role === 'admin' || after?.role === 'admin' || user?.role === 'admin';
    const camps = await allCamps(added.some((id) => !campCache?.list.some((c) => c.id === id)));

    // 영향받는 캠프 — 관리자는 같은 기수 캠프 전부
    const affected = new Set<string>([...b, ...a]);
    if (admin_) [...affected].forEach((id) => siblingsOf(camps, id).forEach((c) => affected.add(c.id)));
    // 새로 배정된 캠프의 방이 없으면 먼저 만든다 (관리자는 그 기수 캠프 전부)
    const create = new Set<string>(added);
    if (admin_) added.forEach((id) => siblingsOf(camps, id).forEach((c) => create.add(c.id)));

    for (const id of affected) {
      const camp = camps.find((c) => c.id === id);
      if (!camp) continue;
      if (create.has(id)) await syncCampRooms(camp, camps, { createMissing: true, rewrite: false });
      await applyUserToCamp(uid, user, camp, camps);
    }
    const changed = (k: keyof UserLike) => (before?.[k] ?? '') !== (after?.[k] ?? '');
    if (user && (changed('name') || changed('profileImage') || changed('role'))) await applyUserToDms(uid, user);
  },
);

export const chatOnJobCodeWritten = onDocumentWritten(
  { document: 'jobCodes/{jobCodeId}', region: REGION, memory: '256MiB', timeoutSeconds: 120 },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!after) return; // 캠프를 지워도 대화는 남긴다
    const id = String(event.params.jobCodeId);
    const created = !before;
    const renamed = !!before && (before.code !== after.code || (before.generation ?? null) !== (after.generation ?? null));
    if (!created && !renamed) return;
    const camps = await allCamps(true);
    const camp = camps.find((c) => c.id === id) ?? { id, code: String(after.code ?? ''), generation: (after.generation as string) || null };
    // 새 캠프 → 방 5개. 같은 기수 관리자도 매니저로 들어간다
    await syncCampRooms(camp, camps, { createMissing: created, rewrite: renamed });
    // 기수가 바뀌면 같은 기수 다른 캠프들의 관리자 자리도 달라진다 (있는 방만 다시 맞춤)
    if (before && (before.generation ?? null) !== (after.generation ?? null)) {
      const gens = new Set([before?.generation, after.generation].filter(Boolean));
      for (const c of camps.filter((x) => x.id !== id && x.generation && gens.has(x.generation))) {
        await syncCampRooms(c, camps, { createMissing: false, rewrite: true });
      }
    }
  },
);
