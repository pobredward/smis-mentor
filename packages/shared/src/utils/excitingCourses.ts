/**
 * 익사이팅·야외 코스 — 장소별 하루 일정을 한 번만 만들고, 날짜·그룹마다 어느 코스인지만 고른다.
 *
 * 데이터: campSettings/{campCode}.dayPlan
 *   - courses: ExcitingCourse[] (캠프 전체 공용)
 *   - sets[].days[날짜].courseByGroup: { 그룹키: 코스 id }
 * 저장할 때 cleanDayPlan 이 코스 활동표를 slotsByGroup 에 옮겨 적으므로, 읽는 쪽(보기·환자 위치·옛 앱)은 그대로다.
 *
 * 여기 함수들은 편집기의 W.editDayPlan(fn) 안에서 쓰는 것 — plan 을 그 자리에서 고친다(읽기 함수 제외).
 */
import { normalizeGroupKey } from '../types/campTimetable';
import {
  cleanSlotList,
  daySetForGroup,
  hhmmToMinutes,
  isActivityDayKind,
  type CampDayPlan,
  type DayKind,
  type DayPlanEntry,
  type DayPlanSet,
  type ExcitingCourse,
  type ExcitingSlot,
} from '../types/campDayPlan';
import { newId } from './id';

/** 배정표 칸 색 (코스 순서대로) */
export const COURSE_COLORS = ['#fde68a', '#bfdbfe', '#bbf7d0', '#fecaca', '#ddd6fe', '#fbcfe8', '#fed7aa', '#a5f3fc', '#d9f99d', '#e5e7eb'];

export const newCourseId = (): string => `c${newId().replace(/-/g, '').slice(0, 8)}`;
export const newSlotId = (): string => newId().replace(/-/g, '').slice(0, 8);

export const coursesOf = (plan: CampDayPlan | null | undefined): ExcitingCourse[] => plan?.courses ?? [];
export const courseById = (plan: CampDayPlan | null | undefined, id: string | null | undefined): ExcitingCourse | undefined =>
  id ? coursesOf(plan).find((c) => c.id === id) : undefined;

/** 다음 코스 색 — 아직 안 쓴 색부터 */
export function nextCourseColor(plan: CampDayPlan | null | undefined): string {
  const used = new Set(coursesOf(plan).map((c) => c.color));
  return COURSE_COLORS.find((c) => !used.has(c)) ?? COURSE_COLORS[coursesOf(plan).length % COURSE_COLORS.length];
}

function locate(plan: CampDayPlan | null | undefined, date: string, group: string): { set?: DayPlanSet; entry?: DayPlanEntry; key: string } {
  const key = normalizeGroupKey(group);
  const set = daySetForGroup(plan, group);
  return { set, entry: set?.days[date], key };
}

/** 어느 세트에서든 익사이팅·야외 날인 날짜 (오름차순) */
export function activityDates(plan: CampDayPlan | null | undefined): string[] {
  const out = new Set<string>();
  (plan?.sets ?? []).forEach((s) => Object.entries(s.days ?? {}).forEach(([d, e]) => isActivityDayKind(e?.kind) && out.add(d)));
  return [...out].sort();
}

export type CellState =
  /** 이 그룹은 그날 익사이팅·야외 날이 아님 (Day 는 일정표 탭에서) */
  | { type: 'off'; kind: DayKind | null }
  | { type: 'course'; course: ExcitingCourse }
  /** 이 그룹만 직접 넣은 활동표 */
  | { type: 'own'; slots: ExcitingSlot[] }
  /** 세트 공통으로 직접 넣은 활동표 (옛 방식) */
  | { type: 'common'; slots: ExcitingSlot[] }
  | { type: 'empty' };

export function cellState(plan: CampDayPlan | null | undefined, date: string, group: string): CellState {
  const { entry, key } = locate(plan, date, group);
  if (!entry || !isActivityDayKind(entry.kind)) return { type: 'off', kind: entry?.kind ?? null };
  const course = courseById(plan, entry.courseByGroup?.[key]);
  if (course) return { type: 'course', course };
  const own = entry.slotsByGroup?.[key];
  if (own?.length) return { type: 'own', slots: own };
  if (entry.slots?.length) return { type: 'common', slots: entry.slots };
  return { type: 'empty' };
}

/** 그 칸의 활동표 (코스 · 직접 · 공통) */
export function cellSlots(plan: CampDayPlan | null | undefined, date: string, group: string): ExcitingSlot[] {
  const st = cellState(plan, date, group);
  return st.type === 'course' ? st.course.slots : st.type === 'own' || st.type === 'common' ? st.slots : [];
}

function tidy(entry: DayPlanEntry) {
  if (entry.courseByGroup && !Object.keys(entry.courseByGroup).length) delete entry.courseByGroup;
  if (entry.slotsByGroup && !Object.keys(entry.slotsByGroup).length) delete entry.slotsByGroup;
}

/** 칸에 코스 고르기 — null 이면 비운다 (그 그룹 전용 활동표도 지움) */
export function assignCourse(plan: CampDayPlan, date: string, group: string, courseId: string | null): void {
  const { entry, key } = locate(plan, date, group);
  if (!entry || !key || !isActivityDayKind(entry.kind)) return;
  entry.courseByGroup = { ...(entry.courseByGroup ?? {}) };
  entry.slotsByGroup = { ...(entry.slotsByGroup ?? {}) };
  delete entry.slotsByGroup[key];
  if (courseId && courseById(plan, courseId)) entry.courseByGroup[key] = courseId;
  else delete entry.courseByGroup[key];
  tidy(entry);
}

/** 이 칸만 직접 고치기 — 지금 보이는 활동표를 그 그룹 전용으로 복사하고 코스 연결을 끊는다 */
export function detachCell(plan: CampDayPlan, date: string, group: string): void {
  const { entry, key } = locate(plan, date, group);
  if (!entry || !key || !isActivityDayKind(entry.kind)) return;
  const slots = cellSlots(plan, date, group).map((s) => ({ ...s, id: newSlotId() }));
  entry.courseByGroup = { ...(entry.courseByGroup ?? {}) };
  delete entry.courseByGroup[key];
  entry.slotsByGroup = { ...(entry.slotsByGroup ?? {}) };
  if (slots.length) entry.slotsByGroup[key] = slots;
  else delete entry.slotsByGroup[key];
  tidy(entry);
}

/** 그 그룹 전용 활동표 고치기 (코스 칸이면 먼저 떼어 낸다) */
export function editCellSlots(plan: CampDayPlan, date: string, group: string, fn: (xs: ExcitingSlot[]) => ExcitingSlot[]): void {
  const st = cellState(plan, date, group);
  if (st.type === 'off') return;
  if (st.type !== 'own') detachCell(plan, date, group);
  const { entry, key } = locate(plan, date, group);
  if (!entry) return;
  const next = fn(entry.slotsByGroup?.[key] ?? []);
  entry.slotsByGroup = { ...(entry.slotsByGroup ?? {}) };
  if (next.length) entry.slotsByGroup[key] = next;
  else delete entry.slotsByGroup[key];
  tidy(entry);
}

// ─── 코스 목록 ──────────────────────────────────────────────────────────

export function addCourse(plan: CampDayPlan, init: Partial<Omit<ExcitingCourse, 'id'>> = {}): string {
  const id = newCourseId();
  const n = coursesOf(plan).length + 1;
  plan.courses = [
    ...coursesOf(plan),
    { id, name: init.name ?? `코스 ${n}`, color: init.color ?? nextCourseColor(plan), slots: (init.slots ?? []).map((s) => ({ ...s, id: newSlotId() })) },
  ];
  return id;
}

export function editCourse(plan: CampDayPlan, id: string, fn: (c: ExcitingCourse) => void): void {
  plan.courses = coursesOf(plan).map((c) => {
    if (c.id !== id) return c;
    const next = { ...c, slots: c.slots.map((s) => ({ ...s })) };
    fn(next);
    return next;
  });
}

export function duplicateCourse(plan: CampDayPlan, id: string): string {
  const src = courseById(plan, id);
  if (!src) return '';
  return addCourse(plan, { name: `${src.name} (복사)`, slots: src.slots });
}

export function moveCourse(plan: CampDayPlan, id: string, dir: -1 | 1): void {
  const list = [...coursesOf(plan)];
  const i = list.findIndex((c) => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  plan.courses = list;
}

/** 이 코스를 쓰는 칸 (날짜 오름차순) */
export function courseUsage(plan: CampDayPlan | null | undefined, id: string): Array<{ date: string; group: string }> {
  const out: Array<{ date: string; group: string }> = [];
  (plan?.sets ?? []).forEach((s) =>
    Object.entries(s.days ?? {}).forEach(([date, e]) => {
      if (!isActivityDayKind(e?.kind)) return;
      Object.entries(e.courseByGroup ?? {}).forEach(([g, cid]) => cid === id && out.push({ date, group: g }));
    })
  );
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.group.localeCompare(b.group));
}

/** 코스 지우기 — 쓰던 칸은 활동표를 그대로 두고 '직접 입력' 이 된다. @returns 그런 칸 수 */
export function deleteCourse(plan: CampDayPlan, id: string): number {
  const used = courseUsage(plan, id);
  used.forEach(({ date, group }) => detachCell(plan, date, group));
  plan.courses = coursesOf(plan).filter((c) => c.id !== id);
  if (!plan.courses.length) delete plan.courses;
  return used.length;
}

// ─── 같은 활동표 묶기 ───────────────────────────────────────────────────

/** 비교용 — id 는 빼고 시작 시각 순 */
export function slotsSignature(list: ExcitingSlot[] | undefined): string {
  return JSON.stringify(cleanSlotList(list).map((s) => [s.start, s.end, s.activity, s.place, s.note ?? '']));
}

const GENERIC_PLACE = /식당|버스|숙소|강의실|로비|이동|^$/;
const stripParen = (s: string) => s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

/** 활동표에서 코스 이름 짓기 — 오래 머무는 현장 장소 두 곳 (식당·버스·숙소·강의실처럼 어디나 있는 곳은 뺌) */
export function courseNameFromSlots(slots: ExcitingSlot[], commonPlaces: Set<string> = new Set()): string {
  const dur = (s: ExcitingSlot) => Math.max(0, (hhmmToMinutes(s.end) ?? 0) - (hhmmToMinutes(s.start) ?? 0));
  const sites = slots.filter((s) => {
    const p = s.place.trim();
    return p && !GENERIC_PLACE.test(p) && !commonPlaces.has(p);
  });
  const byPlace = new Map<string, { minutes: number; first: number }>();
  sites.forEach((s) => {
    const p = stripParen(s.place);
    const cur = byPlace.get(p) ?? { minutes: 0, first: hhmmToMinutes(s.start) ?? 0 };
    cur.minutes += dur(s);
    byPlace.set(p, cur);
  });
  const top = [...byPlace.entries()].sort((a, b) => b[1].minutes - a[1].minutes).slice(0, 2).sort((a, b) => a[1].first - b[1].first);
  if (top.length) return top.map(([p]) => p).join(' · ');
  const longest = [...slots].filter((s) => s.activity.trim()).sort((a, b) => dur(b) - dur(a))[0];
  return longest ? stripParen(longest.activity) : '';
}

export interface CourseSuggestion {
  /** 제안을 가리키는 키 (활동표 내용) */
  key: string;
  /** 이미 있는 코스와 같으면 그 코스에 잇는다 */
  courseId?: string;
  name: string;
  slots: ExcitingSlot[];
  cells: Array<{ date: string; group: string }>;
  /** 칸이 더 많은 다른 제안과 한두 줄(20% 이하)만 다르다 (예: 마지막 날만 용돈 금액이 다름) — 기본은 묶지 않고 '직접 입력' 으로 둔다 */
  variantOf?: { name: string; diff: number };
}

/** 두 활동표가 몇 줄 다른지 (시작 시각 순으로 맞춰 비교) */
export function slotsDiff(a: ExcitingSlot[], b: ExcitingSlot[]): number {
  const row = (x?: ExcitingSlot) => (x ? JSON.stringify([x.start, x.end, x.activity, x.place, x.note ?? '']) : '');
  const xa = cleanSlotList(a);
  const xb = cleanSlotList(b);
  let n = 0;
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) if (row(xa[i]) !== row(xb[i])) n++;
  return n;
}

/**
 * 코스로 묶지 않은 칸(직접·공통)의 활동표를 같은 것끼리 모은다.
 * 이미 있는 코스와 같은 활동표는 그 코스에 잇고, 나머지는 새 코스로 제안한다.
 * 활동표 없이 그날 메모(장소 이름)만 있는 칸은 그 이름의 빈 코스로 제안한다 (S캠프처럼 장소만 적어 둔 경우).
 */
export function suggestCourses(plan: CampDayPlan | null | undefined, groups?: string[]): CourseSuggestion[] {
  type Acc = { slots: ExcitingSlot[]; cells: Array<{ date: string; group: string }>; notes: string[]; fromNote?: string };
  const bySig = new Map<string, Acc>();
  (plan?.sets ?? []).forEach((s) => {
    const members = s.groups.length ? s.groups : (groups ?? []).map(normalizeGroupKey).filter((g) => daySetForGroup(plan, g) === s);
    Object.entries(s.days ?? {}).forEach(([date, e]) => {
      if (!isActivityDayKind(e?.kind)) return;
      members.forEach((g) => {
        if (courseById(plan, e.courseByGroup?.[g])) return;
        const slots = e.slotsByGroup?.[g]?.length ? e.slotsByGroup[g] : e.slots ?? [];
        const note = (e.note ?? '').trim();
        if (!slots.length && !note) return;
        const sig = slots.length ? slotsSignature(slots) : `note:${note}`;
        const hit = bySig.get(sig) ?? { slots: cleanSlotList(slots), cells: [], notes: [], ...(slots.length ? {} : { fromNote: note }) };
        hit.cells.push({ date, group: g });
        hit.notes.push(note);
        bySig.set(sig, hit);
      });
    });
  });
  const existing = new Map(coursesOf(plan).map((c) => [c.slots.length ? slotsSignature(c.slots) : `note:${c.name.trim()}`, c.id]));
  const list = [...bySig.entries()];
  // 거의 모든 활동표에 나오는 장소(식당·버스 같은 곳)는 이름에서 뺀다
  const withSlots = list.filter(([, x]) => x.slots.length);
  const counts = new Map<string, number>();
  withSlots.forEach(([, x]) => new Set(x.slots.map((sl) => sl.place.trim())).forEach((p) => counts.set(p, (counts.get(p) ?? 0) + 1)));
  const commonPlaces = new Set(
    withSlots.length >= 3 ? [...counts].filter(([, n]) => n >= Math.ceil(withSlots.length * 0.75)).map(([p]) => p) : []
  );
  const names = new Set(coursesOf(plan).map((c) => c.name));
  const out: CourseSuggestion[] = list.map(([key, x]) => {
    const courseId = existing.get(key);
    const sameNote = x.notes.every((n) => n && n === x.notes[0]) ? x.notes[0] : '';
    let name = courseId ? courseById(plan, courseId)!.name : x.fromNote || sameNote || courseNameFromSlots(x.slots, commonPlaces) || '코스';
    if (!courseId) {
      const base = name;
      const only = new Set(x.cells.map((c) => c.group));
      if (names.has(name) && only.size === 1) {
        const g = [...only][0];
        name = `${base} (${(groups ?? []).find((n) => normalizeGroupKey(n) === g) ?? g})`;
      }
      let n = 2;
      while (names.has(name)) name = `${base} ${n++}`;
      names.add(name);
    }
    return { key, ...(courseId ? { courseId } : {}), name, slots: x.slots, cells: x.cells };
  });
  // 칸이 더 많은 제안(또는 있는 코스)과 한두 줄(20% 이하)만 다르면 '변형' 으로 표시
  out.forEach((x) => {
    if (x.courseId || !x.slots.length) return;
    const refs = [
      ...out.filter((y) => y !== x && y.slots.length && y.cells.length > x.cells.length).map((y) => ({ name: y.name, slots: y.slots })),
      ...coursesOf(plan).filter((c) => c.slots.length).map((c) => ({ name: c.name, slots: c.slots })),
    ];
    let best: { name: string; diff: number } | undefined;
    refs.forEach((r) => {
      const diff = slotsDiff(x.slots, r.slots);
      const limit = Math.min(2, Math.max(1, Math.floor(Math.max(x.slots.length, r.slots.length) * 0.2)));
      if (diff <= limit && (!best || diff < best.diff)) best = { name: r.name, diff };
    });
    if (best) x.variantOf = best;
  });
  return out.sort((a, b) => (a.cells[0]?.date ?? '').localeCompare(b.cells[0]?.date ?? '') || a.name.localeCompare(b.name));
}

/**
 * 제안 적용. choose 를 주면 그 키만, 주어진 이름으로 (없으면 변형이 아닌 것 전부).
 * @returns 새 코스 수 · 이은 칸 수
 */
export function applySuggestions(
  plan: CampDayPlan,
  groups?: string[],
  choose?: Record<string, string>
): { created: number; linked: number } {
  const list = suggestCourses(plan, groups).filter((x) => (choose ? x.key in choose : !x.variantOf));
  let created = 0;
  let linked = 0;
  list.forEach((x) => {
    const name = (choose?.[x.key] ?? '').trim() || x.name;
    const id = x.courseId ?? addCourse(plan, { name, slots: x.slots });
    if (!x.courseId) created++;
    x.cells.forEach(({ date, group }) => {
      assignCourse(plan, date, group, id);
      linked++;
    });
  });
  return { created, linked };
}

/** 이 칸의 활동표로 새 코스를 만들고, 똑같은 활동표를 쓰는 다른 칸도 함께 잇는다. @returns 코스 id */
export function saveCellAsCourse(plan: CampDayPlan, date: string, group: string, name?: string, groups?: string[]): string {
  const slots = cellSlots(plan, date, group);
  if (!slots.length) return '';
  const sig = slotsSignature(slots);
  const id = addCourse(plan, { name: name?.trim() || courseNameFromSlots(slots) || undefined, slots });
  const same = suggestCourses(plan, groups).find((x) => x.key === sig);
  const cells = same?.cells ?? [{ date, group: normalizeGroupKey(group) }];
  cells.forEach((c) => assignCourse(plan, c.date, c.group, id));
  return id;
}
