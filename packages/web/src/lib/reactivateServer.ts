/**
 * 탈퇴·삭제 계정 복구 (Admin SDK 전용)
 *  1) users 문서 복원 (status active, 원래 이름·이메일)
 *  2) Firebase Auth 계정 확인 — 없으면 문서 id 와 같은 uid 로 다시 만든다 (문서 id = Auth uid 유지)
 *  3) 비밀번호 재설정 메일 발송 (Identity Toolkit REST — 클라이언트 SDK 가 보내는 것과 같은 메일)
 */
import { getAdminAuth, getAdminFirestore, adminFieldValue } from '@/lib/firebase-admin';
import { logger, normalizeNameForMatch, normalizePhoneForMatch } from '@smis-mentor/shared';

export class ReactivateError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const stripName = (n: unknown) => String(n ?? '').replace(/^\(삭제됨\)\s*|^\(탈퇴\)\s*/g, '').trim();
const stripEmail = (e: unknown) => String(e ?? '').replace(/^(deleted|rejoined)_\d+_/g, '').trim().toLowerCase();

export function originalIdentity(data: Record<string, any>) {
  return {
    name: String(data.originalName || stripName(data.name)),
    email: stripEmail(data.originalEmail || data.email),
  };
}

async function sendPasswordReset(email: string) {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key) { logger.warn('⚠️ API 키가 없어 재설정 메일을 보내지 못함'); return false; }
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'PASSWORD_RESET', email }),
  });
  if (!res.ok) logger.warn('⚠️ 비밀번호 재설정 메일 발송 실패:', res.status);
  return res.ok;
}

/** 본인 복구 — 전화번호와 원래 이름이 모두 맞아야 한다 */
export function verifyOwner(data: Record<string, any>, phoneNumber: string, name: string) {
  const phoneOk = normalizePhoneForMatch(data.phoneNumber ?? data.phone) === normalizePhoneForMatch(phoneNumber);
  const { name: orig } = originalIdentity(data);
  const ft = data.foreignTeacher ?? {};
  const nameOk = normalizeNameForMatch(orig) === normalizeNameForMatch(name)
    || (!!ft.firstName && normalizeNameForMatch(`${ft.firstName}${ft.middleName ?? ''}${ft.lastName}`) === normalizeNameForMatch(name))
    || (!!ft.firstName && normalizeNameForMatch(`${ft.firstName}${ft.lastName}`) === normalizeNameForMatch(name));
  return phoneOk && nameOk;
}

export async function reactivateAccount(userId: string): Promise<{ email: string; authCreated: boolean; resetSent: boolean }> {
  const db = getAdminFirestore();
  const ref = db.collection('users').doc(userId);
  const snap = await ref.get();
  if (!snap.exists) throw new ReactivateError(404, '사용자를 찾을 수 없습니다.');
  const data = snap.data() as Record<string, any>;
  if (data.status !== 'deleted' && data.status !== 'inactive') throw new ReactivateError(409, '이미 활성화된 사용자입니다.');

  const { name, email } = originalIdentity(data);
  if (!email || !email.includes('@')) throw new ReactivateError(400, '복구할 이메일 정보를 찾을 수 없습니다. 관리자에게 문의해주세요.');

  // 같은 이메일로 이미 다른 활성 계정이 있으면 복구하지 않는다 (탈퇴 후 새로 가입한 경우)
  const dup = await db.collection('users').where('email', '==', email).get();
  if (dup.docs.some((d) => d.id !== userId && ['active', 'temp'].includes(String(d.data().status)))) {
    throw new ReactivateError(409, '같은 이메일로 가입된 다른 계정이 있습니다. 그 계정으로 로그인해주세요.');
  }

  // Auth 계정: uid(=문서 id)로 확인 → 없으면 같은 uid 로 생성
  const auth = getAdminAuth();
  let authCreated = false;
  try {
    const u = await auth.getUser(userId);
    if ((u.email || '').toLowerCase() !== email) await auth.updateUser(userId, { email });
    if (u.disabled) await auth.updateUser(userId, { disabled: false });
  } catch (e: any) {
    if (e?.code !== 'auth/user-not-found') throw e;
    try {
      const other = await auth.getUserByEmail(email);
      throw new ReactivateError(409, `이 이메일은 다른 로그인 계정(${other.uid.slice(0, 6)}…)에서 쓰고 있습니다. 관리자에게 문의해주세요.`);
    } catch (e2: any) {
      if (e2 instanceof ReactivateError) throw e2;
      if (e2?.code !== 'auth/user-not-found') throw e2;
    }
    await auth.createUser({ uid: userId, email, displayName: name || undefined });
    authCreated = true;
  }

  await ref.update({
    status: 'active',
    name,
    email,
    deletedAt: null,
    deletedBy: null,
    reactivatedAt: adminFieldValue.serverTimestamp(),
    updatedAt: adminFieldValue.serverTimestamp(),
  });

  // 소셜로 가입했던 계정은 비밀번호가 필요 없지만, 재설정 메일로 비밀번호 로그인도 열어 둔다
  const resetSent = await sendPasswordReset(email);
  logger.info('✅ 계정 복구:', { userId, authCreated, resetSent });
  return { email, authCreated, resetSent };
}

export const maskEmail = (e: string) => e.replace(/^(.{2}).*(@.*)$/, (_, a, b) => `${a}***${b}`);
