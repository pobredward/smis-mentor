/**
 * 채팅 예약 메시지 보내기 — 1분마다 (서울 리전)
 *
 * chatScheduled/{id} 중 보낼 시각이 된 것을 그 방에 메시지로 쓰고 예약을 지운다.
 * 보내는 사람이 그 방에서 빠졌으면 보내지 않고 지운다. 같은 예약을 두 번 보내지 않게 트랜잭션으로 지우며 쓴다.
 * 쓰인 메시지는 chatOnMessageCreated 가 방 미리보기 · 안 읽은 수 · 푸시를 처리한다.
 */
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';

interface ScheduledDoc {
  roomId?: string;
  senderId?: string;
  senderName?: string;
  text?: string;
  mentions?: string[];
  mentionAll?: boolean;
  silent?: boolean;
}

export const chatSendScheduled = onSchedule(
  { schedule: 'every 1 minutes', region: 'asia-northeast3', timeZone: 'Asia/Seoul', memory: '256MiB', timeoutSeconds: 60, retryCount: 0 },
  async () => {
    const db = admin.firestore();
    const due = await db.collection('chatScheduled')
      .where('sendAt', '<=', admin.firestore.Timestamp.now())
      .orderBy('sendAt')
      .limit(200)
      .get();
    for (const d of due.docs) {
      try {
        await db.runTransaction(async (tx) => {
          const cur = await tx.get(d.ref);
          if (!cur.exists) return; // 취소됐거나 이미 보냄
          const x = cur.data() as ScheduledDoc;
          const roomRef = db.collection('chatRooms').doc(String(x.roomId ?? '-'));
          const room = await tx.get(roomRef);
          tx.delete(d.ref);
          const members: string[] = room.data()?.memberIds ?? [];
          if (!room.exists || !x.senderId || !members.includes(x.senderId) || !String(x.text ?? '').trim()) return;
          const msg: Record<string, unknown> = {
            senderId: x.senderId,
            senderName: String(x.senderName ?? '').slice(0, 60),
            kind: 'text',
            text: String(x.text ?? '').slice(0, 5000),
            media: [],
            clientId: `sched-${d.id}`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            scheduled: true,
          };
          if (x.mentions?.length) msg.mentions = x.mentions.slice(0, 100);
          if (x.mentionAll) msg.mentionAll = true;
          if (x.silent) msg.silent = true;
          tx.set(roomRef.collection('messages').doc(), msg);
        });
      } catch (e) {
        console.error('예약 메시지 보내기 실패', d.id, e);
      }
    }
  },
);
