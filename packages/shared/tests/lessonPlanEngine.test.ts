import { describe, expect, it } from './_expect';
import type { DayPlanSet } from '../src/types/campDayPlan';
import type { LessonPlanDoc, PlanItem } from '../src/types/lessonPlanDoc';
import {
  autoFillLanes, cellsLabel, classTimesFor, clearSkip, layoutPlan, mergeWithPrevious, planBooksFor, planCalendar,
  pinItem, pushLane, removeFiller, removeItem, setExtraDay, setSkip, unitLinks, uncoveredUnits, unmerge,
  planSubjectsOf, syncPlanBook, rowAnchors, lessonCountOf, planDayTitle, classAdjustCount, isEmptyPlan,
  planRowActions, classChangeList, bookResources,
} from '../src/utils/lessonPlanEngine';
import type { CampTimetable } from '../src/types/campTimetable';

// J28 Spring · Summer 일정 (실제 데이터) — 7/26 OT, 정규 11일, 8/13 Final
const days: DayPlanSet['days'] = {};
const put = (kind: string, ...dates: string[]) => dates.forEach((d) => { days[d] = { kind: kind as never }; });
put('orientation', '2026-07-26');
put('regular', '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10');
put('steam', '2026-07-31', '2026-08-05', '2026-08-11');
put('exciting', '2026-08-01', '2026-08-06', '2026-08-12');
put('final', '2026-08-13');
put('checkout', '2026-08-14');
const set: DayPlanSet = { id: 'a', name: 'Spring · Summer', groups: ['spring', 'summer'], days };
const cal = planCalendar('2026-07-26', '2026-08-14', set, 'J28');

const units = Array.from({ length: 20 }, (_, i) => ({ no: i + 1, title: `Unit ${i + 1}`, words: [`w${i + 1}a`, `w${i + 1}b`] }));
const base = (): LessonPlanDoc => {
  const { book, activity } = autoFillLanes(units, Array.from({ length: 16 }, (_, i) => i + 1), 11);
  return {
    id: 'p', userId: 'u', jobCodeId: 'jc', campCode: 'J28', subject: 'Reading', bookTitle: 'Clue 2', bookCodes: ['Bc'],
    classCodes: ['J07', 'J05'], book, activity, status: 'draft',
  };
};
const lessonOn = (p: LessonPlanDoc, cls: string, date: string) => layoutPlan(p, cal, cls).lessons.find((r) => r.day?.date === date)!;
const bookAt = (p: LessonPlanDoc, cls: string, date: string) => cellsLabel(lessonOn(p, cls, date).book);
const actAt = (p: LessonPlanDoc, cls: string, date: string) => cellsLabel(lessonOn(p, cls, date).activity);

describe('lessonPlanEngine — calendar', () => {
  it('Day 01 is the arrival day, weekday and labels', () => {
    expect(cal.length).toBe(20);
    expect(cal[0]).toEqual({ date: '2026-07-26', dayNo: 1, weekday: 'Sun', kind: 'orientation', kindLabel: 'Orientation' });
    expect(cal.find((d) => d.date === '2026-07-31')!.kindLabel).toBe('STEAM Day');
    expect(planCalendar('2026-07-26', '2026-07-27', { ...set, days: { '2026-07-26': { kind: 'steam' } } }, 'S29')[0].kindLabel).toBe('Going-Up Day');
  });

  it('11 lessons on regular days, orientation and final rows fixed', () => {
    const l = layoutPlan(base(), cal, 'J07');
    expect(l.total).toBe(11);
    expect(l.rows.filter((r) => r.type === 'orientation').length).toBe(1);
    expect(l.rows.filter((r) => r.type === 'final').length).toBe(1);
    expect(l.rows.find((r) => r.day?.date === '2026-08-01')!.type).toBe('off');
    expect(l.lessons[0].day!.date).toBe('2026-07-27');
    expect(l.lessons[10].day!.date).toBe('2026-08-10');
  });
});

describe('lessonPlanEngine — auto fill', () => {
  it('more units than lessons: one unit per lesson, last lesson review, the rest uncovered', () => {
    const r = autoFillLanes(units, Array.from({ length: 16 }, (_, i) => i + 1), 11);
    expect(r.book.length).toBe(11);
    expect(r.book[0].units).toEqual([1]);
    expect(r.book[9].units).toEqual([10]);
    expect(r.book[10].text).toBe('Review all units · Final test prep');
    expect(r.uncovered).toEqual([11, 12, 13, 14, 15, 16]);
    expect(r.activity[0].text).toBe('Word Tennis — w1a, w1b');
  });

  it('fewer than 12 units and enough lessons: two days per unit', () => {
    const r = autoFillLanes(units.slice(0, 4), undefined, 11);
    expect(r.book.slice(0, 2).map((b) => b.part)).toEqual(['Part 1', 'Part 2']);
    expect(r.book[7].units).toEqual([4]);
    expect(r.book[8].text).toBe('Review & extension');
    expect(r.book.length).toBe(11);
  });

  it('fewer than 12 units but not enough lessons: still two days per unit, from the front', () => {
    const r = autoFillLanes(units.slice(0, 8), undefined, 11);
    expect(r.book.slice(0, 10).map((b) => `${b.units?.[0]}${b.part === 'Part 1' ? 'a' : 'b'}`)).toEqual(['1a', '1b', '2a', '2b', '3a', '3b', '4a', '4b', '5a', '5b']);
    expect(r.book[10].text).toBe('Review all units · Final test prep');
    expect(r.uncovered).toEqual([6, 7, 8]);
  });

  it('review is the previous lesson unit', () => {
    const l = layoutPlan(base(), cal, 'J07');
    expect(l.lessons[0].review).toBe('');
    expect(l.lessons[1].review).toBe('Review U1');
  });
});

describe('lessonPlanEngine — edge cases', () => {
  it('a whole day off for one class pushes everything for that class only', () => {
    const p = setSkip(base(), ['J07'], '2026-07-28', 'Sports day');
    const j07 = layoutPlan(p, cal, 'J07');
    expect(j07.rows.find((r) => r.day?.date === '2026-07-28')!.type).toBe('skipped');
    expect(j07.rows.find((r) => r.day?.date === '2026-07-28')!.skip!.note).toBe('Sports day');
    expect(bookAt(p, 'J07', '2026-07-29')).toBe('U2');
    expect(j07.overflow.book.length).toBe(1);
    expect(j07.overflow.activity.length).toBe(1);
    expect(bookAt(p, 'J05', '2026-07-29')).toBe('U3');
    expect(clearSkip(p, ['J07'], '2026-07-28').classes!.J07.skips).toEqual([]);
  });

  it('activity not done: only the activity lane moves', () => {
    const p0 = base();
    const second = layoutPlan(p0, cal, 'J07').lessons[1].activity[0].item.id;
    const p = pushLane(p0, 'activity', second, 'push', 'J07');
    expect(actAt(p, 'J07', '2026-07-28')).toBe('—');
    expect(actAt(p, 'J07', '2026-07-29')).toBe(actAt(p0, 'J07', '2026-07-28'));
    expect(bookAt(p, 'J07', '2026-07-29')).toBe('U3');
    expect(actAt(p, 'J05', '2026-07-28')).toBe(actAt(p0, 'J05', '2026-07-28'));
  });

  it('unit not finished: continue tomorrow, later units move, review is not repeated', () => {
    const p0 = base();
    const u3 = p0.book[2].id;
    const p = pushLane(p0, 'book', u3, 'continue', 'all');
    expect(bookAt(p, 'J05', '2026-07-29')).toBe('U3');
    expect(bookAt(p, 'J05', '2026-07-30')).toBe('(cont.) U3');
    expect(lessonOn(p, 'J05', '2026-07-30').review).toBe('');
    expect(bookAt(p, 'J05', '2026-08-02')).toBe('U4');
    expect(lessonOn(p, 'J05', '2026-08-02').review).toBe('Review U3');
    const filler = lessonOn(p, 'J05', '2026-07-30').book[0];
    const back = removeFiller(p, 'book', filler, 'J05');
    expect(bookAt(back, 'J05', '2026-07-30')).toBe('U4');
  });

  it('catch up: two units on one day', () => {
    const p0 = base();
    const p = mergeWithPrevious(p0, 'book', p0.book[4].id, 'J05');
    expect(bookAt(p, 'J05', '2026-07-30')).toBe('U4 + U5');
    expect(bookAt(p, 'J05', '2026-08-02')).toBe('U6');
    expect(bookAt(p, 'J07', '2026-08-02')).toBe('U5');
    expect(bookAt(unmerge(p, 'book', p0.book[4].id, 'J05'), 'J05', '2026-08-02')).toBe('U5');
  });

  it('pinned activity stays on its date when the rest moves', () => {
    const p0 = base();
    const special = p0.activity[5].id;
    let p = pinItem(p0, 'activity', special, '2026-08-04');
    p = setSkip(p, ['J07'], '2026-07-27');
    expect(actAt(p, 'J07', '2026-08-04')).toBe(cellsLabel([{ item: p0.activity[5], source: 'base' }]));
  });

  it('extra class day adds a lesson slot', () => {
    const p = setExtraDay(base(), ['J07'], '2026-08-01', true);
    const l = layoutPlan(p, cal, 'J07');
    expect(l.total).toBe(12);
    expect(l.lessons.find((r) => r.day?.date === '2026-08-01')!.extra).toBe(true);
  });

  it('schedule change: contents re-flow and a stale "no class" is reported', () => {
    let p = setSkip(base(), ['J07'], '2026-07-30');
    const moved = { ...set, days: { ...days, '2026-07-30': { kind: 'exciting' as const }, '2026-08-01': { kind: 'regular' as const } } };
    const cal2 = planCalendar('2026-07-26', '2026-08-14', moved, 'J28');
    const l = layoutPlan(p, cal2, 'J07');
    expect(l.lessons.find((r) => r.day?.date === '2026-08-01')!.lessonNo).toBe(4);
    expect(l.warnings.some((w) => w.includes('7/30'))).toBe(true);
    p = clearSkip(p, ['J07'], '2026-07-30');
    expect(layoutPlan(p, cal2, 'J07').warnings.length).toBe(0);
  });

  it('removing a base item cleans class records that point to it', () => {
    const p0 = base();
    let p = pushLane(p0, 'book', p0.book[1].id, 'push', 'J07');
    p = mergeWithPrevious(p, 'book', p0.book[1].id, 'J05');
    p = removeItem(p, 'book', p0.book[1].id);
    expect(p.classes!.J07.gaps).toEqual([]);
    expect(p.classes!.J05.drops).toEqual([]);
  });

  it('no schedule yet: lessons without dates', () => {
    const l = layoutPlan(base(), [], 'J07');
    expect(l.hasCalendar).toBe(false);
    expect(l.total).toBe(11);
    expect(l.lessons[0].day).toBe(null);
  });

  it('S camp: lesson after an outdoor day gets the outdoor review', () => {
    const sDays = { '2026-07-28': { kind: 'regular' as const }, '2026-07-29': { kind: 'exciting' as const }, '2026-07-30': { kind: 'regular' as const } };
    const sCal = planCalendar('2026-07-28', '2026-07-30', { id: 's', name: 's', groups: [], days: sDays }, 'S29');
    const l = layoutPlan({ ...base(), campCode: 'S29' }, sCal, 'J07');
    expect(l.lessons[1].afterOutdoor).toBe(true);
    expect(l.lessons[1].review.startsWith('Outdoor class review')).toBe(true);
  });
});

describe('lessonPlanEngine — books, times, links', () => {
  it('groups classes by book title, spare books separately', () => {
    const esl = { codes: { Bc: { reading: 'Clue 2' }, Bb: { reading: 'Sense 2' }, Bd: { reading: 'Clue 3' } } };
    const r = planBooksFor([
      { classCode: 'J05', bookCode: 'Bc' }, { classCode: 'J07', bookCode: 'Bc', spareBookCode: 'Bb' }, { classCode: 'J08', bookCode: 'Bd' }, { classCode: 'J06' },
    ], esl, 'Reading');
    expect(r.books.map((b) => [b.bookTitle, b.classKeys])).toEqual([['Clue 2', ['J05', 'J07']], ['Sense 2', ['J07:spare']], ['Clue 3', ['J08']]]);
    expect(r.missing).toEqual(['J06']);
    expect(planBooksFor([], esl, 'Mix').books).toEqual([]);
  });

  it('class times from the regular timetable', () => {
    const t = { blocks: [
      { id: 'a', kind: 'class', times: [{ start: '09:20', end: '10:00' }, { start: '10:10', end: '10:50' }], cells: { J07: { subject: 'Reading' }, J05: { subject: 'Math' } } },
      { id: 'b', kind: 'class', times: [{ start: '13:30', end: '14:10' }, { start: '14:20', end: '15:00' }], cells: { J05: { subject: 'Reading' } } },
    ] } as unknown as CampTimetable;
    expect(classTimesFor(t, 'Reading')).toEqual({ J07: '09:20–10:50', J05: '13:30–15:00' });
  });

  it('unit page links into the camp bundle', () => {
    const catalog = { books: {}, bundles: { Bc: { code: 'Bc', canvaUrl: 'https://www.canva.com/d/x', driveUrl: 'https://drive/x', books: { 'Clue 2': { units: [1, 2], pages: { 1: 42, 2: 46 } } } } } };
    expect(unitLinks(catalog, ['Bc'], 'Clue 2', 2)).toEqual({ page: 46, canva: 'https://www.canva.com/d/x#46', drive: 'https://drive/x' });
    expect(unitLinks(catalog, ['Bc'], 'Clue 2', 9)).toEqual({});
  });

  it('resources: camp book first, then the full book, then files — no duplicates', () => {
    const catalog = {
      books: { 'Right 3': { title: 'Right 3', fullTitle: 'Write Right 3', subject: 'writing' as const, units: [], canvaUrl: 'https://c/book', links: [{ label: 'Answer Key', url: 'https://d/ak' }] } },
      bundles: { Bc: { code: 'Bc', canvaUrl: 'https://c/bc', driveUrl: 'https://d/bc', books: {} }, Bd: { code: 'Bd', canvaUrl: 'https://c/bd', books: {} } },
    };
    expect(bookResources(catalog, 'Right 3', ['Bc', 'Bd']).map((r) => `${r.kind}:${r.label}`)).toEqual([
      'camp:Camp book Bc', 'campPdf:Camp book Bc (PDF)', 'camp:Camp book Bd', 'book:Full book (Write Right 3)', 'file:Answer Key',
    ]);
  });

  it('uncovered units in camp scope', () => {
    const book: PlanItem[] = [{ id: 'a', units: [1] }, { id: 'b', units: [2, 3] }];
    expect(uncoveredUnits({ book }, [1, 2, 3, 4])).toEqual([4]);
  });

  it('Mix teachers plan all three subjects, managers none', () => {
    expect(planSubjectsOf('Reading')).toEqual(['Reading']);
    expect(planSubjectsOf('Mix')).toEqual(['Speaking', 'Reading', 'Writing']);
    expect(planSubjectsOf('Manager')).toEqual([]);
  });

  it('keeps a saved plan in step with class/book changes', () => {
    const p = base();
    const book = { bookKey: 'clue-2', bookTitle: 'Clue 2', subject: 'Reading', bookCodes: ['Bc'], classKeys: ['J07', 'J05'] };
    expect(syncPlanBook(p, book)).toBe(null);
    const moved = syncPlanBook(setSkip(p, ['J05'], '2026-07-28'), { ...book, classKeys: ['J07', 'J11'] }, 'Summer')!;
    expect(moved.classCodes).toEqual(['J07', 'J11']);
    expect(moved.group).toBe('Summer');
    expect(classAdjustCount(moved, 'J05')).toBe(1);
  });
});

describe('lessonPlanEngine — screen helpers', () => {
  it('row anchors skip class-only fillers', () => {
    const p0 = base();
    const p = pushLane(p0, 'book', p0.book[2].id, 'push', 'J07');
    const row = lessonOn(p, 'J07', '2026-07-29');
    expect(row.book[0].source).toBe('class');
    expect(rowAnchors(row.book).first).toBe(undefined);
    const next = lessonOn(p, 'J07', '2026-07-30');
    expect(rowAnchors(next.book).first!.item.id).toBe(p.book[2].id);
  });

  it('counts lessons and titles days', () => {
    expect(lessonCountOf(cal)).toBe(11);
    expect(planDayTitle(cal[3])).toBe('Day 4 · Wed 7/29');
    expect(isEmptyPlan({ book: [], activity: [] })).toBe(true);
  });

  it('row actions are the same list on web and app, and run the edit', () => {
    const p0 = base();
    const row = lessonOn(p0, 'J07', '2026-07-29');
    const acts = planRowActions(p0, row, 'J07', { hasCalendar: true });
    expect(acts.map((a) => a.key)).toEqual(['skip', 'continue', 'push-book', 'merge-book', 'pin-book', 'insert-book', 'push-activity', 'merge-activity', 'pin-activity', 'insert-activity']);
    const push = acts.find((a) => a.key === 'push-activity')!;
    expect(push.scoped).toBe(true);
    const p1 = push.run!(p0, 'J07');
    expect(actAt(p1, 'J07', '2026-07-29')).toBe('—');
    expect(bookAt(p1, 'J07', '2026-07-29')).toBe('U3');
    expect(actAt(p1, 'J05', '2026-07-29')).not.toBe('—');
    const changes = classChangeList(p1, 'J07');
    expect(changes.length).toBe(1);
    const back = changes[0].undo(p1);
    expect(actAt(back, 'J07', '2026-07-29')).toBe(actAt(p0, 'J07', '2026-07-29'));
    const skipped = setSkip(p0, ['J07'], '2026-07-29');
    const sk = layoutPlan(skipped, cal, 'J07').rows.find((r) => r.day?.date === '2026-07-29')!;
    expect(planRowActions(skipped, sk, 'J07', { hasCalendar: true }).map((a) => a.key)).toEqual(['unskip']);
    const off = layoutPlan(p0, cal, 'J07').rows.find((r) => r.day?.date === '2026-07-31')!;
    const extra = planRowActions(p0, off, 'J07', { hasCalendar: true })[0];
    expect(layoutPlan(extra.run!(p0, 'all'), cal, 'J05').total).toBe(12);
  });

  it('after a pushed (blank) book day, the next lesson reviews the last taught unit', () => {
    const p0 = base();
    const p = pushLane(p0, 'book', p0.book[2].id, 'push', 'J07');
    expect(lessonOn(p, 'J07', '2026-07-30').review).toBe('Review U2');
  });
});
