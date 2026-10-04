/**
 * 대화방 메시지 — 최근 메시지(실시간) + 위로 올려 더 불러온 이전 메시지 + 사람별 마지막으로 본 시각
 *
 * 실시간 구독은 최근 CHAT_LIMITS.pageSize 개만 본다. 방에 있는 동안 새 메시지가 많이 오면
 * 오래된 쪽이 실시간 창에서 밀려나는데, 그 메시지는 '이전 메시지'로 옮겨 계속 보이게 한다.
 *
 * 대화 내용 검색으로 방 전체 메시지(provideHistory)를 받아 두면, 그 뒤로 위로 올려 더 보기와
 * 검색 결과로 이동(revealMessage)은 Firestore 를 다시 읽지 않고 그 기록에서 채운다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentData, DocumentSnapshot } from 'firebase/firestore';
import {
  CHAT_LIMITS,
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
  /** 방 전체 메시지 (오래된 → 최신) — 받은 뒤로는 이전 메시지를 여기서 채운다 */
  provideHistory: (all: ChatMessageView[]) => void;
  /** 이 메시지가 목록에 있도록 이전 메시지를 그 메시지(+ 앞 몇 개)까지 채운다 — 목록에 있거나 채웠으면 true */
  revealMessage: (messageId: string) => boolean;
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
  const olderRef = useRef<ChatMessageView[]>([]);
  const historyRef = useRef<ChatMessageView[] | null>(null);
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
    olderRef.current = [];
    historyRef.current = null;
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
          if (dropped.length) {
            olderRef.current = mergeById([...olderRef.current, ...dropped]);
            setOlder(olderRef.current);
          }
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

  /** 지금 가진 가장 오래된 메시지 시각 */
  const oldestMillisNow = useCallback(() => {
    const first = olderRef.current[0] ?? liveRef.current[0];
    return first ? messageMillis(first) || Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;
  }, []);

  const setMore = useCallback((more: boolean) => {
    hasMoreRef.current = more;
    setHasMore(more);
  }, []);

  const provideHistory = useCallback((all: ChatMessageView[]) => {
    historyRef.current = all;
    const oldest = oldestMillisNow();
    setMore(all.some((m) => {
      const t = messageMillis(m);
      return t > 0 && t < oldest;
    }));
  }, [oldestMillisNow, setMore]);

  const revealMessage = useCallback((messageId: string): boolean => {
    if (olderRef.current.some((m) => m.id === messageId) || liveRef.current.some((m) => m.id === messageId)) return true;
    const all = historyRef.current;
    const idx = all ? all.findIndex((m) => m.id === messageId) : -1;
    if (!all || idx < 0) return false;
    // 그 메시지 앞 몇 개(맥락)부터 지금 가진 가장 오래된 메시지 직전까지
    const from = Math.max(0, idx - 10);
    const oldest = oldestMillisNow();
    const slice = all.slice(from).filter((m) => {
      const t = messageMillis(m);
      return t > 0 && t < oldest;
    });
    if (slice.length) {
      olderRef.current = mergeById([...slice, ...olderRef.current]);
      setOlder(olderRef.current);
    }
    setMore(from > 0);
    return true;
  }, [oldestMillisNow, setMore]);

  const loadOlder = useCallback(() => {
    // 방 전체 기록이 있으면 거기서 (Firestore 를 다시 읽지 않음)
    const all = historyRef.current;
    if (!enabled) return;
    if (all) {
      const oldest = oldestMillisNow();
      const before = all.filter((m) => {
        const t = messageMillis(m);
        return t > 0 && t < oldest;
      });
      const page = before.slice(-CHAT_LIMITS.pageSize);
      if (page.length) {
        olderRef.current = mergeById([...page, ...olderRef.current]);
        setOlder(olderRef.current);
      }
      setMore(before.length > page.length);
      return;
    }
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
        olderRef.current = mergeById([...r.messages, ...olderRef.current]);
        setOlder(olderRef.current);
      })
      .catch((e) => logger.warn('이전 채팅 메시지 불러오기 실패:', e))
      .finally(() => {
        loadingRef.current = false;
        setLoadingOlder(false);
      });
  }, [roomId, enabled, oldestMillisNow, setMore]);

  const messages = useMemo(() => {
    if (!older.length) return live;
    const liveIds = new Set(live.map((m) => m.id));
    return [...older.filter((m) => !liveIds.has(m.id)), ...live];
  }, [older, live]);

  return { messages, loaded, hasMore, loadingOlder, loadOlder, provideHistory, revealMessage, reads, error };
}
