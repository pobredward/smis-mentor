import { Firestore } from 'firebase/firestore';
export declare const createJobBoard: (db: Firestore, jobBoardData: Record<string, any>) => Promise<string>;
export declare const getJobBoardById: (db: Firestore, jobBoardId: string) => Promise<any | null>;
export declare const getAllJobBoards: (db: Firestore) => Promise<any[]>;
export declare const getActiveJobBoards: (db: Firestore) => Promise<any[]>;
export declare const updateJobBoard: (db: Firestore, jobBoardId: string, jobBoardData: Record<string, any>) => Promise<string>;
export declare const deleteJobBoard: (db: Firestore, jobBoardId: string) => Promise<void>;
export declare const createApplication: (db: Firestore, applicationData: Record<string, any>) => Promise<string>;
export declare const getApplicationsByUserId: (db: Firestore, userId: string) => Promise<any[]>;
export declare const getApplicationsByJobBoardId: (db: Firestore, jobBoardId: string) => Promise<any[]>;
export declare const updateApplication: (db: Firestore, applicationId: string, applicationData: Record<string, any>) => Promise<void>;
export declare const cancelApplication: (db: Firestore, applicationId: string) => Promise<boolean>;
//# sourceMappingURL=index.d.ts.map