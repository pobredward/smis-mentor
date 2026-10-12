import { describe, expect, it } from './_expect';
import { canChangeFinalStatus, canChangeInterviewStatus, recruitStatusBadge, canCancelApplication } from '../src/utils/applicationStatus';

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
    // 보류는 지원자에게도 보류로
    expect(recruitStatusBadge('application', 'hold')).toEqual({ label: '서류보류', tone: 'wait' });
    expect(recruitStatusBadge('interview', 'hold')).toEqual({ label: '면접보류', tone: 'wait' });
    expect(recruitStatusBadge('final', 'finalHold')).toEqual({ label: '최종보류', tone: 'wait' });
  });

  it('지원 취소는 서류 검토중 · 보류일 때만', () => {
    expect(canCancelApplication('pending')).toBe(true);
    expect(canCancelApplication('hold')).toBe(true);
    expect(canCancelApplication('accepted')).toBe(false);
    expect(canCancelApplication('rejected')).toBe(false);
    expect(canCancelApplication(undefined)).toBe(false);
  });

  it('상태 전이 조건', () => {
    expect(canChangeInterviewStatus('accepted')).toBe(true);
    expect(canChangeInterviewStatus('pending')).toBe(false);
    expect(canChangeFinalStatus('passed')).toBe(true);
    expect(canChangeFinalStatus('failed')).toBe(false);
  });
});
