import {
  getCampClassInfo,
  getCampTimetableCommon,
  getCampTimetableGuides,
  getCampGroups,
  getEslBooks,
  resolveGroups,
  type CampClassInfo,
  type CampTimetable,
  type CampTimetableCommon,
  type TimetableGuide,
  type DerivedGroup,
  type EslBookList,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';
import { campTimetableService } from './campTimetableService';
import { getUsersByJobCodeId } from './userService';
import jobCodesService from './jobCodesService';

/**
 * 시간표 화면이 쓰는 데이터 묶음.
 *
 * 그룹·담임은 여기서 이미 뽑아 둔다 — 캐시에는 시간표에 실제로 찍히는 이름만 남고
 * 멤버 원본(연락처 등)은 기기에 저장되지 않는다.
 * 날짜는 밀리초로 — 캐시를 JSON 으로 저장했다 복원해도 살아남게.
 */
export interface ScheduleBundle {
  campCode: string;
  startMs: number | null;
  endMs: number | null;
  timetables: CampTimetable[];
  groups: DerivedGroup[];
  /** 반코드 → 반이름·강의실·교재코드 (기수별 한 벌) */
  classInfo: Record<string, CampClassInfo>;
  /** 그룹명 → 그 그룹의 모든 Day 가 함께 쓰는 값 */
  timetableCommon: Record<string, CampTimetableCommon>;
  /** 칸 이름 → 그 칸을 눌렀을 때 뜨는 설명 (캠프당 한 벌) */
  timetableGuides: Record<string, TimetableGuide>;
  /** L-Code → 교재 3권 (전사 공용) */
  books: EslBookList;
}

/** 'schedule' 로 시작해야 AsyncStorage 에 저장된다 (QueryClientProvider 의 persistKeys) */
export const scheduleQueryKey = (jobCodeId: string) => ['schedule', jobCodeId, 'timetable'] as const;

export async function loadScheduleBundle(jobCodeId: string): Promise<ScheduleBundle> {
  const jobCode = (await jobCodesService.getJobCodeById(jobCodeId)) as
    | { code?: string; startDate?: { toDate?: () => Date }; endDate?: { toDate?: () => Date } }
    | null;
  const campCode = jobCode?.code ?? '';

  const [timetables, members, settingGroups, classInfo, books, timetableCommon, timetableGuides] =
    await Promise.all([
    campTimetableService.listByJobCodeId(jobCodeId),
    getUsersByJobCodeId(jobCodeId),
    campCode ? getCampGroups(db, campCode) : Promise.resolve([]),
    campCode ? getCampClassInfo(db, campCode) : Promise.resolve({}),
    getEslBooks(db),
    campCode ? getCampTimetableCommon(db, campCode) : Promise.resolve({}),
    campCode ? getCampTimetableGuides(db, campCode) : Promise.resolve({}),
    ]);

  return {
    campCode,
    startMs: jobCode?.startDate?.toDate?.()?.getTime() ?? null,
    endMs: jobCode?.endDate?.toDate?.()?.getTime() ?? null,
    timetables,
    groups: resolveGroups(members as never[], jobCodeId, settingGroups),
    classInfo,
    timetableCommon,
    timetableGuides,
    books,
  };
}
