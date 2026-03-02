/**
 * 채용 프로세스 상태 흐름 관리 유틸리티
 *
 * 상태 흐름:
 * 1. 서류 검토 → 서류 합격
 * 2. 서류 합격 → 면접 진행 가능
 * 3. 면접 합격 → 최종 결정 가능
 */
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';
export type InterviewStatus = '' | 'pending' | 'complete' | 'passed' | 'failed';
export type FinalStatus = '' | 'finalAccepted' | 'finalRejected';
/**
 * 면접 상태 변경이 가능한지 확인
 * @param applicationStatus 서류 상태
 * @returns 면접 상태 변경 가능 여부
 */
export declare function canChangeInterviewStatus(applicationStatus: ApplicationStatus): boolean;
/**
 * 최종 상태 변경이 가능한지 확인
 * @param interviewStatus 면접 상태
 * @returns 최종 상태 변경 가능 여부
 */
export declare function canChangeFinalStatus(interviewStatus: InterviewStatus): boolean;
/**
 * 면접 상태가 비활성화되어야 하는지 확인
 * @param applicationStatus 서류 상태
 * @returns 비활성화 여부
 */
export declare function isInterviewStatusDisabled(applicationStatus: ApplicationStatus): boolean;
/**
 * 최종 상태가 비활성화되어야 하는지 확인
 * @param interviewStatus 면접 상태
 * @returns 비활성화 여부
 */
export declare function isFinalStatusDisabled(interviewStatus: InterviewStatus): boolean;
/**
 * 면접 상태 변경 시 경고 메시지 반환
 * @param applicationStatus 서류 상태
 * @returns 경고 메시지 (null이면 변경 가능)
 */
export declare function getInterviewStatusChangeWarning(applicationStatus: ApplicationStatus): string | null;
/**
 * 최종 상태 변경 시 경고 메시지 반환
 * @param interviewStatus 면접 상태
 * @returns 경고 메시지 (null이면 변경 가능)
 */
export declare function getFinalStatusChangeWarning(interviewStatus: InterviewStatus): string | null;
/**
 * 상태별 라벨 반환
 */
export declare const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string>;
export declare const INTERVIEW_STATUS_LABELS: Record<string, string>;
export declare const FINAL_STATUS_LABELS: Record<string, string>;
//# sourceMappingURL=applicationStatus.d.ts.map