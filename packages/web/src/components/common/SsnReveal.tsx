'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { authenticatedGet } from '@/lib/apiClient';
import { maskSsnForStaff } from '@smis-mentor/shared';

/**
 * 학생·가족 주민번호 표시
 * - 캐시에는 이미 가린 값("YYMMDD-G******")만 있다.
 * - 관리자는 "보기"를 눌러 원본을 서버에서 한 번 가져온다 (조회마다 감사 로그 기록).
 */
export default function SsnReveal({
  value,
  campCode,
  sensitiveKey,
  label,
  canReveal,
  className,
}: {
  value?: string | null;
  campCode?: string | null;
  sensitiveKey?: string | null;
  label?: string;
  canReveal: boolean;
  className?: string;
}) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!value) return null;
  const shown = revealed ?? (value.includes('*') ? value : maskSsnForStaff(value));

  const reveal = async () => {
    if (!campCode || !sensitiveKey || loading) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ campCode, key: sensitiveKey, ...(label ? { label } : {}) });
      const res = await authenticatedGet<{ ssn: string }>(`/api/st/sensitive?${qs.toString()}`);
      setRevealed(res.ssn);
    } catch (e) {
      toast.error((e as Error)?.message || '원본을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <span className="font-mono">{shown}</span>
      {canReveal && !revealed && campCode && sensitiveKey && (
        <button
          type="button"
          onClick={reveal}
          disabled={loading}
          className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          title="원본 보기 (열람 기록이 남습니다)"
        >
          {loading ? '...' : '보기'}
        </button>
      )}
    </span>
  );
}
