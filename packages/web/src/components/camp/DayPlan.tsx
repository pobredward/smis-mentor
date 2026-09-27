'use client';

/**
 * 시간표 탭의 '전체'(일정표)·'익사이팅' 화면과 관리자 일정표 편집기.
 * 데이터: campSettings/{campCode}.dayPlan (shared/types/campDayPlan.ts)
 */
import { useMemo, useState } from 'react';
import {
  DAY_KINDS,
  L,
  calendarWeeks,
  dayKindLabel,
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
import { db } from '@/lib/firebase';

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

export function ExcitingDayList({ set, focusDate }: { set: DayPlanSet | undefined; focusDate?: string | null }) {
  const dates = excitingDates(set);
  const today = localYmd(new Date());
  if (!dates.length) return <p className="py-10 text-center text-xs text-gray-400">{L('schedule.noExcitingDays')}</p>;
  return (
    <div className="space-y-3">
      {dates.map((date) => {
        const entry = set!.days[date];
        const focused = date === focusDate;
        return (
          <section
            key={date}
            id={`exciting-${date}`}
            className={`overflow-hidden rounded-xl border ${focused ? 'border-amber-400 ring-2 ring-amber-300' : 'border-gray-200'}`}
          >
            <div className="flex items-center gap-2 bg-[#fefcc4] px-3 py-2">
              <span className="text-sm font-bold tabular-nums text-gray-900">{monthDayLabel(date)}</span>
              <span className="text-xs text-gray-500">{weekdayOf(date)}</span>
              <span className="text-xs font-semibold text-gray-700">Exciting Day</span>
              {date === today && <span className="ml-auto rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">{L('schedule.today')}</span>}
            </div>
            {entry.note && <p className="border-b border-gray-100 px-3 py-1.5 text-xs text-gray-600">{entry.note}</p>}
            {entry.slots?.length ? (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[10px] text-gray-400">
                    <th className="w-[92px] px-3 py-1 font-medium">{L('schedule.time')}</th>
                    <th className="px-2 py-1 font-medium">{L('schedule.activity')}</th>
                    <th className="px-2 py-1 font-medium">{L('schedule.place')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.slots.map((s) => (
                    <tr key={s.id} className="border-b border-gray-50 last:border-0 align-top">
                      <td className="px-3 py-1.5 tabular-nums text-gray-500">{s.start}~{s.end}</td>
                      <td className="px-2 py-1.5 font-medium text-gray-900">
                        {s.activity}
                        {s.note && <p className="text-[10px] font-normal text-gray-400">{s.note}</p>}
                      </td>
                      <td className="px-2 py-1.5 text-gray-700">{s.place}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-3 py-4 text-center text-xs text-gray-400">{L('schedule.noActivities')}</p>
            )}
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

  const setSlots = (date: string, fn: (slots: ExcitingSlot[]) => ExcitingSlot[]) =>
    update((p) => {
      const e = p.sets[idx].days[date];
      if (e) e.slots = fn(e.slots ?? []);
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveCampDayPlan(db, campCode, plan, actorName);
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
              const others = exciting.filter((d) => d !== date && set.days[d]?.slots?.length);
              return (
                <div key={date} className="rounded-xl border border-amber-200 bg-[#fffef0] p-2.5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold tabular-nums">{monthDayLabel(date)}</span>
                    <span className="text-xs text-gray-500">{weekdayOf(date)}</span>
                    {others.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          const from = set.days[e.target.value]?.slots ?? [];
                          setSlots(date, () => from.map((s) => ({ ...s, id: newId() })));
                        }}
                        className="ml-auto rounded border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-600"
                      >
                        <option value="">{L('schedule.copySlotsFrom')}</option>
                        {others.map((d) => <option key={d} value={d}>{monthDayLabel(d)}</option>)}
                      </select>
                    )}
                  </div>
                  <input
                    value={entry.note ?? ''}
                    onChange={(e) => update((p) => (p.sets[idx].days[date].note = e.target.value))}
                    placeholder={L('schedule.memo')}
                    className="mb-2 w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-400"
                  />
                  <div className="space-y-1.5">
                    {(entry.slots ?? []).map((s, si) => (
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
        </div>
      )}
    </div>
  );
}
