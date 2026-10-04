'use client';

/**
 * 사진·동영상 보기 화면 (전체 화면)
 * 좌우 넘기기(화살표 · ←/→ · 터치 밀기) · "3 / 10" · 동영상 재생 · [저장](지금 것) · [모두 저장](그 말풍선 전부, 여러 개면 zip) · Esc 닫기
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FiChevronLeft, FiChevronRight, FiDownload, FiX } from 'react-icons/fi';
import {
  L,
  chatDownloadName,
  chatFileExt,
  chatTimeLabel,
  chatDayLabel,
  getCurrentLocale,
  type ChatMediaItem,
} from '@smis-mentor/shared';
import { downloadChatFile, downloadChatZip } from '@/lib/chatMedia';

export interface ChatLightboxProps {
  items: ChatMediaItem[];
  startIndex: number;
  senderName: string;
  at: Date | null;
  campCode?: string | null;
  onClose: () => void;
  /** 모아보기 — 칸마다 보낸 사람·시각이 다를 때 (있으면 [모두 저장]은 숨긴다) */
  metas?: Array<{ senderName: string; at: Date | null }>;
  /** 저장 파일 이름 (칸마다) */
  names?: string[];
}

/** 저장 파일 이름들 (말풍선 하나 기준) */
export function chatMediaFileNames(items: ChatMediaItem[], opts: { campCode?: string | null; at: Date | null }) {
  return items.map((m, i) =>
    chatDownloadName({ campCode: opts.campCode, at: opts.at, index: items.length > 1 ? i : undefined, ext: chatFileExt(m.contentType, m.path) }),
  );
}

/** 말풍선의 사진·동영상 저장 — 한 개면 그 파일, 여러 개면 zip */
export async function saveChatMedia(items: ChatMediaItem[], opts: { campCode?: string | null; at: Date | null; index?: number }) {
  const names = chatMediaFileNames(items, opts);
  if (opts.index != null || items.length === 1) {
    const i = opts.index ?? 0;
    const ok = await downloadChatFile(items[i].url, names[i]);
    // 받지 못하면 새 탭으로 열었다 — 거기서 직접 저장하도록 알린다
    if (ok) toast.success(L('chat.saved'));
    else toast.error(L('chat.saveFailed'));
    return;
  }
  const id = toast.loading(L('chat.preparingDownload'));
  try {
    const n = await downloadChatZip(
      items.map((m, i) => ({ url: m.url, name: names[i] })),
      chatDownloadName({ campCode: opts.campCode, at: opts.at, ext: 'zip' }),
    );
    toast.success(L('chat.savedN', { n }), { id });
  } catch {
    toast.error(L('chat.saveFailed'), { id });
    window.open(items[0].url, '_blank', 'noopener');
  }
}

export default function ChatLightbox({ items, startIndex, senderName, at, campCode, onClose, metas, names }: ChatLightboxProps) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, startIndex), items.length - 1));
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const n = items.length;
  const item = items[index];
  const lang = getCurrentLocale();

  const go = useCallback((d: number) => setIndex((i) => Math.min(n - 1, Math.max(0, i + d))), [n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  if (!item) return null;

  const meta = metas?.[index];
  const curAt = meta ? meta.at : at;
  const curSender = meta ? meta.senderName : senderName;
  const save = async (all: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      if (names?.[index] && !all) {
        const ok = await downloadChatFile(item.url, names[index]);
        if (ok) toast.success(L('chat.saved'));
        else toast.error(L('chat.saveFailed'));
      } else {
        await saveChatMedia(items, { campCode, at, index: all ? undefined : index });
      }
    } finally {
      setSaving(false);
    }
  };

  const timeText = curAt ? `${chatDayLabel(curAt, lang)} ${chatTimeLabel(curAt, lang)}` : '';

  return (
    <div
      className="fixed top-0 left-0 right-0 bottom-0 z-[90] bg-black/95 text-white flex flex-col select-none"
      role="dialog"
      aria-modal="true"
      onTouchStart={(e) => { touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const s = touchRef.current;
        touchRef.current = null;
        if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="flex items-center gap-2 px-2 sm:px-4 h-14 shrink-0 pt-[env(safe-area-inset-top)]">
        <button type="button" onClick={onClose} className="h-10 w-10 rounded-full hover:bg-white/10 flex items-center justify-center" aria-label={L('common.close')} title={L('common.close')}>
          <FiX size={22} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{curSender}</div>
          {timeText && <div className="text-xs text-white/60 truncate">{timeText}</div>}
        </div>
        {n > 1 && <div className="text-sm tabular-nums text-white/80 px-1">{L('chat.photoN', { i: index + 1, n })}</div>}
        <button
          type="button"
          onClick={() => save(false)}
          disabled={saving}
          className="h-9 px-3 rounded-full hover:bg-white/10 flex items-center gap-1.5 text-sm disabled:opacity-50"
          title={L('chat.save')}
        >
          <FiDownload size={16} />
          <span className="hidden sm:inline">{L('chat.save')}</span>
        </button>
        {n > 1 && !metas && (
          <button
            type="button"
            onClick={() => save(true)}
            disabled={saving}
            className="h-9 px-3 rounded-full hover:bg-white/10 text-sm disabled:opacity-50 whitespace-nowrap"
          >
            {L('chat.saveAll')}
          </button>
        )}
      </div>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-2 pb-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {item.kind === 'video' ? (
          <video
            key={item.url}
            src={item.url}
            poster={item.thumbUrl}
            controls
            autoPlay
            playsInline
            className="max-w-full max-h-full rounded bg-black"
          />
        ) : (
          <>
            {loadedSrc !== item.url && item.thumbUrl && (
              // 큰 그림을 받는 동안 작은 그림을 먼저
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.thumbUrl} alt="" className="absolute max-w-full max-h-full object-contain blur-[2px] opacity-80" draggable={false} />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={item.url}
              src={item.url}
              alt=""
              draggable={false}
              onLoad={() => setLoadedSrc(item.url)}
              className={`relative max-w-full max-h-full object-contain transition-opacity ${loadedSrc === item.url || !item.thumbUrl ? 'opacity-100' : 'opacity-0'}`}
            />
          </>
        )}

        {index > 0 && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center"
            aria-label={L('common.previous')}
          >
            <FiChevronLeft size={26} />
          </button>
        )}
        {index < n - 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center"
            aria-label={L('common.next')}
          >
            <FiChevronRight size={26} />
          </button>
        )}
      </div>
    </div>
  );
}
