/**
 * 시간표 편집 로직 — web / mobile 공용.
 *
 * 전부 draft 하나를 제자리에서 고치는 순수 함수다. 화면 쪽에서는
 * `patchDraft((d) => draft.addClass(d, ...))` 처럼 깊은 복사본에 대고 부르면 된다.
 * UI 는 플랫폼마다 달라도 "무엇이 어떻게 바뀌는가" 는 여기 한 군데에만 있다.
 */
import {
  DEFAULT_SUBJECTS,
  buildRotationSubjects,
  rotateSubjects,
  sortBlocks,
  type CampTimetable,
  type TimetableBlock,
  type TimetableExtraColumn,
  type TimetableOwn,
  type TimetableClassColumn,
  type TimetableSubject,
} from '../types/campTimetable';

/**
 * 블록 id. uuid 패키지는 RN 에서 crypto 폴리필이 있어야 해서 쓰지 않는다.
 * 한 표 안에서만 구분되면 되므로 이 정도로 충분하다.
 */
export function newBlockId(): string {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const subjectsOf = (d: CampTimetable): TimetableSubject[] =>
  d.subjects?.length ? d.subjects : DEFAULT_SUBJECTS;

// ── 반 ─────────────────────────────────────────────────────────────

export function updateClass(d: CampTimetable, i: number, patch: Partial<TimetableClassColumn>): void {
  if (!d.classes[i]) return;
  // 반번호가 바뀌면 그 반에 딸린 것들도 같이 옮겨야 한다
  if (patch.classCode !== undefined && patch.classCode !== d.classes[i].classCode) {
    renameClass(d, i, patch.classCode);
  }
  const { classCode: _ignored, ...rest } = patch;
  d.classes[i] = { ...d.classes[i], ...rest };
}

/**
 * 반번호를 바꾸면서 그 반의 수업 칸·주제 담당·당번 순번까지 새 번호로 옮긴다.
 * (그냥 번호만 바꾸면 칸들이 옛 번호에 남아 열이 통째로 비어 보인다)
 */
export function renameClass(d: CampTimetable, i: number, newCode: string): void {
  const col = d.classes[i];
  if (!col) return;
  const old = col.classCode;
  d.classes[i] = { ...col, classCode: newCode };
  if (!old || !newCode || old === newCode) return;

  d.blocks.forEach((b) => {
    if (!b.cells || !(old in b.cells)) return;
    const cell = b.cells[old];
    delete b.cells[old];
    b.cells[newCode] = cell;
  });
  d.subjects = (d.subjects ?? []).map((s) =>
    s.ownerClassCode === old ? { ...s, ownerClassCode: newCode } : s
  );
  d.extraColumns = (d.extraColumns ?? []).map((e) =>
    e.dutyRotation ? { ...e, dutyRotation: e.dutyRotation.map((c) => (c === old ? newCode : c)) } : e
  );
}

export function addClass(d: CampTimetable, campCode: string): void {
  const n = d.classes.length + 1;
  d.classes.push({ classCode: `${campCode.slice(0, 1) || 'C'}${String(n).padStart(2, '0')}` });
}

export function removeClass(d: CampTimetable, i: number): void {
  const [removed] = d.classes.splice(i, 1);
  if (removed) d.blocks.forEach((b) => b.cells && delete b.cells[removed.classCode]);
}

// ── 과목·주제 ───────────────────────────────────────────────────────

export function updateSubject(d: CampTimetable, i: number, patch: Partial<TimetableSubject>): void {
  d.subjects = [...subjectsOf(d)];
  if (d.subjects[i]) d.subjects[i] = { ...d.subjects[i], ...patch };
}

export function addSubject(d: CampTimetable): void {
  d.subjects = [...subjectsOf(d), { key: '새 과목', partner: 'none' }];
}

export function removeSubject(d: CampTimetable, i: number): void {
  d.subjects = [...subjectsOf(d)];
  d.subjects.splice(i, 1);
}

/** 인문학처럼 "주제N = N번째 반 담임" 구조로 과목을 새로 깐다 */
export function resetRotationSubjects(d: CampTimetable): void {
  d.subjects = buildRotationSubjects(d.classes.map((c) => c.classCode));
}

// ── 블록(교시) ──────────────────────────────────────────────────────

export function addBlock(d: CampTimetable, kind: 'shared' | 'class'): void {
  const isDate = (d.layout ?? 'time') === 'date';
  const sorted = sortBlocks(d.blocks, d.layout);
  const last = sorted[sorted.length - 1];
  const start = last?.times?.[(last.times?.length ?? 1) - 1]?.end ?? '09:00';
  if (isDate) {
    d.blocks.push({
      id: newBlockId(),
      kind,
      dateLabel: '',
      lines: kind === 'class' ? 2 : 1,
      ...(kind === 'class' ? { cells: {} } : { label: '' }),
    });
    return;
  }
  d.blocks.push(
    kind === 'shared'
      ? { id: newBlockId(), kind, times: [{ start, end: start }], label: '' }
      : {
          id: newBlockId(),
          kind,
          times: [
            { start, end: start },
            { start, end: start },
          ],
          cells: {},
        }
  );
}

export function updateBlock(d: CampTimetable, id: string, patch: Partial<TimetableBlock>): void {
  const i = d.blocks.findIndex((b) => b.id === id);
  if (i >= 0) d.blocks[i] = { ...d.blocks[i], ...patch };
}

export function updateTime(
  d: CampTimetable,
  id: string,
  idx: number,
  field: 'start' | 'end',
  value: string
): void {
  const b = d.blocks.find((x) => x.id === id);
  if (b?.times?.[idx]) b.times[idx][field] = value;
}

/** 한 블록을 1교시짜리 / 2교시 세트로 바꾼다 */
export function setPeriodCount(d: CampTimetable, id: string, count: 1 | 2): void {
  const b = d.blocks.find((x) => x.id === id);
  if (!b?.times) return;
  if (count === 1) b.times = b.times.slice(0, 1);
  else if (b.times.length === 1) b.times = [b.times[0], { ...b.times[0] }];
}

export function removeBlock(d: CampTimetable, id: string): void {
  d.blocks = d.blocks.filter((b) => b.id !== id);
}

// ── 칸 ─────────────────────────────────────────────────────────────

export function setCellSubject(d: CampTimetable, blockId: string, colKey: string, subject: string): void {
  const b = d.blocks.find((x) => x.id === blockId);
  if (!b) return;
  b.cells ??= {};
  if (!subject) delete b.cells[colKey];
  else {
    const prev = b.cells[colKey];
    // 과목이 바뀌면 그 칸에만 붙여 둔 짝 원어민 역할도 의미가 없어진다
    b.cells[colKey] = { ...prev, subject, texts: undefined, ...(prev?.subject !== subject ? { partnerRole: undefined } : {}) };
  }
}

export function setCellRoom(
  d: CampTimetable,
  blockId: string,
  colKey: string,
  field: 'room' | 'partnerRoom',
  value: string
): void {
  const b = d.blocks.find((x) => x.id === blockId);
  if (!b) return;
  b.cells ??= {};
  const cell = b.cells[colKey];
  if (!cell) return;
  if (value) cell[field] = value;
  else delete cell[field];
}

/** 같은 열의 강의실을 이 표 전체에 한 번에 채운다 */
export function fillRoomDown(
  d: CampTimetable,
  colKey: string,
  field: 'room' | 'partnerRoom',
  value: string
): void {
  d.blocks.forEach((b) => {
    const cell = b.cells?.[colKey];
    if (!cell?.subject) return;
    if (value) cell[field] = value;
    else delete cell[field];
  });
}

/** 2교시 세트에서 위·아래를 뒤집는다 (Pattern 이 위로 오는 줄) */
export function togglePartnerFirst(d: CampTimetable, blockId: string, colKey: string): void {
  const cell = d.blocks.find((x) => x.id === blockId)?.cells?.[colKey];
  if (cell) cell.partnerFirst = !cell.partnerFirst;
}

/** 로테이션에 쓸 과목 키 (그 반 담임이 맡는 공통 수업은 제외) */
export function rotationKeysOf(d: CampTimetable): string[] {
  return subjectsOf(d)
    .filter((s) => s.partner !== 'ownTeacher')
    .map((s) => s.key);
}

/**
 * 로테이션을 돌리기 전에 짚어 줄 문제. 없으면 null.
 * 과목이 반보다 적으면 한 줄 안에서 같은 과목이 두 번 나온다.
 */
export function rotationWarning(d: CampTimetable): string | null {
  const keys = rotationKeysOf(d);
  if (!keys.length) return '로테이션에 쓸 과목이 없습니다. "과목·주제" 에서 먼저 추가하세요.';
  const n = d.classes.length;
  if (keys.length < n)
    return `반은 ${n}개인데 과목이 ${keys.length}개뿐이라 한 줄에 같은 과목이 겹칩니다. 과목을 ${n}개로 맞춰 주세요.`;
  return null;
}

/**
 * 과목·주제를 반 순서대로 놓고 줄이 넘어갈 때마다 한 칸씩 민다.
 * @returns 채우는 데 쓴 과목 순서. 쓸 과목이 없으면 null
 */
export function applyRotation(d: CampTimetable): string[] | null {
  const keys = rotationKeysOf(d);
  if (!keys.length) return null;
  const classCodes = d.classes.map((c) => c.classCode);
  let offset = 0;
  sortBlocks(d.blocks, d.layout).forEach((sortedBlock) => {
    if (sortedBlock.kind !== 'class') return;
    const target = d.blocks.find((b) => b.id === sortedBlock.id);
    if (!target) return;
    const filled = rotateSubjects(keys, classCodes, offset);
    target.cells = {
      ...Object.fromEntries(Object.entries(target.cells ?? {}).filter(([k]) => !classCodes.includes(k))),
      ...filled,
    };
    offset += 1;
  });
  return keys;
}

// ── 저장할 모양 ─────────────────────────────────────────────────────

/** update() 에 넘길 필드만 추린다 — web/mobile 이 같은 것을 저장하도록 */
export function toUpdatePayload(d: CampTimetable) {
  return {
    groupName: d.groupName,
    dayType: d.dayType,
    dayTypeLabel: d.dayTypeLabel,
    layout: d.layout,
    classes: d.classes,
    extraColumns: d.extraColumns ?? [],
    subjects: d.subjects ?? [],
    blocks: sortBlocks(d.blocks, d.layout),
    note: d.note ?? '',
    own: d.own ?? {},
    dates: [...new Set(d.dates ?? [])].sort(),
  };
}

/** 이 표가 맡을 날짜를 켜고 끈다 (아무것도 없으면 그 Day 의 기본 표) */
export function toggleDate(d: CampTimetable, date: string): void {
  const set = new Set(d.dates ?? []);
  if (set.has(date)) set.delete(date);
  else set.add(date);
  d.dates = [...set].sort();
}

// ── 공통 / 이 Day 만 따로 ────────────────────────────────────────────

/**
 * 한 항목을 공통에서 떼어 내거나 다시 붙인다.
 * 뗄 때는 지금 화면에 보이던 공통 값이 그대로 출발점이 되도록 draft 의
 * 현재 값을 그냥 둔다 (이미 공통이 씌워진 상태로 들어온다).
 */
export function setOwn(d: CampTimetable, part: keyof TimetableOwn, own: boolean): void {
  const next: TimetableOwn = { ...(d.own ?? {}) };
  if (own) next[part] = true;
  else delete next[part];
  d.own = next;
}

/** 편집용 깊은 복사 */
export function cloneDraft(t: CampTimetable): CampTimetable {
  return JSON.parse(JSON.stringify(t)) as CampTimetable;
}

/**
 * 줄을 위/아래로 한 칸 옮긴다.
 *
 * 시간 표는 순서가 시각으로 정해지므로 두 줄이 **시간대를 주고받는다**.
 * (2교시 줄과 1교시 줄을 바꿔도 전체 시간 배치는 그대로 유지된다)
 * 날짜 표는 날짜를 주고받는다.
 * 중간에 줄을 끼워 넣을 때 아래 줄들의 시간을 다시 입력하지 않아도 되게 하는 것이 목적.
 *
 * @returns 옮겼으면 true, 끝이라 못 옮기면 false
 */
export function moveBlock(d: CampTimetable, id: string, dir: -1 | 1): boolean {
  const sorted = sortBlocks(d.blocks, d.layout);
  const i = sorted.findIndex((b) => b.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return false;

  const first = d.blocks.find((b) => b.id === sorted[Math.min(i, j)].id);
  const second = d.blocks.find((b) => b.id === sorted[Math.max(i, j)].id);
  if (!first || !second) return false;

  if ((d.layout ?? 'time') === 'date') {
    // 날짜 표는 순서가 곧 배열 순서다. 두 줄의 자리를 바꾸되 날짜는 자리에 남겨 둬서
    // 내용만 옮겨 가고 날짜는 계속 순서대로 보이게 한다.
    const ia = d.blocks.indexOf(first);
    const ib = d.blocks.indexOf(second);
    [d.blocks[ia], d.blocks[ib]] = [d.blocks[ib], d.blocks[ia]];
    const label = first.dateLabel;
    const offsets = first.dayOffsets;
    first.dateLabel = second.dateLabel;
    first.dayOffsets = second.dayOffsets;
    second.dateLabel = label;
    second.dayOffsets = offsets;
    return true;
  }

  // 두 줄이 쓰던 시간 슬롯을 순서대로 모아, 뒤 줄이 앞자리를 먼저 가져간다.
  // 교시 수가 달라도 전체 시간표가 어긋나지 않는다.
  const slots = [...(first.times ?? []), ...(second.times ?? [])];
  const secondCount = second.times?.length ?? 0;
  second.times = slots.slice(0, secondCount);
  first.times = slots.slice(secondCount);
  return true;
}

// ── 표 붙여넣기 (엑셀·구글시트) ──────────────────────────────────────

/** 반 구성에서 붙여넣기가 채우는 칸의 순서 — 화면에 놓인 순서와 같아야 한다 */
export const CLASS_PASTE_FIELDS = [
  'classCode',
  'classroom',
  'className',
  'bookCode',
  'spareBookCode',
] as const;
export type ClassPasteField = (typeof CLASS_PASTE_FIELDS)[number];

/**
 * 스프레드시트에서 복사한 텍스트를 표로 읽는다.
 * 줄바꿈이 행, 탭이 열. 셀 하나짜리면 표가 아니므로 null.
 */
export function parseClipboardTable(text: string): string[][] | null {
  const rows = (text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n+$/, '')
    .split('\n')
    .map((line) => line.split('\t').map((c) => c.trim()));
  if (!rows.length) return null;
  if (rows.length === 1 && rows[0].length <= 1) return null;
  return rows;
}

/** 한 번에 늘릴 수 있는 반 개수 — 실수로 큰 범위를 붙여넣었을 때를 막는다 */
const MAX_PASTE_ROWS = 30;

/**
 * 반 구성에 표를 붙여넣는다. (row, col) 자리부터 오른쪽·아래로 채우고,
 * 행이 모자라면 반을 새로 만든다.
 * @returns 실제로 채운 행 수
 */
export function pasteClassGrid(
  d: CampTimetable,
  row: number,
  col: number,
  grid: string[][],
  campCode: string
): number {
  const rows = grid.slice(0, MAX_PASTE_ROWS);
  rows.forEach((cells, r) => {
    const i = row + r;
    while (d.classes.length <= i) addClass(d, campCode);
    cells.forEach((value, c) => {
      const field = CLASS_PASTE_FIELDS[col + c];
      // 반코드만 표에 들어간다 — 반이름·강의실·교재코드는 캠프 설정 쪽에서 처리
      if (field !== 'classCode' || !value) return;
      updateClass(d, i, { classCode: value });
    });
  });
  return rows.length;
}

// ── 표 위에서 바로 고치기 (통합 편집기) ──────────────────────────────────

const toHHMM = (m: number) => `${String(Math.floor(Math.max(0, Math.min(1439, m)) / 60)).padStart(2, '0')}:${String(Math.max(0, Math.min(1439, m)) % 60).padStart(2, '0')}`;
const minutesOf = (hhmm: string | undefined) => {
  const [h, m] = (hhmm ?? '').split(':').map((v) => parseInt(v, 10));
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
};

/**
 * 줄을 원하는 자리에 끼운다 — ref 줄의 위(before) 또는 아래(after).
 * 시간은 옆 줄 사이 빈 시간을 쓰고, 빈 시간이 없으면 ref 줄 끝(또는 시작)에 길이 0 으로 붙인다(관리자가 고친다).
 * 날짜 표는 그 자리에 빈 날짜 줄을 넣는다.
 * @returns 새 줄 id
 */
export function insertBlock(
  d: CampTimetable,
  refId: string | null,
  where: 'before' | 'after',
  kind: 'shared' | 'class'
): string {
  const id = newBlockId();
  if ((d.layout ?? 'time') === 'date') {
    const block: TimetableBlock = {
      id,
      kind,
      dateLabel: '',
      lines: kind === 'class' ? 2 : 1,
      ...(kind === 'class' ? { cells: {} } : { label: '' }),
    };
    const i = refId ? d.blocks.findIndex((b) => b.id === refId) : -1;
    if (i < 0) d.blocks.push(block);
    else d.blocks.splice(where === 'before' ? i : i + 1, 0, block);
    return id;
  }
  const sorted = sortBlocks(d.blocks, d.layout);
  const i = refId ? sorted.findIndex((b) => b.id === refId) : sorted.length - 1;
  const ref = sorted[i];
  const prev = where === 'before' ? sorted[i - 1] : ref;
  const next = where === 'before' ? ref : sorted[i + 1];
  const prevEnd = minutesOf(prev?.times?.[(prev.times?.length ?? 1) - 1]?.end);
  const nextStart = minutesOf(next?.times?.[0]?.start);
  let start: number;
  let end: number;
  if (prevEnd !== null && nextStart !== null && nextStart > prevEnd) {
    start = prevEnd;
    end = nextStart;
  } else if (where === 'before' && nextStart !== null) {
    start = end = nextStart;
  } else {
    start = end = prevEnd ?? 9 * 60;
  }
  const one = { start: toHHMM(start), end: toHHMM(end) };
  if (kind === 'shared') {
    d.blocks.push({ id, kind, times: [one], label: '' });
  } else {
    const mid = start + Math.floor((end - start) / 2);
    d.blocks.push({
      id,
      kind,
      times: end > start ? [{ start: toHHMM(start), end: toHHMM(mid) }, { start: toHHMM(mid), end: toHHMM(end) }] : [one, { ...one }],
      cells: {},
    });
  }
  return id;
}

/** 줄 복제 — 바로 아래에 같은 내용 (시간은 원본 끝에서 같은 길이로) */
export function duplicateBlock(d: CampTimetable, id: string): string | null {
  const src = d.blocks.find((b) => b.id === id);
  if (!src) return null;
  const copy: TimetableBlock = JSON.parse(JSON.stringify(src));
  copy.id = newBlockId();
  if ((d.layout ?? 'time') === 'date') {
    const i = d.blocks.indexOf(src);
    d.blocks.splice(i + 1, 0, copy);
    return copy.id;
  }
  const s = minutesOf(src.times?.[0]?.start);
  const e = minutesOf(src.times?.[(src.times?.length ?? 1) - 1]?.end);
  if (s !== null && e !== null && copy.times) {
    const len = e - s;
    copy.times = copy.times.map((t) => {
      const ts = minutesOf(t.start) ?? s;
      const te = minutesOf(t.end) ?? e;
      return { start: toHHMM(ts + len), end: toHHMM(te + len) };
    });
  }
  d.blocks.push(copy);
  return copy.id;
}

/** 칸에 직접 쓰는 글 (입소·퇴소처럼 규칙이 없는 칸) — 쓰면 과목은 비운다. 빈 줄만 남으면 칸을 비운다 */
export function setCellTexts(d: CampTimetable, blockId: string, colKey: string, texts: string[]): void {
  const b = d.blocks.find((x) => x.id === blockId);
  if (!b) return;
  b.cells ??= {};
  const prev = b.cells[colKey];
  const has = texts.some((t) => t.trim());
  if (!has) {
    if (prev) {
      const { texts: _t, ...rest } = prev;
      if (rest.subject || rest.note || rest.room) b.cells[colKey] = rest;
      else delete b.cells[colKey];
    }
    return;
  }
  b.cells[colKey] = { ...(prev ?? {}), texts, subject: undefined, partnerRole: undefined };
}

/** 칸 하나의 보조 값 (메모 · 짝 원어민 역할 · 강의실) — 빈 값이면 지운다 */
export function setCellField(
  d: CampTimetable,
  blockId: string,
  colKey: string,
  field: 'note' | 'partnerRole' | 'room' | 'partnerRoom',
  value: string
): void {
  const b = d.blocks.find((x) => x.id === blockId);
  if (!b) return;
  b.cells ??= {};
  const cell = { ...(b.cells[colKey] ?? {}) };
  if (value.trim()) cell[field] = value;
  else delete cell[field];
  if (Object.values(cell).some((v) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))) b.cells[colKey] = cell;
  else delete b.cells[colKey];
}

/** 한 줄의 반 칸 전부에 같은 과목 */
export function fillRow(d: CampTimetable, blockId: string, subject: string): void {
  const b = d.blocks.find((x) => x.id === blockId);
  if (!b || b.kind !== 'class') return;
  d.classes.forEach((c) => setCellSubject(d, blockId, c.classCode, subject));
}

/** 한 열(반)의 반별 줄 전부에 같은 과목 */
export function fillColumn(d: CampTimetable, colKey: string, subject: string): void {
  d.blocks.forEach((b) => {
    if (b.kind === 'class') setCellSubject(d, b.id, colKey, subject);
  });
}

// ── 전담 열 ──────────────────────────────────────────────────────────

export type ExtraColumnKind = 'duty' | 'staffRole' | 'staticText' | 'teacher';

/** 전담 열 추가 — duty: 반이 돌아가며 맡는 당번, staffRole: 한 역할이 내내, staticText: 고정 글, teacher: 고정 교사 이름 */
export function addExtraColumn(d: CampTimetable, kind: ExtraColumnKind, label = ''): string {
  const key = `x-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const base: TimetableExtraColumn = { key, label: label || '전담' };
  const col: TimetableExtraColumn =
    kind === 'duty'
      ? { ...base, dutyRotation: d.classes.map((c) => c.classCode) }
      : kind === 'staffRole'
        ? { ...base, staffRole: '수업' }
        : kind === 'staticText'
          ? { ...base, staticText: '-' }
          : { ...base, teacherName: '' };
  d.extraColumns = [...(d.extraColumns ?? []), col];
  return key;
}

export function updateExtraColumn(d: CampTimetable, key: string, patch: Partial<TimetableExtraColumn>): void {
  d.extraColumns = (d.extraColumns ?? []).map((e) => (e.key === key ? { ...e, ...patch } : e));
}

export function removeExtraColumn(d: CampTimetable, key: string): void {
  d.extraColumns = (d.extraColumns ?? []).filter((e) => e.key !== key);
  d.blocks.forEach((b) => b.cells && delete b.cells[key]);
}

/** 전담 열의 종류 (화면 표시용) */
export function extraColumnKindOf(e: TimetableExtraColumn): ExtraColumnKind {
  if (e.dutyRotation) return 'duty';
  if (e.staffRole) return 'staffRole';
  if (e.staticText !== undefined) return 'staticText';
  return 'teacher';
}
