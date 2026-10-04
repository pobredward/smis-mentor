/**
 * 통화 화면 도우미 · 통화 기록 글 · Agora uid · 미리보기용 가짜 연결
 *
 * 화면(web·mobile)은 ChatCallAdapter 만 쓴다. 실제 통화는 createCallController(chatCallController.ts) + Agora 엔진,
 * 미리보기는 createMockCallAdapter. 단체방은 '통화 시작 → 다른 사람이 참여' (벨 없음), 1:1 은 상대에게 벨이 울린다.
 */
import type {
  ChatCallAdapter,
  ChatCallLog,
  ChatCallMedia,
  ChatCallParticipant,
  ChatCallState,
  ChatMemberInfo,
  ChatRoom,
} from '../types/chat';
import { t, type Locale } from '../i18n';
import { chatRoomTitle } from './chat';

export const CHAT_CALL_LIMITS = {
  /** 영상으로 화면이 보이는 사람 수 (Agora 권장 — 넘으면 음성 칸으로) */
  videoTilesMax: 16,
  /** 한 통화 최대 인원 */
  participantsMax: 100,
  /** 1:1 벨이 울리는 시간 (ms) — 지나면 부재중 */
  ringMs: 40_000,
  /** 통화 중 '살아 있음' 알리기 (ms) */
  heartbeatMs: 30_000,
  /** 이만큼 소식이 없으면 서버가 통화에서 뺀다 (ms) */
  staleMs: 100_000,
  /** Agora 토큰 유효 시간 (초) — 끝나기 전에 엔진이 알려 주면 새로 받는다 */
  tokenTtlSec: 2 * 60 * 60,
  /** '통화가 끝났어요' 를 보여 주는 시간 (ms) */
  endedShowMs: 1_800,
  /** 말하는 중으로 보는 소리 크기 (0~100) */
  speakingLevel: 12,
} as const;

/**
 * Firebase uid → Agora uid (1 ~ 2^31-1, 같은 uid 는 늘 같은 숫자 — FNV-1a 32bit).
 * 한 통화 안에서 겹치면 서버가 다른 숫자를 준다 (chatCalls.agoraUids 가 기준).
 */
export function agoraUidFor(uid: string, salt = 0): number {
  let h = 0x811c9dc5 ^ salt;
  for (let i = 0; i < uid.length; i += 1) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const n = (h >>> 0) & 0x7fffffff;
  return n === 0 ? 1 : n;
}

/**
 * 통화 기록 한 줄 — 채팅 안 · 방 목록 미리보기 공통.
 * mine: 내가 건 통화인가 (보낸 사람 = 건 사람) — 1:1 응답 없음/취소/거절은 건 사람과 받는 사람이 다르게 본다.
 */
export function callLogText(
  call: Pick<ChatCallLog, 'status' | 'media' | 'durationMs'>,
  opts: { direct: boolean; mine: boolean; startedByName?: string; lang: Locale },
): string {
  const { lang } = opts;
  const media = callMediaLabel(call.media, opts.direct, lang);
  switch (call.status) {
    case 'started':
      return t(lang, 'chat.callStartedBy', { name: opts.startedByName ?? '', media });
    case 'ended':
      return t(lang, 'chat.callLogEnded', { media, t: formatCallDuration(call.durationMs) });
    case 'missed':
      return opts.mine ? t(lang, 'chat.callNoAnswer') : t(lang, 'chat.callMissed');
    case 'canceled':
      return opts.mine ? t(lang, 'chat.callCanceled') : t(lang, 'chat.callMissed');
    case 'declined':
      return opts.mine ? t(lang, 'chat.callDeclinedByPeer') : t(lang, 'chat.callDeclined');
    case 'busy':
      return opts.mine ? t(lang, 'chat.callBusy') : t(lang, 'chat.callMissed');
    default:
      return media;
  }
}

/** 빨간색으로 보일 기록 (놓친 통화 · 거절) */
export const isMissedCallLog = (call: Pick<ChatCallLog, 'status'>): boolean =>
  call.status === 'missed' || call.status === 'canceled' || call.status === 'declined' || call.status === 'busy';

/** 1:00:03 · 03:12 */
export function formatCallDuration(ms: number | null | undefined): string {
  const sec = Math.max(0, Math.floor(Number(ms ?? 0) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

/** 통화 이름 — 1:1 이면 '음성 통화', 단체면 '그룹 음성 통화' */
export function callMediaLabel(media: ChatCallMedia, direct: boolean, lang: Locale): string {
  if (direct) return t(lang, media === 'video' ? 'chat.callVideo' : 'chat.callVoice');
  return t(lang, media === 'video' ? 'chat.callGroupVideo' : 'chat.callGroupVoice');
}

/** 통화 화면 위 제목 — 방 이름 */
export const callTitle = (room: Pick<ChatRoom, 'type' | 'campCode' | 'memberIds' | 'memberInfo' | 'groupKey'>, lang: Locale, myUid: string) =>
  chatRoomTitle(room, lang, myUid);

/**
 * 화면 칸 나누기 — 사람 수 → 열 수
 * 좁은 화면: 1~2명 1열, 3~4명 2열, 5~9명 3열(=좁으면 2열), 10명~ 3열 / 넓은 화면: 1명 1열, 2명 2열, 3~4명 2열, 5~9명 3열, 10~16명 4열, 그 이상 5열
 */
export function callGridColumns(n: number, wide: boolean): number {
  if (n <= 1) return 1;
  if (!wide) return n <= 2 ? 1 : n <= 4 ? 2 : n <= 9 ? 2 : 3;
  return n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : 5;
}

/** 칸 순서 — 말하는 사람 · 영상 켠 사람 먼저, 나는 맨 뒤 (1:1 이면 상대 크게) */
export function orderCallTiles(list: ChatCallParticipant[]): ChatCallParticipant[] {
  const score = (p: ChatCallParticipant) => (p.isMe ? -10 : 0) + (p.speaking ? 2 : 0) + (p.camOn ? 1 : 0);
  return [...list].sort((a, b) => score(b) - score(a) || a.joinedAt - b.joinedAt);
}

const IDLE: ChatCallState = { phase: 'idle', media: 'voice', participants: [], micOn: true, camOn: false, speakerOn: true, frontCamera: true, minimized: false };

/**
 * 가짜 통화 연결 — 미리보기 · 개발 환경용. 서버도 Agora 도 쓰지 않는다.
 * 시작하면 잠깐 '연결 중' → 통화 중, 방 사람 몇 명이 차례로 들어오고 번갈아 말한다.
 * 1:1 은 벨 3초 뒤 상대가 받는다. simulateIncoming() 으로 걸려 오는 화면도 볼 수 있다.
 */
export function createMockCallAdapter(opts: {
  me: { uid: string; name: string; photo?: string };
  /** 방 사람 (uid → 정보) — 가짜로 들어올 사람 */
  members?: () => Record<string, ChatMemberInfo>;
  /** 단체 통화에 가짜로 들어올 최대 인원 (나 빼고) */
  fakeJoiners?: number;
}): ChatCallAdapter & { simulateIncoming(peer: { uid: string; name: string; photo?: string }, media: ChatCallMedia, roomId: string): void } {
  let state: ChatCallState = { ...IDLE, mock: true };
  const subs = new Set<(s: ChatCallState) => void>();
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  let ticker: ReturnType<typeof setInterval> | null = null;
  const set = (patch: Partial<ChatCallState>) => {
    state = { ...state, ...patch };
    subs.forEach((cb) => cb(state));
  };
  const later = (ms: number, fn: () => void) => { timers.push(setTimeout(fn, ms)); };
  const clear = () => {
    timers.splice(0).forEach(clearTimeout);
    if (ticker) clearInterval(ticker);
    ticker = null;
  };
  const meTile = (media: ChatCallMedia): ChatCallParticipant => ({
    uid: opts.me.uid, name: opts.me.name, photo: opts.me.photo, isMe: true,
    micOn: state.micOn, camOn: media === 'video', joinedAt: Date.now(), connection: 'good',
  });
  const others = () => Object.entries(opts.members?.() ?? {}).filter(([uid]) => uid !== opts.me.uid);
  const startTicker = () => {
    ticker = setInterval(() => {
      const list = state.participants.filter((p) => !p.isMe && p.micOn);
      const talker = list.length ? list[Math.floor(Math.random() * list.length)].uid : '';
      set({ participants: state.participants.map((p) => ({ ...p, speaking: p.isMe ? false : p.uid === talker && Math.random() > 0.3 })) });
    }, 1500);
  };
  const connect = (roomId: string, media: ChatCallMedia, direct: boolean, callId: string) => {
    set({ phase: 'inCall', roomId, media, direct, callId, startedAt: Date.now(), camOn: media === 'video', participants: [meTile(media)] });
    const pool = direct && state.peer
      ? [[state.peer.uid, { name: state.peer.name, photo: state.peer.photo, kind: 'mentor' } as ChatMemberInfo] as const]
      : others().slice(0, opts.fakeJoiners ?? 5);
    pool.forEach(([uid, m], i) => later(direct ? 0 : 900 * (i + 1), () => {
      if (state.phase !== 'inCall') return;
      set({
        participants: [...state.participants, {
          uid, name: m.name, photo: m.photo, micOn: i % 4 !== 3, camOn: media === 'video' && i % 3 !== 2,
          joinedAt: Date.now(), connection: i === 2 ? 'poor' : 'good',
        }],
      });
    }));
    startTicker();
  };
  const end = (reason: ChatCallState['endedReason']) => {
    clear();
    set({ phase: 'ended', endedReason: reason, minimized: false });
    later(1500, () => set({ ...IDLE, mock: true }));
  };
  return {
    getState: () => state,
    subscribe(cb) { subs.add(cb); cb(state); return () => { subs.delete(cb); }; },
    async start({ roomId, media, direct, peer }) {
      clear();
      const callId = `mock-${Date.now().toString(36)}`;
      set({ ...IDLE, mock: true, roomId, media, direct, callId, peer, camOn: media === 'video', phase: direct ? 'outgoing' : 'connecting' });
      later(direct ? 3000 : 800, () => connect(roomId, media, direct, callId));
    },
    async join({ roomId, callId, media }) {
      clear();
      set({ ...IDLE, mock: true, roomId, media, direct: false, callId, camOn: media === 'video', phase: 'connecting' });
      later(700, () => connect(roomId, media, false, callId));
    },
    async accept(o) {
      if (state.phase !== 'incoming') return;
      const media = o?.media ?? state.media;
      set({ phase: 'connecting', media, camOn: media === 'video' });
      later(600, () => connect(state.roomId ?? '', media, true, state.callId ?? 'mock'));
    },
    async decline() { end('declined'); },
    async leave() { end(state.phase === 'outgoing' ? 'ended' : 'left'); },
    setMic(on) { set({ micOn: on, participants: state.participants.map((p) => (p.isMe ? { ...p, micOn: on } : p)) }); },
    setCamera(on) { set({ camOn: on, participants: state.participants.map((p) => (p.isMe ? { ...p, camOn: on } : p)) }); },
    switchCamera() { set({ frontCamera: !state.frontCamera }); },
    setSpeaker(on) { set({ speakerOn: on }); },
    setMinimized(on) { set({ minimized: on }); },
    simulateIncoming(peer, media, roomId) {
      clear();
      set({ ...IDLE, mock: true, phase: 'incoming', peer, media, roomId, direct: true, callId: `mock-in-${Date.now().toString(36)}` });
      later(CHAT_CALL_LIMITS.ringMs, () => { if (state.phase === 'incoming') end('missed'); });
    },
  };
}
