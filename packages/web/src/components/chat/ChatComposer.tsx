'use client';

/**
 * 입력창 — 여러 줄(자동 높이, 최대 5줄 정도) · Enter 보내기 / Shift+Enter 줄바꿈 (터치 기기는 Enter = 줄바꿈)
 * [+] 사진·동영상 · 투표 · 예약 메시지 / 보내기 옆 ▾ 조용히 보내기 · 예약 메시지 / 비었을 때 🎤 음성 메시지
 * 위쪽 줄: 예약 메시지 n개 · 조용히 보내기 안내 · 답장 · 수정 중 · 보내기 전 미리보기
 * '@' 를 치면 멘션 고르기 (1:1 대화 빼고)
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import toast from 'react-hot-toast';
import {
  FiBarChart2,
  FiBellOff,
  FiCheck,
  FiChevronDown,
  FiClock,
  FiCornerUpLeft,
  FiEdit2,
  FiImage,
  FiMic,
  FiPlay,
  FiPlus,
  FiSend,
  FiSquare,
  FiX,
} from 'react-icons/fi';
import {
  CHAT_LIMITS,
  L,
  canMentionAll,
  chatReplyPreview,
  chatReplyRefOf,
  formatChatDuration,
  mentionCandidates,
  type ChatMessageView,
  type ChatRoom,
  type Locale,
} from '@smis-mentor/shared';
import { ChatActionMenu, type ChatMenuAction, type ChatMenuAnchor } from './ChatMenus';
import { useVoiceRecorder, voiceRecordMime } from './ChatVoice';
import type { ChatTray } from './useChatTray';
import { PersonAvatar, formatDuration, kindLabel } from './chatUi';

export interface ChatComposerProps {
  tray: ChatTray;
  /** 입력 중인 글 (방마다 따로 — 위에서 들고 있다) */
  text: string;
  onTextChange: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
  room: ChatRoom;
  myUid: string;
  lang: Locale;
  /** 답장 중인 메시지 */
  reply: ChatMessageView | null;
  onCancelReply: () => void;
  /** 고치는 중인 메시지 */
  editing: ChatMessageView | null;
  onCancelEdit: () => void;
  /** 조용히 보내기 */
  silent: boolean;
  onToggleSilent: () => void;
  /** 이 방의 내 예약 메시지 수 */
  scheduledCount: number;
  onOpenScheduled: () => void;
  onOpenPoll: () => void;
  onOpenSchedule: () => void;
  onSendVoice: (blob: Blob, durationMs: number) => void;
  /** 녹음할 수 있는가 (없으면 브라우저를 보고 정한다) */
  voiceSupported?: boolean;
}

const MAX_HEIGHT = 128; // 약 5줄

const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

/** 커서 바로 앞의 '@검색어' (단어 처음의 @) */
function mentionAt(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|\s)@([^\s@]{0,30})$/.exec(before);
  if (!m) return null;
  return { start: before.length - m[2].length - 1, query: m[2] };
}

interface MentionItem {
  key: string;
  insert: string;
  name: string;
  sub: string;
  photo?: string;
  all?: boolean;
}

export default function ChatComposer(props: ChatComposerProps) {
  const {
    tray, text, onTextChange, onSend, disabled, room, myUid, lang, reply, onCancelReply, editing, onCancelEdit,
    silent, onToggleSilent, scheduledCount, onOpenScheduled, onOpenPoll, onOpenSchedule, onSendVoice,
  } = props;
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState(0);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ anchor: ChatMenuAnchor; kind: 'plus' | 'send' } | null>(null);
  const [voiceSupported] = useState(() => props.voiceSupported ?? !!voiceRecordMime());
  const recorder = useVoiceRecorder((r) => onSendVoice(r.blob, r.durationMs));
  const tooLong = text.length > CHAT_LIMITS.textMax;
  const hasTray = tray.items.length > 0;
  const empty = !text.trim() && !hasTray;
  const canSend = !disabled && !tooLong && !tray.busy && (hasTray || text.trim().length > 0);
  const showMic = empty && !editing;

  // 자동 높이
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
  }, [text]);

  // 데스크톱은 방을 열면 바로 입력할 수 있게 · 답장/수정을 고르면 입력칸으로
  useEffect(() => {
    if (!isTouchDevice()) areaRef.current?.focus({ preventScroll: true });
  }, [reply?.id, editing?.id]);

  // ── @멘션 ──────────────────────────────────────────────
  const token = room.type === 'dm' ? null : mentionAt(text, caret);
  const mentionItems = useMemo<MentionItem[]>(() => {
    if (!token || token.start === dismissedAt) return [];
    const q = token.query.toLocaleLowerCase();
    const out: MentionItem[] = [];
    const allWord = L('chat.mentionAll');
    if (canMentionAll(room, myUid) && (!q || allWord.toLocaleLowerCase().startsWith(q) || 'all'.startsWith(q) || '모두'.startsWith(q))) {
      out.push({ key: 'all', insert: allWord, name: `@${allWord}`, sub: L('chat.mentionAllDesc'), all: true });
    }
    mentionCandidates(room, myUid, token.query).slice(0, 8).forEach((c) => {
      out.push({ key: c.uid, insert: c.name, name: c.name, sub: [kindLabel(c.kind), c.label].filter(Boolean).join(' · '), photo: room.memberInfo?.[c.uid]?.photo });
    });
    return out;
  }, [token?.start, token?.query, dismissedAt, room, myUid]); // eslint-disable-line react-hooks/exhaustive-deps
  const mentionOpen = mentionItems.length > 0;
  const activeMention = Math.min(mentionIndex, Math.max(0, mentionItems.length - 1));

  const insertMention = (it: MentionItem) => {
    if (!token) return;
    const before = text.slice(0, token.start);
    const after = text.slice(caret);
    const next = `${before}@${it.insert} ${after.replace(/^\s+/, '')}`;
    const pos = before.length + it.insert.length + 2;
    onTextChange(next);
    setCaret(pos);
    setMentionIndex(0);
    requestAnimationFrame(() => {
      const el = areaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const syncCaret = () => {
    const el = areaRef.current;
    if (el) setCaret(el.selectionStart ?? el.value.length);
  };

  const submit = () => {
    if (!canSend) return;
    onSend();
    setDismissedAt(null);
    if (!isTouchDevice()) areaRef.current?.focus({ preventScroll: true });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 한글 입력 조합 중의 Enter 는 글자 확정용 — 보내지 않는다
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (mentionOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex((activeMention + 1) % mentionItems.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex((activeMention - 1 + mentionItems.length) % mentionItems.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionItems[activeMention]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setDismissedAt(token?.start ?? null); return; }
    }
    if (e.key === 'Escape') {
      if (editing) { e.preventDefault(); onCancelEdit(); return; }
      if (reply) { e.preventDefault(); onCancelReply(); return; }
    }
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
    if (isTouchDevice()) return;
    e.preventDefault();
    submit();
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (!files.length || editing) return;
    e.preventDefault();
    tray.addFiles(files);
  };

  const openMenu = (kind: 'plus' | 'send', el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setMenu({ kind, anchor: { x: kind === 'plus' ? r.left : r.right - 220, y: r.top - 8, sheet: isTouchDevice() } });
  };

  const scheduleAction: ChatMenuAction = { key: 'schedule', label: L('chat.schedule'), icon: <FiClock size={16} />, onSelect: onOpenSchedule };
  const plusActions: ChatMenuAction[] = [
    { key: 'attach', label: L('chat.attach'), icon: <FiImage size={16} />, onSelect: () => fileRef.current?.click() },
    { key: 'poll', label: L('chat.poll'), icon: <FiBarChart2 size={16} />, onSelect: onOpenPoll },
    scheduleAction,
  ];
  const sendActions: ChatMenuAction[] = [
    { key: 'silent', label: L('chat.silentSend'), icon: <FiBellOff size={16} />, checked: silent, onSelect: onToggleSilent },
    scheduleAction,
  ];

  const startVoice = () => {
    if (!voiceSupported) {
      toast(L('chat.voiceWebUnsupported'));
      return;
    }
    void recorder.start();
  };
  const finishVoice = async () => {
    const r = await recorder.stop(true);
    if (!r) return;
    if (r.blob.size > CHAT_LIMITS.audioMaxBytes) {
      toast.error(L('chat.voiceTooLong'));
      return;
    }
    onSendVoice(r.blob, r.durationMs);
  };

  const replyRef = reply ? chatReplyRefOf(reply) : null;
  const replyName = reply ? room.memberInfo?.[reply.senderId]?.name ?? reply.senderName : '';

  return (
    <div className="relative border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)]">
      {mentionOpen && (
        <div className="absolute bottom-full left-2 right-2 mb-1 z-20 max-h-64 overflow-y-auto rounded-xl bg-white shadow-xl ring-1 ring-black/5 py-1" role="listbox">
          {mentionItems.map((it, i) => (
            <button
              key={it.key}
              type="button"
              role="option"
              aria-selected={i === activeMention}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertMention(it)}
              onMouseEnter={() => setMentionIndex(i)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left ${i === activeMention ? 'bg-blue-50' : ''}`}
            >
              {it.all ? (
                <span className="h-8 w-8 shrink-0 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-bold">@</span>
              ) : (
                <PersonAvatar name={it.name} photo={it.photo} size={32} />
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900 truncate">{it.name}</span>
                {it.sub && <span className="block text-xs text-gray-500 truncate">{it.sub}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {scheduledCount > 0 && (
        <button type="button" onClick={onOpenScheduled} className="w-full flex items-center gap-2 px-4 py-1.5 text-xs text-blue-700 bg-blue-50/70 hover:bg-blue-50 border-b border-blue-100">
          <FiClock size={13} />
          {L('chat.scheduledN', { n: scheduledCount })}
          <FiChevronDown size={13} className="-rotate-90 ml-auto" />
        </button>
      )}
      {silent && (
        <div className="flex items-center gap-2 px-4 py-1.5 text-xs text-gray-600 bg-gray-50 border-b border-gray-100">
          <FiBellOff size={13} className="shrink-0" />
          <span className="min-w-0 flex-1">{L('chat.silentOn')}</span>
          <button type="button" onClick={onToggleSilent} className="h-6 w-6 shrink-0 rounded-full hover:bg-gray-200 flex items-center justify-center" aria-label={L('common.close')}>
            <FiX size={13} />
          </button>
        </div>
      )}
      {(replyRef || editing) && (
        <div className="flex items-center gap-2.5 px-4 py-2 border-b border-gray-100">
          {editing ? <FiEdit2 size={15} className="shrink-0 text-blue-500" /> : <FiCornerUpLeft size={15} className="shrink-0 text-blue-500" />}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-gray-800 truncate">{editing ? L('chat.editing') : L('chat.replyingTo', { name: replyName })}</div>
            {replyRef && !editing && <div className="text-xs text-gray-500 truncate">{chatReplyPreview(replyRef, lang)}</div>}
          </div>
          {replyRef?.thumbUrl && !editing && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={replyRef.thumbUrl} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
          )}
          <button
            type="button"
            onClick={editing ? onCancelEdit : onCancelReply}
            className="h-8 w-8 shrink-0 rounded-full text-gray-500 hover:bg-gray-100 flex items-center justify-center"
            aria-label={L('common.cancel')}
          >
            <FiX size={16} />
          </button>
        </div>
      )}

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

      {recorder.recording ? (
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            type="button"
            onClick={() => void recorder.stop(false)}
            className="h-10 w-10 shrink-0 rounded-full text-gray-500 hover:bg-gray-100 flex items-center justify-center"
            aria-label={L('chat.voiceCancel')}
            title={L('chat.voiceCancel')}
          >
            <FiX size={20} />
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-2 rounded-2xl bg-red-50 px-3.5 h-10 text-sm text-red-700">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 animate-pulse" />
            <span className="tabular-nums">{L('chat.voiceRecording', { t: formatChatDuration(recorder.elapsed) })}</span>
            <span className="ml-auto text-xs text-red-400 tabular-nums">{formatChatDuration(CHAT_LIMITS.voiceMaxMs)}</span>
          </div>
          <button
            type="button"
            onClick={() => void finishVoice()}
            className="h-10 w-10 shrink-0 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
            aria-label={L('chat.voiceStop')}
            title={L('chat.voiceStop')}
          >
            <FiSquare size={16} />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5 px-2 py-2">
          <button
            type="button"
            onClick={(e) => openMenu('plus', e.currentTarget)}
            disabled={disabled || !!editing}
            className="h-10 w-10 shrink-0 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 flex items-center justify-center disabled:opacity-40"
            aria-label={L('chat.attach')}
            title={L('chat.attach')}
          >
            <FiPlus size={22} />
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
              onChange={(e) => {
                onTextChange(e.target.value);
                setCaret(e.target.selectionStart ?? e.target.value.length);
                setMentionIndex(0);
              }}
              onKeyDown={onKeyDown}
              onKeyUp={(e) => { if (!['ArrowUp', 'ArrowDown', 'Enter', 'Tab'].includes(e.key)) syncCaret(); }}
              onClick={syncCaret}
              onPaste={onPaste}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={L('chat.inputPlaceholder')}
              className="block w-full resize-none bg-transparent px-3.5 py-2 text-[15px] leading-6 text-gray-900 placeholder:text-gray-400 focus:outline-none"
              enterKeyHint={isTouchDevice() ? 'enter' : 'send'}
            />
          </div>
          {showMic ? (
            <button
              type="button"
              onClick={startVoice}
              disabled={disabled}
              aria-disabled={!voiceSupported || undefined}
              className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center transition-colors ${voiceSupported ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' : 'bg-gray-100 text-gray-300'}`}
              aria-label={L('chat.voice')}
              title={voiceSupported ? L('chat.voiceRecord') : L('chat.voiceWebUnsupported')}
            >
              <FiMic size={18} />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSend}
              className="h-10 w-10 shrink-0 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
              aria-label={editing ? L('chat.editSave') : silent ? L('chat.silentSend') : L('chat.send')}
              title={editing ? L('chat.editSave') : silent ? L('chat.silentSend') : L('chat.send')}
            >
              {tray.busy ? (
                <span className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              ) : editing ? (
                <FiCheck size={18} />
              ) : silent ? (
                <FiBellOff size={17} />
              ) : (
                <FiSend size={18} />
              )}
            </button>
          )}
          {!editing && (
            <button
              type="button"
              onClick={(e) => openMenu('send', e.currentTarget)}
              disabled={disabled}
              className={`-ml-1 h-10 w-6 shrink-0 rounded-full flex items-center justify-center hover:bg-gray-100 ${silent ? 'text-blue-600' : 'text-gray-400'}`}
              aria-label={L('chat.silentSend')}
              title={L('chat.silentSend')}
            >
              <FiChevronDown size={16} />
            </button>
          )}
        </div>
      )}
      {tooLong && <p className="px-4 pb-2 -mt-1 text-xs text-red-500">{L('chat.textTooLong', { max: CHAT_LIMITS.textMax })}</p>}
      {menu && (
        <ChatActionMenu
          anchor={menu.anchor}
          actions={menu.kind === 'plus' ? plusActions : sendActions}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
