import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
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
      console.error('JobCodes 조회 실패:', error);
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
      await updateDoc(userRef, {
        activeJobExperienceId: jobCodeId,
      });
    } catch (error) {
      console.error('activeJobExperienceId 업데이트 실패:', error);
      throw error;
    }
  },
};

export default jobCodesService;
