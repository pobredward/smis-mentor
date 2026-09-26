import { describe, expect, it } from './_expect';
import {
  campProfileTierOf,
  hasDomesticCamp,
  maskAccountNumber,
  missingCampProfileFields,
  normalizeCampProfileInput,
  requiredCampProfileFields,
  rrnPurposeLines,
  validateCampProfileInput,
} from '../src/utils/campProfile';

describe('campProfile', () => {
  it('캠프 코드 → tier (S 우선)', () => {
    expect(campProfileTierOf(['J29'])).toBe('JE');
    expect(campProfileTierOf(['e29'])).toBe('JE');
    expect(campProfileTierOf(['J29', 'S29'])).toBe('S');
    expect(campProfileTierOf([null, ''])).toBeNull();
    expect(hasDomesticCamp(['S29', 'E29'])).toBe(true);
    expect(hasDomesticCamp(['S29'])).toBe(false);
  });

  it('필수 항목 — 멘토', () => {
    expect(requiredCampProfileFields('JE')).toEqual(['englishNickname', 'bankAccount']);
    expect(requiredCampProfileFields('S')).toContain('passportNumber');
    expect(requiredCampProfileFields(null)).toEqual([]);
  });

  it('필수 항목 — 원어민: 닉네임 제외, 국내(J·E) 캠프면 비자', () => {
    expect(requiredCampProfileFields('JE', 'foreign')).toEqual(['bankAccount', 'visaType']);
    expect(requiredCampProfileFields('S', 'foreign', ['S29'])).not.toContain('visaType');
    expect(requiredCampProfileFields('S', 'foreign', ['S29', 'J29'])).toContain('visaType');
    expect(requiredCampProfileFields('JE', 'foreign')).not.toContain('nationality');
  });

  it('빠진 항목', () => {
    expect(missingCampProfileFields('JE', { englishNickname: 'David' }, false)).toEqual(['bankAccount']);
    expect(
      missingCampProfileFields('JE', { englishNickname: 'David', bankName: '국민', accountHolder: '홍길동', accountNumberEncrypted: 'x' }, false),
    ).toEqual([]);
  });

  it('주민번호 사용 목적 안내 (S·J/E 둘 다)', () => {
    const lines = rrnPurposeLines(['S29', 'j29']);
    expect(lines.map((l) => l.tier)).toEqual(['JE', 'S']);
    expect(lines[0].codes).toEqual(['J29']);
    expect(lines[0].text).toContain('3.3%');
  });

  it('입력 정리 + 검증', () => {
    const n = normalizeCampProfileInput({ passportName: ' hong  gildong ', passportExpiry: '2027-01-01', accountNumber: '123-456-7890', bankName: ' 국민 ', accountHolder: '홍길동', shirtSize: 'xl' });
    expect(n.passportName).toBe('HONG GILDONG');
    expect(n.passportExpiry).toBe('2027.01.01');
    expect(n.accountNumber).toBe('1234567890');
    expect(n.shirtSize).toBe('XL');
    expect(validateCampProfileInput(n)).toEqual({});

    const e = validateCampProfileInput({ englishNickname: 'david', rrnLast: '9123456', passportNumber: 'M00000000', passportExpiry: '0000.00.00' });
    expect(Object.keys(e).sort()).toEqual(['englishNickname', 'rrnLast']);
    expect(validateCampProfileInput({ bankName: '국민', accountHolder: '홍', accountNumber: '123' }).bankAccount).toBeTruthy();
  });

  it('계좌번호 가림', () => {
    expect(maskAccountNumber('123-456-7890')).toBe('123****890');
    expect(maskAccountNumber('12345')).toBe('*****');
  });
});
