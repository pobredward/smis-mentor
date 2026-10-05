/**
 * 전화번호 로그인 · 인증 (web · mobile · 서버 공용)
 *
 * 문자 인증은 Firebase 전화 인증이 하고, 사용자를 찾고 로그인 토큰을 주는 건 서버(/api/auth/phone)가 한다.
 * 번호는 E.164(+821012345678)로 다룬다. 저장된 번호는 '01012345678' · '010-1234-5678' · '+821012345678' · '+27…' 처럼 섞여 있다.
 */

export interface PhoneCountry {
  /** '+82' */
  code: string;
  ko: string;
  en: string;
}

/** 화면의 나라 고르기 — 문자를 보낼 수 있는 나라는 Firebase 콘솔의 'SMS 지역 정책' 허용 목록과 맞춘다 */
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: '+82', ko: '한국', en: 'Korea' },
  { code: '+1', ko: '미국·캐나다', en: 'US / Canada' },
  { code: '+27', ko: '남아공', en: 'South Africa' },
  { code: '+61', ko: '호주', en: 'Australia' },
  { code: '+44', ko: '영국', en: 'UK' },
  { code: '+64', ko: '뉴질랜드', en: 'New Zealand' },
  { code: '+353', ko: '아일랜드', en: 'Ireland' },
  { code: '+65', ko: '싱가포르', en: 'Singapore' },
  { code: '+60', ko: '말레이시아', en: 'Malaysia' },
  { code: '+63', ko: '필리핀', en: 'Philippines' },
];

/**
 * 입력 · 저장된 번호 → E.164. 알 수 없으면 null.
 *  - '+…'            : 그대로 (+82 뒤의 0 은 뺀다: +8201012345678 → +821012345678)
 *  - '0…' (한국 국내) : +82 를 붙이고 0 을 뺀다
 *  - '82…' (11자리 이상): +82…
 *  - 그 밖 숫자        : defaultCountry 가 있으면 그 국가번호를 붙인다 (국내 형식 0 은 뺀다)
 */
export function toE164(raw: unknown, defaultCountry: string | null = '+82'): string | null {
  const s = String(raw ?? '').trim();
  let d = s.replace(/\D/g, '');
  if (!d) return null;
  let out: string;
  if (s.startsWith('+')) {
    if (d.startsWith('820')) d = '82' + d.slice(3);
    out = '+' + d;
  } else if (d.startsWith('00')) {
    out = '+' + d.slice(2); // 국제전화 접두 00
  } else if (d.startsWith('0')) {
    const cc = (defaultCountry ?? '+82').replace(/\D/g, '');
    out = '+' + cc + d.slice(1);
  } else if (d.startsWith('82') && d.length >= 11) {
    out = '+' + d;
  } else if (defaultCountry) {
    out = '+' + defaultCountry.replace(/\D/g, '') + d;
  } else {
    return null;
  }
  // E.164: + 다음 8~15자리
  return /^\+[1-9]\d{7,14}$/.test(out) ? out : null;
}

/** 한국 번호는 저장 형식(01012345678)으로, 그 밖은 E.164 그대로 */
export function e164ToStored(e164: string): string {
  return e164.startsWith('+82') ? '0' + e164.slice(3) : e164;
}

/** 화면 표시용 — +821012345678 → 010-1234-5678, 해외는 '+27 82 123 4567' 같은 공백 없이 그대로 */
export function formatE164ForDisplay(e164: string): string {
  if (e164.startsWith('+82')) {
    const l = '0' + e164.slice(3);
    if (l.length === 11) return `${l.slice(0, 3)}-${l.slice(3, 7)}-${l.slice(7)}`;
    if (l.length === 10) return `${l.slice(0, 3)}-${l.slice(3, 6)}-${l.slice(6)}`;
    return l;
  }
  return e164;
}

/** 가린 번호 — 010-****-5678 */
export function maskE164(e164: string): string {
  const shown = formatE164ForDisplay(e164);
  const digits = shown.replace(/\D/g, '');
  if (digits.length < 7) return shown;
  let seen = 0;
  const total = digits.length;
  return shown.replace(/\d/g, (c) => {
    seen += 1;
    return seen > 3 && seen <= total - 4 ? '*' : c;
  });
}

/** 같은 번호인가 (형식이 달라도) */
export function samePhone(a: unknown, b: unknown): boolean {
  const x = toE164(a);
  return !!x && x === toE164(b);
}

/** Firestore 조회 후보 — E.164 하나에서 저장돼 있을 법한 형식들 (in 쿼리 최대 10개) */
export function storedPhoneVariants(e164: string): string[] {
  const out = new Set<string>([e164]);
  if (e164.startsWith('+82')) {
    const l = '0' + e164.slice(3);
    out.add(l);
    out.add(e164.slice(1));
    if (l.length === 11) out.add(`${l.slice(0, 3)}-${l.slice(3, 7)}-${l.slice(7)}`);
    if (l.length === 10) out.add(`${l.slice(0, 3)}-${l.slice(3, 6)}-${l.slice(6)}`);
    out.add(`+820${e164.slice(3)}`);
  } else {
    out.add(e164.slice(1));
  }
  return [...out].slice(0, 10);
}

/** 인증번호 다시 보내기까지 기다리는 시간 */
export const PHONE_RESEND_SECONDS = 60;

/**
 * 오류 코드 → 안내 문구 (Firebase 전화 인증 · /api/auth/phone 공통)
 * lang: 'ko' | 'en'
 */
export function phoneAuthErrorMessage(code: unknown, lang: 'ko' | 'en' = 'ko', fallback?: string): string {
  const c = String(code ?? '').replace(/^auth\//, '');
  const ko: Record<string, string> = {
    'invalid-phone-number': '전화번호 형식을 확인해주세요.',
    'missing-phone-number': '전화번호를 입력해주세요.',
    'too-many-requests': '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    'quota-exceeded': '지금은 문자를 보낼 수 없습니다. 잠시 후 다시 시도해주세요.',
    'invalid-verification-code': '인증번호가 맞지 않습니다.',
    'missing-verification-code': '인증번호를 입력해주세요.',
    'code-expired': '인증번호가 만료되었습니다. 다시 받아주세요.',
    'session-expired': '인증 시간이 지났습니다. 인증번호를 다시 받아주세요.',
    'captcha-check-failed': '보안 확인에 실패했습니다. 다시 시도해주세요.',
    'operation-not-allowed': '전화번호 로그인이 아직 열리지 않았습니다. 관리자에게 문의해주세요.',
    'admin-restricted-operation': '전화번호 로그인이 아직 열리지 않았습니다. 관리자에게 문의해주세요.',
    'unsupported-first-factor': '전화번호 로그인을 쓸 수 없습니다.',
    'network-request-failed': '네트워크 연결을 확인해주세요.',
    'app-not-authorized': '이 앱에서는 전화번호 인증을 쓸 수 없습니다. 최신 버전으로 업데이트해주세요.',
    'missing-client-identifier': '보안 확인에 실패했습니다. 다시 시도해주세요.',
    'web-context-cancelled': '보안 확인이 취소되었습니다.',
    PHONE_SHARED: '이 번호를 쓰는 계정이 여러 개라 전화번호로 로그인할 수 없습니다. 다른 방법으로 로그인하거나 관리자에게 문의해주세요.',
    PHONE_LOGIN_NOT_ALLOWED: '관리자 계정은 전화번호로 로그인할 수 없습니다. 다른 방법으로 로그인해주세요.',
    ACCOUNT_INACTIVE: '탈퇴한 계정입니다.',
    ACCOUNT_DELETED: '삭제된 계정입니다.',
    NOT_PHONE: '전화번호 인증 정보가 아닙니다. 다시 시도해주세요.',
    INVALID_PROOF: '인증 세션이 만료되었습니다. 다시 시도해주세요.',
  };
  const en: Record<string, string> = {
    'invalid-phone-number': 'Please check the phone number.',
    'missing-phone-number': 'Please enter your phone number.',
    'too-many-requests': 'Too many attempts. Please try again later.',
    'quota-exceeded': 'We cannot send a text right now. Please try again later.',
    'invalid-verification-code': 'The code is not correct.',
    'missing-verification-code': 'Please enter the code.',
    'code-expired': 'The code has expired. Please request a new one.',
    'session-expired': 'Verification timed out. Please request a new code.',
    'captcha-check-failed': 'Security check failed. Please try again.',
    'operation-not-allowed': 'Phone sign-in is not available yet. Please contact the administrator.',
    'admin-restricted-operation': 'Phone sign-in is not available yet. Please contact the administrator.',
    'unsupported-first-factor': 'Phone sign-in is not available.',
    'network-request-failed': 'Please check your network connection.',
    'app-not-authorized': 'Phone verification is not available in this app. Please update to the latest version.',
    'missing-client-identifier': 'Security check failed. Please try again.',
    'web-context-cancelled': 'The security check was cancelled.',
    PHONE_SHARED: 'Several accounts use this number, so it cannot be used to sign in. Please use another method or contact the administrator.',
    PHONE_LOGIN_NOT_ALLOWED: 'Admin accounts cannot sign in with a phone number. Please use another method.',
    ACCOUNT_INACTIVE: 'This account has been closed.',
    ACCOUNT_DELETED: 'This account has been deleted.',
    NOT_PHONE: 'This is not a phone verification. Please try again.',
    INVALID_PROOF: 'Your verification session expired. Please try again.',
  };
  const table = lang === 'en' ? en : ko;
  return table[c] ?? fallback ?? (lang === 'en' ? 'Phone verification failed. Please try again.' : '전화번호 인증 중 오류가 발생했습니다. 다시 시도해주세요.');
}
