/**
 * 채용 프로세스 상태 흐름 관리 유틸리티
 * 
 * 상태 흐름:
 * 1. 서류 검토 → 서류 합격
 * 2. 서류 합격 → 면접 진행 가능
 * 3. 면접 합격 → 최종 결정 가능
 */

export type ApplicationStatus = 'pending' | 'accepted' | 'rejected';
export type InterviewStatus = '' | 'pending' | 'complete' | 'passed' | 'failed' | 'absent';
export type FinalStatus = '' | 'finalAccepted' | 'finalRejected' | 'finalAbsent';

/**
 * 면접 상태 변경이 가능한지 확인
 * @param applicationStatus 서류 상태
 * @returns 면접 상태 변경 가능 여부
 */
export function canChangeInterviewStatus(applicationStatus: ApplicationStatus): boolean {
  return applicationStatus === 'accepted';
}

/**
 * 최종 상태 변경이 가능한지 확인
 * @param interviewStatus 면접 상태
 * @returns 최종 상태 변경 가능 여부
 */
export function canChangeFinalStatus(interviewStatus: InterviewStatus): boolean {
  return interviewStatus === 'passed';
}

/**
 * 면접 상태가 비활성화되어야 하는지 확인
 * @param applicationStatus 서류 상태
 * @returns 비활성화 여부
 */
export function isInterviewStatusDisabled(applicationStatus: ApplicationStatus): boolean {
  return !canChangeInterviewStatus(applicationStatus);
}

/**
 * 최종 상태가 비활성화되어야 하는지 확인
 * @param interviewStatus 면접 상태
 * @returns 비활성화 여부
 */
export function isFinalStatusDisabled(interviewStatus: InterviewStatus): boolean {
  return !canChangeFinalStatus(interviewStatus);
}

/**
 * 면접 상태 변경 시 경고 메시지 반환
 * @param applicationStatus 서류 상태
 * @returns 경고 메시지 (null이면 변경 가능)
 */
export function getInterviewStatusChangeWarning(applicationStatus: ApplicationStatus): string | null {
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
export function getFinalStatusChangeWarning(interviewStatus: InterviewStatus): string | null {
  if (!canChangeFinalStatus(interviewStatus)) {
    return '면접 합격 후에만 최종 상태를 변경할 수 있습니다.';
  }
  return null;
}

/**
 * 상태별 라벨 반환
 */
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: '검토중',
  accepted: '합격',
  rejected: '불합격',
};

export const INTERVIEW_STATUS_LABELS: Record<string, string> = {
  '': '미정',
  pending: '예정',
  complete: '완료',
  passed: '합격',
  failed: '불합격',
  absent: '면접불참',
};

export const FINAL_STATUS_LABELS: Record<string, string> = {
  '': '미정',
  finalAccepted: '합격',
  finalRejected: '불합격',
  finalAbsent: '최종불참',
};

// ── 지원자에게 보여 주는 상태 배지 (웹·앱 공용 — 화면마다 따로 쓰던 라벨을 하나로) ──

export type RecruitStage = 'application' | 'interview' | 'final';
export type StatusTone = 'wait' | 'info' | 'ok' | 'bad' | 'muted';

const BADGES: Record<RecruitStage, Record<string, { label: string; tone: StatusTone }>> = {
  application: {
    pending: { label: '검토중', tone: 'wait' },
    accepted: { label: '서류합격', tone: 'ok' },
    rejected: { label: '서류불합격', tone: 'bad' },
  },
  interview: {
    pending: { label: '면접예정', tone: 'wait' },
    complete: { label: '면접완료', tone: 'info' },
    passed: { label: '면접합격', tone: 'ok' },
    failed: { label: '면접불합격', tone: 'bad' },
    absent: { label: '면접불참', tone: 'muted' },
  },
  final: {
    finalAccepted: { label: '최종합격', tone: 'ok' },
    finalRejected: { label: '최종불합격', tone: 'bad' },
    finalAbsent: { label: '최종불참', tone: 'muted' },
    absent: { label: '최종불참', tone: 'muted' }, // 옛 데이터 호환
  },
};

/** 단계·상태 → 배지 라벨과 색 계열 (모르는 값은 '미정') */
export function recruitStatusBadge(stage: RecruitStage, status: string | null | undefined): { label: string; tone: StatusTone } {
  return (status && BADGES[stage][status]) || { label: '미정', tone: 'muted' };
}
