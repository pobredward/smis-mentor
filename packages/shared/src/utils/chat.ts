/**
 * 채팅 — 방 구성 · 방 이름 · 목록 순서 · 말풍선 묶음 · 시간 표시 (web·mobile·서버 공용, 순수 함수)
 *
 * 누가 어느 방에 들어가는지는 campChatRoomPlan() 한 곳에서 정한다. 서버(/api/chat/sync)가 이 결과로 방 문서를 맞춘다.
 */
import {
  CAMP_CHAT_ROOM_TYPES,
  type CampChatRoomType,
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
import { campRolesOf } from './campTeachers';
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
} as const;

/** 매니저로 보는 캠프 그룹 역할 — 부매니저 · Sub Manager 는 멘토·원어민 쪽 */
export const CHAT_MANAGER_GROUP_ROLES: readonly string[] = ['매니저', 'Manager'];

/** 캠프 방 순서 (목록 위에 고정) — 사람마다 보이는 방은 3개: 매니저 [전체·멘토방·원어민방], 멘토 [전체·멘토방·멘토끼리], 원어민 [전체·원어민방·원어민끼리] */
export const CAMP_CHAT_ROOM_ORDER: readonly CampChatRoomType[] = ['camp_all', 'camp_mentor', 'camp_mentor_only', 'camp_foreign', 'camp_foreign_only'];

/** 방마다 들어가는 자리 */
export const CAMP_CHAT_ROOM_MEMBERS: Record<CampChatRoomType, readonly ChatMemberKind[]> = {
  camp_all: ['manager', 'mentor', 'foreign'],
  camp_mentor: ['manager', 'mentor'],
  camp_mentor_only: ['mentor'],
  camp_foreign: ['manager', 'foreign'],
  camp_foreign_only: ['foreign'],
};

const ROOM_LABEL_KEY: Record<CampChatRoomType, MessageKey> = {
  camp_all: 'chat.roomAll',
  camp_mentor: 'chat.roomMentor',
  camp_mentor_only: 'chat.roomMentorOnly',
  camp_foreign: 'chat.roomForeign',
  camp_foreign_only: 'chat.roomForeignOnly',
};
const ROOM_DESC_KEY: Record<CampChatRoomType, MessageKey> = {
  camp_all: 'chat.roomAllDesc',
  camp_mentor: 'chat.roomMentorDesc',
  camp_mentor_only: 'chat.roomMentorOnlyDesc',
  camp_foreign: 'chat.roomForeignDesc',
  camp_foreign_only: 'chat.roomForeignOnlyDesc',
};

export const isCampChatRoomType = (v: unknown): v is CampChatRoomType =>
  typeof v === 'string' && (CAMP_CHAT_ROOM_TYPES as readonly string[]).includes(v);

export const campChatRoomId = (jobCodeId: string, type: CampChatRoomType): string => `${jobCodeId}_${type}`;
export const dmRoomId = (a: string, b: string): string => `dm_${[a, b].sort().join('_')}`;
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
 * 캠프 방 5개의 사람 — 서버가 방 문서를 맞출 때 쓴다.
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
    const allowed = CAMP_CHAT_ROOM_MEMBERS[type];
    const inRoom = people.filter((p) => allowed.includes(p.kind));
    const memberIds = [...new Set(inRoom.map((p) => p.uid))].sort();
    const memberInfo: Record<string, ChatMemberInfo> = {};
    inRoom.forEach((p) => { memberInfo[p.uid] = chatMemberInfoOf(p.u, p.kind, camp.jobCodeId); });
    return {
      id: campChatRoomId(camp.jobCodeId, type), type, jobCodeId: camp.jobCodeId, campCode: camp.campCode,
      generation: camp.generation ?? null, memberIds, memberInfo,
    };
  });
}

/** 방 문서가 계획과 다른가 (사람 · 이름 · 사진 · 역할) */
export function chatRoomNeedsSync(
  room: Pick<ChatRoom, 'memberIds' | 'memberInfo' | 'campCode' | 'generation'> | null | undefined,
  plan: CampChatRoomPlan,
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

/** 방 이름 — 캠프 방 "J29 전체방", DM 은 상대 이름 */
export function chatRoomTitle(room: Pick<ChatRoom, 'type' | 'campCode' | 'memberIds' | 'memberInfo'>, lang: Locale, myUid?: string): string {
  if (room.type === 'dm') {
    const other = (room.memberIds ?? []).find((id) => id !== myUid) ?? myUid ?? '';
    return room.memberInfo?.[other]?.name || t(lang, 'chat.unknownUser');
  }
  const label = t(lang, ROOM_LABEL_KEY[room.type]);
  return room.campCode ? `${room.campCode} ${label}` : label;
}

/** 캠프 방 설명 — "매니저 + 멘토" */
export function chatRoomDescription(type: ChatRoomType, lang: Locale): string {
  return type === 'dm' ? '' : t(lang, ROOM_DESC_KEY[type]);
}

/** 캠프 방 짧은 이름 (캠프 코드 없이) — "전체방" */
export function chatRoomLabel(type: ChatRoomType, lang: Locale): string {
  return type === 'dm' ? t(lang, 'chat.dm') : t(lang, ROOM_LABEL_KEY[type]);
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
  /** 전체방 → 멘토방 → 멘토끼리 → 원어민방 → 원어민끼리 순 (보이는 것만) */
  rooms: ChatRoom[];
}

export interface ChatRoomGroups {
  /** 지금 기수 '29기' — 지금 캠프의 기수, 없으면 가장 최근 기수 */
  generation: string;
  /** 지금 기수의 캠프들 (J → E → S → F …) — 2개 이상이면 [All][J29][E29]… 버튼으로 골라 본다 */
  camps: ChatCampGroup[];
  /** 1:1 대화 — 최근 순 (메시지가 없는 방은 빼고) */
  dms: ChatRoom[];
  /** 지난 기수 — 최근 기수 먼저 (접어 둔다) */
  otherGenerations: Array<{ generation: string; camps: ChatCampGroup[] }>;
}

/**
 * 목록 나누기 — 지금 기수의 캠프 방(위) · 1:1 대화 · 지난 기수.
 * @param activeJobCodeId 지금 보고 있는 캠프 — 이 캠프의 기수가 '지금 기수'
 * @param keepEmptyDmId 메시지가 아직 없어도 보여 줄 DM (방금 만든 대화)
 */
export function chatRoomGroups(rooms: ChatRoom[], opts: { activeJobCodeId?: string | null; keepEmptyDmId?: string | null } = {}): ChatRoomGroups {
  const byCamp = new Map<string, ChatRoom[]>();
  rooms.filter((r) => r.type !== 'dm' && r.jobCodeId).forEach((r) => {
    const k = String(r.jobCodeId);
    if (!byCamp.has(k)) byCamp.set(k, []);
    byCamp.get(k)!.push(r);
  });
  const order = (r: ChatRoom) => CAMP_CHAT_ROOM_ORDER.indexOf(r.type as CampChatRoomType);
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
  const dms = rooms
    .filter((r) => r.type === 'dm' && (!!r.lastMessage || r.id === opts.keepEmptyDmId))
    .sort((a, b) => roomTime(b) - roomTime(a));
  return {
    generation,
    camps: camps.filter((c) => c.generation === generation).sort(byCode),
    dms,
    otherGenerations: [...others.entries()]
      .map(([g, list]) => ({ generation: g, camps: list.sort(byCode) }))
      .sort((a, b) => generationNumber(b.generation) - generationNumber(a.generation)),
  };
}

/** [All] 또는 캠프 하나만 — filter: 'all' 또는 jobCodeId (없는 캠프면 전체) */
export function filterCampGroups(camps: ChatCampGroup[], filter: string | null | undefined): ChatCampGroup[] {
  if (!filter || filter === 'all') return camps;
  const one = camps.filter((c) => c.jobCodeId === filter);
  return one.length ? one : camps;
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
): string {
  if (!m) return t(lang, 'chat.noMessagesYet');
  if (m.deleted) return t(lang, 'chat.deletedMessage');
  const counts = 'media' in m ? mediaCounts(m.media) : { images: Number((m as ChatLastMessage).imageCount ?? 0), videos: Number((m as ChatLastMessage).videoCount ?? 0) };
  const text = String(m.text ?? '').replace(/\s+/g, ' ').trim();
  let media = '';
  if (counts.images && counts.videos) media = t(lang, 'chat.previewMedia', { images: counts.images, videos: counts.videos });
  else if (counts.images) media = t(lang, 'chat.previewPhotos', { n: counts.images });
  else if (counts.videos) media = counts.videos === 1 ? t(lang, 'chat.previewVideo') : t(lang, 'chat.previewVideos', { n: counts.videos });
  if (text && media) return `${media} · ${text}`;
  return text || media || t(lang, 'chat.noMessagesYet');
}

/** 방 문서에 둘 마지막 메시지 */
export function chatLastMessageOf(m: Pick<ChatMessage, 'id' | 'kind' | 'text' | 'media' | 'senderId' | 'senderName' | 'deleted'>): ChatLastMessage {
  const c = mediaCounts(m.media);
  const last: ChatLastMessage = {
    messageId: m.id,
    kind: m.kind,
    text: String(m.text ?? '').slice(0, 200),
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
  };
  if (map[ct]) return map[ct];
  const m = /\.([a-z0-9]{2,5})$/i.exec(String(name ?? ''));
  return m ? m[1].toLowerCase() : ct.startsWith('video/') ? 'mp4' : 'jpg';
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
