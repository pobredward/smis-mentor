import { describe, it, expect } from './_expect';
import { toE164, e164ToStored, formatE164ForDisplay, maskE164, samePhone, storedPhoneVariants, phoneAuthErrorMessage } from '../src/utils/phoneAuth';
import { lastLoginMethodOfProvider } from '../src/utils/lastLogin';

describe('toE164', () => {
  it('한국 국내 형식', () => {
    expect(toE164('01012345678')).toBe('+821012345678');
    expect(toE164('010-1234-5678')).toBe('+821012345678');
    expect(toE164(' 010 1234 5678 ')).toBe('+821012345678');
    expect(toE164('0101234567')).toBe('+82101234567');
  });
  it('국가번호가 있는 형식', () => {
    expect(toE164('+821012345678')).toBe('+821012345678');
    expect(toE164('+8201012345678')).toBe('+821012345678');
    expect(toE164('821012345678')).toBe('+821012345678');
    expect(toE164('+27821234567')).toBe('+27821234567');
    expect(toE164('+1 (415) 555-0123')).toBe('+14155550123');
    expect(toE164('0044 7700 900123')).toBe('+447700900123');
  });
  it('나라를 고른 입력', () => {
    expect(toE164('4155550123', '+1')).toBe('+14155550123');
    expect(toE164('07700900123', '+44')).toBe('+447700900123');
    expect(toE164('1012345678')).toBe('+821012345678');
  });
  it('알 수 없으면 null', () => {
    expect(toE164('')).toBe(null);
    expect(toE164(null)).toBe(null);
    expect(toE164('123')).toBe(null);
    expect(toE164('4155550123', null)).toBe(null);
    expect(toE164('abc')).toBe(null);
  });
});

describe('번호 표시 · 비교', () => {
  it('저장 형식', () => {
    expect(e164ToStored('+821012345678')).toBe('01012345678');
    expect(e164ToStored('+27821234567')).toBe('+27821234567');
  });
  it('화면 표시 · 가리기', () => {
    expect(formatE164ForDisplay('+821012345678')).toBe('010-1234-5678');
    expect(maskE164('+821012345678')).toBe('010-****-5678');
    expect(maskE164('+27821234567')).toBe('+278****4567');
  });
  it('형식이 달라도 같은 번호', () => {
    expect(samePhone('010-1234-5678', '+821012345678')).toBe(true);
    expect(samePhone('01012345678', '+8201012345678')).toBe(true);
    expect(samePhone('01012345678', '01012345679')).toBe(false);
    expect(samePhone('', '')).toBe(false);
  });
  it('조회 후보에 저장 형식이 모두 들어 있다', () => {
    const v = storedPhoneVariants('+821012345678');
    for (const f of ['01012345678', '010-1234-5678', '+821012345678', '821012345678', '+8201012345678']) expect(v.includes(f)).toBe(true);
    expect(v.length <= 10).toBe(true);
    expect(storedPhoneVariants('+27821234567').includes('+27821234567')).toBe(true);
  });
});

describe('오류 문구 · 최근 로그인', () => {
  it('Firebase 코드 · 서버 코드', () => {
    expect(phoneAuthErrorMessage('auth/invalid-verification-code')).toBe('인증번호가 맞지 않습니다.');
    expect(phoneAuthErrorMessage('PHONE_SHARED', 'en').startsWith('Several accounts')).toBe(true);
    expect(phoneAuthErrorMessage('UNKNOWN', 'ko', '서버 문구')).toBe('서버 문구');
  });
  it('전화번호도 최근 로그인 방법', () => {
    expect(lastLoginMethodOfProvider('phone')).toBe('phone');
  });
});
