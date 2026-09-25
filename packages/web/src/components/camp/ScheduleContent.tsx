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
  guideKeyOf,
  hasGuideContent,
  getCampGroups,
  getEslBooks,
  isSameGroup,
  normalizeGroupKey,
  resolveGroups,
  resolveTimetable,
  teacherMapOf,
  timetableCategories,
  timetableGroupNames,
  type CampTimetable,
  type DerivedGroup,
} from '@smis-mentor/shared';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { campTimetableService } from '@/lib/campTimetableService';
import GuideDetail from './GuideDetail';
import { getJobCodeById, getUsersByJobCodeId } from '@/lib/firebaseService';
import TimetableView from './TimetableView';
import TimetableEditor from './TimetableEditor';
import BookTable from './BookTable';

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

  const activeJobCodeId = resolveActiveJobCodeId(userData); // 관리자 임시 캠프 포함

  const [editing, setEditing] = useState(false);
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

  /** 칸 설명 — 캠프당 한 벌 */
  const { data: timetableGuides = {} } = useQuery({
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

  const activeCategory = category ?? categories[0]?.key ?? null;

  const groups = useMemo(() => timetableGroupNames(derived, timetables), [derived, timetables]);

  const defaultGroup = useMemo(() => {
    const mine = normalizeGroupKey(myExp?.group);
    return (mine && groups.find((g) => normalizeGroupKey(g) === mine)) || groups[0] || null;
  }, [myExp?.group, groups]);

  const activeGroup = groupName && groups.includes(groupName) ? groupName : defaultGroup;

  const current: CampTimetable | undefined = useMemo(
    () =>
      resolveTimetable({
        timetables,
        groups: derived,
        category: activeCategory,
        groupName: activeGroup,
        campCode,
        jobCodeId: activeJobCodeId ?? '',
        common: timetableCommon,
      }),
    [timetables, derived, groups, activeCategory, activeGroup, campCode, activeJobCodeId, timetableCommon]
  );

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

  /** 설명이 실제로 들어 있는 칸 이름만 — 빈 칸을 눌러 봐야 허탕이라 */
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
        title={isForeign ? 'No camp selected' : '활성 캠프가 없습니다'}
        body={
          isForeign
            ? 'Activate a camp on My Page to see its timetable.'
            : '마이페이지에서 참여 중인 캠프를 활성화하면 시간표가 보입니다.'
        }
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
          aria-label="시간표 종류"
          className="flex min-w-0 flex-1 flex-wrap gap-1 overflow-x-auto"
        >
          {categories.map((c) => {
            const on = c.key === activeCategory;
            const filled = timetables.some((t) => t.dayType === c.key);
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
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            편집
          </button>
        )}
      </div>

      {/* 2단계: 그룹 — 전체 너비를 고르게 나눈 세그먼트 */}
      {groups.length > 0 && (
        <div
          role="tablist"
          aria-label="그룹"
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

      {current && guideLabel ? (
        <GuideDetail
          label={guideLabel}
          guide={findGuide(guideLabel, timetableGuides)}
          onBack={() => setGuideLabel(null)}
        />
      ) : current ? (
        <>
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
          title={`${activeGroup ?? ''} 그룹에 배정된 반이 없습니다`}
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
