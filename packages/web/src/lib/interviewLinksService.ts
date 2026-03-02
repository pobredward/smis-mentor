import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface InterviewLinks {
  zoomUrl: string;
  canvaUrl: string;
  updatedAt?: Date;
}

const DEFAULT_LINKS: InterviewLinks = {
  zoomUrl: 'https://us06web.zoom.us/j/85134823001?pwd=dUP232JtaSI6UrGIGxlf99urSQpgKq.1',
  canvaUrl: 'https://www.canva.com/design/DAFvhaPK91Q/VhiME0MRIe-gqhlQlWyb9A/view?utm_content=DAFvhaPK91Q&utm_campaign=designshare&utm_medium=link2&utm_source=uniquelinks&utlId=haf1323a182',
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
      // 문서가 없으면 기본값으로 초기화
      await setInterviewLinks(DEFAULT_LINKS);
      return DEFAULT_LINKS;
    }
  } catch (error) {
    console.error('면접 링크 로드 오류:', error);
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
    console.error('면접 링크 저장 오류:', error);
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
