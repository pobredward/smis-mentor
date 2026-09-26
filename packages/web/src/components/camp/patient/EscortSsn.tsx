'use client';

import { useEffect, useState } from 'react';
import { authenticatedGet } from '@/lib/apiClient';

/**
 * 내원 인솔자용 학생 주민번호 — 인솔자는 자동으로 원본 표시, 관리자는 "보기" 버튼
 * (서버가 인솔자 지정·내원 상태를 확인하고 감사 로그를 남긴다)
 */
export default function EscortSsn({ recordId, auto, className }: { recordId: string; auto: boolean; className?: string }) {
  const [ssn, setSsn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authenticatedGet<{ ssn: string }>(`/api/patients/escort-ssn?recordId=${encodeURIComponent(recordId)}`);
      setSsn(res.ssn);
    } catch (e) {
      setError((e as Error)?.message || '불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (auto) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, auto]);

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      {ssn ? (
        <b className="font-mono text-gray-900 select-all">{ssn}</b>
      ) : loading ? (
        <span className="text-gray-400">불러오는 중…</span>
      ) : error ? (
        <span className="text-red-500">{error}</span>
      ) : (
        <button type="button" onClick={load}
          className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
          title="원본 보기 (열람 기록이 남습니다)">보기</button>
      )}
    </span>
  );
}
