import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { shareApplicantsSchema } from '@/lib/validationSchemas';
import { logger } from '@smis-mentor/shared';
import { getAuthenticatedUser, requireMentor } from '@/lib/authMiddleware';
import { getAdminFirestore } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    logger.info('📝 공유 링크 생성 API 시작');
    
    const authContext = await getAuthenticatedUser(request);
    
    const mentorCheck = requireMentor(authContext);
    if (mentorCheck) {
      logger.warn('❌ 권한 부족');
      return mentorCheck;
    }

    const body = await request.json();
    logger.info('📦 요청 본문:', body);
    
    // Zod 스키마 검증
    const validationResult = shareApplicantsSchema.safeParse(body);
    if (!validationResult.success) {
      logger.warn('❌ 검증 실패:', validationResult.error);
      return NextResponse.json(
        { 
          error: validationResult.error.errors[0].message,
          errors: validationResult.error.errors
        },
        { status: 400 }
      );
    }
    
    const { jobBoardId, applicationIds, expirationHours } = validationResult.data;
    const createdBy = authContext!.user.userId || authContext!.user.id;

    logger.info('✅ 검증 통과, 토큰 생성 중...');

    // 고유한 토큰 생성 (32바이트 랜덤 문자열)
    const token = randomBytes(32).toString('hex');
    
    // 만료 시간 계산
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expirationHours * 60 * 60 * 1000);

    // Admin Firestore 사용
    const db = getAdminFirestore();
    const shareTokenRef = await db.collection('shareTokens').add({
      token,
      refJobBoardId: jobBoardId,
      refApplicationIds: applicationIds,
      expiresAt,
      createdAt: now,
      createdBy,
      isActive: true,
    });

    logger.info('✅ Firestore에 토큰 저장 완료:', shareTokenRef.id);

    // 공유 URL 생성
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.smis-mentor.com';
    const shareUrl = `${baseUrl}/shared/applicants/${token}`;

    logger.info('✅ 공유 링크 생성 성공:', shareUrl);

    return NextResponse.json({
      success: true,
      token,
      shareUrl,
      expiresAt: expiresAt.toISOString(),
      tokenId: shareTokenRef.id,
    });
  } catch (error) {
    logger.error('❌ 공유 링크 생성 오류:', error);
    return NextResponse.json(
      { error: '공유 링크 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
