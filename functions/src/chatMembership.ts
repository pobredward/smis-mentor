/**
 * 채팅 방 사람 규칙 — packages/shared/src/utils/chat.ts 의 chatMemberKindOf · chatMemberInfoOf · campChatRoomPlan 과
 * **똑같아야 한다** (functions 는 shared 패키지를 쓰지 않아서 옮겨 둔 것).
 * 바꿀 때는 둘 다 고치고, 에뮬레이터 테스트(~/ftdb/mcptest chat.sync.functions.test.ts 의 '같은 규칙' 검사)로 맞는지 확인한다.
 *
 *  - 채팅 계정: 관리자·멘토·원어민, 탈퇴·비활성·임시 아님
 *  - 매니저: 그 캠프 그룹 역할 '매니저'/'Manager', 또는 관리자 — 관리자는 같은 기수 캠프 하나에라도 배정돼 있으면 그 기수 모든 캠프의 매니저
 *  - 방: 전체(매니저+멘토+원어민) · 멘토방(매니저+멘토) · 멘토끼리(멘토) · 원어민방(매니저+원어민) · 원어민끼리(원어민)
 */
export const CAMP_ROOM_TYPES = ['camp_all', 'camp_mentor', 'camp_mentor_only', 'camp_foreign', 'camp_foreign_only'] as const;
export type CampRoomType = typeof CAMP_ROOM_TYPES[number];
export type MemberKind = 'manager' | 'mentor' | 'foreign';

export const ROOM_MEMBERS: Record<CampRoomType, readonly MemberKind[]> = {
  camp_all: ['manager', 'mentor', 'foreign'],
  camp_mentor: ['manager', 'mentor'],
  camp_mentor_only: ['mentor'],
  camp_foreign: ['manager', 'foreign'],
  camp_foreign_only: ['foreign'],
};

const MANAGER_GROUP_ROLES = ['매니저', 'Manager'];
const STAFF = ['admin', 'mentor', 'foreign'];

/** shared TEACHER_GROUP_NAME 과 같게 */
const TEACHER_GROUP_NAME: Record<string, string> = {
  spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter', junior: 'Junior', middle: 'Middle', senior: 'Senior',
  common: 'Common', manager: '운영진', short1: '단기 1', short2: '단기 2', short3: '단기 3', short4: '단기 4',
};

export interface ExpLike { id?: string; group?: string; groupRole?: string; classCode?: string }
export interface UserLike {
  userId?: string;
  name?: string;
  role?: string;
  status?: string;
  profileImage?: string;
  jobCodeIds?: string[];
  jobExperiences?: Array<ExpLike | null | undefined>;
}
export interface MemberInfo { name: string; photo?: string; kind: MemberKind; role?: string; label?: string }
export interface RoomPlan {
  id: string;
  type: CampRoomType;
  jobCodeId: string;
  campCode: string;
  generation: string | null;
  memberIds: string[];
  memberInfo: Record<string, MemberInfo>;
}

export const campRoomId = (jobCodeId: string, type: CampRoomType) => `${jobCodeId}_${type}`;

export const isChatStaff = (u: UserLike | null | undefined): boolean =>
  !!u && STAFF.includes(String(u.role)) && !['inactive', 'deleted', 'temp'].includes(String(u.status ?? 'active'));

const inCamp = (u: UserLike, jobCodeId: string) =>
  (u.jobCodeIds ?? []).includes(jobCodeId) || (u.jobExperiences ?? []).some((e) => e?.id === jobCodeId);

/** 사람의 캠프 (jobCodeIds + jobExperiences) */
export const campsOfUser = (u: UserLike | null | undefined): Set<string> =>
  new Set([...(u?.jobCodeIds ?? []), ...((u?.jobExperiences ?? []).map((e) => e?.id).filter(Boolean) as string[])]);

export function memberKindOf(u: UserLike | null | undefined, jobCodeId: string, generationIds: readonly string[] = []): MemberKind | null {
  if (!u || !isChatStaff(u)) return null;
  if (u.role === 'admin') return inCamp(u, jobCodeId) || generationIds.some((id) => inCamp(u, id)) ? 'manager' : null;
  if (!inCamp(u, jobCodeId)) return null;
  const exp = (u.jobExperiences ?? []).find((e) => e?.id === jobCodeId);
  if (MANAGER_GROUP_ROLES.includes(String(exp?.groupRole ?? '').trim())) return 'manager';
  return u.role === 'foreign' ? 'foreign' : 'mentor';
}

/** shared campRolesOf(u)[jobCodeId] 와 같게 — 같은 캠프가 여러 번이면 마지막 것 */
function campRoleLabel(u: UserLike, jobCodeId: string): string {
  let out = '';
  (u.jobExperiences ?? []).forEach((e) => {
    if (!e?.id || e.id !== jobCodeId) return;
    const g = String(e.group ?? '').trim();
    const gk = g.toLowerCase();
    const role = String(e.groupRole ?? '').trim();
    out = [gk && gk !== 'manager' && gk !== 'common' ? TEACHER_GROUP_NAME[gk] ?? g : '', role, role === '담임' ? String(e.classCode ?? '') : '']
      .filter(Boolean).join(' ');
  });
  return out;
}

export function memberInfoOf(u: UserLike, kind: MemberKind, jobCodeId?: string): MemberInfo {
  const info: MemberInfo = { name: String(u.name ?? '').trim() || '?', kind, role: String(u.role ?? '') };
  const photo = String(u.profileImage ?? '');
  if (/^https?:\/\//.test(photo) && photo.length <= 1000) info.photo = photo;
  const label = jobCodeId ? campRoleLabel(u, jobCodeId) : '';
  if (label) info.label = label;
  return info;
}

/** DM 의 자리 — 역할로 */
export const dmKindOf = (u: UserLike): MemberKind => (u.role === 'admin' ? 'manager' : u.role === 'foreign' ? 'foreign' : 'mentor');

export function campRoomPlan(
  users: UserLike[],
  camp: { jobCodeId: string; campCode: string; generation: string | null; generationIds: readonly string[] },
): RoomPlan[] {
  const people = users
    .map((u) => ({ uid: String(u.userId ?? ''), kind: memberKindOf(u, camp.jobCodeId, camp.generationIds), u }))
    .filter((p): p is { uid: string; kind: MemberKind; u: UserLike } => !!p.uid && !!p.kind);
  return CAMP_ROOM_TYPES.map((type) => {
    const inRoom = people.filter((p) => ROOM_MEMBERS[type].includes(p.kind));
    const memberIds = [...new Set(inRoom.map((p) => p.uid))].sort();
    const memberInfo: Record<string, MemberInfo> = {};
    inRoom.forEach((p) => { memberInfo[p.uid] = memberInfoOf(p.u, p.kind, camp.jobCodeId); });
    return { id: campRoomId(camp.jobCodeId, type), type, jobCodeId: camp.jobCodeId, campCode: camp.campCode, generation: camp.generation, memberIds, memberInfo };
  });
}

export const sameInfo = (a: MemberInfo | null | undefined, b: MemberInfo | null | undefined): boolean =>
  !!a && !!b && a.name === b.name && (a.photo ?? '') === (b.photo ?? '') && a.kind === b.kind && (a.label ?? '') === (b.label ?? '') && (a.role ?? '') === (b.role ?? '');

export interface RoomLike { memberIds?: string[]; memberInfo?: Record<string, MemberInfo>; campCode?: string | null; generation?: string | null }

export function roomNeedsSync(room: RoomLike | null | undefined, plan: Pick<RoomPlan, 'campCode' | 'generation' | 'memberIds' | 'memberInfo'>): boolean {
  if (!room) return true;
  if ((room.campCode ?? '') !== plan.campCode) return true;
  if ((room.generation ?? null) !== plan.generation) return true;
  const a = [...(room.memberIds ?? [])].sort();
  if (a.length !== plan.memberIds.length || a.some((v, i) => v !== plan.memberIds[i])) return true;
  return plan.memberIds.some((uid) => !sameInfo(room.memberInfo?.[uid], plan.memberInfo[uid]));
}

// ── 그룹방 — shared campGroupRoomPlan · chatGroupKeyOf 와 같게 ─────────────────────
// 그룹마다 하나: 캠프 매니저(관리자 포함) + 그 그룹 멘토(부매니저 포함). 원어민 없음. 멘토가 있는 그룹만.

/** shared GROUP_ALIASES · normalizeGroupKey 와 같게 */
const GROUP_ALIASES: Record<string, string> = {
  junior: 'junior', 주니어: 'junior', middle: 'middle', 미들: 'middle', senior: 'senior', 시니어: 'senior',
  spring: 'spring', 스프링: 'spring', summer: 'summer', 서머: 'summer', autumn: 'autumn', 어텀: 'autumn', winter: 'winter', 윈터: 'winter',
  common: 'common', 공통: 'common',
  short1: 'short1', 단기1: 'short1', short2: 'short2', 단기2: 'short2', short3: 'short3', 단기3: 'short3', short4: 'short4', 단기4: 'short4',
  manager: 'manager', 매니저: 'manager', 운영진: 'manager', all: 'manager', 전체: 'manager',
};
const normalizeGroupKey = (name: string | undefined | null): string => {
  if (!name) return '';
  const cleaned = name.replace(/group/gi, '').trim().toLowerCase();
  return GROUP_ALIASES[cleaned] ?? cleaned;
};
/** shared CAMP_GROUP_ORDER · groupRank 와 같게 */
const CAMP_GROUP_ORDER = ['junior', 'middle', 'senior', 'spring', 'summer', 'autumn', 'winter', 'common', 'short1', 'short2', 'short3', 'short4', 'manager'];
const groupRank = (k: string): number => {
  const i = CAMP_GROUP_ORDER.indexOf(normalizeGroupKey(k));
  return i >= 0 ? i : CAMP_GROUP_ORDER.indexOf('common') - 0.5;
};
export const GROUP_ROOM_EXCLUDED = ['', 'manager', 'common', 'all'];
export const groupRoomId = (jobCodeId: string, groupKey: string) => `${jobCodeId}_group_${groupKey}`;

export function groupKeyOf(u: UserLike | null | undefined, jobCodeId: string): string {
  const exp = (u?.jobExperiences ?? []).find((e) => e?.id === jobCodeId);
  const k = normalizeGroupKey(String(exp?.group ?? ''));
  return GROUP_ROOM_EXCLUDED.includes(k) ? '' : k;
}

export interface GroupRoomPlan {
  id: string;
  type: 'camp_group';
  groupKey: string;
  jobCodeId: string;
  campCode: string;
  generation: string | null;
  memberIds: string[];
  memberInfo: Record<string, MemberInfo>;
}

export function groupRoomPlan(
  users: UserLike[],
  camp: { jobCodeId: string; campCode: string; generation: string | null; generationIds: readonly string[] },
): GroupRoomPlan[] {
  const managers: Array<{ uid: string; u: UserLike }> = [];
  const byGroup = new Map<string, Array<{ uid: string; u: UserLike }>>();
  users.forEach((u) => {
    const uid = String(u.userId ?? '');
    const kind = uid ? memberKindOf(u, camp.jobCodeId, camp.generationIds) : null;
    if (kind === 'manager') managers.push({ uid, u });
    else if (kind === 'mentor') {
      const g = groupKeyOf(u, camp.jobCodeId);
      if (!g) return;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push({ uid, u });
    }
  });
  return [...byGroup.keys()]
    .sort((a, b) => groupRank(a) - groupRank(b) || a.localeCompare(b))
    .map((groupKey) => {
      const memberInfo: Record<string, MemberInfo> = {};
      managers.forEach((p) => { memberInfo[p.uid] = memberInfoOf(p.u, 'manager', camp.jobCodeId); });
      byGroup.get(groupKey)!.forEach((p) => { memberInfo[p.uid] = memberInfoOf(p.u, 'mentor', camp.jobCodeId); });
      return {
        id: groupRoomId(camp.jobCodeId, groupKey), type: 'camp_group' as const, groupKey,
        jobCodeId: camp.jobCodeId, campCode: camp.campCode, generation: camp.generation,
        memberIds: Object.keys(memberInfo).sort(), memberInfo,
      };
    });
}
