import { NextRequest, NextResponse } from 'next/server';

/**
 * 환경 변수 공개 검증 API (인증 불필요)
 * 보안: 환경 변수 값은 노출하지 않고 존재 여부만 확인
 */
export async function GET(request: NextRequest) {
  // 프로덕션에서는 간소화된 정보만 제공
  const isProduction = process.env.NODE_ENV === 'production';

  try {
    // 환경 변수 존재 여부만 체크 (실제 값은 보안상 노출하지 않음)
    const envCheck: any = {
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      
      // Firebase Admin SDK
      firebase: {
        hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
        hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
        hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
        privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length || 0,
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
      missingVars: getMissingVars(),
    };

    // 개발 환경에서만 추가 정보 제공 (보안)
    if (!isProduction) {
      envCheck.firebase.privateKeyPreview = process.env.FIREBASE_PRIVATE_KEY 
        ? `${process.env.FIREBASE_PRIVATE_KEY.substring(0, 30)}...${process.env.FIREBASE_PRIVATE_KEY.substring(process.env.FIREBASE_PRIVATE_KEY.length - 30)}`
        : null;
      envCheck.firebase.projectId = process.env.FIREBASE_PROJECT_ID;
      envCheck.naverSms.serviceId = process.env.NAVER_CLOUD_SMS_SERVICE_ID 
        ? `${process.env.NAVER_CLOUD_SMS_SERVICE_ID.substring(0, 20)}...`
        : null;
      envCheck.firebaseClient.apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY 
        ? `${process.env.NEXT_PUBLIC_FIREBASE_API_KEY.substring(0, 10)}...`
        : null;
    }

    return NextResponse.json({
      success: true,
      data: envCheck,
      message: envCheck.allRequired 
        ? '✅ 모든 필수 환경 변수가 설정되었습니다.' 
        : `⚠️ 일부 환경 변수가 누락되었습니다: ${envCheck.missingVars.join(', ')}`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        success: false, 
        message: '환경 변수 확인 중 오류 발생',
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 5),
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

function getMissingVars(): string[] {
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

  return required.filter(key => !process.env[key]);
}
