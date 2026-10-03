/**
 * 칸 편집 (바텀시트) — 웹의 칸 팝오버와 같은 항목.
 * 과목 / 직접 쓰기 · ⇅ 위·아래 순서 · 강의실 · 짝 강의실(+열 전체 채우기) · 메모 · 짝 원어민 역할 · 이 줄 전체에 / 이 반 모든 줄에.
 * 전담 열(당번·한 역할·고정 글) 칸은 "이 줄만 다른 사람" 이름 하나.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import {
  dutyByBlock,
  findSubject,
  isMergedColumn,
  lineCountOf,
  mergedColumnName,
  renderCell,
  sortBlocks,
  timetableDraft as D,
  type CampTimetable,
  type RenderContext,
  type TimetableSubject,
} from '@smis-mentor/shared';
import { Btn, C, Chip, Field, InlineSelect, Input, Notice, Seg, Sheet, u, type EditTable } from './common';

export function CellSheet({
  at,
  onClose,
  table,
  shown,
  subjects,
  resolvers,
  edit,
  blockTitle,
}: {
  at: { blockId: string; colKey: string } | null;
  onClose: () => void;
  /** 고칠 표 (저장되는 모양) */
  table: CampTimetable | null;
  /** 그릴 표 (이름·반 정보를 입힌 것) */
  shown: CampTimetable | null;
  subjects: TimetableSubject[];
  resolvers: Pick<RenderContext, 'resolveForeign' | 'resolveTeacher'>;
  edit: EditTable;
  blockTitle: (blockId: string) => string;
}) {
  const block = at && table ? table.blocks.find((b) => b.id === at.blockId) : undefined;
  const colKey = at?.colKey ?? '';
  const extra = table?.extraColumns?.find((e) => e.key === colKey);
  const cls = shown?.classes.find((c) => c.classCode === colKey);
  const cell = block?.cells?.[colKey];
  const layout = table?.layout ?? 'time';
  const n = block ? lineCountOf(block, layout) : 1;
  const [mode, setMode] = useState<'subject' | 'text'>('subject');
  useEffect(() => {
    setMode(cell?.texts?.length ? 'text' : 'subject');
    // 다른 칸을 열 때만 다시 고른다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at?.blockId, at?.colKey]);

  if (!at || !table || !block) return <Sheet visible={false} onClose={onClose} title="">{null}</Sheet>;

  const k = (f: string) => `${f}:${block.id}:${colKey}`;
  const title = `${cls ? cls.classCode : extra?.label || colKey} · ${blockTitle(block.id)}`;
  const subtitle = cls
    ? [cls.className, resolvers.resolveTeacher(cls.classCode)?.name].filter(Boolean).join(' · ')
    : extra
      ? '전담 열'
      : '';

  // ── 전담 열 칸 (당번 · 한 역할 · 고정 글) 또는 공통 줄의 전담 칸 — 이름 하나만 ──
  if ((extra && isMergedColumn(extra)) || block.kind === 'shared') {
    const auto =
      extra && isMergedColumn(extra)
        ? mergedColumnName(
            extra,
            { id: block.id, cells: undefined },
            { [extra.key]: dutyByBlock(table.blocks, layout, extra.dutyRotation) },
            resolvers.resolveTeacher,
            resolvers.resolveForeign
          )
        : undefined;
    const override = cell?.texts?.[0] ?? '';
    return (
      <Sheet visible onClose={onClose} title={title} subtitle={subtitle}>
        <Field
          label={block.kind === 'shared' ? '이 줄에 넣을 글' : '이 줄만 다른 사람'}
          hint={auto ? `비워 두면 "${auto.text}" (순번·담당대로 자동)` : '비워 두면 빈칸입니다.'}
        >
          <Input
            value={override}
            onChangeText={(v) => edit((t) => D.setCellTexts(t, block.id, colKey, v ? [v] : []), k('override'))}
            placeholder={auto?.text ?? '—'}
            manual={!!override}
          />
        </Field>
        {!!override && <Btn label="자동으로 되돌리기" onPress={() => edit((t) => D.setCellTexts(t, block.id, colKey, []))} />}
      </Sheet>
    );
  }

  const spec = findSubject(subjects, cell?.subject);
  const ctx: RenderContext = { subjects, columnKey: colKey, ...resolvers, patternLabel: 'Pattern' };
  const preview = renderCell(cell, n, ctx);
  const hasPartner = n > 1 && !!spec && spec.partner !== 'none' && spec.partner !== 'staff';
  const partnerIdx = cell?.partnerFirst ? 0 : 1;
  const foreignKeys = subjects.filter((x) => x.partner === 'foreign').map((x) => x.key);
  const texts = Array.from({ length: n }, (_, i) => cell?.texts?.[i] ?? '');
  const rowCount = sortBlocks(table.blocks, layout).filter((b) => b.kind === 'class').length;

  return (
    <Sheet visible onClose={onClose} title={title} subtitle={subtitle}>
      {/* 미리보기 — 표에 찍히는 모양 */}
      <View style={[s.preview, { backgroundColor: spec?.color ?? block.color ?? '#fff' }]}>
        {preview.map((l, i) => (
          <Text key={i} style={[s.previewLine, !l.text && { color: '#d1d5db' }, l.muted && { color: C.faint }]} numberOfLines={1}>
            {l.room ? `[${l.room}] ` : ''}
            {l.text || '—'}
            {l.sub ? `  ${l.sub}` : ''}
          </Text>
        ))}
      </View>

      <Seg
        items={[
          { key: 'subject', label: '과목' },
          { key: 'text', label: '직접 쓰기' },
        ]}
        value={mode}
        onChange={setMode}
        style={{ marginBottom: 10 }}
      />

      {mode === 'subject' ? (
        <View style={[u.wrap, { marginBottom: 12 }]}>
          {subjects.map((sub) => (
            <Chip
              key={sub.key}
              label={sub.key}
              color={sub.color ?? '#fff'}
              on={cell?.subject?.toLowerCase() === sub.key.toLowerCase()}
              onPress={() => edit((t) => D.setCellSubject(t, block.id, colKey, sub.key))}
            />
          ))}
          <Chip label="비우기" dashed onPress={() => edit((t) => D.setCellSubject(t, block.id, colKey, ''))} />
        </View>
      ) : (
        <View style={{ marginBottom: 12 }}>
          {texts.map((v, i) => (
            <Input
              key={i}
              value={v}
              onChangeText={(x) =>
                edit((t) => {
                  const next = Array.from({ length: n }, (_, j) => t.blocks.find((b) => b.id === block.id)?.cells?.[colKey]?.texts?.[j] ?? '');
                  next[i] = x;
                  D.setCellTexts(t, block.id, colKey, next);
                }, k(`text${i}`))
              }
              placeholder={n > 1 ? `${i + 1}째 줄` : '칸에 넣을 글'}
              style={{ marginBottom: 6 }}
            />
          ))}
          <Text style={u.hint}>직접 쓴 글은 과목 규칙 없이 그대로 찍힙니다. 쓰면 과목은 비워집니다.</Text>
        </View>
      )}

      {hasPartner && (
        <TouchableOpacity style={s.flip} onPress={() => edit((t) => D.togglePartnerFirst(t, block.id, colKey))}>
          <Text style={s.flipText}>⇅ 위·아래 순서 바꾸기</Text>
          <Text style={s.flipSub}>지금: {cell?.partnerFirst ? `${preview[0]?.text} 먼저` : `${cell?.subject} 먼저`}</Text>
        </TouchableOpacity>
      )}

      {!!cell?.subject && (
        <>
          <View style={u.row}>
            <Field label="강의실" style={{ flex: 1 }}>
              <Input
                value={cell.room ?? ''}
                onChangeText={(v) => edit((t) => D.setCellField(t, block.id, colKey, 'room', v), k('room'))}
                placeholder={spec?.room || '과목 기본'}
              />
            </Field>
            {hasPartner && (
              <Field label={`${preview[partnerIdx]?.text || '짝'} 강의실`} style={{ flex: 1 }}>
                <Input
                  value={cell.partnerRoom ?? ''}
                  onChangeText={(v) => edit((t) => D.setCellField(t, block.id, colKey, 'partnerRoom', v), k('proom'))}
                  placeholder={spec?.partnerRoom || '과목 기본'}
                />
              </Field>
            )}
          </View>
          <View style={[u.wrap, { marginBottom: 10 }]}>
            <Btn
              label="이 강의실을 이 반 모든 칸에"
              icon="arrow-down"
              onPress={() => edit((t) => D.fillRoomDown(t, colKey, 'room', cell.room ?? ''))}
            />
            {hasPartner && (
              <Btn
                label="짝 강의실도 모든 칸에"
                icon="arrow-down"
                onPress={() => edit((t) => D.fillRoomDown(t, colKey, 'partnerRoom', cell.partnerRoom ?? ''))}
              />
            )}
          </View>
        </>
      )}

      {spec?.partner === 'foreign' && n > 1 && (
        <Field label="짝 원어민 역할" hint="이 칸만 다른 원어민이 붙을 때 (예: PBL 반마다 Speaking·Reading 원어민)">
          <InlineSelect
            value={cell?.partnerRole ?? ''}
            options={[{ key: '', label: `과목 기본 (${spec.key})` }, ...foreignKeys.map((f) => ({ key: f, label: `${f} 원어민` }))]}
            onChange={(v) => edit((t) => D.setCellField(t, block.id, colKey, 'partnerRole', v))}
          />
        </Field>
      )}

      <Field label="메모" hint="칸 아래 작게 붙는 보조 표시 (교재 코드 등)">
        <Input
          value={cell?.note ?? ''}
          onChangeText={(v) => edit((t) => D.setCellField(t, block.id, colKey, 'note', v), k('note'))}
          placeholder="메모"
        />
      </Field>

      {!!cell?.subject && (
        <View style={[u.wrap, { marginTop: 4 }]}>
          <Btn label="이 줄 전체에" icon="arrow-forward" onPress={() => edit((t) => D.fillRow(t, block.id, cell.subject!))} />
          <Btn
            label={`이 반 모든 줄에 (${rowCount})`}
            icon="arrow-down"
            onPress={() => edit((t) => D.fillColumn(t, colKey, cell.subject!))}
          />
        </View>
      )}
      {!subjects.length && <Notice text="과목이 없습니다. 아래 [과목·주제] 탭에서 추가하세요." tone="amber" />}
    </Sheet>
  );
}

const s = StyleSheet.create({
  preview: { borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 10, gap: 2 },
  previewLine: { fontSize: 12.5, color: C.text, textAlign: 'center' },
  flip: { borderWidth: 1, borderColor: C.blueLine, backgroundColor: C.blueBg, borderRadius: 8, padding: 9, marginBottom: 10 },
  flipText: { fontSize: 13, fontWeight: '600', color: C.blueText },
  flipSub: { fontSize: 11, color: C.muted, marginTop: 2 },
});
