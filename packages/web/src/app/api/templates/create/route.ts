import { NextRequest, NextResponse } from 'next/server';
import { saveSMSTemplate } from '@/lib/smsTemplateService';
import { createSMSTemplateSchema } from '@/lib/validationSchemas';
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
    const validationResult = createSMSTemplateSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { 
          success: false, 
          message: validationResult.error.errors[0].message,
          errors: validationResult.error.errors
        },
        { status: 400 }
      );
    }
    
    const { title, content, type } = validationResult.data;
    const createdBy = authContext!.user.userId || authContext!.user.id;
    
    // 템플릿 저장
    const template = await saveSMSTemplate({
      title,
      content,
      type,
      createdBy
    });
    
    return NextResponse.json({ 
      success: true, 
      message: '템플릿이 생성되었습니다.',
      template
    });
  } catch (error) {
    logger.error('템플릿 생성 오류:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 