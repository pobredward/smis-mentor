'use client';

/**
 * 시간표 탭의 '전체'(일정표)·'익사이팅' 화면과 관리자 일정표 편집기.
 * 데이터: campSettings/{campCode}.dayPlan (shared/types/campDayPlan.ts)
 */
import { useEffect, useMemo, useState } from 'react';
import {
  DAY_KINDS,
  L,
  calendarWeeks,
  dayKindLabel,
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
import { db } from '@/lib/firebase';
import { GuideEditorPanel } from './GuideEditorPanel';

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

export function ExcitingDayList({ set, groupName, guidedLabels, onOpenGuide, nowMinutes }: {
  set: DayPlanSet | undefined;
  groupName?: string | null;
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
        const slots = excitingSlotsFor(entry, groupName);
        const isToday = date === today;
        return (
          <section key={date} id={`exciting-${date}`} className="scroll-mt-4">
            {/* 제목 — 시간표 아래 붙는 인문학 표와 같은 모양 */}
            <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
              <h3 className="text-sm font-semibold text-gray-900">
                {monthDayLabel(date)} ({weekdayOf(date)}) {findDayKind(entry.kind)?.short ?? 'Exciting Day'}
              </h3>
              {isToday && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">{L('schedule.today')}</span>}
              {entry.note && <span className="text-xs text-gray-500">{entry.note}</span>}
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


// ─── 편집 (관리자) ─────────────────────────────────────────────────────

const newId = () => Math.random().toString(36).slice(2, 10);

export function DayPlanEditor({
  campCode,
  plan: initial,
  groups,
  start,
  end,
  initialGroup,
  actorName,
  onClose,
  onSaved,
}: {
  campCode: string;
  plan: CampDayPlan | null;
  groups: string[];
  start: Date | null;
  end: Date | null;
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
  const [error, setError] = useState<string | null>(null);
  // 익사이팅 활동의 세부페이지 — 시간표 칸 설명과 같은 곳(campSettings.timetableGuides)에 활동 이름으로 저장
  const [guides, setGuidesRaw] = useState<Record<string, TimetableGuide> | null>(null);
  useEffect(() => {
    getCampTimetableGuides(db, campCode).then(setGuidesRaw).catch(() => setGuidesRaw({}));
  }, [campCode]);
  const setGuides = (fn: (prev: Record<string, TimetableGuide>) => Record<string, TimetableGuide>) => {
    setGuidesRaw((prev) => fn(prev ?? {}));
    setDirty(true);
  };
  const [idx, setIdx] = useState(() => {
    const key = normalizeGroupKey(initialGroup);
    const i = plan.sets.findIndex((s) => s.groups.includes(key));
    return i >= 0 ? i : 0;
  });
  const set = plan.sets[idx];
  const weeks = useMemo(() => calendarWeeks(start, end), [start, end]);

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
        p.sets.forEach((s) => (s.groups = s.groups.filter((x) => x !== key)));
        mine.groups.push(key);
      }
    });

  const addSet = () => {
    update((p) => {
      p.sets.push({ id: newId(), name: '', groups: [], days: JSON.parse(JSON.stringify(set?.days ?? {})) });
    });
    setIdx(plan.sets.length);
  };

  const removeSet = () => {
    if (!set || plan.sets.length <= 1) return;
    if (!window.confirm(L('schedule.deletePlanSetConfirm', { v0: set.name || `#${idx + 1}` }))) return;
    update((p) => p.sets.splice(idx, 1));
    setIdx(0);
  };

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
    setSaving(true);
    setError(null);
    try {
      const saved = await saveCampDayPlan(db, campCode, plan, actorName);
      if (guides) await updateCampTimetableGuides(db, campCode, guides, actorName);
      setDirty(false);
      onSaved(saved);
    } catch (e) {
      setError((e as Error)?.message || L('common.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (dirty && !window.confirm(L('schedule.discardChanges'))) return;
    onClose();
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
    <div className="pb-24 pt-2">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-gray-900">{L('schedule.editDayPlan')}</h2>
        <div className="flex gap-2">
          <button onClick={close} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
            {L('common.cancel')}
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? L('common.saving') : L('common.save')}
          </button>
        </div>
      </div>
      {error && <p className="mb-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      {/* 세트 */}
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {plan.sets.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setIdx(i)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${i === idx ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {s.name || `#${i + 1}`}
          </button>
        ))}
        <button onClick={addSet} className="rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
          + {L('schedule.addPlanSet')}
        </button>
      </div>

      {set && (
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border border-gray-200 p-3">
            <label className="block text-[11px] font-semibold text-gray-500">{L('schedule.planSetName')}</label>
            <input
              value={set.name}
              onChange={(e) => update((p) => (p.sets[idx].name = e.target.value))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
            <label className="block pt-1 text-[11px] font-semibold text-gray-500">{L('schedule.planSetGroups')}</label>
            <div className="flex flex-wrap gap-1">
              {groups.map((g) => {
                const on = set.groups.includes(normalizeGroupKey(g));
                return (
                  <button
                    key={g}
                    onClick={() => toggleGroup(g)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'}`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-400">{L('schedule.planSetGroupsHint')}</p>
            {plan.sets.length > 1 && (
              <button onClick={removeSet} className="text-[11px] text-red-500 hover:underline">
                {L('schedule.deletePlanSet')}
              </button>
            )}
          </div>

          {/* 날짜별 Day */}
          <div>
            <p className="mb-1.5 text-[11px] text-gray-500">{L('schedule.dayPlanCalendarHint')}</p>
            {weeks.length ? (
              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="rounded-md bg-amber-200/80 py-1 text-center text-[10px] font-semibold text-gray-800">{w}</div>
                ))}
                {weeks.flat().map((date, i) => {
                  if (!date) return <div key={`x${i}`} />;
                  const kind = set.days[date]?.kind ?? '';
                  return (
                    <div key={date} className="overflow-hidden rounded-md border border-gray-200">
                      <div className="bg-white py-0.5 text-center text-[10px] tabular-nums text-gray-600">{monthDayLabel(date)}</div>
                      <select
                        value={kind}
                        onChange={(e) => setDay(date, e.target.value as DayKind | '')}
                        className="w-full border-0 px-0.5 py-1.5 text-[10px] outline-none sm:text-xs"
                        style={{ backgroundColor: findDayKind(kind)?.color ?? '#fff' }}
                      >
                        <option value="">—</option>
                        {DAY_KINDS.map((k) => (
                          <option key={k.key} value={k.key}>{dayKindMini(k.key, campCode)}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400">{L('schedule.campDatesMissing')}</p>
            )}
          </div>

          {/* 익사이팅 활동 */}
          <div className="space-y-2">
            <div>
              <h3 className="text-sm font-bold text-gray-900">{L('schedule.excitingSlots')}</h3>
              <p className="text-[11px] text-gray-500">{L('schedule.excitingSlotsHint')}</p>
            </div>
            {!exciting.length && <p className="text-xs text-gray-400">{L('schedule.noExcitingDays')}</p>}
            {exciting.map((date) => {
              const entry = set.days[date];
              const g = slotGroup[date] ?? '';
              const current = slotsOf(entry, g);
              // 복사해 올 수 있는 활동표 — 다른 날·다른 그룹 것까지
              const sources = exciting.flatMap((d) => [
                ...(set.days[d]?.slots?.length ? [{ value: `${d}|`, label: `${monthDayLabel(d)} · ${L('schedule.slotsCommon')}` }] : []),
                ...Object.keys(set.days[d]?.slotsByGroup ?? {}).map((k) => ({ value: `${d}|${k}`, label: `${monthDayLabel(d)} · ${groupName(k)}` })),
              ]).filter((x) => x.value !== `${date}|${g}`);
              return (
                <div key={date} className="rounded-xl border border-amber-200 bg-[#fffef0] p-2.5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold tabular-nums">{monthDayLabel(date)}</span>
                    <span className="text-xs text-gray-500">{weekdayOf(date)}</span>
                    {sources.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const [d, k] = e.target.value.split('|');
                          const from = slotsOf(set.days[d], k ?? '');
                          setSlots(date, () => from.map((s) => ({ ...s, id: newId() })));
                        }}
                        className="ml-auto rounded border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-600"
                      >
                        <option value="">{L('schedule.copySlotsFrom')}</option>
                        {sources.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                      </select>
                    )}
                  </div>
                  {/* 그룹별 활동표 — 공통 하나로 충분하면 공통만, 그룹마다 가는 곳이 다르면 그룹을 골라 따로 */}
                  {set.groups.length > 1 && (
                    <div className="mb-2 flex flex-wrap items-center gap-1">
                      {['', ...set.groups].map((k) => {
                        const on = k === g;
                        const own = k ? !!entry.slotsByGroup?.[k]?.length : !!entry.slots?.length;
                        return (
                          <button key={k || 'common'} type="button" onClick={() => setSlotGroup((m) => ({ ...m, [date]: k }))}
                            className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${on ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-200 bg-white text-gray-600'}`}>
                            {k ? groupName(k) : L('schedule.slotsCommon')}{own ? ' •' : ''}
                          </button>
                        );
                      })}
                      <span className="text-[10px] text-gray-400">{g ? L('schedule.slotsGroupHint', { v0: groupName(g) }) : L('schedule.slotsCommonHint')}</span>
                    </div>
                  )}
                  <input
                    value={entry.note ?? ''}
                    onChange={(e) => update((p) => (p.sets[idx].days[date].note = e.target.value))}
                    placeholder={L('schedule.memo')}
                    className="mb-2 w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-400"
                  />
                  <div className="space-y-1.5">
                    {current.map((s, si) => (
                      <div key={s.id} className="grid grid-cols-[auto_auto_1fr_1fr_auto] items-center gap-1 max-sm:grid-cols-[auto_auto_1fr_auto]">
                        <input type="time" value={s.start} onChange={(e) => setSlots(date, (xs) => xs.map((x, j) => (j === si ? { ...x, start: e.target.value } : x)))}
                          className="rounded border border-gray-200 bg-white px-1 py-1 text-xs tabular-nums" />
                        <input type="time" value={s.end} onChange={(e) => setSlots(date, (xs) => xs.map((x, j) => (j === si ? { ...x, end: e.target.value } : x)))}
                          className="rounded border border-gray-200 bg-white px-1 py-1 text-xs tabular-nums" />
                        <input value={s.activity} placeholder={L('schedule.excitingPlaceholderActivity')}
                          onChange={(e) => setSlots(date, (xs) => xs.map((x, j) => (j === si ? { ...x, activity: e.target.value } : x)))}
                          className="min-w-0 rounded border border-gray-200 bg-white px-2 py-1 text-xs" />
                        <input value={s.place} placeholder={L('schedule.excitingPlaceholderPlace')}
                          onChange={(e) => setSlots(date, (xs) => xs.map((x, j) => (j === si ? { ...x, place: e.target.value } : x)))}
                          className="min-w-0 rounded border border-gray-200 bg-white px-2 py-1 text-xs max-sm:col-span-3 max-sm:col-start-1" />
                        <button onClick={() => setSlots(date, (xs) => xs.filter((_, j) => j !== si))}
                          className="px-1 text-sm text-gray-400 hover:text-red-500" aria-label={L('common.delete')}>✕</button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setSlots(date, (xs) => {
                      const last = xs[xs.length - 1];
                      return [...xs, { id: newId(), start: last?.end ?? '09:00', end: '', activity: '', place: last?.place ?? '' }];
                    })}
                    className="mt-2 text-xs font-semibold text-blue-600 hover:underline"
                  >
                    + {L('schedule.addSlot')}
                  </button>
                </div>
              );
            })}
          </div>

          {/* 활동 세부페이지 — 익사이팅 탭에서 활동을 누르면 뜬다 */}
          {activityLabels.length > 0 && guides && (
            <div>
              <p className="mb-1.5 text-[11px] text-gray-500">{L('schedule.excitingGuideHint')}</p>
              <GuideEditorPanel campCode={campCode} labels={activityLabels} guides={guides} setGuides={setGuides} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
