import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth, adminFieldValue } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const db = getAdminFirestore();
    const body = await request.json();
    const { userId, adminUserId, deleteType = 'soft' } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'userId가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!adminUserId) {
      return NextResponse.json(
        { error: '관리자 인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const isHardDelete = deleteType === 'hard';
    console.log(`🗑️ 사용자 ${isHardDelete ? '영구' : '일반'} 삭제 요청: ${userId} (관리자: ${adminUserId})`);

    // 1. 관리자 권한 체크
    const adminDoc = await db.collection('users').doc(adminUserId).get();
    
    if (!adminDoc.exists) {
      return NextResponse.json(
        { error: '관리자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const adminData = adminDoc.data();
    
    if (adminData?.role !== 'admin') {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

    // 1.1. 본인 삭제 방지
    if (userId === adminUserId) {
      console.warn('⚠️ 관리자가 본인 계정 삭제 시도');
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
    console.log(`📋 사용자 정보: ${userData?.name} (${userData?.email})`);

    // 2.1. 마지막 관리자 삭제 방지
    if (userData?.role === 'admin') {
      const adminCountSnapshot = await db.collection('users')
        .where('role', '==', 'admin')
        .where('status', '==', 'active')
        .count()
        .get();
      
      const adminCount = adminCountSnapshot.data().count;
      
      if (adminCount <= 1) {
        console.warn('⚠️ 마지막 관리자 삭제 시도');
        return NextResponse.json(
          { error: '마지막 관리자는 삭제할 수 없습니다. 먼저 다른 사용자를 관리자로 지정하세요.' },
          { status: 403 }
        );
      }
      
      console.log(`✅ 관리자 삭제 가능 (현재 활성 관리자: ${adminCount}명)`);
    }

    // 4. 삭제 처리 (Soft Delete vs Hard Delete)
    let authDeleted = false;
    let authError = null;

    if (isHardDelete) {
      // Hard Delete: Firebase Auth + Firestore 완전 삭제
      console.log('🔴 Hard Delete 진행 중...');
      
      try {
        await auth.deleteUser(userId);
        console.log('✅ Firebase Auth 사용자 삭제 완료');
        authDeleted = true;
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          console.log('⚠️ Firebase Auth에 사용자가 없음 (이미 삭제됨 또는 존재하지 않음)');
        } else if (error.code === 'auth/insufficient-permission') {
          console.error('❌ Firebase Auth 권한 부족:', error);
          return NextResponse.json(
            { 
              error: 'Firebase Admin SDK 권한이 부족합니다.',
              details: 'auth.users.delete 권한이 필요합니다.'
            },
            { status: 500 }
          );
        } else {
          console.error('❌ Firebase Auth 삭제 실패:', {
            code: error.code,
            message: error.message,
            userId,
          });
          authError = error.message;
        }
      }

      // Firestore 문서 완전 삭제
      await db.collection('users').doc(userId).delete();
      console.log('✅ Firestore 사용자 문서 삭제 완료 (Hard Delete)');
      
    } else {
      // Soft Delete: Firebase Auth만 삭제, Firestore는 status만 변경
      console.log('🟡 Soft Delete 진행 중...');
      
      // Firebase Auth 삭제 (재가입 가능하게)
      try {
        await auth.deleteUser(userId);
        console.log('✅ Firebase Auth 사용자 삭제 완료');
        authDeleted = true;
      } catch (error: any) {
        if (error.code === 'auth/user-not-found') {
          console.log('⚠️ Firebase Auth에 사용자가 없음');
        } else {
          console.error('❌ Firebase Auth 삭제 실패:', error);
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
      console.log('✅ Firestore 사용자 status 변경 완료 (Soft Delete)');
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
          name: adminData?.name,
          email: adminData?.email,
        },
        timestamp: adminFieldValue.serverTimestamp(),
        metadata: {
          authDeleted,
          authError,
          deleteType: isHardDelete ? 'hard' : 'soft',
        },
      });
      console.log('✅ 감사 로그 기록 완료');
    } catch (logError) {
      console.error('⚠️ 감사 로그 기록 실패 (삭제는 진행됨):', logError);
    }

    console.log('📝 사용자 삭제 완료:', {
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
    console.error('❌ 사용자 삭제 실패:', {
      error: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      userId: body?.userId,
      adminUserId: body?.adminUserId,
      deleteType: body?.deleteType,
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
