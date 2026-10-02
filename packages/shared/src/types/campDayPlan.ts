/**
 * 캠프 일정표 — 날짜마다 무슨 Day 인지 (Regular / STEAM / Exciting …)
 *
 * 저장: campSettings/{campCode}.dayPlan (캠프당 한 벌, 관리자만 수정)
 *
 * 그룹마다 일정이 다를 수 있고, 몇몇 그룹은 똑같을 수 있다.
 * → "일정 세트" 를 만들고 세트마다 쓰는 그룹을 고른다 (예: Spring·Summer 세트, Autumn·Winter 세트).
 *
 * 익사이팅 데이는 시간표 문서가 없는 날이라, 그날의 "시간 · 활동 · 장소" 를 여기에 함께 둔다.
 * 환자 최초보고에서 "지금 이 학생이 어디 있는지" 를 자동으로 채울 때 쓴다.
 */
import { normalizeGroupKey } from './campTimetable';

export type DayKind = 'orientation' | 'regular' | 'steam' | 'exciting' | 'outdoor' | 'final' | 'checkout';

export interface DayKindSpec {
  key: DayKind;
  /** 일정표 칸에 찍히는 이름 (줄바꿈 \n) */
  label: string;
  /** 캠프 코드 첫 글자별 이름 */
  labelByCampPrefix?: Record<string, string>;
  /** 이 날 여는 시간표 탭 (TIMETABLE_CATEGORIES.key). 익사이팅은 시간표가 아니라 이 일정표의 활동표 */
  category: string;
  /** 칸 배경색 */
  color: string;
  /** 짧은 이름 (배지·환자 위치에 붙임) */
  short: string;
  /** 좁은 달력 칸용 (휴대폰) */
  mini: string;
  miniByCampPrefix?: Record<string, string>;
}

export const DAY_KINDS: DayKindSpec[] = [
  { key: 'orientation', label: 'Orientation\nPlacement Test', category: 'arrival', color: '#f1f1f1', short: 'Orientation', mini: 'OT' },
  { key: 'regular', label: 'Regular Day', category: 'regular', color: '#e6d3f5', short: 'Regular Day', mini: 'Regular' },
  {
    key: 'steam', label: '창의융합사고\nSTEAM Day', category: 'steam', color: '#f8d9d9', short: 'STEAM Day', mini: 'STEAM',
    labelByCampPrefix: { S: 'Going-Up Day', F: 'Going-Up Day' }, miniByCampPrefix: { S: 'Going-Up', F: 'Going-Up' },
  },
  { key: 'exciting', label: 'Exciting Day', category: 'exciting', color: '#fefcc4', short: 'Exciting Day', mini: 'Exciting' },
  /** 캠프 밖 현장 수업 (S캠프 SG Outdoor Class) — 익사이팅처럼 그날 활동표를 일정표에 둔다 */
  {
    key: 'outdoor', label: 'Outdoor Class', category: 'exciting', color: '#f9d7d5', short: 'Outdoor Class', mini: 'Outdoor',
    labelByCampPrefix: { S: 'SG Outdoor Class' },
  },
  { key: 'final', label: 'Final Test\nFarewell', category: 'departure_d1', color: '#e6d3f5', short: 'Final Test', mini: 'Final' },
  { key: 'checkout', label: 'Check-out', category: 'departure', color: '#f1f1f1', short: 'Check-out', mini: 'Out' },
];

/** 익사이팅 데이 탭 키 — 시간표 카테고리와 겹치지 않는 이름 */
export const EXCITING_CATEGORY = 'exciting';

/** 시간표 대신 그날 활동표(시간 · 활동 · 장소)를 쓰는 날 — 익사이팅 · 야외 수업 */
export function isActivityDayKind(kind: string | undefined | null): boolean {
  return kind === 'exciting' || kind === 'outdoor';
}

export function findDayKind(key: string | undefined | null): DayKindSpec | undefined {
  return DAY_KINDS.find((k) => k.key === key);
}

export function dayKindMini(key: string | undefined | null, campCode?: string | null): string {
  const spec = findDayKind(key);
  if (!spec) return '';
  const prefix = (campCode ?? '').trim().charAt(0).toUpperCase();
  return spec.miniByCampPrefix?.[prefix] ?? spec.mini;
}

export function dayKindLabel(key: string | undefined | null, campCode?: string | null): string {
  const spec = findDayKind(key);
  if (!spec) return '';
  const prefix = (campCode ?? '').trim().charAt(0).toUpperCase();
  return spec.labelByCampPrefix?.[prefix] ?? spec.label;
}

/** 익사이팅 데이의 한 칸 — "13:00~15:00 · 런닝맨 체험 · 런닝맨 테마파크" */
export interface ExcitingSlot {
  id: string;
  start: string; // "13:00"
  end: string; // "15:00"
  activity: string;
  place: string;
  note?: string;
}

export interface DayPlanEntry {
  kind: DayKind;
  /** 칸 아래 작게 붙는 메모 (예: "우천 시 실내") */
  note?: string;
  /** kind === 'exciting' 일 때 시간대별 활동·장소 — 세트의 모든 그룹 공통 */
  slots?: ExcitingSlot[];
  /**
   * 같은 날이라도 그룹마다 가는 곳이 다를 때 (예: Spring 은 런닝맨, Summer 는 항공우주 박물관).
   * normalizeGroupKey 값 → 그 그룹의 활동표. 있으면 공통(slots)보다 먼저 쓴다.
   */
  slotsByGroup?: Record<string, ExcitingSlot[]>;
}

export interface DayPlanSet {
  id: string;
  /** 세트 이름 (예: "Spring · Summer") */
  name: string;
  /** 이 세트를 쓰는 그룹 (normalizeGroupKey 값). 한 그룹은 한 세트에만 */
  groups: string[];
  /** 'YYYY-MM-DD' → 그날 */
  days: Record<string, DayPlanEntry>;
}

export interface CampDayPlan {
  sets: DayPlanSet[];
  updatedAt?: string;
  updatedBy?: string;
}

// ─── 날짜 ──────────────────────────────────────────────────────────────

/** 로컬 날짜 → 'YYYY-MM-DD' */
export function localYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** 캠프 기간을 일요일 시작 주 단위로 — 기간 밖 칸은 null */
export function calendarWeeks(start: Date | null | undefined, end: Date | null | undefined): Array<Array<string | null>> {
  if (!start || !end) return [];
  const first = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  if (last < first) return [];
  const cur = new Date(first);
  cur.setDate(cur.getDate() - cur.getDay());
  const weeks: Array<Array<string | null>> = [];
  while (cur <= last) {
    const week: Array<string | null> = [];
    for (let i = 0; i < 7; i++) {
      week.push(cur >= first && cur <= last ? localYmd(cur) : null);
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** '2026-07-26' → '7/26' */
export function monthDayLabel(date: string): string {
  const d = parseYmd(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 'HH:MM' → 분 */
export function hhmmToMinutes(t: string | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((t ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

// ─── 조회 ──────────────────────────────────────────────────────────────

/** 이 그룹이 쓰는 세트 — 그룹이 어느 세트에도 없고 세트가 하나뿐이면 그것 */
export function daySetForGroup(plan: CampDayPlan | null | undefined, groupName: string | null | undefined): DayPlanSet | undefined {
  const sets = plan?.sets ?? [];
  const key = normalizeGroupKey(groupName);
  const hit = key ? sets.find((s) => s.groups.includes(key)) : undefined;
  if (hit) return hit;
  const unassigned = sets.filter((s) => !s.groups.length);
  if (unassigned.length === 1) return unassigned[0];
  return sets.length === 1 ? sets[0] : undefined;
}

/**
 * 그날 열어야 할 시간표 탭.
 * J·E 캠프는 첫 Regular Day 가 "입소 D+1" 표다.
 * (S 캠프는 입소 D+2 가 첫 Regular Day — 아직 규칙 없음)
 */
export function dayCategory(set: DayPlanSet | undefined, date: string, campCode?: string | null): string | null {
  const entry = set?.days[date];
  if (!entry) return null;
  const spec = findDayKind(entry.kind);
  if (!spec) return null;
  const prefix = (campCode ?? '').trim().charAt(0).toUpperCase();
  if (entry.kind === 'regular' && (prefix === 'J' || prefix === 'E')) {
    const firstRegular = Object.keys(set?.days ?? {})
      .sort()
      .find((d) => set?.days[d]?.kind === 'regular');
    if (firstRegular === date) return 'arrival_d1';
  }
  return spec.category;
}

/** 이 세트의 익사이팅 데이 날짜 (오름차순) — 활동표를 쓰는 야외 수업 날도 함께 */
export function excitingDates(set: DayPlanSet | undefined): string[] {
  return Object.keys(set?.days ?? {})
    .filter((d) => isActivityDayKind(set?.days[d]?.kind))
    .sort();
}

/** 이 그룹의 그날 활동표 — 그룹 전용이 있으면 그것, 없으면 공통 */
export function excitingSlotsFor(entry: DayPlanEntry | undefined, groupName?: string | null): ExcitingSlot[] {
  if (!entry) return [];
  const key = normalizeGroupKey(groupName);
  const own = key ? entry.slotsByGroup?.[key] : undefined;
  return own?.length ? own : entry.slots ?? [];
}

/** 지금 시각에 해당하는 익사이팅 칸 */
export function excitingSlotAt(entry: DayPlanEntry | undefined, minutes: number, groupName?: string | null): ExcitingSlot | undefined {
  return excitingSlotsFor(entry, groupName).find((s) => {
    const a = hhmmToMinutes(s.start);
    const b = hhmmToMinutes(s.end);
    return a !== null && b !== null && a <= minutes && minutes < b;
  });
}

// ─── 저장 전 정리 ───────────────────────────────────────────────────────

const clean = (s: string | undefined) => (s ?? '').trim();

/** 빈 값·중복 그룹을 걸러 Firestore 에 넣을 모양으로 */
export function cleanDayPlan(plan: CampDayPlan): CampDayPlan {
  const taken = new Set<string>();
  const sets = plan.sets.map((s, i) => {
    const groups = s.groups.map(normalizeGroupKey).filter((g) => {
      if (!g || taken.has(g)) return false;
      taken.add(g);
      return true;
    });
    const days: Record<string, DayPlanEntry> = {};
    Object.entries(s.days ?? {}).forEach(([date, e]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !findDayKind(e?.kind)) return;
      const out: DayPlanEntry = { kind: e.kind };
      if (clean(e.note)) out.note = clean(e.note);
      if (isActivityDayKind(e.kind)) {
        const cleanSlots = (list: ExcitingSlot[] | undefined) => (list ?? [])
          .map((x) => ({
            id: x.id || `${date}-${Math.random().toString(36).slice(2, 8)}`,
            start: clean(x.start), end: clean(x.end), activity: clean(x.activity), place: clean(x.place),
            ...(clean(x.note) ? { note: clean(x.note) } : {}),
          }))
          .filter((x) => x.activity || x.place)
          .sort((a, b) => (hhmmToMinutes(a.start) ?? 0) - (hhmmToMinutes(b.start) ?? 0));
        const slots = cleanSlots(e.slots);
        if (slots.length) out.slots = slots;
        const byGroup: Record<string, ExcitingSlot[]> = {};
        Object.entries(e.slotsByGroup ?? {}).forEach(([g, list]) => {
          const key = normalizeGroupKey(g);
          const cleaned = cleanSlots(list);
          if (key && cleaned.length) byGroup[key] = cleaned;
        });
        if (Object.keys(byGroup).length) out.slotsByGroup = byGroup;
      }
      days[date] = out;
    });
    return { id: s.id || `set${i + 1}`, name: clean(s.name) || `일정 ${i + 1}`, groups, days };
  });
  return { sets };
}
