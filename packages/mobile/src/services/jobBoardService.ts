import {
import { logger } from '@smis-mentor/shared';
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

export interface JobBoard {
  title: string;
  description: string;
  status: 'active' | 'closed';
  generation: string;
  korea: boolean;
  jobCode: string;
  refJobCodeId: string;
  educationStartDate: Timestamp;
  educationEndDate: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  interviewBaseLink?: string;
  interviewBaseDuration?: number;
  interviewBaseNotes?: string;
}

export interface JobBoardWithId extends JobBoard {
  id: string;
}

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
