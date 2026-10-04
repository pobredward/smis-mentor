/**
 * 대화방 안에서 특정 메시지·줄로 이동 — 검색 결과 · 답장 원문 · 공지 · 나를 언급 · '여기까지 읽었습니다'
 * 목록에 없으면 받아 둔 전체 기록(없으면 불러와서)에서 그 메시지까지 채운 뒤 scrollToIndex.
 * 아직 그려지지 않은(높이를 모르는) 줄이면 어림한 위치로 먼저 간 뒤 다시 시도한다.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { FlatList } from 'react-native';
import type { ChatMessageView } from '@smis-mentor/shared';
import type { ChatRow } from '../components/chat/MessageRow';

interface Params {
  rows: ChatRow[];
  listRef: RefObject<FlatList<ChatRow> | null>;
  revealMessage: (id: string) => boolean;
  ensureHistory: () => Promise<ChatMessageView[] | null>;
}

export function useChatJump({ rows, listRef, revealMessage, ensureHistory }: Params) {
  const [flashId, setFlashId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const pendingRef = useRef<{ key: string; viewPosition: number } | null>(null);
  const retryRef = useRef(0);
  const lastViewPositionRef = useRef(0.5);

  /** 줄(key)이 목록에 들어오면 그 자리로 */
  const scrollToKey = useCallback((key: string, viewPosition = 0.5) => {
    pendingRef.current = { key, viewPosition };
    retryRef.current = 0;
    setTick((n) => n + 1);
  }, []);

  /** 메시지로 이동 + 잠깐 밝히기 — 찾지 못하면 false */
  const jumpTo = useCallback(
    async (id: string): Promise<boolean> => {
      let ok = revealMessage(id);
      if (!ok) {
        const all = await ensureHistory();
        ok = !!all && revealMessage(id);
      }
      if (!ok) return false;
      setFlashId(id);
      scrollToKey(id, 0.5);
      return true;
    },
    [revealMessage, ensureHistory, scrollToKey],
  );

  useEffect(() => {
    const p = pendingRef.current;
    if (!p) return;
    const index = rows.findIndex((r) => r.key === p.key);
    if (index < 0) return; // 목록에 들어오면 다시
    pendingRef.current = null;
    lastViewPositionRef.current = p.viewPosition;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index, viewPosition: p.viewPosition, animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [rows, tick, listRef]);

  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength: number }) => {
      listRef.current?.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index), animated: false });
      if (retryRef.current >= 5) return;
      retryRef.current += 1;
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: info.index, viewPosition: lastViewPositionRef.current, animated: true });
      }, 150);
    },
    [listRef],
  );

  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 1800);
    return () => clearTimeout(t);
  }, [flashId, tick]);

  const cancelPending = useCallback(() => {
    pendingRef.current = null;
    setFlashId(null);
  }, []);

  return { jumpTo, scrollToKey, flashId, onScrollToIndexFailed, cancelPending };
}
