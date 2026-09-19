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
  else b.cells[colKey] = { ...b.cells[colKey], subject, texts: undefined };
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
  };
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
