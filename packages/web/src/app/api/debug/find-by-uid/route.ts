import { NextResponse } from 'next/server';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get('uid');

    if (!uid) {
      return NextResponse.json({
        success: false,
        message: 'UID parameter is required',
      });
    }

    console.log('🔍 UID로 사용자 조회:', uid);

    // 1. 문서 ID로 직접 조회
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      return NextResponse.json({
        success: true,
        found: 'by_document_id',
        user: {
          documentId: docSnap.id,
          ...data,
        },
      });
    }

    // 2. userId 필드로 쿼리 조회
    const q = query(collection(db, 'users'), where('userId', '==', uid));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      const data = doc.data();
      return NextResponse.json({
        success: true,
        found: 'by_userId_field',
        user: {
          documentId: doc.id,
          ...data,
        },
      });
    }

    // 3. 못 찾음
    return NextResponse.json({
      success: false,
      found: 'not_found',
      message: `UID ${uid}로 Firestore에서 사용자를 찾을 수 없습니다.`,
      searchMethods: [
        'document_id',
        'userId_field'
      ],
    });
  } catch (error: any) {
    console.error('❌ 조회 실패:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
