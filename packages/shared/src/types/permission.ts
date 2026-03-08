// 권한 관리 타입

export type UserRole = 'admin' | 'mentor' | 'mentor_temp' | 'foreign' | 'foreign_temp';

export interface Permission {
  // ST시트 권한
  canViewAllStudents: boolean;
  canViewOwnStudents: boolean;
  canEditStudentData: boolean;
  canSyncSTSheet: boolean;
  
  // 캠프 관리 권한
  canManageCamp: boolean;
  canManageEducation: boolean;
  canManageTasks: boolean;
  canManageRooms: boolean;
  canManagePatients: boolean;
  
  // 채용 권한 (기존)
  canManageJobBoards: boolean;
  canManageApplications: boolean;
  canEvaluate: boolean;
}

export const RolePermissions: Record<UserRole, Permission> = {
  admin: {
    canViewAllStudents: true,
    canViewOwnStudents: true,
    canEditStudentData: true,
    canSyncSTSheet: true,
    canManageCamp: true,
    canManageEducation: true,
    canManageTasks: true,
    canManageRooms: true,
    canManagePatients: true,
    canManageJobBoards: true,
    canManageApplications: true,
    canEvaluate: true,
  },
  mentor: {
    canViewAllStudents: false,
    canViewOwnStudents: true,
    canEditStudentData: false,
    canSyncSTSheet: true,
    canManageCamp: false,
    canManageEducation: false,
    canManageTasks: false,
    canManageRooms: false,
    canManagePatients: true,
    canManageJobBoards: false,
    canManageApplications: false,
    canEvaluate: false,
  },
  foreign: {  // 원어민: mentor와 동일한 권한
    canViewAllStudents: false,
    canViewOwnStudents: true,
    canEditStudentData: false,
    canSyncSTSheet: true,
    canManageCamp: false,
    canManageEducation: false,
    canManageTasks: false,
    canManageRooms: false,
    canManagePatients: true,
    canManageJobBoards: false,
    canManageApplications: false,
    canEvaluate: false,
  },
  mentor_temp: {  // 멘토 (회원가입 전): 권한 없음
    canViewAllStudents: false,
    canViewOwnStudents: false,
    canEditStudentData: false,
    canSyncSTSheet: false,
    canManageCamp: false,
    canManageEducation: false,
    canManageTasks: false,
    canManageRooms: false,
    canManagePatients: false,
    canManageJobBoards: false,
    canManageApplications: false,
    canEvaluate: false,
  },
  foreign_temp: {  // 원어민 (회원가입 전): 권한 없음
    canViewAllStudents: false,
    canViewOwnStudents: false,
    canEditStudentData: false,
    canSyncSTSheet: false,
    canManageCamp: false,
    canManageEducation: false,
    canManageTasks: false,
    canManageRooms: false,
    canManagePatients: false,
    canManageJobBoards: false,
    canManageApplications: false,
    canEvaluate: false,
  },
};

export const hasPermission = (
  userRole: UserRole,
  permission: keyof Permission
): boolean => {
  return RolePermissions[userRole][permission];
};
