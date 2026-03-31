import { 
import { logger } from '@smis-mentor/shared';
  SMSApiClient, 
  SendSMSParams, 
  SendSMSResponse,
  getSMSTemplateByTypeAndJobBoard,
  replaceTemplateVariables,
  DEFAULT_SMS_TEMPLATES,
  TemplateType,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';

// 환경 변수에서 웹 API URL 가져오기
const WEB_API_URL = process.env.EXPO_PUBLIC_WEB_API_URL || 'http://localhost:3000';

// SMS API 클라이언트 인스턴스 생성
const smsClient = new SMSApiClient(WEB_API_URL);

/**
 * SMS 전송 (기본)
 */
export const sendSMS = async (params: SendSMSParams): Promise<SendSMSResponse> => {
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
export const sendSMSWithTemplate = async (
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

/**
 * 서류 합격 SMS 전송
 */
export const sendDocumentPassSMS = async (
  phoneNumber: string,
  userName: string,
  jobBoardId?: string,
  variables?: Record<string, string>
): Promise<SendSMSResponse> => {
  return await sendSMSWithTemplate(
    phoneNumber,
    userName,
    'document_pass',
    jobBoardId,
    variables
  );
};

/**
 * 서류 불합격 SMS 전송
 */
export const sendDocumentFailSMS = async (
  phoneNumber: string,
  userName: string,
  jobBoardId?: string,
  variables?: Record<string, string>
): Promise<SendSMSResponse> => {
  return await sendSMSWithTemplate(
    phoneNumber,
    userName,
    'document_fail',
    jobBoardId,
    variables
  );
};

/**
 * 면접 예정 SMS 전송
 */
export const sendInterviewScheduleSMS = async (
  phoneNumber: string,
  userName: string,
  jobBoardId?: string,
  variables?: Record<string, string>
): Promise<SendSMSResponse> => {
  return await sendSMSWithTemplate(
    phoneNumber,
    userName,
    'interview_scheduled',
    jobBoardId,
    variables
  );
};

/**
 * 면접 합격 SMS 전송
 */
export const sendInterviewPassSMS = async (
  phoneNumber: string,
  userName: string,
  jobBoardId?: string,
  variables?: Record<string, string>
): Promise<SendSMSResponse> => {
  return await sendSMSWithTemplate(
    phoneNumber,
    userName,
    'interview_pass',
    jobBoardId,
    variables
  );
};

/**
 * 면접 불합격 SMS 전송
 */
export const sendInterviewFailSMS = async (
  phoneNumber: string,
  userName: string,
  jobBoardId?: string,
  variables?: Record<string, string>
): Promise<SendSMSResponse> => {
  return await sendSMSWithTemplate(
    phoneNumber,
    userName,
    'interview_fail',
    jobBoardId,
    variables
  );
};

/**
 * 최종 합격 SMS 전송
 */
export const sendFinalPassSMS = async (
  phoneNumber: string,
  userName: string,
  jobBoardId?: string,
  variables?: Record<string, string>
): Promise<SendSMSResponse> => {
  return await sendSMSWithTemplate(
    phoneNumber,
    userName,
    'final_pass',
    jobBoardId,
    variables
  );
};

/**
 * 최종 불합격 SMS 전송
 */
export const sendFinalFailSMS = async (
  phoneNumber: string,
  userName: string,
  jobBoardId?: string,
  variables?: Record<string, string>
): Promise<SendSMSResponse> => {
  return await sendSMSWithTemplate(
    phoneNumber,
    userName,
    'final_fail',
    jobBoardId,
    variables
  );
};
