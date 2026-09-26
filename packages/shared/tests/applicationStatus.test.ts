import { describe, expect, it } from './_expect';
import { canChangeFinalStatus, canChangeInterviewStatus, recruitStatusBadge } from '../src/utils/applicationStatus';

describe('recruitStatusBadge', () => {
  it('단계별 라벨', () => {
    expect(recruitStatusBadge('application', 'pending')).toEqual({ label: '검토중', tone: 'wait' });
    expect(recruitStatusBadge('application', 'accepted').label).toBe('서류합격');
    expect(recruitStatusBadge('interview', 'passed').label).toBe('면접합격');
    expect(recruitStatusBadge('interview', 'absent').tone).toBe('muted');
  });

  it('최종 단계 — finalAbsent 는 불참, 최종 합격은 "최종합격" (예전 버그)', () => {
    expect(recruitStatusBadge('final', 'finalAbsent').label).toBe('최종불참');
    expect(recruitStatusBadge('final', 'absent').label).toBe('최종불참');
    expect(recruitStatusBadge('final', 'finalAccepted').label).toBe('최종합격');
  });

  it('모르는 값·빈 값은 미정', () => {
    expect(recruitStatusBadge('final', undefined)).toEqual({ label: '미정', tone: 'muted' });
    expect(recruitStatusBadge('interview', 'weird').label).toBe('미정');
  });

  it('상태 전이 조건', () => {
    expect(canChangeInterviewStatus('accepted')).toBe(true);
    expect(canChangeInterviewStatus('pending')).toBe(false);
    expect(canChangeFinalStatus('passed')).toBe(true);
    expect(canChangeFinalStatus('failed')).toBe(false);
  });
});
