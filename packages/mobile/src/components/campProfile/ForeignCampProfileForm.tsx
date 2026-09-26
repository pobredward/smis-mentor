import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import {
  BANK_COUNTRIES,
  BANK_ROUTING_LABELS,
  VISA_TYPES,
  SHIRT_SIZES,
  bankCountryDef,
  normalizeIntlBank,
  validateIntlBank,
  validateCampProfileInput,
  normalizeCampProfileInput,
  type CampProfileField,
  type IntlBankInfo,
} from '@smis-mentor/shared';
import { authenticatedFetch } from '../../utils/apiClient';
import type { CampProfileApiStatus } from './CampProfileForm';

const EN_LABELS: Record<CampProfileField, string> = {
  englishNickname: 'English nickname', rrnLast: 'Resident registration no.', bankAccount: 'Bank account (salary)',
  passportName: 'Name on passport', passportNumber: 'Passport number', passportExpiry: 'Passport expiry date',
  shirtSize: 'Group T-shirt size', phoneModel: 'Phone model', nationality: 'Nationality', visaType: 'Visa type',
};

const EN_FIX: Partial<Record<CampProfileField, string>> = {
  passportName: 'Enter in CAPITAL letters with a space between surname and given name (e.g. HONG GILDONG).',
  passportNumber: 'Check the passport number (if you are getting a new passport, enter M00000000).',
  passportExpiry: 'Use YYYY.MM.DD (if you are getting a new passport, enter 0000.00.00).',
  shirtSize: 'Select a size.',
  phoneModel: 'Enter your phone model (e.g. iPhone 16 Pro, Galaxy S24+).',
};

/** 입력 항목 틀 (컴포넌트 밖 — 입력 중 포커스 유지) */
function Box({ label, required, example, help, error, children }: {
  label: string; required?: boolean; example?: string; help?: React.ReactNode; error?: string; children: React.ReactNode;
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}{required ? <Text style={{ color: '#ef4444' }}> *</Text> : null}</Text>
      {example ? <Text style={s.example}>e.g. {example}</Text> : null}
      {help ? <Text style={s.help}>{help}</Text> : null}
      {children}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

/**
 * 원어민용 캠프 참가 정보 (영문)
 * 급여 계좌는 국가를 먼저 고르고, 그 나라 해외송금(KB국민은행 앱 기준)에 필요한 칸만 받는다.
 */
export function ForeignCampProfileForm({ status: initial, mode, onDone }: {
  status: CampProfileApiStatus; mode: 'required' | 'edit'; onDone?: (s: CampProfileApiStatus) => void;
}) {
  const [status, setStatus] = useState<CampProfileApiStatus>(initial);
  const p = status.profile;
  const [bank, setBank] = useState<Partial<IntlBankInfo>>({ country: '', ...(p.intlBank ?? {}), iban: '' });
  const [accountNumber, setAccountNumber] = useState('');
  const [f, setF] = useState({
    passportName: p.passportName ?? '', passportNumber: p.passportNumber ?? '', passportExpiry: p.passportExpiry ?? '',
    shirtSize: p.shirtSize ?? '', phoneModel: p.phoneModel ?? '',
    visaType: p.visaType ?? '',
  });
  const [visaOther, setVisaOther] = useState(!!p.visaType && !VISA_TYPES.some((v) => v.value === p.visaType));
  const [errors, setErrors] = useState<Partial<Record<CampProfileField, string>>>({});
  const [saving, setSaving] = useState(false);
  const isS = status.tier === 'S';
  const need = (k: CampProfileField) => status.required.includes(k);
  const def = bankCountryDef(bank.country);
  const setB = (k: keyof IntlBankInfo) => (v: string) => setBank((b) => ({ ...b, [k]: v }));
  const setP = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const hasStoredAccount = !!p.accountNumberMasked;
  const hasStoredIban = !!p.intlBank?.iban;

  const submit = async () => {
    const e: Partial<Record<CampProfileField, string>> = {};
    const intl = normalizeIntlBank(bank);
    const bankTouched = !!(intl.country || accountNumber);
    if (bankTouched || need('bankAccount')) {
      const err = validateIntlBank(
        { ...intl, iban: intl.iban || (hasStoredIban ? 'STORED' : '') },
        accountNumber.trim() || (hasStoredAccount ? '__stored__' : undefined),
        !intl.iban && hasStoredIban,
      );
      if (err) e.bankAccount = err;
    }
    const other = normalizeCampProfileInput(Object.fromEntries(Object.entries(f).filter(([, v]) => v.trim())));
    const provided = Object.fromEntries(Object.entries(other).filter(([, v]) => v));
    Object.assign(e, validateCampProfileInput(provided));
    if (mode === 'required') {
      for (const m of status.missing) if (m !== 'bankAccount' && !(provided as any)[m] && !e[m]) e[m] = 'Required.';
    }
    for (const k of Object.keys(e) as CampProfileField[]) {
      if (e[k] && /[가-힣]/.test(e[k]!) && EN_FIX[k]) e[k] = EN_FIX[k];
    }
    setErrors(e);
    if (Object.keys(e).length) { Alert.alert('Check your input', 'Please check the highlighted fields.'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...provided, requireComplete: mode === 'required' };
      if (bankTouched) { body.intlBank = intl; if (accountNumber.trim()) body.accountNumber = accountNumber.trim(); }
      const res = await authenticatedFetch('/api/user/camp-profile', { method: 'POST', body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if ((json as any)?.fields) setErrors((json as any).fields);
        throw new Error((json as any)?.error || 'Failed to save.');
      }
      setStatus(json as CampProfileApiStatus);
      setAccountNumber('');
      setBank((b) => ({ ...b, iban: '' }));
      Alert.alert('Saved', 'Your camp information has been saved.');
      onDone?.(json as CampProfileApiStatus);
    } catch (err) {
      Alert.alert('Error', (err as Error)?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ gap: 18 }}>
      <View style={s.notice}>
        <Text style={s.noticeText}>
          This information is needed for your camp <Text style={{ fontWeight: '700' }}>{status.campCodes.join(', ')}</Text>.
          {mode === 'required' ? ' Please complete it to continue using the app.' : ''}
        </Text>
      </View>

      {need('visaType') && (
        <Box label={EN_LABELS.visaType} required error={errors.visaType}
          help="Your current visa in Korea (shown on your Alien Registration Card). Needed for camps held in Korea.">
          <View style={s.chips}>
            {VISA_TYPES.map((v) => {
              const on = !visaOther && f.visaType === v.value;
              return (
                <TouchableOpacity key={v.value} onPress={() => { setVisaOther(false); setP('visaType')(v.value); }} style={[s.chip, on && s.chipOn]}>
                  <Text style={[s.chipText, on && { color: '#fff' }]}>{v.value}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity onPress={() => { setVisaOther(true); setP('visaType')(''); }} style={[s.chip, visaOther && s.chipOn]}>
              <Text style={[s.chipText, visaOther && { color: '#fff' }]}>Other</Text>
            </TouchableOpacity>
          </View>
          {!visaOther && f.visaType ? <Text style={s.help}>{VISA_TYPES.find((v) => v.value === f.visaType)?.label}</Text> : null}
          {visaOther && <TextInput style={[s.input, { marginTop: 6 }]} value={f.visaType} onChangeText={setP('visaType')} placeholder="e.g. D-4" autoCapitalize="characters" />}
        </Box>
      )}

      <Box label="Salary bank account" required={need('bankAccount')} error={errors.bankAccount}
        help={'Your salary is sent by international transfer from Korea. Every detail must match your bank account exactly.'
          + (hasStoredAccount ? `\nSaved: ${p.intlBank?.bankName ?? ''} ${p.accountNumberMasked}. Re-enter the account number only if it changed.` : '')}>
        <Text style={s.sub}>Country where your bank account is located</Text>
        <View style={s.chips}>
          {BANK_COUNTRIES.map((c) => {
            const on = bank.country === c.code;
            return (
              <TouchableOpacity key={c.code} onPress={() => setBank((b) => ({ ...b, country: c.code, routing: '' }))}
                style={[s.chip, on && s.chipOn]}>
                <Text style={[s.chipText, on && { color: '#fff' }]}>{c.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {def && (
          <View style={{ gap: 10, marginTop: 6 }}>
            {def.code === 'OTHER' && (
              <TextInput style={s.input} value={bank.countryName ?? ''} onChangeText={setB('countryName')} placeholder="Country name" />
            )}
            <TextInput style={s.input} value={bank.holderName ?? ''} onChangeText={setB('holderName')}
              placeholder={def.domestic ? '예금주 (Account holder)' : "Account holder's full name (exactly as on the account)"} />
            <TextInput style={s.input} value={bank.bankName ?? ''} onChangeText={setB('bankName')}
              placeholder={def.domestic ? '은행 (Bank, e.g. 국민)' : 'Bank name (full official name)'} />
            <TextInput style={s.input} value={accountNumber} onChangeText={(v) => setAccountNumber(v.replace(/\s/g, ''))}
              placeholder={hasStoredAccount ? `Account number (saved: ${p.accountNumberMasked})` : 'Account number'}
              autoCorrect={false} autoCapitalize="characters" />
            {!def.domestic && (
              <>
                <TextInput style={s.input} value={bank.swift ?? ''} onChangeText={(v) => setB('swift')(v.toUpperCase())}
                  placeholder="SWIFT / BIC (e.g. NEDSZAJJ)" autoCapitalize="characters" autoCorrect={false} />
                {def.routing && (
                  <TextInput style={s.input} value={bank.routing ?? ''} onChangeText={(v) => setB('routing')(v.toUpperCase())}
                    placeholder={`${BANK_ROUTING_LABELS[def.routing].label} (e.g. ${BANK_ROUTING_LABELS[def.routing].example})`}
                    autoCapitalize="characters" autoCorrect={false} />
                )}
                {def.iban && (
                  <TextInput style={s.input} value={bank.iban ?? ''} onChangeText={(v) => setB('iban')(v.toUpperCase())}
                    placeholder={`IBAN${def.iban === 'optional' ? ' (if any)' : ''}${hasStoredIban ? ` — saved: ${p.intlBank?.iban}` : ''}`}
                    autoCapitalize="characters" autoCorrect={false} />
                )}
                {def.code === 'US' && (
                  <View style={s.chips}>
                    {['Checking', 'Savings'].map((t) => (
                      <TouchableOpacity key={t} onPress={() => setB('accountType')(bank.accountType === t ? '' : t)}
                        style={[s.chip, bank.accountType === t && s.chipOn]}>
                        <Text style={[s.chipText, bank.accountType === t && { color: '#fff' }]}>{t}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <TextInput style={[s.input, { minHeight: 64 }]} multiline value={bank.recipientAddress ?? ''} onChangeText={setB('recipientAddress')}
                  placeholder="Your home address (street, city, state/province, postal code, country)" />
                <TextInput style={s.input} value={bank.recipientPhone ?? ''} onChangeText={setB('recipientPhone')}
                  placeholder="Phone with country code (e.g. +1 470 729 1136)" keyboardType="phone-pad" />
                <TextInput style={s.input} value={bank.bankAddress ?? ''} onChangeText={setB('bankAddress')} placeholder="Bank address (optional)" />
                <TextInput style={s.input} value={bank.notes ?? ''} onChangeText={setB('notes')}
                  placeholder="Notes (optional) — e.g. intermediary bank SWIFT" />
              </>
            )}
            {def.routing ? <Text style={s.help}>{BANK_ROUTING_LABELS[def.routing].help}</Text> : null}
          </View>
        )}
      </Box>

      {isS && (
        <>
          <Box label={EN_LABELS.passportName} required={need('passportName')} example="HONG GILDONG" error={errors.passportName}
            help="CAPITAL letters, exactly as in your passport, with a space between surname and given name.">
            <TextInput style={s.input} value={f.passportName} onChangeText={(v) => setP('passportName')(v.toUpperCase())} autoCapitalize="characters" />
          </Box>
          <Box label={EN_LABELS.passportNumber} required={need('passportNumber')} example="M123A4567" error={errors.passportNumber}
            help="If you need to issue or renew your passport, enter M00000000. Please double-check for typos.">
            <TextInput style={s.input} value={f.passportNumber} onChangeText={(v) => setP('passportNumber')(v.toUpperCase().replace(/\s/g, ''))} autoCapitalize="characters" autoCorrect={false} />
          </Box>
          <Box label={EN_LABELS.passportExpiry} required={need('passportExpiry')} example="2027.01.01" error={errors.passportExpiry}
            help="If you need to issue or renew your passport, enter 0000.00.00.">
            <TextInput style={s.input} value={f.passportExpiry} onChangeText={setP('passportExpiry')} keyboardType="numbers-and-punctuation" />
          </Box>
          <Box label={EN_LABELS.shirtSize} required={need('shirtSize')} error={errors.shirtSize}
            help="Worn on departure, return and outdoor activities. Adult sizes (chest 47.5 / 50 / 52.5 / 54.5 / 57.5 cm).">
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {SHIRT_SIZES.map((sz) => (
                <TouchableOpacity key={sz} onPress={() => setP('shirtSize')(sz)} style={[s.chip, { flex: 1, alignItems: 'center' }, f.shirtSize === sz && s.chipOn]}>
                  <Text style={[s.chipText, f.shirtSize === sz && { color: '#fff' }]}>{sz}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Box>
          <Box label={EN_LABELS.phoneModel} required={need('phoneModel')} example="iPhone 16 Pro, Galaxy S24+" error={errors.phoneModel}
            help="Needed to prepare roaming / SIM for the overseas camp.">
            <TextInput style={s.input} value={f.phoneModel} maxLength={40} onChangeText={setP('phoneModel')} />
          </Box>
        </>
      )}

      <TouchableOpacity style={[s.submit, saving && { opacity: 0.5 }]} onPress={submit} disabled={saving}>
        <Text style={s.submitText}>{saving ? 'Saving…' : mode === 'required' ? 'Save and continue' : 'Save'}</Text>
      </TouchableOpacity>
      {mode === 'required' && status.missing.length > 0 && (
        <Text style={[s.help, { textAlign: 'center' }]}>Missing: {status.missing.map((m) => EN_LABELS[m]).join(', ')}</Text>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 15, fontWeight: '700', color: '#111827' },
  sub: { fontSize: 12, fontWeight: '600', color: '#374151' },
  example: { fontSize: 12, fontWeight: '700', color: '#374151', textDecorationLine: 'underline' },
  help: { fontSize: 12, color: '#6b7280', lineHeight: 18 },
  error: { fontSize: 12, color: '#dc2626' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', backgroundColor: '#fff' },
  notice: { backgroundColor: '#eff6ff', borderRadius: 10, borderWidth: 1, borderColor: '#dbeafe', padding: 10 },
  noticeText: { fontSize: 12, color: '#1e3a8a', lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  submit: { backgroundColor: '#2563eb', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
