'use client';

/**
 * 입력창 — 여러 줄(자동 높이, 최대 5줄 정도) · Enter 보내기 / Shift+Enter 줄바꿈 (터치 기기는 Enter = 줄바꿈)
 * [클립] 사진·동영상 고르기 · 붙여 넣기 · (끌어 놓기는 방 화면 전체에서) → 보내기 전 미리보기 줄
 */
import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { FiPaperclip, FiPlay, FiSend, FiX } from 'react-icons/fi';
import { CHAT_LIMITS, L } from '@smis-mentor/shared';
import type { ChatTray } from './useChatTray';
import { formatDuration } from './chatUi';

interface ChatComposerProps {
  tray: ChatTray;
  /** 입력 중인 글 (방마다 따로 — 위에서 들고 있다) */
  text: string;
  onTextChange: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

const MAX_HEIGHT = 128; // 약 5줄

const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export default function ChatComposer({ tray, text, onTextChange, onSend, disabled }: ChatComposerProps) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const tooLong = text.length > CHAT_LIMITS.textMax;
  const hasTray = tray.items.length > 0;
  const canSend = !disabled && !tooLong && !tray.busy && (hasTray || text.trim().length > 0);

  // 자동 높이
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, [text]);

  // 데스크톱은 방을 열면 바로 입력할 수 있게
  useEffect(() => {
    if (!isTouchDevice()) areaRef.current?.focus({ preventScroll: true });
  }, []);

  const submit = () => {
    if (!canSend) return;
    onSend();
    if (!isTouchDevice()) areaRef.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    // 한글 입력 조합 중의 Enter 는 글자 확정용 — 보내지 않는다
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (isTouchDevice()) return;
    e.preventDefault();
    submit();
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (!files.length) return;
    e.preventDefault();
    tray.addFiles(files);
  };

  return (
    <div className="border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      {hasTray && (
        <div className="px-3 pt-3">
          <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin]">
            {tray.items.map((it) => (
              <div key={it.id} className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-gray-200">
                {it.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.previewUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    {it.loading ? <span className="w-5 h-5 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin" /> : <FiPlay />}
                  </div>
                )}
                {it.kind === 'video' && !it.loading && (
                  <span className="absolute left-1 bottom-1 inline-flex items-center gap-0.5 rounded bg-black/60 px-1 text-[10px] text-white">
                    <FiPlay size={9} />
                    {formatDuration(it.durationMs)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => tray.remove(it.id)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                  aria-label={L('chat.webRemove')}
                  title={L('chat.webRemove')}
                >
                  <FiX size={12} />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-start justify-between gap-3 pb-1">
            <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={tray.original}
                onChange={(e) => tray.setOriginal(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                {L('chat.sendOriginal')}
                <span className="block text-xs text-gray-500">{L('chat.sendOriginalHint')}</span>
              </span>
            </label>
            <span className="text-xs text-gray-500 shrink-0 pt-0.5">
              {tray.items.length}/{CHAT_LIMITS.mediaMax}
            </span>
          </div>
        </div>
      )}
      <div className="flex items-end gap-2 px-2 py-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || tray.items.length >= CHAT_LIMITS.mediaMax}
          className="h-10 w-10 shrink-0 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 flex items-center justify-center disabled:opacity-40"
          aria-label={L('chat.attach')}
          title={L('chat.attach')}
        >
          <FiPaperclip size={20} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => {
            tray.addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div className={`flex-1 min-w-0 rounded-2xl border bg-gray-50 transition-colors ${focused ? 'border-blue-400 bg-white' : 'border-gray-200'}`}>
          <textarea
            ref={areaRef}
            value={text}
            rows={1}
            disabled={disabled}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={L('chat.inputPlaceholder')}
            className="block w-full resize-none bg-transparent px-3.5 py-2 text-[15px] leading-6 text-gray-900 placeholder:text-gray-400 focus:outline-none"
            enterKeyHint={isTouchDevice() ? 'enter' : 'send'}
          />
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="h-10 w-10 shrink-0 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
          aria-label={L('chat.send')}
          title={L('chat.send')}
        >
          {tray.busy ? <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" /> : <FiSend size={18} />}
        </button>
      </div>
      {tooLong && <p className="px-4 pb-2 -mt-1 text-xs text-red-500">{L('chat.textTooLong', { max: CHAT_LIMITS.textMax })}</p>}
    </div>
  );
}
