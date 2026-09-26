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
  private getIdToken?: () => Promise<string | null>;

  /**
   * @param getIdToken Firebase ID token 공급자 — /api/send-sms 는 관리자 인증이 필요하다.
   *                   (이전에는 헤더 없이 호출해 모바일 문자 발송이 항상 401 이었음)
   */
  constructor(apiUrl: string, getIdToken?: () => Promise<string | null>) {
    this.apiUrl = apiUrl;
    this.getIdToken = getIdToken;
  }

  async sendSMS(params: SendSMSParams): Promise<SendSMSResponse> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = this.getIdToken ? await this.getIdToken() : null;
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch(`${this.apiUrl}/api/send-sms`, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });

      const data = (await response.json().catch(() => null)) as (SendSMSResponse & { error?: string }) | null;
      if (!response.ok) {
        return {
          success: false,
          message: data?.message || data?.error || (response.status === 403 ? '문자 발송 권한이 없습니다(관리자 전용).' : `문자 발송 실패 (${response.status})`),
        };
      }
      return data ?? { success: false, message: '응답을 해석할 수 없습니다.' };
    } catch (error) {
      console.error('SMS 전송 오류:', error);
      return {
        success: false,
        message: 'SMS 전송 중 오류가 발생했습니다.',
      };
    }
  }
}
