/**
 * 저장 전 빈 시간표 만들기
 *
 * 저장된 표가 없는 그룹에도 반·시간 열은 보이도록 뼈대만 만든다.
 * 교시·과목·일정 같은 실제 내용은 전부 Firestore 의 저장된 표에서 오고,
 * 이 파일에는 어느 기수의 값도 박아 두지 않는다.
 */
import type {
  CampTimetable,
  DerivedGroup,
  TimetableClassColumn,
  TimetableCommonValues,
} from '../types/campTimetable';
import { applyCommon, categoryLabel, findCategory, isSameGroup } from '../types/campTimetable';

/** 아직 저장된 적 없는 표의 id 앞머리 */
const UNSAVED_PREFIX = 'unsaved:';

/**
 * 반 구성만 채운 빈 표.
 * 저장을 누르면 그때 이 캠프 전용 표로 만들어진다.
 */
export function buildEmptyTimetable(args: {
  category: string;
  groupName: string;
  classes: TimetableClassColumn[];
  campCode: string;
  jobCodeId: string;
}): CampTimetable | null {
  const cat = findCategory(args.category);
  if (!cat) return null;
  const now = { toDate: () => new Date() } as CampTimetable['createdAt'];

  return {
    id: `${UNSAVED_PREFIX}${args.category}:${args.groupName}`,
    campCode: args.campCode,
    jobCodeId: args.jobCodeId,
    groupName: args.groupName,
    dayType: args.category,
    dayTypeLabel: categoryLabel(cat, args.campCode),
    layout: cat.layout,
    order: 0,
    classes: args.classes,
    extraColumns: [],
    subjects: [],
    blocks: [],
    note: '',
    createdAt: now,
    createdBy: '',
    updatedAt: now,
    updatedBy: '',
  };
}

/** 이 표가 아직 저장된 적 없는 빈 표인지 */
export function isUnsaved(t: Pick<CampTimetable, 'id'>): boolean {
  return typeof t.id === 'string' && t.id.startsWith(UNSAVED_PREFIX);
}

/**
 * 고른 Day·그룹의 표.
 * 저장된 게 있으면 그것을, 없으면 배정된 반으로 만든 빈 표를 돌려준다.
 * 반 배정조차 없으면 만들 수 없으므로 undefined.
 */
export function resolveTimetable(args: {
  timetables: CampTimetable[];
  groups: DerivedGroup[];
  category: string | null;
  groupName: string | null;
  campCode: string;
  jobCodeId: string;
  /** 그룹명 → 그 그룹의 모든 Day 가 함께 쓰는 값 */
  common?: Record<string, TimetableCommonValues>;
}): CampTimetable | undefined {
  const { timetables, groups, category, groupName, campCode, jobCodeId, common } = args;
  if (!category || !groupName || !jobCodeId) return undefined;

  const shared = commonFor(common, groupName);

  const saved = timetables.find((t) => t.dayType === category && isSameGroup(t.groupName, groupName));
  if (saved) return applyCommon(saved, shared);

  // 저장된 표가 없으면 배정된 반으로 뼈대만 — 공통 값이 있으면 그것도 씌운다
  const codes = groups.find((g) => isSameGroup(g.name, groupName))?.classCodes ?? [];
  if (!codes.length && !shared?.classes?.length) return undefined;

  const empty = buildEmptyTimetable({
    category,
    groupName,
    classes: codes.map((classCode) => ({ classCode })),
    campCode,
    jobCodeId,
  });
  return empty ? applyCommon(empty, shared) : undefined;
}

/** 그룹 이름 표기가 조금 달라도 같은 그룹이면 찾아 준다 */
export function commonFor(
  common: Record<string, TimetableCommonValues> | undefined,
  groupName: string
): TimetableCommonValues | undefined {
  if (!common) return undefined;
  const hit = Object.entries(common).find(([name]) => isSameGroup(name, groupName));
  return hit?.[1];
}
