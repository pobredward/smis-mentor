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
/** 서비스 이름 · 주소 · 앱 식별자 — 한곳에서만 정한다 */
export const APP_NAME = 'SMIS CAMP';
export const SITE_URL = 'https://smiscamp.com';
export const APP_SCHEME = 'smiscamp';
export const APP_BUNDLE_ID = 'com.smis.smiscamp';
/** App Store 앱 번호 — App Store Connect 에 새 앱을 만들면 채운다 (비어 있으면 검색 화면으로) */
export const IOS_APP_STORE_ID = '';
export const IOS_STORE_URL = IOS_APP_STORE_ID
  ? `https://apps.apple.com/kr/app/id${IOS_APP_STORE_ID}`
  : 'https://apps.apple.com/kr/search?term=SMIS%20CAMP';
export const ANDROID_STORE_URL = `https://play.google.com/store/apps/details?id=${APP_BUNDLE_ID}`;

export const TERMS_URL = `${SITE_URL}/terms-of-service`;
export const PRIVACY_POLICY_URL = `${SITE_URL}/privacy-policy`;
