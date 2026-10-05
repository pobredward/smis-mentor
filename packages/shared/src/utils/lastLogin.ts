/**
 * 최근 로그인 방법 — 로그인 화면에 '최근 로그인' 표시를 띄우기 위한 기록 (web·mobile 공용)
 *
 * - 로그인 성공 시 방법(이메일·Google·네이버·Apple…)과 가린 이메일(ab***@gmail.com)만 기기에 남긴다.
 *   비밀번호·토큰은 절대 넣지 않는다.
 * - 로그아웃해도 지우지 않는다 — 로그인이 풀린 뒤 "어떤 방법으로 들어왔더라?"를 알려주는 게 목적.
 * - 저장소(AsyncStorage·localStorage)는 각 앱이 다룬다. 여기는 키·직렬화·검증만.
 */

export type LastLoginMethod = 'password' | 'google' | 'naver' | 'apple' | 'kakao' | 'phone';

export interface LastLoginInfo {
  method: LastLoginMethod;
  /** 가린 이메일 (ab***@gmail.com) — 없을 수 있음 */
  maskedEmail?: string;
  /** 기록 시각 (ms) */
  at?: number;
}

/** 기기 저장소 키 (mobile AsyncStorage · web localStorage 공용) */
export const LAST_LOGIN_STORAGE_KEY = '@smis_last_login';

const METHODS: ReadonlyArray<LastLoginMethod> = ['password', 'google', 'naver', 'apple', 'kakao', 'phone'];
const isMethod = (v: unknown): v is LastLoginMethod => typeof v === 'string' && (METHODS as string[]).includes(v);

/** 소셜 providerId('google.com', 'apple.com', 'naver', 'kakao', 'password') → 로그인 방법. 모르는 값이면 null */
export function lastLoginMethodOfProvider(providerId?: string | null): LastLoginMethod | null {
  const normalized = (providerId || '').replace('.com', '');
  return isMethod(normalized) ? normalized : null;
}

/** 로그인 화면 힌트용으로 이메일을 가린다 — 'abcdef@gmail.com' → 'ab***@gmail.com' (앞 1~2자만 남김) */
export function maskEmailHint(email?: string | null): string | undefined {
  const e = (email || '').trim();
  const at = e.lastIndexOf('@');
  if (at < 1 || at === e.length - 1) return undefined;
  const local = e.slice(0, at);
  const keep = local.length <= 2 ? 1 : 2;
  return `${local.slice(0, keep)}***@${e.slice(at + 1)}`;
}

/** 저장할 문자열 (가린 이메일만 담는다) */
export function serializeLastLogin(method: LastLoginMethod, email?: string | null, now: number = Date.now()): string {
  const info: LastLoginInfo = { method, at: now };
  const masked = maskEmailHint(email);
  if (masked) info.maskedEmail = masked;
  return JSON.stringify(info);
}

/** 저장된 문자열 → 기록. 깨졌거나 모르는 방법이면 null */
export function parseLastLogin(raw?: string | null): LastLoginInfo | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown> | null;
    if (!v || typeof v !== 'object' || !isMethod(v.method)) return null;
    const info: LastLoginInfo = { method: v.method };
    if (typeof v.maskedEmail === 'string' && v.maskedEmail.includes('***@')) info.maskedEmail = v.maskedEmail;
    if (typeof v.at === 'number' && Number.isFinite(v.at)) info.at = v.at;
    return info;
  } catch {
    return null;
  }
}
