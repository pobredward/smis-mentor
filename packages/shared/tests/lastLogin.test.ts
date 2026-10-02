import { describe, expect, it } from './_expect';
import { lastLoginMethodOfProvider, maskEmailHint, parseLastLogin, serializeLastLogin } from '../src/utils/lastLogin';

describe('최근 로그인 기록', () => {
  it('providerId → 로그인 방법', () => {
    expect(lastLoginMethodOfProvider('google.com')).toBe('google');
    expect(lastLoginMethodOfProvider('apple.com')).toBe('apple');
    expect(lastLoginMethodOfProvider('naver')).toBe('naver');
    expect(lastLoginMethodOfProvider('password')).toBe('password');
    expect(lastLoginMethodOfProvider('facebook.com')).toBe(null);
    expect(lastLoginMethodOfProvider(undefined)).toBe(null);
  });
  it('이메일 가리기', () => {
    expect(maskEmailHint('abcdef@gmail.com')).toBe('ab***@gmail.com');
    expect(maskEmailHint('ab@naver.com')).toBe('a***@naver.com');
    expect(maskEmailHint(' x@y.kr ')).toBe('x***@y.kr');
    expect(maskEmailHint('not-an-email')).toBe(undefined);
    expect(maskEmailHint('@gmail.com')).toBe(undefined);
    expect(maskEmailHint(null)).toBe(undefined);
  });
  it('저장 → 복원 (원래 이메일은 남기지 않는다)', () => {
    const raw = serializeLastLogin('google', 'hong.gildong@gmail.com', 1000);
    expect(raw.includes('hong.gildong')).toBe(false);
    expect(parseLastLogin(raw)).toEqual({ method: 'google', maskedEmail: 'ho***@gmail.com', at: 1000 });
    expect(parseLastLogin(serializeLastLogin('password', undefined, 5))).toEqual({ method: 'password', at: 5 });
  });
  it('깨진 값은 무시', () => {
    expect(parseLastLogin(null)).toBe(null);
    expect(parseLastLogin('{oops')).toBe(null);
    expect(parseLastLogin('{"method":"facebook"}')).toBe(null);
    expect(parseLastLogin('{"method":"naver","maskedEmail":"full@email.com"}')).toEqual({ method: 'naver' });
  });
});
