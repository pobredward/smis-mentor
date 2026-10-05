'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  collection, doc, getDoc, getDocs, orderBy, query, where, limit,
  updateDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { db } from '@/lib/firebase';
import { authenticatedPost } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { chatRoomLabel, isCampChatRoomType, logger } from '@smis-mentor/shared';

/**
 * 채팅 신고 처리 (관리자)
 * - reports 컬렉션(status=open)을 최신순으로 표시
 * - 조치: 채팅 메시지 삭제(/api/chat/moderate) / 문제 없음(닫기)
 * 앱스토어 UGC 정책상 신고를 접수·처리하는 수단이 있어야 한다. (게시판은 2026-10 에 없앴다 — 옛 게시글 신고는 '닫기'만)
 */
type Report = {
  id: string;
  /** 'post' · 'comment' 는 없앤 게시판의 옛 신고 */
  targetType: 'post' | 'comment' | 'chatMessage';
  /** 채팅 신고 — 방 · 메시지 · 글 일부 · 사진·동영상 수 */
  roomId?: string;
  messageId?: string;
  excerpt?: string;
  mediaCount?: number;
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

const TARGET_LABELS: Record<Report['targetType'], string> = { post: '게시글', comment: '댓글', chatMessage: '채팅' };
const DELETE_LABELS: Record<Report['targetType'], string> = { post: '게시글 삭제', comment: '댓글 삭제', chatMessage: '메시지 삭제' };

/** 채팅방 id → 읽기 쉬운 이름 ("{jobCodeId}_camp_all" → "전체방", "dm_…" → "1:1 대화") */
function chatRoomText(roomId?: string): string {
  if (!roomId) return '';
  if (roomId.startsWith('dm_')) return chatRoomLabel('dm', 'ko');
  const m = /_(camp_[a-z_]+)$/.exec(roomId);
  return m && isCampChatRoomType(m[1]) ? chatRoomLabel(m[1], 'ko') : '';
}

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
    if (r.targetType !== 'chatMessage') return; // 없앤 게시판의 옛 신고 — 지울 대상이 없다
    if (!confirm('신고된 채팅 메시지를 모두에게서 삭제하시겠습니까? (사진·동영상 포함, 되돌릴 수 없음)')) return;
    setBusy(r.id);
    try {
      if (!r.roomId || !r.messageId) throw new Error('채팅 신고에 방·메시지 정보가 없습니다.');
      // 서버가 메시지를 지우고 같은 메시지의 신고를 모두 '처리됨'으로 바꾼다
      await authenticatedPost('/api/chat/moderate', { roomId: r.roomId, messageId: r.messageId });
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
            <p className="text-sm text-gray-500 mt-1">앱 채팅에서 접수된 신고입니다. 확인 후 삭제 또는 문제 없음으로 처리해주세요.</p>
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
                  <span>{TARGET_LABELS[r.targetType] ?? r.targetType}</span>
                  <span>· 사유: <b className="text-gray-700">{REASON_LABELS[r.reason] ?? r.reason}</b></span>
                  <span>· 작성자: {names[r.targetAuthorId] ?? r.targetAuthorId}</span>
                  <span>· 신고자: {names[r.reporterId] ?? r.reporterId}</span>
                  {r.createdAt && <span>· {r.createdAt.toDate().toLocaleString('ko-KR')}</span>}
                </div>
                {r.targetType === 'chatMessage' ? (
                  <div className="text-sm text-gray-800 bg-gray-50 rounded-lg p-3 mb-2 space-y-1">
                    {r.excerpt ? (
                      <p className="whitespace-pre-wrap break-words">{r.excerpt}</p>
                    ) : (
                      <p className="text-gray-500">(글 없음)</p>
                    )}
                    {!!r.mediaCount && <p className="text-xs text-gray-600">사진·동영상 {r.mediaCount}개</p>}
                    <p className="text-xs text-gray-400 break-all">
                      방: {chatRoomText(r.roomId) && <b className="font-medium text-gray-500">{chatRoomText(r.roomId)} · </b>}{r.roomId}
                    </p>
                  </div>
                ) : r.contentSnapshot && (
                  <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg p-3 mb-2">{r.contentSnapshot}</p>
                )}
                {r.detail && <p className="text-xs text-gray-600 mb-2">신고 내용: {r.detail}</p>}
                {r.status === 'open' && (
                  <div className="flex gap-2 justify-end">
                    <Button variant="secondary" size="sm" onClick={() => handleDismiss(r)} disabled={busy === r.id}>문제 없음</Button>
                    <Button variant="danger" size="sm" onClick={() => handleDeleteTarget(r)} disabled={busy === r.id}>
                      {DELETE_LABELS[r.targetType] ?? '삭제'}
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
