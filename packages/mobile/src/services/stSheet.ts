import { createStSheetService, createStudentHistoryLoader, type STSheetStudent } from '@smis-mentor/shared';
import { db } from '../config/firebase';

export type { StudentHistoryResult, StudentGroup } from '@smis-mentor/shared';
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
 * 학생 명단 읽기 · 학생 검색 — 구현은 shared (web 과 같은 코드)
 * 원본은 앱(children · camps/{캠프}/enrollments). 구글 시트 연동은 없다.
 */
export const stSheetService = createStSheetService(db);

export const loadAllStudentRecords = createStudentHistoryLoader(db);
