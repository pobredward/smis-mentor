import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { logger } from '@smis-mentor/shared';

/**
 * 만료된 공유 토큰을 비활성화하는 API
 * shareTokens 컬렉션은 client SDK 접근이 금지(rules: false)되어 있으므로
 * 반드시 Admin SDK를 사용해야 합니다.
 *
 * 실행 방법:
 * 1. Vercel Cron Job을 통한 주기적 실행
 * 2. 수동 호출
 * 3. 다른 시스템에서 webhook으로 호출
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.CRON_SECRET;

    if (apiKey && authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json(
        { error: '인증되지 않은 요청입니다.' },
        { status: 401 }
      );
    }

    const adminDb = getAdminFirestore();
    const now = Timestamp.fromDate(new Date());

    // 만료되었지만 아직 활성화된 토큰 조회
    const expiredTokensSnapshot = await adminDb
      .collection('shareTokens')
      .where('isActive', '==', true)
      .where('expiresAt', '<=', now)
      .get();

    if (expiredTokensSnapshot.empty) {
      return NextResponse.json({
        success: true,
        message: '만료된 토큰이 없습니다.',
        deactivatedCount: 0,
      });
    }

    // 배치로 만료된 토큰들을 비활성화
    const batch = adminDb.batch();
    expiredTokensSnapshot.docs.forEach((tokenDoc) => {
      batch.update(tokenDoc.ref, { isActive: false });
    });
    await batch.commit();

    return NextResponse.json({
      success: true,
      message: `${expiredTokensSnapshot.size}개의 만료된 토큰을 비활성화했습니다.`,
      deactivatedCount: expiredTokensSnapshot.size,
    });
  } catch (error) {
    logger.error('만료된 토큰 정리 오류:', error);
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
