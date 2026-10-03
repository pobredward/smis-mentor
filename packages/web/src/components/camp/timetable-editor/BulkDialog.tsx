'use client';

/**
 * [일괄 변경] — 캠프 전체에서 한 번에.
 *  - 시간: 같은 줄(공통 줄 이름 / 시작 시각)을 모든 그룹·Day 에서 찾아 N분 옮기거나 같은 시간으로 맞춘다.
 *  - 이름: 과목 또는 공통 줄 이름을 캠프 전체에서 바꾼다 (칸 설명이 따라간다).
 */
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  DEFAULT_SUBJECTS,
  guideKeyOf,
  monthDayLabel,
  timetableWorkspace as W,
  type TimetableTime,
} from '@smis-mentor/shared';
import { FieldLabel, Modal, Segmented, btnCls, btnPrimaryCls, inputBaseCls, inputCls, subjectsOf, type WsUpdate } from './ui';
import type { BulkTimeRef } from './RowEditor';

export type BulkTab = 'time' | 'name';
export interface BulkNameRef {
  kind: 'subject' | 'shared';
  old: string;
}

const rowKey = (r: { tableId: string; blockId: string }) => `${r.tableId}:${r.blockId}`;
const timesText = (times: TimetableTime[]) => times.map((t) => `${t.start}~${t.end}`).join(' / ');

export function BulkDialog({
  ws,
  update,
  initialTab = 'time',
  initialRef,
  initialName,
  categoryLabelOf,
  onClose,
}: {
  ws: W.Workspace;
  update: WsUpdate;
  initialTab?: BulkTab;
  initialRef?: BulkTimeRef | null;
  initialName?: BulkNameRef | null;
  categoryLabelOf: (key: string) => string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<BulkTab>(initialTab);

  // ── 시간 ──────────────────────────────────────────────────────────
  const [refMode, setRefMode] = useState<'label' | 'start'>(initialRef?.label ? 'label' : initialRef?.start ? 'start' : 'label');
  const [labelPick, setLabelPick] = useState(initialRef?.label ?? '');
  const [startPick, setStartPick] = useState(initialRef?.start ?? '');
  const [kindPick, setKindPick] = useState<'class' | 'shared' | 'any'>(initialRef?.kind ?? 'class');
  const [delta, setDelta] = useState(30);
  const [excluded, setExcluded] = useState<{ key: string; set: Set<string> }>({ key: '', set: new Set() });
  const [timesPick, setTimesPick] = useState<{ key: string; times: TimetableTime[] } | null>(null);

  /** 시간 표의 공통 줄 이름 (findMatchingRows 가 보는 것과 같은 범위) */
  const sharedLabels = useMemo(() => {
    const m = new Map<string, string>();
    Object.values(ws.cur.tables).forEach((t) => {
      if ((t.layout ?? 'time') !== 'time') return;
      t.blocks.forEach((b) => {
        const k = guideKeyOf(b.label);
        if (b.kind === 'shared' && k && !m.has(k)) m.set(k, b.label!.trim());
      });
    });
    return [...m.values()].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [ws.cur.tables]);

  const ref: BulkTimeRef = refMode === 'label' ? { label: labelPick } : { start: W.normalizeTime(startPick) ?? '', kind: kindPick === 'any' ? undefined : kindPick };
  const refKey = JSON.stringify(ref);
  const matches = useMemo(
    () => ((refMode === 'label' ? labelPick.trim() : ref.start) ? W.findMatchingRows(ws, ref) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws.cur.tables, refKey]
  );
  const off = excluded.key === refKey ? excluded.set : new Set<string>();
  const toggleRow = (k: string) => {
    const next = new Set(off);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setExcluded({ key: refKey, set: next });
  };
  const targets = matches.filter((m) => !off.has(rowKey(m)));
  const periods = matches[0]?.times.length ?? 1;
  const times = timesPick?.key === refKey ? timesPick.times : (matches[0]?.times ?? [{ start: '', end: '' }]).map((t) => ({ ...t }));
  const sameLen = targets.filter((m) => m.times.length === periods);
  const byGroup = useMemo(() => {
    const m = new Map<string, typeof matches>();
    matches.forEach((r) => m.set(r.groupName, [...(m.get(r.groupName) ?? []), r]));
    return [...m.entries()];
  }, [matches]);

  const doShift = () => {
    if (!delta || !targets.length) return;
    update((w) => W.shiftRows(w, targets, delta));
    toast.success(`${targets.length}줄을 ${delta > 0 ? '+' : ''}${delta}분 옮겼습니다 — 저장을 눌러야 반영됩니다`);
    onClose();
  };
  const doSet = () => {
    const clean = times.map((t) => ({ start: W.normalizeTime(t.start) ?? '', end: W.normalizeTime(t.end) ?? '' }));
    if (clean.some((t) => !t.start || !t.end)) {
      toast.error('시각을 모두 넣어 주세요.');
      return;
    }
    if (!sameLen.length) return;
    update((w) => W.setRowTimes(w, sameLen, clean));
    toast.success(`${sameLen.length}줄을 ${timesText(clean)} 로 맞췄습니다 — 저장을 눌러야 반영됩니다`);
    onClose();
  };

  // ── 이름 ──────────────────────────────────────────────────────────
  const [nameKind, setNameKind] = useState<'subject' | 'shared'>(initialName?.kind ?? 'subject');
  const [oldPick, setOldPick] = useState(initialName?.old ?? '');
  const [newName, setNewName] = useState('');

  const subjectNames = useMemo(() => {
    const m = new Map<string, { name: string; tables: number }>();
    Object.values(ws.cur.tables).forEach((t) => {
      const seen = new Set<string>();
      const add = (v?: string) => {
        const k = (v ?? '').trim().toLowerCase();
        if (!k || seen.has(k)) return;
        seen.add(k);
        const prev = m.get(k);
        m.set(k, { name: prev?.name ?? v!.trim(), tables: (prev?.tables ?? 0) + 1 });
      };
      subjectsOf(t).forEach((s) => add(s.key));
      t.blocks.forEach((b) => Object.values(b.cells ?? {}).forEach((c) => add(c?.subject)));
    });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [ws.cur.tables]);
  const labelNames = useMemo(() => {
    const m = new Map<string, { name: string; tables: number }>();
    Object.values(ws.cur.tables).forEach((t) => {
      const seen = new Set<string>();
      t.blocks.forEach((b) => {
        const k = guideKeyOf(b.label);
        if (b.kind !== 'shared' || !k || seen.has(k)) return;
        seen.add(k);
        const prev = m.get(k);
        m.set(k, { name: prev?.name ?? b.label!.trim(), tables: (prev?.tables ?? 0) + 1 });
      });
    });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [ws.cur.tables]);
  const names = nameKind === 'subject' ? subjectNames : labelNames;
  const oldName = names.find((x) => x.name.toLowerCase() === oldPick.trim().toLowerCase())?.name ?? '';
  const oldInfo = names.find((x) => x.name === oldName);
  const clash = !!newName.trim() && names.some((x) => x.name.toLowerCase() === newName.trim().toLowerCase() && x.name !== oldName);

  const doRename = () => {
    const nw = newName.trim();
    if (!oldName || !nw || nw === oldName) return;
    if (clash && !window.confirm(`"${nw}" 이(가) 이미 있습니다. 합쳐질 수 있습니다. 계속할까요?`)) return;
    if (nameKind === 'subject') {
      const lower = oldName.toLowerCase();
      const inDefault = DEFAULT_SUBJECTS.some((s) => s.key.toLowerCase() === lower);
      update((w0) => {
        let w = w0;
        // 기본 과목을 그대로 쓰는 표는 과목 목록이 비어 있다 — 목록에도 새 이름이 들어가게 먼저 채운다
        if (inDefault) {
          Object.values(w.cur.tables).forEach((t) => {
            if (!t.subjects?.length) w = W.editTable(w, t.id, (x) => void (x.subjects = DEFAULT_SUBJECTS.map((s) => ({ ...s }))));
          });
        }
        const anyId = Object.keys(w.cur.tables)[0];
        return anyId ? W.renameSubject(w, anyId, oldName, nw, 'camp') : w;
      });
    } else {
      const k = guideKeyOf(oldName);
      let hit: { tableId: string; blockId: string } | null = null;
      for (const t of Object.values(ws.cur.tables)) {
        const b = t.blocks.find((x) => x.kind === 'shared' && guideKeyOf(x.label) === k);
        if (b) {
          hit = { tableId: t.id, blockId: b.id };
          break;
        }
      }
      if (!hit) return;
      const { tableId, blockId } = hit;
      update((w) => W.renameSharedLabel(w, tableId, blockId, nw, 'camp'));
    }
    toast.success(`"${oldName}" → "${nw}" (표 ${oldInfo?.tables ?? 0}장) — 저장을 눌러야 반영됩니다`);
    onClose();
  };

  return (
    <Modal
      title="일괄 변경 (캠프 전체)"
      onClose={onClose}
      wide
      footer={
        <button type="button" onClick={onClose} className={btnCls}>
          닫기
        </button>
      }
    >
      <div className="space-y-4 text-xs">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'time', label: '시간' },
            { value: 'name', label: '이름' },
          ]}
        />

        {tab === 'time' ? (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <FieldLabel>기준 줄</FieldLabel>
                <Segmented
                  value={refMode}
                  onChange={setRefMode}
                  options={[
                    { value: 'label', label: '공통 줄 이름' },
                    { value: 'start', label: '시작 시각' },
                  ]}
                />
              </div>
              {refMode === 'label' ? (
                <label className="block min-w-[200px] flex-1">
                  <FieldLabel>이름이 같은 공통 줄</FieldLabel>
                  <select value={sharedLabels.find((l) => guideKeyOf(l) === guideKeyOf(labelPick)) ?? ''} onChange={(e) => setLabelPick(e.target.value)} className={inputCls}>
                    <option value="">고르기…</option>
                    {sharedLabels.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <>
                  <label className="block">
                    <FieldLabel>시작 시각이 같은 줄</FieldLabel>
                    <input type="time" value={startPick} onChange={(e) => setStartPick(e.target.value)} className={`${inputBaseCls} w-[7.5rem]`} />
                  </label>
                  <label className="block">
                    <FieldLabel>줄 종류</FieldLabel>
                    <select value={kindPick} onChange={(e) => setKindPick(e.target.value as 'class' | 'shared' | 'any')} className={inputCls}>
                      <option value="class">반별 줄</option>
                      <option value="shared">공통 줄</option>
                      <option value="any">모두</option>
                    </select>
                  </label>
                </>
              )}
            </div>

            <div>
              <FieldLabel>
                찾은 줄 {matches.length}개 · 바꿀 줄 {targets.length}개
              </FieldLabel>
              <div className="max-h-60 overflow-y-auto rounded-md border border-gray-200">
                {!matches.length && <p className="px-3 py-4 text-center text-gray-400">기준을 고르면 모든 그룹·Day 에서 같은 줄을 찾습니다.</p>}
                {byGroup.map(([g, rows]) => (
                  <div key={g}>
                    <div className="sticky top-0 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-700">{g}</div>
                    {rows.map((r) => {
                      const k = rowKey(r);
                      return (
                        <label key={k} className="flex cursor-pointer items-center gap-2 px-2.5 py-1 hover:bg-gray-50">
                          <input type="checkbox" checked={!off.has(k)} onChange={() => toggleRow(k)} />
                          <span className="w-20 shrink-0 truncate text-gray-700">{categoryLabelOf(r.dayType) || r.dayTypeLabel}</span>
                          <span className="w-20 shrink-0 truncate text-gray-500">{r.dates.length ? r.dates.map(monthDayLabel).join('·') : '기본'}</span>
                          <span className="min-w-0 flex-1 truncate text-gray-700">{r.kind === 'shared' ? r.label : '반별 줄'}</span>
                          <span className="shrink-0 tabular-nums text-gray-500">{timesText(r.times)}</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-gray-200 p-2.5">
                <FieldLabel>모두 같은 만큼 옮기기</FieldLabel>
                <div className="flex items-center gap-1.5">
                  <input type="number" step={5} value={delta} onChange={(e) => setDelta(Number(e.target.value) || 0)} className={`${inputBaseCls} w-20`} />
                  <span className="text-gray-500">분 (앞당기려면 −)</span>
                </div>
                <button type="button" onClick={doShift} disabled={!targets.length || !delta} className={`${btnPrimaryCls} mt-2`}>
                  {delta > 0 ? '+' : ''}
                  {delta}분 옮기기 ({targets.length}줄)
                </button>
              </div>
              <div className="rounded-md border border-gray-200 p-2.5">
                <FieldLabel>이 시간으로 맞추기 (교시 수 {periods}개인 줄만)</FieldLabel>
                <div className="space-y-1">
                  {times.map((t, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <input
                        type="time"
                        value={t.start}
                        onChange={(e) => setTimesPick({ key: refKey, times: times.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })}
                        className={`${inputBaseCls} w-[7.5rem]`}
                      />
                      <span className="text-gray-300">~</span>
                      <input
                        type="time"
                        value={t.end}
                        onChange={(e) => setTimesPick({ key: refKey, times: times.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })}
                        className={`${inputBaseCls} w-[7.5rem]`}
                      />
                    </div>
                  ))}
                </div>
                <button type="button" onClick={doSet} disabled={!sameLen.length} className={`${btnPrimaryCls} mt-2`}>
                  맞추기 ({sameLen.length}줄)
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <FieldLabel>무엇의 이름</FieldLabel>
                <Segmented
                  value={nameKind}
                  onChange={(v) => {
                    setNameKind(v);
                    setOldPick('');
                  }}
                  options={[
                    { value: 'subject', label: '과목·주제' },
                    { value: 'shared', label: '공통 줄' },
                  ]}
                />
              </div>
              <label className="block min-w-[160px] flex-1">
                <FieldLabel>지금 이름</FieldLabel>
                <select value={oldName} onChange={(e) => setOldPick(e.target.value)} className={inputCls}>
                  <option value="">고르기…</option>
                  {names.map((x) => (
                    <option key={x.name} value={x.name}>
                      {x.name} (표 {x.tables}장)
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-[160px] flex-1">
                <FieldLabel>새 이름</FieldLabel>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} className={`${inputCls} ${clash ? 'border-amber-400' : ''}`} />
              </label>
            </div>
            <p className="text-gray-500">
              캠프의 모든 그룹·Day 표에서 바꿉니다. 칸 설명도 새 이름으로 따라갑니다.
              {nameKind === 'shared' && " 이름에 '인문학' 이 들어가면 인문학 표가 그 자리에 붙습니다."}
            </p>
            {clash && <p className="text-amber-700">이미 있는 이름입니다 — 바꾸면 두 이름이 하나로 합쳐집니다.</p>}
            <button type="button" onClick={doRename} disabled={!oldName || !newName.trim() || newName.trim() === oldName} className={btnPrimaryCls}>
              캠프 전체에서 바꾸기
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
