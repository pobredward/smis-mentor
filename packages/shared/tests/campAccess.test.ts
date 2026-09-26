import { describe, expect, it } from './_expect';
import {
  hasCampAccess,
  isCampStaffRole,
  isMaskedSsn,
  isSubManagerIn,
  maskSsnForStaff,
  myCampGroup,
  resolveActiveJobCodeId,
  sameCampGroup,
} from '../src/utils/campAccess';

const mentor = {
  role: 'mentor',
  activeJobExperienceId: 'jc2',
  jobExperiences: [
    { id: 'jc1', group: 'summer', groupRole: '담임' },
    { id: 'jc2', group: '주니어', groupRole: '부매니저' },
  ],
};

describe('campAccess', () => {
  it('캠프 스태프 role', () => {
    expect(isCampStaffRole('admin')).toBe(true);
    expect(isCampStaffRole('foreign')).toBe(true);
    expect(isCampStaffRole('user')).toBe(false);
    expect(isCampStaffRole(undefined)).toBe(false);
  });

  it('활성 캠프: 관리자 임시 캠프 → 활성 → 첫 배정', () => {
    expect(resolveActiveJobCodeId(mentor)).toBe('jc2');
    expect(resolveActiveJobCodeId({ ...mentor, activeJobExperienceId: undefined })).toBe('jc1');
    expect(resolveActiveJobCodeId({ role: 'admin', adminTempActiveCamp: 'tmp', activeJobExperienceId: 'jc2' })).toBe('tmp');
    // 관리자가 아니면 임시 캠프는 무시
    expect(resolveActiveJobCodeId({ role: 'mentor', adminTempActiveCamp: 'tmp' })).toBeUndefined();
    expect(resolveActiveJobCodeId(null)).toBeUndefined();
  });

  it('캠프 탭 진입', () => {
    expect(hasCampAccess(mentor)).toBe(true);
    expect(hasCampAccess({ role: 'user', activeJobExperienceId: 'jc1' })).toBe(false);
    expect(hasCampAccess({ role: 'mentor' })).toBe(false);
    expect(hasCampAccess({ role: 'admin', adminTempActiveCamp: 'x' })).toBe(true);
  });

  it('그룹·부매니저 판정 (레거시 영문 그룹 포함)', () => {
    expect(myCampGroup(mentor, 'jc1')).toBe('서머');
    expect(myCampGroup(mentor, 'jc2')).toBe('주니어');
    expect(isSubManagerIn(mentor, 'jc2')).toBe(true);
    expect(isSubManagerIn(mentor, 'jc1')).toBe(false);
    expect(isSubManagerIn({ jobExperiences: [{ id: 'a', groupRole: 'Sub Manager' }] }, 'a')).toBe(true);
    expect(sameCampGroup('Summer', '서머')).toBe(true);
    expect(sameCampGroup(' junior ', '주니어')).toBe(true);
    expect(sameCampGroup('주니어', '미들')).toBe(false);
    expect(sameCampGroup(undefined, undefined)).toBe(false);
  });

  it('스태프용 주민번호 가림 — 성별 자리까지만', () => {
    expect(maskSsnForStaff('010203-3456789')).toBe('010203-3******');
    expect(maskSsnForStaff('0102033456789')).toBe('010203-3******');
    expect(maskSsnForStaff('010203-')).toBe('010203-*******');
    expect(maskSsnForStaff('')).toBe('');
    expect(maskSsnForStaff(null)).toBe('');
    expect(isMaskedSsn(maskSsnForStaff('010203-3456789'))).toBe(true);
    expect(isMaskedSsn('010203-3456789')).toBe(false);
  });
});
