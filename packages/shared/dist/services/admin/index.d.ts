import { Timestamp, Firestore } from 'firebase/firestore';
import type { JobExperienceGroupRole } from '../../types/camp';
interface JobCode {
    generation: string;
    code: string;
    name: string;
    eduDates: Timestamp[];
    startDate: Timestamp;
    endDate: Timestamp;
    location: string;
    korea: boolean;
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
}
interface JobCodeWithId extends JobCode {
    id: string;
}
type JobGroup = 'junior' | 'middle' | 'senior' | 'spring' | 'summer' | 'autumn' | 'winter' | 'common' | 'manager';
interface JobExperienceItem {
    id: string;
    group: JobGroup;
    groupRole?: JobExperienceGroupRole;
    classCode?: string;
}
interface User {
    userId: string;
    id: string;
    email: string;
    name: string;
    phoneNumber: string;
    phone?: string;
    role: 'user' | 'mentor' | 'admin' | 'foreign' | 'foreign_temp' | 'mentor_temp';
    status: 'active' | 'inactive' | 'temp';
    jobExperiences?: JobExperienceItem[];
    address?: string;
    addressDetail?: string;
    profileImage?: string;
    isEmailVerified?: boolean;
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
    lastLoginAt?: Timestamp;
    feedback?: string;
    [key: string]: unknown;
}
interface JobCodeWithGroup extends JobCodeWithId {
    group: JobGroup;
}
export declare const createTempUser: (db: Firestore, name: string, phoneNumber: string, jobExperienceIds: string[], jobExperienceGroups?: string[], jobExperienceGroupRoles?: string[], jobExperienceClassCodes?: (string | undefined)[], role?: "mentor_temp" | "foreign_temp" | "admin") => Promise<{
    success: boolean;
}>;
export declare const adminGetAllUsers: (db: Firestore, includeDeleted?: boolean) => Promise<User[]>;
export declare const adminUpdateUser: (db: Firestore, userId: string, updates: Partial<User>) => Promise<void>;
export declare const adminDeleteUser: (db: Firestore, userId: string) => Promise<boolean>;
export declare const adminReactivateUser: (db: Firestore, userId: string) => Promise<boolean>;
export declare const adminGetAllJobCodes: (db: Firestore) => Promise<JobCodeWithId[]>;
export declare const adminCreateJobCode: (db: Firestore, jobCodeData: Omit<JobCode, "createdAt" | "updatedAt">) => Promise<string>;
export declare const adminDeleteJobCode: (db: Firestore, jobCodeId: string) => Promise<boolean>;
export declare const adminUpdateJobCode: (db: Firestore, jobCodeId: string, jobCodeData: Partial<JobCode>) => Promise<boolean>;
export declare const adminGetJobCodeById: (db: Firestore, jobCodeId: string) => Promise<{
    id: string;
} | null>;
export declare const adminAddUserJobCode: (db: Firestore, userId: string, jobCodeId: string, group: string, groupRole: string, classCode?: string) => Promise<JobExperienceItem[]>;
export declare const adminRemoveUserJobCode: (db: Firestore, userId: string, jobCodeId: string) => Promise<JobExperienceItem[]>;
export declare const adminGetUserJobCodesInfo: (db: Firestore, jobExperiences: JobExperienceItem[] | string[]) => Promise<JobCodeWithGroup[]>;
export declare const adminGetUsersByJobCode: (db: Firestore, generation: string, code: string) => Promise<User[]>;
export declare const adminGetUserById: (db: Firestore, userId: string) => Promise<import("@firebase/firestore").DocumentData | null>;
/**
 * 관리자가 임시로 캠프를 활성화하여 조회할 수 있도록 함
 * 실제 jobExperiences에 추가하지 않고 임시로 activeJobExperienceId만 변경
 */
export declare const adminSetTemporaryCamp: (db: Firestore, userId: string, jobCodeId: string) => Promise<void>;
/**
 * 관리자의 임시 캠프 활성화를 해제하고 원래 캠프로 복원
 */
export declare const adminClearTemporaryCamp: (db: Firestore, userId: string) => Promise<void>;
/**
 * 관리자가 현재 임시 캠프를 활성화 중인지 확인
 */
export declare const adminIsUsingTemporaryCamp: (db: Firestore, userId: string) => Promise<boolean>;
export {};
//# sourceMappingURL=index.d.ts.map