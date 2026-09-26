import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { sendVerificationEmail, syncEmailVerified } from '@/lib/emailVerification';
import { logger } from '@smis-mentor/shared';

/**
 * POST /api/auth/email-verification
 *  { action: 'resend' } — 인증 메일 다시 보내기 (1분에 1번)
 *  { action: 'sync' }   — 인증했는지 확인하고 users.isEmailVerified 반영
 * 인증 전 사용자도 불러야 하므로 getAuthenticatedUser(인증 필수) 대신 토큰만 확인한다.
 */
const lastSent = new Map<string, number>();

export async function POST(request: NextRequest) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  const idToken = header.slice(7);
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json({ error: '로그인이 만료되었습니다. 다시 로그인해주세요.' }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));

  try {
    if (body?.action === 'sync') {
      return NextResponse.json({ verified: await syncEmailVerified(uid) });
    }
    if (body?.action === 'resend') {
      if (await syncEmailVerified(uid)) return NextResponse.json({ verified: true, sent: false });
      const now = Date.now();
      if (now - (lastSent.get(uid) ?? 0) < 60_000) {
        return NextResponse.json({ error: '잠시 후 다시 시도해주세요. (1분에 한 번 보낼 수 있습니다)' }, { status: 429 });
      }
      lastSent.set(uid, now);
      const role = (await getAdminFirestore().collection('users').doc(uid).get()).data()?.role;
      const sent = await sendVerificationEmail(idToken, role === 'foreign' || role === 'foreign_temp' ? 'en' : 'ko');
      return NextResponse.json({ verified: false, sent });
    }
    return NextResponse.json({ error: 'action 이 올바르지 않습니다.' }, { status: 400 });
  } catch (e) {
    logger.error('❌ 이메일 인증 처리 실패:', e);
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
