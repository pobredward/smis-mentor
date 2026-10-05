/**
 * 채팅 예약 메시지 보내기 · 멈춘 통화 정리 — 1분마다 (서울 리전)
 *
 * 통화(chatCalls): 앱이 갑자기 꺼져 '나가기'를 못 보낸 사람을 빼고(소식 없는 지 STALE_MS), 아무도 없으면 끝낸다.
 * 벨이 너무 오래 울린 1:1 은 응답 없음으로. 규칙은 web lib/chatCallServer.ts staleCheck 와 같게.
 *
 * chatScheduled/{id} 중 보낼 시각이 된 것을 그 방에 메시지로 쓰고 예약을 지운다.
 * 보내는 사람이 그 방에서 빠졌으면 보내지 않고 지운다. 같은 예약을 두 번 보내지 않게 트랜잭션으로 지우며 쓴다.
 * 쓰인 메시지는 chatOnMessageCreated 가 방 미리보기 · 안 읽은 수 · 푸시를 처리한다.
 *
 * 투표 마감 알림(chatPollReminders/{방__메시지}) — 알림 시각이 된 것을 지우고(트랜잭션 — 한 번만)
 * 아직 투표하지 않은 사람에게 푸시 (chat.ts sendPollReminder).
 */
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { POLL_REMINDERS, sendPollReminder } from './chat';
import { RUNTIME_SA } from './runtime';

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
  { schedule: 'every 1 minutes', region: 'asia-northeast3', serviceAccount: RUNTIME_SA, timeZone: 'Asia/Seoul', memory: '256MiB', timeoutSeconds: 60, retryCount: 0 },
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
    await sendPollReminders(db).catch((e) => console.error('투표 마감 알림 실패', e));
    await sweepCalls(db).catch((e) => console.error('통화 정리 실패', e));
  },
);

// ── 투표 마감 알림 ─────────────────────────────────────────────────
async function sendPollReminders(db: admin.firestore.Firestore): Promise<void> {
  const due = await db.collection(POLL_REMINDERS)
    .where('at', '<=', admin.firestore.Timestamp.now())
    .orderBy('at')
    .limit(50)
    .get();
  for (const d of due.docs) {
    try {
      // 먼저 지우고(한 번만) 보낸다 — 같은 알림이 두 번 가지 않게
      const claimed = await db.runTransaction(async (tx) => {
        const cur = await tx.get(d.ref);
        if (!cur.exists) return null;
        tx.delete(d.ref);
        return cur.data() as { roomId?: string; messageId?: string };
      });
      if (!claimed?.roomId || !claimed.messageId) continue;
      await sendPollReminder(claimed.roomId, claimed.messageId);
    } catch (e) {
      console.error('투표 마감 알림 보내기 실패', d.id, e);
    }
  }
}

// ── 멈춘 통화 정리 (shared CHAT_CALL_LIMITS 와 같은 값) ─────────────────
const RING_MS = 40_000;
const STALE_MS = 100_000;

interface CallDoc {
  roomId: string;
  direct: boolean;
  media: string;
  status: 'ringing' | 'active' | 'ended';
  startedBy: string;
  startedByName: string;
  participantIds: string[];
  lastSeen?: Record<string, number>;
  createdAt: number;
  connectedAt?: number;
}

function staleCheck(c: CallDoc, now: number): { participantIds: string[]; end: string | null } {
  const seen = c.lastSeen ?? {};
  const participantIds = (c.participantIds ?? []).filter((u) => now - Number(seen[u] ?? c.createdAt) < STALE_MS);
  if (c.status === 'ringing' && now - c.createdAt > RING_MS + 15_000) return { participantIds, end: 'missed' };
  if (c.status === 'ringing' && !participantIds.includes(c.startedBy)) return { participantIds, end: 'canceled' };
  if (c.status === 'active' && (participantIds.length === 0 || (c.direct && participantIds.length < 2 && now - (c.connectedAt ?? now) > 15_000))) {
    return { participantIds, end: 'ended' };
  }
  return { participantIds, end: null };
}

async function sweepCalls(db: admin.firestore.Firestore): Promise<void> {
  const snap = await db.collection('chatCalls').where('status', 'in', ['ringing', 'active']).limit(200).get();
  const now = Date.now();
  for (const d of snap.docs) {
    try {
      const ended = await db.runTransaction(async (tx) => {
        const cur = await tx.get(d.ref);
        const c = cur.data() as CallDoc | undefined;
        if (!c || c.status === 'ended') return null;
        const roomRef = db.collection('chatRooms').doc(c.roomId);
        const room = await tx.get(roomRef);
        const isActive = room.data()?.activeCall?.callId === d.id;
        const st = staleCheck(c, now);
        if (st.end) {
          const durationMs = c.status === 'active' && c.connectedAt ? Math.max(0, now - c.connectedAt) : 0;
          tx.update(d.ref, { status: 'ended', endedAt: now, endedReason: st.end, durationMs, participantIds: [] });
          if (isActive) tx.update(roomRef, { activeCall: null });
          return { c, reason: st.end, durationMs };
        }
        if (st.participantIds.length !== (c.participantIds ?? []).length) {
          tx.update(d.ref, { participantIds: st.participantIds });
          if (isActive) tx.update(roomRef, { 'activeCall.participantIds': st.participantIds });
        }
        return null;
      });
      if (!ended) continue;
      const { c, reason, durationMs } = ended;
      const status = !c.direct ? 'ended' : reason === 'ended' ? (durationMs ? 'ended' : 'canceled') : reason;
      const call: Record<string, unknown> = { callId: d.id, media: c.media, status };
      if (status === 'ended' && durationMs) call.durationMs = durationMs;
      await db.collection('chatRooms').doc(c.roomId).collection('messages').doc(`call_${d.id}_${status}`).set({
        senderId: c.startedBy,
        senderName: c.startedByName,
        kind: 'system',
        systemType: 'call',
        call,
        text: '',
        media: [],
        clientId: `call-${d.id}-${status}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('통화 정리 실패', d.id, e);
    }
  }
}
