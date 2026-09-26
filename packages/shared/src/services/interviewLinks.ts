/**
 * 면접 링크 (Zoom · Canva) — web·mobile 공용.
 * 링크는 관리자 화면(면접 링크 관리)에서 입력 — 코드에 Zoom 링크·비밀번호를 두지 않는다.
 */
import { type Firestore, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { logger } from '../utils/logger';

export interface InterviewLinks {
  zoomUrl: string;
  canvaUrl: string;
  updatedAt?: Date;
}

const DEFAULT_INTERVIEW_LINKS: InterviewLinks = { zoomUrl: '', canvaUrl: '' };

/** URL 형식 확인 */
export const validateUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export function createInterviewLinksService(db: Firestore) {
  const linksRef = () => doc(db, 'interviewSettings', 'links');

  const getInterviewLinks = async (): Promise<InterviewLinks> => {
    try {
      const snap = await getDoc(linksRef());
      if (!snap.exists()) return DEFAULT_INTERVIEW_LINKS;
      const data = snap.data();
      return {
        zoomUrl: data.zoomUrl || DEFAULT_INTERVIEW_LINKS.zoomUrl,
        canvaUrl: data.canvaUrl || DEFAULT_INTERVIEW_LINKS.canvaUrl,
        updatedAt: data.updatedAt?.toDate(),
      };
    } catch (error) {
      logger.error('면접 링크 로드 오류:', error);
      return DEFAULT_INTERVIEW_LINKS;
    }
  };

  const setInterviewLinks = async (links: Partial<InterviewLinks>): Promise<void> => {
    try {
      await setDoc(linksRef(), { ...links, updatedAt: Timestamp.fromDate(new Date()) }, { merge: true });
    } catch (error) {
      logger.error('면접 링크 저장 오류:', error);
      throw error;
    }
  };

  return { getInterviewLinks, setInterviewLinks, validateUrl };
}
