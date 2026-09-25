/**
 * 캠프 탭 공통 권한·소속 판별
 *
 * 활성 캠프 계산과 "이 사람이 어느 그룹의 부매니저인가"를 web·mobile·서버가
 * 같은 기준으로 쓰도록 한 곳에 모은다.
 */
import { LEGACY_GROUP_MAP } from '../types/camp';

interface JobExpLike {
  id: string;
  group?: string;
  groupRole?: string;
  classCode?: string;
}

export interface CampUserLike {
  role?: string;
  activeJobExperienceId?: string;
  adminTempActiveCamp?: string;
  jobExperiences?: JobExpLike[];
}

/** 캠프 탭에 들어올 수 있는 role (Firestore 규칙 isCampStaff 와 같은 기준) */
export const CAMP_STAFF_ROLES: readonly string[] = ['admin', 'mentor', 'foreign'];
export const isCampStaffRole = (role?: string): boolean => !!role && CAMP_STAFF_ROLES.includes(role);

/** 그룹 운영자(부매니저) groupRole — 멘토 · 원어민 공통 */
export const SUB_MANAGER_GROUP_ROLES: readonly string[] = ['부매니저', 'Sub Manager'];

/**
 * 지금 보고 있는 캠프의 jobCode id
 * 관리자 임시 활성 캠프 → 활성 캠프 → 첫 번째 배정 캠프
 */
export function resolveActiveJobCodeId(user: CampUserLike | null | undefined): string | undefined {
  if (!user) return undefined;
  const temp = user.role === 'admin' ? user.adminTempActiveCamp : undefined;
  return temp || user.activeJobExperienceId || user.jobExperiences?.[0]?.id || undefined;
}

/** 캠프 탭 진입 가능 여부 (관리자는 임시 캠프만 있어도 가능) */
export function hasCampAccess(user: CampUserLike | null | undefined): boolean {
  if (!user || !isCampStaffRole(user.role)) return false;
  return !!resolveActiveJobCodeId(user);
}

/** 해당 캠프에서의 내 배정 */
export function campExperienceOf(user: CampUserLike | null | undefined, jobCodeId?: string): JobExpLike | undefined {
  if (!user || !jobCodeId) return undefined;
  return user.jobExperiences?.find(e => e.id === jobCodeId);
}

/** 그룹 이름을 한글 표기로 통일 (summer → 서머) */
export const normalizeCampGroup = (group?: string): string | undefined =>
  group ? (LEGACY_GROUP_MAP[group] || group) : undefined;

/** 해당 캠프에서 내 그룹 (한글 표기) */
export function myCampGroup(user: CampUserLike | null | undefined, jobCodeId?: string): string | undefined {
  return normalizeCampGroup(campExperienceOf(user, jobCodeId)?.group);
}

/** 해당 캠프에서 부매니저인가 (role 과 무관 — 직원 부매니저도 포함) */
export function isSubManagerIn(user: CampUserLike | null | undefined, jobCodeId?: string): boolean {
  const role = campExperienceOf(user, jobCodeId)?.groupRole;
  return !!role && SUB_MANAGER_GROUP_ROLES.includes(role);
}

/** 두 그룹 표기가 같은 그룹인가 (영문 레거시 · 대소문자 무관) */
export function sameCampGroup(a?: string, b?: string): boolean {
  const x = normalizeCampGroup(a?.trim().toLowerCase());
  const y = normalizeCampGroup(b?.trim().toLowerCase());
  return !!x && !!y && x === y;
}
