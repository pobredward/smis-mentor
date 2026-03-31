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
    const { searchParams} = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';
    
    logger.info('🚀 사용자 ID 마이그레이션 시작...');
    logger.info(`📋 모드: ${dryRun ? 'DRY RUN (시뮬레이션)' : 'PRODUCTION (실제 실행)'}`);
    
    const results = {
      total: 0,
      success: 0,
      skipped: 0,
      failed: 0,
      noAuth: 0,
      alreadyMigrated: 0,
      errors: [] as any[],
    };
    
    // 1. 모든 사용자 조회
    const usersSnapshot = await db.collection('users').get();
    results.total = usersSnapshot.size;
    
    logger.info(`📊 총 ${results.total}명의 사용자 처리 중...`);
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const oldDocId = userDoc.id;
      
      try {
        // Firebase Auth 조회
        if (!userData.email) {
          logger.info(`⏭️  건너뜀 (이메일 없음): ${oldDocId}`);
          results.skipped++;
          continue;
        }
        
        let authUser;
        try {
          authUser = await auth.getUserByEmail(userData.email);
        } catch (authError: any) {
          if (authError.code === 'auth/user-not-found') {
            logger.info(`⚠️  Auth 없음: ${userData.email}`);
            results.noAuth++;
            continue;
          }
          throw authError;
        }
        
        const newDocId = authUser.uid;
        
        // 이미 마이그레이션됨 (Document ID = Auth UID)
        if (oldDocId === newDocId) {
          logger.info(`✅ 이미 마이그레이션됨: ${userData.email}`);
          results.alreadyMigrated++;
          continue;
        }
        
        logger.info(`🔄 마이그레이션: ${oldDocId} → ${newDocId} (${userData.email})`);
        
        if (!dryRun) {
          // 실제 마이그레이션 실행
          const batch = db.batch();
          
          // 1. 새 Document 생성
          const newDocRef = db.collection('users').doc(newDocId);
          batch.set(newDocRef, {
            ...userData,
            userId: newDocId,
            id: newDocId,
            migratedAt: adminFieldValue.serverTimestamp(),
            oldUserId: oldDocId,  // 백업용
          });
          
          // 2. 구 Document 삭제
          batch.delete(userDoc.ref);
          
          await batch.commit();
        }
        
        results.success++;
        
      } catch (error: any) {
        logger.error(`❌ 실패 (${oldDocId}):`, error.message);
        results.failed++;
        results.errors.push({
          userId: oldDocId,
          email: userData.email,
          error: error.message,
        });
      }
    }
    
    logger.info('✅ 1단계 완료: users 컬렉션 마이그레이션');
    logger.info(results);
    
    return NextResponse.json({
      success: true,
      dryRun,
      stage: 'users',
      results,
    });
    
  } catch (error: any) {
    logger.error('❌ 마이그레이션 실패:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
