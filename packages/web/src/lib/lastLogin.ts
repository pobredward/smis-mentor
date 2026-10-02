import {
  LAST_LOGIN_STORAGE_KEY,
  serializeLastLogin,
  parseLastLogin,
  lastLoginMethodOfProvider,
  type LastLoginInfo,
} from '@smis-mentor/shared';

/**
 * 최근 로그인 방법 기록 (이 브라우저) — 로그인 화면의 '최근 로그인' 표시용.
 * 방법과 가린 이메일(ab***@gmail.com)만 남기고, 로그아웃해도 지우지 않는다.
 * localStorage 가 막힌 환경(시크릿 창 등)에서는 조용히 넘어간다.
 */
export function rememberLastLogin(
  /** 'password' 또는 소셜 providerId ('google.com', 'apple.com', 'naver' …) */
  methodOrProviderId: string | null | undefined,
  email?: string | null
): void {
  const method = lastLoginMethodOfProvider(methodOrProviderId);
  if (!method) return;
  try {
    window.localStorage.setItem(LAST_LOGIN_STORAGE_KEY, serializeLastLogin(method, email));
  } catch {
    // 저장 실패는 무시 (표시용)
  }
}

/** 이 브라우저에서 마지막으로 성공한 로그인 방법 (없으면 null) */
export function readLastLogin(): LastLoginInfo | null {
  try {
    return parseLastLogin(window.localStorage.getItem(LAST_LOGIN_STORAGE_KEY));
  } catch {
    return null;
  }
}
