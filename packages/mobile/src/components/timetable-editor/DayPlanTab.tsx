/**
 * 일정표 탭 — 기존 DayPlanEditor 를 작업 공간 위로 옮긴 것.
 * 세트(이름·그룹·삭제) · 달력(날짜 탭 = 선택, [범위로 선택]) · 아래 고정 바로 Day 종류 일괄 · 날짜 하나면 그날 메모.
 * 익사이팅·야외 날 활동표와 활동 칸 설명은 [익사이팅] 탭(ExcitingTab — 코스 배정)에서 — 여기서는 안내만.
 * 저장은 편집기의 [저장] 하나로 — 여기서는 작업 공간만 고친다.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import {
  DAY_KINDS,
  calendarWeeks,
  dayKindMini,
  daySetForGroup,
  excitingCourses as EC,
  excitingDates,
  findDayKind,
  isActivityDayKind,
  localYmd,
  monthDayLabel,
  normalizeGroupKey,
  timetableWorkspace as W,
  type CampDayPlan,
  type DayKind,
  type DayPlanSet,
} from '@smis-mentor/shared';
import { Btn, C, Chip, Field, Input, Notice, u, type SetWs } from './common';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00`).getDay()];
const newId = () => Math.random().toString(36).slice(2, 10);

/** 저장 전 활동표 시각 검사는 활동표를 고치는 [익사이팅] 탭으로 옮겼다 — 예전 import 를 위해 다시 내보낸다 */
export { dayPlanTimeError } from './ExcitingTab';

export function DayPlanTab({
  top,
  ws,
  setWs,
  groups,
  campCode,
  startMs,
  endMs,
  initialGroup,
  onOpenExciting,
}: {
  top: React.ReactNode;
  ws: W.Workspace;
  setWs: SetWs;
  groups: string[];
  campCode: string;
  startMs: number | null;
  endMs: number | null;
  initialGroup?: string | null;
  /** [익사이팅] 탭으로 (익사이팅·야외 활동은 거기서 코스로 정한다) */
  onOpenExciting: () => void;
}) {
  const plan = ws.cur.dayPlan;
  const defaultId = useRef(`set-${newId()}`);
  /** 일정표가 아직 없으면 모든 그룹이 쓰는 세트 하나로 시작 — 처음 고칠 때 작업 공간에 생긴다 */
  const defaultSet = useMemo<DayPlanSet>(
    () => ({ id: defaultId.current, name: groups.join(' · '), groups: groups.map(normalizeGroupKey), days: {} }),
    [groups]
  );
  const sets = plan?.sets?.length ? plan.sets : [defaultSet];
  const [idx, setIdx] = useState(() => {
    const key = normalizeGroupKey(initialGroup);
    const i = sets.findIndex((x) => x.groups.includes(key));
    return i >= 0 ? i : 0;
  });
  const set = sets[Math.min(idx, sets.length - 1)];

  const edit = (fn: (p: CampDayPlan) => CampDayPlan | void, key?: string) =>
    setWs((w) =>
      W.editDayPlan(
        w,
        (p) => {
          if (!p.sets?.length) p.sets = [JSON.parse(JSON.stringify(defaultSet))];
          return fn(p) ?? p;
        },
        key
      )
    );
  const mine = (p: CampDayPlan) => p.sets.find((x) => x.id === set.id);

  const weeks = useMemo(() => calendarWeeks(startMs ? new Date(startMs) : null, endMs ? new Date(endMs) : null), [startMs, endMs]);
  const allDates = useMemo(() => weeks.flat().filter((d): d is string => !!d), [weeks]);
  const today = localYmd(new Date());

  // ── 날짜 고르기 ─────────────────────────────────────────────────
  const [sel, setSel] = useState<string[]>([]);
  const [range, setRange] = useState(false);
  const [anchor, setAnchor] = useState<string | null>(null);
  useEffect(() => {
    setSel([]);
    setAnchor(null);
  }, [set.id]);
  const tapDate = (d: string) => {
    if (range) {
      if (!anchor) {
        setAnchor(d);
        setSel([d]);
        return;
      }
      const [a, b] = anchor < d ? [anchor, d] : [d, anchor];
      setSel(allDates.filter((x) => x >= a && x <= b));
      setAnchor(null);
      return;
    }
    setSel((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  };
  const applyKind = (kind: DayKind | null) => edit((p) => W.setDayKinds(p, set.id, sel, kind));

  // ── 세트 ────────────────────────────────────────────────────────
  const toggleGroup = (g: string) =>
    edit((p) => {
      const key = normalizeGroupKey(g);
      const me = mine(p);
      if (!me) return;
      if (me.groups.includes(key)) me.groups = me.groups.filter((x) => x !== key);
      else {
        p.sets.forEach((x) => (x.groups = x.groups.filter((y) => y !== key)));
        me.groups.push(key);
      }
    });
  const addSet = () => {
    edit((p) => {
      p.sets.push({ id: `set-${newId()}`, name: '', groups: [], days: JSON.parse(JSON.stringify(mine(p)?.days ?? {})) });
    });
    setIdx(sets.length);
  };
  const removeSet = () => {
    if (sets.length <= 1) return;
    Alert.alert('세트 삭제', `"${set.name || `#${idx + 1}`}" 세트를 지울까요? 저장을 눌러야 반영됩니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          edit((p) => {
            p.sets = p.sets.filter((x) => x.id !== set.id);
          });
          setIdx(0);
        },
      },
    ]);
  };

  // ── 익사이팅·야외 날 — 달력 칸에 고른 코스 이름 ─────────────────────
  const exciting = excitingDates(set);
  /** 이 세트를 쓰는 그룹 (세트에 그룹이 없으면 이 세트로 떨어지는 그룹) */
  const members = useMemo(
    () => (set.groups.length ? set.groups : groups.map(normalizeGroupKey).filter((k) => daySetForGroup(plan, k)?.id === set.id)),
    [set, groups, plan]
  );
  /** 그날 세트 그룹들이 고른 코스 이름 (중복 제거) — 없으면 활동 수 */
  const activityText = (date: string): string => {
    const e = set.days[date];
    if (!e || !isActivityDayKind(e.kind)) return '';
    const names = [
      ...new Set(members.map((k) => EC.courseById(plan, e.courseByGroup?.[k])?.name).filter((x): x is string => !!x)),
    ];
    if (names.length) return names.join(' / ');
    const n = (e.slots?.length ?? 0) + Object.values(e.slotsByGroup ?? {}).reduce((m, l) => m + l.length, 0);
    return n ? `활동 ${n}` : '';
  };

  const one = sel.length === 1 ? sel[0] : null;
  const oneEntry = one ? set.days[one] : undefined;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: sel.length ? 150 : 48 }} keyboardShouldPersistTaps="handled">
        {top}

        {/* 세트 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 6 }}>
          {sets.map((x, i) => (
            <Chip key={x.id} label={x.name || `#${i + 1}`} on={x.id === set.id} onPress={() => setIdx(i)} />
          ))}
          <Chip label="+ 세트" dashed onPress={addSet} />
        </ScrollView>

        <View style={u.card}>
          <Field label="세트 이름">
            <Input value={set.name} onChangeText={(v) => edit((p) => void (mine(p) && (mine(p)!.name = v)), `setName:${set.id}`)} placeholder="예: Spring · Summer" />
          </Field>
          <Field label="이 세트를 쓰는 그룹" hint="한 그룹은 한 세트에만 들어갑니다. 다른 세트에 있던 그룹을 고르면 그쪽에서 빠집니다.">
            <View style={u.wrap}>
              {groups.map((g) => (
                <Chip key={g} label={g} on={set.groups.includes(normalizeGroupKey(g))} onPress={() => toggleGroup(g)} />
              ))}
            </View>
          </Field>
          {sets.length > 1 && (
            <TouchableOpacity onPress={removeSet}>
              <Text style={{ fontSize: 12, color: C.red }}>세트 삭제</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 달력 */}
        <View style={[u.row, { marginBottom: 6 }]}>
          <Text style={[u.hint, { flex: 1, marginTop: 0 }]}>날짜를 눌러 고르고, 아래 바에서 Day 종류를 정하세요.</Text>
          <Chip
            label={range ? (anchor ? '끝 날짜를 누르세요' : '범위로 선택 중') : '범위로 선택'}
            on={range}
            onPress={() => {
              setRange((v) => !v);
              setAnchor(null);
            }}
          />
        </View>
        {!weeks.length ? (
          <Notice tone="amber" text="캠프 기간(시작·종료일)이 없어 달력을 그릴 수 없습니다. 캠프 코드 설정에서 기간을 넣어 주세요." />
        ) : (
          <View>
            <View style={s.row}>
              {WEEKDAYS.map((w) => (
                <View key={w} style={[s.cell, s.weekHead]}>
                  <Text style={s.weekHeadText}>{w}</Text>
                </View>
              ))}
            </View>
            {weeks.map((week, wi) => (
              <View key={wi} style={s.row}>
                {week.map((date, di) => {
                  if (!date) return <View key={di} style={s.cell} />;
                  const entry = set.days[date];
                  const spec = findDayKind(entry?.kind);
                  const on = sel.includes(date);
                  const act = activityText(date);
                  return (
                    <TouchableOpacity key={date} style={[s.cell, s.dayCell, date === today && s.todayCell, on && s.selCell]} onPress={() => tapDate(date)}>
                      <Text style={[s.dateText, on && s.selDateText]}>{monthDayLabel(date)}</Text>
                      <View style={[s.kindBox, { backgroundColor: spec?.color ?? '#fff' }]}>
                        <Text style={s.kindText} numberOfLines={act ? 1 : 2}>
                          {entry ? dayKindMini(entry.kind, campCode) : '—'}
                        </Text>
                        {!!act && (
                          <Text style={s.actText} numberOfLines={1}>
                            {act}
                          </Text>
                        )}
                      </View>
                      {!!entry?.note && <View style={s.noteDot} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        {/* 날짜 하나 — 그날 메모 */}
        {one && (
          <View style={[u.card, { marginTop: 10 }]}>
            <Text style={s.oneTitle}>
              {monthDayLabel(one)} ({weekdayOf(one)}) {oneEntry ? `· ${findDayKind(oneEntry.kind)?.short ?? ''}` : ''}
            </Text>
            {oneEntry ? (
              <Input
                value={oneEntry.note ?? ''}
                onChangeText={(v) =>
                  edit((p) => {
                    const e = mine(p)?.days[one];
                    if (e) e.note = v;
                  }, `dayNote:${one}`)
                }
                placeholder="그날 메모 (예: 우천 시 실내)"
                style={{ marginTop: 6 }}
              />
            ) : (
              <Text style={u.hint}>Day 종류를 먼저 고르면 메모를 넣을 수 있습니다.</Text>
            )}
          </View>
        )}

        {/* 익사이팅·야외 활동 — [익사이팅] 탭에서 코스로 */}
        <View style={s.exNotice}>
          <Text style={s.exNoticeText}>
            익사이팅·야외 활동은 [익사이팅] 탭에서 코스로 정합니다
            {exciting.length ? ` — 이 세트의 활동 날 ${exciting.length}일` : ''}
          </Text>
          <Btn label="익사이팅 탭으로" kind="soft" icon="arrow-forward" onPress={onOpenExciting} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
        </View>
      </ScrollView>

      {sel.length > 0 && (
        <View style={s.bar}>
          <View style={[u.row, { marginBottom: 6 }]}>
            <Text style={s.barTitle}>{sel.length}일 선택</Text>
            <View style={{ flex: 1 }} />
            <Btn label="선택 해제" onPress={() => { setSel([]); setAnchor(null); }} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
            {DAY_KINDS.map((k) => (
              <TouchableOpacity key={k.key} style={[s.kindBtn, { backgroundColor: k.color }]} onPress={() => applyKind(k.key)}>
                <Text style={s.kindBtnText}>{dayKindMini(k.key, campCode)}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[s.kindBtn, { backgroundColor: '#fff', borderStyle: 'dashed' }]} onPress={() => applyKind(null)}>
              <Text style={[s.kindBtnText, { color: C.muted }]}>비우기</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 3, marginBottom: 3 },
  cell: { flex: 1 },
  weekHead: { backgroundColor: '#fcd98a', borderRadius: 5, paddingVertical: 3, alignItems: 'center' },
  weekHeadText: { fontSize: 9, fontWeight: '700', color: '#1f2937' },
  dayCell: { borderWidth: 1, borderColor: C.line, borderRadius: 5, overflow: 'hidden', minHeight: 52 },
  todayCell: { borderColor: '#93c5fd' },
  selCell: { borderColor: C.blue, borderWidth: 2 },
  dateText: { fontSize: 10, textAlign: 'center', color: C.text2, paddingVertical: 2, backgroundColor: '#fff' },
  selDateText: { backgroundColor: C.blue, color: '#fff', fontWeight: '700' },
  kindBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 1, paddingVertical: 3 },
  kindText: { fontSize: 9.5, fontWeight: '600', color: '#1f2937', textAlign: 'center' },
  noteDot: { position: 'absolute', right: 3, bottom: 3, width: 5, height: 5, borderRadius: 3, backgroundColor: C.orange },
  oneTitle: { fontSize: 13, fontWeight: '700', color: C.text },
  actText: { fontSize: 8.5, color: C.amberText, textAlign: 'center', marginTop: 1 },

  exNotice: { borderWidth: 1, borderColor: C.amberLine, backgroundColor: C.amberBg, borderRadius: 10, padding: 10, marginTop: 14 },
  exNoticeText: { fontSize: 12, color: C.amberText, lineHeight: 17 },

  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  barTitle: { fontSize: 13, fontWeight: '700', color: C.text },
  kindBtn: { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  kindBtnText: { fontSize: 12, fontWeight: '700', color: '#1f2937' },
});
