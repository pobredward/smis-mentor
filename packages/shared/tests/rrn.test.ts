import { describe, expect, it } from './_expect';
import { getBirthDateFromRRN, getGenderFromRRN, getUserInfoFromRRN, maskRRNLast } from '../src/utils/rrn';

describe('주민번호 계산', () => {
  it('성별', () => {
    expect(getGenderFromRRN('990101', '1234567')).toBe('M');
    expect(getGenderFromRRN('010101', '4234567')).toBe('F');
    expect(getGenderFromRRN('0101', '4234567')).toBe('');
  });
  it('생년월일 — 뒷자리 첫 숫자로 세기', () => {
    const d = getBirthDateFromRRN('010203', '3000000');
    expect(d?.getFullYear()).toBe(2001);
    expect(getBirthDateFromRRN('991301', '1000000')).toBeNull();
  });
  it('묶음·가림', () => {
    expect(getUserInfoFromRRN('990101', '2000000').gender).toBe('F');
    expect(maskRRNLast('1234567')).toBe('1******');
    expect(maskRRNLast('12')).toBe('');
  });
});
