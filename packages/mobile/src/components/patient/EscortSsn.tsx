import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { authenticatedFetch } from '../../utils/apiClient';

/**
 * 내원 인솔자용 학생 주민번호 — 인솔자는 자동 표시, 관리자는 "보기"
 * (서버가 인솔자 지정·내원 상태를 확인하고 감사 로그를 남긴다)
 */
export function EscortSsn({ recordId, auto }: { recordId: string; auto: boolean }) {
  const [ssn, setSsn] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authenticatedFetch(`/api/patients/escort-ssn?recordId=${encodeURIComponent(recordId)}`, { method: 'GET' });
      const json = (await res.json().catch(() => null)) as { ssn?: string; error?: string } | null;
      if (!res.ok || !json?.ssn) throw new Error(json?.error || '불러오지 못했습니다.');
      setSsn(json.ssn);
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

  if (ssn) return <Text selectable style={{ fontSize: 13, fontWeight: '700', color: '#111827', fontVariant: ['tabular-nums'] }}>{ssn}</Text>;
  if (loading) return <Text style={{ fontSize: 11, color: '#9ca3af' }}>불러오는 중…</Text>;
  if (error) return <Text style={{ fontSize: 11, color: '#dc2626' }}>{error}</Text>;
  return (
    <TouchableOpacity onPress={load} style={{ borderWidth: 1, borderColor: '#d1d5db', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>
      <Text style={{ fontSize: 11, color: '#4b5563' }}>보기</Text>
    </TouchableOpacity>
  );
}
