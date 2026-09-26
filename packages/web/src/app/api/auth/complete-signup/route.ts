import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { completeSignup, SignupError } from '@/lib/signupServer';
import { writeAuditLog } from '@/lib/auditLog';
import { logger, type CompleteSignupInput } from '@smis-mentor/shared';

/**
 * POST /api/auth/complete-signup
 * 가입 마지막 단계 — 방금 만든 Firebase Auth 계정의 ID token 으로 호출.
 * (users 문서가 아직 없으므로 getAuthenticatedUser 대신 토큰만 검증)
 */
export async function POST(request: NextRequest) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Bearer ')) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(header.slice(7));
  } catch {
    return NextResponse.json({ error: '인증이 만료되었습니다. 다시 시도해주세요.' }, { status: 401 });
  }

  let body: CompleteSignupInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  try {
    const result = await completeSignup(decoded.uid, decoded.email, body, header.slice(7));
    if (result.claimedTemp) {
      await writeAuditLog({
        action: 'SIGNUP_TEMP_CLAIM', category: 'ACCOUNT', performedBy: decoded.uid,
        targetUserId: decoded.uid, metadata: { role: result.role }, request,
      });
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof SignupError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    logger.error('❌ 가입 완료 처리 실패:', e);
    return NextResponse.json({ error: '회원가입 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
