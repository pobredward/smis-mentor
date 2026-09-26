import { collection, doc, getDoc, setDoc, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
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
  type SyncSTSheetResponse,
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

// ST 시트 캐시 읽기·학생 검색 — 구현은 shared (mobile 과 같은 코드)
export const stSheetService = createStSheetService(db, {
  // 동기화는 Next.js API (Cloud Function Cold Start 없이 빠름)
  sync: async (campCode) => {
    const { authenticatedPost } = await import('./apiClient');
    return authenticatedPost<SyncSTSheetResponse>('/api/st/sync-sheet', { campCode });
  },
});

export const loadAllStudentRecords = createStudentHistoryLoader(db);
export { campSortKey, filterStudents, groupStudentResults } from '@smis-mentor/shared';
export type { StudentHistoryResult, StudentGroup, SyncSTSheetResponse } from '@smis-mentor/shared';

export const jobCodesService = {
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

// ─── 입소 레벨 테스트 override 서비스 ───────────────────────────────────────

export interface PlacementOverride {
  // 상세 정보
  medication?: string;
  notes?: string;
  etc?: string;
  // 입소 레벨 테스트
  placementSpeaking?: string;
  placementReading?: string;
  placementWriting?: string;
  // 파이널 레벨 테스트
  finalSpeaking?: string;
  finalReading?: string;
  finalWriting?: string;
  // 반 상담
  classCounsel1?: string;
  classCounsel2?: string;
  classCounsel3?: string;
  // 방 상담
  unitCounsel1?: string;
  unitCounsel2?: string;
  unitCounsel3?: string;
  updatedAt?: unknown;
  updatedBy?: string;
}

export const placementOverrideService = {
  /**
   * 특정 학생의 override 값을 조회한다.
   * stSheetOverrides/{campCode}/students/{studentId}
   */
  getOverride: async (campCode: CampCode, studentId: string): Promise<PlacementOverride | null> => {
    try {
      const ref = doc(db, 'stSheetOverrides', campCode, 'students', studentId);
      const snap = await getDoc(ref);
      return snap.exists() ? (snap.data() as PlacementOverride) : null;
    } catch (error) {
      logger.error('override 조회 실패:', error);
      return null;
    }
  },

  /**
   * 입소 레벨 테스트 값을 저장한다. (admin 전용)
   * 기존 값에 merge 방식으로 저장하므로 필드 단위 업데이트 가능.
   */
  saveOverride: async (
    campCode: CampCode,
    studentId: string,
    fields: Omit<PlacementOverride, 'updatedAt' | 'updatedBy'>,
    updatedBy: string,
  ): Promise<void> => {
    const ref = doc(db, 'stSheetOverrides', campCode, 'students', studentId);
    await setDoc(ref, {
      ...fields,
      updatedAt: serverTimestamp(),
      updatedBy,
    }, { merge: true });
  },

  /**
   * STSheetStudent 원본 위에 override 값을 병합하여 반환한다.
   */
  mergeOverride: (student: STSheetStudent, override: PlacementOverride | null): STSheetStudent => {
    if (!override) return student;
    const overridableKeys: (keyof PlacementOverride)[] = [
      'medication', 'notes', 'etc',
      'placementSpeaking', 'placementReading', 'placementWriting',
      'finalSpeaking', 'finalReading', 'finalWriting',
      'classCounsel1', 'classCounsel2', 'classCounsel3',
      'unitCounsel1', 'unitCounsel2', 'unitCounsel3',
    ];
    const merged = { ...student };
    for (const key of overridableKeys) {
      if (override[key] !== undefined) {
        (merged as unknown as Record<string, unknown>)[key] = override[key];
      }
    }
    return merged;
  },
};
