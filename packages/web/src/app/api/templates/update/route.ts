import { NextRequest, NextResponse } from 'next/server';
import { updateSMSTemplate } from '@/lib/smsTemplateService';

export async function POST(request: NextRequest) {
  try {
    const { id, title, content, type } = await request.json();
    
    if (!id) {
      return NextResponse.json(
        { success: false, message: '템플릿 ID가 필요합니다.' },
        { status: 400 }
      );
    }
    
    // 업데이트할 필드만 포함
    const updateData: Record<string, string> = {};
    if (title) updateData.title = title;
    if (content) updateData.content = content;
    if (type) updateData.type = type;
    
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, message: '업데이트할 데이터가 없습니다.' },
        { status: 400 }
      );
    }
    
    // 템플릿 업데이트
    const template = await updateSMSTemplate(id, updateData);
    
    return NextResponse.json({ 
      success: true, 
      message: '템플릿이 업데이트되었습니다.',
      template
    });
  } catch (error) {
    console.error('템플릿 업데이트 오류:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 