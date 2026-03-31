import { collection, query, where, getDocs, getDoc, Firestore, doc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { TemplateType, SMSTemplate } from '../../types/sms';
import { logger } from '../../utils/logger';

// 템플릿 저장
export async function saveSMSTemplate(
  db: Firestore,
  template: Omit<SMSTemplate, 'id' | 'createdAt' | 'updatedAt'>
) {
  try {
    const now = Timestamp.now();
    const templateRef = doc(collection(db, 'smsTemplates'));
    
    await setDoc(templateRef, {
      ...template,
      createdAt: now,
      updatedAt: now
    });
    
    return { id: templateRef.id, ...template, createdAt: now, updatedAt: now };
  } catch (error) {
    logger.error('템플릿 저장 오류:', error);
    throw error;
  }
}

// 템플릿 업데이트
export async function updateSMSTemplate(
  db: Firestore,
  id: string,
  template: Partial<Omit<SMSTemplate, 'id' | 'createdAt' | 'updatedAt'>>
) {
  try {
    const templateRef = doc(db, 'smsTemplates', id);
    const now = Timestamp.now();
    
    await updateDoc(templateRef, {
      ...template,
      updatedAt: now
    });
    
    return { id, ...template, updatedAt: now };
  } catch (error) {
    logger.error('템플릿 업데이트 오류:', error);
    throw error;
  }
}

// 타입과 공고 ID로 템플릿 조회 (웹과 동일한 로직)
export async function getSMSTemplateByTypeAndJobBoard(
  db: Firestore,
  type: TemplateType,
  jobBoardId?: string
): Promise<SMSTemplate | null> {
  try {
    // jobBoardId가 명시적으로 undefined인 경우 조기 반환
    if (jobBoardId === undefined) {
      logger.warn('getSMSTemplateByTypeAndJobBoard: jobBoardId is undefined');
      return null;
    }
    
    const templatesRef = collection(db, 'smsTemplates');
    
    // 1. 해당 타입 + 공고 ID에 특화된 템플릿 검색
    if (jobBoardId) {
      const specificQuery = query(
        templatesRef, 
        where('type', '==', type), 
        where('refJobBoardId', '==', jobBoardId)
      );
      const specificSnapshot = await getDocs(specificQuery);
      
      if (!specificSnapshot.empty) {
        // 가장 최근에 업데이트된 템플릿 반환
        const templates = specificSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as SMSTemplate[];
        
        return templates.sort((a, b) => 
          b.updatedAt.toMillis() - a.updatedAt.toMillis()
        )[0];
      }
      
      // jobBoardId가 제공되었지만 해당 템플릿이 없을 경우
      // 공통 템플릿만 검색하고, 없다면 null 반환
      const commonQuery = query(
        templatesRef, 
        where('type', '==', type), 
        where('refJobBoardId', '==', null)
      );
      const commonSnapshot = await getDocs(commonQuery);
      
      if (commonSnapshot.empty) {
        return null;
      }
      
      // 공통 템플릿 중 가장 최근에 업데이트된 템플릿 반환
      const commonTemplates = commonSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SMSTemplate[];
      
      return commonTemplates.sort((a, b) => 
        b.updatedAt.toMillis() - a.updatedAt.toMillis()
      )[0];
    }
    
    // 2. jobBoardId가 제공되지 않은 경우, 공통 템플릿 검색
    const commonQuery = query(
      templatesRef, 
      where('type', '==', type), 
      where('refJobBoardId', '==', null)
    );
    const commonSnapshot = await getDocs(commonQuery);
    
    if (commonSnapshot.empty) {
      return null;
    }
    
    // 공통 템플릿 중 가장 최근에 업데이트된 템플릿 반환
    const templates = commonSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as SMSTemplate[];
    
    return templates.sort((a, b) => 
      b.updatedAt.toMillis() - a.updatedAt.toMillis()
    )[0];
  } catch (error) {
    logger.error('템플릿 조회 오류:', error);
    throw error;
  }
}

// 템플릿 변수 치환 함수
export function replaceTemplateVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    // 값이 undefined나 빈 문자열이면 패턴을 유지
    const replacement = value ? value : `{${key}}`;
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), replacement);
  }
  
  return result;
}

// 기본 템플릿 메시지 (템플릿이 없을 경우 사용)
export const DEFAULT_SMS_TEMPLATES: Record<TemplateType, string> = {
  document_pass: '안녕하세요, {이름}님.\n서류 전형 합격을 축하드립니다.\n다음 면접 일정을 안내드리겠습니다.',
  document_fail: '안녕하세요, {이름}님.\n지원해주셔서 감사합니다.\n아쉽게도 이번 서류 전형에 합격하지 못하셨습니다.',
  interview_scheduled: '안녕하세요, {이름}님.\n서류 전형 합격을 축하드립니다.\n\n면접 일정을 안내드립니다.\n• 면접 일시: {면접일자} {면접시간}\n• 면접 링크: {면접링크}\n• 소요 시간: 약 {면접소요시간}분\n\n참고사항: {면접참고사항}\n\n면접에 참석해주시기 바랍니다.',
  interview_pass: '안녕하세요, {이름}님.\n면접에 참여해주셔서 감사합니다.\n면접 전형 합격을 축하드립니다.',
  interview_fail: '안녕하세요, {이름}님.\n면접에 참여해주셔서 감사합니다.\n아쉽게도 이번 면접 전형에 합격하지 못하셨습니다.',
  final_pass: '축하합니다, {이름}님!\n최종 합격하셨습니다.\n입사 관련 안내사항은 추후 이메일로 전달드릴 예정입니다.',
  final_fail: '안녕하세요, {이름}님.\n지원해주셔서 감사합니다.\n아쉽게도 이번 최종 전형에 합격하지 못하셨습니다.',
};

// 특정 타입의 모든 템플릿 조회 (다른 공고 포함)
export async function getTemplatesByType(db: Firestore, type: TemplateType) {
  try {
    const templatesRef = collection(db, 'smsTemplates');
    const q = query(templatesRef, where('type', '==', type));
    const querySnapshot = await getDocs(q);
    
    const templates = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as SMSTemplate[];
    
    // 최신순으로 정렬
    return templates.sort((a, b) => 
      b.updatedAt.toMillis() - a.updatedAt.toMillis()
    );
  } catch (error) {
    logger.error('타입별 템플릿 조회 오류:', error);
    throw error;
  }
}

// 템플릿과 함께 공고 정보도 가져오기
export async function getTemplatesWithJobBoardInfo(db: Firestore, type: TemplateType) {
  try {
    const templates = await getTemplatesByType(db, type);
    
    // 공고 정보를 병렬로 가져오기
    const templatesWithJobBoard = await Promise.all(
      templates.map(async (template) => {
        if (!template.refJobBoardId) {
          return {
            ...template,
            jobBoardTitle: '공통 템플릿',
            jobBoardGeneration: null,
          };
        }
        
        try {
          const jobBoardRef = doc(db, 'jobBoards', template.refJobBoardId);
          const jobBoardDoc = await getDoc(jobBoardRef);
          
          if (jobBoardDoc.exists()) {
            const jobBoardData = jobBoardDoc.data();
            return {
              ...template,
              jobBoardTitle: jobBoardData.title || '제목 없음',
              jobBoardGeneration: jobBoardData.generation || null,
            };
          }
        } catch (error) {
          logger.error('공고 정보 조회 실패:', error);
        }
        
        return {
          ...template,
          jobBoardTitle: '알 수 없음',
          jobBoardGeneration: null,
        };
      })
    );
    
    return templatesWithJobBoard;
  } catch (error) {
    logger.error('템플릿 및 공고 정보 조회 오류:', error);
    throw error;
  }
}
