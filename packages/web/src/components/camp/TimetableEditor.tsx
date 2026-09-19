'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  categoryLabel,
  DEFAULT_SUBJECTS,
  findSubject,
  dutyByBlock,
  firstName,
  booksFor,
  buildEmptyTimetable,
  commonFor,
  commonValuesOf,
  getCampClassInfo,
  getCampGroups,
  getCampTimetableCommon,
  getEslBooks,
  sortedBookCodes,
  updateCampClassInfo,
  updateCampTimetableCommon,
  usesOwn,
  isUnsaved,
  isMergedColumn,
  isSameGroup,
  lineCountOf,
  makeNameResolvers,
  mergedColumnName,
  normalizeGroupKey,
  renderCell,
  resolveGroups,
  resolveTimetable,
  timetableGroupNames,
  sortBlocks,
  type CampTimetable,
  type SubjectPartner,
  type TimetableBlock,
  type TimetableClassColumn,
  TIMETABLE_CATEGORIES,
  type CampClassInfo,
  type EslBookList,
  type TimetableOwn,
  type TimetableSubject,
  timetableDraft as D,
} from '@smis-mentor/shared';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { campTimetableService } from '@/lib/campTimetableService';
import { getJobCodeById, getUsersByJobCodeId } from '@/lib/firebaseService';

interface TimetableEditorProps {
  jobCodeId: string;
  onClose: () => void;
  /** 보기 화면에서 "만들기" 로 들어왔을 때 미리 고를 카테고리·그룹 */
  initialCategory?: string | null;
  initialGroup?: string | null;
}

/** 이름을 직접 넣을 수 있는 역할 목록 — 과목의 원어민 + 수업(Pattern) 멘토 */
function STAFF_ROLES(subjects: TimetableSubject[]): Array<{ key: string; label: string }> {
  const out = [{ key: '수업', label: '수업(Pattern)' }];
  subjects.forEach((s) => {
    if (s.partner === 'foreign') out.push({ key: s.key.toLowerCase(), label: `${s.key} 원어민` });
    if (s.partner === 'staff' && s.roleKey) out.push({ key: s.roleKey.toLowerCase(), label: `${s.roleKey} 담당` });
  });
  return out.filter((r, i, a) => a.findIndex((x) => x.key === r.key) === i);
}

/**
 * 교재 L-Code 입력. 리스트에 있는 코드는 교재 3권을 툴팁으로 보여 주고,
 * 없는 코드면 테두리로 알려 준다 (오타를 바로 알아채도록).
 */
function BookCodeInput({
  value,
  onChange,
  onPaste,
  codes,
  books,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onPaste: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  codes: string[];
  books: EslBookList | undefined;
  placeholder: string;
}) {
  const set = booksFor(books, value);
  const unknown = !!value.trim() && !set;
  const listId = `esl-codes-${placeholder}`;
  return (
    <>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        list={listId}
        placeholder={placeholder}
        title={
          set
            ? [set.speaking, set.reading, set.writing].filter(Boolean).join(' / ') || '교재 없는 코드'
            : unknown
              ? '교재 리스트에 없는 코드입니다'
              : '학년별 ESL 교재 코드 (예: Bc)'
        }
        className={`w-20 rounded-md border px-2 py-1.5 text-sm ${
          unknown ? 'border-amber-400 bg-amber-50' : 'border-gray-300'
        }`}
      />
      <datalist id={listId}>
        {codes.map((c) => {
          const s = booksFor(books, c);
          return (
            <option key={c} value={c}>
              {[s?.speaking, s?.reading, s?.writing].filter(Boolean).join(' / ')}
            </option>
          );
        })}
      </datalist>
    </>
  );
}

/** 이 줄 아래에 이름이 붙을 담당자 — 그 반 담임이거나 그룹 역할 */
function RoleSelect({
  value,
  onChange,
  roles,
}: {
  value: string;
  onChange: (v: string) => void;
  roles: Array<{ key: string; label: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="이 수업 아래에 이름이 붙을 담당자"
      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
    >
      <option value="">담당자 없음</option>
      <option value="ownTeacher">그 반 담임</option>
      {roles.map((r) => (
        <option key={r.key} value={r.key}>
          {r.label}
        </option>
      ))}
    </select>
  );
}

/**
 * 섹션 머리에 붙는 "공통을 따르는 중 / 이 Day 만 따로" 표시와 전환 버튼.
 * 공통 탭에서는 아예 나오지 않는다 (거기선 늘 편집 가능).
 */
function CommonTag({
  hidden,
  follows,
  onDetach,
  onReattach,
}: {
  hidden: boolean;
  follows: boolean;
  onDetach: () => void;
  onReattach: () => void;
}) {
  if (hidden) return null;
  return follows ? (
    <span className="flex items-center gap-2">
      <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">
        공통
      </span>
      <button
        onClick={onDetach}
        className="text-xs text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
      >
        이 Day만 따로 쓰기
      </button>
    </span>
  ) : (
    <span className="flex items-center gap-2">
      <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-700">
        이 Day 전용
      </span>
      <button
        onClick={onReattach}
        className="text-xs text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
      >
        공통으로 되돌리기
      </button>
    </span>
  );
}

/** 이 이름이 앱 배정에서 온 것인지 직접 넣은 것인지 */
function NameTag({ manual, joined }: { manual: boolean; joined?: string }) {
  if (manual)
    return (
      <span
        className="shrink-0 rounded border border-gray-300 px-1 py-0.5 text-[10px] text-gray-600"
        title={joined ? `앱 배정: ${joined}` : '앱에 배정이 없습니다'}
      >
        직접
      </span>
    );
  if (joined) return null;
  return <span className="shrink-0 text-[10px] text-amber-600">배정 없음</span>;
}

/**
 * 첫 번째 dropdown — "이 과목의 둘째 줄을 무엇으로 채울까".
 * 사람을 고르는 게 아니라 짝 수업의 종류를 고르는 자리라서,
 * 직책처럼 읽히지 않게 전부 "짝:" 으로 시작하도록 다시 썼다.
 */
const PARTNER_LABELS: Record<SubjectPartner, string> = {
  none: '짝 없음 (1줄)',
  pattern: '짝: Pattern 수업',
  foreign: '짝: 그 과목 원어민',
  owner: '짝: 주제 담당 담임',
  ownTeacher: '짝: 그 반 담임',
  staff: '짝: 담당자 이름만',
};

/** 공통 탭의 가짜 카테고리 키 — 실제 Day 가 아니다 */
const COMMON_KEY = '__common__';

export default function TimetableEditor({ jobCodeId, onClose, initialCategory, initialGroup }: TimetableEditorProps) {
  const { userData } = useAuth();
  const queryClient = useQueryClient();

  // 어느 Day 의 어느 그룹을 고쳤는지로 고른다 (표 id 가 아니라)
  const [editCategory, setEditCategory] = useState<string | null>(initialCategory ?? null);
  const [editGroup, setEditGroup] = useState<string | null>(initialGroup ?? null);
  const [draft, setDraft] = useState<CampTimetable | null>(null);
  const [saving, setSaving] = useState(false);
  const [showRooms, setShowRooms] = useState(false);

  const { data: timetables = [], refetch } = useQuery({
    queryKey: ['campTimetables', jobCodeId],
    queryFn: () => campTimetableService.listByJobCodeId(jobCodeId),
  });

  const { data: jobCode } = useQuery({
    queryKey: ['jobCode', jobCodeId],
    queryFn: () => getJobCodeById(jobCodeId),
    staleTime: 10 * 60 * 1000,
  });
  const campCode = jobCode?.code ?? '';

  const { data: campGroups = [] } = useQuery({
    queryKey: ['campGroups', campCode],
    queryFn: () => getCampGroups(db, campCode),
    enabled: !!campCode,
    staleTime: 10 * 60 * 1000,
  });

  /** 반이름·강의실은 기수별 한 벌 — 표가 아니라 캠프 설정에 저장한다 */
  const { data: savedClassInfo = {}, refetch: refetchClassInfo } = useQuery({
    queryKey: ['campClassInfo', campCode],
    queryFn: () => getCampClassInfo(db, campCode),
    enabled: !!campCode,
    staleTime: 10 * 60 * 1000,
  });
  /** 그룹별 공통 값 — 같은 그룹의 모든 Day 가 함께 쓴다 */
  const { data: commonByGroup = {}, refetch: refetchCommon } = useQuery({
    queryKey: ['campTimetableCommon', campCode],
    queryFn: () => getCampTimetableCommon(db, campCode),
    enabled: !!campCode,
    staleTime: 10 * 60 * 1000,
  });

  const { data: eslBooks } = useQuery({
    queryKey: ['eslBooks'],
    queryFn: () => getEslBooks(db),
    staleTime: 30 * 60 * 1000,
  });
  const bookCodes = useMemo(() => sortedBookCodes(eslBooks), [eslBooks]);

  const [classInfo, setClassInfo] = useState<Record<string, CampClassInfo>>({});
  useEffect(() => setClassInfo(savedClassInfo), [savedClassInfo]);

  const infoOf = (code: string): CampClassInfo => classInfo[code] ?? {};
  const setInfo = (code: string, patch: CampClassInfo) =>
    setClassInfo((prev) => ({ ...prev, [code]: { ...prev[code], ...patch } }));

  const { data: members = [] } = useQuery({
    queryKey: ['campMembers', jobCodeId],
    queryFn: () => getUsersByJobCodeId(jobCodeId),
    staleTime: 5 * 60 * 1000,
  });

  const expOf = (u: { jobExperiences?: Array<{ id: string }> }) =>
    u.jobExperiences?.find((e) => e.id === jobCodeId) as
      | { group?: string; groupRole?: string; classCode?: string }
      | undefined;

  const teacherByClassCode = useMemo(() => {
    const map: Record<string, string> = {};
    members.forEach((u) => {
      const code = expOf(u)?.classCode;
      if (code && u.name) map[code] = u.name;
    });
    return map;
  }, [members, jobCodeId]);

  /** 그룹은 보기 화면과 같은 규칙으로 — 저장된 표가 없는 그룹도 전부 나온다 */
  const derived = useMemo(
    () => resolveGroups(members, jobCodeId, campGroups),
    [members, jobCodeId, campGroups]
  );
  const groups = useMemo(() => timetableGroupNames(derived, timetables), [derived, timetables]);
  const categories = useMemo(
    () => TIMETABLE_CATEGORIES.map((c) => ({ key: c.key, label: categoryLabel(c, campCode) })),
    [campCode]
  );

  const activeCategory = editCategory ?? COMMON_KEY;
  /** 공통 탭 — 반·이름·과목만 고치고, 고친 값은 그 그룹의 모든 Day 에 적용된다 */
  const isCommon = activeCategory === COMMON_KEY;
  const activeGroup = (editGroup && groups.find((g) => isSameGroup(g, editGroup))) || groups[0] || null;

  /**
   * 고른 Day·그룹의 표. 저장된 게 있으면 그것을, 없으면 기본 틀을 초안으로 연다.
   * 저장을 누르면 그때 이 캠프 전용 표로 만들어진다.
   */
  const draftKey = `${activeCategory}::${normalizeGroupKey(activeGroup)}`;
  const loadedKey = useRef<string | null>(null);
  useEffect(() => {
    // 편집 중인데 데이터만 새로고침된 경우에는 고쳐 둔 내용을 지우지 않는다
    if (loadedKey.current === draftKey && draft) return;
    const resolved = isCommon
      ? buildCommonDraft()
      : resolveTimetable({
          timetables,
          groups: derived,
          category: activeCategory,
          groupName: activeGroup,
          campCode,
          jobCodeId,
          common: commonByGroup,
        });
    setDraft(resolved ? D.cloneDraft(resolved) : null);
    loadedKey.current = draftKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, timetables, derived, groups, campCode, jobCodeId, commonByGroup]);

  /** 아직 저장된 적 없는 표인지 (저장하면 새로 만들어진다) */
  const isNew = !!draft && isUnsaved(draft);

  const layout = draft?.layout ?? 'time';
  const subjects = draft?.subjects?.length ? draft.subjects : DEFAULT_SUBJECTS;
  /** 이름을 붙일 수 있는 역할 목록 */
  const staffRoles = useMemo(() => STAFF_ROLES(subjects), [subjects]);
  const patternLabel = 'Pattern';
  /** 이 그룹의 역할별 담당자 — 보기 화면과 같은 규칙(원어민·수업 멘토 모두) */
  const foreignBySubject = useMemo(
    () => derived.find((g) => isSameGroup(g.name, draft?.groupName))?.staffByRole ?? {},
    [derived, draft?.groupName]
  );
  const resolvers = makeNameResolvers(draft ?? undefined, teacherByClassCode, foreignBySubject);
  const ctxFor = (columnKey: string) => ({ subjects, columnKey, ...resolvers, patternLabel });

  const columnKeys = useMemo(() => {
    if (!draft) return [];
    return [...draft.classes.map((c) => c.classCode), ...(draft.extraColumns ?? []).map((e) => e.key)];
  }, [draft]);

  /**
   * 공통 탭에서 고칠 초안.
   * 진짜 표가 아니라 campSettings 에 저장될 값이라, 표 껍데기만 빌려 쓴다.
   */
  function buildCommonDraft(): CampTimetable | null {
    if (!activeGroup) return null;
    const shared = commonFor(commonByGroup, activeGroup);
    const assigned = derived.find((g) => isSameGroup(g.name, activeGroup))?.classCodes ?? [];
    const saved = shared?.classes ?? [];
    const known = new Set(saved.map((c) => c.classCode));
    const classes: TimetableClassColumn[] = [
      ...saved,
      // 배정에 새로 생긴 반은 공통에도 바로 보이게
      ...assigned.filter((code) => !known.has(code)).map((classCode) => ({ classCode })),
    ];
    if (!classes.length) return null;

    const skeleton = buildEmptyTimetable({
      category: categories[0]?.key ?? 'regular',
      groupName: activeGroup,
      classes,
      campCode,
      jobCodeId,
    });
    if (!skeleton) return null;
    return {
      ...skeleton,
      dayTypeLabel: '공통',
      staffOverrides: shared?.staffOverrides ?? {},
      subjects: shared?.subjects?.length ? shared.subjects : DEFAULT_SUBJECTS,
    };
  }

  /** 이 섹션이 공통을 따르는 중인지 (공통 탭에서는 늘 편집 가능) */
  const followsCommon = (part: keyof TimetableOwn) =>
    !isCommon && !!draft && !usesOwn(draft, part);
  const setOwn = (part: keyof TimetableOwn, own: boolean) =>
    patchDraft((d) => D.setOwn(d, part, own));

  const patchDraft = (fn: (d: CampTimetable) => void) =>
    setDraft((prev) => {
      if (!prev) return prev;
      const next = D.cloneDraft(prev);
      fn(next);
      return next;
    });

  const handleDelete = async () => {
    if (!draft || isNew || isCommon) return;
    if (!confirm(`"${draft.groupName} · ${draft.dayTypeLabel}" 를 삭제할까요?`)) return;
    try {
      await campTimetableService.remove(draft.id);
      loadedKey.current = null;
      await refetch();
      toast.success('삭제했습니다. 기본 틀로 돌아갑니다.');
    } catch (e) {
      toast.error('삭제에 실패했습니다.');
      console.error(e);
    }
  };

  const handleSave = async () => {
    if (!draft || !userData?.userId) return;
    setSaving(true);
    try {
      // 공통 탭 — 표가 아니라 캠프 설정에 저장한다 (그 그룹의 모든 Day 가 함께 쓴다)
      if (isCommon) {
        await updateCampTimetableCommon(db, campCode, draft.groupName, commonValuesOf(draft));
        if (campCode) await updateCampClassInfo(db, campCode, classInfo);
        loadedKey.current = null;
        await Promise.all([refetchCommon(), refetchClassInfo(), refetch()]);
        queryClient.invalidateQueries({ queryKey: ['campTimetableCommon', campCode] });
        queryClient.invalidateQueries({ queryKey: ['campClassInfo', campCode] });
        queryClient.invalidateQueries({ queryKey: ['campTimetables', jobCodeId] });
        toast.success(`"${draft.groupName}" 의 모든 Day 에 적용했습니다.`);
        return;
      }
      if (isNew) {
        // 기본 틀을 고친 것 — 이 캠프 전용 표로 새로 만든다
        await campTimetableService.create({
          campCode,
          jobCodeId,
          ...D.toUpdatePayload(draft),
          userId: userData.userId,
        });
      } else {
        await campTimetableService.update(draft.id, D.toUpdatePayload(draft), userData.userId);
      }
      // 반이름·강의실은 캠프 설정에 — 이 캠프의 모든 표가 같은 값을 쓴다
      if (campCode) await updateCampClassInfo(db, campCode, classInfo);
      loadedKey.current = null;
      await Promise.all([refetch(), refetchClassInfo()]);
      queryClient.invalidateQueries({ queryKey: ['campTimetables', jobCodeId] });
      queryClient.invalidateQueries({ queryKey: ['campClassInfo', campCode] });
      toast.success('저장했습니다.');
    } catch (e) {
      toast.error('저장에 실패했습니다.');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // ── 반 ───────────────────────────────────────────────────────────
  // 아래 조작들은 전부 shared 의 timetableDraft 를 쓴다 — mobile 편집기와 같은 구현
  const updateClass = (i: number, patch: Partial<TimetableClassColumn>) =>
    patchDraft((d) => D.updateClass(d, i, patch));

  const addClass = () => patchDraft((d) => D.addClass(d, campCode));

  const removeClass = (i: number) => patchDraft((d) => D.removeClass(d, i));

  /**
   * 엑셀·구글시트에서 열을 복사해 붙여넣으면 아래 행까지 채운다.
   * 셀 하나만 붙여넣을 때는 브라우저 기본 동작에 맡긴다.
   */
  const pasteClasses = (row: number, col: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const grid = D.parseClipboardTable(e.clipboardData.getData('text/plain'));
    if (!grid) return;
    e.preventDefault();

    // 반코드는 표에, 반이름·강의실은 캠프 설정에 들어간다
    if (col === 0) {
      let filled = 0;
      patchDraft((d) => void (filled = D.pasteClassGrid(d, row, 0, grid.map((r) => [r[0]]), campCode)));
      toast.success(`${filled}개 반번호를 붙여넣었습니다.`);
    }
    const codes = draft?.classes.map((c) => c.classCode) ?? [];
    setClassInfo((prev) => {
      const next = { ...prev };
      grid.slice(0, 30).forEach((cells, r) => {
        const code = codes[row + r];
        if (!code) return;
        cells.forEach((value, ci) => {
          const field = D.CLASS_PASTE_FIELDS[col + ci];
          if (!value || field === 'classCode' || !field) return;
          next[code] = { ...next[code], [field]: value };
        });
      });
      return next;
    });
    if (col !== 0) toast.success(`${Math.min(grid.length, 30)}개 반에 붙여넣었습니다.`);
  };

  // ── 과목·주제 ────────────────────────────────────────────────────
  const updateSubject = (i: number, patch: Partial<TimetableSubject>) =>
    patchDraft((d) => D.updateSubject(d, i, patch));

  const addSubject = () => patchDraft((d) => D.addSubject(d));

  const removeSubject = (i: number) => patchDraft((d) => D.removeSubject(d, i));

  const resetRotationSubjects = () => patchDraft((d) => D.resetRotationSubjects(d));

  // ── 블록 ─────────────────────────────────────────────────────────
  const addBlock = (kind: 'shared' | 'class') => patchDraft((d) => D.addBlock(d, kind));

  const updateBlock = (id: string, patch: Partial<TimetableBlock>) =>
    patchDraft((d) => D.updateBlock(d, id, patch));

  const updateTime = (id: string, idx: number, field: 'start' | 'end', value: string) =>
    patchDraft((d) => D.updateTime(d, id, idx, field, value));

  const setPeriodCount = (id: string, count: 1 | 2) => patchDraft((d) => D.setPeriodCount(d, id, count));

  const removeBlock = (id: string) => patchDraft((d) => D.removeBlock(d, id));

  /** 줄을 위/아래로 — 시간대(날짜)를 옆 줄과 맞바꾼다 */
  const moveBlock = (id: string, dir: -1 | 1) => patchDraft((d) => void D.moveBlock(d, id, dir));

  const setCellSubject = (blockId: string, colKey: string, subject: string) =>
    patchDraft((d) => D.setCellSubject(d, blockId, colKey, subject));

  const setCellRoom = (blockId: string, colKey: string, field: 'room' | 'partnerRoom', value: string) =>
    patchDraft((d) => D.setCellRoom(d, blockId, colKey, field, value));

  /** 같은 열의 강의실을 이 표 전체에 한 번에 채운다 */
  const fillRoomDown = (colKey: string, field: 'room' | 'partnerRoom', value: string) =>
    patchDraft((d) => D.fillRoomDown(d, colKey, field, value));

  const togglePartnerFirst = (blockId: string, colKey: string) =>
    patchDraft((d) => D.togglePartnerFirst(d, blockId, colKey));

  /** 과목·주제를 반 순서대로 놓고 줄이 넘어갈 때마다 한 칸씩 민다 */
  const applyRotation = () => {
    if (!draft) return;
    const warn = D.rotationWarning(draft);
    if (warn) {
      toast.error(warn);
      if (!D.rotationKeysOf(draft).length) return;
    }
    let used: string[] | null = null;
    patchDraft((d) => void (used = D.applyRotation(d)));
    toast.success(`${D.rotationKeysOf(draft).join(' → ')} 순으로 한 칸씩 밀어 채웠습니다.`);
    void used;
  };

  const sorted = draft ? sortBlocks(draft.blocks, draft.layout) : [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          시간표 편집 {campCode && <span className="text-gray-400">· {campCode}</span>}
        </h2>
        <button
          onClick={onClose}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          보기로 돌아가기
        </button>
      </div>

      {/* 1단계: Day — 맨 앞 "공통" 은 그 그룹의 모든 Day 에 함께 적용되는 값 */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setEditCategory(COMMON_KEY)}
          title="반 구성 · 이름 수정 · 과목·주제를 한 번만 넣으면 이 그룹의 모든 Day 에 적용됩니다"
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            isCommon
              ? 'bg-blue-600 text-white'
              : 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
          }`}
        >
          공통
        </button>
        <span className="mx-0.5 h-5 w-px bg-gray-200" />
        {categories.map((c) => {
          const on = c.key === activeCategory;
          const saved = timetables.some((t) => t.dayType === c.key);
          return (
            <button
              key={c.key}
              onClick={() => setEditCategory(c.key)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                on
                  ? 'bg-gray-900 text-white'
                  : saved
                    ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                    : 'border border-gray-200 text-gray-400 hover:bg-gray-50'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* 2단계: 그룹 — 배정된 그룹은 저장된 표가 없어도 전부 나온다 */}
      {groups.length > 0 && (
        <div
          className="mb-4 grid gap-0.5 rounded-lg border border-gray-200 bg-gray-50 p-0.5"
          style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}
        >
          {groups.map((g) => {
            const on = isSameGroup(g, activeGroup);
            return (
              <button
                key={g}
                onClick={() => setEditGroup(g)}
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

      {!draft ? (
        <p className="py-8 text-center text-sm text-gray-500">
          이 그룹에 배정된 반이 없습니다. 관리자 &gt; 지원 유저 관리에서 반번호를 넣어 주세요.
        </p>
      ) : (
        <div className="space-y-6">
          {isCommon && (
            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              여기서 고친 값은 <strong>{draft.groupName}</strong> 그룹의 모든 Day(정규·스팀·입소…)에 함께
              적용됩니다. 한 Day 만 달라야 하면 그 Day 탭에서 &quot;이 Day만 따로 쓰기&quot; 를 누르세요.
            </p>
          )}

          {/* 이름 수정 — 비우면 앱 배정, 넣으면 그 값 */}
          <section className="rounded-lg border border-gray-200 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">이름 수정</h3>
              <CommonTag
                hidden={isCommon}
                follows={followsCommon('roster')}
                onDetach={() => setOwn('roster', true)}
                onReattach={() => setOwn('roster', false)}
              />
            </div>

            <fieldset disabled={followsCommon('roster')} className="grid gap-1 disabled:opacity-60 sm:grid-cols-2">
              {draft.classes.map((c, i) => {
                const joined = teacherByClassCode[c.classCode];
                const manual = (c.teacherName ?? '').trim();
                return (
                  <div key={`${c.classCode}-${i}`} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 text-xs font-medium text-gray-600">{c.classCode}</span>
                    <input
                      value={c.teacherName ?? ''}
                      onChange={(e) => updateClass(i, { teacherName: e.target.value })}
                      placeholder={joined || '담임 미배정'}
                      className={`min-w-0 flex-1 rounded-md border px-2 py-0.5 text-sm ${
                        manual ? 'border-gray-400 bg-white' : 'border-gray-200 bg-gray-50'
                      }`}
                    />
                    <NameTag manual={!!manual} joined={joined} />
                  </div>
                );
              })}

              {staffRoles.map((role) => {
                const joined = firstName(foreignBySubject[role.key]);
                const manual = (draft.staffOverrides?.[role.key] ?? '').trim();
                return (
                  <div key={role.key} className="flex items-center gap-2">
                    <span className="w-14 shrink-0 truncate text-xs font-medium text-gray-600">{role.label}</span>
                    <input
                      value={draft.staffOverrides?.[role.key] ?? ''}
                      onChange={(e) =>
                        patchDraft((d) => {
                          d.staffOverrides = { ...(d.staffOverrides ?? {}) };
                          if (e.target.value) d.staffOverrides[role.key] = e.target.value;
                          else delete d.staffOverrides[role.key];
                        })
                      }
                      placeholder={joined || '미배정'}
                      className={`min-w-0 flex-1 rounded-md border px-2 py-0.5 text-sm ${
                        manual ? 'border-gray-400 bg-white' : 'border-gray-200 bg-gray-50'
                      }`}
                    />
                    <NameTag manual={!!manual} joined={joined} />
                  </div>
                );
              })}
            </fieldset>
          </section>

          {/* 반 구성 */}
          <section className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">반 구성 ({draft.classes.length}반)</h3>
              <CommonTag
                hidden={isCommon}
                follows={followsCommon('roster')}
                onDetach={() => setOwn('roster', true)}
                onReattach={() => setOwn('roster', false)}
              />
            </div>
            <fieldset disabled={followsCommon('roster')} className="disabled:opacity-60">
              <div className="mb-3 flex items-center justify-end">
              <div className="flex gap-2">
                <button
                  onClick={addClass}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  + 반 추가
                </button>
                <button
                  onClick={() =>
                    patchDraft((d) => {
                      d.extraColumns = [
                        ...(d.extraColumns ?? []),
                        { key: D.newBlockId().slice(-6), label: '새 열' },
                      ];
                    })
                  }
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  + 열 추가
                </button>
              </div>
            </div>
            <p className="mb-2 text-xs text-gray-500">
              관리시트 SY시트에서 열을 통째로 복사해 붙여넣으면 아래 행까지 한 번에 채워집니다. 반이 모자라면 자동으로 늘어납니다.
              <br />
              반이름·강의실·교재코드는 이 캠프 전체가 함께 쓰는 값이라, 여기서 고치면 이 캠프의 모든 표에 같이
              반영됩니다. 교재는 코드만 넣으면 3권이 따라옵니다.
            </p>
            <div className="space-y-2">
              {draft.classes.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input
                    value={c.classCode}
                    onChange={(e) => updateClass(i, { classCode: e.target.value })}
                    onPaste={pasteClasses(i, 0)}
                    placeholder="J01"
                    className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={infoOf(c.classCode).classroom ?? ''}
                    onChange={(e) => setInfo(c.classCode, { classroom: e.target.value })}
                    onPaste={pasteClasses(i, 1)}
                    placeholder="강의실 호수"
                    className="w-28 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={infoOf(c.classCode).className ?? ''}
                    onChange={(e) => setInfo(c.classCode, { className: e.target.value })}
                    onPaste={pasteClasses(i, 2)}
                    placeholder="반이름 (Grit)"
                    className="w-36 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <BookCodeInput
                    value={infoOf(c.classCode).bookCode ?? ''}
                    onChange={(v) => setInfo(c.classCode, { bookCode: v })}
                    onPaste={pasteClasses(i, 3)}
                    codes={bookCodes}
                    books={eslBooks}
                    placeholder="교재"
                  />
                  <BookCodeInput
                    value={infoOf(c.classCode).spareBookCode ?? ''}
                    onChange={(v) => setInfo(c.classCode, { spareBookCode: v })}
                    onPaste={pasteClasses(i, 4)}
                    codes={bookCodes}
                    books={eslBooks}
                    placeholder="Spare"
                  />
                  <button onClick={() => removeClass(i)} className="ml-auto text-xs text-red-500 hover:text-red-700">
                    삭제
                  </button>
                </div>
              ))}
              </div>
            </fieldset>
          </section>

          {/* 당번 순번 — 공통이 아니라 Day 마다 다르므로 공통 탭에서는 숨긴다 */}
          {!isCommon && (draft.extraColumns ?? []).map((e, ei) => (
            <section key={e.key} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input
                  value={e.label}
                  onChange={(ev) =>
                    patchDraft((d) => {
                      if (d.extraColumns) d.extraColumns[ei].label = ev.target.value;
                    })
                  }
                  className="w-44 rounded-md border border-gray-300 px-2 py-1.5 text-sm font-semibold"
                />
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={!!e.dutyRotation?.length}
                    onChange={(ev) =>
                      patchDraft((d) => {
                        if (!d.extraColumns) return;
                        d.extraColumns[ei].dutyRotation = ev.target.checked
                          ? d.classes.map((c) => c.classCode)
                          : undefined;
                      })
                    }
                  />
                  반이 순서대로 돌아가는 당번 열
                </label>
                <button
                  onClick={() =>
                    patchDraft((d) => {
                      if (!d.extraColumns) return;
                      const [removed] = d.extraColumns.splice(ei, 1);
                      if (removed) d.blocks.forEach((b) => b.cells && delete b.cells[removed.key]);
                    })
                  }
                  className="ml-auto text-xs text-red-500 hover:text-red-700"
                >
                  열 삭제
                </button>
              </div>

              {e.dutyRotation?.length ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {e.dutyRotation.map((code, pos) => (
                      <span key={pos} className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">{pos + 1}번째 줄</span>
                        <select
                          value={code}
                          onChange={(ev) =>
                            patchDraft((d) => {
                              const rot = d.extraColumns?.[ei].dutyRotation;
                              if (rot) rot[pos] = ev.target.value;
                            })
                          }
                          className="rounded border border-gray-300 px-1 py-1 text-sm"
                        >
                          {draft.classes.map((c) => (
                            <option key={c.classCode} value={c.classCode}>
                              {c.className || c.classCode} ({teacherByClassCode[c.classCode] || '미배정'})
                            </option>
                          ))}
                        </select>
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">
                  </p>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    value={e.teacherName ?? ''}
                    onChange={(ev) =>
                      patchDraft((d) => {
                        if (d.extraColumns) d.extraColumns[ei].teacherName = ev.target.value;
                      })
                    }
                    placeholder="고정 전담 교사"
                    className="w-40 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <span className="text-xs text-gray-500">칸 내용은 아래 줄 편집에서 직접 넣습니다.</span>
                </div>
              )}
            </section>
          ))}

          {/* 과목·주제 */}
          <section className="rounded-lg border border-gray-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-gray-900">
                과목·주제 ({subjects.length})
                <span className="ml-2 text-xs font-normal text-gray-500">
                  둘째 줄에 무엇이 오는지, 누구 이름이 붙는지, 어느 강의실인지를 정합니다
                </span>
              </h3>
              <CommonTag
                hidden={isCommon}
                follows={followsCommon('subjects')}
                onDetach={() => setOwn('subjects', true)}
                onReattach={() => setOwn('subjects', false)}
              />
            </div>
            <fieldset disabled={followsCommon('subjects')} className="disabled:opacity-60">
              <div className="mt-3 space-y-2">
                {/* 두 dropdown 이 각각 무엇을 정하는지 머리글로 구분해 준다 */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                  <span className="w-32">과목</span>
                  <span className="w-[164px]">둘째 줄</span>
                  <span className="w-24">강의실</span>
                  <span>이름</span>
                </div>
                {subjects.map((s, i) => (
                  <div key={i} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={s.key}
                      onChange={(e) => updateSubject(i, { key: e.target.value })}
                      className="w-32 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      style={{ backgroundColor: s.color }}
                    />
                    <select
                      value={s.partner}
                      onChange={(e) => updateSubject(i, { partner: e.target.value as SubjectPartner })}
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      {(Object.keys(PARTNER_LABELS) as SubjectPartner[]).map((p) => (
                        <option key={p} value={p}>
                          {PARTNER_LABELS[p]}
                        </option>
                      ))}
                    </select>
                    {s.partner === 'owner' && (
                      <select
                        value={s.ownerClassCode ?? ''}
                        onChange={(e) => updateSubject(i, { ownerClassCode: e.target.value })}
                        className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">담당 반</option>
                        {draft.classes.map((c) => (
                          <option key={c.classCode} value={c.classCode}>
                            {c.className || c.classCode} ({teacherByClassCode[c.classCode] || '미배정'})
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      value={s.room ?? ''}
                      onChange={(e) => updateSubject(i, { room: e.target.value })}
                      placeholder="강의실"
                      title="이 과목이 늘 쓰는 강의실 (이동 수업 호수)"
                      className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    <RoleSelect
                      value={s.teacherRole ?? ''}
                      onChange={(v) => updateSubject(i, { teacherRole: v })}
                      roles={staffRoles}
                    />
                    <button onClick={() => removeSubject(i)} className="ml-auto text-xs text-red-500 hover:text-red-700">
                      삭제
                    </button>
                  </div>

                  {/* 짝 수업(Pattern)은 같은 세트지만 다른 수업이라 따로 적는다 */}
                  {s.partner === 'pattern' && (
                    <div key={`${i}-pair`} className="flex flex-wrap items-center gap-2 pl-6">
                      <span className="text-xs text-gray-400">└ 짝</span>
                      <input
                        value={s.partnerLabel ?? ''}
                        onChange={(e) => updateSubject(i, { partnerLabel: e.target.value })}
                        placeholder="Pattern"
                        className="w-32 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      <input
                        value={s.partnerRoom ?? ''}
                        onChange={(e) => updateSubject(i, { partnerRoom: e.target.value })}
                        placeholder="강의실"
                        title="짝 수업 강의실 — 보통 같지만 다를 수 있습니다"
                        className="w-24 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      <RoleSelect
                        value={s.partnerTeacherRole ?? '수업'}
                        onChange={(v) => updateSubject(i, { partnerTeacherRole: v })}
                        roles={staffRoles}
                      />
                    </div>
                  )}
                </div>
                ))}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={addSubject}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    + 과목 추가
                  </button>
                  <button
                    onClick={resetRotationSubjects}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                    title="반 수만큼 주제1~N 을 만들고 각 반 담임을 담당으로 지정합니다"
                  >
                    주제1~{draft.classes.length} 로 채우기 (인문학용)
                  </button>
                </div>
              </div>
            </fieldset>
          </section>

          {/* 줄 — 교시·날짜는 Day 마다 다르므로 공통 탭에는 없다 */}
          {!isCommon && (
          <section className="rounded-lg border border-gray-200 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {layout === 'date' ? '날짜별 줄' : '교시'} ({draft.blocks.length})
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  {layout === 'date'
                    ? '주제만 고르면 담당 선생님은 주제를 따라 자동으로 붙습니다.'
                    : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowRooms((v) => !v)}
                  className={`rounded-md border px-3 py-1.5 text-xs ${
                    showRooms ? 'border-gray-400 bg-gray-100 text-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                  title="칸마다 강의실을 입력합니다. 입력칸을 더블클릭하면 그 열 전체에 같은 값을 채웁니다."
                >
                  강의실 {showRooms ? '숨기기' : '입력'}
                </button>
                <button
                  onClick={applyRotation}
                  className="rounded-md border border-blue-300 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50"
                  title={subjects.map((s) => s.key).join(' → ')}
                >
                  로테이션 채우기
                </button>
                <button
                  onClick={() => addBlock('class')}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  + 반별 줄
                </button>
                <button
                  onClick={() => addBlock('shared')}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  + 공통 줄
                </button>
              </div>
            </div>

            {/* 한 줄 = 한 블록. 좌우 스크롤 없이 반 칸을 격자로 편다 */}
            <div className="space-y-1.5">
              {sorted.map((b, bi) => {
                const n = lineCountOf(b, layout);
                const isShared = b.kind === 'shared';
                return (
                  <div
                    key={b.id}
                    className={`rounded-md border p-2 ${
                      isShared ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* 시간 / 날짜 */}
                      {layout === 'date' ? (
                        <input
                          value={b.dateLabel ?? ''}
                          onChange={(e) => updateBlock(b.id, { dateLabel: e.target.value })}
                          placeholder="1/6, 1/7"
                          className="w-24 rounded border border-gray-200 px-1.5 py-1 text-center text-xs"
                        />
                      ) : (
                        <div className="flex items-center gap-0.5">
                          {b.times?.map((t, idx) => (
                            <span key={idx} className="flex items-center gap-0.5">
                              {idx > 0 && <span className="px-0.5 text-[10px] text-gray-300">/</span>}
                              <input
                                value={t.start}
                                onChange={(e) => updateTime(b.id, idx, 'start', e.target.value)}
                                className="w-11 rounded border border-gray-200 px-0.5 py-1 text-center text-[11px] tabular-nums"
                              />
                              <span className="text-[10px] text-gray-300">~</span>
                              <input
                                value={t.end}
                                onChange={(e) => updateTime(b.id, idx, 'end', e.target.value)}
                                className="w-11 rounded border border-gray-200 px-0.5 py-1 text-center text-[11px] tabular-nums"
                              />
                            </span>
                          ))}
                        </div>
                      )}

                      <select
                        value={b.kind}
                        onChange={(e) =>
                          updateBlock(b.id, {
                            kind: e.target.value as 'shared' | 'class',
                            ...(e.target.value === 'shared' ? { cells: {} } : { label: '' }),
                          })
                        }
                        className="rounded border border-gray-200 px-1 py-1 text-[11px]"
                      >
                        <option value="class">반별</option>
                        <option value="shared">공통</option>
                      </select>

                      {b.kind === 'class' && layout === 'time' && (
                        <select
                          value={b.times?.length ?? 1}
                          onChange={(e) => setPeriodCount(b.id, Number(e.target.value) === 1 ? 1 : 2)}
                          className="rounded border border-gray-200 px-1 py-1 text-[11px]"
                        >
                          <option value={2}>2교시</option>
                          <option value={1}>1교시</option>
                        </select>
                      )}

                      {/* 공통 줄은 여기서 내용까지 끝 */}
                      {isShared && (
                        <input
                          value={b.label ?? ''}
                          onChange={(e) => updateBlock(b.id, { label: e.target.value })}
                          placeholder="Breakfast / P.E / 인문학 프로그램"
                          className="min-w-[10rem] flex-1 rounded border border-gray-200 px-2 py-1 text-center text-xs"
                        />
                      )}

                      <div className="ml-auto flex items-center gap-0.5">
                        <button
                          onClick={() => moveBlock(b.id, -1)}
                          disabled={bi === 0}
                          title="위로 — 윗줄과 시간대를 맞바꿉니다"
                          className="rounded px-1.5 py-1 text-[11px] text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => moveBlock(b.id, 1)}
                          disabled={bi === sorted.length - 1}
                          title="아래로 — 아랫줄과 시간대를 맞바꿉니다"
                          className="rounded px-1.5 py-1 text-[11px] text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                        >
                          ↓
                        </button>
                        <button
                          onClick={() => removeBlock(b.id)}
                          className="rounded px-1.5 py-1 text-[11px] text-red-500 hover:bg-red-50"
                        >
                          삭제
                        </button>
                      </div>
                    </div>

                    {/* 반별 칸 — 반 개수만큼 균등 격자, 가로 스크롤 없음 */}
                    {!isShared && (
                      <div
                        className="mt-1.5 grid gap-1"
                        style={{
                          gridTemplateColumns: `repeat(${Math.max(columnKeys.length, 1)}, minmax(0, 1fr))`,
                        }}
                      >
                        {columnKeys.map((key) => {
                          const dutyCol = draft.extraColumns?.find((e) => e.key === key && isMergedColumn(e));
                          if (dutyCol) {
                            // 순번대로 붙는 이름이 기본, 이 줄만 다른 사람이면 직접 입력
                            const auto = mergedColumnName(
                              { ...dutyCol },
                              { id: b.id, cells: undefined },
                              { [dutyCol.key]: dutyByBlock(draft.blocks, layout, dutyCol.dutyRotation) },
                              resolvers.resolveTeacher,
                              resolvers.resolveForeign
                            );
                            const override = b.cells?.[key]?.texts?.[0] ?? '';
                            return (
                              <div key={key} className="min-w-0">
                                <div className="truncate text-[10px] text-gray-400">{dutyCol.label}</div>
                                <input
                                  value={override}
                                  onChange={(e) =>
                                    patchDraft((d) => {
                                      const blk = d.blocks.find((x) => x.id === b.id);
                                      if (!blk) return;
                                      blk.cells ??= {};
                                      if (e.target.value) blk.cells[key] = { texts: [e.target.value] };
                                      else delete blk.cells[key];
                                    })
                                  }
                                  placeholder={auto?.text ?? '—'}
                                  title="비워 두면 순번대로 자동으로 들어갑니다"
                                  className={`w-full truncate rounded border px-1 py-1 text-center text-[11px] ${
                                    override ? 'border-gray-400 bg-white text-gray-900' : 'border-dashed border-gray-200 text-gray-500'
                                  }`}
                                />
                              </div>
                            );
                          }
                          const cell = b.cells?.[key];
                          const cls = draft.classes.find((c) => c.classCode === key);
                          const extra = draft.extraColumns?.find((e) => e.key === key);
                          const preview = renderCell(cell, n, ctxFor(key));
                          const spec = findSubject(subjects, cell?.subject);
                          const partnerIdx = cell?.partnerFirst ? 0 : 1;
                          return (
                            <div key={key} className="min-w-0">
                              <div className="truncate text-[10px] text-gray-400">
                                {cls ? key : extra?.label || key}
                              </div>
                              <select
                                value={cell?.subject ?? ''}
                                onChange={(e) => setCellSubject(b.id, key, e.target.value)}
                                className="w-full truncate rounded border border-gray-200 px-1 py-1 text-[11px]"
                                style={{ backgroundColor: spec?.color }}
                              >
                                <option value="">—</option>
                                {subjects.map((sb) => (
                                  <option key={sb.key} value={sb.key}>
                                    {sb.key}
                                  </option>
                                ))}
                              </select>
                              {n > 1 && cell?.subject && (
                                <div className="mt-0.5 flex items-center gap-0.5">
                                  <span
                                    className={`min-w-0 flex-1 truncate text-[10px] ${
                                      preview[partnerIdx]?.muted ? 'text-amber-600' : 'text-gray-500'
                                    }`}
                                    title={preview[partnerIdx]?.text}
                                  >
                                    {preview[partnerIdx]?.text}
                                    {preview[partnerIdx]?.sub && ` (${preview[partnerIdx]?.sub})`}
                                  </span>
                                  {layout === 'time' && (
                                    <button
                                      onClick={() => togglePartnerFirst(b.id, key)}
                                      title="1교시/2교시 순서 바꾸기"
                                      className="shrink-0 text-[10px] text-gray-400 hover:text-gray-700"
                                    >
                                      ⇅
                                    </button>
                                  )}
                                </div>
                              )}
                              {showRooms && cell?.subject && (
                                <div className="mt-0.5 space-y-0.5">
                                  <input
                                    value={cell.room ?? ''}
                                    onChange={(e) => setCellRoom(b.id, key, 'room', e.target.value)}
                                    onDoubleClick={() => fillRoomDown(key, 'room', cell.room ?? '')}
                                    placeholder="강의실"
                                    title="더블클릭하면 이 열 전체에 같은 강의실을 채웁니다"
                                    className="w-full rounded border border-gray-200 px-1 py-0.5 text-center text-[10px]"
                                  />
                                  {n > 1 && (
                                    <input
                                      value={cell.partnerRoom ?? ''}
                                      onChange={(e) => setCellRoom(b.id, key, 'partnerRoom', e.target.value)}
                                      onDoubleClick={() => fillRoomDown(key, 'partnerRoom', cell.partnerRoom ?? '')}
                                      placeholder={`${preview[partnerIdx]?.text ?? '짝'} 강의실`}
                                      title="더블클릭하면 이 열 전체에 같은 강의실을 채웁니다"
                                      className="w-full rounded border border-gray-100 px-1 py-0.5 text-center text-[10px]"
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
          )}

          <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-gray-200 bg-white py-3">
            {isCommon && (
              <span className="text-xs text-gray-500">
                저장하면 {draft.groupName} 그룹의 모든 Day 에 적용됩니다.
              </span>
            )}
            {!isCommon && isNew && (
              <span className="text-xs text-gray-500">저장하면 이 캠프 전용 표가 됩니다.</span>
            )}
            {!isCommon && !isNew && (
              <button
                onClick={handleDelete}
                className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                삭제
              </button>
            )}
            <button
              onClick={onClose}
              className="ml-auto rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              닫기
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
