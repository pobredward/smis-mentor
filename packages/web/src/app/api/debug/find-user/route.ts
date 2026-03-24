import { NextResponse } from 'next/server';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email') || 'architronic00@naver.com';

    console.log('🔍 사용자 조회:', email);

    const q = query(collection(db, 'users'), where('email', '==', email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return NextResponse.json({
        success: false,
        message: '사용자를 찾을 수 없습니다.',
      });
    }

    const doc = querySnapshot.docs[0];
    const data = doc.data();

    const result = {
      documentId: doc.id,
      userId: data.userId || 'undefined',
      id: data.id || 'undefined',
      email: data.email,
      name: data.name,
      status: data.status,
      role: data.role,
      authProviders: data.authProviders?.map((p: any) => ({
        providerId: p.providerId,
        email: p.email,
      })) || [],
      match: {
        docIdEqualsUserId: doc.id === data.userId,
        docIdEqualsId: doc.id === data.id,
        userIdEqualsId: data.userId === data.id,
      },
    };

    return NextResponse.json({
      success: true,
      user: result,
    });
  } catch (error: any) {
    console.error('❌ 조회 실패:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
