import { logger } from '@smis-mentor/shared';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';

/** 공고 타입 — shared 한 벌 (예전 모바일 사본에는 면접 일정 interviewDates 가 빠져 있었음) */
export type { JobBoard, JobBoardWithId } from '@smis-mentor/shared';
import type { JobBoardWithId } from '@smis-mentor/shared';

export interface JobCodeWithId {
  id: string;
  generation: string;
  code: string;
  name: string;
  location: string;
  startDate: Timestamp;
  endDate: Timestamp;
  korea: boolean;
}

export const getAllJobBoards = async (): Promise<JobBoardWithId[]> => {
  try {
    const jobBoardsRef = collection(db, 'jobBoards');
    const q = query(jobBoardsRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);

    const jobBoards: JobBoardWithId[] = [];
    querySnapshot.forEach((doc) => {
      jobBoards.push({
        id: doc.id,
        ...doc.data(),
      } as JobBoardWithId);
    });

    return jobBoards;
  } catch (error) {
    logger.error('공고 목록 조회 실패:', error);
    throw error;
  }
};

export const getJobBoardById = async (
  id: string
): Promise<JobBoardWithId | null> => {
  try {
    const docRef = doc(db, 'jobBoards', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as JobBoardWithId;
  } catch (error) {
    logger.error('공고 조회 실패:', error);
    throw error;
  }
};

export const getJobCodeById = async (
  id: string
): Promise<JobCodeWithId | null> => {
  try {
    const docRef = doc(db, 'jobCodes', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as JobCodeWithId;
  } catch (error) {
    logger.error('직무 코드 조회 실패:', error);
    throw error;
  }
};
