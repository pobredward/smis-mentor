// 상수 정의
// 추후 구현 예정

export const SPREADSHEET_ID = '1hHO1Lm3ezpzo6JILHRzdC2j1OhkTpRxhNzKew3tcJp8';
export const SHEET_NAME = 'ST';
export const CACHE_TTL = 5 * 60 * 1000; // 5분

/**
 * 약관·개인정보 동의 버전 — 문서 내용을 바꾸면 날짜를 올리고, 가입 시 users 문서에 consentVersion·consentedAt 로 남긴다.
 * (이전에는 agreedTerms: true 만 저장해 언제·어떤 내용에 동의했는지 알 수 없었음)
 */
export const CONSENT_VERSION = '2026-09-26';
export const TERMS_URL = 'https://smis-mentor.com/terms-of-service';
export const PRIVACY_POLICY_URL = 'https://smis-mentor.com/privacy-policy';
