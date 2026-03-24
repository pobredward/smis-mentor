import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth, adminFieldValue } from '@/lib/firebase-admin';

export async function POST(request: Request) {
  try {
    const db = getAdminFirestore();
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';
    
    console.log('🔄 참조 필드 업데이트 시작...');
    console.log(`📋 모드: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
    
    const results: any = {
      evaluations: { total: 0, updated: 0, skipped: 0, failed: 0 },
      lessonMaterials: { total: 0, updated: 0, skipped: 0, failed: 0 },
    };
    
    // 백업 테이블에서 ID 매핑 로드
    const mappingsSnapshot = await db.collection('user_id_mappings_backup').get();
    const idMapping = new Map<string, string>();  // oldId -> newId
    
    mappingsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.firebaseAuthUid && data.firestoreDocId !== data.firebaseAuthUid) {
        idMapping.set(data.firestoreDocId, data.firebaseAuthUid);
      }
    });
    
    console.log(`📋 ID 매핑 로드: ${idMapping.size}개`);
    
    // 1. evaluations 업데이트
    console.log('\n1️⃣  evaluations.evaluatorId 업데이트 중...');
    const evaluationsSnapshot = await db.collection('evaluations').get();
    results.evaluations.total = evaluationsSnapshot.size;
    
    for (const evalDoc of evaluationsSnapshot.docs) {
      try {
        const data = evalDoc.data();
        const oldEvaluatorId = data.evaluatorId;
        
        if (!oldEvaluatorId) {
          results.evaluations.skipped++;
          continue;
        }
        
        const newEvaluatorId = idMapping.get(oldEvaluatorId);
        
        if (!newEvaluatorId) {
          // 이미 새 ID이거나 매핑 없음
          results.evaluations.skipped++;
          continue;
        }
        
        console.log(`  🔄 ${evalDoc.id}: ${oldEvaluatorId} → ${newEvaluatorId}`);
        
        if (!dryRun) {
          await evalDoc.ref.update({
            evaluatorId: newEvaluatorId,
            migratedAt: adminFieldValue.serverTimestamp(),
          });
        }
        
        results.evaluations.updated++;
        
      } catch (error: any) {
        console.error(`  ❌ 실패 (${evalDoc.id}):`, error.message);
        results.evaluations.failed++;
      }
    }
    
    // 2. lessonMaterials 업데이트
    console.log('\n2️⃣  lessonMaterials.userId 업데이트 중...');
    const materialsSnapshot = await db.collection('lessonMaterials').get();
    results.lessonMaterials.total = materialsSnapshot.size;
    
    for (const materialDoc of materialsSnapshot.docs) {
      try {
        const data = materialDoc.data();
        const oldUserId = data.userId;
        
        if (!oldUserId) {
          results.lessonMaterials.skipped++;
          continue;
        }
        
        const newUserId = idMapping.get(oldUserId);
        
        if (!newUserId) {
          results.lessonMaterials.skipped++;
          continue;
        }
        
        console.log(`  🔄 ${materialDoc.id}: ${oldUserId} → ${newUserId}`);
        
        if (!dryRun) {
          await materialDoc.ref.update({
            userId: newUserId,
            migratedAt: adminFieldValue.serverTimestamp(),
          });
        }
        
        results.lessonMaterials.updated++;
        
      } catch (error: any) {
        console.error(`  ❌ 실패 (${materialDoc.id}):`, error.message);
        results.lessonMaterials.failed++;
      }
    }
    
    console.log('\n✅ 참조 필드 업데이트 완료');
    console.log(results);
    
    return NextResponse.json({
      success: true,
      dryRun,
      results,
    });
    
  } catch (error: any) {
    console.error('❌ 참조 업데이트 실패:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
