'use client';

/**
 * 시간표 통합 편집기 (관리자) — 일정표 · 모든 Day · 모든 그룹 · 커스텀 표 · 반·이름 · 반 정보 · 칸 설명을
 * 한 작업 공간(shared timetableWorkspace)에 모아 고치고, [저장] 한 번에 쓴다.
 * 저장 전에는 Firestore 에 아무것도 쓰지 않는다 (칸 설명의 사진·동영상 올리기만 예외 — 고르는 즉시 올라간다).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  EXCITING_CATEGORY,
  TIMETABLE_CATEGORIES,
  applyClassInfo,
  applyCommon,
  buildEmptyTimetable,
  categoryLabel,
  commitTimetableWorkspace,
  commonFor,
  daySetForGroup,
  findCategory,
  getEslBooks,
  isMergedColumn,
  isSameGroup,
  loadTimetableWorkspace,
  makeNameResolvers,
  monthDayLabel,
  normalizeGroupKey,
  planDatesFor,
  resolveGroups,
  sortBlocks,
  teacherMapOf,
  timetableDraft as D,
  timetableGroupNames,
  timetableLabels,
  timetableWorkspace as W,
  type CampGroup,
  type CampTimetable,
  type TimetableClassColumn,
} from '@smis-mentor/shared';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getJobCodeById, getUsersByJobCodeId } from '@/lib/firebaseService';
import EditableGrid, { cellKeyOf, type GridCellClick, type GridCellRef } from './EditableGrid';
import { CellEditor } from './CellEditor';
import { RowEditor, type BulkTimeRef } from './RowEditor';
import { SelectionBar } from './SelectionBar';
import { SubjectsPanel } from './SubjectsPanel';
import { RosterPanel } from './RosterPanel';
import { TableSettingsPanel, tableChipLabel } from './TableSettingsPanel';
import { GuidePanel } from './GuidePanel';
import { DayPlanTab } from './DayPlanTab';
import { ExcitingTab } from './ExcitingTab';
import { ImportDialog } from './ImportDialog';
import { BulkDialog, type BulkNameRef, type BulkTab } from './BulkDialog';
import {
  Popover,
  Segmented,
  StatusDot,
  btnCls,
  btnPrimaryCls,
  rectOf,
  subjectsOf,
  type AnchorRect,
  type TableEdit,
  type WsUpdate,
} from './ui';

export const PLAN_TAB = 'plan';
/** 익사이팅·야외 활동(코스) 탭 — 보기 화면의 '익사이팅' 탭과 같은 키 */
export const EXCITING_TAB = EXCITING_CATEGORY;

export interface TimetableWorkspaceEditorProps {
  jobCodeId: string;
  /** 처음 열 탭 — 'plan' = 일정표, 그 밖에는 Day(카테고리) 키 */
  initialTab?: string | null;
  initialGroup?: string | null;
  /** 처음 고를 표 (보던 커스텀 표) */
  initialTableId?: string | null;
  onClose: () => void;
}

type PanelTab = 'subjects' | 'roster' | 'settings' | 'guides';

type PopState =
  | { type: 'cell'; ref: GridCellRef; anchor: AnchorRect }
  | { type: 'row'; blockId: string; anchor: AnchorRect }
  | { type: 'insert'; blockId: string | null; where: 'before' | 'after'; anchor: AnchorRect }
  | { type: 'changes'; anchor: AnchorRect }
  | { type: 'custom'; anchor: AnchorRect };

type DialogState = { type: 'import' } | { type: 'bulk'; tab: BulkTab; ref?: BulkTimeRef | null; name?: BulkNameRef | null } | null;

type Status = 'changed' | 'exists' | null;

const NO_LIST: never[] = [];

/** 커스텀 표 날짜 고르기 — 다른 표가 맡지 않은 이 Day 날짜 여러 개 */
function CustomTablePicker({ free, onCreate }: { free: string[]; onCreate: (dates: string[]) => void }) {
  const [picked, setPicked] = useState<string[]>(free.slice(0, 1));
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-gray-900">커스텀 표 만들기</p>
      <p className="text-[11px] text-gray-500">지금 표를 복제해 고른 날에만 쓰는 표를 만듭니다. 바뀌는 칸만 고치면 됩니다 (저장 전).</p>
      {free.length ? (
        <div className="flex flex-wrap gap-1">
          {free.map((d) => {
            const on = picked.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== d) : [...p, d].sort()))}
                className={`rounded-full px-2.5 py-1 text-xs tabular-nums ${on ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              >
                {monthDayLabel(d)}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-md bg-gray-50 px-2 py-1.5 text-[11px] text-gray-500">일정표에 다른 표가 맡지 않은 이 Day 날짜가 없습니다.</p>
      )}
      <div className="flex justify-end gap-1.5">
        {free.length > 0 ? (
          <button type="button" disabled={!picked.length} onClick={() => onCreate(picked)} className={btnPrimaryCls}>
            {picked.length ? `${picked.map(monthDayLabel).join(', ')} 표 만들기` : '날짜를 고르세요'}
          </button>
        ) : (
          <button type="button" onClick={() => onCreate([])} className={btnPrimaryCls}>
            날짜 미정으로 만들기
          </button>
        )}
      </div>
    </div>
  );
}

export default function TimetableWorkspaceEditor({ jobCodeId, initialTab, initialGroup, initialTableId, onClose }: TimetableWorkspaceEditorProps) {
  const { userData } = useAuth();
  const userId = userData?.userId ?? '';
  const queryClient = useQueryClient();

  // ── 작업 공간 (ref 로 늘 최신 값을 들고, 변경 함수는 정확히 한 번 실행) ─────────
  const [ws, setWsState] = useState<W.Workspace | null>(null);
  const wsRef = useRef<W.Workspace | null>(null);
  const resetWs = useCallback((next: W.Workspace) => {
    wsRef.current = next;
    setWsState(next);
  }, []);
  const update: WsUpdate = useCallback((fn) => {
    const prev = wsRef.current;
    if (!prev) return prev as unknown as W.Workspace;
    const next = fn(prev);
    if (next !== prev) {
      wsRef.current = next;
      setWsState(next);
    }
    return next;
  }, []);

  // ── 데이터 ─────────────────────────────────────────────────────────
  const { data: jobCode } = useQuery({
    queryKey: ['jobCode', jobCodeId],
    queryFn: () => getJobCodeById(jobCodeId),
    staleTime: 10 * 60 * 1000,
  });
  const ready = jobCode !== undefined;
  const campCode = jobCode?.code ?? '';
  const campStart = useMemo(() => jobCode?.startDate?.toDate?.() ?? null, [jobCode]);
  const campEnd = useMemo(() => jobCode?.endDate?.toDate?.() ?? null, [jobCode]);

  const { data: members = NO_LIST } = useQuery({
    queryKey: ['campMembers', jobCodeId],
    queryFn: () => getUsersByJobCodeId(jobCodeId),
    staleTime: 5 * 60 * 1000,
  });
  const { data: eslBooks } = useQuery({
    queryKey: ['eslBooks'],
    queryFn: () => getEslBooks(db),
    staleTime: 30 * 60 * 1000,
  });

  const [groupSettings, setGroupSettings] = useState<CampGroup[]>(NO_LIST);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 편집기를 열 때 한 번 — 캠프의 표 전부 + 캠프 설정 (다시 불러오면 고친 내용이 사라지므로 jobCode 갱신에는 반응하지 않는다)
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    loadTimetableWorkspace(db, { campCode, jobCodeId })
      .then((d) => {
        if (!alive) return;
        setGroupSettings(d.groups);
        resetWs(W.createWorkspace({ campCode, jobCodeId, tables: d.tables, common: d.common, classInfo: d.classInfo, guides: d.guides, dayPlan: d.dayPlan }));
      })
      .catch((e) => {
        console.error(e);
        if (alive) setLoadError('시간표를 불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.');
      });
    return () => {
      alive = false;
    };
  }, [ready, campCode, jobCodeId, resetWs]);

  /** 그룹·반·담당자는 앱 배정에서 (없으면 캠프 설정 → 기본 3그룹) — 보기 화면과 같은 규칙 */
  const derived = useMemo(() => resolveGroups(members, jobCodeId, groupSettings), [members, jobCodeId, groupSettings]);
  const teacherByClassCode = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((u) => {
      const exp = (u as { jobExperiences?: Array<{ id: string; classCode?: string }> }).jobExperiences?.find((e) => e.id === jobCodeId);
      if (exp?.classCode && u.name) map[exp.classCode] = u.name;
    });
    return { ...map, ...teacherMapOf(derived) };
  }, [members, jobCodeId, derived]);

  const allTables = useMemo(() => (ws ? Object.values(ws.cur.tables) : NO_LIST), [ws]);
  const groups = useMemo(() => timetableGroupNames(derived, allTables), [derived, allTables]);
  const categories = useMemo(() => {
    const list = TIMETABLE_CATEGORIES.map((c) => ({ key: c.key, label: categoryLabel(c, campCode) }));
    const known = new Set(list.map((c) => c.key));
    allTables.forEach((t) => {
      if (!known.has(t.dayType)) {
        known.add(t.dayType);
        list.push({ key: t.dayType, label: t.dayTypeLabel || t.dayType });
      }
    });
    return list;
  }, [campCode, allTables]);
  const categoryLabelOf = useCallback((key: string) => categories.find((c) => c.key === key)?.label ?? key, [categories]);

  // ── 무엇을 보고 있나 ───────────────────────────────────────────────
  const [tab, setTab] = useState<string>(initialTab || PLAN_TAB);
  const [groupPick, setGroupPick] = useState<string | null>(initialGroup ?? null);
  const group = (groupPick && groups.find((g) => isSameGroup(g, groupPick))) || groups[0] || null;
  const isPlan = tab === PLAN_TAB;
  const isExciting = tab === EXCITING_TAB;
  const category = isPlan || isExciting ? null : tab;
  const catSpec = findCategory(category);
  const [selByKey, setSelByKey] = useState<Record<string, string>>(() =>
    initialTableId && initialTab && initialTab !== PLAN_TAB && initialTab !== EXCITING_TAB ? { [`${initialTab}::${normalizeGroupKey(initialGroup)}`]: initialTableId } : {}
  );
  const selKey = `${category}::${normalizeGroupKey(group)}`;

  const list = useMemo(() => (ws && category && group ? W.tablesOf(ws, category, group) : NO_LIST), [ws, category, group]);
  const picked: CampTimetable | null = list.find((t) => t.id === selByKey[selKey]) ?? list[0] ?? null;
  const assignedCodes = useMemo(() => derived.find((g) => isSameGroup(g.name, group))?.classCodes ?? NO_LIST, [derived, group]);
  const classesFor = useCallback(
    (g: string): TimetableClassColumn[] => {
      const codes = (derived.find((x) => isSameGroup(x.name, g))?.classCodes ?? []).map((classCode) => ({ classCode }));
      return wsRef.current ? W.groupClasses(wsRef.current, g, codes) : codes;
    },
    [derived]
  );
  /** 저장된 표가 없으면 빈 뼈대 — 처음 고칠 때 새 표가 된다 */
  const skeleton = useMemo(() => {
    if (!ws || picked || !category || !group) return null;
    const cls = W.groupClasses(ws, group, assignedCodes.map((classCode) => ({ classCode })));
    return buildEmptyTimetable({ category, groupName: group, classes: cls.map((c) => ({ classCode: c.classCode })), campCode, jobCodeId });
  }, [ws, picked, category, group, assignedCodes, campCode, jobCodeId]);
  const raw: CampTimetable | null = picked ?? skeleton;
  const tableId = picked?.id ?? null;
  const display = useMemo(() => {
    if (!raw || !ws) return null;
    const withCommon = applyCommon(raw, commonFor(ws.cur.common, raw.groupName));
    return { ...withCommon, classes: applyClassInfo(withCommon.classes, ws.cur.classInfo) };
  }, [raw, ws]);
  const staffByRole = useMemo(() => derived.find((g) => isSameGroup(g.name, group))?.staffByRole ?? {}, [derived, group]);
  const resolvers = useMemo(() => makeNameResolvers(display ?? undefined, teacherByClassCode, staffByRole), [display, teacherByClassCode, staffByRole]);
  const daySet = useMemo(() => (ws ? daySetForGroup(ws.cur.dayPlan, group) : undefined), [ws, group]);
  const planDates = useMemo(() => (category ? planDatesFor(daySet, category, campCode) : NO_LIST), [daySet, category, campCode]);

  // ── 변경 상태 ──────────────────────────────────────────────────────
  const changes = useMemo(() => (ws ? W.changesOf(ws) : null), [ws]);
  const changedIds = useMemo(() => new Set([...(changes?.created ?? []), ...(changes?.updated ?? [])]), [changes]);
  const statusOf = (pred: (t: CampTimetable) => boolean): Status => {
    if (!ws) return null;
    const cur = allTables.filter(pred);
    if (cur.some((t) => changedIds.has(t.id))) return 'changed';
    if ((changes?.deleted ?? []).some((id) => ws.base.tables[id] && pred(ws.base.tables[id]))) return 'changed';
    return cur.length ? 'exists' : null;
  };
  const dirty = (changes?.count ?? 0) > 0;

  // ── 화면 상태 ──────────────────────────────────────────────────────
  const [selection, setSelection] = useState<GridCellRef[]>([]);
  const [anchorCell, setAnchorCell] = useState<GridCellRef | null>(null);
  const [pop, setPop] = useState<PopState | null>(null);
  const [panel, setPanel] = useState<PanelTab>('subjects');
  const [focusClass, setFocusClass] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const resetView = () => {
    setSelection([]);
    setAnchorCell(null);
    setPop(null);
    setFocusClass(null);
  };
  const goTab = (t: string) => {
    setTab(t);
    resetView();
  };
  const goGroup = (g: string) => {
    setGroupPick(g);
    resetView();
  };
  const goTable = (id: string) => {
    setSelByKey((m) => ({ ...m, [selKey]: id }));
    resetView();
  };

  /** 지금 표 고치기 — 빈 뼈대면 새 표가 생기고 그 표가 선택된다 */
  const editTable: TableEdit = useCallback(
    (fn, key) => {
      if (!raw) return null;
      let id: string | null = null;
      update((w) => {
        const target = w.cur.tables[raw.id] ? raw.id : raw;
        const r = W.editTableWithId(w, target, fn, key);
        id = r.id;
        return r.ws;
      });
      const nid: string | null = id;
      if (nid && nid !== raw.id) setSelByKey((m) => ({ ...m, [selKey]: nid }));
      return nid;
    },
    [raw, update, selKey]
  );

  const insertRow = (refId: string | null, where: 'before' | 'after', kind: 'shared' | 'class'): string => {
    let nid = '';
    editTable((t) => {
      nid = D.insertBlock(t, refId, where, kind);
    });
    return nid;
  };

  // ── 칸 고르기 ──────────────────────────────────────────────────────
  const fillableCols = useMemo(
    () => (display ? [...display.classes.map((c) => c.classCode), ...(display.extraColumns ?? []).filter((e) => !isMergedColumn(e)).map((e) => e.key)] : []),
    [display]
  );
  const classBlocks = useMemo(
    () => (display ? sortBlocks(display.blocks, display.layout).filter((b) => b.kind === 'class').map((b) => b.id) : []),
    [display]
  );
  const onCellClick = (ref: GridCellRef, ev: GridCellClick) => {
    if (ev.fillable && ev.shift && anchorCell) {
      const r1 = classBlocks.indexOf(anchorCell.blockId);
      const r2 = classBlocks.indexOf(ref.blockId);
      const c1 = fillableCols.indexOf(anchorCell.colKey);
      const c2 = fillableCols.indexOf(ref.colKey);
      if (r1 >= 0 && r2 >= 0 && c1 >= 0 && c2 >= 0) {
        const out: GridCellRef[] = [];
        for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
          for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) out.push({ blockId: classBlocks[r], colKey: fillableCols[c] });
        setSelection(out);
        setPop(null);
        return;
      }
    }
    if (ev.fillable && ev.toggle) {
      const k = cellKeyOf(ref);
      // 팝오버를 닫으면서 비워진 선택이면 마지막으로 누른 칸부터 다시 모은다
      const fromAnchor = anchorCell && fillableCols.includes(anchorCell.colKey) && classBlocks.includes(anchorCell.blockId) ? [anchorCell] : [];
      setSelection((sel) => {
        const base = sel.length ? sel : fromAnchor;
        return base.some((x) => cellKeyOf(x) === k) ? base.filter((x) => cellKeyOf(x) !== k) : [...base, ref];
      });
      setAnchorCell(ref);
      setPop(null);
      return;
    }
    setSelection(ev.fillable ? [ref] : []);
    if (ev.fillable) setAnchorCell(ref);
    setPop({ type: 'cell', ref, anchor: ev.anchor });
  };
  const fillSelection = (subject: string) => {
    if (!tableId || selection.length < 2) return;
    const cells = [...selection];
    update((w) => W.fillCells(w, tableId, cells, subject));
  };

  // ── 되돌리기 · 저장 · 닫기 ─────────────────────────────────────────
  const undo = () => update((w) => W.undo(w));
  const redo = () => update((w) => W.redo(w));

  const save = async (force = false): Promise<void> => {
    const w = wsRef.current;
    if (!w || (savingRef.current && !force)) return;
    const plan = W.planSave(w, userId);
    if (W.isPlanEmpty(plan)) {
      toast('바뀐 것이 없습니다.');
      return;
    }
    if (!userId) {
      toast.error('로그인 정보를 확인할 수 없습니다.');
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setPop(null);
    try {
      const res = await commitTimetableWorkspace(db, plan, { campCode: w.campCode, jobCodeId, userId, force });
      if (res.conflicts.length) {
        if (window.confirm(`다른 사람이 그사이 표 ${res.conflicts.length}장을 고쳤습니다. 내 변경으로 덮어쓸까요?`)) {
          await save(true);
        }
        return;
      }
      // 저장된 값으로 새로 연다 (새 표의 임시 id → 진짜 id)
      const d = await loadTimetableWorkspace(db, { campCode: w.campCode, jobCodeId });
      setGroupSettings(d.groups);
      resetWs(W.createWorkspace({ campCode: w.campCode, jobCodeId, tables: d.tables, common: d.common, classInfo: d.classInfo, guides: d.guides, dayPlan: d.dayPlan }));
      setSelByKey((m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, res.idMap[v] ?? v])));
      setSelection([]);
      setAnchorCell(null);
      // 보기 화면이 쓰는 값들
      queryClient.invalidateQueries({ queryKey: ['campTimetables', jobCodeId] });
      ['campTimetableCommon', 'campClassInfo', 'campTimetableGuides', 'campDayPlan', 'campGroups'].forEach((k) =>
        queryClient.invalidateQueries({ queryKey: [k, w.campCode] })
      );
      toast.success(`저장했습니다 — ${W.describePlan(plan).join(' · ')}`, { duration: 3500 });
    } catch (e) {
      console.error(e);
      toast.error(`저장에 실패했습니다. ${(e as Error)?.message ?? ''}`.trim());
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const close = () => {
    const w = wsRef.current;
    const n = w ? W.changesOf(w).count : 0;
    if (n && !window.confirm(`저장하지 않은 변경 ${n}개가 있습니다. 버리고 닫을까요?`)) return;
    onClose();
  };

  // 키보드 — Ctrl/Cmd+Z 되돌리기, Ctrl/Cmd+Shift+Z·Ctrl+Y 다시, Ctrl/Cmd+S 저장, Esc 닫기·선택 해제
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key.toLowerCase();
      if (mod && k === 's') {
        e.preventDefault();
        void save();
        return;
      }
      if (dialog) return;
      if (mod && k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && ((k === 'z' && e.shiftKey) || k === 'y')) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Escape' && !e.defaultPrevented) {
        if (pop) setPop(null);
        else if (selection.length) setSelection([]);
      }
    };
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // 저장 안 한 채 페이지를 떠나려 할 때
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // 편집기가 화면 전체를 덮는 동안 뒤 페이지는 스크롤하지 않는다
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ── 그리기 ─────────────────────────────────────────────────────────
  const header = (
    <header className="shrink-0 border-b border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <h2 className="text-base font-semibold text-gray-900">
          시간표 편집 {campCode && <span className="font-normal text-gray-400">· {campCode}</span>}
        </h2>
        {ws &&
          (dirty ? (
            <button
              type="button"
              data-keep-popover
              onClick={(e) => {
                const anchor = rectOf(e.currentTarget)!;
                setPop((p) => (p?.type === 'changes' ? null : { type: 'changes', anchor }));
              }}
              className="flex items-center gap-1.5 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700 ring-1 ring-inset ring-orange-200 hover:bg-orange-100"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              저장 안 한 변경 {changes?.count} ▾
            </button>
          ) : (
            <span className="text-xs text-gray-400">변경 없음</span>
          ))}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={undo} disabled={!ws || !W.canUndo(ws)} title="되돌리기 (Ctrl/Cmd+Z)" className={btnCls}>
            ↶ 되돌리기
          </button>
          <button type="button" onClick={redo} disabled={!ws || !W.canRedo(ws)} title="다시하기 (Ctrl/Cmd+Shift+Z)" className={btnCls}>
            ↷ 다시하기
          </button>
          <span className="mx-0.5 h-5 w-px bg-gray-200" />
          <button type="button" onClick={() => setDialog({ type: 'import' })} disabled={!ws} className={btnCls}>
            가져오기
          </button>
          <button type="button" onClick={() => setDialog({ type: 'bulk', tab: 'time' })} disabled={!ws} className={btnCls}>
            일괄 변경
          </button>
          <span className="mx-0.5 h-5 w-px bg-gray-200" />
          <button type="button" onClick={close} className={btnCls}>
            닫기
          </button>
          <button type="button" onClick={() => void save()} disabled={!ws || saving || !dirty} title="저장 (Ctrl/Cmd+S)" className={btnPrimaryCls}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </header>
  );

  if (!ws) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-white">
        {header}
        <div className="flex flex-1 items-center justify-center text-sm text-gray-500">{loadError ?? '불러오는 중…'}</div>
      </div>
    );
  }

  const tabCls = (on: boolean, status: Status) =>
    `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
      on ? 'bg-blue-600 text-white shadow-sm' : status ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-white text-gray-400 ring-1 ring-inset ring-gray-200 hover:bg-gray-50'
    }`;
  const baseId = list.find((t) => !t.dates?.length)?.id ?? null;
  const freeDates = category && group ? W.freeDatesFor(ws, category, group, planDates) : [];
  const guideLabels = raw ? timetableLabels(raw) : [];

  const renderPop = () => {
    if (!pop) return null;
    const closePop = () => setPop(null);
    if (pop.type === 'cell') {
      if (!display || !display.blocks.some((b) => b.id === pop.ref.blockId)) return null;
      return (
        <Popover
          anchor={pop.anchor}
          onClose={() => {
            setPop(null);
            // 칸 하나만 골랐던 거면 표시도 지운다 (Shift+클릭 기준 칸은 남는다)
            setSelection((sel) => (sel.length <= 1 ? [] : sel));
          }}
          width={340}
        >
          <CellEditor
            key={cellKeyOf(pop.ref)}
            table={display}
            blockId={pop.ref.blockId}
            colKey={pop.ref.colKey}
            noSubjects={!!catSpec?.noSubjects}
            resolvers={resolvers}
            edit={editTable}
          />
        </Popover>
      );
    }
    if (pop.type === 'row') {
      if (!display || !display.blocks.some((b) => b.id === pop.blockId)) return null;
      return (
        <Popover anchor={pop.anchor} onClose={closePop} width={340}>
          <RowEditor
            key={pop.blockId}
            table={display}
            blockId={pop.blockId}
            campStart={campStart}
            edit={editTable}
            update={update}
            onInserted={(id) => setPop({ type: 'row', blockId: id, anchor: pop.anchor })}
            onBulkTime={(ref) => {
              setPop(null);
              setDialog({ type: 'bulk', tab: 'time', ref });
            }}
            onBulkName={(old) => {
              setPop(null);
              setDialog({ type: 'bulk', tab: 'name', name: { kind: 'shared', old } });
            }}
            onDeleted={closePop}
          />
        </Popover>
      );
    }
    if (pop.type === 'insert') {
      const add = (kind: 'shared' | 'class') => {
        const id = insertRow(pop.blockId, pop.where, kind);
        if (id) setPop({ type: 'row', blockId: id, anchor: pop.anchor });
        else setPop(null);
      };
      return (
        <Popover anchor={pop.anchor} onClose={closePop} width={220}>
          <p className="mb-2 text-xs font-semibold text-gray-900">{pop.where === 'before' ? '위에' : '여기에'} 줄 넣기</p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => add('class')} className={`${btnCls} flex-1`}>
              반별 줄
            </button>
            <button type="button" onClick={() => add('shared')} className={`${btnCls} flex-1`}>
              공통 줄
            </button>
          </div>
        </Popover>
      );
    }
    if (pop.type === 'changes') {
      const plan = W.planSave(ws, userId);
      const rows = [
        ...(changes?.created ?? []).map((id) => ({ id, kind: '새 표', t: ws.cur.tables[id], live: true })),
        ...(changes?.updated ?? []).map((id) => ({ id, kind: '고침', t: ws.cur.tables[id], live: true })),
        ...(changes?.deleted ?? []).map((id) => ({ id, kind: '지움', t: ws.base.tables[id], live: false })),
      ].filter((r) => !!r.t);
      return (
        <Popover anchor={pop.anchor} onClose={closePop} width={320}>
          <p className="mb-1.5 text-sm font-semibold text-gray-900">저장할 것</p>
          <ul className="mb-2 list-disc space-y-0.5 pl-4 text-xs text-gray-700">
            {W.describePlan(plan).map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          {rows.length > 0 && (
            <ul className="mb-2 max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
              {rows.map((r) => (
                <li key={`${r.kind}:${r.id}`}>
                  <button
                    type="button"
                    disabled={!r.live}
                    onClick={() => {
                      setTab(r.t.dayType);
                      setGroupPick(r.t.groupName);
                      setSelByKey((m) => ({ ...m, [`${r.t.dayType}::${normalizeGroupKey(r.t.groupName)}`]: r.id }));
                      resetView();
                    }}
                    className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] hover:bg-gray-50 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span className={`shrink-0 rounded px-1 text-[10px] ${r.kind === '지움' ? 'bg-red-50 text-red-600' : r.kind === '새 표' ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                      {r.kind}
                    </span>
                    <span className="truncate text-gray-700">
                      {r.t.groupName} · {categoryLabelOf(r.t.dayType)} · {r.t.dates?.length ? r.t.dates.map(monthDayLabel).join('·') : '기본'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                if (!window.confirm('저장하지 않은 변경을 모두 버릴까요?')) return;
                update((w) => W.discardChanges(w));
                resetView();
              }}
              className="text-[11px] text-red-600 hover:underline"
            >
              모두 버리기
            </button>
            <button type="button" onClick={() => void save()} className={btnPrimaryCls}>
              저장
            </button>
          </div>
        </Popover>
      );
    }
    if (pop.type === 'custom') {
      return (
        <Popover anchor={pop.anchor} onClose={closePop} width={300}>
          <CustomTablePicker
            free={freeDates}
            onCreate={(dates) => {
              if (!raw) return;
              let nid = '';
              update((w) => {
                const r = W.addCustomTable(w, w.cur.tables[raw.id] ? raw.id : raw, dates);
                nid = r.id;
                return r.ws;
              });
              if (nid) {
                goTable(nid);
                setPanel('settings');
                toast.success('커스텀 표를 만들었습니다 — 저장을 눌러야 반영됩니다');
              }
            }}
          />
        </Popover>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      {header}
      <div className={`min-h-0 flex-1 overflow-y-auto ${saving ? 'pointer-events-none opacity-60' : ''}`}>
        <div className="mx-auto max-w-[1600px] px-3 pb-28 pt-3 sm:px-4">
          {/* 줄 1: 일정표 | Day */}
          <div role="tablist" className="mb-2 flex flex-wrap items-center gap-1">
            <button type="button" role="tab" aria-selected={isPlan} onClick={() => goTab(PLAN_TAB)} className={tabCls(isPlan, changes?.dayPlan ? 'changed' : 'exists')}>
              일정표
              <StatusDot status={changes?.dayPlan ? 'changed' : null} on={isPlan} />
            </button>
            <span className="mx-1 h-5 w-px bg-gray-200" />
            {categories.map((c) => {
              const on = c.key === tab;
              const status = statusOf((t) => t.dayType === c.key && isSameGroup(t.groupName, group));
              return (
                <button key={c.key} type="button" role="tab" aria-selected={on} onClick={() => goTab(c.key)} className={tabCls(on, status)}>
                  {c.label}
                  <StatusDot status={status} on={on} />
                </button>
              );
            })}
            <button
              type="button"
              role="tab"
              aria-selected={isExciting}
              onClick={() => goTab(EXCITING_TAB)}
              className={tabCls(isExciting, changes?.dayPlan ? 'changed' : ws?.cur.dayPlan?.courses?.length ? 'exists' : null)}
            >
              익사이팅
              <StatusDot status={changes?.dayPlan ? 'changed' : ws?.cur.dayPlan?.courses?.length ? 'exists' : null} on={isExciting} />
            </button>
          </div>

          {isPlan ? (
            <DayPlanTab
              ws={ws}
              update={update}
              campCode={campCode}
              groups={groups}
              start={campStart}
              end={campEnd}
              initialGroup={group}
              onGoExciting={() => goTab(EXCITING_TAB)}
            />
          ) : isExciting ? (
            <ExcitingTab ws={ws} update={update} campCode={campCode} groups={groups} onGoPlan={() => goTab(PLAN_TAB)} />
          ) : (
            <>
              {/* 줄 2: 그룹 */}
              {groups.length > 0 && (
                <div
                  role="tablist"
                  className="mb-2 grid gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5"
                  style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}
                >
                  {groups.map((g) => {
                    const on = isSameGroup(g, group);
                    const status = statusOf((t) => t.dayType === category && isSameGroup(t.groupName, g));
                    return (
                      <button
                        key={g}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        onClick={() => goGroup(g)}
                        className={`flex items-center justify-center gap-1.5 truncate rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                          on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                        }`}
                      >
                        {g}
                        <StatusDot status={status} />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 줄 3: 표 칩 */}
              {group && (
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  {list.length > 0 ? (
                    list.map((t) => {
                      const on = t.id === tableId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => goTable(t.id)}
                          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium tabular-nums ${
                            on ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {tableChipLabel(t, baseId)}
                          <StatusDot status={changedIds.has(t.id) ? 'changed' : null} on={on} />
                        </button>
                      );
                    })
                  ) : (
                    <span className="rounded-md border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-400">표 없음</span>
                  )}
                  <button
                    type="button"
                    data-keep-popover
                    disabled={!tableId}
                    title={!tableId ? '먼저 기본 표를 만드세요' : '지금 표를 복제해 특정 날짜에만 쓰는 표'}
                    onClick={(e) => {
                      const anchor = rectOf(e.currentTarget)!;
                      setPop((p) => (p?.type === 'custom' ? null : { type: 'custom', anchor }));
                    }}
                    className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    + 커스텀 표
                  </button>
                  {catSpec?.inline && (
                    <span className="ml-auto text-[11px] text-gray-500">이 표는 다른 Day 표의 &apos;{catSpec.inlineSlotMatch}&apos; 공통 줄 자리에 붙어 보입니다.</span>
                  )}
                </div>
              )}

              {!group || !display || !raw ? (
                <p className="py-16 text-center text-sm text-gray-500">그룹이 없습니다. 앱에서 멘토에게 그룹·반을 배정하거나 캠프 설정에서 그룹을 만들어 주세요.</p>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                  {/* 왼쪽: 편집 표 */}
                  <div className="min-w-0 space-y-2">
                    {!tableId && (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                        <span className="min-w-0 flex-1">
                          아직 이 그룹의 {categoryLabelOf(raw.dayType)} 표가 없습니다 — [가져오기]로 다른 그룹·지난 기수 표를 복사하거나 줄을 추가해 만드세요.
                        </span>
                        <button type="button" onClick={() => setDialog({ type: 'import' })} className={btnCls}>
                          가져오기
                        </button>
                        <button type="button" onClick={() => insertRow(null, 'after', 'class')} className={btnCls}>
                          + 반별 줄
                        </button>
                        <button type="button" onClick={() => insertRow(null, 'after', 'shared')} className={btnCls}>
                          + 공통 줄
                        </button>
                      </div>
                    )}
                    {display.classes.length === 0 && (
                      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        이 그룹에 반이 없습니다 — 오른쪽{' '}
                        <button type="button" onClick={() => setPanel('roster')} className="font-semibold underline">
                          [반·이름]
                        </button>
                        에서 반을 추가하세요.
                      </p>
                    )}
                    <EditableGrid
                      table={display}
                      teacherByClassCode={teacherByClassCode}
                      staffByRole={staffByRole}
                      campStart={campStart}
                      selection={selection}
                      activeCell={pop?.type === 'cell' ? pop.ref : null}
                      activeRowId={pop?.type === 'row' ? pop.blockId : null}
                      focusColumn={panel === 'roster' ? focusClass : null}
                      onCellClick={onCellClick}
                      onRowClick={(blockId, anchor) => {
                        setSelection([]);
                        setPop({ type: 'row', blockId, anchor });
                      }}
                      onInsertClick={(blockId, where, anchor) => setPop({ type: 'insert', blockId, where, anchor })}
                      onClassHeadClick={(code) => {
                        setPanel('roster');
                        setFocusClass(code);
                      }}
                      onExtraHeadClick={() => setPanel('settings')}
                    />
                    {display.blocks.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button type="button" onClick={() => insertRow(null, 'after', 'class')} className={btnCls}>
                          + 반별 줄
                        </button>
                        <button type="button" onClick={() => insertRow(null, 'after', 'shared')} className={btnCls}>
                          + 공통 줄
                        </button>
                        <span className="text-[11px] text-gray-400">
                          칸을 누르면 고칩니다 · Shift+클릭 범위 · Ctrl/Cmd+클릭 여러 칸 · 시간을 누르면 줄 편집 · 줄 사이 + 로 끼워 넣기
                        </span>
                      </div>
                    )}
                    {display.note && <p className="whitespace-pre-wrap text-xs text-gray-500">{display.note}</p>}
                  </div>

                  {/* 오른쪽: 패널 */}
                  <aside className="min-w-0 rounded-lg border border-gray-200 bg-white lg:sticky lg:top-3 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
                    <div className="sticky top-0 z-10 border-b border-gray-100 bg-white p-2">
                      <Segmented
                        value={panel}
                        onChange={(v) => setPanel(v)}
                        className="flex w-full [&>button]:flex-1 [&>button]:justify-center"
                        options={[
                          { value: 'subjects', label: '과목·주제' },
                          { value: 'roster', label: '반·이름' },
                          { value: 'settings', label: '표 설정' },
                          { value: 'guides', label: '칸 설명' },
                        ]}
                      />
                    </div>
                    <div className="p-3">
                      {panel === 'subjects' && (
                        <SubjectsPanel
                          table={raw}
                          display={display}
                          tableId={tableId}
                          category={catSpec}
                          edit={editTable}
                          update={update}
                          teacherByClassCode={teacherByClassCode}
                          onBulkName={(old) => setDialog({ type: 'bulk', tab: 'name', name: { kind: 'subject', old } })}
                        />
                      )}
                      {panel === 'roster' && (
                        <RosterPanel
                          ws={ws}
                          update={update}
                          group={group}
                          campCode={campCode}
                          assignedCodes={assignedCodes}
                          teacherByClassCode={teacherByClassCode}
                          staffByRole={staffByRole}
                          focusCode={focusClass}
                          eslBooks={eslBooks}
                        />
                      )}
                      {panel === 'settings' && (
                        <TableSettingsPanel
                          table={raw}
                          tableId={tableId}
                          list={list}
                          planDates={planDates}
                          edit={editTable}
                          update={update}
                          teacherByClassCode={teacherByClassCode}
                          onDeleted={() => {
                            setSelByKey((m) => {
                              const next = { ...m };
                              delete next[selKey];
                              return next;
                            });
                            resetView();
                          }}
                        />
                      )}
                      {panel === 'guides' && <GuidePanel campCode={campCode} labels={guideLabels} ws={ws} update={update} />}
                    </div>
                  </aside>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {renderPop()}
      {category && selection.length > 1 && (
        <SelectionBar count={selection.length} subjects={subjectsOf(display)} onFill={fillSelection} onDeselect={() => setSelection([])} />
      )}
      {dialog?.type === 'import' && (
        <ImportDialog
          ws={ws}
          update={update}
          campCode={campCode}
          jobCodeId={jobCodeId}
          campStart={campStart}
          campEnd={campEnd}
          category={category}
          categoryLabelOf={categoryLabelOf}
          group={group}
          groups={groups}
          classesFor={classesFor}
          current={raw}
          onClose={() => setDialog(null)}
          onDone={({ selectId }) => {
            setDialog(null);
            if (selectId) setSelByKey((m) => ({ ...m, [selKey]: selectId }));
            resetView();
          }}
        />
      )}
      {dialog?.type === 'bulk' && (
        <BulkDialog
          ws={ws}
          update={update}
          initialTab={dialog.tab}
          initialRef={dialog.ref}
          initialName={dialog.name}
          categoryLabelOf={categoryLabelOf}
          onClose={() => setDialog(null)}
        />
      )}
      {saving && <div className="fixed inset-0 z-[75] cursor-wait" aria-hidden />}
    </div>
  );
}
