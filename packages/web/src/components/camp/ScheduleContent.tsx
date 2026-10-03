'use client';

import { resolveActiveJobCodeId } from '@smis-mentor/shared';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  applyClassInfo,
  findCategory,
  findInlineSlots,
  getCampClassInfo,
  getCampTimetableCommon,
  getCampTimetableGuides,
  findGuide,
  guideAudienceOf,
  guideKeyOf,
  hasGuideContent,
  getCampGroups,
  getEslBooks,
  isSameGroup,
  normalizeGroupKey,
  resolveGroups,
  resolveTimetable,
  resolveTimetables,
  timetableVariants,
  monthDayLabel,
  teacherMapOf,
  timetableCategories,
  timetableGroupNames,
  getCampDayPlan,
  daySetForGroup,
  dayCategory,
  excitingDates,
  localYmd,
  EXCITING_CATEGORY,
  type CampTimetable,
  type DerivedGroup,
} from '@smis-mentor/shared';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { campTimetableService } from '@/lib/campTimetableService';
import { DayPlanCalendar, DayPlanEditor, ExcitingDayList } from './DayPlan';
import GuideDetail from './GuideDetail';
import { getJobCodeById, getUsersByJobCodeId } from '@/lib/firebaseService';
import TimetableView from './TimetableView';
import TimetableEditor from './TimetableEditor';
import BookTable from './BookTable';
import { L } from '@smis-mentor/shared';

/** 시간표 탭 줄의 '전체' (일정표) */
const ALL_TAB = '__all';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
/** '2027-01-21' 들 → '1/21 (THU) · 1/28 (THU)' — 익사이팅 데이 제목과 같은 모양 */
const datesLabel = (dates: string[]) =>
  dates.map((d) => `${monthDayLabel(d)} (${WEEKDAYS[new Date(`${d}T00:00:00`).getDay()]})`).join(' · ');

/** 고른 그룹은 캠프별로 기억한다 — 다른 탭 다녀와도 그대로 */
const GROUP_KEY = (jobCodeId: string) => `SMIS_TIMETABLE_GROUP_${jobCodeId}`;

function readStoredGroup(jobCodeId?: string): string | null {
  if (!jobCodeId || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(GROUP_KEY(jobCodeId));
  } catch {
    return null;
  }
}

/** 캠프 기간 중이면 지금 시각(분)을, 아니면 null */
function useNowMinutes(start?: Date | null, end?: Date | null) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      if (start && d < start) return setNow(null);
      if (end) {
        const last = new Date(end);
        last.setHours(23, 59, 59, 999);
        if (d > last) return setNow(null);
      }
      setNow(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [start?.getTime(), end?.getTime()]);
  return now;
}

export default function ScheduleContent() {
  const { userData } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const isAdmin = userData?.role === 'admin';
  /** 칸 설명 — 원어민은 원어민용, 나머지는 멘토·부매니저용 (관리자는 둘 다) */
  const guideAudience = guideAudienceOf(userData?.role);

  const activeJobCodeId = resolveActiveJobCodeId(userData); // 관리자 임시 캠프 포함

  const [editing, setEditing] = useState(false);
  const [dayPlanEditing, setDayPlanEditing] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);

  // 지난번에 고른 그룹 복원 (캠프가 바뀌면 그 캠프 것으로)
  useEffect(() => {
    setGroupName(readStoredGroup(activeJobCodeId));
  }, [activeJobCodeId]);

  const chooseGroup = (g: string) => {
    setGroupName(g);
    if (!activeJobCodeId) return;
    try {
      window.localStorage.setItem(GROUP_KEY(activeJobCodeId), g);
    } catch {
      /* 저장이 막혀 있어도 선택 자체는 동작해야 한다 */
    }
  };

  const { data: timetables = [], isLoading } = useQuery({
    queryKey: ['campTimetables', activeJobCodeId],
    queryFn: () => campTimetableService.listByJobCodeId(activeJobCodeId!),
    enabled: !!activeJobCodeId,
  });

  const { data: jobCode } = useQuery({
    queryKey: ['jobCode', activeJobCodeId],
    queryFn: () => getJobCodeById(activeJobCodeId!),
    enabled: !!activeJobCodeId,
    staleTime: 10 * 60 * 1000,
  });
  const campCode = jobCode?.code ?? '';

  const { data: campGroups = [] } = useQuery({
    queryKey: ['campGroups', campCode],
    queryFn: () => getCampGroups(db, campCode),
    enabled: !!campCode,
    staleTime: 10 * 60 * 1000,
  });

  /** 반이름·강의실은 기수마다 다르므로 캠프 설정에서 한 벌만 가져와 입힌다 */
  const { data: campClassInfo = {} } = useQuery({
    queryKey: ['campClassInfo', campCode],
    queryFn: () => getCampClassInfo(db, campCode),
    enabled: !!campCode,
    staleTime: 10 * 60 * 1000,
  });

  /** 그룹별 공통 값 — 같은 그룹의 모든 Day 가 함께 쓴다 */
  const { data: timetableCommon = {} } = useQuery({
    queryKey: ['campTimetableCommon', campCode],
    queryFn: () => getCampTimetableCommon(db, campCode),
    enabled: !!campCode,
    staleTime: 10 * 60 * 1000,
  });

  /** 일정표 — 날짜별 Day · 익사이팅 활동 (캠프당 한 벌) */
  const { data: dayPlan = null, refetch: refetchDayPlan } = useQuery({
    queryKey: ['campDayPlan', campCode],
    queryFn: () => getCampDayPlan(db, campCode),
    enabled: !!campCode,
    staleTime: 5 * 60 * 1000,
  });

  /** 칸 설명 — 캠프당 한 벌 */
  const { data: timetableGuides = {}, refetch: refetchGuides } = useQuery({
    queryKey: ['campTimetableGuides', campCode],
    queryFn: () => getCampTimetableGuides(db, campCode),
    enabled: !!campCode,
    staleTime: 10 * 60 * 1000,
  });
  /** 지금 열어 둔 세부페이지의 칸 이름 */
  const [guideLabel, setGuideLabel] = useState<string | null>(null);

  /** 교재 리스트는 기수·캠프와 무관한 전사 공용 값 */
  const { data: eslBooks } = useQuery({
    queryKey: ['eslBooks'],
    queryFn: () => getEslBooks(db),
    staleTime: 30 * 60 * 1000,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['campMembers', activeJobCodeId],
    queryFn: () => getUsersByJobCodeId(activeJobCodeId!),
    enabled: !!activeJobCodeId,
    staleTime: 5 * 60 * 1000,
  });

  /** 그룹·반·선생님은 앱 배정에서. 없으면 캠프 설정 → 기본 3그룹 (mobile 과 같은 규칙) */
  const derived: DerivedGroup[] = useMemo(
    () => resolveGroups(members, activeJobCodeId ?? '', campGroups),
    [members, activeJobCodeId, campGroups]
  );

  const groupOf = (name: string | null) => derived.find((g) => isSameGroup(g.name, name));

  const teacherByClassCode = useMemo(() => teacherMapOf(derived), [derived]);

  const myExp = useMemo(
    () =>
      userData?.jobExperiences?.find((e) => e.id === activeJobCodeId) as
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

  /** 이 그룹이 쓰는 일정 세트 */
  const daySet = useMemo(() => daySetForGroup(dayPlan, activeGroup), [dayPlan, activeGroup]);
  const hasExciting = excitingDates(daySet).length > 0;
  /** 처음 열면 오늘 Day 탭, 오늘이 일정에 없으면 '전체' */
  const todayCategory = dayCategory(daySet, localYmd(new Date()), campCode);
  const activeCategory = category ?? todayCategory ?? (daySet ? ALL_TAB : categories[0]?.key ?? null);
  const isPlanTab = activeCategory === ALL_TAB || activeCategory === EXCITING_CATEGORY;
  const tableCategory = isPlanTab ? null : activeCategory;

  /**
   * 커스텀 표가 있을 때 지금 보는 표 — Day·그룹별로 기억한다 (id = 버튼으로 고른 표, date = 일정표에서 누른 날짜).
   * 고른 게 없으면 오늘 날짜를 맡은 표, 그것도 없으면 기본 표.
   */
  const [variantPick, setVariantPick] = useState<{ key: string; id?: string; date?: string } | null>(null);

  const openDate = (date: string) => {
    const cat = dayCategory(daySet, date, campCode);
    if (!cat) return;
    setCategory(cat);
    if (cat !== EXCITING_CATEGORY) {
      // 커스텀 표가 있으면 그 날짜를 맡은 표를 연다
      setVariantPick({ key: `${cat}::${activeGroup}`, date });
      return;
    }
    setTimeout(() => {
      document.getElementById(`exciting-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };
  /** 같은 일정을 쓰는 그룹 이름 (Spring · Summer) */
  const sharedGroupNames = (daySet?.groups ?? [])
    .map((k) => groups.find((g) => normalizeGroupKey(g) === k) ?? k)
    .join(' · ');

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
        common: timetableCommon,
      }),
    [timetables, derived, groups, tableCategory, activeGroup, campCode, activeJobCodeId, timetableCommon]
  );
  const current: CampTimetable | undefined = currentList[0];
  /**
   * 커스텀 표가 있으면 한 번에 한 장만 — 오른쪽 위 [기본] [8/8] … 버튼으로 바꿔 본다
   * (쌓아 두면 아래 인문학 표 등이 너무 내려간다). 일정표에서 날짜를 누르면 그 날짜 표가 열린다.
   * 날짜를 아직 안 고른 커스텀 표(기본 표 말고 날짜 없는 표)는 어느 날에도 쓰이지 않으므로 버튼도 없다.
   */
  const variants = useMemo(() => {
    if (currentList.length < 2) return [];
    const all = timetableVariants(currentList, daySet, tableCategory, campCode);
    const baseId = all.find((v) => v.isBase)?.table.id;
    const shown = all.filter((v) => !v.isBase || v.table.id === baseId);
    return shown.length > 1 ? shown : [];
  }, [currentList, daySet, tableCategory, campCode]);
  const todayYmd = localYmd(new Date());
  const categoryName = categories.find((c) => c.key === tableCategory)?.label ?? '';

  const variantKey = `${tableCategory}::${activeGroup}`;
  const shownVariant = (() => {
    if (!variants.length) return null;
    const pick = variantPick?.key === variantKey ? variantPick : null;
    const byDate = (d?: string | null) => (d ? variants.find((v) => v.dates.includes(d)) : undefined);
    return (pick?.id && variants.find((v) => v.table.id === pick.id)) || byDate(pick?.date) || byDate(todayYmd) || variants[0];
  })();

  /**
   * 인문학처럼 "하루를 통째로 쓰지 않고 정규 데이 한 시간대에 들어가는" 표.
   * 본표에 그 시간대 줄이 있을 때만 아래에 같이 띄운다.
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
          common: timetableCommon,
        }),
      }))
      .filter((x): x is { slot: (typeof x)['slot']; table: CampTimetable } => !!x.table);
  }, [current, timetables, derived, groups, activeGroup, campCode, activeJobCodeId, timetableCommon]);

  /**
   * 설명이 실제로 들어 있는 칸 이름만 — 빈 칸을 눌러 봐야 허탕이라.
   * 누구나 멘토·부매니저용 / 원어민용을 오가며 볼 수 있으므로 둘 중 하나라도 있으면 연다
   */
  const guidedLabels = useMemo(() => {
    const keys = new Set<string>();
    Object.entries(timetableGuides).forEach(([key, guide]) => {
      if (hasGuideContent(guide)) keys.add(guideKeyOf(key));
    });
    return keys;
  }, [timetableGuides]);

  /** Day·그룹을 바꾸면 열어 둔 세부페이지는 닫는다 */
  useEffect(() => setGuideLabel(null), [activeCategory, activeGroup]);

  const campStart = jobCode?.startDate?.toDate?.() ?? null;
  /** 그릴 때 캠프 설정의 반이름·강의실을 입힌다 */
  const withClassInfo = (t: CampTimetable | undefined) =>
    t ? { ...t, classes: applyClassInfo(t.classes, campClassInfo) } : t;

  const nowMinutes = useNowMinutes(campStart, jobCode?.endDate?.toDate?.());

  if (!activeJobCodeId) {
    return (
      <EmptyState
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
        start={campStart}
        end={jobCode?.endDate?.toDate?.() ?? null}
        initialGroup={activeGroup}
        actorName={userData?.name ?? ''}
        onClose={() => setDayPlanEditing(false)}
        onSaved={() => {
          setDayPlanEditing(false);
          refetchDayPlan();
          refetchGuides();
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
        onClose={() => setEditing(false)}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-7 w-72 animate-pulse rounded-full bg-gray-100" />
        <div className="h-7 w-48 animate-pulse rounded-full bg-gray-100" />
        <div className="h-72 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="pt-2 pb-16">
      {/* 1단계: 표 종류 */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div
          role="tablist"
          aria-label={L('schedule.timetableType')}
          className="flex min-w-0 flex-1 flex-wrap gap-1 overflow-x-auto"
        >
          {[
            { key: ALL_TAB, label: L('schedule.all') },
            ...categories,
            ...(hasExciting || (isAdmin && daySet) ? [{ key: EXCITING_CATEGORY, label: L('schedule.excitingTab') }] : []),
          ].map((c) => {
            const on = c.key === activeCategory;
            const filled = c.key === ALL_TAB || c.key === EXCITING_CATEGORY || timetables.some((t) => t.dayType === c.key);
            return (
              <button
                key={c.key}
                role="tab"
                aria-selected={on}
                onClick={() => setCategory(c.key)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  on
                    ? 'bg-blue-600 text-white shadow-sm'
                    : filled
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-white text-gray-400 ring-1 ring-inset ring-gray-200 hover:bg-gray-50'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        {isAdmin && (
          <button
            onClick={() => (isPlanTab ? setDayPlanEditing(true) : setEditing(true))}
            className="shrink-0 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            {L('common.edit')}
          </button>
        )}
      </div>

      {/* 2단계: 그룹 — 전체 너비를 고르게 나눈 세그먼트 */}
      {groups.length > 0 && (
        <div
          role="tablist"
          aria-label={L('schedule.group')}
          className="mb-3 grid gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5"
          style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}
        >
          {groups.map((g) => {
            const on = g === activeGroup;
            return (
              <button
                key={g}
                role="tab"
                aria-selected={on}
                onClick={() => chooseGroup(g)}
                className={`truncate rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                  on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      )}

      {activeCategory === ALL_TAB ? (
        daySet ? (
          <section>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
              <h3 className="text-sm font-semibold text-gray-900">{L('schedule.dayPlanTitle', { v0: activeGroup ?? '' })}</h3>
              {daySet.groups.length > 1 && <span className="text-xs text-gray-500">{L('schedule.dayPlanShared', { v0: sharedGroupNames })}</span>}
            </div>
            <DayPlanCalendar
              set={daySet}
              campCode={campCode}
              start={campStart}
              end={jobCode?.endDate?.toDate?.() ?? null}
              onPickDate={openDate}
            />
          </section>
        ) : (
          <EmptyState
            title={dayPlan ? L('schedule.dayPlanNoGroup') : L('schedule.dayPlanEmpty')}
            body={isAdmin ? L('schedule.dayPlanEmptyAdmin') : ''}
          />
        )
      ) : activeCategory === EXCITING_CATEGORY ? (
        guideLabel ? (
          <GuideDetail
            label={guideLabel}
            guide={findGuide(guideLabel, timetableGuides)}
            audience={guideAudience}
            onBack={() => setGuideLabel(null)}
          />
        ) : (
          <ExcitingDayList set={daySet} groupName={activeGroup} guidedLabels={guidedLabels} onOpenGuide={setGuideLabel} nowMinutes={nowMinutes} />
        )
      ) : current && guideLabel ? (
        <GuideDetail
          label={guideLabel}
          guide={findGuide(guideLabel, timetableGuides)}
          audience={guideAudience}
          onBack={() => setGuideLabel(null)}
        />
      ) : current ? (
        <>
          {shownVariant ? (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {!shownVariant.isBase && (
                  <p className="text-xs font-medium text-gray-600">
                    {L('schedule.customTable', { v0: categoryName })} · {datesLabel(shownVariant.dates)}
                  </p>
                )}
                <div role="tablist" className="ml-auto inline-flex flex-wrap rounded-lg bg-gray-100 p-0.5">
                  {variants.map((v) => {
                    const on = v.table.id === shownVariant.table.id;
                    return (
                      <button
                        key={v.table.id}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => setVariantPick({ key: variantKey, id: v.table.id })}
                        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                          on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        {v.dates.includes(todayYmd) && (
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" title={L('schedule.today')} />
                        )}
                        {v.isBase ? L('schedule.baseShort') : v.dates.map(monthDayLabel).join('·')}
                      </button>
                    );
                  })}
                </div>
              </div>
              <TimetableView
                timetable={withClassInfo(shownVariant.table)!}
                guidedLabels={guidedLabels}
                onOpenGuide={setGuideLabel}
                teacherByClassCode={teacherByClassCode}
                foreignBySubject={groupOf(shownVariant.table.groupName)?.staffByRole ?? {}}
                myClassCode={myExp?.classCode}
                isForeign={isForeign}
                nowMinutes={shownVariant.dates.includes(todayYmd) ? nowMinutes : null}
                linkedLabels={inlineTables.map((x) => x.slot.label)}
                campStart={campStart}
              />
            </>
          ) : (
            <TimetableView
              timetable={withClassInfo(current)!}
              guidedLabels={guidedLabels}
              onOpenGuide={setGuideLabel}
              teacherByClassCode={teacherByClassCode}
              foreignBySubject={groupOf(current.groupName)?.staffByRole ?? {}}
              myClassCode={myExp?.classCode}
              isForeign={isForeign}
              nowMinutes={nowMinutes}
              linkedLabels={inlineTables.map((x) => x.slot.label)}
              campStart={campStart}
            />
          )}

          {inlineTables.map(({ slot, table }) => (
            <section key={slot.category.key} className="mt-6">
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
                <h3 className="text-sm font-semibold text-gray-900">{slot.label}</h3>
                {slot.start && (
                  <span className="text-xs tabular-nums text-gray-500">
                    {slot.start}~{slot.end}
                  </span>
                )}
              </div>
              <TimetableView
                timetable={withClassInfo(table)!}
                guidedLabels={guidedLabels}
                onOpenGuide={setGuideLabel}
                teacherByClassCode={teacherByClassCode}
                foreignBySubject={groupOf(table.groupName)?.staffByRole ?? {}}
                myClassCode={myExp?.classCode}
                isForeign={isForeign}
                campStart={campStart}
              />
            </section>
          ))}

          {/* 교재는 수업이 있는 날(정규·입소·입소 D+1)에만 */}
          {findCategory(current.dayType)?.showBooks && (
            <BookTable
              classes={withClassInfo(current)!.classes}
              classInfo={campClassInfo}
              books={eslBooks}
              subjects={current.subjects}
              isForeign={isForeign}
            />
          )}
        </>
      ) : (
        <EmptyState
          title={L('schedule.noClassesAssignedTo', { v0: activeGroup ?? '' })}
          body="관리자 > 지원 유저 관리에서 이 캠프에 멘토를 배정하면서 그룹과 반번호를 넣으면 표가 만들어집니다."
        />
      )}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-6 py-14 text-center">
      <svg
        className="mx-auto mb-3 h-10 w-10 text-gray-300"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
        />
      </svg>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-gray-500">{body}</p>
    </div>
  );
}
