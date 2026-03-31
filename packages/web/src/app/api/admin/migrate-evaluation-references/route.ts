import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth, adminFieldValue } from '@/lib/firebase-admin';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';

/**
 * evaluations 컬렉션의 refUserId, evaluatorId를 구 Document ID → 새 Auth UID로 마이그레이션
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthenticatedUser(request);
    
    const adminCheck = requireAdmin(authContext);
    if (adminCheck) {
      return adminCheck;
    }

    const db = getAdminFirestore();
    const { dryRun = true } = await request.json();
    
    logger.info(`🔄 evaluations 참조 필드 마이그레이션 시작 (dryRun: ${dryRun})...`);
    
    // 1. 백업 컬렉션에서 ID 매핑 데이터 로드
    const mappingsSnapshot = await db.collection('user_id_mappings_backup').get();
    
    if (mappingsSnapshot.empty) {
      return NextResponse.json({
        success: false,
        error: 'user_id_mappings_backup 컬렉션이 비어있습니다. 먼저 /api/admin/backup-user-ids를 실행하세요.',
      }, { status: 400 });
    }
    
    // 구 ID → 새 Auth UID 매핑 생성
    const oldIdToNewId = new Map<string, string>();
    
    for (const doc of mappingsSnapshot.docs) {
      const data = doc.data();
      const oldId = data.firestoreDocId; // 구 Document ID
      const newId = data.firebaseAuthUid; // 새 Auth UID
      
      if (oldId && newId) {
        oldIdToNewId.set(oldId, newId);
      }
    }
    
    logger.info(`📊 매핑 데이터: ${oldIdToNewId.size}개 사용자`);
    
    // 2. evaluations 컬렉션 조회
    const evaluationsSnapshot = await db.collection('evaluations').get();
    logger.info(`📊 총 ${evaluationsSnapshot.size}개 평가 문서 발견`);
    
    let needUpdateCount = 0;
    let alreadyUpdatedCount = 0;
    let notFoundRefUserIdCount = 0;
    let notFoundEvaluatorIdCount = 0;
    const updateLog: any[] = [];
    
    // Firebase UID 형식인지 체크 (28자, 하이픈 없음)
    const isLikelyAuthUid = (id: string) => id && id.length === 28 && !id.includes('-');
    
    // 3. 각 평가 문서 검사
    for (const evalDoc of evaluationsSnapshot.docs) {
      const evalData = evalDoc.data();
      const currentRefUserId = evalData.refUserId;
      const currentEvaluatorId = evalData.evaluatorId;
      
      if (!currentRefUserId) {
        logger.warn(`⚠️ refUserId 없음: ${evalDoc.id}`);
        continue;
      }
      
      // refUserId 체크
      const refUserIdNeedsUpdate = !isLikelyAuthUid(currentRefUserId);
      const newRefUserId = refUserIdNeedsUpdate ? oldIdToNewId.get(currentRefUserId) : currentRefUserId;
      
      // evaluatorId 체크
      const evaluatorIdNeedsUpdate = currentEvaluatorId && !isLikelyAuthUid(currentEvaluatorId);
      const newEvaluatorId = evaluatorIdNeedsUpdate ? oldIdToNewId.get(currentEvaluatorId) : currentEvaluatorId;
      
      // 둘 다 최신 상태면 스킵
      if (!refUserIdNeedsUpdate && !evaluatorIdNeedsUpdate) {
        alreadyUpdatedCount++;
        continue;
      }
      
      // 매핑이 없는 경우 체크
      let status = 'NEED_UPDATE';
      const issues: string[] = [];
      
      if (refUserIdNeedsUpdate && !newRefUserId) {
        notFoundRefUserIdCount++;
        issues.push('refUserId 매핑 없음');
        status = 'NOT_FOUND';
      }
      
      if (evaluatorIdNeedsUpdate && !newEvaluatorId) {
        notFoundEvaluatorIdCount++;
        issues.push('evaluatorId 매핑 없음');
        status = 'NOT_FOUND';
      }
      
      if (status === 'NOT_FOUND') {
        logger.warn(`❌ 매핑 없음 (평가 ID: ${evalDoc.id}):`, issues.join(', '));
      }
      
      needUpdateCount++;
      updateLog.push({
        evaluationId: evalDoc.id,
        oldRefUserId: currentRefUserId,
        newRefUserId: newRefUserId || null,
        oldEvaluatorId: currentEvaluatorId,
        newEvaluatorId: newEvaluatorId || null,
        refUserIdNeedsUpdate,
        evaluatorIdNeedsUpdate,
        status,
        issues: issues.length > 0 ? issues : undefined,
        evaluationStage: evalData.evaluationStage,
        evaluatorName: evalData.evaluatorName,
      });
    }
    
    logger.info(`
📊 분석 결과:
  - 업데이트 필요: ${needUpdateCount}개
  - 이미 업데이트됨: ${alreadyUpdatedCount}개
  - refUserId 매핑 없음: ${notFoundRefUserIdCount}개
  - evaluatorId 매핑 없음: ${notFoundEvaluatorIdCount}개
    `);
    
    // 4. Dry Run이 아니면 실제 업데이트 실행
    if (!dryRun && needUpdateCount > 0) {
      logger.info('🚀 실제 업데이트 시작...');
      
      let updateSuccessCount = 0;
      let updateErrorCount = 0;
      const updateErrors: any[] = [];
      
      // 배치 업데이트 (500개씩)
      const batchSize = 500;
      const needUpdateItems = updateLog.filter(item => item.status === 'NEED_UPDATE');
      
      for (let i = 0; i < needUpdateItems.length; i += batchSize) {
        const batch = db.batch();
        const chunk = needUpdateItems.slice(i, i + batchSize);
        
        for (const item of chunk) {
          try {
            // 업데이트할 필드 준비
            const updateData: any = {
              updatedAt: adminFieldValue.serverTimestamp(),
            };
            
            const migratedData: any = {
              date: adminFieldValue.serverTimestamp(),
            };
            
            // refUserId 업데이트
            if (item.refUserIdNeedsUpdate && item.newRefUserId) {
              updateData.refUserId = item.newRefUserId;
              migratedData.oldRefUserId = item.oldRefUserId;
              migratedData.newRefUserId = item.newRefUserId;
            }
            
            // evaluatorId 업데이트
            if (item.evaluatorIdNeedsUpdate && item.newEvaluatorId) {
              updateData.evaluatorId = item.newEvaluatorId;
              migratedData.oldEvaluatorId = item.oldEvaluatorId;
              migratedData.newEvaluatorId = item.newEvaluatorId;
            }
            
            updateData._migrated = migratedData;
            
            const docRef = db.collection('evaluations').doc(item.evaluationId);
            batch.update(docRef, updateData);
            updateSuccessCount++;
          } catch (error: any) {
            updateErrorCount++;
            updateErrors.push({
              evaluationId: item.evaluationId,
              error: error.message,
            });
            logger.error(`❌ 업데이트 실패 (${item.evaluationId}):`, error);
          }
        }
        
        await batch.commit();
        logger.info(`  ✅ ${i + chunk.length}/${needUpdateItems.length} 업데이트 완료`);
      }
      
      logger.info('✅ 마이그레이션 완료!');
      
      return NextResponse.json({
        success: true,
        dryRun: false,
        message: 'evaluations 참조 필드 마이그레이션이 완료되었습니다.',
        summary: {
          totalEvaluations: evaluationsSnapshot.size,
          needUpdateCount,
          alreadyUpdatedCount,
          notFoundRefUserIdCount,
          notFoundEvaluatorIdCount,
          updateSuccessCount,
          updateErrorCount,
        },
        updateLog: updateLog.slice(0, 50), // 최대 50개만 반환
        errors: updateErrors.length > 0 ? updateErrors.slice(0, 10) : undefined,
      });
      
    } else {
      // Dry Run 결과 반환
      return NextResponse.json({
        success: true,
        dryRun: true,
        message: 'Dry Run 완료. 실제 업데이트를 실행하려면 { "dryRun": false }를 전송하세요.',
        summary: {
          totalEvaluations: evaluationsSnapshot.size,
          needUpdateCount,
          alreadyUpdatedCount,
          notFoundRefUserIdCount,
          notFoundEvaluatorIdCount,
        },
        updateLog: updateLog.slice(0, 50), // 최대 50개만 미리보기
      });
    }
    
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

// GET으로 현재 상태 조회
export async function GET() {
  try {
    const evaluationsSnapshot = await db.collection('evaluations').get();
    
    // Auth UID 형식인지 체크 (28자, 하이픈 없음)
    const isLikelyAuthUid = (id: string) => id && id.length === 28 && !id.includes('-');
    
    const stats = {
      total: evaluationsSnapshot.size,
      likelyUpdated: 0,
      likelyOldRefUserId: 0,
      likelyOldEvaluatorId: 0,
      samples: {
        updated: [] as any[],
        needUpdateRefUserId: [] as any[],
        needUpdateEvaluatorId: [] as any[],
      },
    };
    
    for (const doc of evaluationsSnapshot.docs) {
      const data = doc.data();
      const refUserId = data.refUserId;
      const evaluatorId = data.evaluatorId;
      
      const refUserIdIsOld = refUserId && !isLikelyAuthUid(refUserId);
      const evaluatorIdIsOld = evaluatorId && !isLikelyAuthUid(evaluatorId);
      
      if (!refUserIdIsOld && !evaluatorIdIsOld) {
        // 둘 다 최신 상태
        stats.likelyUpdated++;
        if (stats.samples.updated.length < 3) {
          stats.samples.updated.push({
            id: doc.id,
            refUserId,
            evaluatorId,
            evaluationStage: data.evaluationStage,
          });
        }
      } else {
        // 하나라도 구 ID
        if (refUserIdIsOld) {
          stats.likelyOldRefUserId++;
          if (stats.samples.needUpdateRefUserId.length < 3) {
            stats.samples.needUpdateRefUserId.push({
              id: doc.id,
              refUserId,
              evaluationStage: data.evaluationStage,
            });
          }
        }
        
        if (evaluatorIdIsOld) {
          stats.likelyOldEvaluatorId++;
          if (stats.samples.needUpdateEvaluatorId.length < 3) {
            stats.samples.needUpdateEvaluatorId.push({
              id: doc.id,
              evaluatorId,
              evaluatorName: data.evaluatorName,
              evaluationStage: data.evaluationStage,
            });
          }
        }
      }
    }
    
    const needUpdateCount = stats.likelyOldRefUserId + stats.likelyOldEvaluatorId;
    
    return NextResponse.json({
      success: true,
      stats,
      message: needUpdateCount > 0 
        ? `업데이트 필요: refUserId ${stats.likelyOldRefUserId}개, evaluatorId ${stats.likelyOldEvaluatorId}개`
        : '모든 평가 문서가 최신 상태입니다.',
    });
    
  } catch (error: any) {
    logger.error('❌ 상태 조회 실패:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
