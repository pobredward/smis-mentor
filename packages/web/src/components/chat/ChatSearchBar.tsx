'use client';

/**
 * 대화 내용 검색 줄 (카톡처럼) — 머리글 아래
 * Enter · ↑ = 이전(더 예전) 결과, Shift+Enter · ↓ = 다음(더 최근) 결과, Esc = 닫기
 * 📅 = 날짜로 이동 (그날 첫 메시지 — 카톡처럼)
 */
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { FiCalendar, FiChevronDown, FiChevronUp, FiSearch, FiX } from 'react-icons/fi';
import { L } from '@smis-mentor/shared';

export interface ChatSearchBarProps {
  query: string;
  onQueryChange: (q: string) => void;
  /** 전체 대화를 불러오는 중 — 지금까지 몇 개 */
  loading: boolean;
  loadedCount: number;
  /** 결과 수 · 지금 결과 (0 = 가장 최근) — 검색어가 없으면 total 0 */
  total: number;
  index: number;
  /** 검색어가 있고 다 찾았는데 결과가 없음 */
  noResults: boolean;
  onOlder: () => void;
  onNewer: () => void;
  onClose: () => void;
  /** 날짜로 이동 — 'YYYY-MM-DD' (없으면 📅 숨김) */
  onPickDate?: (ymd: string) => void;
  /** 고를 수 있는 날 (YYYY-MM-DD) */
  minDate?: string;
  maxDate?: string;
}

const btn = 'h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent';

export default function ChatSearchBar({ query, onQueryChange, loading, loadedCount, total, index, noResults, onOlder, onNewer, onClose, onPickDate, minDate, maxDate }: ChatSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  /** 📅 — 브라우저 날짜 창 (showPicker 가 없으면 입력칸에 초점) */
  const openDate = () => {
    const el = dateRef.current;
    if (!el) return;
    el.value = '';
    try {
      if (typeof el.showPicker === 'function') {
        el.showPicker();
        return;
      }
    } catch {
      /* 사용자 동작이 아니라고 거절될 때 — 아래로 */
    }
    el.focus();
    el.click();
  };
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return; // 한글 조합 중
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) onNewer();
      else onOlder();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      onOlder();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      onNewer();
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 md:px-3 py-1.5 bg-white border-b border-gray-200 shrink-0" role="search">
      <div className="flex-1 min-w-0 flex items-center gap-2 rounded-full bg-gray-100 pl-3 pr-1 h-9">
        <FiSearch className="shrink-0 text-gray-400" size={16} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={L('chat.searchPlaceholder')}
          aria-label={L('chat.search')}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
        />
        {query && (
          <button type="button" onClick={() => onQueryChange('')} className="h-7 w-7 shrink-0 rounded-full text-gray-400 hover:text-gray-600 flex items-center justify-center" aria-label={L('common.close')}>
            <FiX size={14} />
          </button>
        )}
      </div>
      <div className="shrink-0 min-w-[2.75rem] text-center text-xs tabular-nums text-gray-500" aria-live="polite">
        {loading ? (
          <span className="inline-flex items-center gap-1" title={L('chat.searching', { n: loadedCount })}>
            <span className="w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            <span className="hidden sm:inline">{L('chat.searching', { n: loadedCount })}</span>
            <span className="sm:hidden">{loadedCount}</span>
          </span>
        ) : noResults ? (
          <span className="whitespace-nowrap">{L('chat.searchNoResults')}</span>
        ) : total > 0 ? (
          L('chat.searchCount', { i: index + 1, n: total })
        ) : null}
      </div>
      {onPickDate && (
        <span className="relative shrink-0">
          <button type="button" onClick={openDate} disabled={loading} className={btn} aria-label={L('chat.jumpToDate')} title={L('chat.jumpToDate')}>
            <FiCalendar size={18} />
          </button>
          <input
            ref={dateRef}
            type="date"
            min={minDate}
            max={maxDate}
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              if (e.target.value) onPickDate(e.target.value);
            }}
            className="absolute left-0 bottom-0 h-px w-px opacity-0 pointer-events-none"
          />
        </span>
      )}
      <button type="button" onClick={onOlder} disabled={!total || index >= total - 1} className={btn} aria-label={L('chat.searchOlder')} title={L('chat.searchOlder')}>
        <FiChevronUp size={20} />
      </button>
      <button type="button" onClick={onNewer} disabled={!total || index <= 0} className={btn} aria-label={L('chat.searchNewer')} title={L('chat.searchNewer')}>
        <FiChevronDown size={20} />
      </button>
      <button type="button" onClick={onClose} className={btn} aria-label={L('chat.searchClose')} title={L('chat.searchClose')}>
        <FiX size={20} />
      </button>
    </div>
  );
}
