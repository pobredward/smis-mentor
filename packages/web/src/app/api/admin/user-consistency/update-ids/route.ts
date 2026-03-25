import { NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth } from '@/lib/firebase-admin';

interface UpdateIdsRequest {
  currentDocId: string;
  newId: string;
}

export async function POST(request: Request) {
  try {
    const { currentDocId, newId }: UpdateIdsRequest = await request.json();

    // 입력 검증
    if (!currentDocId || !newId) {
      return NextResponse.json(
        { success: false, error: '현재 Document ID와 새로운 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    if (currentDocId === newId) {
      return NextResponse.json(
        { success: false, error: '현재 ID와 새로운 ID가 동일합니다.' },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const auth = getAdminAuth();

    console.log(`🔄 사용자 ID 변경 시작: ${currentDocId} → ${newId}`);

    // 1. 현재 Firestore 문서 조회
    const currentDocRef = db.collection('users').doc(currentDocId);
    const currentDocSnap = await currentDocRef.get();

    if (!currentDocSnap.exists) {
      return NextResponse.json(
        { success: false, error: `현재 Document ID(${currentDocId})를 가진 사용자가 존재하지 않습니다.` },
        { status: 404 }
      );
    }

    const userData = currentDocSnap.data();
    if (!userData) {
      return NextResponse.json(
        { success: false, error: '사용자 데이터를 읽을 수 없습니다.' },
        { status: 500 }
      );
    }

    // 2. 새로운 ID로 이미 문서가 존재하는지 확인
    const newDocRef = db.collection('users').doc(newId);
    const newDocSnap = await newDocRef.get();

    if (newDocSnap.exists) {
      return NextResponse.json(
        { success: false, error: `새로운 ID(${newId})가 이미 사용 중입니다.` },
        { status: 409 }
      );
    }

    // 3. Firebase Auth UID 확인
    let authUid = currentDocId;
    try {
      const authUser = await auth.getUser(currentDocId);
      authUid = authUser.uid;
      console.log(`✅ Firebase Auth 사용자 확인: ${authUid}`);
    } catch (error) {
      console.warn(`⚠️ Firebase Auth에서 사용자를 찾을 수 없습니다: ${currentDocId}`);
      // Auth에 없어도 Firestore는 수정 가능
    }

    // 4. 트랜잭션으로 안전하게 변경
    await db.runTransaction(async (transaction) => {
      // 4-1. 새로운 Document ID로 데이터 복사 (모든 필드 + id, userId 업데이트)
      const updatedUserData = {
        ...userData,
        id: newId,
        userId: newId,
        updatedAt: new Date(),
      };

      transaction.set(newDocRef, updatedUserData);

      // 4-2. 기존 Document 삭제
      transaction.delete(currentDocRef);

      console.log(`📝 Firestore 트랜잭션 완료: Document ID 변경 (${currentDocId} → ${newId})`);
    });

    // 5. Firebase Auth UID 업데이트 (가능한 경우)
    if (authUid === currentDocId && authUid !== newId) {
      try {
        // Firebase Auth의 UID는 변경할 수 없으므로, 
        // Custom Claims에 새로운 ID를 저장하거나 로그만 남김
        console.log(`⚠️ Firebase Auth UID(${authUid})는 변경할 수 없습니다.`);
        console.log(`📌 Firestore Document ID만 ${newId}로 변경되었습니다.`);
        console.log(`💡 Auth UID와 일치시키려면 사용자가 재가입하거나 수동으로 Auth 사용자를 삭제/재생성해야 합니다.`);
      } catch (error) {
        console.warn('Firebase Auth 업데이트 실패:', error);
      }
    }

    // 6. 관련 컬렉션 업데이트 (필요한 경우)
    const relatedCollections = [
      'evaluations',
      'applicationHistories',
      'reviews',
      'tasks',
      'campAttendances',
      'patientRecords',
    ];

    for (const collectionName of relatedCollections) {
      try {
        // refUserId 필드가 있는 문서들 업데이트
        const relatedDocsSnapshot = await db
          .collection(collectionName)
          .where('refUserId', '==', currentDocId)
          .get();

        if (!relatedDocsSnapshot.empty) {
          const batch = db.batch();
          relatedDocsSnapshot.docs.forEach((doc) => {
            batch.update(doc.ref, { refUserId: newId });
          });
          await batch.commit();
          console.log(`✅ ${collectionName} 컬렉션 업데이트 완료 (${relatedDocsSnapshot.size}건)`);
        }
      } catch (error) {
        console.warn(`⚠️ ${collectionName} 컬렉션 업데이트 실패:`, error);
      }
    }

    console.log('✅ 사용자 ID 변경 완료');

    return NextResponse.json({
      success: true,
      message: '사용자 ID가 성공적으로 변경되었습니다.',
      oldId: currentDocId,
      newId: newId,
      authNote: authUid !== newId 
        ? 'Firebase Auth UID는 변경되지 않았습니다. Auth UID와 일치시키려면 수동 작업이 필요합니다.'
        : undefined,
    });
  } catch (error: any) {
    console.error('❌ 사용자 ID 변경 실패:', error);
    return NextResponse.json(
      { success: false, error: error.message || '사용자 ID 변경 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
