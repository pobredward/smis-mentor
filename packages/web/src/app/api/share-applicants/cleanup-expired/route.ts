import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * 만료된 공유 토큰을 비활성화하는 API
 * 
 * 이 API는 다음과 같은 방법으로 실행할 수 있습니다:
 * 1. Vercel Cron Job을 통한 주기적 실행
 * 2. 수동 호출
 * 3. 다른 시스템에서 webhook으로 호출
 */
export async function POST(request: NextRequest) {
  try {
    // 보안을 위한 간단한 API 키 검증 (선택사항)
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.CRON_SECRET;
    
    if (apiKey && authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json(
        { error: '인증되지 않은 요청입니다.' },
        { status: 401 }
      );
    }

    const now = Timestamp.fromDate(new Date());
    
    // 만료되었지만 아직 활성화된 토큰 조회
    const shareTokensRef = collection(db, 'shareTokens');
    const expiredTokensQuery = query(
      shareTokensRef,
      where('isActive', '==', true),
      where('expiresAt', '<=', now)
    );
    
    const expiredTokensSnapshot = await getDocs(expiredTokensQuery);
    
    if (expiredTokensSnapshot.empty) {
      return NextResponse.json({
        success: true,
        message: '만료된 토큰이 없습니다.',
        deactivatedCount: 0,
      });
    }

    // 만료된 토큰들을 비활성화
    const updatePromises = expiredTokensSnapshot.docs.map(async (tokenDoc) => {
      return updateDoc(doc(db, 'shareTokens', tokenDoc.id), {
        isActive: false,
      });
    });

    await Promise.all(updatePromises);

    return NextResponse.json({
      success: true,
      message: `${expiredTokensSnapshot.size}개의 만료된 토큰을 비활성화했습니다.`,
      deactivatedCount: expiredTokensSnapshot.size,
    });
  } catch (error) {
    console.error('만료된 토큰 정리 오류:', error);
    return NextResponse.json(
      { error: '토큰 정리에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// GET 요청으로도 실행 가능하게 (Vercel Cron Job 호환)
export async function GET(request: NextRequest) {
  return POST(request);
}
