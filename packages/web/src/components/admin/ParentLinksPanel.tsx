'use client';

/**
 * 관리자 › 사용자 관리 — 학부모 계정에 아이 연결 · 해제 (아이 문서 parentIds)
 * 처음에는 보호자 번호가 학부모 계정 번호와 같은 아이를 보여 주고('번호 일치'), 이름 · 번호로 찾을 수도 있다.
 * (학부모가 앱에서 직접 등록한 아이는 이미 연결돼 있다)
 */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { authenticatedFetch, authenticatedGet } from '@/lib/apiClient';
import type { JobCodeWithId } from '@/types';

type Linked = { childId: string; name: string; englishName?: string; birthDate?: string; camps: Array<{ campCode: string; status: string }> };
type Candidate = { childId: string; name: string; birthDate: string; camps: string[]; phoneMatch: boolean; linked: boolean };

async function send(method: 'POST' | 'DELETE', body: Record<string, string>): Promise<Linked[]> {
  const res = await authenticatedFetch('/api/admin/parent-links', { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || '처리하지 못했습니다.');
  return data.children ?? [];
}

const STATUS: Record<string, string> = { applied: '신청', confirmed: '확정', cancelled: '취소' };

// jobCodes 는 예전 호출 모양을 위해 받는다 (캠프는 아이 참가에서 보인다)
export default function ParentLinksPanel({ parentUid }: { parentUid: string; jobCodes?: JobCodeWithId[] }) {
  const [children, setChildren] = useState<Linked[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setChildren(null);
    authenticatedGet<{ children: Linked[] }>(`/api/admin/parent-links?parentUid=${encodeURIComponent(parentUid)}`)
      .then((r) => setChildren(r.children ?? []))
      .catch((e) => { toast.error(e.message); setChildren([]); });
  }, [parentUid]);

  const find = useCallback(async (q: string) => {
    setCandidates(null);
    try {
      const r = await authenticatedGet<{ candidates: Candidate[] }>(`/api/admin/parent-links?parentUid=${encodeURIComponent(parentUid)}&candidates=1&q=${encodeURIComponent(q)}`);
      setCandidates(r.candidates ?? []);
    } catch (e) {
      toast.error((e as Error).message);
      setCandidates([]);
    }
  }, [parentUid]);
  useEffect(() => { void find(''); }, [find]);

  const run = async (method: 'POST' | 'DELETE', childId: string) => {
    setBusy(true);
    try {
      const next = await send(method, { parentUid, childId });
      setChildren(next);
      setCandidates((cur) => cur?.map((c) => (c.childId === childId ? { ...c, linked: method === 'POST' } : c)) ?? cur);
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
            <li key={c.childId} className="flex items-center gap-1 bg-orange-50 border border-orange-200 rounded-md px-2 py-1 text-sm">
              <span className="font-medium">{c.name}</span>
              {c.birthDate && <span className="text-gray-500">{c.birthDate}</span>}
              {c.camps.map((x) => <span key={x.campCode} className="text-gray-500">{x.campCode}{STATUS[x.status] ? `(${STATUS[x.status]})` : ''}</span>)}
              <button type="button" disabled={busy} onClick={() => run('DELETE', c.childId)}
                className="ml-1 text-orange-700 hover:text-orange-900" aria-label="연결 해제">✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 space-y-2">
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void find(query.trim()); }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="아이 이름 또는 보호자 번호 (비우면 번호 일치)"
            className="flex-1 p-2 border border-gray-300 rounded-md text-sm" />
          <button type="submit" className="px-3 py-2 text-sm rounded-md border bg-white">찾기</button>
        </form>
        {candidates === null ? (
          <p className="text-sm text-gray-500">찾는 중…</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-gray-500">{query.trim() ? '찾는 아이가 없습니다.' : '보호자 번호가 같은 아이가 없습니다. 이름으로 찾아보세요.'}</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-md">
            {candidates.map((s) => (
              <li key={s.childId} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{s.name}</span>
                  {s.birthDate && <span className="ml-1 text-gray-500">{s.birthDate}</span>}
                  {s.camps.length > 0 && <span className="ml-1 text-gray-400">{s.camps.join(' · ')}</span>}
                  {s.phoneMatch && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-800">번호 일치</span>}
                </span>
                {s.linked ? (
                  <span className="text-xs text-gray-400">연결됨</span>
                ) : (
                  <button type="button" disabled={busy} onClick={() => run('POST', s.childId)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium">연결</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
