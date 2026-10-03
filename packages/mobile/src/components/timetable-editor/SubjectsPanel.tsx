/**
 * 과목·주제 (이 표만) — 과목마다 이름 · 색 · 윗 칸 담당 · 강의실 · 아래 칸 규칙 · 담당 반 · 역할 · Pattern 짝.
 * [+ 과목] [삭제] [주제1~N 로 채우기] [로테이션 채우기] · 캠프 전체에서 이름 바꾸기.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DEFAULT_SUBJECTS,
  findCategory,
  timetableDraft as D,
  timetableWorkspace as W,
  type CampTimetable,
  type SubjectPartner,
  type TimetableClassColumn,
  type RenderContext,
} from '@smis-mentor/shared';
import {
  Btn,
  C,
  ColorPicker,
  Field,
  IconBtn,
  InlineSelect,
  Input,
  Notice,
  PARTNER_OPTIONS,
  RenameInput,
  SectionHead,
  partnerLabel,
  staffRolesOf,
  subjectsOf,
  u,
  type EditTable,
  type SetWs,
} from './common';

export function SubjectsPanel({
  table,
  exists,
  classes,
  staffByRole,
  resolvers,
  edit,
  setWs,
  onRenameCamp,
  onDone,
}: {
  table: CampTimetable;
  /** 작업 공간에 있는 표인지 (빈 뼈대가 아니면 true) */
  exists: boolean;
  /** 담당 반 고르기용 — 반이름이 입혀진 반 목록 */
  classes: TimetableClassColumn[];
  staffByRole: Record<string, string>;
  resolvers: Pick<RenderContext, 'resolveTeacher'>;
  edit: EditTable;
  setWs: SetWs;
  onRenameCamp: (subjectKey: string) => void;
  onDone: (msg: string) => void;
}) {
  const cat = findCategory(table.dayType);
  const subjects = subjectsOf(table);
  const roles = staffRolesOf(subjects, staffByRole);
  const [open, setOpen] = useState<number | null>(null);

  const usedCount = (key: string) =>
    table.blocks.reduce(
      (n, b) => n + Object.values(b.cells ?? {}).filter((c) => c.subject?.toLowerCase() === key.toLowerCase()).length,
      0
    );

  /** 이름 입력 중 — 칸이 함께 따라간다 (칸 설명은 입력을 마쳤을 때) */
  const renameLive = (i: number, v: string) => {
    if (!exists) {
      edit((t) => D.updateSubject(t, i, { key: v }));
      return;
    }
    setWs((w0) => {
      let w = w0;
      if (!w.cur.tables[table.id]?.subjects?.length) {
        w = W.editTable(w, table.id, (t) => {
          t.subjects = DEFAULT_SUBJECTS.map((x) => ({ ...x }));
        });
      }
      const old = w.cur.tables[table.id]?.subjects?.[i]?.key;
      return old == null ? w : W.renameSubjectTyping(w, table.id, old, v);
    });
  };

  const removeSubject = (i: number) => {
    const key = subjects[i]?.key;
    const n = key ? usedCount(key) : 0;
    const run = () => {
      edit((t) => D.removeSubject(t, i));
      setOpen(null);
    };
    if (!n) return run();
    Alert.alert('과목 삭제', `"${key}" 를 칸 ${n}개에서 쓰고 있습니다. 지우면 그 칸들은 과목 설명 없이 이름만 남습니다. 지울까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: run },
    ]);
  };

  const rotate = () => {
    const keys = D.rotationKeysOf(table);
    const warn = D.rotationWarning(table);
    if (!keys.length) {
      Alert.alert('로테이션 채우기', warn ?? '로테이션에 쓸 과목이 없습니다.');
      return;
    }
    const rows = table.blocks.filter((b) => b.kind === 'class').length;
    Alert.alert('로테이션 채우기', `반별 줄 ${rows}개의 반 칸을 모두 바꿉니다.\n${keys.join(' → ')} 순으로 한 칸씩 밀어 채웁니다.${warn ? `\n\n⚠ ${warn}` : ''}`, [
      { text: '취소', style: 'cancel' },
      {
        text: '채우기',
        onPress: () => {
          edit((t) => void D.applyRotation(t));
          onDone('로테이션으로 채웠습니다');
        },
      },
    ]);
  };

  const teacherOptions = [
    { key: '', label: '없음' },
    { key: 'ownTeacher', label: '그 반 담임' },
    ...roles.map((r) => ({ key: r.key, label: r.label })),
  ];
  const classOptions = [
    { key: '', label: '담당 반 고르기' },
    ...classes.map((c) => ({
      key: c.classCode,
      label: `${c.classCode}${c.className ? ` ${c.className}` : ''}`,
      sub: resolvers.resolveTeacher(c.classCode)?.name ?? '담임 미배정',
    })),
  ];

  return (
    <View>
      <SectionHead title={`과목·주제 (${subjects.length})`} scope="이 표만" />
      {cat?.noSubjects && <Notice tone="amber" text="이 Day 는 칸에 직접 글을 쓰는 날입니다. 칸을 눌러 [직접 쓰기] 로 넣으세요. 과목을 써도 됩니다." />}
      {!table.subjects?.length && <Text style={[u.hint, { marginTop: 0, marginBottom: 8 }]}>아직 이 표만의 과목이 없어 기본 과목을 보여 줍니다. 고치면 이 표의 과목이 됩니다.</Text>}

      {subjects.map((sub, i) => {
        const isOpen = open === i;
        const n = usedCount(sub.key);
        return (
          <View key={i} style={[s.item, isOpen && s.itemOpen]}>
            <TouchableOpacity style={s.itemHead} onPress={() => setOpen(isOpen ? null : i)}>
              <View style={[s.swatch, { backgroundColor: sub.color ?? '#fff' }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.itemName} numberOfLines={1}>
                  {sub.key}
                </Text>
                <Text style={s.itemSub} numberOfLines={1}>
                  아래 칸: {partnerLabel(sub.partner)}
                  {sub.room ? ` · ${sub.room}` : ''}
                  {n ? ` · 칸 ${n}` : ''}
                </Text>
              </View>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.faint} />
            </TouchableOpacity>

            {isOpen && (
              <View style={{ paddingTop: 8 }}>
                <Field label="이름">
                  <RenameInput
                    value={sub.key}
                    onLive={(v) => renameLive(i, v)}
                    onDone={(from, to) => setWs((w) => W.carryGuideAfterRename(w, from, to))}
                  />
                </Field>
                <Btn label="캠프 전체에서 이 이름 바꾸기…" kind="soft" style={{ alignSelf: 'flex-start', marginBottom: 10 }} onPress={() => onRenameCamp(sub.key)} />
                <Field label="색">
                  <ColorPicker value={sub.color} onChange={(c) => edit((t) => D.updateSubject(t, i, { color: c }), `subj-color:${i}`)} />
                </Field>
                <Field label="아래 칸 규칙">
                  <InlineSelect<SubjectPartner>
                    value={sub.partner ?? 'none'}
                    options={PARTNER_OPTIONS}
                    onChange={(v) => edit((t) => D.updateSubject(t, i, { partner: (v || 'none') as SubjectPartner }))}
                  />
                </Field>

                {sub.partner === 'staff' ? (
                  <Field label="칸에 이름이 찍힐 역할">
                    <InlineSelect
                      value={sub.roleKey?.toLowerCase() ?? ''}
                      options={[{ key: '', label: '누구 이름?' }, ...roles]}
                      onChange={(v) => edit((t) => D.updateSubject(t, i, { roleKey: v || undefined }))}
                    />
                    <Input
                      value={sub.roleKey ?? ''}
                      onChangeText={(v) => edit((t) => D.updateSubject(t, i, { roleKey: v || undefined }), `subj-role:${i}`)}
                      placeholder="직접 입력 (예: 매니저)"
                      style={{ marginTop: 6 }}
                    />
                  </Field>
                ) : (
                  <View style={u.row}>
                    <Field label="윗 칸 담당" style={{ flex: 1.3 }}>
                      <InlineSelect
                        value={sub.teacherRole ?? ''}
                        options={teacherOptions}
                        onChange={(v) => edit((t) => D.updateSubject(t, i, { teacherRole: v || undefined }))}
                      />
                    </Field>
                    <Field label="강의실" style={{ flex: 1 }}>
                      <Input
                        value={sub.room ?? ''}
                        onChangeText={(v) => edit((t) => D.updateSubject(t, i, { room: v || undefined }), `subj-room:${i}`)}
                        placeholder="예: 243"
                      />
                    </Field>
                  </View>
                )}

                {sub.partner === 'owner' && (
                  <Field label="담당 반" hint="아래 칸에 이 반의 담임 이름이 찍힙니다. 주제가 반을 돌면 담임도 함께 돕니다.">
                    <InlineSelect
                      value={sub.ownerClassCode ?? ''}
                      options={classOptions}
                      onChange={(v) => edit((t) => D.updateSubject(t, i, { ownerClassCode: v || undefined }))}
                    />
                  </Field>
                )}

                {sub.partner === 'pattern' && (
                  <View style={s.pair}>
                    <Text style={s.pairTitle}>└ 아래 칸 (짝 수업)</Text>
                    <View style={u.row}>
                      <Field label="수업 이름" style={{ flex: 1 }}>
                        <Input
                          value={sub.partnerLabel ?? ''}
                          onChangeText={(v) => edit((t) => D.updateSubject(t, i, { partnerLabel: v || undefined }), `subj-plabel:${i}`)}
                          placeholder="Pattern"
                        />
                      </Field>
                      <Field label="강의실" style={{ flex: 1 }}>
                        <Input
                          value={sub.partnerRoom ?? ''}
                          onChangeText={(v) => edit((t) => D.updateSubject(t, i, { partnerRoom: v || undefined }), `subj-proom:${i}`)}
                          placeholder="강의실"
                        />
                      </Field>
                    </View>
                    <Field label="짝 담당">
                      <InlineSelect
                        value={sub.partnerTeacherRole ?? '수업'}
                        options={teacherOptions}
                        onChange={(v) => edit((t) => D.updateSubject(t, i, { partnerTeacherRole: v || '' }))}
                      />
                    </Field>
                  </View>
                )}

                <View style={[u.row, { justifyContent: 'flex-end' }]}>
                  <IconBtn name="trash-outline" color={C.red} onPress={() => removeSubject(i)} />
                  <Text style={{ fontSize: 12, color: C.red }} onPress={() => removeSubject(i)}>
                    과목 삭제
                  </Text>
                </View>
              </View>
            )}
          </View>
        );
      })}

      <View style={[u.wrap, { marginTop: 6 }]}>
        <Btn
          label="+ 과목"
          onPress={() => {
            edit((t) => D.addSubject(t));
            setOpen(subjects.length);
          }}
        />
        {!!cat?.rotation && (
          <Btn
            label={`주제1~${table.classes.length} 로 채우기`}
            onPress={() =>
              Alert.alert('주제 채우기', `과목을 주제1~${table.classes.length} 로 바꾸고 각 주제의 담당 반을 반 순서대로 정합니다.`, [
                { text: '취소', style: 'cancel' },
                { text: '채우기', onPress: () => edit((t) => D.resetRotationSubjects(t)) },
              ])
            }
          />
        )}
        <Btn label="로테이션 채우기" icon="sync-outline" onPress={rotate} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  item: { borderWidth: 1, borderColor: C.line, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6, backgroundColor: '#fff' },
  itemOpen: { borderColor: C.blueLine },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  swatch: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: C.lineStrong },
  itemName: { fontSize: 13.5, fontWeight: '600', color: C.text },
  itemSub: { fontSize: 11, color: C.muted, marginTop: 1 },
  pair: { borderLeftWidth: 2, borderLeftColor: C.line, paddingLeft: 10, marginBottom: 6 },
  pairTitle: { fontSize: 11, color: C.faint, marginBottom: 6 },
});
