import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth, adminFieldValue } from '@/lib/firebase-admin';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';

/**
 * 사용자 삭제 전 관련 데이터 확인
 * GET /api/admin/check-user-data?userId=xxx
 */
export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthenticatedUser(request);
    
    const adminCheck = requireAdmin(authContext);
    if (adminCheck) {
      return adminCheck;
    }

    const db = getAdminFirestore();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId가 필요합니다.' },
        { status: 400 }
      );
    }

    logger.info(`📊 사용자 데이터 확인: ${userId}`);

    // 병렬로 데이터 확인
    const [evaluationsCount, applicationsCount, tasksCount, smsTemplatesCount] = await Promise.all([
      // 평가 기록 (evaluatorId)
      db.collection('evaluations')
        .where('evaluatorId', '==', userId)
        .count()
        .get()
        .then(snapshot => snapshot.data().count),
      
      // 지원서 (refUserId)
      db.collection('applications')
        .where('refUserId', '==', userId)
        .count()
        .get()
        .then(snapshot => snapshot.data().count),
      
      // 캠프 업무 (createdBy)
      db.collection('tasks')
        .where('createdBy', '==', userId)
        .count()
        .get()
        .then(snapshot => snapshot.data().count),
      
      // SMS 템플릿 (createdBy)
      db.collection('smsTemplates')
        .where('createdBy', '==', userId)
        .count()
        .get()
        .then(snapshot => snapshot.data().count)
        .catch(() => 0), // smsTemplates이 없을 수 있음
    ]);

    const totalDataCount = evaluationsCount + applicationsCount + tasksCount + smsTemplatesCount;

    logger.info('📊 사용자 데이터 통계:', {
      userId,
      evaluationsCount,
      applicationsCount,
      tasksCount,
      smsTemplatesCount,
      totalDataCount,
    });

    return NextResponse.json({
      success: true,
      userId,
      data: {
        evaluations: evaluationsCount,
        applications: applicationsCount,
        tasks: tasksCount,
        smsTemplates: smsTemplatesCount,
        total: totalDataCount,
      },
      hasData: totalDataCount > 0,
      warning: totalDataCount > 0 
        ? `이 사용자는 ${evaluationsCount}개의 평가, ${applicationsCount}개의 지원서, ${tasksCount}개의 업무, ${smsTemplatesCount}개의 SMS 템플릿을 작성했습니다.`
        : null,
    });

  } catch (error: any) {
    logger.error('❌ 사용자 데이터 확인 실패:', {
      error: error.message,
      code: error.code,
      timestamp: new Date().toISOString(),
    });
    
    return NextResponse.json(
      { 
        error: '사용자 데이터 확인 중 오류가 발생했습니다.',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
