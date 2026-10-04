/**
 * 대화방 전체 메시지 — 처음 필요할 때(검색 · 내보내기 · 불러온 범위 밖으로 이동) 한 번 불러와 화면이 있는 동안 둔다.
 * 받으면 provideHistory 로 넘겨, 위로 올려 더 보기 · 이동이 Firestore 를 다시 읽지 않게 한다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadAllChatMessages, logger, type ChatMessageView } from '@smis-mentor/shared';
import { db } from '../config/firebase';

export interface ChatHistoryApi {
  history: ChatMessageView[] | null;
  /** 불러오는 중이면 지금까지 받은 개수 */
  loading: number | null;
  failed: boolean;
  /** 없으면 불러온다 (이미 불러오는 중이면 그것을 기다린다) — 실패하면 null */
  ensure: () => Promise<ChatMessageView[] | null>;
}

export function useChatHistory(roomId: string, enabled: boolean, provideHistory: (all: ChatMessageView[]) => void): ChatHistoryApi {
  const [history, setHistory] = useState<ChatMessageView[] | null>(null);
  const [loading, setLoading] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const promiseRef = useRef<Promise<ChatMessageView[] | null> | null>(null);

  useEffect(() => {
    setHistory(null);
    setLoading(null);
    setFailed(false);
    promiseRef.current = null;
  }, [roomId]);

  const ensure = useCallback((): Promise<ChatMessageView[] | null> => {
    if (!enabled) return Promise.resolve(null);
    if (promiseRef.current) return promiseRef.current;
    setFailed(false);
    setLoading(0);
    const p = loadAllChatMessages(db, roomId, { onProgress: (n) => setLoading(n) })
      .then((all) => {
        setHistory(all);
        provideHistory(all);
        return all;
      })
      .catch((e) => {
        logger.warn('대화 전체 불러오기 실패:', e);
        promiseRef.current = null;
        setFailed(true);
        return null;
      })
      .finally(() => setLoading(null));
    promiseRef.current = p;
    return p;
  }, [enabled, roomId, provideHistory]);

  return { history, loading, failed, ensure };
}
