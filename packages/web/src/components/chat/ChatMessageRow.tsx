'use client';

/**
 * 말풍선 한 줄 (카톡 모양)
 * - 남의 메시지: 왼쪽 · 흰색, 묶음 첫 메시지에 사진+이름 (아니면 그 자리 비움)
 * - 내 메시지: 오른쪽 · 파란색
 * - 말풍선 옆 아래: 안 읽은 사람 수(노란 숫자) · 시각 / 보내는 중이면 시계
 * - 길게 누르기 · 우클릭 · [⋯] 버튼 → 메시지 메뉴
 */
import { memo, useRef, type MouseEvent, type ReactNode, type TouchEvent } from 'react';
import { FiAlertCircle, FiClock, FiMoreHorizontal, FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import { L, chatTimeLabel, type ChatMemberInfo, type ChatMessageView, type ChatRowLayout, type Locale } from '@smis-mentor/shared';
import ChatMediaGrid, { type ChatGridCell } from './ChatMediaGrid';
import type { ChatMenuAnchor } from './ChatMenus';
import type { ChatOutgoing } from './chatTypes';
import { PersonAvatar, linkify } from './chatUi';

const isCoarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** 길게 누르기 (터치) — 0.5초. 누른 뒤 따라오는 click 은 막는다 */
function useLongPress(onLongPress: (a: ChatMenuAnchor) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
      fired.current = false;
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        if (navigator.vibrate) navigator.vibrate(10);
        onLongPress({ x: t.clientX, y: t.clientY, sheet: true });
      }, 500);
    },
    onTouchMove: (e: TouchEvent) => {
      const t = e.touches[0];
      const s = start.current;
      if (s && Math.hypot(t.clientX - s.x, t.clientY - s.y) > 10) clear();
    },
    onTouchEnd: clear,
    onTouchCancel: clear,
    onClickCapture: (e: MouseEvent) => {
      if (fired.current) {
        fired.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      clear();
      if (fired.current) return; // 터치 길게 누르기에서 이미 열었다
      onLongPress({ x: e.clientX, y: e.clientY, sheet: isCoarse() });
    },
  };
}

function Meta({ mine, unread, time, pending }: { mine: boolean; unread: number | null; time: string | null; pending?: boolean }) {
  return (
    <div className={`shrink-0 flex flex-col justify-end pb-0.5 text-[11px] leading-tight ${mine ? 'items-end' : 'items-start'}`}>
      {pending ? (
        <FiClock size={11} className="text-gray-400 mb-0.5" aria-label={L('chat.sending')} />
      ) : (
        !!unread && unread > 0 && <span className="font-bold text-amber-500">{unread}</span>
      )}
      {time && !pending && <span className="text-gray-500 whitespace-nowrap">{time}</span>}
    </div>
  );
}

function MoreButton({ onOpen }: { onOpen: (a: ChatMenuAnchor) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onOpen({ x: r.left, y: r.bottom + 4, sheet: false });
      }}
      className="shrink-0 self-center h-7 w-7 rounded-full text-gray-400 hover:bg-black/5 hover:text-gray-600 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(pointer:coarse)]:hidden"
      aria-label={L('chat.webMore')}
      title={L('chat.webMore')}
    >
      <FiMoreHorizontal size={16} />
    </button>
  );
}

const bubbleBase = 'min-w-0 rounded-2xl px-3 py-2 text-[15px] leading-[1.45] whitespace-pre-wrap break-words [overflow-wrap:anywhere]';

function TextBubble({ text, mine, tail }: { text: string; mine: boolean; tail: boolean }) {
  return (
    <div className={`${bubbleBase} ${mine ? `bg-blue-500 text-white ${tail ? 'rounded-tr-md' : ''}` : `bg-white text-gray-900 ${tail ? 'rounded-tl-md' : ''}`}`}>
      {linkify(text, mine ? 'underline text-white' : 'underline text-blue-600 hover:text-blue-700')}
    </div>
  );
}

function NoteBubble({ children }: { children: ReactNode }) {
  return <div className={`${bubbleBase} bg-white/70 text-gray-500 italic`}>{children}</div>;
}

export interface ChatMessageRowProps {
  m: ChatMessageView;
  lay: ChatRowLayout;
  /** 같은 사람 묶음의 첫 메시지 (말풍선 꼬리) */
  firstInRun: boolean;
  sender?: ChatMemberInfo;
  unread: number | null;
  lang: Locale;
  blocked: boolean;
  revealed: boolean;
  onReveal: (id: string) => void;
  onMenu: (m: ChatMessageView, a: ChatMenuAnchor) => void;
  onOpenMedia: (m: ChatMessageView, index: number) => void;
}

export const ChatMessageRow = memo(function ChatMessageRow({ m, lay, firstInRun, sender, unread, lang, blocked, revealed, onReveal, onMenu, onOpenMedia }: ChatMessageRowProps) {
  const openMenu = (a: ChatMenuAnchor) => onMenu(m, a);
  const press = useLongPress(openMenu);
  const mine = lay.mine;
  const at = m.createdAt?.toDate?.() ?? null;
  const time = lay.showTime && at ? chatTimeLabel(at, lang) : null;

  if (m.kind === 'system') {
    return (
      <div className="flex justify-center px-6 my-2">
        <span className="rounded-full bg-black/10 px-3 py-1 text-xs text-gray-600 text-center">{m.text}</span>
      </div>
    );
  }

  const hidden = blocked && !revealed && !mine;
  const media = !m.deleted && !hidden ? m.media ?? [] : [];
  const text = !m.deleted && !hidden ? String(m.text ?? '') : '';
  const cells: ChatGridCell[] = media.map((x) => ({
    kind: x.kind,
    src: x.thumbUrl || (x.kind === 'image' ? x.url : null),
    videoSrc: x.kind === 'video' ? x.url : null,
    w: x.w,
    h: x.h,
    durationMs: x.durationMs,
  }));
  const menuable = !m.deleted && !hidden;

  const content = (
    <div className="flex flex-col gap-1 min-w-0" style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      {m.deleted ? (
        <NoteBubble>{L('chat.deletedMessage')}</NoteBubble>
      ) : hidden ? (
        <NoteBubble>
          {L('chat.blockedMessage')}{' '}
          <button type="button" onClick={() => onReveal(m.id)} className="not-italic underline text-gray-600 hover:text-gray-800">
            {L('chat.showBlocked')}
          </button>
        </NoteBubble>
      ) : (
        <>
          {cells.length > 0 && <ChatMediaGrid cells={cells} onOpen={(i) => onOpenMedia(m, i)} />}
          {text && <TextBubble text={text} mine={mine} tail={firstInRun && !cells.length} />}
        </>
      )}
    </div>
  );

  const pressProps = menuable ? press : {};

  if (mine) {
    return (
      <div className={`group flex justify-end px-3 ${firstInRun ? 'mt-2.5' : 'mt-1'}`}>
        <div className="flex items-end gap-1 max-w-[85%] md:max-w-[70%] min-w-0 [-webkit-touch-callout:none] [@media(pointer:coarse)]:select-none" {...pressProps}>
          {menuable && <MoreButton onOpen={openMenu} />}
          <Meta mine unread={unread} time={time} pending={m.pending} />
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex items-start gap-2 px-3 ${lay.showSender ? 'mt-3' : 'mt-1'}`}>
      <div className="w-9 shrink-0">{lay.showSender && <PersonAvatar name={sender?.name ?? m.senderName} photo={sender?.photo} size={36} />}</div>
      <div className="min-w-0 max-w-[80%] md:max-w-[70%]">
        {lay.showSender && <div className="mb-1 text-xs text-gray-600 truncate">{sender?.name ?? m.senderName}</div>}
        <div className="flex items-end gap-1 min-w-0 [-webkit-touch-callout:none] [@media(pointer:coarse)]:select-none" {...pressProps}>
          {content}
          <Meta mine={false} unread={unread} time={time} pending={m.pending} />
          {menuable && <MoreButton onOpen={openMenu} />}
        </div>
      </div>
    </div>
  );
});

/** 보내는 중 · 보내지 못한 내 메시지 (사진 묶음은 로컬 미리보기 + 진행률) */
export function ChatOutgoingRow({ o, onRetry, onDiscard }: { o: ChatOutgoing; onRetry: (clientId: string) => void; onDiscard: (clientId: string) => void }) {
  const failed = o.status === 'failed';
  const cells: ChatGridCell[] = o.items.map((x) => ({ kind: x.kind, src: x.previewUrl, w: x.w, h: x.h, durationMs: x.durationMs }));
  const overlay = o.kind === 'media' ? (
    <div className={`absolute inset-0 flex flex-col items-center justify-center gap-0.5 text-white ${failed ? 'bg-black/50' : 'bg-black/40'}`}>
      {failed ? (
        <FiAlertCircle size={28} />
      ) : (
        <>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            <span className="text-sm font-semibold tabular-nums">{Math.round(o.progress * 100)}%</span>
          </span>
          {o.items.length > 1 && <span className="text-[11px] text-white/90">{L('chat.uploadingN', { done: o.done, total: o.items.length })}</span>}
        </>
      )}
    </div>
  ) : null;
  return (
    <div className="flex flex-col items-end px-3 mt-2.5 gap-1">
      <div className="flex items-end gap-1 max-w-[85%] md:max-w-[70%]">
        {failed ? <FiAlertCircle className="shrink-0 mb-1 text-red-500" size={16} aria-label={L('chat.sendFailed')} /> : <Meta mine unread={null} time={null} pending />}
        <div className="flex flex-col items-end gap-1 min-w-0">
          {o.kind === 'media' && <ChatMediaGrid cells={cells} overlay={overlay} />}
          {o.text && <div className="opacity-70"><TextBubble text={o.text} mine tail={false} /></div>}
        </div>
      </div>
      {failed && (
        <div className="flex items-center gap-1 text-xs">
          <span className="text-red-500 mr-1">{L('chat.sendFailed')}</span>
          <button type="button" onClick={() => onRetry(o.clientId)} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-gray-700 shadow-sm hover:bg-gray-50">
            <FiRefreshCw size={12} />
            {L('chat.retry')}
          </button>
          <button type="button" onClick={() => onDiscard(o.clientId)} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-gray-700 shadow-sm hover:bg-gray-50">
            <FiTrash2 size={12} />
            {L('chat.discard')}
          </button>
        </div>
      )}
    </div>
  );
}
