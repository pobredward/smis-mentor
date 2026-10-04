'use client';

/**
 * 말풍선 한 줄 (카톡 모양)
 * - 남의 메시지: 왼쪽 · 흰색, 묶음 첫 메시지에 사진+이름 (아니면 그 자리 비움)
 * - 내 메시지: 오른쪽 · 파란색
 * - 말풍선 옆 아래: 안 읽은 사람 수(노란 숫자) · 🔕 · 수정됨 · 시각 / 보내는 중이면 시계
 * - 답장 인용 칸(누르면 원래 메시지로) · @멘션 강조 · 공감 칩 · 투표 · 음성
 * - 길게 누르기 · 우클릭 · [⋯] 버튼 → 메시지 메뉴
 */
import { memo, type ReactNode } from 'react';
import { FiAlertCircle, FiBellOff, FiClock, FiCornerUpLeft, FiMoreHorizontal, FiRefreshCw, FiTrash2 } from 'react-icons/fi';
import {
  L,
  chatReplyPreview,
  chatTimeLabel,
  type ChatMemberInfo,
  type ChatMessageView,
  type ChatReplyRef,
  type ChatRowLayout,
  type Locale,
} from '@smis-mentor/shared';
import ChatMediaGrid, { type ChatGridCell } from './ChatMediaGrid';
import type { ChatMenuAnchor } from './ChatMenus';
import { ChatPollBubble } from './ChatPoll';
import { ReactionChips } from './ChatReactions';
import { ChatVoiceBubble } from './ChatVoice';
import type { ChatOutgoing } from './chatTypes';
import { PersonAvatar, richText } from './chatUi';
import { useLongPress } from './useLongPress';


function Meta({ mine, unread, time, pending, edited, silent }: { mine: boolean; unread: number | null; time: string | null; pending?: boolean; edited?: boolean; silent?: boolean }) {
  const extra = (edited || silent) && !pending;
  return (
    <div className={`shrink-0 flex flex-col justify-end pb-0.5 text-[11px] leading-tight ${mine ? 'items-end' : 'items-start'}`}>
      {pending ? (
        <FiClock size={11} className="text-gray-400 mb-0.5" aria-label={L('chat.sending')} />
      ) : (
        !!unread && unread > 0 && <span className="font-bold text-amber-500">{unread}</span>
      )}
      {(extra || (time && !pending)) && (
        <span className="flex items-center gap-1 text-gray-500 whitespace-nowrap">
          {silent && !pending && <FiBellOff size={10} aria-label={L('chat.silentBadge')} />}
          {edited && !pending && <span>{L('chat.edited')}</span>}
          {time && !pending && <span>{time}</span>}
        </span>
      )}
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

/** 답장 인용 — 이름 굵게 + 원래 글 한 줄 (누르면 원래 메시지로) */
function ReplyQuote({ r, mine, lang, onJump, inside }: { r: ChatReplyRef; mine: boolean; lang: Locale; onJump: (id: string) => void; inside?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onJump(r.id); }}
      className={`flex w-full items-center gap-2 text-left whitespace-normal ${inside ? `mb-1.5 pb-1.5 border-b ${mine ? 'border-white/30' : 'border-gray-200'}` : `rounded-xl px-2.5 py-1.5 ${mine ? 'bg-blue-100/70' : 'bg-white/80'}`}`}
    >
      <FiCornerUpLeft size={12} className={`shrink-0 ${mine && inside ? 'text-white/70' : 'text-gray-400'}`} />
      <span className="min-w-0 flex-1">
        <span className={`block text-xs font-bold truncate ${mine && inside ? 'text-white' : 'text-gray-800'}`}>{r.senderName}</span>
        <span className={`block text-xs truncate ${mine && inside ? 'text-white/80' : 'text-gray-500'}`}>{chatReplyPreview(r, lang)}</span>
      </span>
      {r.thumbUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.thumbUrl} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
      )}
    </button>
  );
}

function TextBubble({ text, mine, tail, quote, highlight, current, memberInfo, myUid }: {
  text: string;
  mine: boolean;
  tail: boolean;
  quote?: ReactNode;
  highlight?: string;
  current?: boolean;
  memberInfo: Record<string, ChatMemberInfo>;
  myUid: string;
}) {
  return (
    <div className={`${bubbleBase} ${mine ? `bg-blue-500 text-white ${tail ? 'rounded-tr-md' : ''}` : `bg-white text-gray-900 ${tail ? 'rounded-tl-md' : ''}`}`}>
      {quote}
      {richText(text, {
        linkClass: mine ? 'underline text-white' : 'underline text-blue-600 hover:text-blue-700',
        highlight: highlight ? { query: highlight, markClass: `rounded-sm px-px text-gray-900 ${current ? 'bg-orange-300' : 'bg-yellow-200'}` } : undefined,
        mentions: {
          memberInfo,
          myUid,
          className: mine ? 'font-semibold' : 'font-semibold text-blue-600',
          meClassName: mine ? 'font-bold underline' : 'font-bold text-blue-700 bg-blue-50 rounded px-0.5',
        },
      })}
    </div>
  );
}

function NoteBubble({ children }: { children: ReactNode }) {
  return <div className={`${bubbleBase} bg-white/70 text-gray-500 italic`}>{children}</div>;
}

/** 말풍선에서 부르는 동작 — 화면(ChatRoomView)이 한 번 만들어 넘긴다 */
export interface ChatRowActions {
  onReveal: (id: string) => void;
  onMenu: (m: ChatMessageView, a: ChatMenuAnchor) => void;
  onOpenMedia: (m: ChatMessageView, index: number) => void;
  /** 다른 메시지로 옮겨 가기 (답장 인용 · 공지 알림) */
  onJump: (messageId: string) => void;
  onReactions: (m: ChatMessageView) => void;
  onVote: (m: ChatMessageView, ids: string[]) => Promise<void>;
  onClosePoll: (m: ChatMessageView) => void;
  onPollVoters: (m: ChatMessageView, optionId: string) => void;
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
  myUid: string;
  memberInfo: Record<string, ChatMemberInfo>;
  actions: ChatRowActions;
  /** 검색어 (이 메시지가 검색 결과일 때만) — 글에서 그 자리를 표시 */
  highlight?: string;
  /** 지금 보고 있는 검색 결과 */
  current?: boolean;
  /** 옮겨 왔을 때 잠깐 테두리 */
  flash?: boolean;
}

export const ChatMessageRow = memo(function ChatMessageRow({ m, lay, firstInRun, sender, unread, lang, blocked, revealed, myUid, memberInfo, actions, highlight, current, flash }: ChatMessageRowProps) {
  const openMenu = (a: ChatMenuAnchor) => actions.onMenu(m, a);
  const press = useLongPress(openMenu);
  const mine = lay.mine;
  const at = m.createdAt?.toDate?.() ?? null;
  const time = lay.showTime && at ? chatTimeLabel(at, lang) : null;

  if (m.kind === 'system') {
    const notice = m.systemType === 'notice';
    return (
      <div data-mid={m.id} className="flex justify-center px-6 my-2">
        {notice ? (
          <button
            type="button"
            onClick={() => m.noticeOf && actions.onJump(m.noticeOf)}
            className="max-w-full rounded-full bg-black/10 px-3 py-1 text-xs text-gray-700 hover:bg-black/15 truncate"
          >
            📢 {L('chat.webNoticePosted', { name: m.senderName })}
            {m.text ? ` — ${m.text.replace(/\s+/g, ' ').slice(0, 60)}` : ''}
          </button>
        ) : (
          <span className="rounded-full bg-black/10 px-3 py-1 text-xs text-gray-600 text-center">{m.text}</span>
        )}
      </div>
    );
  }

  const hidden = blocked && !revealed && !mine;
  const live = !m.deleted && !hidden;
  const media = live && m.kind === 'media' ? (m.media ?? []).filter((x) => x.kind === 'image' || x.kind === 'video') : [];
  const text = live && (m.kind === 'text' || m.kind === 'media') ? String(m.text ?? '') : '';
  const cells: ChatGridCell[] = media.map((x) => ({
    kind: x.kind === 'video' ? 'video' : 'image',
    src: x.thumbUrl || (x.kind === 'image' ? x.url : null),
    videoSrc: x.kind === 'video' ? x.url : null,
    w: x.w,
    h: x.h,
    durationMs: x.durationMs,
  }));
  const reply = live && m.replyTo ? m.replyTo : null;
  const quoteInside = !!reply && !!text && !cells.length;
  const voice = live && m.kind === 'voice' ? (m.media ?? [])[0] : undefined;

  const content = (
    <div
      className={`flex flex-col gap-1 min-w-0 rounded-2xl transition-shadow duration-300 ${flash ? 'ring-2 ring-orange-400 ring-offset-2 ring-offset-[#e8eef5]' : ''}`}
      style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}
    >
      {m.deleted ? (
        <NoteBubble>{L('chat.deletedMessage')}</NoteBubble>
      ) : hidden ? (
        <NoteBubble>
          {L('chat.blockedMessage')}{' '}
          <button type="button" onClick={() => actions.onReveal(m.id)} className="not-italic underline text-gray-600 hover:text-gray-800">
            {L('chat.showBlocked')}
          </button>
        </NoteBubble>
      ) : (
        <>
          {reply && !quoteInside && <ReplyQuote r={reply} mine={mine} lang={lang} onJump={actions.onJump} />}
          {m.kind === 'poll' && m.poll && (
            <ChatPollBubble
              m={m}
              myUid={myUid}
              lang={lang}
              onVote={(ids) => actions.onVote(m, ids)}
              onClose={() => actions.onClosePoll(m)}
              onVoters={(id) => actions.onPollVoters(m, id)}
            />
          )}
          {m.kind === 'voice' && <ChatVoiceBubble url={voice?.url ?? null} durationMs={voice?.durationMs} mine={mine} pending={m.pending} />}
          {cells.length > 0 && <ChatMediaGrid cells={cells} onOpen={(i) => actions.onOpenMedia(m, i)} />}
          {text && (
            <TextBubble
              text={text}
              mine={mine}
              tail={firstInRun && !cells.length && !reply}
              quote={quoteInside ? <ReplyQuote r={reply!} mine={mine} lang={lang} onJump={actions.onJump} inside /> : undefined}
              highlight={highlight}
              current={current}
              memberInfo={memberInfo}
              myUid={myUid}
            />
          )}
          {m.reactions && <ReactionChips reactions={m.reactions} myUid={myUid} onOpen={() => actions.onReactions(m)} />}
        </>
      )}
    </div>
  );

  const pressProps = live ? press : {};
  const meta = <Meta mine={mine} unread={unread} time={time} pending={m.pending} edited={!!m.editedAt && live} silent={!!m.silent && live} />;

  if (mine) {
    return (
      <div data-mid={m.id} className={`group flex justify-end px-3 ${firstInRun ? 'mt-2.5' : 'mt-1'}`}>
        <div className="flex items-end gap-1 max-w-[85%] md:max-w-[70%] min-w-0 [-webkit-touch-callout:none] [@media(pointer:coarse)]:select-none" {...pressProps}>
          {live && <MoreButton onOpen={openMenu} />}
          {meta}
          {content}
        </div>
      </div>
    );
  }

  return (
    <div data-mid={m.id} className={`group flex items-start gap-2 px-3 ${lay.showSender ? 'mt-3' : 'mt-1'}`}>
      <div className="w-9 shrink-0">{lay.showSender && <PersonAvatar name={sender?.name ?? m.senderName} photo={sender?.photo} size={36} />}</div>
      <div className="min-w-0 max-w-[80%] md:max-w-[70%]">
        {lay.showSender && <div className="mb-1 text-xs text-gray-600 truncate">{sender?.name ?? m.senderName}</div>}
        <div className="flex items-end gap-1 min-w-0 [-webkit-touch-callout:none] [@media(pointer:coarse)]:select-none" {...pressProps}>
          {content}
          {meta}
          {live && <MoreButton onOpen={openMenu} />}
        </div>
      </div>
    </div>
  );
});

/** '여기까지 읽었습니다' 줄 */
export function ChatUnreadDivider() {
  return (
    <div className="my-3 flex items-center gap-3 px-4" role="separator">
      <span className="h-px flex-1 bg-blue-300/70" />
      <span className="rounded-full bg-blue-500/90 px-3 py-0.5 text-[11px] font-medium text-white">{L('chat.unreadDivider')}</span>
      <span className="h-px flex-1 bg-blue-300/70" />
    </div>
  );
}

/** 보내는 중 · 보내지 못한 내 메시지 (사진 묶음은 로컬 미리보기 + 진행률, 음성은 회색 말풍선) */
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
          {o.kind === 'voice' && <ChatVoiceBubble url={null} durationMs={o.durationMs} mine pending />}
          {o.text && <div className="opacity-70"><div className={`${bubbleBase} bg-blue-500 text-white`}>{o.text}</div></div>}
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
