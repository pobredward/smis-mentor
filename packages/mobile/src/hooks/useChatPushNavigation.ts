/**
 * 채팅 알림을 눌렀을 때 — 예약된 방(chatPresence.queueChatRoomOpen)을 채팅 탭 → 대화방 순서로 연다.
 * 앱이 꺼져 있다가 알림으로 켜진 경우에도 로그인·화면이 준비된 뒤(MainTabs) 열린다.
 */
import { useEffect } from 'react';
import { logger } from '@smis-mentor/shared';
import { navigationRef } from '../context/AuthContext';
import { onChatRoomQueued, takeQueuedChatRoom } from '../services/chatPresence';

/**
 * @param enabled 채팅을 쓸 수 있는 계정
 * @param hasChatTab 채팅 탭이 보이는가 (보이면 탭을 먼저 연 뒤 방으로 — 뒤로 가면 채팅 목록)
 */
export function useChatPushNavigation(enabled: boolean, hasChatTab: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const navTimers: Array<ReturnType<typeof setTimeout>> = [];
    const drain = () => {
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      if (!navigationRef.isReady()) {
        retryTimer = setTimeout(drain, 300);
        return;
      }
      const roomId = takeQueuedChatRoom();
      if (!roomId) return;
      if (hasChatTab) {
        try {
          navigationRef.navigate('MainTabs', { screen: 'Chat' });
        } catch (e) {
          logger.warn('채팅 탭 이동 실패:', e);
        }
      }
      navTimers.push(setTimeout(() => {
        try {
          navigationRef.navigate('ChatRoom', { roomId });
        } catch (e) {
          logger.warn('채팅방 이동 실패:', e);
        }
      }, hasChatTab ? 80 : 0));
    };
    drain();
    const off = onChatRoomQueued(drain);
    return () => {
      off();
      if (retryTimer) clearTimeout(retryTimer);
      navTimers.forEach(clearTimeout);
    };
  }, [enabled, hasChatTab]);
}
