export type UserRole = 'admin' | 'mentor' | 'mentor_temp' | 'foreign' | 'foreign_temp';
export interface Permission {
    canViewAllStudents: boolean;
    canViewOwnStudents: boolean;
    canEditStudentData: boolean;
    canSyncSTSheet: boolean;
    canManageCamp: boolean;
    canManageEducation: boolean;
    canManageTasks: boolean;
    canManageRooms: boolean;
    canManagePatients: boolean;
    canManageJobBoards: boolean;
    canManageApplications: boolean;
    canEvaluate: boolean;
}
export declare const RolePermissions: Record<UserRole, Permission>;
export declare const hasPermission: (userRole: UserRole, permission: keyof Permission) => boolean;
//# sourceMappingURL=permission.d.ts.map