'use client';

/**
 * 대화방 화면 (화면만 — 데이터·보내기는 props, ChatRoomContainer 가 연결한다)
 * 머리글 · 말풍선 목록(날짜 구분선 · 위로 올리면 더 불러오기 · [새 메시지 ↓]) · 입력창 · 메뉴 · 보기 화면 · 대화 상대
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import toast from 'react-hot-toast';
import {
  FiArrowDown,
  FiBell,
  FiBellOff,
  FiChevronLeft,
  FiCopy,
  FiDownload,
  FiFlag,
  FiMoreVertical,
  FiSlash,
  FiTrash2,
  FiUsers,
  FiImage,
  FiSearch,
} from 'react-icons/fi';
import {
  L,
  chatDayLabel,
  chatMessageLayout,
  chatMessageMatches,
  normalizeChatSearch,
  searchChatMessages,
  chatRoomDescription,
  chatRoomTitle,
  dmPeerOf,
  isRoomMuted,
  isUserBlocked,
  unreadReaders,
  type ChatMessageView,
  type ChatReportReason,
  type ChatRoom,
  type ChatUserState,
  type Locale,
} from '@smis-mentor/shared';
import ChatComposer from './ChatComposer';
import ChatSearchBar from './ChatSearchBar';
import ChatLightbox, { saveChatMedia } from './ChatLightbox';
import { ChatActionMenu, ChatReportDialog, type ChatMenuAction, type ChatMenuAnchor } from './ChatMenus';
import { ChatMessageRow, ChatOutgoingRow } from './ChatMessageRow';
import { ChatMembersDialog, type ChatPerson } from './ChatPeople';
import type { ChatOutgoing } from './chatTypes';
import type { ChatTray } from './useChatTray';
import { RoomAvatar, dayKeyOf } from './chatUi';

export type ChatPushStatus = 'unsupported' | 'default' | 'granted' | 'denied';

/** 대화 내용 검색에 필요한 데이터 (ChatRoomContainer 가 준다) */
export interface ChatRoomSearch {
  /** 찾을 메시지 — 방 전체 대화(처음 검색할 때 한 번 불러옴) + 새로 온 메시지 */
  pool: ChatMessageView[];
  /** 전체 대화를 불러오는 중 · 지금까지 몇 개 */
  loading: boolean;
  loadedCount: number;
  /** 검색을 열 때 — 전체 대화를 (한 번만) 불러온다. 다 불러오면 끝난다 */
  onStart: () => Promise<void>;
  /** 이 메시지가 목록에 그려지도록 (지금 창보다 예전이면 불러 둔 대화로 목록을 늘린다) */
  onReveal: (messageId: string) => void;
}

export interface ChatRoomViewProps {
  room: ChatRoom;
  myUid: string;
  lang: Locale;
  messages: ChatMessageView[];
  /** 메시지를 처음 받았는가 (처음 한 번 맨 아래로) */
  loaded: boolean;
  outgoing: ChatOutgoing[];
  reads: Record<string, number>;
  state: ChatUserState | null;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onBack?: () => void;
  tray: ChatTray;
  text: string;
  onTextChange: (text: string) => void;
  onSend: () => void;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
  onDelete: (m: ChatMessageView) => Promise<void>;
  onReport: (m: ChatMessageView, reason: ChatReportReason, detail: string) => Promise<void>;
  onBlock: (uid: string, blocked: boolean) => Promise<void>;
  onToggleMute: () => void;
  onStartDm: (uid: string) => Promise<void>;
  /** 맨 아래 근처인가 (읽음 표시 조건) */
  onBottomChange?: (near: boolean) => void;
  push?: { status: ChatPushStatus; onEnable: () => void };
  /** 좁은 화면 전체 화면일 때 키보드 위로 맞춘 크기 */
  boxStyle?: CSSProperties;
  search?: ChatRoomSearch;
  /** 처음부터 이 검색어로 검색을 열어 둔다 (미리보기용) */
  initialSearch?: string;
}

const NEAR_BOTTOM = 80;

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast.success(L('chat.copied'));
}

export default function ChatRoomView(props: ChatRoomViewProps) {
  const {
    room, myUid, lang, messages, loaded, outgoing, reads, state, hasMore, loadingOlder, onLoadOlder, onBack,
    tray, text, onTextChange, onSend, onRetry, onDiscard, onDelete, onReport, onBlock, onToggleMute, onStartDm,
    onBottomChange, push, boxStyle, search, initialSearch,
  } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const nearRef = useRef(true);
  const [farFromBottom, setFarFromBottom] = useState(false);
  const [newBelow, setNewBelow] = useState(false);
  const [menu, setMenu] = useState<{ m: ChatMessageView; anchor: ChatMenuAnchor } | null>(null);
  const [roomMenu, setRoomMenu] = useState<ChatMenuAnchor | null>(null);
  const [reporting, setReporting] = useState<ChatMessageView | null>(null);
  const [viewer, setViewer] = useState<{ m: ChatMessageView; index: number } | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  // ── 대화 내용 검색 ─────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(() => !!initialSearch && !!search);
  /** 입력 중인 글 · 실제로 찾는 글(0.25초 뒤) */
  const [query, setQuery] = useState(initialSearch ?? '');
  const [activeQuery, setActiveQuery] = useState(initialSearch ?? '');
  /** 지금 보고 있는 결과 (메시지 id) */
  const [currentHit, setCurrentHit] = useState<string | null>(() =>
    initialSearch && search ? searchChatMessages(search.pool, initialSearch, state?.blocked)[0] ?? null : null,
  );
  const [flashId, setFlashId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 그려지면 가운데로 옮길 메시지 */
  const pendingJump = useRef<string | null>(currentHit);
  const poolRef = useRef<ChatMessageView[]>(search?.pool ?? []);
  const blockedRef = useRef(state?.blocked);
  const queryRef = useRef(query);
  const loadingRef = useRef(!!search?.loading);
  useEffect(() => {
    poolRef.current = search?.pool ?? [];
    blockedRef.current = state?.blocked;
    queryRef.current = query;
    loadingRef.current = !!search?.loading;
  }, [search?.pool, search?.loading, state?.blocked, query]);

  const memberInfo = room.memberInfo ?? {};
  const muted = isRoomMuted(state, room.id);
  const isDm = room.type === 'dm';
  const peer = isDm ? memberInfo[dmPeerOf(room, myUid) ?? ''] : undefined;
  const title = chatRoomTitle(room, lang, myUid);
  const subtitle = isDm ? peer?.label ?? '' : chatRoomDescription(room.type, lang);
  const memberCount = room.memberIds?.length ?? 0;

  const layout = useMemo(() => chatMessageLayout(messages, myUid), [messages, myUid]);
  const members: ChatPerson[] = useMemo(
    () => (room.memberIds ?? []).map((uid) => ({ uid, ...(memberInfo[uid] ?? { name: L('chat.unknownUser'), kind: 'mentor' as const }) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room.memberIds, room.memberInfo],
  );

  // ── 스크롤 ─────────────────────────────────────────────
  const lastKey = `${messages[messages.length - 1]?.id ?? ''}|${outgoing[outgoing.length - 1]?.clientId ?? ''}|${outgoing.length}`;
  const snap = useRef({ firstId: '', lastKey: '', height: 0, initialized: false });

  const toBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    stickRef.current = true;
    setNewBelow(false);
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = snap.current;
    const firstId = messages[0]?.id ?? '';
    if (!prev.initialized) {
      if (loaded || messages.length) {
        el.scrollTop = el.scrollHeight;
        prev.initialized = true;
      }
    } else if (prev.firstId && firstId !== prev.firstId && messages.some((m) => m.id === prev.firstId)) {
      // 위에 이전 메시지가 붙었다 — 보던 자리 그대로
      el.scrollTop += el.scrollHeight - prev.height;
    } else if (lastKey !== prev.lastKey) {
      const outgoingChanged = lastKey.split('|').slice(1).join('|') !== prev.lastKey.split('|').slice(1).join('|');
      const last = messages[messages.length - 1];
      const mine = outgoingChanged || (!!last && last.senderId === myUid);
      if (mine || stickRef.current) {
        el.scrollTop = el.scrollHeight;
        stickRef.current = true;
      } else {
        setNewBelow(true);
      }
    }
    snap.current = { ...snap.current, firstId, lastKey, height: el.scrollHeight };
  }, [messages, lastKey, loaded, myUid]);

  // 사진이 늦게 뜨거나 입력창 높이가 바뀌어도 맨 아래에 붙어 있게
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
      snap.current.height = el.scrollHeight;
    });
    ro.observe(content);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = dist < NEAR_BOTTOM;
    stickRef.current = near;
    snap.current.height = el.scrollHeight;
    if (near !== nearRef.current) {
      nearRef.current = near;
      onBottomChange?.(near);
    }
    if (near) setNewBelow(false);
    setFarFromBottom(dist > 600);
    if (el.scrollTop < 200 && hasMore && !loadingOlder) onLoadOlder();
  };

  // ── 메시지 메뉴 ────────────────────────────────────────
  const openMenu = useCallback((m: ChatMessageView, anchor: ChatMenuAnchor) => setMenu({ m, anchor }), []);
  const openMedia = useCallback((m: ChatMessageView, index: number) => setViewer({ m, index }), []);
  const reveal = useCallback((id: string) => setRevealed((s) => new Set(s).add(id)), []);

  const senderName = (m: ChatMessageView) => memberInfo[m.senderId]?.name ?? m.senderName;

  const menuActions = (m: ChatMessageView): ChatMenuAction[] => {
    const mine = m.senderId === myUid;
    const list: ChatMenuAction[] = [];
    const media = m.media ?? [];
    if (m.text) list.push({ key: 'copy', label: L('chat.copy'), icon: <FiCopy size={16} />, onSelect: () => void copyText(String(m.text)) });
    if (media.length) {
      list.push({
        key: 'save',
        label: media.length > 1 ? L('chat.saveAll') : L('chat.save'),
        icon: <FiDownload size={16} />,
        onSelect: () => void saveChatMedia(media, { campCode: room.campCode, at: m.createdAt?.toDate?.() ?? null }),
      });
    }
    if (mine && !m.pending) {
      list.push({
        key: 'delete',
        label: L('chat.deleteForAll'),
        icon: <FiTrash2 size={16} />,
        danger: true,
        onSelect: () => {
          if (window.confirm(L('chat.deleteConfirm'))) void onDelete(m);
        },
      });
    }
    if (!mine) {
      const blocked = isUserBlocked(state, m.senderId);
      const name = senderName(m);
      list.push({ key: 'report', label: L('chat.report'), icon: <FiFlag size={16} />, danger: true, onSelect: () => setReporting(m) });
      list.push({
        key: 'block',
        label: blocked ? L('chat.unblock') : L('chat.block'),
        icon: <FiSlash size={16} />,
        danger: !blocked,
        onSelect: () => {
          if (window.confirm(blocked ? L('chat.webUnblockConfirm', { name }) : L('chat.blockConfirm', { name }))) void onBlock(m.senderId, !blocked);
        },
      });
    }
    return list;
  };

  // ── 끌어 놓기 ──────────────────────────────────────────
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
  const dragProps = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      tray.addFiles(e.dataTransfer.files);
    },
  };

  const searchReady = !!search && !search.loading;
  const normalizedQuery = searchOpen ? normalizeChatSearch(activeQuery) : '';
  const searchPool = search?.pool;
  const blocked = state?.blocked;
  const hits = useMemo(
    () => (searchReady && normalizedQuery && searchPool ? searchChatMessages(searchPool, normalizedQuery, blocked) : []),
    [searchReady, normalizedQuery, searchPool, blocked],
  );
  const hitIndex = currentHit ? hits.indexOf(currentHit) : -1;

  /** 결과로 옮기기 — 목록에 없으면 늘려서 그린 뒤 가운데로, 잠깐 테두리 */
  const jumpTo = (id: string) => {
    setCurrentHit(id);
    stickRef.current = false;
    pendingJump.current = id;
    search?.onReveal(id);
    setFlashId(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), 1600);
  };
  /** 검색어로 가장 최근 결과부터 */
  const runSearch = (q: string) => {
    setActiveQuery(q);
    const first = normalizeChatSearch(q) ? searchChatMessages(poolRef.current, q, blockedRef.current)[0] : undefined;
    if (first) jumpTo(first);
    else setCurrentHit(null);
  };
  const onQueryChange = (q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (loadingRef.current) setActiveQuery(q); // 다 불러오면 onStart 가 이어서 찾는다
      else runSearch(q);
    }, 250);
  };
  const openSearch = () => {
    if (!search) return;
    setSearchOpen(true);
    search.onStart().catch(() => undefined);
  };
  // 전체 대화를 다 불러오면 — 그동안 입력한 검색어로 바로 찾는다 (목록·결과가 새 데이터로 그려진 뒤)
  const wasLoading = useRef(!!search?.loading);
  useEffect(() => {
    const loading = !!search?.loading;
    if (wasLoading.current && !loading && searchOpen && normalizeChatSearch(queryRef.current)) runSearch(queryRef.current);
    wasLoading.current = loading;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search?.loading]);
  const closeSearch = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchOpen(false);
    setQuery('');
    setActiveQuery('');
    setCurrentHit(null);
    setFlashId(null);
    pendingJump.current = null;
  };
  const goOlder = () => {
    if (!hits.length) return;
    const next = hitIndex < 0 ? 0 : Math.min(hits.length - 1, hitIndex + 1);
    jumpTo(hits[next]);
  };
  const goNewer = () => {
    if (!hits.length) return;
    const next = hitIndex < 0 ? 0 : Math.max(0, hitIndex - 1);
    jumpTo(hits[next]);
  };

  // 결과 메시지가 그려지면 가운데로 (목록을 늘리는 중이면 다음 그림에서)
  useEffect(() => {
    const id = pendingJump.current;
    const box = scrollRef.current;
    if (!id || !box) return;
    const el = box.querySelector<HTMLElement>(`[data-mid="${CSS.escape(id)}"]`);
    if (!el) return;
    pendingJump.current = null;
    el.scrollIntoView({ block: 'center' });
  }, [messages, currentHit, flashId]);

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  const viewerMsg = viewer?.m;
  const lastDay = messages.length ? dayKeyOf(messages[messages.length - 1].createdAt?.toDate?.() ?? new Date()) : '';
  const todayKey = dayKeyOf(new Date());

  const roomMenuActions: ChatMenuAction[] = [
    { key: 'mute', label: muted ? L('chat.unmute') : L('chat.mute'), icon: muted ? <FiBell size={16} /> : <FiBellOff size={16} />, onSelect: onToggleMute },
    { key: 'members', label: L('chat.membersTitle'), icon: <FiUsers size={16} />, onSelect: () => setShowMembers(true) },
  ];
  if (push && push.status !== 'unsupported') {
    roomMenuActions.push(
      push.status === 'default'
        ? { key: 'push', label: L('chat.pushEnableTitle'), icon: <FiBell size={16} />, onSelect: push.onEnable }
        : push.status === 'denied'
          ? { key: 'push', label: L('chat.webPushBlocked'), icon: <FiBellOff size={16} />, onSelect: () => toast(L('chat.pushDenied'), { duration: 6000 }) }
          : { key: 'push', label: L('chat.pushEnabled'), icon: <FiBell size={16} />, onSelect: () => undefined },
    );
  }

  return (
    <div className="relative flex flex-col h-full min-h-0 bg-[#e8eef5]" style={boxStyle} {...dragProps}>
      {/* 머리글 */}
      <header className="flex items-center gap-2 px-2 md:px-4 h-14 shrink-0 bg-white/95 backdrop-blur border-b border-gray-200 pt-[env(safe-area-inset-top)] box-content">
        {onBack && (
          <button type="button" onClick={onBack} className="md:hidden h-10 w-10 -ml-1 rounded-full text-gray-700 hover:bg-gray-100 flex items-center justify-center" aria-label={L('common.back')}>
            <FiChevronLeft size={24} />
          </button>
        )}
        <RoomAvatar type={room.type} peerName={peer?.name} peerPhoto={peer?.photo} size={36} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <h2 className="text-[15px] font-semibold text-gray-900 truncate">{title}</h2>
            {!isDm && <span className="shrink-0 text-xs text-gray-400">{memberCount}</span>}
            {muted && <FiBellOff size={13} className="shrink-0 text-gray-400" aria-label={L('chat.muted')} />}
          </div>
          {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
        </div>
        {search && (
          <button
            type="button"
            onClick={() => (searchOpen ? closeSearch() : openSearch())}
            className={`h-9 w-9 rounded-full flex items-center justify-center ${searchOpen ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100'}`}
            title={L('chat.search')}
            aria-label={L('chat.search')}
            aria-pressed={searchOpen}
          >
            <FiSearch size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowMembers(true)}
          className="h-9 px-2.5 rounded-full text-gray-600 hover:bg-gray-100 flex items-center gap-1 text-sm"
          title={L('chat.membersTitle')}
          aria-label={L('chat.members', { n: memberCount })}
        >
          <FiUsers size={18} />
          <span className="tabular-nums">{memberCount}</span>
        </button>
        <button
          type="button"
          onClick={onToggleMute}
          className="hidden sm:flex h-9 w-9 rounded-full text-gray-600 hover:bg-gray-100 items-center justify-center"
          title={muted ? L('chat.unmute') : L('chat.mute')}
          aria-label={muted ? L('chat.unmute') : L('chat.mute')}
        >
          {muted ? <FiBellOff size={18} /> : <FiBell size={18} />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setRoomMenu({ x: r.right - 200, y: r.bottom + 4, sheet: false });
          }}
          className="h-9 w-9 -mr-1 rounded-full text-gray-600 hover:bg-gray-100 flex items-center justify-center"
          aria-label={L('chat.roomInfo')}
          title={L('chat.roomInfo')}
        >
          <FiMoreVertical size={18} />
        </button>
      </header>

      {searchOpen && search && (
        <ChatSearchBar
          query={query}
          onQueryChange={onQueryChange}
          loading={search.loading}
          loadedCount={search.loadedCount}
          total={hits.length}
          index={hitIndex}
          noResults={searchReady && !!normalizedQuery && activeQuery === query && hits.length === 0}
          onOlder={goOlder}
          onNewer={goNewer}
          onClose={closeSearch}
        />
      )}

      {/* 말풍선 */}
      <div className="relative flex-1 min-h-0">
        <div ref={scrollRef} onScroll={onScroll} className="absolute inset-0 overflow-y-auto overscroll-contain">
          <div ref={contentRef} className="pb-3 pt-2">
            {hasMore && (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  onClick={onLoadOlder}
                  disabled={loadingOlder}
                  className="rounded-full bg-white/80 px-3 py-1 text-xs text-gray-600 shadow-sm hover:bg-white disabled:opacity-60"
                >
                  {loadingOlder ? L('chat.loading') : L('chat.loadOlder')}
                </button>
              </div>
            )}
            {!loaded && !messages.length && (
              <div className="flex justify-center py-16">
                <div className="w-7 h-7 border-2 border-white border-t-blue-500 rounded-full animate-spin" aria-label={L('chat.loading')} />
              </div>
            )}
            {loaded && !messages.length && !outgoing.length && (
              <p className="py-16 text-center text-sm text-gray-500">{L('chat.noMessagesYet')}</p>
            )}
            {messages.map((m, i) => {
              const lay = layout[i];
              const prev = messages[i - 1];
              const firstInRun = !prev || lay.showDay || prev.senderId !== m.senderId || layout[i - 1].showTime || prev.kind === 'system';
              const at = m.createdAt?.toDate?.();
              return (
                <Fragment key={m.id}>
                  {lay.showDay && at && <DaySeparator label={chatDayLabel(at, lang)} />}
                  <ChatMessageRow
                    m={m}
                    lay={lay}
                    firstInRun={firstInRun}
                    sender={memberInfo[m.senderId]}
                    unread={m.pending ? null : unreadReaders(m, room.memberIds ?? [], reads)}
                    lang={lang}
                    blocked={isUserBlocked(state, m.senderId)}
                    revealed={revealed.has(m.id)}
                    onReveal={reveal}
                    onMenu={openMenu}
                    onOpenMedia={openMedia}
                    highlight={normalizedQuery && !isUserBlocked(state, m.senderId) && chatMessageMatches(m, normalizedQuery) ? normalizedQuery : undefined}
                    current={m.id === currentHit && !!normalizedQuery}
                    flash={m.id === flashId}
                  />
                </Fragment>
              );
            })}
            {outgoing.length > 0 && lastDay !== todayKey && <DaySeparator label={chatDayLabel(new Date(), lang)} />}
            {outgoing.map((o) => (
              <ChatOutgoingRow key={o.clientId} o={o} onRetry={onRetry} onDiscard={onDiscard} />
            ))}
          </div>
        </div>
        {newBelow ? (
          <button
            type="button"
            onClick={() => toBottom(true)}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full bg-gray-900/85 px-3.5 py-1.5 text-sm text-white shadow-lg hover:bg-gray-900"
          >
            {L('chat.newMessages')}
            <FiArrowDown size={14} />
          </button>
        ) : farFromBottom ? (
          <button
            type="button"
            onClick={() => toBottom(true)}
            className="absolute bottom-3 right-3 h-9 w-9 rounded-full bg-white text-gray-600 shadow-md flex items-center justify-center hover:bg-gray-50"
            aria-label={L('chat.jumpToLatest')}
            title={L('chat.jumpToLatest')}
          >
            <FiArrowDown size={18} />
          </button>
        ) : null}
      </div>

      <ChatComposer tray={tray} text={text} onTextChange={onTextChange} onSend={onSend} />

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-10 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/85 flex flex-col items-center justify-center gap-2 text-blue-700">
          <FiImage size={32} />
          <p className="text-sm font-medium">{L('chat.webDropHere')}</p>
        </div>
      )}

      {menu && <ChatActionMenu anchor={menu.anchor} actions={menuActions(menu.m)} onClose={() => setMenu(null)} />}
      {roomMenu && <ChatActionMenu anchor={roomMenu} actions={roomMenuActions} title={title} onClose={() => setRoomMenu(null)} />}
      {reporting && (
        <ChatReportDialog
          preview={reporting.text || undefined}
          onSubmit={(reason, detail) => onReport(reporting, reason, detail)}
          onClose={() => setReporting(null)}
        />
      )}
      {showMembers && (
        <ChatMembersDialog
          members={members}
          myUid={myUid}
          onStartDm={async (uid) => {
            await onStartDm(uid);
            setShowMembers(false);
          }}
          onClose={() => setShowMembers(false)}
        />
      )}
      {viewer && viewerMsg && (viewerMsg.media?.length ?? 0) > 0 && (
        <ChatLightbox
          items={viewerMsg.media ?? []}
          startIndex={viewer.index}
          senderName={senderName(viewerMsg)}
          at={viewerMsg.createdAt?.toDate?.() ?? null}
          campCode={room.campCode}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center my-4 px-4">
      <span className="rounded-full bg-black/10 px-3 py-1 text-xs text-gray-600">{label}</span>
    </div>
  );
}
