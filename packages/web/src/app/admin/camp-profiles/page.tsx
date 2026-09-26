'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import Layout from '@/components/common/Layout';
import { authenticatedGet } from '@/lib/apiClient';
import { CAMP_PROFILE_FIELD_LABELS, type CampProfileField, type CampProfileTier } from '@smis-mentor/shared';

/**
 * 캠프 참가 정보 현황 (관리자)
 * 캠프 코드별 멘토의 입력 여부, 영어 닉네임·여권·단체티·휴대폰 모델을 보고, 원본(주민번호·계좌) 포함 CSV 를 내려받는다.
 */
type Row = {
  userId: string; role: string; name: string; phoneNumber: string; group: string; groupRole: string;
  englishNickname: string; rrnFront: string; rrnLast: string; bankName: string; accountHolder: string; accountNumber: string;
  passportName: string; passportNumber: string; passportExpiry: string; shirtSize: string; phoneModel: string;
  bankCountry: string; swift: string; routing: string; iban: string; accountType: string; bankAddress: string;
  recipientAddress: string; recipientPhone: string; bankNotes: string; nationality: string; visaType: string;
  missing: CampProfileField[];
};

const COLS: Array<[keyof Row, string]> = [
  ['role', '구분'], ['name', '이름'], ['nationality', '국적'], ['visaType', '비자 종류'], ['group', '그룹'], ['groupRole', '역할'], ['phoneNumber', '연락처'], ['englishNickname', '영어 닉네임'],
  ['rrnFront', '주민번호 앞'], ['rrnLast', '주민번호 뒤'], ['bankName', '은행'], ['accountHolder', '예금주'], ['accountNumber', '계좌번호'],
  ['bankCountry', '계좌 국가'], ['swift', 'SWIFT'], ['routing', 'ABA/BSB/Transit/Sort'], ['iban', 'IBAN'], ['accountType', '계좌 종류'],
  ['recipientAddress', '받는 분 주소'], ['recipientPhone', '받는 분 전화'], ['bankAddress', '은행 주소'], ['bankNotes', '송금 추가 안내'],
  ['passportName', '여권 영문이름'], ['passportNumber', '여권 번호'], ['passportExpiry', '여권 만료'], ['shirtSize', '단체티'], ['phoneModel', '휴대폰 모델'],
];

export default function CampProfilesAdminPage() {
  const [campCode, setCampCode] = useState('');
  const [tier, setTier] = useState<CampProfileTier | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (reveal = false) => {
    const code = campCode.trim().toUpperCase();
    if (!code) return;
    setLoading(true);
    try {
      const res = await authenticatedGet<{ tier: CampProfileTier | null; rows: Row[] }>(`/api/admin/camp-profiles?campCode=${encodeURIComponent(code)}${reveal ? '&reveal=1' : ''}`);
      setTier(res.tier);
      setRows(res.rows);
      if (reveal) downloadCsv(code, res.rows);
    } catch (e) {
      toast.error((e as Error)?.message || '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const downloadCsv = (code: string, data: Row[]) => {
    const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [COLS.map(([, h]) => h).join(','), ...data.map((r) => COLS.map(([k]) => esc(r[k] as string)).join(','))];
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${code}_캠프참가정보.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('원본 포함 CSV 를 내려받았습니다. (열람 기록이 남습니다)');
  };

  const done = rows.filter((r) => r.missing.length === 0).length;
  const hasForeign = rows.some((r) => r.role === '원어민');
  const INTL = ['bankCountry', 'swift', 'routing', 'iban', 'accountType', 'recipientAddress', 'recipientPhone', 'bankAddress', 'bankNotes'];
  const shown = COLS.filter(([k]) =>
    (tier === 'S' || !['passportName', 'passportNumber', 'passportExpiry', 'shirtSize', 'phoneModel'].includes(k as string)) &&
    (hasForeign || !INTL.includes(k as string)));

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">캠프 참가 정보 현황</h1>
        <p className="text-sm text-gray-500 mt-1 mb-5">멘토·원어민이 앱에서 입력한 영어 닉네임·계좌·여권 정보입니다. 원어민 계좌는 KB 해외송금 입력 순서대로 표시합니다. 주민번호 뒷자리·계좌번호 원본은 CSV 로만 내려받을 수 있고 열람 기록이 남습니다.</p>
        <div className="flex flex-wrap gap-2 mb-5">
          <input value={campCode} onChange={(e) => setCampCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="캠프 코드 (예: S29)" className="border rounded-lg px-3 py-2 text-sm w-44" />
          <button onClick={() => load()} disabled={loading} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50">조회</button>
          <button onClick={() => { if (confirm('주민번호 뒷자리·계좌번호 원본이 포함된 파일을 내려받습니다. 계속할까요?')) void load(true); }}
            disabled={loading || !campCode.trim()} className="px-4 py-2 rounded-lg border text-sm disabled:opacity-50">원본 포함 CSV</button>
        </div>
        {rows.length > 0 && (
          <>
            <p className="text-sm text-gray-700 mb-2">입력 완료 <b>{done}</b> / {rows.length}명 {tier && <span className="text-gray-400">({tier === 'S' ? 'S 캠프 — 여권·단체티·휴대폰 포함' : 'J/E 캠프'})</span>}</p>
            <div className="overflow-x-auto border rounded-xl bg-white">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 text-gray-600"><tr>{shown.map(([, h]) => <th key={h} className="text-left px-2 py-2 whitespace-nowrap">{h}</th>)}<th className="text-left px-2 py-2">미입력</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId} className={`border-t ${r.missing.length ? 'bg-red-50/40' : ''}`}>
                      {shown.map(([k]) => <td key={k as string} className="px-2 py-1.5 whitespace-nowrap">{String(r[k] ?? '')}</td>)}
                      <td className="px-2 py-1.5 text-red-600 whitespace-nowrap">{r.missing.map((m) => CAMP_PROFILE_FIELD_LABELS[m]).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
