/**
 * 편집 표 — 보기 화면(TimetableView)과 같은 모양으로 그리되, 줄을 합치지 않고 한 줄씩 보여 준다.
 * 칸 누르기 → 칸 편집, 줄 머리(시간) 누르기 → 줄 편집, 줄 사이 '+' → 그 자리에 줄 넣기,
 * 칸 길게 누르기 → 여러 칸 선택.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  classNameLabel,
  columnLabelLines,
  dateLabelFor,
  dutyByBlock,
  findSubject,
  isJoinedPair,
  isMergedColumn,
  lineCountOf,
  mergedColumnName,
  renderCell,
  sortBlocks,
  type CampTimetable,
  type RenderContext,
  type RenderedLine,
  type TimetableSubject,
} from '@smis-mentor/shared';
import { C } from './common';

const TIME_W = 56;
const DUTY_W = 62;
const MIN_CLASS_W = 70;
const CELL_H = 42;
const DATE_CELL_H = 30;
const SHARED_H = 34;
const GAP_H = 16;

export const cellKey = (blockId: string, colKey: string) => `${blockId}|${colKey}`;

interface Props {
  /** 그릴 표 — 공통 반·이름과 반 정보를 입힌 것 */
  table: CampTimetable;
  subjects: TimetableSubject[];
  resolvers: Pick<RenderContext, 'resolveForeign' | 'resolveTeacher'>;
  campStartMs: number | null;
  selecting: boolean;
  selected: Set<string>;
  onCell: (blockId: string, colKey: string) => void;
  onCellLong: (blockId: string, colKey: string) => void;
  onRow: (blockId: string) => void;
  onInsert: (refId: string | null, where: 'before' | 'after') => void;
  onClassHead: (code: string) => void;
  onExtraHead: (key: string) => void;
}

function Lines({ line, size }: { line?: RenderedLine; size: number }) {
  if (!line?.text) return <Text style={s.dash}>—</Text>;
  return (
    <>
      {!!line.room && (
        <Text style={[s.room, { fontSize: size - 1.5 }]} numberOfLines={1}>
          {line.room}
        </Text>
      )}
      <Text
        style={[
          s.cellText,
          { fontSize: size },
          line.isName ? (line.muted ? s.nameMuted : s.name) : line.muted ? s.muted : null,
          line.manual && s.manual,
        ]}
        numberOfLines={line.room || line.sub ? 1 : 2}
      >
        {line.text}
      </Text>
      {!!line.sub && (
        <Text style={[s.sub, { fontSize: size - 1.5 }, line.subManual && s.manual]} numberOfLines={1}>
          {line.sub}
        </Text>
      )}
    </>
  );
}

export function EditableGrid({
  table,
  subjects,
  resolvers,
  campStartMs,
  selecting,
  selected,
  onCell,
  onCellLong,
  onRow,
  onInsert,
  onClassHead,
  onExtraHead,
}: Props) {
  const { width: screenW } = useWindowDimensions();
  const layout = table.layout ?? 'time';
  const blocks = useMemo(() => sortBlocks(table.blocks ?? [], layout), [table.blocks, layout]);
  const extras = useMemo(() => table.extraColumns ?? [], [table.extraColumns]);
  const dutyMap = useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    extras.filter((e) => e.dutyRotation?.length).forEach((e) => (m[e.key] = dutyByBlock(table.blocks ?? [], layout, e.dutyRotation)));
    return m;
  }, [table.blocks, extras, layout]);
  const ctxFor = (columnKey: string): RenderContext => ({ subjects, columnKey, ...resolvers, patternLabel: 'Pattern' });

  const classCount = Math.max(1, table.classes.length);
  const dutyCount = extras.filter(isMergedColumn).length;
  const plainExtra = extras.length - dutyCount;
  const room = Math.max(280, screenW - 26) - TIME_W - DUTY_W * dutyCount;
  const classW = Math.max(MIN_CLASS_W, Math.floor(room / (classCount + plainExtra)));
  const widthOf = (merged: boolean) => (merged ? DUTY_W : classW);
  const cellH = layout === 'date' ? DATE_CELL_H : CELL_H;
  const fontOf = classW >= 80 ? 11 : 10;
  const sharedW = classW * table.classes.length || classW;

  const isSel = (b: string, c: string) => selected.has(cellKey(b, c));

  const gap = (refId: string | null, where: 'before' | 'after', k: string) => (
    <View key={k} style={s.gap}>
      <TouchableOpacity style={s.plus} onPress={() => onInsert(refId, where)} hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}>
        <Ionicons name="add" size={11} color={C.blue} />
      </TouchableOpacity>
      <View style={s.gapLine} />
    </View>
  );

  const header = (
    <View style={s.headRow}>
      <View style={[s.headCell, { width: TIME_W }]}>
        <Text style={s.headTime}>{layout === 'date' ? '날짜' : '시간'}</Text>
      </View>
      {table.classes.map((c) => {
        const t = resolvers.resolveTeacher(c.classCode);
        return (
          <TouchableOpacity key={c.classCode} style={[s.headCell, { width: classW }]} onPress={() => onClassHead(c.classCode)}>
            <Text style={[s.headLabel, { fontSize: fontOf + 1 }]} numberOfLines={1}>
              {c.classCode}
            </Text>
            {!!c.className && (
              <Text style={[s.headName, { fontSize: fontOf - 1 }]} numberOfLines={1}>
                {classNameLabel(c.className)}
              </Text>
            )}
            <Text style={[s.headSub, { fontSize: fontOf - 1 }, t?.manual && s.manual, !t && { color: '#d1d5db' }]} numberOfLines={1}>
              {t?.name || '담임 미배정'}
            </Text>
          </TouchableOpacity>
        );
      })}
      {extras.map((e) => {
        const sub = e.teacherRole ? resolvers.resolveForeign(e.teacherRole)?.name : e.teacherName;
        return (
          <TouchableOpacity key={e.key} style={[s.headCell, s.extraHead, { width: widthOf(isMergedColumn(e)) }]} onPress={() => onExtraHead(e.key)}>
            {columnLabelLines(e.label || '전담').map((l, i) => (
              <Text key={i} style={[s.headLabel, { fontSize: fontOf }]} numberOfLines={1}>
                {l}
              </Text>
            ))}
            {!!sub && (
              <Text style={[s.headSub, { fontSize: fontOf - 1 }]} numberOfLines={1}>
                {sub}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const timeHead = (b: (typeof blocks)[number], n: number, h: number) => {
    if (layout === 'date') {
      const label = dateLabelFor(b, campStartMs);
      return (
        <TouchableOpacity style={[s.timeCell, { width: TIME_W, height: h }]} onPress={() => onRow(b.id)} disabled={selecting}>
          <Text style={s.timeStart} numberOfLines={2}>
            {label || '날짜?'}
          </Text>
          {!!b.dayOffsets?.length && <Text style={s.timeEnd}>{b.dayOffsets.join(',')}일차</Text>}
        </TouchableOpacity>
      );
    }
    const per = h / Math.max(1, b.kind === 'shared' ? 1 : n);
    return (
      <TouchableOpacity style={{ width: TIME_W }} onPress={() => onRow(b.id)} disabled={selecting}>
        {(b.kind === 'shared' ? [b.times?.[0] ? { start: b.times[0].start, end: b.times[b.times.length - 1]?.end } : undefined] : Array.from({ length: n }, (_, i) => b.times?.[i])).map(
          (t, i, arr) => (
            <View key={i} style={[s.timeCell, { height: per }, i < arr.length - 1 && s.softBottom]}>
              <Text style={s.timeStart}>{t?.start ?? ''}</Text>
              {!!t?.end && <Text style={s.timeEnd}>~{t.end}</Text>}
            </View>
          )
        )}
        <View style={s.rowEditMark}>
          <Ionicons name="create-outline" size={9} color={C.faint} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator style={s.card} keyboardShouldPersistTaps="handled">
      <View>
        {header}
        {blocks.length > 0 && gap(blocks[0].id, 'before', 'gap-top')}
        {blocks.map((b) => {
          const n = lineCountOf(b, layout);
          if (b.kind === 'shared') {
            return (
              <React.Fragment key={b.id}>
                <View style={s.row}>
                  {timeHead(b, 1, SHARED_H)}
                  <TouchableOpacity
                    style={[s.sharedCell, { width: sharedW, height: SHARED_H, backgroundColor: b.color ?? C.bg2 }]}
                    onPress={() => onRow(b.id)}
                    disabled={selecting}
                  >
                    <Text style={[s.sharedText, { fontSize: fontOf }, !b.label && { color: C.faint }]} numberOfLines={2}>
                      {b.label || '(이름 없는 공통 줄)'}
                      {!!b.subLabel && <Text style={[s.subLabel, { fontSize: fontOf - 2 }]}>  {b.subLabel}</Text>}
                    </Text>
                  </TouchableOpacity>
                  {extras.map((e) => {
                    const text = b.cells?.[e.key]?.texts?.[0] ?? '';
                    return (
                      <TouchableOpacity
                        key={e.key}
                        style={[s.cell, { width: widthOf(isMergedColumn(e)), height: SHARED_H, backgroundColor: b.color ?? C.bg2 }]}
                        onPress={() => onCell(b.id, e.key)}
                        disabled={selecting}
                      >
                        <Text style={[s.cellText, { fontSize: fontOf }, !!text && s.manual]} numberOfLines={1}>
                          {text}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {gap(b.id, 'after', `gap-${b.id}`)}
              </React.Fragment>
            );
          }
          const h = cellH * n;
          return (
            <React.Fragment key={b.id}>
              <View style={s.row}>
                {timeHead(b, n, h)}
                {table.classes.map((c) => renderClassCell(b, c.classCode, classW, n, h))}
                {extras.map((e) => {
                  if (!isMergedColumn(e)) return renderClassCell(b, e.key, classW, n, h);
                  const merged = mergedColumnName(e, b, dutyMap, resolvers.resolveTeacher, resolvers.resolveForeign);
                  return (
                    <TouchableOpacity
                      key={e.key}
                      style={[s.cell, { width: DUTY_W, height: h }]}
                      onPress={() => onCell(b.id, e.key)}
                      disabled={selecting}
                    >
                      <Text style={[s.cellText, { fontSize: fontOf }, merged?.muted && s.muted, merged?.manual && s.manual]} numberOfLines={2}>
                        {merged?.text ?? ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {gap(b.id, 'after', `gap-${b.id}`)}
            </React.Fragment>
          );
        })}
      </View>
    </ScrollView>
  );

  function renderClassCell(b: (typeof blocks)[number], key: string, w: number, n: number, h: number) {
    const cell = b.cells?.[key];
    const parts = renderCell(cell, n, ctxFor(key));
    const spec = findSubject(subjects, cell?.subject);
    const joined = isJoinedPair(subjects, cell?.subject);
    const on = isSel(b.id, key);
    return (
      <TouchableOpacity
        key={key}
        activeOpacity={0.6}
        delayLongPress={350}
        onPress={() => onCell(b.id, key)}
        onLongPress={() => onCellLong(b.id, key)}
        style={[s.cellGroup, { width: w, height: h, backgroundColor: spec?.color ?? b.color ?? '#fff' }]}
      >
        {Array.from({ length: n }, (_, i) => (
          <View
            key={i}
            style={[
              s.line,
              { height: h / n },
              n > 1 && joined ? (i === 0 ? s.pairTop : s.pairBottom) : null,
              i < n - 1 && !joined && s.lineDivider,
            ]}
          >
            <Lines line={parts[i]} size={fontOf} />
          </View>
        ))}
        {!!cell?.note && <View style={s.noteDot} />}
        {!!cell?.partnerRole && <Text style={s.roleTag}>{cell.partnerRole}</Text>}
        {on && <View style={s.selOverlay} pointerEvents="none" />}
      </TouchableOpacity>
    );
  }
}

const BORDER = '#e5e7eb';
const BORDER_HARD = '#d1d5db';

const s = StyleSheet.create({
  card: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, backgroundColor: '#fff' },
  headRow: { flexDirection: 'row', backgroundColor: C.bg },
  headCell: {
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
    borderBottomColor: BORDER_HARD,
    paddingVertical: 5,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraHead: { backgroundColor: '#f8fafc' },
  headTime: { fontSize: 10, color: C.muted, fontWeight: '500' },
  headLabel: { fontWeight: '700', color: C.text },
  headName: { color: C.text2, marginTop: 1 },
  headSub: { color: '#4b5563', marginTop: 1 },
  manual: { textDecorationLine: 'underline', textDecorationStyle: 'dotted', textDecorationColor: C.faint },

  row: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: BORDER_HARD },
  timeCell: { borderRightWidth: 1, borderColor: BORDER, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  softBottom: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  timeStart: { fontSize: 10.5, color: C.text2, fontWeight: '600', textAlign: 'center', lineHeight: 13 },
  timeEnd: { fontSize: 9, color: C.faint, textAlign: 'center', lineHeight: 11 },
  rowEditMark: { position: 'absolute', right: 2, top: 2 },

  sharedCell: { borderRightWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  sharedText: { fontWeight: '500', color: C.text2, textAlign: 'center' },
  subLabel: { color: C.muted, fontWeight: '400' },

  cell: { borderRightWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  cellGroup: { borderRightWidth: 1, borderColor: BORDER },
  line: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 },
  lineDivider: { borderBottomWidth: 1, borderBottomColor: BORDER_HARD },
  pairTop: { justifyContent: 'flex-end', paddingBottom: 1 },
  pairBottom: { justifyContent: 'flex-start', paddingTop: 1 },
  noteDot: { position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: 3, backgroundColor: C.orange },
  roleTag: { position: 'absolute', bottom: 1, right: 2, fontSize: 7.5, color: C.blueText },
  selOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: C.blue, backgroundColor: 'rgba(37,99,235,0.12)' },

  cellText: { fontSize: 11, color: C.text, textAlign: 'center', lineHeight: 13 },
  name: { color: '#64748b' },
  nameMuted: { color: '#94a3b8' },
  muted: { color: C.faint },
  sub: { fontSize: 9.5, color: '#64748b', textAlign: 'center', lineHeight: 11 },
  room: { fontSize: 9.5, color: C.faint, textAlign: 'center', lineHeight: 11 },
  dash: { fontSize: 11, color: '#d1d5db' },

  gap: { height: GAP_H, flexDirection: 'row', alignItems: 'center' },
  plus: {
    width: TIME_W - 18,
    marginLeft: 9,
    height: 13,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: C.blueLine,
    backgroundColor: C.blueBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gapLine: { flex: 1, height: 1, backgroundColor: 'transparent' },
});
