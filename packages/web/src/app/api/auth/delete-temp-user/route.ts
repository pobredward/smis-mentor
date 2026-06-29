import { getAdminAuth } from '@/lib/firebase-admin';
import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 마이페이지 소셜 연동 시 signInWithPopup으로 생성된 임시 Firebase Auth 계정을 서버에서 삭제
 *
 * 클라이언트에서 currentUser.delete()를 호출하면 onAuthStateChanged(null) 이벤트가 발생하여
 * AuthContext가 로그아웃 처리를 하고 "접근 권한이 없습니다" 페이지로 리다이렉트된다.
 * Admin SDK로 삭제하면 해당 클라이언트의 Auth 이벤트가 발생하지 않는다.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tempUid } = body as { tempUid: string };

    if (!tempUid) {
      return NextResponse.json(
        { error: { status: 'INVALID_ARGUMENT', message: 'tempUid가 필요합니다.' } },
        { status: 400 }
      );
    }

    logger.info('🗑️ 임시 소셜 계정 서버 삭제 요청:', tempUid);

    const adminAuth = getAdminAuth();
    try {
      await adminAuth.deleteUser(tempUid);
      logger.info('✅ 임시 소셜 계정 삭제 완료:', tempUid);
    } catch (deleteError: any) {
      if (deleteError.code === 'auth/user-not-found') {
        logger.info('ℹ️ 임시 소셜 계정이 이미 삭제됨:', tempUid);
      } else {
        throw deleteError;
      }
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
