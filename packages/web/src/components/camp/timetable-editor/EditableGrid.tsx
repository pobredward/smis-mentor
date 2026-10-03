'use client';

/**
 * 편집 표 — 보기 화면(TimetableView)과 같은 모양으로 그리되 칸·줄 머리를 누를 수 있다.
 * 순수 표시용: 데이터는 props 로만 받고, 고치는 일은 전부 콜백으로 부모에게 맡긴다.
 * (헤더: 시간 | 반 열(반코드·반이름·담임) | 전담 열 — 공통 줄은 합치지 않고 한 줄씩)
 */
import { useMemo, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import {
  DEFAULT_SUBJECTS,
  classNameLabel,
  columnLabelLines,
  dateLabelFor,
  dutyByBlock,
  findSubject,
  isJoinedPair,
  isMergedColumn,
  lineCountOf,
  makeNameResolvers,
  mergedColumnName,
  renderCell,
  sortBlocks,
  type CampTimetable,
  type RenderedLine,
  type TimetableExtraColumn,
} from '@smis-mentor/shared';
import { rectOf, unionRect, type AnchorRect } from './ui';

export interface GridCellRef {
  blockId: string;
  colKey: string;
}

export const cellKeyOf = (r: GridCellRef) => `${r.blockId}::${r.colKey}`;

export interface GridCellClick {
  /** Shift — 사각형 범위 */
  shift: boolean;
  /** Ctrl/Cmd — 하나씩 더하기/빼기 */
  toggle: boolean;
  /** 칸 전체(여러 줄)를 감싸는 화면 위치 — 팝오버 기준 */
  anchor: AnchorRect;
  /** 과목으로 채울 수 있는 칸인지 (반별 줄의 반 칸·일반 전담 칸). 당번 칸·공통 줄 칸은 false */
  fillable: boolean;
}

export interface EditableGridProps {
  /** 그릴 표 — 공통 값(반·이름)과 반 정보(반이름·강의실)를 이미 입힌 모양 */
  table: CampTimetable;
  /** 반번호 → 담임 이름 (앱 배정) */
  teacherByClassCode: Record<string, string>;
  /** 역할(소문자) → 이 그룹 담당자 이름 (원어민 Speaking/Reading/Writing, '수업' 멘토 …) */
  staffByRole: Record<string, string>;
  /** 캠프 시작일 — 날짜 표(인문학)의 n일차를 실제 날짜로 */
  campStart?: Date | null;
  /** 여러 칸 선택 */
  selection?: GridCellRef[];
  /** 팝오버가 열린 칸 */
  activeCell?: GridCellRef | null;
  /** 팝오버가 열린 줄 */
  activeRowId?: string | null;
  /** 강조할 열 (반·이름 패널에서 고르는 중인 반) */
  focusColumn?: string | null;
  onCellClick?: (ref: GridCellRef, ev: GridCellClick) => void;
  onRowClick?: (blockId: string, anchor: AnchorRect) => void;
  /** 줄 사이 '+' */
  onInsertClick?: (blockId: string, where: 'before' | 'after', anchor: AnchorRect) => void;
  onClassHeadClick?: (classCode: string) => void;
  onExtraHeadClick?: (key: string) => void;
}

const CELL_MIN_H = 'min-h-[1.9rem]';
const CELL_MIN_H_DATE = 'min-h-[1.3rem]';
const MANUAL = 'underline decoration-dotted decoration-gray-400 underline-offset-2';
const ACTIVE = '#2563eb';
const SELECTED = '#60a5fa';

function pairClass(n: number, i: number): string {
  if (n < 2) return 'py-0.5 justify-center';
  return i === 0 ? 'pt-0.5 pb-0 justify-end' : 'pt-0 pb-0.5 justify-start';
}

/** 칸 테두리·채움 — 여러 줄(tr)로 나뉜 칸도 한 덩어리로 보이게 줄마다 변만 그린다 */
function cellShadow(selected: boolean, active: boolean, hover: boolean, i: number, n: number): string | undefined {
  const parts: string[] = [];
  if (selected || active) {
    const c = active ? ACTIVE : SELECTED;
    parts.push(`inset 2px 0 0 ${c}`, `inset -2px 0 0 ${c}`);
    if (i === 0) parts.push(`inset 0 2px 0 ${c}`);
    if (i === n - 1) parts.push(`inset 0 -2px 0 ${c}`);
  }
  if (selected && !active) parts.push('inset 0 0 0 999px rgba(37,99,235,0.10)');
  else if (hover) parts.push('inset 0 0 0 999px rgba(37,99,235,0.06)');
  return parts.length ? parts.join(', ') : undefined;
}

function CellLines({ line }: { line?: RenderedLine }) {
  if (!line?.text) return <span className="text-gray-300">—</span>;
  const nameClass = line.muted ? 'text-slate-400' : 'text-slate-500';
  return (
    <>
      {line.room && <span className="block text-[10px] leading-none text-gray-400">{line.room}</span>}
      <span className={`${line.isName ? nameClass : line.muted ? 'text-gray-400' : 'text-gray-900'} ${line.manual ? MANUAL : ''}`}>
        {line.text}
        {line.sub && <span className={`ml-0.5 text-[10px] text-slate-500 ${line.subManual ? MANUAL : ''}`}>({line.sub})</span>}
      </span>
    </>
  );
}

interface Column {
  key: string;
  label: string;
  name: string;
  sub: string;
  subManual: boolean;
  meta: string;
  extra?: TimetableExtraColumn;
  merged: boolean;
}

export default function EditableGrid({
  table,
  teacherByClassCode,
  staffByRole,
  campStart = null,
  selection,
  activeCell,
  activeRowId,
  focusColumn,
  onCellClick,
  onRowClick,
  onInsertClick,
  onClassHeadClick,
  onExtraHeadClick,
}: EditableGridProps) {
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<string | null>(null);

  const layout = table.layout ?? 'time';
  const isDate = layout === 'date';
  const blocks = useMemo(() => sortBlocks(table.blocks ?? [], layout), [table.blocks, layout]);
  const subjects = table.subjects?.length ? table.subjects : DEFAULT_SUBJECTS;

  const dutyMap = useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    (table.extraColumns ?? []).forEach((e) => {
      if (e.dutyRotation?.length) m[e.key] = dutyByBlock(table.blocks ?? [], layout, e.dutyRotation);
    });
    return m;
  }, [table.blocks, table.extraColumns, layout]);

  const { resolveForeign, resolveTeacher } = useMemo(
    () => makeNameResolvers(table, teacherByClassCode, staffByRole),
    [table, teacherByClassCode, staffByRole]
  );
  const ctxFor = (columnKey: string) => ({ subjects, columnKey, resolveForeign, resolveTeacher, patternLabel: 'Pattern' });

  const columns: Column[] = useMemo(
    () => [
      ...table.classes.map((c) => {
        const t = resolveTeacher(c.classCode);
        return {
          key: c.classCode,
          label: c.classCode,
          name: classNameLabel(c.className),
          sub: t?.name || '',
          subManual: !!t?.manual,
          meta: [c.classroom, c.grade].filter(Boolean).join(' · '),
          merged: false,
        };
      }),
      ...(table.extraColumns ?? []).map((e) => ({
        key: e.key,
        label: e.label,
        name: '',
        sub: e.teacherRole ? resolveForeign(e.teacherRole)?.name || '' : e.teacherName || '',
        subManual: false,
        meta: '',
        extra: e,
        merged: isMergedColumn(e),
      })),
    ],
    [table.classes, table.extraColumns, resolveTeacher, resolveForeign]
  );

  const selected = useMemo(() => new Set((selection ?? []).map((r) => `${r.blockId}::${r.colKey}`)), [selection]);
  const activeKey = activeCell ? `${activeCell.blockId}::${activeCell.colKey}` : null;
  const bg = (subjectKey?: string, fallback?: string) => findSubject(subjects, subjectKey)?.color ?? fallback;
  const timeCols = isDate ? 1 : 2;
  const minWidth = (isDate ? 76 : 76) + columns.reduce((s, c) => s + (c.merged ? 68 : 84), 0);

  const esc = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/"/g, '\\"'));
  const anchorOf = (attr: 'data-cell' | 'data-row', key: string, from: Element): AnchorRect =>
    unionRect(from.closest('table')?.querySelectorAll(`[${attr}="${esc(key)}"]`) ?? []) ?? rectOf(from)!;

  const clickCell = (ref: { blockId: string; colKey: string }, fillable: boolean) => (e: ReactMouseEvent<HTMLElement>) => {
    if (!onCellClick) return;
    onCellClick(ref, {
      shift: e.shiftKey,
      toggle: e.metaKey || e.ctrlKey,
      anchor: anchorOf('data-cell', `${ref.blockId}::${ref.colKey}`, e.currentTarget),
      fillable,
    });
  };
  const clickRow = (blockId: string) => (e: ReactMouseEvent<HTMLElement>) => {
    if (!onRowClick) return;
    onRowClick(blockId, anchorOf('data-row', blockId, e.currentTarget));
  };
  /** Shift+클릭으로 글자가 긁히지 않게 */
  const noShiftSelect = (e: ReactMouseEvent) => {
    if (e.shiftKey) e.preventDefault();
  };

  const insertBtn = (blockId: string, where: 'before' | 'after', edge: 'inside' | 'between') =>
    onInsertClick && hoverRow === blockId ? (
      <button
        type="button"
        title={where === 'before' ? '위에 줄 넣기' : '아래에 줄 넣기'}
        onClick={(e) => {
          e.stopPropagation();
          onInsertClick(blockId, where, rectOf(e.currentTarget)!);
        }}
        className={`absolute left-1 z-30 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold leading-none text-white shadow ring-2 ring-white hover:bg-blue-700 ${
          where === 'before' ? 'top-0' : edge === 'between' ? 'bottom-0 translate-y-1/2' : 'bottom-0'
        }`}
      >
        +
      </button>
    ) : null;

  const rowHeadCls = (blockId: string) =>
    `cursor-pointer select-none ${activeRowId === blockId ? 'bg-blue-50 font-semibold text-blue-700' : 'bg-white text-gray-500 hover:bg-gray-100'}`;

  const lineTd = (
    key: string,
    content: ReactNode,
    opts: { cls: string; style?: CSSProperties; rowSpan?: number; colSpan?: number; onClick?: (e: ReactMouseEvent<HTMLElement>) => void; dataCell?: string; dataRow?: string; title?: string }
  ) => (
    <td
      key={key}
      rowSpan={opts.rowSpan}
      colSpan={opts.colSpan}
      data-cell={opts.dataCell}
      data-row={opts.dataRow}
      title={opts.title}
      onClick={opts.onClick}
      onMouseDown={noShiftSelect}
      onMouseEnter={opts.dataCell ? () => setHoverCell(opts.dataCell!) : undefined}
      onMouseLeave={opts.dataCell ? () => setHoverCell((h) => (h === opts.dataCell ? null : h)) : undefined}
      className={opts.cls}
      style={opts.style}
    >
      {content}
    </td>
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full table-fixed border-collapse bg-white text-[11px] leading-tight" style={{ minWidth }}>
        <colgroup>
          {isDate ? (
            <col className="w-[76px]" />
          ) : (
            <>
              <col className="w-[38px]" />
              <col className="w-[38px]" />
            </>
          )}
          {columns.map((c) => (
            <col key={c.key} className={c.merged ? 'w-[68px]' : undefined} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-20">
          <tr>
            <th
              colSpan={timeCols}
              className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 px-1 py-1 text-[10px] font-medium text-gray-500"
            >
              {isDate ? '날짜' : '시간'}
            </th>
            {columns.map((col) => {
              const focus = focusColumn === col.key;
              const click = col.extra ? onExtraHeadClick && (() => onExtraHeadClick(col.key)) : onClassHeadClick && (() => onClassHeadClick(col.key));
              return (
                <th
                  key={col.key}
                  onClick={click || undefined}
                  title={col.extra ? '전담 열 설정 (표 설정)' : '반·이름 (이 그룹 모든 Day)'}
                  className={`border-x border-b border-gray-200 border-b-gray-300 px-1 py-1 text-center ${
                    click ? 'cursor-pointer hover:bg-blue-50' : ''
                  } ${focus ? 'bg-blue-50 ring-2 ring-inset ring-blue-400' : 'bg-gray-50'}`}
                >
                  <div className="text-xs font-semibold leading-tight text-gray-900">
                    {columnLabelLines(col.label || '(이름 없음)').map((t, li) => (
                      <div key={li} className="truncate">
                        {t}
                      </div>
                    ))}
                  </div>
                  {col.name && <div className="truncate text-[11px] text-gray-700">{col.name}</div>}
                  {col.sub && <div className={`mt-0.5 truncate text-[11px] text-gray-600 ${col.subManual ? MANUAL : ''}`}>{col.sub}</div>}
                  {col.meta && <div className="mt-0.5 truncate text-[10px] text-gray-400">{col.meta}</div>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody onMouseLeave={() => setHoverRow(null)}>
          {blocks.length === 0 && (
            <tr>
              <td colSpan={timeCols + columns.length} className="border-t border-gray-200 px-2 py-10 text-center text-xs text-gray-400">
                아직 줄이 없습니다
              </td>
            </tr>
          )}
          {blocks.flatMap((b, bi) => {
            const isLastBlock = bi === blocks.length - 1;
            const afterEdge = isLastBlock ? 'inside' : 'between';
            const lift = hoverRow === b.id ? 'z-[15]' : 'z-10';

            if (b.kind === 'shared') {
              return [
                <tr key={b.id} onMouseEnter={() => setHoverRow(b.id)}>
                  {isDate ? (
                    lineTd(
                      'date',
                      <>
                        {dateLabelFor(b, campStart) || <span className="text-gray-300">날짜?</span>}
                        {bi === 0 && insertBtn(b.id, 'before', 'inside')}
                        {insertBtn(b.id, 'after', afterEdge)}
                      </>,
                      {
                        dataRow: b.id,
                        onClick: clickRow(b.id),
                        title: '줄 편집',
                        cls: `sticky left-0 ${lift} border-b border-r border-gray-200 border-b-gray-300 px-1 py-0.5 text-center text-[10px] tabular-nums ${rowHeadCls(b.id)}`,
                      }
                    )
                  ) : (
                    <>
                      {lineTd(
                        'start',
                        <>
                          {b.times?.[0]?.start ?? ''}
                          {bi === 0 && insertBtn(b.id, 'before', 'inside')}
                          {insertBtn(b.id, 'after', afterEdge)}
                        </>,
                        {
                          dataRow: b.id,
                          onClick: clickRow(b.id),
                          title: '줄 편집',
                          cls: `sticky left-0 ${lift} border-x border-b border-gray-200 border-b-gray-300 px-0.5 py-0.5 text-center text-[10px] tabular-nums ${rowHeadCls(b.id)}`,
                        }
                      )}
                      {lineTd('end', b.times?.[(b.times?.length ?? 1) - 1]?.end ?? '', {
                        dataRow: b.id,
                        onClick: clickRow(b.id),
                        title: '줄 편집',
                        cls: `border-x border-b border-gray-200 border-b-gray-300 px-0.5 py-0.5 text-center text-[10px] tabular-nums ${rowHeadCls(b.id)}`,
                      })}
                    </>
                  )}
                  {lineTd(
                    'label',
                    <>
                      {b.label?.trim() ? b.label : <span className="font-normal italic text-gray-400">이름 없는 공통 줄</span>}
                      {b.label?.includes('인문학') && <span className="ml-1 text-[10px] font-normal text-blue-600">↓ 인문학 표</span>}
                      {b.subLabel && <span className="ml-1 text-[10px] font-normal text-gray-500">{b.subLabel}</span>}
                    </>,
                    {
                      dataRow: b.id,
                      colSpan: Math.max(table.classes.length, 1),
                      onClick: clickRow(b.id),
                      title: '줄 편집',
                      cls: `cursor-pointer border-x border-b border-gray-200 border-b-gray-300 px-1 py-0.5 text-center text-[11px] font-medium text-gray-700 hover:brightness-95 ${
                        activeRowId === b.id ? 'ring-2 ring-inset ring-blue-500' : ''
                      }`,
                      style: { backgroundColor: b.color ?? '#f3f4f6' },
                    }
                  )}
                  {(table.extraColumns ?? []).map((e) => {
                    const ck = `${b.id}::${e.key}`;
                    return lineTd(`x:${e.key}`, b.cells?.[e.key]?.texts?.[0] || '', {
                      dataCell: ck,
                      onClick: clickCell({ blockId: b.id, colKey: e.key }, false),
                      title: `${e.label} — 이 줄에 넣을 글`,
                      cls: 'cursor-pointer border-x border-b border-gray-200 border-b-gray-300 px-1 py-0.5 text-center text-[11px] text-gray-700',
                      style: { boxShadow: cellShadow(selected.has(ck), activeKey === ck, hoverCell === ck, 0, 1) },
                    });
                  })}
                </tr>,
              ];
            }

            const n = lineCountOf(b, layout);
            return Array.from({ length: n }, (_, i) => {
              const isLast = i === n - 1;
              return (
                <tr key={`${b.id}-${i}`} onMouseEnter={() => setHoverRow(b.id)}>
                  {isDate ? (
                    i === 0 ? (
                      lineTd(
                        'date',
                        <>
                          {dateLabelFor(b, campStart) || <span className="text-gray-300">날짜?</span>}
                          {bi === 0 && insertBtn(b.id, 'before', 'inside')}
                          {insertBtn(b.id, 'after', afterEdge)}
                        </>,
                        {
                          dataRow: b.id,
                          rowSpan: n,
                          onClick: clickRow(b.id),
                          title: '줄 편집',
                          cls: `sticky left-0 ${lift} border-b border-r border-gray-200 border-b-gray-300 px-1 py-0.5 text-center text-[10px] ${rowHeadCls(b.id)}`,
                        }
                      )
                    ) : null
                  ) : (
                    <>
                      {lineTd(
                        'start',
                        <>
                          {b.times?.[i]?.start ?? ''}
                          {i === 0 && bi === 0 && insertBtn(b.id, 'before', 'inside')}
                          {isLast && insertBtn(b.id, 'after', afterEdge)}
                        </>,
                        {
                          dataRow: b.id,
                          onClick: clickRow(b.id),
                          title: '줄 편집',
                          cls: `sticky left-0 ${lift} border-x border-gray-200 px-0.5 py-0.5 text-center text-[10px] tabular-nums ${rowHeadCls(b.id)} ${
                            isLast ? 'border-b border-b-gray-300' : 'border-b border-b-gray-100'
                          }`,
                        }
                      )}
                      {lineTd('end', b.times?.[i]?.end ?? '', {
                        dataRow: b.id,
                        onClick: clickRow(b.id),
                        title: '줄 편집',
                        cls: `border-x border-gray-200 px-0.5 py-0.5 text-center text-[10px] tabular-nums ${rowHeadCls(b.id)} ${
                          isLast ? 'border-b border-b-gray-300' : 'border-b border-b-gray-100'
                        }`,
                      })}
                    </>
                  )}
                  {columns.map((col) => {
                    const ck = `${b.id}::${col.key}`;
                    const isSel = selected.has(ck);
                    const isAct = activeKey === ck;
                    const isHov = hoverCell === ck;
                    if (col.extra && col.merged) {
                      if (i > 0) return null;
                      const merged = mergedColumnName(col.extra, b, dutyMap, resolveTeacher, resolveForeign);
                      return lineTd(
                        `c:${col.key}`,
                        merged ? (
                          <span className={`${merged.muted ? 'text-gray-400' : ''} ${merged.manual ? MANUAL : ''}`}>{merged.text}</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        ),
                        {
                          dataCell: ck,
                          rowSpan: n,
                          onClick: clickCell({ blockId: b.id, colKey: col.key }, false),
                          title: `${col.label} — 이 줄만 다른 사람`,
                          cls: 'cursor-pointer border-x border-b border-gray-200 border-b-gray-300 px-1 py-0.5 text-center align-middle text-gray-900',
                          style: { boxShadow: cellShadow(isSel, isAct, isHov, 0, 1) },
                        }
                      );
                    }
                    const cell = b.cells?.[col.key];
                    const parts = renderCell(cell, n, ctxFor(col.key));
                    const joined = isJoinedPair(subjects, cell?.subject);
                    const midRule = !isLast && !joined ? 'border-b border-b-gray-300/70' : '';
                    return lineTd(
                      `c:${col.key}`,
                      <div className={`flex ${isDate ? CELL_MIN_H_DATE : CELL_MIN_H} flex-col items-center ${joined ? pairClass(n, i) : 'py-0.5 justify-center'}`}>
                        <CellLines line={parts[i]} />
                        {isLast && cell?.note && <span className="truncate text-[10px] text-gray-500">{cell.note}</span>}
                      </div>,
                      {
                        dataCell: ck,
                        onClick: clickCell({ blockId: b.id, colKey: col.key }, true),
                        cls: `cursor-pointer border-x border-gray-200 px-1 text-center align-middle ${isDate ? 'py-0' : ''} ${
                          isLast ? 'border-b border-b-gray-300' : midRule
                        }`,
                        style: {
                          backgroundColor: bg(cell?.subject, b.color),
                          boxShadow: cellShadow(isSel, isAct, isHov, i, n),
                        },
                      }
                    );
                  })}
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}
