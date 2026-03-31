import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { logger } from '@smis-mentor/shared';
import { db } from '../config/firebase';

export interface InterviewLinks {
  zoomUrl: string;
  canvaUrl: string;
  updatedAt?: Date;
}

const LINKS_DOC_ID = 'common';
const LINKS_COLLECTION = 'interviewLinks';

export const getInterviewLinks = async (): Promise<InterviewLinks> => {
  try {
    const linksRef = doc(db, LINKS_COLLECTION, LINKS_DOC_ID);
    const linksDoc = await getDoc(linksRef);

    if (linksDoc.exists()) {
      const data = linksDoc.data();
      return {
        zoomUrl: data.zoomUrl || '',
        canvaUrl: data.canvaUrl || '',
        updatedAt: data.updatedAt?.toDate(),
      };
    }

    return {
      zoomUrl: '',
      canvaUrl: '',
    };
  } catch (error) {
    logger.error('면접 링크 로드 오류:', error);
    throw error;
  }
};

export const setInterviewLinks = async (links: Omit<InterviewLinks, 'updatedAt'>): Promise<void> => {
  try {
    const linksRef = doc(db, LINKS_COLLECTION, LINKS_DOC_ID);
    await setDoc(
      linksRef,
      {
        ...links,
        updatedAt: Timestamp.fromDate(new Date()),
      },
      { merge: true }
    );
  } catch (error) {
    logger.error('면접 링크 저장 오류:', error);
    throw error;
  }
};

export const validateUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};
