import { NextRequest, NextResponse } from 'next/server';
import { sendSMS, PhoneNumber } from '@/lib/naverCloudSMS';
import { getSMSTemplate, replaceTemplateVariables } from '@/lib/smsTemplateService';
import { sendSMSSchema } from '@/lib/validationSchemas';
import { logger } from '@smis-mentor/shared';
import { getAuthenticatedUser, requireMentor } from '@/lib/authMiddleware';

export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthenticatedUser(request);
    
    // 권한 체크
    const mentorCheck = requireMentor(authContext);
    if (mentorCheck) {
      return mentorCheck;
    }

    // 인증된 사용자 정보 로깅
    logger.info('SMS 전송 요청:', {
      userId: authContext?.user.userId,
      userName: authContext?.user.name,
      role: authContext?.user.role,
    });

    const body = await request.json();
    
    // Zod 스키마 검증
    const validationResult = sendSMSSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          message: validationResult.error.errors[0].message,
          errors: validationResult.error.errors
        },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      );
    }
    
    const { phoneNumber, templateId, variables, content, userName, fromNumber } = validationResult.data;
    
    // 사용자 변수 준비
    const allVariables = {
      ...variables,
      이름: userName || variables?.이름 || '{이름}'
    };
    
    // 템플릿 ID가 제공된 경우 템플릿 내용을 가져옴
    let messageContent = content;
    if (templateId) {
      const template = await getSMSTemplate(templateId);
      
      if (!template) {
        return NextResponse.json(
          { success: false, message: '템플릿을 찾을 수 없습니다.' },
          { 
            status: 404,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            }
          }
        );
      }
      
      // 템플릿의 변수 치환
      messageContent = replaceTemplateVariables(template.content, allVariables);
    } else if (!content) {
      return NextResponse.json(
        { success: false, message: '템플릿 ID 또는 직접 내용이 필요합니다.' },
        { 
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      );
    } else {
      // 직접 입력한 내용에서도 변수 치환 수행
      messageContent = replaceTemplateVariables(content, allVariables);
    }
    
    // SMS 전송
    logger.info('SMS 전송 시작:', {
      to: phoneNumber,
      from: fromNumber,
      contentLength: messageContent.length,
      sender: authContext?.user.name,
    });
    
    const result = await sendSMS({ 
      to: phoneNumber, 
      content: messageContent,
      from: fromNumber as PhoneNumber
    });
    
    if (result) {
      logger.info('SMS 전송 성공:', { to: phoneNumber });
      return NextResponse.json(
        { success: true, message: 'SMS가 성공적으로 전송되었습니다.' },
        {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      );
    } else {
      logger.error('SMS 전송 실패:', { to: phoneNumber });
      return NextResponse.json(
        { success: false, message: 'SMS 전송에 실패했습니다.' },
        { 
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        }
      );
    }
  } catch (error) {
    logger.error('SMS 전송 API 오류:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      }
    );
  }
}

// OPTIONS 요청 처리 (CORS preflight)
export async function OPTIONS(request: NextRequest) {
  return NextResponse.json(
    {},
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    }
  );
} 