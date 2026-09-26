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
  type CampProfileStatus,
} from '@smis-mentor/shared';

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
      {example && <p className="text-xs font-semibold text-gray-700 underline">작성 예시) {example}</p>}
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
      .catch(() => toast.error('캠프 참가 정보를 불러오지 못했습니다.'));
  }, []);

  if (!status) return <div className="py-10 text-center text-sm text-gray-500">불러오는 중…</div>;
  if (!status.tier) {
    return <div className="py-6 text-sm text-gray-500">{status.audience === 'foreign' ? 'You have no camp assigned yet, so there is nothing to fill in.' : '배정된 캠프가 없어 입력할 정보가 없습니다.'}</div>;
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
    if (Object.keys(v).length > 0) { toast.error('입력값을 확인해주세요.'); return; }
    setSaving(true);
    try {
      const s = await authenticatedPost<Status>('/api/user/camp-profile', { ...provided, requireComplete: mode === 'required' });
      setStatus(s);
      setF((prev) => ({ ...prev, rrnLast: '', accountNumber: '' }));
      toast.success('캠프 참가 정보를 저장했습니다.');
      onDone?.(s);
    } catch (e) {
      toast.error((e as Error)?.message || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-900 leading-relaxed">
        <b>{status.campCodes.join(', ')}</b> 캠프 참가를 위해 필요한 정보입니다.
        {mode === 'required' && ' 모두 입력해야 앱을 이용할 수 있습니다.'}
      </div>

      <FieldBox required={need('englishNickname')} error={errors.englishNickname} label="영어 닉네임" example="David" help="캠프 중 쓰일 명찰에 기재될 영어 이름입니다. 첫 문자는 대문자로, 띄어쓰기 없이 8자 이내.">
        <input className={input} value={f.englishNickname} maxLength={8} onChange={(e) => set('englishNickname')(e.target.value.replace(/\s/g, ''))} placeholder="David" />
      </FieldBox>


      <FieldBox required={need('bankAccount')} error={errors.bankAccount} label="급여 계좌" help={p.accountNumberMasked ? <span className="text-green-700">등록됨: {p.bankName} {p.accountNumberMasked} ({p.accountHolder}) — 바꿀 때만 계좌번호까지 새로 입력하세요.</span> : '본인 명의 계좌를 권장합니다.'}>
        <div className="grid grid-cols-3 gap-2">
          <input className={input} value={f.bankName} onChange={(e) => set('bankName')(e.target.value)} placeholder="은행 (예: 국민)" />
          <input className={input} value={f.accountHolder} onChange={(e) => set('accountHolder')(e.target.value)} placeholder="예금주" />
          <input className={input} inputMode="numeric" value={f.accountNumber} onChange={(e) => set('accountNumber')(e.target.value.replace(/[^0-9-]/g, ''))} placeholder="계좌번호" autoComplete="off" />
        </div>
      </FieldBox>

      {isS && (
        <>
          <FieldBox required={need('passportName')} error={errors.passportName} label="여권상 영문이름" example="HONG GILDONG" help="대문자로 입력바랍니다. 성과 이름 사이 띄어쓰기 꼭 유의해주세요.">
            <input className={input} value={f.passportName} onChange={(e) => set('passportName')(e.target.value.toUpperCase())} placeholder="HONG GILDONG" />
          </FieldBox>
          <FieldBox required={need('passportNumber')} error={errors.passportNumber} label="여권 번호" example="M123A4567" help={<>여권 발급 / 재발급 하셔야 하는 경우 <b>M00000000</b> 으로 기입해주세요. 오타가 없는지 꼭 확인 부탁드립니다.</>}>
            <input className={input} value={f.passportNumber} onChange={(e) => set('passportNumber')(e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="M123A4567" />
          </FieldBox>
          <FieldBox required={need('passportExpiry')} error={errors.passportExpiry} label="여권 만료일자" example="2027.01.01" help={<>여권 발급/재발급 하셔야 하는 경우 <b>0000.00.00</b> 으로 기입해주세요.</>}>
            <input className={input} value={f.passportExpiry} onChange={(e) => set('passportExpiry')(e.target.value)} placeholder="2027.01.01" />
          </FieldBox>
          <FieldBox required={need('shirtSize')} error={errors.shirtSize} label="단체티 사이즈" help="출발 / 귀국 / 야외수업 활동 시 단체 티셔츠를 입습니다. 사이즈는 '성인' 기준입니다.">
            <table className="w-full text-[11px] text-gray-600 border border-gray-200 mb-2">
              <thead className="bg-gray-50"><tr><th className="py-1">사이즈(cm)</th><th>가슴</th><th>총기장</th><th>소매길이</th></tr></thead>
              <tbody>{SHIRT_TABLE.map((r) => <tr key={r[0]} className="border-t text-center"><td className="py-1">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>)}</tbody>
            </table>
            <div className="flex gap-2">
              {SHIRT_SIZES.map((s) => (
                <button key={s} type="button" onClick={() => set('shirtSize')(s)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-semibold ${f.shirtSize === s ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}>{s}</button>
              ))}
            </div>
          </FieldBox>
          <FieldBox required={need('phoneModel')} error={errors.phoneModel} label="휴대폰 모델명" example="갤럭시 S24+, 아이폰 16 Pro" help="해외 로밍·유심 준비에 필요합니다.">
            <input className={input} value={f.phoneModel} maxLength={40} onChange={(e) => set('phoneModel')(e.target.value)} placeholder="아이폰 16 Pro" />
          </FieldBox>
        </>
      )}

      <button type="button" onClick={submit} disabled={saving}
        className="w-full py-3 rounded-lg bg-blue-600 text-white font-semibold text-sm disabled:opacity-50">
        {saving ? '저장 중…' : mode === 'required' ? '저장하고 계속하기' : '저장'}
      </button>
      {mode === 'required' && status.missing.length > 0 && (
        <p className="text-xs text-gray-500 text-center">미입력: {status.missing.map((m) => CAMP_PROFILE_FIELD_LABELS[m]).join(', ')}</p>
      )}
    </div>
  );
}
