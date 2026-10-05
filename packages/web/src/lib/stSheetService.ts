import { collection, query, where, getDocs } from 'firebase/firestore';
import {
  logger,
  STSheetStudent,
  CAMP_SHEET_CONFIG,
  ST_SHEET_HEADER_MAPPING,
  CampCode,
  CampType,
  FamilyUnit,
  FamilySTSheetCache,
  createStSheetService,
  createStudentHistoryLoader,
  campCodeOf,
} from '@smis-mentor/shared';
import { db } from './firebase';

export type { STSheetStudent, CampCode, CampType, FamilyUnit, FamilySTSheetCache };

export interface JobCode {
  id: string;
  code: string;
  generation: string;
  name: string;
  location?: string;
  korea?: boolean;
}

// 학생 명단 읽기·학생 검색 — 구현은 shared (mobile 과 같은 코드). 원본은 앱(children · camps/{캠프}/enrollments), 시트 연동 없음
export const stSheetService = createStSheetService(db);

export const loadAllStudentRecords = createStudentHistoryLoader(db);
export { campSortKey, filterStudents, groupStudentResults } from '@smis-mentor/shared';
export type { StudentHistoryResult, StudentGroup } from '@smis-mentor/shared';

export const jobCodesService = {
  /** jobCodes 문서 id → 캠프 코드 (shared campKey 변환표 — 없으면 null). 코드만 필요하면 이것을 쓴다 */
  campCodeOf: (jobCodeId: string): Promise<string | null> => campCodeOf(db, jobCodeId),

  getJobCodesByIds: async (jobExperiences: Array<{ id: string }> | string[]): Promise<JobCode[]> => {
    if (!jobExperiences || jobExperiences.length === 0) {
      return [];
    }

    try {
      const jobCodeIds = jobExperiences.map(exp => 
        typeof exp === 'string' ? exp : exp.id
      );
      
      const validJobCodeIds = jobCodeIds.filter(id => id && typeof id === 'string' && id.trim() !== '');
      
      if (validJobCodeIds.length === 0) {
        return [];
      }
      
      const jobCodes: JobCode[] = [];
      
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
};
