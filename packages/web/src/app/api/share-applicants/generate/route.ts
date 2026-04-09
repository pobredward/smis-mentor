import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { shareApplicantsSchema } from '@/lib/validationSchemas';
import { logger } from '@smis-mentor/shared';
import { getAdminFirestore } from '@/lib/firebase-admin';

// Vercel에서 Node.js 런타임 사용 (Firebase Admin SDK 필요)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    logger.info('📝 공유 링크 생성 API 시작');

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
    
    const { jobBoardId, applicationIds, expirationHours, createdBy } = validationResult.data;

    logger.info('✅ 검증 통과, 추출된 값:', { 
      jobBoardId, 
      applicationIds, 
      expirationHours,  
      createdBy,
      createdByType: typeof createdBy,
    });

    // 고유한 토큰 생성 (32바이트 랜덤 문자열)
    const token = randomBytes(32).toString('hex');
    logger.info('🎲 토큰 생성 완료:', token.substring(0, 10) + '...');
    
    // 만료 시간 계산
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expirationHours * 60 * 60 * 1000);
    logger.info('⏰ 만료 시간 계산 완료:', expiresAt.toISOString());

    logger.info('🔥 Firestore 접근 시도...');
    
    // Firestore에 토큰 저장
    let db;
    try {
      db = getAdminFirestore();
      logger.info('✅ Firestore 인스턴스 가져오기 성공');
    } catch (error: any) {
      logger.error('❌ Firestore 인스턴스 가져오기 실패:', {
        message: error.message,
        code: error.code,
      });
      throw error;
    }

    const shareTokenData = {
      token,
      refJobBoardId: jobBoardId,
      refApplicationIds: applicationIds,
      expiresAt,
      createdAt: now,
      createdBy,
      isActive: true,
    };
    logger.info('📄 저장할 데이터:', shareTokenData);

    let shareTokenRef;
    try {
      shareTokenRef = await db.collection('shareTokens').add(shareTokenData);
      logger.info('✅ Firestore에 토큰 저장 완료:', shareTokenRef.id);
    } catch (error: any) {
      logger.error('❌ Firestore 저장 실패:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
      });
      throw error;
    }

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
  } catch (error: any) {
    logger.error('❌ 공유 링크 생성 오류:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      name: error.name,
    });
    return NextResponse.json(
      { 
        error: '공유 링크 생성에 실패했습니다.',
        details: error.message,
        code: error.code,
      },
      { status: 500 }
    );
  }
}
