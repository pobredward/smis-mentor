import { NextRequest, NextResponse } from 'next/server';
import { sendSMS, PhoneNumber } from '@/lib/naverCloudSMS';
import { getSMSTemplate, replaceTemplateVariables } from '@/lib/smsTemplateService';
import { sendSMSSchema } from '@/lib/validationSchemas';
import { logger, findUnresolvedPlaceholders } from '@smis-mentor/shared';
import { getAuthenticatedUser } from '@/lib/authMiddleware';

// CORS 허용 출처 (서비스 도메인만 허용)
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_BASE_URL || 'https://www.smis-mentor.com',
  'https://smis-mentor.com',
  'http://localhost:3000',
].filter(Boolean);

function getAllowedOriginHeader(origin: string | null): string {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

export async function POST(request: NextRequest) {
  try {
    // 인증 확인: active 사용자(mentor/foreign/admin)만 SMS 발송 가능
    const authContext = await getAuthenticatedUser(request);
    if (!authContext) {
      return NextResponse.json(
        { success: false, message: '인증이 필요합니다.' },
        { status: 401 }
      );
    }
    // 문자 발송은 채용·면접 관리(관리자 화면)에서만 사용 — 일반 멘토/원어민 계정의 임의 발송 차단
    const allowedRoles = ['admin'];
    if (!allowedRoles.includes(authContext.user.role)) {
      return NextResponse.json(
        { success: false, message: 'SMS 발송 권한이 없습니다. (temp 계정 불가)' },
        { status: 403 }
      );
    }

    const origin = request.headers.get('origin');
    const corsOrigin = getAllowedOriginHeader(origin);

    const body = await request.json();
    
    // Zod 스키마 검증
    const validationResult = sendSMSSchema.safeParse(body);
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Vary': 'Origin',
    };

    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          message: validationResult.error.errors[0].message,
          errors: validationResult.error.errors
        },
        { status: 400, headers: corsHeaders }
      );
    }
    
    const { phoneNumber, templateId, variables, content, userName, fromNumber } = validationResult.data;
    
    const allVariables = {
      ...variables,
      이름: userName || variables?.이름 || '{이름}'
    };
    
    let messageContent = content;
    if (templateId) {
      const template = await getSMSTemplate(templateId);
      
      if (!template) {
        return NextResponse.json(
          { success: false, message: '템플릿을 찾을 수 없습니다.' },
          { status: 404, headers: corsHeaders }
        );
      }
      
      messageContent = replaceTemplateVariables(template.content, allVariables);
    } else if (!content) {
      return NextResponse.json(
        { success: false, message: '템플릿 ID 또는 직접 내용이 필요합니다.' },
        { status: 400, headers: corsHeaders }
      );
    } else {
      messageContent = replaceTemplateVariables(content, allVariables);
    }
    
    // 치환되지 않은 변수가 남아 있으면 발송하지 않는다 (지원자에게 "{면접링크}" 같은 문자가 가는 것 방지)
    const unresolved = findUnresolvedPlaceholders(messageContent || '');
    if (unresolved.length > 0) {
      return NextResponse.json(
        { success: false, message: `채워지지 않은 항목이 있습니다: ${unresolved.join(', ')} — 면접 일시·링크 등을 먼저 입력해주세요.` },
        { status: 400, headers: corsHeaders }
      );
    }

    const result = await sendSMS({ 
      to: phoneNumber, 
      content: messageContent,
      from: fromNumber as PhoneNumber
    });
    
    if (result) {
      return NextResponse.json(
        { success: true, message: 'SMS가 성공적으로 전송되었습니다.' },
        { headers: corsHeaders }
      );
    } else {
      return NextResponse.json(
        { success: false, message: 'SMS 전송에 실패했습니다.' },
        { status: 500, headers: corsHeaders }
      );
    }
  } catch (error) {
    logger.error('SMS 전송 API 오류:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// OPTIONS 요청 처리 (CORS preflight)
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  return NextResponse.json(
    {},
    {
      headers: {
        'Access-Control-Allow-Origin': getAllowedOriginHeader(origin),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Vary': 'Origin',
      }
    }
  );
} 