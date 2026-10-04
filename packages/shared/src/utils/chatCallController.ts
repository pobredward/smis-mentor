/**
 * 실제 통화 연결 — 화면이 쓰는 ChatCallAdapter 를 Agora 엔진 + 서버(/api/chat/call) + 통화 문서(chatCalls) 로 만든다.
 * web(agora-rtc-sdk-ng) · mobile(react-native-agora) 은 CallEngine 만 따로 만들고, 상태 · 벨 · 시간 제한 · 하트비트 ·
 * 토큰 갱신 · 걸려 오는 통화는 모두 여기 한 곳에서 처리한다.
 *
 * 흐름
 *  - 단체방: start → 서버가 통화 문서(active)를 만들거나 진행 중인 통화를 돌려줌 → 채널 입장 → 통화 중. 다른 사람은 join.
 *  - 1:1: start → 통화 문서(ringing) + 상대 벨(푸시) → 나는 먼저 채널에 들어가 기다림(outgoing) → 상대가 받으면(active) 통화 중.
 *         ringMs 안에 안 받으면 leave → 서버가 '응답 없음'. 상대는 watchIncoming 으로 벨(incoming) → accept/decline.
 *  - 통화 문서가 ended 가 되면 (상대가 끊음 · 서버 정리) 채널에서 나오고 '통화가 끝났어요' → 잠시 뒤 idle.
 *  - 1:1 에서 상대가 채널에서 사라지면(앱 종료 등) 곧바로 끊는다.
 */
import type {
  ChatCallAdapter,
  ChatCallDoc,
  ChatCallJoin,
  ChatCallMedia,
  ChatCallParticipant,
  ChatCallState,
  ChatMemberInfo,
} from '../types/chat';
import { CHAT_CALL_LIMITS } from './chatCall';

export type CallConnection = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

/** 엔진이 알려 주는 일 — uid 는 Agora uid (숫자), 0 = 나 */
export interface CallEngineEvents {
  onRemoteJoined(uid: number): void;
  onRemoteLeft(uid: number): void;
  onRemoteMedia(uid: number, kind: 'audio' | 'video', on: boolean): void;
  /** 소리 크기 0~100 */
  onVolumes(levels: Array<{ uid: number; level: number }>): void;
  /** 내 연결 품질 */
  onNetwork(quality: 'good' | 'poor'): void;
  onRemoteNetwork?(uid: number, quality: 'good' | 'poor'): void;
  onConnection(state: CallConnection): void;
  onTokenWillExpire(): void;
}

/** Agora 엔진 (web · mobile 이 따로 만든다) */
export interface CallEngine {
  join(o: { appId: string; channel: string; token: string; uid: number; mic: boolean; cam: boolean; frontCamera: boolean; speaker: boolean }, ev: CallEngineEvents): Promise<void>;
  leave(): Promise<void>;
  renewToken(token: string): Promise<void>;
  setMic(on: boolean): Promise<void> | void;
  setCamera(on: boolean): Promise<void> | void;
  switchCamera(): Promise<void> | void;
  setSpeaker(on: boolean): Promise<void> | void;
}

/** 서버 /api/chat/call */
export interface CallApi {
  start(roomId: string, media: ChatCallMedia): Promise<ChatCallJoin>;
  join(callId: string): Promise<ChatCallJoin>;
  leave(callId: string): Promise<void>;
  decline(callId: string, reason?: 'declined' | 'busy'): Promise<void>;
  token(callId: string): Promise<{ token: string; expiresAt: number }>;
  ping(callId: string): Promise<void>;
}

/** 인증된 POST 하나로 CallApi 만들기 (web authenticatedPost · mobile mobileAuthenticatedPost) */
export function createCallApi(post: <T>(path: string, body: unknown) => Promise<T>, path = '/api/chat/call'): CallApi {
  return {
    start: (roomId, media) => post<ChatCallJoin>(path, { action: 'start', roomId, media }),
    join: (callId) => post<ChatCallJoin>(path, { action: 'join', callId }),
    leave: async (callId) => { await post(path, { action: 'leave', callId }); },
    decline: async (callId, reason = 'declined') => { await post(path, { action: 'decline', callId, reason }); },
    token: (callId) => post<{ token: string; expiresAt: number }>(path, { action: 'token', callId }),
    ping: async (callId) => { await post(path, { action: 'ping', callId }); },
  };
}

export interface CallControllerOptions {
  me: { uid: string; name: string; photo?: string };
  engine: CallEngine;
  api: CallApi;
  /** chatCalls/{id} 구독 (없으면 null) */
  watchCall(callId: string, cb: (call: ChatCallDoc | null) => void): () => void;
  /** 나에게 걸려 오는 1:1 통화 (status ringing) 구독 */
  watchIncoming?(cb: (calls: ChatCallDoc[]) => void): () => void;
  /** 방 사람 정보 (이름 · 사진) */
  members(roomId: string): Record<string, ChatMemberInfo>;
  /** 벨소리 · 연결음 (없으면 소리 없음 — 앱은 CallKit 이 울린다) */
  ring?: { start(kind: 'incoming' | 'outgoing'): void; stop(): void };
  /** 걸려 온 통화를 화면에 띄우기 전에 — false 를 돌려주면 이 컨트롤러는 벨 화면을 띄우지 않는다 (OS 수신 화면이 대신) */
  onIncoming?(call: ChatCallDoc): boolean | void;
  /** 통화가 끝났을 때 (OS 통화 화면 닫기 등) */
  onEnded?(callId: string, reason: ChatCallState['endedReason']): void;
  /** 내가 1:1 을 걸었을 때 (OS 에 발신 통화 알리기) · 연결됐을 때 */
  onOutgoing?(callId: string, call: ChatCallDoc): void;
  onConnected?(callId: string): void;
  onError?(e: unknown, where: string): void;
  now?(): number;
}

export type CallController = ChatCallAdapter & {
  /** OS 수신 화면(CallKit 등)에서 받기 · 거절 — 아직 벨 상태를 못 받았으면 받는 대로 처리한다 */
  acceptById(callId: string, media?: ChatCallMedia): Promise<void>;
  declineById(callId: string): Promise<void>;
  /** 로그아웃 등 — 통화 중이면 나가고 구독을 끊는다 */
  dispose(): void;
};

const IDLE: ChatCallState = { phase: 'idle', media: 'voice', participants: [], micOn: true, camOn: false, speakerOn: true, frontCamera: true, minimized: false };

/** 서버 오류 → 화면 이유 */
const reasonOf = (r: ChatCallDoc['endedReason'], mine: boolean, direct: boolean): ChatCallState['endedReason'] => {
  if (!direct) return 'ended';
  if (r === 'declined') return mine ? 'rejected' : 'declined';
  if (r === 'busy') return mine ? 'busy' : 'missed';
  if (r === 'missed' || r === 'canceled') return mine ? 'ended' : 'missed';
  if (r === 'failed') return 'failed';
  return 'ended';
};

export function createCallController(o: CallControllerOptions): CallController {
  const now = () => (o.now ? o.now() : Date.now());
  let state: ChatCallState = { ...IDLE };
  const subs = new Set<(s: ChatCallState) => void>();
  const set = (patch: Partial<ChatCallState>) => {
    state = { ...state, ...patch };
    subs.forEach((cb) => cb(state));
  };

  // 지금 통화의 것들
  let call: ChatCallDoc | null = null;
  let joined = false;
  let unwatch: (() => void) | null = null;
  let ringTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  /** 엔진이 알려 준 상대 (Agora uid → 마이크 · 카메라 · 품질 · 들어온 시각) */
  const remotes = new Map<number, { mic: boolean; cam: boolean; poor: boolean; at: number }>();
  const speaking = new Set<number>();
  let reconnecting = false;
  let myPoor = false;
  /** OS 수신 화면에서 먼저 받은 · 거절한 통화 (벨 상태가 오면 처리) */
  const pending = new Map<string, { action: 'accept' | 'decline'; media?: ChatCallMedia }>();
  /** 이미 처리한 걸려 온 통화 (다시 울리지 않게) */
  const seenIncoming = new Set<string>();
  let incomingUnsub: (() => void) | null = null;
  let disposed = false;

  /** 지금 단계 (await 뒤에 다시 볼 때 — 그사이 바뀌었을 수 있다) */
  const phase = (): ChatCallState['phase'] => state.phase;
  const active = () => phase() !== 'idle' && phase() !== 'ended';
  const err = (e: unknown, where: string) => o.onError?.(e, where);

  const clearTimers = () => {
    if (ringTimer) clearTimeout(ringTimer);
    if (heartbeat) clearInterval(heartbeat);
    ringTimer = null;
    heartbeat = null;
  };

  /** 화면 칸 — 나 + 엔진이 알려 준 상대 (이름은 통화 문서 agoraUids · 방 사람으로) */
  const uidOfAgora = (n: number): string | undefined =>
    Object.entries(call?.agoraUids ?? {}).find(([, v]) => v === n)?.[0];
  const rebuild = () => {
    if (!active()) return;
    const info = o.members(state.roomId ?? '');
    const me: ChatCallParticipant = {
      uid: o.me.uid, name: o.me.name, photo: o.me.photo, isMe: true, agoraUid: 0, micOn: state.micOn, camOn: state.camOn,
      speaking: speaking.has(0), joinedAt: 0, connection: reconnecting ? 'reconnecting' : myPoor ? 'poor' : 'good',
    };
    const others: ChatCallParticipant[] = [...remotes.entries()].map(([n, r]) => {
      const uid = uidOfAgora(n) ?? `agora:${n}`;
      const m = info[uid];
      return {
        uid, name: m?.name ?? (uid === call?.startedBy ? call?.startedByName : '') ?? '', photo: m?.photo, agoraUid: n,
        micOn: r.mic, camOn: r.cam, speaking: speaking.has(n), joinedAt: r.at, connection: r.poor ? 'poor' : 'good',
      };
    });
    set({ participants: [...others, me] });
  };

  const events: CallEngineEvents = {
    onRemoteJoined(n) {
      if (!remotes.has(n)) remotes.set(n, { mic: true, cam: false, poor: false, at: now() });
      rebuild();
    },
    onRemoteLeft(n) {
      remotes.delete(n);
      speaking.delete(n);
      rebuild();
      // 1:1 — 상대가 나가면 (앱 종료 · 연결 끊김) 끝낸다
      if (state.direct && state.phase === 'inCall' && remotes.size === 0) void leave();
    },
    onRemoteMedia(n, kind, on) {
      const r = remotes.get(n) ?? { mic: true, cam: false, poor: false, at: now() };
      remotes.set(n, kind === 'audio' ? { ...r, mic: on } : { ...r, cam: on });
      rebuild();
    },
    onVolumes(levels) {
      const next = new Set(levels.filter((l) => l.level >= CHAT_CALL_LIMITS.speakingLevel).map((l) => l.uid));
      if (next.size === speaking.size && [...next].every((u) => speaking.has(u))) return;
      speaking.clear();
      next.forEach((u) => speaking.add(u));
      rebuild();
    },
    onNetwork(q) {
      if ((q === 'poor') === myPoor) return;
      myPoor = q === 'poor';
      rebuild();
    },
    onRemoteNetwork(n, q) {
      const r = remotes.get(n);
      if (!r || r.poor === (q === 'poor')) return;
      remotes.set(n, { ...r, poor: q === 'poor' });
      rebuild();
    },
    onConnection(c) {
      const was = reconnecting;
      reconnecting = c === 'reconnecting';
      if (was !== reconnecting) rebuild();
      if (c === 'disconnected' && active() && joined) finish('failed');
    },
    onTokenWillExpire() {
      const id = state.callId;
      if (!id) return;
      o.api.token(id).then((r) => o.engine.renewToken(r.token)).catch((e) => err(e, 'token'));
    },
  };

  /** 통화 문서가 바뀌었을 때 */
  const onCall = (c: ChatCallDoc | null) => {
    if (!state.callId || (c && c.id !== state.callId)) return;
    if (!c || c.status === 'ended') {
      if (active()) finish(reasonOf(c?.endedReason, c?.startedBy === o.me.uid, !!state.direct), true);
      return;
    }
    // 벨이 울리는 중인데 더는 ringing 이 아니다 — 내 다른 기기(웹 · 다른 폰)에서 받았다. 조용히 내려놓는다
    if (state.phase === 'incoming' && c.status !== 'ringing') {
      const id = state.callId;
      o.ring?.stop();
      unwatch?.();
      unwatch = null;
      reset({});
      o.onEnded?.(id, 'elsewhere');
      return;
    }
    call = c;
    if (state.phase === 'outgoing' && c.status === 'active') {
      o.ring?.stop();
      if (ringTimer) clearTimeout(ringTimer);
      ringTimer = null;
      set({ phase: 'inCall', startedAt: c.connectedAt ?? now() });
      o.onConnected?.(c.id);
    }
    rebuild();
  };

  const watch = (callId: string) => {
    unwatch?.();
    unwatch = o.watchCall(callId, onCall);
  };

  /** 채널에 들어가기 (start · join · accept 공통) */
  const enter = async (j: ChatCallJoin, media: ChatCallMedia) => {
    call = j.call;
    remotes.clear();
    speaking.clear();
    reconnecting = false;
    myPoor = false;
    set({ callId: j.call.id, roomId: j.call.roomId, direct: j.call.direct, media });
    watch(j.call.id);
    await o.engine.join(
      { appId: j.appId, channel: j.channel, token: j.token, uid: j.uid, mic: state.micOn, cam: state.camOn, frontCamera: state.frontCamera, speaker: state.speakerOn },
      events,
    );
    joined = true;
    if (!active() || state.callId !== j.call.id) {
      // 들어가는 사이 끝났다
      await o.engine.leave().catch(() => undefined);
      joined = false;
      return;
    }
    heartbeat = setInterval(() => {
      if (state.callId) o.api.ping(state.callId).catch((e) => err(e, 'ping'));
    }, CHAT_CALL_LIMITS.heartbeatMs);
    const c = call ?? j.call;
    if (c.direct && c.status === 'ringing' && c.startedBy === o.me.uid) {
      set({ phase: 'outgoing' });
      o.ring?.start('outgoing');
      o.onOutgoing?.(c.id, c);
      ringTimer = setTimeout(() => {
        if (state.phase === 'outgoing' && state.callId === c.id) void leave();
      }, CHAT_CALL_LIMITS.ringMs);
    } else {
      set({ phase: 'inCall', startedAt: c.connectedAt ?? now() });
      o.onConnected?.(c.id);
    }
    rebuild();
  };

  /** 끝내기 — 채널에서 나오고 '끝났어요' 를 잠깐 보여 준 뒤 idle (서버에 알리기는 부른 쪽이 한다) */
  function finish(reason: ChatCallState['endedReason'], _fromServer = false) {
    const id = state.callId;
    clearTimers();
    o.ring?.stop();
    unwatch?.();
    unwatch = null;
    if (joined) void o.engine.leave().catch((e) => err(e, 'engine.leave'));
    joined = false;
    remotes.clear();
    speaking.clear();
    set({ phase: 'ended', endedReason: reason, minimized: false });
    if (id) o.onEnded?.(id, reason);
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (state.phase === 'ended') set({ ...IDLE });
      call = null;
    }, CHAT_CALL_LIMITS.endedShowMs);
  }

  const reset = (patch: Partial<ChatCallState>) => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
    clearTimers();
    call = null;
    set({ ...IDLE, ...patch });
  };

  async function leave(): Promise<void> {
    const id = state.callId;
    if (!active()) return;
    const wasOutgoing = state.phase === 'outgoing';
    finish(wasOutgoing ? 'ended' : 'left');
    if (id) await o.api.leave(id).catch((e) => err(e, 'leave'));
  }

  /** 걸려 온 통화 목록 — 가장 최근 것 하나만 울린다 */
  const onIncomingList = (list: ChatCallDoc[]) => {
    const fresh = list
      .filter((c) => c.status === 'ringing' && c.direct && c.startedBy !== o.me.uid && !seenIncoming.has(c.id))
      .filter((c) => now() - c.createdAt < CHAT_CALL_LIMITS.ringMs + 5_000)
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const c of fresh) {
      seenIncoming.add(c.id);
      const p = pending.get(c.id);
      if (active()) {
        // 다른 통화 중 — '통화 중' 으로 거절 (OS 화면에서 받았다면 지금 통화를 끝내고 받는다)
        if (p?.action === 'accept') {
          pending.delete(c.id);
          void leave().then(() => ringIncoming(c, true, p.media));
        } else {
          o.api.decline(c.id, 'busy').catch((e) => err(e, 'busy'));
        }
        continue;
      }
      ringIncoming(c, !!p && p.action === 'accept', p?.media);
      if (p?.action === 'decline') void decline();
      pending.delete(c.id);
      break;
    }
  };

  function ringIncoming(c: ChatCallDoc, autoAccept = false, media?: ChatCallMedia) {
    const info = o.members(c.roomId)[c.startedBy];
    reset({
      phase: 'incoming', callId: c.id, roomId: c.roomId, direct: true, media: c.media, camOn: c.media === 'video',
      peer: { uid: c.startedBy, name: info?.name || c.startedByName, photo: info?.photo },
    });
    call = c;
    watch(c.id);
    const show = o.onIncoming?.(c);
    if (show !== false && !autoAccept) o.ring?.start('incoming');
    ringTimer = setTimeout(() => {
      if (state.phase === 'incoming' && state.callId === c.id) finish('missed', true);
    }, Math.max(1_000, CHAT_CALL_LIMITS.ringMs - (now() - c.createdAt)));
    if (autoAccept) void accept(media ? { media } : undefined);
  }

  async function accept(opts?: { media?: ChatCallMedia }): Promise<void> {
    if (state.phase !== 'incoming' || !state.callId) return;
    const id = state.callId;
    const media = opts?.media ?? state.media;
    o.ring?.stop();
    clearTimers();
    set({ phase: 'connecting', media, camOn: media === 'video' });
    try {
      const j = await o.api.join(id);
      if (state.callId !== id || phase() !== 'connecting') return;
      await enter(j, media);
    } catch (e) {
      err(e, 'accept');
      if (state.callId === id) finish('failed');
    }
  }

  async function decline(): Promise<void> {
    if (state.phase !== 'incoming' || !state.callId) return;
    const id = state.callId;
    finish('declined', true);
    await o.api.decline(id).catch((e) => err(e, 'decline'));
  }

  if (o.watchIncoming) incomingUnsub = o.watchIncoming(onIncomingList);

  return {
    getState: () => state,
    subscribe(cb) {
      subs.add(cb);
      cb(state);
      return () => { subs.delete(cb); };
    },
    async start({ roomId, media, direct, peer }) {
      if (active()) throw new Error('chat.callAlreadyInCall');
      reset({ phase: direct ? 'outgoing' : 'connecting', roomId, media, direct, peer, camOn: media === 'video' });
      try {
        const j = await o.api.start(roomId, media);
        if (!active()) {
          // 거는 사이 취소했다
          await o.api.leave(j.call.id).catch(() => undefined);
          return;
        }
        // 이미 진행 중인 통화(단체) · 상대가 나에게 걸고 있던 통화(1:1) 면 그 통화에 들어간다
        if (j.call.direct && j.call.startedBy !== o.me.uid) set({ phase: 'connecting' });
        await enter(j, media);
      } catch (e) {
        err(e, 'start');
        if (active()) finish('failed');
        throw e;
      }
    },
    async join({ roomId, callId, media }) {
      if (active()) {
        if (state.callId === callId) return;
        throw new Error('chat.callAlreadyInCall');
      }
      reset({ phase: 'connecting', roomId, media, direct: false, callId, camOn: media === 'video' });
      try {
        const j = await o.api.join(callId);
        if (state.callId !== callId || phase() !== 'connecting') {
          await o.api.leave(callId).catch(() => undefined);
          return;
        }
        await enter(j, media);
      } catch (e) {
        err(e, 'join');
        if (state.callId === callId && active()) finish('failed');
        throw e;
      }
    },
    accept,
    decline,
    leave,
    setMic(on) {
      set({ micOn: on });
      if (joined) Promise.resolve(o.engine.setMic(on)).catch((e) => err(e, 'mic'));
      rebuild();
    },
    setCamera(on) {
      set({ camOn: on });
      if (joined) Promise.resolve(o.engine.setCamera(on)).catch((e) => err(e, 'camera'));
      rebuild();
    },
    switchCamera() {
      set({ frontCamera: !state.frontCamera });
      if (joined) Promise.resolve(o.engine.switchCamera()).catch((e) => err(e, 'switchCamera'));
    },
    setSpeaker(on) {
      set({ speakerOn: on });
      if (joined) Promise.resolve(o.engine.setSpeaker(on)).catch((e) => err(e, 'speaker'));
    },
    setMinimized(on) { set({ minimized: on }); },
    async acceptById(callId, media) {
      if (state.phase === 'incoming' && state.callId === callId) return accept(media ? { media } : undefined);
      if (state.callId === callId && active()) return;
      pending.set(callId, { action: 'accept', media });
      // 이미 울리고 지나간 통화면 (목록이 먼저 왔다) 다시 확인할 수 있게
      seenIncoming.delete(callId);
    },
    async declineById(callId) {
      if (state.phase === 'incoming' && state.callId === callId) return decline();
      if (state.callId === callId) return;
      pending.set(callId, { action: 'decline' });
      // 벨 상태를 아직 못 받았어도 서버에는 바로 알린다
      o.api.decline(callId).catch((e) => err(e, 'declineById'));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      incomingUnsub?.();
      incomingUnsub = null;
      if (active()) void leave();
      unwatch?.();
      clearTimers();
      if (idleTimer) clearTimeout(idleTimer);
      subs.clear();
    },
  };
}
