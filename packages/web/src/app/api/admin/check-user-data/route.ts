import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// 환경 변수 검증
const requiredEnvVars = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ 필수 환경 변수 누락:', missingVars);
  throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
}

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
    });
    console.log('✅ Firebase Admin SDK 초기화 성공');
  } catch (error: any) {
    console.error('❌ Firebase Admin SDK 초기화 실패:', error);
    throw new Error(`Firebase Admin SDK initialization failed: ${error.message}`);
  }
}

const db = getFirestore();

/**
 * 사용자 삭제 전 관련 데이터 확인
 * GET /api/admin/check-user-data?userId=xxx
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const adminUserId = searchParams.get('adminUserId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId가 필요합니다.' },
        { status: 400 }
      );
    }

    if (!adminUserId) {
      return NextResponse.json(
        { error: '관리자 인증이 필요합니다.' },
        { status: 401 }
      );
    }

    console.log(`📊 사용자 데이터 확인: ${userId}`);

    // 관리자 권한 체크
    const adminDoc = await db.collection('users').doc(adminUserId).get();
    
    if (!adminDoc.exists || adminDoc.data()?.role !== 'admin') {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      );
    }

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

    console.log('📊 사용자 데이터 통계:', {
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
    console.error('❌ 사용자 데이터 확인 실패:', {
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
