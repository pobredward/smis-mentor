/**
 * 소셜 로그인 "증명(proof)" 서버 검증 (Admin SDK 전용 — 클라이언트에서 import 금지)
 *
 * Custom Token 발급 전에 호출자가 실제로 해당 소셜 계정(또는 Firebase 세션)의 주인인지 확인한다.
 *  - naver / kakao : 제공자 access token → 제공자 프로필 API로 검증
 *  - firebase      : Firebase ID token → Admin SDK verifyIdToken (구글/애플 팝업 세션, 또는 복원 대상 원래 세션)
 */
import { getAdminAuth } from '@/lib/firebase-admin';
import { logger } from '@smis-mentor/shared';

export type SocialProof =
  | { kind: 'naver'; accessToken: string }
  | { kind: 'kakao'; accessToken: string }
  | { kind: 'firebase'; idToken: string };

export interface VerifiedIdentity {
  /** 'naver' | 'kakao' | 'google.com' | 'apple.com' | 'password' | 'custom' ... */
  provider: string;
  providerUid?: string;
  /** 소문자 정규화 */
  email?: string;
  emailVerified: boolean;
  /** firebase proof 인 경우 토큰의 uid */
  firebaseUid?: string;
  name?: string;
}

export class ProofError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = 'ProofError';
  }
}

export function normalizeProviderId(id: unknown): string {
  return typeof id === 'string' ? id.replace('.com', '').toLowerCase() : '';
}

function lower(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v.toLowerCase() : undefined;
}

export function parseProof(raw: unknown): SocialProof {
  if (!raw || typeof raw !== 'object') {
    throw new ProofError(400, 'PROOF_REQUIRED', '소셜 인증 정보(proof)가 필요합니다.');
  }
  const p = raw as Record<string, unknown>;
  if ((p.kind === 'naver' || p.kind === 'kakao') && typeof p.accessToken === 'string' && p.accessToken) {
    return { kind: p.kind, accessToken: p.accessToken };
  }
  if (p.kind === 'firebase' && typeof p.idToken === 'string' && p.idToken) {
    return { kind: 'firebase', idToken: p.idToken };
  }
  throw new ProofError(400, 'INVALID_PROOF', '소셜 인증 정보 형식이 올바르지 않습니다.');
}

export async function verifySocialProof(proof: SocialProof): Promise<VerifiedIdentity> {
  switch (proof.kind) {
    case 'naver': {
      const res = await fetch('https://openapi.naver.com/v1/nid/me', {
        headers: { Authorization: `Bearer ${proof.accessToken}` },
        cache: 'no-store',
      });
      const json = await res.json().catch(() => null);
      const r = json?.response;
      if (!res.ok || json?.resultcode !== '00' || !r?.id) {
        logger.warn('네이버 proof 검증 실패:', { status: res.status, resultcode: json?.resultcode });
        throw new ProofError(401, 'INVALID_PROOF', '네이버 인증이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요.');
      }
      return {
        provider: 'naver',
        providerUid: String(r.id),
        email: lower(r.email),
        emailVerified: !!r.email,
        name: r.name || r.nickname,
      };
    }
    case 'kakao': {
      const res = await fetch('https://kapi.kakao.com/v2/user/me', {
        headers: { Authorization: `Bearer ${proof.accessToken}` },
        cache: 'no-store',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.id) {
        logger.warn('카카오 proof 검증 실패:', { status: res.status });
        throw new ProofError(401, 'INVALID_PROOF', '카카오 인증이 만료되었거나 유효하지 않습니다. 다시 로그인해주세요.');
      }
      const acct = json.kakao_account || {};
      return {
        provider: 'kakao',
        providerUid: String(json.id),
        email: lower(acct.email),
        emailVerified: !!acct.email && acct.is_email_verified !== false,
        name: acct.profile?.nickname,
      };
    }
    case 'firebase': {
      let decoded;
      try {
        decoded = await getAdminAuth().verifyIdToken(proof.idToken, true);
      } catch (e) {
        logger.warn('Firebase ID 토큰 검증 실패:', (e as Error)?.message);
        throw new ProofError(401, 'INVALID_PROOF', '인증 세션이 만료되었습니다. 다시 로그인해주세요.');
      }
      const signInProvider = decoded.firebase?.sign_in_provider || 'custom';
      const identities = (decoded.firebase?.identities || {}) as Record<string, string[]>;
      const providerUid = identities[signInProvider]?.[0];
      return {
        provider: signInProvider,
        providerUid: providerUid ? String(providerUid) : undefined,
        email: lower(decoded.email),
        emailVerified: !!decoded.email_verified,
        firebaseUid: decoded.uid,
        name: typeof decoded.name === 'string' ? decoded.name : undefined,
      };
    }
  }
}

/**
 * 검증된 신원이 users/{userId} 문서의 주인인지 판정
 *  - self     : 토큰의 uid == userId (자기 세션 복원)
 *  - provider : authProviders 에 같은 제공자 + 같은 제공자 uid
 *  - email    : 제공자가 검증한 이메일 == 문서 이메일 (또는 해당 제공자 연동 이메일)
 */
export function identityAuthorizesUser(
  identity: VerifiedIdentity,
  userId: string,
  userData: Record<string, unknown>
): 'self' | 'provider' | 'email' | null {
  if (identity.firebaseUid && identity.firebaseUid === userId) return 'self';

  const providers = Array.isArray(userData.authProviders)
    ? (userData.authProviders as Array<Record<string, unknown>>)
    : [];
  const idProvider = normalizeProviderId(identity.provider);

  if (identity.providerUid) {
    const hit = providers.some(
      (p) => normalizeProviderId(p.providerId) === idProvider && String(p.uid ?? '') === identity.providerUid
    );
    if (hit) return 'provider';
  }

  if (identity.email && identity.emailVerified) {
    const docEmail = lower(userData.email);
    if (docEmail && docEmail === identity.email) return 'email';
    const linkedEmailHit = providers.some(
      (p) => normalizeProviderId(p.providerId) === idProvider && lower(p.email) === identity.email
    );
    if (linkedEmailHit) return 'email';
  }
  return null;
}

/** Firebase Auth 사용자가 없으면 생성 (uid = Firestore 문서 id) */
export async function ensureAuthUser(uid: string, email?: string, displayName?: string) {
  const adminAuth = getAdminAuth();
  try {
    return await adminAuth.getUser(uid);
  } catch (e: any) {
    if (e?.code !== 'auth/user-not-found') throw e;
  }
  try {
    return await adminAuth.createUser({
      uid,
      ...(email && { email, emailVerified: true }),
      ...(displayName && { displayName }),
    });
  } catch (e: any) {
    if (e?.code === 'auth/email-already-exists') {
      logger.warn('Auth 생성: 이메일이 다른 Auth 사용자에 이미 존재 → 이메일 없이 생성', { uid });
      return await adminAuth.createUser({ uid, ...(displayName && { displayName }) });
    }
    throw e;
  }
}
