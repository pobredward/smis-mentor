/**
 * 대화방 메시지 — 최근 메시지(실시간) + 위로 올려 더 불러온 이전 메시지 + 사람별 마지막으로 본 시각
 *
 * 실시간 구독은 최근 CHAT_LIMITS.pageSize 개만 본다. 방에 있는 동안 새 메시지가 많이 오면
 * 오래된 쪽이 실시간 창에서 밀려나는데, 그 메시지는 '이전 메시지'로 옮겨 계속 보이게 한다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import {
  loadOlderChatMessages,
  logger,
  subscribeChatMessages,
  subscribeChatReads,
  type ChatMessageView,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';

export const messageMillis = (m: Pick<ChatMessageView, 'createdAt'>): number => {
  const ts = m.createdAt as { toMillis?: () => number } | null;
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
};

function mergeById(list: ChatMessageView[]): ChatMessageView[] {
  const seen = new Map<string, ChatMessageView>();
  list.forEach((m) => seen.set(m.id, m));
  return [...seen.values()].sort((a, b) => messageMillis(a) - messageMillis(b));
}

export interface ChatMessagesState {
  /** 오래된 것 → 최신 */
  messages: ChatMessageView[];
  /** 첫 메시지 묶음을 받았는가 */
  loaded: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  loadOlder: () => void;
  /** uid → 그 방을 마지막으로 본 시각(ms) */
  reads: Record<string, number>;
  error: Error | null;
}

export function useChatMessages(roomId: string, enabled: boolean): ChatMessagesState {
  const [live, setLive] = useState<ChatMessageView[]>([]);
  const [older, setOlder] = useState<ChatMessageView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reads, setReads] = useState<Record<string, number>>({});
  const [error, setError] = useState<Error | null>(null);

  const liveRef = useRef<ChatMessageView[]>([]);
  const cursorRef = useRef<DocumentSnapshot<DocumentData> | null>(null);
  const hasMoreRef = useRef(false);
  const loadingRef = useRef(false);

  useEffect(() => {
    setLive([]);
    setOlder([]);
    setLoaded(false);
    setHasMore(false);
    setReads({});
    setError(null);
    liveRef.current = [];
    cursorRef.current = null;
    hasMoreRef.current = false;
    if (!enabled) return;

    const offMessages = subscribeChatMessages(
      db,
      roomId,
      (msgs, info) => {
        const prev = liveRef.current;
        if (prev.length && msgs.length) {
          // 실시간 창에서 밀려난 (더 오래된) 메시지는 이전 메시지로 옮긴다
          const ids = new Set(msgs.map((m) => m.id));
          const firstAt = messageMillis(msgs[0]);
          const dropped = prev.filter((m) => !ids.has(m.id) && !m.pending && messageMillis(m) > 0 && messageMillis(m) <= firstAt);
          if (dropped.length) setOlder((o) => mergeById([...o, ...dropped]));
        }
        liveRef.current = msgs;
        setLive(msgs);
        // 위로 더 불러올 기준은 처음 받은 묶음의 가장 오래된 메시지 (그 뒤로는 loadOlder 가 옮긴다)
        if (!cursorRef.current && info.oldest) {
          cursorRef.current = info.oldest;
          hasMoreRef.current = info.hasMore;
          setHasMore(info.hasMore);
        }
        setLoaded(true);
      },
      {
        onError: (e) => {
          logger.warn('채팅 메시지 구독 실패:', e);
          setError(e);
          setLoaded(true);
        },
      },
    );
    const offReads = subscribeChatReads(db, roomId, setReads, (e) => logger.warn('채팅 읽음 구독 실패:', e));
    return () => {
      offMessages();
      offReads();
    };
  }, [roomId, enabled]);

  const loadOlder = useCallback(() => {
    const cursor = cursorRef.current;
    if (!enabled || loadingRef.current || !hasMoreRef.current || !cursor) return;
    loadingRef.current = true;
    setLoadingOlder(true);
    loadOlderChatMessages(db, roomId, cursor)
      .then((r) => {
        if (cursorRef.current !== cursor) return; // 그 사이 방이 바뀌었다
        cursorRef.current = r.oldest;
        hasMoreRef.current = r.hasMore;
        setHasMore(r.hasMore);
        setOlder((o) => mergeById([...r.messages, ...o]));
      })
      .catch((e) => logger.warn('이전 채팅 메시지 불러오기 실패:', e))
      .finally(() => {
        loadingRef.current = false;
        setLoadingOlder(false);
      });
  }, [roomId, enabled]);

  const messages = useMemo(() => {
    if (!older.length) return live;
    const liveIds = new Set(live.map((m) => m.id));
    return [...older.filter((m) => !liveIds.has(m.id)), ...live];
  }, [older, live]);

  return { messages, loaded, hasMore, loadingOlder, loadOlder, reads, error };
}
