'use client';

/**
 * [익사이팅] 탭 — 익사이팅·야외 날의 활동표.
 * 코스(장소별 하루 일정)를 한 번만 만들고, 날짜 × 그룹 배정표에서 칸마다 코스만 고른다.
 * 한 그룹만 그날 다르면 그 칸만 '직접 입력'. 저장은 편집기의 [저장] 한 번 —
 * 코스 활동표는 저장할 때 각 칸(slotsByGroup)에 옮겨 적혀 보기 화면·환자 위치·옛 앱도 그대로 읽는다.
 */
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  daySetForGroup,
  dayKindMini,
  excitingCourses as EC,
  guideKeyOf,
  monthDayLabel,
  normalizeGroupKey,
  timetableWorkspace as W,
  type CampDayPlan,
  type ExcitingSlot,
} from '@smis-mentor/shared';
import { GuidePanel } from './GuidePanel';
import {
  FieldLabel,
  Modal,
  Popover,
  SectionTitle,
  btnCls,
  btnDangerCls,
  btnPrimaryCls,
  inputCls,
  linkBtnCls,
  rectOf,
  weekdayKo,
  type AnchorRect,
  type WsUpdate,
} from './ui';

type CellRef = { date: string; group: string };
type SlotsEdit = (fn: (xs: ExcitingSlot[]) => ExcitingSlot[], key?: string) => void;

const dateText = (d: string) => `${monthDayLabel(d)} (${weekdayKo(d)})`;

/**
 * 처음 열 때 코스가 하나도 없으면 같은 활동표끼리 자동으로 묶는다 (한 번만 — 되돌리면 다시 묶지 않는다).
 * 불러온 상태(ws.base)마다 한 번 — 저장하거나 다시 불러오면 새 base 가 된다.
 */
const autoGroupedBases = new WeakSet<object>();

/** 칸에 보일 이름 — 코스면 코스 이름, 직접 입력이면 활동표의 현장 장소 */
const placeOf = (slots: ExcitingSlot[]) => EC.courseNameFromSlots(slots) || `활동 ${slots.length}개`;

/** 활동 줄 편집 — 코스와 '직접 입력' 칸이 같이 쓴다 */
function SlotRows({ slots, onChange, keyPrefix }: { slots: ExcitingSlot[]; onChange: SlotsEdit; keyPrefix: string }) {
  const field = 'min-w-0 rounded border border-gray-200 bg-white px-1.5 py-1 text-xs focus:border-blue-400 focus:outline-none';
  return (
    <div className="space-y-1.5">
      {!slots.length && <p className="rounded-md border border-dashed border-gray-200 px-3 py-4 text-center text-[11px] text-gray-400">아직 활동이 없습니다.</p>}
      {slots.map((s, i) => {
        const patch = (f: keyof ExcitingSlot, v: string) =>
          onChange((xs) => xs.map((x, j) => (j === i ? { ...x, [f]: v } : x)), `${keyPrefix}:${s.id}:${f}`);
        return (
          // 줄 순서로 key — 공통 활동표를 처음 고칠 때 id 가 새로 생겨도 입력칸이 그대로 남게
          <div key={i} className="rounded-md border border-gray-200 bg-white p-1.5">
            <div className="flex items-center gap-1">
              <input type="time" value={s.start} onChange={(e) => patch('start', e.target.value)} className={`${field} w-[112px] shrink-0 tabular-nums`} aria-label="시작" />
              <span className="text-[10px] text-gray-400">~</span>
              <input type="time" value={s.end} onChange={(e) => patch('end', e.target.value)} className={`${field} w-[112px] shrink-0 tabular-nums`} aria-label="끝" />
              <input value={s.activity} onChange={(e) => patch('activity', e.target.value)} placeholder="활동" className={`${field} flex-1 font-medium`} />
              <button type="button" onClick={() => onChange((xs) => xs.filter((_, j) => j !== i))} className="px-1 text-sm text-gray-400 hover:text-red-500" aria-label="활동 삭제">
                ✕
              </button>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1">
              <input value={s.place} onChange={(e) => patch('place', e.target.value)} placeholder="장소" className={field} />
              <input value={s.note ?? ''} onChange={(e) => patch('note', e.target.value)} placeholder="메모 (작게)" className={field} />
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() =>
          onChange((xs) => {
            const last = xs[xs.length - 1];
            return [...xs, { id: EC.newSlotId(), start: last?.end ?? '09:00', end: '', activity: '', place: '' }];
          })
        }
        className={linkBtnCls}
      >
        + 활동
      </button>
    </div>
  );
}

/** [코스로 묶기] — 같은 활동표끼리 */
function SuggestDialog({
  suggestions,
  groupName,
  onApply,
  onClose,
}: {
  suggestions: EC.CourseSuggestion[];
  groupName: (key: string) => string;
  onApply: (choose: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [pick, setPick] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(suggestions.map((x) => [x.key, x.variantOf ? null : x.name]))
  );
  const chosen = Object.entries(pick).filter((e): e is [string, string] => e[1] !== null);
  const sites = (xs: ExcitingSlot[]) =>
    xs
      .filter((s) => s.place && !/식당|버스|숙소|강의실/.test(s.place))
      .map((s) => `${s.start} ${s.activity}`)
      .slice(0, 4)
      .join(' · ');
  return (
    <Modal
      title="같은 활동표끼리 코스로 묶기"
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={btnCls}>
            취소
          </button>
          <button type="button" disabled={!chosen.length} onClick={() => onApply(Object.fromEntries(chosen))} className={btnPrimaryCls}>
            {chosen.length}개 묶기
          </button>
        </>
      }
    >
      <p className="mb-3 text-[11px] text-gray-500">
        묶은 칸은 코스를 고친 대로 함께 바뀝니다. 그날만 다른 일정(예: 마지막 날 용돈 금액)은 묶지 말고 &lsquo;직접 입력&rsquo;으로 두세요.
      </p>
      <div className="space-y-2">
        {suggestions.map((x) => {
          const on = pick[x.key] !== null;
          return (
            <div key={x.key} className={`rounded-lg border p-2.5 ${on ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setPick((m) => ({ ...m, [x.key]: on ? null : x.name }))}
                  className="h-4 w-4 accent-blue-600"
                  aria-label={`${x.name} 묶기`}
                />
                {x.courseId ? (
                  <span className="text-xs font-semibold text-gray-900">
                    기존 코스 「{x.name}」에 잇기
                  </span>
                ) : (
                  <input
                    value={pick[x.key] ?? x.name}
                    disabled={!on}
                    onChange={(e) => setPick((m) => ({ ...m, [x.key]: e.target.value }))}
                    className={`${inputCls} max-w-xs font-semibold disabled:bg-gray-50 disabled:text-gray-400`}
                  />
                )}
                <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-500">{x.cells.length}칸</span>
              </div>
              <p className="mt-1 pl-6 text-[11px] text-gray-600">{x.cells.map((c) => `${monthDayLabel(c.date)} ${groupName(c.group)}`).join(' · ')}</p>
              {x.slots.length > 0 ? (
                <p className="mt-0.5 pl-6 text-[10px] text-gray-400">
                  활동 {x.slots.length}개{sites(x.slots) ? ` — ${sites(x.slots)}` : ''}
                </p>
              ) : (
                <p className="mt-0.5 pl-6 text-[10px] text-gray-400">그날 메모(장소 이름)만 있는 칸 — 활동은 코스에서 채우면 됩니다.</p>
              )}
              {x.variantOf && (
                <p className="mt-1 pl-6 text-[11px] text-amber-700">
                  「{x.variantOf.name}」와 {x.variantOf.diff}줄만 다릅니다 — 그날만 다른 일정이면 묶지 말고 &lsquo;직접 입력&rsquo;으로 두세요.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export function ExcitingTab({
  ws,
  update,
  campCode,
  groups,
  onGoPlan,
}: {
  ws: W.Workspace;
  update: WsUpdate;
  campCode: string;
  /** 캠프 그룹 이름들 (화면 표기) */
  groups: string[];
  onGoPlan: () => void;
}) {
  const plan = ws.cur.dayPlan;
  const courses = EC.coursesOf(plan);
  const dates = useMemo(() => EC.activityDates(plan), [plan]);
  /** 활동 날이 하나도 없는 그룹 열은 숨긴다 */
  const cols = useMemo(() => groups.filter((g) => dates.some((d) => EC.cellState(plan, d, g).type !== 'off')), [groups, dates, plan]);
  const suggestions = useMemo(() => EC.suggestCourses(plan, groups), [plan, groups]);
  const actionable = suggestions.filter((x) => !x.variantOf);
  const [courseId, setCourseId] = useState<string | null>(null);
  const course = EC.courseById(plan, courseId) ?? courses[0] ?? null;
  const [cell, setCell] = useState<CellRef | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [menu, setMenu] = useState<(CellRef & { anchor: AnchorRect }) | null>(null);
  /** 자동으로 묶은 결과 — cur 가 그때 그대로면 [묶기 취소] 로 한 번에 되돌린다 */
  const [autoNote, setAutoNote] = useState<{ created: number; linked: number; cur: W.EditState } | null>(null);

  const editPlan = (fn: (p: CampDayPlan) => void, key?: string) =>
    update((w) =>
      W.editDayPlan(
        w,
        (p) => {
          fn(p);
        },
        key
      )
    );
  const groupName = (key: string) => groups.find((g) => normalizeGroupKey(g) === normalizeGroupKey(key)) ?? key;
  const usage = (id: string) => EC.courseUsage(plan, id);
  const activityLabels = useMemo(() => {
    const seen = new Map<string, string>();
    W.dayPlanActivityLabels(plan).forEach((l) => {
      const k = guideKeyOf(l);
      if (k && !seen.has(k)) seen.set(k, l.trim());
    });
    return [...seen.values()];
  }, [plan]);

  // 처음 열 때 — 코스가 없으면 같은 활동표끼리 묶어 둔다 (저장 전 · 되돌리기 가능)
  useEffect(() => {
    if (autoGroupedBases.has(ws.base)) return;
    autoGroupedBases.add(ws.base);
    if (EC.coursesOf(ws.cur.dayPlan).length) return;
    if (!EC.suggestCourses(ws.cur.dayPlan, groups).some((x) => !x.variantOf)) return;
    let r = { created: 0, linked: 0 };
    const next = editPlan((p) => {
      r = EC.applySuggestions(p, groups);
    });
    if (r.created) setAutoNote({ ...r, cur: next.cur });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 코스 ──────────────────────────────────────────────────────────
  const addCourse = () => {
    let id = '';
    editPlan((p) => {
      id = EC.addCourse(p);
    });
    setCourseId(id);
  };
  const removeCourse = (id: string, name: string) => {
    const n = usage(id).length;
    const msg = n
      ? `코스 "${name}" 를 지울까요?\n이 코스를 고른 ${n}칸은 활동표를 그대로 가진 '직접 입력' 칸이 됩니다. (저장을 눌러야 반영)`
      : `코스 "${name}" 를 지울까요? (저장을 눌러야 반영)`;
    if (!window.confirm(msg)) return;
    editPlan((p) => void EC.deleteCourse(p, id));
    setCourseId(null);
  };
  const applySuggest = (choose: Record<string, string>) => {
    let r = { created: 0, linked: 0 };
    editPlan((p) => {
      r = EC.applySuggestions(p, groups, choose);
    });
    setSuggestOpen(false);
    toast.success(`코스 ${r.created}개를 만들고 ${r.linked}칸을 이었습니다 — 저장을 눌러야 반영됩니다`, { duration: 4000 });
  };

  // ── 칸 ───────────────────────────────────────────────────────────
  const sameCell = (a: CellRef | null, b: CellRef) => !!a && a.date === b.date && normalizeGroupKey(a.group) === normalizeGroupKey(b.group);
  const assign = (c: CellRef, id: string | null) => {
    const st = EC.cellState(plan, c.date, c.group);
    if (!(st.type === 'course' && st.course.id === id) && !(st.type === 'empty' && !id)) editPlan((p) => EC.assignCourse(p, c.date, c.group, id));
    if (sameCell(cell, c)) setCell(null);
    setMenu(null);
  };
  const direct = (c: CellRef) => {
    if (EC.cellState(plan, c.date, c.group).type === 'course') editPlan((p) => EC.detachCell(p, c.date, c.group));
    setCell({ date: c.date, group: c.group });
    setMenu(null);
  };
  const newCourseFor = (c: CellRef) => {
    let id = '';
    editPlan((p) => {
      id = EC.addCourse(p);
      EC.assignCourse(p, c.date, c.group, id);
    });
    setCourseId(id);
    setMenu(null);
  };
  const cellOpen = cell ? EC.cellState(plan, cell.date, cell.group) : null;
  const saveCellAsCourse = () => {
    if (!cell) return;
    let id = '';
    editPlan((p) => {
      id = EC.saveCellAsCourse(p, cell.date, cell.group, undefined, groups);
    });
    if (id) {
      setCourseId(id);
      setCell(null);
      toast.success('코스로 만들었습니다 — 똑같은 활동표 칸도 함께 이었습니다');
    }
  };

  const coursePanel = (
    <aside className="h-fit space-y-3 rounded-lg border border-gray-200 p-3 lg:sticky lg:top-3">
      <SectionTitle
        scope="camp"
        right={
          <button type="button" onClick={addCourse} className={linkBtnCls}>
            + 코스
          </button>
        }
      >
        코스 ({courses.length})
      </SectionTitle>
      <p className="-mt-1 text-[10px] text-gray-500">장소별 하루 일정 — 한 번 만들면 이 코스를 고른 모든 날·그룹에 같이 쓰입니다.</p>
      {courses.length ? (
        <div className="space-y-1">
          {courses.map((c) => {
            const on = c.id === course?.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCourseId(c.id)}
                className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs ${
                  on ? 'border-blue-500 bg-blue-50 font-semibold text-gray-900' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="h-3 w-3 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: c.color ?? '#fff' }} />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="shrink-0 text-[10px] font-normal tabular-nums text-gray-400">
                  활동 {c.slots.length} · {usage(c.id).length}칸
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-gray-200 px-3 py-4 text-center text-[11px] text-gray-400">
          아직 코스가 없습니다. [+ 코스] 로 만들거나 위의 [코스로 묶기] 를 쓰세요.
        </p>
      )}
      {course && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <label className="block">
            <FieldLabel>코스 이름</FieldLabel>
            <input
              value={course.name}
              onChange={(e) => editPlan((p) => EC.editCourse(p, course.id, (c) => (c.name = e.target.value)), `course:${course.id}:name`)}
              className={`${inputCls} font-semibold`}
              placeholder="예: 박물관은 살아있다 · 런닝맨"
            />
          </label>
          <div>
            <FieldLabel>배정표 색</FieldLabel>
            <div className="flex flex-wrap gap-1">
              {EC.COURSE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => editPlan((p) => EC.editCourse(p, course.id, (x) => (x.color = c)))}
                  className={`h-5 w-5 rounded border ${course.color === c ? 'border-blue-600 ring-2 ring-blue-300' : 'border-gray-300'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <FieldLabel>활동 ({course.slots.length})</FieldLabel>
            <SlotRows
              slots={course.slots}
              keyPrefix={`course:${course.id}`}
              onChange={(fn, key) => editPlan((p) => EC.editCourse(p, course.id, (c) => (c.slots = fn(c.slots))), key)}
            />
          </div>
          <div>
            <FieldLabel>쓰는 칸</FieldLabel>
            {usage(course.id).length ? (
              <p className="text-[11px] leading-relaxed text-gray-700">
                {usage(course.id)
                  .map((u) => `${monthDayLabel(u.date)} ${groupName(u.group)}`)
                  .join(' · ')}
              </p>
            ) : (
              <p className="text-[11px] text-gray-400">아직 고른 칸이 없습니다 — 왼쪽 표에서 고르세요.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1 border-t border-gray-100 pt-2">
            <button type="button" onClick={() => editPlan((p) => EC.moveCourse(p, course.id, -1))} className={btnCls} aria-label="위로">
              ▲
            </button>
            <button type="button" onClick={() => editPlan((p) => EC.moveCourse(p, course.id, 1))} className={btnCls} aria-label="아래로">
              ▼
            </button>
            <button
              type="button"
              onClick={() => {
                let id = '';
                editPlan((p) => {
                  id = EC.duplicateCourse(p, course.id);
                });
                if (id) setCourseId(id);
              }}
              className={btnCls}
            >
              복제
            </button>
            <button type="button" onClick={() => removeCourse(course.id, course.name)} className={`${btnDangerCls} ml-auto`}>
              코스 삭제
            </button>
          </div>
        </div>
      )}
    </aside>
  );

  return (
    <div className="space-y-4 pb-24">
      <div className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-600">
        <b className="text-gray-800">코스</b>(장소별 하루 일정)를 한 번 만들고, 표에서 날짜·그룹마다 코스만 고릅니다. 한 그룹만 그날 다르면 그 칸만
        &lsquo;직접 입력&rsquo;으로 바꾸세요. Day(Exciting·Outdoor) 자체는 [일정표] 탭에서 정합니다.
      </div>

      {autoNote && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-xs text-emerald-900">
            같은 활동표끼리 <b>코스 {autoNote.created}개</b>로 묶었습니다 ({autoNote.linked}칸). 확인한 뒤 [저장]을 누르면 반영됩니다. 몇 줄만 다른 날은 &lsquo;직접&rsquo;으로 남겨 두었습니다.
          </p>
          {ws.cur === autoNote.cur && (
            <button
              type="button"
              onClick={() => {
                update((w) => W.undo(w));
                setAutoNote(null);
              }}
              className={`${btnCls} ml-auto`}
            >
              묶기 취소
            </button>
          )}
          <button type="button" onClick={() => setAutoNote(null)} className={`${ws.cur === autoNote.cur ? '' : 'ml-auto '}text-xs text-emerald-700 hover:underline`}>
            확인
          </button>
        </div>
      )}

      {actionable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-900">
            코스로 묶지 않은 칸 {actionable.reduce((n, x) => n + x.cells.length, 0)}개 — 같은 활동표끼리 묶으면 새 코스{' '}
            {actionable.filter((x) => !x.courseId).length}개
            {actionable.some((x) => x.courseId) ? ` · 기존 코스에 잇기 ${actionable.filter((x) => x.courseId).reduce((n, x) => n + x.cells.length, 0)}칸` : ''}
          </p>
          <button type="button" onClick={() => setSuggestOpen(true)} className={`${btnPrimaryCls} ml-auto`}>
            코스로 묶기…
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="min-w-0 space-y-4">
          <section>
            <SectionTitle scope="camp">날짜별 코스</SectionTitle>
            {!dates.length ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/70 px-6 py-10 text-center">
                <p className="text-sm font-medium text-gray-700">일정표에 익사이팅·야외 날이 없습니다</p>
                <p className="mt-1 text-xs text-gray-500">[일정표] 탭에서 날짜를 Exciting / Outdoor 로 정하면 여기에 나옵니다. 코스는 먼저 만들어 둘 수 있습니다.</p>
                <button type="button" onClick={onGoPlan} className={`${btnCls} mt-3`}>
                  일정표 탭으로
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[520px] table-fixed border-collapse text-xs">
                  <colgroup>
                    <col className="w-[88px]" />
                    {cols.map((g) => (
                      <col key={g} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border-b border-r border-gray-200 px-2 py-1.5 text-[10px] font-medium text-gray-500">날짜</th>
                      {cols.map((g) => (
                        <th key={g} className="border-b border-r border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-900 last:border-r-0">
                          {g}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dates.map((d) => (
                      <tr key={d}>
                        <td className="border-b border-r border-gray-200 px-2 py-1 text-center text-[11px] font-semibold tabular-nums text-gray-700">{dateText(d)}</td>
                        {cols.map((g) => {
                          const st = EC.cellState(plan, d, g);
                          const entry = daySetForGroup(plan, g)?.days[d];
                          if (st.type === 'off') {
                            return (
                              <td key={g} className="border-b border-r border-gray-200 bg-gray-50/60 px-1 py-1 text-center text-[10px] text-gray-300 last:border-r-0" title="이 그룹은 이 날 익사이팅·야외 날이 아닙니다 (일정표 탭)">
                                {st.kind ? dayKindMini(st.kind, campCode) : '—'}
                              </td>
                            );
                          }
                          const hot = st.type === 'course' && st.course.id === course?.id;
                          const open = sameCell(cell, { date: d, group: g }) || sameCell(menu, { date: d, group: g });
                          const label = st.type === 'course' ? st.course.name : st.type === 'own' || st.type === 'common' ? placeOf(st.slots) : '코스 고르기';
                          return (
                            <td key={g} className="border-b border-r border-gray-200 p-1 align-top last:border-r-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  const anchor = rectOf(e.currentTarget);
                                  if (anchor) setMenu({ date: d, group: g, anchor });
                                }}
                                data-keep-popover
                                aria-label={`${dateText(d)} ${g} — ${label}`}
                                className={`group flex w-full items-center gap-1 rounded-md border px-2 py-2 text-left transition hover:brightness-95 ${
                                  open ? 'border-amber-500 ring-2 ring-amber-300' : hot ? 'border-blue-500 ring-2 ring-blue-300' : st.type === 'empty' ? 'border-dashed border-gray-300' : 'border-black/10'
                                }`}
                                style={{ backgroundColor: st.type === 'course' ? st.course.color ?? '#fff' : st.type === 'empty' ? '#fff' : '#fffef0' }}
                              >
                                <span className={`min-w-0 flex-1 truncate text-[11px] font-semibold ${st.type === 'empty' ? 'font-normal text-gray-400' : 'text-gray-900'}`}>
                                  {label}
                                </span>
                                {entry?.kind === 'outdoor' && <span className="shrink-0 rounded bg-rose-100 px-1 text-[9px] font-semibold text-rose-700">야외</span>}
                                {st.type === 'own' && <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-800">직접</span>}
                                {st.type === 'common' && <span className="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-800">공통</span>}
                                <svg className="h-3 w-3 shrink-0 text-gray-400 group-hover:text-gray-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                </svg>
                              </button>
                              {st.type === 'empty' && entry?.note && <p className="mt-0.5 truncate px-1 text-[9px] text-gray-400">{entry.note}</p>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {cell && cellOpen && (cellOpen.type === 'own' || cellOpen.type === 'common') && (
            <section className="rounded-xl border border-amber-200 bg-[#fffef0] p-3">
              <SectionTitle
                right={
                  <>
                    <button type="button" onClick={saveCellAsCourse} disabled={!cellOpen.slots.length} className={btnCls}>
                      코스로 저장
                    </button>
                    <button type="button" onClick={() => setCell(null)} className={btnCls}>
                      닫기
                    </button>
                  </>
                }
              >
                {dateText(cell.date)} · {groupName(cell.group)} — 이 칸만 직접 입력
              </SectionTitle>
              {cellOpen.type === 'common' && (
                <p className="mb-2 text-[11px] text-amber-800">세트 공통 활동표입니다. 고치면 {groupName(cell.group)} 만 따로 갖게 됩니다.</p>
              )}
              <SlotRows
                slots={cellOpen.slots}
                keyPrefix={`cell:${cell.date}:${normalizeGroupKey(cell.group)}`}
                onChange={(fn, key) => editPlan((p) => EC.editCellSlots(p, cell.date, cell.group, fn), key)}
              />
            </section>
          )}

          <GuidePanel campCode={campCode} labels={activityLabels} ws={ws} update={update} emptyText="활동 이름을 넣으면 그 활동의 설명(세부페이지)을 붙일 수 있습니다." />
        </div>
        {coursePanel}
      </div>

      {menu &&
        (() => {
          const st = EC.cellState(plan, menu.date, menu.group);
          if (st.type === 'off') return null;
          const item = 'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-gray-50';
          return (
            <Popover anchor={menu.anchor} onClose={() => setMenu(null)} width={300} className="!p-1.5">
              <p className="px-2 pb-1 pt-0.5 text-[11px] font-semibold text-gray-500">
                {dateText(menu.date)} · {groupName(menu.group)}
              </p>
              {courses.length ? (
                courses.map((c) => {
                  const on = st.type === 'course' && st.course.id === c.id;
                  return (
                    <button key={c.id} type="button" onClick={() => assign(menu, c.id)} className={`${item} ${on ? 'bg-blue-50 font-semibold' : ''}`}>
                      <span className="h-3.5 w-3.5 shrink-0 rounded-sm border border-black/10" style={{ backgroundColor: c.color ?? '#fff' }} />
                      <span className="min-w-0 flex-1 truncate text-gray-900">{c.name}</span>
                      <span className="shrink-0 text-[10px] text-gray-400">활동 {c.slots.length}</span>
                      {on && <span className="shrink-0 text-blue-600">✓</span>}
                    </button>
                  );
                })
              ) : (
                <p className="px-2 py-1.5 text-[11px] text-gray-400">아직 코스가 없습니다.</p>
              )}
              <div className="my-1 border-t border-gray-100" />
              {st.type === 'own' || st.type === 'common' ? (
                <button type="button" onClick={() => direct(menu)} className={item}>
                  <span className="w-3.5 shrink-0 text-center">✎</span>
                  <span className="flex-1">이 칸 활동 고치기 (직접 입력 {st.slots.length})</span>
                </button>
              ) : (
                <button type="button" onClick={() => direct(menu)} className={item}>
                  <span className="w-3.5 shrink-0 text-center">✎</span>
                  <span className="flex-1">직접 입력 (이 칸만)</span>
                </button>
              )}
              <button type="button" onClick={() => newCourseFor(menu)} className={item}>
                <span className="w-3.5 shrink-0 text-center text-blue-600">+</span>
                <span className="flex-1 text-blue-700">새 코스 만들어 고르기</span>
              </button>
              {st.type !== 'empty' && st.type !== 'common' && (
                <button type="button" onClick={() => assign(menu, null)} className={`${item} text-gray-500`}>
                  <span className="w-3.5 shrink-0 text-center">—</span>
                  <span className="flex-1">비우기</span>
                </button>
              )}
            </Popover>
          );
        })()}

      {suggestOpen && <SuggestDialog suggestions={suggestions} groupName={groupName} onApply={applySuggest} onClose={() => setSuggestOpen(false)} />}
    </div>
  );
}
