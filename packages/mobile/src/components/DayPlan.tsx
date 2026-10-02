/**
 * 시간표 탭의 '전체'(일정표)·'익사이팅' 화면과 관리자 일정표 편집기 — web 의 DayPlan.tsx 와 같은 동작.
 * 데이터: campSettings/{campCode}.dayPlan (shared/types/campDayPlan.ts)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, TextInput, Modal, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DAY_KINDS,
  L,
  calendarWeeks,
  dayKindMini,
  excitingDates,
  excitingSlotsFor,
  findDayKind,
  getCampTimetableGuides,
  guideKeyOf,
  hhmmToMinutes,
  updateCampTimetableGuides,
  type TimetableGuide,
  localYmd,
  monthDayLabel,
  normalizeGroupKey,
  saveCampDayPlan,
  type CampDayPlan,
  type DayKind,
  type DayPlanEntry,
  type DayPlanSet,
  type ExcitingSlot,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';
import { GuideEditorPanel } from './GuideEditorPanel';

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

export function ExcitingDayList({ set, focusDate, onFocusLayout, groupName, guidedLabels, onOpenGuide, nowMinutes }: {
  set: DayPlanSet | undefined;
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
        const slots = excitingSlotsFor(entry, groupName);
        const focused = date === focusDate;
        const isToday = date === today;
        return (
          <View key={date} onLayout={focused && onFocusLayout ? (e) => onFocusLayout(e.nativeEvent.layout.y) : undefined}>
            {/* 제목 — 시간표 아래 붙는 인문학 표와 같은 모양 */}
            <View style={s.exTitleRow}>
              <Text style={s.exTitle}>{monthDayLabel(date)} ({weekdayOf(date)}) {findDayKind(entry.kind)?.short ?? 'Exciting Day'}</Text>
              {isToday && <Text style={s.todayBadge}>{L('schedule.today')}</Text>}
              {!!entry.note && <Text style={s.exTitleNote}>{entry.note}</Text>}
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


// ─── 편집 (관리자) ─────────────────────────────────────────────────────

const newId = () => Math.random().toString(36).slice(2, 10);
const HHMM = /^\d{1,2}:\d{2}$/;

export function DayPlanEditor({ campCode, plan: initial, groups, startMs, endMs, initialGroup, actorName, onClose, onSaved }: {
  campCode: string;
  plan: CampDayPlan | null;
  groups: string[];
  startMs: number | null;
  endMs: number | null;
  initialGroup?: string | null;
  actorName: string;
  onClose: () => void;
  onSaved: (plan: CampDayPlan) => void;
}) {
  const [plan, setPlan] = useState<CampDayPlan>(() =>
    initial?.sets?.length
      ? JSON.parse(JSON.stringify({ sets: initial.sets }))
      : { sets: [{ id: newId(), name: groups.join(' · '), groups: groups.map(normalizeGroupKey), days: {} }] }
  );
  const [dirty, setDirty] = useState(false);
  // 익사이팅 활동의 세부페이지 — 시간표 칸 설명과 같은 곳(campSettings.timetableGuides)에 활동 이름으로 저장
  const [guides, setGuidesRaw] = useState<Record<string, TimetableGuide> | null>(null);
  useEffect(() => {
    getCampTimetableGuides(db, campCode).then(setGuidesRaw).catch(() => setGuidesRaw({}));
  }, [campCode]);
  const setGuides = (fn: (prev: Record<string, TimetableGuide>) => Record<string, TimetableGuide>) => {
    setGuidesRaw((prev) => fn(prev ?? {}));
    setDirty(true);
  };
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [idx, setIdx] = useState(() => {
    const key = normalizeGroupKey(initialGroup);
    const i = plan.sets.findIndex((x) => x.groups.includes(key));
    return i >= 0 ? i : 0;
  });
  const set = plan.sets[idx];
  const weeks = useMemo(
    () => calendarWeeks(startMs ? new Date(startMs) : null, endMs ? new Date(endMs) : null),
    [startMs, endMs]
  );

  const update = (fn: (p: CampDayPlan) => void) => {
    setPlan((prev) => {
      const next: CampDayPlan = JSON.parse(JSON.stringify(prev));
      fn(next);
      return next;
    });
    setDirty(true);
  };
  const setDay = (date: string, kind: DayKind | '') =>
    update((p) => {
      const days = p.sets[idx].days;
      if (!kind) delete days[date];
      else days[date] = { ...(days[date] ?? {}), kind } as DayPlanEntry;
    });
  const toggleGroup = (g: string) =>
    update((p) => {
      const key = normalizeGroupKey(g);
      const mine = p.sets[idx];
      if (mine.groups.includes(key)) mine.groups = mine.groups.filter((x) => x !== key);
      else {
        p.sets.forEach((x) => (x.groups = x.groups.filter((y) => y !== key)));
        mine.groups.push(key);
      }
    });
  /** 날짜별로 지금 편집 중인 그룹 ('' = 세트 공통) — 같은 날 그룹마다 가는 곳이 다를 수 있다 */
  const [slotGroup, setSlotGroup] = useState<Record<string, string>>({});
  const slotsOf = (e: DayPlanEntry | undefined, g: string) => (g ? e?.slotsByGroup?.[g] ?? [] : e?.slots ?? []);
  const setSlots = (date: string, fn: (slots: ExcitingSlot[]) => ExcitingSlot[]) =>
    update((p) => {
      const e = p.sets[idx].days[date];
      if (!e) return;
      const g = slotGroup[date] ?? '';
      if (!g) e.slots = fn(e.slots ?? []);
      else {
        const next = fn(e.slotsByGroup?.[g] ?? []);
        e.slotsByGroup = { ...(e.slotsByGroup ?? {}) };
        if (next.length) e.slotsByGroup[g] = next;
        else delete e.slotsByGroup[g];
      }
    });
  const groupName = (key: string) => groups.find((g) => normalizeGroupKey(g) === key) ?? key;

  const save = async () => {
    const bad = plan.sets.some((x) => Object.values(x.days).some((e) => (e.slots ?? []).some((sl) => (sl.start && !HHMM.test(sl.start)) || (sl.end && !HHMM.test(sl.end)))));
    if (bad) { Alert.alert(L('common.saveFailed'), 'HH:MM (09:30)'); return; }
    setSaving(true);
    try {
      const saved = await saveCampDayPlan(db, campCode, plan, actorName);
      if (guides) await updateCampTimetableGuides(db, campCode, guides, actorName);
      setDirty(false);
      onSaved(saved);
    } catch (e) {
      Alert.alert(L('common.saveFailed'), (e as Error)?.message ?? '');
    } finally {
      setSaving(false);
    }
  };
  const close = () => {
    if (!dirty) return onClose();
    Alert.alert(L('schedule.editDayPlan'), L('schedule.discardChanges'), [
      { text: L('common.cancel'), style: 'cancel' },
      { text: L('common.close'), style: 'destructive', onPress: onClose },
    ]);
  };
  const removeSet = () => {
    if (!set || plan.sets.length <= 1) return;
    Alert.alert(L('schedule.deletePlanSet'), L('schedule.deletePlanSetConfirm', { v0: set.name || `#${idx + 1}` }), [
      { text: L('common.cancel'), style: 'cancel' },
      { text: L('common.delete'), style: 'destructive', onPress: () => { update((p) => p.sets.splice(idx, 1)); setIdx(0); } },
    ]);
  };

  const exciting = excitingDates(set);
  /** 이 세트의 익사이팅 활동 이름 (공통·그룹별 모두) — 세부페이지를 붙일 대상 */
  const activityLabels = useMemo(() => {
    const seen = new Map<string, string>();
    excitingDates(set).forEach((d) => {
      const e = set?.days[d];
      [...(e?.slots ?? []), ...Object.values(e?.slotsByGroup ?? {}).flat()].forEach((x) => {
        const k = guideKeyOf(x.activity);
        if (k && !seen.has(k)) seen.set(k, x.activity.trim());
      });
    });
    return [...seen.values()];
  }, [set]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={s.edHead}>
          <Text style={s.edTitle}>{L('schedule.editDayPlan')}</Text>
          <TouchableOpacity onPress={close} style={s.btnGhost}><Text style={s.btnGhostText}>{L('common.cancel')}</Text></TouchableOpacity>
          <TouchableOpacity onPress={save} disabled={saving} style={[s.btnPrimary, saving && { opacity: 0.5 }]}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnPrimaryText}>{L('common.save')}</Text>}
          </TouchableOpacity>
        </View>

        <View style={s.chipWrap}>
          {plan.sets.map((x, i) => (
            <TouchableOpacity key={x.id} onPress={() => setIdx(i)} style={[s.pill, i === idx && s.pillOn]}>
              <Text style={[s.pillText, i === idx && s.pillTextOn]}>{x.name || `#${i + 1}`}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            onPress={() => { update((p) => p.sets.push({ id: newId(), name: '', groups: [], days: JSON.parse(JSON.stringify(set?.days ?? {})) })); setIdx(plan.sets.length); }}
            style={[s.pill, s.pillDashed]}
          >
            <Text style={s.pillText}>+ {L('schedule.addPlanSet')}</Text>
          </TouchableOpacity>
        </View>

        {set && (
          <>
            <View style={s.box}>
              <Text style={s.label}>{L('schedule.planSetName')}</Text>
              <TextInput value={set.name} onChangeText={(t) => update((p) => (p.sets[idx].name = t))} style={s.input} />
              <Text style={[s.label, { marginTop: 8 }]}>{L('schedule.planSetGroups')}</Text>
              <View style={s.chipWrap}>
                {groups.map((g) => {
                  const on = set.groups.includes(normalizeGroupKey(g));
                  return (
                    <TouchableOpacity key={g} onPress={() => toggleGroup(g)} style={[s.chip, on && s.chipOn]}>
                      <Text style={[s.chipText, on && s.chipTextOn]}>{g}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={s.hint}>{L('schedule.planSetGroupsHint')}</Text>
              {plan.sets.length > 1 && (
                <TouchableOpacity onPress={removeSet}><Text style={s.danger}>{L('schedule.deletePlanSet')}</Text></TouchableOpacity>
              )}
            </View>

            <Text style={[s.hint, { marginBottom: 6 }]}>{L('schedule.dayPlanCalendarHint')}</Text>
            <View style={s.row}>
              {WEEKDAYS.map((w) => (
                <View key={w} style={[s.cell, s.weekHead]}><Text style={s.weekHeadText}>{w}</Text></View>
              ))}
            </View>
            {weeks.map((week, wi) => (
              <View key={wi} style={s.row}>
                {week.map((date, di) => {
                  if (!date) return <View key={di} style={s.cell} />;
                  const kind = set.days[date]?.kind;
                  return (
                    <TouchableOpacity key={date} style={[s.cell, s.dayCell]} onPress={() => setPicking(date)}>
                      <Text style={s.dateText}>{monthDayLabel(date)}</Text>
                      <View style={[s.kindBox, { backgroundColor: findDayKind(kind)?.color ?? '#fff' }]}>
                        <Text style={s.kindText} numberOfLines={2}>{kind ? dayKindMini(kind, campCode) : '—'}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}

            <Text style={[s.edTitle, { fontSize: 14, marginTop: 16 }]}>{L('schedule.excitingSlots')}</Text>
            <Text style={s.hint}>{L('schedule.excitingSlotsHint')}</Text>
            {!exciting.length && <Text style={s.muted}>{L('schedule.noExcitingDays')}</Text>}
            {exciting.map((date) => {
              const entry = set.days[date];
              const g = slotGroup[date] ?? '';
              const current = slotsOf(entry, g);
              // 복사해 올 수 있는 활동표 — 다른 날·다른 그룹 것까지
              const sources = exciting.flatMap((d) => [
                ...(set.days[d]?.slots?.length ? [{ d, k: '', label: `${monthDayLabel(d)} · ${L('schedule.slotsCommon')}` }] : []),
                ...Object.keys(set.days[d]?.slotsByGroup ?? {}).map((k) => ({ d, k, label: `${monthDayLabel(d)} · ${groupName(k)}` })),
              ]).filter((x) => !(x.d === date && x.k === g));
              return (
                <View key={date} style={s.exEditCard}>
                  <View style={s.exHead}>
                    <Text style={s.exDate}>{monthDayLabel(date)}</Text>
                    <Text style={s.exWeek}>{weekdayOf(date)}</Text>
                  </View>
                  {set.groups.length > 1 && (
                    <View style={[s.chipWrap, { marginBottom: 2 }]}>
                      {['', ...set.groups].map((k) => {
                        const on = k === g;
                        const own = k ? !!entry.slotsByGroup?.[k]?.length : !!entry.slots?.length;
                        return (
                          <TouchableOpacity key={k || 'common'} onPress={() => setSlotGroup((m) => ({ ...m, [date]: k }))}
                            style={[s.chip, on && { backgroundColor: '#f59e0b', borderColor: '#f59e0b' }]}>
                            <Text style={[s.chipText, on && s.chipTextOn]}>{k ? groupName(k) : L('schedule.slotsCommon')}{own ? ' •' : ''}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  {set.groups.length > 1 && (
                    <Text style={[s.hint, { marginTop: 0 }]}>{g ? L('schedule.slotsGroupHint', { v0: groupName(g) }) : L('schedule.slotsCommonHint')}</Text>
                  )}
                  {sources.length > 0 && (
                    <View style={[s.chipWrap, { marginBottom: 6 }]}>
                      <Text style={s.hint}>{L('schedule.copySlotsFrom')}:</Text>
                      {sources.map((x) => (
                        <TouchableOpacity key={`${x.d}|${x.k}`} style={s.chip} onPress={() => setSlots(date, () => slotsOf(set.days[x.d], x.k).map((y) => ({ ...y, id: newId() })))}>
                          <Text style={s.chipText}>{x.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <TextInput value={entry.note ?? ''} onChangeText={(t) => update((p) => (p.sets[idx].days[date].note = t))}
                    placeholder={L('schedule.memo')} placeholderTextColor="#9ca3af" style={[s.input, { marginBottom: 6 }]} />
                  {current.map((x, si) => (
                    <View key={x.id} style={s.slotEdit}>
                      <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                        <TextInput value={x.start} placeholder="09:00" placeholderTextColor="#9ca3af" keyboardType="numbers-and-punctuation"
                          onChangeText={(t) => setSlots(date, (xs) => xs.map((y, j) => (j === si ? { ...y, start: t } : y)))} style={[s.input, s.timeInput]} />
                        <Text style={s.hint}>~</Text>
                        <TextInput value={x.end} placeholder="10:30" placeholderTextColor="#9ca3af" keyboardType="numbers-and-punctuation"
                          onChangeText={(t) => setSlots(date, (xs) => xs.map((y, j) => (j === si ? { ...y, end: t } : y)))} style={[s.input, s.timeInput]} />
                        <View style={{ flex: 1 }} />
                        <TouchableOpacity onPress={() => setSlots(date, (xs) => xs.filter((_, j) => j !== si))} hitSlop={8}>
                          <Text style={{ color: '#9ca3af', fontSize: 16 }}>✕</Text>
                        </TouchableOpacity>
                      </View>
                      <TextInput value={x.activity} placeholder={L('schedule.excitingPlaceholderActivity')} placeholderTextColor="#9ca3af"
                        onChangeText={(t) => setSlots(date, (xs) => xs.map((y, j) => (j === si ? { ...y, activity: t } : y)))} style={s.input} />
                      <TextInput value={x.place} placeholder={L('schedule.excitingPlaceholderPlace')} placeholderTextColor="#9ca3af"
                        onChangeText={(t) => setSlots(date, (xs) => xs.map((y, j) => (j === si ? { ...y, place: t } : y)))} style={s.input} />
                    </View>
                  ))}
                  <TouchableOpacity onPress={() => setSlots(date, (xs) => {
                    const last = xs[xs.length - 1];
                    return [...xs, { id: newId(), start: last?.end ?? '09:00', end: '', activity: '', place: last?.place ?? '' }];
                  })}>
                    <Text style={s.link}>+ {L('schedule.addSlot')}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
            {/* 활동 세부페이지 — 익사이팅 탭에서 활동을 누르면 뜬다 */}
            {activityLabels.length > 0 && guides && (
              <View style={{ marginTop: 16 }}>
                <Text style={[s.hint, { marginBottom: 6 }]}>{L('schedule.excitingGuideHint')}</Text>
                <GuideEditorPanel campCode={campCode} labels={activityLabels} guides={guides} setGuides={setGuides} />
              </View>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={!!picking} transparent animationType="fade" onRequestClose={() => setPicking(null)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setPicking(null)}>
          <SafeAreaView style={s.sheet} edges={['bottom']}>
            <Text style={s.sheetTitle}>{picking ? `${monthDayLabel(picking)} ${weekdayOf(picking)}` : ''}</Text>
            {[...DAY_KINDS.map((k) => k.key as DayKind | ''), '' as const].map((k) => (
              <TouchableOpacity key={k || 'none'} style={[s.sheetItem, { backgroundColor: findDayKind(k)?.color ?? '#fff' }]}
                onPress={() => { if (picking) setDay(picking, k); setPicking(null); }}>
                <Text style={s.sheetItemText}>{k ? dayKindMini(k, campCode) : '—'}</Text>
              </TouchableOpacity>
            ))}
          </SafeAreaView>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
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
  exHead: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fefcc4', paddingHorizontal: 12, paddingVertical: 8 },
  exDate: { fontSize: 14, fontWeight: '800', color: '#111827' },
  exWeek: { fontSize: 11, color: '#6b7280' },
  todayBadge: { marginLeft: 'auto', backgroundColor: '#2563eb', color: '#fff', fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },

  edHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  edTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#111827' },
  btnGhost: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  btnGhostText: { fontSize: 12, color: '#374151' },
  btnPrimary: { backgroundColor: '#2563eb', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7, minWidth: 52, alignItems: 'center' },
  btnPrimaryText: { fontSize: 12, color: '#fff', fontWeight: '700' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f3f4f6' },
  pillOn: { backgroundColor: '#2563eb' },
  pillDashed: { backgroundColor: '#fff', borderWidth: 1, borderStyle: 'dashed', borderColor: '#d1d5db' },
  pillText: { fontSize: 12, color: '#374151', fontWeight: '500' },
  pillTextOn: { color: '#fff' },
  box: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 10, marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '700', color: '#6b7280', marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: '#111827', backgroundColor: '#fff' },
  timeInput: { width: 70, textAlign: 'center' },
  chip: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#4b5563' },
  chipTextOn: { color: '#fff' },
  danger: { fontSize: 12, color: '#ef4444', marginTop: 6 },
  exEditCard: { borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffef0', borderRadius: 12, padding: 10, marginTop: 8, gap: 6 },
  slotEdit: { gap: 4, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#fef3c7' },
  link: { fontSize: 13, fontWeight: '700', color: '#2563eb', marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 14, gap: 6 },
  sheetTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 4 },
  sheetItem: { borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb' },
  sheetItemText: { fontSize: 14, fontWeight: '600', color: '#111827' },
});
