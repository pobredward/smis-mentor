import { db } from '@/lib/firebase';
import { collection, doc, getDoc, setDoc, updateDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';

// 세분화된 템플릿 타입
export type TemplateType = 
  | 'document_pass' 
  | 'document_fail' 
  | 'interview_scheduled'
  | 'interview_pass' 
  | 'interview_fail' 
  | 'final_pass' 
  | 'final_fail';

export interface SMSTemplate {
  id?: string;
  title: string;
  content: string;
  type: TemplateType;
  refJobBoardId?: string; // 특정 공고와 연결된 템플릿인 경우 공고 ID
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

// 템플릿 저장
export async function saveSMSTemplate(template: Omit<SMSTemplate, 'id' | 'createdAt' | 'updatedAt'>) {
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
    console.error('템플릿 저장 오류:', error);
    throw error;
  }
}

// 템플릿 업데이트
export async function updateSMSTemplate(id: string, template: Partial<Omit<SMSTemplate, 'id' | 'createdAt' | 'updatedAt'>>) {
  try {
    const templateRef = doc(db, 'smsTemplates', id);
    const now = Timestamp.now();
    
    await updateDoc(templateRef, {
      ...template,
      updatedAt: now
    });
    
    return { id, ...template, updatedAt: now };
  } catch (error) {
    console.error('템플릿 업데이트 오류:', error);
    throw error;
  }
}

// 템플릿 조회
export async function getSMSTemplate(id: string) {
  try {
    const templateRef = doc(db, 'smsTemplates', id);
    const templateDoc = await getDoc(templateRef);
    
    if (!templateDoc.exists()) {
      return null;
    }
    
    return { id: templateDoc.id, ...templateDoc.data() } as SMSTemplate;
  } catch (error) {
    console.error('템플릿 조회 오류:', error);
    throw error;
  }
}

// 템플릿 삭제
export async function deleteSMSTemplate(id: string) {
  try {
    const templateRef = doc(db, 'smsTemplates', id);
    await deleteDoc(templateRef);
    return true;
  } catch (error) {
    console.error('템플릿 삭제 오류:', error);
    throw error;
  }
}

// 타입과 공고 ID로 템플릿 조회
export async function getSMSTemplateByTypeAndJobBoard(type: TemplateType, jobBoardId?: string) {
  try {
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
      // 공통 템플릿만 검색하고, 없다면 null 반환 (다른 jobBoardId의 템플릿을 반환하지 않음)
      const commonQuery = query(
        templatesRef, 
        where('type', '==', type), 
        where('refJobBoardId', '==', null)
      );
      const commonSnapshot = await getDocs(commonQuery);
      
      if (commonSnapshot.empty) {
        return null; // 공통 템플릿도 없는 경우 null 반환
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
    
    // 2. jobBoardId가 제공되지 않은 경우, 공통 템플릿 검색 (refJobBoardId가 null인 경우)
    const commonQuery = query(
      templatesRef, 
      where('type', '==', type), 
      where('refJobBoardId', '==', null)
    );
    const commonSnapshot = await getDocs(commonQuery);
    
    if (commonSnapshot.empty) {
      return null; // 공통 템플릿이 없는 경우 null 반환
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
    console.error('템플릿 조회 오류:', error);
    throw error;
  }
}

// 모든 템플릿 조회
export async function getAllSMSTemplates() {
  try {
    const templatesRef = collection(db, 'smsTemplates');
    const querySnapshot = await getDocs(templatesRef);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as SMSTemplate[];
  } catch (error) {
    console.error('모든 템플릿 조회 오류:', error);
    throw error;
  }
}

// 특정 공고의 모든 템플릿 조회
export async function getTemplatesByJobBoard(jobBoardId: string) {
  try {
    const templatesRef = collection(db, 'smsTemplates');
    const q = query(templatesRef, where('refJobBoardId', '==', jobBoardId));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as SMSTemplate[];
  } catch (error) {
    console.error('공고별 템플릿 조회 오류:', error);
    throw error;
  }
}

// 템플릿 변수 치환 함수
export function replaceTemplateVariables(template: string, variables: Record<string, string>) {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    // 값이 undefined나 빈 문자열이면 패턴을 유지
    const replacement = value ? value : `{${key}}`;
    result = result.replace(new RegExp(`{${key}}`, 'g'), replacement);
  }
  
  return result;
}

// 특정 타입의 모든 템플릿 조회 (다른 공고 포함)
export async function getTemplatesByType(type: TemplateType) {
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
    console.error('타입별 템플릿 조회 오류:', error);
    throw error;
  }
}

// 템플릿과 함께 공고 정보도 가져오기
export async function getTemplatesWithJobBoardInfo(type: TemplateType) {
  try {
    const templates = await getTemplatesByType(type);
    
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
          console.error('공고 정보 조회 실패:', error);
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
    console.error('템플릿 및 공고 정보 조회 오류:', error);
    throw error;
  }
} 