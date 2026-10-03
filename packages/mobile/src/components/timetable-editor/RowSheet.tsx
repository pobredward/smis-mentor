/**
 * 줄 편집 (바텀시트) — 웹의 줄 팝오버와 같은 항목.
 * 시간 표: 교시 수 · 시각 · 종류(반별/공통) · 공통 줄 이름·부제·색 · 위/아래에 줄 · 복제 · ▲▼ · 이 줄 모든 칸 과목 · 다른 표에도 같은 시간 · 삭제
 * 날짜 표: 날짜 표기 · n일차 · 종류 · 이름 …
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Alert } from 'react-native';
import {
  dateLabelFor,
  sortBlocks,
  timetableDraft as D,
  type CampTimetable,
  type TimetableSubject,
} from '@smis-mentor/shared';
import { Btn, C, Chip, ColorPicker, Field, Input, Notice, RenameInput, Seg, Sheet, TimeInput, u, type EditTable } from './common';

export interface BulkTimeRef {
  label?: string;
  start?: string;
  kind?: 'shared' | 'class';
  times?: Array<{ start: string; end: string }>;
}

export function RowSheet({
  blockId,
  onClose,
  table,
  subjects,
  edit,
  campStartMs,
  onInsert,
  onBulkTime,
  onRenameCamp,
  onCarryGuide,
}: {
  blockId: string | null;
  onClose: () => void;
  table: CampTimetable | null;
  subjects: TimetableSubject[];
  edit: EditTable;
  campStartMs: number | null;
  /** 이 줄 위·아래에 줄 넣기 (종류 고르기 포함) */
  onInsert: (refId: string, where: 'before' | 'after') => void;
  /** 일괄 변경 — 다른 표에도 같은 시간 */
  onBulkTime: (ref: BulkTimeRef) => void;
  /** 일괄 변경 — 캠프 전체에서 공통 줄 이름 바꾸기 */
  onRenameCamp: (label: string) => void;
  /** 공통 줄 이름 입력을 마쳤을 때 — 칸 설명이 새 이름을 따라가게 */
  onCarryGuide: (from: string, to: string) => void;
}) {
  const layout = table?.layout ?? 'time';
  const sorted = table ? sortBlocks(table.blocks, layout) : [];
  const idx = sorted.findIndex((b) => b.id === blockId);
  const block = idx >= 0 ? sorted[idx] : undefined;
  const [showFill, setShowFill] = useState(false);
  const [offsetsText, setOffsetsText] = useState('');
  useEffect(() => {
    setShowFill(false);
    setOffsetsText((block?.dayOffsets ?? []).join(', '));
    // 다른 줄을 열 때만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId]);

  if (!table || !block) return <Sheet visible={false} onClose={onClose} title="">{null}</Sheet>;

  const k = (f: string) => `${f}:${block.id}`;
  const isShared = block.kind === 'shared';
  const isDate = layout === 'date';
  const n = block.times?.length ?? 1;
  const hasCells = Object.values(block.cells ?? {}).some((c) => c.subject || c.texts?.some((x) => x.trim()));
  const title = isDate
    ? `${dateLabelFor(block, campStartMs) || '날짜 줄'} · ${isShared ? block.label || '공통 줄' : '반별 줄'}`
    : `${block.times?.[0]?.start ?? ''}~${block.times?.[n - 1]?.end ?? ''} · ${isShared ? block.label || '공통 줄' : '반별 줄'}`;

  const setKind = (kind: 'shared' | 'class') => {
    if (kind === block.kind) return;
    const apply = () =>
      edit((t) => {
        if (kind === 'shared') D.updateBlock(t, block.id, { kind, label: '', cells: undefined });
        else D.updateBlock(t, block.id, { kind, label: undefined, subLabel: undefined, cells: {}, ...(isDate ? { lines: 2 } : {}) });
      });
    const lost = kind === 'shared' ? hasCells : !!block.label?.trim();
    if (!lost) return apply();
    Alert.alert('줄 종류 바꾸기', kind === 'shared' ? '이 줄의 반별 칸 내용이 사라집니다. 바꿀까요?' : `공통 줄 이름 "${block.label}" 이 사라집니다. 바꿀까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '바꾸기', style: 'destructive', onPress: apply },
    ]);
  };

  const remove = () => {
    const doIt = () => {
      edit((t) => D.removeBlock(t, block.id));
      onClose();
    };
    if (!hasCells && !block.label?.trim()) return doIt();
    Alert.alert('줄 삭제', '이 줄을 지울까요? (저장을 눌러야 반영됩니다)', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: doIt },
    ]);
  };

  return (
    <Sheet visible onClose={onClose} title={title} subtitle={isShared ? '공통 줄 — 모든 반이 함께' : '반별 줄 — 반마다 과목'}>
      <Field label="종류">
        <Seg
          items={[
            { key: 'class', label: '반별 줄' },
            { key: 'shared', label: '공통 줄' },
          ]}
          value={block.kind}
          onChange={setKind}
        />
      </Field>

      {isDate ? (
        <>
          <Field label="날짜 표기" hint="n일차를 넣으면 캠프 시작일로 계산한 날짜가 우선합니다.">
            <Input
              value={block.dateLabel ?? ''}
              onChangeText={(v) => edit((t) => D.updateBlock(t, block.id, { dateLabel: v }), k('dateLabel'))}
              placeholder="1/6, 1/7"
            />
          </Field>
          <Field label="캠프 n일차 (쉼표로)" hint={block.dayOffsets?.length ? `→ ${dateLabelFor(block, campStartMs) || '캠프 시작일 없음'}` : '예: 2, 3 — 입소일이 1일차'}>
            <Input
              value={offsetsText}
              keyboardType="numbers-and-punctuation"
              onChangeText={(v) => {
                setOffsetsText(v);
                const nums = v
                  .split(/[,\s]+/)
                  .map((x) => parseInt(x, 10))
                  .filter((x) => Number.isFinite(x) && x > 0);
                edit((t) => D.updateBlock(t, block.id, { dayOffsets: nums.length ? nums : undefined }), k('offsets'));
              }}
              placeholder="2, 3"
            />
          </Field>
        </>
      ) : (
        <>
          {!isShared && (
            <Field label="교시 수">
              <Seg
                items={[
                  { key: '1', label: '1교시' },
                  { key: '2', label: '2교시 세트' },
                ]}
                value={String(Math.min(2, n)) as '1' | '2'}
                onChange={(v) => edit((t) => D.setPeriodCount(t, block.id, v === '2' ? 2 : 1))}
              />
            </Field>
          )}
          <Field label="시각" hint="930 · 9:30 · 9시30 모두 됩니다. 시각을 바꾸면 줄 순서가 시각대로 다시 맞춰집니다.">
            {(block.times ?? []).map((tm, i) => (
              <View key={i} style={[u.row, { marginBottom: 6 }]}>
                {(block.times?.length ?? 1) > 1 && <Text style={{ width: 34, fontSize: 11, color: C.muted }}>{i + 1}교시</Text>}
                <TimeInput value={tm.start} onCommit={(v) => edit((t) => D.updateTime(t, block.id, i, 'start', v))} />
                <Text style={{ color: C.faint }}>~</Text>
                <TimeInput value={tm.end} onCommit={(v) => edit((t) => D.updateTime(t, block.id, i, 'end', v))} placeholder="10:00" />
              </View>
            ))}
          </Field>
        </>
      )}

      {isShared && (
        <>
          <Field label="공통 줄 이름">
            <RenameInput
              value={block.label ?? ''}
              allowEmpty
              placeholder="Breakfast / P.E / 인문학 프로그램 …"
              onLive={(v) => edit((t) => D.updateBlock(t, block.id, { label: v }), k('label'))}
              onDone={onCarryGuide}
            />
          </Field>
          {(block.label ?? '').includes('인문학') && <Notice text="인문학 표가 이 자리에 붙습니다 (보기 화면에서 이 줄 아래에 인문학 표가 함께 보입니다)." />}
          {!!block.label?.trim() && (
            <Btn label="캠프 전체에서 이 이름 바꾸기…" kind="soft" style={{ alignSelf: 'flex-start', marginBottom: 10 }} onPress={() => onRenameCamp(block.label!)} />
          )}
          <Field label="부제 (이름 아래 작게)">
            <Input
              value={block.subLabel ?? ''}
              onChangeText={(v) => edit((t) => D.updateBlock(t, block.id, { subLabel: v || undefined }), k('subLabel'))}
              placeholder="예: 직전 강의실에서 진행"
            />
          </Field>
        </>
      )}

      <Field label={isShared ? '줄 색' : '빈 칸 바탕색'}>
        <ColorPicker value={block.color} onChange={(c) => edit((t) => D.updateBlock(t, block.id, { color: c }))} />
      </Field>

      <View style={u.divider} />

      <View style={[u.wrap, { marginBottom: 8 }]}>
        <Btn label="위에 줄" icon="arrow-up" onPress={() => onInsert(block.id, 'before')} />
        <Btn label="아래에 줄" icon="arrow-down" onPress={() => onInsert(block.id, 'after')} />
        <Btn label="복제" icon="copy-outline" onPress={() => edit((t) => void D.duplicateBlock(t, block.id))} />
        <Btn label="▲ 올리기" disabled={idx <= 0} onPress={() => edit((t) => void D.moveBlock(t, block.id, -1))} />
        <Btn label="▼ 내리기" disabled={idx >= sorted.length - 1} onPress={() => edit((t) => void D.moveBlock(t, block.id, 1))} />
      </View>
      {!isDate && <Text style={[u.hint, { marginTop: -2, marginBottom: 8 }]}>▲▼ 는 윗줄·아랫줄과 시간대를 맞바꿉니다.</Text>}

      {!isShared && (
        <>
          <Btn label="이 줄 모든 칸에 같은 과목…" style={{ alignSelf: 'flex-start', marginBottom: 6 }} onPress={() => setShowFill((v) => !v)} />
          {showFill && (
            <View style={[u.wrap, { marginBottom: 10 }]}>
              {subjects.map((sub) => (
                <Chip key={sub.key} label={sub.key} color={sub.color ?? '#fff'} onPress={() => edit((t) => D.fillRow(t, block.id, sub.key))} />
              ))}
              <Chip label="모두 비우기" dashed onPress={() => edit((t) => D.fillRow(t, block.id, ''))} />
            </View>
          )}
        </>
      )}

      {!isDate && (
        <Btn
          label="다른 표에도 같은 시간…"
          kind="soft"
          icon="git-compare-outline"
          style={{ alignSelf: 'flex-start', marginBottom: 6 }}
          onPress={() =>
            onBulkTime(
              isShared && block.label?.trim()
                ? { label: block.label, times: block.times }
                : { start: block.times?.[0]?.start, kind: block.kind, times: block.times }
            )
          }
        />
      )}

      <View style={u.divider} />
      <Btn label="이 줄 삭제" kind="danger" icon="trash-outline" style={{ alignSelf: 'flex-start' }} onPress={remove} />
    </Sheet>
  );
}
