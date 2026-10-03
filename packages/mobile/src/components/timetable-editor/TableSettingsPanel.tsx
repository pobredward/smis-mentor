/**
 * 표 설정 (이 표만) — 표 메모, 전담 열(당번 로테이션 · 한 역할이 내내 · 고정 글 · 고정 교사 이름),
 * 이 표를 쓰는 날(커스텀 표), 이 표 삭제(저장 때 반영).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import {
  monthDayLabel,
  timetableDraft as D,
  type CampTimetable,
  type RenderContext,
  type TimetableClassColumn,
  type TimetableExtraColumn,
} from '@smis-mentor/shared';
import { Btn, C, Chip, Field, InlineSelect, Input, Notice, SectionHead, datesText, u, type EditTable } from './common';

const KIND_OPTIONS: Array<{ key: D.ExtraColumnKind; label: string; sub: string }> = [
  { key: 'duty', label: '당번 로테이션', sub: '반별 줄마다 반이 순서대로 돌아가며 맡는다 (공통 줄은 건너뜀)' },
  { key: 'staffRole', label: '한 역할이 내내', sub: '이 역할 담당자 이름이 줄을 합쳐 한 번' },
  { key: 'staticText', label: '고정 글', sub: '사람 대신 늘 같은 표시 (예: -)' },
  { key: 'teacher', label: '고정 교사 이름', sub: '머리글에 이름, 칸은 줄마다 과목·글' },
];

export function TableSettingsPanel({
  table,
  exists,
  siblings,
  planDates,
  roles,
  classes,
  resolvers,
  edit,
  onDelete,
  focusColumn,
}: {
  table: CampTimetable;
  exists: boolean;
  /** 같은 Day·그룹의 표 전부 (이 표 포함) */
  siblings: CampTimetable[];
  /** 일정표에서 이 Day 를 여는 날짜 */
  planDates: string[];
  roles: Array<{ key: string; label: string }>;
  classes: TimetableClassColumn[];
  resolvers: Pick<RenderContext, 'resolveTeacher'>;
  edit: EditTable;
  onDelete: () => void;
  focusColumn?: string | null;
}) {
  const isBase = !table.dates?.length;
  const others = siblings.filter((t) => t.id !== table.id);
  const takenByOthers = new Set(others.flatMap((t) => t.dates ?? []));
  const free = planDates.filter((d) => !takenByOthers.has(d));
  const candidates = [...new Set([...planDates, ...(table.dates ?? [])])].sort();

  const toggleDate = (d: string) => {
    const on = !!table.dates?.includes(d);
    if (on && (table.dates?.length ?? 0) <= 1) {
      Alert.alert('이 표를 쓰는 날', '커스텀 표에는 날짜가 하나 이상 있어야 합니다. 이 표가 필요 없으면 [이 표 삭제] 를 누르세요.');
      return;
    }
    edit((t) => D.toggleDate(t, d));
  };

  const confirmDelete = () => {
    const baseWarn =
      isBase && others.length
        ? `\n\n기본 표입니다. 지우면 커스텀 표가 맡지 않은 날에는 남은 표(${datesText(others[0].dates) || '날짜 미정'})가 대신 쓰입니다.`
        : '';
    Alert.alert('표 삭제', `"${table.groupName} · ${table.dayTypeLabel}${isBase ? '' : ` · ${datesText(table.dates)}`}" 를 지울까요? 저장을 눌러야 반영됩니다.${baseWarn}`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <View>
      <SectionHead title="표 메모" scope="이 표만" />
      <Input
        value={table.note ?? ''}
        onChangeText={(v) => edit((t) => void (t.note = v), 'note')}
        placeholder="표 아래에 붙는 안내"
        multiline
        style={{ minHeight: 56, textAlignVertical: 'top', marginBottom: 14 }}
      />

      <SectionHead title={`전담 열 (${table.extraColumns?.length ?? 0})`} scope="이 표만" />
      {(table.extraColumns ?? []).map((e) => (
        <ExtraColumnCard
          key={e.key}
          col={e}
          focused={focusColumn === e.key}
          roles={roles}
          classes={classes}
          resolvers={resolvers}
          edit={edit}
        />
      ))}
      <Text style={[u.hint, { marginTop: 0, marginBottom: 6 }]}>열 추가</Text>
      <View style={[u.wrap, { marginBottom: 16 }]}>
        {KIND_OPTIONS.map((k) => (
          <Btn key={k.key} label={`+ ${k.label}`} onPress={() => edit((t) => void D.addExtraColumn(t, k.key, k.key === 'duty' ? '교무실조' : '전담'))} />
        ))}
      </View>

      <SectionHead title={isBase ? '이 표를 쓰는 날 — 기본 표' : '이 표를 쓰는 날 — 커스텀 표'} scope="이 표만" />
      {isBase ? (
        <Notice
          tone="gray"
          text={
            planDates.length
              ? `커스텀 표가 맡지 않은 날: ${free.length ? free.map(monthDayLabel).join(', ') : '없음'}\n(기본 표의 날짜는 정할 수 없습니다 — 다른 날짜용은 [+ 커스텀 표] 로)`
              : '일정표에 이 Day 날짜가 없습니다. 일정표 탭에서 날짜를 정하면 여기에 보입니다.'
          }
        />
      ) : (
        <>
          <View style={[u.wrap, { marginBottom: 6 }]}>
            {candidates.map((d) => {
              const on = !!table.dates?.includes(d);
              const taken = !on && takenByOthers.has(d);
              return <Chip key={d} label={monthDayLabel(d)} on={on} disabled={taken} onPress={() => toggleDate(d)} />;
            })}
          </View>
          <Text style={[u.hint, { marginTop: 0, marginBottom: 14 }]}>회색 날짜는 다른 표가 맡은 날입니다.</Text>
        </>
      )}

      {exists && (
        <Btn label="이 표 삭제" kind="danger" icon="trash-outline" style={{ alignSelf: 'flex-start', marginTop: 6 }} onPress={confirmDelete} />
      )}
    </View>
  );
}

function ExtraColumnCard({
  col,
  focused,
  roles,
  classes,
  resolvers,
  edit,
}: {
  col: TimetableExtraColumn;
  focused: boolean;
  roles: Array<{ key: string; label: string }>;
  classes: TimetableClassColumn[];
  resolvers: Pick<RenderContext, 'resolveTeacher'>;
  edit: EditTable;
}) {
  const kind = D.extraColumnKindOf(col);
  const [picking, setPicking] = useState<number | null>(null);
  const k = (f: string) => `extra:${col.key}:${f}`;
  const setKind = (next: D.ExtraColumnKind | '') => {
    if (!next || next === kind) return;
    edit((t) => {
      const clear: Partial<TimetableExtraColumn> = { dutyRotation: undefined, staffRole: undefined, staticText: undefined, teacherName: undefined };
      const patch: Partial<TimetableExtraColumn> =
        next === 'duty'
          ? { dutyRotation: t.classes.map((c) => c.classCode) }
          : next === 'staffRole'
            ? { staffRole: '수업' }
            : next === 'staticText'
              ? { staticText: '-' }
              : { teacherName: '' };
      D.updateExtraColumn(t, col.key, { ...clear, ...patch });
    });
  };
  const remove = () =>
    Alert.alert('전담 열 삭제', `"${col.label}" 열과 그 칸 내용을 지울까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => edit((t) => D.removeExtraColumn(t, col.key)) },
    ]);
  const nameOf = (code: string) => resolvers.resolveTeacher(code)?.name ?? '미배정';

  return (
    <View style={[s.card, focused && { borderColor: C.blue }]}>
      <View style={u.row}>
        <Input
          value={col.label}
          onChangeText={(v) => edit((t) => D.updateExtraColumn(t, col.key, { label: v }), k('label'))}
          placeholder="열 이름 (예: 교무실(사진)조)"
          style={{ flex: 1, fontWeight: '600' }}
        />
        <TouchableOpacity onPress={remove} hitSlop={6}>
          <Text style={{ fontSize: 12, color: C.red }}>열 삭제</Text>
        </TouchableOpacity>
      </View>
      <Field label="종류" style={{ marginTop: 8 }}>
        <InlineSelect<D.ExtraColumnKind> value={kind} options={KIND_OPTIONS} onChange={setKind} />
      </Field>

      {kind === 'duty' && (
        <Field label="당번 순서" hint="반별 줄마다 이 순서대로 한 반씩 돌아갑니다. 칸을 눌러 반을 바꾸세요. 한 줄만 다른 사람이면 표에서 그 칸을 눌러 넣습니다.">
          <View style={u.wrap}>
            {(col.dutyRotation ?? []).map((code, i) => (
              <Chip key={`${i}-${code}`} label={`${i + 1}. ${code} ${nameOf(code)}`} on={picking === i} onPress={() => setPicking(picking === i ? null : i)} />
            ))}
            <Chip label="+" dashed onPress={() => edit((t) => D.updateExtraColumn(t, col.key, { dutyRotation: [...(col.dutyRotation ?? []), t.classes[0]?.classCode ?? ''] }))} />
            {(col.dutyRotation?.length ?? 0) > 1 && (
              <Chip label="−" dashed onPress={() => edit((t) => D.updateExtraColumn(t, col.key, { dutyRotation: (col.dutyRotation ?? []).slice(0, -1) }))} />
            )}
          </View>
          {picking !== null && (
            <View style={[u.wrap, s.pickBox]}>
              {classes.map((c) => (
                <Chip
                  key={c.classCode}
                  label={`${c.classCode} ${nameOf(c.classCode)}`}
                  onPress={() => {
                    const i = picking;
                    edit((t) => {
                      const rot = [...(t.extraColumns?.find((x) => x.key === col.key)?.dutyRotation ?? [])];
                      rot[i] = c.classCode;
                      D.updateExtraColumn(t, col.key, { dutyRotation: rot });
                    });
                    setPicking(null);
                  }}
                />
              ))}
            </View>
          )}
          <Btn
            label="반 순서대로 다시"
            style={{ alignSelf: 'flex-start', marginTop: 6 }}
            onPress={() => edit((t) => D.updateExtraColumn(t, col.key, { dutyRotation: t.classes.map((c) => c.classCode) }))}
          />
        </Field>
      )}

      {kind === 'staffRole' && (
        <Field label="맡는 역할">
          <InlineSelect value={col.staffRole?.toLowerCase() ?? ''} options={[{ key: '', label: '역할 고르기' }, ...roles]} onChange={(v) => v && edit((t) => D.updateExtraColumn(t, col.key, { staffRole: v }))} />
          <Input
            value={col.staffRole ?? ''}
            onChangeText={(v) => edit((t) => D.updateExtraColumn(t, col.key, { staffRole: v }), k('role'))}
            placeholder="직접 입력"
            style={{ marginTop: 6 }}
          />
        </Field>
      )}

      {kind === 'staticText' && (
        <Field label="늘 보일 글">
          <Input value={col.staticText ?? ''} onChangeText={(v) => edit((t) => D.updateExtraColumn(t, col.key, { staticText: v }), k('static'))} placeholder="-" />
        </Field>
      )}

      {kind === 'teacher' && (
        <>
          <Field label="고정 전담 교사 이름" hint="칸 내용은 표에서 줄마다 직접 넣습니다.">
            <Input value={col.teacherName ?? ''} onChangeText={(v) => edit((t) => D.updateExtraColumn(t, col.key, { teacherName: v }), k('teacher'))} placeholder="이름" />
          </Field>
          <Field label="또는 앱 배정에서 가져올 역할">
            <InlineSelect
              value={col.teacherRole?.toLowerCase() ?? ''}
              options={[{ key: '', label: '쓰지 않음' }, ...roles]}
              onChange={(v) => edit((t) => D.updateExtraColumn(t, col.key, { teacherRole: v || undefined }))}
            />
          </Field>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderWidth: 1, borderColor: C.line, borderRadius: 9, padding: 10, marginBottom: 8, backgroundColor: '#fff' },
  pickBox: { marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: C.bg },
});
