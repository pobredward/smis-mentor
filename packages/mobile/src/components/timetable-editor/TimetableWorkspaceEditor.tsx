/**
 * 시간표 통합 편집기 (모바일) — 웹과 같은 기능을 터치에 맞게.
 *
 * 편집기를 여는 동안의 모든 변경(표 · 반·이름 · 반 정보 · 칸 설명 · 일정표)은 작업 공간(timetableWorkspace)에만 모이고,
 * [저장] 한 번에 commitTimetableWorkspace 로 쓴다. Day·그룹·표를 오가도 고친 내용은 남고, 되돌리기·다시하기가 된다.
 *
 * 화면: 상단 바(제목 · 변경 배지 · 되돌리기/다시하기 · ⋯ · 저장 · 닫기) → 탭([일정표] + Day + [익사이팅]) → 그룹 → 표 칩 →
 *       편집 표(칸 탭 = 칸 편집, 시간 탭 = 줄 편집, '+' = 줄 넣기, 길게 누르기 = 여러 칸) → 아래 패널
 *       [과목·주제][반·이름][표 설정][칸 설명].
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EXCITING_CATEGORY,
  TIMETABLE_CATEGORIES,
  applyClassInfo,
  applyCommon,
  buildEmptyTimetable,
  categoryLabel,
  commitTimetableWorkspace,
  commonFor,
  dateLabelFor,
  daySetForGroup,
  getEslBooks,
  isMergedColumn,
  isSameGroup,
  loadTimetableWorkspace,
  makeNameResolvers,
  normalizeGroupKey,
  planDatesFor,
  resolveGroups,
  teacherMapOf,
  timetableGroupNames,
  timetableDraft as D,
  timetableWorkspace as W,
  type CampGroup,
  type CampTimetable,
} from '@smis-mentor/shared';
import { db } from '../../config/firebase';
import { useAuth } from '../../context/AuthContext';
import { getUsersByJobCodeId } from '../../services/userService';
import { scheduleQueryKey } from '../../services/scheduleBundle';
import { BulkSheet, type BulkInit } from './BulkSheet';
import { CellSheet } from './CellSheet';
import { DayPlanTab } from './DayPlanTab';
import { EditableGrid, cellKey } from './EditableGrid';
import { ExcitingTab, dayPlanTimeError } from './ExcitingTab';
import { GuidePanel } from './GuidePanel';
import { ImportSheet } from './ImportSheet';
import { RosterPanel } from './RosterPanel';
import { RowSheet } from './RowSheet';
import { SubjectsPanel } from './SubjectsPanel';
import { TableSettingsPanel } from './TableSettingsPanel';
import {
  Btn,
  C,
  Chip,
  Notice,
  Seg,
  Sheet,
  afterModal,
  datesText,
  staffRolesOf,
  subjectsOf,
  u,
  type EditTable,
  type SetWs,
} from './common';

/** 일정표 탭 키 — Day 키와 겹치지 않는 이름 */
export const PLAN_TAB = '__plan';
type PanelKey = 'subjects' | 'roster' | 'settings' | 'guides';
const NO_MEMBERS: never[] = [];
const NO_ROLES: Record<string, string> = {};

interface Props {
  jobCodeId: string;
  campCode: string;
  startMs: number | null;
  endMs: number | null;
  /** 처음 열 탭 — PLAN_TAB · EXCITING_CATEGORY 또는 Day 키 */
  initialTab?: string | null;
  initialGroup?: string | null;
  /** 보던 커스텀 표 */
  initialTableId?: string | null;
  onClose: () => void;
}

export function TimetableWorkspaceEditor({ jobCodeId, campCode, startMs, endMs, initialTab, initialGroup, initialTableId, onClose }: Props) {
  const { userData } = useAuth();
  const queryClient = useQueryClient();

  // ── 작업 공간 ─────────────────────────────────────────────────────
  const [ws, setWsState] = useState<W.Workspace | null>(null);
  const wsRef = useRef<W.Workspace | null>(null);
  const commitWs = useCallback((next: W.Workspace) => {
    wsRef.current = next;
    setWsState(next);
  }, []);
  /** fn 은 바로(동기) 불린다 — 결과를 같은 이벤트 안에서 이어 쓸 수 있다 */
  const setWs: SetWs = useCallback(
    (fn) => {
      const prev = wsRef.current;
      if (!prev) return;
      const next = fn(prev);
      if (next !== prev) commitWs(next);
    },
    [commitWs]
  );
  const [settingGroups, setSettingGroups] = useState<CampGroup[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await loadTimetableWorkspace(db, { campCode, jobCodeId });
    setSettingGroups(d.groups);
    return W.createWorkspace({ campCode, jobCodeId, tables: d.tables, common: d.common, classInfo: d.classInfo, guides: d.guides, dayPlan: d.dayPlan });
  }, [campCode, jobCodeId]);

  const firstLoad = useCallback(() => {
    setLoadError(null);
    load()
      .then(commitWs)
      .catch((e) => setLoadError((e as Error)?.message || '불러오지 못했습니다'));
  }, [load, commitWs]);
  useEffect(() => {
    firstLoad();
  }, [firstLoad]);

  const { data: members = NO_MEMBERS, isPending: membersPending } = useQuery({
    queryKey: ['campMembers', jobCodeId],
    queryFn: () => getUsersByJobCodeId(jobCodeId),
    staleTime: 5 * 60 * 1000,
  });
  const { data: books } = useQuery({ queryKey: ['eslBooks'], queryFn: () => getEslBooks(db), staleTime: 30 * 60 * 1000 });

  // ── 알림 ──────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  // ── 무엇을 고치는지 ────────────────────────────────────────────────
  const [tab, setTab] = useState<string>(initialTab || PLAN_TAB);
  const [groupPick, setGroupPick] = useState<string | null>(initialGroup ?? null);
  const [tablePick, setTablePick] = useState<Record<string, string>>(() =>
    initialTab && initialTab !== PLAN_TAB && initialTab !== EXCITING_CATEGORY && initialTableId
      ? { [`${initialTab}::${normalizeGroupKey(initialGroup)}`]: initialTableId }
      : {}
  );
  const [panel, setPanel] = useState<PanelKey>('subjects');
  const [focusClass, setFocusClass] = useState<string | null>(null);
  const [focusColumn, setFocusColumn] = useState<string | null>(null);

  const curTables = ws?.cur.tables;
  const tablesAll = useMemo(() => (curTables ? Object.values(curTables) : []), [curTables]);
  const derived = useMemo(() => resolveGroups(members as never[], jobCodeId, settingGroups), [members, jobCodeId, settingGroups]);
  const teacherByClassCode = useMemo(() => teacherMapOf(derived), [derived]);
  const groups = useMemo(() => timetableGroupNames(derived, tablesAll), [derived, tablesAll]);
  const group = (groupPick && groups.find((g) => isSameGroup(g, groupPick))) || groups[0] || null;
  const categories = useMemo(() => {
    const list = TIMETABLE_CATEGORIES.map((c) => ({ key: c.key, label: categoryLabel(c, campCode) }));
    const known = new Set(list.map((c) => c.key));
    tablesAll.forEach((t) => {
      if (known.has(t.dayType)) return;
      known.add(t.dayType);
      list.push({ key: t.dayType, label: t.dayTypeLabel || t.dayType });
    });
    return list;
  }, [campCode, tablesAll]);
  const isPlan = tab === PLAN_TAB;
  /** [익사이팅] 탭 — 코스 배정 (일정표처럼 그룹·표 고르기·편집 표·아래 패널이 없다) */
  const isExciting = tab === EXCITING_CATEGORY;
  const noTable = isPlan || isExciting;
  const category = noTable ? null : tab;
  const fallbackFor = useCallback(
    (g: string) => (derived.find((x) => isSameGroup(x.name, g))?.classCodes ?? []).map((classCode) => ({ classCode })),
    [derived]
  );
  const staffByRole = derived.find((g) => isSameGroup(g.name, group))?.staffByRole ?? NO_ROLES;

  const tableList = ws && category && group ? W.tablesOf(ws, category, group) : [];
  const pickKey = `${category}::${normalizeGroupKey(group)}`;
  const saved = tableList.find((t) => t.id === tablePick[pickKey]) ?? tableList[0] ?? null;
  /** 저장된 표가 없으면 빈 뼈대 — 처음 고칠 때 새 표가 된다 */
  const skeleton =
    !saved && ws && category && group
      ? buildEmptyTimetable({
          category,
          groupName: group,
          classes: W.groupClasses(ws, group, fallbackFor(group)).map((c) => ({ classCode: c.classCode })),
          campCode,
          jobCodeId,
        })
      : null;
  const table: CampTimetable | null = saved ?? skeleton;
  const exists = !!saved;
  const common = ws?.cur.common;
  const classInfo = ws?.cur.classInfo;
  /** 그릴 표 — 그룹 공통 반·이름과 캠프 반 정보를 입힌 것 (보기 화면과 같은 규칙) */
  const shown = useMemo(() => {
    if (!table) return null;
    const t = applyCommon(table, commonFor(common, table.groupName));
    return { ...t, classes: applyClassInfo(t.classes, classInfo) };
  }, [table, common, classInfo]);
  const subjects = subjectsOf(table);
  const resolvers = useMemo(() => makeNameResolvers(shown ?? undefined, teacherByClassCode, staffByRole), [shown, teacherByClassCode, staffByRole]);
  const daySet = useMemo(() => daySetForGroup(ws?.cur.dayPlan, group), [ws?.cur.dayPlan, group]);
  const planDates = useMemo(() => (category ? planDatesFor(daySet, category, campCode) : []), [daySet, category, campCode]);

  // ── 변경 상태 ─────────────────────────────────────────────────────
  const changes = useMemo(() => (ws ? W.changesOf(ws) : null), [ws]);
  const count = changes?.count ?? 0;
  const changedIds = useMemo(() => new Set([...(changes?.created ?? []), ...(changes?.updated ?? [])]), [changes]);
  const deletedBase = useMemo(
    () => (ws && changes ? changes.deleted.map((id) => ws.base.tables[id]).filter((t): t is CampTimetable => !!t) : []),
    [ws, changes]
  );
  /** 표가 있으면 회색 점, 이번에 바뀌었으면 주황 점 */
  const dotFor = (match: (t: CampTimetable) => boolean): 'saved' | 'changed' | null => {
    const cur = tablesAll.filter(match);
    if (cur.some((t) => changedIds.has(t.id)) || deletedBase.some(match)) return 'changed';
    return cur.length ? 'saved' : null;
  };

  // ── 표 고치기 ─────────────────────────────────────────────────────
  /** 빈 뼈대를 처음 고쳐 생긴 새 표 — 같은 이벤트에서 두 번 고쳐도 표가 두 장 생기지 않게 */
  const madeFrom = useRef<{ skeletonId: string; id: string } | null>(null);
  const editTable: EditTable = (fn, key) => {
    const w = wsRef.current;
    if (!w || !table) return;
    const made = madeFrom.current;
    const id = w.cur.tables[table.id] ? table.id : made?.skeletonId === table.id && w.cur.tables[made.id] ? made.id : null;
    if (id) {
      commitWs(W.editTable(w, id, fn, key));
      return;
    }
    const r = W.editTableWithId(w, table, fn, key);
    madeFrom.current = { skeletonId: table.id, id: r.id };
    commitWs(r.ws);
    setTablePick((p) => ({ ...p, [pickKey]: r.id }));
  };

  // ── 시트·선택 ─────────────────────────────────────────────────────
  const [cellAt, setCellAt] = useState<{ blockId: string; colKey: string } | null>(null);
  const [rowAt, setRowAt] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string> | null>(null);
  const [fillPick, setFillPick] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDates, setCustomDates] = useState<string[]>([]);
  const [changesOpen, setChangesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bulk, setBulk] = useState<BulkInit | null>(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const panelY = useRef(0);

  // Day·그룹·표를 바꾸면 열린 시트와 선택을 닫는다 (빈 뼈대가 방금 새 표가 된 경우는 같은 표라 그대로)
  const tableId = table?.id;
  const prevTableId = useRef(tableId);
  useEffect(() => {
    const prev = prevTableId.current;
    prevTableId.current = tableId;
    const made = madeFrom.current;
    if (prev && made && prev === made.skeletonId && tableId === made.id) return;
    setSel(null);
    setCellAt(null);
    setRowAt(null);
  }, [tableId, tab]);

  const scrollToPanel = () => setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, panelY.current - 8), animated: true }), 60);

  const blockTitle = (blockId: string) => {
    const b = table?.blocks.find((x) => x.id === blockId);
    if (!b) return '';
    if ((table?.layout ?? 'time') === 'date') return dateLabelFor(b, startMs) || '날짜 줄';
    return `${b.times?.[0]?.start ?? ''}~${b.times?.[(b.times?.length ?? 1) - 1]?.end ?? ''}`;
  };

  /** 줄 넣기 — 넣은 줄의 줄 편집을 바로 연다 (시각·이름을 이어서 고치게) */
  const addRow = (refId: string | null, where: 'before' | 'after', kind: 'class' | 'shared') => {
    let id = '';
    editTable((t) => {
      id = D.insertBlock(t, refId, where, kind);
    });
    if (id) setRowAt(id);
  };
  const insertRow = (refId: string | null, where: 'before' | 'after') =>
    Alert.alert('줄 넣기', '어떤 줄을 넣을까요?', [
      { text: '취소', style: 'cancel' },
      { text: '공통 줄', onPress: () => addRow(refId, where, 'shared') },
      { text: '반별 줄', onPress: () => addRow(refId, where, 'class') },
    ]);

  const onCell = (blockId: string, colKey: string) => {
    if (sel) {
      const b = table?.blocks.find((x) => x.id === blockId);
      const extra = table?.extraColumns?.find((e) => e.key === colKey);
      if (!b || b.kind !== 'class' || (extra && isMergedColumn(extra))) return;
      const k = cellKey(blockId, colKey);
      const next = new Set(sel);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      setSel(next.size ? next : null);
      return;
    }
    setCellAt({ blockId, colKey });
  };
  const onCellLong = (blockId: string, colKey: string) => {
    const b = table?.blocks.find((x) => x.id === blockId);
    const extra = table?.extraColumns?.find((e) => e.key === colKey);
    if (!b || b.kind !== 'class' || (extra && isMergedColumn(extra))) return;
    const k = cellKey(blockId, colKey);
    setSel((prev) => {
      const next = new Set(prev ?? []);
      next.add(k);
      return next;
    });
  };
  const fillSelected = (subject: string) => {
    if (!sel || !table) return;
    const cells = [...sel].map((k) => {
      const [blockId, colKey] = k.split('|');
      return { blockId, colKey };
    });
    const id = table.id;
    setWs((w) => W.fillCells(w, id, cells, subject));
    showToast(subject ? `칸 ${cells.length}개를 ${subject} 로 채웠습니다` : `칸 ${cells.length}개를 비웠습니다`);
    setSel(null);
  };

  // ── 저장 · 닫기 ───────────────────────────────────────────────────
  const invalidate = () => {
    const keys: ReadonlyArray<readonly unknown[]> = [
      scheduleQueryKey(jobCodeId),
      ['campTimetables', jobCodeId],
      ['campTimetableCommon', campCode],
      ['campClassInfo', campCode],
      ['campTimetableGuides', campCode],
      ['campDayPlan', campCode],
      ['campGroups', campCode],
    ];
    keys.forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }));
  };

  const save = async (force = false) => {
    const w = wsRef.current;
    if (!w || saving) return;
    const userId = userData?.userId ?? '';
    if (!userId) return Alert.alert('저장', '로그인 정보를 확인할 수 없습니다.');
    const plan = W.planSave(w, userId);
    if (W.isPlanEmpty(plan)) return showToast('바뀐 것이 없습니다');
    const bad = plan.dayPlan !== undefined ? dayPlanTimeError(w.cur.dayPlan) : null;
    if (bad) {
      setTab(EXCITING_CATEGORY);
      return Alert.alert('저장할 수 없습니다', bad);
    }
    setSaving(true);
    let committed = false;
    try {
      const res = await commitTimetableWorkspace(db, plan, { campCode, jobCodeId, userId, force });
      if (res.conflicts.length) {
        setSaving(false);
        Alert.alert('다른 사람이 고친 표', `다른 사람이 그사이 표 ${res.conflicts.length}장을 고쳤습니다. 내 변경으로 덮어쓸까요?`, [
          { text: '취소', style: 'cancel' },
          { text: '덮어쓰기', style: 'destructive', onPress: () => void save(true) },
        ]);
        return;
      }
      committed = true;
      invalidate();
      const fresh = await load();
      setTablePick((p) => Object.fromEntries(Object.entries(p).map(([k, id]) => [k, res.idMap[id] ?? id])));
      madeFrom.current = null;
      setSel(null);
      commitWs(fresh);
      showToast(`저장했습니다 — ${W.describePlan(plan).join(' · ')}`);
    } catch (e) {
      if (committed) {
        Alert.alert('저장했습니다', '저장은 됐지만 다시 불러오지 못했습니다. 편집기를 닫았다가 다시 열어 주세요.', [{ text: '닫기', onPress: onClose }]);
      } else {
        Alert.alert('저장하지 못했습니다', (e as Error)?.message ?? '');
        console.error(e);
      }
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (!count) return onClose();
    Alert.alert('편집 닫기', `저장하지 않은 변경 ${count}개가 있습니다. 버리고 닫을까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '버리고 닫기', style: 'destructive', onPress: onClose },
    ]);
  };
  const discardAll = () =>
    Alert.alert('모두 버리기', `저장하지 않은 변경 ${count}개를 모두 버릴까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '버리기',
        style: 'destructive',
        onPress: () => {
          setWs((w) => W.discardChanges(w));
          setChangesOpen(false);
          showToast('변경을 모두 버렸습니다');
        },
      },
    ]);

  // Android 뒤로 — 메뉴·선택을 먼저 닫고, 그다음 닫기 확인
  const backRef = useRef<() => boolean>(() => false);
  backRef.current = () => {
    if (menuOpen) {
      setMenuOpen(false);
      return true;
    }
    if (sel) {
      setSel(null);
      return true;
    }
    requestClose();
    return true;
  };
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => backRef.current());
    return () => sub.remove();
  }, []);

  // ── 화면 ──────────────────────────────────────────────────────────
  // 그룹·반은 앱 배정에서 온다 — 배정을 읽기 전에는 기본 그룹(Junior…)이 잠깐 보이지 않게 기다린다
  if (!ws || membersPending) {
    return (
      <View style={s.center}>
        {loadError ? (
          <>
            <Text style={s.errText}>시간표를 불러오지 못했습니다.{'\n'}{loadError}</Text>
            <View style={[u.row, { marginTop: 12 }]}>
              <Btn label="다시 시도" kind="primary" onPress={firstLoad} />
              <Btn label="닫기" onPress={onClose} />
            </View>
          </>
        ) : (
          <ActivityIndicator size="large" color={C.blue} />
        )}
      </View>
    );
  }

  const planText = W.describePlan(W.planSave(ws, userData?.userId ?? ''));
  const tableName = (t: CampTimetable) =>
    `${t.groupName} · ${categories.find((c) => c.key === t.dayType)?.label ?? t.dayTypeLabel}${t.dates?.length ? ` · ${datesText(t.dates)}` : ''}`;
  const groupSubjects = group ? W.groupTableIds(ws, group).flatMap((id) => subjectsOf(ws.cur.tables[id])) : [];

  const header = (
    <View style={s.header}>
      <TouchableOpacity onPress={requestClose} style={s.hIcon} hitSlop={6}>
        <Ionicons name="close" size={22} color={C.text2} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={s.hTitle} numberOfLines={1}>
          시간표 편집<Text style={s.hDim}> · {campCode}</Text>
        </Text>
        {count ? (
          <TouchableOpacity onPress={() => setChangesOpen(true)} style={s.badge}>
            <Text style={s.badgeText}>저장 안 한 변경 {count}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={s.hSub}>바뀐 것 없음</Text>
        )}
      </View>
      <TouchableOpacity onPress={() => setWs(W.undo)} disabled={!W.canUndo(ws)} style={[s.hIcon, !W.canUndo(ws) && s.off]} hitSlop={4}>
        <Ionicons name="arrow-undo" size={19} color={C.text2} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setWs(W.redo)} disabled={!W.canRedo(ws)} style={[s.hIcon, !W.canRedo(ws) && s.off]} hitSlop={4}>
        <Ionicons name="arrow-redo" size={19} color={C.text2} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setMenuOpen((v) => !v)} style={s.hIcon} hitSlop={4}>
        <Ionicons name="ellipsis-horizontal" size={20} color={C.text2} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => void save()} disabled={saving} style={[s.saveBtn, !count && s.saveBtnIdle]}>
        <Text style={[s.saveText, !count && { color: C.muted }]}>{saving ? '저장 중' : '저장'}</Text>
      </TouchableOpacity>
    </View>
  );

  const tabsRow = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
      <Chip
        label="일정표"
        on={isPlan}
        dot={changes?.dayPlan ? 'changed' : ws.cur.dayPlan?.sets?.length ? 'saved' : null}
        onPress={() => setTab(PLAN_TAB)}
      />
      <View style={s.vline} />
      {categories.map((c) => (
        <Chip
          key={c.key}
          label={c.label}
          on={tab === c.key}
          dot={dotFor((t) => t.dayType === c.key && isSameGroup(t.groupName, group))}
          onPress={() => setTab(c.key)}
        />
      ))}
      <Chip
        label="익사이팅"
        on={isExciting}
        dot={changes?.dayPlan ? 'changed' : ws.cur.dayPlan?.courses?.length ? 'saved' : null}
        onPress={() => setTab(EXCITING_CATEGORY)}
      />
    </ScrollView>
  );

  const groupItems = groups.map((g) => ({ key: g, label: g, dot: dotFor((t) => t.dayType === category && isSameGroup(t.groupName, g)) }));
  const nav = (
    <View>
      {tabsRow}
      {!noTable && groups.length > 0 && (
        groups.length <= 4 ? (
          <Seg items={groupItems} value={group ?? ''} onChange={setGroupPick} style={{ marginBottom: 8 }} />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <Seg items={groupItems} value={group ?? ''} onChange={setGroupPick} stretch={false} />
          </ScrollView>
        )
      )}
      {!noTable && table && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ gap: 6, alignItems: 'center' }}>
          {tableList.length ? (
            tableList.map((t, i) => (
              <Chip
                key={t.id}
                label={t.dates?.length ? datesText(t.dates) : i === 0 ? '기본' : '날짜 미정'}
                on={t.id === table.id}
                dot={changedIds.has(t.id) ? 'changed' : 'saved'}
                onPress={() => setTablePick((p) => ({ ...p, [pickKey]: t.id }))}
              />
            ))
          ) : (
            <Chip label="기본 (아직 없음)" on dashed />
          )}
          <Chip
            label="+ 커스텀 표"
            dashed
            onPress={() => {
              setCustomDates([]);
              setCustomOpen(true);
            }}
          />
        </ScrollView>
      )}
    </View>
  );

  const freeDates = category && group ? W.freeDatesFor(ws, category, group, planDates) : [];

  return (
    <View style={s.screen}>
      {header}

      {isPlan ? (
        <DayPlanTab
          top={nav}
          ws={ws}
          setWs={setWs}
          groups={groups}
          campCode={campCode}
          startMs={startMs}
          endMs={endMs}
          initialGroup={group}
          onOpenExciting={() => setTab(EXCITING_CATEGORY)}
        />
      ) : isExciting ? (
        <ExcitingTab
          top={nav}
          ws={ws}
          setWs={setWs}
          groups={groups}
          campCode={campCode}
          onGoPlan={() => setTab(PLAN_TAB)}
          onToast={showToast}
        />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 12, paddingBottom: sel ? 120 : 56 }} keyboardShouldPersistTaps="handled">
            {nav}
            {table && shown ? (
              <>
                {!exists && (
                  <Notice
                    tone="gray"
                    text={`아직 ${table.groupName} 의 ${categories.find((c) => c.key === category)?.label ?? ''} 표가 없습니다 — [⋯ > 가져오기] 로 다른 그룹·지난 기수 표를 복사하거나 줄을 추가해 만드세요.`}
                  />
                )}
                {!shown.classes.length && <Notice tone="amber" text="이 그룹에 반이 없습니다 — 아래 [반·이름] 탭에서 반을 추가하세요." />}
                {!!sel && <Notice text="여러 칸 선택 중 — 칸을 눌러 더하거나 빼고, 아래 바에서 과목을 고르세요." />}
                <EditableGrid
                  table={shown}
                  subjects={subjects}
                  resolvers={resolvers}
                  campStartMs={startMs}
                  selecting={!!sel}
                  selected={sel ?? new Set()}
                  onCell={onCell}
                  onCellLong={onCellLong}
                  onRow={(id) => !sel && setRowAt(id)}
                  onInsert={insertRow}
                  onClassHead={(code) => {
                    setPanel('roster');
                    setFocusClass(code);
                    scrollToPanel();
                  }}
                  onExtraHead={(key) => {
                    setPanel('settings');
                    setFocusColumn(key);
                    scrollToPanel();
                  }}
                />
                {!table.blocks.length && (
                  <View style={[u.wrap, { marginTop: 8 }]}>
                    <Btn label="+ 반별 줄" onPress={() => addRow(null, 'after', 'class')} />
                    <Btn label="+ 공통 줄" onPress={() => addRow(null, 'after', 'shared')} />
                  </View>
                )}
                {!!table.note && <Text style={s.note}>{table.note}</Text>}
                <Text style={[u.hint, { marginBottom: 6 }]}>칸 누르기 = 칸 편집 · 길게 누르기 = 여러 칸 선택 · 시간 누르기 = 줄 편집 · + = 그 자리에 줄 넣기</Text>

                <View
                  style={s.panel}
                  onLayout={(e) => {
                    panelY.current = e.nativeEvent.layout.y;
                  }}
                >
                  <Seg<PanelKey>
                    items={[
                      { key: 'subjects', label: '과목·주제' },
                      { key: 'roster', label: '반·이름' },
                      { key: 'settings', label: '표 설정' },
                      { key: 'guides', label: '칸 설명' },
                    ]}
                    value={panel}
                    onChange={(k) => {
                      setPanel(k);
                      setFocusClass(null);
                      setFocusColumn(null);
                    }}
                    style={{ marginBottom: 12 }}
                  />
                  {panel === 'subjects' && (
                    <SubjectsPanel
                      table={table}
                      exists={exists}
                      classes={shown.classes}
                      staffByRole={staffByRole}
                      resolvers={resolvers}
                      edit={editTable}
                      setWs={setWs}
                      onRenameCamp={(k) => setBulk({ tab: 'name', rename: { kind: 'subject', from: k } })}
                      onDone={showToast}
                    />
                  )}
                  {panel === 'roster' && group && (
                    <RosterPanel
                      ws={ws}
                      setWs={setWs}
                      group={group}
                      campCode={campCode}
                      fallback={fallbackFor(group)}
                      teacherByClassCode={teacherByClassCode}
                      staffByRole={staffByRole}
                      groupSubjects={groupSubjects}
                      books={books}
                      focusClass={focusClass}
                      onDone={showToast}
                    />
                  )}
                  {panel === 'settings' && (
                    <TableSettingsPanel
                      table={table}
                      exists={exists}
                      siblings={tableList}
                      planDates={planDates}
                      roles={staffRolesOf(subjects, staffByRole)}
                      classes={shown.classes}
                      resolvers={resolvers}
                      edit={editTable}
                      focusColumn={focusColumn}
                      onDelete={() => {
                        const id = table.id;
                        setWs((w) => W.deleteTable(w, id));
                        showToast('표를 지웠습니다 — 저장을 눌러야 반영됩니다');
                      }}
                    />
                  )}
                  {panel === 'guides' && <GuidePanel table={table} ws={ws} setWs={setWs} campCode={campCode} />}
                </View>
              </>
            ) : (
              <Notice tone="gray" text="Day 와 그룹을 고르세요." />
            )}
          </ScrollView>

          {!!sel && (
            <View style={s.bar}>
              <Text style={s.barTitle}>칸 {sel.size}개</Text>
              <View style={{ flex: 1 }} />
              <Btn label="과목" kind="primary" icon="color-palette-outline" onPress={() => setFillPick(true)} />
              <Btn label="비우기" onPress={() => fillSelected('')} />
              <Btn label="취소" onPress={() => setSel(null)} />
            </View>
          )}
        </KeyboardAvoidingView>
      )}

      {/* ⋯ 메뉴 */}
      {menuOpen && (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)}>
          <View style={s.menu}>
            {[
              { icon: 'download-outline' as const, label: '가져오기', on: () => setImportOpen(true) },
              { icon: 'git-compare-outline' as const, label: '일괄 변경', on: () => setBulk({ tab: 'time' }) },
              { icon: 'list-outline' as const, label: `변경 목록${count ? ` (${count})` : ''}`, on: () => setChangesOpen(true) },
              ...(count ? [{ icon: 'trash-outline' as const, label: '모두 버리기', on: discardAll }] : []),
            ].map((m) => (
              <TouchableOpacity
                key={m.label}
                style={s.menuItem}
                onPress={() => {
                  setMenuOpen(false);
                  m.on();
                }}
              >
                <Ionicons name={m.icon} size={16} color={C.text2} />
                <Text style={s.menuText}>{m.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      )}

      {/* 칸 · 줄 편집 */}
      <CellSheet
        at={cellAt}
        onClose={() => setCellAt(null)}
        table={table}
        shown={shown}
        subjects={subjects}
        resolvers={resolvers}
        edit={editTable}
        blockTitle={blockTitle}
      />
      <RowSheet
        blockId={rowAt}
        onClose={() => setRowAt(null)}
        table={table}
        subjects={subjects}
        edit={editTable}
        campStartMs={startMs}
        onInsert={insertRow}
        onBulkTime={(ref) => {
          setRowAt(null);
          afterModal(() => setBulk({ tab: 'time', ref }));
        }}
        onRenameCamp={(label) => {
          setRowAt(null);
          afterModal(() => setBulk({ tab: 'name', rename: { kind: 'shared', from: label } }));
        }}
        onCarryGuide={(from, to) => setWs((w) => W.carryGuideAfterRename(w, from, to))}
      />

      {/* 여러 칸 — 과목 고르기 */}
      <Sheet visible={fillPick} onClose={() => setFillPick(false)} title={`칸 ${sel?.size ?? 0}개에 넣을 과목`}>
        <View style={u.wrap}>
          {subjects.map((x) => (
            <Chip
              key={x.key}
              label={x.key}
              color={x.color ?? '#fff'}
              onPress={() => {
                setFillPick(false);
                fillSelected(x.key);
              }}
            />
          ))}
        </View>
      </Sheet>

      {/* 커스텀 표 */}
      <Sheet
        visible={customOpen}
        onClose={() => setCustomOpen(false)}
        title="커스텀 표 만들기"
        subtitle={table ? `지금 표(${tableList.length && table.dates?.length ? datesText(table.dates) : '기본'})를 복제해 고른 날에만 씁니다.` : ''}
      >
        {freeDates.length ? (
          <>
            <Text style={u.label}>이 표를 쓸 날 (여러 개)</Text>
            <View style={[u.wrap, { marginBottom: 12 }]}>
              {freeDates.map((d) => (
                <Chip
                  key={d}
                  label={datesText([d])}
                  on={customDates.includes(d)}
                  onPress={() => setCustomDates((p) => (p.includes(d) ? p.filter((x) => x !== d) : [...p, d]))}
                />
              ))}
            </View>
          </>
        ) : (
          <Notice tone="gray" text="일정표에 다른 표가 맡지 않은 이 Day 날짜가 없습니다. 날짜는 나중에 [표 설정] 에서 정할 수 있습니다." />
        )}
        <Btn
          label={freeDates.length ? `만들기${customDates.length ? ` (${customDates.length}일)` : ''}` : '날짜 미정으로 만들기'}
          kind="primary"
          disabled={!!freeDates.length && !customDates.length}
          onPress={() => {
            if (!table) return;
            const src = table;
            let id = '';
            setWs((w) => {
              const r = W.addCustomTable(w, w.cur.tables[src.id] ? src.id : src, customDates);
              id = r.id;
              return r.ws;
            });
            setCustomOpen(false);
            if (id) {
              setTablePick((p) => ({ ...p, [pickKey]: id }));
              showToast('커스텀 표를 만들었습니다 — 저장을 눌러야 반영됩니다');
            }
          }}
        />
        <Text style={u.hint}>저장을 눌러야 실제로 만들어집니다. 잘못 만들었으면 되돌리기를 누르세요.</Text>
      </Sheet>

      {/* 변경 목록 */}
      <Sheet visible={changesOpen} onClose={() => setChangesOpen(false)} title={`저장 안 한 변경 ${count}`} subtitle={planText.join(' · ') || '바뀐 것이 없습니다'}>
        {!!changes && (
          <View>
            {changes.created.map((id) => (
              <Text key={id} style={s.changeItem}>
                <Text style={{ color: C.blueText }}>새 표 </Text>
                {ws.cur.tables[id] ? tableName(ws.cur.tables[id]) : id}
              </Text>
            ))}
            {changes.updated.map((id) => (
              <Text key={id} style={s.changeItem}>
                <Text style={{ color: C.amberText }}>고친 표 </Text>
                {ws.cur.tables[id] ? tableName(ws.cur.tables[id]) : id}
              </Text>
            ))}
            {changes.deleted.map((id) => (
              <Text key={id} style={s.changeItem}>
                <Text style={{ color: C.red }}>지울 표 </Text>
                {ws.base.tables[id] ? tableName(ws.base.tables[id]) : id}
              </Text>
            ))}
            {changes.common.map((g) => (
              <Text key={`c-${g}`} style={s.changeItem}>
                <Text style={{ color: C.blueText }}>반·이름 </Text>
                {g}
              </Text>
            ))}
            {!!changes.classInfo.length && (
              <Text style={s.changeItem}>
                <Text style={{ color: C.blueText }}>반 정보 </Text>
                {changes.classInfo.join(', ')}
              </Text>
            )}
            {!!changes.guides.length && (
              <Text style={s.changeItem}>
                <Text style={{ color: C.blueText }}>칸 설명 </Text>
                {changes.guides.join(', ')}
              </Text>
            )}
            {changes.dayPlan && (
              <Text style={s.changeItem}>
                <Text style={{ color: C.blueText }}>일정표</Text>
              </Text>
            )}
          </View>
        )}
        <View style={[u.row, { marginTop: 14 }]}>
          {!!count && <Btn label="모두 버리기" kind="danger" onPress={discardAll} />}
          <View style={{ flex: 1 }} />
          {!!count && (
            <Btn
              label="저장"
              kind="primary"
              onPress={() => {
                setChangesOpen(false);
                void save();
              }}
            />
          )}
        </View>
      </Sheet>

      <ImportSheet
        visible={importOpen}
        onClose={() => setImportOpen(false)}
        ws={ws}
        setWs={setWs}
        campCode={campCode}
        jobCodeId={jobCodeId}
        startMs={startMs}
        endMs={endMs}
        groups={groups}
        categories={categories}
        current={{ category, group, table: noTable ? null : table }}
        fallbackFor={fallbackFor}
        onDone={(msg, focusId) => {
          showToast(msg);
          if (focusId) setTablePick((p) => ({ ...p, [pickKey]: focusId }));
        }}
      />
      <BulkSheet init={bulk} onClose={() => setBulk(null)} ws={ws} setWs={setWs} onDone={showToast} />

      {!!toast && (
        <View style={s.toast} pointerEvents="none">
          <Text style={s.toastText}>{toast}</Text>
        </View>
      )}
      {saving && (
        <View style={s.savingOverlay}>
          <ActivityIndicator color="#fff" />
          <Text style={s.savingText}>저장 중…</Text>
        </View>
      )}
    </View>
  );
}

export default TimetableWorkspaceEditor;

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#fff' },
  errText: { fontSize: 13, color: C.text2, textAlign: 'center', lineHeight: 19 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    backgroundColor: '#fff',
  },
  hIcon: { padding: 6 },
  off: { opacity: 0.25 },
  hTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  hDim: { color: C.faint, fontWeight: '400' },
  hSub: { fontSize: 10.5, color: C.faint, marginTop: 1 },
  badge: { alignSelf: 'flex-start', backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, marginTop: 2 },
  badgeText: { fontSize: 10.5, color: '#c2410c', fontWeight: '700' },
  saveBtn: { backgroundColor: C.blue, borderRadius: 8, paddingHorizontal: 13, paddingVertical: 8, marginLeft: 4 },
  saveBtnIdle: { backgroundColor: C.bg2 },
  saveText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  vline: { width: 1, height: 18, backgroundColor: C.line },
  note: { marginTop: 8, fontSize: 11.5, color: C.muted },
  panel: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line },

  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: C.line,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  barTitle: { fontSize: 13, fontWeight: '700', color: C.text },

  menu: {
    position: 'absolute',
    top: 48,
    right: 56,
    minWidth: 170,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.line,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  menuText: { fontSize: 13.5, color: C.text },

  changeItem: { fontSize: 12.5, color: C.text2, lineHeight: 20 },

  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 58,
    backgroundColor: 'rgba(17,24,39,0.92)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  toastText: { color: '#fff', fontSize: 12.5, lineHeight: 18, textAlign: 'center' },
  savingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  savingText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
