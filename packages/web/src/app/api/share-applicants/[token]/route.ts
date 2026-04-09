import { NextRequest, NextResponse } from 'next/server';
import { ShareToken, ApplicationHistory, User, JobBoard } from '@/types';
import { logger } from '@smis-mentor/shared';
import { getAdminFirestore } from '@/lib/firebase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: '토큰이 제공되지 않았습니다.' },
        { status: 400 }
      );
    }

    logger.info('🔍 공유 링크 조회 시작:', token);

    // Admin Firestore 사용
    const db = getAdminFirestore();

    // 토큰 검증
    const tokenSnapshot = await db
      .collection('shareTokens')
      .where('token', '==', token)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (tokenSnapshot.empty) {
      logger.warn('❌ 유효하지 않은 토큰:', token);
      return NextResponse.json(
        { error: '유효하지 않은 링크입니다.' },
        { status: 404 }
      );
    }

    const shareTokenDoc = tokenSnapshot.docs[0];
    const shareTokenData = shareTokenDoc.data();
    const shareToken = {
      id: shareTokenDoc.id,
      ...shareTokenData,
      expiresAt: shareTokenData.expiresAt.toDate(),
    } as ShareToken & { id: string };

    // 만료 확인
    const now = new Date();
    const expiresAt = shareToken.expiresAt;
    
    if (now > expiresAt) {
      logger.warn('❌ 만료된 토큰:', token);
      return NextResponse.json(
        { error: '만료된 링크입니다.' },
        { status: 410 }
      );
    }

    logger.info('✅ 토큰 검증 완료, JobBoard 조회 중...');

    // JobBoard 정보 조회
    const jobBoardDoc = await db.collection('jobBoards').doc(shareToken.refJobBoardId).get();
    if (!jobBoardDoc.exists) {
      logger.warn('❌ JobBoard를 찾을 수 없음:', shareToken.refJobBoardId);
      return NextResponse.json(
        { error: '캠프 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
    const jobBoard = { id: jobBoardDoc.id, ...jobBoardDoc.data() } as JobBoard & { id: string };

    logger.info('✅ JobBoard 조회 완료, 지원서 정보 조회 중...');

    // 지원서 정보 조회
    const applications = await Promise.all(
      shareToken.refApplicationIds.map(async (appId) => {
        const appDoc = await db.collection('applicationHistories').doc(appId).get();
        if (!appDoc.exists) return null;
        
        const appData = appDoc.data() as any;
        
        // 사용자 정보 조회
        const userDoc = await db.collection('users').doc(appData.refUserId).get();
        let userData = null;
        
        if (userDoc.exists) {
          const rawUserData = userDoc.data() as any;
          userData = {
            ...rawUserData,
            id: userDoc.id,
            // Timestamp를 ISO 문자열로 변환
            createdAt: rawUserData.createdAt?.toDate?.()?.toISOString() || null,
            updatedAt: rawUserData.updatedAt?.toDate?.()?.toISOString() || null,
            lastLoginAt: rawUserData.lastLoginAt?.toDate?.()?.toISOString() || null,
            evaluationSummary: rawUserData.evaluationSummary ? {
              ...rawUserData.evaluationSummary,
              documentReview: rawUserData.evaluationSummary.documentReview ? {
                ...rawUserData.evaluationSummary.documentReview,
                lastEvaluatedAt: rawUserData.evaluationSummary.documentReview.lastEvaluatedAt?.toDate?.()?.toISOString() || null,
              } : undefined,
              interview: rawUserData.evaluationSummary.interview ? {
                ...rawUserData.evaluationSummary.interview,
                lastEvaluatedAt: rawUserData.evaluationSummary.interview.lastEvaluatedAt?.toDate?.()?.toISOString() || null,
              } : undefined,
              faceToFaceEducation: rawUserData.evaluationSummary.faceToFaceEducation ? {
                ...rawUserData.evaluationSummary.faceToFaceEducation,
                lastEvaluatedAt: rawUserData.evaluationSummary.faceToFaceEducation.lastEvaluatedAt?.toDate?.()?.toISOString() || null,
              } : undefined,
              campLife: rawUserData.evaluationSummary.campLife ? {
                ...rawUserData.evaluationSummary.campLife,
                lastEvaluatedAt: rawUserData.evaluationSummary.campLife.lastEvaluatedAt?.toDate?.()?.toISOString() || null,
              } : undefined,
              lastUpdatedAt: rawUserData.evaluationSummary.lastUpdatedAt?.toDate?.()?.toISOString() || null,
            } : undefined,
          };
        }
        
        return {
          id: appDoc.id,
          ...appData,
          // Timestamp를 ISO 문자열로 변환
          applicationDate: appData.applicationDate?.toDate?.()?.toISOString() || null,
          interviewDate: appData.interviewDate?.toDate?.()?.toISOString() || null,
          createdAt: appData.createdAt?.toDate?.()?.toISOString() || null,
          updatedAt: appData.updatedAt?.toDate?.()?.toISOString() || null,
          user: userData,
        };
      })
    );

    // null 제거
    const validApplications = applications.filter(app => app !== null);

    logger.info('✅ 지원자 정보 조회 완료:', validApplications.length);

    return NextResponse.json({
      success: true,
      jobBoard: {
        id: jobBoard.id,
        title: jobBoard.title,
        generation: jobBoard.generation,
        jobCode: jobBoard.jobCode,
      },
      applications: validApplications,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    logger.error('❌ 지원자 정보 조회 오류:', error);
    return NextResponse.json(
      { error: '지원자 정보를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
