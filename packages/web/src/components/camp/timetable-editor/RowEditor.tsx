'use client';

/**
 * 줄 팝오버 — 시각 · 교시 수 · 종류(반별/공통) · 공통 줄 이름·부제·색 · 날짜 표의 날짜·n일차 ·
 * 위/아래에 줄 · 복제 · ▲▼ · 이 줄 모든 칸 과목 · 다른 표에도 같은 시간 · 삭제
 */
import { useEffect, useRef, useState } from 'react';
import {
  dateLabelFor,
  sortBlocks,
  timetableDraft as D,
  timetableWorkspace as W,
  type CampTimetable,
  type TimetableBlock,
} from '@smis-mentor/shared';
import { ColorPicker, FieldLabel, Segmented, btnCls, btnDangerCls, inputCls, linkBtnCls, subjectsOf, type TableEdit, type WsUpdate } from './ui';

export interface BulkTimeRef {
  label?: string;
  start?: string;
  kind?: 'shared' | 'class';
}

function hasContent(b: TimetableBlock): boolean {
  return Object.values(b.cells ?? {}).some((c) => c && (c.subject || c.texts?.some((x) => x.trim()) || c.note || c.room));
}

function parseOffsets(s: string): number[] {
  return s
    .split(/[,\s]+/)
    .map((x) => Number(x))
    .filter((x) => Number.isInteger(x) && x > 0);
}

export function RowEditor({
  table,
  blockId,
  campStart,
  edit,
  update,
  onInserted,
  onBulkTime,
  onBulkName,
  onDeleted,
}: {
  table: CampTimetable;
  blockId: string;
  campStart: Date | null;
  edit: TableEdit;
  update: WsUpdate;
  /** 새 줄을 넣었으면 그 줄로 */
  onInserted: (newBlockId: string) => void;
  onBulkTime: (ref: BulkTimeRef) => void;
  onBulkName: (old: string) => void;
  onDeleted: () => void;
}) {
  /** 이름 입력을 시작할 때의 이름 · 지금 이름 — 입력을 마치면(blur, 또는 팝오버가 닫히면) 칸 설명을 새 이름으로 옮긴다 */
  const labelStart = useRef<string | null>(null);
  const labelNow = useRef('');
  const [offsetText, setOffsetText] = useState<string | null>(null);
  const carryLabel = () => {
    const from = labelStart.current;
    const to = labelNow.current;
    labelStart.current = null;
    if (from?.trim() && to.trim() && from !== to) update((w) => W.carryGuideAfterRename(w, from, to));
  };
  const carryRef = useRef(carryLabel);
  useEffect(() => {
    carryRef.current = carryLabel;
  });
  // 입력 중에 팝오버가 닫히면(바깥 클릭·Esc) blur 없이 사라질 수 있다
  useEffect(() => () => carryRef.current(), []);
  const layout = table.layout ?? 'time';
  const isDate = layout === 'date';
  const sorted = sortBlocks(table.blocks, layout);
  const idx = sorted.findIndex((b) => b.id === blockId);
  const b = sorted[idx];
  if (!b) return <p className="text-gray-400">이 줄이 없습니다.</p>;
  const isShared = b.kind === 'shared';
  const subjects = subjectsOf(table);

  const setKind = (kind: 'shared' | 'class') => {
    if (kind === b.kind) return;
    if (kind === 'shared' && hasContent(b) && !window.confirm('반 칸에 넣은 내용이 사라집니다. 공통 줄로 바꿀까요?')) return;
    if (kind === 'class' && b.label?.trim() && !window.confirm(`줄 이름 "${b.label}" 이(가) 사라집니다. 반별 줄로 바꿀까요?`)) return;
    edit((t) => D.updateBlock(t, blockId, kind === 'shared' ? { kind, cells: {}, label: '' } : { kind, label: undefined, subLabel: undefined, cells: {} }));
  };

  const insert = (where: 'before' | 'after', kind: 'shared' | 'class') => {
    let id = '';
    edit((t) => {
      id = D.insertBlock(t, blockId, where, kind);
    });
    if (id) onInserted(id);
  };

  const timeInput = (i: number, field: 'start' | 'end') => (
    <input
      type="time"
      value={b.times?.[i]?.[field] ?? ''}
      onChange={(e) => edit((t) => D.updateTime(t, blockId, i, field, e.target.value), `time:${blockId}:${i}:${field}`)}
      onBlur={(e) => {
        const v = W.normalizeTime(e.target.value);
        if (v && v !== b.times?.[i]?.[field]) edit((t) => D.updateTime(t, blockId, i, field, v));
      }}
      className="w-[7.5rem] rounded-md border border-gray-300 px-1 py-1 text-xs tabular-nums"
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-900">줄 편집</span>
        <span className="text-[10px] text-gray-400">이 표만</span>
        <div className="ml-auto">
          <Segmented
            value={b.kind}
            onChange={setKind}
            options={[
              { value: 'class', label: '반별' },
              { value: 'shared', label: '공통' },
            ]}
          />
        </div>
      </div>

      {/* 시간 / 날짜 */}
      {isDate ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <FieldLabel>날짜 표기</FieldLabel>
            <input
              value={b.dateLabel ?? ''}
              onChange={(e) => edit((t) => D.updateBlock(t, blockId, { dateLabel: e.target.value }), `dateLabel:${blockId}`)}
              placeholder="1/6, 1/7"
              className={inputCls}
            />
          </label>
          <label className="block">
            <FieldLabel>캠프 n일차 (쉼표)</FieldLabel>
            <input
              value={offsetText ?? (b.dayOffsets ?? []).join(', ')}
              onFocus={() => setOffsetText((b.dayOffsets ?? []).join(', '))}
              onChange={(e) => {
                setOffsetText(e.target.value);
                const arr = parseOffsets(e.target.value);
                edit((t) => D.updateBlock(t, blockId, { dayOffsets: arr.length ? arr : undefined }), `offsets:${blockId}`);
              }}
              onBlur={() => setOffsetText(null)}
              placeholder="3, 4"
              className={inputCls}
            />
          </label>
          <p className="col-span-2 text-[10px] text-gray-500">
            {b.dayOffsets?.length
              ? `보기 화면: ${dateLabelFor(b, campStart) || '(캠프 시작일 없음)'} — n일차가 있으면 날짜 표기 대신 캠프 시작일로 계산합니다.`
              : 'n일차를 넣으면 기수가 바뀌어도 날짜를 다시 넣지 않아도 됩니다.'}
          </p>
          {!isShared && (
            <div className="col-span-2 flex items-center gap-2">
              <FieldLabel>칸 줄 수</FieldLabel>
              <Segmented
                value={String(b.lines ?? 2)}
                onChange={(v) => edit((t) => D.updateBlock(t, blockId, { lines: Number(v) }))}
                options={[
                  { value: '1', label: '1줄' },
                  { value: '2', label: '2줄' },
                ]}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {!isShared && (
            <div className="flex items-center gap-2">
              <FieldLabel>교시 수</FieldLabel>
              <Segmented
                value={String(b.times?.length ?? 1)}
                onChange={(v) => edit((t) => D.setPeriodCount(t, blockId, v === '1' ? 1 : 2))}
                options={[
                  { value: '1', label: '1교시' },
                  { value: '2', label: '2교시 세트' },
                ]}
              />
            </div>
          )}
          {(b.times ?? []).map((_, i) => (
            <div key={i} className="flex items-center gap-1">
              {(b.times?.length ?? 0) > 1 && <span className="w-9 text-[10px] text-gray-400">{i + 1}교시</span>}
              {timeInput(i, 'start')}
              <span className="text-gray-300">~</span>
              {timeInput(i, 'end')}
            </div>
          ))}
          <button type="button" onClick={() => onBulkTime(isShared && b.label?.trim() ? { label: b.label } : { start: b.times?.[0]?.start, kind: b.kind })} className={linkBtnCls}>
            다른 표에도 같은 시간 바꾸기…
          </button>
        </div>
      )}

      {/* 공통 줄 이름 */}
      {isShared && (
        <div className="space-y-2">
          <label className="block">
            <FieldLabel>공통 줄 이름</FieldLabel>
            <input
              autoFocus={!b.label}
              value={b.label ?? ''}
              onFocus={() => {
                labelStart.current = b.label ?? '';
                labelNow.current = b.label ?? '';
              }}
              onChange={(e) => {
                labelNow.current = e.target.value;
                edit((t) => D.updateBlock(t, blockId, { label: e.target.value }), `label:${blockId}`);
              }}
              onBlur={carryLabel}
              placeholder="Breakfast / P.E / 인문학 프로그램"
              className={inputCls}
            />
          </label>
          {b.label?.includes('인문학') && (
            <p className="rounded-md bg-blue-50 px-2 py-1 text-[11px] text-blue-700">인문학 표가 이 자리에 붙습니다 (보기 화면에서 이 줄 아래).</p>
          )}
          <label className="block">
            <FieldLabel>부제 (이름 옆에 작게)</FieldLabel>
            <input
              value={b.subLabel ?? ''}
              onChange={(e) => edit((t) => D.updateBlock(t, blockId, { subLabel: e.target.value || undefined }), `subLabel:${blockId}`)}
              placeholder="직전 강의실에서 진행"
              className={inputCls}
            />
          </label>
          {b.label?.trim() && (
            <button type="button" onClick={() => onBulkName(b.label!)} className={linkBtnCls}>
              캠프 전체에서 이 이름 바꾸기…
            </button>
          )}
        </div>
      )}

      <div>
        <FieldLabel>{isShared ? '줄 색' : '빈 칸 배경색'}</FieldLabel>
        <ColorPicker value={b.color} onChange={(c) => edit((t) => D.updateBlock(t, blockId, { color: c }))} />
      </div>

      {!isShared && (
        <label className="block">
          <FieldLabel>이 줄 모든 반 칸 과목</FieldLabel>
          <select
            value=""
            onChange={(e) => {
              const v = e.target.value;
              if (v === '__none__') return;
              edit((t) => D.fillRow(t, blockId, v === '__clear__' ? '' : v));
            }}
            className={inputCls}
          >
            <option value="">과목 고르기…</option>
            {subjects.map((s) => (
              <option key={s.key} value={s.key}>
                {s.key}
              </option>
            ))}
            <option value="__clear__">(모두 비우기)</option>
          </select>
        </label>
      )}

      <div className="space-y-1.5 border-t border-gray-100 pt-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-12 text-[10px] text-gray-500">위에 줄</span>
          <button type="button" onClick={() => insert('before', 'class')} className={btnCls}>
            + 반별
          </button>
          <button type="button" onClick={() => insert('before', 'shared')} className={btnCls}>
            + 공통
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-12 text-[10px] text-gray-500">아래에 줄</span>
          <button type="button" onClick={() => insert('after', 'class')} className={btnCls}>
            + 반별
          </button>
          <button type="button" onClick={() => insert('after', 'shared')} className={btnCls}>
            + 공통
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1 pt-1">
          <button
            type="button"
            onClick={() => {
              let id: string | null = null;
              edit((t) => {
                id = D.duplicateBlock(t, blockId);
              });
              if (id) onInserted(id);
            }}
            className={btnCls}
          >
            복제
          </button>
          <button
            type="button"
            disabled={idx <= 0}
            onClick={() => edit((t) => void D.moveBlock(t, blockId, -1))}
            title={isDate ? '위로 — 내용만 옮기고 날짜는 자리에 남습니다' : '위로 — 윗줄과 시간대를 맞바꿉니다'}
            className={btnCls}
          >
            ▲
          </button>
          <button
            type="button"
            disabled={idx >= sorted.length - 1}
            onClick={() => edit((t) => void D.moveBlock(t, blockId, 1))}
            title={isDate ? '아래로 — 내용만 옮기고 날짜는 자리에 남습니다' : '아래로 — 아랫줄과 시간대를 맞바꿉니다'}
            className={btnCls}
          >
            ▼
          </button>
          <button
            type="button"
            onClick={() => {
              edit((t) => D.removeBlock(t, blockId));
              onDeleted();
            }}
            className={`${btnDangerCls} ml-auto`}
          >
            줄 삭제
          </button>
        </div>
      </div>
    </div>
  );
}
