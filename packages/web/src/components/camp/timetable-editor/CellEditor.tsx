'use client';

/**
 * 칸 팝오버 — 칸 하나를 고친다.
 *  - 반 칸: 과목 칩 / 직접 쓰기 · ⇅ 위·아래 · 강의실 · 짝 강의실 · 짝 원어민 역할 · 메모 · 줄·열 채우기
 *  - 당번·고정 전담 칸, 공통 줄의 전담 칸: 이 줄만 다른 사람(글) 한 줄
 */
import { useState } from 'react';
import {
  dutyByBlock,
  findSubject,
  isMergedColumn,
  lineCountOf,
  mergedColumnName,
  renderCell,
  timetableDraft as D,
  type CampTimetable,
  type RenderContext,
} from '@smis-mentor/shared';
import { FieldLabel, Segmented, btnCls, inputCls, linkBtnCls, subjectsOf, type TableEdit } from './ui';

const FOREIGN_ROLES = ['Speaking', 'Reading', 'Writing', 'Mix'];

export function blockTimeLabel(t: Pick<CampTimetable, 'layout'>, b: { times?: Array<{ start: string; end: string }>; dateLabel?: string }): string {
  if ((t.layout ?? 'time') === 'date') return b.dateLabel || '날짜 줄';
  const first = b.times?.[0];
  const last = b.times?.[(b.times?.length ?? 1) - 1];
  return first ? `${first.start}~${last?.end ?? ''}` : '';
}

export function CellEditor({
  table,
  blockId,
  colKey,
  noSubjects,
  resolvers,
  edit,
}: {
  /** 공통·반 정보를 입힌 표 (칸·과목은 원래 표와 같다) */
  table: CampTimetable;
  blockId: string;
  colKey: string;
  /** 입소·퇴소처럼 칸에 직접 글을 쓰는 Day */
  noSubjects: boolean;
  resolvers: Pick<RenderContext, 'resolveForeign' | 'resolveTeacher'>;
  edit: TableEdit;
}) {
  const block = table.blocks.find((b) => b.id === blockId);
  const cls = table.classes.find((c) => c.classCode === colKey);
  const extra = table.extraColumns?.find((e) => e.key === colKey);
  const cell = block?.cells?.[colKey];
  const layout = table.layout ?? 'time';
  const subjects = subjectsOf(table);
  const spec = findSubject(subjects, cell?.subject);
  const n = block ? lineCountOf(block, layout) : 1;
  const [mode, setMode] = useState<'subject' | 'text'>(cell?.texts?.length || (noSubjects && !cell?.subject) ? 'text' : 'subject');

  const lines = renderCell(cell, n, { subjects, columnKey: colKey, ...resolvers, patternLabel: 'Pattern' });

  if (!block) return <p className="text-gray-400">이 줄이 없습니다.</p>;

  const colLabel = cls ? `${cls.classCode}${cls.className ? ` · ${cls.className}` : ''}` : extra?.label || colKey;
  const head = (
    <div className="mb-2 flex items-baseline gap-2">
      <span className="text-sm font-semibold text-gray-900">{colLabel}</span>
      <span className="text-[11px] tabular-nums text-gray-500">{blockTimeLabel(table, block)}</span>
      <span className="ml-auto text-[10px] text-gray-400">이 표만</span>
    </div>
  );

  // ── 한 줄 글만 넣는 칸 (당번·고정 전담 열, 공통 줄의 전담 칸) ─────────
  const textOnly = block.kind === 'shared' || (!!extra && isMergedColumn(extra));
  if (textOnly) {
    const auto =
      extra && block.kind === 'class'
        ? mergedColumnName(
            extra,
            { id: block.id, cells: undefined },
            { [extra.key]: dutyByBlock(table.blocks, layout, extra.dutyRotation) },
            resolvers.resolveTeacher,
            resolvers.resolveForeign
          )
        : undefined;
    return (
      <div>
        {head}
        <FieldLabel>{block.kind === 'shared' ? '이 줄에 넣을 글' : '이 줄만 다른 사람 (비워 두면 순서·설정대로)'}</FieldLabel>
        <input
          autoFocus
          value={cell?.texts?.[0] ?? ''}
          onChange={(e) => edit((t) => D.setCellTexts(t, blockId, colKey, [e.target.value]), `texts:${blockId}:${colKey}`)}
          placeholder={auto?.text ? `자동: ${auto.text}` : '비어 있음'}
          className={inputCls}
        />
        {auto?.text && <p className="mt-1 text-[10px] text-gray-500">비워 두면 {auto.text}</p>}
      </div>
    );
  }

  const texts = Array.from({ length: n }, (_, i) => cell?.texts?.[i] ?? '');
  const hasPartner = !!spec && n >= 2 && spec.partner !== 'none' && spec.partner !== 'staff';
  const foreignRoles = [
    ...subjects.filter((s) => s.partner === 'foreign').map((s) => s.key),
    ...FOREIGN_ROLES,
  ].filter((r, i, a) => a.findIndex((x) => x.toLowerCase() === r.toLowerCase()) === i);

  return (
    <div className="space-y-3">
      {head}
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'subject', label: '과목' },
          { value: 'text', label: '직접 쓰기' },
        ]}
      />

      {mode === 'subject' ? (
        <div>
          <div className="flex flex-wrap gap-1">
            {subjects.map((s) => {
              const on = !!cell?.subject && cell.subject.toLowerCase() === s.key.toLowerCase();
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => edit((t) => D.setCellSubject(t, blockId, colKey, s.key))}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                    on ? 'border-blue-600 bg-blue-50 font-semibold text-blue-800 ring-1 ring-blue-300' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span className="h-3 w-3 shrink-0 rounded-sm border border-gray-300" style={{ backgroundColor: s.color ?? '#fff' }} />
                  {s.key}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => edit((t) => D.setCellSubject(t, blockId, colKey, ''))}
              disabled={!cell}
              className="rounded-md border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40"
            >
              비우기
            </button>
          </div>
          {cell?.subject && !spec && (
            <p className="mt-1 text-[10px] text-amber-600">과목 목록에 없는 이름입니다 ({cell.subject})</p>
          )}
          {noSubjects && <p className="mt-1 text-[10px] text-gray-400">이 Day 는 보통 칸에 직접 글을 씁니다.</p>}
        </div>
      ) : (
        <div className="space-y-1">
          {texts.map((v, i) => (
            <input
              key={i}
              autoFocus={i === 0}
              value={v}
              onChange={(e) => {
                const next = [...texts];
                next[i] = e.target.value;
                edit((t) => D.setCellTexts(t, blockId, colKey, next), `texts:${blockId}:${colKey}`);
              }}
              placeholder={n > 1 ? `${i + 1}번째 줄` : '칸에 넣을 글'}
              className={inputCls}
            />
          ))}
          <p className="text-[10px] text-gray-400">글을 쓰면 과목은 비워집니다.</p>
        </div>
      )}

      {/* 위·아래 순서 */}
      {mode === 'subject' && hasPartner && (
        <div className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[11px] text-gray-700">
            위 <b>{lines[0]?.text || '—'}</b> · 아래 <b>{lines[1]?.text || '—'}</b>
          </span>
          <button type="button" onClick={() => edit((t) => D.togglePartnerFirst(t, blockId, colKey))} className={btnCls} title="1교시/2교시 순서 바꾸기">
            ⇅ 바꾸기
          </button>
        </div>
      )}

      {/* 강의실 */}
      {cell?.subject && mode === 'subject' && (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <FieldLabel>강의실</FieldLabel>
            <input
              value={cell.room ?? ''}
              onChange={(e) => edit((t) => D.setCellField(t, blockId, colKey, 'room', e.target.value), `room:${blockId}:${colKey}`)}
              placeholder={spec?.room ? `과목 기본 ${spec.room}` : '호수'}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => edit((t) => D.fillRoomDown(t, colKey, 'room', cell.room ?? ''))}
              className={`${linkBtnCls} mt-0.5`}
              title="이 열의 과목 칸 전부에 같은 강의실"
            >
              ↓ 이 열 전체에
            </button>
          </label>
          {hasPartner && (
            <label className="block">
              <FieldLabel>짝({lines[cell.partnerFirst ? 0 : 1]?.text || '아래 칸'}) 강의실</FieldLabel>
              <input
                value={cell.partnerRoom ?? ''}
                onChange={(e) => edit((t) => D.setCellField(t, blockId, colKey, 'partnerRoom', e.target.value), `proom:${blockId}:${colKey}`)}
                placeholder={spec?.partnerRoom ? `기본 ${spec.partnerRoom}` : '호수'}
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => edit((t) => D.fillRoomDown(t, colKey, 'partnerRoom', cell.partnerRoom ?? ''))}
                className={`${linkBtnCls} mt-0.5`}
                title="이 열의 과목 칸 전부에 같은 짝 강의실"
              >
                ↓ 이 열 전체에
              </button>
            </label>
          )}
        </div>
      )}

      {/* 짝 원어민 역할 — 반마다 다른 원어민이 붙을 때 */}
      {mode === 'subject' && spec?.partner === 'foreign' && n >= 2 && (
        <label className="block">
          <FieldLabel>짝 원어민 역할</FieldLabel>
          <select
            value={cell?.partnerRole ?? ''}
            onChange={(e) => edit((t) => D.setCellField(t, blockId, colKey, 'partnerRole', e.target.value))}
            className={inputCls}
          >
            <option value="">과목 기본 ({spec.key} 원어민)</option>
            {foreignRoles.map((r) => (
              <option key={r} value={r}>
                {r} 원어민
              </option>
            ))}
            {cell?.partnerRole && !foreignRoles.some((r) => r.toLowerCase() === cell.partnerRole!.toLowerCase()) && (
              <option value={cell.partnerRole}>{cell.partnerRole}</option>
            )}
          </select>
        </label>
      )}

      <label className="block">
        <FieldLabel>메모 (칸 아래 작게 — 교재 코드 등)</FieldLabel>
        <input
          value={cell?.note ?? ''}
          onChange={(e) => edit((t) => D.setCellField(t, blockId, colKey, 'note', e.target.value), `note:${blockId}:${colKey}`)}
          className={inputCls}
        />
      </label>

      {cell?.subject && mode === 'subject' && (
        <div className="flex flex-wrap gap-1.5 border-t border-gray-100 pt-2">
          <button type="button" onClick={() => edit((t) => D.fillRow(t, blockId, cell.subject!))} className={btnCls}>
            이 줄 전체에 {cell.subject}
          </button>
          {cls && (
            <button type="button" onClick={() => edit((t) => D.fillColumn(t, colKey, cell.subject!))} className={btnCls}>
              이 반 모든 줄에 {cell.subject}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
