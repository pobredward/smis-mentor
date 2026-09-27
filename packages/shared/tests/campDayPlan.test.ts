import { describe, expect, it } from './_expect';
import {
  calendarWeeks, cleanDayPlan, dayCategory, daySetForGroup, excitingDates, excitingSlotAt, type CampDayPlan,
} from '../src/types/campDayPlan';
import { studentWhereabouts, roomLabel } from '../src/utils/whereabouts';
import type { CampTimetable, DerivedGroup } from '../src/types/campTimetable';

const plan: CampDayPlan = {
  sets: [
    {
      id: 'a', name: 'Spring · Summer', groups: ['spring', 'summer'],
      days: {
        '2026-07-26': { kind: 'orientation' },
        '2026-07-27': { kind: 'regular' },
        '2026-07-28': { kind: 'regular' },
        '2026-08-01': { kind: 'exciting', slots: [{ id: 's1', start: '13:00', end: '15:00', activity: '런닝맨', place: '런닝맨 테마파크' }] },
        '2026-08-13': { kind: 'final' },
      },
    },
    { id: 'b', name: 'Autumn · Winter', groups: ['autumn', 'winter'], days: { '2026-07-31': { kind: 'exciting' } } },
  ],
};

const groups: DerivedGroup[] = [
  { name: 'Spring', key: 'spring', classCodes: ['J01', 'J02'], teacherByClass: {}, staffByRole: {} },
];
const regular = {
  id: 't1', campCode: 'J28', jobCodeId: 'jc', groupName: 'Spring', dayType: 'regular', dayTypeLabel: '정규', layout: 'time', order: 0,
  classes: [{ classCode: 'J01' }, { classCode: 'J02' }],
  subjects: [
    { key: 'Math', partner: 'pattern', room: '443', partnerRoom: '445' },
    { key: 'Speaking', partner: 'foreign', room: '444' },
  ],
  blocks: [
    { id: 'b1', kind: 'shared', label: 'Lunch', times: [{ start: '12:30', end: '13:30' }] },
    { id: 'b2', kind: 'class', times: [{ start: '09:20', end: '10:00' }, { start: '10:10', end: '10:50' }],
      cells: { J01: { subject: 'Math' }, J02: { subject: 'Speaking', room: '2012' } } },
  ],
} as unknown as CampTimetable;
const input = { campCode: 'J28', jobCodeId: 'jc', dayPlan: plan, timetables: [regular], groups, classInfo: { J01: { classroom: '243' } } };
const at = (d: string, hm: string) => new Date(`${d}T${hm}:00`);

describe('campDayPlan', () => {
  it('그룹 → 세트, 첫 Regular Day 는 J·E 캠프에서 입소 D+1', () => {
    const set = daySetForGroup(plan, 'Summer Group');
    expect(set?.id).toBe('a');
    expect(daySetForGroup(plan, 'Winter')?.id).toBe('b');
    expect(dayCategory(set, '2026-07-27', 'J28')).toBe('arrival_d1');
    expect(dayCategory(set, '2026-07-28', 'J28')).toBe('regular');
    expect(dayCategory(set, '2026-07-27', 'S29')).toBe('regular');
    expect(dayCategory(set, '2026-08-13', 'J28')).toBe('departure_d1');
    expect(dayCategory(set, '2026-07-26', 'J28')).toBe('arrival');
    expect(excitingDates(set)).toEqual(['2026-08-01']);
    expect(excitingSlotAt(set?.days['2026-08-01'], 14 * 60)?.place).toBe('런닝맨 테마파크');
    expect(excitingSlotAt(set?.days['2026-08-01'], 15 * 60)).toBe(undefined);
  });

  it('달력은 일요일 시작 주 단위, 기간 밖은 null', () => {
    const weeks = calendarWeeks(new Date(2026, 6, 26), new Date(2026, 7, 14));
    expect(weeks.length).toBe(3);
    expect(weeks[0][0]).toBe('2026-07-26');
    expect(weeks[2][5]).toBe('2026-08-14');
    expect(weeks[2][6]).toBe(null);
  });

  it('저장 전 정리 — 한 그룹은 한 세트에만, 빈 활동 칸 제거', () => {
    const out = cleanDayPlan({ sets: [
      { id: 'x', name: ' ', groups: ['Spring', 'spring'], days: { '2026-08-01': { kind: 'exciting', slots: [{ id: '', start: '15:00', end: '16:00', activity: '', place: '' }, { id: '', start: '09:00', end: '10:00', activity: 'A', place: 'B' }] } } },
      { id: 'y', name: 'Y', groups: ['SPRING', 'Autumn'], days: { bad: { kind: 'regular' } } },
    ] });
    expect(out.sets[0].groups).toEqual(['spring']);
    expect(out.sets[1].groups).toEqual(['autumn']);
    expect(out.sets[0].name).toBe('일정 1');
    expect(out.sets[0].days['2026-08-01'].slots?.length).toBe(1);
    expect(Object.keys(out.sets[1].days).length).toBe(0);
  });
});

describe('whereabouts', () => {
  it('시간표 칸 → 과목·강의실 (짝 교시·반 강의실·칸 강의실)', () => {
    // 7/28 = 정규 표. 7/27 은 입소 D+1 (표 없음 → 빈 표로 해석되어 Day 이름만)
    expect(studentWhereabouts(input, { classNumber: 'J01-03' }, at('2026-07-28', '09:30'))?.text).toBe('Regular Day · Math · 443호');
    expect(studentWhereabouts(input, { classNumber: 'J01' }, at('2026-07-28', '10:20'))?.text).toBe('Regular Day · Pattern · 445호');
    expect(studentWhereabouts(input, { classNumber: 'J02' }, at('2026-07-28', '10:20'))?.place).toBe('2012호');
    expect(studentWhereabouts(input, { classNumber: 'J02' }, at('2026-07-28', '12:40'))?.text).toBe('Regular Day · Lunch');
    expect(studentWhereabouts(input, { classNumber: 'J02' }, at('2026-07-28', '22:00'))?.text).toBe('Regular Day');
  });
  it('익사이팅 데이 → 활동·장소, 일정 없는 날은 null', () => {
    expect(studentWhereabouts(input, { classNumber: 'J01' }, at('2026-08-01', '13:10'))?.text).toBe('Exciting Day · 런닝맨 · 런닝맨 테마파크');
    expect(studentWhereabouts(input, { classNumber: 'J01' }, at('2026-08-02', '13:10'))).toBe(null);
    expect(studentWhereabouts(input, { classNumber: 'K09' }, at('2026-08-01', '13:10'))).toBe(null);
    expect(roomLabel('443')).toBe('443호');
    expect(roomLabel('식당')).toBe('식당');
  });
});
