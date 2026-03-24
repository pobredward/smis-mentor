import { NextResponse } from 'next/server';
import { collection, getDocs, query, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET() {
  try {
    console.log('🔍 Firestore 데이터 구조 분석 시작...');

    // 최대 10명의 사용자 샘플
    const q = query(collection(db, 'users'), limit(10));
    const querySnapshot = await getDocs(q);

    const results: any[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      results.push({
        documentId: doc.id,
        userId: data.userId || 'undefined',
        id: data.id || 'undefined',
        email: data.email,
        status: data.status,
        role: data.role,
        authProviders: data.authProviders?.map((p: any) => p.providerId) || [],
        match: {
          docIdEqualsUserId: doc.id === data.userId,
          docIdEqualsId: doc.id === data.id,
          userIdEqualsId: data.userId === data.id,
        },
      });
    });

    // 통계
    const stats = {
      total: results.length,
      docIdMatchesUserId: results.filter(r => r.match.docIdEqualsUserId).length,
      docIdMatchesId: results.filter(r => r.match.docIdEqualsId).length,
      allMatch: results.filter(r => 
        r.match.docIdEqualsUserId && r.match.docIdEqualsId
      ).length,
    };

    return NextResponse.json({
      success: true,
      stats,
      samples: results,
    });
  } catch (error: any) {
    console.error('❌ 분석 실패:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
