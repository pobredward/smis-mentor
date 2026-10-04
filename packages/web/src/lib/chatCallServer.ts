/**
 * 채팅 통화 서버 (Next.js API 라우트 전용, Admin SDK) — /api/chat/call
 *
 * chatCalls/{callId} 를 여기서만 쓴다 (규칙: 클라이언트 쓰기 금지). Agora 채널 이름 = callId.
 *  - start: 방 사람만. 방에 진행 중인 통화가 있으면 그 통화로 들어간다 (단체 = 참여, 1:1 = 상대가 나에게 걸던 통화를 받음).
 *           단체는 바로 active + '통화 시작' 기록, 1:1 은 ringing + 상대 벨(VoIP · Android 데이터 푸시 · 웹 푸시).
 *  - join: 방 사람만. 1:1 은 받는 사람이 들어오면 active.
 *  - leave: 1:1 은 끝 (받기 전이면 응답 없음/취소, 받는 사람이 받기 전에 나가면 거절), 단체는 마지막 사람이 나가면 끝.
 *  - decline: 1:1 받는 사람만 — 거절 · 통화 중(busy).
 *  - token: Agora 토큰 다시 받기 · ping: 살아 있음 (오래 소식 없는 사람은 빼고, 다 빠지면 끝 — Functions 도 1분마다 정리).
 * 끝나면 방 activeCall 을 지우고 채팅에 기록(system 'call')을 남긴다 → Functions 가 미리보기 · 부재중 푸시.
 */
import { randomUUID } from 'crypto';
import * as admin from 'firebase-admin';
import { RtcRole, RtcTokenBuilder } from 'agora-token';
import {
  CHAT_CALL_LIMITS,
  agoraUidFor,
  type ChatCallDoc,
  type ChatCallEndReason,
  type ChatCallJoin,
  type ChatCallLog,
  type ChatCallMedia,
  type ChatRoom,
} from '@smis-mentor/shared';
import { adminFieldValue, getAdminApp, getAdminFirestore } from './firebase-admin';
import { apnsVoipConfigured, sendVoipPush } from './apnsVoip';

export class ChatCallError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const SITE = (process.env.NEXT_PUBLIC_BASE_URL || 'https://smis-mentor.com').replace(/\/$/, '');
const db = () => getAdminFirestore();
const callsCol = () => db().collection('chatCalls');
const roomsCol = () => db().collection('chatRooms');

/** Agora 키가 있는가 (없으면 통화 기능을 닫아 둔다) */
export function chatCallsConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE);
}

function tokenFor(channel: string, uid: number): { token: string; expiresAt: number } {
  const ttl = CHAT_CALL_LIMITS.tokenTtlSec;
  const token = RtcTokenBuilder.buildTokenWithUid(
    String(process.env.NEXT_PUBLIC_AGORA_APP_ID),
    String(process.env.AGORA_APP_CERTIFICATE),
    channel,
    uid,
    RtcRole.PUBLISHER,
    ttl,
    ttl,
  );
  return { token, expiresAt: Date.now() + ttl * 1000 };
}

const callOf = (snap: FirebaseFirestore.DocumentSnapshot): ChatCallDoc => ({ ...(snap.data() as Omit<ChatCallDoc, 'id'>), id: snap.id });

function joinInfo(call: ChatCallDoc, uid: string): ChatCallJoin {
  const agoraUid = call.agoraUids[uid];
  const t = tokenFor(call.id, agoraUid);
  return { call, appId: String(process.env.NEXT_PUBLIC_AGORA_APP_ID), channel: call.id, token: t.token, uid: agoraUid, expiresAt: t.expiresAt };
}

/** 이 통화에서 쓸 Agora uid — 다른 사람과 겹치면 다른 숫자 */
function pickAgoraUid(call: Pick<ChatCallDoc, 'agoraUids'>, uid: string): number {
  if (call.agoraUids?.[uid]) return call.agoraUids[uid];
  const used = new Set(Object.values(call.agoraUids ?? {}));
  for (let salt = 0; salt < 50; salt += 1) {
    const n = agoraUidFor(uid, salt);
    if (!used.has(n)) return n;
  }
  throw new ChatCallError(500, '통화 번호를 정하지 못했습니다.');
}

async function memberRoom(roomId: string, uid: string): Promise<ChatRoom> {
  const snap = await roomsCol().doc(roomId).get();
  if (!snap.exists) throw new ChatCallError(404, '채팅방을 찾을 수 없습니다.');
  const room = { id: roomId, ...(snap.data() as Omit<ChatRoom, 'id'>) };
  if (!(room.memberIds ?? []).includes(uid)) throw new ChatCallError(403, '이 방의 사람만 통화할 수 있습니다.');
  return room;
}

/** 오래 소식 없는 사람 빼기 · 오래된 벨 끝내기 — 끝내야 하면 이유를 돌려준다 */
function staleCheck(call: ChatCallDoc, now: number): { participantIds: string[]; end: ChatCallEndReason | null } {
  const seen = call.lastSeen ?? {};
  const participantIds = call.participantIds.filter((u) => now - Number(seen[u] ?? call.createdAt) < CHAT_CALL_LIMITS.staleMs);
  if (call.status === 'ringing' && now - call.createdAt > CHAT_CALL_LIMITS.ringMs + 15_000) return { participantIds, end: 'missed' };
  if (call.status === 'ringing' && !participantIds.includes(call.startedBy)) return { participantIds, end: 'canceled' };
  if (call.status === 'active' && (participantIds.length === 0 || (call.direct && participantIds.length < 2 && now - (call.connectedAt ?? now) > 15_000))) {
    return { participantIds, end: 'ended' };
  }
  return { participantIds, end: null };
}

/**
 * 끝내기 (트랜잭션 안) — 통화 문서 · 방 activeCall (그 방의 지금 통화일 때만 — activeCallId 로 확인).
 * clearRoom: false 면 방은 건드리지 않는다 (같은 트랜잭션에서 새 통화를 넣을 때).
 */
function endInTx(tx: FirebaseFirestore.Transaction, call: ChatCallDoc, reason: ChatCallEndReason, now: number, activeCallId: string | null | undefined, clearRoom = true): ChatCallDoc {
  const durationMs = call.status === 'active' && call.connectedAt ? Math.max(0, now - call.connectedAt) : 0;
  tx.update(callsCol().doc(call.id), {
    status: 'ended', endedAt: now, endedReason: reason, durationMs, participantIds: [],
  });
  if (clearRoom && activeCallId === call.id) tx.update(roomsCol().doc(call.roomId), { activeCall: null });
  return { ...call, status: 'ended', endedAt: now, endedReason: reason, durationMs, participantIds: [] };
}

/** 방의 지금 통화 id (트랜잭션 안) */
async function activeCallIdIn(tx: FirebaseFirestore.Transaction, roomId: string): Promise<string | null> {
  const snap = await tx.get(roomsCol().doc(roomId));
  return ((snap.data() as ChatRoom | undefined)?.activeCall?.callId as string | undefined) ?? null;
}

/** 채팅에 통화 기록 남기기 (보낸 사람 = 건 사람) */
async function writeLog(call: ChatCallDoc, status: ChatCallLog['status'], durationMs?: number) {
  const log: ChatCallLog = { callId: call.id, media: call.media, status };
  if (durationMs) log.durationMs = durationMs;
  await roomsCol().doc(call.roomId).collection('messages').doc(`call_${call.id}_${status}`).set({
    senderId: call.startedBy,
    senderName: call.startedByName,
    kind: 'system',
    systemType: 'call',
    call: log,
    text: '',
    media: [],
    clientId: `call-${call.id}-${status}`,
    createdAt: adminFieldValue.serverTimestamp(),
  });
}

/** 끝난 통화의 기록 — 1:1 은 끝난 이유, 단체는 '끝남 · 길이' */
async function logEnded(call: ChatCallDoc) {
  const r = call.endedReason ?? 'ended';
  if (!call.direct) {
    await writeLog(call, 'ended', call.durationMs);
    return;
  }
  const status: ChatCallLog['status'] = r === 'ended' ? (call.durationMs ? 'ended' : 'canceled') : r === 'failed' ? 'missed' : r;
  await writeLog(call, status, status === 'ended' ? call.durationMs : undefined);
}

// ── 시작 · 참여 · 나가기 · 거절 ─────────────────────────────────────

export async function startChatCall(me: { uid: string; name: string }, roomId: string, media: ChatCallMedia): Promise<ChatCallJoin> {
  const room = await memberRoom(roomId, me.uid);
  const direct = room.type === 'dm';
  const peer = direct ? (room.memberIds ?? []).find((u) => u !== me.uid) : undefined;
  if (direct && !peer) throw new ChatCallError(400, '상대가 없습니다.');
  const now = Date.now();
  const myName = room.memberInfo?.[me.uid]?.name || me.name || '?';
  const ref = callsCol().doc();
  const call: ChatCallDoc = {
    id: ref.id,
    uuid: randomUUID(),
    roomId,
    direct,
    media,
    status: direct ? 'ringing' : 'active',
    startedBy: me.uid,
    startedByName: myName,
    invitedIds: direct && peer ? [peer] : [],
    participantIds: [me.uid],
    joinedIds: [me.uid],
    agoraUids: { [me.uid]: agoraUidFor(me.uid) },
    lastSeen: { [me.uid]: now },
    createdAt: now,
    ...(direct ? {} : { connectedAt: now }),
  };

  // 한 방에 통화는 하나 — 진행 중이면 그 통화로, 오래돼 멈춘 통화면 끝내고 새로
  const r = await db().runTransaction(async (tx) => {
    const roomRef = roomsCol().doc(roomId);
    const curId = await activeCallIdIn(tx, roomId);
    let ended: ChatCallDoc | null = null;
    if (curId) {
      const snap = await tx.get(callsCol().doc(curId));
      if (snap.exists) {
        const cur = callOf(snap);
        if (cur.status !== 'ended') {
          const st = staleCheck(cur, now);
          if (!st.end) return { joinId: cur.id, ended: null };
          ended = endInTx(tx, cur, st.end, now, curId, false);
        }
      }
    }
    const { id: _omit, ...data } = call;
    tx.set(ref, data);
    tx.update(roomRef, {
      activeCall: { callId: call.id, media, startedBy: me.uid, startedByName: myName, startedAt: now, participantIds: [me.uid], direct },
    });
    return { joinId: null, ended };
  });
  if (r.ended) await logEnded(r.ended).catch((e) => console.error('통화 기록 실패:', e));
  // 진행 중인 통화 — 단체는 참여, 1:1 은 상대가 나에게 걸던 통화를 받거나 내가 걸던 통화에 다시
  if (r.joinId) return joinChatCall(me, r.joinId);

  if (direct && peer) {
    await ringPeer(call, peer, room).catch((e) => console.error('통화 벨 푸시 실패:', e));
  } else {
    await writeLog(call, 'started').catch((e) => console.error('통화 시작 기록 실패:', e));
  }
  return joinInfo(call, me.uid);
}

export async function joinChatCall(me: { uid: string; name: string }, callId: string): Promise<ChatCallJoin> {
  const now = Date.now();
  const snap0 = await callsCol().doc(callId).get();
  if (!snap0.exists) throw new ChatCallError(404, '통화를 찾을 수 없습니다.');
  await memberRoom(callOf(snap0).roomId, me.uid);
  const out = await db().runTransaction(async (tx) => {
    const snap = await tx.get(callsCol().doc(callId));
    const call = callOf(snap);
    if (call.status === 'ended') throw new ChatCallError(410, '통화가 끝났습니다.');
    if (!call.participantIds.includes(me.uid) && call.participantIds.length >= CHAT_CALL_LIMITS.participantsMax) {
      throw new ChatCallError(409, '통화 인원이 가득 찼습니다.');
    }
    const agoraUid = pickAgoraUid(call, me.uid);
    const participantIds = [...new Set([...staleCheck(call, now).participantIds, me.uid])];
    const patch: Record<string, unknown> = {
      participantIds,
      joinedIds: adminFieldValue.arrayUnion(me.uid),
      [`agoraUids.${me.uid}`]: agoraUid,
      [`lastSeen.${me.uid}`]: now,
    };
    let next: ChatCallDoc = { ...call, participantIds, joinedIds: [...new Set([...call.joinedIds, me.uid])], agoraUids: { ...call.agoraUids, [me.uid]: agoraUid } };
    if (call.direct && call.status === 'ringing' && call.invitedIds.includes(me.uid)) {
      patch.status = 'active';
      patch.connectedAt = now;
      next = { ...next, status: 'active', connectedAt: now };
    }
    tx.update(callsCol().doc(callId), patch);
    tx.update(roomsCol().doc(call.roomId), { 'activeCall.participantIds': participantIds });
    return next;
  });
  return joinInfo(out, me.uid);
}

export async function leaveChatCall(uid: string, callId: string): Promise<void> {
  const now = Date.now();
  const ended = await db().runTransaction(async (tx) => {
    const snap = await tx.get(callsCol().doc(callId));
    if (!snap.exists) return null;
    const call = callOf(snap);
    if (call.status === 'ended') return null;
    const inCall = call.participantIds.includes(uid);
    const invited = call.invitedIds.includes(uid);
    if (!inCall && !invited) return null;
    const curId = await activeCallIdIn(tx, call.roomId);
    if (call.direct) {
      let reason: ChatCallEndReason = 'ended';
      if (call.status === 'ringing') {
        if (uid === call.startedBy) reason = now - call.createdAt >= CHAT_CALL_LIMITS.ringMs - 3_000 ? 'missed' : 'canceled';
        else reason = 'declined';
      }
      return endInTx(tx, call, reason, now, curId);
    }
    const left = staleCheck(call, now).participantIds.filter((u) => u !== uid);
    if (!left.length) return endInTx(tx, call, 'ended', now, curId);
    tx.update(callsCol().doc(callId), { participantIds: left, [`lastSeen.${uid}`]: adminFieldValue.delete() });
    if (curId === callId) tx.update(roomsCol().doc(call.roomId), { 'activeCall.participantIds': left });
    return null;
  });
  if (ended) await logEnded(ended).catch((e) => console.error('통화 기록 실패:', e));
}

export async function declineChatCall(uid: string, callId: string, reason: 'declined' | 'busy'): Promise<void> {
  const now = Date.now();
  const ended = await db().runTransaction(async (tx) => {
    const snap = await tx.get(callsCol().doc(callId));
    if (!snap.exists) return null;
    const call = callOf(snap);
    if (call.status !== 'ringing' || !call.invitedIds.includes(uid)) return null;
    return endInTx(tx, call, reason, now, await activeCallIdIn(tx, call.roomId));
  });
  if (ended) await logEnded(ended).catch((e) => console.error('통화 기록 실패:', e));
}

export async function renewChatCallToken(uid: string, callId: string): Promise<{ token: string; expiresAt: number }> {
  const snap = await callsCol().doc(callId).get();
  if (!snap.exists) throw new ChatCallError(404, '통화를 찾을 수 없습니다.');
  const call = callOf(snap);
  if (call.status === 'ended' || !call.participantIds.includes(uid) || !call.agoraUids[uid]) throw new ChatCallError(403, '통화에 들어가 있지 않습니다.');
  return tokenFor(call.id, call.agoraUids[uid]);
}

/** 살아 있음 — 그 김에 오래 소식 없는 사람을 빼고, 다 빠졌으면 끝낸다 */
export async function pingChatCall(uid: string, callId: string): Promise<{ ended: boolean }> {
  const now = Date.now();
  const r = await db().runTransaction(async (tx) => {
    const snap = await tx.get(callsCol().doc(callId));
    if (!snap.exists) return { ended: true, justEnded: null as ChatCallDoc | null };
    const call = callOf(snap);
    if (call.status === 'ended') return { ended: true, justEnded: null };
    if (!call.participantIds.includes(uid)) return { ended: false, justEnded: null };
    const curId = await activeCallIdIn(tx, call.roomId);
    const st = staleCheck({ ...call, lastSeen: { ...call.lastSeen, [uid]: now } }, now);
    if (st.end) return { ended: true, justEnded: endInTx(tx, call, st.end, now, curId) };
    const patch: Record<string, unknown> = { [`lastSeen.${uid}`]: now };
    if (st.participantIds.length !== call.participantIds.length) {
      patch.participantIds = st.participantIds;
      if (curId === callId) tx.update(roomsCol().doc(call.roomId), { 'activeCall.participantIds': st.participantIds });
    }
    tx.update(callsCol().doc(callId), patch);
    return { ended: false, justEnded: null };
  });
  if (r.justEnded) await logEnded(r.justEnded).catch((e) => console.error('통화 기록 실패:', e));
  return { ended: r.ended };
}

// ── 1:1 벨 ───────────────────────────────────────────────────────────

interface PushUser {
  name?: string;
  locale?: string;
  pushTokens?: Record<string, { platform?: string } | undefined>;
  voipTokens?: Record<string, unknown>;
  webPushTokens?: Record<string, unknown>;
}

/** 상대에게 벨 — iOS VoIP(잠금화면 CallKit) · Android 데이터 푸시(시스템 수신 화면) · 웹 알림 */
async function ringPeer(call: ChatCallDoc, peer: string, room: ChatRoom): Promise<void> {
  const [userSnap, stateSnap] = await Promise.all([
    db().collection('users').doc(peer).get(),
    db().collection('chatUserState').doc(peer).get(),
  ]);
  if (!userSnap.exists) return;
  // 나를 차단한 사람에게는 울리지 않는다 (시간이 지나면 응답 없음)
  if ((stateSnap.data() as { blocked?: Record<string, boolean> } | undefined)?.blocked?.[call.startedBy]) return;
  const u = userSnap.data() as PushUser;
  const en = String(u.locale ?? '').startsWith('en');
  const callerName = room.memberInfo?.[call.startedBy]?.name || call.startedByName;
  const what = call.media === 'video' ? (en ? 'Video call' : '영상 통화') : (en ? 'Voice call' : '음성 통화');
  const data = { type: 'chat-call', callId: call.id, uuid: call.uuid, roomId: call.roomId, callerId: call.startedBy, callerName, media: call.media, createdAt: String(call.createdAt) };
  // iOS — VoIP 토큰이 있으면 VoIP 푸시 (앱의 PushKit 이 바로 CallKit 수신 화면을 띄운다)
  const voip = Object.keys(u.voipTokens ?? {});
  let iosRung = false;
  if (voip.length && apnsVoipConfigured()) {
    const res = await sendVoipPush(voip, { ...data, hasVideo: call.media === 'video', handle: callerName }).catch((e) => {
      console.error('통화 벨(VoIP) 실패:', e);
      return [];
    });
    iosRung = res.some((x) => x.ok);
    const bad = res.filter((x) => x.invalid).map((x) => x.token);
    if (bad.length) {
      await db().collection('users').doc(peer)
        .update(Object.fromEntries(bad.filter((t) => /^[0-9a-fA-F]{32,200}$/.test(t)).map((t) => [`voipTokens.${t}`, adminFieldValue.delete()])))
        .catch(() => undefined);
    }
  }

  const jobs: Promise<unknown>[] = [];
  // Expo — Android 는 데이터만(앱이 시스템 수신 화면을 띄운다), VoIP 가 안 된 iOS 는 알림으로
  const expo = Object.entries(u.pushTokens ?? {}).filter(([t]) => /^Expo(nent)?PushToken\[/.test(t));
  const messages = expo
    .filter(([, v]) => !(iosRung && v?.platform === 'ios'))
    .map(([to, v]) => (v?.platform === 'android'
      ? { to, data, priority: 'high', ttl: 45 }
      : { to, title: callerName, body: en ? `${what} — tap to answer` : `${what} — 눌러서 받기`, data, sound: 'default', priority: 'high', ttl: 45 }));
  if (messages.length) {
    jobs.push(fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages),
    }).catch((e) => console.error('통화 벨(Expo) 실패:', e)));
  }

  // 웹 — 브라우저 알림 (누르면 그 방이 열리고, 열려 있으면 벨 화면)
  const web = Object.keys(u.webPushTokens ?? {});
  if (web.length) {
    jobs.push(admin.messaging(getAdminApp() ?? undefined).sendEachForMulticast({
      tokens: web.slice(0, 500),
      notification: { title: callerName, body: en ? `${what} is calling you` : `${what}가 왔어요` },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      webpush: {
        headers: { TTL: '45', Urgency: 'high' },
        notification: { icon: `${SITE}/android-icon-192x192.png`, tag: `call-${call.id}`, requireInteraction: true },
        fcmOptions: { link: `${SITE}/chat?room=${encodeURIComponent(call.roomId)}` },
      },
    }).catch((e) => console.error('통화 벨(웹) 실패:', e)));
  }
  await Promise.all(jobs);
}
