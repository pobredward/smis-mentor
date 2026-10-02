/**
 * 원어민 레슨플랜 샘플 — 작성할 때 옆에 띄워 보는 완성본 (web·mobile 공용, 읽기 전용)
 *
 * - 과목마다 하나: Speaking(Speak 3) · Reading(Clue 2) · Writing(Right 3) — 모두 Bc 합본, J28 Summer 일정
 * - 실제 엔진으로 만든다 → 편집 화면과 똑같이 보이고, 밀기·이어하기·쉬는 날이 어떻게 보이는지 그대로 보인다
 * - tips: 그날 무슨 일이 있었고 어떤 버튼을 눌렀는지 (💡)
 * - 교재 본문은 옮기지 않는다 — 단원 번호 · 쪽 · 활동 설명만
 */
import type { DayPlanSet } from '../types/campDayPlan';
import type { EslBookUnits, LessonPlanDoc, PlanItem } from '../types/lessonPlanDoc';
import type { LessonPlanContext } from '../services/lessonPlanDoc';
import { mergeWithPrevious, pushLane, setSkip } from './lessonPlanEngine';

export type SampleKey = 'speaking' | 'reading' | 'writing';

export interface LessonPlanSampleTip {
  date: string;
  /** 이 반 탭에서만 (없으면 모든 반) */
  classKey?: string;
  text: string;
}

export interface LessonPlanSample {
  key: SampleKey;
  label: string;
  intro: string;
  plan: LessonPlanDoc;
  /** 반 → 수업 시간 (J28 Summer 정규 시간표) */
  times: Record<string, string>;
  tips: LessonPlanSampleTip[];
}

// ── 샘플 캠프 — J28 Spring · Summer 일정 (실제) ─────────────────────

const days: DayPlanSet['days'] = {};
const put = (kind: 'orientation' | 'regular' | 'steam' | 'exciting' | 'final' | 'checkout', ...dates: string[]) =>
  dates.forEach((d) => { days[d] = { kind }; });
put('orientation', '2026-07-26');
put('regular', '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10');
put('steam', '2026-07-31', '2026-08-05', '2026-08-11');
put('exciting', '2026-08-01', '2026-08-06', '2026-08-12');
put('final', '2026-08-13');
put('checkout', '2026-08-14');

export const SAMPLE_CAMP = {
  campCode: 'J28',
  group: 'Summer',
  start: '2026-07-26',
  end: '2026-08-14',
  set: { id: 'sample', name: 'Spring · Summer', groups: ['spring', 'summer'], days } as DayPlanSet,
};

/** 샘플을 편집 화면에 띄울 때 쓰는 캠프 정보 (교재 목록은 Firestore 에서 읽은 것) */
export function sampleContext(catalog: EslBookUnits | null | undefined): LessonPlanContext {
  return {
    jobCodeId: 'sample',
    campCode: SAMPLE_CAMP.campCode,
    start: SAMPLE_CAMP.start,
    end: SAMPLE_CAMP.end,
    settings: { dayPlan: { sets: [SAMPLE_CAMP.set] } } as LessonPlanContext['settings'],
    eslBooks: { codes: {} },
    catalog: catalog ?? { books: {}, bundles: {} },
    regularByGroup: {},
  };
}

// ── 만들기 ──────────────────────────────────────────────────────────

type BookSpec = [units: number[] | null, part: string, text: string];

function makePlan(key: SampleKey, subject: string, bookTitle: string, classCodes: string[], orientation: string, final: string, book: BookSpec[], activity: string[]): LessonPlanDoc {
  const items: PlanItem[] = book.map(([units, part, text], i) => ({
    id: `sample-${key}-b${i + 1}`,
    ...(units?.length ? { units } : {}),
    ...(part ? { part } : {}),
    ...(text ? { text } : {}),
  }));
  return {
    id: `sample-${key}`,
    userId: 'sample',
    userName: 'Sample teacher',
    jobCodeId: 'sample',
    campCode: SAMPLE_CAMP.campCode,
    group: SAMPLE_CAMP.group,
    subject,
    bookTitle,
    bookCodes: ['Bc'],
    classCodes,
    orientation,
    final,
    book: items,
    activity: activity.map((text, i) => ({ id: `sample-${key}-a${i + 1}`, text })),
    status: 'approved',
  };
}

function buildReading(): LessonPlanSample {
  let plan = makePlan('reading', 'Reading', 'Clue 2', ['J07'],
    'Name tags & self-introductions · class rules poster · book tour: find 3 unit titles you like',
    'Final test (U1–U8 words + one short reading) · review games · class photo',
    [
      [[1], '', 'Vocabulary match · read the story · main idea (SB p.7–10)'],
      [[2], '', 'Cause & effect chart: what we do → what happens to the Earth'],
      [[3], '', 'Sequencing: story map (first · next · then · finally)'],
      [[4], '', 'Read · find 5 details on a trip map'],
      [[5], '', 'Recipe math: double and halve the amounts'],
      [[6], '', 'Compare & contrast: counting with 10 vs 12'],
      [[7], '', 'Sequencing: why the kiwi has no wings (4-picture strip)'],
      [[8], '', 'Finding details: sea lion fact file'],
      [null, '', 'Review all units · Final test prep (U1–U8 word quiz)'],
    ],
    [
      'Word Tennis — garden, soil, earthworm, hole (two teams volley words)',
      'Pictionary — Earth, electricity, turn off, light',
      'Treasure hunt — 6 word cards hidden in the room (map, treasure, dig, rock…)',
      'Hot Seat — vacation, iceberg, island, curious',
      'Recipe relay — teams fix a recipe card (equal, multiply, flour)',
      'Dozen hunt — find things that come in 12s · Bingo with U6 words',
      'Charades — brave, complain, insect, forest',
      'Simon Says — sea lion tricks (clap, bark, catch)',
      'Board Race — U1–U8 words · Final test practice',
    ]);
  // 7/30 이야기가 길어져 액티비티만 못 함 → 액티비티만 밀기
  plan = pushLane(plan, 'activity', plan.activity[3].id, 'push', 'J07', 'Story ran long');
  // U4 를 다 못 끝냄 → 다음 수업에 이어서
  plan = pushLane(plan, 'book', plan.book[3].id, 'continue', 'J07', 'Finish the trip map · WB p.8–9');
  // 8/3 선생님이 아픔 → 그날 수업 없음
  plan = setSkip(plan, ['J07'], '2026-08-03', 'Sick day');
  return {
    key: 'reading',
    label: 'Reading · Clue 2',
    intro: 'Clue 2 for J07 (J28 Summer). Look at the 💡 notes: a lesson that ran long, an unfinished unit and a sick day — and how the rest of the plan moved by itself.',
    plan,
    times: { J07: '09:20–10:50' },
    tips: [
      { date: '2026-07-26', text: 'Orientation and Final are one line each — no units.' },
      { date: '2026-07-27', text: 'Pick units from the camp book. "p.42" opens that page of the camp book.' },
      { date: '2026-07-28', text: 'Review fills in by itself from the last lesson. Type your own review in the book cell if you want something else.' },
      { date: '2026-07-30', text: 'The story ran long, so the game didn’t happen: ⋯ → Push the activity back. The book stayed where it was.' },
      { date: '2026-08-02', text: 'U4 wasn’t finished: ⋯ → Continue next lesson. U5 and everything after moved back one lesson.' },
      { date: '2026-08-03', text: 'Teacher was sick: ⋯ → No class this day. Every lesson after it moved back by itself.' },
      { date: '2026-08-10', text: 'Rule: the last lesson is review + Final test prep.' },
      { date: '2026-08-13', text: 'Rule: Final Test Day = review, English activity and photo time.' },
    ],
  };
}

function buildSpeaking(): LessonPlanSample {
  let plan = makePlan('speaking', 'Speaking', 'Speak 3', ['J07'],
    'Name game ("I’m Mina and I’m creative") · class rules · speaking buddies',
    'Final speaking test (1-minute talk on a U1–U5 topic) · review games · class photo',
    [
      [[1], 'Part 1', 'Personality words · model dialogue'],
      [[1], 'Part 2', 'Short answers about classmates (He’s … and …)'],
      [[2], 'Part 1', 'Dream-job words · listen to the model speech'],
      [[2], 'Part 2', 'Write and give a 1-minute dream-job speech'],
      [[3], 'Part 1', '"Have you ever…?" · "Yes, I have / No, I haven’t"'],
      [[3], 'Part 2', 'Tell one experience: when · where · how it felt'],
      [[4], 'Part 1', 'Place words · describe a picture together'],
      [[4], 'Part 2', 'Describe a place photo in 30 seconds'],
      [[5], 'Part 1', 'Shapes, materials, patterns'],
      [[5], 'Part 2', 'Describe an object without naming it'],
      [null, '', 'Review all units · Final speaking test practice'],
    ],
    [
      'Find someone who… — personality bingo (honest, shy, creative)',
      'Hot Seat — guess the classmate from 3 personality words',
      'Charades — jobs (astronaut, chef, interpreter, musician)',
      'Speech gallery — small groups, 1 star + 1 wish for each speaker',
      'Survey walk — collect 5 "Yes, I have" answers',
      'Two Truths and a Lie — experiences',
      'Pictionary — hill, river, palm tree, countryside',
      'Mystery bag — describe what you feel (shape, material, pattern)',
      'Review games (U1–U5) · Final test practice in pairs',
      'Speech show — 3 volunteers give their best talk',
    ]);
  // 8/4 캠프 행사로 수업 없음 → 뒤가 밀림 → U5 Part 2 를 Part 1 과 같은 날에 (따라잡기)
  plan = setSkip(plan, ['J07'], '2026-08-04', 'Camp event (swimming)');
  plan = mergeWithPrevious(plan, 'book', plan.book[9].id, 'J07');
  return {
    key: 'speaking',
    label: 'Speaking · Speak 3',
    intro: 'Speak 3 for J07 (J28 Summer). The camp book has 8 units (fewer than 12), so each unit takes two days (Part 1 · Part 2) and U6–U8 don’t fit — that’s OK. One camp event day was caught up by doing two parts together.',
    plan,
    times: { J07: '11:00–12:30' },
    tips: [
      { date: '2026-07-27', text: 'Rule: a book with fewer than 12 units → one unit over two days (Part 1 · Part 2).' },
      { date: '2026-08-04', text: 'Camp event: ⋯ → No class this day. Everything after moved back one lesson.' },
      { date: '2026-08-09', text: 'To catch up: U5 Part 2 → ⋯ → Do it together with the previous lesson. Both parts on one day, and the plan fits again.' },
      { date: '2026-08-10', text: 'Rule: the last lesson is review + Final test prep.' },
    ],
  };
}

function buildWriting(): LessonPlanSample {
  let plan = makePlan('writing', 'Writing', 'Right 3', ['J07', 'J08'],
    'Self-introductions · "my favorite place" quick write · notebook set-up',
    'Final writing test (one paragraph on a U1–U5 topic) · writing gallery · class photo',
    [
      [[1], 'Part 1', 'Warm-up · model text · brainstorm (word web)'],
      [[1], 'Part 2', 'Draft · checklist (would like to · its) · share'],
      [[2], 'Part 1', 'Warm-up · model text · class chart'],
      [[2], 'Part 2', 'Draft · passive voice check · share'],
      [[3], 'Part 1', 'Model story · feelings words · story map'],
      [[3], 'Part 2', 'Draft · so ~ that sentences · share'],
      [[4], 'Part 1', 'Model text · neighborhood map'],
      [[4], 'Part 2', 'Draft · prepositions check · share'],
      [[5], 'Part 1', 'Model text · "If I had…" chart'],
      [[5], 'Part 2', 'Draft · conditional sentences check · share'],
      [null, '', 'Review all units · Final writing test prep'],
    ],
    [
      'Landmark quiz — match cities and landmarks',
      'Gallery walk — read a classmate’s paragraph, leave one question',
      'Class survey — favorite class graph (music, science lab, computer lab)',
      'Author’s chair — 3 volunteers read their paragraph',
      'Feelings charades — angry, upset, annoyed, apologize',
      'Apology card swap',
      'Neighborhood map — draw and label (bus stop, pharmacy, library)',
      'Guided tour — give directions with next to / close to',
      'Auction game — spend $1,000 (cost, spend, save, donate)',
      'Charity pitch — 30-second "If I had a lot of money" share',
      'Review games (U1–U5) · writing gallery',
    ]);
  // J08 만 8/2 견학 → J08 만 밀리고, 마지막 복습을 그 반만 앞 수업과 합침
  plan = setSkip(plan, ['J08'], '2026-08-02', 'Field trip (J08 only)');
  plan = mergeWithPrevious(plan, 'book', plan.book[10].id, 'J08');
  plan = mergeWithPrevious(plan, 'activity', plan.activity[10].id, 'J08');
  return {
    key: 'writing',
    label: 'Writing · Right 3',
    intro: 'Right 3 for two classes, J07 and J08 — one plan for both. J07 follows it as written. J08 had a field trip, so open the J08 tab to see how only that class moved.',
    plan,
    times: { J07: '15:10–16:40', J08: '09:20–10:50' },
    tips: [
      { date: '2026-07-27', text: 'Two classes use this book, so there is one plan with a tab for each class (J07 · J08).' },
      { date: '2026-08-02', classKey: 'J07', text: 'Open the J08 tab: J08 was on a field trip today. J07 is not affected.' },
      { date: '2026-08-02', classKey: 'J08', text: 'J08 only: ⋯ → No class this day → Only J08. J07 keeps its plan.' },
      { date: '2026-08-10', classKey: 'J08', text: 'J08 was one lesson short, so the final review was done together with the last unit: Fit into last lesson → Only J08.' },
      { date: '2026-08-10', classKey: 'J07', text: 'Rule: the last lesson is review + Final test prep.' },
    ],
  };
}

let cache: Record<SampleKey, LessonPlanSample> | null = null;

/** 샘플 셋 (한 번만 만든다) */
export function lessonPlanSamples(): Record<SampleKey, LessonPlanSample> {
  if (!cache) cache = { speaking: buildSpeaking(), reading: buildReading(), writing: buildWriting() };
  return cache;
}

export const SAMPLE_KEYS: SampleKey[] = ['speaking', 'reading', 'writing'];

/** 과목(또는 키) → 샘플 — 모르면 Reading */
export function sampleFor(subjectOrKey: string | null | undefined): LessonPlanSample {
  const k = String(subjectOrKey ?? '').trim().toLowerCase();
  const all = lessonPlanSamples();
  return (SAMPLE_KEYS as string[]).includes(k) ? all[k as SampleKey] : all.reading;
}

/** 그 행에 붙는 💡 */
export function sampleTipsFor(sample: LessonPlanSample | null | undefined, date: string | undefined, classKey: string): string[] {
  if (!sample || !date) return [];
  return sample.tips.filter((t) => t.date === date && (!t.classKey || t.classKey === classKey)).map((t) => t.text);
}
