/**
 * 일괄 변경 (전체 화면) — [시간 | 이름]
 * 시간: 기준 줄(공통 줄 이름 또는 시작 시각) → 캠프 전체에서 같은 줄 찾기 → 고른 줄을 N분 옮기기 / 이 시간으로 맞추기
 * 이름: 과목 또는 공통 줄 이름 → 캠프 전체에서 새 이름으로 (칸 설명도 따라간다)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import {
  DEFAULT_SUBJECTS,
  guideKeyOf,
  monthDayLabel,
  timetableWorkspace as W,
  type TimetableTime,
} from '@smis-mentor/shared';
import { Btn, C, CheckRow, Chip, Field, FullModal, Input, Notice, Seg, SectionHead, TimeInput, u, type SetWs } from './common';
import type { BulkTimeRef } from './RowSheet';

export interface BulkInit {
  tab: 'time' | 'name';
  ref?: BulkTimeRef;
  rename?: { kind: 'subject' | 'shared'; from: string };
}

export function BulkSheet({
  init,
  onClose,
  ws,
  setWs,
  onDone,
}: {
  init: BulkInit | null;
  onClose: () => void;
  ws: W.Workspace;
  setWs: SetWs;
  onDone: (msg: string) => void;
}) {
  const [tab, setTab] = useState<'time' | 'name'>('time');
  useEffect(() => {
    if (init) setTab(init.tab);
  }, [init]);
  return (
    <FullModal visible={!!init} onClose={onClose} title="일괄 변경">
      <Seg
        items={[
          { key: 'time', label: '시간' },
          { key: 'name', label: '이름' },
        ]}
        value={tab}
        onChange={setTab}
        style={{ marginBottom: 14 }}
      />
      {init && (tab === 'time' ? <TimeTab init={init} ws={ws} setWs={setWs} onDone={onDone} /> : <NameTab init={init} ws={ws} setWs={setWs} onDone={onDone} />)}
    </FullModal>
  );
}

// ─── 시간 ─────────────────────────────────────────────────────────

function TimeTab({ init, ws, setWs, onDone }: { init: BulkInit; ws: W.Workspace; setWs: SetWs; onDone: (m: string) => void }) {
  const [ref, setRef] = useState<BulkTimeRef>(init.ref ?? {});
  const [startText, setStartText] = useState(init.ref?.start ?? '');
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [delta, setDelta] = useState('10');
  const [times, setTimes] = useState<TimetableTime[]>(init.ref?.times?.map((t) => ({ ...t })) ?? []);

  /** 캠프의 공통 줄 이름 (시간 표만) */
  const sharedLabels = useMemo(() => {
    const seen = new Map<string, string>();
    Object.values(ws.cur.tables).forEach((t) => {
      if ((t.layout ?? 'time') !== 'time') return;
      t.blocks.forEach((b) => {
        const k = guideKeyOf(b.label);
        if (b.kind === 'shared' && k && !seen.has(k)) seen.set(k, b.label!.trim());
      });
    });
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [ws.cur.tables]);

  const hasRef = !!ref.label || !!ref.start;
  const rows = useMemo(() => (hasRef ? W.findMatchingRows(ws, ref) : []), [ws, ref, hasRef]);
  const rowKey = (r: W.RowMatch) => `${r.tableId}|${r.blockId}`;
  const targets = rows.filter((r) => !unchecked.has(rowKey(r)));
  const count = times.length || rows[0]?.times.length || 1;
  useEffect(() => {
    if (!times.length && rows[0]) setTimes(rows[0].times.map((t) => ({ ...t })));
  }, [rows, times.length]);

  const shift = () => {
    const n = parseInt(delta, 10);
    if (!Number.isFinite(n) || !n) return Alert.alert('일괄 변경', '옮길 분을 넣어 주세요 (앞당기려면 -).');
    if (!targets.length) return;
    setWs((w) => W.shiftRows(w, targets, n));
    if (ref.start) {
      const next = W.addMinutes(ref.start, n);
      setRef({ ...ref, start: next });
      setStartText(next);
    }
    setTimes((ts) => ts.map((t) => ({ start: W.addMinutes(t.start, n), end: W.addMinutes(t.end, n) })));
    onDone(`줄 ${targets.length}개를 ${n > 0 ? '+' : ''}${n}분 옮겼습니다 — 저장을 눌러야 반영됩니다`);
  };
  const setAll = () => {
    const ok = targets.filter((r) => r.times.length === times.length);
    if (!ok.length) return Alert.alert('일괄 변경', `교시 수(${times.length})가 같은 줄이 없습니다.`);
    setWs((w) => W.setRowTimes(w, ok, times));
    if (ref.start && times[0]) {
      setRef({ ...ref, start: times[0].start });
      setStartText(times[0].start);
    }
    const skipped = targets.length - ok.length;
    onDone(`줄 ${ok.length}개의 시간을 맞췄습니다${skipped ? ` (교시 수가 달라 ${skipped}개 건너뜀)` : ''} — 저장을 눌러야 반영됩니다`);
  };

  return (
    <View>
      <SectionHead title="1. 기준 줄" scope="캠프 전체" />
      <Text style={[u.hint, { marginTop: 0, marginBottom: 8 }]}>공통 줄은 이름이 같은 줄, 반별 줄은 시작 시각이 같은 줄을 모든 그룹·Day 에서 찾습니다.</Text>
      <Field label="공통 줄 이름">
        <View style={u.wrap}>
          {sharedLabels.map((l) => (
            <Chip
              key={l}
              label={l}
              on={guideKeyOf(ref.label) === guideKeyOf(l)}
              onPress={() => {
                setRef({ label: l });
                setUnchecked(new Set());
                setTimes([]);
              }}
            />
          ))}
          {!sharedLabels.length && <Text style={u.hint}>공통 줄이 없습니다.</Text>}
        </View>
      </Field>
      <Field label="또는 시작 시각">
        <View style={u.row}>
          <Input
            value={startText}
            onChangeText={setStartText}
            onEndEditing={() => {
              const n = W.normalizeTime(startText);
              if (n) {
                setStartText(n);
                setRef({ start: n, kind: ref.kind ?? 'class' });
                setUnchecked(new Set());
                setTimes([]);
              }
            }}
            placeholder="09:20"
            keyboardType="numbers-and-punctuation"
            style={{ width: 80, textAlign: 'center' }}
          />
          <Seg
            stretch={false}
            items={[
              { key: 'class', label: '반별 줄' },
              { key: 'shared', label: '공통 줄' },
              { key: 'all', label: '모두' },
            ]}
            value={ref.start ? ref.kind ?? 'all' : 'class'}
            onChange={(k) => ref.start && setRef({ start: ref.start, kind: k === 'all' ? undefined : (k as 'class' | 'shared') })}
          />
        </View>
      </Field>

      <SectionHead title={`2. 찾은 줄 (${targets.length}/${rows.length})`} />
      {!hasRef && <Text style={u.hint}>기준 줄을 고르세요.</Text>}
      {hasRef && !rows.length && <Notice tone="gray" text="같은 줄이 없습니다." />}
      {rows.length > 1 && (
        <View style={[u.row, { marginBottom: 4 }]}>
          <Btn label="모두 고르기" onPress={() => setUnchecked(new Set())} />
          <Btn label="모두 빼기" onPress={() => setUnchecked(new Set(rows.map(rowKey)))} />
        </View>
      )}
      {rows.map((r) => {
        const on = !unchecked.has(rowKey(r));
        return (
          <CheckRow
            key={rowKey(r)}
            on={on}
            label={`${r.groupName} · ${r.dayTypeLabel}${r.dates.length ? ` · ${r.dates.map(monthDayLabel).join(',')}` : ''}${r.label ? ` · ${r.label}` : ''}`}
            sub={r.times.map((t) => `${t.start}~${t.end}`).join(' / ')}
            onPress={() =>
              setUnchecked((prev) => {
                const next = new Set(prev);
                if (next.has(rowKey(r))) next.delete(rowKey(r));
                else next.add(rowKey(r));
                return next;
              })
            }
          />
        );
      })}

      {rows.length > 0 && (
        <>
          <View style={u.divider} />
          <SectionHead title="3. 바꾸기" />
          <Field label="N분 옮기기 (앞당기려면 -)">
            <View style={u.wrap}>
              {[-30, -10, -5, 5, 10, 30].map((n) => (
                <Chip key={n} label={`${n > 0 ? '+' : ''}${n}`} on={delta === String(n)} onPress={() => setDelta(String(n))} />
              ))}
            </View>
            <View style={[u.row, { marginTop: 6 }]}>
              <Input value={delta} onChangeText={setDelta} keyboardType="numbers-and-punctuation" style={{ width: 70, textAlign: 'center' }} />
              <Text style={{ color: C.muted }}>분</Text>
              <Btn label={`${targets.length}줄 옮기기`} kind="primary" disabled={!targets.length} onPress={shift} />
            </View>
          </Field>
          <Field label={`이 시간으로 맞추기 (${count}교시 줄만)`}>
            {Array.from({ length: count }, (_, i) => (
              <View key={i} style={[u.row, { marginBottom: 6 }]}>
                {count > 1 && <Text style={{ width: 34, fontSize: 11, color: C.muted }}>{i + 1}교시</Text>}
                <TimeInput
                  value={times[i]?.start ?? ''}
                  onCommit={(v) => setTimes((ts) => Array.from({ length: count }, (_, j) => (j === i ? { start: v, end: ts[j]?.end ?? v } : ts[j] ?? { start: '', end: '' })))}
                />
                <Text style={{ color: C.faint }}>~</Text>
                <TimeInput
                  value={times[i]?.end ?? ''}
                  placeholder="10:00"
                  onCommit={(v) => setTimes((ts) => Array.from({ length: count }, (_, j) => (j === i ? { start: ts[j]?.start ?? v, end: v } : ts[j] ?? { start: '', end: '' })))}
                />
              </View>
            ))}
            <Btn
              label={`${targets.filter((r) => r.times.length === count).length}줄 맞추기`}
              kind="primary"
              style={{ alignSelf: 'flex-start' }}
              disabled={!targets.length || times.length !== count || times.some((t) => !t.start || !t.end)}
              onPress={setAll}
            />
          </Field>
        </>
      )}
    </View>
  );
}

// ─── 이름 ─────────────────────────────────────────────────────────

function NameTab({ init, ws, setWs, onDone }: { init: BulkInit; ws: W.Workspace; setWs: SetWs; onDone: (m: string) => void }) {
  const [kind, setKind] = useState<'subject' | 'shared'>(init.rename?.kind ?? 'subject');
  const [from, setFrom] = useState(init.rename?.from ?? '');
  const [to, setTo] = useState(init.rename?.from ?? '');

  const tables = Object.values(ws.cur.tables);
  const names = useMemo(() => {
    const seen = new Map<string, string>();
    const add = (v?: string) => {
      const k = guideKeyOf(v);
      if (k && !seen.has(k)) seen.set(k, v!.trim());
    };
    tables.forEach((t) => {
      if (kind === 'subject') {
        (t.subjects?.length ? t.subjects : DEFAULT_SUBJECTS).forEach((x) => add(x.key));
      } else t.blocks.forEach((b) => b.kind === 'shared' && add(b.label));
    });
    return [...seen.values()].sort((a, b) => a.localeCompare(b, 'ko'));
  }, [tables, kind]);

  const usedIn = (name: string) =>
    tables.filter((t) =>
      kind === 'subject'
        ? t.subjects?.some((x) => guideKeyOf(x.key) === guideKeyOf(name)) ||
          t.blocks.some((b) => Object.values(b.cells ?? {}).some((c) => guideKeyOf(c.subject) === guideKeyOf(name)))
        : t.blocks.some((b) => b.kind === 'shared' && guideKeyOf(b.label) === guideKeyOf(name))
    );

  const apply = () => {
    const nn = to.trim();
    if (!from || !nn || nn === from) return;
    const hit = usedIn(from);
    Alert.alert('캠프 전체에서 이름 바꾸기', `표 ${hit.length}장에서 "${from}" → "${nn}" 로 바꿉니다. 칸 설명도 새 이름을 따라갑니다.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '바꾸기',
        onPress: () => {
          if (kind === 'subject') {
            const first = hit[0]?.id ?? '';
            setWs((w) => W.renameSubject(w, first, from, nn, 'camp'));
          } else {
            const t = hit[0];
            const b = t?.blocks.find((x) => x.kind === 'shared' && guideKeyOf(x.label) === guideKeyOf(from));
            if (!t || !b) return;
            setWs((w) => W.renameSharedLabel(w, t.id, b.id, nn, 'camp'));
          }
          onDone(`"${from}" → "${nn}" (표 ${hit.length}장) — 저장을 눌러야 반영됩니다`);
          setFrom(nn);
        },
      },
    ]);
  };

  return (
    <View>
      <Seg
        items={[
          { key: 'subject', label: '과목·주제' },
          { key: 'shared', label: '공통 줄' },
        ]}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setFrom('');
          setTo('');
        }}
        style={{ marginBottom: 12 }}
      />
      <SectionHead title="바꿀 이름" scope="캠프 전체" />
      <View style={[u.wrap, { marginBottom: 12 }]}>
        {names.map((n) => (
          <Chip
            key={n}
            label={`${n} (${usedIn(n).length})`}
            on={guideKeyOf(from) === guideKeyOf(n)}
            onPress={() => {
              setFrom(n);
              setTo(n);
            }}
          />
        ))}
        {!names.length && <Text style={u.hint}>이름이 없습니다.</Text>}
      </View>
      {!!from && (
        <>
          <Field label="새 이름">
            <Input value={to} onChangeText={setTo} placeholder={from} />
          </Field>
          {kind === 'shared' && to.includes('인문학') !== from.includes('인문학') && (
            <Notice tone="amber" text={to.includes('인문학') ? '이름에 "인문학" 이 들어가면 그 자리에 인문학 표가 붙습니다.' : '"인문학" 이 빠지면 그 자리에 인문학 표가 더 이상 붙지 않습니다.'} />
          )}
          <Btn label="캠프 전체 적용" kind="primary" style={{ alignSelf: 'flex-start' }} disabled={!to.trim() || to.trim() === from} onPress={apply} />
          <Text style={u.hint}>모든 그룹·Day 의 표에서 같은 이름(대소문자·띄어쓰기 무시)을 바꿉니다. 칸 설명도 새 이름으로 옮겨집니다.</Text>
        </>
      )}
    </View>
  );
}

