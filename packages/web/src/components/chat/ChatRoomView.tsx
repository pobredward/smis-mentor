'use client';

/**
 * 대화방 화면 (화면만 — 데이터·보내기는 props, ChatRoomContainer 가 연결한다)
 * 머리글 · 공지 띠 · 말풍선 목록(날짜 구분선 · '여기까지 읽었습니다' · 위로 올리면 더 불러오기 · [새 메시지 ↓] · '@ 나를 언급')
 * · 입력창 · 메시지 메뉴(공감·답장·수정·공지…) · 방 메뉴(모아보기·내보내기…) · 보기 화면 · 대화 상대 · 검색
 */
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import toast from 'react-hot-toast';
import {
  FiArrowDown,
  FiAtSign,
  FiBell,
  FiBellOff,
  FiChevronLeft,
  FiCopy,
  FiCornerUpLeft,
  FiDownload,
  FiEdit2,
  FiEyeOff,
  FiFileText,
  FiFlag,
  FiGrid,
  FiImage,
  FiMoreVertical,
  FiPhone,
  FiPhoneIncoming,
  FiSearch,
  FiSlash,
  FiTrash2,
  FiUsers,
} from 'react-icons/fi';
import { BsPin, BsPinAngle } from 'react-icons/bs';
import {
  L,
  canBeNotice,
  canEditChatMessage,
  canSetNotice,
  chatDayLabel,
  chatMessageLayout,
  chatMessageMatches,
  chatRoomDescription,
  chatRoomTitle,
  dmPeerOf,
  isMentioned,
  isRoomMuted,
  isUserBlocked,
  normalizeChatSearch,
  searchChatMessages,
  unreadReaders,
  type ChatCallMedia,
  type ChatMessageView,
  type ChatPoll,
  type ChatReactionKey,
  type ChatReportReason,
  type ChatRoom,
  type ChatScheduledMessage,
  type ChatUserState,
  type Locale,
} from '@smis-mentor/shared';
import { ChatCallBanner, ChatCallStartSheet, isCallActive, type ChatCallView } from './ChatCall';
import ChatComposer from './ChatComposer';
import { ChatExportDialog, ChatScheduleDialog, ChatScheduledListDialog } from './ChatComposeDialogs';
import ChatGallery, { type ChatGalleryPage } from './ChatGallery';
import ChatLightbox, { saveChatMedia } from './ChatLightbox';
import { ChatActionMenu, ChatReportDialog, type ChatMenuAction, type ChatMenuAnchor } from './ChatMenus';
import { ChatMessageRow, ChatOutgoingRow, ChatUnreadDivider, type ChatRowActions } from './ChatMessageRow';
import ChatNoticeBanner from './ChatNotice';
import { ChatMembersDialog, type ChatPerson } from './ChatPeople';
import { ChatPollCreateDialog } from './ChatPoll';
import { ChatPeopleTabsDialog, ChatReactionsDialog, ReactionPickerRow } from './ChatReactions';
import ChatSearchBar from './ChatSearchBar';
import type { ChatOutgoing } from './chatTypes';
import type { ChatTray } from './useChatTray';
import { RoomAvatar, dayKeyOf, tsMillis } from './chatUi';

export type ChatPushStatus = 'unsupported' | 'default' | 'granted' | 'denied';

/** 대화 내용 검색에 필요한 데이터 (ChatRoomContainer 가 준다) */
export interface ChatRoomSearch {
  /** 찾을 메시지 — 방 전체 대화(처음 검색할 때 한 번 불러옴) + 새로 온 메시지 */
  pool: ChatMessageView[];
  /** 전체 대화를 불러오는 중 · 지금까지 몇 개 */
  loading: boolean;
  loadedCount: number;
  /** 검색을 열 때 — 전체 대화를 (한 번만) 불러온다. 다 불러오면 끝난다 */
  onStart: () => Promise<unknown>;
  /** 이 메시지가 목록에 그려지도록 (지금 창보다 예전이면 전체 대화를 불러 목록을 늘린다) */
  onReveal: (messageId: string) => void;
}

/** 통화 (개발·미리보기에서만 — 없으면 통화 버튼·띠·기록을 하나도 그리지 않는다) */
export interface ChatRoomCallProps {
  state: ChatCallView;
  /** 가짜 연결 (미리보기 안내 · '걸려 오는 통화 보기') */
  mock: boolean;
  onStart: (media: ChatCallMedia) => void;
  onJoin: (callId: string, media: ChatCallMedia) => void;
  onReturn: () => void;
  onSimulateIncoming?: () => void;
}

/** 입력창 상태 — 답장 · 수정 · 조용히 보내기 (보내기는 ChatRoomContainer 가 한다) */
export interface ChatComposeState {
  reply: ChatMessageView | null;
  editing: ChatMessageView | null;
  silent: boolean;
}

export interface ChatRoomViewProps {
  room: ChatRoom;
  myUid: string;
  lang: Locale;
  messages: ChatMessageView[];
  /** 메시지를 처음 받았는가 */
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

  // ── 2차 ──
  compose: ChatComposeState;
  onCompose: (patch: Partial<ChatComposeState>) => void;
  /** 메뉴 '수정' — 입력창을 수정 모드로 (글 채우기) */
  onStartEdit: (m: ChatMessageView) => void;
  onCancelEdit: () => void;
  onReact: (m: ChatMessageView, key: ChatReactionKey | null) => void;
  onVote: (m: ChatMessageView, ids: string[]) => Promise<void>;
  onClosePoll: (m: ChatMessageView) => void;
  onCreatePoll: (poll: ChatPoll, closesAt: Date | null) => Promise<void>;
  onSendVoice: (blob: Blob, durationMs: number) => void;
  /** 공지 — 올리기 · 내리기 */
  notice: {
    onSet: (m: ChatMessageView) => void;
    onClear: () => void;
  };
  /** 이 방의 내 예약 메시지 */
  scheduled: ChatScheduledMessage[];
  onSchedule: (text: string, at: Date) => Promise<void>;
  onCancelScheduled: (id: string) => Promise<void>;
  onExport: (includeLinks: boolean, onProgress: (n: number) => void) => Promise<void>;
  loadGalleryPage: (cursor: unknown) => Promise<ChatGalleryPage>;
  /** 위에 고정 · 숨기기 (미리 만든 방은 늘 고정 — 안내만) */
  pin?: { preset: boolean; pinned: boolean; onToggle: () => void; onHide: () => void };
  /** 방에 들어올 때 내 마지막 읽은 시각 — '@ 나를 언급' */
  entryReadMs?: number | null;
  /** 처음 자리 — ready 가 되면 읽지 않은 첫 메시지(id) 위 '여기까지 읽었습니다' 로, 없으면 맨 아래 */
  initialAnchor?: { ready: boolean; id: string | null };
  /** 녹음할 수 있는가 (미리보기에서 정해 줄 때) */
  voiceSupported?: boolean;
  call?: ChatRoomCallProps;
}

const isCallLog = (m: ChatMessageView) => m.kind === 'system' && m.systemType === 'call';

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

const NOTICE_KEY = (roomId: string) => `smis_chat_notice_folded_${roomId}`;
function readFolded(roomId: string): string {
  try {
    return window.localStorage.getItem(NOTICE_KEY(roomId)) || '';
  } catch {
    return '';
  }
}

export default function ChatRoomView(props: ChatRoomViewProps) {
  const {
    room, myUid, lang, messages: allMessages, loaded, outgoing, reads, state, hasMore, loadingOlder, onLoadOlder, onBack,
    tray, text, onTextChange, onSend, onRetry, onDiscard, onDelete, onReport, onBlock, onToggleMute, onStartDm,
    onBottomChange, push, boxStyle, search, initialSearch,
    compose, onCompose, onStartEdit, onCancelEdit, onReact, onVote, onClosePoll, onCreatePoll, onSendVoice,
    notice, scheduled, onSchedule, onCancelScheduled, onExport, loadGalleryPage, pin, entryReadMs, initialAnchor, voiceSupported, call,
  } = props;
  // 통화가 꺼져 있으면(운영) 통화 기록도 보이지 않는다
  const messages = useMemo(() => (call ? allMessages : allMessages.filter((m) => !isCallLog(m))), [call, allMessages]);
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
  const [dialog, setDialog] = useState<
    | { kind: 'reactions'; m: ChatMessageView }
    | { kind: 'voters'; m: ChatMessageView; optionId: string }
    | { kind: 'poll' }
    | { kind: 'schedule' }
    | { kind: 'scheduled' }
    | { kind: 'export' }
    | { kind: 'gallery' }
    | { kind: 'call' }
    | null
  >(null);
  /** 접어 둔 공지 (그 공지 메시지 id — 새 공지가 오면 다시 펼친다) */
  const [foldedNotice, setFoldedNotice] = useState(() => (typeof window === 'undefined' ? '' : readFolded(room.id)));
  const [seenMentions, setSeenMentions] = useState<Set<string>>(() => new Set());

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

  const memberInfo = useMemo(() => room.memberInfo ?? {}, [room.memberInfo]);
  const muted = isRoomMuted(state, room.id);
  const isDm = room.type === 'dm';
  const peer = isDm ? memberInfo[dmPeerOf(room, myUid) ?? ''] : undefined;
  const title = chatRoomTitle(room, lang, myUid);
  const subtitle = isDm ? peer?.label ?? '' : chatRoomDescription(room.type, lang);
  const memberCount = room.memberIds?.length ?? 0;
  const canNotice = canSetNotice(room, myUid);

  const layout = useMemo(() => chatMessageLayout(messages, myUid), [messages, myUid]);
  const members: ChatPerson[] = useMemo(
    () => (room.memberIds ?? []).map((uid) => ({ uid, ...(memberInfo[uid] ?? { name: L('chat.unknownUser'), kind: 'mentor' as const }) })),
    [room.memberIds, memberInfo],
  );

  // ── 스크롤 ─────────────────────────────────────────────
  const lastKey = `${messages[messages.length - 1]?.id ?? ''}|${outgoing[outgoing.length - 1]?.clientId ?? ''}|${outgoing.length}`;
  const snap = useRef({ firstId: '', lastKey: '', height: 0, initialized: false });
  const anchorReady = initialAnchor ? initialAnchor.ready : loaded || messages.length > 0;
  const anchorId = initialAnchor?.id ?? null;

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
      if (anchorReady) {
        // 처음 자리 — 읽지 않은 첫 메시지 위 줄, 없으면 맨 아래
        const divider = anchorId ? el.querySelector<HTMLElement>('[data-unread-divider]') : null;
        if (divider) {
          el.scrollTop = Math.max(0, divider.offsetTop - 12);
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
        } else {
          el.scrollTop = el.scrollHeight;
        }
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
  }, [messages, lastKey, anchorReady, anchorId, myUid]);

  // 사진이 늦게 뜨거나 입력창 높이가 바뀌어도 맨 아래에 붙어 있게
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (stickRef.current && snap.current.initialized) el.scrollTop = el.scrollHeight;
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
    if (snap.current.initialized && el.scrollTop < 200 && hasMore && !loadingOlder) onLoadOlder();
  };

  // ── 옮겨 가기 (검색 결과 · 답장 인용 · 공지 · 멘션) ────────
  const flash = (id: string) => {
    setFlashId(id);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlashId(null), 1600);
  };
  /** 그 메시지로 — 목록에 없으면 (전체 대화를 불러) 늘려서 그린 뒤 가운데로, 잠깐 테두리 */
  const jumpTo = (id: string) => {
    stickRef.current = false;
    pendingJump.current = id;
    search?.onReveal(id);
    flash(id);
  };
  const jumpToHit = (id: string) => {
    setCurrentHit(id);
    jumpTo(id);
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

  // ── 검색 ───────────────────────────────────────────────
  const searchReady = !!search && !search.loading;
  const normalizedQuery = searchOpen ? normalizeChatSearch(activeQuery) : '';
  const searchPool = search?.pool;
  const blocked = state?.blocked;
  const hits = useMemo(
    () => (searchReady && normalizedQuery && searchPool ? searchChatMessages(searchPool, normalizedQuery, blocked) : []),
    [searchReady, normalizedQuery, searchPool, blocked],
  );
  const hitIndex = currentHit ? hits.indexOf(currentHit) : -1;

  /** 검색어로 가장 최근 결과부터 */
  const runSearch = (q: string) => {
    setActiveQuery(q);
    const first = normalizeChatSearch(q) ? searchChatMessages(poolRef.current, q, blockedRef.current)[0] : undefined;
    if (first) jumpToHit(first);
    else setCurrentHit(null);
  };
  const onQueryChange = (q: string) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      if (loadingRef.current) setActiveQuery(q); // 다 불러오면 이어서 찾는다
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
    jumpToHit(hits[hitIndex < 0 ? 0 : Math.min(hits.length - 1, hitIndex + 1)]);
  };
  const goNewer = () => {
    if (!hits.length) return;
    jumpToHit(hits[hitIndex < 0 ? 0 : Math.max(0, hitIndex - 1)]);
  };

  // ── '@ 나를 언급' — 들어올 때 안 읽은 메시지 중 나를 부른 것 ──
  const mentionIds = useMemo(() => {
    if (!entryReadMs) return [];
    return messages
      .filter((m) => tsMillis(m.createdAt) > entryReadMs && !m.deleted && !blocked?.[m.senderId] && isMentioned(m, myUid))
      .map((m) => m.id)
      .filter((id) => !seenMentions.has(id));
  }, [messages, entryReadMs, myUid, blocked, seenMentions]);

  // ── 말풍선에서 부르는 동작 (한 번 만들어 넘긴다 — 최신 함수는 ref 로) ──
  const joinCall = (callId: string, media: ChatCallMedia) => {
    if (!call) return;
    if (isCallActive(call.state) && call.state.callId !== callId) {
      toast(L('chat.callAlreadyInCall'));
      return;
    }
    if (isCallActive(call.state)) call.onReturn();
    else call.onJoin(callId, media);
  };
  const live = useRef({ jumpTo, onReact, onVote, onClosePoll, joinCall });
  useEffect(() => {
    live.current = { jumpTo, onReact, onVote, onClosePoll, joinCall };
  });
  const rowActions = useMemo<ChatRowActions>(() => ({
    onReveal: (id) => setRevealed((s) => new Set(s).add(id)),
    onMenu: (m, anchor) => setMenu({ m, anchor }),
    onOpenMedia: (m, index) => setViewer({ m, index }),
    onJump: (id) => live.current.jumpTo(id),
    onReactions: (m) => setDialog({ kind: 'reactions', m }),
    onVote: (m, ids) => live.current.onVote(m, ids),
    onClosePoll: (m) => live.current.onClosePoll(m),
    onPollVoters: (m, optionId) => setDialog({ kind: 'voters', m, optionId }),
    onJoinCall: (m) => { if (m.call) live.current.joinCall(m.call.callId, m.call.media); },
  }), []);

  const senderName = (m: ChatMessageView) => memberInfo[m.senderId]?.name ?? m.senderName;

  const menuActions = (m: ChatMessageView): ChatMenuAction[] => {
    const mine = m.senderId === myUid;
    const list: ChatMenuAction[] = [];
    const media = (m.media ?? []).filter((x) => x.kind === 'image' || x.kind === 'video');
    if (!m.pending) list.push({ key: 'reply', label: L('chat.reply'), icon: <FiCornerUpLeft size={16} />, onSelect: () => onCompose({ reply: m, editing: null }) });
    if (m.text && (m.kind === 'text' || m.kind === 'media')) list.push({ key: 'copy', label: L('chat.copy'), icon: <FiCopy size={16} />, onSelect: () => void copyText(String(m.text)) });
    if (!m.pending && canEditChatMessage(m, myUid)) list.push({ key: 'edit', label: L('chat.edit'), icon: <FiEdit2 size={16} />, onSelect: () => onStartEdit(m) });
    if (!m.pending && canNotice && canBeNotice(m) && room.notice?.messageId !== m.id) {
      list.push({
        key: 'notice',
        label: L('chat.setNotice'),
        icon: <span className="text-base leading-none">📢</span>,
        onSelect: () => {
          if (room.notice && !window.confirm(L('chat.noticeReplaceConfirm'))) return;
          notice.onSet(m);
        },
      });
    }
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
      const isBlocked = isUserBlocked(state, m.senderId);
      const name = senderName(m);
      list.push({ key: 'report', label: L('chat.report'), icon: <FiFlag size={16} />, danger: true, onSelect: () => setReporting(m) });
      list.push({
        key: 'block',
        label: isBlocked ? L('chat.unblock') : L('chat.block'),
        icon: <FiSlash size={16} />,
        danger: !isBlocked,
        onSelect: () => {
          if (window.confirm(isBlocked ? L('chat.webUnblockConfirm', { name }) : L('chat.blockConfirm', { name }))) void onBlock(m.senderId, !isBlocked);
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
      if (!compose.editing) tray.addFiles(e.dataTransfer.files);
    },
  };

  const viewerMsg = viewer?.m;
  const lastDay = messages.length ? dayKeyOf(messages[messages.length - 1].createdAt?.toDate?.() ?? new Date()) : '';
  const todayKey = dayKeyOf(new Date());

  const roomMenuActions: ChatMenuAction[] = [
    { key: 'gallery', label: L('chat.gallery'), icon: <FiGrid size={16} />, onSelect: () => setDialog({ kind: 'gallery' }) },
    { key: 'export', label: L('chat.export'), icon: <FiFileText size={16} />, onSelect: () => setDialog({ kind: 'export' }) },
    { key: 'mute', label: muted ? L('chat.unmute') : L('chat.mute'), icon: muted ? <FiBell size={16} /> : <FiBellOff size={16} />, onSelect: onToggleMute },
    { key: 'members', label: L('chat.membersTitle'), icon: <FiUsers size={16} />, onSelect: () => setShowMembers(true) },
  ];
  if (pin?.preset) {
    roomMenuActions.push({ key: 'preset', label: L('chat.presetPinned'), icon: <BsPinAngle size={15} />, note: true, onSelect: () => undefined });
  } else if (pin) {
    roomMenuActions.push(
      { key: 'pin', label: pin.pinned ? L('chat.unpin') : L('chat.pin'), icon: pin.pinned ? <BsPin size={15} /> : <BsPinAngle size={15} />, onSelect: pin.onToggle },
      { key: 'hide', label: L('chat.hideRoom'), icon: <FiEyeOff size={16} />, onSelect: pin.onHide },
    );
  }
  if (call?.mock && call.onSimulateIncoming) {
    roomMenuActions.push({ key: 'simulateCall', label: L('chat.callSimulateIncoming'), icon: <FiPhoneIncoming size={16} />, onSelect: call.onSimulateIncoming });
  }
  if (push && push.status !== 'unsupported') {
    roomMenuActions.push(
      push.status === 'default'
        ? { key: 'push', label: L('chat.pushEnableTitle'), icon: <FiBell size={16} />, onSelect: push.onEnable }
        : push.status === 'denied'
          ? { key: 'push', label: L('chat.webPushBlocked'), icon: <FiBellOff size={16} />, onSelect: () => toast(L('chat.pushDenied'), { duration: 6000 }) }
          : { key: 'push', label: L('chat.pushEnabled'), icon: <FiBell size={16} />, note: true, onSelect: () => undefined },
    );
  }

  const noticeFolded = !!room.notice && foldedNotice === room.notice.messageId;
  const toggleNotice = () => {
    const next = noticeFolded ? '' : room.notice?.messageId ?? '';
    setFoldedNotice(next);
    try {
      if (next) window.localStorage.setItem(NOTICE_KEY(room.id), next);
      else window.localStorage.removeItem(NOTICE_KEY(room.id));
    } catch {
      /* 저장소를 못 쓰면 이번만 */
    }
  };

  // 통화 띠 — 방에서 진행 중인 통화(room.activeCall, 서버가 쓴다). 내가 이 방에서 통화 중이면 [통화로 돌아가기]
  const myCallHere = !!call && isCallActive(call.state) && call.state.roomId === room.id;
  const callInfo = call
    ? room.activeCall ?? (myCallHere && call.state.minimized
      ? { callId: call.state.callId ?? '', media: call.state.media, startedBy: myUid, startedByName: '', startedAt: call.state.startedAt ?? 0, participantIds: call.state.participants.map((p) => p.uid) }
      : null)
    : null;
  const inThisCall = !!call && !!callInfo && isCallActive(call.state) && call.state.callId === callInfo.callId;

  return (
    <div className="relative flex flex-col h-full min-h-0 bg-[#e8eef5]" style={boxStyle} {...dragProps}>
      {/* 머리글 */}
      <header className="flex items-center gap-1.5 px-2 md:px-4 h-14 shrink-0 bg-white/95 backdrop-blur border-b border-gray-200 pt-[env(safe-area-inset-top)] box-content">
        {onBack && (
          <button type="button" onClick={onBack} className="md:hidden h-10 w-10 -ml-1 rounded-full text-gray-700 hover:bg-gray-100 flex items-center justify-center" aria-label={L('common.back')}>
            <FiChevronLeft size={24} />
          </button>
        )}
        <RoomAvatar type={room.type} peerName={peer?.name} peerPhoto={peer?.photo} groupKey={room.groupKey} size={36} />
        <div className="min-w-0 flex-1 ml-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <h2 className="text-[15px] font-semibold text-gray-900 truncate">{title}</h2>
            {!isDm && <span className="shrink-0 text-xs text-gray-400">{memberCount}</span>}
            {muted && <FiBellOff size={13} className="shrink-0 text-gray-400" aria-label={L('chat.muted')} />}
          </div>
          {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
        </div>
        {call && (
          <button
            type="button"
            onClick={() => setDialog({ kind: 'call' })}
            className="h-9 w-9 shrink-0 rounded-full text-gray-600 hover:bg-gray-100 flex items-center justify-center"
            title={L('chat.callStartTitle')}
            aria-label={L('chat.callStartTitle')}
          >
            <FiPhone size={18} />
          </button>
        )}
        {search && (
          <button
            type="button"
            onClick={() => (searchOpen ? closeSearch() : openSearch())}
            className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center ${searchOpen ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100'}`}
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
          className="h-9 px-2 shrink-0 rounded-full text-gray-600 hover:bg-gray-100 flex items-center gap-1 text-sm"
          title={L('chat.membersTitle')}
          aria-label={L('chat.members', { n: memberCount })}
        >
          <FiUsers size={18} />
          <span className="tabular-nums">{memberCount}</span>
        </button>
        <button
          type="button"
          onClick={onToggleMute}
          className="hidden sm:flex h-9 w-9 shrink-0 rounded-full text-gray-600 hover:bg-gray-100 items-center justify-center"
          title={muted ? L('chat.unmute') : L('chat.mute')}
          aria-label={muted ? L('chat.unmute') : L('chat.mute')}
        >
          {muted ? <FiBellOff size={18} /> : <FiBell size={18} />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setRoomMenu({ x: r.right - 220, y: r.bottom + 4, sheet: false });
          }}
          className="h-9 w-9 -mr-1 shrink-0 rounded-full text-gray-600 hover:bg-gray-100 flex items-center justify-center"
          aria-label={L('chat.roomMenu')}
          title={L('chat.roomMenu')}
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

      {call && callInfo && (
        <ChatCallBanner
          info={callInfo}
          direct={isDm}
          lang={lang}
          inThisCall={inThisCall}
          onJoin={(media) => joinCall(callInfo.callId, media)}
          onReturn={call.onReturn}
        />
      )}

      {room.notice && (
        <ChatNoticeBanner
          room={room}
          canManage={canNotice}
          collapsed={noticeFolded}
          onToggle={toggleNotice}
          onOpen={() => jumpTo(room.notice!.messageId)}
          onClear={notice.onClear}
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
              const firstInRun = !prev || lay.showDay || prev.senderId !== m.senderId || layout[i - 1].showTime || prev.kind === 'system' || m.id === anchorId;
              const at = m.createdAt?.toDate?.();
              return (
                <Fragment key={m.id}>
                  {lay.showDay && at && <DaySeparator label={chatDayLabel(at, lang)} />}
                  {m.id === anchorId && (
                    <div data-unread-divider="">
                      <ChatUnreadDivider />
                    </div>
                  )}
                  <ChatMessageRow
                    m={m}
                    lay={m.id === anchorId && !lay.mine ? { ...lay, showSender: true } : lay}
                    firstInRun={firstInRun}
                    sender={memberInfo[m.senderId]}
                    unread={m.pending ? null : unreadReaders(m, room.memberIds ?? [], reads)}
                    lang={lang}
                    blocked={isUserBlocked(state, m.senderId)}
                    revealed={revealed.has(m.id)}
                    myUid={myUid}
                    memberInfo={memberInfo}
                    actions={rowActions}
                    highlight={normalizedQuery && !isUserBlocked(state, m.senderId) && chatMessageMatches(m, normalizedQuery) ? normalizedQuery : undefined}
                    current={m.id === currentHit && !!normalizedQuery}
                    flash={m.id === flashId}
                    callDirect={isDm}
                    callJoinable={!!m.call && m.call.status === 'started' && room.activeCall?.callId === m.call.callId}
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
        {mentionIds.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const id = mentionIds[0];
              setSeenMentions((s) => new Set(s).add(id));
              jumpTo(id);
            }}
            className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-blue-500 px-3 py-1.5 text-sm font-medium text-white shadow-lg hover:bg-blue-600"
          >
            <FiAtSign size={14} />
            {L('chat.mentionJump').replace(/^@\s*/, '')}
            {mentionIds.length > 1 && <span className="rounded-full bg-white/25 px-1.5 text-xs tabular-nums">{mentionIds.length}</span>}
          </button>
        )}
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

      <ChatComposer
        tray={tray}
        text={text}
        onTextChange={onTextChange}
        onSend={onSend}
        room={room}
        myUid={myUid}
        lang={lang}
        reply={compose.reply}
        onCancelReply={() => onCompose({ reply: null })}
        editing={compose.editing}
        onCancelEdit={onCancelEdit}
        silent={compose.silent}
        onToggleSilent={() => onCompose({ silent: !compose.silent })}
        scheduledCount={scheduled.length}
        onOpenScheduled={() => setDialog({ kind: 'scheduled' })}
        onOpenPoll={() => setDialog({ kind: 'poll' })}
        onOpenSchedule={() => {
          if (tray.items.length) toast(L('chat.scheduleTextOnly'));
          setDialog({ kind: 'schedule' });
        }}
        onSendVoice={onSendVoice}
        voiceSupported={voiceSupported}
      />

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-10 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/85 flex flex-col items-center justify-center gap-2 text-blue-700">
          <FiImage size={32} />
          <p className="text-sm font-medium">{L('chat.webDropHere')}</p>
        </div>
      )}

      {menu && (
        <ChatActionMenu
          anchor={menu.anchor}
          actions={menuActions(menu.m)}
          header={!menu.m.pending && !menu.m.deleted ? (
            <ReactionPickerRow
              mine={menu.m.reactions?.[myUid] ?? null}
              onPick={(key) => {
                setMenu(null);
                onReact(menu.m, key);
              }}
            />
          ) : undefined}
          onClose={() => setMenu(null)}
        />
      )}
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
      {dialog?.kind === 'reactions' && (
        <ChatReactionsDialog
          reactions={messages.find((x) => x.id === dialog.m.id)?.reactions ?? dialog.m.reactions}
          memberInfo={memberInfo}
          myUid={myUid}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'voters' && dialog.m.poll && (
        <ChatPeopleTabsDialog
          title={dialog.m.poll.question}
          tabs={dialog.m.poll.options.map((o) => ({
            key: o.id,
            label: o.text.length > 12 ? `${o.text.slice(0, 12)}…` : o.text,
            uids: Object.entries(dialog.m.pollVotes ?? {}).filter(([, ids]) => ids.includes(o.id)).map(([uid]) => uid),
          }))}
          initialTab={dialog.optionId}
          memberInfo={memberInfo}
          myUid={myUid}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'poll' && <ChatPollCreateDialog onCreate={onCreatePoll} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'schedule' && (
        <ChatScheduleDialog
          initialText={text}
          lang={lang}
          onSchedule={async (t, at) => {
            await onSchedule(t, at);
            if (t === text) onTextChange('');
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'scheduled' && (
        <ChatScheduledListDialog
          list={scheduled}
          lang={lang}
          onCancel={async (id) => {
            await onCancelScheduled(id);
            if (scheduled.length <= 1) setDialog(null);
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'export' && <ChatExportDialog onExport={onExport} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'gallery' && <ChatGallery room={room} lang={lang} loadPage={loadGalleryPage} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'call' && call && (
        <ChatCallStartSheet
          direct={isDm}
          lang={lang}
          mock={call.mock}
          busy={isCallActive(call.state)}
          onStart={call.onStart}
          onClose={() => setDialog(null)}
        />
      )}
      {viewer && viewerMsg && (viewerMsg.media?.length ?? 0) > 0 && (
        <ChatLightbox
          items={(viewerMsg.media ?? []).filter((x) => x.kind === 'image' || x.kind === 'video')}
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
