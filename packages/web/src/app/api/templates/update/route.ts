import { NextRequest, NextResponse } from 'next/server';
import { updateSMSTemplate } from '@/lib/smsTemplateService';
import { updateSMSTemplateSchema } from '@/lib/validationSchemas';
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
    const validationResult = updateSMSTemplateSchema.safeParse(body);
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
    
    const { id, title, content, type } = validationResult.data;
    
    // 업데이트할 필드만 포함
    const updateData: Record<string, string> = {};
    if (title) updateData.title = title;
    if (content) updateData.content = content;
    if (type) updateData.type = type;
    
    // 템플릿 업데이트
    const template = await updateSMSTemplate(id, updateData);
    
    return NextResponse.json({ 
      success: true, 
      message: '템플릿이 업데이트되었습니다.',
      template
    });
  } catch (error) {
    logger.error('템플릿 업데이트 오류:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 