import type { Task, User, JobExperienceGroupRole, JobExperienceGroup } from '../types';

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

    // 역할 매칭
    const matchesRole = task.targetRoles.includes(campExperience.groupRole);
    if (!matchesRole) return false;

    // 그룹 매칭 (공통은 모든 그룹 포함)
    const matchesGroup = 
      task.targetGroups.includes('공통') || 
      task.targetGroups.includes(campExperience.group);

    return matchesGroup;
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
