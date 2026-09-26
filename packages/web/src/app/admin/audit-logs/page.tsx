'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query, Timestamp } from 'firebase/firestore';
import Layout from '@/components/common/Layout';
import { db } from '@/lib/firebase';
import { logger } from '@smis-mentor/shared';

/**
 * 감사 로그 열람 (관리자)
 * 주민번호 열람·역할/상태/캠프 변경·이메일 변경·사용자 삭제·소셜 인증 기록을 최신순으로 보여준다.
 */
type Log = {
  id: string;
  action: string;
  category?: string;
  performedBy?: string;
  performedByData?: { name?: string } | null;
  targetUserId?: string | null;
  targetLabel?: string | null;
  targetUserData?: { name?: string } | null;
  metadata?: Record<string, unknown> | null;
  timestamp?: Timestamp;
  createdAt?: Timestamp;
};

const ACTION_LABELS: Record<string, string> = {
  RRN_DECRYPT: '주민번호 열람',
  EMAIL_CHANGE: '이메일 변경',
  USER_ROLE_CHANGE: '역할 변경',
  USER_STATUS_CHANGE: '상태 변경',
  USER_CAMP_CHANGE: '캠프 배정 변경',
  USER_SOFT_DELETE: '사용자 삭제(soft)',
  USER_HARD_DELETE: '사용자 삭제(hard)',
  STUDENT_SENSITIVE_VIEW: '학생 민감정보 열람',
  COMMUNITY_REPORT_RESOLVE: '신고 처리',
  CAMP_PROFILE_UPDATE: '캠프 참가 정보 입력',
  CAMP_PROFILE_REVEAL: '캠프 참가 정보 원본 열람',
  ESCORT_SSN_VIEW: '내원 인솔자 주민번호 열람',
};

const fmt = (v: unknown) => (Array.isArray(v) ? v.join(', ') || '(없음)' : v == null ? '(없음)' : String(v));

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'auditLogs'), orderBy('timestamp', 'desc'), limit(300)));
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Log, 'id'>) }));
        setLogs(list);
        // 행위자 이름 (performedByData 가 없는 트리거 기록용)
        const ids = Array.from(new Set(list.filter((l) => !l.performedByData?.name && l.performedBy && l.performedBy !== 'server').map((l) => l.performedBy as string)));
        const { getDoc, doc } = await import('firebase/firestore');
        const entries = await Promise.all(ids.slice(0, 50).map(async (id) => {
          try { const u = await getDoc(doc(db, 'users', id)); return [id, (u.data()?.name as string) || id] as const; } catch { return [id, id] as const; }
        }));
        setNames(Object.fromEntries(entries));
      } catch (e) {
        logger.error('감사 로그 로드 실패:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const actions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))).sort(), [logs]);
  const shown = filter === 'all' ? logs : logs.filter((l) => l.action === filter);

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">감사 로그</h1>
            <p className="text-sm text-gray-500 mt-1">개인정보 열람과 계정 변경 기록입니다. 최근 300건.</p>
          </div>
          <select className="border rounded-lg px-3 py-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">전체</option>
            {actions.map((a) => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-500">불러오는 중...</div>
        ) : shown.length === 0 ? (
          <div className="text-center py-16 text-gray-500 border border-dashed rounded-xl">기록이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto border rounded-xl bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2 whitespace-nowrap">시각</th>
                  <th className="text-left px-3 py-2">작업</th>
                  <th className="text-left px-3 py-2">수행자</th>
                  <th className="text-left px-3 py-2">대상</th>
                  <th className="text-left px-3 py-2">내용</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => {
                  const t = (l.timestamp ?? l.createdAt)?.toDate?.();
                  const actor = l.performedByData?.name || (l.performedBy === 'server' ? '서버' : names[l.performedBy ?? ''] || l.performedBy || '-');
                  const target = l.targetLabel || l.targetUserData?.name || l.targetUserId || '-';
                  const m = l.metadata ?? {};
                  const detail = 'field' in m ? `${fmt(m.from)} → ${fmt(m.to)}` : 'from' in m ? `${fmt(m.from)} → ${fmt(m.to)}` : '';
                  return (
                    <tr key={l.id} className="border-t align-top">
                      <td className="px-3 py-2 whitespace-nowrap text-gray-500">{t ? t.toLocaleString('ko-KR') : '-'}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium">{ACTION_LABELS[l.action] ?? l.action}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{actor}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{target}</td>
                      <td className="px-3 py-2 text-gray-600 break-all">{detail}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
