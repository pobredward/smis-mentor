/**
 * 학생 자유 메모 (반담당·방담당·그룹매니저) — ST 시트와 연동하지 않고 Firestore 에만 저장 (mobile)
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  L, logger, STUDENT_MEMO_KEYS, subscribeStudentMemo, saveStudentMemo,
  type StudentMemo, type StudentMemoKey, type MessageKey, type STSheetStudent,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';

const LABEL: Record<StudentMemoKey, MessageKey> = {
  classMemo: 'studentMemo.classMemo', unitMemo: 'studentMemo.unitMemo', groupMemo: 'studentMemo.groupMemo',
};
const when = (d?: Date) => (d ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '');

export function StudentMemoCard({ campCode, student, actor }: {
  campCode: string; student: STSheetStudent; actor: { uid: string; name: string };
}) {
  const [memoById, setMemoById] = useState<Record<string, StudentMemo | null>>({});
  const [editing, setEditing] = useState<{ key: StudentMemoKey; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const id = student.studentId;

  useEffect(() => {
    if (!campCode || !id) return;
    return subscribeStudentMemo(db, campCode, id, m => setMemoById(p => ({ ...p, [id]: m })), e => logger.warn('[memo]', e));
  }, [campCode, id]);
  const memo = memoById[id] ?? null;

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await saveStudentMemo(db, campCode, { studentId: id, name: student.name }, editing.key, editing.text, actor);
      setEditing(null);
    } catch (e) {
      logger.error('[memo] save', e);
      Alert.alert(L('studentMemo.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.card}>
      <View style={s.header}>
        <Ionicons name="create-outline" size={16} color="#4f46e5" />
        <Text style={s.title}>{L('studentMemo.title')}</Text>
      </View>
      <Text style={s.hint}>{L('studentMemo.hint')}</Text>
      {STUDENT_MEMO_KEYS.map(k => {
        const entry = memo?.[k];
        const isEdit = editing?.key === k;
        return (
          <View key={k} style={s.row}>
            <View style={s.rowTop}>
              <Text style={s.label}>{L(LABEL[k])}</Text>
              {!!entry && !isEdit && <Text style={s.meta}>{L('studentMemo.lastEdited', { v0: entry.by, v1: when(entry.at?.toDate?.()) })}</Text>}
              {!isEdit && !editing && (
                <TouchableOpacity onPress={() => setEditing({ key: k, text: entry?.text ?? '' })} style={s.editBtn} hitSlop={8}>
                  <Text style={s.editText}>{L('task.edit')}</Text>
                </TouchableOpacity>
              )}
            </View>
            {isEdit ? (
              <View style={{ gap: 6, marginTop: 6 }}>
                <TextInput autoFocus multiline value={editing.text} onChangeText={t => setEditing(p => (p ? { ...p, text: t } : p))}
                  placeholder={L('studentMemo.placeholder')} placeholderTextColor="#cbd5e1" style={s.input} />
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                  <TouchableOpacity onPress={() => setEditing(null)} disabled={busy} style={[s.btn, { backgroundColor: '#f3f4f6' }]}>
                    <Text style={{ color: '#4b5563', fontWeight: '600', fontSize: 13 }}>{L('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={save} disabled={busy} style={[s.btn, { backgroundColor: '#2563eb' }]}>
                    {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>{L('common.save')}</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <Text style={[s.text, !entry && { color: '#cbd5e1' }]}>{entry?.text || L('studentMemo.empty')}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 14, paddingBottom: 6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: '#111827' },
  hint: { fontSize: 10, color: '#9ca3af', marginTop: 2, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  row: { paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { flex: 1, fontSize: 12, color: '#6b7280' },
  meta: { fontSize: 10, color: '#9ca3af' },
  editBtn: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: '#eff6ff' },
  editText: { fontSize: 11, color: '#2563eb', fontWeight: '600' },
  text: { fontSize: 13, color: '#111827', fontWeight: '500', marginTop: 3 },
  input: { borderWidth: 1, borderColor: '#60a5fa', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#111827', minHeight: 72, textAlignVertical: 'top' },
  btn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, minWidth: 56, alignItems: 'center' },
});
