/**
 * [익사이팅] 탭 — 코스(장소별 하루 일정)를 한 번 만들고, 날짜 × 그룹 배정표에서 칸마다 코스만 고른다.
 * 위에서부터: 안내 · 묶기 배너(같은 활동표 칸 → 코스) · 배정표(칸 탭 = 코스 고르기 시트) ·
 * 직접 입력 칸 편집 · 코스 패널(캠프 전체) · 활동 칸 설명.
 * 데이터 도우미는 shared 의 excitingCourses — 쓰기는 모두 W.editDayPlan 안에서, 저장은 편집기의 [저장] 하나로.
 */
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  dayKindMini,
  daySetForGroup,
  excitingCourses as EC,
  guideKeyOf,
  isActivityDayKind,
  monthDayLabel,
  normalizeGroupKey,
  timetableWorkspace as W,
  type CampDayPlan,
  type ExcitingCourse,
  type ExcitingSlot,
} from '@smis-mentor/shared';
import { GuideEditorPanel } from '../GuideEditorPanel';
import { Btn, C, CheckRow, Field, FullModal, IconBtn, Input, Notice, RenameInput, SectionHead, Sheet, TimeInput, u, type SetWs } from './common';

const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];
/** '2026-08-01' → '8/1 (토)' */
const dateLabel = (d: string) => `${monthDayLabel(d)} (${WEEK_KO[new Date(`${d}T00:00:00`).getDay()]})`;
const HHMM = /^\d{1,2}:\d{2}$/;
const badTime = (xs: ExcitingSlot[] | undefined) => (xs ?? []).some((x) => (!!x.start && !HHMM.test(x.start)) || (!!x.end && !HHMM.test(x.end)));

/** 저장 전에 — 활동표(코스 · 직접 입력 칸) 시각이 HH:MM 이 아닌 곳이 있으면 문구 */
export function dayPlanTimeError(plan: CampDayPlan | null | undefined): string | null {
  for (const c of plan?.courses ?? []) {
    if (badTime(c.slots)) return `코스 「${c.name}」 활동 시각을 HH:MM (예: 09:30) 으로 고쳐 주세요.`;
  }
  for (const set of plan?.sets ?? []) {
    for (const [date, e] of Object.entries(set.days ?? {})) {
      if (!isActivityDayKind(e?.kind)) continue;
      if (badTime(e.slots) || Object.values(e.slotsByGroup ?? {}).some(badTime))
        return `익사이팅 ${monthDayLabel(date)} 활동 시각을 HH:MM (예: 09:30) 으로 고쳐 주세요.`;
    }
  }
  return null;
}

const DATE_W = 64;
const COL_W = 110;
const HEAD_H = 30;
const ROW_H = 54;
const PREVIEW_MAX = 8;

type Cell = { date: string; group: string };
const sameCell = (a: Cell | null, b: Cell) => !!a && a.date === b.date && normalizeGroupKey(a.group) === normalizeGroupKey(b.group);

/**
 * 활동 줄 편집 — 시작~끝 · 활동 · 장소 · 메모 · ✕ 와 [+ 활동].
 * 직접 입력 칸은 처음 고칠 때 공통 활동표를 떼어 오며 줄 id 가 새로 생긴다 — 그래서 id 가 없으면 같은 자리 줄을 고치고,
 * 입력 중 칸이 다시 그려져 키보드가 닫히지 않게 그 칸은 자리(index)로 키를 준다 (stableKeys=false).
 */
function SlotRows({
  slots,
  onEdit,
  keyBase,
  stableKeys,
  onCarryGuide,
}: {
  slots: ExcitingSlot[];
  onEdit: (fn: (xs: ExcitingSlot[]) => ExcitingSlot[], key?: string) => void;
  /** 되돌리기 묶음 키 앞부분 (course:${id} / cell:${date}:${group}) */
  keyBase: string;
  stableKeys: boolean;
  onCarryGuide: (from: string, to: string) => void;
}) {
  const at = (xs: ExcitingSlot[], id: string, i: number) => {
    const j = xs.findIndex((y) => y.id === id);
    return j >= 0 ? j : i;
  };
  const patch = (id: string, i: number, p: Partial<ExcitingSlot>, field?: string) =>
    onEdit(
      (xs) => {
        const j = at(xs, id, i);
        return xs.map((y, k) => (k === j ? { ...y, ...p } : y));
      },
      field ? `${keyBase}:${id}:${field}` : undefined
    );
  const remove = (id: string, i: number) =>
    onEdit((xs) => {
      const j = at(xs, id, i);
      return xs.filter((_, k) => k !== j);
    });
  const add = () =>
    onEdit((xs) => {
      const last = xs[xs.length - 1];
      return [...xs, { id: EC.newSlotId(), start: last?.end || '09:00', end: '', activity: '', place: last?.place ?? '' }];
    });
  return (
    <View>
      {!slots.length && <Text style={u.hint}>아직 활동이 없습니다 — [+ 활동] 으로 시간 · 활동 · 장소를 넣으세요.</Text>}
      {slots.map((x, i) => (
        <View key={stableKeys ? x.id : String(i)} style={s.slot}>
          <View style={u.row}>
            <TimeInput value={x.start} allowEmpty onCommit={(v) => patch(x.id, i, { start: v })} />
            <Text style={{ color: C.faint }}>~</Text>
            <TimeInput value={x.end} allowEmpty placeholder="10:30" onCommit={(v) => patch(x.id, i, { end: v })} />
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => remove(x.id, i)} hitSlop={8}>
              <Ionicons name="close" size={18} color={C.faint} />
            </TouchableOpacity>
          </View>
          <RenameInput
            value={x.activity}
            allowEmpty
            placeholder="활동 (예: 런닝맨 체험)"
            onLive={(v) => patch(x.id, i, { activity: v }, 'activity')}
            onDone={onCarryGuide}
          />
          <Input value={x.place} onChangeText={(v) => patch(x.id, i, { place: v }, 'place')} placeholder="장소" />
          <Input value={x.note ?? ''} onChangeText={(v) => patch(x.id, i, { note: v || undefined }, 'note')} placeholder="메모 (활동 아래 작게)" />
        </View>
      ))}
      <TouchableOpacity onPress={add} hitSlop={6}>
        <Text style={s.link}>+ 활동</Text>
      </TouchableOpacity>
    </View>
  );
}

export function ExcitingTab({
  top,
  ws,
  setWs,
  groups,
  campCode,
  onGoPlan,
  onToast,
}: {
  top: React.ReactNode;
  ws: W.Workspace;
  setWs: SetWs;
  groups: string[];
  campCode: string;
  /** [일정표] 탭으로 */
  onGoPlan: () => void;
  onToast: (m: string) => void;
}) {
  const plan = ws.cur.dayPlan;
  const scrollRef = useRef<ScrollView>(null);
  const ownY = useRef(0);
  const panelY = useRef(0);

  const edit = (fn: (p: CampDayPlan) => void, key?: string) =>
    setWs((w) =>
      W.editDayPlan(
        w,
        (p) => {
          fn(p);
        },
        key
      )
    );
  const carryGuide = (from: string, to: string) => setWs((w) => W.carryGuideAfterRename(w, from, to));
  /** 시트가 닫히고 새 칸이 그려진 뒤에 그 자리로 */
  const scrollTo = (y: React.MutableRefObject<number>) =>
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y.current - 8), animated: true }), Platform.OS === 'ios' ? 450 : 250);

  const courses = EC.coursesOf(plan);
  const dates = useMemo(() => EC.activityDates(plan), [plan]);
  /** 활동 날이 하나도 없는 그룹 열은 숨김 */
  const cols = useMemo(() => groups.filter((g) => dates.some((d) => EC.cellState(plan, d, g).type !== 'off')), [groups, dates, plan]);
  const groupName = (key: string) => groups.find((g) => normalizeGroupKey(g) === key) ?? key;
  const cellsText = (cells: Cell[], sep = ' · ') => cells.map((c) => `${monthDayLabel(c.date)} ${groupName(c.group)}`).join(sep);
  const usageCount = useMemo(() => new Map(EC.coursesOf(plan).map((c) => [c.id, EC.courseUsage(plan, c.id).length])), [plan]);

  // ── 코스 패널에서 고른 코스 (없으면 첫 코스) ─────────────────────────
  const [courseId, setCourseId] = useState<string | null>(null);
  const course = EC.courseById(plan, courseId) ?? courses[0];
  const courseIdx = course ? courses.findIndex((c) => c.id === course.id) : -1;
  const usage = course ? EC.courseUsage(plan, course.id) : [];

  // ── 칸 ──────────────────────────────────────────────────────────
  /** 코스 고르기 시트를 연 칸 */
  const [pick, setPick] = useState<Cell | null>(null);
  /** 직접 입력 편집기를 연 칸 */
  const [own, setOwn] = useState<Cell | null>(null);
  const pickState = pick ? EC.cellState(plan, pick.date, pick.group) : null;
  const ownState = own ? EC.cellState(plan, own.date, own.group) : null;
  const ownOpen = !!ownState && ownState.type !== 'off' && ownState.type !== 'course';
  const ownSlots = own ? EC.cellSlots(plan, own.date, own.group) : [];

  const assign = (cell: Cell, id: string | null) => {
    const st = EC.cellState(plan, cell.date, cell.group);
    // 이미 그 코스면 되돌리기 칸만 늘지 않게 그대로 닫는다
    if (!(st.type === 'course' && st.course.id === id)) edit((p) => EC.assignCourse(p, cell.date, cell.group, id));
    setPick(null);
    if (sameCell(own, cell)) setOwn(null);
  };
  /** '직접 입력 (이 칸만)' — 코스 칸이면 코스 활동표를 복사해 떼어 내고 편집기를 연다 */
  const direct = (cell: Cell) => {
    if (EC.cellState(plan, cell.date, cell.group).type === 'course') edit((p) => EC.detachCell(p, cell.date, cell.group));
    setPick(null);
    setOwn(cell);
    scrollTo(ownY);
  };
  const saveOwnAsCourse = () => {
    if (!own) return;
    const cell = own;
    let id = '';
    let n = 0;
    edit((p) => {
      id = EC.saveCellAsCourse(p, cell.date, cell.group, undefined, groups);
      n = id ? EC.courseUsage(p, id).length : 0;
    });
    if (!id) return;
    setCourseId(id);
    setOwn(null);
    onToast(`코스로 저장했습니다 — 같은 활동표 ${n}칸이 이 코스를 씁니다. 저장을 눌러야 반영됩니다`);
    scrollTo(panelY);
  };

  // ── 코스 ────────────────────────────────────────────────────────
  const addCourse = () => {
    let id = '';
    edit((p) => {
      id = EC.addCourse(p);
    });
    if (id) setCourseId(id);
  };
  const duplicate = (id: string) => {
    let next = '';
    edit((p) => {
      next = EC.duplicateCourse(p, id);
    });
    if (!next) return;
    setCourseId(next);
    onToast('코스를 복제했습니다 — 저장을 눌러야 반영됩니다');
  };
  const removeCourse = (c: ExcitingCourse) => {
    const n = usageCount.get(c.id) ?? 0;
    Alert.alert(
      '코스 삭제',
      `「${c.name}」 코스를 지울까요?${n ? `\n이 코스를 고른 ${n}칸은 활동표를 그대로 가진 '직접 입력' 칸이 됩니다.` : ''}`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            edit((p) => {
              EC.deleteCourse(p, c.id);
            });
            setCourseId(null);
            onToast(n ? `코스를 지웠습니다 — ${n}칸은 '직접 입력' 칸이 됐습니다` : '코스를 지웠습니다');
          },
        },
      ]
    );
  };

  // ── 같은 활동표 묶기 ────────────────────────────────────────────
  const suggestions = useMemo(() => EC.suggestCourses(plan, groups), [plan, groups]);
  const mainSugs = suggestions.filter((x) => !x.variantOf);
  const looseCells = suggestions.reduce((n, x) => n + x.cells.length, 0);
  const newCount = mainSugs.filter((x) => !x.courseId).length;
  const linkCells = mainSugs.filter((x) => x.courseId).reduce((n, x) => n + x.cells.length, 0);
  const bundleSummary = newCount
    ? `새 코스 ${newCount}개${linkCells ? `(+ 기존 코스에 잇기 ${linkCells}칸)` : ''}`
    : `기존 코스에 잇기 ${linkCells}칸`;
  const [bundle, setBundle] = useState<Record<string, { on: boolean; name: string }> | null>(null);
  const openBundle = () => setBundle(Object.fromEntries(suggestions.map((x) => [x.key, { on: !x.variantOf, name: x.name }])));
  const bundleOn = bundle ? suggestions.filter((x) => bundle[x.key]?.on) : [];
  const applyBundle = () => {
    if (!bundle || !bundleOn.length) return;
    const choose = Object.fromEntries(bundleOn.map((x) => [x.key, x.courseId ? x.name : bundle[x.key]?.name || x.name]));
    let r = { created: 0, linked: 0 };
    edit((p) => {
      r = EC.applySuggestions(p, groups, choose);
    });
    setBundle(null);
    onToast(`코스 ${r.created}개를 만들고 ${r.linked}칸을 이었습니다 — 저장을 눌러야 반영됩니다`);
  };

  // ── 활동 칸 설명 ────────────────────────────────────────────────
  const activityLabels = useMemo(() => {
    const seen = new Map<string, string>();
    W.dayPlanActivityLabels(plan).forEach((l) => {
      const k = guideKeyOf(l);
      if (k && !seen.has(k)) seen.set(k, l.trim());
    });
    return [...seen.values()];
  }, [plan]);

  // ── 배정표 칸 ───────────────────────────────────────────────────
  const renderCell = (date: string, g: string) => {
    const st = EC.cellState(plan, date, g);
    if (st.type === 'off') {
      return (
        <View key={g} style={[s.mCell, s.mOff]}>
          <Text style={s.mOffText} numberOfLines={1}>
            {st.kind ? dayKindMini(st.kind, campCode) : '—'}
          </Text>
        </View>
      );
    }
    const entry = daySetForGroup(plan, g)?.days[date];
    const cell = { date, group: g };
    const n = st.type === 'own' || st.type === 'common' ? st.slots.length : 0;
    const label = st.type === 'course' ? st.course.name : st.type === 'own' ? `직접 입력 ${n}` : st.type === 'common' ? `공통 직접 ${n}` : '—';
    return (
      <TouchableOpacity
        key={g}
        style={[
          s.mCell,
          { backgroundColor: st.type === 'course' ? st.course.color || C.bg2 : '#fff' },
          st.type === 'course' && st.course.id === course?.id && s.mLit,
          ownOpen && sameCell(own, cell) && s.mEditing,
        ]}
        onPress={() => setPick(cell)}
      >
        <Text
          style={[s.mText, st.type === 'own' && { color: C.amberText }, st.type === 'common' && { color: C.muted }, st.type === 'empty' && { color: C.faint }]}
          numberOfLines={2}
        >
          {label}
        </Text>
        {st.type === 'empty' && !!entry?.note && (
          <Text style={s.mNote} numberOfLines={1}>
            {entry.note}
          </Text>
        )}
        {entry?.kind === 'outdoor' && <Text style={s.mOutdoor}>야외</Text>}
      </TouchableOpacity>
    );
  };

  const pickSubtitle = !pickState
    ? ''
    : pickState.type === 'course'
      ? `지금: ${pickState.course.name}`
      : pickState.type === 'own'
        ? `지금: 직접 입력 · 활동 ${pickState.slots.length}`
        : pickState.type === 'common'
          ? `지금: 세트 공통 직접 입력 · 활동 ${pickState.slots.length}`
          : '아직 비어 있습니다';
  const directHint = !pickState
    ? ''
    : pickState.type === 'course'
      ? '지금 코스 활동표를 복사해 이 칸만 따로 고칩니다'
      : pickState.type === 'own'
        ? '이 칸만 쓰는 활동표를 고칩니다'
        : pickState.type === 'common'
          ? '세트 공통 활동표 — 고치면 이 그룹만 따로 갖게 됩니다'
          : '이 칸에만 활동을 넣습니다';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 12, paddingBottom: 56 }} keyboardShouldPersistTaps="handled">
        {top}

        <Notice text="코스(장소별 하루 일정)를 한 번 만들고, 표에서 날짜·그룹마다 코스만 고릅니다. 한 그룹만 그날 다르면 그 칸만 '직접 입력'." />

        {/* 묶기 배너 */}
        {mainSugs.length > 0 && (
          <View style={s.banner}>
            <Text style={s.bannerText}>
              코스로 묶지 않은 칸 {looseCells}개 — 같은 활동표끼리 묶으면 {bundleSummary}
            </Text>
            <Btn label="코스로 묶기…" kind="primary" icon="albums-outline" onPress={openBundle} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
          </View>
        )}

        {/* 배정표 */}
        {!dates.length ? (
          <View style={[u.notice, u.noticeAmber]}>
            <Text style={[u.noticeText, { color: C.amberText }]}>
              일정표에 익사이팅·야외 날이 없습니다 — [일정표] 탭에서 날짜를 Exciting / Outdoor 로 정하세요.
            </Text>
            <Btn label="일정표 탭으로" kind="soft" icon="calendar-outline" onPress={onGoPlan} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
          </View>
        ) : (
          <>
            <SectionHead title="배정표" right={<Text style={s.headHint}>{`${dates.length}일 · ${cols.length}그룹`}</Text>} />
            <Text style={[u.hint, { marginTop: 0, marginBottom: 6 }]}>
              칸을 눌러 코스를 고르세요. 회색 칸은 그날 익사이팅·야외 날이 아닌 그룹입니다 (Day 는 [일정표] 탭에서).
            </Text>
            {!cols.length ? (
              <Notice tone="gray" text="활동 날을 쓰는 그룹이 없습니다. [일정표] 탭에서 세트의 그룹을 확인하세요." />
            ) : (
              <View style={s.matrix}>
                <View style={{ width: DATE_W }}>
                  <View style={s.mHead}>
                    <Text style={s.mHeadText}>날짜</Text>
                  </View>
                  {dates.map((d) => (
                    <View key={d} style={s.mDate}>
                      <Text style={s.mDateText}>{dateLabel(d)}</Text>
                    </View>
                  ))}
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                  <View>
                    <View style={{ flexDirection: 'row' }}>
                      {cols.map((g) => (
                        <View key={g} style={[s.mHead, { width: COL_W - 4 }]}>
                          <Text style={s.mHeadText} numberOfLines={1}>
                            {g}
                          </Text>
                        </View>
                      ))}
                    </View>
                    {dates.map((d) => (
                      <View key={d} style={{ flexDirection: 'row' }}>
                        {cols.map((g) => renderCell(d, g))}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </>
        )}

        {/* 직접 입력 칸 편집 */}
        {ownOpen && own && ownState && (
          <View
            style={s.ownCard}
            onLayout={(e) => {
              ownY.current = e.nativeEvent.layout.y;
            }}
          >
            <Text style={s.ownTitle}>
              {dateLabel(own.date)} · {own.group} — 이 칸만 직접 입력
            </Text>
            {ownState.type === 'common' && <Text style={s.ownSub}>세트 공통 활동표 — 고치면 이 그룹만 따로 갖게 됩니다</Text>}
            <SlotRows
              slots={ownSlots}
              stableKeys={false}
              keyBase={`cell:${own.date}:${normalizeGroupKey(own.group)}`}
              onEdit={(fn, key) => edit((p) => EC.editCellSlots(p, own.date, own.group, fn), key)}
              onCarryGuide={carryGuide}
            />
            <View style={[u.row, { marginTop: 12 }]}>
              <Btn label="코스로 저장" kind="soft" icon="albums-outline" disabled={!ownSlots.length} onPress={saveOwnAsCourse} />
              <View style={{ flex: 1 }} />
              <Btn label="닫기" onPress={() => setOwn(null)} />
            </View>
            <Text style={u.hint}>[코스로 저장] 하면 똑같은 활동표를 쓰는 다른 칸도 함께 이 코스로 이어집니다.</Text>
          </View>
        )}

        {/* 코스 패널 */}
        <View
          style={{ marginTop: 18 }}
          onLayout={(e) => {
            panelY.current = e.nativeEvent.layout.y;
          }}
        >
          <SectionHead title="코스" scope="캠프 전체" right={<Btn label="+ 코스" kind="soft" onPress={addCourse} />} />
          {!courses.length ? (
            <Notice
              tone="gray"
              text="아직 코스가 없습니다. [+ 코스] 로 장소별 하루 일정을 만들거나, 이미 넣어 둔 활동표가 있으면 위의 [코스로 묶기…] 로 코스를 만드세요."
            />
          ) : (
            <View style={s.cList}>
              {courses.map((c, i) => {
                const on = c.id === course?.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[s.cRow, on && s.cRowOn, i === courses.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => setCourseId(c.id)}
                  >
                    <View style={[s.dot, { backgroundColor: c.color || C.bg2 }]} />
                    <Text style={[s.cName, on && { color: C.blueText, fontWeight: '700' }]} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={s.cCount}>{usageCount.get(c.id) ?? 0}칸</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {course && (
            <View style={[u.card, { marginTop: 10 }]}>
              <View style={[u.row, { marginBottom: 8 }]}>
                <View style={[s.dot, { backgroundColor: course.color || C.bg2 }]} />
                <Text style={s.cTitle} numberOfLines={1}>
                  {course.name || '이름 없음'}
                </Text>
                <View style={{ flex: 1 }} />
                <IconBtn name="chevron-up" disabled={courseIdx <= 0} onPress={() => edit((p) => EC.moveCourse(p, course.id, -1))} />
                <IconBtn name="chevron-down" disabled={courseIdx >= courses.length - 1} onPress={() => edit((p) => EC.moveCourse(p, course.id, 1))} />
              </View>
              <Field label="코스 이름">
                <Input
                  value={course.name}
                  onChangeText={(v) =>
                    edit(
                      (p) =>
                        EC.editCourse(p, course.id, (c) => {
                          c.name = v;
                        }),
                      `course:${course.id}:name`
                    )
                  }
                  placeholder="예: 항공우주 박물관"
                />
              </Field>
              <Field label="표 칸 색">
                <View style={u.colorRow}>
                  {EC.COURSE_COLORS.map((col) => (
                    <TouchableOpacity
                      key={col}
                      onPress={() =>
                        edit((p) =>
                          EC.editCourse(p, course.id, (c) => {
                            c.color = col;
                          })
                        )
                      }
                      style={[u.colorSwatch, { backgroundColor: col }, course.color?.toLowerCase() === col && u.colorOn]}
                    />
                  ))}
                </View>
              </Field>
              <Text style={u.label}>활동</Text>
              <SlotRows
                slots={course.slots}
                stableKeys
                keyBase={`course:${course.id}`}
                onEdit={(fn, key) =>
                  edit(
                    (p) =>
                      EC.editCourse(p, course.id, (c) => {
                        c.slots = fn(c.slots);
                      }),
                    key
                  )
                }
                onCarryGuide={carryGuide}
              />
              <Text style={[u.hint, { marginTop: 12 }]}>
                {usage.length ? `쓰는 칸: ${cellsText(usage, ', ')}` : '아직 고른 칸이 없습니다 — 표에서 고르세요'}
              </Text>
              <View style={[u.row, { marginTop: 10 }]}>
                <Btn label="복제" icon="copy-outline" onPress={() => duplicate(course.id)} />
                <View style={{ flex: 1 }} />
                <Btn label="삭제" kind="danger" icon="trash-outline" onPress={() => removeCourse(course)} />
              </View>
            </View>
          )}
        </View>

        {/* 활동 칸 설명 */}
        {activityLabels.length > 0 && (
          <View style={{ marginTop: 18 }}>
            <SectionHead title="활동 칸 설명" scope="캠프 전체" />
            <Text style={[u.hint, { marginTop: 0, marginBottom: 6 }]}>
              보기 화면 익사이팅 탭에서 활동을 누르면 뜨는 세부페이지입니다. 시간표 칸 설명과 같은 곳에 활동 이름으로 저장됩니다.
            </Text>
            <GuideEditorPanel campCode={campCode} labels={activityLabels} guides={ws.cur.guides} setGuides={(fn) => setWs((w) => W.editGuides(w, fn))} />
          </View>
        )}
      </ScrollView>

      {/* 칸 — 코스 고르기 */}
      <Sheet visible={!!pick} onClose={() => setPick(null)} title={pick ? `${dateLabel(pick.date)} · ${pick.group}` : ''} subtitle={pickSubtitle}>
        {!!pick && !!pickState && (
          <View>
            <Text style={u.label}>코스</Text>
            {courses.length ? (
              courses.map((c) => {
                const on = pickState.type === 'course' && pickState.course.id === c.id;
                return (
                  <TouchableOpacity key={c.id} style={[s.opt, on && s.optOn]} onPress={() => assign(pick, c.id)}>
                    <View style={[s.dot, { backgroundColor: c.color || C.bg2 }]} />
                    <Text style={[s.optText, on && { color: C.blueText, fontWeight: '700' }]} numberOfLines={1}>
                      {c.name}
                    </Text>
                    <Text style={s.optSub}>{c.slots.length ? `활동 ${c.slots.length}` : '활동 없음'}</Text>
                    {on && <Ionicons name="checkmark" size={16} color={C.blue} />}
                  </TouchableOpacity>
                );
              })
            ) : (
              <Text style={[u.hint, { marginBottom: 8 }]}>아직 코스가 없습니다 — 아래 코스 패널에서 [+ 코스] 로 만드세요.</Text>
            )}
            <View style={u.divider} />
            <TouchableOpacity style={[s.opt, pickState.type === 'own' && s.optOn]} onPress={() => direct(pick)}>
              <Ionicons name="create-outline" size={16} color={C.amberText} />
              <View style={{ flex: 1 }}>
                <Text style={s.optLabel}>직접 입력 (이 칸만)</Text>
                <Text style={s.optHint}>{directHint}</Text>
              </View>
              {pickState.type === 'own' && <Ionicons name="checkmark" size={16} color={C.blue} />}
            </TouchableOpacity>
            {(pickState.type === 'course' || pickState.type === 'own') && (
              <TouchableOpacity style={s.opt} onPress={() => assign(pick, null)}>
                <Ionicons name="close-circle-outline" size={16} color={C.red} />
                <Text style={[s.optText, { color: C.red }]}>비우기</Text>
              </TouchableOpacity>
            )}
            {pickState.type === 'common' && (
              <Text style={u.hint}>세트 공통 활동표는 이 그룹만 비울 수 없습니다 — 코스를 고르거나 직접 입력으로 고치세요.</Text>
            )}
          </View>
        )}
      </Sheet>

      {/* 같은 활동표 묶기 */}
      <FullModal
        visible={!!bundle}
        onClose={() => setBundle(null)}
        title="코스로 묶기"
        footer={
          <>
            <Btn label="취소" onPress={() => setBundle(null)} style={{ flex: 1 }} />
            <Btn label={`${bundleOn.length}개 묶기`} kind="primary" disabled={!bundleOn.length} onPress={applyBundle} style={{ flex: 2 }} />
          </>
        }
      >
        <Notice text="같은 활동표를 쓰는 칸끼리 코스 하나로 묶습니다. 묶은 칸은 코스를 고치면 함께 바뀝니다." />
        {suggestions.map((x) => {
          const st = bundle?.[x.key] ?? { on: false, name: x.name };
          return (
            <View key={x.key} style={[s.sug, st.on && s.sugOn]}>
              <CheckRow
                on={st.on}
                label={x.courseId ? `기존 코스 「${x.name}」에 잇기` : `새 코스 · 칸 ${x.cells.length}개`}
                sub={cellsText(x.cells)}
                onPress={() =>
                  setBundle((b) => {
                    if (!b) return b;
                    const cur = b[x.key] ?? { on: false, name: x.name };
                    return { ...b, [x.key]: { ...cur, on: !cur.on } };
                  })
                }
              />
              {!x.courseId && (
                <Input
                  value={st.name}
                  onChangeText={(v) =>
                    setBundle((b) => {
                      if (!b) return b;
                      const cur = b[x.key] ?? { on: false, name: x.name };
                      return { ...b, [x.key]: { ...cur, name: v } };
                    })
                  }
                  placeholder={x.name}
                  style={{ marginBottom: 6 }}
                />
              )}
              {!!x.variantOf && (
                <Notice
                  tone="amber"
                  text={`「${x.variantOf.name}」와 ${x.variantOf.diff}줄만 다름 — 그날만 다른 일정이면 묶지 말고 '직접 입력'으로 두세요`}
                />
              )}
              {x.slots.length ? (
                <View style={s.preview}>
                  {x.slots.slice(0, PREVIEW_MAX).map((sl, i) => (
                    <Text key={i} style={s.previewText} numberOfLines={1}>
                      {`${sl.start}${sl.end ? `~${sl.end}` : ''}  ${sl.activity}${sl.place ? ` · ${sl.place}` : ''}`}
                    </Text>
                  ))}
                  {x.slots.length > PREVIEW_MAX && <Text style={s.previewMore}>외 {x.slots.length - PREVIEW_MAX}줄</Text>}
                </View>
              ) : (
                <Text style={u.hint}>활동표 없이 그날 메모만 있는 칸 — 이름만 있는 빈 코스가 됩니다. 묶은 뒤 코스 패널에서 활동을 넣으세요.</Text>
              )}
            </View>
          );
        })}
      </FullModal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  banner: { borderWidth: 1, borderColor: C.blueLine, backgroundColor: C.blueBg, borderRadius: 10, padding: 10, marginBottom: 12 },
  bannerText: { fontSize: 12, color: '#1e40af', lineHeight: 17, fontWeight: '600' },
  headHint: { fontSize: 11, color: C.faint },

  matrix: { flexDirection: 'row' },
  mHead: { margin: 2, height: HEAD_H - 4, borderRadius: 6, backgroundColor: '#fcd98a', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  mHeadText: { fontSize: 11, fontWeight: '700', color: '#1f2937' },
  mDate: {
    margin: 2,
    height: ROW_H - 4,
    borderRadius: 6,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mDateText: { fontSize: 11, fontWeight: '700', color: C.text },
  mCell: {
    margin: 2,
    width: COL_W - 4,
    height: ROW_H - 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  mOff: { backgroundColor: C.bg2, borderColor: C.bg2 },
  mOffText: { fontSize: 10, color: C.faint },
  mLit: { borderWidth: 2, borderColor: C.blue },
  mEditing: { borderWidth: 2, borderColor: C.orange },
  mText: { fontSize: 11.5, fontWeight: '600', color: C.text, textAlign: 'center', lineHeight: 15 },
  mNote: { fontSize: 9.5, color: C.faint, marginTop: 1 },
  mOutdoor: { position: 'absolute', top: 2, right: 4, fontSize: 8.5, fontWeight: '700', color: '#be123c' },

  ownCard: { borderWidth: 1, borderColor: C.amberLine, backgroundColor: '#fffef0', borderRadius: 12, padding: 11, marginTop: 14 },
  ownTitle: { fontSize: 13.5, fontWeight: '700', color: C.text },
  ownSub: { fontSize: 11.5, color: C.amberText, marginTop: 3 },
  slot: { gap: 5, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.bg2, marginTop: 8 },
  link: { fontSize: 13, fontWeight: '700', color: C.blue, marginTop: 8 },

  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: C.lineStrong },
  cList: { borderWidth: 1, borderColor: C.line, borderRadius: 10, overflow: 'hidden', backgroundColor: '#fff' },
  cRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.bg2 },
  cRowOn: { backgroundColor: C.blueBg },
  cName: { flex: 1, fontSize: 13, color: C.text },
  cCount: { fontSize: 11, color: C.muted },
  cTitle: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: C.text },

  opt: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  optOn: { backgroundColor: C.blueBg },
  optText: { flex: 1, fontSize: 13.5, color: C.text },
  optLabel: { fontSize: 13.5, color: C.text },
  optSub: { fontSize: 11, color: C.faint },
  optHint: { fontSize: 11, color: C.faint, marginTop: 1 },

  sug: { borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, marginBottom: 10, backgroundColor: '#fff' },
  sugOn: { borderColor: C.blueLine, backgroundColor: '#f8fbff' },
  preview: { backgroundColor: C.bg, borderRadius: 6, padding: 7, gap: 2 },
  previewText: { fontSize: 11, color: C.text2 },
  previewMore: { fontSize: 10.5, color: C.faint },
});
