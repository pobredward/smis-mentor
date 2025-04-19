import crypto from 'crypto';

interface SendSMSParams {
  to: string;
  content: string;
  from?: string;
}

// 네이버 클라우드 플랫폼 SMS API 호출 함수
export async function sendSMS({ to, content, from = '01076567933' }: SendSMSParams): Promise<boolean> {
  try {
    const timestamp = Date.now().toString();
    const serviceId = process.env.NAVER_CLOUD_SMS_SERVICE_ID;
    const accessKey = process.env.NAVER_CLOUD_SMS_ACCESS_KEY;
    const secretKey = process.env.NAVER_CLOUD_SMS_SECRET_KEY;
    
    if (!serviceId || !accessKey || !secretKey) {
      console.error('네이버 클라우드 환경 변수가 설정되지 않았습니다.');
      return false;
    }
    
    // API URL 
    const url = `https://sens.apigw.ntruss.com/sms/v2/services/${serviceId}/messages`;
    
    // 시그니처 생성
    const method = 'POST';
    const space = ' ';
    const newLine = '\n';
    const hmacMessage = method + space + `/sms/v2/services/${serviceId}/messages` + newLine + timestamp + newLine + accessKey;
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(hmacMessage)
      .digest('base64');
    
    // 요청 본문 생성
    const body = {
      type: 'SMS',
      contentType: 'COMM',
      countryCode: '82',
      from: from.replace(/-/g, ''),
      content,
      messages: [{ to: to.replace(/-/g, '') }]
    };
    
    // API 요청
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-ncp-apigw-timestamp': timestamp,
        'x-ncp-iam-access-key': accessKey,
        'x-ncp-apigw-signature-v2': signature
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('SMS 발송 실패:', errorData);
      return false;
    }
    
    const result = await response.json();
    console.log('SMS 발송 성공:', result);
    return true;
  } catch (error) {
    console.error('SMS 발송 중 오류 발생:', error);
    return false;
  }
} 