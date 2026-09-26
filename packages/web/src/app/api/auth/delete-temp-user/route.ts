import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 마이페이지 소셜 연동 시 signInWithPopup으로 생성된 임시 Firebase Auth 계정을 서버에서 삭제
 *
 * 보안: 삭제 대상 계정의 ID token(Authorization: Bearer)으로 본인 소유를 증명해야 하며,
 *       users 문서가 있는(실제 가입된) 계정은 삭제하지 않는다.
 *       (일반적으로는 /api/auth/create-custom-token 의 deleteAuthUid 로 처리되고, 이 라우트는 보조용)
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: { status: 'UNAUTHENTICATED', message: '인증이 필요합니다.' } }, { status: 401 });
    }
    const adminAuth = getAdminAuth();
    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(authHeader.substring(7));
    } catch {
      return NextResponse.json({ error: { status: 'UNAUTHENTICATED', message: '토큰이 유효하지 않습니다.' } }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const tempUid = typeof body?.tempUid === 'string' ? body.tempUid : '';
    if (!tempUid || tempUid !== decoded.uid) {
      return NextResponse.json(
        { error: { status: 'PERMISSION_DENIED', message: '본인 세션의 계정만 삭제할 수 있습니다.' } },
        { status: 403 }
      );
    }

    const hasDoc = (await getAdminFirestore().collection('users').doc(tempUid).get()).exists;
    if (hasDoc) {
      return NextResponse.json(
        { error: { status: 'FAILED_PRECONDITION', message: '가입된 계정은 이 경로로 삭제할 수 없습니다.' } },
        { status: 409 }
      );
    }

    try {
      await adminAuth.deleteUser(tempUid);
      logger.info('✅ 임시 소셜 계정 삭제 완료:', tempUid);
    } catch (deleteError: any) {
      if (deleteError.code !== 'auth/user-not-found') throw deleteError;
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('❌ 임시 소셜 계정 삭제 실패:', error);
    return NextResponse.json(
      { error: { status: 'INTERNAL', message: '임시 계정 삭제에 실패했습니다.' } },
      { status: 500 }
    );
  }
}
