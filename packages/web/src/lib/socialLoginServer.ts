/**
 * 소셜 로그인 판정 (서버 전용) — /api/auth/social · /api/auth/social/link-password
 *
 * 앱·웹은 제공자 증명(proof)만 보낸다. 사용자 찾기 · 판정 · 토큰 발급은 모두 서버가 한다.
 * (예전에는 클라이언트가 공개 조회 API 로 사용자를 찾고 흐름을 골랐다 — 이름·연동 이메일 등이 그대로 나갔다)
 *
 * 결과 (옛 handleSocialLogin 의 action 과 같은 이름):
 *  - LOGIN       : 이 신원이 연결된 사용자 → 커스텀 토큰 (팝업 세션이 이미 그 사용자면 alreadySignedIn)
 *  - LINK_ACTIVE : 같은 이메일의 기존 계정이 있는데 이 소셜은 연결 안 됨 → 연결 표(10분) + 가린 이메일
 *                  (비밀번호가 있으면 /link-password, 없으면 기존 방법으로 로그인 후 설정에서 연결)
 *  - NEED_PHONE  : 처음 보는 사람 → 기존 가입 · temp 계정 찾기 흐름
 */
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { ensureAuthUser, type VerifiedIdentity } from '@/lib/socialProof';
import {
  IdentityError,
  findIdentityOwner,
  hasPasswordLogin,
  identityProviderOf,
  linkIdentity,
  linkedProvidersOf,
  maskEmail,
  touchIdentity,
  type IdentityProvider,
  type IdentityRef,
} from '@/lib/authIdentity';
import { readTicket, signTicket } from '@/lib/authTicket';
import { logger } from '@smis-mentor/shared';

export type SocialResolveResult =
  | { action: 'LOGIN'; userId: string; customToken?: string; alreadySignedIn?: boolean }
  | { action: 'LINK_ACTIVE'; linkTicket: string; maskedEmail: string; hasPassword: boolean; providers: IdentityProvider[] }
  | { action: 'NEED_PHONE' };

const LINK_TTL = 10 * 60 * 1000;

/** 증명에서 연결표 신원 — 구글·애플 팝업 세션이면 그 세션의 제공자, 네이버·카카오면 그 계정 */
export function identityRefOf(identity: VerifiedIdentity): IdentityRef | null {
  const provider = identityProviderOf(identity.provider);
  if (!provider || !identity.providerUid) return null;
  return {
    provider,
    providerUid: String(identity.providerUid),
    ...(identity.email ? { email: identity.email } : {}),
    ...(identity.name ? { displayName: identity.name } : {}),
  };
}

export async function issueToken(uid: string, data: Record<string, unknown>, provider: string): Promise<string> {
  const email = typeof data.email === 'string' ? data.email.toLowerCase() : undefined;
  await ensureAuthUser(uid, email, typeof data.name === 'string' ? data.name : undefined);
  return getAdminAuth().createCustomToken(uid, { provider });
}

export function assertUsable(data: Record<string, unknown>) {
  if (data.status === 'inactive') throw new IdentityError(403, 'ACCOUNT_INACTIVE', '탈퇴한 계정입니다.');
  if (data.status === 'deleted') throw new IdentityError(403, 'ACCOUNT_DELETED', '삭제된 계정입니다.');
}

/** 로그인 판정 — identity 는 verifySocialProof 결과 */
export async function resolveSocialLogin(identity: VerifiedIdentity): Promise<SocialResolveResult> {
  const ref = identityRefOf(identity);
  if (!ref) throw new IdentityError(400, 'NOT_SOCIAL', '소셜 로그인 정보가 아닙니다.');
  const db = getAdminFirestore();

  // 0) 팝업 세션이 이미 그 사용자 (Firebase Auth 에 구글·애플이 연결된 계정)
  if (identity.firebaseUid) {
    const self = await db.collection('users').doc(identity.firebaseUid).get();
    if (self.exists && self.data()?.status !== 'temp') {
      const data = self.data() ?? {};
      assertUsable(data);
      // authProviders · 연결표에 없으면 채운다 (이미 둘 다 있으면 linkIdentity 가 바로 끝난다)
      await linkIdentity(identity.firebaseUid, ref, { replace: true }).catch((e) => logger.warn('세션 신원 연결 실패(무시):', e?.code || e?.message));
      await touchIdentity(ref.provider, ref.providerUid);
      return { action: 'LOGIN', userId: identity.firebaseUid, alreadySignedIn: true };
    }
  }

  // 1) 연결표 (없으면 authProviders 에서 찾아 채움)
  const owner = await findIdentityOwner(ref.provider, ref.providerUid);
  if (owner) {
    assertUsable(owner.data);
    if (owner.data.status === 'active') {
      await touchIdentity(ref.provider, ref.providerUid);
      return { action: 'LOGIN', userId: owner.uid, customToken: await issueToken(owner.uid, owner.data, identity.provider) };
    }
  }

  // 2) 같은 이메일의 기존 계정 — 제공자가 확인했고 우리 앱에 발급된 증명일 때만 (네이버는 이메일로 계정을 열지 않는다)
  if (identity.email && identity.emailVerified) {
    const snap = await db.collection('users').where('email', '==', identity.email).limit(10).get();
    const doc = snap.docs.find((d) => d.data().status === 'active')
      ?? snap.docs.find((d) => ['inactive', 'deleted'].includes(String(d.data().status)));
    if (doc) {
      const data = doc.data();
      assertUsable(data);
      const linked = linkedProvidersOf(data);
      // 같은 제공자의 '다른 id' 가 연결돼 있다 — 구글·애플은 제공자가 이메일을 보증하므로 바꿔 연결(옛 애플 id 바로잡기),
      // 네이버·카카오는 다른 앱 토큰일 수 있어 거절
      if (linked.includes(ref.provider)) {
        if (identity.emailTrusted && (ref.provider === 'google' || ref.provider === 'apple')) {
          await linkIdentity(doc.id, ref, { replace: true });
          await touchIdentity(ref.provider, ref.providerUid);
          return { action: 'LOGIN', userId: doc.id, customToken: await issueToken(doc.id, data, identity.provider) };
        }
        throw new IdentityError(403, 'IDENTITY_MISMATCH', '이 계정에 연결된 소셜 계정과 다릅니다. 처음 연결한 계정으로 로그인해주세요.');
      }
      return {
        action: 'LINK_ACTIVE',
        linkTicket: signTicket('link', { uid: doc.id, p: ref.provider, pu: ref.providerUid, e: ref.email ?? '', n: ref.displayName ?? '' }, LINK_TTL),
        maskedEmail: maskEmail(data.email),
        hasPassword: await hasPasswordLogin(doc.id),
        providers: linked,
      };
    }
  }

  // 3) 처음 보는 사람 → 가입 · temp 계정 흐름
  return { action: 'NEED_PHONE' };
}

/** 비밀번호를 확인한 뒤 소셜 연결 + 로그인 토큰 (연결 표는 resolveSocialLogin 이 준 것) */
export async function linkWithPassword(linkTicket: unknown, password: unknown): Promise<{ userId: string; customToken: string }> {
  const t = readTicket<{ uid: string; p: IdentityProvider; pu: string; e?: string; n?: string }>('link', linkTicket);
  if (!t?.uid || !t.p || !t.pu) throw new IdentityError(400, 'TICKET_EXPIRED', '확인 시간이 지났습니다. 처음부터 다시 로그인해주세요.');
  if (typeof password !== 'string' || !password || password.length > 200) throw new IdentityError(400, 'INVALID_ARGUMENT', '비밀번호를 입력해주세요.');
  const db = getAdminFirestore();
  const snap = await db.collection('users').doc(t.uid).get();
  if (!snap.exists) throw new IdentityError(404, 'NOT_FOUND', '사용자를 찾을 수 없습니다.');
  const data = snap.data() ?? {};
  assertUsable(data);
  const authUser = await getAdminAuth().getUser(t.uid).catch(() => null);
  const email = authUser?.email || (typeof data.email === 'string' ? data.email : '');
  if (!email) throw new IdentityError(400, 'NO_PASSWORD', '비밀번호로 로그인하는 계정이 아닙니다.');
  await verifyPassword(t.uid, email, password);
  await linkIdentity(t.uid, { provider: t.p, providerUid: t.pu, ...(t.e ? { email: t.e } : {}), ...(t.n ? { displayName: t.n } : {}) });
  await db.collection('users').doc(t.uid).update({ lastLoginAt: Timestamp.now() }).catch(() => undefined);
  logger.info('🔗 비밀번호 확인 후 소셜 연결:', { provider: t.p, uid: t.uid.substring(0, 8) + '...' });
  return { userId: t.uid, customToken: await issueToken(t.uid, data, t.p === 'google' || t.p === 'apple' ? `${t.p}.com` : t.p) };
}

/** Firebase 비밀번호 확인 (Identity Toolkit REST — 서버에서 비밀번호를 검사할 다른 방법이 없다) */
async function verifyPassword(uid: string, email: string, password: string): Promise<void> {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key) throw new IdentityError(500, 'CONFIG', '서버 설정 오류입니다.');
  // 에뮬레이터(테스트)면 에뮬레이터로
  const emu = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const base = emu ? `http://${emu}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
  const res = await fetch(`${base}/v1/accounts:signInWithPassword?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => null) as { localId?: string; error?: { message?: string } } | null;
  if (res.ok && json?.localId === uid) return;
  const msg = String(json?.error?.message ?? '');
  if (msg.startsWith('TOO_MANY_ATTEMPTS')) throw new IdentityError(429, 'TOO_MANY_ATTEMPTS', '시도가 너무 많습니다. 잠시 후 다시 시도해주세요.');
  throw new IdentityError(401, 'WRONG_PASSWORD', '비밀번호가 올바르지 않습니다.');
}
