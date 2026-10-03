/**
 * 시간표 탭의 '전체'(일정표)·'익사이팅' 화면 — web 의 DayPlan.tsx 와 같은 동작.
 * (일정표 편집은 시간표 통합 편집기의 [일정표] 탭 — timetable-editor/DayPlanTab.tsx, 익사이팅 코스 배정은 [익사이팅] 탭 — ExcitingTab.tsx)
 * 데이터: campSettings/{campCode}.dayPlan (shared/types/campDayPlan.ts)
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import {
  L,
  calendarWeeks,
  dayKindMini,
  excitingCourseFor,
  excitingDates,
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

export function DayPlanCalendar({ set, campCode, startMs, endMs, onPickDate }: {
  set: DayPlanSet | undefined;
  campCode: string;
  startMs: number | null;
  endMs: number | null;
  onPickDate: (date: string) => void;
}) {
  const weeks = useMemo(
    () => calendarWeeks(startMs ? new Date(startMs) : null, endMs ? new Date(endMs) : null),
    [startMs, endMs]
  );
  const today = localYmd(new Date());
  if (!weeks.length) return <Text style={s.muted}>{L('schedule.campDatesMissing')}</Text>;
  return (
    <View>
      <View style={s.row}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={[s.cell, s.weekHead]}><Text style={s.weekHeadText}>{w}</Text></View>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={s.row}>
          {week.map((date, di) => {
            if (!date) return <View key={di} style={s.cell} />;
            const entry = set?.days[date];
            const spec = findDayKind(entry?.kind);
            const isToday = date === today;
            return (
              <TouchableOpacity
                key={date}
                style={[s.cell, s.dayCell, isToday && s.todayCell]}
                disabled={!spec}
                onPress={() => onPickDate(date)}
                activeOpacity={0.7}
              >
                <Text style={[s.dateText, isToday && s.todayText]}>{monthDayLabel(date)}</Text>
                <View style={[s.kindBox, { backgroundColor: spec?.color ?? '#fff' }]}>
                  <Text style={s.kindText} numberOfLines={2}>{dayKindMini(entry?.kind, campCode)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
      <Text style={s.hint}>{L('schedule.dayPlanHint')}</Text>
    </View>
  );
}

// ─── 보기: 익사이팅 활동표 ─────────────────────────────────────────────

/** 익사이팅 칸 배경 — 현장은 익사이팅 색, 식사·이동·숙소는 시간표의 공통 줄처럼 회색, 강의실 활동은 흰색 (web 과 같은 규칙) */
function excitingSlotColor(x: { activity: string; place: string }): string {
  const t = `${x.activity} ${x.place}`;
  if (/식사|식당|버스|숙소|취침|샤워/.test(t)) return '#f3f4f6';
  if (/강의실/.test(t)) return '#ffffff';
  return '#fefcc4';
}

export function ExcitingDayList({ set, courses, focusDate, onFocusLayout, groupName, guidedLabels, onOpenGuide, nowMinutes }: {
  set: DayPlanSet | undefined;
  /** 캠프 코스 (dayPlan.courses) — 그 그룹이 그날 고른 코스의 활동표 · 이름 */
  courses?: ExcitingCourse[] | null;
  groupName?: string | null;
  /** 세부페이지(칸 설명)가 있는 활동 이름 (guideKeyOf 값) — 누르면 세부페이지로 */
  guidedLabels?: Set<string>;
  onOpenGuide?: (label: string) => void;
  focusDate?: string | null;
  /** 누른 날짜 표의 y (목록 안 기준) — 부모가 그 위치로 스크롤 */
  onFocusLayout?: (y: number) => void;
  /** 오늘이 익사이팅 데이면 지금 칸을 강조 (시간표와 같은 표시) */
  nowMinutes?: number | null;
}) {
  const dates = excitingDates(set);
  const today = localYmd(new Date());
  if (!dates.length) return <Text style={s.muted}>{L('schedule.noExcitingDays')}</Text>;
  return (
    <View style={{ gap: 20 }}>
      {dates.map((date) => {
        const entry = set!.days[date];
        const slots = excitingSlotsFor(entry, groupName, courses);
        const course = excitingCourseFor(entry, groupName, courses);
        const note = (entry.note ?? '').trim();
        const focused = date === focusDate;
        const isToday = date === today;
        return (
          <View key={date} onLayout={focused && onFocusLayout ? (e) => onFocusLayout(e.nativeEvent.layout.y) : undefined}>
            {/* 제목 — 시간표 아래 붙는 인문학 표와 같은 모양 */}
            <View style={s.exTitleRow}>
              <Text style={s.exTitle}>{monthDayLabel(date)} ({weekdayOf(date)}) {findDayKind(entry.kind)?.short ?? 'Exciting Day'}</Text>
              {!!course && <Text style={s.exCourse}>{course.name}</Text>}
              {isToday && <Text style={s.todayBadge}>{L('schedule.today')}</Text>}
              {!!note && note !== course?.name.trim() && <Text style={s.exTitleNote}>{entry.note}</Text>}
            </View>
            <View style={s.exTable}>
              <View style={s.exHeadRow}>
                <View style={[s.exHeadCell, { width: 52 }]}><Text style={s.exHeadTime}>{L('schedule.time')}</Text></View>
                <View style={[s.exHeadCell, { flex: 1.3 }]}><Text style={s.exHeadLabel}>{L('schedule.activity')}</Text></View>
                <View style={[s.exHeadCell, { flex: 1, borderRightWidth: 0 }]}><Text style={s.exHeadLabel}>{L('schedule.place')}</Text></View>
              </View>
              {slots.length === 0 && <Text style={[s.muted, { paddingVertical: 20 }]}>{L('schedule.noActivities')}</Text>}
              {slots.map((x) => {
                const a = hhmmToMinutes(x.start);
                const b = hhmmToMinutes(x.end);
                const isNow = isToday && nowMinutes != null && a != null && b != null && a <= nowMinutes && nowMinutes < b;
                const openable = !!onOpenGuide && !!guidedLabels?.has(guideKeyOf(x.activity));
                const bg = excitingSlotColor(x);
                return (
                  <View key={x.id} style={s.exRow}>
                    <View style={[s.exTimeCell, isNow && s.exNowTime]}>
                      <Text style={[s.exTimeStart, isNow && s.exNowText]}>{x.start}</Text>
                      <Text style={[s.exTimeEnd, isNow && { color: '#60a5fa' }]}>{x.end}</Text>
                    </View>
                    <Pressable
                      disabled={!openable}
                      onPress={() => onOpenGuide?.(x.activity)}
                      style={({ pressed }) => [s.exCell, { flex: 1.3, backgroundColor: pressed ? '#eff6ff' : bg }]}
                    >
                      <Text style={s.exActivity}>{x.activity}</Text>
                      {!!x.note && <Text style={s.exNoteText}>{x.note}</Text>}
                    </Pressable>
                    <View style={[s.exCell, { flex: 1, borderRightWidth: 0, backgroundColor: bg }]}>
                      <Text style={s.exPlace}>{x.place}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}


const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3, marginBottom: 3 },
  cell: { flex: 1 },
  weekHead: { backgroundColor: '#fcd98a', borderRadius: 5, paddingVertical: 3, alignItems: 'center' },
  weekHeadText: { fontSize: 9, fontWeight: '700', color: '#1f2937' },
  dayCell: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 5, overflow: 'hidden', minHeight: 50 },
  todayCell: { borderColor: '#2563eb', borderWidth: 2 },
  dateText: { fontSize: 10, textAlign: 'center', color: '#374151', paddingVertical: 2, backgroundColor: '#fff' },
  todayText: { backgroundColor: '#2563eb', color: '#fff', fontWeight: '700' },
  kindBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 1, paddingVertical: 3 },
  kindText: { fontSize: 9.5, fontWeight: '600', color: '#1f2937', textAlign: 'center' },
  hint: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  muted: { fontSize: 12, color: '#9ca3af', textAlign: 'center', paddingVertical: 30 },

  exTitleRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  exTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  exTitleNote: { fontSize: 11, color: '#6b7280' },
  exCourse: { fontSize: 13, fontWeight: '800', color: '#b45309' },
  exTable: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden' },
  exHeadRow: { flexDirection: 'row', backgroundColor: '#f9fafb' },
  exHeadCell: { borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#e5e7eb', borderBottomColor: '#d1d5db', paddingVertical: 4, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center' },
  exHeadTime: { fontSize: 10, color: '#6b7280', fontWeight: '500' },
  exHeadLabel: { fontSize: 11, fontWeight: '600', color: '#111827' },
  exRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#d1d5db' },
  exTimeCell: { width: 52, borderRightWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  exTimeStart: { fontSize: 10, color: '#374151', fontWeight: '600', textAlign: 'center', lineHeight: 12 },
  exTimeEnd: { fontSize: 8.5, color: '#9ca3af', textAlign: 'center', lineHeight: 10 },
  exNowTime: { backgroundColor: '#eff6ff' },
  exNowText: { color: '#1d4ed8', fontWeight: '700' },
  exCell: { borderRightWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingVertical: 6 },
  exActivity: { fontSize: 11, fontWeight: '600', color: '#111827', textAlign: 'center', lineHeight: 14 },
  exNoteText: { fontSize: 9.5, color: '#6b7280', textAlign: 'center', lineHeight: 12, marginTop: 2 },
  exPlace: { fontSize: 11, color: '#374151', textAlign: 'center', lineHeight: 14 },
  todayBadge: { marginLeft: 'auto', backgroundColor: '#2563eb', color: '#fff', fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
});
