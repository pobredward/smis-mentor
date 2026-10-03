/**
 * 지금 이 학생이 어디 있는지 — 일정표(무슨 Day) + 시간표(몇 교시·강의실) / 익사이팅 활동표(장소)
 *
 * 환자 최초보고에서 "일과중" 을 고르면 위치를 자동으로 채운다.
 * web·mobile 이 같은 규칙을 쓰도록 여기 한 곳에만 둔다.
 */
import {
  applyClassInfo,
  findSubject,
  isSameGroup,
  sortBlocks,
  type CampTimetable,
  type DerivedGroup,
  type TimetableCommonValues,
} from '../types/campTimetable';
import {
  dayCategory,
  daySetForGroup,
  excitingSlotAt,
  findDayKind,
  hhmmToMinutes,
  isActivityDayKind,
  localYmd,
  type CampDayPlan,
} from '../types/campDayPlan';
import { resolveTimetable } from '../data/timetablePresets';

export interface WhereaboutsInput {
  campCode: string;
  jobCodeId: string;
  dayPlan: CampDayPlan | null | undefined;
  timetables: CampTimetable[];
  groups: DerivedGroup[];
  timetableCommon?: Record<string, TimetableCommonValues>;
  classInfo?: Record<string, { className?: string; classroom?: string }>;
}

export interface Whereabouts {
  date: string;
  /** "Regular Day" / "Exciting Day" … */
  dayLabel: string;
  groupName: string;
  /** 지금 하는 일 — 과목·활동·식사 (시간표 밖이면 없음) */
  activity?: string;
  /** 장소 — 강의실 호수·익사이팅 장소 */
  place?: string;
  /** 그 칸의 시간 "13:00~15:00" */
  time?: string;
  /** 환자 기록에 넣을 한 줄 — "Regular Day · Speaking · 444호" */
  text: string;
}

/** "443" → "443호", 이미 글자가 붙은 값은 그대로 */
export function roomLabel(room: string | undefined): string | undefined {
  const r = (room ?? '').trim();
  if (!r) return undefined;
  return /^\d{1,5}$/.test(r) ? `${r}호` : r;
}

/**
 * @param classNumber 학생 반번호 (J01-03 처럼 뒤에 번호가 붙어 있어도 앞 3자리를 쓴다)
 * @param now         기준 시각 (기본: 지금)
 */
export function studentWhereabouts(
  input: WhereaboutsInput,
  student: { classNumber?: string; group?: string },
  now: Date = new Date()
): Whereabouts | null {
  const classCode = (student.classNumber ?? '').substring(0, 3);
  const group = input.groups.find((g) => classCode && g.classCodes.includes(classCode))
    ?? input.groups.find((g) => isSameGroup(g.name, student.group));
  if (!group) return null;

  const date = localYmd(now);
  const minutes = now.getHours() * 60 + now.getMinutes();
  const set = daySetForGroup(input.dayPlan, group.name);
  const entry = set?.days[date];
  if (!entry) return null;
  const dayLabel = findDayKind(entry.kind)?.short ?? '';
  const base = { date, dayLabel, groupName: group.name };
  const line = (...parts: Array<string | undefined>) => parts.filter(Boolean).join(' · ');

  if (isActivityDayKind(entry.kind)) {
    const slot = excitingSlotAt(entry, minutes, group.name, input.dayPlan?.courses);
    if (!slot) return { ...base, text: dayLabel };
    return {
      ...base,
      activity: slot.activity || undefined,
      place: slot.place || undefined,
      time: `${slot.start}~${slot.end}`,
      text: line(dayLabel, slot.activity, slot.place),
    };
  }

  const category = dayCategory(set, date, input.campCode);
  const table = resolveTimetable({
    timetables: input.timetables,
    groups: input.groups,
    category,
    groupName: group.name,
    campCode: input.campCode,
    jobCodeId: input.jobCodeId,
    common: input.timetableCommon,
    date,
  });
  if (!table || table.layout === 'date') return { ...base, text: dayLabel };
  const classes = applyClassInfo(table.classes ?? [], input.classInfo);

  for (const block of sortBlocks(table.blocks ?? [], 'time')) {
    const idx = (block.times ?? []).findIndex((t) => {
      const a = hhmmToMinutes(t.start);
      const b = hhmmToMinutes(t.end);
      return a !== null && b !== null && a <= minutes && minutes < b;
    });
    if (idx < 0) continue;
    const time = `${block.times![idx].start}~${block.times![idx].end}`;
    if (block.kind === 'shared') {
      const activity = (block.label ?? '').trim() || undefined;
      return { ...base, activity, time, text: line(dayLabel, activity) };
    }
    const cell = block.cells?.[classCode];
    if (!cell) return { ...base, time, text: dayLabel };
    const spec = findSubject(table.subjects, cell.subject);
    const classroom = classes.find((c) => c.classCode === classCode)?.classroom;
    // 1~2교시 세트: 짝(원어민·Pattern)이 먼저 오는 칸이면 순서를 뒤집는다
    const partnerTurn = cell.partnerFirst ? idx === 0 : idx === 1;
    let activity: string | undefined;
    let place: string | undefined;
    if (cell.texts?.length) {
      activity = cell.texts[idx]?.trim() || cell.texts[0]?.trim() || undefined;
      place = roomLabel(cell.room ?? classroom);
    } else if (partnerTurn && spec && spec.partner !== 'none') {
      activity = spec.partner === 'pattern' ? (spec.partnerLabel || 'Pattern') : cell.subject;
      place = roomLabel(cell.partnerRoom ?? spec.partnerRoom ?? cell.room ?? spec.room ?? classroom);
    } else {
      activity = cell.subject;
      place = roomLabel(cell.room ?? spec?.room ?? classroom);
    }
    return { ...base, activity, place, time, text: line(dayLabel, activity, place) };
  }
  return { ...base, text: dayLabel };
}
