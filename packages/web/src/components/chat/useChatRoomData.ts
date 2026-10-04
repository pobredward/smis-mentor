'use client';

/**
 * 대화방 데이터 구독 (web) — 방 · 메시지(최근 50 + 위로 올려 더 불러오기) · 읽은 시각
 * 화면(ChatRoomView)은 이 값을 props 로만 받는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import {
  CHAT_LIMITS,
  loadOlderChatMessages,
  logger,
  subscribeChatMessages,
  subscribeChatReads,
  subscribeChatRoom,
  type ChatMessageView,
  type ChatRoom,
} from '@smis-mentor/shared';
import { db } from '@/lib/firebase';
import { tsMillis } from './chatUi';

export type ChatRoomStatus = 'loading' | 'ready' | 'missing';

/** 방 한 개 — 없거나 내가 들어가 있지 않으면 'missing' */
export function useChatRoom(roomId: string, myUid: string): { room: ChatRoom | null; status: ChatRoomStatus } {
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [status, setStatus] = useState<ChatRoomStatus>('loading');
  // 방이 바뀌면 화면(ChatRoomContainer)을 key 로 새로 만든다 — 여기서 상태를 되돌리지 않는다
  useEffect(() => {
    return subscribeChatRoom(
      db,
      roomId,
      (r) => {
        setRoom(r);
        setStatus(r && (r.memberIds ?? []).includes(myUid) ? 'ready' : 'missing');
      },
      () => setStatus('missing'),
    );
  }, [roomId, myUid]);
  return { room, status };
}

const createdMs = (d: DocumentSnapshot<DocumentData> | null | undefined): number => {
  const ts = d?.get('createdAt') as { toMillis?: () => number } | null | undefined;
  return tsMillis(ts) || Number.POSITIVE_INFINITY;
};

const byTime = (a: ChatMessageView, b: ChatMessageView) =>
  (tsMillis(a.createdAt) || Number.MAX_SAFE_INTEGER) - (tsMillis(b.createdAt) || Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id);

/** 두 메시지 목록 합치기 (같은 id 는 뒤쪽 목록 것) — 오래된 것 → 최신 순 */
export function mergeChatMessages(base: ChatMessageView[], newer: ChatMessageView[]): ChatMessageView[] {
  if (!base.length) return newer;
  const map = new Map<string, ChatMessageView>();
  base.forEach((m) => map.set(m.id, m));
  newer.forEach((m) => map.set(m.id, m));
  return [...map.values()].sort(byTime);
}

/**
 * 메시지 — 최근 50개는 실시간, 위로 올리면 loadOlder 로 더 붙인다.
 * 새 메시지에 밀려 실시간 창(50개)에서 빠진 메시지는 버리지 않고 남겨 둔다.
 */
export function useChatMessages(roomId: string, enabled: boolean) {
  const [live, setLive] = useState<ChatMessageView[]>([]);
  const [kept, setKept] = useState<Map<string, ChatMessageView>>(() => new Map());
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const liveRef = useRef<ChatMessageView[]>([]);
  const cursorRef = useRef<DocumentSnapshot<DocumentData> | null>(null);
  const olderLoadedRef = useRef(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    return subscribeChatMessages(
      db,
      roomId,
      (msgs, info) => {
        const prev = liveRef.current;
        const ids = new Set(msgs.map((m) => m.id));
        const oldestAt = msgs.length ? tsMillis(msgs[0].createdAt) || Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
        const dropped = prev.filter((m) => !ids.has(m.id) && !m.pending && tsMillis(m.createdAt) > 0 && tsMillis(m.createdAt) <= oldestAt);
        if (dropped.length) {
          setKept((k) => {
            const n = new Map(k);
            dropped.forEach((m) => n.set(m.id, m));
            return n;
          });
        }
        liveRef.current = msgs;
        setLive(msgs);
        // 더 불러올 기준(가장 오래된 메시지) — 위로 더 불러오기 전까지는 본 것 중 가장 오래된 것
        if (!olderLoadedRef.current && info.oldest && createdMs(info.oldest) < createdMs(cursorRef.current)) {
          cursorRef.current = info.oldest;
        }
        if (!olderLoadedRef.current && info.hasMore) setHasMore(true);
        setLoaded(true);
      },
      { onError: (e) => logger.warn('채팅 메시지 구독 오류:', e) },
    );
  }, [roomId, enabled]);

  const loadOlder = useCallback(async () => {
    const cursor = cursorRef.current;
    if (loadingRef.current || !cursor) return;
    loadingRef.current = true;
    setLoadingOlder(true);
    try {
      const r = await loadOlderChatMessages(db, roomId, cursor, CHAT_LIMITS.pageSize);
      olderLoadedRef.current = true;
      cursorRef.current = r.oldest;
      setHasMore(r.hasMore);
      if (r.messages.length) {
        setKept((k) => {
          const n = new Map(k);
          r.messages.forEach((m) => { if (!n.has(m.id)) n.set(m.id, m); });
          return n;
        });
      }
    } catch (e) {
      logger.warn('이전 채팅 메시지 불러오기 실패:', e);
    } finally {
      loadingRef.current = false;
      setLoadingOlder(false);
    }
  }, [roomId]);

  const messages = useMemo(() => {
    if (!kept.size) return live;
    const map = new Map(kept);
    live.forEach((m) => map.set(m.id, m));
    return [...map.values()].sort(byTime);
  }, [live, kept]);

  return { messages, loaded, hasMore, loadingOlder, loadOlder };
}

/**
 * 방 사람들이 마지막으로 본 시각 (uid → ms).
 * initial: 처음 받은 값 — 방에 들어올 때의 내 마지막 읽은 시각('여기까지 읽었습니다')에 쓴다 (읽음 표시를 하기 전)
 */
export function useChatReads(roomId: string, enabled: boolean): { reads: Record<string, number>; loaded: boolean; initial: Record<string, number> | null } {
  const [reads, setReads] = useState<Record<string, number>>({});
  const [initial, setInitial] = useState<Record<string, number> | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    return subscribeChatReads(db, roomId, (r) => {
      setReads(r);
      setInitial((v) => v ?? r);
      setLoaded(true);
    }, (e) => {
      logger.warn('채팅 읽음 구독 오류:', e);
      setInitial((v) => v ?? {});
      setLoaded(true);
    });
  }, [roomId, enabled]);
  return { reads, loaded, initial };
}
