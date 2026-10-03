'use client';

/**
 * 시간표 탭의 '전체'(일정표)·'익사이팅' 화면.
 * (관리자 일정표 편집은 통합 편집기 timetable-editor/DayPlanTab 으로 옮겼다)
 * 데이터: campSettings/{campCode}.dayPlan (shared/types/campDayPlan.ts)
 */
import { useMemo, useState } from 'react';
import {
  L,
  calendarWeeks,
  dayKindLabel,
  dayKindMini,
  excitingDates,
  excitingCourseFor,
  excitingSlotsFor,
  findDayKind,
  guideKeyOf,
  hhmmToMinutes,
  localYmd,
  monthDayLabel,
  type DayPlanSet,
  type ExcitingCourse,
} from '@smis-mentor/shared';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00`).getDay()];

// ─── 보기: 일정표 ──────────────────────────────────────────────────────

export function DayPlanCalendar({
  set,
  campCode,
  start,
  end,
  onPickDate,
}: {
  set: DayPlanSet | undefined;
  campCode: string;
  start: Date | null;
  end: Date | null;
  onPickDate: (date: string) => void;
}) {
  const weeks = useMemo(() => calendarWeeks(start, end), [start, end]);
  const today = localYmd(new Date());
  if (!weeks.length) return <p className="py-10 text-center text-xs text-gray-400">{L('schedule.campDatesMissing')}</p>;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="rounded-md bg-amber-200/80 py-1 text-center text-[10px] font-semibold text-gray-800 sm:text-xs">
            {w}
          </div>
        ))}
        {weeks.flat().map((date, i) => {
          if (!date) return <div key={`x${i}`} />;
          const entry = set?.days[date];
          const spec = findDayKind(entry?.kind);
          const isToday = date === today;
          return (
            <button
              key={date}
              type="button"
              disabled={!spec}
              onClick={() => onPickDate(date)}
              className={`flex min-h-[64px] flex-col items-stretch overflow-hidden rounded-md border text-center transition-shadow sm:min-h-[76px] ${
                isToday ? 'border-blue-500 ring-2 ring-blue-400' : 'border-gray-200'
              } ${spec ? 'hover:shadow-md' : 'cursor-default'}`}
            >
              <span className={`py-0.5 text-[10px] tabular-nums sm:text-xs ${isToday ? 'bg-blue-600 font-bold text-white' : 'bg-white text-gray-700'}`}>
                {monthDayLabel(date)}
              </span>
              <span
                className="flex flex-1 items-center justify-center px-0.5 py-1 text-[10px] font-medium leading-tight text-gray-800 sm:text-xs"
                style={{ backgroundColor: spec?.color ?? '#fff' }}
              >
                <span className="whitespace-pre-line sm:hidden">{dayKindMini(entry?.kind, campCode)}</span>
                <span className="hidden whitespace-pre-line sm:inline">{dayKindLabel(entry?.kind, campCode)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-gray-400">{L('schedule.dayPlanHint')}</p>
    </div>
  );
}

// ─── 보기: 익사이팅 데이 활동표 ────────────────────────────────────────

/** 익사이팅 칸 배경 — 현장은 익사이팅 색, 식사·이동·숙소는 시간표의 공통 줄처럼 회색, 강의실 활동은 흰색 */
export function excitingSlotColor(s: { activity: string; place: string }): string {
  const t = `${s.activity} ${s.place}`;
  if (/식사|식당|버스|숙소|취침|샤워/.test(t)) return '#f3f4f6';
  if (/강의실/.test(t)) return '#ffffff';
  return '#fefcc4';
}

export function ExcitingDayList({ set, groupName, courses, guidedLabels, onOpenGuide, nowMinutes }: {
  set: DayPlanSet | undefined;
  groupName?: string | null;
  /** 일정표의 코스 (장소별 하루 일정) — 그 그룹이 고른 코스 이름을 제목 옆에 */
  courses?: ExcitingCourse[] | null;
  /** 세부페이지(칸 설명)가 있는 활동 이름 (guideKeyOf 값) — 누르면 세부페이지로 */
  guidedLabels?: Set<string>;
  onOpenGuide?: (label: string) => void;
  /** 오늘이 익사이팅 데이면 지금 칸을 강조 (시간표와 같은 표시) */
  nowMinutes?: number | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const dates = excitingDates(set);
  const today = localYmd(new Date());
  if (!dates.length) return <p className="py-10 text-center text-xs text-gray-400">{L('schedule.noExcitingDays')}</p>;
  return (
    <div className="space-y-6">
      {dates.map((date) => {
        const entry = set!.days[date];
        const slots = excitingSlotsFor(entry, groupName, courses);
        const course = excitingCourseFor(entry, groupName, courses);
        const isToday = date === today;
        return (
          <section key={date} id={`exciting-${date}`} className="scroll-mt-4">
            {/* 제목 — 시간표 아래 붙는 인문학 표와 같은 모양 */}
            <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
              <h3 className="text-sm font-semibold text-gray-900">
                {monthDayLabel(date)} ({weekdayOf(date)}) {findDayKind(entry.kind)?.short ?? 'Exciting Day'}
              </h3>
              {isToday && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">{L('schedule.today')}</span>}
              {course && <span className="text-xs font-semibold text-amber-700">{course.name}</span>}
              {entry.note && entry.note !== course?.name && <span className="text-xs text-gray-500">{entry.note}</span>}
            </div>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full table-fixed border-collapse bg-white text-[11px] leading-tight">
                <colgroup>
                  <col className="w-[76px]" />
                  <col />
                  <col className="w-[34%]" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="border-b border-r border-gray-200 bg-gray-50 px-1 py-1 text-[10px] font-medium text-gray-500">{L('schedule.time')}</th>
                    <th className="border-x border-b border-gray-200 bg-gray-50 px-1 py-1 text-xs font-semibold text-gray-900">{L('schedule.activity')}</th>
                    <th className="border-b border-l border-gray-200 bg-gray-50 px-1 py-1 text-xs font-semibold text-gray-900">{L('schedule.place')}</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-2 py-8 text-center text-xs text-gray-400">{L('schedule.noActivities')}</td>
                    </tr>
                  )}
                  {slots.map((s) => {
                    const a = hhmmToMinutes(s.start);
                    const b = hhmmToMinutes(s.end);
                    const isNow = isToday && nowMinutes != null && a != null && b != null && a <= nowMinutes && nowMinutes < b;
                    const openable = !!onOpenGuide && !!guidedLabels?.has(guideKeyOf(s.activity));
                    const hovered = openable && hover === s.id;
                    return (
                      <tr key={s.id}>
                        <td className={`border-b border-r border-gray-200 border-b-gray-300 px-0.5 py-1.5 text-center text-[10px] tabular-nums ${
                          isNow ? 'bg-blue-50 font-semibold text-blue-700' : 'bg-white text-gray-500'
                        }`}>
                          {s.start}~{s.end}
                          {isNow && <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 align-middle" />}
                        </td>
                        <td
                          onClick={openable ? () => onOpenGuide!(s.activity) : undefined}
                          onMouseEnter={openable ? () => setHover(s.id) : undefined}
                          onMouseLeave={openable ? () => setHover(null) : undefined}
                          role={openable ? 'button' : undefined}
                          title={openable ? L('schedule.tapToSeeTheDescription') : undefined}
                          className={`border-x border-b border-gray-200 border-b-gray-300 px-1 py-1.5 text-center text-[11px] font-medium text-gray-900 ${openable ? 'cursor-pointer' : ''} ${hovered ? 'bg-blue-50/60' : ''}`}
                          style={{ backgroundColor: hovered ? undefined : excitingSlotColor(s) }}
                        >
                          {s.activity}
                          {s.note && <span className="mt-0.5 block text-[10px] font-normal leading-snug text-gray-500">{s.note}</span>}
                        </td>
                        <td className="border-b border-l border-gray-200 border-b-gray-300 px-1 py-1.5 text-center text-[11px] text-gray-700"
                          style={{ backgroundColor: excitingSlotColor(s) }}>
                          {s.place}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
