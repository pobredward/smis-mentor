/**
 * 로그인·가입 플로우용 서버 API 클라이언트 (web / mobile 공용)
 *
 *  - lookupUserViaApi   : /api/auth/lookup  — 비로그인 상태의 이메일/전화/원어민 이름/소셜 제공자 조회
 *                         (Firestore 규칙에서 users 의 비인증 list 가 막혔으므로 서버가 대신 조회)
 *  - requestCustomToken : /api/auth/create-custom-token — 소셜 증명(proof)으로 Custom Token 발급
 *  - resolveSocialLogin · linkSocialWithPassword : 새 소셜 로그인 흐름 (/api/auth/social*) — 서버가 사용자를 찾고 판정한다
 *
 * 서버가 Timestamp 를 { __ts: millis } 로 직렬화하므로 클라이언트 Timestamp 로 되살린다.
 */
import { Timestamp } from 'firebase/firestore';
import type { User } from '../types/legacy';

export type UserLookupParams =
  | { by: 'email'; email: string; includeInactive?: boolean }
  | { by: 'phone'; phone: string; includeDeleted?: boolean }
  | { by: 'foreignName'; firstName: string; lastName: string }
  | { by: 'social'; providerId: string; providerUid: string }
  | { by: 'id'; id: string };

/** 소셜 신원 증명 — 서버(create-custom-token)가 제공자/Firebase 에 재검증한다 */
export type SocialProof =
  | { kind: 'naver'; accessToken: string }
  | { kind: 'kakao'; accessToken: string }
  | { kind: 'firebase'; idToken: string };

export interface CustomTokenRequest {
  mode?: 'login' | 'signup';
  userId?: string;
  proof: SocialProof;
  /** 팝업 로그인으로 생긴 임시 Auth 계정 정리 (그 계정의 ID token 으로 소유 증명) */
  deleteAuthUid?: { uid: string; idToken: string };
}

export interface CustomTokenResponse {
  customToken: string;
  uid: string;
  matchedBy?: string;
}

export class AuthApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'AuthApiError';
  }
}

export function reviveTimestamps<T>(value: T): T {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  const anyV = value as any;
  if (typeof anyV.__ts === 'number' && Object.keys(anyV).length === 1) {
    return Timestamp.fromMillis(anyV.__ts) as unknown as T;
  }
  if (Array.isArray(value)) return value.map(reviveTimestamps) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(anyV)) out[k] = reviveTimestamps(v);
  return out as T;
}

/** Firestore 권한 오류 판별 (규칙에 막힌 조회 → 서버 API 로 폴백할 때 사용) */
export function isPermissionDenied(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === 'permission-denied' || /insufficient permissions/i.test(e.message || ''));
}

async function readError(res: Response, fallback: string): Promise<AuthApiError> {
  const json = (await res.json().catch(() => null)) as { error?: { status?: string; message?: string } } | null;
  return new AuthApiError(res.status, json?.error?.status || 'UNKNOWN', json?.error?.message || fallback);
}

export async function lookupUserViaApi(apiBaseUrl: string, params: UserLookupParams): Promise<User | null> {
  const res = await fetch(`${apiBaseUrl}/api/auth/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw await readError(res, `사용자 조회 실패 (${res.status})`);
  const json = (await res.json()) as { user?: Record<string, unknown> | null };
  return json?.user ? (reviveTimestamps(json.user) as unknown as User) : null;
}

export async function requestCustomToken(apiBaseUrl: string, body: CustomTokenRequest): Promise<CustomTokenResponse> {
  const res = await fetch(`${apiBaseUrl}/api/auth/create-custom-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await readError(res, 'Custom Token 생성 실패');
  const json = (await res.json()) as { result: CustomTokenResponse };
  return json.result;
}

/** temp 문서 정리 (가입 이관 완료 후, 새 계정의 ID token 필요) */
export async function replaceTempUserViaApi(apiBaseUrl: string, idToken: string, tempUserId: string): Promise<boolean> {
  const res = await fetch(`${apiBaseUrl}/api/auth/replace-temp-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ tempUserId }),
  });
  if (!res.ok) throw await readError(res, '임시 계정 정리 실패');
  const json = (await res.json()) as { deleted?: boolean };
  return !!json?.deleted;
}

// ── 새 소셜 로그인 흐름 (서버가 판정) ─────────────────────────────────

/**
 * POST /api/auth/social 결과 (web lib/socialLoginServer.ts 와 같은 모양)
 *  - LOGIN       : customToken 으로 로그인 (alreadySignedIn 이면 지금 세션이 그 사용자)
 *  - LINK_ACTIVE : 같은 이메일의 기존 계정 — hasPassword 면 비밀번호로 연결(linkSocialWithPassword), 아니면 기존 방법으로 로그인 안내
 *  - NEED_PHONE  : 처음 보는 사람 — 기존 가입 · temp 계정 흐름
 */
export type SocialResolveResult =
  | { action: 'LOGIN'; userId: string; customToken?: string; alreadySignedIn?: boolean }
  | { action: 'LINK_ACTIVE'; linkTicket: string; maskedEmail: string; hasPassword: boolean; providers: string[] }
  | { action: 'NEED_PHONE' };

export async function resolveSocialLogin(apiBaseUrl: string, proof: SocialProof): Promise<SocialResolveResult> {
  const res = await fetch(`${apiBaseUrl}/api/auth/social`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proof }),
  });
  if (!res.ok) throw await readError(res, '로그인 처리 중 오류가 발생했습니다.');
  const json = (await res.json()) as { result: SocialResolveResult };
  return json.result;
}

export async function linkSocialWithPassword(apiBaseUrl: string, linkTicket: string, password: string): Promise<{ userId: string; customToken: string }> {
  const res = await fetch(`${apiBaseUrl}/api/auth/social/link-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ linkTicket, password }),
  });
  if (!res.ok) throw await readError(res, '계정 연결 중 오류가 발생했습니다.');
  const json = (await res.json()) as { result: { userId: string; customToken: string } };
  return json.result;
}

/** 'google' · 'google.com' · 'naver' … → 화면에 보이는 이름 */
export function socialProviderLabel(p: string): string {
  const n = String(p || '').replace('.com', '').toLowerCase();
  return n === 'google' ? 'Google' : n === 'apple' ? 'Apple' : n === 'naver' ? '네이버' : n === 'kakao' ? '카카오' : n === 'password' ? '이메일' : p;
}
