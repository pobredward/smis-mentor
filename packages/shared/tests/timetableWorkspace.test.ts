import { describe, expect, it } from './_expect';
import * as W from '../src/utils/timetableWorkspace';
import * as D from '../src/utils/timetableDraft';
import type { CampTimetable } from '../src/types/campTimetable';

const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) }) as unknown as CampTimetable['createdAt'];

function table(over: Partial<CampTimetable> = {}): CampTimetable {
  return {
    id: 't1',
    campCode: 'J28',
    jobCodeId: 'job',
    groupName: 'Spring',
    dayType: 'regular',
    dayTypeLabel: '정규',
    layout: 'time',
    order: 1,
    classes: [{ classCode: 'J01' }, { classCode: 'J02' }],
    subjects: [
      { key: 'Math', partner: 'pattern' },
      { key: 'Speaking', partner: 'foreign' },
    ],
    blocks: [
      { id: 'b1', kind: 'class', times: [{ start: '09:00', end: '09:40' }, { start: '09:40', end: '10:20' }], cells: { J01: { subject: 'Math' }, J02: { subject: 'Speaking' } } },
      { id: 'b2', kind: 'shared', times: [{ start: '12:00', end: '13:00' }], label: 'Lunch' },
    ],
    note: '',
    createdAt: ts(1),
    createdBy: 'u',
    updatedAt: ts(1000),
    updatedBy: 'u',
    ...over,
  };
}

const ws0 = () =>
  W.createWorkspace({
    campCode: 'J28',
    jobCodeId: 'job',
    tables: [table(), table({ id: 't2', groupName: 'Summer', classes: [{ classCode: 'J05' }, { classCode: 'J06' }], blocks: [
      { id: 'c1', kind: 'class', times: [{ start: '09:00', end: '09:40' }, { start: '09:40', end: '10:20' }], cells: { J05: { subject: 'Math' } } },
      { id: 'c2', kind: 'shared', times: [{ start: '12:00', end: '13:00' }], label: 'lunch ' },
    ] })],
    common: { Spring: { classes: [{ classCode: 'J01' }, { classCode: 'J02' }], staffOverrides: { speaking: 'Amy' } } },
    classInfo: { J01: { className: 'Grit', classroom: '243' } },
    guides: { math: { summary: '수학' }, lunch: { summary: '점심' } },
    dayPlan: { sets: [{ id: 's1', name: 'A', groups: ['spring'], days: { '2026-08-01': { kind: 'regular' } } }] },
  });

describe('작업 공간 — 고치기 · 되돌리기', () => {
  it('고친 표만 새 객체, 나머지는 그대로 공유', () => {
    const ws = W.editTable(ws0(), 't1', (t) => D.setCellSubject(t, 'b1', 'J01', 'Speaking'));
    expect(ws.cur.tables.t1 === ws.base.tables.t1).toBe(false);
    expect(ws.cur.tables.t2 === ws.base.tables.t2).toBe(true);
    expect(ws.cur.tables.t1.blocks[0].cells!.J01.subject).toBe('Speaking');
    expect(ws.base.tables.t1.blocks[0].cells!.J01.subject).toBe('Math');
    expect(typeof ws.cur.tables.t1.updatedAt.toMillis).toBe('function');
    expect(W.changesOf(ws).updated).toEqual(['t1']);
    expect(W.tableChangeOf(ws, 't1')).toBe('changed');
  });
  it('되돌리기 · 다시하기, 같은 입력칸 연속 수정은 한 번으로', () => {
    let ws = ws0();
    ws = W.editTable(ws, 't1', (t) => { t.note = 'a'; }, 'note');
    ws = W.editTable(ws, 't1', (t) => { t.note = 'ab'; }, 'note');
    ws = W.editTable(ws, 't1', (t) => { t.note = 'abc'; }, 'note');
    expect(ws.past.length).toBe(1);
    ws = W.editTable(ws, 't1', (t) => D.removeBlock(t, 'b2'));
    expect(ws.past.length).toBe(2);
    ws = W.undo(ws);
    expect(ws.cur.tables.t1.blocks.length).toBe(2);
    expect(ws.cur.tables.t1.note).toBe('abc');
    ws = W.undo(ws);
    expect(ws.cur.tables.t1.note).toBe('');
    expect(W.isDirty(ws)).toBe(false);
    ws = W.redo(ws);
    expect(ws.cur.tables.t1.note).toBe('abc');
  });
  it('고쳤다가 원래대로 되돌리면 변경 없음', () => {
    let ws = W.editTable(ws0(), 't1', (t) => { t.note = 'x'; });
    ws = W.editTable(ws, 't1', (t) => { t.note = ''; });
    expect(W.changesOf(ws).count).toBe(0);
    expect(W.isPlanEmpty(W.planSave(ws))).toBe(true);
  });
  it('빈 뼈대를 처음 고치면 새 표가 생긴다', () => {
    const skel = table({ id: 'unsaved:steam:Spring', dayType: 'steam', blocks: [] });
    const { ws, id } = W.editTableWithId(ws0(), skel, (t) => D.addBlock(t, 'shared'));
    expect(W.isNewTableId(id)).toBe(true);
    expect(W.changesOf(ws).created).toEqual([id]);
    expect(W.tablesOf(ws, 'steam', 'spring').length).toBe(1);
  });
  it('커스텀 표 추가 · 삭제도 저장 전까지는 작업 공간에만', () => {
    let { ws, id } = W.addCustomTable(ws0(), 't1', ['2026-08-08', '2026-08-08']);
    expect(ws.cur.tables[id].dates).toEqual(['2026-08-08']);
    expect(W.tablesOf(ws, 'regular', 'Spring').map((t) => t.id)).toEqual(['t1', id]);
    ws = W.deleteTable(ws, 't2');
    const plan = W.planSave(ws, 'admin');
    expect(plan.creates.map((c) => c.tempId)).toEqual([id]);
    expect(plan.deletes).toEqual(['t2']);
    expect(plan.expectedUpdatedAt).toEqual({ t2: 1000 });
    expect(W.describePlan(plan)).toEqual(['새 표 1장', '지울 표 1장']);
  });
});

describe('저장 계획 — 바뀐 항목만, 지운 값은 실제로 지움', () => {
  it('반 정보 · 반·이름 · 칸 설명 · 일정표', () => {
    let ws = ws0();
    ws = W.setClassInfo(ws, 'J01', { className: 'Grit', classroom: ' ' });
    ws = W.setClassInfo(ws, 'J02', { className: '  ' });
    ws = W.editCommon(ws, 'spring', (v) => { v.staffOverrides = { speaking: '' }; });
    ws = W.editGuides(ws, (g) => ({ ...g, math: { summary: '' }, pe: { summary: ' 체육 ' } }));
    ws = W.editDayPlan(ws, (p) => W.setDayKinds(p, 's1', ['2026-08-01', '2026-08-02'], 'exciting'));
    const plan = W.planSave(ws, 'admin');
    expect(plan.classInfo).toEqual([{ code: 'J01', value: { className: 'Grit' } }]);
    expect(plan.common).toEqual([{ group: 'Spring', value: { classes: [{ classCode: 'J01' }, { classCode: 'J02' }], staffOverrides: {} } }]);
    const g = Object.fromEntries(plan.guides.map((x) => [x.key, x.value]));
    expect(g.math).toBe(null);
    expect(g.pe?.summary).toBe('체육');
    expect(g.pe?.updatedBy).toBe('admin');
    expect(Object.keys(plan.dayPlan!.sets[0].days)).toEqual(['2026-08-01', '2026-08-02']);
    expect(plan.dayPlan!.sets[0].days['2026-08-01'].kind).toBe('exciting');
  });
  it('반 정보를 다 지우면 null', () => {
    const ws = W.setClassInfo(ws0(), 'J01', { className: '' });
    expect(W.planSave(ws).classInfo).toEqual([{ code: 'J01', value: null }]);
  });
});

describe('이름 바꾸기가 따라오게', () => {
  it('과목 이름 — 칸과 칸 설명이 함께 (다른 표가 옛 이름을 쓰면 설명은 복사)', () => {
    const ws = W.renameSubject(ws0(), 't1', 'Math', 'Mathematics');
    const t = ws.cur.tables.t1;
    expect(t.subjects!.map((s) => s.key)).toEqual(['Mathematics', 'Speaking']);
    expect(t.blocks[0].cells!.J01.subject).toBe('Mathematics');
    expect(ws.cur.guides.mathematics?.summary).toBe('수학');
    expect(ws.cur.guides.math?.summary).toBe('수학'); // t2 가 아직 Math 를 쓴다
  });
  it('기본 과목만 쓰던 표도 과목 정의가 함께 바뀐다', () => {
    const ws = W.renameSubjectTyping(ws0(), 't2', 'Math', 'Maths');
    expect(ws.cur.tables.t2.subjects!.map((s) => s.key)).toEqual(['Maths', 'Speaking']);
    const w2 = W.createWorkspace({ campCode: 'J28', jobCodeId: 'job', tables: [table({ subjects: [] })] });
    const r = W.renameSubject(w2, 't1', 'Math', 'Maths');
    expect(r.cur.tables.t1.subjects!.map((s) => s.key)).toEqual(['Maths', 'Speaking', 'Reading', 'Writing']);
    expect(r.cur.tables.t1.subjects![0].partner).toBe('pattern');
    expect(r.cur.tables.t1.blocks[0].cells!.J01.subject).toBe('Maths');
  });
  it('캠프 전체에서 바꾸면 옛 설명은 옮겨진다', () => {
    const ws = W.renameSubject(ws0(), 't1', 'Math', 'Mathematics', 'camp');
    expect(ws.cur.tables.t2.blocks[0].cells!.J05.subject).toBe('Mathematics');
    expect(ws.cur.guides.math).toBe(undefined);
    expect(ws.cur.guides.mathematics?.summary).toBe('수학');
  });
  it('공통 줄 이름 — 캠프 전체 (대소문자·띄어쓰기 달라도 같은 줄)', () => {
    const ws = W.renameSharedLabel(ws0(), 't1', 'b2', '점심', 'camp');
    expect(ws.cur.tables.t1.blocks[1].label).toBe('점심');
    expect(ws.cur.tables.t2.blocks[1].label).toBe('점심');
    expect(ws.cur.guides['점심']?.summary).toBe('점심');
    expect(ws.cur.guides.lunch).toBe(undefined);
  });
  it('반번호 — 그룹의 모든 표 · 공통 · 반 정보', () => {
    const ws = W.renameClassCode(ws0(), 'Spring', 'J01', 'J09');
    const t = ws.cur.tables.t1;
    expect(t.classes.map((c) => c.classCode)).toEqual(['J09', 'J02']);
    expect(t.blocks[0].cells!.J09.subject).toBe('Math');
    expect(t.blocks[0].cells!.J01).toBe(undefined);
    expect(ws.cur.common.Spring.classes!.map((c) => c.classCode)).toEqual(['J09', 'J02']);
    expect(ws.cur.classInfo.J09?.className).toBe('Grit');
    expect(ws.cur.classInfo.J01).toBe(undefined);
    expect(ws.cur.tables.t2 === ws.base.tables.t2).toBe(true);
    expect(W.renameClassCode(ws, 'Spring', 'J09', 'J02') === ws).toBe(true); // 이미 있는 번호
  });
  it('반 목록 바꾸기 — 빠진 반 칸은 지우고 순서는 공통·표 모두', () => {
    const ws = W.setGroupClasses(ws0(), 'Spring', [{ classCode: 'J02' }]);
    expect(ws.cur.tables.t1.classes.map((c) => c.classCode)).toEqual(['J02']);
    expect(Object.keys(ws.cur.tables.t1.blocks[0].cells!)).toEqual(['J02']);
    expect(W.tablesUsingClass(ws0(), 'Spring', 'J01')).toBe(1);
  });
});

describe('일괄 변경', () => {
  it('같은 이름 공통 줄 찾아 시간 옮기기', () => {
    const rows = W.findMatchingRows(ws0(), { label: 'Lunch' });
    expect(rows.map((r) => r.tableId)).toEqual(['t1', 't2']);
    const ws = W.shiftRows(ws0(), rows, 30);
    expect(ws.cur.tables.t2.blocks[1].times).toEqual([{ start: '12:30', end: '13:30' }]);
  });
  it('시작 시각으로 반별 줄 찾기 · 시간 맞추기', () => {
    const rows = W.findMatchingRows(ws0(), { start: '09:00', kind: 'class' });
    expect(rows.length).toBe(2);
    const ws = W.setRowTimes(ws0(), rows, [{ start: '09:10', end: '09:50' }, { start: '09:50', end: '10:30' }]);
    expect(ws.cur.tables.t1.blocks[0].times![0].start).toBe('09:10');
    expect(ws.past.length).toBe(1);
  });
  it('시간 입력 정리', () => {
    expect(W.normalizeTime('930')).toBe('09:30');
    expect(W.normalizeTime('9:5')).toBe('09:05');
    expect(W.normalizeTime('13')).toBe('13:00');
    expect(W.normalizeTime('9시 30분')).toBe('09:30');
    expect(W.normalizeTime('25:00')).toBe(null);
    expect(W.addMinutes('23:50', 30)).toBe('23:59');
  });
  it('여러 칸 채우기', () => {
    const ws = W.fillCells(ws0(), 't1', [{ blockId: 'b1', colKey: 'J01' }, { blockId: 'b1', colKey: 'J02' }, { blockId: 'b2', colKey: 'J01' }], 'Speaking');
    expect(ws.cur.tables.t1.blocks[0].cells!.J01.subject).toBe('Speaking');
    expect(ws.cur.tables.t1.blocks[1].cells).toBe(undefined);
  });
});

describe('복사 · 가져오기', () => {
  it('반 순서대로 맞추고 이름은 비우고 날짜는 옮긴다', () => {
    const src = table({ dates: ['2026-08-08', '2026-08-30'], staffOverrides: { speaking: 'Amy' }, classes: [{ classCode: 'J01', teacherName: '김' }, { classCode: 'J02' }], subjects: [{ key: '주제1', partner: 'owner', ownerClassCode: 'J02' }], extraColumns: [{ key: 'duty', label: '당번', dutyRotation: ['J02', 'J01'] }] });
    const out = W.adaptTable(src, { campCode: 'J29', jobCodeId: 'job29', groupName: 'Winter', classes: [{ classCode: 'J13', teacherName: 'x' }, { classCode: 'J14' }], dayShift: 154, period: { start: '2027-01-05', end: '2027-01-20' } })!;
    expect(out.campCode).toBe('J29');
    expect(out.classes).toEqual([{ classCode: 'J13' }, { classCode: 'J14' }]);
    expect(out.blocks[0].cells!.J13.subject).toBe('Math');
    expect(out.subjects![0].ownerClassCode).toBe('J14');
    expect(out.extraColumns![0].dutyRotation).toEqual(['J14', 'J13']);
    expect(out.dates).toEqual(['2027-01-09']);
    expect(out.staffOverrides).toBe(undefined);
    expect(W.isNewTableId(out.id)).toBe(true);
    expect(src.blocks[0].cells!.J01.subject).toBe('Math');
    expect(W.adaptTable(table({ dates: ['2026-08-30'] }), { campCode: 'J29', jobCodeId: 'j', groupName: 'W', classes: [], dayShift: 0, period: { start: '2026-08-01', end: '2026-08-10' } })).toBe(null);
  });
  it('가져오기 — 같은 Day·그룹·날짜 표는 바꾸거나 건너뛴다', () => {
    const incoming = W.adaptTable(table(), { campCode: 'J28', jobCodeId: 'job', groupName: 'Spring', classes: [{ classCode: 'J01' }, { classCode: 'J02' }] })!;
    const skip = W.importTables(ws0(), [incoming], 'skip');
    expect([skip.created, skip.replaced, skip.skipped]).toEqual([0, 0, 1]);
    const rep = W.importTables(ws0(), [incoming], 'replace');
    expect([rep.created, rep.replaced]).toEqual([0, 1]);
    expect(rep.ws.cur.tables.t1).toBe(undefined);
    const plan = W.planSave(rep.ws);
    expect(plan.deletes).toEqual(['t1']);
    expect(plan.creates.length).toBe(1);
  });
  it('칸 설명 가져오기 — 없는 칸만, 파일 경로는 빼고', () => {
    const { ws, count } = W.importGuides(ws0(), { math: { summary: 'x' }, art: { summary: '미술', sections: [{ id: 's', title: 't', items: [{ id: 'i', type: 'image', url: 'https://a/b.png', storagePath: 'timetableGuides/J27/art/1.png' }] }] } }, 'missing');
    expect(count).toBe(1);
    expect(ws.cur.guides.math.summary).toBe('수학');
    expect(ws.cur.guides.art.sections![0].items[0].storagePath).toBe(undefined);
  });
  it('일정표 날짜 옮기기', () => {
    const p = W.shiftDayPlan({ sets: [{ id: 's', name: 'A', groups: [], days: { '2026-07-31': { kind: 'regular' }, '2026-08-20': { kind: 'final' } } }] }, 7, { start: '2026-08-01', end: '2026-08-25' });
    expect(Object.keys(p.sets[0].days)).toEqual(['2026-08-07']);
    expect(W.daysBetween('2026-07-28', '2027-01-05')).toBe(161);
  });
});

describe('표 위에서 바로 고치기 — 줄·칸 도우미', () => {
  it('줄 끼우기 — 옆 줄 사이 빈 시간을 쓴다', () => {
    const t = table();
    const id = D.insertBlock(t, 'b1', 'after', 'shared');
    expect(t.blocks.find((b) => b.id === id)!.times).toEqual([{ start: '10:20', end: '12:00' }]);
    const id2 = D.insertBlock(t, 'b1', 'before', 'class');
    expect(t.blocks.find((b) => b.id === id2)!.times).toEqual([{ start: '09:00', end: '09:00' }, { start: '09:00', end: '09:00' }]);
  });
  it('줄 복제 — 바로 뒤 같은 길이', () => {
    const t = table();
    const id = D.duplicateBlock(t, 'b1')!;
    expect(t.blocks.find((b) => b.id === id)!.times).toEqual([{ start: '10:20', end: '11:00' }, { start: '11:00', end: '11:40' }]);
  });
  it('직접 쓰는 글 · 메모 · 줄/열 채우기 · 전담 열', () => {
    const t = table();
    D.setCellTexts(t, 'b1', 'J01', ['환영', '']);
    expect(t.blocks[0].cells!.J01).toEqual({ texts: ['환영', ''], subject: undefined, partnerRole: undefined });
    D.setCellTexts(t, 'b1', 'J01', ['', '']);
    expect(t.blocks[0].cells!.J01).toBe(undefined);
    D.setCellField(t, 'b1', 'J02', 'note', 'Bc');
    expect(t.blocks[0].cells!.J02.note).toBe('Bc');
    D.fillRow(t, 'b1', 'Math');
    expect(Object.values(t.blocks[0].cells!).map((c) => c.subject)).toEqual(['Math', 'Math']);
    D.fillColumn(t, 'J02', 'Speaking');
    expect(t.blocks[0].cells!.J02.subject).toBe('Speaking');
    const key = D.addExtraColumn(t, 'duty', '교무실조');
    expect(t.extraColumns![0].dutyRotation).toEqual(['J01', 'J02']);
    expect(D.extraColumnKindOf(t.extraColumns![0])).toBe('duty');
    D.removeExtraColumn(t, key);
    expect(t.extraColumns).toEqual([]);
  });
});
