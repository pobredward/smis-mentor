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
/**
 * 관리자가 지원자의 지원장소(JobBoard)를 변경
 * 연관된 evaluations의 refJobBoardId도 함께 업데이트
 *
 * @param db - Firestore 인스턴스
 * @param applicationId - 변경할 지원 내역 ID
 * @param newJobBoardId - 새로운 채용 공고 ID
 * @returns 업데이트된 문서 수 정보
 */
export declare const changeApplicationJobBoard: (db: Firestore, applicationId: string, newJobBoardId: string) => Promise<{
    updatedApplications: number;
    updatedEvaluations: number;
}>;
/**
 * JobBoard별 지원자 통계 재계산
 * 지원장소 변경 시 호출하여 통계를 갱신
 *
 * @param db - Firestore 인스턴스
 * @param jobBoardId - 통계를 갱신할 채용 공고 ID
 */
export declare const recalculateJobBoardStats: (db: Firestore, jobBoardId: string) => Promise<{
    totalApplications: number;
    pendingCount: number;
    acceptedCount: number;
    rejectedCount: number;
    interviewScheduledCount: number;
    interviewPassedCount: number;
    finalAcceptedCount: number;
}>;
//# sourceMappingURL=index.d.ts.map