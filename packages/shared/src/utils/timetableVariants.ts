/**
 * 날짜별 표 — 같은 그룹·같은 Day 에 표가 여러 장일 때 (예: Summer 고잉업 1/21 · 1/28)
 *
 * 표마다 dates 로 맡은 날을 적어 두고, 날짜가 없는 표는 그 Day 의 "기본 표" 다.
 * 보기 화면은 여러 장을 날짜 순으로 위에서부터 쌓고(익사이팅 데이 목록과 같은 방식),
 * 일정표에서 날짜를 누르면 그 날짜 표로 스크롤한다.
 */
import type { CampTimetable } from '../types/campTimetable';
import { dayCategory, type DayPlanSet } from '../types/campDayPlan';

/** 일정표에서 이 Day(시간표 탭)를 여는 날짜들 (오름차순) */
export function planDatesFor(set: DayPlanSet | undefined, category: string | null | undefined, campCode?: string | null): string[] {
  if (!set || !category) return [];
  return Object.keys(set.days)
    .filter((d) => dayCategory(set, d, campCode) === category)
    .sort();
}

export interface TimetableVariant {
  table: CampTimetable;
  /** 이 표를 쓰는 날짜 — 기본 표는 일정표에서 다른 표가 맡지 않은 그 Day 날짜들 */
  dates: string[];
  /** 날짜를 따로 정하지 않은 기본 표 */
  isBase: boolean;
}

/** 쌓아 보여 줄 표마다 맡은 날짜를 붙인다 (순서는 들어온 그대로) */
export function timetableVariants(
  list: CampTimetable[],
  set: DayPlanSet | undefined,
  category: string | null | undefined,
  campCode?: string | null
): TimetableVariant[] {
  const claimed = new Set(list.flatMap((t) => t.dates ?? []));
  const rest = planDatesFor(set, category, campCode).filter((d) => !claimed.has(d));
  return list.map((table) => {
    const own = [...(table.dates ?? [])].sort();
    return own.length ? { table, dates: own, isBase: false } : { table, dates: rest, isBase: true };
  });
}

/** 다음에 복제할 표에 줄 날짜 — 아직 어느 표도 맡지 않은 이 Day 의 첫 날 */
export function nextUnclaimedDate(
  list: Array<Pick<CampTimetable, 'dates'>>,
  set: DayPlanSet | undefined,
  category: string | null | undefined,
  campCode?: string | null
): string | null {
  const claimed = new Set(list.flatMap((t) => t.dates ?? []));
  const free = planDatesFor(set, category, campCode).filter((d) => !claimed.has(d));
  // 기본 표가 남은 날을 다 맡고 있으면, 두 번째 날부터 떼어 준다
  const hasBase = list.some((t) => !t.dates?.length);
  return (hasBase ? free[1] ?? null : free[0] ?? null);
}
