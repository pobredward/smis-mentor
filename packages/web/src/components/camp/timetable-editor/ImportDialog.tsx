'use client';

/**
 * [가져오기] — 이 캠프의 다른 그룹·Day, 또는 지난 기수(다른 캠프)의 표를 작업 공간으로 복사한다 (저장 전).
 * 범위: 지금 표 하나 / 이 그룹 모든 Day / 캠프 전체(그룹 짝 맞추기). 옵션: 커스텀 표 · 칸 설명 · 일정표 · 이미 있는 표.
 */
import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  compareGroupNames,
  findCategory,
  isSameGroup,
  loadTimetableWorkspace,
  localYmd,
  monthDayLabel,
  savedTimetablesFor,
  TIMETABLE_CATEGORIES,
  timetableWorkspace as W,
  type CampTimetable,
  type TimetableClassColumn,
  type TimetableWorkspaceData,
} from '@smis-mentor/shared';
import { db } from '@/lib/firebase';
import { getAllJobCodes } from '@/lib/firebaseService';
import { FieldLabel, Modal, Segmented, btnCls, btnPrimaryCls, inputCls, type WsUpdate } from './ui';

type Status = 'create' | 'replace' | 'skip' | 'excluded' | 'into';
interface Item {
  key: string;
  label: string;
  status: Status;
  table: CampTimetable | null;
}
const STATUS_LABEL: Record<Status, string> = { create: '새로 만듦', replace: '바꿈', skip: '건너뜀', excluded: '기간 밖', into: '지금 표에 덮어씀' };
const STATUS_CLS: Record<Status, string> = {
  create: 'bg-green-50 text-green-700',
  replace: 'bg-orange-50 text-orange-700',
  skip: 'bg-gray-100 text-gray-500',
  excluded: 'bg-gray-100 text-gray-400',
  into: 'bg-blue-50 text-blue-700',
};

const catOrder = (key: string) => {
  const i = TIMETABLE_CATEGORIES.findIndex((c) => c.key === key);
  return i < 0 ? 99 : i;
};
const sameDates = (a?: string[], b?: string[]) => JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());
const chipOf = (t: Pick<CampTimetable, 'dates'>) => (t.dates?.length ? t.dates.map(monthDayLabel).join('·') : '기본');

export function ImportDialog({
  ws,
  update,
  campCode,
  jobCodeId,
  campStart,
  campEnd,
  category,
  categoryLabelOf,
  group,
  groups,
  classesFor,
  current,
  onClose,
  onDone,
}: {
  ws: W.Workspace;
  update: WsUpdate;
  campCode: string;
  jobCodeId: string;
  campStart: Date | null;
  campEnd: Date | null;
  /** 지금 보고 있는 Day (일정표 탭이면 null) */
  category: string | null;
  categoryLabelOf: (key: string) => string;
  /** 지금 그룹 (받는 그룹) */
  group: string | null;
  /** 이 캠프의 그룹들 */
  groups: string[];
  /** 받는 그룹의 반 순서 */
  classesFor: (group: string) => TimetableClassColumn[];
  /** 지금 표 (빈 뼈대일 수 있음) */
  current: CampTimetable | null;
  onClose: () => void;
  onDone: (r: { selectId?: string }) => void;
}) {
  const [source, setSource] = useState<'this' | 'other'>('other');
  const [otherId, setOtherId] = useState('');
  const [other, setOther] = useState<{ data: TimetableWorkspaceData; code: string; start: Date | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef('');
  const [scope, setScope] = useState<'one' | 'group' | 'camp'>(category ? 'one' : 'group');
  const [srcGroupPick, setSrcGroupPick] = useState<string | null>(null);
  const [srcCatPick, setSrcCatPick] = useState<string | null>(null);
  const [srcTablePick, setSrcTablePick] = useState<string | null>(null);
  const [includeCustom, setIncludeCustom] = useState(true);
  const [includeGuides, setIncludeGuides] = useState(true);
  const [includePlan, setIncludePlan] = useState(!ws.cur.dayPlan?.sets?.length);
  const [mode, setMode] = useState<'replace' | 'skip'>('skip');
  const [mapPick, setMapPick] = useState<Record<string, string>>({});

  const { data: jobCodes = [] } = useQuery({
    queryKey: ['allJobCodes'],
    queryFn: getAllJobCodes,
    enabled: source === 'other',
    staleTime: 10 * 60 * 1000,
  });
  const camps = useMemo(
    () =>
      jobCodes
        .filter((j) => j.id !== jobCodeId && j.code)
        .sort((a, b) => (b.startDate?.toMillis?.() ?? 0) - (a.startDate?.toMillis?.() ?? 0)),
    [jobCodes, jobCodeId]
  );

  const pickOther = async (id: string) => {
    setOtherId(id);
    setOther(null);
    latest.current = id;
    const jc = camps.find((j) => j.id === id);
    if (!jc) return;
    setLoading(true);
    try {
      const data = await loadTimetableWorkspace(db, { campCode: jc.code, jobCodeId: jc.id });
      if (latest.current !== id) return;
      setOther({ data, code: jc.code, start: jc.startDate?.toDate?.() ?? null });
    } catch (e) {
      console.error(e);
      toast.error('그 캠프의 표를 불러오지 못했습니다.');
    } finally {
      if (latest.current === id) setLoading(false);
    }
  };

  const src = useMemo(
    () =>
      source === 'this'
        ? { tables: Object.values(ws.cur.tables), guides: ws.cur.guides, dayPlan: ws.cur.dayPlan, start: campStart, code: campCode }
        : other
          ? { tables: other.data.tables, guides: other.data.guides, dayPlan: other.data.dayPlan, start: other.start, code: other.code }
          : null,
    [source, ws.cur.tables, ws.cur.guides, ws.cur.dayPlan, campStart, campCode, other]
  );

  const srcGroups = useMemo(() => {
    const out: string[] = [];
    (src?.tables ?? []).forEach((t) => {
      if (t.groupName && !out.some((g) => isSameGroup(g, t.groupName))) out.push(t.groupName);
    });
    return out.sort((a, b) => compareGroupNames(a, b));
  }, [src?.tables]);

  // 같은 캠프에서 '이 그룹 모든 Day' 는 자기 그룹을 출처로 고를 수 없다
  const groupChoices = source === 'this' && scope !== 'one' ? srcGroups.filter((g) => !isSameGroup(g, group)) : srcGroups;
  // 다른 캠프는 같은 이름 그룹, 이 캠프는 다른 그룹을 먼저
  const defaultSrcGroup =
    (source === 'other' ? groupChoices.find((g) => isSameGroup(g, group)) : groupChoices.find((g) => !isSameGroup(g, group))) || groupChoices[0] || '';
  const srcGroup = srcGroupPick && groupChoices.includes(srcGroupPick) ? srcGroupPick : defaultSrcGroup;

  const layoutOf = (key: string | null) => findCategory(key)?.layout ?? 'time';
  const curLayout = current?.layout ?? layoutOf(category);
  const srcCats = useMemo(
    () =>
      [...new Set((src?.tables ?? []).filter((t) => isSameGroup(t.groupName, srcGroup) && (t.layout ?? 'time') === curLayout).map((t) => t.dayType))].sort(
        (a, b) => catOrder(a) - catOrder(b)
      ),
    [src?.tables, srcGroup, curLayout]
  );
  const srcCat = srcCatPick && srcCats.includes(srcCatPick) ? srcCatPick : srcCats.find((c) => c === category) ?? srcCats[0] ?? '';
  const srcTables = useMemo(
    () => savedTimetablesFor(src?.tables ?? [], srcCat || null, srcGroup || null).filter((t) => source !== 'this' || t.id !== current?.id),
    [src?.tables, srcCat, srcGroup, source, current?.id]
  );
  const srcTable = srcTables.find((t) => t.id === srcTablePick) ?? srcTables[0] ?? null;

  const dayShift = source === 'other' && src?.start && campStart ? W.daysBetween(localYmd(src.start), localYmd(campStart)) : 0;
  const period = useMemo(() => (campStart && campEnd ? { start: localYmd(campStart), end: localYmd(campEnd) } : null), [campStart, campEnd]);

  const groupMap = useMemo(() => {
    const out: Record<string, string> = {};
    const used = new Set<string>();
    groups.forEach((g) => {
      const hit = srcGroups.find((s) => isSameGroup(s, g));
      if (hit) {
        out[g] = hit;
        used.add(hit);
      }
    });
    const rest = srcGroups.filter((s) => !used.has(s));
    groups.forEach((g) => {
      if (!out[g] && rest.length) out[g] = rest.shift()!;
    });
    Object.entries(mapPick).forEach(([g, s]) => {
      if (s === '' || srcGroups.includes(s)) out[g] = s;
    });
    return out;
  }, [groups, srcGroups, mapPick]);

  const items: Item[] = useMemo(() => {
    if (!src || !group) return [];
    if (scope === 'one') {
      if (!srcTable || !current) return [];
      const a = W.adaptTable({ ...srcTable, dates: undefined }, { campCode, jobCodeId, groupName: group, classes: classesFor(group) });
      return [{ key: srcTable.id, label: `${srcTable.groupName} · ${categoryLabelOf(srcTable.dayType)} · ${chipOf(srcTable)} → 지금 표`, status: 'into', table: a }];
    }
    const pairs: Array<[string, string]> = scope === 'group' ? (srcGroup ? [[srcGroup, group]] : []) : groups.map((g) => [groupMap[g] ?? '', g] as [string, string]).filter(([s]) => !!s);
    const claimed: Array<Pick<CampTimetable, 'dayType' | 'groupName' | 'dates'>> = Object.values(ws.cur.tables);
    const out: Item[] = [];
    pairs.forEach(([sg, tg]) => {
      src.tables
        .filter((t) => isSameGroup(t.groupName, sg) && (includeCustom || !t.dates?.length))
        .sort((a, b) => catOrder(a.dayType) - catOrder(b.dayType) || (a.dates?.[0] ?? '').localeCompare(b.dates?.[0] ?? ''))
        .forEach((t) => {
          const a = W.adaptTable(t, { campCode, jobCodeId, groupName: tg, classes: classesFor(tg), dayShift, period });
          const label = `${tg} · ${categoryLabelOf(t.dayType)} · ${a ? chipOf(a) : chipOf(t)}${sg !== tg ? `  (← ${sg})` : ''}`;
          if (!a) {
            out.push({ key: `${t.id}:${tg}`, label, status: 'excluded', table: null });
            return;
          }
          const clash = claimed.some((x) => x.dayType === a.dayType && isSameGroup(x.groupName, a.groupName) && sameDates(x.dates, a.dates));
          const status: Status = clash ? (mode === 'replace' ? 'replace' : 'skip') : 'create';
          if (status !== 'skip') claimed.push(a);
          out.push({ key: `${t.id}:${tg}`, label, status, table: a });
        });
    });
    return out;
  }, [src, group, scope, srcTable, current, campCode, jobCodeId, classesFor, categoryLabelOf, srcGroup, groups, groupMap, ws.cur.tables, includeCustom, dayShift, period, mode]);

  const counts = items.reduce<Record<Status, number>>((m, i) => ({ ...m, [i.status]: m[i.status] + 1 }), { create: 0, replace: 0, skip: 0, excluded: 0, into: 0 });
  const canGuides = source === 'other' && !!src && Object.keys(src.guides).length > 0;
  const canPlan = source === 'other' && !!src?.dayPlan?.sets?.length;
  const willWrite = counts.create + counts.replace + counts.into > 0 || (canGuides && includeGuides) || (canPlan && includePlan);

  const apply = () => {
    if (!src) return;
    let selectId: string | undefined;
    let created = 0;
    let replaced = 0;
    let guideCount = 0;
    let planned = false;
    update((w0) => {
      let w = w0;
      if (scope === 'one') {
        const a = items[0]?.table;
        if (a && current) {
          const target = w.cur.tables[current.id] ? current.id : current;
          const r = W.editTableWithId(w, target, (t) => {
            t.layout = a.layout;
            t.blocks = a.blocks;
            t.subjects = a.subjects;
            t.extraColumns = a.extraColumns;
            t.note = a.note;
          });
          w = r.ws;
          selectId = r.id;
          replaced = 1;
        }
      } else {
        const tables = items.filter((i) => i.table && i.status !== 'excluded').map((i) => i.table!);
        const r = W.importTables(w, tables, mode);
        w = r.ws;
        created = r.created;
        replaced = r.replaced;
      }
      if (canGuides && includeGuides) {
        const r = W.importGuides(w, src.guides, 'missing');
        w = r.ws;
        guideCount = r.count;
      }
      if (canPlan && includePlan && src.dayPlan) {
        w = W.importDayPlan(w, W.shiftDayPlan(src.dayPlan, dayShift, period));
        planned = true;
      }
      return w;
    });
    const parts = [
      created + replaced ? `표 ${created + replaced}장을 가져왔습니다` : '',
      guideCount ? `칸 설명 ${guideCount}칸` : '',
      planned ? '일정표' : '',
    ].filter(Boolean);
    toast.success(`${parts.join(' · ') || '가져올 것이 없었습니다'} — 저장을 눌러야 반영됩니다`, { duration: 4000 });
    onDone({ selectId });
  };

  return (
    <Modal
      title="가져오기"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="mr-auto text-[11px] text-gray-500">가져온 뒤에도 저장 전까지는 되돌리기로 취소할 수 있습니다.</span>
          <button type="button" onClick={onClose} className={btnCls}>
            취소
          </button>
          <button type="button" onClick={apply} disabled={!willWrite} className={btnPrimaryCls}>
            가져오기
          </button>
        </>
      }
    >
      <div className="space-y-4 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <FieldLabel>출처</FieldLabel>
            <Segmented
              value={source}
              onChange={(v) => {
                setSource(v);
                if (v === 'this' && scope === 'camp') setScope(category ? 'one' : 'group');
              }}
              options={[
                { value: 'other', label: '다른 캠프 (지난 기수)' },
                { value: 'this', label: `이 캠프 (${campCode})` },
              ]}
            />
          </div>
          {source === 'other' && (
            <label className="block min-w-[220px] flex-1">
              <FieldLabel>캠프</FieldLabel>
              <select value={otherId} onChange={(e) => void pickOther(e.target.value)} className={inputCls}>
                <option value="">캠프 고르기…</option>
                {camps.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.code} · {j.name}
                    {j.startDate?.toDate ? ` (${localYmd(j.startDate.toDate())})` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {source === 'other' && loading && <p className="text-gray-500">불러오는 중…</p>}
        {source === 'other' && !otherId && <p className="text-gray-500">표를 가져올 캠프를 고르세요.</p>}

        {src && (
          <>
            <div>
              <FieldLabel>범위</FieldLabel>
              <Segmented
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'one', label: '지금 표 하나', disabled: !category || !current, title: !category ? 'Day 탭에서 쓸 수 있습니다' : undefined },
                  { value: 'group', label: `이 그룹(${group ?? '-'}) 모든 Day`, disabled: !group },
                  { value: 'camp', label: '캠프 전체', disabled: source === 'this', title: source === 'this' ? '다른 캠프에서 가져올 때 씁니다' : undefined },
                ]}
              />
            </div>

            {scope !== 'camp' && (
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="block">
                  <FieldLabel>출처 그룹</FieldLabel>
                  <select value={srcGroup} onChange={(e) => setSrcGroupPick(e.target.value)} className={inputCls}>
                    {!groupChoices.length && <option value="">표가 있는 그룹이 없습니다</option>}
                    {groupChoices.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
                {scope === 'one' && (
                  <>
                    <label className="block">
                      <FieldLabel>출처 Day</FieldLabel>
                      <select value={srcCat} onChange={(e) => setSrcCatPick(e.target.value)} className={inputCls}>
                        {!srcCats.length && <option value="">같은 모양의 표가 없습니다</option>}
                        {srcCats.map((c) => (
                          <option key={c} value={c}>
                            {categoryLabelOf(c)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <FieldLabel>출처 표</FieldLabel>
                      <select value={srcTable?.id ?? ''} onChange={(e) => setSrcTablePick(e.target.value)} className={inputCls}>
                        {!srcTables.length && <option value="">표가 없습니다</option>}
                        {srcTables.map((t) => (
                          <option key={t.id} value={t.id}>
                            {chipOf(t)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
              </div>
            )}

            {scope === 'camp' && (
              <div>
                <FieldLabel>그룹 짝 (받는 그룹 ← 출처 그룹)</FieldLabel>
                <div className="grid gap-1 sm:grid-cols-2">
                  {groups.map((g) => (
                    <div key={g} className="flex items-center gap-2">
                      <span className="w-20 shrink-0 truncate font-medium text-gray-700">{g}</span>
                      <span className="text-gray-400">←</span>
                      <select value={groupMap[g] ?? ''} onChange={(e) => setMapPick((m) => ({ ...m, [g]: e.target.value }))} className={inputCls}>
                        <option value="">(가져오지 않음)</option>
                        {srcGroups.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1.5 rounded-md bg-gray-50 p-2.5">
              {scope !== 'one' && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={includeCustom} onChange={(e) => setIncludeCustom(e.target.checked)} />
                  커스텀 표(날짜별 표)도 가져오기
                  {source === 'other' && <span className="text-gray-500">— 날짜는 두 캠프 시작일 차이({dayShift >= 0 ? '+' : ''}{dayShift}일)만큼 옮기고 기간 밖은 뺍니다</span>}
                </label>
              )}
              {canGuides && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={includeGuides} onChange={(e) => setIncludeGuides(e.target.checked)} />
                  칸 설명도 가져오기 <span className="text-gray-500">(이 캠프에 없는 칸만)</span>
                </label>
              )}
              {canPlan && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={includePlan} onChange={(e) => setIncludePlan(e.target.checked)} />
                  일정표도 가져오기 <span className="text-gray-500">(날짜 {dayShift >= 0 ? '+' : ''}{dayShift}일 이동 — 지금 일정표를 바꿉니다)</span>
                </label>
              )}
              {scope !== 'one' && (
                <div className="flex items-center gap-2 pt-0.5">
                  <span>이미 있는 표</span>
                  <Segmented
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: 'skip', label: '건너뛰기' },
                      { value: 'replace', label: '바꾸기' },
                    ]}
                  />
                </div>
              )}
              {scope === 'one' && <p className="text-gray-500">줄·과목·전담 열·메모를 지금 표에 덮어씁니다. 반은 지금 그룹의 반 순서대로 맞춥니다.</p>}
            </div>

            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <FieldLabel>미리보기</FieldLabel>
                {(Object.keys(counts) as Status[])
                  .filter((k) => counts[k])
                  .map((k) => (
                    <span key={k} className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLS[k]}`}>
                      {STATUS_LABEL[k]} {counts[k]}
                    </span>
                  ))}
              </div>
              <ul className="max-h-56 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
                {!items.length && <li className="px-3 py-4 text-center text-gray-400">가져올 표가 없습니다.</li>}
                {items.map((i) => (
                  <li key={i.key} className="flex items-center gap-2 px-2.5 py-1.5">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_CLS[i.status]}`}>{STATUS_LABEL[i.status]}</span>
                    <span className={`min-w-0 truncate ${i.status === 'skip' || i.status === 'excluded' ? 'text-gray-400' : 'text-gray-800'}`}>{i.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
