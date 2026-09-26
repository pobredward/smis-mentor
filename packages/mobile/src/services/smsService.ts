import { logger } from '@smis-mentor/shared';
import { 
  SMSApiClient, 
  SendSMSParams, 
  SendSMSResponse,
  getSMSTemplateByTypeAndJobBoard,
  replaceTemplateVariables,
  DEFAULT_SMS_TEMPLATES,
  TemplateType,
} from '@smis-mentor/shared';
import { db, auth } from '../config/firebase';

// 환경 변수에서 웹 API URL 가져오기 (www 리디렉션 시 POST 손실 방지)
const WEB_API_URL = (process.env.EXPO_PUBLIC_WEB_API_URL || 'https://smis-mentor.com').replace('https://www.', 'https://');

// SMS API 클라이언트 인스턴스 생성 — 관리자 ID 토큰을 Authorization 헤더로 전달
const smsClient = new SMSApiClient(WEB_API_URL, async () => (auth.currentUser ? auth.currentUser.getIdToken() : null));

/**
 * SMS 전송 (기본)
 */
const sendSMS = async (params: SendSMSParams): Promise<SendSMSResponse> => {
  return await smsClient.sendSMS(params);
};

/**
 * 커스텀 메시지 SMS 전송 (발신번호 지원)
 */
export const sendCustomSMS = async (
  phoneNumber: string,
  content: string,
  userName?: string,
  fromNumber?: '01076567933' | '01067117933'
): Promise<SendSMSResponse> => {
  return await sendSMS({
    phoneNumber,
    content,
    userName,
    fromNumber,
  });
};

/**
 * 템플릿 기반 SMS 전송
 */
const sendSMSWithTemplate = async (
  phoneNumber: string,
  userName: string,
  templateType: TemplateType,
  jobBoardId?: string,
  additionalVariables?: Record<string, string>
): Promise<SendSMSResponse> => {
  try {
    // 1. Firestore에서 템플릿 조회
    const template = await getSMSTemplateByTypeAndJobBoard(db, templateType, jobBoardId);
    
    // 2. 템플릿 내용 결정 (템플릿이 없으면 기본 메시지 사용)
    const templateContent = template?.content || DEFAULT_SMS_TEMPLATES[templateType];
    
    // 3. 변수 치환
    const variables = {
      이름: userName,
      ...additionalVariables,
    };
    const content = replaceTemplateVariables(templateContent, variables);
    
    // 4. SMS 전송
    return await sendSMS({
      phoneNumber,
      content,
      userName,
    });
  } catch (error) {
    logger.error('템플릿 기반 SMS 전송 오류:', error);
    return {
      success: false,
      message: 'SMS 전송 중 오류가 발생했습니다.',
    };
  }
};







