/**
 * 이메일 인증 (서버 전용)
 * - 인증 메일은 Identity Toolkit REST(accounts:sendOobCode, VERIFY_EMAIL)로 보낸다.
 *   클라이언트 SDK 의 sendEmailVerification 과 같은 메일(콘솔 '이메일 주소 인증' 템플릿)이 나간다.
 * - users.isEmailVerified 는 Auth 의 emailVerified 를 따라간다 (sync).
 */
import { getAdminAuth, getAdminFirestore, adminFieldValue } from '@/lib/firebase-admin';
import { logger } from '@smis-mentor/shared';

/** 인증 완료 후 돌아올 주소 (Authentication › 설정 › 승인된 도메인에 있어야 한다) */
export const VERIFY_CONTINUE_URL = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://smis-mentor.com'}/profile?verified=1`;

export async function sendVerificationEmail(idToken: string, locale: 'ko' | 'en' = 'ko'): Promise<boolean> {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!key) { logger.warn('⚠️ API 키가 없어 인증 메일을 보내지 못함'); return false; }
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Firebase-Locale': locale },
    body: JSON.stringify({ requestType: 'VERIFY_EMAIL', idToken, continueUrl: VERIFY_CONTINUE_URL }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    logger.warn('⚠️ 인증 메일 발송 실패:', res.status, body?.error?.message);
  }
  return res.ok;
}

/** Auth 의 인증 상태를 users 문서에 반영하고 결과를 돌려준다 */
export async function syncEmailVerified(uid: string): Promise<boolean> {
  const u = await getAdminAuth().getUser(uid);
  if (!u.emailVerified) return false;
  const ref = getAdminFirestore().collection('users').doc(uid);
  const snap = await ref.get();
  if (snap.exists && snap.data()?.isEmailVerified !== true) {
    await ref.update({ isEmailVerified: true, emailVerifiedAt: adminFieldValue.serverTimestamp(), updatedAt: adminFieldValue.serverTimestamp() });
  }
  return true;
}
