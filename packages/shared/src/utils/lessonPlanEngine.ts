/**
 * 원어민 레슨플랜 — 날짜 붙이기 · 밀기 · 자동 채우기 (web·mobile 공용, 화면 없음)
 *
 * 저장은 "줄의 순서"(교재 줄 · 액티비티 줄)이고, 날짜는 여기서 캠프 일정표로 붙인다.
 *  1) 캠프 기간 + 일정표(dayPlan 세트) → 날짜마다 Day 번호와 종류 (planCalendar)
 *  2) 반마다: Regular Day 가 수업 칸. 그 반의 쉬는 날(skips)은 빼고, 보충 수업(extraDays)은 넣는다
 *  3) 줄마다: 공통 칸 + 그 반만의 빈 칸·이어하기 칸(gaps), 빼기·합치기(drops) → 칸 묶음 순서
 *     날짜 고정(pinDate) 칸은 그날에 두고, 나머지를 수업 칸에 차례로 놓는다. 남는 칸은 "Didn't fit"
 *  4) 복습 칸은 앞 수업의 단원으로 자동 (교재 칸에 직접 쓴 복습이 있으면 그것)
 *
 * 엣지 케이스 (원어민 입장):
 *  - 하루 통째로 못 함 (아픔·행사·다른 활동) → setSkip: 그 뒤가 하루씩 밀린다 (반 / 교재 전체 / 내 모든 교재)
 *  - 교재는 했는데 액티비티를 못 함 → pushLane('activity', …, 'push'): 액티비티 줄만 밀린다
 *  - 단원이 하루에 안 끝남 → pushLane('book', …, 'continue'): 그 단원을 하루 더, 뒤 단원은 밀린다
 *  - 따라잡기 → mergeWithPrevious (두 칸을 하루에) / removeFiller (밀었던 칸 되돌리기)
 *  - 같은 교재 두 반 중 한 반만 밀림 → scope = 반 키: 그 반에만 기록 (내용은 함께 쓴다)
 *  - 날짜에 묶인 활동 → pinItem: 앞이 밀려도 그날에 남는다
 *  - 일정표가 바뀜 → 순서로 저장하므로 다시 붙는다. 수업 없는 날이 된 쉬는 날 기록은 경고
 *  - 보충 수업 → setExtraDay
 */
import type { CampTimetable } from '../types/campTimetable';
import { findDayKind, isActivityDayKind, type DayKind, type DayPlanSet } from '../types/campDayPlan';
import type { EslBookList } from '../types/eslBook';
import type {
  BookUnit,
  BundleEntry,
  EslBookUnits,
  LessonPlanDoc,
  LessonPlanStatus,
  PlanClassAdjust,
  PlanGap,
  PlanItem,
  PlanLane,
  PlanSkip,
} from '../types/lessonPlanDoc';
import type { LessonClass } from './lessonPlan';
import { newId } from './id';

// ── 날짜 ────────────────────────────────────────────────────────────

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const utc = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
};
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Timestamp · Date · 'YYYY-MM-DD' → 'YYYY-MM-DD' (로컬 날짜) */
export function toYmd(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return YMD.test(v.slice(0, 10)) ? v.slice(0, 10) : '';
  const d = typeof (v as { toDate?: () => Date }).toDate === 'function' ? (v as { toDate: () => Date }).toDate() : v instanceof Date ? v : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** '2026-07-27' → '7/27' */
export const shortDate = (date: string) => {
  const d = utc(date);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

export interface PlanDay {
  date: string;
  /** 입소일 = 1 */
  dayNo: number;
  weekday: string;
  kind: DayKind | null;
  /** 'Regular Day' · 'STEAM Day' (S·F 캠프는 'Going-Up Day') · 'Exciting Day' … */
  kindLabel: string;
  note?: string;
}

/** 레슨플랜에 쓰는 짧은 영어 이름 */
export function planDayLabel(kind: DayKind | null | undefined, campCode?: string | null): string {
  if (!kind) return '';
  const prefix = String(campCode ?? '').trim().charAt(0).toUpperCase();
  if (kind === 'steam' && (prefix === 'S' || prefix === 'F')) return 'Going-Up Day';
  if (kind === 'final') return 'Final Test Day';
  return findDayKind(kind)?.short ?? kind;
}

/** 캠프 기간의 날짜마다 Day 번호 · 요일 · 일정표 종류 */
export function planCalendar(start: string, end: string, set: DayPlanSet | undefined, campCode?: string | null): PlanDay[] {
  if (!YMD.test(start) || !YMD.test(end) || end < start) return [];
  const out: PlanDay[] = [];
  const cur = utc(start);
  const last = utc(end);
  let n = 1;
  while (cur <= last && n <= 150) {
    const date = ymd(cur);
    const entry = set?.days?.[date];
    const kind = (entry?.kind ?? null) as DayKind | null;
    out.push({
      date, dayNo: n, weekday: WEEK[cur.getUTCDay()], kind, kindLabel: planDayLabel(kind, campCode),
      ...(entry?.note ? { note: entry.note } : {}),
    });
    cur.setUTCDate(cur.getUTCDate() + 1);
    n += 1;
  }
  return out;
}

/** 일정표가 있는 캘린더인지 (종류가 하나라도 붙어 있어야 날짜를 붙일 수 있다) */
export const hasSchedule = (cal: PlanDay[]) => cal.some((d) => !!d.kind);

// ── 줄 → 칸 묶음 ────────────────────────────────────────────────────

export interface PlanCell {
  item: PlanItem;
  /** base: 공통 칸 · class: 이 반만의 빈 칸/이어하기 칸 */
  source: 'base' | 'class';
  gapId?: string;
  /** 이어하기 칸 — 이어서 하는 앞 칸 */
  prev?: PlanItem;
  pinned?: boolean;
  /** 이 반만 앞 칸과 합친 칸 */
  mergedForClass?: boolean;
}

const kindOf = (it: PlanItem) => it.kind ?? 'item';
const laneItems = (plan: Pick<LessonPlanDoc, 'book' | 'activity'>, lane: PlanLane) => (lane === 'book' ? plan.book : plan.activity) ?? [];

function laneSequence(plan: Pick<LessonPlanDoc, 'book' | 'activity'>, lane: PlanLane, adj: PlanClassAdjust | undefined) {
  const gaps = (adj?.gaps ?? []).filter((g) => g.lane === lane);
  const drops = new Map((adj?.drops ?? []).filter((d) => d.lane === lane).map((d) => [d.itemId, d]));
  const out: Array<{ cell: PlanCell; withPrev: boolean }> = [];
  let lastReal: PlanItem | undefined;
  const pushGap = (g: PlanGap) => out.push({
    cell: { item: { id: g.id, kind: g.kind, ...(g.note ? { text: g.note } : {}) }, source: 'class', gapId: g.id, ...(g.kind === 'continue' && lastReal ? { prev: lastReal } : {}) },
    withPrev: false,
  });
  for (const it of laneItems(plan, lane)) {
    gaps.filter((g) => g.anchor === it.id && g.position === 'before').forEach(pushGap);
    const d = drops.get(it.id);
    if (!d || d.merge) {
      out.push({
        cell: {
          item: it, source: 'base',
          ...(kindOf(it) === 'continue' && lastReal ? { prev: lastReal } : {}),
          ...(it.pinDate ? { pinned: true } : {}),
          ...(d?.merge ? { mergedForClass: true } : {}),
        },
        withPrev: !!it.withPrev || !!d?.merge,
      });
      if (kindOf(it) === 'item') lastReal = it;
    }
    gaps.filter((g) => g.anchor === it.id && g.position === 'after').forEach(pushGap);
  }
  return out;
}

/** 줄 → 칸 묶음 (앞 칸과 함께인 칸은 같은 묶음) */
export function laneGroups(plan: Pick<LessonPlanDoc, 'book' | 'activity'>, lane: PlanLane, adj?: PlanClassAdjust): PlanCell[][] {
  const groups: PlanCell[][] = [];
  laneSequence(plan, lane, adj).forEach((e) => {
    if (e.withPrev && groups.length) groups[groups.length - 1].push(e.cell);
    else groups.push([e.cell]);
  });
  return groups;
}

function fillLane(groups: PlanCell[][], slots: string[], warnings: string[], lane: PlanLane) {
  const slotSet = new Set(slots);
  const pinned = new Map<string, PlanCell[]>();
  const flow: PlanCell[][] = [];
  groups.forEach((g) => {
    const pin = g[0]?.source === 'base' ? g[0].item.pinDate : undefined;
    if (pin && slotSet.has(pin)) pinned.set(pin, [...(pinned.get(pin) ?? []), ...g]);
    else {
      if (pin) warnings.push(`${lane === 'book' ? 'Book' : 'Activity'} pinned to ${shortDate(pin)}, but there is no class that day`);
      flow.push(g.map((c) => (c.pinned ? { ...c, pinned: false } : c)));
    }
  });
  const bySlot = new Map<string, PlanCell[]>();
  let i = 0;
  slots.forEach((s) => {
    const p = pinned.get(s);
    if (p) bySlot.set(s, p);
    else if (i < flow.length) bySlot.set(s, flow[i++]);
  });
  return { bySlot, overflow: flow.slice(i) };
}

// ── 화면에 그릴 표 ──────────────────────────────────────────────────

export type PlanRowType = 'orientation' | 'lesson' | 'final' | 'off' | 'skipped';

export interface PlanRow {
  /** 일정표가 없을 때는 null (레슨 순서만) */
  day: PlanDay | null;
  type: PlanRowType;
  lessonNo?: number;
  /** 원래 수업이 없는 날의 보충 수업 */
  extra?: boolean;
  skip?: PlanSkip;
  book: PlanCell[];
  activity: PlanCell[];
  review: string;
  reviewAuto: boolean;
  /** 야외 수업 다음 날 (S·F 캠프) — 10~20분 야외 활동 복습 */
  afterOutdoor?: boolean;
}

export interface PlanLayout {
  rows: PlanRow[];
  lessons: PlanRow[];
  overflow: Record<PlanLane, PlanCell[][]>;
  warnings: string[];
  hasCalendar: boolean;
  /** 교재나 액티비티가 채워진 수업 수 / 전체 수업 수 */
  filled: number;
  total: number;
}

export type UnitDescriber = (units: number[], part?: string) => string;
const defaultDescribe: UnitDescriber = (units, part) => [units.map((u) => `U${u}`).join(' + '), part].filter(Boolean).join(' · ');

/** 칸 하나를 한 줄 글로 */
export function cellLabel(cell: PlanCell, describe: UnitDescriber = defaultDescribe): string {
  const it = cell.item;
  const k = kindOf(it);
  const own = (x: PlanItem) => [x.units?.length ? describe(x.units, x.part) : x.part, x.text].filter(Boolean).join(' · ');
  if (k === 'blank') return it.text ? `— ${it.text}` : '—';
  if (k === 'continue') {
    // 이어하기는 단원 이름만 (앞 칸 메모는 되풀이하지 않는다) + 그날 메모
    const p = cell.prev;
    const head = p ? (p.units?.length ? describe(p.units, p.part) : p.text ?? '') : '';
    return `(cont.) ${head}${it.text ? ` · ${it.text}` : ''}`.trim();
  }
  return own(it);
}

export const cellsLabel = (cells: PlanCell[], describe?: UnitDescriber) => cells.map((c) => cellLabel(c, describe)).filter(Boolean).join(' + ');

/** 칸에 실제 내용이 있는지 (빈 칸 · 비운 칸 제외) */
const isReal = (c: PlanCell) => kindOf(c.item) !== 'blank' && (kindOf(c.item) === 'continue' || !!(c.item.units?.length || c.item.text?.trim() || c.item.part));

export interface LayoutOptions {
  campCode?: string | null;
  describe?: UnitDescriber;
}

/**
 * 한 반의 레슨플랜 표.
 * 일정표가 없으면(아직 미입력) 날짜 없이 레슨 순서만 — 칸 수는 두 줄 중 긴 쪽.
 */
export function layoutPlan(plan: LessonPlanDoc, calendar: PlanDay[], classKey: string, opts: LayoutOptions = {}): PlanLayout {
  const adj = plan.classes?.[classKey];
  const warnings: string[] = [];
  const bookGroups = laneGroups(plan, 'book', adj);
  const actGroups = laneGroups(plan, 'activity', adj);
  const describe = opts.describe ?? defaultDescribe;
  const prefix = String(opts.campCode ?? plan.campCode ?? '').trim().charAt(0).toUpperCase();
  const rows: PlanRow[] = [];
  const empty = (): Pick<PlanRow, 'book' | 'activity' | 'review' | 'reviewAuto'> => ({ book: [], activity: [], review: '', reviewAuto: true });

  const withCalendar = hasSchedule(calendar);
  if (withCalendar) {
    const skips = new Map((adj?.skips ?? []).map((s) => [s.date, s]));
    const extras = new Set(adj?.extraDays ?? []);
    const known = new Set(calendar.map((d) => d.date));
    calendar.forEach((d) => {
      const classDay = d.kind === 'regular' || d.kind === 'orientation' || d.kind === 'final' || extras.has(d.date);
      const skip = skips.get(d.date);
      if (skip && classDay) rows.push({ day: d, type: 'skipped', skip, ...empty() });
      else if (d.kind === 'orientation') rows.push({ day: d, type: 'orientation', ...empty() });
      else if (d.kind === 'final') rows.push({ day: d, type: 'final', ...empty() });
      else if (d.kind === 'regular' || extras.has(d.date)) rows.push({ day: d, type: 'lesson', ...(d.kind !== 'regular' ? { extra: true } : {}), ...empty() });
      else rows.push({ day: d, type: 'off', ...empty() });
    });
    skips.forEach((s, date) => {
      const day = calendar.find((d) => d.date === date);
      const classDay = day && (day.kind === 'regular' || day.kind === 'orientation' || day.kind === 'final' || extras.has(date));
      if (!known.has(date) || !classDay) warnings.push(`"No class" on ${shortDate(date)} is ignored — that day is not a class day any more`);
    });
  } else {
    const n = Math.max(bookGroups.length, actGroups.length);
    for (let i = 0; i < n; i++) rows.push({ day: null, type: 'lesson', ...empty() });
  }

  const lessons = rows.filter((r) => r.type === 'lesson');
  const keys = lessons.map((r, i) => r.day?.date ?? `#${i}`);
  const book = fillLane(withCalendar ? bookGroups : bookGroups.map((g) => g.map((c) => ({ ...c, pinned: false }))), keys, warnings, 'book');
  const act = fillLane(withCalendar ? actGroups : actGroups.map((g) => g.map((c) => ({ ...c, pinned: false }))), keys, warnings, 'activity');

  let prevBook: PlanCell[] | null = null;
  lessons.forEach((r, i) => {
    r.lessonNo = i + 1;
    r.book = book.bySlot.get(keys[i]) ?? [];
    r.activity = act.bySlot.get(keys[i]) ?? [];
    const override = r.book.find((c) => c.item.review?.trim())?.item.review?.trim();
    const continuing = r.book.length > 0 && kindOf(r.book[0].item) === 'continue';
    const prevUnits = (prevBook ?? []).flatMap((c) => (kindOf(c.item) === 'item' ? c.item.units ?? [] : c.prev?.units ?? []));
    if (override) {
      r.review = override;
      r.reviewAuto = false;
    } else if (!continuing && prevUnits.length) {
      r.review = `Review ${describe([...new Set(prevUnits)])}`;
    }
    // 비운 칸(밀기)만 있는 날은 건너뛴다 — 다음 수업은 마지막으로 가르친 단원을 복습
    if (r.book.some((c) => kindOf(c.item) !== 'blank')) prevBook = r.book;
  });

  // 야외 수업(S·F 캠프의 Exciting/Outdoor Class) 다음 날 수업 — 야외 활동 복습
  if (withCalendar && (prefix === 'S' || prefix === 'F')) {
    rows.forEach((r, i) => {
      if (r.type !== 'lesson' || i === 0) return;
      if (isActivityDayKind(rows[i - 1].day?.kind)) {
        r.afterOutdoor = true;
        r.review = ['Outdoor class review (10–20 min)', r.review].filter(Boolean).join(' · ');
      }
    });
  }

  const fit = (n: number, one: string, many: string) => `${n} ${n > 1 ? `${many} don't` : `${one} doesn't`} fit — merge, remove or add an extra class`;
  if (book.overflow.length) warnings.push(fit(book.overflow.length, 'book lesson', 'book lessons'));
  if (act.overflow.length) warnings.push(fit(act.overflow.length, 'activity', 'activities'));

  return {
    rows,
    lessons,
    overflow: { book: book.overflow, activity: act.overflow },
    warnings,
    hasCalendar: withCalendar,
    filled: lessons.filter((r) => r.book.some(isReal) || r.activity.some(isReal)).length,
    total: lessons.length,
  };
}

// ── 고치기 (모두 새 문서를 돌려준다) ────────────────────────────────

type Plan = LessonPlanDoc;
const setLane = (plan: Plan, lane: PlanLane, items: PlanItem[]): Plan => (lane === 'book' ? { ...plan, book: items } : { ...plan, activity: items });
const adjustOf = (plan: Plan, key: string): PlanClassAdjust => plan.classes?.[key] ?? {};
const setAdjust = (plan: Plan, key: string, a: PlanClassAdjust): Plan => ({ ...plan, classes: { ...(plan.classes ?? {}), [key]: a } });

/** 'all' = 이 교재의 모든 반(공통 칸), 그 밖에는 반 키 */
export type PlanScope = 'all' | string;

/** 그날 수업 없음 — 반 키 여러 개 (교재 전체면 plan.classCodes) */
export function setSkip(plan: Plan, classKeys: string[], date: string, note?: string): Plan {
  let out = plan;
  classKeys.forEach((k) => {
    const a = adjustOf(out, k);
    const skips = (a.skips ?? []).filter((s) => s.date !== date);
    skips.push({ date, ...(note?.trim() ? { note: note.trim() } : {}) });
    skips.sort((x, y) => x.date.localeCompare(y.date));
    out = setAdjust(out, k, { ...a, skips });
  });
  return out;
}

export function clearSkip(plan: Plan, classKeys: string[], date: string): Plan {
  let out = plan;
  classKeys.forEach((k) => {
    const a = adjustOf(out, k);
    out = setAdjust(out, k, { ...a, skips: (a.skips ?? []).filter((s) => s.date !== date) });
  });
  return out;
}

/** 보충 수업 — 원래 수업이 없는 날을 수업 칸으로 */
export function setExtraDay(plan: Plan, classKeys: string[], date: string, on: boolean): Plan {
  let out = plan;
  classKeys.forEach((k) => {
    const a = adjustOf(out, k);
    const rest = (a.extraDays ?? []).filter((d) => d !== date);
    out = setAdjust(out, k, { ...a, extraDays: on ? [...rest, date].sort() : rest });
  });
  return out;
}

/**
 * 밀기.
 *  push: 이 칸을 비우고 이 칸부터 하루씩 뒤로 (anchor 앞에 빈 칸)
 *  continue: 이 칸을 하루 더 (anchor 뒤에 이어하기 칸) — 뒤 칸은 하루씩 뒤로
 */
export function pushLane(plan: Plan, lane: PlanLane, anchorId: string, mode: 'push' | 'continue', scope: PlanScope, note?: string): Plan {
  const kind = mode === 'push' ? 'blank' : 'continue';
  if (scope === 'all') {
    const items = [...laneItems(plan, lane)];
    const i = items.findIndex((x) => x.id === anchorId);
    if (i < 0) return plan;
    items.splice(mode === 'push' ? i : i + 1, 0, { id: newId(), kind, ...(note?.trim() ? { text: note.trim() } : {}) });
    return setLane(plan, lane, items);
  }
  const a = adjustOf(plan, scope);
  const gap: PlanGap = { id: newId(), lane, anchor: anchorId, position: mode === 'push' ? 'before' : 'after', kind, ...(note?.trim() ? { note: note.trim() } : {}) };
  return setAdjust(plan, scope, { ...a, gaps: [...(a.gaps ?? []), gap] });
}

/** 밀었던 칸(빈 칸·이어하기 칸) 되돌리기 */
export function removeFiller(plan: Plan, lane: PlanLane, cell: PlanCell, classKey: string): Plan {
  if (cell.source === 'class' && cell.gapId) {
    const a = adjustOf(plan, classKey);
    return setAdjust(plan, classKey, { ...a, gaps: (a.gaps ?? []).filter((g) => g.id !== cell.gapId) });
  }
  if (kindOf(cell.item) === 'item') return plan;
  return removeItem(plan, lane, cell.item.id);
}

/** 앞 칸과 같은 날에 (따라잡기). scope 가 반이면 그 반만 */
export function mergeWithPrevious(plan: Plan, lane: PlanLane, itemId: string, scope: PlanScope): Plan {
  if (scope === 'all') return updateItem(plan, lane, itemId, { withPrev: true });
  const a = adjustOf(plan, scope);
  const drops = (a.drops ?? []).filter((d) => !(d.lane === lane && d.itemId === itemId));
  return setAdjust(plan, scope, { ...a, drops: [...drops, { lane, itemId, merge: true }] });
}

/** 합친 칸 다시 나누기 (공통·반 모두) */
export function unmerge(plan: Plan, lane: PlanLane, itemId: string, classKey?: string): Plan {
  let out = updateItem(plan, lane, itemId, { withPrev: false });
  if (classKey) {
    const a = adjustOf(out, classKey);
    out = setAdjust(out, classKey, { ...a, drops: (a.drops ?? []).filter((d) => !(d.lane === lane && d.itemId === itemId)) });
  }
  return out;
}

/** 이 반은 이 칸을 하지 않음 / 되돌리기 */
export function dropForClass(plan: Plan, lane: PlanLane, itemId: string, classKey: string, on = true): Plan {
  const a = adjustOf(plan, classKey);
  const rest = (a.drops ?? []).filter((d) => !(d.lane === lane && d.itemId === itemId));
  return setAdjust(plan, classKey, { ...a, drops: on ? [...rest, { lane, itemId }] : rest });
}

export function pinItem(plan: Plan, lane: PlanLane, itemId: string, date: string | null): Plan {
  return updateItem(plan, lane, itemId, { pinDate: date ?? undefined });
}

export function updateItem(plan: Plan, lane: PlanLane, itemId: string, patch: Partial<PlanItem>): Plan {
  return setLane(plan, lane, laneItems(plan, lane).map((x) => {
    if (x.id !== itemId) return x;
    const next: PlanItem = { ...x, ...patch };
    (Object.keys(next) as Array<keyof PlanItem>).forEach((k) => {
      const v = next[k];
      if (v === undefined || v === false || v === '' || (Array.isArray(v) && !v.length)) delete next[k];
    });
    return next;
  }));
}

/** 공통 칸 넣기 — index 위치(없으면 맨 뒤) */
export function insertItem(plan: Plan, lane: PlanLane, index: number | null, item: Partial<PlanItem> = {}): { plan: Plan; id: string } {
  const items = [...laneItems(plan, lane)];
  const id = newId();
  const at = index === null || index < 0 || index > items.length ? items.length : index;
  items.splice(at, 0, { ...item, id });
  return { plan: setLane(plan, lane, items), id };
}

/** 공통 칸 지우기 — 이 칸에 걸린 반별 기록도 정리 */
export function removeItem(plan: Plan, lane: PlanLane, itemId: string): Plan {
  let out = setLane(plan, lane, laneItems(plan, lane).filter((x) => x.id !== itemId));
  Object.entries(out.classes ?? {}).forEach(([k, a]) => {
    out = setAdjust(out, k, {
      ...a,
      gaps: (a.gaps ?? []).filter((g) => !(g.lane === lane && g.anchor === itemId)),
      drops: (a.drops ?? []).filter((d) => !(d.lane === lane && d.itemId === itemId)),
    });
  });
  return out;
}

export function moveItem(plan: Plan, lane: PlanLane, itemId: string, dir: -1 | 1): Plan {
  const items = [...laneItems(plan, lane)];
  const i = items.findIndex((x) => x.id === itemId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return plan;
  [items[i], items[j]] = [items[j], items[i]];
  return setLane(plan, lane, items);
}

// ── 자동 채우기 ─────────────────────────────────────────────────────

/** 액티비티 추천 — 교재 단어로 하는 흔한 교실 게임 */
export const ACTIVITY_GAMES = [
  'Word Tennis', 'Pictionary', 'Charades', 'Hot Seat', 'Bingo', 'Hangman', 'Board Race',
  'Two Truths and a Lie', 'Would You Rather', 'Simon Says', 'Telephone', 'Categories', 'Scavenger Hunt', 'Odd One Out',
];

export const DEFAULT_ORIENTATION = 'Self-introductions · name game · class rules';
/** 필수 규칙 — Final Test Day 는 복습·영어 액티비티·사진 */
export const DEFAULT_FINAL = 'Final test · review & English games · photo time';

/** 필수 규칙 (레슨플랜 위 박스) */
export const PLAN_RULES = [
  'If the book has fewer than 12 units, teach one unit over two days.',
  'Final Test Day: review, English activity and photo time.',
  'The day after an outdoor class: include a 10–20 min outdoor activity review.',
];

/** 시간 비율 권장 — L-Code 첫 글자 A·B 는 Junior, 그 밖은 Senior */
export function planLevel(bookCodes: string[] | undefined): { level: 'Junior' | 'Senior'; ratio: string } {
  const band = String(bookCodes?.[0] ?? '').charAt(0).toUpperCase();
  return band === 'A' || band === 'B'
    ? { level: 'Junior', ratio: 'Review 10% · Book 40% · English activity 50%' }
    : { level: 'Senior', ratio: 'Review 10% · Book 70% · English activity 20%' };
}

/**
 * 교재 줄 · 액티비티 줄 자동 채우기.
 *  - 마지막 수업(4회 이상일 때)은 전체 복습 + Final 준비
 *  - 12단원 미만이면 한 단원을 이틀(Part 1 · Part 2) — 수업이 모자라면 앞 단원부터 들어가는 만큼
 *  - 수업보다 단원이 많으면 앞 단원부터, 남는 단원은 uncovered
 *  - 단원보다 수업이 많으면 남는 수업은 복습·확장
 */
export function autoFillLanes(units: BookUnit[], scope: number[] | undefined, lessonCount: number): { book: PlanItem[]; activity: PlanItem[]; uncovered: number[] } {
  const list = scope?.length ? scope.map((n) => units.find((u) => u.no === n) ?? { no: n, title: '' }) : [...units];
  const n = Math.max(0, Math.floor(lessonCount));
  if (!n) return { book: [], activity: [], uncovered: list.map((u) => u.no) };
  const reserve = n >= 4 ? 1 : 0;
  const avail = n - reserve;
  const book: PlanItem[] = [];
  let taken = 0;
  if (list.length && list.length < 12 && avail >= 2) {
    // 12단원 미만 교재는 한 단원을 이틀에 — 수업이 모자라면 앞 단원부터 들어가는 만큼만
    taken = Math.min(list.length, Math.floor(avail / 2));
    list.slice(0, taken).forEach((u) => {
      book.push({ id: newId(), units: [u.no], part: 'Part 1' }, { id: newId(), units: [u.no], part: 'Part 2' });
    });
  } else {
    taken = Math.min(list.length, avail);
    list.slice(0, taken).forEach((u) => book.push({ id: newId(), units: [u.no] }));
  }
  while (book.length < avail) book.push({ id: newId(), text: 'Review & extension' });
  if (reserve) book.push({ id: newId(), text: 'Review all units · Final test prep' });

  const activity: PlanItem[] = book.map((b, i) => {
    const last = reserve && i === book.length - 1;
    if (last) return { id: newId(), text: 'Review games (all units)' };
    const u = b.units?.length ? list.find((x) => x.no === b.units![0]) : undefined;
    const words = (u?.words ?? []).slice(0, 4).join(', ');
    const game = ACTIVITY_GAMES[i % ACTIVITY_GAMES.length];
    return { id: newId(), text: words ? `${game} — ${words}` : game };
  });
  return { book, activity, uncovered: list.slice(taken).map((u) => u.no) };
}

// ── 교재 · 반 ───────────────────────────────────────────────────────

export interface PlanBook {
  bookKey: string;
  bookTitle: string;
  subject: string;
  bookCodes: string[];
  /** 반 키 — 보조 교재는 'J07:spare' */
  classKeys: string[];
}

export const bookKeyOf = (title: string) => title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'book';
export const lessonPlanId = (userId: string, jobCodeId: string, bookTitle: string) => `${userId}_${jobCodeId}_${bookKeyOf(bookTitle)}`;
export const classKeyCode = (key: string) => key.split(':')[0];
export const isSpareKey = (key: string) => key.endsWith(':spare');
export const classKeyLabel = (key: string) => (isSpareKey(key) ? `${classKeyCode(key)} Spare` : key);

const SUBJECTS = ['speaking', 'reading', 'writing'] as const;
export const planSubjectOf = (groupRole: string | null | undefined): string => {
  const s = String(groupRole ?? '').trim().toLowerCase();
  return (SUBJECTS as readonly string[]).includes(s) ? s.charAt(0).toUpperCase() + s.slice(1) : '';
};

/** 레슨플랜을 쓰는 과목 — Speaking·Reading·Writing 은 그 과목, Mix 는 셋 다, 매니저 등은 없음 */
export function planSubjectsOf(groupRole: string | null | undefined): string[] {
  const one = planSubjectOf(groupRole);
  if (one) return [one];
  return String(groupRole ?? '').trim().toLowerCase() === 'mix' ? ['Speaking', 'Reading', 'Writing'] : [];
}

/** 선생님 과목 + 맡은 반 → 교재별 묶음 (같은 교재를 쓰는 반은 한 레슨플랜) */
export function planBooksFor(classes: LessonClass[], eslBooks: EslBookList | null | undefined, subject: string): { books: PlanBook[]; missing: string[] } {
  const key = subject.trim().toLowerCase() as (typeof SUBJECTS)[number];
  if (!(SUBJECTS as readonly string[]).includes(key)) return { books: [], missing: [] };
  const byTitle = new Map<string, PlanBook>();
  const missing: string[] = [];
  const add = (code: string | undefined, classKey: string) => {
    const title = code ? eslBooks?.codes?.[code]?.[key]?.trim() : '';
    if (!title) {
      missing.push(classKey);
      return;
    }
    const b = byTitle.get(title) ?? { bookKey: bookKeyOf(title), bookTitle: title, subject: subject.charAt(0).toUpperCase() + key.slice(1), bookCodes: [], classKeys: [] };
    if (code && !b.bookCodes.includes(code)) b.bookCodes.push(code);
    if (!b.classKeys.includes(classKey)) b.classKeys.push(classKey);
    byTitle.set(title, b);
  };
  classes.forEach((c) => {
    add(c.bookCode, c.classCode);
    if (c.spareBookCode) add(c.spareBookCode, `${c.classCode}:spare`);
  });
  return { books: [...byTitle.values()], missing };
}

/** 정규 시간표에서 이 과목이 반마다 언제인지 — 'J07' → '09:20–10:50' */
export function classTimesFor(t: CampTimetable | null | undefined, subject: string): Record<string, string> {
  const out: Record<string, string> = {};
  const want = subject.trim().toLowerCase();
  (t?.blocks ?? []).forEach((b) => {
    if (b.kind !== 'class' || !b.times?.length) return;
    Object.entries(b.cells ?? {}).forEach(([code, cell]) => {
      if (String(cell?.subject ?? '').trim().toLowerCase() === want && !out[code]) {
        out[code] = `${b.times![0].start}–${b.times![b.times!.length - 1].end}`;
      }
    });
  });
  return out;
}

export function newLessonPlan(input: {
  userId: string; userName?: string; jobCodeId: string; campCode: string; group?: string; book: PlanBook;
}): LessonPlanDoc {
  return {
    id: lessonPlanId(input.userId, input.jobCodeId, input.book.bookTitle),
    userId: input.userId,
    ...(input.userName ? { userName: input.userName } : {}),
    jobCodeId: input.jobCodeId,
    campCode: input.campCode,
    ...(input.group ? { group: input.group } : {}),
    subject: input.book.subject,
    bookTitle: input.book.bookTitle,
    bookCodes: input.book.bookCodes,
    classCodes: input.book.classKeys,
    orientation: DEFAULT_ORIENTATION,
    final: DEFAULT_FINAL,
    book: [],
    activity: [],
    status: 'draft',
  };
}

/**
 * 관리자가 반·교재 코드를 바꿨을 때 — 저장된 레슨플랜의 반 키·코드·그룹을 지금 배정에 맞춘다.
 * 바뀐 게 없으면 null. 반별 기록(classes)은 그대로 둔다 (반이 다시 돌아오면 쓰인다)
 */
export function syncPlanBook(plan: LessonPlanDoc, book: PlanBook, group?: string): LessonPlanDoc | null {
  const same = (a: string[] | undefined, b: string[]) => (a ?? []).length === b.length && (a ?? []).every((x, i) => x === b[i]);
  const groupChanged = !!group && plan.group !== group;
  if (same(plan.classCodes, book.classKeys) && same(plan.bookCodes, book.bookCodes) && plan.subject === book.subject && !groupChanged) return null;
  return { ...plan, classCodes: [...book.classKeys], bookCodes: [...book.bookCodes], subject: book.subject, ...(groupChanged ? { group } : {}) };
}

// ── 화면 도우미 ─────────────────────────────────────────────────────

export const PLAN_STATUS_LABEL: Record<LessonPlanStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', approved: 'Approved', changes: 'Changes requested',
};
export const PLAN_STATUS_LABEL_KO: Record<LessonPlanStatus, string> = {
  draft: '작성 중', submitted: '제출됨', approved: '승인', changes: '수정 요청',
};

/** 'Day 4 · Wed 7/29' */
export const planDayTitle = (d: PlanDay) => `Day ${d.dayNo} · ${d.weekday} ${shortDate(d.date)}`;

/** 일정표의 수업 날 수 (Regular Day) */
export const lessonCountOf = (calendar: PlanDay[]) => calendar.filter((d) => d.kind === 'regular').length;

/** "No class" 이유 빠른 선택 */
export const SKIP_REASONS = ['Sick day', 'Field trip', 'Camp event', 'Different activity'];

/** 행 동작의 기준 칸 — 반만의 빈 칸이 아닌 공통 칸 (밀기: 첫 칸 앞 · 이어하기: 마지막 칸 뒤) */
export function rowAnchors(cells: PlanCell[]): { first?: PlanCell; last?: PlanCell } {
  const base = cells.filter((c) => c.source === 'base');
  return { first: base[0], last: base[base.length - 1] };
}

/** 이 칸이 밀기로 생긴 칸(빈 칸·이어하기)인지 */
export const isFillerCell = (c: PlanCell) => kindOf(c.item) !== 'item';

/** 내용 없는 레슨플랜 (처음 만들었을 때) */
export const isEmptyPlan = (plan: Pick<LessonPlanDoc, 'book' | 'activity'>) => !(plan.book?.length || plan.activity?.length);

/** 이 반의 기록 개수 (탭에 점 찍기) */
export function classAdjustCount(plan: LessonPlanDoc, key: string): number {
  const a = plan.classes?.[key];
  return (a?.skips?.length ?? 0) + (a?.extraDays?.length ?? 0) + (a?.gaps?.length ?? 0) + (a?.drops?.length ?? 0);
}

/** 액티비티 추천 — 그 단원 단어로 하는 게임 몇 개 */
export function activityIdeas(unit: BookUnit | undefined, seed = 0): string[] {
  const words = (unit?.words ?? []).slice(0, 4).join(', ');
  return [0, 1, 2, 3].map((i) => {
    const game = ACTIVITY_GAMES[(seed + i * 3) % ACTIVITY_GAMES.length];
    return words ? `${game} — ${words}` : game;
  });
}

/**
 * 행 동작 목록 (web·앱 같은 목록) — 화면은 이 목록을 그리고 고르면 run 을 부른다.
 *  open: 'skip' 이면 이유·범위 창, 'insert' 면 새 칸을 넣고 편집 창
 *  scoped: 같은 교재 반이 여럿이면 "이 반만 / 모든 반"을 묻는다 (한 반이면 그 반)
 */
export interface PlanRowAction {
  key: string;
  section: 'This day' | 'Book' | 'Activity';
  label: string;
  hint?: string;
  danger?: boolean;
  open?: 'skip' | 'insert';
  lane?: PlanLane;
  /** insert — 넣을 자리 (공통 줄의 순서, null 이면 맨 뒤) */
  insertAt?: number | null;
  scoped?: boolean;
  scopeTitle?: string;
  /** scope: 'all' 또는 반 키 (범위를 묻지 않는 동작에는 지금 반 키) */
  run?: (plan: LessonPlanDoc, scope: PlanScope) => LessonPlanDoc;
  /** 끝난 뒤 짧은 안내 */
  done?: string;
}

const LANE_SECTION: Record<PlanLane, 'Book' | 'Activity'> = { book: 'Book', activity: 'Activity' };

export function planRowActions(
  plan: LessonPlanDoc,
  row: PlanRow,
  classKey: string,
  opts: { hasCalendar: boolean; describe?: UnitDescriber },
): PlanRowAction[] {
  const acts: PlanRowAction[] = [];
  const date = row.day?.date;
  const describe = opts.describe ?? defaultDescribe;
  if (row.type === 'skipped' && date) {
    acts.push({ key: 'unskip', section: 'This day', label: 'Class happened after all — undo', run: (p) => clearSkip(p, [classKey], date), done: 'Back in the plan' });
    const elsewhere = plan.classCodes.filter((k) => k !== classKey && plan.classes?.[k]?.skips?.some((x) => x.date === date));
    if (elsewhere.length) {
      acts.push({ key: 'unskipAll', section: 'This day', label: 'Undo for all classes', hint: [classKey, ...elsewhere].map(classKeyLabel).join(', '), run: (p) => clearSkip(p, p.classCodes, date), done: 'Back in the plan' });
    }
    return acts;
  }
  if (row.type === 'off' && date) {
    if (row.day?.kind !== 'checkout') {
      acts.push({
        key: 'extra', section: 'This day', label: 'Add an extra class this day', hint: 'A makeup lesson — the plan moves one lesson earlier',
        scoped: true, scopeTitle: 'Extra class', run: (p, s) => setExtraDay(p, s === 'all' ? p.classCodes : [s], date, true), done: 'Extra class added',
      });
    }
    return acts;
  }
  if (row.type !== 'lesson') return acts;
  if (date) {
    acts.push({ key: 'skip', section: 'This day', label: 'No class this day…', hint: 'Sick, trip, other activity — the whole plan moves back one lesson', open: 'skip' });
    if (row.extra) acts.push({ key: 'unextra', section: 'This day', label: 'Remove this extra class', danger: true, run: (p) => setExtraDay(p, [classKey], date, false), done: 'Extra class removed' });
  }
  (['book', 'activity'] as PlanLane[]).forEach((lane) => {
    const cells = row[lane];
    const base = cells.filter((c) => c.source === 'base' && !isFillerCell(c));
    const first = base[0];
    const last = base[base.length - 1];
    const section = LANE_SECTION[lane];
    if (lane === 'book' && last) {
      acts.push({
        key: 'continue', section, label: 'Not finished — continue next lesson', hint: 'Repeats this unit next lesson; the rest of the book moves back',
        scoped: true, scopeTitle: 'Continue next lesson', run: (p, s) => pushLane(p, 'book', last.item.id, 'continue', s), done: 'Continues next lesson',
      });
    }
    if (first) {
      acts.push({
        key: `push-${lane}`, section,
        label: lane === 'book' ? "Didn't start — push the book back" : "Didn't happen — push the activity back",
        hint: lane === 'book' ? 'Leaves the book blank today; activities stay where they are' : 'Leaves the activity blank today; the book stays where it is',
        scoped: true, scopeTitle: lane === 'book' ? 'Push the book back' : 'Push the activity back',
        run: (p, s) => pushLane(p, lane, first.item.id, 'push', s), done: 'Moved back one lesson',
      });
      if ((row.lessonNo ?? 0) > 1 && !first.item.withPrev && !first.mergedForClass) {
        acts.push({
          key: `merge-${lane}`, section, label: 'Do it together with the previous lesson', hint: 'Catch up — everything after moves one lesson earlier',
          scoped: true, scopeTitle: 'Together with the previous lesson', run: (p, s) => mergeWithPrevious(p, lane, first.item.id, s), done: 'Merged',
        });
      }
      if (date && opts.hasCalendar) {
        acts.push(first.item.pinDate === date
          ? { key: `unpin-${lane}`, section, label: 'Unpin from this date', run: (p) => pinItem(p, lane, first.item.id, null), done: 'Unpinned' }
          : { key: `pin-${lane}`, section, label: `Keep on ${shortDate(date)}`, hint: 'Stays on this date even when other lessons move (e.g. a planned event)', run: (p) => pinItem(p, lane, first.item.id, date), done: `Pinned to ${shortDate(date)}` });
      }
    }
    cells.filter((c) => c.item.withPrev || c.mergedForClass).forEach((c) => {
      acts.push({
        key: `split-${lane}-${c.item.id}`, section, label: `Split "${cellLabel(c, describe)}" back out`,
        run: (p) => (c.mergedForClass ? dropForClass(p, lane, c.item.id, classKey, false) : unmerge(p, lane, c.item.id)), done: 'Split',
      });
    });
    cells.filter(isFillerCell).forEach((c) => {
      acts.push({
        key: `undo-${lane}-${c.item.id}`, section, label: c.item.kind === 'continue' ? 'Undo "continue"' : 'Undo push (remove the blank)', hint: 'Everything after moves one lesson earlier',
        run: (p) => removeFiller(p, lane, c, classKey), done: 'Undone',
      });
    });
    const at = first ? laneItems(plan, lane).findIndex((x) => x.id === first.item.id) : null;
    acts.push({
      key: `insert-${lane}`, section, label: lane === 'book' ? 'Insert a new book lesson here' : 'Insert a new activity here', hint: 'For every class — the rest moves back one lesson',
      open: 'insert', lane, insertAt: at,
    });
  });
  return acts;
}

/** 이 반만의 기록 — 목록과 되돌리기 */
export function classChangeList(plan: LessonPlanDoc, classKey: string, describe?: UnitDescriber): Array<{ key: string; label: string; undo: (p: LessonPlanDoc) => LessonPlanDoc }> {
  const adj = plan.classes?.[classKey];
  const d = describe ?? defaultDescribe;
  const label = (lane: PlanLane, id: string) => {
    const it = laneItems(plan, lane).find((x) => x.id === id);
    return it ? cellLabel({ item: it, source: 'base' }, d) || 'an empty lesson' : 'a removed lesson';
  };
  const name = (lane: PlanLane) => LANE_SECTION[lane];
  return [
    ...(adj?.skips ?? []).map((s) => ({ key: `s${s.date}`, label: `No class ${shortDate(s.date)}${s.note ? ` — ${s.note}` : ''}`, undo: (p: LessonPlanDoc) => clearSkip(p, [classKey], s.date) })),
    ...(adj?.extraDays ?? []).map((x) => ({ key: `e${x}`, label: `Extra class ${shortDate(x)}`, undo: (p: LessonPlanDoc) => setExtraDay(p, [classKey], x, false) })),
    ...(adj?.gaps ?? []).map((g) => ({
      key: `g${g.id}`,
      label: `${name(g.lane)} ${g.kind === 'blank' ? 'pushed back before' : 'continued after'} ${label(g.lane, g.anchor)}`,
      undo: (p: LessonPlanDoc) => removeFiller(p, g.lane, { item: { id: g.id, kind: g.kind }, source: 'class', gapId: g.id }, classKey),
    })),
    ...(adj?.drops ?? []).map((x) => ({
      key: `d${x.lane}${x.itemId}`,
      label: `${name(x.lane)} ${x.merge ? 'done together with the previous lesson' : 'skipped'}: ${label(x.lane, x.itemId)}`,
      undo: (p: LessonPlanDoc) => dropForClass(p, x.lane, x.itemId, classKey, false),
    })),
  ];
}

/** 한 단원 정보 */
export const unitOf = (catalog: EslBookUnits | null | undefined, title: string, no: number): BookUnit | undefined =>
  bookUnitsOf(catalog, title).find((u) => u.no === no);

// ── 교재 단원 목록 · 합본 ───────────────────────────────────────────

export const bookUnitsOf = (catalog: EslBookUnits | null | undefined, title: string): BookUnit[] => catalog?.books?.[title]?.units ?? [];

/** 이 교재를 쓰는 L-Code 합본들 — 첫 번째 것이 대표 */
export function bundlesFor(catalog: EslBookUnits | null | undefined, bookCodes: string[]): BundleEntry[] {
  return bookCodes.map((c) => catalog?.bundles?.[c]).filter((b): b is BundleEntry => !!b);
}

/** 캠프 범위 — 합본에 들어간 단원 (합본이 없으면 undefined = 교재 전체) */
export function campScopeOf(catalog: EslBookUnits | null | undefined, bookCodes: string[], title: string): number[] | undefined {
  const set = new Set<number>();
  bundlesFor(catalog, bookCodes).forEach((b) => (b.books?.[title]?.units ?? []).forEach((u) => set.add(u)));
  return set.size ? [...set].sort((a, b) => a - b) : undefined;
}

/** 단원 → 합본 쪽 링크 (Canva 공개보기 #쪽, Drive PDF) */
export function unitLinks(catalog: EslBookUnits | null | undefined, bookCodes: string[], title: string, unit: number): { page?: number; canva?: string; drive?: string } {
  for (const b of bundlesFor(catalog, bookCodes)) {
    const page = b.books?.[title]?.pages?.[String(unit)];
    if (!page) continue;
    return {
      page,
      ...(b.canvaUrl ? { canva: `${b.canvaUrl.split('#')[0]}#${page}` } : {}),
      ...(b.driveUrl ? { drive: b.driveUrl } : {}),
    };
  }
  return {};
}

export interface PlanResource {
  label: string;
  url: string;
  /** camp: 캠프 합본 Canva · campPdf: 합본 Drive PDF · book: 교재 전체 Canva · file: 지도서·답지 등 */
  kind: 'camp' | 'campPdf' | 'book' | 'file';
}

/** 레슨플랜 위 자료 링크 — 캠프 합본(Canva · PDF) → 교재 전체(Canva) → 지도서·답지·단어장 … (같은 링크는 한 번) */
export function bookResources(catalog: EslBookUnits | null | undefined, title: string, bookCodes: string[]): PlanResource[] {
  const out: PlanResource[] = [];
  const add = (r: PlanResource) => { if (r.url && !out.some((x) => x.url === r.url)) out.push(r); };
  bundlesFor(catalog, bookCodes).forEach((b) => {
    if (b.canvaUrl) add({ label: `Camp book ${b.code}`, url: b.canvaUrl, kind: 'camp' });
    if (b.driveUrl) add({ label: `Camp book ${b.code} (PDF)`, url: b.driveUrl, kind: 'campPdf' });
  });
  const book = catalog?.books?.[title];
  if (book?.canvaUrl) add({ label: `Full book (${book.fullTitle ?? title})`, url: book.canvaUrl, kind: 'book' });
  (book?.links ?? []).forEach((l) => add({ label: l.label, url: l.url, kind: 'file' }));
  return out;
}

/** "U1 Tiny Farmers" — 단원 목록이 있으면 제목까지 */
export function unitDescriber(catalog: EslBookUnits | null | undefined, title: string): UnitDescriber {
  const units = bookUnitsOf(catalog, title);
  return (nums, part) => {
    const label = nums.map((n) => {
      const u = units.find((x) => x.no === n);
      return u?.title ? `U${n} ${u.title}` : `U${n}`;
    }).join(' + ');
    return [label, part].filter(Boolean).join(' · ');
  };
}

/** 캠프 범위 중 표에 없는 단원 */
export function uncoveredUnits(plan: Pick<LessonPlanDoc, 'book'>, scope: number[] | undefined): number[] {
  if (!scope?.length) return [];
  const used = new Set((plan.book ?? []).flatMap((x) => x.units ?? []));
  return scope.filter((u) => !used.has(u));
}
