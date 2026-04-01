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
  private getAuthToken?: () => Promise<string>;

  constructor(apiUrl: string, getAuthToken?: () => Promise<string>) {
    this.apiUrl = apiUrl;
    this.getAuthToken = getAuthToken;
  }

  async sendSMS(params: SendSMSParams): Promise<SendSMSResponse> {
    try {
      // 인증 토큰 가져오기
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.getAuthToken) {
        try {
          const token = await this.getAuthToken();
          headers['Authorization'] = `Bearer ${token}`;
        } catch (error) {
          console.error('인증 토큰 가져오기 실패:', error);
          return {
            success: false,
            message: '인증에 실패했습니다. 다시 로그인해주세요.',
          };
        }
      }

      const response = await fetch(`${this.apiUrl}/api/send-sms`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });

      const data = await response.json();
      
      // 인증 실패 처리
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          message: data.message || data.error || '권한이 없습니다. 다시 로그인해주세요.',
        };
      }

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
