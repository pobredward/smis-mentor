import { NextRequest, NextResponse } from 'next/server';
// 주석 처리된 코드에서 사용되는 import는 제거합니다
// import { sendSMS } from '@/lib/naverCloudSMS';
// import { getSMSTemplate, replaceTemplateVariables } from '@/lib/smsTemplateService';

export async function POST(request: NextRequest) {
  try {
    // 필요한 변수만 구조 분해합니다
    const { phoneNumber } = await request.json();
    
    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, message: '수신자 전화번호가 필요합니다.' },
        { status: 400 }
      );
    }
    
    // 발신자 인증이 완료되지 않았으므로 항상 오류 메시지 반환
    return NextResponse.json(
      { success: false, message: '아직 발신자 인증이 되지 않았습니다.' },
      { status: 403 }
    );

    // 아래 코드는 발신자 인증 후 활성화할 예정입니다
    /*
    import { sendSMS } from '@/lib/naverCloudSMS';
    import { getSMSTemplate, replaceTemplateVariables } from '@/lib/smsTemplateService';
    
    const { templateId, variables, content } = await request.json();
    
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
      messageContent = replaceTemplateVariables(template.content, variables || {});
    } else if (!content) {
      return NextResponse.json(
        { success: false, message: '템플릿 ID 또는 직접 내용이 필요합니다.' },
        { status: 400 }
      );
    }
    
    // SMS 전송
    const result = await sendSMS({ 
      to: phoneNumber, 
      content: messageContent 
    });
    
    if (result) {
      return NextResponse.json({ success: true, message: 'SMS가 성공적으로 전송되었습니다.' });
    } else {
      return NextResponse.json(
        { success: false, message: 'SMS 전송에 실패했습니다.' },
        { status: 500 }
      );
    }
    */
  } catch (error) {
    console.error('SMS 전송 API 오류:', error);
    return NextResponse.json(
      { success: false, message: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
} 