import { NextRequest, NextResponse } from 'next/server';
import { saveSMSTemplate } from '@/lib/smsTemplateService';

export async function POST(request: NextRequest) {
  try {
    const { title, content, type, createdBy } = await request.json();
    
    if (!title || !content || !type) {
      return NextResponse.json(
        { success: false, message: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      );
    }
    
    // 템플릿 저장
    const template = await saveSMSTemplate({
      title,
      content,
      type,
      createdBy: createdBy || 'admin'
    });
    
    return NextResponse.json({ 
      success: true, 
      message: '템플릿이 생성되었습니다.',
      template
    });
  } catch (error) {
    console.error('템플릿 생성 오류:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 