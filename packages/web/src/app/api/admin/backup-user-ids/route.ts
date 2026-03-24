import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth, adminFieldValue } from '@/lib/firebase-admin';

export async function POST() {
  try {
    console.log('🔄 사용자 ID 매핑 백업 시작...');
    
    const db = getAdminFirestore();
    const auth = getAdminAuth();
    
    const usersSnapshot = await db.collection('users').get();
    const backupCollectionRef = db.collection('user_id_mappings_backup');
    
    let successCount = 0;
    let errorCount = 0;
    const errors: any[] = [];
    
    // 배치 작업을 위한 배열
    const mappings: any[] = [];
    
    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data();
        const firestoreDocId = userDoc.id;
        
        // Firebase Auth에서 이메일로 UID 조회
        let authUid = null;
        let authEmail = null;
        
        if (userData.email) {
          try {
            const authUser = await auth.getUserByEmail(userData.email);
            authUid = authUser.uid;
            authEmail = authUser.email;
          } catch (authError: any) {
            if (authError.code !== 'auth/user-not-found') {
              console.warn(`Auth 조회 실패 (${userData.email}):`, authError.message);
            }
          }
        }
        
        const mapping = {
          // Primary IDs
          firestoreDocId,
          firestoreUserId: userData.userId || null,
          firestoreIdField: userData.id || null,
          firebaseAuthUid: authUid,
          
          // User Info (for reference)
          email: userData.email || null,
          name: userData.name || null,
          phoneNumber: userData.phoneNumber || null,
          status: userData.status || null,
          role: userData.role || null,
          
          // Metadata
          backupDate: adminFieldValue.serverTimestamp(),
          isConsistent: firestoreDocId === userData.userId && 
                        firestoreDocId === userData.id && 
                        firestoreDocId === authUid,
          hasAuthAccount: authUid !== null,
          
          // Issues
          issues: [] as string[],
        };
        
        // 문제점 기록
        if (firestoreDocId !== userData.userId) {
          mapping.issues.push('firestoreDocId ≠ userId');
        }
        if (firestoreDocId !== userData.id) {
          mapping.issues.push('firestoreDocId ≠ id');
        }
        if (authUid && firestoreDocId !== authUid) {
          mapping.issues.push('firestoreDocId ≠ authUid');
        }
        if (!authUid) {
          mapping.issues.push('No Firebase Auth account');
        }
        
        mappings.push(mapping);
        successCount++;
        
      } catch (error: any) {
        errorCount++;
        errors.push({
          docId: userDoc.id,
          email: userDoc.data().email,
          error: error.message,
        });
        console.error(`❌ 사용자 처리 실패 (${userDoc.id}):`, error);
      }
    }
    
    // 배치로 저장 (Firestore는 한 번에 500개까지 가능)
    console.log(`💾 ${mappings.length}개 매핑 데이터 저장 중...`);
    
    const batchSize = 500;
    for (let i = 0; i < mappings.length; i += batchSize) {
      const batch = db.batch();
      const chunk = mappings.slice(i, i + batchSize);
      
      for (const mapping of chunk) {
        // Document ID는 Firestore Document ID를 사용
        const docRef = backupCollectionRef.doc(mapping.firestoreDocId);
        batch.set(docRef, mapping);
      }
      
      await batch.commit();
      console.log(`  ✅ ${i + chunk.length}/${mappings.length} 저장 완료`);
    }
    
    // 백업 메타데이터 저장
    await db.collection('user_id_mappings_backup_metadata').doc('latest').set({
      backupDate: adminFieldValue.serverTimestamp(),
      totalUsers: usersSnapshot.size,
      successCount,
      errorCount,
      errors: errors.slice(0, 10), // 최대 10개 에러만 저장
      statistics: {
        totalConsistent: mappings.filter(m => m.isConsistent).length,
        totalInconsistent: mappings.filter(m => !m.isConsistent).length,
        noAuthAccount: mappings.filter(m => !m.hasAuthAccount).length,
        docIdNotEqualUserId: mappings.filter(m => m.issues.includes('firestoreDocId ≠ userId')).length,
        docIdNotEqualId: mappings.filter(m => m.issues.includes('firestoreDocId ≠ id')).length,
        docIdNotEqualAuthUid: mappings.filter(m => m.issues.includes('firestoreDocId ≠ authUid')).length,
      },
    });
    
    console.log('✅ 백업 완료!');
    
    return NextResponse.json({
      success: true,
      message: 'ID 매핑 백업이 완료되었습니다.',
      summary: {
        totalUsers: usersSnapshot.size,
        successCount,
        errorCount,
        backupCollection: 'user_id_mappings_backup',
        consistent: mappings.filter(m => m.isConsistent).length,
        inconsistent: mappings.filter(m => !m.isConsistent).length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
    
  } catch (error: any) {
    console.error('❌ 백업 실패:', error);
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

// GET으로 백업 상태 조회
export async function GET() {
  try {
    const db = getAdminFirestore();
    
    const metadataDoc = await db.collection('user_id_mappings_backup_metadata').doc('latest').get();
    
    if (!metadataDoc.exists) {
      return NextResponse.json({
        success: true,
        hasBackup: false,
        message: '백업이 존재하지 않습니다. POST 요청으로 백업을 생성하세요.',
      });
    }
    
    const metadata = metadataDoc.data();
    const backupCount = (await db.collection('user_id_mappings_backup').count().get()).data().count;
    
    return NextResponse.json({
      success: true,
      hasBackup: true,
      metadata,
      backupCount,
    });
    
  } catch (error: any) {
    console.error('❌ 백업 상태 조회 실패:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
