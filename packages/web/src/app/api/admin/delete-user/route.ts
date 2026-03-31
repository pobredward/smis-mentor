import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth, adminFieldValue } from '@/lib/firebase-admin';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthenticatedUser(request);
    
    const adminCheck = requireAdmin(authContext);
    if (adminCheck) {
      return adminCheck;
    }

    const db = getAdminFirestore();
    const auth = getAdminAuth();
    const body = await request.json();
    const { userId, deleteType = 'soft' } = body;
    const adminUserId = authContext!.user.userId || authContext!.user.id;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId가 필요합니다.' },
        { status: 400 }
      );
    }

    const isHardDelete = deleteType === 'hard';
    logger.info(`🗑️ 사용자 ${isHardDelete ? '영구' : '일반'} 삭제 요청: ${userId} (관리자: ${adminUserId})`);

    // 1. 본인 삭제 방지
    if (userId === adminUserId) {
      logger.warn('⚠️ 관리자가 본인 계정 삭제 시도');
      return NextResponse.json(
        { error: '본인 계정은 삭제할 수 없습니다. 다른 관리자에게 요청하세요.' },
        { status: 403 }
      );
    }

    // 2. Firestore에서 사용자 정보 조회
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const userData = userDoc.data();
    logger.info(`📋 사용자 정보: ${userData?.name} (${userData?.email})`);

    // 2.1. 마지막 관리자 삭제 방지
    if (userData?.role === 'admin') {
      const adminCountSnapshot = await db.collection('users')
        .where('role', '==', 'admin')
        .where('status', '==', 'active')
        .count()
        .get();
      
      const adminCount = adminCountSnapshot.data().count;
      
      if (adminCount <= 1) {
        logger.warn('⚠️ 마지막 관리자 삭제 시도');
        return NextResponse.json(
          { error: '마지막 관리자는 삭제할 수 없습니다. 먼저 다른 사용자를 관리자로 지정하세요.' },
          { status: 403 }
        );
      }
      
      logger.info(`✅ 관리자 삭제 가능 (현재 활성 관리자: ${adminCount}명)`);
    }

    // 4. 삭제 처리 (Soft Delete vs Hard Delete)
    let authDeleted = false;
    let authError = null;

    if (isHardDelete) {
      // Hard Delete: Firebase Auth + Firestore 완전 삭제
      logger.info('🔴 Hard Delete 진행 중...');
      
      try {
        await auth.deleteUser(userId);
        logger.info('✅ Firebase Auth 사용자 삭제 완료');
        authDeleted = true;
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          logger.info('⚠️ Firebase Auth에 사용자가 없음 (이미 삭제됨 또는 존재하지 않음)');
        } else if (error.code === 'auth/insufficient-permission') {
          logger.error('❌ Firebase Auth 권한 부족:', error);
          return NextResponse.json(
            { 
              error: 'Firebase Admin SDK 권한이 부족합니다.',
              details: 'auth.users.delete 권한이 필요합니다.'
            },
            { status: 500 }
          );
        } else {
          logger.error('❌ Firebase Auth 삭제 실패:', {
            code: error.code,
            message: error.message,
            userId,
          });
          authError = error.message;
        }
      }

      // Firestore 문서 완전 삭제
      await db.collection('users').doc(userId).delete();
      logger.info('✅ Firestore 사용자 문서 삭제 완료 (Hard Delete)');
      
    } else {
      // Soft Delete: Firebase Auth만 삭제, Firestore는 status만 변경
      logger.info('🟡 Soft Delete 진행 중...');
      
      // Firebase Auth 삭제 (재가입 가능하게)
      try {
        await auth.deleteUser(userId);
        logger.info('✅ Firebase Auth 사용자 삭제 완료');
        authDeleted = true;
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          logger.info('⚠️ Firebase Auth에 사용자가 없음');
        } else {
          logger.error('❌ Firebase Auth 삭제 실패:', error);
          authError = error.message;
        }
      }

      // Firestore: status만 변경하고 문서는 유지 (평가/지원서 이력 보존)
      const now = adminFieldValue.serverTimestamp();
      const deletedEmail = `deleted_${Date.now()}_${userData?.email}`;
      const deletedName = `(삭제됨) ${userData?.name}`;
      
      await db.collection('users').doc(userId).update({
        status: 'deleted',
        name: deletedName,
        email: deletedEmail,
        originalEmail: userData?.email, // 원본 이메일 백업
        originalName: userData?.name, // 원본 이름 백업
        deletedAt: now,
        deletedBy: adminUserId,
        updatedAt: now,
      });
      logger.info('✅ Firestore 사용자 status 변경 완료 (Soft Delete)');
    }

    // 5. 감사 로그 기록
    try {
      await db.collection('auditLogs').add({
        action: isHardDelete ? 'USER_HARD_DELETE' : 'USER_SOFT_DELETE',
        targetUserId: userId,
        targetUserData: {
          name: userData?.name,
          email: userData?.email,
          role: userData?.role,
          status: userData?.status,
        },
        performedBy: adminUserId,
        performedByData: {
          name: authContext!.user.name,
          email: authContext!.user.email,
        },
        timestamp: adminFieldValue.serverTimestamp(),
        metadata: {
          authDeleted,
          authError,
          deleteType: isHardDelete ? 'hard' : 'soft',
        },
      });
      logger.info('✅ 감사 로그 기록 완료');
    } catch (logError) {
      logger.error('⚠️ 감사 로그 기록 실패 (삭제는 진행됨):', logError);
    }

    logger.info('📝 사용자 삭제 완료:', {
      deleteType: isHardDelete ? 'hard' : 'soft',
      deletedUserId: userId,
      deletedUserName: userData?.name,
      deletedUserEmail: userData?.email,
      deletedUserRole: userData?.role,
      deletedBy: adminUserId,
      deletedByName: adminData?.name,
      authDeleted,
      authError,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      deleteType: isHardDelete ? 'hard' : 'soft',
      authDeleted,
      authError,
      message: isHardDelete
        ? authDeleted 
          ? '사용자가 Firebase Auth 및 Firestore에서 영구 삭제되었습니다.'
          : '사용자가 Firestore에서 영구 삭제되었습니다. (Firebase Auth는 이미 없었습니다.)'
        : authDeleted
          ? '사용자가 일반 삭제되었습니다. Firebase Auth는 삭제되었으며, 데이터는 보존됩니다.'
          : '사용자가 일반 삭제되었습니다. 데이터는 보존됩니다.',
      deletedUser: {
        id: userId,
        name: userData?.name,
        email: userData?.email,
      },
    });
  } catch (error: any) {
    const { userId, deleteType } = await request.json().catch(() => ({}));
    logger.error('❌ 사용자 삭제 실패:', {
      error: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      userId,
      deleteType,
      timestamp: new Date().toISOString(),
    });
    
    return NextResponse.json(
      { 
        error: '사용자 삭제 중 오류가 발생했습니다.',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
