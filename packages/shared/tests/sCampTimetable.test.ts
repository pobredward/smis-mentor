import { describe, expect, it } from './_expect';
import { renderCell, type TimetableSubject } from '../src/types/campTimetable';
import { cleanDayPlan, dayCategory, excitingDates, findDayKind, dayKindLabel, type DayPlanSet } from '../src/types/campDayPlan';
import { setCellSubject } from '../src/utils/timetableDraft';

const subjects: TimetableSubject[] = [
  { key: 'Speaking', partner: 'foreign' },
  { key: 'PBL', partner: 'foreign' },
];
const ctx = (col: string) => ({
  subjects,
  columnKey: col,
  resolveTeacher: () => undefined,
  resolveForeign: (r: string) => ({ speaking: { name: 'Jared' }, reading: { name: 'Nina' } } as Record<string, { name: string }>)[r.toLowerCase()],
});

describe('S캠프 시간표 — 칸 단위 짝 원어민', () => {
  it('partnerRole 이 있으면 그 역할의 원어민을 짝으로 보여 준다', () => {
    const lines = renderCell({ subject: 'PBL', partnerRole: 'Reading' }, 2, ctx('S06') as any);
    expect(lines.map((l) => l.text)).toEqual(['PBL', 'Nina']);
  });
  it('없으면 과목 이름으로 찾고, 못 찾으면 자리표시', () => {
    expect(renderCell({ subject: 'Speaking' }, 2, ctx('S05') as any)[1].text).toBe('Jared');
    expect(renderCell({ subject: 'PBL' }, 2, ctx('S05') as any)[1].text).toBe('PBL 원어민');
  });
  it('과목을 바꾸면 그 칸의 짝 역할은 지운다', () => {
    const d: any = { blocks: [{ id: 'b', kind: 'class', cells: { S06: { subject: 'PBL', partnerRole: 'Reading', room: '301' } } }] };
    setCellSubject(d, 'b', 'S06', 'PBL');
    expect(d.blocks[0].cells.S06.partnerRole).toBe('Reading');
    setCellSubject(d, 'b', 'S06', 'Speaking');
    expect(d.blocks[0].cells.S06.partnerRole).toBe(undefined);
    expect(d.blocks[0].cells.S06.room).toBe('301');
  });
});

describe('S캠프 일정표 — Outdoor Class', () => {
  const set: DayPlanSet = {
    id: 's', name: 'Spring', groups: ['spring'],
    days: {
      '2027-01-15': { kind: 'exciting' },
      '2027-01-18': { kind: 'outdoor', note: '리버 원더스', slots: [{ id: 'x', start: '09:00', end: '12:00', activity: 'River Wonders', place: 'Mandai' }] },
    },
  };
  it('S 캠프에선 SG Outdoor Class 로 보이고, 활동표 탭에서 연다', () => {
    expect(dayKindLabel('outdoor', 'S29')).toBe('SG Outdoor Class');
    expect(findDayKind('outdoor')?.short).toBe('Outdoor Class');
    expect(dayCategory(set, '2027-01-18', 'S29')).toBe('exciting');
    expect(excitingDates(set)).toEqual(['2027-01-15', '2027-01-18']);
  });
  it('저장할 때 활동표와 메모를 지우지 않는다', () => {
    const out = cleanDayPlan({ sets: [set] }).sets[0].days['2027-01-18'];
    expect(out.kind).toBe('outdoor');
    expect(out.note).toBe('리버 원더스');
    expect(out.slots?.length).toBe(1);
  });
});

import { pickTimetableForDate, resolveTimetable, resolveTimetables, savedTimetablesFor } from '../src/data/timetablePresets';
import { nextUnclaimedDate, planDatesFor, timetableVariants } from '../src/utils/timetableVariants';
import { toUpdatePayload, toggleDate } from '../src/utils/timetableDraft';

describe('날짜별 표 (Summer 고잉업 1/21 · 1/28)', () => {
  const base = (id: string, dates?: string[], order = 0): any => ({
    id, campCode: 'S29', jobCodeId: 'j', groupName: 'Summer', dayType: 'steam', dayTypeLabel: '고잉업', layout: 'time', order,
    classes: [{ classCode: 'S05' }], blocks: [], ...(dates ? { dates } : {}),
  });
  const set: DayPlanSet = { id: 's', name: 'Summer', groups: ['summer'], days: {
    '2027-01-21': { kind: 'steam' }, '2027-01-22': { kind: 'exciting' }, '2027-01-28': { kind: 'steam' },
  } };
  const args = { groups: [], category: 'steam', groupName: 'Summer', campCode: 'S29', jobCodeId: 'j' };

  it('기본 표가 먼저, 날짜 표는 날짜 순', () => {
    const list = savedTimetablesFor([base('b', ['2027-01-28'], 9), base('a')], 'steam', 'summer');
    expect(list.map((t) => t.id)).toEqual(['a', 'b']);
  });
  it('그날 표를 고르고, 없으면 기본 표', () => {
    const tts = [base('a'), base('b', ['2027-01-28'])];
    expect(resolveTimetable({ ...args, timetables: tts, date: '2027-01-28' })?.id).toBe('b');
    expect(resolveTimetable({ ...args, timetables: tts, date: '2027-01-21' })?.id).toBe('a');
    expect(resolveTimetable({ ...args, timetables: tts })?.id).toBe('a');
    expect(resolveTimetables({ ...args, timetables: tts }).map((t) => t.id)).toEqual(['a', 'b']);
    expect(pickTimetableForDate([base('x', ['2027-01-21'])], '2027-02-01')?.id).toBe('x');
  });
  it('기본 표는 다른 표가 맡지 않은 그 Day 날짜를 맡는다', () => {
    const v = timetableVariants([base('a'), base('b', ['2027-01-28'])], set, 'steam', 'S29');
    expect(v.map((x) => [x.table.id, x.dates, x.isBase])).toEqual([['a', ['2027-01-21'], true], ['b', ['2027-01-28'], false]]);
    expect(planDatesFor(set, 'steam', 'S29')).toEqual(['2027-01-21', '2027-01-28']);
  });
  it('복제할 표에는 아직 아무도 안 맡은 둘째 날을 준다', () => {
    expect(nextUnclaimedDate([base('a')], set, 'steam', 'S29')).toBe('2027-01-28');
    expect(nextUnclaimedDate([base('a'), base('b', ['2027-01-28'])], set, 'steam', 'S29')).toBe(null);
    expect(nextUnclaimedDate([base('a', ['2027-01-21'])], set, 'steam', 'S29')).toBe('2027-01-28');
  });
  it('저장 모양 — 날짜 정렬·중복 제거, 켜고 끄기', () => {
    const d = base('a', ['2027-01-28']);
    toggleDate(d, '2027-01-21');
    expect(toUpdatePayload(d).dates).toEqual(['2027-01-21', '2027-01-28']);
    toggleDate(d, '2027-01-28');
    expect(d.dates).toEqual(['2027-01-21']);
  });
});

import { deriveGroupsFromMembers } from '../src/types/campTimetable';

describe('원어민 이름은 학생들에게 보이는 영어 이름으로', () => {
  it('영어 이름이 있으면 그것, 없으면 계정 이름 · 한국인 멘토는 그대로', () => {
    const exp = (group: string, groupRole: string, classCode?: string) => [{ id: 'j', group, groupRole, ...(classCode ? { classCode } : {}) }];
    const g = deriveGroupsFromMembers([
      { name: '백현길', role: 'mentor', englishNickname: 'Tom', jobExperiences: exp('senior', '담임', 'J12') },
      { name: '김유진', role: 'mentor', jobExperiences: exp('senior', '수업') },
      { name: 'Maurrice Nofemele', role: 'foreign', englishNickname: 'Maurice', jobExperiences: exp('senior', 'Writing') },
      { name: 'Jae Hyun Kim', role: 'foreign', jobExperiences: exp('senior', 'Reading') },
    ], 'j')[0];
    expect(g.teacherByClass).toEqual({ J12: '백현길' });
    expect(g.staffByRole).toEqual({ 담임: '백현길', 수업: '김유진', writing: 'Maurice', reading: 'Jae Hyun Kim' });
  });
});
