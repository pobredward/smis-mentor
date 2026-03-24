import { NextResponse } from 'next/server';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET() {
  try {
    console.log('🔍 전체 사용자 데이터 일관성 검사 시작...');

    const querySnapshot = await getDocs(collection(db, 'users'));

    const allUsers: any[] = [];
    const inconsistentUsers: any[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const analysis = {
        documentId: doc.id,
        userId: data.userId || 'undefined',
        id: data.id || 'undefined',
        email: data.email || 'no-email',
        name: data.name,
        status: data.status,
        role: data.role,
        authProviders: data.authProviders?.map((p: any) => p.providerId) || [],
        isConsistent: doc.id === data.userId && doc.id === data.id,
        mismatch: {
          docIdVsUserId: doc.id !== data.userId,
          docIdVsId: doc.id !== data.id,
        },
      };

      allUsers.push(analysis);

      if (!analysis.isConsistent) {
        inconsistentUsers.push(analysis);
      }
    });

    // 통계
    const stats = {
      total: allUsers.length,
      consistent: allUsers.filter(u => u.isConsistent).length,
      inconsistent: inconsistentUsers.length,
      inconsistentPercentage: ((inconsistentUsers.length / allUsers.length) * 100).toFixed(2) + '%',
      byStatus: {
        active: inconsistentUsers.filter(u => u.status === 'active').length,
        temp: inconsistentUsers.filter(u => u.status === 'temp').length,
      },
      byRole: {
        mentor: inconsistentUsers.filter(u => u.role === 'mentor' || u.role === 'mentor_temp').length,
        foreign: inconsistentUsers.filter(u => u.role === 'foreign' || u.role === 'foreign_temp').length,
      },
    };

    return NextResponse.json({
      success: true,
      stats,
      inconsistentUsers: inconsistentUsers.sort((a, b) => {
        // active 먼저, 그 다음 이메일 있는 순
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (a.status !== 'active' && b.status === 'active') return 1;
        if (a.email && !b.email) return -1;
        if (!a.email && b.email) return 1;
        return 0;
      }),
    });
  } catch (error: any) {
    console.error('❌ 분석 실패:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
