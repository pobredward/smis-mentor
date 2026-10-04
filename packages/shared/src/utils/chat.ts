/**
 * 채팅 — 방 구성 · 방 이름 · 목록 순서 · 말풍선 묶음 · 시간 표시 (web·mobile·서버 공용, 순수 함수)
 *
 * 누가 어느 방에 들어가는지는 campChatRoomPlan() 한 곳에서 정한다. 서버(/api/chat/sync)가 이 결과로 방 문서를 맞춘다.
 */
import {
  CAMP_CHAT_ROOM_TYPES,
  CHAT_REACTIONS,
  CHAT_REACTION_EMOJI,
  type CampChatRoomType,
  type ChatNotice,
  type ChatPoll,
  type ChatReactionKey,
  type ChatReplyRef,
  type ChatLastMessage,
  type ChatMediaItem,
  type ChatMemberInfo,
  type ChatMemberKind,
  type ChatMessage,
  type ChatRoom,
  type ChatRoomType,
  type ChatUserState,
} from '../types/chat';
import { compareCampCodes } from '../types/camp';
import { groupRank, normalizeGroupKey } from '../types/campTimetable';
import { campRolesOf, TEACHER_GROUP_NAME } from './campTeachers';
import { callLogText } from './chatCall';
import { t, type Locale, type MessageKey } from '../i18n';

export const CHAT_LIMITS = {
  /** 글 한 번에 */
  textMax: 5000,
  /** 사진·동영상 한 번에 (카톡 묶어 보내기) */
  mediaMax: 10,
  /** 일반 화질 사진 — 긴 변 */
  imageMaxPx: 2048,
  /** 작은 그림 — 긴 변 */
  thumbMaxPx: 480,
  jpegQuality: 0.82,
  thumbQuality: 0.7,
  /** 사진 한 장 (원본 포함) */
  imageMaxBytes: 30 * 1024 * 1024,
  /** 동영상 한 개 */
  videoMaxBytes: 500 * 1024 * 1024,
  /** 처음 불러오는 메시지 수 · 위로 올릴 때 더 불러오는 수 */
  pageSize: 50,
  /** 글 고치기 — 보낸 뒤 24시간 안 */
  editWindowMs: 24 * 60 * 60 * 1000,
  /** 음성 메시지 — 최대 5분 · 20MB */
  voiceMaxMs: 5 * 60 * 1000,
  audioMaxBytes: 20 * 1024 * 1024,
  /** 투표 */
  pollQuestionMax: 300,
  pollOptionMax: 100,
  pollOptionsMin: 2,
  pollOptionsMax: 10,
  /** 예약 메시지 — 30일 안, 1분 뒤부터 */
  scheduleMaxDays: 30,
  scheduleMinMs: 60 * 1000,
  /** 답장 · 공지에 붙는 원래 글 길이 */
  replyTextMax: 100,
  noticeTextMax: 500,
} as const;

/** 매니저로 보는 캠프 그룹 역할 — 부매니저 · Sub Manager 는 멘토·원어민 쪽 */
export const CHAT_MANAGER_GROUP_ROLES: readonly string[] = ['매니저', 'Manager'];
/** 부매니저 — 자리는 멘토·원어민 그대로, 매니저방에만 더 들어간다 */
export const CHAT_SUB_MANAGER_GROUP_ROLES: readonly string[] = ['부매니저', 'Sub Manager'];

/**
 * 캠프 방 순서 (목록 위에 고정) — 매니저 [전체·매니저방·멘토방·원어민방], 멘토 [전체·멘토방·멘토끼리],
 * 원어민 [전체·원어민방·원어민끼리], 부매니저는 여기에 매니저방이 더 보인다.
 */
export const CAMP_CHAT_ROOM_ORDER: readonly CampChatRoomType[] = ['camp_all', 'camp_manager', 'camp_mentor', 'camp_mentor_only', 'camp_foreign', 'camp_foreign_only'];

/** 방마다 들어가는 자리 — 매니저방은 여기에 부매니저(멘토·원어민)가 더 들어간다 (chatCampRoomWants) */
export const CAMP_CHAT_ROOM_MEMBERS: Record<CampChatRoomType, readonly ChatMemberKind[]> = {
  camp_all: ['manager', 'mentor', 'foreign'],
  camp_mentor: ['manager', 'mentor'],
  camp_mentor_only: ['mentor'],
  camp_foreign: ['manager', 'foreign'],
  camp_foreign_only: ['foreign'],
  camp_manager: ['manager'],
};

const ROOM_LABEL_KEY: Record<CampChatRoomType, MessageKey> = {
  camp_all: 'chat.roomAll',
  camp_mentor: 'chat.roomMentor',
  camp_mentor_only: 'chat.roomMentorOnly',
  camp_foreign: 'chat.roomForeign',
  camp_foreign_only: 'chat.roomForeignOnly',
  camp_manager: 'chat.roomManager',
};
const ROOM_DESC_KEY: Record<CampChatRoomType, MessageKey> = {
  camp_all: 'chat.roomAllDesc',
  camp_mentor: 'chat.roomMentorDesc',
  camp_mentor_only: 'chat.roomMentorOnlyDesc',
  camp_foreign: 'chat.roomForeignDesc',
  camp_foreign_only: 'chat.roomForeignOnlyDesc',
  camp_manager: 'chat.roomManagerDesc',
};

export const isCampChatRoomType = (v: unknown): v is CampChatRoomType =>
  typeof v === 'string' && (CAMP_CHAT_ROOM_TYPES as readonly string[]).includes(v);

export const campChatRoomId = (jobCodeId: string, type: CampChatRoomType): string => `${jobCodeId}_${type}`;
export const dmRoomId = (a: string, b: string): string => `dm_${[a, b].sort().join('_')}`;
export const campGroupRoomId = (jobCodeId: string, groupKey: string): string => `${jobCodeId}_group_${groupKey}`;
/** 미리 만들어진 방 (캠프 방 · 그룹방) — 늘 위에 고정, 고정 해제 · 숨기기 불가 */
export const isPresetRoom = (room: Pick<ChatRoom, 'type'>): boolean => room.type !== 'dm';

/** 그룹방을 만들지 않는 그룹 */
export const CHAT_GROUP_ROOM_EXCLUDED: readonly string[] = ['', 'manager', 'common', 'all'];
/** 그룹 표시 이름 — junior → Junior, short1 → 단기 1 */
export const chatGroupLabel = (groupKey?: string | null): string =>
  TEACHER_GROUP_NAME[String(groupKey ?? '')] ?? String(groupKey ?? '');
export const isDmRoomId = (roomId: string): boolean => roomId.startsWith('dm_');

// ── 사람 ────────────────────────────────────────────────────────────

export interface ChatUserLike {
  userId?: string;
  id?: string;
  name?: string;
  role?: string;
  status?: string;
  profileImage?: string;
  jobCodeIds?: string[];
  jobExperiences?: Array<{ id?: string; group?: string; groupRole?: string; classCode?: string } | null | undefined>;
}

const uidOf = (u: ChatUserLike) => String(u.userId ?? u.id ?? '');
const STAFF = ['admin', 'mentor', 'foreign'];
/** 채팅을 쓸 수 있는 계정 — 관리자·멘토·원어민, 탈퇴·비활성·임시 아님 */
export const isChatStaff = (u: ChatUserLike | null | undefined): boolean =>
  !!u && STAFF.includes(String(u.role)) && !['inactive', 'deleted', 'temp'].includes(String(u.status ?? 'active'));

const inCamp = (u: ChatUserLike, jobCodeId: string) =>
  (u.jobCodeIds ?? []).includes(jobCodeId) || (u.jobExperiences ?? []).some((e) => e?.id === jobCodeId);

/**
 * 이 캠프 채팅에서의 자리 — 캠프에 없거나 채팅을 못 쓰는 계정이면 null.
 * 관리자는 같은 기수 캠프(generationJobCodeIds) 하나에라도 배정돼 있으면 이 캠프의 매니저다.
 */
export function chatMemberKindOf(
  u: ChatUserLike | null | undefined,
  jobCodeId: string,
  generationJobCodeIds: readonly string[] = [],
): ChatMemberKind | null {
  if (!u || !isChatStaff(u)) return null;
  if (u.role === 'admin') return inCamp(u, jobCodeId) || generationJobCodeIds.some((id) => inCamp(u, id)) ? 'manager' : null;
  if (!inCamp(u, jobCodeId)) return null;
  const exp = (u.jobExperiences ?? []).find((e) => e?.id === jobCodeId);
  if (CHAT_MANAGER_GROUP_ROLES.includes(String(exp?.groupRole ?? '').trim())) return 'manager';
  return u.role === 'foreign' ? 'foreign' : 'mentor';
}

/** 이 캠프에서 부매니저인가 (그룹 역할 '부매니저' · 'Sub Manager') — 매니저방에 들어간다 */
export function isChatSubManager(u: ChatUserLike | null | undefined, jobCodeId: string): boolean {
  const exp = (u?.jobExperiences ?? []).find((e) => e?.id === jobCodeId);
  const role = String(exp?.groupRole ?? '').trim().toLowerCase();
  return !!role && CHAT_SUB_MANAGER_GROUP_ROLES.some((r) => r.toLowerCase() === role);
}

/** 이 캠프 방에 들어가는가 — 자리(kind)로, 매니저방은 부매니저도 */
export function chatCampRoomWants(type: CampChatRoomType, kind: ChatMemberKind | null, u: ChatUserLike | null | undefined, jobCodeId: string): boolean {
  if (!kind) return false;
  if (CAMP_CHAT_ROOM_MEMBERS[type].includes(kind)) return true;
  return type === 'camp_manager' && isChatSubManager(u, jobCodeId);
}

export function chatMemberInfoOf(u: ChatUserLike, kind: ChatMemberKind, jobCodeId?: string): ChatMemberInfo {
  const info: ChatMemberInfo = { name: String(u.name ?? '').trim() || '?', kind, role: String(u.role ?? '') };
  // 사진은 주소만 (data: URL 같은 큰 값은 방 문서를 키우므로 뺀다)
  const photo = String(u.profileImage ?? '');
  if (/^https?:\/\//.test(photo) && photo.length <= 1000) info.photo = photo;
  const label = jobCodeId ? campRolesOf(u as Record<string, unknown>)[jobCodeId] : '';
  if (label) info.label = label;
  return info;
}

export interface CampChatRoomPlan {
  id: string;
  type: CampChatRoomType;
  jobCodeId: string;
  campCode: string;
  generation: string | null;
  memberIds: string[];
  memberInfo: Record<string, ChatMemberInfo>;
}

/**
 * 캠프 방 6개의 사람 — 서버가 방 문서를 맞출 때 쓴다.
 * users: 이 캠프(관리자는 같은 기수 캠프)에 배정된 사람들. memberIds 는 정렬해 두어 바뀐 게 없으면 쓰지 않게 한다.
 * generationJobCodeIds: 같은 기수 캠프 id 전부 (관리자 자리 판단)
 */
export function campChatRoomPlan(
  users: ChatUserLike[],
  camp: { jobCodeId: string; campCode: string; generation?: string | null; generationJobCodeIds?: readonly string[] },
): CampChatRoomPlan[] {
  const gen = camp.generationJobCodeIds ?? [];
  const people = users
    .map((u) => ({ uid: uidOf(u), kind: chatMemberKindOf(u, camp.jobCodeId, gen), u }))
    .filter((p): p is { uid: string; kind: ChatMemberKind; u: ChatUserLike } => !!p.uid && !!p.kind);
  return CAMP_CHAT_ROOM_TYPES.map((type) => {
    const inRoom = people.filter((p) => chatCampRoomWants(type, p.kind, p.u, camp.jobCodeId));
    const memberIds = [...new Set(inRoom.map((p) => p.uid))].sort();
    const memberInfo: Record<string, ChatMemberInfo> = {};
    inRoom.forEach((p) => { memberInfo[p.uid] = chatMemberInfoOf(p.u, p.kind, camp.jobCodeId); });
    return {
      id: campChatRoomId(camp.jobCodeId, type), type, jobCodeId: camp.jobCodeId, campCode: camp.campCode,
      generation: camp.generation ?? null, memberIds, memberInfo,
    };
  });
}

/** 이 캠프에서의 그룹 키 (junior · summer …) — 없거나 그룹방이 없는 그룹이면 '' */
export function chatGroupKeyOf(u: ChatUserLike | null | undefined, jobCodeId: string): string {
  const exp = (u?.jobExperiences ?? []).find((e) => e?.id === jobCodeId);
  const k = normalizeGroupKey(String(exp?.group ?? ''));
  return CHAT_GROUP_ROOM_EXCLUDED.includes(k) ? '' : k;
}

export interface CampGroupRoomPlan {
  id: string;
  type: 'camp_group';
  groupKey: string;
  jobCodeId: string;
  campCode: string;
  generation: string | null;
  memberIds: string[];
  memberInfo: Record<string, ChatMemberInfo>;
}

/**
 * 그룹방 — 그룹마다 하나: 캠프 매니저(관리자 포함) + 그 그룹 멘토(부매니저 포함). 원어민은 넣지 않는다.
 * 멘토가 한 명이라도 있는 그룹만 (그룹 순서대로).
 */
export function campGroupRoomPlan(
  users: ChatUserLike[],
  camp: { jobCodeId: string; campCode: string; generation?: string | null; generationJobCodeIds?: readonly string[] },
): CampGroupRoomPlan[] {
  const gen = camp.generationJobCodeIds ?? [];
  const managers: Array<{ uid: string; u: ChatUserLike }> = [];
  const byGroup = new Map<string, Array<{ uid: string; u: ChatUserLike }>>();
  users.forEach((u) => {
    const uid = uidOf(u);
    const kind = uid ? chatMemberKindOf(u, camp.jobCodeId, gen) : null;
    if (kind === 'manager') managers.push({ uid, u });
    else if (kind === 'mentor') {
      const g = chatGroupKeyOf(u, camp.jobCodeId);
      if (!g) return;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push({ uid, u });
    }
  });
  return [...byGroup.keys()]
    .sort((a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b))
    .map((groupKey) => {
      const memberInfo: Record<string, ChatMemberInfo> = {};
      managers.forEach((p) => { memberInfo[p.uid] = chatMemberInfoOf(p.u, 'manager', camp.jobCodeId); });
      byGroup.get(groupKey)!.forEach((p) => { memberInfo[p.uid] = chatMemberInfoOf(p.u, 'mentor', camp.jobCodeId); });
      return {
        id: campGroupRoomId(camp.jobCodeId, groupKey), type: 'camp_group' as const, groupKey,
        jobCodeId: camp.jobCodeId, campCode: camp.campCode, generation: camp.generation ?? null,
        memberIds: Object.keys(memberInfo).sort(), memberInfo,
      };
    });
}

/** 방 문서가 계획과 다른가 (사람 · 이름 · 사진 · 역할) */
export function chatRoomNeedsSync(
  room: Pick<ChatRoom, 'memberIds' | 'memberInfo' | 'campCode' | 'generation'> | null | undefined,
  plan: Pick<CampChatRoomPlan, 'campCode' | 'generation' | 'memberIds' | 'memberInfo'>,
): boolean {
  if (!room) return true;
  if ((room.campCode ?? '') !== plan.campCode) return true;
  if ((room.generation ?? null) !== plan.generation) return true;
  const a = [...(room.memberIds ?? [])].sort();
  if (a.length !== plan.memberIds.length || a.some((v, i) => v !== plan.memberIds[i])) return true;
  return plan.memberIds.some((uid) => {
    const x = room.memberInfo?.[uid];
    const y = plan.memberInfo[uid];
    return !x || x.name !== y.name || (x.photo ?? '') !== (y.photo ?? '') || x.kind !== y.kind || (x.label ?? '') !== (y.label ?? '') || (x.role ?? '') !== (y.role ?? '');
  });
}

/** 1:1 대화를 시작할 수 있는가 — 둘 다 채팅 계정이고, 같은 캠프에 있었거나 한쪽이 관리자 */
export function canStartDm(me: ChatUserLike | null | undefined, other: ChatUserLike | null | undefined): boolean {
  if (!me || !other || !isChatStaff(me) || !isChatStaff(other)) return false;
  if (uidOf(me) === uidOf(other)) return false;
  if (me.role === 'admin' || other.role === 'admin') return true;
  const mine = new Set([...(me.jobCodeIds ?? []), ...(me.jobExperiences ?? []).map((e) => e?.id).filter(Boolean) as string[]]);
  return [...(other.jobCodeIds ?? []), ...(other.jobExperiences ?? []).map((e) => e?.id).filter(Boolean) as string[]].some((id) => mine.has(id));
}

/** 새 1:1 대화 상대 후보 (이름 순) */
export function dmCandidates<T extends ChatUserLike>(users: T[], me: ChatUserLike | null | undefined): T[] {
  return users
    .filter((u) => canStartDm(me, u))
    .sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ko'));
}

// ── 방 이름 · 목록 ───────────────────────────────────────────────────

/** 방 이름 — 캠프 방 "J29 전체방", 그룹방 "J29 Junior", DM 은 상대 이름 */
export function chatRoomTitle(room: Pick<ChatRoom, 'type' | 'campCode' | 'memberIds' | 'memberInfo' | 'groupKey'>, lang: Locale, myUid?: string): string {
  if (room.type === 'dm') {
    const other = (room.memberIds ?? []).find((id) => id !== myUid) ?? myUid ?? '';
    return room.memberInfo?.[other]?.name || t(lang, 'chat.unknownUser');
  }
  const label = chatRoomLabel(room.type, lang, room.groupKey);
  return room.campCode ? `${room.campCode} ${label}` : label;
}

/** 캠프 방 설명 — "매니저 + 멘토" */
export function chatRoomDescription(type: ChatRoomType, lang: Locale): string {
  if (type === 'dm') return '';
  if (type === 'camp_group') return t(lang, 'chat.roomGroupDesc');
  return t(lang, ROOM_DESC_KEY[type]);
}

/** 방 짧은 이름 (캠프 코드 없이) — "전체방", 그룹방 "Junior" */
export function chatRoomLabel(type: ChatRoomType, lang: Locale, groupKey?: string | null): string {
  if (type === 'dm') return t(lang, 'chat.dm');
  if (type === 'camp_group') return t(lang, 'chat.roomGroup', { group: chatGroupLabel(groupKey) });
  return t(lang, ROOM_LABEL_KEY[type]);
}

/** DM 상대 uid */
export const dmPeerOf = (room: Pick<ChatRoom, 'memberIds'>, myUid: string): string | undefined =>
  (room.memberIds ?? []).find((id) => id !== myUid);

const millis = (ts: { toMillis?: () => number } | null | undefined): number => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0);
const roomTime = (r: ChatRoom) => millis(r.lastMessageAt) || millis(r.createdAt);

/** '29기' → 29 (없으면 -1) */
export function generationNumber(g?: string | null): number {
  const m = /(\d+)/.exec(String(g ?? ''));
  return m ? Number(m[1]) : -1;
}

/** 방의 기수 — 방 문서에 없으면 캠프 코드 숫자로 ('J29' → '29기') */
export function chatRoomGeneration(room: Pick<ChatRoom, 'generation' | 'campCode'>): string {
  if (room.generation) return String(room.generation);
  const n = generationNumber(room.campCode);
  return n >= 0 ? `${n}기` : '';
}

export interface ChatCampGroup {
  jobCodeId: string;
  campCode: string;
  generation: string;
  /** 전체방 → 매니저방 → 멘토방 → 멘토끼리 → 원어민방 → 원어민끼리 → 그룹방(Junior …) 순 (보이는 것만) */
  rooms: ChatRoom[];
}

export interface ChatRoomGroups {
  /** 지금 기수 '29기' — 지금 캠프의 기수, 없으면 가장 최근 기수 */
  generation: string;
  /** 지금 기수의 캠프들 (J → E → S → F …) — 2개 이상이면 [All][J29][E29]… 버튼으로 골라 본다 */
  camps: ChatCampGroup[];
  /** 내가 위에 고정한 방 (DM · 지난 기수 방) — 고정한 순서 */
  pinned: ChatRoom[];
  /** 1:1 대화 — 최근 순 (메시지가 없는 방 · 숨긴 방 · 고정한 방은 빼고) */
  dms: ChatRoom[];
  /** 숨긴 방 수 (새 메시지가 오면 다시 나온다) */
  hiddenCount: number;
  /** 지난 기수 — 최근 기수 먼저 (접어 둔다) */
  otherGenerations: Array<{ generation: string; camps: ChatCampGroup[] }>;
}

/** 숨긴 방인가 — 숨긴 뒤 새 메시지가 오면 다시 보인다 */
export function isRoomHidden(state: ChatUserState | null | undefined, room: ChatRoom): boolean {
  const at = Number(state?.hidden?.[room.id] ?? 0);
  return at > 0 && roomTime(room) <= at;
}

/**
 * 목록 나누기 — 지금 기수의 캠프 방(위, 늘 고정) · 내가 고정한 방 · 1:1 대화 · 지난 기수.
 * @param activeJobCodeId 지금 보고 있는 캠프 — 이 캠프의 기수가 '지금 기수'
 * @param keepEmptyDmId 메시지가 아직 없어도 보여 줄 DM (방금 만든 대화) — 숨겼어도 보인다
 * @param state 고정 · 숨김 (지금 기수 캠프 방에는 적용하지 않는다)
 */
export function chatRoomGroups(
  rooms: ChatRoom[],
  opts: { activeJobCodeId?: string | null; keepEmptyDmId?: string | null; state?: ChatUserState | null } = {},
): ChatRoomGroups {
  const byCamp = new Map<string, ChatRoom[]>();
  rooms.filter((r) => r.type !== 'dm' && r.jobCodeId).forEach((r) => {
    const k = String(r.jobCodeId);
    if (!byCamp.has(k)) byCamp.set(k, []);
    byCamp.get(k)!.push(r);
  });
  const order = (r: ChatRoom) => {
    const i = CAMP_CHAT_ROOM_ORDER.indexOf(r.type as CampChatRoomType);
    return i >= 0 ? i : 10 + groupRank(r.groupKey ?? '');
  };
  const camps: ChatCampGroup[] = [...byCamp.entries()].map(([jobCodeId, list]) => ({
    jobCodeId,
    campCode: String(list[0].campCode ?? ''),
    generation: chatRoomGeneration(list[0]),
    rooms: [...list].sort((a, b) => order(a) - order(b)),
  }));
  const active = camps.find((c) => c.jobCodeId === opts.activeJobCodeId);
  const generation = active?.generation
    ?? [...camps].sort((a, b) => generationNumber(b.generation) - generationNumber(a.generation))[0]?.generation
    ?? '';
  const byCode = (a: ChatCampGroup, b: ChatCampGroup) => compareCampCodes(a.campCode, b.campCode);
  const others = new Map<string, ChatCampGroup[]>();
  camps.filter((c) => c.generation !== generation).forEach((c) => {
    if (!others.has(c.generation)) others.set(c.generation, []);
    others.get(c.generation)!.push(c);
  });
  const st = opts.state;
  const keep = (r: ChatRoom) => r.id === opts.keepEmptyDmId;
  const visible = (r: ChatRoom) => keep(r) || !isRoomHidden(st, r);
  const pinnedAt = (r: ChatRoom) => Number(st?.pinned?.[r.id] ?? 0);
  const currentIds = new Set(camps.filter((c) => c.generation === generation).flatMap((c) => c.rooms.map((r) => r.id)));
  let hiddenCount = 0;
  const pinned: ChatRoom[] = [];
  rooms.forEach((r) => {
    if (currentIds.has(r.id) || !pinnedAt(r)) return;
    if (r.type === 'dm' && !r.lastMessage && !keep(r)) return;
    if (!visible(r)) { hiddenCount += 1; return; }
    pinned.push(r);
  });
  pinned.sort((a, b) => pinnedAt(a) - pinnedAt(b));
  const pinnedIds = new Set(pinned.map((r) => r.id));
  const dms = rooms
    .filter((r) => r.type === 'dm' && (!!r.lastMessage || keep(r)) && !pinnedIds.has(r.id) && !pinnedAt(r))
    .filter((r) => (visible(r) ? true : (hiddenCount += 1, false)))
    .sort((a, b) => roomTime(b) - roomTime(a));
  const otherGenerations = [...others.entries()]
    .map(([g, list]) => ({
      generation: g,
      camps: list
        .map((c) => ({ ...c, rooms: c.rooms.filter((r) => !pinnedIds.has(r.id) && !pinnedAt(r) && (visible(r) ? true : (hiddenCount += 1, false))) }))
        .filter((c) => c.rooms.length)
        .sort(byCode),
    }))
    .filter((x) => x.camps.length)
    .sort((a, b) => generationNumber(b.generation) - generationNumber(a.generation));
  return {
    generation,
    camps: camps.filter((c) => c.generation === generation).sort(byCode),
    pinned,
    dms,
    hiddenCount,
    otherGenerations,
  };
}

/** [All] 또는 캠프 하나만 — filter: 'all' 또는 jobCodeId (없는 캠프면 전체) */
export function filterCampGroups(camps: ChatCampGroup[], filter: string | null | undefined): ChatCampGroup[] {
  if (!filter || filter === 'all') return camps;
  const one = camps.filter((c) => c.jobCodeId === filter);
  return one.length ? one : camps;
}

// ── 목록 위 버튼 [All][1:1][J29][E29]… · 캠프 묶음 접기 ─────────────────

/** 목록 버튼 — 'all' · 캠프 jobCodeId · 'dm'(1:1 대화만) */
export const CHAT_FILTER_ALL = 'all';
export const CHAT_FILTER_DM = 'dm';

export interface ChatListChip {
  key: string;
  label: string;
  unread: number;
}

/** 1:1 대화 전부 (내가 위에 고정한 것 포함, 숨긴 것 제외) */
const dmRoomsOf = (g: Pick<ChatRoomGroups, 'pinned' | 'dms'>): ChatRoom[] => [...g.pinned.filter((r) => r.type === 'dm'), ...g.dms];

/**
 * 지금 보일 목록 버튼 — [All] [1:1] [J29] [E29] … ([1:1] 은 캠프가 많아도 밀지 않고 보이게 두 번째).
 * 캠프 버튼은 지금 기수 캠프가 2개 이상일 때, [1:1] 은 1:1 대화가 있을 때. 하나뿐이면 [].
 */
function chatListChipKeys(g: Pick<ChatRoomGroups, 'camps' | 'pinned' | 'dms'>): string[] {
  if (!g.camps.length) return [];
  const keys = [CHAT_FILTER_ALL];
  if (dmRoomsOf(g).length) keys.push(CHAT_FILTER_DM);
  if (g.camps.length >= 2) keys.push(...g.camps.map((c) => c.jobCodeId));
  return keys.length >= 2 ? keys : [];
}

/**
 * 목록 위 버튼 — [All] [1:1] [J29] [E29] …. 버튼이 하나뿐이면 빈 배열 (줄을 그리지 않는다).
 * All 의 안 읽은 수는 지금 기수 캠프 방만 (1:1 은 [1:1] 버튼에).
 */
export function chatListChips(g: ChatRoomGroups, state: ChatUserState | null | undefined, lang: Locale): ChatListChip[] {
  return chatListChipKeys(g).map((key) => {
    if (key === CHAT_FILTER_ALL) return { key, label: t(lang, 'chat.filterAll'), unread: totalUnread(state, g.camps.flatMap((c) => c.rooms)) };
    if (key === CHAT_FILTER_DM) return { key, label: t(lang, 'chat.filterDm'), unread: totalUnread(state, dmRoomsOf(g)) };
    const c = g.camps.find((x) => x.jobCodeId === key)!;
    return { key, label: c.campCode || c.jobCodeId, unread: totalUnread(state, c.rooms) };
  });
}

export interface ChatListView {
  /** 실제로 고른 버튼 — 없어진 캠프 · 1:1 이 없으면 'all' */
  filter: string;
  /** 보이는 지금 기수 캠프 묶음 */
  camps: ChatCampGroup[];
  pinned: ChatRoom[];
  dms: ChatRoom[];
  otherGenerations: ChatRoomGroups['otherGenerations'];
  /** 캠프 묶음을 접을 수 있나 — [All] 에서만 (캠프 버튼을 고르면 늘 펼쳐 보인다) */
  foldable: boolean;
}

/** 고른 버튼대로 목록 나누기 — [1:1] 이면 1:1 대화만 (고정한 1:1 은 '고정한 대화'로 위에) */
export function chatListView(g: ChatRoomGroups, filter: string | null | undefined): ChatListView {
  const keys = chatListChipKeys(g);
  const f = filter && keys.includes(filter) ? filter : CHAT_FILTER_ALL;
  if (f === CHAT_FILTER_DM) {
    return { filter: f, camps: [], pinned: g.pinned.filter((r) => r.type === 'dm'), dms: g.dms, otherGenerations: [], foldable: false };
  }
  return {
    filter: f,
    camps: f === CHAT_FILTER_ALL ? g.camps : g.camps.filter((c) => c.jobCodeId === f),
    pinned: g.pinned,
    dms: g.dms,
    otherGenerations: g.otherGenerations,
    foldable: f === CHAT_FILTER_ALL,
  };
}

/** 접힌 캠프 머리글 — 안 읽은 수 합 · 가장 최근 메시지 시각 */
export function chatCampSummary(camp: Pick<ChatCampGroup, 'rooms'>, state: ChatUserState | null | undefined): { unread: number; lastAt: Date | null } {
  let last = 0;
  camp.rooms.forEach((r) => { last = Math.max(last, millis(r.lastMessageAt)); });
  return { unread: totalUnread(state, camp.rooms), lastAt: last ? new Date(last) : null };
}

/** 접은 캠프 목록 (기기에 저장한 값) 읽기 — 이상한 값은 버린다 */
export function parseFoldedCamps(raw: string | null | undefined): string[] {
  try {
    const v = JSON.parse(String(raw ?? '[]'));
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64).slice(0, 100) : [];
  } catch {
    return [];
  }
}

/** 안 읽은 수 (방) — 차단·삭제와 상관없이 서버가 센 값 */
export const unreadOf = (state: ChatUserState | null | undefined, roomId: string): number =>
  Math.max(0, Number(state?.unread?.[roomId] ?? 0) || 0);

/** 안 읽은 수 합 (탭 배지 · 캠프 버튼) — 지금 들어가 있는 방만 센다 (나간 캠프의 방은 빼고) */
export function totalUnread(state: ChatUserState | null | undefined, rooms: Array<Pick<ChatRoom, 'id'>>): number {
  return rooms.reduce((s, r) => s + unreadOf(state, r.id), 0);
}

export const isRoomMuted = (state: ChatUserState | null | undefined, roomId: string): boolean => !!state?.muted?.[roomId];
export const isUserBlocked = (state: ChatUserState | null | undefined, uid: string): boolean => !!state?.blocked?.[uid];

/** 배지 숫자 표시 — 300 넘으면 "300+" */
export const unreadBadgeText = (n: number): string => (n > 300 ? '300+' : String(n));

// ── 미리보기 글 ──────────────────────────────────────────────────────

export function mediaCounts(media: ChatMediaItem[] | null | undefined): { images: number; videos: number } {
  const list = media ?? [];
  return { images: list.filter((m) => m.kind === 'image').length, videos: list.filter((m) => m.kind === 'video').length };
}

/** 메시지 → 방 목록 · 알림에 보일 한 줄 */
export function chatPreviewText(
  m: Pick<ChatMessage, 'kind' | 'text' | 'media' | 'deleted'> | ChatLastMessage | null | undefined,
  lang: Locale,
  /** 통화 기록을 누구 쪽에서 볼지 (내가 건 통화면 '응답 없음' 등) · 1:1 방인지 */
  opts: { myUid?: string; direct?: boolean } = {},
): string {
  if (!m) return t(lang, 'chat.noMessagesYet');
  if (m.deleted) return t(lang, 'chat.deletedMessage');
  const text = String(m.text ?? '').replace(/\s+/g, ' ').trim();
  if (m.kind === 'voice') return t(lang, 'chat.previewVoice');
  if (m.kind === 'poll') return t(lang, 'chat.previewPoll', { q: text });
  const sys = m as Partial<ChatLastMessage>;
  if (m.kind === 'system' && sys.systemType === 'call' && sys.call) {
    return callLogText(sys.call, { direct: !!opts.direct, mine: !!opts.myUid && sys.senderId === opts.myUid, startedByName: sys.senderName, lang });
  }
  if (m.kind === 'system') return text ? t(lang, 'chat.previewNotice', { text }) : t(lang, 'chat.noticeSet');
  const counts = 'media' in m ? mediaCounts(m.media) : { images: Number((m as ChatLastMessage).imageCount ?? 0), videos: Number((m as ChatLastMessage).videoCount ?? 0) };
  let media = '';
  if (counts.images && counts.videos) media = t(lang, 'chat.previewMedia', { images: counts.images, videos: counts.videos });
  else if (counts.images) media = t(lang, 'chat.previewPhotos', { n: counts.images });
  else if (counts.videos) media = counts.videos === 1 ? t(lang, 'chat.previewVideo') : t(lang, 'chat.previewVideos', { n: counts.videos });
  if (text && media) return `${media} · ${text}`;
  return text || media || t(lang, 'chat.noMessagesYet');
}

/** 방 문서에 둘 마지막 메시지 */
export function chatLastMessageOf(m: Pick<ChatMessage, 'id' | 'kind' | 'text' | 'media' | 'senderId' | 'senderName' | 'deleted' | 'poll'>): ChatLastMessage {
  const c = m.kind === 'voice' ? { images: 0, videos: 0 } : mediaCounts(m.media);
  const last: ChatLastMessage = {
    messageId: m.id,
    kind: m.kind,
    text: String(m.kind === 'poll' ? m.poll?.question ?? '' : m.text ?? '').slice(0, 200),
    senderId: m.senderId,
    senderName: m.senderName,
  };
  if (c.images) last.imageCount = c.images;
  if (c.videos) last.videoCount = c.videos;
  if (m.deleted) last.deleted = true;
  return last;
}

// ── 사진 묶음 (카톡 묶어 보내기) ────────────────────────────────────

/**
 * 묶음 칸 나누기 — 한 줄에 몇 장씩.
 * 1 [1] · 2 [2] · 3 [3] · 4 [2,2] · 5 [3,2] · 6 [3,3] · 7 [3,2,2] · 8 [3,3,2] · 9 [3,3,3] · 10 [3,3,2,2]
 */
export function bundleRows(n: number): number[] {
  const count = Math.max(0, Math.min(Math.floor(n), CHAT_LIMITS.mediaMax));
  if (count <= 3) return count ? [count] : [];
  const rows: number[] = [];
  let r = count;
  while (r > 0) {
    if (r === 4) { rows.push(2, 2); break; }
    if (r === 2) { rows.push(2); break; }
    if (r === 1) { rows.push(1); break; }
    rows.push(3);
    r -= 3;
  }
  return rows;
}

/** 긴 변이 max 를 넘지 않게 줄인 크기 (늘리지는 않는다) */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { w: Math.max(0, Math.round(w || 0)), h: Math.max(0, Math.round(h || 0)) };
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/** Storage 경로 — chat/{roomId}/{uid}/{messageId}/{i}.jpg · {i}_t.jpg */
export function chatMediaPath(roomId: string, uid: string, messageId: string, index: number, ext: string, thumb = false): string {
  const e = String(ext || 'jpg').replace(/^\./, '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  return `chat/${roomId}/${uid}/${messageId}/${index}${thumb ? '_t' : ''}.${e}`;
}

/** 내려받을 파일 이름 — SMIS_J29_20261004_1530_01.jpg */
export function chatDownloadName(opts: { campCode?: string | null; at?: Date | null; index?: number; ext?: string }): string {
  const d = opts.at ?? new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  const idx = opts.index != null ? `_${p(opts.index + 1)}` : '';
  const ext = String(opts.ext || 'jpg').replace(/^\./, '');
  return ['SMIS', opts.campCode || '', stamp].filter(Boolean).join('_') + idx + '.' + ext;
}

/** 파일 확장자 (contentType 우선) */
export function chatFileExt(contentType?: string | null, name?: string | null): string {
  const ct = String(contentType ?? '').toLowerCase();
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/3gpp': '3gp', 'video/x-m4v': 'm4v',
    'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  };
  if (map[ct]) return map[ct];
  const m = /\.([a-z0-9]{2,5})$/i.exec(String(name ?? ''));
  return m ? m[1].toLowerCase() : ct.startsWith('video/') ? 'mp4' : ct.startsWith('audio/') ? 'm4a' : 'jpg';
}

// ── 안 읽은 사람 수 ('1') ────────────────────────────────────────────

/**
 * 이 메시지를 아직 안 읽은 사람 수 (보낸 사람 빼고).
 * @param reads uid → 그 방을 마지막으로 본 시각(ms)
 * 보내는 중(createdAt 없음)이면 null
 */
export function unreadReaders(
  m: Pick<ChatMessage, 'senderId' | 'createdAt' | 'kind'>,
  memberIds: string[],
  reads: Record<string, number>,
): number | null {
  const at = millis(m.createdAt);
  if (!at || m.kind === 'system') return null;
  return memberIds.filter((uid) => uid !== m.senderId && !((reads[uid] ?? 0) >= at)).length;
}

// ── 시간 · 날짜 · 말풍선 묶기 ────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, '0');
const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];
const WEEK_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 말풍선 옆 시각 — "오후 3:05" / "3:05 PM" */
export function chatTimeLabel(d: Date, lang: Locale): string {
  const h = d.getHours();
  const h12 = h % 12 || 12;
  const mm = pad2(d.getMinutes());
  return lang === 'en' ? `${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}` : `${h < 12 ? '오전' : '오후'} ${h12}:${mm}`;
}

/** 날짜 구분선 — "2026년 10월 4일 일요일" / "Sunday, October 4, 2026" */
export function chatDayLabel(d: Date, lang: Locale): string {
  return lang === 'en'
    ? `${WEEK_EN[d.getDay()]}, ${MONTH_EN[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
    : `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK_KO[d.getDay()]}요일`;
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** 방 목록의 시각 — 오늘: "오후 3:05", 어제: "어제", 올해: "10월 3일", 그 전: "2025. 10. 3." */
export function chatListTimeLabel(d: Date | null | undefined, lang: Locale, now: Date = new Date()): string {
  if (!d) return '';
  if (dayKey(d) === dayKey(now)) return chatTimeLabel(d, lang);
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(d) === dayKey(y)) return t(lang, 'chat.yesterday');
  if (d.getFullYear() === now.getFullYear()) {
    return lang === 'en' ? `${MONTH_EN[d.getMonth()].slice(0, 3)} ${d.getDate()}` : `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  return lang === 'en' ? `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}` : `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
}

export interface ChatRowLayout {
  /** 이 메시지 위에 날짜 구분선 */
  showDay: boolean;
  /** 이름·사진 보이기 (남이 보낸 묶음의 첫 메시지) */
  showSender: boolean;
  /** 시각 보이기 (같은 사람 · 같은 분 묶음의 마지막 메시지) */
  showTime: boolean;
  /** 내가 보낸 메시지 */
  mine: boolean;
}

/**
 * 말풍선 묶기 — 카톡처럼 같은 사람이 같은 분에 보낸 메시지는 이름을 한 번, 시각을 마지막에 한 번.
 * @param messages 오래된 것 → 최신 순
 */
export function chatMessageLayout(
  messages: Array<Pick<ChatMessage, 'senderId' | 'createdAt' | 'kind'>>,
  myUid: string,
): ChatRowLayout[] {
  const dateOf = (m: Pick<ChatMessage, 'createdAt'>) => new Date(millis(m.createdAt) || Date.now());
  const minuteKey = (d: Date) => `${dayKey(d)} ${d.getHours()}:${d.getMinutes()}`;
  return messages.map((m, i) => {
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const d = dateOf(m);
    const showDay = !prev || dayKey(dateOf(prev)) !== dayKey(d);
    const sameRun = (a?: Pick<ChatMessage, 'senderId' | 'createdAt' | 'kind'>) =>
      !!a && a.kind !== 'system' && m.kind !== 'system' && a.senderId === m.senderId && minuteKey(dateOf(a)) === minuteKey(d);
    const mine = m.senderId === myUid;
    return {
      showDay,
      showSender: !mine && m.kind !== 'system' && (showDay || !sameRun(prev)),
      showTime: m.kind !== 'system' && !(sameRun(next) && dayKey(dateOf(next!)) === dayKey(d)),
      mine,
    };
  });
}

/** 글 정리 — 앞뒤 공백 · 너무 긴 글 자르기 */
export function cleanChatText(text: string): string {
  return String(text ?? '').replace(/\r\n/g, '\n').replace(/^\s+|\s+$/g, '').slice(0, CHAT_LIMITS.textMax);
}

/** 보낸 기기 쪽 id (보내는 중 말풍선과 서버 메시지 짝 맞추기) */
export function newChatClientId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ── 대화 내용 검색 (카톡 '대화 내용 검색') ───────────────────────────
// Firestore 에는 글 검색이 없으므로 방의 메시지를 한 번 다 불러와(loadAllChatMessages) 기기에서 찾는다.

/** 검색어 정리 — 앞뒤 공백 · 연속 공백 하나로 · 소문자 */
export const normalizeChatSearch = (q: string | null | undefined): string =>
  String(q ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

/** 이 메시지 글에 검색어가 있는가 (삭제된 메시지 · 사진만 있는 메시지는 아님) */
export function chatMessageMatches(m: Pick<ChatMessage, 'text' | 'deleted' | 'kind'>, query: string): boolean {
  const q = normalizeChatSearch(query);
  if (!q || m.deleted || m.kind === 'system') return false;
  return String(m.text ?? '').replace(/\s+/g, ' ').toLocaleLowerCase().includes(q);
}

/**
 * 검색 결과 — 메시지 id, **최신 것부터** (카톡처럼 처음엔 가장 최근 결과, ↑ 누르면 더 예전으로)
 * @param messages 오래된 것 → 최신 순 (순서가 섞여 있어도 시각으로 정렬한다)
 * @param blocked 차단한 사람 (그 사람 메시지는 찾지 않는다)
 */
export function searchChatMessages(
  messages: Array<Pick<ChatMessage, 'id' | 'text' | 'deleted' | 'kind' | 'senderId' | 'createdAt'>>,
  query: string,
  blocked?: Record<string, boolean> | null,
): string[] {
  const q = normalizeChatSearch(query);
  if (!q) return [];
  const seen = new Set<string>();
  return messages
    .filter((m) => !blocked?.[m.senderId] && chatMessageMatches(m, q) && !seen.has(m.id) && !!seen.add(m.id))
    .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
    .map((m) => m.id);
}

/** 글을 검색어 자리로 나누기 — 강조 표시용 (대소문자 무시, 원래 글자 그대로) */
export function splitByQuery(text: string | null | undefined, query: string | null | undefined): Array<{ text: string; hit: boolean }> {
  const src = String(text ?? '');
  const q = normalizeChatSearch(query);
  if (!q || !src) return src ? [{ text: src, hit: false }] : [];
  // 공백은 아무 공백 묶음과 맞게
  const esc = q.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  const re = new RegExp(esc, 'gi');
  const out: Array<{ text: string; hit: boolean }> = [];
  let last = 0;
  for (const m of src.matchAll(re)) {
    const i = m.index ?? 0;
    if (!m[0]) break;
    if (i > last) out.push({ text: src.slice(last, i), hit: false });
    out.push({ text: m[0], hit: true });
    last = i + m[0].length;
  }
  if (last < src.length) out.push({ text: src.slice(last), hit: false });
  return out;
}


// ── 답장 ─────────────────────────────────────────────────────────────

/** 답장할 때 붙일 원래 메시지 요약 */
export function chatReplyRefOf(m: Pick<ChatMessage, 'id' | 'senderId' | 'senderName' | 'kind' | 'text' | 'media' | 'poll'>): ChatReplyRef {
  const ref: ChatReplyRef = {
    id: m.id,
    senderId: m.senderId,
    senderName: m.senderName,
    kind: m.kind,
    text: String(m.kind === 'poll' ? m.poll?.question ?? '' : m.text ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_LIMITS.replyTextMax),
  };
  const first = (m.media ?? []).find((x) => x.kind === 'image' || x.kind === 'video');
  if (first) ref.thumbUrl = first.thumbUrl || first.url;
  return ref;
}

/** 답장 위에 보일 원래 글 한 줄 */
export function chatReplyPreview(r: ChatReplyRef, lang: Locale): string {
  if (r.deleted) return t(lang, 'chat.deletedMessage');
  if (r.text) return r.kind === 'poll' ? t(lang, 'chat.previewPoll', { q: r.text }) : r.text;
  if (r.kind === 'voice') return t(lang, 'chat.previewVoice');
  return r.thumbUrl ? t(lang, 'chat.previewPhotoShort') : t(lang, 'chat.deletedMessage');
}

// ── @멘션 ─────────────────────────────────────────────────────────────

/** @모두 — 한국어·영어 둘 다 */
export const CHAT_MENTION_ALL_TOKENS: readonly string[] = ['모두', 'all', 'everyone'];

/** @모두를 쓸 수 있는가 — 캠프 방·그룹방의 매니저 */
export const canMentionAll = (room: Pick<ChatRoom, 'type' | 'memberInfo'>, uid: string): boolean =>
  room.type !== 'dm' && room.memberInfo?.[uid]?.kind === 'manager';

/** @ 뒤에 칠 때 고를 사람 — 이름에 검색어가 들어간 사람 (나 빼고, 이름 순) */
export function mentionCandidates(room: Pick<ChatRoom, 'memberInfo'>, myUid: string, query: string): Array<{ uid: string; name: string; label?: string; kind: ChatMemberKind }> {
  const q = String(query ?? '').trim().toLocaleLowerCase();
  return Object.entries(room.memberInfo ?? {})
    .filter(([uid, m]) => uid !== myUid && (!q || m.name.toLocaleLowerCase().includes(q)))
    .map(([uid, m]) => ({ uid, name: m.name, label: m.label, kind: m.kind }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

/**
 * 글에서 @이름 찾기 — 보낼 때 mentions · mentionAll 을 채운다 (@모두는 매니저만).
 * 이름이 긴 것부터 맞춘다 ("김민" 과 "김민지" 가 있으면 "@김민지" 는 김민지).
 */
export function extractMentions(
  text: string,
  room: Pick<ChatRoom, 'type' | 'memberInfo'>,
  myUid: string,
): { mentions: string[]; mentionAll: boolean } {
  const found = new Set<string>();
  let all = false;
  for (const part of mentionParts(text, room)) {
    if (part.mention === 'all') all = true;
    else if (part.mention) found.add(part.mention);
  }
  return { mentions: [...found].filter((u) => u !== myUid).sort(), mentionAll: all && canMentionAll(room, myUid) };
}

/**
 * 글을 멘션 자리로 나누기 — 강조 표시용. mention: 사람 uid 또는 'all'
 * '@' 앞은 글 처음이거나 공백이어야 한다 (이메일 주소 제외).
 */
export function mentionParts(
  text: string | null | undefined,
  room: Pick<ChatRoom, 'memberInfo'>,
): Array<{ text: string; mention?: string }> {
  const src = String(text ?? '');
  if (!src.includes('@')) return src ? [{ text: src }] : [];
  const names = Object.entries(room.memberInfo ?? {})
    .map(([uid, m]) => ({ uid, name: m.name }))
    .filter((x) => x.name && x.name !== '?')
    .sort((a, b) => b.name.length - a.name.length);
  const out: Array<{ text: string; mention?: string }> = [];
  let buf = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '@' && (i === 0 || /\s/.test(src[i - 1]))) {
      const rest = src.slice(i + 1);
      const allTok = CHAT_MENTION_ALL_TOKENS.find((tk) => rest.toLocaleLowerCase().startsWith(tk) && !/[\p{L}\p{N}]/u.test(rest.charAt(tk.length)));
      const hit = allTok ? null : names.find((x) => rest.startsWith(x.name));
      if (allTok || hit) {
        if (buf) out.push({ text: buf });
        buf = '';
        const len = 1 + (allTok ? allTok.length : hit!.name.length);
        out.push({ text: src.slice(i, i + len), mention: allTok ? 'all' : hit!.uid });
        i += len;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  if (buf) out.push({ text: buf });
  return out;
}

/** 이 메시지가 나를 불렀나 */
export const isMentioned = (m: Pick<ChatMessage, 'mentions' | 'mentionAll' | 'senderId'>, uid: string): boolean =>
  m.senderId !== uid && (!!m.mentionAll || (m.mentions ?? []).includes(uid));

// ── 공감 ─────────────────────────────────────────────────────────────

export interface ChatReactionCount { key: ChatReactionKey; emoji: string; count: number; uids: string[] }

/** 공감 모아 보기 — 정해진 순서, 0개는 빼고 */
export function reactionSummary(reactions: Record<string, ChatReactionKey> | null | undefined): ChatReactionCount[] {
  const by = new Map<ChatReactionKey, string[]>();
  Object.entries(reactions ?? {}).forEach(([uid, k]) => {
    if (!(CHAT_REACTIONS as readonly string[]).includes(k)) return;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(uid);
  });
  return CHAT_REACTIONS.filter((k) => by.has(k)).map((k) => ({ key: k, emoji: CHAT_REACTION_EMOJI[k], count: by.get(k)!.length, uids: by.get(k)! }));
}

// ── 고치기 ───────────────────────────────────────────────────────────

/** 이 메시지를 고칠 수 있나 — 내 글 메시지, 보낸 뒤 24시간 안, 삭제 안 됨 */
export function canEditChatMessage(m: Pick<ChatMessage, 'senderId' | 'kind' | 'deleted' | 'createdAt'>, uid: string, now: number = Date.now()): boolean {
  const at = millis(m.createdAt);
  return m.senderId === uid && m.kind === 'text' && !m.deleted && at > 0 && now - at < CHAT_LIMITS.editWindowMs;
}

// ── 투표 ─────────────────────────────────────────────────────────────

/** 투표 만들기 — 빈 항목·같은 항목은 빼고, 2개 이상이어야 한다 (아니면 null) */
export function makeChatPoll(
  question: string,
  options: string[],
  opts: { multi?: boolean; anonymous?: boolean; closesAt?: ChatPoll['closesAt'] } = {},
): ChatPoll | null {
  const q = String(question ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_LIMITS.pollQuestionMax);
  const seen = new Set<string>();
  const list = options
    .map((o) => String(o ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_LIMITS.pollOptionMax))
    .filter((o) => o && !seen.has(o.toLocaleLowerCase()) && !!seen.add(o.toLocaleLowerCase()))
    .slice(0, CHAT_LIMITS.pollOptionsMax);
  if (!q || list.length < CHAT_LIMITS.pollOptionsMin) return null;
  const poll: ChatPoll = { question: q, options: list.map((text, i) => ({ id: `o${i + 1}`, text })), multi: !!opts.multi, anonymous: !!opts.anonymous };
  if (opts.closesAt) poll.closesAt = opts.closesAt;
  return poll;
}

/** 마감됐나 — 만든 사람이 닫았거나 마감 시각이 지났다 */
export const isPollClosed = (m: Pick<ChatMessage, 'poll' | 'pollClosed'>, now: number = Date.now()): boolean =>
  !!m.pollClosed || (!!m.poll?.closesAt && now >= millis(m.poll.closesAt));

export interface ChatPollResult {
  /** 투표한 사람 수 */
  voters: number;
  options: Array<{ id: string; text: string; count: number; uids: string[]; ratio: number }>;
  /** 내가 고른 것 */
  mine: string[];
  /** 가장 많이 받은 항목 id (같으면 여럿) */
  top: string[];
}

export function pollResults(m: Pick<ChatMessage, 'poll' | 'pollVotes'>, myUid: string): ChatPollResult {
  const opts = m.poll?.options ?? [];
  const valid = new Set(opts.map((o) => o.id));
  const votes = Object.entries(m.pollVotes ?? {})
    .map(([uid, ids]) => [uid, (ids ?? []).filter((id) => valid.has(id))] as const)
    .filter(([, ids]) => ids.length);
  const options = opts.map((o) => {
    const uids = votes.filter(([, ids]) => ids.includes(o.id)).map(([uid]) => uid);
    return { id: o.id, text: o.text, count: uids.length, uids, ratio: votes.length ? uids.length / votes.length : 0 };
  });
  const max = Math.max(0, ...options.map((o) => o.count));
  return {
    voters: votes.length,
    options,
    mine: votes.find(([uid]) => uid === myUid)?.[1].slice() ?? [],
    top: max > 0 ? options.filter((o) => o.count === max).map((o) => o.id) : [],
  };
}

// ── 공지 ─────────────────────────────────────────────────────────────

const SUB_MANAGER_LABEL = /(^|\s)(부매니저|Sub Manager)(\s|$)/;

/** 공지를 올리고 내릴 수 있나 — 캠프 방: 매니저 · 매니저방: 매니저 + 부매니저 · 그룹방: 매니저 + 그 그룹 부매니저 · 1:1: 둘 다 */
export function canSetNotice(room: Pick<ChatRoom, 'type' | 'memberIds' | 'memberInfo'>, uid: string): boolean {
  if (!(room.memberIds ?? []).includes(uid)) return false;
  if (room.type === 'dm') return true;
  const info = room.memberInfo?.[uid];
  if (info?.kind === 'manager') return true;
  return (room.type === 'camp_group' || room.type === 'camp_manager') && SUB_MANAGER_LABEL.test(String(info?.label ?? ''));
}

/** 공지로 올릴 수 있는 메시지 — 글 · 사진/동영상 · 투표 (삭제 · 음성 · 알림 제외) */
export const canBeNotice = (m: Pick<ChatMessage, 'kind' | 'deleted'>): boolean =>
  !m.deleted && (m.kind === 'text' || m.kind === 'media' || m.kind === 'poll');

/** 공지 확인 현황 — 방 사람 중 공지 올린 사람·글쓴이 빼고 확인 / 미확인 */
export function noticeAckSummary(
  room: Pick<ChatRoom, 'memberIds' | 'memberInfo' | 'notice'>,
  acks: Record<string, unknown> | null | undefined,
): { acked: string[]; pending: string[] } {
  const skip = new Set([room.notice?.setBy, room.notice?.senderId].filter(Boolean) as string[]);
  const names = (uid: string) => room.memberInfo?.[uid]?.name ?? '';
  const people = (room.memberIds ?? []).filter((uid) => !skip.has(uid)).sort((a, b) => names(a).localeCompare(names(b), 'ko'));
  return { acked: people.filter((uid) => !!acks?.[uid]), pending: people.filter((uid) => !acks?.[uid]) };
}

/** 공지 문서 (서버가 쓴다) */
export function chatNoticeOf(
  m: Pick<ChatMessage, 'id' | 'kind' | 'text' | 'media' | 'senderId' | 'senderName' | 'poll'>,
  by: { uid: string; name: string },
): Omit<ChatNotice, 'setAt'> {
  const n: Omit<ChatNotice, 'setAt'> = {
    messageId: m.id,
    kind: m.kind,
    text: String(m.kind === 'poll' ? m.poll?.question ?? '' : m.text ?? '').slice(0, CHAT_LIMITS.noticeTextMax),
    senderId: m.senderId,
    senderName: m.senderName,
    setBy: by.uid,
    setByName: by.name,
  };
  const first = (m.media ?? []).find((x) => x.kind === 'image' || x.kind === 'video');
  if (first) n.thumbUrl = first.thumbUrl || first.url;
  return n;
}

// ── 읽지 않은 곳부터 ─────────────────────────────────────────────────

/**
 * '여기까지 읽었습니다' 줄 — 방에 들어올 때의 내 마지막 읽은 시각 뒤로 남이 보낸 첫 메시지 자리.
 * 없으면 -1 (다 읽음 · 처음 들어온 방은 맨 아래로)
 */
export function firstUnreadIndex(
  messages: Array<Pick<ChatMessage, 'senderId' | 'createdAt' | 'kind'>>,
  myReadMs: number | null | undefined,
  myUid: string,
): number {
  if (!myReadMs) return -1;
  return messages.findIndex((m) => m.senderId !== myUid && m.kind !== 'system' && millis(m.createdAt) > myReadMs);
}

// ── 예약 메시지 ───────────────────────────────────────────────────────

/** 예약할 수 있는 시각인가 — 1분 뒤 ~ 30일 안 */
export function scheduleTimeError(at: Date | null | undefined, now: Date = new Date()): 'past' | 'tooFar' | null {
  if (!at || Number.isNaN(at.getTime())) return 'past';
  const d = at.getTime() - now.getTime();
  if (d < CHAT_LIMITS.scheduleMinMs) return 'past';
  if (d > CHAT_LIMITS.scheduleMaxDays * 86400000) return 'tooFar';
  return null;
}

// ── 음성 · 시간 길이 ─────────────────────────────────────────────────

/** 1:05 · 12:30 */
export function formatChatDuration(ms: number | null | undefined): string {
  const sec = Math.max(0, Math.round(Number(ms ?? 0) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// ── 대화 내보내기 (기록 보관) ─────────────────────────────────────────

/**
 * 대화를 글 파일로 — 카톡 '대화 내보내기'처럼 날짜 줄 + [이름] [시각] 내용.
 * includeMediaLinks: 사진·동영상·음성 주소를 함께 적는다 (주소가 있으면 누구나 열 수 있으니 기본은 끔)
 */
export function chatExportText(
  room: Pick<ChatRoom, 'type' | 'campCode' | 'memberIds' | 'memberInfo' | 'groupKey'>,
  messages: Array<Pick<ChatMessage, 'kind' | 'text' | 'media' | 'deleted' | 'senderId' | 'senderName' | 'createdAt' | 'editedAt' | 'replyTo' | 'poll' | 'pollVotes' | 'pollClosed' | 'systemType'>>,
  opts: { lang: Locale; myUid: string; includeMediaLinks?: boolean; exportedAt?: Date },
): string {
  const { lang } = opts;
  const at = opts.exportedAt ?? new Date();
  const lines: string[] = [
    t(lang, 'chat.exportTitle', { room: chatRoomTitle(room, lang, opts.myUid) }),
    t(lang, 'chat.exportSavedAt', { at: `${chatDayLabel(at, lang)} ${chatTimeLabel(at, lang)}` }),
    t(lang, 'chat.exportMembers', { n: (room.memberIds ?? []).length }),
    '',
  ];
  let day = '';
  messages.forEach((m) => {
    const ms = millis(m.createdAt);
    if (!ms) return;
    const d = new Date(ms);
    const dk = dayKey(d);
    if (dk !== day) {
      day = dk;
      lines.push(`--------------- ${chatDayLabel(d, lang)} ---------------`);
    }
    const head = `[${m.senderName || '?'}] [${chatTimeLabel(d, lang)}]`;
    if (m.kind === 'system') { lines.push(`${head} ${chatPreviewText(m, lang)}`); return; }
    if (m.deleted) { lines.push(`${head} ${t(lang, 'chat.deletedMessage')}`); return; }
    const reply = m.replyTo ? `(${t(lang, 'chat.exportReplyTo', { name: m.replyTo.senderName, text: chatReplyPreview(m.replyTo, lang).slice(0, 30) })}) ` : '';
    let body = '';
    if (m.kind === 'poll' && m.poll) {
      const r = pollResults(m, opts.myUid);
      body = `${t(lang, 'chat.previewPoll', { q: m.poll.question })} — ${r.options.map((o) => `${o.text} ${o.count}`).join(', ')}${isPollClosed(m) ? ` (${t(lang, 'chat.pollClosed')})` : ''}`;
    } else if (m.kind === 'media' || m.kind === 'voice') {
      body = chatPreviewText(m, lang);
    } else {
      body = String(m.text ?? '');
    }
    if (m.editedAt) body += ` (${t(lang, 'chat.edited')})`;
    lines.push(`${head} ${reply}${body}`);
    if (opts.includeMediaLinks) (m.media ?? []).forEach((x) => lines.push(`    ${x.url}`));
  });
  return lines.join('\n') + '\n';
}

/** 내보낼 파일 이름 — SMIS_채팅_J29_전체방_20261004.txt */
export function chatExportFileName(room: Pick<ChatRoom, 'type' | 'campCode' | 'memberIds' | 'memberInfo' | 'groupKey'>, lang: Locale, myUid: string, at: Date = new Date()): string {
  const title = chatRoomTitle(room, lang, myUid).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_');
  const p = (n: number) => String(n).padStart(2, '0');
  return `SMIS_${lang === 'en' ? 'chat' : '채팅'}_${title}_${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}.txt`;
}
