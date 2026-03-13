import { NextRequest, NextResponse } from 'next/server';
import { collection, query, where, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ShareToken, ApplicationHistory, User, JobBoard } from '@/types';

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

    // 토큰 검증
    const shareTokensRef = collection(db, 'shareTokens');
    const tokenQuery = query(
      shareTokensRef,
      where('token', '==', token),
      where('isActive', '==', true)
    );
    
    const tokenSnapshot = await getDocs(tokenQuery);

    if (tokenSnapshot.empty) {
      return NextResponse.json(
        { error: '유효하지 않은 링크입니다.' },
        { status: 404 }
      );
    }

    const shareTokenDoc = tokenSnapshot.docs[0];
    const shareToken = { id: shareTokenDoc.id, ...shareTokenDoc.data() } as ShareToken;

    // 만료 확인
    const now = new Date();
    const expiresAt = shareToken.expiresAt.toDate();
    
    if (now > expiresAt) {
      return NextResponse.json(
        { error: '만료된 링크입니다.' },
        { status: 410 }
      );
    }

    // JobBoard 정보 조회
    const jobBoardDoc = await getDoc(doc(db, 'jobBoards', shareToken.refJobBoardId));
    if (!jobBoardDoc.exists()) {
      return NextResponse.json(
        { error: '캠프 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
    const jobBoard = { id: jobBoardDoc.id, ...jobBoardDoc.data() } as JobBoard;

    // 지원서 정보 조회
    const applications = await Promise.all(
      shareToken.refApplicationIds.map(async (appId) => {
        const appDoc = await getDoc(doc(db, 'applicationHistories', appId));
        if (!appDoc.exists()) return null;
        
        const appData = appDoc.data() as ApplicationHistory;
        
        // 사용자 정보 조회
        const userDoc = await getDoc(doc(db, 'users', appData.refUserId));
        let userData = null;
        
        if (userDoc.exists()) {
          const rawUserData = userDoc.data();
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
    console.error('지원자 정보 조회 오류:', error);
    return NextResponse.json(
      { error: '지원자 정보를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
