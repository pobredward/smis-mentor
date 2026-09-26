'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  collection, doc, getDoc, getDocs, orderBy, query, where, limit,
  updateDoc, deleteDoc, serverTimestamp, increment, Timestamp,
} from 'firebase/firestore';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@smis-mentor/shared';

/**
 * 커뮤니티 신고 처리 (관리자)
 * - reports 컬렉션(status=open)을 최신순으로 표시
 * - 조치: 게시글 삭제 / 댓글 삭제(soft) / 문제 없음(닫기)
 * 앱스토어 UGC 정책상 신고를 접수·처리하는 수단이 있어야 한다.
 */
type Report = {
  id: string;
  targetType: 'post' | 'comment';
  postId: string;
  commentId: string | null;
  targetAuthorId: string;
  reporterId: string;
  reason: string;
  detail: string;
  contentSnapshot: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt?: Timestamp;
};

const REASON_LABELS: Record<string, string> = {
  spam: '스팸·광고', abuse: '욕설·비방·혐오', sexual: '성적·부적절한 내용', privacy: '개인정보 노출', other: '기타',
};

export default function AdminReportsPage() {
  const { userData } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const constraints = showClosed
        ? [orderBy('createdAt', 'desc'), limit(200)]
        : [where('status', '==', 'open'), orderBy('createdAt', 'desc'), limit(200)];
      const snap = await getDocs(query(collection(db, 'reports'), ...constraints));
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Report, 'id'>) }));
      setReports(list);
      // 작성자·신고자 이름
      const ids = Array.from(new Set(list.flatMap((r) => [r.targetAuthorId, r.reporterId]).filter(Boolean)));
      const missing = ids.filter((id) => !names[id]);
      if (missing.length > 0) {
        const entries = await Promise.all(missing.map(async (id) => {
          try { const u = await getDoc(doc(db, 'users', id)); return [id, (u.data()?.name as string) || id] as const; }
          catch { return [id, id] as const; }
        }));
        setNames((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
      }
    } catch (e) {
      logger.error('신고 목록 로드 실패:', e);
      toast.error('신고 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [showClosed, names]);

  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showClosed]);

  const closeReport = async (r: Report, status: 'resolved' | 'dismissed', action: string) => {
    await updateDoc(doc(db, 'reports', r.id), {
      status, action, resolvedBy: userData?.userId ?? null, resolvedAt: serverTimestamp(),
    });
  };

  const handleDeleteTarget = async (r: Report) => {
    if (!confirm(r.targetType === 'post' ? '신고된 게시글을 삭제하시겠습니까? (댓글 포함, 되돌릴 수 없음)' : '신고된 댓글을 삭제 처리하시겠습니까?')) return;
    setBusy(r.id);
    try {
      if (r.targetType === 'post') {
        await deleteDoc(doc(db, 'posts', r.postId));
      } else if (r.commentId) {
        await updateDoc(doc(db, 'posts', r.postId, 'comments', r.commentId), {
          content: '', deletedAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
        await updateDoc(doc(db, 'posts', r.postId), { commentCount: increment(-1) }).catch(() => undefined);
      }
      await closeReport(r, 'resolved', 'deleted');
      toast.success('삭제 처리했습니다.');
      await load();
    } catch (e) {
      logger.error('신고 조치 실패:', e);
      toast.error('처리에 실패했습니다.');
    } finally {
      setBusy(null);
    }
  };

  const handleDismiss = async (r: Report) => {
    setBusy(r.id);
    try {
      await closeReport(r, 'dismissed', 'no-action');
      toast.success('문제 없음으로 닫았습니다.');
      await load();
    } catch {
      toast.error('처리에 실패했습니다.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">커뮤니티 신고 처리</h1>
            <p className="text-sm text-gray-500 mt-1">앱 게시판에서 접수된 신고입니다. 확인 후 삭제 또는 문제 없음으로 처리해주세요.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            처리 완료 포함
          </label>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-500">불러오는 중...</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 text-gray-500 border border-dashed rounded-xl">미처리 신고가 없습니다.</div>
        ) : (
          <ul className="space-y-3">
            {reports.map((r) => (
              <li key={r.id} className="border rounded-xl p-4 bg-white shadow-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 mb-2">
                  <span className={`px-2 py-0.5 rounded-full font-medium ${r.status === 'open' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                    {r.status === 'open' ? '미처리' : r.status === 'resolved' ? '삭제 처리' : '문제 없음'}
                  </span>
                  <span>{r.targetType === 'post' ? '게시글' : '댓글'}</span>
                  <span>· 사유: <b className="text-gray-700">{REASON_LABELS[r.reason] ?? r.reason}</b></span>
                  <span>· 작성자: {names[r.targetAuthorId] ?? r.targetAuthorId}</span>
                  <span>· 신고자: {names[r.reporterId] ?? r.reporterId}</span>
                  {r.createdAt && <span>· {r.createdAt.toDate().toLocaleString('ko-KR')}</span>}
                </div>
                {r.contentSnapshot && (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 mb-2">{r.contentSnapshot}</p>
                )}
                {r.detail && <p className="text-xs text-gray-600 mb-2">신고 내용: {r.detail}</p>}
                {r.status === 'open' && (
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" size="sm" onClick={() => handleDismiss(r)} disabled={busy === r.id}>문제 없음</Button>
                    <Button variant="danger" size="sm" onClick={() => handleDeleteTarget(r)} disabled={busy === r.id}>
                      {r.targetType === 'post' ? '게시글 삭제' : '댓글 삭제'}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
