import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore, adminFieldValue } from '@/lib/firebase-admin';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';

/**
 * 관리자가 지원자의 지원장소를 변경하는 API
 * POST /api/admin/change-job-board
 * 
 * Body:
 * - applicationId: 변경할 지원 내역 ID
 * - newJobBoardId: 새로운 채용 공고 ID
 */
export async function POST(req: NextRequest) {
  try {
    // 1. 인증 확인
    const authContext = await getAuthenticatedUser(req);
    
    const adminCheck = requireAdmin(authContext);
    if (adminCheck) {
      return adminCheck;
    }

    const adminData = authContext!.user;
    const db = getAdminFirestore();

    // 2. 요청 데이터 파싱
    const body = await req.json();
    const { applicationId, newJobBoardId } = body;

    if (!applicationId || !newJobBoardId) {
      return NextResponse.json(
        { error: 'applicationId와 newJobBoardId가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log(`🔄 [API] 지원장소 변경 시작: applicationId=${applicationId}, newJobBoardId=${newJobBoardId}`);

    // 3. 변경 전 정보 조회 (감사 로그용)
    const applicationDoc = await db.collection('applicationHistories').doc(applicationId).get();
    if (!applicationDoc.exists) {
      return NextResponse.json(
        { error: '지원 내역을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const applicationData = applicationDoc.data();
    const oldJobBoardId = applicationData?.refJobBoardId;

    if (oldJobBoardId === newJobBoardId) {
      return NextResponse.json(
        { error: '동일한 채용 공고로는 변경할 수 없습니다.' },
        { status: 400 }
      );
    }

    // 이전/새 JobBoard 정보 조회
    const [oldJobBoardDoc, newJobBoardDoc, targetUserDoc] = await Promise.all([
      db.collection('jobBoards').doc(oldJobBoardId).get(),
      db.collection('jobBoards').doc(newJobBoardId).get(),
      db.collection('users').doc(applicationData?.refUserId).get()
    ]);

    if (!newJobBoardDoc.exists) {
      return NextResponse.json(
        { error: '변경하려는 채용 공고를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const oldJobBoardData = oldJobBoardDoc.exists ? oldJobBoardDoc.data() : null;
    const newJobBoardData = newJobBoardDoc.exists ? newJobBoardDoc.data() : null;
    const targetUserData = targetUserDoc.exists ? targetUserDoc.data() : null;

    // 4. applicationHistories 업데이트
    await db.collection('applicationHistories').doc(applicationId).update({
      refJobBoardId: newJobBoardId,
      updatedAt: adminFieldValue.serverTimestamp(),
    });

    console.log(`✅ [API] applicationHistories 업데이트 완료`);

    // 5. 연관된 evaluations 조회 및 업데이트
    const evaluationsSnapshot = await db.collection('evaluations')
      .where('refApplicationId', '==', applicationId)
      .get();

    console.log(`📊 [API] 연관된 평가 ${evaluationsSnapshot.size}개 발견`);

    // Batch로 모든 evaluation 업데이트
    const batch = db.batch();
    evaluationsSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, {
        refJobBoardId: newJobBoardId,
        updatedAt: adminFieldValue.serverTimestamp(),
      });
    });
    await batch.commit();

    console.log(`✅ [API] 모든 평가 업데이트 완료`);

    const result = {
      updatedApplications: 1,
      updatedEvaluations: evaluationsSnapshot.size,
    };

    // 6. 통계 재계산 (백그라운드)
    Promise.all([
      recalculateJobBoardStats(db, oldJobBoardId).catch(err => 
        console.error('⚠️ 이전 JobBoard 통계 재계산 실패:', err)
      ),
      recalculateJobBoardStats(db, newJobBoardId).catch(err => 
        console.error('⚠️ 새 JobBoard 통계 재계산 실패:', err)
      )
    ]);

    // 7. 감사 로그 기록
    try {
      await db.collection('auditLogs').add({
        action: 'APPLICATION_JOB_BOARD_CHANGE',
        category: 'APPLICATION_MANAGEMENT',
        applicationId,
        targetUserId: applicationData?.refUserId,
        targetUserData: targetUserData ? {
          name: targetUserData.name,
          email: targetUserData.email,
          role: targetUserData.role,
        } : null,
        oldJobBoardId,
        oldJobBoardData: oldJobBoardData ? {
          title: oldJobBoardData.title,
          generation: oldJobBoardData.generation,
          jobCode: oldJobBoardData.jobCode,
        } : null,
        newJobBoardId,
        newJobBoardData: newJobBoardData ? {
          title: newJobBoardData.title,
          generation: newJobBoardData.generation,
          jobCode: newJobBoardData.jobCode,
        } : null,
        performedBy: adminData.userId,
        performedByData: {
          name: adminData.name,
          email: adminData.email,
        },
        result: {
          updatedApplications: result.updatedApplications,
          updatedEvaluations: result.updatedEvaluations,
        },
        timestamp: adminFieldValue.serverTimestamp(),
        createdAt: adminFieldValue.serverTimestamp(),
        metadata: {
          userAgent: req.headers.get('user-agent'),
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
        },
      });
    } catch (logError) {
      console.error('⚠️ 감사 로그 기록 실패 (변경은 완료됨):', logError);
    }

    // 8. 성공 응답
    return NextResponse.json({
      success: true,
      message: '지원장소가 성공적으로 변경되었습니다.',
      data: result,
    });
  } catch (error: any) {
    console.error('❌ [API] 지원장소 변경 실패:', error);

    return NextResponse.json(
      { 
        error: error.message || '지원장소 변경 중 오류가 발생했습니다.',
        details: error.toString() 
      },
      { status: 500 }
    );
  }
}

/**
 * JobBoard별 지원자 통계 재계산 (Admin SDK 버전)
 */
async function recalculateJobBoardStats(
  db: FirebaseFirestore.Firestore,
  jobBoardId: string
): Promise<void> {
  try {
    console.log(`📊 [recalculateJobBoardStats] 통계 재계산 시작: jobBoardId=${jobBoardId}`);

    const applicationsSnapshot = await db.collection('applicationHistories')
      .where('refJobBoardId', '==', jobBoardId)
      .get();

    const stats = {
      totalApplications: applicationsSnapshot.size,
      pendingCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      interviewScheduledCount: 0,
      interviewPassedCount: 0,
      finalAcceptedCount: 0,
    };

    applicationsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      
      if (data.applicationStatus === 'pending') stats.pendingCount++;
      if (data.applicationStatus === 'accepted') stats.acceptedCount++;
      if (data.applicationStatus === 'rejected') stats.rejectedCount++;
      
      if (data.interviewStatus === 'pending' || data.interviewStatus === 'complete') {
        stats.interviewScheduledCount++;
      }
      if (data.interviewStatus === 'passed') stats.interviewPassedCount++;
      
      if (data.finalStatus === 'finalAccepted') stats.finalAcceptedCount++;
    });

    console.log(`✅ [recalculateJobBoardStats] 통계 재계산 완료:`, stats);
  } catch (error) {
    console.error('❌ [recalculateJobBoardStats] 통계 재계산 실패:', error);
    throw error;
  }
}
