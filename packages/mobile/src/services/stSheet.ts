import { createStSheetService, createStudentHistoryLoader, type SyncSTSheetResponse, type STSheetStudent } from '@smis-mentor/shared';
import { db } from '../config/firebase';
import { authenticatedFetch } from '../utils/apiClient';

export type { SyncSTSheetResponse, StudentHistoryResult, StudentGroup } from '@smis-mentor/shared';
export { campSortKey, filterStudents, groupStudentResults } from '@smis-mentor/shared';

export interface GetStudentsByMentorRequest {
  mentorName: string;
  filterType: 'class' | 'unit';
}

export interface GetStudentsByMentorResponse {
  students: STSheetStudent[];
  lastSync: string;
  mentorName: string;
}

/**
 * ST 시트 캐시 읽기·학생 검색 — 구현은 shared (web 과 같은 코드)
 * (예전 모바일 사본은 가족(F) 캠프를 읽지 못하고, 데이터가 없으면 임시 학생으로 채웠다)
 */
export const stSheetService = createStSheetService(db, {
  sync: async (campCode) => {
    const response = await authenticatedFetch('/api/st/sync-sheet', {
      method: 'POST',
      body: JSON.stringify({ campCode }),
    });
    if (!response.ok) {
      const err = (await response.json().catch(() => ({ error: '' }))) as { error?: string };
      throw new Error(err.error || `동기화 실패 (${response.status})`);
    }
    return (await response.json()) as SyncSTSheetResponse;
  },
});

export const loadAllStudentRecords = createStudentHistoryLoader(db);
