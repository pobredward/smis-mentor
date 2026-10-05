/**
 * 학부모 — 캠프 신청 · 신청서 고치기. 신청하면 '신청' 상태로 들어가고 운영진이 확정한다.
 * 확정 뒤에는 설문 · 단체티만 고칠 수 있다 (학년 · 여정은 반 배정에 쓰여 운영진에게).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { doc, getDoc } from 'firebase/firestore';
import {
  applicationQuestionsFor, campTypeOfCode, SCALE_CHOICES, ENROLLMENT_STATUS_LABEL, PARENT_EDITABLE_AFTER_CONFIRM,
  CAMPS_COLLECTION, ENROLLMENTS_SUBCOLLECTION, CHILDREN_COLLECTION, logger, getMyEnrollments,
  type ApplicationQuestion, type CampEnrollment, type OpenCamp,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';
import { getOpenCamps, parentCall } from '../services/parentApi';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';

export function ParentApplicationScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'ParentApplication'>>();
  const { childId, campCode: editCamp, studentId } = route.params;
  const { userData } = useAuth();
  const [childName, setChildName] = useState('');
  const [enrollment, setEnrollment] = useState<CampEnrollment | null>(null);
  const [camps, setCamps] = useState<OpenCamp[]>([]);
  const [campCode, setCampCode] = useState(editCamp ?? '');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const c = await getDoc(doc(db, CHILDREN_COLLECTION, childId));
        setChildName(String(c.get('name') ?? ''));
        if (editCamp && studentId) {
          const s = await getDoc(doc(db, CAMPS_COLLECTION, editCamp, ENROLLMENTS_SUBCOLLECTION, studentId));
          const e = s.exists() ? ({ ...(s.data() as CampEnrollment), studentId: s.id }) : null;
          setEnrollment(e);
          const init: Record<string, string> = {};
          if (e) for (const [k, v] of Object.entries(e)) if (typeof v === 'string') init[k] = v;
          setAnswers(init);
        } else {
          const [open, mine] = await Promise.all([getOpenCamps(), getMyEnrollments(db, userData?.userId ?? '')]);
          const taken = new Set(mine.filter((e) => e.childId === childId).map((e) => e.campCode));
          const avail = open.filter((oc) => !taken.has(oc.campCode));
          setCamps(avail);
          if (avail[0]) setCampCode(avail[0].campCode);
        }
      } catch (e) {
        logger.error('신청서 불러오기 실패:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [childId, editCamp, studentId, userData?.userId]);

  useEffect(() => {
    navigation.setOptions({ title: childName ? `${childName} 캠프 ${enrollment ? '신청서' : '신청'}` : '캠프 신청' });
  }, [childName, enrollment, navigation]);

  const confirmed = enrollment?.status === 'confirmed';
  const questions = useMemo(() => (campCode ? applicationQuestionsFor(campTypeOfCode(campCode)) : []), [campCode]);
  const locked = (q: ApplicationQuestion) => confirmed && !PARENT_EDITABLE_AFTER_CONFIRM.has(q.key);

  const save = async () => {
    if (!campCode) return;
    const missing = questions.filter((q) => q.required && !answers[q.key]?.trim() && !locked(q));
    if (missing.length) { Alert.alert('빠진 칸이 있어요', missing.map((q) => q.label).join(', ')); return; }
    setSaving(true);
    try {
      const payload = Object.fromEntries(questions.filter((q) => !locked(q)).map((q) => [q.key, answers[q.key] ?? '']));
      if (enrollment) {
        await parentCall('PUT', '/api/parent/enrollments', { campCode, studentId: enrollment.studentId, answers: payload });
      } else {
        await parentCall('POST', '/api/parent/enrollments', { campCode, childId, answers: payload });
        Alert.alert('신청했습니다', '운영진이 확인한 뒤 참가가 확정됩니다.');
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('저장하지 못했습니다', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const field = (q: ApplicationQuestion) => {
    const v = answers[q.key] ?? '';
    const set = (x: string) => setAnswers((cur) => ({ ...cur, [q.key]: x }));
    const disabled = locked(q);
    return (
      <View key={q.key} style={styles.field}>
        <Text style={styles.label}>{q.label}{q.required ? ' *' : ''}{disabled ? <Text style={styles.hint}>  (확정 뒤에는 운영진에게)</Text> : null}</Text>
        {q.kind === 'scale' ? (
          <View style={styles.scale}>
            {SCALE_CHOICES.map((c) => (
              <TouchableOpacity key={c.value} disabled={disabled} onPress={() => set(v === c.value ? '' : c.value)}
                style={[styles.scaleItem, v === c.value && styles.choiceOn, disabled && { opacity: 0.5 }]}>
                <Text style={[styles.scaleNum, v === c.value && styles.choiceTextOn]}>{c.value}</Text>
                <Text style={[styles.scaleLabel, v === c.value && styles.choiceTextOn]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TextInput
              value={v}
              editable={!disabled}
              onChangeText={(t) => set(q.kind === 'mbti' ? t.toUpperCase().slice(0, 4) : t)}
              placeholder={q.placeholder}
              placeholderTextColor="#9ca3af"
              keyboardType={q.kind === 'number' ? 'decimal-pad' : 'default'}
              autoCapitalize={q.kind === 'mbti' ? 'characters' : 'none'}
              style={[styles.input, { flex: 1 }, disabled && { backgroundColor: '#f9fafb' }]}
            />
            {q.unit ? <Text style={styles.unit}>{q.unit}</Text> : null}
          </View>
        )}
      </View>
    );
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {enrollment ? (
          <Text style={styles.status}>{enrollment.campCode} · {ENROLLMENT_STATUS_LABEL[enrollment.status]}</Text>
        ) : camps.length === 0 ? (
          <Text style={styles.status}>지금 신청할 수 있는 캠프가 없습니다.</Text>
        ) : (
          <View style={styles.camps}>
            {camps.map((c) => (
              <TouchableOpacity key={c.campCode} onPress={() => setCampCode(c.campCode)} style={[styles.campItem, campCode === c.campCode && styles.choiceOn]}>
                <Text style={[styles.campName, campCode === c.campCode && styles.choiceTextOn]}>{c.name} <Text style={styles.hint}>{c.campCode}</Text></Text>
                {c.startDate ? <Text style={styles.hint}>{c.startDate}{c.endDate ? ` ~ ${c.endDate}` : ''}</Text> : null}
              </TouchableOpacity>
            ))}
          </View>
        )}
        {campCode ? (
          <>
            <Text style={styles.section}>캠프 정보</Text>
            {questions.filter((q) => q.section === 'camp').map(field)}
            {questions.some((q) => q.section === 'survey') && (
              <>
                <Text style={styles.section}>사전 설문</Text>
                <Text style={styles.sectionNote}>반 배정 · 상담에 씁니다. 아이와 함께 답해주세요.</Text>
                {questions.filter((q) => q.section === 'survey').map(field)}
              </>
            )}
            <TouchableOpacity style={[styles.save, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
              <Text style={styles.saveText}>{saving ? '저장 중…' : enrollment ? '저장' : '신청하기'}</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48 },
  status: { fontSize: 15, color: '#374151', marginBottom: 8 },
  camps: { gap: 8, marginBottom: 8 },
  campItem: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, padding: 12 },
  campName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  section: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginTop: 18, marginBottom: 8 },
  sectionNote: { fontSize: 13, color: '#6b7280', marginBottom: 8 },
  field: { marginBottom: 14 },
  label: { fontSize: 14, color: '#1f2937', marginBottom: 6 },
  hint: { fontSize: 12, color: '#9ca3af', fontWeight: '400' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827' },
  unit: { fontSize: 14, color: '#6b7280' },
  scale: { flexDirection: 'row', gap: 4 },
  scaleItem: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  scaleNum: { fontSize: 15, fontWeight: '600', color: '#374151' },
  scaleLabel: { fontSize: 10, color: '#6b7280', marginTop: 2 },
  choiceOn: { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  choiceTextOn: { color: '#1d4ed8' },
  save: { marginTop: 16, backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
