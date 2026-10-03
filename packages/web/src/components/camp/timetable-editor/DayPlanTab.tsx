'use client';

/**
 * [일정표] 탭 — 세트(그룹 묶음) · 날짜별 Day · 그날 메모.
 * 익사이팅·야외 날의 활동은 [익사이팅] 탭(코스)에서 정한다.
 * 기존 DayPlanEditor 를 작업 공간 위로 옮긴 것 (저장은 편집기의 [저장] 한 번).
 */
import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import {
  DAY_KINDS,
  calendarWeeks,
  dayKindLabel,
  dayKindMini,
  excitingCourses as EC,
  findDayKind,
  isActivityDayKind,
  monthDayLabel,
  normalizeGroupKey,
  timetableWorkspace as W,
  type CampDayPlan,
  type DayKind,
  type DayPlanSet,
} from '@smis-mentor/shared';
import { FieldLabel, SectionTitle, btnDangerCls, btnPrimaryCls, inputCls, shortId, weekdayKo, type WsUpdate } from './ui';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function DayPlanTab({
  ws,
  update,
  campCode,
  groups,
  start,
  end,
  initialGroup,
  onGoExciting,
}: {
  ws: W.Workspace;
  update: WsUpdate;
  campCode: string;
  /** 캠프 그룹 이름들 (화면 표기) */
  groups: string[];
  start: Date | null;
  end: Date | null;
  initialGroup?: string | null;
  onGoExciting: () => void;
}) {
  const sets = ws.cur.dayPlan?.sets ?? [];
  const [setId, setSetId] = useState<string | null>(() => {
    const key = normalizeGroupKey(initialGroup);
    return sets.find((s) => s.groups.includes(key))?.id ?? sets[0]?.id ?? null;
  });
  const set: DayPlanSet | undefined = sets.find((s) => s.id === setId) ?? sets[0];
  const weeks = useMemo(() => calendarWeeks(start, end), [start, end]);
  const allDates = useMemo(() => weeks.flat().filter((d): d is string => !!d), [weeks]);
  const [sel, setSel] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);

  const editPlan = (fn: (p: CampDayPlan) => CampDayPlan | void, key?: string) => update((w) => W.editDayPlan(w, fn, key));
  const editSet = (fn: (s: DayPlanSet) => void, key?: string) => {
    if (!set) return;
    const id = set.id;
    editPlan((p) => {
      const s = p.sets.find((x) => x.id === id);
      if (s) fn(s);
    }, key);
  };
  const groupName = (key: string) => groups.find((g) => normalizeGroupKey(g) === key) ?? key;

  // ── 세트 ──────────────────────────────────────────────────────────
  const createFirst = () => {
    const id = shortId();
    editPlan((p) => {
      p.sets.push({ id, name: groups.join(' · '), groups: groups.map(normalizeGroupKey), days: {} });
    });
    setSetId(id);
  };
  const addSet = () => {
    const id = shortId();
    const days = JSON.parse(JSON.stringify(set?.days ?? {}));
    editPlan((p) => {
      p.sets.push({ id, name: '', groups: [], days });
    });
    setSetId(id);
  };
  const removeSet = () => {
    if (!set || sets.length <= 1) return;
    if (!window.confirm(`세트 "${set.name || '이름 없음'}" 를 지울까요? 저장을 눌러야 반영됩니다.`)) return;
    const id = set.id;
    editPlan((p) => {
      p.sets = p.sets.filter((s) => s.id !== id);
    });
    setSetId(null);
  };
  const toggleGroup = (g: string) => {
    if (!set) return;
    const id = set.id;
    const key = normalizeGroupKey(g);
    editPlan((p) => {
      const mine = p.sets.find((s) => s.id === id);
      if (!mine) return;
      if (mine.groups.includes(key)) mine.groups = mine.groups.filter((x) => x !== key);
      else {
        p.sets.forEach((s) => (s.groups = s.groups.filter((x) => x !== key)));
        mine.groups.push(key);
      }
    });
  };

  // ── 날짜 고르기 ───────────────────────────────────────────────────
  const clickDate = (d: string, e: ReactMouseEvent) => {
    if (e.shiftKey && anchor) {
      const a = allDates.indexOf(anchor);
      const b = allDates.indexOf(d);
      const [i, j] = a < b ? [a, b] : [b, a];
      setSel(allDates.slice(i, j + 1));
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      setSel((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d].sort()));
      setAnchor(d);
      return;
    }
    setSel((s) => (s.length === 1 && s[0] === d ? [] : [d]));
    setAnchor(d);
  };
  const applyKind = (kind: DayKind | null) => {
    if (!set || !sel.length) return;
    const id = set.id;
    const dates = [...sel];
    editPlan((p) => W.setDayKinds(p, id, dates, kind));
  };
  const one = sel.length === 1 ? sel[0] : null;
  const oneEntry = one ? set?.days[one] : undefined;

  /** 달력 칸 — 그날 세트 그룹들이 고른 코스 이름, 없으면 활동 수 */
  const activityText = (date: string): string => {
    const e = set?.days[date];
    if (!e || !isActivityDayKind(e.kind)) return '';
    const names = [...new Set((set?.groups ?? []).map((g) => EC.courseById(ws.cur.dayPlan, e.courseByGroup?.[g])?.name).filter((n): n is string => !!n))];
    if (names.length) return names.join(' / ');
    const n = (e.slots?.length ?? 0) + Object.values(e.slotsByGroup ?? {}).reduce((k, l) => k + l.length, 0);
    return n ? `활동 ${n}` : '';
  };

  if (!sets.length || !set) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-6 py-14 text-center">
        <p className="text-sm font-medium text-gray-700">아직 일정표가 없습니다</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-gray-500">날짜마다 무슨 Day 인지 정하면 보기 화면의 &lsquo;전체&rsquo; 달력과 날짜별 표가 따라옵니다.</p>
        <button type="button" onClick={createFirst} className={`${btnPrimaryCls} mt-4`}>
          일정표 만들기 (모든 그룹 한 세트)
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* 세트 칩 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {sets.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setSetId(s.id);
              setSel([]);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${s.id === set.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {s.name || s.groups.map(groupName).join(' · ') || '이름 없는 세트'}
          </button>
        ))}
        <button type="button" onClick={addSet} className="rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50" title="지금 세트의 날짜를 복사해 새 세트를 만듭니다">
          + 세트
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* 달력 */}
        <div>
          <p className="mb-1.5 text-[11px] text-gray-500">날짜를 눌러 고르고(Shift+클릭 범위, Ctrl/Cmd+클릭 추가) 아래 바에서 Day 를 정합니다.</p>
          {weeks.length ? (
            <div className="grid grid-cols-7 gap-1 select-none">
              {WEEKDAYS.map((w) => (
                <div key={w} className="rounded-md bg-amber-200/80 py-1 text-center text-[10px] font-semibold text-gray-800">
                  {w}
                </div>
              ))}
              {weeks.flat().map((date, i) => {
                if (!date) return <div key={`x${i}`} />;
                const entry = set.days[date];
                const spec = findDayKind(entry?.kind);
                const on = sel.includes(date);
                const activity = activityText(date);
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={(e) => clickDate(date, e)}
                    onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                    className={`flex min-h-[64px] flex-col items-stretch overflow-hidden rounded-md border text-center ${
                      on ? 'border-blue-600 ring-2 ring-blue-400' : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <span className={`py-0.5 text-[10px] tabular-nums ${on ? 'bg-blue-600 font-semibold text-white' : 'bg-white text-gray-600'}`}>{monthDayLabel(date)}</span>
                    <span
                      className="flex flex-1 flex-col items-center justify-center px-0.5 py-1 text-[10px] font-medium leading-tight text-gray-800"
                      style={{ backgroundColor: spec?.color ?? '#fff' }}
                    >
                      <span className="whitespace-pre-line">{entry ? dayKindLabel(entry.kind, campCode) : <span className="text-gray-300">—</span>}</span>
                      {entry?.note && <span className="mt-0.5 line-clamp-1 text-[9px] font-normal text-gray-500">{entry.note}</span>}
                      {activity && <span className="mt-0.5 line-clamp-1 text-[9px] font-normal text-amber-700">{activity}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400">캠프 기간(시작·종료일)이 없어 달력을 그릴 수 없습니다.</p>
          )}

          {sel.length > 0 && (
            <div className="sticky bottom-3 z-20 mt-3 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-xs font-semibold tabular-nums text-gray-900">{sel.length}일 선택</span>
                {DAY_KINDS.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    onClick={() => applyKind(k.key)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-[11px] font-medium text-gray-800 hover:brightness-95"
                    style={{ backgroundColor: k.color }}
                  >
                    {dayKindMini(k.key, campCode)}
                  </button>
                ))}
                <button type="button" onClick={() => applyKind(null)} className="rounded-md border border-dashed border-gray-300 px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50">
                  비우기
                </button>
                <button type="button" onClick={() => setSel([])} className="ml-auto px-2 py-1 text-[11px] text-gray-500 hover:text-gray-800">
                  선택 해제
                </button>
              </div>
              {one && (
                <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2">
                  <span className="shrink-0 text-xs font-medium tabular-nums text-gray-700">
                    {monthDayLabel(one)} ({weekdayKo(one)}) 메모
                  </span>
                  {oneEntry ? (
                    <input
                      value={oneEntry.note ?? ''}
                      onChange={(e) => editSet((s) => void (s.days[one] = { ...s.days[one], note: e.target.value }), `note:${one}`)}
                      placeholder="예: 우천 시 실내"
                      className={inputCls}
                    />
                  ) : (
                    <span className="text-[11px] text-gray-400">먼저 Day 를 정하면 메모를 넣을 수 있습니다.</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 세트 설정 */}
        <aside className="h-fit space-y-2 rounded-lg border border-gray-200 p-3">
          <SectionTitle scope="camp">세트</SectionTitle>
          <label className="block">
            <FieldLabel>세트 이름</FieldLabel>
            <input value={set.name} onChange={(e) => editSet((s) => void (s.name = e.target.value), `setName:${set.id}`)} className={inputCls} placeholder="Spring · Summer" />
          </label>
          <div>
            <FieldLabel>이 일정을 쓰는 그룹</FieldLabel>
            <div className="flex flex-wrap gap-1">
              {groups.map((g) => {
                const on = set.groups.includes(normalizeGroupKey(g));
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGroup(g)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'}`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[10px] text-gray-400">한 그룹은 한 세트에만 들어갑니다. 다른 세트에 있던 그룹을 누르면 이 세트로 옮겨집니다.</p>
          </div>
          {sets.length > 1 && (
            <button type="button" onClick={removeSet} className={btnDangerCls}>
              세트 삭제
            </button>
          )}
        </aside>
      </div>

      {/* 익사이팅·야외 활동은 [익사이팅] 탭 (코스) */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-[#fffef0] px-3 py-2">
        <p className="text-xs text-gray-700">익사이팅·야외 날의 활동은 [익사이팅] 탭에서 코스(장소별 하루 일정)로 정합니다.</p>
        <button type="button" onClick={onGoExciting} className="ml-auto rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50">
          익사이팅 탭으로
        </button>
      </div>
    </div>
  );
}
