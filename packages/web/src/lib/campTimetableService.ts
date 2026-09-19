import { CampTimetableService } from '@smis-mentor/shared';
import { db } from '@/lib/firebase';

/** 캠프 시간표 서비스 (웹 인스턴스) */
export const campTimetableService = new CampTimetableService(db);

export type {
  CampTimetable,
  TimetableBlock,
  TimetableSubject,
  TimetableCell,
  TimetableClassColumn,
  TimetableExtraColumn,
} from '@smis-mentor/shared';
