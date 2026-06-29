import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, email, existingUid } = body as {
      userId: string;
      email: string;
      existingUid?: string;
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
