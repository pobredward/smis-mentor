import { logger } from '@smis-mentor/shared';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';

export interface JobCode {
  id: string;
  code: string;
  generation: string;
  name: string;
  location?: string;
  korea?: boolean;
}

const jobCodesService = {
  /**
   * 모든 jobCodes 조회 (관리자용)
   */
  getAllJobCodes: async (): Promise<JobCode[]> => {
    try {
      const querySnapshot = await getDocs(collection(db, 'jobCodes'));
      const jobCodes: JobCode[] = [];
      
      querySnapshot.forEach((doc) => {
        jobCodes.push({
          id: doc.id,
          ...doc.data(),
        } as JobCode);
      });

      return jobCodes;
    } catch (error) {
      logger.error('모든 JobCodes 조회 실패:', error);
      throw error;
    }
  },

  /**
   * 사용자의 jobExperiences에 해당하는 jobCodes 조회
   */
  getJobCodesByIds: async (jobExperiences: Array<{ id: string }> | string[]): Promise<JobCode[]> => {
    if (!jobExperiences || jobExperiences.length === 0) {
      return [];
    }

    try {
      // string[] 또는 Array<{ id: string }> 모두 처리
      const jobCodeIds = jobExperiences.map(exp => 
        typeof exp === 'string' ? exp : exp.id
      );
      
      // undefined나 빈 문자열 필터링
      const validJobCodeIds = jobCodeIds.filter(id => id && typeof id === 'string' && id.trim() !== '');
      
      if (validJobCodeIds.length === 0) {
        return [];
      }
      
      const jobCodes: JobCode[] = [];
      
      // Firestore 'in' 쿼리는 최대 10개까지만 가능하므로 청크로 나눔
      const chunks = [];
      for (let i = 0; i < validJobCodeIds.length; i += 10) {
        chunks.push(validJobCodeIds.slice(i, i + 10));
      }

      for (const chunk of chunks) {
        const q = query(
          collection(db, 'jobCodes'),
          where('__name__', 'in', chunk)
        );
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
          jobCodes.push({
            id: doc.id,
            ...doc.data(),
          } as JobCode);
        });
      }

      return jobCodes;
    } catch (error) {
      logger.error('JobCodes 조회 실패:', error);
      throw error;
    }
  },

  /**
   * 특정 jobCode ID로 조회
   */
  getJobCodeById: async (jobCodeId: string): Promise<JobCode | null> => {
    try {
      const jobCodeRef = doc(db, 'jobCodes', jobCodeId);
      const jobCodeSnap = await getDoc(jobCodeRef);

      if (!jobCodeSnap.exists()) {
        return null;
      }

      return {
        id: jobCodeSnap.id,
        ...jobCodeSnap.data(),
      } as JobCode;
    } catch (error) {
      logger.error('JobCode 조회 실패:', error);
      throw error;
    }
  },

  /**
   * 사용자의 activeJobExperienceId 업데이트
   */
  updateUserActiveJobCode: async (
    userId: string,
    jobCodeId: string
  ): Promise<void> => {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }
      
      const userData = userDoc.data() as any;
      
      // 관리자이고 jobExperiences에 해당 jobCodeId가 없는 경우 추가
      if (userData.role === 'admin') {
        const jobExperiences = userData.jobExperiences || [];
        const hasJobCode = jobExperiences.some((exp: any) => exp.id === jobCodeId);
        
        if (!hasJobCode) {
          const updatedJobExperiences = [...jobExperiences, { id: jobCodeId }];
          await updateDoc(userRef, {
            activeJobExperienceId: jobCodeId,
            jobExperiences: updatedJobExperiences,
            jobCodeIds: updatedJobExperiences.map((exp: { id: string }) => exp.id),
          });
        } else {
          // 이미 있는 경우 activeJobExperienceId만 업데이트
          await updateDoc(userRef, {
            activeJobExperienceId: jobCodeId,
          });
        }
      } else {
        // 일반 사용자는 기존 로직대로
        await updateDoc(userRef, {
          activeJobExperienceId: jobCodeId,
        });
      }
    } catch (error) {
      logger.error('activeJobExperienceId 업데이트 실패:', error);
      throw error;
    }
  },
};

export default jobCodesService;
