import type { Task, User, JobExperienceGroupRole, JobExperienceGroup } from '../types';
import { LEGACY_GROUP_MAP } from '../types/camp';
import { campExperienceOf, isSubManagerIn, normalizeCampGroup, type CampUserLike } from '../utils/campAccess';

// ==================== 업무 노출 · 배정 기준 ====================
// 관리자가 아니면 "내 그룹" 대상 업무만 본다.
// - 멘토 · 원어민: 내 그룹 + 내 역할 대상 업무 (체크 대상과 같다)
// - 부매니저: 내 그룹 대상 업무를 역할과 무관하게 모두 본다 (완료 현황 확인용). 체크는 내 역할 대상만.

export interface TaskViewer {
  isAdmin: boolean;
  /** 활성 캠프에서 내 역할 (담임/수업/Speaking…) */
  groupRole?: string;
  /** 활성 캠프에서 내 그룹 (한글 표기: 서머 · 주니어 …) */
  group?: string;
  /** 활성 캠프에서 부매니저인가 */
  isSubManager: boolean;
}

export function taskViewerOf(user: CampUserLike | null | undefined, jobCodeId?: string): TaskViewer {
  const exp = campExperienceOf(user, jobCodeId);
  return {
    isAdmin: user?.role === 'admin',
    groupRole: exp?.groupRole,
    group: normalizeCampGroup(exp?.group),
    isSubManager: isSubManagerIn(user, jobCodeId),
  };
}

/** 업무가 이 그룹을 대상으로 하는가 ('공통'이면 모든 그룹, 대상 그룹이 없는 옛 업무도 모든 그룹) */
export function taskTargetsGroup(task: Pick<Task, 'targetGroups'>, group?: string): boolean {
  const groups = task.targetGroups ?? [];
  if (groups.length === 0 || groups.includes('공통')) return true;
  const g = normalizeCampGroup(group);
  return !!g && groups.some(t => normalizeCampGroup(t) === g);
}

/** 이 사람이 체크해야 하는 업무인가 (내 역할 + 내 그룹) */
export function isTaskAssignedTo(task: Pick<Task, 'targetRoles' | 'targetGroups'>, viewer: TaskViewer): boolean {
  return !!viewer.groupRole
    && (task.targetRoles ?? []).includes(viewer.groupRole as JobExperienceGroupRole)
    && taskTargetsGroup(task, viewer.group);
}

/** 이 사람 화면에 보일 업무인가 */
export function isTaskVisibleTo(task: Pick<Task, 'targetRoles' | 'targetGroups'>, viewer: TaskViewer): boolean {
  if (viewer.isAdmin) return true;
  if (viewer.isSubManager) return taskTargetsGroup(task, viewer.group);
  return isTaskAssignedTo(task, viewer);
}

/** 업무 저장 API(/api/tasks/save) 요청 본문 — web · mobile 공용 */
export interface TaskSavePayload {
  /** 캠프 코드 (예: J28) */
  campCode: string;
  /** 있으면 수정 */
  taskId?: string;
  /** 'YYYY-MM-DD' 목록 (2개 이상이면 묶음 업무) */
  dates: string[];
  fields: {
    title: string;
    description: string;
    targetRoles: string[];
    /** 부매니저는 서버가 내 그룹으로 고정한다 */
    targetGroups: string[];
    /** 비우면 삭제 */
    time?: string | null;
    estimatedDurationMinutes?: number | null;
    categoryId?: string | null;
    attachments?: Array<{ type: string; url: string; label: string; thumbnail?: string }>;
  };
}

/** 업무 독촉 API(/api/tasks/remind) 응답 */
export interface TaskRemindResult {
  sent: number;
  incomplete: number;
  missed: Array<{ name: string; state: string }>;
}

/** 이 업무를 수정 · 삭제할 수 있는가 — 관리자, 또는 본인이 만든 업무의 부매니저 */
export function canEditTask(task: Pick<Task, 'createdBy'>, viewer: TaskViewer, uid?: string): boolean {
  if (viewer.isAdmin) return true;
  return viewer.isSubManager && !!uid && task.createdBy === uid;
}

/** 이 업무의 미완료자에게 독촉할 수 있는가 — 관리자, 또는 자기 그룹 대상 업무의 부매니저 */
export function canRemindTask(task: Pick<Task, 'targetGroups'>, viewer: TaskViewer): boolean {
  if (viewer.isAdmin) return true;
  return viewer.isSubManager && taskTargetsGroup(task, viewer.group);
}

/**
 * 업무의 대상 사용자 필터링
 * @param task 업무 정보
 * @param campUsers 캠프에 등록된 사용자 목록
 * @param campCode 캠프 코드 (jobExperience의 id와 매칭)
 * @returns 대상 사용자 목록
 */
export const getTaskTargetUsers = (
  task: Task,
  campUsers: User[],
  campCode: string
): User[] => {
  return campUsers.filter(user => {
    if (!user.jobExperiences) return false;

    // 해당 캠프에 속한 경험 찾기
    const campExperience = user.jobExperiences.find(exp => exp.id === campCode);
    if (!campExperience) return false;

    // 역할 + 그룹 매칭 — 화면 노출(isTaskAssignedTo)과 같은 기준
    return isTaskAssignedTo(task, {
      isAdmin: false,
      groupRole: campExperience.groupRole,
      group: LEGACY_GROUP_MAP[campExperience.group] || campExperience.group,
      isSubManager: false,
    });
  });
};

/**
 * 완료한 사용자와 미완료한 사용자 분리
 * @param task 업무 정보
 * @param targetUsers 대상 사용자 목록
 * @returns 완료/미완료 사용자 목록
 */
export const getTaskCompletionStatus = (
  task: Task,
  targetUsers: User[]
): {
  completedUsers: User[];
  incompleteUsers: User[];
  totalCount: number;
  completedCount: number;
  completionRate: number;
} => {
  const completedUserIds = new Set(task.completions.map(c => c.userId));

  const completedUsers = targetUsers.filter(user => 
    completedUserIds.has(user.userId)
  );

  const incompleteUsers = targetUsers.filter(user => 
    !completedUserIds.has(user.userId)
  );

  const totalCount = targetUsers.length;
  const completedCount = completedUsers.length;
  const completionRate = totalCount > 0 
    ? Math.round((completedCount / totalCount) * 100) 
    : 0;

  return {
    completedUsers,
    incompleteUsers,
    totalCount,
    completedCount,
    completionRate,
  };
};

/**
 * 사용자 이름을 가나다순으로 정렬
 * @param users 사용자 목록
 * @returns 정렬된 사용자 목록
 */
export const sortUsersByName = (users: User[]): User[] => {
  return [...users].sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
};

/**
 * 사용자 목록에서 이름만 추출 (가나다순)
 * @param users 사용자 목록
 * @returns 이름 배열
 */
export const getUserNames = (users: User[]): string[] => {
  return sortUsersByName(users).map(u => u.name);
};
