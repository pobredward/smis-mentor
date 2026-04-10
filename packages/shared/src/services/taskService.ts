import type { Task, User, JobExperienceGroupRole, JobExperienceGroup } from '../types';
import { LEGACY_GROUP_MAP } from '../types/camp';

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

    // 역할 매칭: 업무의 대상 역할에 사용자의 역할이 포함되어야 함
    const matchesRole = task.targetRoles.includes(campExperience.groupRole);
    if (!matchesRole) return false;

    // 그룹 매칭
    // 사용자의 그룹명을 한글로 변환 (영어 레거시 그룹명 지원)
    const userGroupKorean = LEGACY_GROUP_MAP[campExperience.group] || campExperience.group;
    
    // 1. 업무 대상 그룹에 "공통"이 포함되어 있으면 모든 그룹의 사용자 포함
    if (task.targetGroups.includes('공통')) {
      return true;
    }
    
    // 2. 그렇지 않으면 사용자의 그룹이 업무 대상 그룹에 포함되어야 함
    const matchesGroup = task.targetGroups.includes(userGroupKorean as JobExperienceGroup);
    
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
