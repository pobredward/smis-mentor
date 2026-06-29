import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, email, existingUid, deleteTempUid } = body as {
      userId: string;
      email: string;
      existingUid?: string;
      // 마이페이지 소셜 연동 시 signInWithPopup으로 생성된 임시 계정 UID.
      // 서버에서 Admin SDK로 삭제하여 클라이언트의 onAuthStateChanged(null)을 방지한다.
      deleteTempUid?: string;
    };

    logger.info('🔑 Custom Token 생성 요청 (API Route):', {
      userId,
      email,
      existingUid: existingUid ? `${existingUid.substring(0, 8)}...` : 'none',
    });

    if (!userId || !email) {
      return NextResponse.json(
        { error: { status: 'INVALID_ARGUMENT', message: 'userId와 email이 필요합니다.' } },
        { status: 400 }
      );
    }

    // Firestore에서 사용자 확인 및 이메일 검증
    const adminDb = getAdminFirestore();
    const userDoc = await adminDb.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { error: { status: 'NOT_FOUND', message: '사용자를 찾을 수 없습니다.' } },
        { status: 404 }
      );
    }

    const userData = userDoc.data()!;

    if (userData.email !== email) {
      return NextResponse.json(
        { error: { status: 'PERMISSION_DENIED', message: '이메일이 일치하지 않습니다.' } },
        { status: 403 }
      );
    }

    const targetUid = existingUid || userId;
    logger.info(`🎯 사용할 UID: ${targetUid}`);

    // Firebase Auth에 사용자가 있는지 확인, 없으면 생성
    const adminAuth = getAdminAuth();
    let firebaseUser;
    try {
      firebaseUser = await adminAuth.getUser(targetUid);
      logger.info('✅ 기존 Firebase Auth 사용자 발견:', firebaseUser.uid);
    } catch (authError: any) {
      if (authError.code === 'auth/user-not-found') {
        logger.info('🆕 Firebase Auth 사용자 생성:', { uid: targetUid, email });
        firebaseUser = await adminAuth.createUser({
          uid: targetUid,
          email,
          displayName: userData.name,
          emailVerified: true,
        });
      } else {
        logger.error('❌ Firebase Auth 사용자 조회 실패:', authError);
        throw authError;
      }
    }

    const customToken = await adminAuth.createCustomToken(firebaseUser.uid, {
      email,
      provider: 'custom',
    });

    logger.info('✅ Custom Token 생성 완료:', {
      uid: firebaseUser.uid,
      uidMatch: firebaseUser.uid === targetUid,
    });

    // 마이페이지 소셜 연동용 임시 계정 서버 삭제
    // 클라이언트에서 delete()하면 onAuthStateChanged(null) → 로그아웃 처리 문제가 생기므로
    // Custom Token 발급과 동시에 Admin SDK로 조용히 삭제한다.
    if (deleteTempUid && deleteTempUid !== firebaseUser.uid) {
      try {
        await adminAuth.deleteUser(deleteTempUid);
        logger.info('✅ 임시 소셜 계정 서버 삭제 완료:', deleteTempUid);
      } catch (deleteError: any) {
        if (deleteError.code === 'auth/user-not-found') {
          logger.info('ℹ️ 임시 소셜 계정이 이미 삭제됨:', deleteTempUid);
        } else {
          logger.warn('⚠️ 임시 소셜 계정 삭제 실패 (무시하고 계속):', deleteError);
        }
      }
    }

    // httpsCallable과 동일한 응답 형식 { result: { ... } }
    return NextResponse.json({ result: { customToken, uid: firebaseUser.uid } });
  } catch (error) {
    logger.error('❌ Custom Token 생성 실패:', error);
    return NextResponse.json(
      { error: { status: 'INTERNAL', message: 'Custom Token 생성에 실패했습니다.' } },
      { status: 500 }
    );
  }
}
