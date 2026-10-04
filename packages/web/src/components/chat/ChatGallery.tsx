'use client';

/**
 * 사진·동영상 모아보기 — 최신 순 격자 · 달마다 머리글 · 아래로 내리면 더 불러오기
 * 누르면 보기 화면(불러온 것 전부 좌우로) · [선택] → 골라서 저장 (여러 개면 zip)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FiCheck, FiPlay, FiX } from 'react-icons/fi';
import {
  L,
  chatDownloadName,
  chatFileExt,
  type ChatMediaItem,
  type ChatMessageView,
  type ChatRoom,
  type Locale,
} from '@smis-mentor/shared';
import { downloadChatFile, downloadChatZip } from '@/lib/chatMedia';
import ChatLightbox from './ChatLightbox';
import { formatDuration, monthLabel } from './chatUi';

export interface ChatGalleryPage {
  messages: ChatMessageView[];
  hasMore: boolean;
  /** 다음 쪽 기준 (그대로 다시 넘긴다) */
  cursor: unknown;
}

interface Cell {
  key: string;
  item: ChatMediaItem;
  at: Date | null;
  senderName: string;
  name: string;
  month: string;
}

export default function ChatGallery({ room, lang, loadPage, onClose }: {
  room: ChatRoom;
  lang: Locale;
  loadPage: (cursor: unknown) => Promise<ChatGalleryPage>;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [viewer, setViewer] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const cursorRef = useRef<unknown>(null);
  const busyRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const more = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    try {
      const page = await loadPage(cursorRef.current);
      cursorRef.current = page.cursor;
      setHasMore(page.hasMore);
      setMessages((list) => {
        const seen = new Set(list.map((m) => m.id));
        return [...list, ...page.messages.filter((m) => !seen.has(m.id))];
      });
    } catch {
      toast.error(L('chat.webActionFailed'));
      setHasMore(false);
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [loadPage]);

  // 처음 한 쪽 · 맨 아래가 보이면 다음 쪽
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void more();
    }, { root: scrollRef.current, rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, more, messages.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && viewer == null) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, viewer]);

  const cells = useMemo<Cell[]>(() => {
    const used = new Map<string, number>();
    const out: Cell[] = [];
    messages.forEach((m) => {
      const at = m.createdAt?.toDate?.() ?? null;
      const media = (m.media ?? []).filter((x) => x.kind === 'image' || x.kind === 'video');
      media.forEach((item, i) => {
        let name = chatDownloadName({ campCode: room.campCode, at, index: media.length > 1 ? i : undefined, ext: chatFileExt(item.contentType, item.path) });
        // 같은 분에 보낸 다른 메시지 — 이름이 겹치지 않게
        const n = (used.get(name) ?? 0) + 1;
        used.set(name, n);
        if (n > 1) name = name.replace(/(\.[^.]+)$/, `_${n}$1`);
        out.push({
          key: `${m.id}:${i}`,
          item,
          at,
          senderName: room.memberInfo?.[m.senderId]?.name ?? m.senderName,
          name,
          month: at ? monthLabel(at, lang) : '',
        });
      });
    });
    return out;
  }, [messages, room.campCode, room.memberInfo, lang]);

  const toggle = (key: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    return n;
  });

  const saveSelected = async () => {
    const list = cells.filter((c) => selected.has(c.key));
    if (!list.length || saving) return;
    setSaving(true);
    try {
      if (list.length === 1) {
        const ok = await downloadChatFile(list[0].item.url, list[0].name);
        if (ok) toast.success(L('chat.saved'));
        else toast.error(L('chat.saveFailed'));
      } else {
        const id = toast.loading(L('chat.preparingDownload'));
        try {
          const n = await downloadChatZip(list.map((c) => ({ url: c.item.url, name: c.name })), chatDownloadName({ campCode: room.campCode, at: new Date(), ext: 'zip' }));
          toast.success(L('chat.savedN', { n }), { id });
        } catch {
          toast.error(L('chat.saveFailed'), { id });
        }
      }
      setSelecting(false);
      setSelected(new Set());
    } finally {
      setSaving(false);
    }
  };

  // 달마다 묶기
  const months: Array<{ month: string; cells: Array<Cell & { index: number }> }> = [];
  cells.forEach((c, index) => {
    const last = months[months.length - 1];
    if (last && last.month === c.month) last.cells.push({ ...c, index });
    else months.push({ month: c.month, cells: [{ ...c, index }] });
  });

  return (
    <div className="fixed top-0 left-0 right-0 bottom-0 z-[85] bg-white flex flex-col" role="dialog" aria-modal="true" aria-label={L('chat.galleryTitle')}>
      <div className="flex items-center gap-2 px-2 md:px-4 h-14 shrink-0 border-b border-gray-200 pt-[env(safe-area-inset-top)] box-content">
        <button type="button" onClick={onClose} className="h-10 w-10 rounded-full text-gray-700 hover:bg-gray-100 flex items-center justify-center" aria-label={L('common.close')}>
          <FiX size={22} />
        </button>
        <h2 className="min-w-0 flex-1 text-[15px] font-semibold text-gray-900 truncate">
          {selecting ? L('chat.gallerySelectedN', { n: selected.size }) : L('chat.galleryTitle')}
        </h2>
        {cells.length > 0 && (
          <button
            type="button"
            onClick={() => { setSelecting((v) => !v); setSelected(new Set()); }}
            className="h-9 rounded-full px-3 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            {selecting ? L('common.cancel') : L('chat.gallerySelect')}
          </button>
        )}
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {!cells.length && !loading && !hasMore && <p className="py-20 text-center text-sm text-gray-500">{L('chat.galleryEmpty')}</p>}
        {months.map((g) => (
          <section key={g.month || '-'}>
            <h3 className="sticky top-0 z-10 bg-white/95 backdrop-blur px-3 md:px-4 py-2 text-sm font-semibold text-gray-700">{g.month}</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-0.5 px-0.5">
              {g.cells.map((c) => {
                const on = selected.has(c.key);
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => (selecting ? toggle(c.key) : setViewer(c.index))}
                    className="relative aspect-square overflow-hidden bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    aria-pressed={selecting ? on : undefined}
                  >
                    {c.item.thumbUrl || c.item.kind === 'image' ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.item.thumbUrl || c.item.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <video src={c.item.url} preload="metadata" muted playsInline className="h-full w-full object-cover pointer-events-none" />
                    )}
                    {c.item.kind === 'video' && (
                      <span className="absolute left-1 bottom-1 inline-flex items-center gap-0.5 rounded bg-black/55 px-1 text-[10px] text-white">
                        <FiPlay size={9} />
                        {formatDuration(c.item.durationMs)}
                      </span>
                    )}
                    {selecting && (
                      <span className={`absolute right-1.5 top-1.5 h-6 w-6 rounded-full border-2 flex items-center justify-center ${on ? 'border-blue-500 bg-blue-500 text-white' : 'border-white bg-black/20'}`}>
                        {on && <FiCheck size={14} />}
                      </span>
                    )}
                    {selecting && on && <span className="absolute inset-0 ring-4 ring-inset ring-blue-500/60" />}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <div ref={sentinelRef} className="h-12 flex items-center justify-center">
          {loading && <span className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" aria-label={L('chat.loading')} />}
        </div>
      </div>
      {selecting && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-200 shrink-0 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setSelected(selected.size === cells.length ? new Set() : new Set(cells.map((c) => c.key)))}
            className="rounded-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            {L('chat.gallerySelectAll')}
          </button>
          <button
            type="button"
            onClick={saveSelected}
            disabled={!selected.size || saving}
            className="ml-auto rounded-full bg-blue-500 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-40"
          >
            {L('chat.gallerySaveSelected')}
          </button>
        </div>
      )}
      {viewer != null && cells[viewer] && (
        <ChatLightbox
          items={cells.map((c) => c.item)}
          startIndex={viewer}
          senderName={cells[viewer].senderName}
          at={cells[viewer].at}
          campCode={room.campCode}
          metas={cells.map((c) => ({ senderName: c.senderName, at: c.at }))}
          names={cells.map((c) => c.name)}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
