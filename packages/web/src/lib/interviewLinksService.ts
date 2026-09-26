import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { logger } from '@smis-mentor/shared';
import { db } from './firebase';

export interface InterviewLinks {
  zoomUrl: string;
  canvaUrl: string;
  updatedAt?: Date;
}

// 링크는 관리자 화면(면접 링크 관리)에서 입력 — 코드에 Zoom 링크·비밀번호를 두지 않는다
const DEFAULT_LINKS: InterviewLinks = {
  zoomUrl: '',
  canvaUrl: '',
};

/**
 * 면접 관련 링크들을 가져옵니다.
 */
export const getInterviewLinks = async (): Promise<InterviewLinks> => {
  try {
    const linksRef = doc(db, 'interviewSettings', 'links');
    const linksDoc = await getDoc(linksRef);
    
    if (linksDoc.exists()) {
      const data = linksDoc.data();
      return {
        zoomUrl: data.zoomUrl || DEFAULT_LINKS.zoomUrl,
        canvaUrl: data.canvaUrl || DEFAULT_LINKS.canvaUrl,
        updatedAt: data.updatedAt?.toDate(),
      };
    } else {
      // 문서가 없으면 빈 값 (관리자가 면접 링크 관리에서 입력)
      return DEFAULT_LINKS;
    }
  } catch (error) {
    logger.error('면접 링크 로드 오류:', error);
    return DEFAULT_LINKS;
  }
};

/**
 * 면접 관련 링크들을 저장합니다.
 */
export const setInterviewLinks = async (links: Partial<InterviewLinks>): Promise<void> => {
  try {
    const linksRef = doc(db, 'interviewSettings', 'links');
    await setDoc(linksRef, {
      ...links,
      updatedAt: Timestamp.fromDate(new Date())
    }, { merge: true });
  } catch (error) {
    logger.error('면접 링크 저장 오류:', error);
    throw error;
  }
};

/**
 * URL이 유효한지 검증합니다.
 */
export const validateUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};
