// SMS 관련 타입 정의 (shared)
export type PhoneNumber = '01076567933' | '01067117933';

export interface SendSMSParams {
  phoneNumber: string;
  templateId?: string;
  variables?: Record<string, string>;
  content?: string;
  userName?: string;
  fromNumber?: PhoneNumber;
}

export interface SendSMSResponse {
  success: boolean;
  message: string;
}

// SMS API 클라이언트 (웹 API 호출용)
export class SMSApiClient {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async sendSMS(params: SendSMSParams): Promise<SendSMSResponse> {
    try {
      const response = await fetch(`${this.apiUrl}/api/send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('SMS 전송 오류:', error);
      return {
        success: false,
        message: 'SMS 전송 중 오류가 발생했습니다.',
      };
    }
  }
}
