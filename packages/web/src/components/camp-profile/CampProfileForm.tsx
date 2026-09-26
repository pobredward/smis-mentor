'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { authenticatedGet, authenticatedPost } from '@/lib/apiClient';
import ForeignCampProfileForm from './ForeignCampProfileForm';
import {
  CAMP_PROFILE_FIELD_LABELS,
  SHIRT_SIZES,
  normalizeCampProfileInput,
  validateCampProfileInput,
  type CampProfileField,
  type CampProfileStatus, L } from '@smis-mentor/shared';

type Status = CampProfileStatus & { applies: boolean };

const SHIRT_TABLE = [
  ['S(90)', '47.5', '62', '19'],
  ['M(95)', '50', '65', '21'],
  ['L(100)', '52.5', '68', '22'],
  ['XL(105)', '54.5', '71', '23'],
  ['2XL(110)', '57.5', '74', '24'],
];

/** 입력 항목 틀 — 컴포넌트 밖에 두어야 타이핑 중 포커스가 풀리지 않는다 */
function FieldBox({ required, error, label, example, help, children }: { required: boolean; error?: string; label: string; example?: string; help?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold text-gray-900">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {example && <p className="text-xs font-semibold text-gray-700 underline">{L('profile.example')} {example}</p>}
      {help && <div className="text-xs text-gray-500 leading-relaxed">{help}</div>}
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/**
 * 캠프 참가 정보 입력 폼
 * mode='required' : 앱 접속 시 필수 입력 (미입력 항목만 채우면 됨)
 * mode='edit'     : 마이페이지 수정 (민감 항목은 비워 두면 기존 값 유지)
 */
export default function CampProfileForm({ mode, onDone }: { mode: 'required' | 'edit'; onDone?: (s: Status) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<CampProfileField, string>>>({});
  const [f, setF] = useState({
    englishNickname: '', rrnLast: '', bankName: '', accountHolder: '', accountNumber: '',
    passportName: '', passportNumber: '', passportExpiry: '', shirtSize: '', phoneModel: '',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    authenticatedGet<Status>('/api/user/camp-profile')
      .then((s) => {
        setStatus(s);
        const p = s.profile;
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
      .catch(() => toast.error(L('profile.couldNotLoadCampParticipation')));
  }, []);

  if (!status) return <div className="py-10 text-center text-sm text-gray-500">{L('profile.loading')}</div>;
  if (!status.tier) {
    return <div className="py-6 text-sm text-gray-500">{status.audience === 'foreign' ? 'You have no camp assigned yet, so there is nothing to fill in.' : L('profile.youHaveNoCampAssigned')}</div>;
  }
  // 원어민: 영문 화면 + 국가별 해외 계좌
  if (status.audience === 'foreign') return <ForeignCampProfileForm status={status} mode={mode} onDone={onDone} />;
  const isS = status.tier === 'S';
  const p = status.profile;
  const need = (k: CampProfileField) => status.required.includes(k);

  const submit = async () => {
    const payload: Record<string, string> = {};
    for (const [k, v] of Object.entries(f)) if (v.trim()) payload[k] = v;
    // 계좌: 세 항목 중 하나라도 바꾸면 계좌번호까지 다시 입력
    if (!payload.accountNumber) { delete payload.bankName; delete payload.accountHolder; }
    const norm = normalizeCampProfileInput(payload);
    const provided = Object.fromEntries(Object.entries(norm).filter(([, v]) => v)) as typeof norm;
    const v = validateCampProfileInput(provided);
    // 필수 모드: 미입력 항목 검사
    if (mode === 'required') {
      for (const m of status.missing) {
        const filled = m === 'bankAccount' ? !!provided.accountNumber : !!(provided as any)[m];
        if (!filled && !v[m]) v[m] = '필수 입력 항목입니다.';
      }
    }
    setErrors(v);
    if (Object.keys(v).length > 0) { toast.error(L('profile.pleaseCheckYourInput')); return; }
    setSaving(true);
    try {
      const s = await authenticatedPost<Status>('/api/user/camp-profile', { ...provided, requireComplete: mode === 'required' });
      setStatus(s);
      setF((prev) => ({ ...prev, rrnLast: '', accountNumber: '' }));
      toast.success(L('profile.campParticipationInfoSaved'));
      onDone?.(s);
    } catch (e) {
      toast.error((e as Error)?.message || L('content.failedToSave'));
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-900 leading-relaxed">
        <b>{status.campCodes.join(', ')}</b> {L('profile.thisInformationIsRequiredTo')}
        {mode === 'required' && L('profile.youMustFillInEverything')}
      </div>

      <FieldBox required={need('englishNickname')} error={errors.englishNickname} label={L('profile.englishNickname')} example="David" help="캠프 중 쓰일 명찰에 기재될 영어 이름입니다. 첫 문자는 대문자로, 띄어쓰기 없이 8자 이내.">
        <input className={input} value={f.englishNickname} maxLength={8} onChange={(e) => set('englishNickname')(e.target.value.replace(/\s/g, ''))} placeholder="David" />
      </FieldBox>


      <FieldBox required={need('bankAccount')} error={errors.bankAccount} label={L('profile.salaryBankAccount')} help={p.accountNumberMasked ? <span className="text-green-700">{L('profile.registered')} {p.bankName} {p.accountNumberMasked} ({p.accountHolder}{L('profile.enterTheFullAccountNumber')}</span> : '본인 명의 계좌를 권장합니다.'}>
        <div className="grid grid-cols-3 gap-2">
          <input className={input} value={f.bankName} onChange={(e) => set('bankName')(e.target.value)} placeholder={L('profile.bankEGKb')} />
          <input className={input} value={f.accountHolder} onChange={(e) => set('accountHolder')(e.target.value)} placeholder={L('profile.accountHolder')} />
          <input className={input} inputMode="numeric" value={f.accountNumber} onChange={(e) => set('accountNumber')(e.target.value.replace(/[^0-9-]/g, ''))} placeholder={L('profile.accountNumber')} autoComplete="off" />
        </div>
      </FieldBox>

      {isS && (
        <>
          <FieldBox required={need('passportName')} error={errors.passportName} label={L('profile.englishNameAsOnPassport')} example="HONG GILDONG" help="대문자로 입력바랍니다. 성과 이름 사이 띄어쓰기 꼭 유의해주세요.">
            <input className={input} value={f.passportName} onChange={(e) => set('passportName')(e.target.value.toUpperCase())} placeholder="HONG GILDONG" />
          </FieldBox>
          <FieldBox required={need('passportNumber')} error={errors.passportNumber} label={L('profile.passportNumber')} example="M123A4567" help={<>{L('profile.ifYouNeedToIssue2')} <b>M00000000</b> {L('profile.pleaseEnterItThatWay2')}</>}>
            <input className={input} value={f.passportNumber} onChange={(e) => set('passportNumber')(e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="M123A4567" />
          </FieldBox>
          <FieldBox required={need('passportExpiry')} error={errors.passportExpiry} label={L('profile.passportExpiryDate')} example="2027.01.01" help={<>{L('profile.ifYouNeedToIssue')} <b>0000.00.00</b> {L('profile.pleaseEnterItThatWay')}</>}>
            <input className={input} value={f.passportExpiry} onChange={(e) => set('passportExpiry')(e.target.value)} placeholder="2027.01.01" />
          </FieldBox>
          <FieldBox required={need('shirtSize')} error={errors.shirtSize} label={L('profile.groupTShirtSize')} help="출발 / 귀국 / 야외수업 활동 시 단체 티셔츠를 입습니다. 사이즈는 '성인' 기준입니다.">
            <table className="w-full text-[11px] text-gray-600 border border-gray-200 mb-2">
              <thead className="bg-gray-50"><tr><th className="py-1">{L('profile.sizeCm')}</th><th>{L('profile.chest')}</th><th>{L('profile.length')}</th><th>{L('profile.sleeveLength')}</th></tr></thead>
              <tbody>{SHIRT_TABLE.map((r) => <tr key={r[0]} className="border-t text-center"><td className="py-1">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>)}</tbody>
            </table>
            <div className="flex gap-2">
              {SHIRT_SIZES.map((s) => (
                <button key={s} type="button" onClick={() => set('shirtSize')(s)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-semibold ${f.shirtSize === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}>{s}</button>
              ))}
            </div>
          </FieldBox>
          <FieldBox required={need('phoneModel')} error={errors.phoneModel} label={L('profile.phoneModel')} example="갤럭시 S24+, 아이폰 16 Pro" help="해외 로밍·유심 준비에 필요합니다.">
            <input className={input} value={f.phoneModel} maxLength={40} onChange={(e) => set('phoneModel')(e.target.value)} placeholder={L('profile.iphone16Pro')} />
          </FieldBox>
        </>
      )}

      <button type="button" onClick={submit} disabled={saving}
        className="w-full py-3 rounded-lg bg-blue-600 text-white font-semibold text-sm disabled:opacity-50">
        {saving ? L('common.saving') : mode === 'required' ? L('profile.saveAndContinue') : L('common.save')}
      </button>
      {mode === 'required' && status.missing.length > 0 && (
        <p className="text-xs text-gray-500 text-center">{L('profile.missing2')} {status.missing.map((m) => CAMP_PROFILE_FIELD_LABELS[m]).join(', ')}</p>
      )}
    </div>
  );
}
