'use client';

/**
 * 채팅 받은 편지함 (web) — 내 채팅방 목록 · 내 채팅 상태(안 읽은 수) 를 앱 전체에서 한 번만 구독한다.
 * 머리글·하단 탭의 빨간 배지와 /chat 목록이 같은 구독을 나눠 쓴다 (화면마다 따로 구독하지 않게).
 * 창이 앞에 있을 때 온 푸시도 여기서 한 번만 받아 작은 알림으로 띄운다 (지금 보고 있는 방이면 띄우지 않음).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import {
  isChatStaff,
  logger,
  subscribeChatUserState,
  subscribeMyChatRooms,
  totalUnread,
  type ChatRoom,
  type ChatUserLike,
  type ChatUserState,
} from '@smis-mentor/shared';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { listenForegroundPush, refreshWebPushToken, type ForegroundPush } from '@/lib/webPush';
import { showChatPushToast } from '@/components/chat/ChatPushToast';

export interface ChatInbox {
  uid: string | null;
  rooms: ChatRoom[];
  state: ChatUserState | null;
  /** 방 목록을 한 번이라도 받았는가 (오류가 나도 true) */
  ready: boolean;
  /** 방 목록 구독 오류 (규칙 거절 등) — 목록이 비어 있으면 '불러오지 못함'으로 보인다 */
  error: boolean;
  /** 안 읽은 수 합 (지금 들어가 있는 방만) */
  total: number;
}

const EMPTY: ChatInbox = { uid: null, rooms: [], state: null, ready: false, error: false, total: 0 };

let snapshot: ChatInbox = EMPTY;
const listeners = new Set<() => void>();
let active: { uid: string; stop: () => void } | null = null;
let consumers = 0;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let viewingRoomId: string | null = null;
let navigate: ((href: string) => void) | null = null;
const seenPush: string[] = [];

function emit(next: Partial<ChatInbox>) {
  const merged = { ...snapshot, ...next };
  snapshot = { ...merged, total: totalUnread(merged.state, merged.rooms) };
  listeners.forEach((l) => l());
}

function onForegroundPush(p: ForegroundPush) {
  const roomId = p.data?.roomId;
  if (p.data?.type !== 'chat' || !roomId) return;
  // 같은 메시지는 한 번만
  const key = p.data.messageId || p.messageId || `${roomId}:${p.body}`;
  if (seenPush.includes(key)) return;
  seenPush.push(key);
  if (seenPush.length > 200) seenPush.shift();
  if (viewingRoomId === roomId && document.visibilityState === 'visible') return;
  showChatPushToast({
    id: key,
    title: p.title,
    body: p.body,
    onOpen: () => {
      const href = `/chat?room=${encodeURIComponent(roomId)}`;
      if (navigate) navigate(href);
      else window.location.assign(href);
    },
  });
}

function stop() {
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = null;
  active?.stop();
  active = null;
  if (snapshot !== EMPTY) {
    snapshot = EMPTY;
    listeners.forEach((l) => l());
  }
}

function start(uid: string) {
  // 같은 사람이면 그대로 — 다만 목록 구독이 오류로 끝났으면 다시 시도한다 (페이지를 옮겨 다시 붙잡을 때)
  if (active?.uid === uid && !snapshot.error) return;
  stop();
  emit({ ...EMPTY, uid });
  const offRooms = subscribeMyChatRooms(
    db,
    uid,
    (rooms) => emit({ rooms, ready: true, error: false }),
    (e) => {
      // 규칙이 아직 배포되지 않았을 때 등 — 빈 목록 대신 '불러오지 못함'을 보인다
      console.error('채팅방 목록을 불러오지 못했습니다:', e);
      emit({ ready: true, error: true });
    },
  );
  const offState = subscribeChatUserState(db, uid, (state) => emit({ state }), (e) => logger.warn('채팅 상태 구독 오류:', e));
  const offPush = listenForegroundPush(onForegroundPush);
  // 이미 알림을 허용한 브라우저면 조용히 토큰 확인 (하루 한 번 lastUsed)
  void refreshWebPushToken(uid);
  active = { uid, stop: () => { offRooms(); offState(); offPush(); } };
}

function retain(uid: string) {
  consumers += 1;
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  start(uid);
}

function release() {
  consumers = Math.max(0, consumers - 1);
  // 페이지를 옮길 때(머리글이 다시 그려질 때) 끊었다 다시 잇지 않도록 잠깐 기다린다
  if (!consumers && !stopTimer) stopTimer = setTimeout(stop, 15_000);
}

if (typeof window !== 'undefined') {
  window.addEventListener('user-logout', () => stop());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const getSnapshot = () => snapshot;
const getServerSnapshot = () => EMPTY;

/** 받은 편지함에 있는 방 하나 (통화 — 걸려 온 통화의 이름·사진) */
export function chatInboxRoom(roomId: string) {
  return snapshot.rooms.find((r) => r.id === roomId) ?? null;
}

/** 지금 보고 있는 방 (그 방 푸시는 작은 알림을 띄우지 않는다) */
export function setViewingChatRoom(roomId: string | null) {
  viewingRoomId = roomId;
}

/** 구독 붙잡기 — 채팅을 쓸 수 있는 계정(isChatStaff)일 때만 */
function useInboxRetain(): { enabled: boolean; uid: string } {
  const { userData, currentUser } = useAuth();
  const router = useRouter();
  const uid = currentUser?.uid || userData?.userId || '';
  const enabled = !!uid && isChatStaff(userData as unknown as ChatUserLike);

  useEffect(() => {
    if (!enabled) return;
    retain(uid);
    return () => release();
  }, [enabled, uid]);

  useEffect(() => {
    // 채팅 화면에 있으면 주소만 바꾼다 (ChatPage 와 같은 이유 — Next 16.2 router.push 가 처음 연 방으로 되돌아갈 수 있다)
    navigate = (href) => {
      if (window.location.pathname === '/chat') window.history.pushState(null, '', href);
      else router.push(href);
    };
  }, [router]);

  return { enabled, uid };
}

/** 채팅 받은 편지함 (방 목록 · 상태 · 안 읽은 수 합) */
export function useChatInbox(): ChatInbox {
  const { enabled, uid } = useInboxRetain();
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return enabled && snap.uid === uid ? snap : EMPTY;
}

/** 탭 배지용 — 안 읽은 수 합만 (숫자가 바뀔 때만 다시 그린다) */
export function useChatUnreadTotal(): number {
  const { enabled, uid } = useInboxRetain();
  return useSyncExternalStore(
    subscribe,
    () => (enabled && snapshot.uid === uid ? snapshot.total : 0),
    () => 0,
  );
}
