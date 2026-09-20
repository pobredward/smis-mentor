'use client';

import { useMemo, useState } from 'react';
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
  timeToMinutes,
  toRows,
  type CampTimetable,
  type RenderedLine,
} from '@smis-mentor/shared';

interface TimetableViewProps {
  timetable: CampTimetable;
  /** 반번호 → 담임 이름 */
  teacherByClassCode: Record<string, string>;
  /** 역할(소문자) → 이 그룹 담당자 이름. Speaking/Reading/Writing 원어민, '수업' 멘토 등 */
  foreignBySubject: Record<string, string>;
  myClassCode?: string;
  isForeign?: boolean;
  /** 캠프 기간 중일 때 현재 시각(분). 해당 줄을 강조한다 */
  nowMinutes?: number | null;
  /** 이 말이 들어간 공통 줄에는 "아래 표 참고" 표시를 붙인다 (인문학처럼 아래에 상세 표가 따라올 때) */
  linkedLabels?: string[];
  /** 캠프 시작일 — 날짜 표는 여기서 실제 날짜를 계산한다 (기수마다 날짜를 다시 넣지 않아도 되게) */
  campStart?: Date | null;
  /** 설명이 있는 칸 이름 (소문자 키). 이 칸만 눌러서 세부페이지로 간다 */
  guidedLabels?: Set<string>;
  onOpenGuide?: (label: string) => void;
}

/**
 * 한 칸 높이. 시간 표는 두 줄 분량으로 고정해 이름이 줄바꿈돼도 표가 흔들리지 않게 하고,
 * 날짜 표(인문학)는 한 줄에 글자 하나뿐이라 최소한으로 낮춘다.
 */
const CELL_MIN_H = 'min-h-[1.9rem]';
const CELL_MIN_H_DATE = 'min-h-[1.3rem]';

/**
 * 2교시 세트의 위·아래 칸은 한 덩어리로 보이게 한다.
 * 위 칸은 내용을 아래쪽에, 아래 칸은 위쪽에 붙여 둘을 가깝게 만들고
 * 사이에는 가로선을 넣지 않는다.
 */
function pairClass(n: number, i: number): string {
  if (n < 2) return 'py-0.5 justify-center';
  return i === 0 ? 'pt-0.5 pb-0 justify-end' : 'pt-0 pb-0.5 justify-start';
}

/** 직접 입력한 이름은 점선 밑줄로 — 앱과 연동된 값이 아님을 한눈에 */
const MANUAL = 'underline decoration-dotted decoration-gray-400 underline-offset-2';

function CellLines({ line }: { line?: RenderedLine }) {
  if (!line?.text) return <span className="text-gray-300">—</span>;
  const nameClass = line.muted ? 'text-slate-400' : 'text-slate-500';
  return (
    <>
      {/* 강의실 호수가 맨 위 — 이동 수업에서 제일 먼저 봐야 하는 값 */}
      {line.room && <span className="block text-[10px] leading-none text-gray-400">{line.room}</span>}
      <span
        title={line.manual ? '직접 입력한 이름 (앱 배정과 연동되지 않음)' : undefined}
        className={`${line.isName ? nameClass : line.muted ? 'text-gray-400' : 'text-gray-900'} ${
          line.manual ? MANUAL : ''
        }`}
      >
        {line.text}
        {/* 담당자는 줄을 늘리지 않게 괄호로 붙인다 — Math (김서연) */}
        {line.sub && (
          <span
            className={`ml-0.5 text-[10px] text-slate-500 ${line.subManual ? MANUAL : ''}`}
            title={line.subManual ? '직접 입력한 이름 (앱 배정과 연동되지 않음)' : undefined}
          >
            ({line.sub})
          </span>
        )}
      </span>
    </>
  );
}

export default function TimetableView({
  timetable,
  teacherByClassCode,
  foreignBySubject,
  myClassCode,
  isForeign = false,
  nowMinutes = null,
  linkedLabels,
  campStart = null,
  guidedLabels,
  onOpenGuide,
}: TimetableViewProps) {
  const hasMyClass = !!myClassCode && timetable.classes.some((c) => c.classCode === myClassCode);
  const [onlyMine, setOnlyMine] = useState(false);

  /**
   * 지금 마우스가 올라간 "묶음".
   * Speaking 처럼 2교시를 통째로 쓰는 수업은 위·아래 칸이 서로 다른 <tr> 에 있어서
   * CSS 만으로는 같이 반응시킬 수 없다. 그래서 묶음 id 를 상태로 들고 있는다.
   */
  const [hoverUnit, setHoverUnit] = useState<string | null>(null);

  const layout = timetable.layout ?? 'time';
  const blocks = useMemo(() => sortBlocks(timetable.blocks ?? [], layout), [timetable.blocks, layout]);
  // 이름이 같고 붙어 있는 공통 줄(P.E, 인문학 …)은 한 칸으로
  const rows = useMemo(() => toRows(timetable.blocks ?? [], layout), [timetable.blocks, layout]);
  const subjects = timetable.subjects?.length ? timetable.subjects : DEFAULT_SUBJECTS;
  // Pattern 수업 이름은 전담 열 이름과 무관하다
  const patternLabel = 'Pattern';

  const dutyColumns = (timetable.extraColumns ?? []).filter((e) => e.dutyRotation?.length);
  const dutyMap = useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    dutyColumns.forEach((e) => {
      m[e.key] = dutyByBlock(timetable.blocks ?? [], layout, e.dutyRotation);
    });
    return m;
  }, [timetable.blocks, timetable.extraColumns, layout]);

  const { resolveForeign, resolveTeacher } = useMemo(
    () => makeNameResolvers(timetable, teacherByClassCode, foreignBySubject),
    [timetable, teacherByClassCode, foreignBySubject]
  );
  const ctxFor = (columnKey: string) => ({
    subjects,
    columnKey,
    resolveForeign,
    resolveTeacher,
    patternLabel,
  });

  const columns = useMemo(
    () => [
      // 반코드 → 반이름 → 담임 → 강의실 순
      ...timetable.classes.map((c) => {
        const t = resolveTeacher(c.classCode);
        return {
          key: c.classCode,
          label: c.classCode,
          name: classNameLabel(c.className),
          sub: t?.name || '',
          subManual: !!t?.manual,
          meta: [c.classroom, c.grade].filter(Boolean).join(' · '),
          isMine: c.classCode === myClassCode,
          isDuty: false,
          extra: undefined,
        };
      }),
      ...(timetable.extraColumns ?? []).map((e) => ({
        key: e.key,
        label: e.label,
        name: '',
        sub: e.teacherRole ? resolveForeign(e.teacherRole)?.name || '' : e.teacherName || '',
        subManual: false,
        meta: '',
        isMine: false,
        isDuty: isMergedColumn(e),
        extra: e,
      })),
    ],
    [timetable.classes, timetable.extraColumns, resolveTeacher, resolveForeign, myClassCode]
  );

  const bg = (subjectKey?: string, fallback?: string) =>
    findSubject(subjects, subjectKey)?.color ?? fallback;

  // 지금 진행 중인 줄 (캠프 기간 중에만)
  const nowBlockId =
    nowMinutes == null || layout !== 'time'
      ? null
      : (blocks.find((b) => {
          const first = b.times?.[0];
          const last = b.times?.[(b.times?.length ?? 1) - 1];
          if (!first || !last) return false;
          return timeToMinutes(first.start) <= nowMinutes && nowMinutes < timeToMinutes(last.end);
        })?.id ?? null);

  // ── 내 반만 보기 ──────────────────────────────────────────────────
  if (onlyMine && hasMyClass && myClassCode) {
    const mine = timetable.classes.find((c) => c.classCode === myClassCode);
    return (
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium text-gray-900">
            {myClassCode}
            {mine?.className && (
              <span className="ml-2 text-gray-600">{classNameLabel(mine.className)}</span>
            )}
            {resolveTeacher(myClassCode) && (
              <span className="ml-2 text-gray-500">{resolveTeacher(myClassCode)!.name}</span>
            )}
          </div>
          <button
            onClick={() => setOnlyMine(false)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            {isForeign ? 'Show all' : '전체 보기'}
          </button>
        </div>
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 bg-white">
          {blocks.map((b) => {
            const n = lineCountOf(b, layout);
            const head =
              layout === 'date'
                ? dateLabelFor(b, campStart)
                : `${b.times?.[0]?.start}–${b.times?.[n - 1]?.end}`;
            if (b.kind === 'shared') {
              return (
                <li
                  key={b.id}
                  onClick={
                    b.label && onOpenGuide && guidedLabels?.has(b.label.trim().toLowerCase())
                      ? () => onOpenGuide(b.label as string)
                      : undefined
                  }
                  className={`flex items-center gap-3 bg-gray-50 px-4 py-2.5 ${
                    b.label && onOpenGuide && guidedLabels?.has(b.label.trim().toLowerCase())
                      ? 'cursor-pointer hover:bg-blue-50'
                      : ''
                  }`}
                >
                  <span className="w-24 shrink-0 text-xs tabular-nums text-gray-500">{head}</span>
                  <span className="flex-1 text-sm font-medium text-gray-700">{b.label}</span>
                </li>
              );
            }
            const cell = b.cells?.[myClassCode];
            const parts = renderCell(cell, n, ctxFor(myClassCode));
            return (
              <li
                key={b.id}
                className="flex items-center gap-3 px-4 py-2.5"
                style={{ backgroundColor: bg(cell?.subject) }}
              >
                <span className="w-24 shrink-0 text-xs tabular-nums text-gray-500">{head}</span>
                <span className="flex-1 text-sm">
                  {parts.map((p, i) => (
                    <span key={i} className={i > 0 ? 'ml-2 text-xs text-gray-600' : 'text-gray-900'}>
                      {p.text}
                      {p.sub && <span className="ml-1 text-[11px] text-gray-500">{p.sub}</span>}
                    </span>
                  ))}
                  {!parts.some((p) => p.text) && <span className="text-gray-300">—</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // ── 전체 격자 ─────────────────────────────────────────────────────
  return (
    <div>
      {hasMyClass && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={() => setOnlyMine(true)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            {isForeign ? 'My class only' : '내 반만 보기'}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full table-fixed border-collapse bg-white text-[11px] leading-tight">
          <colgroup>
            {layout === 'date' ? (
              <col className="w-[76px]" />
            ) : (
              <>
                <col className="w-[38px]" />
                <col className="w-[38px]" />
              </>
            )}
            {columns.map((c) => (
              // 당번 열은 이름 하나 들어갈 만큼만
              <col key={c.key} className={c.isDuty ? 'w-[68px]' : undefined} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr>
              <th
                colSpan={layout === 'date' ? 1 : 2}
                className="sticky left-0 z-10 border-b border-r border-gray-200 bg-gray-50 px-1 py-1 text-[10px] font-medium text-gray-500"
              >
                {layout === 'date' ? '날짜' : isForeign ? 'Time' : '시간'}
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`border-x border-b border-gray-200 border-b-gray-300 px-1 py-1 text-center ${
                    col.isMine ? 'bg-blue-50' : 'bg-gray-50'
                  }`}
                >
                  <div className="text-xs font-semibold leading-tight text-gray-900">
                    {columnLabelLines(col.label).map((t, li) => (
                      <div key={li} className="truncate">
                        {t}
                      </div>
                    ))}
                  </div>
                  {col.name && <div className="truncate text-[11px] text-gray-700">{col.name}</div>}
                  {col.sub && (
                    <div
                      className={`mt-0.5 truncate text-[11px] text-gray-600 ${col.subManual ? MANUAL : ''}`}
                      title={col.subManual ? '직접 입력한 이름 (앱 배정과 연동되지 않음)' : undefined}
                    >
                      {col.sub}
                    </div>
                  )}
                  {col.meta && <div className="mt-0.5 truncate text-[10px] text-gray-400">{col.meta}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={(layout === 'date' ? 1 : 2) + columns.length}
                  className="border-t border-gray-200 px-2 py-10 text-center text-xs text-gray-400"
                >
                  {isForeign ? 'No periods yet.' : '아직 교시가 없습니다. 편집에서 추가하세요.'}
                </td>
              </tr>
            )}
            {rows.flatMap((row) => {
              if (row.kind === 'shared') {
                const first = row.blocks[0];
                const isNow = row.blocks.some((x) => x.id === nowBlockId);
                return [
                  <tr key={first.id}>
                    {layout === 'date' ? (
                      <td className="sticky left-0 z-10 border-b border-r border-gray-200 bg-white px-1 py-0.5 text-center text-[10px] tabular-nums text-gray-500">
                        {row.blocks.map((b) => dateLabelFor(b, campStart)).filter(Boolean).join(', ')}
                      </td>
                    ) : (
                      // 공통 줄도 수업 줄과 같이 시작·종료를 나눠서 — 시간 열이 어긋나 보이지 않게
                      <>
                        <td
                          className={`sticky left-0 z-10 border-x border-b border-gray-200 border-b-gray-300 px-0.5 py-0.5 text-center text-[10px] tabular-nums ${
                            isNow ? 'bg-blue-50 font-semibold text-blue-700' : 'bg-white text-gray-500'
                          }`}
                        >
                          {row.start ?? ''}
                          {isNow && (
                            <span
                              className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 align-middle"
                              title="지금 진행 중"
                            />
                          )}
                        </td>
                        <td
                          className={`border-x border-b border-gray-200 border-b-gray-300 px-0.5 py-0.5 text-center text-[10px] tabular-nums ${
                            isNow ? 'bg-blue-50 font-semibold text-blue-700' : 'bg-white text-gray-500'
                          }`}
                        >
                          {row.end ?? ''}
                        </td>
                      </>
                    )}
                    {(() => {
                      const guided = !!guidedLabels?.has((row.label ?? '').trim().toLowerCase());
                      const openable = guided && !!onOpenGuide && !!row.label;
                      return (
                    <td
                      colSpan={timetable.classes.length}
                      onClick={openable ? () => onOpenGuide!(row.label) : undefined}
                      role={openable ? 'button' : undefined}
                      title={openable ? '눌러서 설명 보기' : undefined}
                      onMouseEnter={openable ? () => setHoverUnit(`shared:${first.id}`) : undefined}
                      onMouseLeave={openable ? () => setHoverUnit(null) : undefined}
                      className={`border-x border-b border-gray-200 border-b-gray-300 px-1 py-0.5 text-center text-[11px] font-medium text-gray-700 ${
                        openable ? 'cursor-pointer' : ''
                      } ${openable && hoverUnit === `shared:${first.id}` ? 'bg-blue-50/60' : ''}`}
                      style={{
                        backgroundColor:
                          openable && hoverUnit === `shared:${first.id}`
                            ? undefined
                            : first.color ?? '#f3f4f6',
                      }}
                    >
                      {row.label}
                      {linkedLabels?.some((k) => row.label.includes(k)) && (
                        <span className="ml-1 text-[10px] font-normal text-blue-600">아래 표 ↓</span>
                      )}
                      {row.subLabel && (
                        <span className="ml-1 text-[10px] font-normal text-gray-500">{row.subLabel}</span>
                      )}
                    </td>
                      );
                    })()}
                    {(timetable.extraColumns ?? []).map((e) => (
                      <td
                        key={e.key}
                        className="border-x border-b border-gray-200 border-b-gray-300 px-1 py-0.5 text-center text-[11px] text-gray-700"
                      >
                        {first.cells?.[e.key]?.texts?.[0] || ''}
                      </td>
                    ))}
                  </tr>,
                ];
              }

              const b = row.block;
              const n = lineCountOf(b, layout);

              return Array.from({ length: n }, (_, i) => (
                <tr key={`${b.id}-${i}`}>
                  {layout === 'date' ? (
                    i === 0 ? (
                      <td
                        rowSpan={n}
                        className="sticky left-0 z-10 border-b border-r border-gray-200 bg-white px-1 py-0.5 text-center text-[10px] text-gray-600"
                      >
                        {dateLabelFor(b, campStart)}
                      </td>
                    ) : null
                  ) : (
                    <>
                      <td
                        className={`sticky left-0 z-10 border-x border-r-gray-200 border-gray-200 px-0.5 py-0.5 text-center text-[10px] tabular-nums ${
                          nowBlockId === b.id ? 'bg-blue-50 font-semibold text-blue-700' : 'bg-white text-gray-500'
                        } ${
                          i === n - 1 ? 'border-b border-b-gray-300' : 'border-b border-b-gray-100'
                        }`}
                      >
                        {b.times?.[i]?.start ?? ''}
                        {nowBlockId === b.id && i === 0 && (
                          <span
                            className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 align-middle"
                            title="지금 진행 중"
                          />
                        )}
                      </td>
                      <td
                        className={`border-x border-gray-200 px-0.5 py-0.5 text-center text-[10px] tabular-nums ${
                          nowBlockId === b.id ? 'bg-blue-50 font-semibold text-blue-700' : 'bg-white text-gray-500'
                        } ${
                          i === n - 1 ? 'border-b border-b-gray-300' : 'border-b border-b-gray-100'
                        }`}
                      >
                        {b.times?.[i]?.end ?? ''}
                      </td>
                    </>
                  )}
                  {columns.map((col) => {
                    // 전담 열(교무실조 등)은 줄을 합쳐 한 이름만 (— 가 생기지 않게)
                    const merged = col.extra && mergedColumnName(col.extra, b, dutyMap, resolveTeacher, resolveForeign);
                    if (merged) {
                      if (i > 0) return null;
                      return (
                        <td
                          key={col.key}
                          rowSpan={n}
                          className="border-x border-b border-gray-200 border-b-gray-300 px-1 py-0.5 text-center align-middle text-gray-900"
                        >
                          <span
                            className={`${merged.muted ? 'text-gray-400' : ''} ${merged.manual ? MANUAL : ''}`}
                            title={merged.manual ? '직접 입력한 이름 (앱 배정과 연동되지 않음)' : undefined}
                          >
                            {merged.text}
                          </span>
                        </td>
                      );
                    }

                    const cell = b.cells?.[col.key];
                    const parts = renderCell(cell, n, ctxFor(col.key));
                    const isLast = i === n - 1;
                    // 같은 수업이 이어지면 가운데 선 없음, 다른 수업이면 얇은 선
                    const joined = isJoinedPair(subjects, cell?.subject);
                    const midRule = !isLast && !joined ? 'border-b border-b-gray-300/70' : '';
                    // 칸 전체가 클릭 대상. Speaking 처럼 2교시를 통째로 쓰는 수업은
                    // 위·아래를 한 묶음으로 보고 같이 반응시킨다 (Math+Pattern 은 따로).
                    const unit = joined && n > 1 ? 0 : i;
                    const unitId = `${b.id}:${col.key}:${unit}`;
                    const guideLine = parts[unit];
                    const openable =
                      !!guideLine?.text &&
                      !guideLine.isName &&
                      !!onOpenGuide &&
                      !!guidedLabels?.has(guideLine.text.trim().toLowerCase());
                    const hot = openable && hoverUnit === unitId;
                    return (
                      <td
                        key={col.key}
                        onClick={openable ? () => onOpenGuide!(guideLine!.text) : undefined}
                        onMouseEnter={openable ? () => setHoverUnit(unitId) : undefined}
                        onMouseLeave={openable ? () => setHoverUnit(null) : undefined}
                        role={openable ? 'button' : undefined}
                        title={openable ? '눌러서 설명 보기' : undefined}
                        className={`border-x border-gray-200 px-1 text-center align-middle ${
                          layout === 'date' ? 'py-0' : ''
                        } ${
                          isLast ? 'border-b border-b-gray-300' : midRule
                        } ${col.isMine ? 'ring-1 ring-inset ring-blue-200' : ''} ${
                          openable ? 'cursor-pointer' : ''
                        } ${hot ? 'bg-blue-50/60' : ''}`}
                        style={{ backgroundColor: hot ? undefined : bg(cell?.subject, b.color) }}
                      >
                        <div
                          className={`flex ${layout === 'date' ? CELL_MIN_H_DATE : CELL_MIN_H} flex-col items-center ${
                            joined ? pairClass(n, i) : 'py-0.5 justify-center'
                          }`}
                        >
                          <CellLines line={parts[i]} />
                          {isLast && cell?.note && (
                            <span className="truncate text-[10px] text-gray-500">{cell.note}</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      {timetable.note && (
        <p className="mt-3 whitespace-pre-wrap text-xs text-gray-500">{timetable.note}</p>
      )}
    </div>
  );
}
