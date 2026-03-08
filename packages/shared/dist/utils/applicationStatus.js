/**
 * 채용 프로세스 상태 흐름 관리 유틸리티
 *
 * 상태 흐름:
 * 1. 서류 검토 → 서류 합격
 * 2. 서류 합격 → 면접 진행 가능
 * 3. 면접 합격 → 최종 결정 가능
 */
/**
 * 면접 상태 변경이 가능한지 확인
 * @param applicationStatus 서류 상태
 * @returns 면접 상태 변경 가능 여부
 */
export function canChangeInterviewStatus(applicationStatus) {
    return applicationStatus === 'accepted';
}
/**
 * 최종 상태 변경이 가능한지 확인
 * @param interviewStatus 면접 상태
 * @returns 최종 상태 변경 가능 여부
 */
export function canChangeFinalStatus(interviewStatus) {
    return interviewStatus === 'passed';
}
/**
 * 면접 상태가 비활성화되어야 하는지 확인
 * @param applicationStatus 서류 상태
 * @returns 비활성화 여부
 */
export function isInterviewStatusDisabled(applicationStatus) {
    return !canChangeInterviewStatus(applicationStatus);
}
/**
 * 최종 상태가 비활성화되어야 하는지 확인
 * @param interviewStatus 면접 상태
 * @returns 비활성화 여부
 */
export function isFinalStatusDisabled(interviewStatus) {
    return !canChangeFinalStatus(interviewStatus);
}
/**
 * 면접 상태 변경 시 경고 메시지 반환
 * @param applicationStatus 서류 상태
 * @returns 경고 메시지 (null이면 변경 가능)
 */
export function getInterviewStatusChangeWarning(applicationStatus) {
    if (!canChangeInterviewStatus(applicationStatus)) {
        return '서류 합격 후에만 면접 상태를 변경할 수 있습니다.';
    }
    return null;
}
/**
 * 최종 상태 변경 시 경고 메시지 반환
 * @param interviewStatus 면접 상태
 * @returns 경고 메시지 (null이면 변경 가능)
 */
export function getFinalStatusChangeWarning(interviewStatus) {
    if (!canChangeFinalStatus(interviewStatus)) {
        return '면접 합격 후에만 최종 상태를 변경할 수 있습니다.';
    }
    return null;
}
/**
 * 상태별 라벨 반환
 */
export const APPLICATION_STATUS_LABELS = {
    pending: '검토중',
    accepted: '합격',
    rejected: '불합격',
};
export const INTERVIEW_STATUS_LABELS = {
    '': '미정',
    pending: '예정',
    complete: '완료',
    passed: '합격',
    failed: '불합격',
};
export const FINAL_STATUS_LABELS = {
    '': '미정',
    finalAccepted: '합격',
    finalRejected: '불합격',
};
