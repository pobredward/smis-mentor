/**
 * 전화번호 로그인 · 인증 (서버 전용) — /api/auth/phone
 *
 * 앱 · 웹은 Firebase 전화 인증(문자)을 마친 ID 토큰만 보낸다. 이 토큰은 본 로그인 세션과 따로 만든다
 * (웹은 보조 Firebase 앱, 앱은 네이티브 인증) — 문자 인증 때 생긴 임시 Auth 계정은 서버가 지운다.
 *
 * 번호 → 사용자
 *  1) authIdentities/phone_{E.164} — 문자 인증으로 확인된 번호만 적힌다. 그 사람 문서의 번호가 아직 같을 때만 믿는다
 *     (관리자가 번호를 고쳤거나 본인이 바꿨으면 오래된 항목으로 보고 지운다)
 *  2) users.phoneNumber 가 같은 활성 계정 — 하나면 그 사람 (연결표에 적는다), 여럿이면 PHONE_SHARED
 *  3) 없으면 NO_ACCOUNT + 번호 확인 표 (가입 · temp 계정 이어받기에 쓴다)
 *
 * 관리자 계정은 전화번호 로그인을 막는다 (번호 이전 · 유심 복제에 약하다). AUTH_PHONE_LOGIN_ADMIN=1 이면 허용.
 */
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { AUTH_IDENTITIES, IdentityError } from '@/lib/authIdentity';
import { assertUsable, issueToken } from '@/lib/socialLoginServer';
import { readTicket, signTicket } from '@/lib/authTicket';
import { logger, maskE164, samePhone, storedPhoneVariants, toE164 } from '@smis-mentor/shared';

export type PhoneAuthResult =
  | { action: 'LOGIN'; userId: string; customToken: string }
  | { action: 'NO_ACCOUNT'; phoneTicket: string; phone: string; hasTemp: boolean }
  | { action: 'VERIFIED'; phoneTicket: string; phone: string };

const TICKET_TTL = 30 * 60 * 1000;
export const phoneIdentityKey = (e164: string) => `phone_${e164}`;

/** 번호 확인 표 (30분) — complete-signup 이 readPhoneTicket 으로 확인 */
export const phoneTicketFor = (e164: string) => signTicket('phone', { ph: e164 }, TICKET_TTL);

export function readPhoneTicket(ticket: unknown): string | null {
  if (!ticket) return null;
  const t = readTicket<{ ph?: string }>('phone', ticket);
  return t?.ph && toE164(t.ph, null) === t.ph ? t.ph : null;
}

/** 전화 인증 ID 토큰 확인 → E.164 번호 + 그 토큰의 (임시) Auth uid */
export async function verifyPhoneIdToken(idToken: unknown): Promise<{ e164: string; firebaseUid: string }> {
  if (typeof idToken !== 'string' || !idToken || idToken.length > 5000) {
    throw new IdentityError(400, 'INVALID_PROOF', '전화번호 인증 정보가 없습니다.');
  }
  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken, true);
  } catch (e) {
    logger.warn('전화 인증 ID 토큰 확인 실패:', (e as Error)?.message);
    throw new IdentityError(401, 'INVALID_PROOF', '인증 세션이 만료되었습니다. 다시 시도해주세요.');
  }
  const e164 = toE164(decoded.phone_number, null);
  if (decoded.firebase?.sign_in_provider !== 'phone' || !e164) {
    throw new IdentityError(400, 'NOT_PHONE', '전화번호 인증 정보가 아닙니다.');
  }
  return { e164, firebaseUid: decoded.uid };
}

/** 문자 인증으로 생긴 임시 Auth 계정 지우기 — 전화 말고 다른 로그인 방법이 없고 users 문서도 없는 것만 */
export async function cleanupPhoneAuthUser(uid: string): Promise<void> {
  try {
    const u = await getAdminAuth().getUser(uid);
    if (u.providerData.some((p) => p.providerId !== 'phone') || u.passwordHash) return;
    const hasDoc = (await getAdminFirestore().collection('users').doc(uid).get()).exists;
    if (!hasDoc) await getAdminAuth().deleteUser(uid);
  } catch (e) {
    if ((e as { code?: string })?.code !== 'auth/user-not-found') logger.warn('전화 인증 임시 계정 정리 실패(무시):', (e as Error)?.message);
  }
}

const phoneOf = (data: Record<string, unknown> | undefined) => data?.phoneNumber || data?.phone;

/** 이 번호가 확인된 번호로 연결된 사람 (문자 인증 뒤에만 부른다) */
export async function recordPhoneIdentity(uid: string, e164: string): Promise<void> {
  await getAdminFirestore().collection(AUTH_IDENTITIES).doc(phoneIdentityKey(e164)).set(
    { uid, provider: 'phone', providerUid: e164, linkedAt: Timestamp.now(), lastLoginAt: Timestamp.now() },
    { merge: true },
  );
}

/** 이 번호의 users 문서들 (형식이 달라도) */
async function usersWithPhone(e164: string) {
  const snap = await getAdminFirestore().collection('users').where('phoneNumber', 'in', storedPhoneVariants(e164)).get();
  return snap.docs.filter((d) => samePhone(phoneOf(d.data()), e164));
}

/**
 * 번호 → 활성 계정. 연결표(확인된 번호)가 먼저, 없으면 users.phoneNumber.
 * 활성 계정이 여럿이면 PHONE_SHARED (확인된 연결이 있으면 그 사람).
 */
export async function findPhoneOwner(e164: string): Promise<{ uid: string; data: Record<string, unknown> } | null> {
  const db = getAdminFirestore();
  const ref = db.collection(AUTH_IDENTITIES).doc(phoneIdentityKey(e164));
  const snap = await ref.get();
  if (snap.exists) {
    const uid = String(snap.data()?.uid ?? '');
    const user = uid ? await db.collection('users').doc(uid).get() : null;
    if (user?.exists && user.data()?.status === 'active' && samePhone(phoneOf(user.data()), e164)) {
      return { uid, data: user.data() ?? {} };
    }
    await ref.delete().catch(() => undefined);
    logger.info('🧹 오래된 전화번호 연결 정리:', { phone: maskE164(e164) });
  }
  const active = (await usersWithPhone(e164)).filter((d) => d.data().status === 'active');
  if (active.length > 1) {
    logger.warn('⚠️ 같은 번호의 활성 계정이 여럿 — 전화번호 로그인 막음:', { phone: maskE164(e164), count: active.length });
    throw new IdentityError(409, 'PHONE_SHARED', '이 번호를 쓰는 계정이 여러 개라 전화번호로 로그인할 수 없습니다. 다른 방법으로 로그인하거나 관리자에게 문의해주세요.');
  }
  if (!active.length) return null;
  await recordPhoneIdentity(active[0].id, e164);
  return { uid: active[0].id, data: active[0].data() };
}

/** 로그인 판정 */
export async function resolvePhoneLogin(e164: string): Promise<PhoneAuthResult> {
  const owner = await findPhoneOwner(e164);
  if (owner) {
    assertUsable(owner.data);
    if (owner.data.role === 'admin' && process.env.AUTH_PHONE_LOGIN_ADMIN !== '1') {
      throw new IdentityError(403, 'PHONE_LOGIN_NOT_ALLOWED', '관리자 계정은 전화번호로 로그인할 수 없습니다. 다른 방법으로 로그인해주세요.');
    }
    await getAdminFirestore().collection(AUTH_IDENTITIES).doc(phoneIdentityKey(e164))
      .set({ lastLoginAt: Timestamp.now() }, { merge: true }).catch(() => undefined);
    logger.info('📱 전화번호 로그인:', { uid: owner.uid.substring(0, 8) + '...' });
    return { action: 'LOGIN', userId: owner.uid, customToken: await issueToken(owner.uid, owner.data, 'phone') };
  }
  // 가입 전 — 관리자가 미리 만든 계정(temp)이 이 번호로 있나
  const hasTemp = (await usersWithPhone(e164)).some((d) => d.data().status === 'temp');
  return { action: 'NO_ACCOUNT', phoneTicket: phoneTicketFor(e164), phone: e164, hasTemp };
}
