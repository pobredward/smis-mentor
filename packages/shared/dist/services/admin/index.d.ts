import { Firestore } from 'firebase/firestore';
export declare const createTempUser: (db: Firestore, name: string, phoneNumber: string, jobExperienceIds: string[], jobExperienceGroups?: string[], jobExperienceGroupRoles?: string[], jobExperienceClassCodes?: (string | undefined)[]) => Promise<{
    success: boolean;
}>;
export declare const adminGetAllUsers: (db: Firestore) => Promise<any[]>;
export declare const adminUpdateUser: (db: Firestore, userId: string, updates: Record<string, any>) => Promise<void>;
export declare const adminDeleteUser: (db: Firestore, userId: string) => Promise<boolean>;
export declare const adminReactivateUser: (db: Firestore, userId: string) => Promise<boolean>;
export declare const adminGetAllJobCodes: (db: Firestore) => Promise<any[]>;
export declare const adminCreateJobCode: (db: Firestore, jobCodeData: Record<string, any>) => Promise<string>;
export declare const adminDeleteJobCode: (db: Firestore, jobCodeId: string) => Promise<boolean>;
export declare const adminUpdateJobCode: (db: Firestore, jobCodeId: string, jobCodeData: Record<string, any>) => Promise<boolean>;
export declare const adminGetJobCodeById: (db: Firestore, jobCodeId: string) => Promise<{
    id: string;
} | null>;
export declare const adminAddUserJobCode: (db: Firestore, userId: string, jobCodeId: string, group: string, groupRole: string, classCode?: string) => Promise<any[]>;
export declare const adminGetUserJobCodesInfo: (db: Firestore, jobExperiences: any[]) => Promise<any[]>;
export declare const adminGetUsersByJobCode: (db: Firestore, generation: string, code: string) => Promise<any[]>;
export declare const adminGetUserById: (db: Firestore, userId: string) => Promise<import("@firebase/firestore").DocumentData | null>;
//# sourceMappingURL=index.d.ts.map