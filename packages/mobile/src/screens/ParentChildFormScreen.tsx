/**
 * 학부모 — 아이 등록 · 정보 고치기. 주민등록번호는 서버에서 암호화해 보관하고, 앱에는 가린 값만 보인다.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { doc, getDoc } from 'firebase/firestore';
import { PARENT_CHILD_FORM_FIELDS, CHILDREN_COLLECTION, GUARDIAN_CONSENT_TEXT, logger, type ChildProfile } from '@smis-mentor/shared';
import { db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { parentCall } from '../services/parentApi';
import type { RootStackParamList } from '../navigation/types';

export function ParentChildFormScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ParentChildForm'>>();
  const childId = route.params?.childId;
  const { userData } = useAuth();
  const [child, setChild] = useState<ChildProfile | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [ssn, setSsn] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(!!childId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: childId ? '아이 정보' : '아이 등록' });
    if (!childId) {
      setForm({ parentName: userData?.name ?? '', parentPhone: (userData as { phoneNumber?: string } | null)?.phoneNumber ?? '' });
      return;
    }
    getDoc(doc(db, CHILDREN_COLLECTION, childId))
      .then((s) => {
        const c = s.exists() ? ({ ...(s.data() as ChildProfile), childId: s.id }) : null;
        setChild(c);
        const init: Record<string, string> = {};
        for (const f of PARENT_CHILD_FORM_FIELDS) init[f.key] = String((c as unknown as Record<string, unknown> | null)?.[f.key] ?? '');
        setForm(init);
      })
      .catch((e) => logger.error('아이 정보 불러오기 실패:', e))
      .finally(() => setLoading(false));
  }, [childId, navigation, userData]);

  const save = async () => {
    if (!child && !consent) { Alert.alert('보호자 동의', '보호자(법정대리인) 동의에 체크해주세요.'); return; }
    const missing = PARENT_CHILD_FORM_FIELDS.filter((f) => f.required && !form[f.key]?.trim());
    if (missing.length) { Alert.alert('빠진 칸이 있어요', missing.map((f) => f.label).join(', ')); return; }
    if (form.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.birthDate.trim())) { Alert.alert('생년월일', '2015-03-01 처럼 넣어주세요.'); return; }
    if (ssn && ssn.replace(/\D/g, '').length !== 13) { Alert.alert('주민등록번호', '13자리를 확인해주세요.'); return; }
    setSaving(true);
    try {
      if (child) {
        const changed = Object.fromEntries(PARENT_CHILD_FORM_FIELDS
          .filter((f) => (form[f.key] ?? '') !== String((child as unknown as Record<string, unknown>)[f.key] ?? ''))
          .map((f) => [f.key, form[f.key] ?? '']));
        await parentCall('PUT', '/api/parent/children', { childId: child.childId, child: changed, ssn: ssn || undefined });
      } else {
        const res = await parentCall<{ linkedExisting: boolean }>('POST', '/api/parent/children', { child: form, ssn: ssn || undefined, consent: true });
        if (res.linkedExisting) Alert.alert('등록했습니다', '예전 캠프 기록과 이어서 등록했습니다.');
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('저장하지 못했습니다', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {PARENT_CHILD_FORM_FIELDS.map((f) => (
          <View key={f.key} style={styles.field}>
            <Text style={styles.label}>{f.label}{f.required ? ' *' : ''}{f.hint ? <Text style={styles.hint}> · {f.hint}</Text> : null}</Text>
            {f.kind === 'gender' ? (
              <View style={styles.row}>
                {([['M', '남'], ['F', '여']] as const).map(([v, l]) => (
                  <TouchableOpacity key={v} style={[styles.choice, form.gender === v && styles.choiceOn]} onPress={() => setForm({ ...form, gender: v })}>
                    <Text style={[styles.choiceText, form.gender === v && styles.choiceTextOn]}>{l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <TextInput
                value={form[f.key] ?? ''}
                onChangeText={(t) => setForm({ ...form, [f.key]: t })}
                placeholder={f.kind === 'date' ? (f.placeholder ?? 'YYYY-MM-DD') : f.placeholder}
                placeholderTextColor="#9ca3af"
                keyboardType={f.kind === 'phone' ? 'phone-pad' : f.kind === 'date' ? 'numbers-and-punctuation' : f.key === 'email' ? 'email-address' : 'default'}
                autoCapitalize={f.key === 'englishName' || f.key === 'passportName' ? 'characters' : 'none'}
                multiline={f.kind === 'area'}
                style={[styles.input, f.kind === 'area' && styles.area]}
              />
            )}
          </View>
        ))}
        <View style={styles.field}>
          <Text style={styles.label}>주민등록번호 <Text style={styles.hint}>· 보험 · 병원 접수에 필요 (암호화해서 보관)</Text></Text>
          <TextInput
            value={ssn}
            onChangeText={setSsn}
            placeholder={child?.ssnMasked ? `등록됨 (${child.ssnMasked}) — 바꿀 때만` : '13자리'}
            placeholderTextColor="#9ca3af"
            keyboardType="number-pad"
            secureTextEntry
            style={styles.input}
          />
        </View>
        {!child && (
          <TouchableOpacity style={styles.consent} onPress={() => setConsent((v) => !v)} activeOpacity={0.7}>
            <View style={[styles.checkbox, consent && styles.checkboxOn]}>{consent ? <Text style={styles.check}>✓</Text> : null}</View>
            <Text style={styles.consentText}>
              (필수) {GUARDIAN_CONSENT_TEXT}{' '}
              <Text style={styles.consentLink} onPress={() => navigation.navigate('PrivacyPolicy')}>개인정보처리방침 보기</Text>
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.save, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
          <Text style={styles.saveText}>{saving ? '저장 중…' : '저장'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, paddingBottom: 48 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, color: '#374151', marginBottom: 6, fontWeight: '500' },
  hint: { fontSize: 12, color: '#9ca3af', fontWeight: '400' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827' },
  area: { minHeight: 70, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8 },
  choice: { flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  choiceOn: { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  choiceText: { fontSize: 15, color: '#374151' },
  choiceTextOn: { color: '#1d4ed8', fontWeight: '600' },
  consent: { flexDirection: 'row', gap: 10, backgroundColor: '#f9fafb', borderRadius: 8, padding: 12, marginTop: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: '#9ca3af', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxOn: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  check: { color: '#fff', fontSize: 14, fontWeight: '700' },
  consentText: { flex: 1, fontSize: 12, lineHeight: 18, color: '#374151' },
  consentLink: { color: '#2563eb', textDecorationLine: 'underline' },
  save: { marginTop: 8, backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
