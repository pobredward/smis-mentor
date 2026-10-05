'use client';

/**
 * 관리자 › 사용자 관리 — 학부모 계정에 아이(캠프 학생) 연결 · 해제
 * 캠프를 고르면 그 캠프 명단이 나오고, 보호자 번호가 학부모 계정 번호와 같은 학생이 맨 위에 '번호 일치'로 표시된다.
 */
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { authenticatedFetch, authenticatedGet } from '@/lib/apiClient';
import type { JobCodeWithId } from '@/types';
import type { ParentChildLink } from '@smis-mentor/shared';

type Candidate = { studentId: string; name: string; grade: string; phoneMatch: boolean };

async function send(method: 'POST' | 'DELETE', body: Record<string, string>): Promise<ParentChildLink[]> {
  const res = await authenticatedFetch('/api/admin/parent-links', { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || '처리하지 못했습니다.');
  return data.children ?? [];
}

export default function ParentLinksPanel({ parentUid, jobCodes }: { parentUid: string; jobCodes: JobCodeWithId[] }) {
  const [children, setChildren] = useState<ParentChildLink[] | null>(null);
  const [campCode, setCampCode] = useState('');
  const [students, setStudents] = useState<Candidate[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  // 최근 기수부터 (같은 코드는 하나만)
  const camps = useMemo(() => {
    const seen = new Set<string>();
    return [...jobCodes]
      .filter((j) => j.code && !seen.has(j.code) && seen.add(j.code))
      .sort((a, b) => String(b.generation).localeCompare(String(a.generation), 'ko', { numeric: true }));
  }, [jobCodes]);

  useEffect(() => {
    setChildren(null);
    authenticatedGet<{ children: ParentChildLink[] }>(`/api/admin/parent-links?parentUid=${encodeURIComponent(parentUid)}`)
      .then((r) => setChildren(r.children ?? []))
      .catch((e) => { toast.error(e.message); setChildren([]); });
  }, [parentUid]);

  useEffect(() => {
    setStudents(null);
    setQuery('');
    if (!campCode) return;
    authenticatedGet<{ students: Candidate[] }>(`/api/admin/parent-links?parentUid=${encodeURIComponent(parentUid)}&campCode=${encodeURIComponent(campCode)}`)
      .then((r) => setStudents(r.students ?? []))
      .catch((e) => { toast.error(e.message); setStudents([]); });
  }, [parentUid, campCode]);

  const linked = (s: Candidate) => !!children?.some((c) => c.campCode === campCode && c.studentId === s.studentId);
  const shown = (students ?? []).filter((s) => !query.trim() || s.name.includes(query.trim()));

  const run = async (method: 'POST' | 'DELETE', camp: string, studentId: string) => {
    setBusy(true);
    try {
      setChildren(await send(method, { parentUid, campCode: camp, studentId }));
      toast.success(method === 'POST' ? '연결했습니다.' : '연결을 해제했습니다.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t pt-4">
      <p className="text-sm text-gray-500 mb-2">연결된 아이</p>
      {children === null ? (
        <div className="animate-pulse h-4 bg-gray-200 rounded w-24" />
      ) : children.length === 0 ? (
        <p className="text-gray-500 text-sm">아직 연결된 아이가 없습니다.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {children.map((c) => (
            <li key={`${c.campCode}_${c.studentId}`} className="flex items-center gap-1 bg-orange-50 border border-orange-200 rounded-md px-2 py-1 text-sm">
              <span className="font-medium">{c.studentName}</span>
              <span className="text-gray-500">{c.campCode}</span>
              <button type="button" disabled={busy} onClick={() => run('DELETE', c.campCode, c.studentId)}
                className="ml-1 text-orange-700 hover:text-orange-900" aria-label="연결 해제">✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 space-y-2">
        <select value={campCode} onChange={(e) => setCampCode(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">캠프 선택…</option>
          {camps.map((j) => (
            <option key={j.code} value={j.code}>{j.generation} {j.code} — {j.name}</option>
          ))}
        </select>
        {campCode && (
          students === null ? (
            <p className="text-sm text-gray-500">명단 불러오는 중…</p>
          ) : students.length === 0 ? (
            <p className="text-sm text-gray-500">이 캠프 명단이 없습니다.</p>
          ) : (
            <>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="학생 이름 검색"
                className="w-full p-2 border border-gray-300 rounded-md text-sm" />
              <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-md">
                {shown.map((s) => (
                  <li key={s.studentId} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{s.name}</span>
                      {s.grade && <span className="ml-1 text-gray-500">{s.grade}</span>}
                      {s.phoneMatch && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-800">번호 일치</span>}
                    </span>
                    {linked(s) ? (
                      <span className="text-xs text-gray-400">연결됨</span>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => run('POST', campCode, s.studentId)}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium">연결</button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )
        )}
      </div>
    </div>
  );
}
