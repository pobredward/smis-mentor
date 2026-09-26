import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import {
  CAMP_PROFILE_FIELD_LABELS,
  SHIRT_SIZES,
  normalizeCampProfileInput,
  validateCampProfileInput,
  type CampProfileField,
  type CampProfileStatus, L } from '@smis-mentor/shared';
import { authenticatedFetch } from '../../utils/apiClient';
import { ForeignCampProfileForm } from './ForeignCampProfileForm';

export type CampProfileApiStatus = CampProfileStatus & { applies: boolean };

export async function fetchCampProfileStatus(): Promise<CampProfileApiStatus> {
  const res = await authenticatedFetch('/api/user/camp-profile', { method: 'GET' });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error((json as any)?.error || L('profile.couldNotLoad'));
  return json as CampProfileApiStatus;
}

const SHIRT_TABLE = [
  ['S(90)', '47.5', '62', '19'],
  ['M(95)', '50', '65', '21'],
  ['L(100)', '52.5', '68', '22'],
  ['XL(105)', '54.5', '71', '23'],
  ['2XL(110)', '57.5', '74', '24'],
];

/** 입력 항목 틀 (컴포넌트 밖 — 입력 중 포커스 유지) */
function FieldBox({ label, required, example, help, error, children }: {
  label: string; required: boolean; example?: string; help?: React.ReactNode; error?: string; children: React.ReactNode;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}{required ? <Text style={{ color: '#ef4444' }}> *</Text> : null}</Text>
      {example ? <Text style={s.example}>{L('profile.example')} {example}</Text> : null}
      {help ? <Text style={s.help}>{help}</Text> : null}
      {children}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

/**
 * 캠프 참가 정보 입력 (mode='required' 필수 입력 / 'edit' 마이페이지 수정)
 */
export function CampProfileForm({ mode, onDone }: { mode: 'required' | 'edit'; onDone?: (s: CampProfileApiStatus) => void }) {
  const [status, setStatus] = useState<CampProfileApiStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<CampProfileField, string>>>({});
  const [f, setF] = useState({
    englishNickname: '', rrnLast: '', bankName: '', accountHolder: '', accountNumber: '',
    passportName: '', passportNumber: '', passportExpiry: '', shirtSize: '', phoneModel: '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    fetchCampProfileStatus()
      .then((st) => {
        setStatus(st);
        const p = st.profile;
        setF((prev) => ({
          ...prev,
          englishNickname: p.englishNickname ?? '',
          bankName: p.bankName ?? '',
          accountHolder: p.accountHolder ?? '',
          passportName: p.passportName ?? '',
          passportNumber: p.passportNumber ?? '',
          passportExpiry: p.passportExpiry ?? '',
          shirtSize: p.shirtSize ?? '',
          phoneModel: p.phoneModel ?? '',
        }));
      })
      .catch(() => Alert.alert(L('common.error'), L('profile.couldNotLoadCampParticipation')));
  }, []);

  if (!status) return <ActivityIndicator style={{ marginVertical: 24 }} />;
  if (!status.tier) return <Text style={s.help}>{status.audience === 'foreign' ? 'You have no camp assigned yet, so there is nothing to fill in.' : L('profile.youHaveNoCampAssigned')}</Text>;
  if (status.audience === 'foreign') return <ForeignCampProfileForm status={status} mode={mode} onDone={onDone} />;

  const isS = status.tier === 'S';
  const p = status.profile;
  const need = (k: CampProfileField) => status.required.includes(k);

  const submit = async () => {
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(f)) if (v.trim()) payload[k] = v;
    if (!payload.accountNumber) { delete payload.bankName; delete payload.accountHolder; }
    const norm = normalizeCampProfileInput(payload);
    const provided = Object.fromEntries(Object.entries(norm).filter(([, v]) => v)) as typeof norm;
    const v = validateCampProfileInput(provided);
    if (mode === 'required') {
      for (const m of status.missing) {
        const filled = m === 'bankAccount' ? !!provided.accountNumber : !!(provided as any)[m];
        if (!filled && !v[m]) v[m] = '필수 입력 항목입니다.';
      }
    }
    setErrors(v);
    if (Object.keys(v).length > 0) { Alert.alert(L('profile.checkYourInput'), L('profile.pleaseCheckTheHighlightedFields')); return; }
    setSaving(true);
    try {
      const res = await authenticatedFetch('/api/user/camp-profile', {
        method: 'POST',
        body: JSON.stringify({ ...provided, requireComplete: mode === 'required' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if ((json as any)?.fields) setErrors((json as any).fields);
        throw new Error((json as any)?.error || L('content.failedToSave'));
      }
      setStatus(json as CampProfileApiStatus);
      setF((prev) => ({ ...prev, rrnLast: '', accountNumber: '' }));
      Alert.alert(L('common.saved'), L('profile.campParticipationInfoSaved'));
      onDone?.(json as CampProfileApiStatus);
    } catch (e) {
      Alert.alert(L('common.error'), (e as Error)?.message || L('content.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 18 }}>
      <View style={s.notice}>
        <Text style={s.noticeText}>
          <Text style={{ fontWeight: '700' }}>{status.campCodes.join(', ')}</Text> {L('profile.thisInformationIsRequiredTo')}
          {mode === 'required' ? L('profile.youMustFillInEverything') : ''}
        </Text>
      </View>

      <FieldBox label={L('profile.englishNickname')} required={need('englishNickname')} example="David" error={errors.englishNickname}
        help="캠프 중 쓰일 명찰에 기재될 영어 이름입니다. 첫 문자는 대문자로, 띄어쓰기 없이 8자 이내.">
        <TextInput style={s.input} value={f.englishNickname} maxLength={8} autoCapitalize="words" autoCorrect={false}
          onChangeText={(t) => set('englishNickname')(t.replace(/\s/g, ''))} placeholder="David" />
      </FieldBox>


      <FieldBox label={L('profile.salaryBankAccount')} required={need('bankAccount')} error={errors.bankAccount}
        help={p.accountNumberMasked ? `등록됨: ${p.bankName} ${p.accountNumberMasked} (${p.accountHolder}) — 바꿀 때만 계좌번호까지 새로 입력하세요.` : '본인 명의 계좌를 권장합니다.'}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TextInput style={[s.input, { flex: 1 }]} value={f.bankName} onChangeText={set('bankName')} placeholder={L('profile.bank')} />
          <TextInput style={[s.input, { flex: 1 }]} value={f.accountHolder} onChangeText={set('accountHolder')} placeholder={L('profile.accountHolder')} />
        </View>
        <TextInput style={[s.input, { marginTop: 6 }]} value={f.accountNumber} keyboardType="number-pad"
          onChangeText={(t) => set('accountNumber')(t.replace(/[^0-9-]/g, ''))} placeholder={L('profile.accountNumber')} />
      </FieldBox>

      {isS && (
        <>
          <FieldBox label={L('profile.englishNameAsOnPassport')} required={need('passportName')} example="HONG GILDONG" error={errors.passportName}
            help="대문자로 입력바랍니다. 성과 이름 사이 띄어쓰기 꼭 유의해주세요.">
            <TextInput style={s.input} value={f.passportName} autoCapitalize="characters" autoCorrect={false}
              onChangeText={(t) => set('passportName')(t.toUpperCase())} placeholder="HONG GILDONG" />
          </FieldBox>
          <FieldBox label={L('profile.passportNumber')} required={need('passportNumber')} example="M123A4567" error={errors.passportNumber}
            help="여권 발급 / 재발급 하셔야 하는 경우 M00000000 으로 기입해주세요. 오타가 없는지 꼭 확인 부탁드립니다.">
            <TextInput style={s.input} value={f.passportNumber} autoCapitalize="characters" autoCorrect={false}
              onChangeText={(t) => set('passportNumber')(t.toUpperCase().replace(/\s/g, ''))} placeholder="M123A4567" />
          </FieldBox>
          <FieldBox label={L('profile.passportExpiryDate')} required={need('passportExpiry')} example="2027.01.01" error={errors.passportExpiry}
            help="여권 발급/재발급 하셔야 하는 경우 0000.00.00 으로 기입해주세요.">
            <TextInput style={s.input} value={f.passportExpiry} keyboardType="numbers-and-punctuation"
              onChangeText={set('passportExpiry')} placeholder="2027.01.01" />
          </FieldBox>
          <FieldBox label={L('profile.groupTShirtSize')} required={need('shirtSize')} error={errors.shirtSize}
            help="출발 / 귀국 / 야외수업 활동 시 단체 티셔츠를 입습니다. 사이즈는 '성인' 기준입니다.">
            <View style={s.table}>
              {[['사이즈(cm)', '가슴', '총기장', '소매'], ...SHIRT_TABLE].map((r, i) => (
                <View key={r[0]} style={[s.tr, i === 0 && { backgroundColor: '#f9fafb' }]}>
                  {r.map((c, j) => <Text key={j} style={[s.td, i === 0 && { fontWeight: '600' }]}>{c}</Text>)}
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
              {SHIRT_SIZES.map((sz) => (
                <TouchableOpacity key={sz} onPress={() => set('shirtSize')(sz)}
                  style={[s.chip, f.shirtSize === sz && s.chipOn]}>
                  <Text style={[s.chipText, f.shirtSize === sz && { color: '#fff' }]}>{sz}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </FieldBox>
          <FieldBox label={L('profile.phoneModel')} required={need('phoneModel')} example="갤럭시 S24+, 아이폰 16 Pro" error={errors.phoneModel}
            help="해외 로밍·유심 준비에 필요합니다.">
            <TextInput style={s.input} value={f.phoneModel} maxLength={40} onChangeText={set('phoneModel')} placeholder={L('profile.iphone16Pro')} />
          </FieldBox>
        </>
      )}

      <TouchableOpacity style={[s.submit, saving && { opacity: 0.5 }]} onPress={submit} disabled={saving}>
        <Text style={s.submitText}>{saving ? L('common.saving') : mode === 'required' ? L('profile.saveAndContinue') : L('common.save')}</Text>
      </TouchableOpacity>
      {mode === 'required' && status.missing.length > 0 && (
        <Text style={[s.help, { textAlign: 'center' }]}>{L('profile.missing2')} {status.missing.map((m) => CAMP_PROFILE_FIELD_LABELS[m]).join(', ')}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '700', color: '#111827' },
  example: { fontSize: 12, fontWeight: '700', color: '#374151', textDecorationLine: 'underline' },
  help: { fontSize: 12, color: '#6b7280', lineHeight: 18 },
  error: { fontSize: 12, color: '#dc2626' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', backgroundColor: '#fff' },
  notice: { backgroundColor: '#eff6ff', borderRadius: 10, borderWidth: 1, borderColor: '#dbeafe', padding: 10 },
  noticeText: { fontSize: 12, color: '#1e3a8a', lineHeight: 18 },
  table: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden' },
  tr: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#e5e7eb' },
  td: { flex: 1, textAlign: 'center', fontSize: 11, color: '#4b5563', paddingVertical: 4 },
  chip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  submit: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
