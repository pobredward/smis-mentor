import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';

/**
 * 프로덕션 환경 변수 검증 API
 * 관리자만 접근 가능
 */
export async function GET(request: NextRequest) {
  try {
    // 관리자 권한 확인
    const authContext = await getAuthenticatedUser(request);
    const adminCheck = requireAdmin(authContext);
    if (adminCheck) {
      return adminCheck;
    }

    // 환경 변수 존재 여부만 체크 (실제 값은 보안상 노출하지 않음)
    const envCheck = {
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      
      // Firebase Admin SDK
      firebase: {
        hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
        hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
        hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
        privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length || 0,
        projectId: process.env.FIREBASE_PROJECT_ID, // Project ID는 민감하지 않으므로 표시
      },
      
      // Naver Cloud SMS
      naverSms: {
        hasServiceId: !!process.env.NAVER_CLOUD_SMS_SERVICE_ID,
        hasAccessKey: !!process.env.NAVER_CLOUD_SMS_ACCESS_KEY,
        hasSecretKey: !!process.env.NAVER_CLOUD_SMS_SECRET_KEY,
      },
      
      // Firebase Client (Public)
      firebaseClient: {
        hasApiKey: !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        hasAuthDomain: !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      },
      
      // 전체 상태
      allRequired: checkAllRequired(),
    };

    return NextResponse.json({
      success: true,
      data: envCheck,
      message: envCheck.allRequired 
        ? '✅ 모든 필수 환경 변수가 설정되었습니다.' 
        : '⚠️ 일부 환경 변수가 누락되었습니다.',
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        success: false, 
        message: '환경 변수 확인 중 오류 발생',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

function checkAllRequired(): boolean {
  const required = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
    'NAVER_CLOUD_SMS_SERVICE_ID',
    'NAVER_CLOUD_SMS_ACCESS_KEY',
    'NAVER_CLOUD_SMS_SECRET_KEY',
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  ];

  return required.every(key => !!process.env[key]);
}
