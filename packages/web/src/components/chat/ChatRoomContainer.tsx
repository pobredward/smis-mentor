'use client';

/**
 * 대화방 — 데이터 구독 · 보내기 · 읽음 표시를 ChatRoomView 에 연결한다.
 *
 * 읽음 표시(markChatRoomRead): 이 방이 보이고(탭 보임 + 창 포커스) 맨 아래 근처일 때,
 * 내가 아직 안 읽은 메시지가 있거나 unreadOf > 0 이면 — 0.8초 묶어서. 방에 들어올 때 1번.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import toast from 'react-hot-toast';
import { FirebaseError } from 'firebase/app';
import { FiChevronLeft } from 'react-icons/fi';
import {
  L,
  cleanChatText,
  deleteChatMessage,
  getCurrentLocale,
  isRoomMuted,
  logger,
  markChatRoomRead,
  reportChatMessage,
  setChatRoomMuted,
  setChatUserBlocked,
  unreadOf,
  type ChatMessageView,
  type ChatReportReason,
  type ChatUserState,
} from '@smis-mentor/shared';
import { db } from '@/lib/firebase';
import { enableWebPush, webPushPermission } from '@/lib/webPush';
import { setViewingChatRoom } from '@/hooks/useChatUnread';
import ChatRoomView, { type ChatPushStatus } from './ChatRoomView';
import { discardChatOutgoing, queueChatMedia, retryChatOutgoing, sendChatText, settleChatOutbox, useChatOutbox } from './chatOutbox';
import { useChatMessages, useChatReads, useChatRoom } from './useChatRoomData';
import { useChatTray } from './useChatTray';
import { tsMillis } from './chatUi';

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

export interface ChatRoomContainerProps {
  roomId: string;
  myUid: string;
  myName: string;
  state: ChatUserState | null;
  onBack: () => void;
  onStartDm: (uid: string) => Promise<void>;
}

export default function ChatRoomContainer({ roomId, myUid, myName, state, onBack, onStartDm }: ChatRoomContainerProps) {
  const lang = getCurrentLocale();
  const { room, status } = useChatRoom(roomId, myUid);
  const ready = status === 'ready';
  const { messages, loaded, hasMore, loadingOlder, loadOlder } = useChatMessages(roomId, ready);
  const { reads, loaded: readsLoaded } = useChatReads(roomId, ready);
  const outgoing = useChatOutbox(roomId);
  const tray = useChatTray();
  const [text, setText] = useState(() => drafts.get(roomId) ?? '');
  const [nearBottom, setNearBottom] = useState(true);
  const [active, setActive] = useState(pageActive);
  const [pushStatus, setPushStatus] = useState<ChatPushStatus>(() => (typeof window === 'undefined' ? 'unsupported' : webPushPermission()));
  const box = useNarrowViewportBox();

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
    if (!ready || !active) return;
    const first = !enteredRef.current;
    const needed = first || ((unread > 0 || (readsLoaded && unseen)) && nearBottom);
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
  const onSend = useCallback(() => {
    const clean = cleanChatText(text);
    const files = tray.items.length ? tray.take() : [];
    if (files.length) {
      queueChatMedia({ roomId, uid: myUid, senderName: myName, files, original: tray.original, text: clean });
    } else if (clean) {
      sendChatText({ roomId, uid: myUid, senderName: myName, text: clean });
    } else {
      return;
    }
    onTextChange('');
  }, [text, tray, roomId, myUid, myName, onTextChange]);

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
        messages={messages}
        loaded={loaded}
        outgoing={outgoing}
        reads={reads}
        state={state}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
        onLoadOlder={loadOlder}
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
      />
    </div>
  );
}
