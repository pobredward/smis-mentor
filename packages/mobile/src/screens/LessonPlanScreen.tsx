/**
 * 원어민 레슨플랜 (앱) — web /camp/lesson-plan 과 같은 엔진 · 같은 행 동작 목록 (shared/utils/lessonPlanEngine.ts)
 *
 *  - LessonPlanHubCard: 수업 탭 맨 위, 교재마다 레슨플랜 (상태 · 진행)
 *  - LessonPlanScreen: 교재 하나의 레슨플랜 — 날짜별 카드, ⋯ 로 그날 수업 없음 · 밀기 · 이어하기 · 합치기 · 고정 · 보충 수업
 *  - 고칠 때마다 자동 저장(0.6초 뒤), Undo, 제출
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { getUsersByJobCodeId } from '../services/userService';
import {
  ACTIVITY_GAMES,
  PLAN_RULES,
  PLAN_STATUS_LABEL,
  SKIP_REASONS,
  activityIdeas,
  autoFillLanes,
  bookResources,
  bookUnitsOf,
  campScopeOf,
  cellLabel,
  classChangeList,
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
  type BookUnit,
  type EslBookUnits,
  type LessonPlanContext,
  type LessonPlanDoc,
  type LessonPlanStatus,
  type MyPlanBooks,
  type PlanCell,
  type PlanItem,
  type PlanLane,
  type PlanRow,
  type PlanRowAction,
  type PlanScope,
  type PlanUser,
} from '@smis-mentor/shared';

const BLUE = '#2563eb';
const AMBER = '#b45309';

const STATUS_COLORS: Record<LessonPlanStatus, { bg: string; fg: string }> = {
  draft: { bg: '#f3f4f6', fg: '#4b5563' },
  submitted: { bg: '#eff6ff', fg: '#1d4ed8' },
  approved: { bg: '#ecfdf5', fg: '#047857' },
  changes: { bg: '#fffbeb', fg: '#92400e' },
};

const openUrl = (url?: string) => { const u = safeLessonUrl(url); if (u) Linking.openURL(u).catch(() => undefined); };
const laneOf = (p: LessonPlanDoc, lane: PlanLane) => (lane === 'book' ? p.book : p.activity) ?? [];
const rowTitle = (r: PlanRow) => (r.day ? planDayTitle(r.day) : `Lesson ${r.lessonNo ?? ''}`);
const rowSubtitle = (r: PlanRow) => [r.day ? planDayTitle(r.day) : '', r.lessonNo ? `Lesson ${r.lessonNo}` : ''].filter(Boolean).join(' · ');

function planUserOf(userData: any): PlanUser {
  return { userId: userData.userId, name: userData.name, role: userData.role, jobExperiences: userData.jobExperiences ?? [] };
}

function StatusPill({ status }: { status: LessonPlanStatus }) {
  const c = STATUS_COLORS[status];
  return (
    <View style={[s.pill, { backgroundColor: c.bg }]}>
      <Text style={[s.pillText, { color: c.fg }]}>{PLAN_STATUS_LABEL[status]}</Text>
    </View>
  );
}

// ── 수업 탭 카드 ─────────────────────────────────────────────────────

export function LessonPlanHubCard({ jobCodeId }: { jobCodeId: string }) {
  const { userData } = useAuth();
  const navigation = useNavigation<any>();
  const [my, setMy] = useState<MyPlanBooks | null>(null);
  const [failed, setFailed] = useState(false);
  const uid = userData?.userId ?? '';

  const load = useCallback(() => {
    if (!userData || !jobCodeId) return () => undefined;
    let alive = true;
    loadMyPlanBooks(db, { user: planUserOf(userData), jobCodeId, members: () => getUsersByJobCodeId(jobCodeId) as any })
      .then((r) => { if (alive) { setMy(r); setFailed(false); } })
      .catch((e) => { logger.error('레슨플랜 목록 불러오기 실패:', e); if (alive) setFailed(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, jobCodeId]);
  // 편집 화면에서 돌아오면 상태·진행을 새로
  useFocusEffect(load);

  const rows = useMemo(() => {
    if (!my) return [];
    const cal = contextCalendar(my.ctx, my.viewer.group);
    return my.books.map((b) => {
      const plan = my.plans.find((p) => p.bookTitle === b.bookTitle);
      const lay = plan ? layoutPlan(plan, cal, plan.classCodes[0] ?? b.classKeys[0] ?? '', { campCode: plan.campCode }) : null;
      return { book: b, plan, filled: lay?.filled ?? 0, total: lay?.total ?? cal.filter((d) => d.kind === 'regular').length, warn: (lay?.warnings.length ?? 0) > 0 };
    });
  }, [my]);

  if (failed) return <Text style={s.errorText}>Could not load your lesson plans. Pull down to try again.</Text>;
  if (!my) return <View style={[s.card, { height: 90 }]} />;
  if (!my.subjects.length) return null;
  const orphans = my.plans.filter((p) => !my.books.some((b) => b.bookTitle === p.bookTitle));

  return (
    <View style={[s.card, { padding: 0, overflow: 'hidden' }]}>
      <View style={s.hubHead}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={[s.hubTitle, { flex: 1 }]}>Lesson plans</Text>
          <TouchableOpacity style={s.sampleChip} onPress={() => navigation.navigate('LessonPlan', { sample: (my.subjects[0] ?? 'Reading').toLowerCase() })}>
            <Text style={s.sampleChipText}>See a sample</Text>
          </TouchableOpacity>
        </View>
        <Text style={s.hubHint}>One plan per book — dates come from the camp schedule.</Text>
      </View>
      {rows.length === 0 && (
        <Text style={[s.hubHint, { padding: 16 }]}>
          {my.classes.length ? 'Your classes have no books yet.' : 'Your group has no classes yet.'} Ask your manager — plans appear here when books are set.
        </Text>
      )}
      {rows.map(({ book, plan, filled, total, warn }) => (
        <TouchableOpacity key={book.bookKey} style={s.hubRow} onPress={() => navigation.navigate('LessonPlan', { bookKey: book.bookKey })}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.hubBook} numberOfLines={1}>
              {book.bookTitle}{my.subjects.length > 1 ? <Text style={s.hubSub}>  {book.subject}</Text> : null}
            </Text>
            <Text style={s.hubClasses} numberOfLines={1}>{book.classKeys.map(classKeyLabel).join(' · ')}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            {plan ? (
              <>
                <StatusPill status={plan.status} />
                <Text style={[s.hubCount, warn && { color: AMBER, fontWeight: '700' }]}>{warn ? '⚠️ ' : ''}{filled}/{total} lessons</Text>
              </>
            ) : (
              <View style={[s.pill, { backgroundColor: BLUE }]}><Text style={[s.pillText, { color: '#fff' }]}>Start</Text></View>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color="#d1d5db" />
        </TouchableOpacity>
      ))}
      {my.missing.length > 0 && rows.length > 0 && (
        <Text style={s.warnLine}>No book set for {my.missing.map(classKeyLabel).join(', ')} yet — ask your manager.</Text>
      )}
      {orphans.length > 0 && (
        <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
          <Text style={s.smallLabel}>Earlier plans (book no longer assigned)</Text>
          <View style={s.chips}>
            {orphans.map((p) => (
              <TouchableOpacity key={p.id} style={s.chip} onPress={() => navigation.navigate('LessonPlan', { planId: p.id })}>
                <Text style={s.chipText}>{p.bookTitle}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ── 편집 화면 ────────────────────────────────────────────────────────

type Dialog =
  | { type: 'row'; row: PlanRow }
  | { type: 'scope'; title: string; run: (scope: PlanScope) => void }
  | { type: 'skip'; date: string }
  | { type: 'item'; lane: PlanLane; itemId: string; row?: PlanRow; fresh?: boolean }
  | { type: 'text'; field: 'orientation' | 'final' }
  | { type: 'review' };

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function LessonPlanScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const bookKey: string | undefined = route.params?.bookKey;
  const planId: string | undefined = route.params?.planId;
  const sampleKey: string | undefined = route.params?.sample;
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
  const [manualCount, setManualCount] = useState('10');
  const [rulesOpen, setRulesOpen] = useState(false);
  const [flash, setFlash] = useState('');
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const planRef = useRef<LessonPlanDoc | null>(null);
  const createdRef = useRef(true);
  const pendingRef = useRef<LessonPlanDoc | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 샘플 보기 — 읽기 전용 완성본 */
  const sample = useMemo(() => (sampleKey ? sampleFor(sampleKey) : null), [sampleKey]);
  const owner = !!plan && !sample && plan.userId === uid;
  const readOnly = !owner;
  const isAdmin = userData?.role === 'admin';

  const say = (msg: string) => {
    setFlash(msg);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(''), 2200);
  };

  // ── 불러오기 ───────────────────────────────────────────────────
  useEffect(() => {
    if (!userData) return;
    let alive = true;
    const user = planUserOf(userData);
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
        const my = await loadMyPlanBooks(db, { user, jobCodeId, members: () => getUsersByJobCodeId(jobCodeId) as any });
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

  // ── 저장 ───────────────────────────────────────────────────────
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

  // 화면을 떠나면 바로 저장
  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (pendingRef.current) void flush();
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

  const calendar = useMemo(() => (ctx && plan ? contextCalendar(ctx, plan.group) : []), [ctx, plan?.group]); // eslint-disable-line react-hooks/exhaustive-deps
  const catalog = ctx?.catalog ?? null;
  const describe = useMemo(() => unitDescriber(catalog, plan?.bookTitle ?? ''), [catalog, plan?.bookTitle]);
  const layout = useMemo(() => (plan ? layoutPlan(plan, calendar, classKey, { campCode: plan.campCode, describe }) : null), [plan, calendar, classKey, describe]);
  const times = useMemo(() => (sample ? sample.times : ctx && plan ? classTimesFor(contextRegular(ctx, plan.group), plan.subject) : {}), [ctx, plan?.group, plan?.subject, sample]); // eslint-disable-line react-hooks/exhaustive-deps

  const header = (
    <View style={s.topBar}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} accessibilityLabel="Back">
        <Ionicons name="chevron-back" size={24} color="#111827" />
      </TouchableOpacity>
      <Text style={s.topTitle} numberOfLines={1}>{plan?.bookTitle ?? 'Lesson plan'}</Text>
      <View style={{ flex: 1 }} />
      {owner && saveState !== 'idle' && (
        saveState === 'error'
          ? <TouchableOpacity onPress={() => { void flush(); }}><Text style={[s.saveText, { color: '#dc2626', fontWeight: '700' }]}>Not saved — retry</Text></TouchableOpacity>
          : <Text style={s.saveText}>{saveState === 'saving' ? 'Saving…' : 'Saved'}</Text>
      )}
    </View>
  );

  if (authLoading || (!plan && !error)) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        {header}
        <View style={s.center}><ActivityIndicator size="large" color={BLUE} /><Text style={s.centerHint}>Loading lesson plan…</Text></View>
      </SafeAreaView>
    );
  }
  if (error || !plan || !layout) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        {header}
        <View style={s.center}>
          <Ionicons name="document-outline" size={48} color="#cbd5e1" />
          <Text style={s.emptyTitle}>{error || 'Could not load the lesson plan.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const keys = plan.classCodes;
  const multi = keys.length > 1;
  const units = bookUnitsOf(catalog, plan.bookTitle);
  const scope = campScopeOf(catalog, plan.bookCodes, plan.bookTitle);
  const uncovered = uncoveredUnits(plan, scope);
  const level = planLevel(plan.bookCodes);
  const resources = bookResources(catalog, plan.bookTitle, plan.bookCodes).filter((r) => safeLessonUrl(r.url));
  const openSample = () => navigation.push('LessonPlan', { sample: (plan.subject || 'reading').toLowerCase() });
  const tipsFor = (r: PlanRow) => sampleTipsFor(sample, r.day?.date, classKey);
  const tipView = (r: PlanRow) => {
    const tips = tipsFor(r);
    return tips.length ? <View style={{ marginTop: 8, gap: 4 }}>{tips.map((t) => <Text key={t} style={s.tip}>💡 {t}</Text>)}</View> : null;
  };
  const linkFor = (unit: number) => unitLinks(catalog, plan.bookCodes, plan.bookTitle, unit);
  const done = (msg: string) => { setDlg(null); say(msg); };

  const withScope = (title: string, run: (sc: PlanScope) => void) => {
    if (!multi) { run(classKey || 'all'); return; }
    setDlg({ type: 'scope', title, run: (sc) => { setDlg(null); run(sc); } });
  };
  const openItem = (lane: PlanLane, itemId: string, row?: PlanRow, fresh = false) => setDlg({ type: 'item', lane, itemId, row, fresh });
  const closeItem = () => { if (dlg?.type === 'item' && dlg.fresh) undo(); setDlg(null); };
  const addItemAt = (lane: PlanLane, index: number | null, row?: PlanRow, init: Partial<PlanItem> = {}) => {
    const p = planRef.current;
    if (!p || readOnly) return;
    const r = insertItem(p, lane, index, init);
    commit(r.plan);
    openItem(lane, r.id, row, true);
  };

  const runAction = (a: PlanRowAction, r: PlanRow) => {
    if (a.open === 'skip' && r.day) { setDlg({ type: 'skip', date: r.day.date }); return; }
    if (a.open === 'insert' && a.lane) { setDlg(null); addItemAt(a.lane, a.insertAt ?? null, r); return; }
    const run = a.run;
    if (!run) return;
    if (a.scoped) withScope(a.scopeTitle ?? a.label, (sc) => { apply((p) => run(p, sc)); done(a.done ?? 'Done'); });
    else { apply((p) => run(p, classKey)); done(a.done ?? 'Done'); }
  };

  const saveSkip = async (date: string, kind: 'class' | 'book' | 'mine', note: string) => {
    if (kind === 'mine' && others.length) {
      const updated = others.map((o) => setSkip(o, o.classCodes, date, note));
      try {
        await Promise.all(updated.map((o) => saveLessonPlan(db, o)));
        setOthers(updated);
      } catch (e) {
        logger.error('다른 레슨플랜 저장 실패:', e);
        Alert.alert('Could not update your other lesson plans');
      }
    }
    apply((p) => setSkip(p, kind === 'class' ? [classKey] : p.classCodes, date, note));
    done(kind === 'mine' ? `No class on ${shortDate(date)} in all your plans` : `No class on ${shortDate(date)}`);
  };

  const lessonCount = layout.hasCalendar ? layout.total : Math.max(1, Math.min(40, Number(manualCount) || 1));
  const fillPlan = () => {
    if (units.length) {
      const r = autoFillLanes(units, scope, lessonCount);
      apply((p) => ({ ...p, book: r.book, activity: r.activity }));
      say(r.uncovered.length ? `Filled ${lessonCount} lessons — U${r.uncovered.join(', U')} don't fit` : `Filled ${lessonCount} lessons`);
    } else {
      const n = lessonCount;
      apply((p) => ({
        ...p,
        book: Array.from({ length: n }, (_, i) => ({ id: newId(), ...(i === n - 1 && n >= 4 ? { text: 'Review all units · Final test prep' } : {}) })),
        activity: Array.from({ length: n }, (_, i) => ({ id: newId(), text: ACTIVITY_GAMES[i % ACTIVITY_GAMES.length] })),
      }));
      say(`Made ${n} lessons — add the units`);
    }
  };
  const autoFill = () => {
    if (isEmptyPlan(plan)) { fillPlan(); return; }
    Alert.alert('Auto-fill again?', 'This replaces the whole plan. You can Undo.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: fillPlan },
    ]);
  };
  const startBlank = () => apply((p) => ({ ...p, book: Array.from({ length: lessonCount }, () => ({ id: newId() })), activity: Array.from({ length: lessonCount }, () => ({ id: newId() })) }));

  const setLocal = (patch: Partial<LessonPlanDoc>) => {
    const p = planRef.current;
    if (!p) return;
    const next = { ...p, ...patch };
    planRef.current = next;
    setPlan(next);
  };
  const doSubmit = async () => {
    const p = planRef.current;
    if (!p) return;
    if (!createdRef.current && !pendingRef.current) pendingRef.current = p;
    await flush();
    if (pendingRef.current) { Alert.alert('Not saved yet', 'Check your connection and try again.'); return; }
    try {
      await setLessonPlanStatus(db, p.id, 'submitted');
      setLocal({ status: 'submitted' });
      say('Submitted to your manager');
    } catch (e) {
      logger.error('레슨플랜 제출 실패:', e);
      Alert.alert('Could not submit');
    }
  };
  const submit = () => {
    if (layout.warnings.length) {
      Alert.alert('Submit anyway?', layout.warnings.join('\n'), [{ text: 'Cancel', style: 'cancel' }, { text: 'Submit', onPress: () => { void doSubmit(); } }]);
    } else void doSubmit();
  };
  const review = async (status: 'approved' | 'changes', note = '') => {
    try {
      await setLessonPlanStatus(db, plan.id, status, { reviewNote: note, reviewedBy: (userData as any)?.name ?? '' });
      setLocal({ status, reviewNote: note, editedAfterApproval: false });
      done(status === 'approved' ? '승인했습니다' : '수정 요청을 보냈습니다');
    } catch (e) {
      logger.error('레슨플랜 검토 실패:', e);
      Alert.alert('저장하지 못했습니다');
    }
  };

  const classChanges = classChangeList(plan, classKey, describe);
  const firstEmpty: Record<PlanLane, PlanRow | undefined> = {
    book: layout.lessons.find((r) => !r.book.length),
    activity: layout.lessons.find((r) => !r.activity.length),
  };

  // ── 칸 ─────────────────────────────────────────────────────────
  const onCell = (lane: PlanLane, c: PlanCell, r: PlanRow) => {
    if (readOnly) return;
    if (c.source === 'base' && !isFillerCell(c)) openItem(lane, c.item.id, r);
    else setDlg({ type: 'row', row: r });
  };
  const cellsView = (lane: PlanLane, r: PlanRow) => {
    const cells = r[lane];
    if (!cells.length) {
      if (readOnly || firstEmpty[lane] !== r) return <Text style={s.muted}>—</Text>;
      return (
        <TouchableOpacity style={s.addBtn} onPress={() => addItemAt(lane, null, r)}>
          <Text style={s.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      );
    }
    return (
      <View style={{ gap: 4 }}>
        {cells.map((c, i) => {
          const filler = isFillerCell(c);
          const label = filler && c.item.kind === 'blank'
            ? `Pushed back${c.item.text ? ` — ${c.item.text}` : ''}`
            : cellLabel(c, describe) || (lane === 'book' ? 'Choose a unit' : 'Add an activity');
          const empty = !filler && !cellLabel(c, describe);
          const links = lane === 'book' && !filler && c.item.units?.length ? linkFor(c.item.units[0]) : {};
          const href = links.canva ?? links.drive;
          return (
            <View key={`${c.item.id}-${i}`} style={s.cellRow}>
              {i > 0 && <Text style={s.plus}>+</Text>}
              <TouchableOpacity style={{ flexShrink: 1 }} disabled={readOnly} onPress={() => onCell(lane, c, r)}>
                <Text style={[s.cellText, filler && s.cellFiller, empty && s.muted]}>{label}</Text>
              </TouchableOpacity>
              {c.pinned && <Text style={{ fontSize: 11 }}>📌</Text>}
              {(c.source === 'class' || c.mergedForClass) && multi && (
                <View style={s.classTag}><Text style={s.classTagText}>{classKeyLabel(classKey)}</Text></View>
              )}
              {!!href && (
                <TouchableOpacity style={s.pageChip} onPress={() => openUrl(href)}>
                  <Text style={s.pageChipText}>p.{links.page}</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    );
  };
  const menuBtn = (r: PlanRow) => (readOnly ? null : (
    <TouchableOpacity onPress={() => setDlg({ type: 'row', row: r })} style={s.menuBtn} accessibilityLabel="Change this day">
      <Ionicons name="ellipsis-horizontal" size={18} color="#9ca3af" />
    </TouchableOpacity>
  ));
  const fixedText = (field: 'orientation' | 'final') => {
    const v = plan[field] ?? '';
    return (
      <TouchableOpacity disabled={readOnly} onPress={() => setDlg({ type: 'text', field })}>
        <Text style={[s.cellText, !v && s.muted]}>{v || (field === 'orientation' ? 'Add your orientation plan' : 'Add your final day plan')}</Text>
      </TouchableOpacity>
    );
  };

  const dialogItem = dlg?.type === 'item' ? laneOf(plan, dlg.lane).find((x) => x.id === dlg.itemId) : undefined;
  const dialogRowUnit = (() => {
    if (dlg?.type !== 'item') return undefined;
    const n = dlg.row?.book.find((c) => c.item.units?.length)?.item.units?.[0];
    return n ? unitOf(catalog, plan.bookTitle, n) : undefined;
  })();

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {header}
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {sample && (
          <View style={s.sampleBox}>
            <Text style={s.sampleTitle}>SAMPLE · A finished lesson plan to copy from</Text>
            <Text style={s.sampleIntro}>{sample.intro}</Text>
            <View style={s.chips}>
              {SAMPLE_KEYS.map((k) => (
                <TouchableOpacity key={k} style={[s.chip, { backgroundColor: k === sample.key ? '#0369a1' : '#fff' }]} onPress={() => navigation.setParams({ sample: k })}>
                  <Text style={[s.chipText, { color: k === sample.key ? '#fff' : '#075985', fontWeight: '700' }]}>{sampleFor(k).label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* 머리 */}
        <View style={s.card}>
          <Text style={s.kicker}>{[plan.campCode, plan.subject, plan.group].filter(Boolean).join(' · ')}</Text>
          <View style={s.titleRow}>
            <Text style={s.title}>{plan.bookTitle}</Text>
            <StatusPill status={plan.status} />
            {plan.editedAfterApproval && <View style={[s.pill, { backgroundColor: '#f5f3ff' }]}><Text style={[s.pillText, { color: '#6d28d9' }]}>Edited after approval</Text></View>}
          </View>
          {!owner && !!plan.userName && <Text style={s.metaText}>{plan.userName}</Text>}
          <Text style={s.metaText}>
            {plan.bookCodes.join(', ')} · {level.level} · {level.ratio}{scope?.length ? ` · Camp book U${scope[0]}–U${scope[scope.length - 1]}` : ''}
          </Text>
          {resources.length > 0 && (
            <View style={s.chips}>
              {resources.map((r) => {
                const tone = r.kind === 'camp' ? { bg: BLUE, fg: '#fff' } : r.kind === 'campPdf' ? { bg: '#eff6ff', fg: '#1d4ed8' } : r.kind === 'book' ? { bg: '#f5f3ff', fg: '#6d28d9' } : null;
                return (
                  <TouchableOpacity key={r.url} style={[s.chip, tone && { backgroundColor: tone.bg }]} onPress={() => openUrl(r.url)}>
                    <Text style={[s.chipText, tone && { color: tone.fg, fontWeight: '700' }]}>{r.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          <View style={s.actionsRow}>
            {owner && (
              <>
                <TouchableOpacity style={[s.ghost, !history.length && { opacity: 0.4 }]} disabled={!history.length} onPress={undo}><Text style={s.ghostText}>↶ Undo</Text></TouchableOpacity>
                {!isEmptyPlan(plan) && <TouchableOpacity style={s.ghost} onPress={autoFill}><Text style={s.ghostText}>Auto-fill again</Text></TouchableOpacity>}
              </>
            )}
            {!sample && <TouchableOpacity style={[s.ghost, { borderColor: '#bae6fd', backgroundColor: '#f0f9ff' }]} onPress={openSample}><Text style={[s.ghostText, { color: '#075985' }]}>See a sample</Text></TouchableOpacity>}
            <View style={{ flex: 1 }} />
            {owner && (plan.status === 'draft' || plan.status === 'changes' || (plan.status === 'approved' && plan.editedAfterApproval)) && (
              <TouchableOpacity style={[s.primary, isEmptyPlan(plan) && { opacity: 0.4 }]} disabled={isEmptyPlan(plan)} onPress={submit}>
                <Text style={s.primaryText}>{plan.status === 'draft' ? 'Submit' : 'Submit again'}</Text>
              </TouchableOpacity>
            )}
            {owner && plan.status === 'submitted' && <Text style={s.submitted}>Submitted ✓</Text>}
            {isAdmin && !owner && !sample && (
              <>
                <TouchableOpacity style={[s.ghost, { borderColor: '#fcd34d' }]} onPress={() => setDlg({ type: 'review' })}><Text style={[s.ghostText, { color: '#92400e' }]}>수정 요청</Text></TouchableOpacity>
                <TouchableOpacity style={[s.primary, { backgroundColor: '#059669' }]} onPress={() => { void review('approved'); }}><Text style={s.primaryText}>승인</Text></TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {plan.status === 'changes' && (
          <View style={s.noteBox}>
            <Text style={s.noteTitle}>Your manager asked for changes</Text>
            {!!plan.reviewNote && <Text style={s.noteText}>{plan.reviewNote}</Text>}
          </View>
        )}

        {/* 규칙 */}
        <View style={[s.card, { paddingVertical: 0 }]}>
          <TouchableOpacity style={s.rulesHead} onPress={() => setRulesOpen((v) => !v)}>
            <Text style={s.rulesTitle}>Rules & how to change days</Text>
            <Ionicons name={rulesOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
          </TouchableOpacity>
          {rulesOpen && (
            <View style={{ paddingBottom: 14, gap: 4 }}>
              {[...PLAN_RULES, `${level.level}: ${level.ratio}`].map((r) => <Text key={r} style={s.ruleText}>• {r}</Text>)}
              <Text style={[s.ruleText, { marginTop: 6 }]}>• <Text style={s.bold}>No class one day</Text> (sick, trip, other activity): ⋯ → No class this day. Everything after moves back.</Text>
              <Text style={s.ruleText}>• <Text style={s.bold}>Unit not finished</Text>: ⋯ → Continue next lesson.</Text>
              <Text style={s.ruleText}>• <Text style={s.bold}>Only the activity didn&apos;t happen</Text>: ⋯ → Push the activity back. The book stays.</Text>
              <Text style={s.ruleText}>• <Text style={s.bold}>Catch up</Text>: ⋯ → Do it together with the previous lesson.</Text>
            </View>
          )}
        </View>

        {/* 반 */}
        {keys.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {keys.map((k) => {
              const on = k === classKey;
              const t = times[k.split(':')[0]];
              const n = classChangeList(plan, k).length;
              return (
                <TouchableOpacity key={k} onPress={() => setClassKey(k)} style={[s.classTab, on && s.classTabOn]}>
                  <Text style={[s.classTabText, on && { color: '#fff' }]}>{classKeyLabel(k)}</Text>
                  {!!t && <Text style={[s.classTabTime, on && { color: 'rgba(255,255,255,0.7)' }]}>{t}</Text>}
                  {n > 0 && <View style={[s.badge, on && { backgroundColor: '#fbbf24' }]}><Text style={s.badgeText}>{n}</Text></View>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {!layout.hasCalendar && <Text style={s.hint}>The camp schedule isn&apos;t ready yet, so lessons have no dates. Dates appear automatically when the schedule is set.</Text>}
        {layout.warnings.length > 0 && (
          <View style={s.warnBox}>{layout.warnings.map((w) => <Text key={w} style={s.warnText}>⚠️ {w}</Text>)}</View>
        )}

        {isEmptyPlan(plan) && owner ? (
          <View style={[s.card, { alignItems: 'center', borderColor: '#bfdbfe' }]}>
            <Text style={s.startTitle}>Start your {plan.bookTitle} plan</Text>
            <Text style={s.startHint}>
              {layout.hasCalendar ? `${lessonCount} lessons in the camp schedule` : 'How many lessons?'}
              {units.length ? ` · ${scope?.length ? `camp book U${scope[0]}–U${scope[scope.length - 1]}` : `${units.length} units`}` : ''}
            </Text>
            {!layout.hasCalendar && (
              <TextInput placeholderTextColor="#9ca3af" value={manualCount} onChangeText={setManualCount} keyboardType="number-pad" style={[s.input, { width: 80, textAlign: 'center', marginTop: 10 }]} />
            )}
            <TouchableOpacity style={[s.primary, { marginTop: 14, alignSelf: 'stretch' }]} onPress={autoFill}>
              <Text style={s.primaryText}>{units.length ? 'Auto-fill from the book' : `Make ${lessonCount} lessons`}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.ghost, { marginTop: 8, alignSelf: 'stretch', alignItems: 'center' }]} onPress={startBlank}>
              <Text style={s.ghostText}>Start blank</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openSample} style={{ marginTop: 10 }}><Text style={[s.link, { fontSize: 13 }]}>See a finished sample first</Text></TouchableOpacity>
            <Text style={[s.startHint, { fontSize: 11, marginTop: 10, textAlign: 'center' }]}>
              {units.length
                ? 'Auto-fill follows the rules (one unit over two days for short books, review on the last lesson). Change anything after.'
                : 'There is no unit list for this book yet — you will type the unit numbers.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {layout.rows.map((r, i) => {
              const key = r.day?.date ?? `l${i}`;
              if (r.type === 'off') {
                return (
                  <View key={key} style={s.offRow}>
                    <Text style={s.offText}>{rowTitle(r)}</Text>
                    <Text style={[s.offText, { flex: 1 }]} numberOfLines={1}>· {r.day?.kindLabel || 'No class'}</Text>
                    {r.day?.kind !== 'checkout' && menuBtn(r)}
                  </View>
                );
              }
              const tone = r.type === 'skipped' ? s.rowSkipped : r.type === 'lesson' ? null : s.rowFixed;
              return (
                <View key={key} style={[s.rowCard, tone]}>
                  <View style={s.rowHead}>
                    {!!r.lessonNo && <View style={s.lessonBadge}><Text style={s.lessonBadgeText}>L{r.lessonNo}</Text></View>}
                    <Text style={s.rowTitle}>{rowTitle(r)}</Text>
                    {r.extra && <Text style={s.extraTag}>Extra class</Text>}
                    <View style={{ flex: 1 }} />
                    {(r.type === 'lesson' || r.type === 'skipped') && menuBtn(r)}
                  </View>
                  {r.type === 'skipped' && <Text style={s.skipText}>No class{r.skip?.note ? ` — ${r.skip.note}` : ''}</Text>}
                  {(r.type === 'orientation' || r.type === 'final') && (
                    <View style={{ marginTop: 6 }}>
                      <Text style={s.fixedKind}>{r.type === 'orientation' ? 'Orientation' : 'Final Test Day'}</Text>
                      {fixedText(r.type === 'orientation' ? 'orientation' : 'final')}
                    </View>
                  )}
                  {r.type === 'lesson' && (
                    <View style={{ marginTop: 8, gap: 6 }}>
                      <View style={s.field}><Text style={s.fieldLabel}>Review</Text>
                        <Text style={[s.cellText, { flex: 1 }, r.reviewAuto && { color: '#6b7280' }, !r.review && s.muted]}>{r.review ? `${r.afterOutdoor ? '🌳 ' : ''}${r.review}` : '—'}</Text>
                      </View>
                      <View style={s.field}><Text style={s.fieldLabel}>Book</Text><View style={{ flex: 1 }}>{cellsView('book', r)}</View></View>
                      <View style={s.field}><Text style={s.fieldLabel}>Activity</Text><View style={{ flex: 1 }}>{cellsView('activity', r)}</View></View>
                    </View>
                  )}
                  {tipView(r)}
                </View>
              );
            })}
          </View>
        )}

        {(layout.overflow.book.length > 0 || layout.overflow.activity.length > 0) && (
          <View style={[s.card, { borderColor: '#fcd34d' }]}>
            <Text style={s.boxTitle}>Didn&apos;t fit in {classKeyLabel(classKey)}&apos;s schedule</Text>
            <Text style={s.boxHint}>Fit them into the last lesson, remove them, or add an extra class on a free day.</Text>
            {(['book', 'activity'] as PlanLane[]).flatMap((lane) => layout.overflow[lane].map((g) => {
              const head = g[0];
              const isBase = head.source === 'base' && !isFillerCell(head);
              return (
                <View key={`${lane}-${head.item.id}`} style={s.overRow}>
                  <Text style={s.overLabel}><Text style={s.bold}>{lane === 'book' ? 'Book' : 'Activity'}</Text>  {g.map((c) => cellLabel(c, describe) || '(empty)').join(' + ')}</Text>
                  {!readOnly && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                      {isBase && (
                        <TouchableOpacity style={s.softBtn} onPress={() => withScope('Fit into the last lesson', (sc) => { apply((p) => mergeWithPrevious(p, lane, head.item.id, sc)); done('Fitted into the last lesson'); })}>
                          <Text style={s.softBtnText}>Fit into last lesson</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={s.dangerSoft} onPress={() => apply((p) => (isBase ? removeItem(p, lane, head.item.id) : removeFiller(p, lane, head, classKey)))}>
                        <Text style={s.dangerSoftText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }))}
          </View>
        )}

        {uncovered.length > 0 && !isEmptyPlan(plan) && (
          <View style={s.card}>
            <Text style={s.boxTitle}>Camp book units not in the plan</Text>
            <Text style={s.boxHint}>That&apos;s fine if there isn&apos;t time — or add them.</Text>
            <View style={s.chips}>
              {uncovered.map((n) => (
                <TouchableOpacity key={n} disabled={readOnly} style={s.chip}
                  onPress={() => {
                    const lastUnit = plan.book.reduce((acc, x, i) => (x.units?.length ? i : acc), -1);
                    apply((p) => insertItem(p, 'book', lastUnit + 1, { units: [n] }).plan);
                    say(`U${n} added after the last unit`);
                  }}>
                  <Text style={s.chipText}>{readOnly ? '' : '+ '}U{n} {unitOf(catalog, plan.bookTitle, n)?.title ?? ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {classChanges.length > 0 && (
          <View style={s.card}>
            <Text style={s.boxTitle}>Changes for {classKeyLabel(classKey)} only</Text>
            {classChanges.map((c) => (
              <View key={c.key} style={s.changeRow}>
                <Text style={s.changeText}>{c.label}</Text>
                {!readOnly && <TouchableOpacity onPress={() => apply(c.undo)}><Text style={s.undoText}>Undo</Text></TouchableOpacity>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {!!flash && <View pointerEvents="none" style={s.flash}><Text style={s.flashText}>{flash}</Text></View>}

      {/* 창 */}
      {dlg?.type === 'row' && (
        <Sheet title={rowTitle(dlg.row)} subtitle={[classKeyLabel(classKey), dlg.row.lessonNo ? `Lesson ${dlg.row.lessonNo}` : dlg.row.day?.kindLabel].filter(Boolean).join(' · ')} onClose={() => setDlg(null)}>
          <ActionList actions={planRowActions(plan, dlg.row, classKey, { hasCalendar: layout.hasCalendar, describe })} onPick={(a) => runAction(a, dlg.row)} />
        </Sheet>
      )}
      {dlg?.type === 'scope' && (
        <Sheet title={dlg.title} subtitle="Which classes?" onClose={() => setDlg(null)}>
          <TouchableOpacity style={[s.option, s.optionOn]} onPress={() => dlg.run(classKey)}>
            <Text style={[s.optionTitle, { color: '#1e40af' }]}>Only {classKeyLabel(classKey)}</Text>
            <Text style={s.optionHint}>The other classes keep their plan.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.option} onPress={() => dlg.run('all')}>
            <Text style={s.optionTitle}>All classes with this book</Text>
            <Text style={s.optionHint}>{keys.map(classKeyLabel).join(', ')}</Text>
          </TouchableOpacity>
        </Sheet>
      )}
      {dlg?.type === 'skip' && (
        <SkipSheet date={dlg.date} classKey={classKey} classKeys={keys} otherPlans={others.length}
          onSave={(k, note) => { void saveSkip(dlg.date, k, note); }} onClose={() => setDlg(null)} />
      )}
      {dlg?.type === 'item' && dialogItem && dlg.lane === 'book' && (
        <BookSheet
          key={dialogItem.id}
          item={dialogItem}
          rowLabel={dlg.row ? rowSubtitle(dlg.row) : ''}
          autoReview={dlg.row?.reviewAuto ? dlg.row.review : ''}
          units={units}
          scope={scope}
          catalog={catalog}
          bookTitle={plan.bookTitle}
          bookCodes={plan.bookCodes}
          dropLabel={multi ? `Skip this lesson for ${classKeyLabel(classKey)} only` : undefined}
          onSave={(patch) => { apply((p) => updateItem(p, 'book', dialogItem.id, patch)); setDlg(null); }}
          onDelete={() => Alert.alert('Delete this book lesson?', 'For every class. The rest moves one lesson earlier.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => { apply((p) => removeItem(p, 'book', dialogItem.id)); setDlg(null); } },
          ])}
          onMove={(d) => apply((p) => moveItem(p, 'book', dialogItem.id, d))}
          onDrop={() => { apply((p) => dropForClass(p, 'book', dialogItem.id, classKey)); done(`Skipped for ${classKeyLabel(classKey)}`); }}
          onClose={closeItem}
        />
      )}
      {dlg?.type === 'item' && dialogItem && dlg.lane === 'activity' && (
        <ActivitySheet
          key={dialogItem.id}
          item={dialogItem}
          rowLabel={dlg.row ? rowSubtitle(dlg.row) : ''}
          unit={dialogRowUnit}
          seed={plan.activity.findIndex((x) => x.id === dialogItem.id)}
          dropLabel={multi ? `Skip this activity for ${classKeyLabel(classKey)} only` : undefined}
          onSave={(patch) => { apply((p) => updateItem(p, 'activity', dialogItem.id, patch)); setDlg(null); }}
          onDelete={() => Alert.alert('Delete this activity?', 'For every class. The rest moves one lesson earlier.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => { apply((p) => removeItem(p, 'activity', dialogItem.id)); setDlg(null); } },
          ])}
          onMove={(d) => apply((p) => moveItem(p, 'activity', dialogItem.id, d))}
          onDrop={() => { apply((p) => dropForClass(p, 'activity', dialogItem.id, classKey)); done(`Skipped for ${classKeyLabel(classKey)}`); }}
          onClose={closeItem}
        />
      )}
      {dlg?.type === 'text' && (
        <TextSheet
          title={dlg.field === 'orientation' ? 'Orientation day' : 'Final Test Day'}
          value={plan[dlg.field] ?? ''}
          placeholder={dlg.field === 'orientation' ? 'Self-introductions · name game · class rules' : 'Final test · review & English games · photo time'}
          onSave={(v) => { apply((p) => ({ ...p, [dlg.field]: v })); setDlg(null); }}
          onClose={() => setDlg(null)}
        />
      )}
      {dlg?.type === 'review' && (
        <TextSheet title="수정 요청" value={plan.reviewNote ?? ''} placeholder="선생님에게 그대로 보입니다" saveLabel="보내기"
          onSave={(v) => { void review('changes', v); }} onClose={() => setDlg(null)} />
      )}
    </SafeAreaView>
  );
}

// ── 창 ───────────────────────────────────────────────────────────────

function Sheet({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.sheetWrap}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHead}>
            <View style={{ flex: 1 }}>
              {!!subtitle && <Text style={s.sheetSub} numberOfLines={1}>{subtitle}</Text>}
              <Text style={s.sheetTitle}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close" style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color="#9ca3af" />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer && <View style={s.sheetFoot}>{footer}</View>}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function ActionList({ actions, onPick }: { actions: PlanRowAction[]; onPick: (a: PlanRowAction) => void }) {
  if (!actions.length) return <Text style={s.boxHint}>Nothing to change here.</Text>;
  const sections = [...new Set(actions.map((a) => a.section))];
  return (
    <View style={{ gap: 14 }}>
      {sections.map((sec) => (
        <View key={sec}>
          <Text style={s.smallLabel}>{sec.toUpperCase()}</Text>
          <View style={s.actionGroup}>
            {actions.filter((a) => a.section === sec).map((a, i) => (
              <TouchableOpacity key={a.key} style={[s.actionItem, i > 0 && { borderTopWidth: 1, borderTopColor: '#f3f4f6' }]} onPress={() => onPick(a)}>
                <Text style={[s.actionLabel, a.danger && { color: '#dc2626' }]}>{a.label}</Text>
                {!!a.hint && <Text style={s.actionHint}>{a.hint}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function SkipSheet({ date, classKey, classKeys, otherPlans, onSave, onClose }: {
  date: string; classKey: string; classKeys: string[]; otherPlans: number;
  onSave: (kind: 'class' | 'book' | 'mine', note: string) => void; onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [kind, setKind] = useState<'class' | 'book' | 'mine'>('class');
  const options: Array<{ key: 'class' | 'book' | 'mine'; label: string; hint: string }> = [
    { key: 'class', label: `Only ${classKeyLabel(classKey)}`, hint: 'e.g. this class went on a trip' },
    ...(classKeys.length > 1 ? [{ key: 'book' as const, label: 'All classes with this book', hint: classKeys.map(classKeyLabel).join(', ') }] : []),
    ...(otherPlans > 0 ? [{ key: 'mine' as const, label: 'All my classes (every book)', hint: `e.g. you were sick — ${otherPlans + 1} lesson plans` }] : []),
  ];
  return (
    <Sheet
      title={`No class on ${shortDate(date)}`}
      subtitle="Everything after this day moves back one lesson"
      onClose={onClose}
      footer={(
        <>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={s.ghostPlain} onPress={onClose}><Text style={s.ghostText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={[s.primary, { backgroundColor: '#f59e0b' }]} onPress={() => onSave(kind, note)}><Text style={s.primaryText}>Mark no class</Text></TouchableOpacity>
        </>
      )}
    >
      <Text style={s.label}>Why? <Text style={s.muted}>(optional)</Text></Text>
      <View style={s.chips}>
        {SKIP_REASONS.map((r) => (
          <TouchableOpacity key={r} style={[s.chip, note === r && { backgroundColor: '#fef3c7' }]} onPress={() => setNote(r)}>
            <Text style={[s.chipText, note === r && { color: '#92400e', fontWeight: '700' }]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput placeholderTextColor="#9ca3af" value={note} onChangeText={setNote} placeholder="Note" style={[s.input, { marginTop: 8 }]} />
      {options.length > 1 && (
        <>
          <Text style={[s.label, { marginTop: 14 }]}>Which classes?</Text>
          {options.map((o) => (
            <TouchableOpacity key={o.key} style={[s.option, kind === o.key && { borderColor: '#fcd34d', backgroundColor: '#fffbeb' }]} onPress={() => setKind(o.key)}>
              <Text style={s.optionTitle}>{kind === o.key ? '● ' : '○ '}{o.label}</Text>
              <Text style={s.optionHint}>{o.hint}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
    </Sheet>
  );
}

const PARTS = ['', 'Part 1', 'Part 2', 'Part 3'];

function BookSheet({ item, rowLabel, autoReview, units, scope, catalog, bookTitle, bookCodes, dropLabel, onSave, onDelete, onMove, onDrop, onClose }: {
  item: PlanItem; rowLabel: string; autoReview: string; units: BookUnit[]; scope?: number[]; catalog: EslBookUnits | null;
  bookTitle: string; bookCodes: string[]; dropLabel?: string;
  onSave: (patch: Partial<PlanItem>) => void; onDelete: () => void; onMove: (d: -1 | 1) => void; onDrop: () => void; onClose: () => void;
}) {
  const [picked, setPicked] = useState<number[]>(item.units ?? []);
  const [part, setPart] = useState(item.part ?? '');
  const [text, setText] = useState(item.text ?? '');
  const [review, setReview] = useState(item.review ?? '');
  const [typed, setTyped] = useState('');
  const [showAll, setShowAll] = useState(false);
  const list = showAll || !scope?.length ? units : units.filter((u) => scope.includes(u.no));
  const toggle = (n: number) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n].sort((a, b) => a - b)));
  const addTyped = () => {
    const nums = typed.split(/[^0-9]+/).map(Number).filter((n) => n > 0 && n < 100);
    if (nums.length) setPicked((p) => [...new Set([...p, ...nums])].sort((a, b) => a - b));
    setTyped('');
  };
  return (
    <Sheet
      title="Book"
      subtitle={rowLabel}
      onClose={onClose}
      footer={(
        <>
          <TouchableOpacity style={s.ghostPlain} onPress={onDelete}><Text style={[s.ghostText, { color: '#dc2626' }]}>Delete</Text></TouchableOpacity>
          <TouchableOpacity style={s.ghostPlain} onPress={() => onMove(-1)} accessibilityLabel="Move earlier"><Ionicons name="arrow-up" size={18} color="#4b5563" /></TouchableOpacity>
          <TouchableOpacity style={s.ghostPlain} onPress={() => onMove(1)} accessibilityLabel="Move later"><Ionicons name="arrow-down" size={18} color="#4b5563" /></TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={s.primary} onPress={() => onSave({ units: picked, part: part.trim(), text: text.trim(), review: review.trim() })}><Text style={s.primaryText}>Save</Text></TouchableOpacity>
        </>
      )}
    >
      <View style={s.labelRow}>
        <Text style={s.label}>Unit</Text>
        {!!scope?.length && units.length > scope.length && (
          <TouchableOpacity onPress={() => setShowAll((v) => !v)}><Text style={s.link}>{showAll ? 'Camp book only' : `Show all ${units.length}`}</Text></TouchableOpacity>
        )}
      </View>
      {list.length > 0 ? (
        <View style={s.unitGrid}>
          {list.map((u) => {
            const on = picked.includes(u.no);
            return (
              <TouchableOpacity key={u.no} style={[s.unitBtn, on && s.unitBtnOn]} onPress={() => toggle(u.no)}>
                <Text style={[s.unitBtnText, on && { color: '#fff' }]} numberOfLines={2}><Text style={s.bold}>U{u.no}</Text> {u.title}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : <Text style={s.boxHint}>No unit list for this book yet — type unit numbers.</Text>}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <TextInput placeholderTextColor="#9ca3af" value={typed} onChangeText={setTyped} onSubmitEditing={addTyped} placeholder="Unit number (e.g. 5 or 5, 6)" keyboardType="numbers-and-punctuation" style={[s.input, { flex: 1 }]} />
        <TouchableOpacity style={[s.ghost, !typed.trim() && { opacity: 0.4 }]} disabled={!typed.trim()} onPress={addTyped}><Text style={s.ghostText}>Add</Text></TouchableOpacity>
      </View>
      {picked.length > 0 && (
        <View style={s.chips}>
          {picked.map((n) => (
            <TouchableOpacity key={n} style={[s.chip, { backgroundColor: '#eff6ff' }]} onPress={() => toggle(n)}><Text style={[s.chipText, { color: '#1d4ed8', fontWeight: '700' }]}>U{n} ×</Text></TouchableOpacity>
          ))}
        </View>
      )}
      <Text style={[s.label, { marginTop: 14 }]}>Part</Text>
      <View style={s.chips}>
        {PARTS.map((p) => (
          <TouchableOpacity key={p || 'none'} style={[s.chip, part === p && { backgroundColor: '#111827' }]} onPress={() => setPart(p)}>
            <Text style={[s.chipText, part === p && { color: '#fff' }]}>{p || 'Whole unit'}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[s.label, { marginTop: 14 }]}>Notes</Text>
      <TextInput placeholderTextColor="#9ca3af" value={text} onChangeText={setText} multiline placeholder="Pages, focus, worksheet…" style={[s.input, { minHeight: 64, textAlignVertical: 'top' }]} />
      <Text style={[s.label, { marginTop: 14 }]}>Review</Text>
      <TextInput placeholderTextColor="#9ca3af" value={review} onChangeText={setReview} placeholder={autoReview || 'Automatic: the previous lesson'} style={s.input} />
      <Text style={s.boxHint}>Leave empty to review the previous lesson automatically.</Text>
      {picked.map((n) => {
        const u = units.find((x) => x.no === n);
        const links = unitLinks(catalog, bookCodes, bookTitle, n);
        const href = links.canva ?? links.drive;
        if (!u && !href) return null;
        return (
          <View key={n} style={s.unitInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Text style={[s.bold, { flex: 1, color: '#111827' }]}>U{n} {u?.title ?? ''}</Text>
              {!!href && <TouchableOpacity style={s.pageChip} onPress={() => openUrl(href)}><Text style={s.pageChipText}>{links.canva ? 'Book' : 'PDF'} p.{links.page}</Text></TouchableOpacity>}
            </View>
            {!!u?.objective && <Text style={s.unitInfoText}><Text style={s.bold}>Goal </Text>{u.objective}</Text>}
            {!!u?.focus && <Text style={s.unitInfoText}><Text style={s.bold}>Focus </Text>{u.focus}</Text>}
            {!!u?.words?.length && <Text style={s.unitInfoText}><Text style={s.bold}>Words </Text>{u.words.join(', ')}</Text>}
          </View>
        );
      })}
      {!!dropLabel && <TouchableOpacity onPress={onDrop} style={{ marginTop: 12 }}><Text style={s.dropText}>{dropLabel}</Text></TouchableOpacity>}
    </Sheet>
  );
}

function ActivitySheet({ item, rowLabel, unit, seed, dropLabel, onSave, onDelete, onMove, onDrop, onClose }: {
  item: PlanItem; rowLabel: string; unit?: BookUnit; seed: number; dropLabel?: string;
  onSave: (patch: Partial<PlanItem>) => void; onDelete: () => void; onMove: (d: -1 | 1) => void; onDrop: () => void; onClose: () => void;
}) {
  const [text, setText] = useState(item.text ?? '');
  return (
    <Sheet
      title="English activity"
      subtitle={rowLabel}
      onClose={onClose}
      footer={(
        <>
          <TouchableOpacity style={s.ghostPlain} onPress={onDelete}><Text style={[s.ghostText, { color: '#dc2626' }]}>Delete</Text></TouchableOpacity>
          <TouchableOpacity style={s.ghostPlain} onPress={() => onMove(-1)} accessibilityLabel="Move earlier"><Ionicons name="arrow-up" size={18} color="#4b5563" /></TouchableOpacity>
          <TouchableOpacity style={s.ghostPlain} onPress={() => onMove(1)} accessibilityLabel="Move later"><Ionicons name="arrow-down" size={18} color="#4b5563" /></TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={s.primary} onPress={() => onSave({ text: text.trim() })}><Text style={s.primaryText}>Save</Text></TouchableOpacity>
        </>
      )}
    >
      <TextInput placeholderTextColor="#9ca3af" value={text} onChangeText={setText} multiline autoFocus placeholder="Game or activity, and what it practises" style={[s.input, { minHeight: 72, textAlignVertical: 'top' }]} />
      <Text style={[s.smallLabel, { marginTop: 12 }]}>IDEAS{unit ? ` WITH U${unit.no} WORDS` : ''}</Text>
      <View style={s.chips}>
        {activityIdeas(unit, seed).map((i) => (
          <TouchableOpacity key={i} style={s.chip} onPress={() => setText(i)}><Text style={s.chipText}>{i}</Text></TouchableOpacity>
        ))}
      </View>
      {!!dropLabel && <TouchableOpacity onPress={onDrop} style={{ marginTop: 12 }}><Text style={s.dropText}>{dropLabel}</Text></TouchableOpacity>}
    </Sheet>
  );
}

function TextSheet({ title, value, placeholder, saveLabel, onSave, onClose }: {
  title: string; value: string; placeholder?: string; saveLabel?: string; onSave: (v: string) => void; onClose: () => void;
}) {
  const [v, setV] = useState(value);
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={(
        <>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={s.ghostPlain} onPress={onClose}><Text style={s.ghostText}>Cancel</Text></TouchableOpacity>
          <TouchableOpacity style={s.primary} onPress={() => onSave(v.trim())}><Text style={s.primaryText}>{saveLabel ?? 'Save'}</Text></TouchableOpacity>
        </>
      )}
    >
      <TextInput placeholderTextColor="#9ca3af" value={v} onChangeText={setV} multiline autoFocus placeholder={placeholder} style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  backBtn: { padding: 6 },
  topTitle: { fontSize: 16, fontWeight: '800', color: '#111827', flexShrink: 1 },
  saveText: { fontSize: 12, color: '#9ca3af', paddingRight: 8 },
  scroll: { padding: 12, paddingBottom: 60, gap: 10, width: '100%', maxWidth: 760, alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  centerHint: { marginTop: 8, fontSize: 13, color: '#9ca3af' },
  emptyTitle: { marginTop: 12, fontSize: 15, fontWeight: '600', color: '#374151', textAlign: 'center' },
  errorText: { fontSize: 12, color: '#dc2626', paddingHorizontal: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e5e7eb', padding: 16 },
  kicker: { fontSize: 12, fontWeight: '700', color: BLUE },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  metaText: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: '#f3f4f6' },
  chipText: { fontSize: 12, color: '#374151' },
  actionsRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  ghost: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  ghostPlain: { paddingHorizontal: 10, paddingVertical: 9 },
  ghostText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  primary: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  submitted: { fontSize: 13, fontWeight: '700', color: '#1d4ed8' },
  noteBox: { backgroundColor: '#fffbeb', borderRadius: 12, borderWidth: 1, borderColor: '#fde68a', padding: 12 },
  noteTitle: { fontSize: 14, fontWeight: '800', color: '#78350f' },
  noteText: { fontSize: 13, color: '#78350f', marginTop: 2 },
  rulesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  rulesTitle: { fontSize: 14, fontWeight: '800', color: '#1f2937' },
  ruleText: { fontSize: 13, color: '#4b5563', lineHeight: 19 },
  bold: { fontWeight: '700' },
  classTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  classTabOn: { backgroundColor: '#111827', borderColor: '#111827' },
  classTabText: { fontSize: 14, fontWeight: '800', color: '#374151' },
  classTabTime: { fontSize: 12, color: '#9ca3af' },
  badge: { minWidth: 18, paddingHorizontal: 4, borderRadius: 6, backgroundColor: '#fef3c7', alignItems: 'center' },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#78350f' },
  hint: { fontSize: 12, color: '#6b7280', paddingHorizontal: 4 },
  warnBox: { backgroundColor: '#fffbeb', borderRadius: 12, borderWidth: 1, borderColor: '#fde68a', padding: 10, gap: 2 },
  warnText: { fontSize: 13, color: '#78350f' },
  startTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  startHint: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, backgroundColor: '#fff', color: '#111827' },
  offRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 4, borderRadius: 10, backgroundColor: '#f3f4f6', minHeight: 34 },
  offText: { fontSize: 12, color: '#9ca3af' },
  rowCard: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 12 },
  rowSkipped: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  rowFixed: { backgroundColor: '#f0f9ff', borderColor: '#e0f2fe' },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lessonBadge: { backgroundColor: BLUE, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  lessonBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  rowTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  extraTag: { fontSize: 11, fontWeight: '700', color: '#6d28d9' },
  menuBtn: { padding: 6 },
  skipText: { fontSize: 14, fontWeight: '600', color: '#92400e', marginTop: 4 },
  fixedKind: { fontSize: 11, fontWeight: '700', color: '#0369a1', marginBottom: 2 },
  field: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  fieldLabel: { width: 58, fontSize: 11, fontWeight: '700', color: '#9ca3af', paddingTop: 2 },
  cellRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 },
  cellText: { fontSize: 14, color: '#111827' },
  cellFiller: { fontStyle: 'italic', color: '#9ca3af' },
  muted: { color: '#9ca3af' },
  plus: { fontSize: 11, fontWeight: '800', color: '#7c3aed' },
  classTag: { backgroundColor: '#fffbeb', borderRadius: 4, paddingHorizontal: 4 },
  classTagText: { fontSize: 10, fontWeight: '700', color: AMBER },
  pageChip: { backgroundColor: '#f3f4f6', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  pageChipText: { fontSize: 11, color: '#4b5563', fontWeight: '600' },
  addBtn: { alignSelf: 'flex-start', borderWidth: 1, borderStyle: 'dashed', borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  addBtnText: { fontSize: 12, color: '#9ca3af' },
  boxTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  boxHint: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  overRow: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  overLabel: { fontSize: 13, color: '#1f2937' },
  softBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#eff6ff' },
  softBtnText: { fontSize: 12, fontWeight: '700', color: '#1d4ed8' },
  dangerSoft: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  dangerSoftText: { fontSize: 12, fontWeight: '600', color: '#dc2626' },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6', marginTop: 6 },
  changeText: { flex: 1, fontSize: 13, color: '#374151' },
  undoText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  flash: { position: 'absolute', bottom: 28, alignSelf: 'center', backgroundColor: '#111827', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },
  flashText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 18, paddingTop: 8, paddingBottom: 24, maxHeight: '88%' },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', marginBottom: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  sheetSub: { fontSize: 12, fontWeight: '700', color: BLUE },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  sheetFoot: { flexDirection: 'row', alignItems: 'center', gap: 4, borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 10, marginTop: 6 },
  smallLabel: { fontSize: 11, fontWeight: '800', color: '#9ca3af', marginBottom: 6, letterSpacing: 0.4 },
  actionGroup: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, overflow: 'hidden' },
  actionItem: { paddingHorizontal: 14, paddingVertical: 11 },
  actionLabel: { fontSize: 14, fontWeight: '700', color: '#111827' },
  actionHint: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  option: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginTop: 8 },
  optionOn: { borderColor: '#bfdbfe', backgroundColor: '#eff6ff' },
  optionTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  optionHint: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  label: { fontSize: 14, fontWeight: '700', color: '#1f2937', marginBottom: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  link: { fontSize: 12, fontWeight: '700', color: BLUE },
  unitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  unitBtn: { width: '48.5%', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  unitBtnOn: { backgroundColor: BLUE, borderColor: BLUE },
  unitBtnText: { fontSize: 13, color: '#1f2937' },
  unitInfo: { backgroundColor: '#f9fafb', borderRadius: 12, padding: 12, marginTop: 10, gap: 3 },
  unitInfoText: { fontSize: 12, color: '#4b5563' },
  dropText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  hubHead: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  hubTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  hubHint: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  hubRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  hubBook: { fontSize: 15, fontWeight: '800', color: '#111827' },
  hubSub: { fontSize: 12, fontWeight: '600', color: '#9ca3af' },
  hubClasses: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  hubCount: { fontSize: 11, color: '#9ca3af' },
  sampleChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd' },
  sampleChipText: { fontSize: 12, fontWeight: '700', color: '#075985' },
  sampleBox: { backgroundColor: '#f0f9ff', borderRadius: 16, borderWidth: 1, borderColor: '#bae6fd', padding: 14 },
  sampleTitle: { fontSize: 13, fontWeight: '800', color: '#0c4a6e' },
  sampleIntro: { fontSize: 13, color: '#0c4a6e', marginTop: 4, lineHeight: 19 },
  tip: { fontSize: 12, color: '#0c4a6e', backgroundColor: '#f0f9ff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  warnLine: { fontSize: 12, color: '#92400e', backgroundColor: '#fffbeb', paddingHorizontal: 16, paddingVertical: 9 },
});
