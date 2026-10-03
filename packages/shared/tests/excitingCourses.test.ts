import { describe, expect, it } from './_expect';
import * as EC from '../src/utils/excitingCourses';
import { cleanDayPlan, excitingSlotsFor, excitingSlotAt, excitingCourseFor, type CampDayPlan, type ExcitingSlot } from '../src/types/campDayPlan';
import { dayPlanActivityLabels, shiftDayPlan } from '../src/utils/timetableWorkspace';

const S = (id: string, start: string, end: string, activity: string, place: string): ExcitingSlot => ({ id, start, end, activity, place });
const base = (p: string): ExcitingSlot[] => [S(`${p}1`, '09:20', '10:00', '포인트 경매', '각 반 강의실'), S(`${p}2`, '11:30', '12:30', 'Lunch', '식당'), S(`${p}3`, '12:30', '13:10', '버스 이동', '버스')];
// J28 처럼 코스 셋이 그룹·날짜만 바꿔 돈다 (id 는 칸마다 다르다)
const A = (p: string) => [...base(p), S(`${p}a`, '13:10', '14:40', '박물관은 살아있다', '박물관은 살아있다'), S(`${p}b`, '14:40', '15:50', '런닝맨', '런닝맨'), S(`${p}c`, '15:50', '16:30', '기념품샵 · 집결', '런닝맨 기념품샵 → 로비')];
const B = (p: string) => [...base(p), S(`${p}a`, '13:10', '16:10', '항공우주 박물관 관람', '항공우주 박물관')];
const C = (p: string) => [...base(p), S(`${p}a`, '12:40', '15:00', '바운스 슈퍼파크', '바운스 슈퍼파크 (B1)'), S(`${p}b`, '15:30', '16:50', '테마파크툰 관람', '테마파크툰')];

const fresh = (): CampDayPlan => ({
  sets: [
    {
      id: 'ss', name: 'Spring · Summer', groups: ['spring', 'summer'],
      days: {
        '2026-08-01': { kind: 'exciting', slotsByGroup: { spring: A('x1'), summer: B('x2') } },
        '2026-08-02': { kind: 'regular' },
        '2026-08-06': { kind: 'exciting', slotsByGroup: { spring: C('x3'), summer: A('x4') } },
        '2026-08-12': { kind: 'exciting', slotsByGroup: { spring: B('x5'), summer: C('x6') } },
      },
    },
    {
      id: 'aw', name: 'Autumn · Winter', groups: ['autumn', 'winter'],
      days: {
        '2026-07-31': { kind: 'exciting', slotsByGroup: { autumn: B('y1'), winter: C('y2') } },
        '2026-08-01': { kind: 'regular' },
        '2026-08-05': { kind: 'outdoor', note: '야외', slots: A('y3') },
      },
    },
  ],
});
const G = ['Spring', 'Summer', 'Autumn', 'Winter'];

describe('익사이팅 코스', () => {
  it('같은 활동표끼리 묶어 코스를 제안 — 이름은 현장 장소', () => {
    const list = EC.suggestCourses(fresh(), G);
    expect(list.map((x) => x.name).sort()).toEqual(['바운스 슈퍼파크 · 테마파크툰', '박물관은 살아있다 · 런닝맨', '항공우주 박물관'].sort());
    const a = list.find((x) => x.name.startsWith('박물관'))!;
    // 8/1 spring · 8/6 summer · 8/5 autumn·winter(공통)
    expect(a.cells.length).toBe(4);
    expect(list.reduce((n, x) => n + x.cells.length, 0)).toBe(10);
  });

  it('코스로 묶기 → 칸은 코스, 저장하면 slotsByGroup 에 옮겨 적힌다', () => {
    const p = fresh();
    const r = EC.applySuggestions(p, G);
    expect(r).toEqual({ created: 3, linked: 10 });
    expect(p.courses!.length).toBe(3);
    const st = EC.cellState(p, '2026-08-06', 'Summer');
    expect(st.type).toBe('course');
    expect(EC.cellState(p, '2026-08-02', 'Spring')).toEqual({ type: 'off', kind: 'regular' });
    expect(EC.cellState(p, '2026-08-05', 'Spring').type).toBe('off'); // 8/5 는 Spring 세트에 없음
    const saved = cleanDayPlan(p);
    const e = saved.sets[0].days['2026-08-06'];
    const course = saved.courses!.find((c) => c.id === e.courseByGroup!.summer)!;
    expect(course.name).toBe('박물관은 살아있다 · 런닝맨');
    expect(e.slotsByGroup!.summer.map((s) => s.activity)).toEqual(course.slots.map((s) => s.activity));
    // 옛 방식으로 읽어도(코스 모름) 같은 활동표
    expect(excitingSlotsFor(e, 'Summer').map((s) => s.place)).toEqual(course.slots.map((s) => s.place));
    expect(excitingSlotAt(e, 14 * 60, 'summer')!.activity).toBe('박물관은 살아있다');
    expect(excitingCourseFor(e, 'Summer', saved.courses)!.id).toBe(course.id);
    // 다시 정리해도 같다 (저장 → 불러오기 → 저장)
    expect(JSON.stringify(cleanDayPlan(saved))).toBe(JSON.stringify(saved));
  });

  it('코스를 고치면 그 코스를 쓰는 모든 칸이 바뀐다', () => {
    const p = fresh();
    EC.applySuggestions(p, G);
    const id = p.courses!.find((c) => c.name === '항공우주 박물관')!.id;
    EC.editCourse(p, id, (c) => (c.slots[3].end = '16:00'));
    const saved = cleanDayPlan(p);
    const used = EC.courseUsage(saved, id);
    expect(used).toEqual([
      { date: '2026-07-31', group: 'autumn' },
      { date: '2026-08-01', group: 'summer' },
      { date: '2026-08-12', group: 'spring' },
    ]);
    used.forEach(({ date, group }) => {
      const set = saved.sets.find((s) => s.groups.includes(group))!;
      expect(set.days[date].slotsByGroup![group].find((s) => s.activity === '항공우주 박물관 관람')!.end).toBe('16:00');
    });
  });

  it('칸 바꾸기 · 비우기 · 이 칸만 직접 고치기', () => {
    const p = fresh();
    EC.applySuggestions(p, G);
    const [a, b] = p.courses!;
    EC.assignCourse(p, '2026-08-01', 'Spring', b.id);
    expect((EC.cellState(p, '2026-08-01', 'Spring') as { course: { id: string } }).course.id).toBe(b.id);
    EC.assignCourse(p, '2026-08-01', 'Spring', null);
    expect(EC.cellState(p, '2026-08-01', 'Spring').type).toBe('empty');
    EC.assignCourse(p, '2026-08-01', 'Spring', a.id);
    EC.editCellSlots(p, '2026-08-01', 'Spring', (xs) => xs.map((x) => (x.activity === 'Lunch' ? { ...x, place: '도시락' } : x)));
    const st = EC.cellState(p, '2026-08-01', 'Spring');
    expect(st.type).toBe('own');
    // 코스는 그대로
    expect(p.courses!.find((c) => c.id === a.id)!.slots.find((s) => s.activity === 'Lunch')!.place).toBe('식당');
    const saved = cleanDayPlan(p);
    expect(saved.sets[0].days['2026-08-01'].courseByGroup?.spring).toBeUndefined();
    expect(saved.sets[0].days['2026-08-01'].slotsByGroup!.spring.find((s) => s.activity === 'Lunch')!.place).toBe('도시락');
  });

  it('코스를 지우면 쓰던 칸은 활동표를 지닌 채 직접 입력이 된다', () => {
    const p = fresh();
    EC.applySuggestions(p, G);
    const id = p.courses!.find((c) => c.name === '항공우주 박물관')!.id;
    expect(EC.deleteCourse(p, id)).toBe(3);
    expect(p.courses!.length).toBe(2);
    const st = EC.cellState(p, '2026-07-31', 'Autumn');
    expect(st.type).toBe('own');
    expect(EC.cellSlots(p, '2026-07-31', 'Autumn').some((s) => s.place === '항공우주 박물관')).toBe(true);
    // 다시 묶으면 하나로 돌아온다
    expect(EC.applySuggestions(p, G)).toEqual({ created: 1, linked: 3 });
  });

  it('직접 칸 → 코스로 저장하면 똑같은 칸도 함께 이어진다 · 이미 있는 코스와 같으면 그 코스로', () => {
    const p = fresh();
    const id = EC.saveCellAsCourse(p, '2026-08-01', 'Summer', '', G);
    expect(p.courses![0].name).toBe('항공우주 박물관');
    expect(EC.courseUsage(p, id).length).toBe(3);
    const s = EC.suggestCourses(p, G);
    expect(s.length).toBe(2);
    expect(s.every((x) => !x.courseId)).toBe(true);
    // 코스와 같은 활동표를 직접 넣은 칸 → 그 코스에 잇자고 제안
    EC.detachCell(p, '2026-08-12', 'Spring');
    const again = EC.suggestCourses(p, G).find((x) => x.courseId === id)!;
    expect(again.cells).toEqual([{ date: '2026-08-12', group: 'spring' }]);
  });

  it('몇 줄만 다른 활동표는 변형으로 — 기본은 묶지 않는다 · 메모만 있는 칸은 장소 이름 코스', () => {
    const p = fresh();
    const v = A('z1');
    v[0] = { ...v[0], note: '용돈 2만원' };
    p.sets[1].days['2026-08-11'] = { kind: 'exciting', slotsByGroup: { winter: v } };
    p.sets[1].days['2026-08-12'] = { kind: 'outdoor', note: '레고랜드' };
    const list = EC.suggestCourses(p, G);
    const variant = list.find((x) => x.cells.some((c) => c.date === '2026-08-11'))!;
    expect(variant.variantOf).toEqual({ name: '박물관은 살아있다 · 런닝맨', diff: 1 });
    expect(variant.name).toBe('박물관은 살아있다 · 런닝맨 (Winter)');
    const lego = list.find((x) => x.name === '레고랜드')!;
    expect(lego.slots).toEqual([]);
    expect(lego.cells).toEqual([{ date: '2026-08-12', group: 'autumn' }, { date: '2026-08-12', group: 'winter' }]);
    expect(EC.applySuggestions(p, G)).toEqual({ created: 4, linked: 12 });
    expect(EC.cellState(p, '2026-08-11', 'Winter').type).toBe('own');
    expect(EC.cellState(p, '2026-08-12', 'Winter').type).toBe('course');
    // 고른 것만, 고친 이름으로
    const q = fresh();
    const key = EC.suggestCourses(q, G).find((x) => x.name === '항공우주 박물관')!.key;
    expect(EC.applySuggestions(q, G, { [key]: '항공우주' })).toEqual({ created: 1, linked: 3 });
    expect(q.courses!.map((c) => c.name)).toEqual(['항공우주']);
  });

  it('날짜 옮기기·활동 이름 목록에 코스가 남는다', () => {
    const p = fresh();
    EC.applySuggestions(p, G);
    expect(shiftDayPlan(p, 7).courses!.length).toBe(3);
    const labels = dayPlanActivityLabels(cleanDayPlan(p));
    expect(labels.includes('테마파크툰 관람')).toBe(true);
  });

  it('없는 코스를 가리키는 칸은 저장 때 걸러진다', () => {
    const p = fresh();
    p.sets[0].days['2026-08-01'].courseByGroup = { spring: 'nope' };
    const saved = cleanDayPlan(p);
    expect(saved.sets[0].days['2026-08-01'].courseByGroup).toBeUndefined();
    expect(saved.courses).toBeUndefined();
    expect(saved.sets[0].days['2026-08-01'].slotsByGroup!.spring.length).toBe(6);
  });
});
