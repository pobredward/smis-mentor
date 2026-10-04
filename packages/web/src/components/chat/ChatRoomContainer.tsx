'use client';

/**
 * 대화방 — 데이터 구독 · 보내기 · 읽음 표시를 ChatRoomView 에 연결한다.
 *
 * 읽음 표시(markChatRoomRead): 이 방이 보이고(탭 보임 + 창 포커스) 맨 아래 근처일 때,
 * 내가 아직 안 읽은 메시지가 있거나 unreadOf > 0 이면 — 0.8초 묶어서. 방에 들어올 때 1번 (처음 읽은 시각을 받은 뒤).
 * 처음 자리: 들어올 때의 내 마지막 읽은 시각 뒤 첫 메시지 위 '여기까지 읽었습니다' (불러온 범위보다 예전이면 전체 대화를 불러서).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import toast from 'react-hot-toast';
import { FirebaseError } from 'firebase/app';
import { Timestamp, type DocumentData, type DocumentSnapshot } from 'firebase/firestore';
import { FiChevronLeft } from 'react-icons/fi';
import {
  CHAT_LIMITS,
  L,
  ackChatNotice,
  chatExportFileName,
  chatExportText,
  chatReplyRefOf,
  chatRoomGeneration,
  cleanChatText,
  closeChatPoll,
  deleteChatMessage,
  editChatMessage,
  dmPeerOf,
  extractMentions,
  firstUnreadIndex,
  getCurrentLocale,
  isPresetRoom,
  isRoomMuted,
  loadAllChatMessages,
  loadChatMediaPage,
  logger,
  markChatRoomRead,
  newChatClientId,
  reportChatMessage,
  scheduleChatMessage,
  sendChatMessage,
  setChatReaction,
  setChatRoomHidden,
  setChatRoomMuted,
  setChatRoomPinned,
  setChatUserBlocked,
  subscribeChatMessage,
  subscribeMyScheduledChatMessages,
  cancelScheduledChatMessage,
  unreadOf,
  voteChatPoll,
  type ChatCallMedia,
  type ChatMessageView,
  type ChatPoll,
  type ChatReactionKey,
  type ChatReportReason,
  type ChatScheduledMessage,
  type ChatUserState,
} from '@smis-mentor/shared';
import { db } from '@/lib/firebase';
import { authenticatedPost } from '@/lib/apiClient';
import { saveTextFile } from '@/lib/chatMedia';
import { enableWebPush, webPushPermission } from '@/lib/webPush';
import { setViewingChatRoom } from '@/hooks/useChatUnread';
import ChatRoomView, { type ChatComposeState, type ChatPushStatus, type ChatRoomCallProps, type ChatRoomSearch } from './ChatRoomView';
import { isCallActive, setCallRoomMembers, useChatCall } from './chatCalls';
import type { ChatGalleryPage } from './ChatGallery';
import { discardChatOutgoing, queueChatMedia, queueChatVoice, retryChatOutgoing, sendChatText, settleChatOutbox, useChatOutbox } from './chatOutbox';
import type { ChatSendExtra } from './chatTypes';
import { mergeChatMessages, useChatMessages, useChatReads, useChatRoom } from './useChatRoomData';
import { useChatTray } from './useChatTray';
import { shortDateTime, tsMillis } from './chatUi';

/** 방마다 쓰다 만 글 (방을 옮겼다 돌아와도 남게) */
const drafts = new Map<string, string>();

const pageActive = () => typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();

/** 좁은 화면(전체 화면 대화방) — 키보드가 올라오면 보이는 높이에 맞춘다 (iOS Safari) */
function useNarrowViewportBox(): CSSProperties | undefined {
  const [box, setBox] = useState<CSSProperties | undefined>(undefined);
  useEffect(() => {
    const vv = window.visualViewport;
    const mq = window.matchMedia('(max-width: 767px)');
    if (!vv) return;
    const update = () => {
      if (!mq.matches) {
        setBox(undefined);
        return;
      }
      setBox({ height: vv.height, transform: vv.offsetTop ? `translateY(${vv.offsetTop}px)` : undefined });
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    mq.addEventListener('change', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      mq.removeEventListener('change', update);
    };
  }, []);
  return box;
}

/** 서버 오류 메시지 (authenticatedPost 가 던진 것) */
const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : L('chat.webActionFailed'));

export interface ChatRoomContainerProps {
  roomId: string;
  myUid: string;
  myName: string;
  state: ChatUserState | null;
  /** 지금 기수 '29기' — 이 기수의 캠프 방·그룹방은 늘 고정 (고정 해제 · 숨기기 없음) */
  currentGeneration: string;
  onBack: () => void;
  onStartDm: (uid: string) => Promise<void>;
}

export default function ChatRoomContainer({ roomId, myUid, myName, state, currentGeneration, onBack, onStartDm }: ChatRoomContainerProps) {
  const lang = getCurrentLocale();
  const { room, status } = useChatRoom(roomId, myUid);
  const ready = status === 'ready';
  const { messages, loaded, hasMore, loadingOlder, loadOlder } = useChatMessages(roomId, ready);
  const { reads, loaded: readsLoaded, initial: initialReads } = useChatReads(roomId, ready);
  const outgoing = useChatOutbox(roomId);
  const tray = useChatTray();
  const [text, setText] = useState(() => drafts.get(roomId) ?? '');
  const [compose, setCompose] = useState<ChatComposeState>({ reply: null, editing: null, silent: false });
  const [nearBottom, setNearBottom] = useState(true);
  const [active, setActive] = useState(pageActive);
  const [pushStatus, setPushStatus] = useState<ChatPushStatus>(() => (typeof window === 'undefined' ? 'unsupported' : webPushPermission()));
  const [scheduled, setScheduled] = useState<ChatScheduledMessage[]>([]);
  const [noticeAcks, setNoticeAcks] = useState<{ id: string; acks: Record<string, unknown> | null } | null>(null);
  const box = useNarrowViewportBox();

  // ── 전체 대화 (검색 · 답장 이동 · 읽지 않은 곳 · 내보내기) ───
  // 처음 필요할 때 방 전체 대화를 한 번 불러와 이 방이 열려 있는 동안 기억한다 (새 메시지는 실시간 목록에서 합친다)
  const [history, setHistory] = useState<ChatMessageView[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [historyFailed, setHistoryFailed] = useState(false);
  /** 예전 메시지까지 늘린 목록의 시작 시각 (불러 둔 대화에서 이 시각부터 보인다) */
  const [floorMs, setFloorMs] = useState<number | null>(null);
  const historyPromise = useRef<Promise<ChatMessageView[] | null> | null>(null);

  const loadHistory = useCallback((): Promise<ChatMessageView[] | null> => {
    if (!historyPromise.current) {
      setHistoryLoading(true);
      setHistoryCount(0);
      historyPromise.current = loadAllChatMessages(db, roomId, { onProgress: setHistoryCount })
        .then((all) => {
          setHistory(all);
          return all;
        })
        .catch((e) => {
          logger.warn('채팅 전체 대화 불러오기 실패:', e);
          toast.error(L('chat.webActionFailed'));
          setHistoryFailed(true);
          historyPromise.current = null; // 다음에 다시 시도 (그동안은 지금 목록에서만)
          return null;
        })
        .finally(() => setHistoryLoading(false));
    }
    return historyPromise.current;
  }, [roomId]);

  // 좁은 화면에서는 방이 전체 화면을 덮으므로 뒤 목록이 같이 스크롤되지 않게
  useEffect(() => {
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // 이 방 푸시는 작은 알림을 띄우지 않는다
  useEffect(() => {
    setViewingChatRoom(roomId);
    return () => setViewingChatRoom(null);
  }, [roomId]);

  // 이 방의 내 예약 메시지
  useEffect(() => subscribeMyScheduledChatMessages(
    db,
    myUid,
    (list) => setScheduled(list.filter((s) => s.roomId === roomId)),
    (e) => logger.warn('예약 메시지 구독 오류:', e),
  ), [myUid, roomId]);

  // 공지 메시지의 '확인' (실시간)
  const noticeId = room?.notice?.messageId ?? '';
  useEffect(() => {
    if (!noticeId || !ready) return;
    return subscribeChatMessage(db, roomId, noticeId, (m) => setNoticeAcks({ id: noticeId, acks: (m?.acks as Record<string, unknown> | undefined) ?? null }), (e) => logger.warn('공지 확인 구독 오류:', e));
  }, [roomId, noticeId, ready]);
  const acks = noticeAcks && noticeAcks.id === noticeId ? noticeAcks.acks : null;

  const onTextChange = useCallback((v: string) => {
    setText(v);
    if (v) drafts.set(roomId, v);
    else drafts.delete(roomId);
  }, [roomId]);

  // 서버 메시지로 나타난 '보내는 중' 묶음은 뺀다
  useEffect(() => {
    if (!outgoing.some((o) => o.status === 'sent')) return;
    settleChatOutbox(roomId, new Set(messages.map((m) => m.id)));
  }, [messages, outgoing, roomId]);

  // ── 화면에 그릴 메시지 ─────────────────────────────────
  const display = useMemo(
    () => (history && floorMs != null ? mergeChatMessages(history.filter((m) => tsMillis(m.createdAt) >= floorMs), messages) : messages),
    [history, floorMs, messages],
  );
  const searchPool = useMemo(() => (history ? mergeChatMessages(history, messages) : messages), [history, messages]);
  const displayFirstMs = display.length ? tsMillis(display[0].createdAt) : 0;
  const displayHasMore = history ? history.length > 0 && !!displayFirstMs && tsMillis(history[0].createdAt) < displayFirstMs : hasMore;

  /** 위로 올려 더 보기 — 전체 대화를 불러 둔 뒤에는 거기서 50개씩 (Firestore 를 다시 읽지 않는다) */
  const loadOlderDisplay = useCallback(() => {
    if (!history || !displayFirstMs) {
      void loadOlder();
      return;
    }
    let idx = history.findIndex((m) => tsMillis(m.createdAt) >= displayFirstMs);
    if (idx < 0) idx = history.length;
    const k = Math.max(0, idx - CHAT_LIMITS.pageSize);
    if (k >= idx) return;
    setFloorMs(tsMillis(history[k].createdAt));
  }, [history, displayFirstMs, loadOlder]);

  /** 목록을 이 시각(조금 위 포함)까지 늘린다 */
  const extendTo = useCallback((all: ChatMessageView[], index: number, above: number) => {
    if (index < 0 || !all.length) return;
    const floor = tsMillis(all[Math.max(0, index - above)].createdAt);
    setFloorMs((f) => (f == null ? floor : Math.min(f, floor)));
  }, []);

  /** 이 메시지가 목록에 그려지도록 — 지금 창보다 예전이면 전체 대화를 불러 늘린다 (검색 결과 · 답장 · 공지 · 멘션) */
  const revealMessage = useCallback((id: string) => {
    if (display.some((m) => m.id === id)) return;
    if (history) {
      extendTo(history, history.findIndex((m) => m.id === id), 5);
      return;
    }
    void loadHistory().then((all) => {
      if (all) extendTo(all, all.findIndex((m) => m.id === id), 5);
    });
  }, [history, display, extendTo, loadHistory]);

  const search: ChatRoomSearch = useMemo(
    () => ({ pool: searchPool, loading: historyLoading, loadedCount: historyCount, onStart: loadHistory, onReveal: revealMessage }),
    [searchPool, historyLoading, historyCount, loadHistory, revealMessage],
  );

  // ── 읽지 않은 곳부터 ──────────────────────────────────
  const entryReadMs = initialReads ? initialReads[myUid] ?? 0 : null;
  const unreadIdx = entryReadMs ? firstUnreadIndex(display, entryReadMs, myUid) : -1;
  // 불러온 첫 메시지부터 안 읽었다 — 더 예전도 안 읽었을 수 있으니 전체 대화에서 그 자리까지 늘린다
  const needOlder = !!entryReadMs && unreadIdx === 0 && displayHasMore && !historyFailed;
  useEffect(() => {
    if (!needOlder) return;
    void loadHistory().then((all) => {
      if (!all || !entryReadMs) return;
      extendTo(all, all.findIndex((m) => m.senderId !== myUid && m.kind !== 'system' && tsMillis(m.createdAt) > entryReadMs), 3);
    });
  }, [needOlder, loadHistory, extendTo, entryReadMs, myUid]);
  // 화면은 처음 한 번만 이 자리로 옮긴다 (그 뒤에는 줄만 그린다)
  const anchorReady = loaded && readsLoaded && !needOlder;
  const initialAnchor = useMemo(
    () => ({ ready: anchorReady, id: anchorReady && unreadIdx >= 0 ? display[unreadIdx]?.id ?? null : null }),
    [anchorReady, unreadIdx, display],
  );

  // ── 읽음 표시 ─────────────────────────────────────────
  useEffect(() => {
    const on = () => setActive(pageActive());
    document.addEventListener('visibilitychange', on);
    window.addEventListener('focus', on);
    window.addEventListener('blur', on);
    return () => {
      document.removeEventListener('visibilitychange', on);
      window.removeEventListener('focus', on);
      window.removeEventListener('blur', on);
    };
  }, []);

  const unread = unreadOf(state, roomId);
  const myRead = reads[myUid] ?? 0;
  const newestOther = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.senderId !== myUid && !m.pending) return m;
    }
    return null;
  }, [messages, myUid]);
  const unseen = !!newestOther && tsMillis(newestOther.createdAt) > myRead;
  const markedKey = useRef('');
  const enteredRef = useRef(false);

  useEffect(() => {
    // 처음 읽은 시각(여기까지 읽었습니다)을 받은 뒤에만
    if (!ready || !active || !readsLoaded) return;
    const first = !enteredRef.current;
    const needed = first || ((unread > 0 || unseen) && nearBottom);
    if (!needed) return;
    // 같은 상태로는 한 번만 (서버 시각이 올 때까지 되풀이하지 않게)
    const key = `${newestOther?.id ?? ''}|${unread}`;
    if (!first && key === markedKey.current) return;
    const t = setTimeout(() => {
      enteredRef.current = true;
      markedKey.current = key;
      markChatRoomRead(db, roomId, myUid).catch((e) => logger.warn('읽음 표시 실패:', e));
    }, 800);
    return () => clearTimeout(t);
  }, [ready, active, unread, unseen, readsLoaded, nearBottom, newestOther, roomId, myUid]);

  // ── 보내기 ───────────────────────────────────────────
  const onCompose = useCallback((patch: Partial<ChatComposeState>) => setCompose((c) => ({ ...c, ...patch })), []);

  const onStartEdit = useCallback((m: ChatMessageView) => {
    setCompose((c) => ({ ...c, editing: m, reply: null }));
    setText(String(m.text ?? ''));
  }, []);
  const onCancelEdit = useCallback(() => {
    setCompose((c) => ({ ...c, editing: null }));
    onTextChange('');
  }, [onTextChange]);

  const extraFor = useCallback((clean: string): ChatSendExtra => {
    const ex: ChatSendExtra = { replyTo: compose.reply ? chatReplyRefOf(compose.reply) : null, silent: compose.silent };
    if (room && room.type !== 'dm' && clean.includes('@')) Object.assign(ex, extractMentions(clean, room, myUid));
    return ex;
  }, [compose.reply, compose.silent, room, myUid]);

  const onSend = useCallback(() => {
    const clean = cleanChatText(text);
    if (compose.editing) {
      const m = compose.editing;
      setCompose((c) => ({ ...c, editing: null }));
      onTextChange('');
      if (!clean || clean === String(m.text ?? '')) return;
      editChatMessage(db, roomId, m.id, clean).catch((e) => {
        logger.warn('메시지 수정 실패:', e);
        toast.error(e instanceof FirebaseError && e.code === 'permission-denied' ? L('chat.editExpired') : L('chat.webActionFailed'));
      });
      return;
    }
    const files = tray.items.length ? tray.take() : [];
    const extra = extraFor(clean);
    if (files.length) {
      queueChatMedia({ roomId, uid: myUid, senderName: myName, files, original: tray.original, text: clean, extra });
    } else if (clean) {
      sendChatText({ roomId, uid: myUid, senderName: myName, text: clean, extra });
    } else {
      return;
    }
    setCompose((c) => ({ ...c, reply: null }));
    onTextChange('');
  }, [text, tray, roomId, myUid, myName, onTextChange, compose.editing, extraFor]);

  const onSendVoice = useCallback((blob: Blob, durationMs: number) => {
    queueChatVoice({ roomId, uid: myUid, senderName: myName, blob, durationMs, extra: { replyTo: compose.reply ? chatReplyRefOf(compose.reply) : null, silent: compose.silent } });
    setCompose((c) => ({ ...c, reply: null }));
  }, [roomId, myUid, myName, compose.reply, compose.silent]);

  const onCreatePoll = useCallback(async (poll: ChatPoll, closesAt: Date | null) => {
    const p: ChatPoll = closesAt ? { ...poll, closesAt: Timestamp.fromDate(closesAt) } : poll;
    // 보내기는 기다리지 않는다 (Firestore 가 바로 '보내는 중'으로 보여 준다)
    sendChatMessage(db, roomId, { kind: 'poll', poll: p, senderId: myUid, senderName: myName, clientId: newChatClientId(), silent: compose.silent || undefined })
      .catch((e) => {
        logger.warn('투표 보내기 실패:', e);
        toast.error(L('chat.sendFailed'));
      });
  }, [roomId, myUid, myName, compose.silent]);

  const onVote = useCallback(async (m: ChatMessageView, ids: string[]) => {
    try {
      await voteChatPoll(db, roomId, m.id, myUid, ids);
    } catch (e) {
      logger.warn('투표 실패:', e);
      toast.error(L('chat.webActionFailed'));
    }
  }, [roomId, myUid]);

  const onClosePoll = useCallback((m: ChatMessageView) => {
    closeChatPoll(db, roomId, m.id).catch(() => toast.error(L('chat.webActionFailed')));
  }, [roomId]);

  const onReact = useCallback((m: ChatMessageView, key: ChatReactionKey | null) => {
    setChatReaction(db, roomId, m.id, myUid, key).catch((e) => {
      logger.warn('공감 실패:', e);
      toast.error(L('chat.webActionFailed'));
    });
  }, [roomId, myUid]);

  const onDiscard = useCallback((clientId: string) => {
    const restored = discardChatOutgoing(clientId);
    if (restored && !text) onTextChange(restored);
  }, [text, onTextChange]);

  const onDelete = useCallback(async (m: ChatMessageView) => {
    try {
      await deleteChatMessage(db, roomId, m.id);
    } catch (e) {
      logger.warn('채팅 메시지 삭제 실패:', e);
      toast.error(L('chat.webActionFailed'));
    }
  }, [roomId]);

  const onReport = useCallback(async (m: ChatMessageView, reason: ChatReportReason, detail: string) => {
    try {
      await reportChatMessage(db, { roomId, message: m, reporterId: myUid, reason, detail });
      toast.success(L('chat.reportDone'));
    } catch (e) {
      // 같은 메시지를 다시 신고하면 규칙이 막는다 (신고 문서는 한 번만 만들 수 있다)
      if (e instanceof FirebaseError && e.code === 'permission-denied') toast(L('chat.webAlreadyReported'));
      else {
        logger.warn('채팅 신고 실패:', e);
        toast.error(L('chat.webActionFailed'));
      }
    }
  }, [roomId, myUid]);

  const onBlock = useCallback(async (uid: string, blocked: boolean) => {
    try {
      await setChatUserBlocked(db, myUid, uid, blocked);
      toast.success(blocked ? L('chat.blockedDone') : L('chat.unblockedDone'));
    } catch (e) {
      logger.warn('차단 변경 실패:', e);
      toast.error(L('chat.webActionFailed'));
    }
  }, [myUid]);

  const muted = isRoomMuted(state, roomId);
  const onToggleMute = useCallback(() => {
    setChatRoomMuted(db, myUid, roomId, !muted).catch((e) => {
      logger.warn('알림 끄기 변경 실패:', e);
      toast.error(L('chat.webActionFailed'));
    });
  }, [myUid, roomId, muted]);

  const onEnablePush = useCallback(async () => {
    const r = await enableWebPush(myUid);
    setPushStatus(webPushPermission());
    if (r === 'granted') toast.success(L('chat.pushEnabled'));
    else if (r === 'denied') toast(L('chat.pushDenied'), { duration: 6000 });
    else if (r === 'error') toast.error(L('chat.webActionFailed'));
  }, [myUid]);

  // ── 공지 ─────────────────────────────────────────────
  const notice = useMemo(() => ({
    acks,
    onSet: (m: ChatMessageView) => {
      authenticatedPost('/api/chat/notice', { roomId, messageId: m.id }).catch((e) => toast.error(errorText(e)));
    },
    onClear: () => {
      authenticatedPost('/api/chat/notice', { roomId, messageId: null }).catch((e) => toast.error(errorText(e)));
    },
    onAck: () => {
      if (!noticeId) return;
      ackChatNotice(db, roomId, noticeId, myUid).catch(() => toast.error(L('chat.webActionFailed')));
    },
  }), [acks, roomId, noticeId, myUid]);

  // ── 예약 메시지 ───────────────────────────────────────
  const onSchedule = useCallback(async (t: string, at: Date) => {
    const clean = cleanChatText(t);
    if (!clean || !room) return;
    const m = room.type !== 'dm' ? extractMentions(clean, room, myUid) : { mentions: [], mentionAll: false };
    try {
      await scheduleChatMessage(db, { roomId, senderId: myUid, senderName: myName, text: clean, sendAt: at, mentions: m.mentions, mentionAll: m.mentionAll, silent: compose.silent || undefined });
      toast.success(L('chat.scheduleSet', { at: shortDateTime(at, lang) }));
    } catch (e) {
      logger.warn('예약 메시지 실패:', e);
      toast.error(L('chat.webActionFailed'));
      throw e;
    }
  }, [room, roomId, myUid, myName, compose.silent, lang]);

  const onCancelScheduled = useCallback(async (id: string) => {
    try {
      await cancelScheduledChatMessage(db, id);
    } catch {
      toast.error(L('chat.webActionFailed'));
    }
  }, []);

  // ── 대화 내보내기 · 모아보기 ───────────────────────────
  const onExport = useCallback(async (includeLinks: boolean, onProgress: (n: number) => void) => {
    if (!room) return;
    try {
      const all = history ?? (await loadAllChatMessages(db, roomId, { onProgress }));
      const txt = chatExportText(room, mergeChatMessages(all, messages), { lang, myUid, includeMediaLinks: includeLinks });
      saveTextFile(chatExportFileName(room, lang, myUid), txt);
      toast.success(L('chat.exportDone'));
    } catch (e) {
      logger.warn('대화 내보내기 실패:', e);
      toast.error(L('chat.webActionFailed'));
    }
  }, [room, history, roomId, messages, lang, myUid]);

  const loadGalleryPage = useCallback(async (cursor: unknown): Promise<ChatGalleryPage> => {
    const r = await loadChatMediaPage(db, roomId, { before: (cursor as DocumentSnapshot<DocumentData> | null) ?? null, pageSize: 60 });
    return { messages: r.messages, hasMore: r.hasMore, cursor: r.oldest };
  }, [roomId]);

  // ── 통화 (개발·미리보기에서만) ───────────────────────────
  const callCtx = useChatCall();
  useEffect(() => {
    if (room) setCallRoomMembers(roomId, room.memberInfo);
  }, [roomId, room]);
  const callAdapter = callCtx.adapter;
  const callState = callCtx.state;
  const call = useMemo<ChatRoomCallProps | undefined>(() => {
    if (!callCtx.enabled || !callAdapter || !room) return undefined;
    const direct = room.type === 'dm';
    const peerUid = direct ? dmPeerOf(room, myUid) : (room.memberIds ?? []).find((u) => u !== myUid);
    const info = peerUid ? room.memberInfo?.[peerUid] : undefined;
    const peer = peerUid ? { uid: peerUid, name: info?.name ?? L('chat.unknownUser'), photo: info?.photo } : undefined;
    return {
      state: callState,
      mock: !!callState.mock || !!callAdapter.simulateIncoming,
      onStart: (media: ChatCallMedia) => {
        if (isCallActive(callAdapter.getState())) {
          toast(L('chat.callAlreadyInCall'));
          return;
        }
        void callAdapter.start({ roomId, media, direct, peer: direct ? peer : undefined });
      },
      onJoin: (callId: string, media: ChatCallMedia) => {
        if (isCallActive(callAdapter.getState())) {
          toast(L('chat.callAlreadyInCall'));
          return;
        }
        void callAdapter.join({ roomId, callId, media });
      },
      onReturn: () => callAdapter.setMinimized(false),
      onSimulateIncoming: callAdapter.simulateIncoming && peer
        ? () => {
          if (isCallActive(callAdapter.getState())) {
            toast(L('chat.callAlreadyInCall'));
            return;
          }
          callAdapter.simulateIncoming!(peer, 'video', roomId);
        }
        : undefined,
    };
  }, [callCtx.enabled, callAdapter, callState, room, roomId, myUid]);

  // ── 고정 · 숨기기 ────────────────────────────────────
  const preset = !!room && isPresetRoom(room) && chatRoomGeneration(room) === currentGeneration;
  const pinned = !!state?.pinned?.[roomId];
  const pin = useMemo(() => ({
    preset,
    pinned,
    onToggle: () => {
      setChatRoomPinned(db, myUid, roomId, !pinned).catch(() => toast.error(L('chat.webActionFailed')));
    },
    onHide: () => {
      setChatRoomHidden(db, myUid, roomId, true)
        .then(() => toast(L('chat.hideHint')))
        .catch(() => toast.error(L('chat.webActionFailed')));
      onBack();
    },
  }), [preset, pinned, myUid, roomId, onBack]);

  const shell = 'fixed top-0 left-0 right-0 bottom-0 z-[60] md:static md:z-auto md:flex-1 md:min-w-0 flex flex-col bg-[#e8eef5]';

  if (status !== 'ready' || !room) {
    return (
      <div className={shell} style={box}>
        <div className="md:hidden flex items-center h-14 px-2 bg-white border-b border-gray-200 shrink-0">
          <button type="button" onClick={onBack} className="h-10 w-10 rounded-full text-gray-700 hover:bg-gray-100 flex items-center justify-center" aria-label={L('common.back')}>
            <FiChevronLeft size={24} />
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          {status === 'loading' ? (
            <div className="w-7 h-7 border-2 border-white border-t-blue-500 rounded-full animate-spin" aria-label={L('chat.loading')} />
          ) : (
            <p className="text-sm text-gray-600">{L('chat.notInRoom')}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={shell} style={box}>
      <ChatRoomView
        room={room}
        myUid={myUid}
        lang={lang}
        messages={display}
        loaded={loaded}
        outgoing={outgoing}
        reads={reads}
        state={state}
        hasMore={displayHasMore}
        loadingOlder={history ? false : loadingOlder}
        onLoadOlder={loadOlderDisplay}
        onBack={onBack}
        tray={tray}
        text={text}
        onTextChange={onTextChange}
        onSend={onSend}
        onRetry={retryChatOutgoing}
        onDiscard={onDiscard}
        onDelete={onDelete}
        onReport={onReport}
        onBlock={onBlock}
        onToggleMute={onToggleMute}
        onStartDm={onStartDm}
        onBottomChange={setNearBottom}
        push={{ status: pushStatus, onEnable: () => void onEnablePush() }}
        search={search}
        compose={compose}
        onCompose={onCompose}
        onStartEdit={onStartEdit}
        onCancelEdit={onCancelEdit}
        onReact={onReact}
        onVote={onVote}
        onClosePoll={onClosePoll}
        onCreatePoll={onCreatePoll}
        onSendVoice={onSendVoice}
        notice={notice}
        scheduled={scheduled}
        onSchedule={onSchedule}
        onCancelScheduled={onCancelScheduled}
        onExport={onExport}
        loadGalleryPage={loadGalleryPage}
        pin={pin}
        entryReadMs={entryReadMs}
        initialAnchor={initialAnchor}
        call={call}
      />
    </div>
  );
}
