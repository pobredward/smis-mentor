import { resolveActiveJobCodeId } from '@smis-mentor/shared';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import {
  applyClassInfo,
  findCategory,
  findInlineSlots,
  isSameGroup,
  normalizeGroupKey,
  resolveTimetable,
  resolveTimetables,
  timetableVariants,
  monthDayLabel,
  findGuide,
  guideAudienceOf,
  guideKeyOf,
  hasGuideContent,
  teacherMapOf,
  timetableCategories,
  timetableGroupNames,
  daySetForGroup,
  dayCategory,
  excitingDates,
  localYmd,
  EXCITING_CATEGORY,
  type CampTimetable,
} from '@smis-mentor/shared';
import { useAuth } from '../context/AuthContext';
import { loadScheduleBundle, scheduleQueryKey } from '../services/scheduleBundle';
import { TimetableView } from '../components/TimetableView';
import { GuideDetail } from '../components/GuideDetail';
import { TimetableEditor } from '../components/TimetableEditor';
import { BookTable } from '../components/BookTable';
import { DayPlanCalendar, DayPlanEditor, ExcitingDayList } from '../components/DayPlan';
import { L } from '@smis-mentor/shared';

/** 시간표 탭 줄의 '전체' (일정표) */
const ALL_TAB = '__all';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
/** '2027-01-21' 들 → '1/21 (THU) · 1/28 (THU)' — 익사이팅 데이 제목과 같은 모양 (web 과 같다) */
const datesLabel = (dates: string[]) =>
  dates.map((d) => `${monthDayLabel(d)} (${WEEKDAYS[new Date(`${d}T00:00:00`).getDay()]})`).join(' · ');

/** 고른 그룹은 캠프별로 기억한다 — 다른 탭 다녀와도 그대로 */
const GROUP_KEY = (jobCodeId: string) => `SMIS_TIMETABLE_GROUP_${jobCodeId}`;

/** 캠프 기간 중이면 지금 시각(분), 아니면 null — web 과 같은 규칙 */
function useNowMinutes(startMs?: number | null, endMs?: number | null) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      if (startMs && d.getTime() < startMs) return setNow(null);
      if (endMs) {
        const last = new Date(endMs);
        last.setHours(23, 59, 59, 999);
        if (d > last) return setNow(null);
      }
      setNow(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [startMs, endMs]);
  return now;
}

export function ScheduleScreen() {
  const { userData } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const activeJobCodeId = resolveActiveJobCodeId(userData); // 관리자 임시 캠프 포함

  const [category, setCategory] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [dayPlanEditing, setDayPlanEditing] = useState(false);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const excitingTop = useRef(0);
  const isAdmin = userData?.role === 'admin';
  /** 칸 설명 — 원어민은 원어민용, 나머지는 멘토·부매니저용 (관리자는 둘 다) */
  const guideAudience = guideAudienceOf(userData?.role);

  // 지난번에 고른 그룹 복원
  useEffect(() => {
    let alive = true;
    if (!activeJobCodeId) return;
    AsyncStorage.getItem(GROUP_KEY(activeJobCodeId))
      .then((v) => {
        if (alive) setGroupName(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [activeJobCodeId]);

  const chooseGroup = (g: string) => {
    setGroupName(g);
    if (activeJobCodeId) AsyncStorage.setItem(GROUP_KEY(activeJobCodeId), g).catch(() => {});
  };

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: scheduleQueryKey(activeJobCodeId ?? ''),
    queryFn: () => loadScheduleBundle(activeJobCodeId!),
    enabled: !!activeJobCodeId,
  });

  const campCode = data?.campCode ?? '';
  const timetables = useMemo(() => data?.timetables ?? [], [data?.timetables]);
  const derived = useMemo(() => data?.groups ?? [], [data?.groups]);

  const groupOf = (name: string | null) => derived.find((g) => isSameGroup(g.name, name));
  const teacherByClassCode = useMemo(() => teacherMapOf(derived), [derived]);

  /** 지금 열어 둔 세부페이지의 칸 이름 */
  const [guideLabel, setGuideLabel] = useState<string | null>(null);
  /**
   * 설명이 실제로 들어 있는 칸 이름만 — 빈 칸을 눌러 봐야 허탕이라.
   * 누구나 멘토·부매니저용 / 원어민용을 오가며 볼 수 있으므로 둘 중 하나라도 있으면 연다
   */
  const guidedLabels = useMemo(() => {
    const keys = new Set<string>();
    Object.entries(data?.timetableGuides ?? {}).forEach(([key, guide]) => {
      if (hasGuideContent(guide)) keys.add(guideKeyOf(key));
    });
    return keys;
  }, [data?.timetableGuides]);

  const myExp = useMemo(
    () =>
      userData?.jobExperiences?.find((e: { id: string }) => e.id === activeJobCodeId) as
        | { classCode?: string; group?: string }
        | undefined,
    [userData?.jobExperiences, activeJobCodeId]
  );

  const categories = useMemo(() => timetableCategories(campCode, timetables), [campCode, timetables]);

  const groups = useMemo(() => timetableGroupNames(derived, timetables), [derived, timetables]);

  const defaultGroup = useMemo(() => {
    const mine = normalizeGroupKey(myExp?.group);
    return (mine && groups.find((g) => normalizeGroupKey(g) === mine)) || groups[0] || null;
  }, [myExp?.group, groups]);

  const activeGroup = groupName && groups.includes(groupName) ? groupName : defaultGroup;

  /** 이 그룹이 쓰는 일정 세트 — 처음 열면 오늘 Day 탭, 오늘이 일정에 없으면 '전체' (web 과 같은 규칙) */
  const dayPlan = data?.dayPlan ?? null;
  const daySet = useMemo(() => daySetForGroup(dayPlan, activeGroup), [dayPlan, activeGroup]);
  const hasExciting = excitingDates(daySet).length > 0;
  const todayCategory = dayCategory(daySet, localYmd(new Date()), campCode);
  const activeCategory = category ?? todayCategory ?? (daySet ? ALL_TAB : categories[0]?.key ?? null);
  const isPlanTab = activeCategory === ALL_TAB || activeCategory === EXCITING_CATEGORY;
  const tableCategory = isPlanTab ? null : activeCategory;
  const sharedGroupNames = (daySet?.groups ?? [])
    .map((k) => groups.find((g) => normalizeGroupKey(g) === k) ?? k)
    .join(' · ');
  const openDate = (date: string) => {
    const cat = dayCategory(daySet, date, campCode);
    if (!cat) return;
    setCategory(cat);
    if (cat === EXCITING_CATEGORY) setFocusDate(date);
    else {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      // 날짜별 표가 여러 장이면 그 날짜 표로 — 자리가 잡히면(onLayout) 내려 간다
      pendingScroll.current = date;
      setTimeout(tryScroll, 60);
    }
  };

  /** 고른 Day·그룹의 표 — 날짜별 표가 있으면 여러 장 (기본 표가 먼저, 그다음 날짜 순) */
  const currentList: CampTimetable[] = useMemo(
    () =>
      resolveTimetables({
        timetables,
        groups: derived,
        category: tableCategory,
        groupName: activeGroup,
        campCode,
        jobCodeId: activeJobCodeId ?? '',
        common: data?.timetableCommon,
      }),
    [timetables, derived, groups, tableCategory, activeGroup, campCode, activeJobCodeId, data?.timetableCommon]
  );
  const current: CampTimetable | undefined = currentList[0];
  /** 두 장 이상이면 날짜를 제목으로 달아 위에서부터 쌓는다 (익사이팅 데이 목록과 같은 방식 · web 과 같은 규칙) */
  const variants = useMemo(
    () => (currentList.length > 1 ? timetableVariants(currentList, daySet, tableCategory, campCode) : []),
    [currentList, daySet, tableCategory, campCode]
  );
  const todayYmd = localYmd(new Date());
  const categoryName = categories.find((c) => c.key === tableCategory)?.label ?? '';

  // 날짜 표로 스크롤 — 표마다 자리(y)를 기억해 두고, 가야 할 날짜가 있으면 자리가 잡히는 대로 내려 간다
  const tablesTop = useRef(0);
  const variantY = useRef<Record<string, number>>({});
  const variantsRef = useRef(variants);
  variantsRef.current = variants;
  const pendingScroll = useRef<string | null>(null);
  const tryScroll = () => {
    const date = pendingScroll.current;
    if (!date) return;
    const v = variantsRef.current.find((x) => x.dates.includes(date));
    if (!v) {
      pendingScroll.current = null;
      return;
    }
    const y = variantY.current[v.table.id];
    if (y == null) return;
    pendingScroll.current = null;
    scrollRef.current?.scrollTo({ y: Math.max(0, tablesTop.current + y - 12), animated: true });
  };
  // 오늘 표가 아래쪽에 쌓여 있으면, 탭을 처음 열 때 한 번 그 표로
  const autoScrolled = useRef<string | null>(null);
  useEffect(() => {
    const key = `${tableCategory}::${activeGroup}`;
    if (!variants.length || autoScrolled.current === key) return;
    autoScrolled.current = key;
    if (variants.findIndex((v) => v.dates.includes(todayYmd)) > 0) {
      pendingScroll.current = todayYmd;
      tryScroll();
    }
  }, [variants, tableCategory, activeGroup, todayYmd]);

  /**
   * 인문학처럼 "하루를 통째로 쓰지 않고 정규 데이 한 시간대에 들어가는" 표.
   * 본표에 그 시간대 줄이 있을 때만 아래에 같이 띄운다. (web 과 같은 규칙)
   */
  const inlineTables = useMemo(() => {
    if (!current) return [];
    return findInlineSlots(current)
      .map((slot) => ({
        slot,
        table: resolveTimetable({
          timetables,
          groups: derived,
          category: slot.category.key,
          groupName: activeGroup,
          campCode,
          jobCodeId: activeJobCodeId ?? '',
          common: data?.timetableCommon,
        }),
      }))
      .filter((x): x is { slot: (typeof x)['slot']; table: CampTimetable } => !!x.table);
  }, [current, timetables, derived, groups, activeGroup, campCode, activeJobCodeId, data?.timetableCommon]);

  /** 그릴 때 캠프 설정의 반이름·강의실을 입힌다 (기수별 한 벌) */
  const withClassInfo = (t: CampTimetable | undefined) =>
    t ? { ...t, classes: applyClassInfo(t.classes, data?.classInfo) } : t;

  const nowMinutes = useNowMinutes(data?.startMs, data?.endMs);

  if (!activeJobCodeId) {
    return (
      <Empty
        title={L('schedule.noCampSelected')}
        body={
          L('schedule.activateACampOnMy')
        }
      />
    );
  }

  if (dayPlanEditing && isAdmin) {
    return (
      <DayPlanEditor
        campCode={campCode}
        plan={dayPlan}
        groups={groups}
        startMs={data?.startMs ?? null}
        endMs={data?.endMs ?? null}
        initialGroup={activeGroup}
        actorName={userData?.name ?? ''}
        onClose={() => setDayPlanEditing(false)}
        onSaved={() => {
          setDayPlanEditing(false);
          refetch();
        }}
      />
    );
  }

  if (editing && isAdmin) {
    return (
      <TimetableEditor
        jobCodeId={activeJobCodeId}
        initialCategory={activeCategory}
        initialGroup={activeGroup}
        onClose={() => {
          setEditing(false);
          refetch();
        }}
      />
    );
  }

  if (isLoading && !data) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />}
    >
      {/* 1단계: 표 종류 */}
      <View style={s.tabLine}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabRow}>
        {[
          { key: ALL_TAB, label: L('schedule.all') },
          ...categories,
          ...(hasExciting || (isAdmin && daySet) ? [{ key: EXCITING_CATEGORY, label: L('schedule.excitingTab') }] : []),
        ].map((c) => {
          const on = c.key === activeCategory;
          const filled = c.key === ALL_TAB || c.key === EXCITING_CATEGORY || timetables.some((t) => t.dayType === c.key);
          return (
            <TouchableOpacity
              key={c.key}
              onPress={() => { setCategory(c.key); setGuideLabel(null); }}
              style={[s.pill, on ? s.pillOn : filled ? s.pillFilled : s.pillEmpty]}
            >
              <Text style={[s.pillText, on ? s.pillTextOn : filled ? s.pillTextFilled : s.pillTextEmpty]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          );
        })}
        </ScrollView>
        {isAdmin && (
          <TouchableOpacity style={s.editBtn} onPress={() => (isPlanTab ? setDayPlanEditing(true) : setEditing(true))}>
            <Text style={s.editBtnText}>편집</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 2단계: 그룹 — 전체 너비를 고르게 나눈 세그먼트 */}
      {groups.length > 0 && (
        <View style={s.segment}>
          {groups.map((g) => {
            const on = g === activeGroup;
            return (
              <TouchableOpacity
                key={g}
                onPress={() => { chooseGroup(g); setGuideLabel(null); }}
                style={[s.segItem, on && s.segItemOn]}
              >
                <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>
                  {g}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {activeCategory === ALL_TAB ? (
        daySet ? (
          <View>
            <View style={s.inlineHead}>
              <Text style={s.inlineTitle}>{L('schedule.dayPlanTitle', { v0: activeGroup ?? '' })}</Text>
              {daySet.groups.length > 1 && <Text style={s.inlineTime}>{L('schedule.dayPlanShared', { v0: sharedGroupNames })}</Text>}
            </View>
            <DayPlanCalendar
              set={daySet}
              campCode={campCode}
              startMs={data?.startMs ?? null}
              endMs={data?.endMs ?? null}
              onPickDate={openDate}
            />
          </View>
        ) : (
          <Empty
            title={dayPlan ? L('schedule.dayPlanNoGroup') : L('schedule.dayPlanEmpty')}
            body={isAdmin ? L('schedule.dayPlanEmptyAdmin') : ''}
          />
        )
      ) : activeCategory === EXCITING_CATEGORY && guideLabel ? (
        <GuideDetail
          label={guideLabel}
          guide={findGuide(guideLabel, data?.timetableGuides)}
          audience={guideAudience}
          onBack={() => setGuideLabel(null)}
        />
      ) : activeCategory === EXCITING_CATEGORY ? (
        <View onLayout={(e) => { excitingTop.current = e.nativeEvent.layout.y; }}>
          <ExcitingDayList
            set={daySet}
            groupName={activeGroup}
            guidedLabels={guidedLabels}
            onOpenGuide={(label) => { setGuideLabel(label); scrollRef.current?.scrollTo({ y: 0, animated: false }); }}
            nowMinutes={nowMinutes}
            focusDate={focusDate}
            onFocusLayout={(y) => scrollRef.current?.scrollTo({ y: Math.max(0, excitingTop.current + y - 12), animated: true })}
          />
        </View>
      ) : current && guideLabel ? (
        <GuideDetail
          label={guideLabel}
          guide={findGuide(guideLabel, data?.timetableGuides)}
          audience={guideAudience}
          onBack={() => setGuideLabel(null)}
        />
      ) : current ? (
        <>
          {variants.length ? (
            <View onLayout={(e) => { tablesTop.current = e.nativeEvent.layout.y; tryScroll(); }}>
              {variants.map((v, i) => {
                const isToday = v.dates.includes(todayYmd);
                return (
                  <View
                    key={v.table.id}
                    style={i > 0 ? s.inlineSection : undefined}
                    onLayout={(e) => { variantY.current[v.table.id] = e.nativeEvent.layout.y; tryScroll(); }}
                  >
                    <View style={s.inlineHead}>
                      <Text style={s.inlineTitle}>
                        {v.dates.length ? datesLabel(v.dates) : L('schedule.otherDays')} {categoryName}
                      </Text>
                      {isToday && <Text style={s.todayBadge}>{L('schedule.today')}</Text>}
                    </View>
                    <TimetableView
                      timetable={withClassInfo(v.table)!}
                      teacherByClassCode={teacherByClassCode}
                      foreignBySubject={groupOf(v.table.groupName)?.staffByRole ?? {}}
                      myClassCode={myExp?.classCode}
                      isForeign={isForeign}
                      nowMinutes={isToday ? nowMinutes : null}
                      linkedLabels={inlineTables.map((x) => x.slot.label)}
                      campStartMs={data?.startMs ?? null}
                      guidedLabels={guidedLabels}
                      onOpenGuide={setGuideLabel}
                    />
                  </View>
                );
              })}
            </View>
          ) : (
            <TimetableView
              timetable={withClassInfo(current)!}
              teacherByClassCode={teacherByClassCode}
              foreignBySubject={groupOf(current.groupName)?.staffByRole ?? {}}
              myClassCode={myExp?.classCode}
              isForeign={isForeign}
              nowMinutes={nowMinutes}
              linkedLabels={inlineTables.map((x) => x.slot.label)}
              campStartMs={data?.startMs ?? null}
              guidedLabels={guidedLabels}
              onOpenGuide={setGuideLabel}
            />
          )}

          {inlineTables.map(({ slot, table }) => (
            <View key={slot.category.key} style={s.inlineSection}>
              <View style={s.inlineHead}>
                <Text style={s.inlineTitle}>{slot.label}</Text>
                {!!slot.start && (
                  <Text style={s.inlineTime}>
                    {slot.start}~{slot.end}
                  </Text>
                )}
              </View>
              <TimetableView
                timetable={withClassInfo(table)!}
                guidedLabels={guidedLabels}
                onOpenGuide={setGuideLabel}
                teacherByClassCode={teacherByClassCode}
                foreignBySubject={groupOf(table.groupName)?.staffByRole ?? {}}
                myClassCode={myExp?.classCode}
                isForeign={isForeign}
                campStartMs={data?.startMs ?? null}
              />
            </View>
          ))}

          {/* 교재는 수업이 있는 날(정규·입소·입소 D+1)에만 */}
          {findCategory(current.dayType)?.showBooks && (
            <BookTable
              classes={withClassInfo(current)!.classes}
              classInfo={data?.classInfo ?? {}}
              books={data?.books}
              subjects={current.subjects}
              isForeign={isForeign}
            />
          )}
        </>
      ) : (
        <Empty
          title={`${activeGroup ?? ''} 그룹에 배정된 반이 없습니다`}
          body="관리자가 이 캠프에 멘토를 배정하면서 그룹과 반번호를 넣으면 표가 만들어집니다."
        />
      )}
    </ScrollView>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={s.empty}>
      <Ionicons name="calendar-outline" size={36} color="#d1d5db" />
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyBody}>{body}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 12, paddingTop: 8, paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },

  tabLine: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  tabRow: { flex: 1 },
  editBtn: {
    marginLeft: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  editBtnText: { fontSize: 11, color: '#374151' },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginRight: 6 },
  pillOn: { backgroundColor: '#2563eb' },
  pillFilled: { backgroundColor: '#f3f4f6' },
  pillEmpty: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  pillText: { fontSize: 12, fontWeight: '500' },
  pillTextOn: { color: '#fff' },
  pillTextFilled: { color: '#374151' },
  pillTextEmpty: { color: '#9ca3af' },

  segment: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 2,
    marginBottom: 10,
  },
  segItem: { flex: 1, paddingHorizontal: 4, paddingVertical: 5, borderRadius: 6, alignItems: 'center' },
  segItemOn: { backgroundColor: '#fff' },
  segText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  segTextOn: { color: '#111827' },

  inlineSection: { marginTop: 20 },
  inlineHead: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 },
  inlineTitle: { fontSize: 13, fontWeight: '700', color: '#111827' },
  todayBadge: { marginLeft: 8, backgroundColor: '#2563eb', color: '#fff', fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  inlineTime: { marginLeft: 6, fontSize: 11, color: '#6b7280' },

  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d1d5db',
    borderRadius: 12,
    backgroundColor: '#f9fafb',
    paddingVertical: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
    margin: 12,
  },
  emptyTitle: { marginTop: 10, fontSize: 13, fontWeight: '600', color: '#374151', textAlign: 'center' },
  emptyBody: { marginTop: 4, fontSize: 11, color: '#6b7280', textAlign: 'center', lineHeight: 16 },
});

export default ScheduleScreen;
