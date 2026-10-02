'use client';

/**
 * 원어민 레슨플랜 편집 (/camp/lesson-plan?book=clue-2 · ?id=문서id)
 *
 * - 교재 하나 = 레슨플랜 하나. 같은 교재를 쓰는 반은 내용을 함께 쓰고, 반마다 다른 사정은 반 탭에서
 * - 날짜·Day 번호는 캠프 일정표에서 붙는다 (저장은 순서만) — 규칙은 shared/utils/lessonPlanEngine.ts
 * - 행의 ⋯ : 그날 수업 없음 · 교재 이어하기/밀기 · 액티비티만 밀기 · 앞 수업과 합치기 · 이 날짜에 고정 · 보충 수업
 * - 고칠 때마다 자동 저장 (0.6초 뒤), 되돌리기(Undo)
 * - 본인이 아니면 읽기 전용. 관리자는 승인 · 수정 요청
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getUsersByJobCodeId } from '@/lib/firebaseService';
import BackButton from '@/components/common/BackButton';
import {
  PLAN_RULES,
  PLAN_STATUS_LABEL,
  autoFillLanes,
  bookResources,
  bookUnitsOf,
  classChangeList,
  campScopeOf,
  cellLabel,
  classKeyLabel,
  classTimesFor,
  contextCalendar,
  contextRegular,
  dropForClass,
  getEslBookUnits,
  getLessonPlan,
  insertItem,
  isEmptyPlan,
  isFillerCell,
  layoutPlan,
  listMyLessonPlans,
  loadLessonPlanContext,
  loadMyPlanBooks,
  logger,
  mergeWithPrevious,
  moveItem,
  newId,
  planDayTitle,
  planForBook,
  planLevel,
  planRowActions,
  removeFiller,
  removeItem,
  resolveActiveJobCodeId,
  SAMPLE_KEYS,
  sampleContext,
  sampleFor,
  sampleTipsFor,
  safeLessonUrl,
  saveLessonPlan,
  setLessonPlanStatus,
  setSkip,
  shortDate,
  unitDescriber,
  unitLinks,
  unitOf,
  uncoveredUnits,
  updateItem,
  ACTIVITY_GAMES,
  type LessonPlanContext,
  type LessonPlanDoc,
  type PlanCell,
  type PlanItem,
  type PlanLane,
  type PlanRow,
  type PlanScope,
  type PlanUser,
} from '@smis-mentor/shared';
import {
  ActionSheet,
  ActivityItemSheet,
  BookItemSheet,
  ScopeSheet,
  SkipSheet,
  TextSheet,
  type SheetAction,
  type SkipScope,
} from './PlanDialogs';
import { STATUS_STYLE } from './status';

type Dialog =
  | { type: 'row'; row: PlanRow }
  | { type: 'scope'; title: string; run: (scope: PlanScope) => void }
  | { type: 'skip'; date: string }
  | { type: 'item'; lane: PlanLane; itemId: string; row?: PlanRow; fresh?: boolean }
  | { type: 'text'; field: 'orientation' | 'final' };

type SaveState = 'idle' | 'saving' | 'saved' | 'error';


const laneOf = (p: LessonPlanDoc, lane: PlanLane) => (lane === 'book' ? p.book : p.activity) ?? [];
const laneName = (lane: PlanLane) => (lane === 'book' ? 'Book' : 'Activity');
const rowTitle = (r: PlanRow) => (r.day ? planDayTitle(r.day) : `Lesson ${r.lessonNo ?? ''}`);
const rowSubtitle = (r: PlanRow) => [r.day ? planDayTitle(r.day) : '', r.lessonNo ? `Lesson ${r.lessonNo}` : ''].filter(Boolean).join(' · ');

export default function LessonPlanEditor({ bookKey, planId, sampleKey }: { bookKey?: string; planId?: string; sampleKey?: string }) {
  const { userData, loading: authLoading } = useAuth();
  const uid = userData?.userId ?? '';
  const [ctx, setCtx] = useState<LessonPlanContext | null>(null);
  const [plan, setPlan] = useState<LessonPlanDoc | null>(null);
  const [others, setOthers] = useState<LessonPlanDoc[]>([]);
  const [error, setError] = useState('');
  const [classKey, setClassKey] = useState('');
  const [history, setHistory] = useState<LessonPlanDoc[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [dlg, setDlg] = useState<Dialog | null>(null);
  const [manualCount, setManualCount] = useState(10);
  const [rulesOpen, setRulesOpen] = useState(false);

  const planRef = useRef<LessonPlanDoc | null>(null);
  const createdRef = useRef(true);
  const pendingRef = useRef<LessonPlanDoc | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 샘플 보기 (?sample=reading) — 읽기 전용 완성본 */
  const sample = useMemo(() => (sampleKey ? sampleFor(sampleKey) : null), [sampleKey]);
  const owner = !!plan && !sample && plan.userId === uid;
  const readOnly = !owner;
  const isAdmin = userData?.role === 'admin';

  // ── 불러오기 ───────────────────────────────────────────────────
  useEffect(() => {
    if (!userData) return;
    let alive = true;
    const user: PlanUser = {
      userId: userData.userId,
      name: (userData as { name?: string }).name,
      role: userData.role,
      jobExperiences: (userData.jobExperiences ?? []) as unknown as PlanUser['jobExperiences'],
    };
    const show = (c: LessonPlanContext, p: LessonPlanDoc, mine: LessonPlanDoc[]) => {
      if (!alive) return;
      setCtx(c);
      setPlan(p);
      planRef.current = p;
      setOthers(mine.filter((x) => x.id !== p.id));
      setClassKey((k) => (k && p.classCodes.includes(k) ? k : p.classCodes[0] ?? ''));
      setRulesOpen(isEmptyPlan(p));
      setError('');
    };
    (async () => {
      try {
        if (sample) {
          const catalog = await getEslBookUnits(db).catch(() => null);
          createdRef.current = true;
          show(sampleContext(catalog), sample.plan, []);
          return;
        }
        if (planId) {
          const p = await getLessonPlan(db, planId);
          if (!p) throw new Error('This lesson plan was not found.');
          const [c, mine] = await Promise.all([
            loadLessonPlanContext(db, { jobCodeId: p.jobCodeId, campCode: p.campCode }),
            p.userId === user.userId ? listMyLessonPlans(db, user.userId, p.jobCodeId) : Promise.resolve([]),
          ]);
          createdRef.current = true;
          show(c, p, mine);
          return;
        }
        const jobCodeId = resolveActiveJobCodeId(userData);
        if (!jobCodeId) throw new Error('No active camp yet — choose your camp in your profile first.');
        const my = await loadMyPlanBooks(db, { user, jobCodeId, members: () => getUsersByJobCodeId(jobCodeId) as never });
        const book = my.books.find((b) => b.bookKey === bookKey);
        if (!book) {
          const orphan = my.plans.find((p) => p.id.endsWith(`_${bookKey}`));
          if (!orphan) throw new Error('This book is not in your classes. Go back and pick a book.');
          createdRef.current = true;
          show(my.ctx, orphan, my.plans);
          return;
        }
        const r = planForBook(my, book, user);
        createdRef.current = !r.isNew;
        if (r.changed) await saveLessonPlan(db, r.plan);
        show(my.ctx, r.plan, my.plans);
      } catch (e) {
        logger.error('레슨플랜 불러오기 실패:', e);
        if (alive) setError(e instanceof Error ? e.message : 'Could not load the lesson plan.');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, planId, bookKey, sample]);

  // ── 저장 (고칠 때마다 0.6초 뒤, 차례대로) ─────────────────────
  const flush = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    chainRef.current = chainRef.current.then(async () => {
      const p = pendingRef.current;
      if (!p) return;
      pendingRef.current = null;
      try {
        await saveLessonPlan(db, p, { create: !createdRef.current });
        createdRef.current = true;
        if (!pendingRef.current) setSaveState('saved');
      } catch (e) {
        logger.error('레슨플랜 저장 실패:', e);
        if (!pendingRef.current) pendingRef.current = p;
        setSaveState('error');
      }
    });
    return chainRef.current;
  }, []);

  const commit = useCallback((next: LessonPlanDoc, opts: { history?: boolean } = {}) => {
    const prev = planRef.current;
    if (opts.history !== false && prev) setHistory((h) => [...h.slice(-39), prev]);
    planRef.current = next;
    setPlan(next);
    pendingRef.current = next;
    setSaveState('saving');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void flush(); }, 600);
  }, [flush]);

  const apply = (fn: (p: LessonPlanDoc) => LessonPlanDoc) => {
    const p = planRef.current;
    if (!p || readOnly) return;
    const next = fn(p);
    if (next !== p) commit(next);
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!last || readOnly) return;
    setHistory((h) => h.slice(0, -1));
    commit(last, { history: false });
  };

  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!pendingRef.current) return;
      void flush();
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      if (pendingRef.current) void flush();
    };
  }, [flush]);

  // ── 표 ─────────────────────────────────────────────────────────
  const calendar = useMemo(() => (ctx && plan ? contextCalendar(ctx, plan.group) : []), [ctx, plan?.group]); // eslint-disable-line react-hooks/exhaustive-deps
  const catalog = ctx?.catalog ?? null;
  const describe = useMemo(() => unitDescriber(catalog, plan?.bookTitle ?? ''), [catalog, plan?.bookTitle]);
  const layout = useMemo(
    () => (plan ? layoutPlan(plan, calendar, classKey, { campCode: plan.campCode, describe }) : null),
    [plan, calendar, classKey, describe],
  );
  const times = useMemo(
    () => (sample ? sample.times : ctx && plan ? classTimesFor(contextRegular(ctx, plan.group), plan.subject) : {}),
    [ctx, plan?.group, plan?.subject, sample], // eslint-disable-line react-hooks/exhaustive-deps
  );

  if (authLoading || (!plan && !error)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
        <p className="mt-3 text-sm">Loading lesson plan…</p>
      </div>
    );
  }
  if (error || !plan || !layout) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4 text-center">
        <p className="font-semibold text-gray-800">{error || 'Could not load the lesson plan.'}</p>
        <Link href="/camp/lesson" className="mt-4 inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium">Back to Lesson</Link>
      </div>
    );
  }

  const keys = plan.classCodes;
  const multi = keys.length > 1;
  const units = bookUnitsOf(catalog, plan.bookTitle);
  const scope = campScopeOf(catalog, plan.bookCodes, plan.bookTitle);
  const uncovered = uncoveredUnits(plan, scope);
  const level = planLevel(plan.bookCodes);
  const resources = bookResources(catalog, plan.bookTitle, plan.bookCodes).map((r) => ({ ...r, url: safeLessonUrl(r.url) })).filter((r) => r.url);
  const sampleHref = `/camp/lesson-plan?sample=${encodeURIComponent((plan.subject || 'reading').toLowerCase())}`;
  const tipsFor = (r: PlanRow) => sampleTipsFor(sample, r.day?.date, classKey);
  /** 표의 한 행 + 그 아래 💡 (샘플) */
  const withTips = (r: PlanRow, i: number, row: ReactNode) => {
    const tips = tipsFor(r);
    return (
      <Fragment key={r.day?.date ?? `l${i}`}>
        {row}
        {tips.length > 0 && (
          <tr className="print:hidden">
            <td colSpan={5} className="px-3 pb-2.5 pt-0"><div className="space-y-1">{tipView(r)}</div></td>
          </tr>
        )}
      </Fragment>
    );
  };
  const tipView = (r: PlanRow) => tipsFor(r).map((t) => (
    <p key={t} className="text-xs text-sky-900 bg-sky-50 ring-1 ring-sky-100 rounded-lg px-2.5 py-1.5"><span aria-hidden>💡 </span>{t}</p>
  ));
  const linkFor = (unit: number) => unitLinks(catalog, plan.bookCodes, plan.bookTitle, unit);

  /** 여러 반이면 범위를 묻고, 한 반이면 그 반에만 기록 */
  const withScope = (title: string, run: (s: PlanScope) => void) => {
    if (!multi) { run(classKey || 'all'); return; }
    setDlg({ type: 'scope', title, run: (s) => { setDlg(null); run(s); } });
  };
  const done = (msg: string) => { setDlg(null); toast.success(msg); };

  const openItem = (lane: PlanLane, itemId: string, row?: PlanRow, fresh = false) => setDlg({ type: 'item', lane, itemId, row, fresh });
  /** 방금 넣은 빈 칸을 저장 없이 닫으면 넣기를 되돌린다 */
  const closeItem = () => {
    if (dlg?.type === 'item' && dlg.fresh) undo();
    setDlg(null);
  };
  const addItemAt = (lane: PlanLane, index: number | null, row?: PlanRow, init: Partial<PlanItem> = {}) => {
    const p = planRef.current;
    if (!p || readOnly) return;
    const r = insertItem(p, lane, index, init);
    commit(r.plan);
    openItem(lane, r.id, row, true);
  };


  // ── 행 동작 (목록은 shared — 앱과 같다) ───────────────────────────
  const rowActions = (r: PlanRow): SheetAction[] => planRowActions(plan, r, classKey, { hasCalendar: layout.hasCalendar, describe }).map((a) => ({
    key: a.key,
    section: a.section,
    label: a.label,
    hint: a.hint,
    tone: a.danger ? 'danger' : undefined,
    onClick: () => {
      if (a.open === 'skip' && r.day) { setDlg({ type: 'skip', date: r.day.date }); return; }
      if (a.open === 'insert' && a.lane) { setDlg(null); addItemAt(a.lane, a.insertAt ?? null, r); return; }
      const run = a.run;
      if (!run) return;
      if (a.scoped) withScope(a.scopeTitle ?? a.label, (sc) => { apply((p) => run(p, sc)); done(a.done ?? 'Done'); });
      else { apply((p) => run(p, classKey)); done(a.done ?? 'Done'); }
    },
  }));

  const saveSkip = async (date: string, scopeKind: SkipScope, note: string) => {
    if (scopeKind === 'mine' && others.length) {
      const updated = others.map((o) => setSkip(o, o.classCodes, date, note));
      try {
        await Promise.all(updated.map((o) => saveLessonPlan(db, o)));
        setOthers(updated);
      } catch (e) {
        logger.error('다른 레슨플랜 저장 실패:', e);
        toast.error('Could not update your other lesson plans');
      }
    }
    apply((p) => setSkip(p, scopeKind === 'class' ? [classKey] : p.classCodes, date, note));
    done(scopeKind === 'mine' ? `No class on ${shortDate(date)} in all your lesson plans` : `No class on ${shortDate(date)}`);
  };

  // ── 처음 채우기 ─────────────────────────────────────────────────
  const lessonCount = layout.hasCalendar ? layout.total : manualCount;
  const autoFill = () => {
    if (!isEmptyPlan(plan) && !confirm('Replace the whole plan with an automatic one? (You can Undo.)')) return;
    if (units.length) {
      const r = autoFillLanes(units, scope, lessonCount);
      apply((p) => ({ ...p, book: r.book, activity: r.activity }));
      toast.success(r.uncovered.length ? `Filled ${lessonCount} lessons — U${r.uncovered.join(', U')} don't fit` : `Filled ${lessonCount} lessons`);
    } else {
      const n = Math.max(1, lessonCount);
      apply((p) => ({
        ...p,
        book: Array.from({ length: n }, (_, i) => ({ id: newId(), ...(i === n - 1 && n >= 4 ? { text: 'Review all units · Final test prep' } : {}) })),
        activity: Array.from({ length: n }, (_, i) => ({ id: newId(), text: ACTIVITY_GAMES[i % ACTIVITY_GAMES.length] })),
      }));
      toast.success(`Made ${n} lessons — add the units`);
    }
  };
  const startBlank = () => {
    const n = Math.max(1, lessonCount);
    apply((p) => ({ ...p, book: Array.from({ length: n }, () => ({ id: newId() })), activity: Array.from({ length: n }, () => ({ id: newId() })) }));
  };

  // ── 제출 · 검토 ─────────────────────────────────────────────────
  const setLocalStatus = (patch: Partial<LessonPlanDoc>) => {
    const p = planRef.current;
    if (!p) return;
    const next = { ...p, ...patch };
    planRef.current = next;
    setPlan(next);
  };
  const submit = async () => {
    const p = planRef.current;
    if (!p) return;
    if (layout.warnings.length && !confirm(`${layout.warnings.join('\n')}\n\nSubmit anyway?`)) return;
    if (!createdRef.current && !pendingRef.current) pendingRef.current = p;
    await flush();
    if (pendingRef.current) { toast.error('Not saved yet — check your connection'); return; }
    try {
      await setLessonPlanStatus(db, p.id, 'submitted');
      setLocalStatus({ status: 'submitted' });
      toast.success('Submitted to your manager');
    } catch (e) {
      logger.error('레슨플랜 제출 실패:', e);
      toast.error('Could not submit');
    }
  };
  const review = async (status: 'approved' | 'changes') => {
    let note = '';
    if (status === 'changes') {
      const v = window.prompt('수정 요청 내용 (선생님에게 그대로 보입니다)', plan.reviewNote ?? '');
      if (v === null) return;
      note = v.trim();
    }
    try {
      await setLessonPlanStatus(db, plan.id, status, { reviewNote: note, reviewedBy: (userData as { name?: string } | null)?.name ?? '' });
      setLocalStatus({ status, reviewNote: note, editedAfterApproval: false });
      toast.success(status === 'approved' ? '승인했습니다' : '수정 요청을 보냈습니다');
    } catch (e) {
      logger.error('레슨플랜 검토 실패:', e);
      toast.error('저장하지 못했습니다');
    }
  };

  // ── 이 반만의 기록 ─────────────────────────────────────────────
  const classChanges = classChangeList(plan, classKey, describe).map((c) => ({ ...c, undo: () => apply(c.undo) }));

  // ── 칸 그리기 ───────────────────────────────────────────────────
  /** 줄이 끝난 뒤 첫 빈 수업 — 여기에만 '+ Add' (맨 뒤에 붙이면 이 칸에 들어간다) */
  const firstEmpty: Record<PlanLane, PlanRow | undefined> = {
    book: layout.lessons.find((r) => !r.book.length),
    activity: layout.lessons.find((r) => !r.activity.length),
  };
  const onCell = (lane: PlanLane, c: PlanCell, r: PlanRow) => {
    if (readOnly) return;
    if (c.source === 'base' && !isFillerCell(c)) openItem(lane, c.item.id, r);
    else setDlg({ type: 'row', row: r });
  };

  const cellsView = (lane: PlanLane, r: PlanRow) => {
    const cells = r[lane];
    if (!cells.length) {
      return readOnly || firstEmpty[lane] !== r
        ? <span className="text-gray-300">—</span>
        : (
          <button type="button" onClick={() => addItemAt(lane, null, r)}
            className="text-xs text-gray-400 hover:text-blue-600 border border-dashed border-gray-300 hover:border-blue-300 rounded-lg px-2 py-1 print:hidden">
            + Add
          </button>
        );
    }
    return (
      <div className="space-y-1">
        {cells.map((c, i) => {
          const filler = isFillerCell(c);
          const label = filler && c.item.kind === 'blank'
            ? `Pushed back${c.item.text ? ` — ${c.item.text}` : ''}`
            : cellLabel(c, describe) || (lane === 'book' ? 'Choose a unit' : 'Add an activity');
          const empty = !filler && !cellLabel(c, describe);
          const links = lane === 'book' && !filler && c.item.units?.length ? linkFor(c.item.units[0]) : {};
          const href = links.canva ?? links.drive;
          return (
            <div key={`${c.item.id}-${i}`} className="flex items-start gap-1.5 min-w-0">
              {i > 0 && <span className="text-[10px] font-bold text-violet-600 mt-0.5" title="Same lesson">+</span>}
              <button type="button" disabled={readOnly} onClick={() => onCell(lane, c, r)}
                className={`text-left min-w-0 break-words ${filler ? 'italic text-gray-400' : empty ? 'text-gray-400' : 'text-gray-900'} ${readOnly ? '' : 'hover:text-blue-700'}`}>
                {label}
              </button>
              {c.pinned && <span className="shrink-0 text-[11px]" title="Kept on this date">📌</span>}
              {(c.source === 'class' || c.mergedForClass) && multi && (
                <span className="shrink-0 text-[10px] px-1 py-px rounded bg-amber-50 text-amber-700 font-semibold">{classKeyLabel(classKey)}</span>
              )}
              {href && (
                <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] px-1.5 py-px rounded bg-gray-100 text-gray-600 hover:bg-gray-200 print:hidden"
                  title={links.canva ? 'Open the camp book at this page' : 'Open the camp book PDF'}>
                  p.{links.page}
                </a>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const reviewView = (r: PlanRow) => (
    r.review
      ? <span className={r.reviewAuto ? 'text-gray-500' : 'text-gray-900'}>{r.afterOutdoor && <span title="Day after an outdoor class">🌳 </span>}{r.review}</span>
      : <span className="text-gray-300">—</span>
  );

  const menuButton = (r: PlanRow) => (readOnly ? null : (
    <button type="button" onClick={() => setDlg({ type: 'row', row: r })} aria-label="Change this day"
      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-800 hover:bg-gray-100 print:hidden">
      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0zm6 0a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
    </button>
  ));

  const fixedText = (field: 'orientation' | 'final') => {
    const v = plan[field] ?? '';
    return readOnly
      ? <span className={v ? 'text-gray-800' : 'text-gray-300'}>{v || '—'}</span>
      : (
        <button type="button" onClick={() => setDlg({ type: 'text', field })} className={`text-left hover:text-blue-700 ${v ? 'text-gray-800' : 'text-gray-400'}`}>
          {v || (field === 'orientation' ? 'Add your orientation plan' : 'Add your final day plan')}
        </button>
      );
  };

  const dayCell = (r: PlanRow) => (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        {r.lessonNo && <span className="shrink-0 text-[10px] font-bold px-1.5 py-px rounded bg-blue-600 text-white">L{r.lessonNo}</span>}
        <span className="font-semibold text-gray-900 whitespace-nowrap">{rowTitle(r)}</span>
      </div>
      {r.extra && <span className="text-[11px] font-semibold text-violet-700">Extra class</span>}
      {r.day?.note && <p className="text-[11px] text-gray-400 truncate">{r.day.note}</p>}
    </div>
  );

  // ── 화면 ───────────────────────────────────────────────────────
  const dialogItem = dlg?.type === 'item' ? laneOf(plan, dlg.lane).find((x) => x.id === dlg.itemId) : undefined;
  const dialogRowUnit = (() => {
    if (dlg?.type !== 'item') return undefined;
    const n = dlg.row?.book.find((c) => c.item.units?.length)?.item.units?.[0];
    return n ? unitOf(catalog, plan.bookTitle, n) : undefined;
  })();
  const savedLabel = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Not saved' : '';

  return (
    <div className="max-w-6xl mx-auto space-y-3 pb-24">
      {/* 위 줄 — 뒤로 · 저장 상태 */}
      <div className="flex items-center gap-2 print:hidden">
        <BackButton fallbackHref="/camp/lesson" />
        <span className="text-sm text-gray-500">Lesson plans</span>
        <div className="flex-1" />
        {owner && savedLabel && (
          saveState === 'error'
            ? <button type="button" onClick={() => { void flush(); }} className="text-xs font-semibold text-red-600 hover:underline">Not saved — retry</button>
            : <span className="text-xs text-gray-400">{savedLabel}</span>
        )}
      </div>

      {sample && (
        <div className="rounded-2xl bg-sky-50 ring-1 ring-sky-200 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-600 text-white">SAMPLE</span>
            <p className="font-bold text-sky-950">A finished lesson plan to copy from</p>
          </div>
          <p className="text-sm text-sky-900 mt-1.5">{sample.intro}</p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {SAMPLE_KEYS.map((k) => {
              const s2 = sampleFor(k);
              return (
                <a key={k} href={`/camp/lesson-plan?sample=${k}`}
                  className={`text-xs px-2.5 py-1 rounded-full font-semibold ${k === sample.key ? 'bg-sky-700 text-white' : 'bg-white text-sky-800 ring-1 ring-sky-200 hover:bg-sky-100'}`}>
                  {s2.label}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* 머리 */}
      <div className="rounded-2xl bg-white ring-1 ring-gray-200 p-4 sm:p-5">
        <p className="text-xs font-semibold text-blue-600">{[plan.campCode, plan.subject, plan.group].filter(Boolean).join(' · ')}</p>
        <div className="flex flex-wrap items-center gap-2 mt-0.5">
          <h1 className="text-xl font-bold text-gray-900">{plan.bookTitle}</h1>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${STATUS_STYLE[plan.status]}`}>{PLAN_STATUS_LABEL[plan.status]}</span>
          {plan.editedAfterApproval && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">Edited after approval</span>}
        </div>
        {!owner && plan.userName && <p className="text-sm text-gray-600 mt-0.5">{plan.userName}</p>}
        <p className="text-xs text-gray-500 mt-1.5">
          {plan.bookCodes.join(', ')} · {level.level} · {level.ratio}
          {scope?.length ? ` · Camp book U${scope[0]}–U${scope[scope.length - 1]}` : ''}
        </p>

        {resources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 print:hidden">
            {resources.map((r) => (
              <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer"
                className={`text-xs px-2 py-1 rounded-md ${r.kind === 'camp' ? 'bg-blue-600 text-white font-semibold hover:bg-blue-700' : r.kind === 'campPdf' ? 'bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100' : r.kind === 'book' ? 'bg-violet-50 text-violet-700 font-semibold hover:bg-violet-100' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                {r.label}
              </a>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-4 print:hidden">
          {owner && (
            <>
              <button type="button" onClick={undo} disabled={!history.length} className="px-3 py-1.5 text-sm rounded-lg ring-1 ring-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40">↶ Undo</button>
              {!isEmptyPlan(plan) && <button type="button" onClick={autoFill} className="px-3 py-1.5 text-sm rounded-lg ring-1 ring-gray-200 text-gray-700 hover:bg-gray-50">Auto-fill again</button>}
            </>
          )}
          <button type="button" onClick={() => window.print()} className="px-3 py-1.5 text-sm rounded-lg ring-1 ring-gray-200 text-gray-700 hover:bg-gray-50">Print</button>
          {!sample && (
            <a href={sampleHref} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-sm rounded-lg ring-1 ring-sky-200 bg-sky-50 text-sky-800 font-semibold hover:bg-sky-100">See a sample ↗</a>
          )}
          <div className="flex-1" />
          {owner && (plan.status === 'draft' || plan.status === 'changes' || (plan.status === 'approved' && plan.editedAfterApproval)) && (
            <button type="button" onClick={submit} disabled={isEmptyPlan(plan)} className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-40">
              {plan.status === 'draft' ? 'Submit to manager' : 'Submit again'}
            </button>
          )}
          {owner && plan.status === 'submitted' && <span className="text-sm font-semibold text-blue-700">Submitted ✓ — you can still edit</span>}
          {isAdmin && !owner && !sample && (
            <>
              <button type="button" onClick={() => review('changes')} className="px-3 py-2 text-sm rounded-lg ring-1 ring-amber-300 text-amber-800 hover:bg-amber-50">수정 요청</button>
              <button type="button" onClick={() => review('approved')} className="px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700">승인</button>
            </>
          )}
        </div>
      </div>

      {plan.status === 'changes' && (
        <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-sm text-amber-900">
          <p className="font-bold">Your manager asked for changes</p>
          {plan.reviewNote && <p className="mt-0.5 whitespace-pre-wrap">{plan.reviewNote}</p>}
        </div>
      )}
      {plan.status === 'approved' && plan.reviewNote && (
        <div className="rounded-xl bg-emerald-50 ring-1 ring-emerald-200 px-4 py-3 text-sm text-emerald-900 whitespace-pre-wrap">{plan.reviewNote}</div>
      )}

      {/* 규칙 · 밀기 안내 */}
      <div className="rounded-xl bg-white ring-1 ring-gray-200 print:hidden">
        <button type="button" onClick={() => setRulesOpen((v) => !v)} className="w-full flex items-center gap-2 px-4 py-2.5 text-left">
          <span className="text-sm font-bold text-gray-800">Rules & how to change days</span>
          <span className="flex-1" />
          <span className="text-gray-400 text-xs">{rulesOpen ? '▲' : '▼'}</span>
        </button>
        {rulesOpen && (
          <div className="px-4 pb-4 grid gap-4 sm:grid-cols-2 text-sm text-gray-600">
            <ul className="space-y-1 list-disc pl-5">
              {PLAN_RULES.map((r) => <li key={r}>{r}</li>)}
              <li>{level.level}: {level.ratio}</li>
            </ul>
            <ul className="space-y-1 list-disc pl-5">
              <li><b>No class one day</b> (sick, trip, other activity): ⋯ → <i>No class this day</i>. Everything after moves back.</li>
              <li><b>Unit not finished</b>: ⋯ → <i>Continue next lesson</i>.</li>
              <li><b>Only the activity didn&apos;t happen</b>: ⋯ → <i>Push the activity back</i>. The book stays.</li>
              <li><b>Catch up</b>: ⋯ → <i>Do it together with the previous lesson</i>.</li>
              <li>Two classes with this book? Choose <i>Only this class</i> when one class is behind.</li>
            </ul>
          </div>
        )}
      </div>

      {/* 반 탭 */}
      {keys.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] print:hidden">
          {keys.map((k) => {
            const on = k === classKey;
            const t = times[k.split(':')[0]];
            const n = (plan.classes?.[k]?.skips?.length ?? 0) + (plan.classes?.[k]?.gaps?.length ?? 0) + (plan.classes?.[k]?.drops?.length ?? 0) + (plan.classes?.[k]?.extraDays?.length ?? 0);
            return (
              <button key={k} type="button" onClick={() => setClassKey(k)}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-sm text-left ring-1 ${on ? 'bg-gray-900 text-white ring-gray-900' : 'bg-white text-gray-700 ring-gray-200 hover:bg-gray-50'}`}>
                <span className="font-bold">{classKeyLabel(k)}</span>
                {t && <span className={`ml-1.5 text-xs ${on ? 'text-white/70' : 'text-gray-400'}`}>{t}</span>}
                {n > 0 && <span className={`ml-1.5 text-[10px] font-bold px-1 rounded ${on ? 'bg-amber-400 text-gray-900' : 'bg-amber-100 text-amber-800'}`}>{n}</span>}
              </button>
            );
          })}
        </div>
      )}
      <p className="hidden print:block text-sm font-semibold">{classKeyLabel(classKey)} {times[classKey.split(':')[0]] ?? ''}</p>

      {!layout.hasCalendar && (
        <p className="text-xs text-gray-500 px-1">The camp schedule isn&apos;t ready yet, so lessons have no dates. Dates appear automatically when the schedule is set.</p>
      )}

      {layout.warnings.length > 0 && (
        <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-2.5 text-sm text-amber-900 space-y-0.5">
          {layout.warnings.map((w) => <p key={w}>⚠️ {w}</p>)}
        </div>
      )}

      {/* 처음 — 자동 채우기 */}
      {isEmptyPlan(plan) && owner ? (
        <div className="rounded-2xl bg-white ring-1 ring-blue-200 p-5 sm:p-6 text-center">
          <p className="text-lg font-bold text-gray-900">Start your {plan.bookTitle} plan</p>
          <p className="text-sm text-gray-500 mt-1">
            {layout.hasCalendar ? `${lessonCount} lessons in the camp schedule` : 'How many lessons?'}
            {units.length ? ` · ${scope?.length ? `camp book U${scope[0]}–U${scope[scope.length - 1]}` : `${units.length} units`}` : ''}
          </p>
          {!layout.hasCalendar && (
            <input type="number" min={1} max={40} value={manualCount} onChange={(e) => setManualCount(Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
              className="mt-3 w-24 text-center border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
          )}
          <div className="flex flex-col sm:flex-row gap-2 justify-center mt-4">
            <button type="button" onClick={autoFill} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700">{units.length ? 'Auto-fill from the book' : `Make ${lessonCount} lessons`}</button>
            <button type="button" onClick={startBlank} className="px-5 py-2.5 rounded-xl ring-1 ring-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50">Start blank</button>
          </div>
          <a href={sampleHref} target="_blank" rel="noopener noreferrer" className="inline-block mt-3 text-sm font-semibold text-sky-700 hover:underline">See a finished sample first ↗</a>
          <p className="text-xs text-gray-400 mt-2">
            {units.length
              ? 'Auto-fill follows the rules (one unit over two days for short books, review on the last lesson). Change anything after.'
              : 'There is no unit list for this book yet — you will type the unit numbers. Activities get game ideas to start with.'}
          </p>
        </div>
      ) : (
        <>
          {/* PC — 표 */}
          <div className="hidden md:block rounded-2xl bg-white ring-1 ring-gray-200 overflow-hidden print:block print:ring-0">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                  <th className="w-52 px-3 py-2">Day</th>
                  <th className="w-[22%] px-3 py-2">Review</th>
                  <th className="px-3 py-2">Book</th>
                  <th className="px-3 py-2">English activity</th>
                  <th className="w-10 print:hidden" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {layout.rows.map((r, i) => withTips(r, i, (() => {
                  const key = r.day?.date ?? `l${i}`;
                  if (r.type === 'off') {
                    return (
                      <tr key={key} className="bg-gray-50/70 text-gray-400">
                        <td className="px-3 py-1.5 text-xs whitespace-nowrap">{rowTitle(r)}</td>
                        <td colSpan={3} className="px-3 py-1.5 text-xs">{r.day?.kindLabel || 'No class'}{r.day?.note ? ` · ${r.day.note}` : ''}</td>
                        <td className="px-1 print:hidden">{r.day?.kind !== 'checkout' && menuButton(r)}</td>
                      </tr>
                    );
                  }
                  if (r.type === 'skipped') {
                    return (
                      <tr key={key} className="bg-amber-50/70">
                        <td className="px-3 py-2 align-top">{dayCell(r)}</td>
                        <td colSpan={3} className="px-3 py-2 text-amber-800 font-medium">No class{r.skip?.note ? ` — ${r.skip.note}` : ''}</td>
                        <td className="px-1 align-top print:hidden">{menuButton(r)}</td>
                      </tr>
                    );
                  }
                  if (r.type === 'orientation' || r.type === 'final') {
                    return (
                      <tr key={key} className="bg-sky-50/40">
                        <td className="px-3 py-2 align-top">
                          <span className="font-semibold text-gray-900 whitespace-nowrap">{rowTitle(r)}</span>
                          <p className="text-[11px] font-semibold text-sky-700">{r.type === 'orientation' ? 'Orientation' : 'Final Test Day'}</p>
                        </td>
                        <td colSpan={3} className="px-3 py-2">{fixedText(r.type === 'orientation' ? 'orientation' : 'final')}</td>
                        <td className="print:hidden" />
                      </tr>
                    );
                  }
                  return (
                    <tr key={key} className="align-top hover:bg-gray-50/40">
                      <td className="px-3 py-2">{dayCell(r)}</td>
                      <td className="px-3 py-2">{reviewView(r)}</td>
                      <td className="px-3 py-2">{cellsView('book', r)}</td>
                      <td className="px-3 py-2">
                        {cellsView('activity', r)}
                      </td>
                      <td className="px-1 py-1 print:hidden">{menuButton(r)}</td>
                    </tr>
                  );
                })()))}
              </tbody>
            </table>
          </div>

          {/* 휴대폰 — 카드 */}
          <div className="md:hidden space-y-2 print:hidden">
            {layout.rows.map((r, i) => {
              const key = r.day?.date ?? `l${i}`;
              if (r.type === 'off') {
                return (
                  <div key={key} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100/70 text-xs text-gray-400">
                    <span className="font-medium">{rowTitle(r)}</span>
                    <span className="truncate">· {r.day?.kindLabel || 'No class'}</span>
                    <span className="flex-1" />
                    {r.day?.kind !== 'checkout' && menuButton(r)}
                  </div>
                );
              }
              const tone = r.type === 'skipped' ? 'bg-amber-50 ring-amber-200' : r.type === 'lesson' ? 'bg-white ring-gray-200' : 'bg-sky-50/60 ring-sky-100';
              return (
                <div key={key} className={`rounded-xl ring-1 p-3 ${tone}`}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">{dayCell(r)}</div>
                    {(r.type === 'lesson' || r.type === 'skipped') && menuButton(r)}
                  </div>
                  {r.type === 'skipped' && <p className="mt-1.5 text-sm font-medium text-amber-800">No class{r.skip?.note ? ` — ${r.skip.note}` : ''}</p>}
                  {(r.type === 'orientation' || r.type === 'final') && (
                    <div className="mt-1.5 text-sm">
                      <p className="text-[11px] font-semibold text-sky-700 mb-0.5">{r.type === 'orientation' ? 'Orientation' : 'Final Test Day'}</p>
                      {fixedText(r.type === 'orientation' ? 'orientation' : 'final')}
                    </div>
                  )}
                  {r.type === 'lesson' && (
                    <dl className="mt-2 grid grid-cols-[64px_1fr] gap-x-2 gap-y-1.5 text-sm">
                      <dt className="text-[11px] font-semibold text-gray-400 pt-0.5">Review</dt><dd className="min-w-0">{reviewView(r)}</dd>
                      <dt className="text-[11px] font-semibold text-gray-400 pt-0.5">Book</dt><dd className="min-w-0">{cellsView('book', r)}</dd>
                      <dt className="text-[11px] font-semibold text-gray-400 pt-0.5">Activity</dt><dd className="min-w-0">{cellsView('activity', r)}</dd>
                    </dl>
                  )}
                  {tipsFor(r).length > 0 && <div className="mt-2 space-y-1">{tipView(r)}</div>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 안 들어간 칸 */}
      {(layout.overflow.book.length > 0 || layout.overflow.activity.length > 0) && (
        <div className="rounded-2xl bg-white ring-1 ring-amber-300 p-4 print:hidden">
          <p className="text-sm font-bold text-gray-900">Didn&apos;t fit in {classKeyLabel(classKey)}&apos;s schedule</p>
          <p className="text-xs text-gray-500 mt-0.5">Fit them into the last lesson, remove them, or add an extra class on a free day.</p>
          <div className="mt-3 space-y-2">
            {(['book', 'activity'] as PlanLane[]).flatMap((lane) => layout.overflow[lane].map((g) => {
              const head = g[0];
              const label = g.map((c) => cellLabel(c, describe) || '(empty)').join(' + ');
              return (
                <div key={`${lane}-${head.item.id}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="text-[10px] font-bold px-1.5 py-px rounded bg-gray-100 text-gray-600">{laneName(lane)}</span>
                  <span className="flex-1 min-w-[60%] sm:min-w-0 break-words text-gray-800">{label}</span>
                  {!readOnly && head.source === 'base' && !isFillerCell(head) && (
                    <button type="button" onClick={() => withScope('Fit into the last lesson', (s) => { apply((p) => mergeWithPrevious(p, lane, head.item.id, s)); done('Fitted into the last lesson'); })}
                      className="px-2.5 py-1 text-xs rounded-lg bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100">Fit into last lesson</button>
                  )}
                  {!readOnly && (
                    <button type="button" onClick={() => { apply((p) => (head.source === 'base' && !isFillerCell(head) ? removeItem(p, lane, head.item.id) : removeFiller(p, lane, head, classKey))); }}
                      className="px-2.5 py-1 text-xs rounded-lg text-red-600 hover:bg-red-50">Remove</button>
                  )}
                </div>
              );
            }))}
          </div>
        </div>
      )}

      {/* 아직 안 넣은 단원 */}
      {uncovered.length > 0 && !isEmptyPlan(plan) && (
        <div className="rounded-2xl bg-white ring-1 ring-gray-200 p-4 print:hidden">
          <p className="text-sm font-bold text-gray-900">Camp book units not in the plan</p>
          <p className="text-xs text-gray-500 mt-0.5">That&apos;s fine if there isn&apos;t time — or add them.</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {uncovered.map((n) => {
              const u = unitOf(catalog, plan.bookTitle, n);
              return readOnly ? (
                <span key={n} className="px-2 py-1 rounded-lg bg-gray-100 text-xs text-gray-600">U{n} {u?.title}</span>
              ) : (
                <button key={n} type="button"
                  onClick={() => {
                    const lastUnit = plan.book.reduce((acc, x, i) => (x.units?.length ? i : acc), -1);
                    apply((p) => insertItem(p, 'book', lastUnit + 1, { units: [n] }).plan);
                    toast.success(`U${n} added after the last unit`);
                  }}
                  className="px-2 py-1 rounded-lg ring-1 ring-gray-200 text-xs text-gray-700 hover:bg-blue-50 hover:ring-blue-200">
                  + U{n} {u?.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 이 반만의 기록 */}
      {classChanges.length > 0 && (
        <div className="rounded-2xl bg-white ring-1 ring-gray-200 p-4 print:hidden">
          <p className="text-sm font-bold text-gray-900">Changes for {classKeyLabel(classKey)} only</p>
          <ul className="mt-2 divide-y divide-gray-100">
            {classChanges.map((c) => (
              <li key={c.key} className="flex items-center gap-2 py-1.5 text-sm">
                <span className="flex-1 min-w-0 text-gray-700">{c.label}</span>
                {!readOnly && <button type="button" onClick={c.undo} className="text-xs font-semibold text-gray-500 hover:text-red-600">Undo</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 창 */}
      {dlg?.type === 'row' && (
        <ActionSheet
          title={rowTitle(dlg.row)}
          subtitle={[classKeyLabel(classKey), dlg.row.lessonNo ? `Lesson ${dlg.row.lessonNo}` : dlg.row.day?.kindLabel].filter(Boolean).join(' · ')}
          actions={rowActions(dlg.row)}
          onClose={() => setDlg(null)}
        />
      )}
      {dlg?.type === 'scope' && (
        <ScopeSheet title={dlg.title} classKey={classKey} classKeys={keys} onPick={(s) => dlg.run(s)} onClose={() => setDlg(null)} />
      )}
      {dlg?.type === 'skip' && (
        <SkipSheet
          date={dlg.date}
          classKey={classKey}
          classKeys={keys}
          otherPlans={others.length}
          onSave={(s, note) => { void saveSkip(dlg.date, s, note); }}
          onClose={() => setDlg(null)}
        />
      )}
      {dlg?.type === 'item' && dialogItem && dlg.lane === 'book' && (
        <BookItemSheet
          key={dialogItem.id}
          item={dialogItem}
          rowLabel={dlg.row ? rowSubtitle(dlg.row) : ''}
          autoReview={dlg.row?.reviewAuto ? dlg.row.review : ''}
          units={units}
          scope={scope}
          catalog={catalog}
          bookTitle={plan.bookTitle}
          bookCodes={plan.bookCodes}
          classKey={classKey}
          multiClass={multi}
          onSave={(patch) => { apply((p) => updateItem(p, 'book', dialogItem.id, patch)); setDlg(null); }}
          onDelete={() => { if (confirm('Delete this book lesson for every class? The rest moves one lesson earlier.')) { apply((p) => removeItem(p, 'book', dialogItem.id)); setDlg(null); } }}
          onMove={(d) => apply((p) => moveItem(p, 'book', dialogItem.id, d))}
          onDropForClass={() => { apply((p) => dropForClass(p, 'book', dialogItem.id, classKey)); done(`Skipped for ${classKeyLabel(classKey)}`); }}
          onClose={closeItem}
        />
      )}
      {dlg?.type === 'item' && dialogItem && dlg.lane === 'activity' && (
        <ActivityItemSheet
          key={dialogItem.id}
          item={dialogItem}
          rowLabel={dlg.row ? rowSubtitle(dlg.row) : ''}
          unit={dialogRowUnit}
          seed={plan.activity.findIndex((x) => x.id === dialogItem.id)}
          classKey={classKey}
          multiClass={multi}
          onSave={(patch) => { apply((p) => updateItem(p, 'activity', dialogItem.id, patch)); setDlg(null); }}
          onDelete={() => { if (confirm('Delete this activity for every class? The rest moves one lesson earlier.')) { apply((p) => removeItem(p, 'activity', dialogItem.id)); setDlg(null); } }}
          onMove={(d) => apply((p) => moveItem(p, 'activity', dialogItem.id, d))}
          onDropForClass={() => { apply((p) => dropForClass(p, 'activity', dialogItem.id, classKey)); done(`Skipped for ${classKeyLabel(classKey)}`); }}
          onClose={closeItem}
        />
      )}
      {dlg?.type === 'text' && (
        <TextSheet
          title={dlg.field === 'orientation' ? 'Orientation day' : 'Final Test Day'}
          subtitle={plan.bookTitle}
          value={plan[dlg.field] ?? ''}
          placeholder={dlg.field === 'orientation' ? 'Self-introductions · name game · class rules' : 'Final test · review & English games · photo time'}
          onSave={(v) => { apply((p) => ({ ...p, [dlg.field]: v })); setDlg(null); }}
          onClose={() => setDlg(null)}
        />
      )}
    </div>
  );
}
