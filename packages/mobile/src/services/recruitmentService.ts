import { logger } from '@smis-mentor/shared';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  deleteDoc,
  addDoc,
  updateDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { ApplicationHistory, Review } from '@shared/types';
import { getJobBoardById as getJobBoard } from './jobBoardService';
import { authenticatedPost } from './apiClient';

export type ApplicationWithJobDetails = ApplicationHistory & {
  jobBoard?: any;
};

export type ReviewWithId = Review & {
  isOpen?: boolean;
};

/**
 * 관리자가 지원자의 지원장소를 변경
 */
export const changeApplicationJobBoard = async (
  applicationId: string,
  newJobBoardId: string
): Promise<{ updatedApplications: number; updatedEvaluations: number }> => {
  try {
    logger.info('[changeApplicationJobBoard] API 호출 시작:', {
      applicationId,
      newJobBoardId,
    });

    const response = await authenticatedPost<{
      success: boolean;
      message: string;
      data: { updatedApplications: number; updatedEvaluations: number };
    }>('/api/admin/change-job-board', {
      applicationId,
      newJobBoardId,
    });

    logger.info('[changeApplicationJobBoard] API 응답 수신:', response);

    if (!response.success) {
      throw new Error(response.message || '지원장소 변경에 실패했습니다.');
    }

    if (!response.data) {
      throw new Error('응답 데이터가 없습니다.');
    }

    return response.data;
  } catch (error: any) {
    logger.error('[changeApplicationJobBoard] 지원장소 변경 오류:', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

export const getApplicationsByUserId = async (
  userId: string
): Promise<ApplicationHistory[]> => {
  try {
    const applicationsRef = collection(db, 'applicationHistories');
    const q = query(
      applicationsRef,
      where('refUserId', '==', userId)
    );

    const querySnapshot = await getDocs(q);
    const applications = querySnapshot.docs.map(
      (doc) =>
        ({
          ...doc.data(),
          applicationHistoryId: doc.id,
        } as ApplicationHistory)
    );

    // 클라이언트 측에서 정렬
    return applications.sort((a, b) => {
      const dateA = a.applicationDate?.seconds || 0;
      const dateB = b.applicationDate?.seconds || 0;
      return dateB - dateA;
    });
  } catch (error) {
    logger.error('지원 내역 조회 오류:', error);
    throw error;
  }
};

export const getJobBoardById = getJobBoard;

export const createApplication = async (applicationData: any): Promise<string> => {
  try {
    // 중복 지원 확인
    const existingApplicationsQuery = query(
      collection(db, 'applicationHistories'),
      where('refUserId', '==', applicationData.refUserId),
      where('refJobBoardId', '==', applicationData.refJobBoardId)
    );
    
    const existingApplications = await getDocs(existingApplicationsQuery);
    
    if (!existingApplications.empty) {
      throw new Error('이미 지원하신 공고입니다.');
    }

    const docRef = await addDoc(collection(db, 'applicationHistories'), {
      ...applicationData,
      applicationDate: Timestamp.now()
    });
    
    await updateDoc(doc(db, 'applicationHistories', docRef.id), { 
      applicationHistoryId: docRef.id 
    });

    return docRef.id;
  } catch (error) {
    logger.error('지원서 생성 실패:', error);
    throw error;
  }
};

export const cancelApplication = async (applicationId: string): Promise<void> => {
  try {
    const applicationRef = doc(db, 'applicationHistories', applicationId);
    await deleteDoc(applicationRef);
  } catch (error) {
    logger.error('지원 취소 오류:', error);
    throw error;
  }
};

export const getAllReviews = async (): Promise<ReviewWithId[]> => {
  try {
    const reviewsRef = collection(db, 'reviews');
    const querySnapshot = await getDocs(reviewsRef);
    
    const reviews = querySnapshot.docs.map(
      (doc) =>
        ({
          ...doc.data(),
          id: doc.id,
          isOpen: false,
        } as ReviewWithId)
    );

    // 클라이언트 측에서 정렬
    return reviews.sort((a, b) => {
      const dateA = a.createdAt?.seconds || 0;
      const dateB = b.createdAt?.seconds || 0;
      return dateB - dateA;
    });
  } catch (error) {
    logger.error('후기 조회 오류:', error);
    throw error;
  }
};

export const deleteReview = async (reviewId: string): Promise<void> => {
  try {
    const reviewRef = doc(db, 'reviews', reviewId);
    await deleteDoc(reviewRef);
  } catch (error) {
    logger.error('후기 삭제 오류:', error);
    throw error;
  }
};

export const addReview = async (reviewData: any): Promise<string> => {
  try {
    const now = Timestamp.now();
    const docRef = await addDoc(collection(db, 'reviews'), {
      ...reviewData,
      createdAt: now,
      updatedAt: now,
    });
    return docRef.id;
  } catch (error) {
    logger.error('후기 추가 오류:', error);
    throw error;
  }
};

export const updateReview = async (reviewId: string, reviewData: any): Promise<void> => {
  try {
    const reviewRef = doc(db, 'reviews', reviewId);
    await updateDoc(reviewRef, {
      ...reviewData,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    logger.error('후기 수정 오류:', error);
    throw error;
  }
};
