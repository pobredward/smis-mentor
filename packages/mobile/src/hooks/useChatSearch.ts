/**
 * 대화 내용 검색 (카톡처럼) — 처음 검색할 때 방 전체를 한 번 불러와 기기에서 찾는다.
 * 결과는 최신 것부터, ↑ 이전(더 예전) · ↓ 다음(더 최근). 차단한 사람 메시지는 찾지 않는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { L, chatFirstMessageAt, chatMessageOnDate, normalizeChatSearch, searchChatMessages, type ChatMessageView } from '@smis-mentor/shared';
import type { ChatHistoryApi } from './useChatHistory';

interface Params {
  messages: ChatMessageView[];
  history: ChatHistoryApi;
  blocked?: Record<string, boolean>;
  jumpTo: (id: string) => Promise<boolean>;
  onLoadFailed: () => void;
}

export function useChatSearch({ messages, history, blocked, jumpTo, onLoadFailed }: Params) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  /** 입력을 250ms 묶은 검색어 */
  const [query, setQuery] = useState('');
  const [currentId, setCurrentId] = useState<string | null>(null);

  const openSearch = useCallback(() => {
    setOpen(true);
    void history.ensure().then((all) => {
      if (!all) onLoadFailed();
    });
  }, [history, onLoadFailed]);

  const closeSearch = useCallback(() => {
    setOpen(false);
    setText('');
    setQuery('');
    setCurrentId(null);
    Keyboard.dismiss();
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setQuery(text), 250);
    return () => clearTimeout(t);
  }, [text, open]);

  // 찾을 메시지 — 방 전체 기록 + 그 뒤로 온(또는 바뀐) 메시지. 기록을 못 불러왔으면 지금 가진 것만
  const pool = useMemo(() => {
    if (!open) return null;
    if (!history.history) return history.failed ? messages : null;
    const map = new Map<string, ChatMessageView>();
    history.history.forEach((m) => map.set(m.id, m));
    messages.forEach((m) => map.set(m.id, m));
    return [...map.values()];
  }, [open, history.history, history.failed, messages]);
  const ready = !!pool;

  const hits = useMemo(() => (pool && query ? searchChatMessages(pool, query, blocked) : []), [pool, query, blocked]);
  const hitSet = useMemo(() => new Set(hits), [hits]);
  const hitsRef = useRef(hits);
  hitsRef.current = hits;
  const currentIdx = currentId ? hits.indexOf(currentId) : -1;

  // 검색어가 바뀌면(또는 기록을 다 불러오면) 가장 최근 결과로
  useEffect(() => {
    if (!open || !ready) return;
    const first = hitsRef.current[0] ?? null;
    setCurrentId(first);
    if (first) void jumpTo(first);
  }, [query, open, ready, jumpTo]);

  const goToHit = useCallback(
    (i: number) => {
      const id = hits[i];
      if (!id) return;
      setCurrentId(id);
      void jumpTo(id);
    },
    [hits, jumpTo],
  );
  const goOlder = useCallback(() => {
    if (!hits.length) return;
    goToHit(currentIdx < 0 ? 0 : Math.min(hits.length - 1, currentIdx + 1));
  }, [hits.length, currentIdx, goToHit]);
  const goNewer = useCallback(() => {
    if (currentIdx > 0) goToHit(currentIdx - 1);
  }, [currentIdx, goToHit]);
  /** 키보드 [검색] — 아직 묶이지 않은 검색어면 바로 찾고, 아니면 이전 결과로 */
  const submit = useCallback(() => {
    if (text !== query) {
      setQuery(text);
      return;
    }
    goOlder();
  }, [text, query, goOlder]);

  /** 날짜 고르기 — 가장 이른 날 (기록을 다 불러오기 전엔 지금 가진 메시지 기준) */
  const firstDate = useMemo(() => chatFirstMessageAt(pool ?? messages), [pool, messages]);

  /** 그날 첫 메시지로 (카톡의 '날짜로 이동') — 그날 대화가 없으면 가까운 날 */
  const goToDate = useCallback(
    async (day: Date): Promise<'exact' | 'nearest' | 'none'> => {
      let list = pool;
      if (!list) {
        const all = await history.ensure();
        if (!all) onLoadFailed();
        const map = new Map<string, ChatMessageView>();
        (all ?? []).forEach((m) => map.set(m.id, m));
        messages.forEach((m) => map.set(m.id, m));
        list = [...map.values()];
      }
      const hit = chatMessageOnDate(list, day, blocked);
      if (!hit) return 'none';
      Keyboard.dismiss();
      setCurrentId(null);
      const ok = await jumpTo(hit.id);
      if (!ok) return 'none';
      return hit.exact ? 'exact' : 'nearest';
    },
    [pool, history, onLoadFailed, messages, blocked, jumpTo],
  );

  let status = '';
  if (history.loading !== null) status = L('chat.searching', { n: history.loading });
  else if (!normalizeChatSearch(query)) status = '';
  else if (!hits.length) status = L('chat.searchNoResults');
  else status = L('chat.searchCount', { i: Math.max(0, currentIdx) + 1, n: hits.length });

  return {
    open,
    openSearch,
    closeSearch,
    text,
    setText,
    query,
    hits,
    hitSet,
    currentIdx,
    goOlder,
    goNewer,
    submit,
    firstDate,
    goToDate,
    status,
    loading: history.loading !== null,
  };
}
