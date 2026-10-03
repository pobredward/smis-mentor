/**
 * 시간표 편집 작업 공간 — web / mobile 공용.
 *
 * 편집기를 한 번 여는 동안의 모든 변경(표 · 반·이름 · 반 정보 · 칸 설명 · 일정표)을 메모리에 모아 두었다가
 * 저장 한 번에 쓴다. Day·그룹·표를 오가도 고친 내용이 사라지지 않고, 되돌리기·다시하기가 된다.
 *
 * 전부 불변 갱신이다 — 고친 표만 새 객체가 되고 나머지는 그대로 공유하므로 되돌리기 기록이 가볍다.
 * 화면 쪽은 `setWs((w) => editTable(w, id, (t) => timetableDraft.setCellSubject(t, ...)))` 처럼 쓴다.
 *
 * 저장은 planSave() 로 "무엇을 어떻게 쓸지" 를 만들고, 서비스(commitTimetableWorkspace)가 한 배치로 쓴다.
 * campSettings 의 맵(timetableCommon · classInfo · timetableGuides)은 바뀐 항목만 필드 경로로 쓰므로
 * 다른 사람이 그사이 고친 다른 항목을 덮지 않고, 지운 값은 실제로 지워진다.
 */
import {
  DEFAULT_SUBJECTS,
  findCategory,
  isSameGroup,
  sortBlocks,
  timeToMinutes,
  timetableLabels,
  type CampTimetable,
  type TimetableClassColumn,
  type TimetableCommonValues,
  type TimetableTime,
} from '../types/campTimetable';
import type { CampClassInfo } from '../types/camp';
import { cleanGuide, guideKeyOf, hasGuideContent, type TimetableGuide } from '../types/timetableGuide';
import { cleanDayPlan, findDayKind, isActivityDayKind, type CampDayPlan, type DayKind } from '../types/campDayPlan';
import { savedTimetablesFor } from '../data/timetablePresets';
import { toUpdatePayload } from './timetableDraft';
import { newId } from './id';

// ─── 상태 ────────────────────────────────────────────────────────────

/** 편집 대상 전부 — 저장된 값(base)과 지금 값(cur)이 같은 모양 */
export interface EditState {
  /** 표 id → 표. 새로 만든 표는 id 가 'new:' 로 시작 */
  tables: Record<string, CampTimetable>;
  /** 그룹명 → 그 그룹의 모든 Day 가 함께 쓰는 반 목록·이름 덮어쓰기 (campSettings.timetableCommon) */
  common: Record<string, TimetableCommonValues>;
  /** 반코드 → 반이름·강의실·교재 (campSettings.classInfo, 캠프 전체) */
  classInfo: Record<string, CampClassInfo>;
  /** 칸 이름 키 → 칸 설명 (campSettings.timetableGuides, 캠프 전체) */
  guides: Record<string, TimetableGuide>;
  /** 일정표 (campSettings.dayPlan) */
  dayPlan: CampDayPlan | null;
}

export interface Workspace {
  campCode: string;
  jobCodeId: string;
  /** 마지막으로 저장된(불러온) 값 */
  base: EditState;
  /** 지금 화면에 보이는 값 */
  cur: EditState;
  past: EditState[];
  future: EditState[];
  /** 같은 입력칸을 연달아 고칠 때 되돌리기 한 번에 묶으려고 */
  lastKey: string | null;
  lastAt: number;
}

export const NEW_TABLE_PREFIX = 'new:';
const HISTORY_LIMIT = 100;
const COALESCE_MS = 1000;

export const isNewTableId = (id: string | undefined | null): boolean => !!id && id.startsWith(NEW_TABLE_PREFIX);

export function createWorkspace(input: {
  campCode: string;
  jobCodeId: string;
  tables: CampTimetable[];
  common?: Record<string, TimetableCommonValues> | null;
  classInfo?: Record<string, CampClassInfo> | null;
  guides?: Record<string, TimetableGuide> | null;
  dayPlan?: CampDayPlan | null;
}): Workspace {
  const base: EditState = {
    tables: Object.fromEntries(input.tables.map((t) => [t.id, t])),
    common: input.common ?? {},
    classInfo: input.classInfo ?? {},
    guides: input.guides ?? {},
    dayPlan: input.dayPlan ?? null,
  };
  return { campCode: input.campCode, jobCodeId: input.jobCodeId, base, cur: base, past: [], future: [], lastKey: null, lastAt: 0 };
}

/** 변경 하나를 기록하며 적용. key 가 같고 1초 안이면 앞 기록과 합친다 (글자 하나하나가 되돌리기 한 번이 되지 않게) */
function commit(ws: Workspace, next: EditState, key?: string, now = Date.now()): Workspace {
  if (next === ws.cur) return ws;
  const merge = !!key && key === ws.lastKey && now - ws.lastAt < COALESCE_MS;
  const past = merge ? ws.past : [...ws.past, ws.cur].slice(-HISTORY_LIMIT);
  return { ...ws, cur: next, past, future: [], lastKey: key ?? null, lastAt: now };
}

export const canUndo = (ws: Workspace): boolean => ws.past.length > 0;
export const canRedo = (ws: Workspace): boolean => ws.future.length > 0;

export function undo(ws: Workspace): Workspace {
  if (!ws.past.length) return ws;
  const prev = ws.past[ws.past.length - 1];
  return { ...ws, cur: prev, past: ws.past.slice(0, -1), future: [ws.cur, ...ws.future], lastKey: null };
}

export function redo(ws: Workspace): Workspace {
  if (!ws.future.length) return ws;
  const [next, ...rest] = ws.future;
  return { ...ws, cur: next, past: [...ws.past, ws.cur], future: rest, lastKey: null };
}

/** 저장 안 한 변경을 모두 버린다 */
export function discardChanges(ws: Workspace): Workspace {
  return { ...ws, cur: ws.base, past: [], future: [], lastKey: null };
}

// ─── 표 ──────────────────────────────────────────────────────────────

/** 깊은 복사 — Timestamp 는 JSON 을 거치면 메서드를 잃으므로 원래 객체를 다시 붙인다 */
export function cloneTable(t: CampTimetable): CampTimetable {
  const copy = JSON.parse(JSON.stringify(t)) as CampTimetable;
  copy.createdAt = t.createdAt;
  copy.updatedAt = t.updatedAt;
  return copy;
}

/** 이 Day·그룹의 표들 — 기본 표 먼저, 그다음 커스텀 표(첫 날짜 순) */
export function tablesOf(ws: Workspace, category: string | null, groupName: string | null): CampTimetable[] {
  return savedTimetablesFor(Object.values(ws.cur.tables), category, groupName);
}

/**
 * 표 하나를 고친다. target 이 작업 공간에 없는 표(빈 뼈대)면 새 표로 넣고 고친다.
 * @returns 새 작업 공간 (새 표가 생겼으면 그 id 는 tableIdAfterEdit 로 알 수 있다)
 */
export function editTable(
  ws: Workspace,
  target: string | CampTimetable,
  fn: (t: CampTimetable) => void,
  key?: string
): Workspace {
  const { ws: next } = editTableWithId(ws, target, fn, key);
  return next;
}

/** editTable 과 같되 고친 표의 id 도 돌려준다 (빈 뼈대를 처음 고칠 때 새 id 가 생긴다) */
export function editTableWithId(
  ws: Workspace,
  target: string | CampTimetable,
  fn: (t: CampTimetable) => void,
  key?: string
): { ws: Workspace; id: string } {
  const existing = typeof target === 'string' ? ws.cur.tables[target] : ws.cur.tables[target.id];
  if (typeof target === 'string' && !existing) return { ws, id: target };
  const t = cloneTable(existing ?? (target as CampTimetable));
  if (!existing) t.id = `${NEW_TABLE_PREFIX}${newId()}`;
  fn(t);
  const next = commit(ws, { ...ws.cur, tables: { ...ws.cur.tables, [t.id]: t } }, key ? `table:${t.id}:${key}` : undefined);
  return { ws: next, id: t.id };
}

/** 커스텀 표 — 지금 표를 그대로 복제해 그 날짜를 맡긴다 (저장 전) */
export function addCustomTable(
  ws: Workspace,
  from: string | CampTimetable,
  dates: string[]
): { ws: Workspace; id: string } {
  const src = typeof from === 'string' ? ws.cur.tables[from] : ws.cur.tables[from.id] ?? from;
  if (!src) return { ws, id: '' };
  const t = cloneTable(src);
  t.id = `${NEW_TABLE_PREFIX}${newId()}`;
  t.dates = [...new Set(dates)].sort();
  return { ws: commit(ws, { ...ws.cur, tables: { ...ws.cur.tables, [t.id]: t } }), id: t.id };
}

/** 표 지우기 (저장할 때 반영) */
export function deleteTable(ws: Workspace, id: string): Workspace {
  if (!ws.cur.tables[id]) return ws;
  const tables = { ...ws.cur.tables };
  delete tables[id];
  return commit(ws, { ...ws.cur, tables });
}

// ─── 반·이름 (그룹 공통) · 반 정보 · 칸 설명 · 일정표 ─────────────────────

/** 그룹 이름 표기가 달라도(Junior / junior) 같은 항목을 찾는다 */
export function commonKeyOf(ws: Workspace, groupName: string): string {
  return Object.keys(ws.cur.common).find((k) => isSameGroup(k, groupName)) ?? groupName;
}

export function editCommon(
  ws: Workspace,
  groupName: string,
  fn: (v: TimetableCommonValues) => void,
  key?: string
): Workspace {
  const k = commonKeyOf(ws, groupName);
  const v: TimetableCommonValues = JSON.parse(JSON.stringify(ws.cur.common[k] ?? {}));
  fn(v);
  return commit(ws, { ...ws.cur, common: { ...ws.cur.common, [k]: v } }, key ? `common:${k}:${key}` : undefined);
}

/** 반 정보 한 반 — null 이면 지운다 */
export function setClassInfo(ws: Workspace, code: string, info: CampClassInfo | null, key?: string): Workspace {
  const classInfo = { ...ws.cur.classInfo };
  if (info) classInfo[code] = info;
  else delete classInfo[code];
  return commit(ws, { ...ws.cur, classInfo }, key ? `classInfo:${code}:${key}` : undefined);
}

/** 칸 설명 — GuideEditorPanel 의 setGuides(fn) 모양 그대로 */
export function editGuides(
  ws: Workspace,
  fn: (prev: Record<string, TimetableGuide>) => Record<string, TimetableGuide>,
  key = 'guides'
): Workspace {
  const guides = fn(ws.cur.guides);
  if (guides === ws.cur.guides) return ws;
  return commit(ws, { ...ws.cur, guides }, key);
}

export function editDayPlan(
  ws: Workspace,
  fn: (plan: CampDayPlan) => CampDayPlan | void,
  key?: string
): Workspace {
  const plan: CampDayPlan = JSON.parse(JSON.stringify(ws.cur.dayPlan ?? { sets: [] }));
  const out = fn(plan) ?? plan;
  return commit(ws, { ...ws.cur, dayPlan: out }, key ? `dayPlan:${key}` : undefined);
}

/** 일정표 — 한 세트의 여러 날짜를 한 번에 같은 Day 로 (kind 가 null 이면 비운다) */
export function setDayKinds(plan: CampDayPlan, setId: string, dates: string[], kind: DayKind | null): CampDayPlan {
  return {
    ...plan,
    sets: plan.sets.map((s) => {
      if (s.id !== setId) return s;
      const days = { ...s.days };
      dates.forEach((d) => {
        if (!kind) delete days[d];
        else if (!findDayKind(kind)) return;
        else {
          const prev = days[d];
          // 활동표는 활동 날(익사이팅·야외)끼리 바꿀 때만 남긴다
          days[d] = prev && isActivityDayKind(prev.kind) && isActivityDayKind(kind) ? { ...prev, kind } : { kind, ...(prev?.note ? { note: prev.note } : {}) };
        }
      });
      return { ...s, days };
    }),
  };
}

// ─── 이름 바꾸기 — 칸 · 칸 설명 · 인문학 연결이 따라오게 ─────────────────

/** 일정표 활동표에 찍히는 활동 이름 (칸 설명이 붙는 칸) */
export function dayPlanActivityLabels(plan: CampDayPlan | null | undefined): string[] {
  const out: string[] = [];
  (plan?.courses ?? []).forEach((c) => c.slots.forEach((x) => x?.activity && out.push(x.activity)));
  (plan?.sets ?? []).forEach((s) =>
    Object.values(s.days ?? {}).forEach((e) => {
      if (!isActivityDayKind(e?.kind)) return;
      [...(e.slots ?? []), ...Object.values(e.slotsByGroup ?? {}).flat()].forEach((x) => {
        if (x?.activity) out.push(x.activity);
      });
    })
  );
  return out;
}

/** 이 이름이 캠프 어딘가(표 칸·공통 줄·일정표 활동)에 아직 쓰이는지 */
export function labelInUse(state: EditState, label: string): boolean {
  const k = guideKeyOf(label);
  if (!k) return false;
  if (Object.values(state.tables).some((t) => timetableLabels(t).some((l) => guideKeyOf(l) === k))) return true;
  return dayPlanActivityLabels(state.dayPlan).some((l) => guideKeyOf(l) === k);
}

/**
 * 이름이 바뀐 칸의 칸 설명을 새 이름으로.
 * 옛 이름이 아직 다른 데서 쓰이면 복사, 아니면 옮긴다. 새 이름에 이미 설명이 있으면 손대지 않는다.
 */
function carryGuide(state: EditState, oldLabel: string, newLabel: string): EditState {
  const ok = guideKeyOf(oldLabel);
  const nk = guideKeyOf(newLabel);
  if (!ok || !nk || ok === nk) return state;
  const g = state.guides[ok];
  if (!g || state.guides[nk]) return state;
  const guides = { ...state.guides, [nk]: g };
  if (!labelInUse(state, oldLabel)) delete guides[ok];
  return { ...state, guides };
}

function renameSubjectIn(t: CampTimetable, oldKey: string, newKey: string): boolean {
  const same = (a?: string) => !!a && a.toLowerCase() === oldKey.toLowerCase();
  let touched = false;
  // 과목 목록이 비어 기본 과목(Math·Speaking…)을 쓰던 표는 먼저 기본 과목을 표에 적어 둔다 —
  // 안 그러면 칸만 새 이름으로 바뀌고 과목 정의가 없어 짝(2교시) 줄이 사라진다
  if (!t.subjects?.length && DEFAULT_SUBJECTS.some((s) => same(s.key))) t.subjects = DEFAULT_SUBJECTS.map((s) => ({ ...s }));
  if (t.subjects?.some((s) => same(s.key))) {
    t.subjects = t.subjects.map((s) => (same(s.key) ? { ...s, key: newKey } : s));
    touched = true;
  }
  t.blocks.forEach((b) => {
    Object.values(b.cells ?? {}).forEach((c) => {
      if (same(c.subject)) {
        c.subject = newKey;
        touched = true;
      }
    });
  });
  return touched;
}

/**
 * 과목·주제 이름 바꾸기 — 그 표의 과목 목록과 칸이 함께 바뀌고, 칸 설명도 따라간다.
 * scope 'camp' 면 캠프의 모든 표에서 같은 이름을 바꾼다.
 */
export function renameSubject(
  ws: Workspace,
  tableId: string,
  oldKey: string,
  newKey: string,
  scope: 'table' | 'camp' = 'table'
): Workspace {
  if (!newKey.trim() || oldKey === newKey) return ws;
  const tables = { ...ws.cur.tables };
  const ids = scope === 'camp' ? Object.keys(tables) : [tableId];
  ids.forEach((id) => {
    const src = tables[id];
    if (!src) return;
    const t = cloneTable(src);
    if (renameSubjectIn(t, oldKey, newKey)) tables[id] = t;
  });
  let state: EditState = { ...ws.cur, tables };
  state = carryGuide(state, oldKey, newKey);
  return commit(ws, state);
}

/** 과목 이름만 바꾸는 중간 입력 — 칸도 같이 따라가지만 칸 설명은 옮기지 않는다 (입력 도중 글자마다 옮기지 않게) */
export function renameSubjectTyping(ws: Workspace, tableId: string, oldKey: string, newKey: string): Workspace {
  const src = ws.cur.tables[tableId];
  if (!src || oldKey === newKey) return ws;
  const t = cloneTable(src);
  renameSubjectIn(t, oldKey, newKey);
  return commit(ws, { ...ws.cur, tables: { ...ws.cur.tables, [tableId]: t } }, `table:${tableId}:subject-name`);
}

/** 칸 설명만 옛 이름 → 새 이름으로 (입력을 마쳤을 때 한 번) */
export function carryGuideAfterRename(ws: Workspace, oldLabel: string, newLabel: string): Workspace {
  const next = carryGuide(ws.cur, oldLabel, newLabel);
  return next === ws.cur ? ws : commit(ws, next);
}

/**
 * 공통 줄 이름 바꾸기. scope 'camp' 면 캠프의 모든 표에서 같은 이름의 공통 줄을 바꾼다.
 * 칸 설명이 따라오고, '인문학' 이 들어간 이름은 인문학 표가 붙는 자리이므로 화면에서 안내한다.
 */
export function renameSharedLabel(
  ws: Workspace,
  tableId: string,
  blockId: string,
  newLabel: string,
  scope: 'table' | 'camp' = 'table'
): Workspace {
  const src = ws.cur.tables[tableId];
  const block = src?.blocks.find((b) => b.id === blockId);
  if (!src || !block) return ws;
  const oldLabel = block.label ?? '';
  const tables = { ...ws.cur.tables };
  const ids = scope === 'camp' ? Object.keys(tables) : [tableId];
  ids.forEach((id) => {
    const t0 = tables[id];
    if (!t0) return;
    const hit = t0.blocks.some((b) => b.kind === 'shared' && (id === tableId ? b.id === blockId : guideKeyOf(b.label) === guideKeyOf(oldLabel)));
    if (!hit) return;
    const t = cloneTable(t0);
    t.blocks.forEach((b) => {
      if (b.kind !== 'shared') return;
      if (id === tableId ? b.id === blockId : guideKeyOf(b.label) === guideKeyOf(oldLabel)) b.label = newLabel;
    });
    tables[id] = t;
  });
  let state: EditState = { ...ws.cur, tables };
  if (oldLabel) state = carryGuide(state, oldLabel, newLabel);
  return commit(ws, state);
}

/** 이 그룹의 표 전부 (모든 Day · 커스텀 표) */
export function groupTableIds(ws: Workspace, groupName: string): string[] {
  return Object.values(ws.cur.tables)
    .filter((t) => isSameGroup(t.groupName, groupName))
    .map((t) => t.id);
}

function remapClassIn(t: CampTimetable, map: Map<string, string>): void {
  t.classes = t.classes.map((c) => (map.has(c.classCode) ? { ...c, classCode: map.get(c.classCode)! } : c));
  t.blocks.forEach((b) => {
    if (!b.cells) return;
    const cells: NonNullable<typeof b.cells> = {};
    Object.entries(b.cells).forEach(([k, v]) => {
      cells[map.get(k) ?? k] = v;
    });
    b.cells = cells;
  });
  t.subjects = t.subjects?.map((s) => (s.ownerClassCode && map.has(s.ownerClassCode) ? { ...s, ownerClassCode: map.get(s.ownerClassCode) } : s));
  t.extraColumns = t.extraColumns?.map((e) => (e.dutyRotation ? { ...e, dutyRotation: e.dutyRotation.map((c) => map.get(c) ?? c) } : e));
}

/**
 * 반번호 바꾸기 — 이 그룹의 모든 표(칸 · 주제 담당 · 당번 순번), 반·이름 공통, 반 정보 키까지 함께.
 * 새 번호가 이미 이 그룹에 있으면 바꾸지 않는다.
 */
export function renameClassCode(ws: Workspace, groupName: string, oldCode: string, newCode: string): Workspace {
  const nc = newCode.trim();
  if (!nc || nc === oldCode) return ws;
  const ids = groupTableIds(ws, groupName);
  const k = commonKeyOf(ws, groupName);
  const inGroup = (code: string) =>
    ids.some((id) => ws.cur.tables[id].classes.some((c) => c.classCode === code)) ||
    !!ws.cur.common[k]?.classes?.some((c) => c.classCode === code);
  if (inGroup(nc)) return ws;
  const map = new Map([[oldCode, nc]]);
  const tables = { ...ws.cur.tables };
  ids.forEach((id) => {
    const t = cloneTable(tables[id]);
    remapClassIn(t, map);
    tables[id] = t;
  });
  const common = { ...ws.cur.common };
  if (common[k]?.classes) common[k] = { ...common[k], classes: common[k].classes!.map((c) => (c.classCode === oldCode ? { ...c, classCode: nc } : c)) };
  const classInfo = { ...ws.cur.classInfo };
  if (classInfo[oldCode] && !classInfo[nc]) {
    classInfo[nc] = classInfo[oldCode];
    delete classInfo[oldCode];
  }
  return commit(ws, { ...ws.cur, tables, common, classInfo });
}

/** 반 목록 — 이 그룹의 지금 반 순서 (공통이 있으면 공통, 없으면 표에서) */
export function groupClasses(ws: Workspace, groupName: string, fallback: TimetableClassColumn[] = []): TimetableClassColumn[] {
  const k = commonKeyOf(ws, groupName);
  if (ws.cur.common[k]?.classes?.length) return ws.cur.common[k].classes!;
  const first = groupTableIds(ws, groupName).map((id) => ws.cur.tables[id]).find((t) => t.classes.length);
  return first?.classes ?? fallback;
}

/** 반 목록 통째로 바꾸기 (추가 · 삭제 · 순서) — 이 그룹의 모든 표와 공통에 같이. 빠진 반의 칸은 지운다 */
export function setGroupClasses(ws: Workspace, groupName: string, classes: TimetableClassColumn[]): Workspace {
  const codes = new Set(classes.map((c) => c.classCode));
  const tables = { ...ws.cur.tables };
  groupTableIds(ws, groupName).forEach((id) => {
    const t = cloneTable(tables[id]);
    const nameOf = new Map(t.classes.map((c) => [c.classCode, c]));
    t.classes = classes.map((c) => ({ ...(nameOf.get(c.classCode) ?? {}), ...c }));
    t.blocks.forEach((b) => {
      if (!b.cells) return;
      const extra = new Set((t.extraColumns ?? []).map((e) => e.key));
      Object.keys(b.cells).forEach((key) => {
        if (!codes.has(key) && !extra.has(key)) delete b.cells![key];
      });
    });
    tables[id] = t;
  });
  const k = commonKeyOf(ws, groupName);
  const common = { ...ws.cur.common, [k]: { ...(ws.cur.common[k] ?? {}), classes } };
  return commit(ws, { ...ws.cur, tables, common });
}

/** 이 반을 지우면 칸이 사라지는 표 수 (확인창 문구용) */
export function tablesUsingClass(ws: Workspace, groupName: string, code: string): number {
  return groupTableIds(ws, groupName).filter((id) =>
    ws.cur.tables[id].blocks.some((b) => b.cells && code in b.cells && (b.cells[code].subject || b.cells[code].texts?.length))
  ).length;
}

// ─── 일괄 변경 ────────────────────────────────────────────────────────

export interface RowMatch {
  tableId: string;
  blockId: string;
  groupName: string;
  dayType: string;
  dayTypeLabel: string;
  dates: string[];
  kind: 'shared' | 'class';
  label?: string;
  times: TimetableTime[];
}

/**
 * 캠프 전체에서 같은 줄 찾기 — 공통 줄은 이름이 같은 줄, 반별 줄은 시작 시각이 같은 줄.
 * (점심을 12:00 → 12:30 으로 옮길 때 모든 그룹·Day 의 점심 줄을 한 번에)
 */
export function findMatchingRows(ws: Workspace, ref: { label?: string; start?: string; kind?: 'shared' | 'class' }): RowMatch[] {
  const out: RowMatch[] = [];
  const lk = guideKeyOf(ref.label);
  Object.values(ws.cur.tables).forEach((t) => {
    if ((t.layout ?? 'time') !== 'time') return;
    t.blocks.forEach((b) => {
      const byLabel = !!lk && b.kind === 'shared' && guideKeyOf(b.label) === lk;
      const byStart = !lk && !!ref.start && (!ref.kind || b.kind === ref.kind) && b.times?.[0]?.start === ref.start;
      if (!byLabel && !byStart) return;
      out.push({
        tableId: t.id,
        blockId: b.id,
        groupName: t.groupName,
        dayType: t.dayType,
        dayTypeLabel: t.dayTypeLabel,
        dates: t.dates ?? [],
        kind: b.kind,
        label: b.label,
        times: (b.times ?? []).map((x) => ({ ...x })),
      });
    });
  });
  return out.sort(
    (a, b) =>
      a.groupName.localeCompare(b.groupName) ||
      (findCategoryIndex(a.dayType) - findCategoryIndex(b.dayType)) ||
      (a.dates[0] ?? '').localeCompare(b.dates[0] ?? '')
  );
}

function findCategoryIndex(key: string): number {
  const c = findCategory(key);
  return c ? ['regular', 'steam', 'humanities', 'arrival', 'arrival_d1', 'departure_d1', 'departure'].indexOf(c.key) : 99;
}

/** "HH:MM" ± 분 */
export function addMinutes(hhmm: string, delta: number): string {
  const total = Math.max(0, Math.min(24 * 60 - 1, timeToMinutes(hhmm) + delta));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** "930" · "9:3" · "0930" · "9시30" 같은 입력을 "09:30" 으로. 못 읽으면 null */
export function normalizeTime(input: string): string | null {
  const s = (input ?? '').trim().replace(/시\s*/, ':').replace(/분/, '').replace(/[.\s]/g, ':');
  let h: number;
  let m: number;
  const colon = s.match(/^(\d{1,2}):(\d{1,2})$/);
  if (colon) {
    h = +colon[1];
    m = +colon[2];
  } else if (/^\d{3,4}$/.test(s)) {
    h = +s.slice(0, s.length - 2);
    m = +s.slice(-2);
  } else if (/^\d{1,2}$/.test(s)) {
    h = +s;
    m = 0;
  } else return null;
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 고른 줄들의 시간을 같은 만큼 옮긴다 (분 단위, 음수 = 앞당김) */
export function shiftRows(ws: Workspace, targets: Array<{ tableId: string; blockId: string }>, deltaMinutes: number): Workspace {
  if (!deltaMinutes || !targets.length) return ws;
  const tables = { ...ws.cur.tables };
  const byTable = new Map<string, Set<string>>();
  targets.forEach(({ tableId, blockId }) => byTable.set(tableId, (byTable.get(tableId) ?? new Set()).add(blockId)));
  byTable.forEach((blockIds, id) => {
    if (!tables[id]) return;
    const t = cloneTable(tables[id]);
    t.blocks.forEach((b) => {
      if (!blockIds.has(b.id) || !b.times) return;
      b.times = b.times.map((x) => ({ start: addMinutes(x.start, deltaMinutes), end: addMinutes(x.end, deltaMinutes) }));
    });
    tables[id] = t;
  });
  return commit(ws, { ...ws.cur, tables });
}

/** 고른 줄들의 시간을 똑같이 맞춘다 (교시 수가 같은 줄에만) */
export function setRowTimes(ws: Workspace, targets: Array<{ tableId: string; blockId: string }>, times: TimetableTime[]): Workspace {
  if (!targets.length || !times.length) return ws;
  const tables = { ...ws.cur.tables };
  targets.forEach(({ tableId, blockId }) => {
    if (!tables[tableId]) return;
    const t = tables[tableId] === ws.cur.tables[tableId] ? cloneTable(tables[tableId]) : tables[tableId];
    const b = t.blocks.find((x) => x.id === blockId);
    if (b?.times && b.times.length === times.length) b.times = times.map((x) => ({ ...x }));
    tables[tableId] = t;
  });
  return commit(ws, { ...ws.cur, tables });
}

/** 여러 칸에 같은 과목 (비우려면 '') — 칸 = { blockId, colKey } */
export function fillCells(
  ws: Workspace,
  tableId: string,
  cells: Array<{ blockId: string; colKey: string }>,
  subject: string
): Workspace {
  return editTable(ws, tableId, (t) => {
    cells.forEach(({ blockId, colKey }) => {
      const b = t.blocks.find((x) => x.id === blockId);
      if (!b || b.kind !== 'class') return;
      b.cells ??= {};
      if (!subject) delete b.cells[colKey];
      else {
        const prev = b.cells[colKey];
        b.cells[colKey] = { ...prev, subject, texts: undefined, ...(prev?.subject !== subject ? { partnerRole: undefined } : {}) };
      }
    });
  });
}

// ─── 복사 · 가져오기 ──────────────────────────────────────────────────

/** 'YYYY-MM-DD' 끼리 며칠 차이 (b - a) */
export function daysBetween(a: string, b: string): number {
  const ms = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round(ms / 86400000);
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10) + n));
  return d.toISOString().slice(0, 10);
}

export interface CopyTarget {
  campCode: string;
  jobCodeId: string;
  groupName: string;
  /** 받는 그룹의 반 순서 — 원본 반을 순서대로 맞춘다 */
  classes: TimetableClassColumn[];
  /** 날짜를 옮길 일수 (다른 캠프로 복사할 때: 받는 캠프 시작일 - 원본 캠프 시작일) */
  dayShift?: number;
  /** 받는 캠프 기간 — 옮긴 날짜가 밖이면 뺀다 */
  period?: { start: string; end: string } | null;
}

/**
 * 표 한 장을 다른 그룹·Day·캠프용으로 바꾼다 (원본은 그대로).
 * 반은 순서대로 짝을 맞춰 칸·주제 담당·당번 순번을 옮기고, 사람 이름(직접 넣은 이름)은 비운다.
 * 커스텀 표의 날짜는 dayShift 만큼 옮기고 기간 밖은 빼는데, 하나도 안 남으면 null.
 */
export function adaptTable(src: CampTimetable, target: CopyTarget): CampTimetable | null {
  const t = cloneTable(src);
  const map = new Map<string, string>();
  src.classes.forEach((c, i) => {
    const next = target.classes[i];
    if (next) map.set(c.classCode, next.classCode);
  });
  const extra = new Set((src.extraColumns ?? []).map((e) => e.key));
  t.blocks = t.blocks.map((b) => {
    if (!b.cells) return { ...b, id: `b-${newId().slice(0, 8)}` };
    const cells: NonNullable<typeof b.cells> = {};
    Object.entries(b.cells).forEach(([k, v]) => {
      if (map.has(k)) cells[map.get(k)!] = v;
      else if (extra.has(k)) cells[k] = v;
    });
    return { ...b, id: `b-${newId().slice(0, 8)}`, cells };
  });
  t.subjects = t.subjects?.map((s) => {
    if (!s.ownerClassCode) return s;
    const next = map.get(s.ownerClassCode);
    if (next) return { ...s, ownerClassCode: next };
    const { ownerClassCode: _drop, ...rest } = s;
    return rest;
  });
  t.extraColumns = t.extraColumns?.map((e) =>
    e.dutyRotation ? { ...e, dutyRotation: e.dutyRotation.map((c) => map.get(c)).filter((c): c is string => !!c) } : e
  );
  t.classes = target.classes.map(({ classCode }) => ({ classCode }));
  if (src.dates?.length) {
    const shift = target.dayShift ?? 0;
    const dates = src.dates
      .map((d) => addDays(d, shift))
      .filter((d) => !target.period || (d >= target.period.start && d <= target.period.end));
    if (!dates.length) return null;
    t.dates = dates;
  }
  delete t.staffOverrides;
  delete t.own;
  t.id = `${NEW_TABLE_PREFIX}${newId()}`;
  t.campCode = target.campCode;
  t.jobCodeId = target.jobCodeId;
  t.groupName = target.groupName;
  return t;
}

const sameDates = (a?: string[], b?: string[]) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());

export interface ImportResult {
  ws: Workspace;
  created: number;
  replaced: number;
  skipped: number;
}

/**
 * 가져오기 — 바꾼 표들을 작업 공간에 넣는다 (저장 전).
 * 받는 쪽에 같은 Day·그룹·날짜의 표가 있으면 mode 에 따라 바꾸거나 건너뛴다.
 */
export function importTables(ws: Workspace, tables: CampTimetable[], mode: 'replace' | 'skip'): ImportResult {
  const next = { ...ws.cur.tables };
  let created = 0;
  let replaced = 0;
  let skipped = 0;
  tables.forEach((t) => {
    const clash = Object.values(next).filter(
      (x) => x.dayType === t.dayType && isSameGroup(x.groupName, t.groupName) && sameDates(x.dates, t.dates)
    );
    if (clash.length && mode === 'skip') {
      skipped++;
      return;
    }
    clash.forEach((x) => delete next[x.id]);
    next[t.id] = t;
    if (clash.length) replaced++;
    else created++;
  });
  if (!created && !replaced) return { ws, created, replaced, skipped };
  return { ws: commit(ws, { ...ws.cur, tables: next }), created, replaced, skipped };
}

/** 가져오기 — 칸 설명 (missing: 없는 칸만, all: 같은 칸도 덮어쓰기) */
export function importGuides(ws: Workspace, guides: Record<string, TimetableGuide>, mode: 'missing' | 'all'): { ws: Workspace; count: number } {
  const next = { ...ws.cur.guides };
  let count = 0;
  Object.entries(guides).forEach(([k, g]) => {
    if (!hasGuideContent(g)) return;
    if (mode === 'missing' && next[k]) return;
    // 올린 파일은 주소만 같이 쓴다 — 이쪽에서 줄을 지울 때 원본 캠프 파일까지 지우지 않게
    next[k] = JSON.parse(JSON.stringify(g, (key, v) => (key === 'storagePath' ? undefined : v)));
    count++;
  });
  if (!count) return { ws, count };
  return { ws: commit(ws, { ...ws.cur, guides: next }), count };
}

/** 일정표 날짜를 옮긴다 (기간 밖은 뺌) */
export function shiftDayPlan(plan: CampDayPlan, dayShift: number, period?: { start: string; end: string } | null): CampDayPlan {
  return {
    ...(plan.courses?.length ? { courses: plan.courses } : {}),
    sets: plan.sets.map((s) => ({
      ...s,
      days: Object.fromEntries(
        Object.entries(s.days)
          .map(([d, e]) => [addDays(d, dayShift), e] as const)
          .filter(([d]) => !period || (d >= period.start && d <= period.end))
      ),
    })),
  };
}

export function importDayPlan(ws: Workspace, plan: CampDayPlan): Workspace {
  return commit(ws, { ...ws.cur, dayPlan: JSON.parse(JSON.stringify(plan)) });
}

// ─── 변경 목록 · 저장 계획 ──────────────────────────────────────────────

/** 키 순서와 상관없는 비교용 문자열 */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis !== 'function') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

const tableKey = (t: CampTimetable) => stableStringify(toUpdatePayload(t));
const META = new Set(['updatedAt', 'updatedBy']);
const guideKey = (g: TimetableGuide | undefined) =>
  g ? stableStringify(Object.fromEntries(Object.entries(cleanGuide(g)).filter(([k]) => !META.has(k)))) : 'null';

/** 저장할 반 정보 모양 — 빈 칸은 빼고, 다 비면 null (지움) */
export function cleanClassInfo(info: CampClassInfo | undefined | null): CampClassInfo | null {
  if (!info) return null;
  const out: CampClassInfo = {};
  (['className', 'classroom', 'bookCode', 'spareBookCode'] as const).forEach((k) => {
    const v = info[k]?.trim();
    if (v) out[k] = v;
  });
  return Object.keys(out).length ? out : null;
}

/** 저장할 반·이름 모양 (앱 updateCampTimetableCommon 과 같은 정리) */
export function cleanCommon(v: TimetableCommonValues | undefined | null): TimetableCommonValues | null {
  if (!v) return null;
  const classes = (v.classes ?? []).map((c) => ({
    classCode: c.classCode,
    ...(c.teacherName?.trim() ? { teacherName: c.teacherName.trim() } : {}),
  }));
  const staffOverrides: Record<string, string> = {};
  Object.entries(v.staffOverrides ?? {}).forEach(([k, name]) => {
    if (name?.trim()) staffOverrides[k] = name.trim();
  });
  return { classes, staffOverrides };
}

export interface WorkspaceChanges {
  created: string[];
  updated: string[];
  deleted: string[];
  common: string[];
  classInfo: string[];
  guides: string[];
  dayPlan: boolean;
  /** 화면에 보여 줄 바뀐 항목 수 */
  count: number;
}

export function changesOf(ws: Workspace): WorkspaceChanges {
  const { base, cur } = ws;
  const created: string[] = [];
  const updated: string[] = [];
  Object.values(cur.tables).forEach((t) => {
    const b = base.tables[t.id];
    if (!b) created.push(t.id);
    else if (b !== t && tableKey(b) !== tableKey(t)) updated.push(t.id);
  });
  const deleted = Object.keys(base.tables).filter((id) => !cur.tables[id]);

  const diffKeys = <T,>(a: Record<string, T>, b: Record<string, T>, key: (x: T | undefined) => string) =>
    a === b ? [] : [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k] && key(a[k]) !== key(b[k]));
  const common = diffKeys(base.common, cur.common, (x) => stableStringify(cleanCommon(x)));
  const classInfo = diffKeys(base.classInfo, cur.classInfo, (x) => stableStringify(cleanClassInfo(x)));
  const guides = diffKeys(base.guides, cur.guides, guideKey);
  const dayPlan =
    base.dayPlan !== cur.dayPlan &&
    stableStringify(cur.dayPlan ? cleanDayPlan(cur.dayPlan) : null) !== stableStringify(base.dayPlan ? cleanDayPlan(base.dayPlan) : null);
  return {
    created,
    updated,
    deleted,
    common,
    classInfo,
    guides,
    dayPlan,
    count: created.length + updated.length + deleted.length + common.length + classInfo.length + guides.length + (dayPlan ? 1 : 0),
  };
}

export const isDirty = (ws: Workspace): boolean => ws.cur !== ws.base && changesOf(ws).count > 0;

/** 표 하나가 이번에 새로 생겼는지 · 바뀌었는지 (칩에 점 찍기) */
export function tableChangeOf(ws: Workspace, id: string): 'new' | 'changed' | null {
  const t = ws.cur.tables[id];
  if (!t) return null;
  const b = ws.base.tables[id];
  if (!b) return 'new';
  return b !== t && tableKey(b) !== tableKey(t) ? 'changed' : null;
}

export interface SavePlan {
  creates: Array<{ tempId: string; table: CampTimetable }>;
  updates: Array<{ id: string; table: CampTimetable }>;
  deletes: string[];
  /** campSettings.timetableCommon[그룹] — null 이면 지움 */
  common: Array<{ group: string; value: TimetableCommonValues | null }>;
  classInfo: Array<{ code: string; value: CampClassInfo | null }>;
  guides: Array<{ key: string; value: TimetableGuide | null }>;
  /** undefined = 일정표 안 바뀜 */
  dayPlan?: CampDayPlan | null;
  /** 고친·지운 표가 불러올 때의 updatedAt (ms) — 그사이 다른 사람이 고쳤는지 확인 */
  expectedUpdatedAt: Record<string, number | null>;
}

const millisOf = (v: unknown): number | null =>
  v && typeof (v as { toMillis?: unknown }).toMillis === 'function' ? (v as { toMillis: () => number }).toMillis() : null;

/** 저장할 것 — 바뀐 것만, 앱과 같은 정리를 거친 모양으로 */
export function planSave(ws: Workspace, userId = ''): SavePlan {
  const ch = changesOf(ws);
  const nowIso = new Date().toISOString();
  return {
    creates: ch.created.map((id) => ({ tempId: id, table: ws.cur.tables[id] })),
    updates: ch.updated.map((id) => ({ id, table: ws.cur.tables[id] })),
    deletes: ch.deleted,
    common: ch.common.map((group) => ({ group, value: cleanCommon(ws.cur.common[group]) })),
    classInfo: ch.classInfo.map((code) => ({ code, value: cleanClassInfo(ws.cur.classInfo[code]) })),
    guides: ch.guides.map((key) => {
      const g = ws.cur.guides[key];
      const cleaned = g ? cleanGuide(g) : null;
      return {
        key,
        value: cleaned && hasGuideContent(cleaned) ? { ...cleaned, updatedAt: nowIso, ...(userId ? { updatedBy: userId } : {}) } : null,
      };
    }),
    ...(ch.dayPlan ? { dayPlan: ws.cur.dayPlan ? { ...cleanDayPlan(ws.cur.dayPlan), updatedAt: nowIso, updatedBy: userId } : null } : {}),
    expectedUpdatedAt: Object.fromEntries(
      [...ch.updated, ...ch.deleted].map((id) => [id, millisOf(ws.base.tables[id]?.updatedAt)])
    ),
  };
}

/** 저장 계획을 사람 말로 (확인창·토스트) */
export function describePlan(plan: SavePlan): string[] {
  const out: string[] = [];
  if (plan.creates.length) out.push(`새 표 ${plan.creates.length}장`);
  if (plan.updates.length) out.push(`고친 표 ${plan.updates.length}장`);
  if (plan.deletes.length) out.push(`지울 표 ${plan.deletes.length}장`);
  if (plan.common.length) out.push(`반·이름 ${plan.common.length}개 그룹`);
  if (plan.classInfo.length) out.push(`반 정보 ${plan.classInfo.length}반`);
  if (plan.guides.length) out.push(`칸 설명 ${plan.guides.length}칸`);
  if (plan.dayPlan !== undefined) out.push('일정표');
  return out;
}

export const isPlanEmpty = (plan: SavePlan): boolean => describePlan(plan).length === 0;

/** 커스텀 표에 줄 수 있는 날짜 — 이 Day 를 여는 일정표 날짜 중 다른 표가 맡지 않은 날 */
export function freeDatesFor(ws: Workspace, category: string, groupName: string, planDates: string[], exceptTableId?: string): string[] {
  const taken = new Set(
    tablesOf(ws, category, groupName)
      .filter((t) => t.id !== exceptTableId)
      .flatMap((t) => t.dates ?? [])
  );
  return planDates.filter((d) => !taken.has(d));
}

/** 표 블록을 화면 순서대로 (time: 시작 시각, date: 입력 순) */
export const orderedBlocks = (t: CampTimetable) => sortBlocks(t.blocks, t.layout);
