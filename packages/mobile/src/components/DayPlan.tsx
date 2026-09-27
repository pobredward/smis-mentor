/**
 * 시간표 탭의 '전체'(일정표)·'익사이팅' 화면과 관리자 일정표 편집기 — web 의 DayPlan.tsx 와 같은 동작.
 * 데이터: campSettings/{campCode}.dayPlan (shared/types/campDayPlan.ts)
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  DAY_KINDS,
  L,
  calendarWeeks,
  dayKindMini,
  excitingDates,
  findDayKind,
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

export function ExcitingDayList({ set, focusDate, onFocusLayout }: {
  set: DayPlanSet | undefined;
  focusDate?: string | null;
  /** 누른 날짜 카드의 y (목록 안 기준) — 부모가 그 위치로 스크롤 */
  onFocusLayout?: (y: number) => void;
}) {
  const dates = excitingDates(set);
  const today = localYmd(new Date());
  if (!dates.length) return <Text style={s.muted}>{L('schedule.noExcitingDays')}</Text>;
  return (
    <View style={{ gap: 10 }}>
      {dates.map((date) => {
        const entry = set!.days[date];
        const focused = date === focusDate;
        return (
          <View
            key={date}
            style={[s.exCard, focused && s.exCardFocus]}
            onLayout={focused && onFocusLayout ? (e) => onFocusLayout(e.nativeEvent.layout.y) : undefined}
          >
            <View style={s.exHead}>
              <Text style={s.exDate}>{monthDayLabel(date)}</Text>
              <Text style={s.exWeek}>{weekdayOf(date)}</Text>
              <Text style={s.exKind}>Exciting Day</Text>
              {date === today && <Text style={s.todayBadge}>{L('schedule.today')}</Text>}
            </View>
            {!!entry.note && <Text style={s.exNote}>{entry.note}</Text>}
            {entry.slots?.length ? (
              entry.slots.map((x) => (
                <View key={x.id} style={s.slotRow}>
                  <Text style={s.slotTime}>{x.start}~{x.end}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.slotActivity}>{x.activity}</Text>
                    {!!x.place && <Text style={s.slotPlace}>📍 {x.place}</Text>}
                    {!!x.note && <Text style={s.slotNote}>{x.note}</Text>}
                  </View>
                </View>
              ))
            ) : (
              <Text style={[s.muted, { paddingVertical: 14 }]}>{L('schedule.noActivities')}</Text>
            )}
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
  const setSlots = (date: string, fn: (slots: ExcitingSlot[]) => ExcitingSlot[]) =>
    update((p) => {
      const e = p.sets[idx].days[date];
      if (e) e.slots = fn(e.slots ?? []);
    });

  const save = async () => {
    const bad = plan.sets.some((x) => Object.values(x.days).some((e) => (e.slots ?? []).some((sl) => (sl.start && !HHMM.test(sl.start)) || (sl.end && !HHMM.test(sl.end)))));
    if (bad) { Alert.alert(L('common.saveFailed'), 'HH:MM (09:30)'); return; }
    setSaving(true);
    try {
      const saved = await saveCampDayPlan(db, campCode, plan, actorName);
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
              const others = exciting.filter((d) => d !== date && set.days[d]?.slots?.length);
              return (
                <View key={date} style={s.exEditCard}>
                  <View style={s.exHead}>
                    <Text style={s.exDate}>{monthDayLabel(date)}</Text>
                    <Text style={s.exWeek}>{weekdayOf(date)}</Text>
                  </View>
                  {others.length > 0 && (
                    <View style={[s.chipWrap, { marginBottom: 6 }]}>
                      <Text style={s.hint}>{L('schedule.copySlotsFrom')}:</Text>
                      {others.map((d) => (
                        <TouchableOpacity key={d} style={s.chip} onPress={() => setSlots(date, () => (set.days[d]?.slots ?? []).map((x) => ({ ...x, id: newId() })))}>
                          <Text style={s.chipText}>{monthDayLabel(d)}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <TextInput value={entry.note ?? ''} onChangeText={(t) => update((p) => (p.sets[idx].days[date].note = t))}
                    placeholder={L('schedule.memo')} placeholderTextColor="#9ca3af" style={[s.input, { marginBottom: 6 }]} />
                  {(entry.slots ?? []).map((x, si) => (
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

  exCard: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, overflow: 'hidden' },
  exCardFocus: { borderColor: '#fbbf24', borderWidth: 2 },
  exHead: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fefcc4', paddingHorizontal: 12, paddingVertical: 8 },
  exDate: { fontSize: 14, fontWeight: '800', color: '#111827' },
  exWeek: { fontSize: 11, color: '#6b7280' },
  exKind: { fontSize: 11, fontWeight: '700', color: '#374151' },
  todayBadge: { marginLeft: 'auto', backgroundColor: '#2563eb', color: '#fff', fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  exNote: { fontSize: 12, color: '#4b5563', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  slotRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f9fafb' },
  slotTime: { width: 84, fontSize: 12, color: '#6b7280', fontVariant: ['tabular-nums'] },
  slotActivity: { fontSize: 13, fontWeight: '600', color: '#111827' },
  slotPlace: { fontSize: 12, color: '#374151', marginTop: 2 },
  slotNote: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

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
