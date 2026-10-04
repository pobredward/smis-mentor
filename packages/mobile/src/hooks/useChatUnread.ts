/**
 * 채팅 — 내 방 목록 · 내 채팅 상태(안 읽은 수 · 알림 끈 방 · 차단) 구독을 앱에 한 벌만 둔다.
 *
 * MainTabs 가 useChatUnread() 로 구독을 시작하고(탭 배지 · 앱 아이콘 배지),
 * 채팅 목록·대화방 화면은 useChatStore() 로 같은 값을 읽는다 (Firestore 리스너를 또 만들지 않음).
 */
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  logger,
  subscribeChatUserState,
  subscribeMyChatRooms,
  totalUnread,
  type ChatRoom,
  type ChatUserState,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';

export interface ChatStoreSnapshot {
  /** 구독 중인 사용자 (구독 전이면 null) */
  uid: string | null;
  rooms: ChatRoom[];
  state: ChatUserState;
  /** 방 목록을 한 번이라도 받았는가 */
  roomsReady: boolean;
  error: Error | null;
}

const EMPTY: ChatStoreSnapshot = { uid: null, rooms: [], state: {}, roomsReady: false, error: null };
let snapshot: ChatStoreSnapshot = EMPTY;
const listeners = new Set<() => void>();

function emit(patch: Partial<ChatStoreSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}
function subscribeStore(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const getSnapshot = () => snapshot;

/** 채팅 방 목록 · 상태 (읽기 전용) */
export function useChatStore(): ChatStoreSnapshot {
  return useSyncExternalStore(subscribeStore, getSnapshot, getSnapshot);
}

/**
 * 구독 시작 + 안 읽은 수 합계. 앱이 켜져 있는 동안 합계가 바뀌면 앱 아이콘 배지도 맞춘다.
 * @param enabled 채팅을 쓸 수 있는 계정일 때만
 */
export function useChatUnread(uid: string | null | undefined, enabled: boolean): number {
  useEffect(() => {
    if (!uid || !enabled) {
      emit(EMPTY);
      return;
    }
    emit({ ...EMPTY, uid });
    const offRooms = subscribeMyChatRooms(
      db,
      uid,
      (rooms) => emit({ rooms, roomsReady: true, error: null }),
      (e) => {
        logger.warn('채팅방 목록 구독 실패:', e);
        emit({ roomsReady: true, error: e });
      },
    );
    const offState = subscribeChatUserState(
      db,
      uid,
      (state) => emit({ state }),
      (e) => logger.warn('채팅 상태 구독 실패:', e),
    );
    return () => {
      offRooms();
      offState();
      emit(EMPTY);
    };
  }, [uid, enabled]);

  const snap = useChatStore();
  const total = snap.uid && snap.uid === uid ? totalUnread(snap.state, snap.rooms) : 0;
  const ready = enabled && snap.roomsReady;

  // 앱 아이콘 배지 — 앱이 활성일 때 합계가 바뀌거나, 앱으로 돌아왔을 때
  useEffect(() => {
    if (!ready) return;
    const apply = () => {
      if (AppState.currentState !== 'active') return;
      Notifications.setBadgeCountAsync(total).catch(() => {});
    };
    apply();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') apply();
    });
    return () => sub.remove();
  }, [total, ready]);

  return total;
}
