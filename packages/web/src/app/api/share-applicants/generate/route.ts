import { NextRequest, NextResponse } from 'next/server';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { randomBytes } from 'crypto';
import { shareApplicantsSchema } from '@/lib/validationSchemas';
import { logger } from '@smis-mentor/shared';
import { getAuthenticatedUser, requireMentor } from '@/lib/authMiddleware';

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthenticatedUser(request);
    
    const mentorCheck = requireMentor(authContext);
    if (mentorCheck) {
      return mentorCheck;
    }

    const body = await request.json();
    
    // Zod 스키마 검증
    const validationResult = shareApplicantsSchema.safeParse(body);
    if (!validationResult.success) {
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

    // 고유한 토큰 생성 (32바이트 랜덤 문자열)
    const token = randomBytes(32).toString('hex');
    
    // 만료 시간 계산
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expirationHours * 60 * 60 * 1000);

    // Firestore에 토큰 저장
    const shareTokenRef = await addDoc(collection(db, 'shareTokens'), {
      token,
      refJobBoardId: jobBoardId,
      refApplicationIds: applicationIds,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: Timestamp.fromDate(now),
      createdBy,
      isActive: true,
    });

    // 공유 URL 생성
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.smis-mentor.com';
    const shareUrl = `${baseUrl}/shared/applicants/${token}`;

    return NextResponse.json({
      success: true,
      token,
      shareUrl,
      expiresAt: expiresAt.toISOString(),
      tokenId: shareTokenRef.id,
    });
  } catch (error) {
    logger.error('공유 링크 생성 오류:', error);
    return NextResponse.json(
      { error: '공유 링크 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
