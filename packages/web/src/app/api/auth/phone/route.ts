import { NextRequest, NextResponse } from 'next/server';
import { IdentityError } from '@/lib/authIdentity';
import { cleanupPhoneAuthUser, phoneTicketFor, resolvePhoneLogin, verifyPhoneIdToken, type PhoneAuthResult } from '@/lib/phoneLoginServer';
import { logger } from '@smis-mentor/shared';

/**
 * POST /api/auth/phone — 전화번호 로그인 · 번호 확인
 * body: { idToken: 전화 인증(문자)으로 받은 Firebase ID 토큰, purpose: 'login' | 'verify' }
 *  - login  : 이 번호의 계정으로 로그인 토큰 (없으면 NO_ACCOUNT + 번호 확인 표)
 *  - verify : 번호 확인 표만 (가입 · temp 계정 찾기 — complete-signup 의 phoneTicket)
 * 문자 인증으로 생긴 임시 Auth 계정은 끝나면 지운다.
 * 결과: lib/phoneLoginServer.ts PhoneAuthResult
 */
export async function POST(request: NextRequest) {
  let firebaseUid = '';
  try {
    const body = await request.json().catch(() => ({}));
    const purpose = body?.purpose === 'verify' ? 'verify' : 'login';
    const verified = await verifyPhoneIdToken(body?.idToken);
    firebaseUid = verified.firebaseUid;
    const result: PhoneAuthResult = purpose === 'verify'
      ? { action: 'VERIFIED', phoneTicket: phoneTicketFor(verified.e164), phone: verified.e164 }
      : await resolvePhoneLogin(verified.e164);
    logger.info('📱 전화번호 인증 처리:', { purpose, action: result.action });
    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof IdentityError) {
      return NextResponse.json({ error: { status: e.code, message: e.message } }, { status: e.status });
    }
    logger.error('❌ 전화번호 인증 처리 실패:', e);
    return NextResponse.json({ error: { status: 'INTERNAL', message: '전화번호 인증 중 오류가 발생했습니다.' } }, { status: 500 });
  } finally {
    if (firebaseUid) await cleanupPhoneAuthUser(firebaseUid);
  }
}
