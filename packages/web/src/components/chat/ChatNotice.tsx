'use client';

/**
 * 방 공지 띠 — 📢 글(2줄)/작은 그림 · 'OO 님이 올린 공지' · [공지 내리기] · 접기/펼치기
 * 누르면 그 메시지로 옮겨 간다. (누가 확인했는지는 보이지 않는다)
 */
import { FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { L, type ChatRoom } from '@smis-mentor/shared';

export interface ChatNoticeBannerProps {
  room: ChatRoom;
  canManage: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onClear: () => void;
}

export default function ChatNoticeBanner({ room, canManage, collapsed, onToggle, onOpen, onClear }: ChatNoticeBannerProps) {
  const notice = room.notice;
  if (!notice) return null;
  const text = notice.text || (notice.thumbUrl ? L('chat.previewPhotoShort') : L('chat.notice'));

  if (collapsed) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-white/95 border-b border-gray-200 shrink-0">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 flex items-center gap-2 text-left">
          <span aria-hidden="true">📢</span>
          <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{text}</span>
        </button>
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
        {canManage && (
          <div className="mt-2 flex items-center">
            <button type="button" onClick={onClear} className="ml-auto text-xs text-gray-500 hover:text-red-600">
              {L('chat.clearNotice')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
