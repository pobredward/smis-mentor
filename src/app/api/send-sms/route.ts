import { NextRequest, NextResponse } from 'next/server';
import { sendSMS, PhoneNumber } from '@/lib/naverCloudSMS';
import { getSMSTemplate, replaceTemplateVariables } from '@/lib/smsTemplateService';

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber, templateId, variables, content, userName, fromNumber } = await request.json();
    
    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, message: '수신자 전화번호가 필요합니다.' },
        { status: 400 }
      );
    }
    
    // 사용자 변수 준비
    const allVariables = {
      ...variables || {},
      이름: userName || variables?.이름 || '{이름}'
    };
    
    // 템플릿 ID가 제공된 경우 템플릿 내용을 가져옴
    let messageContent = content;
    if (templateId) {
      const template = await getSMSTemplate(templateId);
      
      if (!template) {
        return NextResponse.json(
          { success: false, message: '템플릿을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
      
      // 템플릿의 변수 치환
      messageContent = replaceTemplateVariables(template.content, allVariables);
    } else if (!content) {
      return NextResponse.json(
        { success: false, message: '템플릿 ID 또는 직접 내용이 필요합니다.' },
        { status: 400 }
      );
    } else {
      // 직접 입력한 내용에서도 변수 치환 수행
      messageContent = replaceTemplateVariables(content, allVariables);
    }
    
    // SMS 전송
    const result = await sendSMS({ 
      to: phoneNumber, 
      content: messageContent,
      from: fromNumber as PhoneNumber
    });
    
    if (result) {
      return NextResponse.json({ success: true, message: 'SMS가 성공적으로 전송되었습니다.' });
    } else {
      return NextResponse.json(
        { success: false, message: 'SMS 전송에 실패했습니다.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('SMS 전송 API 오류:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 