'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { authenticatedPost } from '@/lib/apiClient';
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
  type CampProfileStatus,
  type IntlBankInfo,
} from '@smis-mentor/shared';

type Status = CampProfileStatus & { applies: boolean };

const EN_LABELS: Record<CampProfileField, string> = {
  englishNickname: 'English nickname', rrnLast: 'Resident registration no.', bankAccount: 'Bank account (salary)',
  passportName: 'Name on passport', passportNumber: 'Passport number', passportExpiry: 'Passport expiry date',
  shirtSize: 'Group T-shirt size', phoneModel: 'Phone model', nationality: 'Nationality', visaType: 'Visa type',
};

function Box({ label, required, example, help, error, children }: { label: string; required?: boolean; example?: string; help?: React.ReactNode; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-900">{label} {required && <span className="text-red-500">*</span>}</label>
      {example && <p className="text-xs font-semibold text-gray-700 underline">e.g. {example}</p>}
      {help && <div className="text-xs text-gray-500 leading-relaxed">{help}</div>}
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

const inputCls = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

/**
 * 원어민용 캠프 참가 정보 (영문)
 * 급여 계좌는 국가를 먼저 고르고, 그 나라 해외송금(KB국민은행 앱 기준)에 필요한 칸만 받는다.
 */
export default function ForeignCampProfileForm({ status: initial, mode, onDone }: { status: Status; mode: 'required' | 'edit'; onDone?: (s: Status) => void }) {
  const [status, setStatus] = useState<Status>(initial);
  const p = status.profile;
  const [bank, setBank] = useState<Partial<IntlBankInfo>>({ country: '', ...(p.intlBank ?? {}), iban: '' });
  const [accountNumber, setAccountNumber] = useState('');
  const [f, setF] = useState({
    passportName: p.passportName ?? '', passportNumber: p.passportNumber ?? '', passportExpiry: p.passportExpiry ?? '',
    shirtSize: p.shirtSize ?? '', phoneModel: p.phoneModel ?? '',
    visaType: p.visaType ?? '',
  });
  // 목록에 없는 비자면 Other 로 직접 입력
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
    // 오류 문구는 영문으로
    for (const k of Object.keys(e) as CampProfileField[]) {
      if (k === 'passportName' && e[k] && /[가-힣]/.test(e[k]!)) e[k] = 'Enter in CAPITAL letters with a space between surname and given name (e.g. HONG GILDONG).';
      if (k === 'passportNumber' && e[k] && /[가-힣]/.test(e[k]!)) e[k] = 'Check the passport number (if you are getting a new passport, enter M00000000).';
      if (k === 'passportExpiry' && e[k] && /[가-힣]/.test(e[k]!)) e[k] = 'Use YYYY.MM.DD (if you are getting a new passport, enter 0000.00.00).';
      if (k === 'shirtSize' && e[k] && /[가-힣]/.test(e[k]!)) e[k] = 'Select a size.';
      if (k === 'phoneModel' && e[k] && /[가-힣]/.test(e[k]!)) e[k] = 'Enter your phone model (e.g. iPhone 16 Pro, Galaxy S24+).';
    }
    setErrors(e);
    if (Object.keys(e).length) { toast.error('Please check the highlighted fields.'); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { ...provided, requireComplete: mode === 'required' };
      if (bankTouched) { body.intlBank = intl; if (accountNumber.trim()) body.accountNumber = accountNumber.trim(); }
      const s = await authenticatedPost<Status>('/api/user/camp-profile', body);
      setStatus(s);
      setAccountNumber('');
      setBank((b) => ({ ...b, iban: '' }));
      toast.success('Saved.');
      onDone?.(s);
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-900 leading-relaxed">
        This information is needed for your camp <b>{status.campCodes.join(', ')}</b>.
        {mode === 'required' && ' Please complete it to continue using the app.'}
      </div>

      {need('visaType') && (
        <Box label={EN_LABELS.visaType} required error={errors.visaType}
          help="Your current visa in Korea (shown on your Alien Registration Card). Needed for camps held in Korea.">
          <select className={inputCls} value={visaOther ? '__other' : f.visaType}
            onChange={(e) => { if (e.target.value === '__other') { setVisaOther(true); setP('visaType')(''); } else { setVisaOther(false); setP('visaType')(e.target.value); } }}>
            <option value="">Select your visa type…</option>
            {VISA_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            <option value="__other">Other</option>
          </select>
          {visaOther && <input className={`${inputCls} mt-2`} value={f.visaType} onChange={(e) => setP('visaType')(e.target.value)} placeholder="e.g. D-4" />}
        </Box>
      )}

      <Box label="Salary bank account" required={need('bankAccount')} error={errors.bankAccount}
        help={<>Your salary is sent by international transfer from Korea. Every detail must match your bank account exactly.
          {hasStoredAccount && <><br /><span className="text-green-700">Saved: {p.intlBank?.bankName} {p.accountNumberMasked}. Re-enter the account number only if it changed.</span></>}</>}>
        <select className={inputCls} value={bank.country ?? ''} onChange={(e) => setBank((b) => ({ ...b, country: e.target.value, routing: '' }))}>
          <option value="">Country where your bank account is located…</option>
          {BANK_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>

        {def && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {def.code === 'OTHER' && (
              <input className={inputCls} value={bank.countryName ?? ''} onChange={(e) => setB('countryName')(e.target.value)} placeholder="Country name" />
            )}
            <input className={`${inputCls} sm:col-span-2`} value={bank.holderName ?? ''} onChange={(e) => setB('holderName')(e.target.value)}
              placeholder={def.domestic ? '예금주 (Account holder)' : "Account holder's full name (exactly as on the account)"} />
            <input className={inputCls} value={bank.bankName ?? ''} onChange={(e) => setB('bankName')(e.target.value)}
              placeholder={def.domestic ? '은행 (Bank, e.g. 국민)' : 'Bank name (full official name)'} />
            <input className={inputCls} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\s/g, ''))}
              placeholder={hasStoredAccount ? `Account number (saved: ${p.accountNumberMasked})` : 'Account number'} autoComplete="off" />
            {!def.domestic && (
              <>
                <input className={inputCls} value={bank.swift ?? ''} onChange={(e) => setB('swift')(e.target.value.toUpperCase())} placeholder="SWIFT / BIC (e.g. NEDSZAJJ)" />
                {def.routing && (
                  <input className={inputCls} value={bank.routing ?? ''} onChange={(e) => setB('routing')(e.target.value.toUpperCase())}
                    placeholder={`${BANK_ROUTING_LABELS[def.routing].label} (e.g. ${BANK_ROUTING_LABELS[def.routing].example})`} />
                )}
                {def.iban && (
                  <input className={inputCls} value={bank.iban ?? ''} onChange={(e) => setB('iban')(e.target.value.toUpperCase())}
                    placeholder={`IBAN${def.iban === 'optional' ? ' (if any)' : ''}${hasStoredIban ? ` — saved: ${p.intlBank?.iban}` : ''}`} />
                )}
                {def.code === 'US' && (
                  <select className={inputCls} value={bank.accountType ?? ''} onChange={(e) => setB('accountType')(e.target.value)}>
                    <option value="">Account type (optional)</option>
                    <option value="Checking">Checking</option>
                    <option value="Savings">Savings</option>
                  </select>
                )}
                <input className={`${inputCls} sm:col-span-2`} value={bank.recipientAddress ?? ''} onChange={(e) => setB('recipientAddress')(e.target.value)}
                  placeholder="Your home address (street, city, state/province, postal code, country)" />
                <input className={inputCls} value={bank.recipientPhone ?? ''} onChange={(e) => setB('recipientPhone')(e.target.value)} placeholder="Phone with country code (e.g. +1 470 729 1136)" />
                <input className={inputCls} value={bank.bankAddress ?? ''} onChange={(e) => setB('bankAddress')(e.target.value)} placeholder="Bank address (optional)" />
                <input className={`${inputCls} sm:col-span-2`} value={bank.notes ?? ''} onChange={(e) => setB('notes')(e.target.value)}
                  placeholder="Notes (optional) — e.g. intermediary bank SWIFT if your bank has no SWIFT code" />
              </>
            )}
            {def.routing && (
              <p className="sm:col-span-2 text-[11px] text-gray-500">{BANK_ROUTING_LABELS[def.routing].help}</p>
            )}
          </div>
        )}
      </Box>

      {isS && (
        <>
          <Box label={EN_LABELS.passportName} required={need('passportName')} example="HONG GILDONG" error={errors.passportName}
            help="CAPITAL letters, exactly as in your passport, with a space between surname and given name.">
            <input className={inputCls} value={f.passportName} onChange={(e) => setP('passportName')(e.target.value.toUpperCase())} />
          </Box>
          <Box label={EN_LABELS.passportNumber} required={need('passportNumber')} example="M123A4567" error={errors.passportNumber}
            help="If you need to issue or renew your passport, enter M00000000. Please double-check for typos.">
            <input className={inputCls} value={f.passportNumber} onChange={(e) => setP('passportNumber')(e.target.value.toUpperCase().replace(/\s/g, ''))} />
          </Box>
          <Box label={EN_LABELS.passportExpiry} required={need('passportExpiry')} example="2027.01.01" error={errors.passportExpiry}
            help="If you need to issue or renew your passport, enter 0000.00.00.">
            <input className={inputCls} value={f.passportExpiry} onChange={(e) => setP('passportExpiry')(e.target.value)} />
          </Box>
          <Box label={EN_LABELS.shirtSize} required={need('shirtSize')} error={errors.shirtSize}
            help="Worn on departure, return and outdoor activities. Adult sizes (chest 47.5 / 50 / 52.5 / 54.5 / 57.5 cm).">
            <div className="flex gap-2">
              {SHIRT_SIZES.map((s) => (
                <button key={s} type="button" onClick={() => setP('shirtSize')(s)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-semibold ${f.shirtSize === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}>{s}</button>
              ))}
            </div>
          </Box>
          <Box label={EN_LABELS.phoneModel} required={need('phoneModel')} example="iPhone 16 Pro, Galaxy S24+" error={errors.phoneModel}
            help="Needed to prepare roaming / SIM for the overseas camp.">
            <input className={inputCls} value={f.phoneModel} maxLength={40} onChange={(e) => setP('phoneModel')(e.target.value)} />
          </Box>
        </>
      )}

      <button type="button" onClick={submit} disabled={saving} className="w-full py-3 rounded-lg bg-blue-600 text-white font-semibold text-sm disabled:opacity-50">
        {saving ? 'Saving…' : mode === 'required' ? 'Save and continue' : 'Save'}
      </button>
      {mode === 'required' && status.missing.length > 0 && (
        <p className="text-xs text-gray-500 text-center">Missing: {status.missing.map((m) => EN_LABELS[m]).join(', ')}</p>
      )}
    </div>
  );
}
