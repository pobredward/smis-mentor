"use strict";
// 권한 관리 타입
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasPermission = exports.RolePermissions = void 0;
exports.RolePermissions = {
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
    user: {
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
const hasPermission = (userRole, permission) => {
    return exports.RolePermissions[userRole][permission];
};
exports.hasPermission = hasPermission;
