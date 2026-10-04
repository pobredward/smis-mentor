'use client';

/**
 * 방 공지 띠 — 📢 글(2줄)/작은 그림 · 'OO 님이 올린 공지' · [확인] · '확인 12 · 미확인 4' · [공지 내리기] · 접기/펼치기
 * 누르면 그 메시지로 옮겨 간다.
 */
import { FiCheck, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { L, noticeAckSummary, type ChatRoom } from '@smis-mentor/shared';

export interface ChatNoticeBannerProps {
  room: ChatRoom;
  myUid: string;
  /** 공지 메시지의 확인 (uid → 시각) — 실시간 */
  acks: Record<string, unknown> | null;
  canManage: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAck: () => void;
  onShowAcks: () => void;
  onClear: () => void;
}

export default function ChatNoticeBanner({ room, myUid, acks, canManage, collapsed, onToggle, onOpen, onAck, onShowAcks, onClear }: ChatNoticeBannerProps) {
  const notice = room.notice;
  if (!notice) return null;
  const summary = noticeAckSummary(room, acks);
  const needsAck = myUid !== notice.setBy && myUid !== notice.senderId;
  const acked = !!acks?.[myUid];
  const text = notice.text || (notice.thumbUrl ? L('chat.previewPhotoShort') : L('chat.notice'));

  if (collapsed) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/95 border-b border-gray-200 shrink-0">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 flex items-center gap-2 text-left">
          <span aria-hidden="true">📢</span>
          <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{text}</span>
        </button>
        {needsAck && !acked && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label={L('chat.ack')} />}
        <button type="button" onClick={onToggle} className="h-8 w-8 shrink-0 rounded-full text-gray-500 hover:bg-gray-100 flex items-center justify-center" aria-label={L('chat.notice')} aria-expanded={false}>
          <FiChevronDown size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="px-2 md:px-3 pt-2 shrink-0">
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-black/5 px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 flex items-start gap-2.5 text-left">
            <span className="mt-0.5 text-lg leading-none" aria-hidden="true">📢</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-gray-900 line-clamp-2 whitespace-pre-wrap break-words">{text}</span>
              <span className="mt-0.5 block text-[11px] text-gray-500">{L('chat.noticeBy', { name: notice.setByName || notice.senderName })}</span>
            </span>
            {notice.thumbUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={notice.thumbUrl} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
            )}
          </button>
          <button type="button" onClick={onToggle} className="-mr-1 -mt-0.5 h-8 w-8 shrink-0 rounded-full text-gray-500 hover:bg-gray-100 flex items-center justify-center" aria-label={L('chat.notice')} aria-expanded>
            <FiChevronUp size={16} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {needsAck && (
            <button
              type="button"
              onClick={onAck}
              disabled={acked}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${acked ? 'bg-gray-100 text-gray-500' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
            >
              {acked && <FiCheck size={12} />}
              {acked ? L('chat.acked') : L('chat.ack')}
            </button>
          )}
          <button type="button" onClick={onShowAcks} className="text-xs text-gray-600 hover:underline tabular-nums">
            {L('chat.ackCount', { a: summary.acked.length, b: summary.pending.length })}
          </button>
          {canManage && (
            <button type="button" onClick={onClear} className="ml-auto text-xs text-gray-500 hover:text-red-600">
              {L('chat.clearNotice')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
