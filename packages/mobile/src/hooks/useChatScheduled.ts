/**
 * 내 예약 메시지 중 이 방의 것 (보낼 시각 순)
 */
import { useEffect, useState } from 'react';
import { logger, subscribeMyScheduledChatMessages, type ChatScheduledMessage } from '@smis-mentor/shared';
import { db } from '../config/firebase';

export function useChatScheduled(uid: string, roomId: string, enabled: boolean): ChatScheduledMessage[] {
  const [list, setList] = useState<ChatScheduledMessage[]>([]);
  useEffect(() => {
    setList([]);
    if (!enabled || !uid) return;
    return subscribeMyScheduledChatMessages(
      db,
      uid,
      (all) => setList(all.filter((m) => m.roomId === roomId)),
      (e) => logger.warn('예약 메시지 구독 실패:', e),
    );
  }, [uid, roomId, enabled]);
  return list;
}
