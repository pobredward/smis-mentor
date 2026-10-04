import { mock } from 'node:test';
import { describe, expect, it } from './_expect';
import * as K from '../src/utils/chatCall';
import { createCallController, type CallEngineEvents } from '../src/utils/chatCallController';
import type { ChatCallDoc, ChatCallJoin, ChatCallMedia } from '../src/types/chat';

const flush = () => new Promise((r) => setImmediate(r));
const ME = { uid: 'me', name: '나' };
const MEMBERS = { me: { name: '나', kind: 'manager' as const }, a: { name: '김에이', kind: 'mentor' as const, photo: 'https://x/a.jpg' }, b: { name: '박비', kind: 'mentor' as const } };

function rig(opts: { incoming?: boolean } = {}) {
  const log: string[] = [];
  let ev: CallEngineEvents | null = null;
  const callWatchers = new Map<string, (c: ChatCallDoc | null) => void>();
  let incomingCb: ((l: ChatCallDoc[]) => void) | null = null;
  const docs = new Map<string, ChatCallDoc>();
  const doc = (p: Partial<ChatCallDoc> & { id: string }): ChatCallDoc => ({
    roomId: 'r1', direct: false, media: 'voice', status: 'active', startedBy: 'me', startedByName: '나', invitedIds: [], participantIds: ['me'],
    joinedIds: ['me'], agoraUids: { me: 11, a: 22, b: 33 }, createdAt: Date.now(), ...p,
  });
  const joinOf = (c: ChatCallDoc): ChatCallJoin => ({ call: c, appId: 'app', channel: c.id, token: 'tok', uid: c.agoraUids.me, expiresAt: Date.now() + 7200_000 });
  const api = {
    nextStart: null as ChatCallDoc | null,
    async start(roomId: string, media: ChatCallMedia) { log.push(`api.start ${roomId} ${media}`); const c = api.nextStart!; docs.set(c.id, c); return joinOf(c); },
    async join(callId: string) { log.push(`api.join ${callId}`); const c = { ...docs.get(callId)!, status: 'active' as const, connectedAt: Date.now() }; docs.set(callId, c); return joinOf(c); },
    async leave(callId: string) { log.push(`api.leave ${callId}`); },
    async decline(callId: string, reason = 'declined') { log.push(`api.decline ${callId} ${reason}`); },
    async token(callId: string) { log.push(`api.token ${callId}`); return { token: 'tok2', expiresAt: 0 }; },
    async ping(callId: string) { log.push(`api.ping ${callId}`); },
  };
  const engine = {
    async join(o: { channel: string; uid: number; cam: boolean }, e: CallEngineEvents) { ev = e; log.push(`engine.join ${o.channel} ${o.uid} cam=${o.cam}`); },
    async leave() { log.push('engine.leave'); },
    async renewToken(t: string) { log.push(`engine.renew ${t}`); },
    setMic(on: boolean) { log.push(`engine.mic ${on}`); },
    setCamera(on: boolean) { log.push(`engine.cam ${on}`); },
    switchCamera() { log.push('engine.switch'); },
    setSpeaker(on: boolean) { log.push(`engine.speaker ${on}`); },
  };
  const ring = { start: (k: string) => log.push(`ring ${k}`), stop: () => log.push('ring stop') };
  const ended: string[] = [];
  const c = createCallController({
    me: ME, engine, api, ring,
    members: () => MEMBERS,
    watchCall: (id, cb) => { callWatchers.set(id, cb); return () => callWatchers.delete(id); },
    watchIncoming: opts.incoming ? (cb) => { incomingCb = cb; return () => { incomingCb = null; }; } : undefined,
    onEnded: (id, r) => ended.push(`${id}:${r}`),
  });
  return {
    c, log, api, docs, doc, ended,
    ev: () => ev!,
    pushCall: (d: ChatCallDoc | null, id?: string) => callWatchers.get(id ?? d!.id)?.(d),
    pushIncoming: (l: ChatCallDoc[]) => incomingCb?.(l),
    phase: () => c.getState().phase,
  };
}

describe('통화 컨트롤러 (Agora 엔진 · 서버 · 통화 문서)', () => {
  it('단체: 시작 → 통화 중 → 사람이 들어오고 말함 → 나가기 → 끝 → idle', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    try {
      const t = rig();
      t.api.nextStart = t.doc({ id: 'c1' });
      await t.c.start({ roomId: 'r1', media: 'video', direct: false });
      expect(t.phase()).toBe('inCall');
      expect(t.log).toEqual(['api.start r1 video', 'engine.join c1 11 cam=true']);
      t.ev().onRemoteJoined(22);
      t.ev().onRemoteMedia(22, 'video', true);
      t.ev().onVolumes([{ uid: 22, level: 40 }, { uid: 0, level: 3 }]);
      const ps = t.c.getState().participants;
      expect(ps.map((p) => [p.uid, p.name, p.camOn, !!p.speaking, !!p.isMe])).toEqual([['a', '김에이', true, true, false], ['me', '나', true, false, true]]);
      expect(ps[0].photo).toBe('https://x/a.jpg');
      // 하트비트
      mock.timers.tick(K.CHAT_CALL_LIMITS.heartbeatMs);
      await flush();
      expect(t.log).toContain('api.ping c1');
      // 토큰 갱신
      t.ev().onTokenWillExpire();
      await flush(); await flush();
      expect(t.log).toContain('engine.renew tok2');
      await t.c.leave();
      expect(t.phase()).toBe('ended');
      expect(t.c.getState().endedReason).toBe('left');
      expect(t.log).toContain('engine.leave');
      expect(t.log).toContain('api.leave c1');
      expect(t.ended).toEqual(['c1:left']);
      mock.timers.tick(K.CHAT_CALL_LIMITS.endedShowMs);
      expect(t.phase()).toBe('idle');
    } finally { mock.timers.reset(); }
  });

  it('1:1 걸기: 벨(연결음) → 상대가 받음(active) → 통화 중 → 상대가 채널에서 나가면 끊는다', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    try {
      const t = rig();
      t.api.nextStart = t.doc({ id: 'd1', direct: true, status: 'ringing', invitedIds: ['a'], roomId: 'dm_a_me' });
      await t.c.start({ roomId: 'dm_a_me', media: 'voice', direct: true, peer: { uid: 'a', name: '김에이' } });
      expect(t.phase()).toBe('outgoing');
      expect(t.log).toContain('ring outgoing');
      t.pushCall(t.doc({ id: 'd1', direct: true, status: 'active', connectedAt: 123, participantIds: ['me', 'a'] }));
      expect(t.phase()).toBe('inCall');
      expect(t.c.getState().startedAt).toBe(123);
      expect(t.log).toContain('ring stop');
      t.ev().onRemoteJoined(22);
      t.ev().onRemoteLeft(22);
      await flush();
      expect(t.phase()).toBe('ended');
      expect(t.log).toContain('api.leave d1');
    } finally { mock.timers.reset(); }
  });

  it('1:1 걸기: 안 받으면 ringMs 뒤 나가기 · 상대가 거절하면 거절', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    try {
      const t = rig();
      t.api.nextStart = t.doc({ id: 'd2', direct: true, status: 'ringing', invitedIds: ['a'] });
      await t.c.start({ roomId: 'dm', media: 'voice', direct: true });
      mock.timers.tick(K.CHAT_CALL_LIMITS.ringMs);
      await flush();
      expect(t.phase()).toBe('ended');
      expect(t.log).toContain('api.leave d2');
      const t2 = rig();
      t2.api.nextStart = t2.doc({ id: 'd3', direct: true, status: 'ringing', invitedIds: ['a'] });
      await t2.c.start({ roomId: 'dm', media: 'voice', direct: true });
      t2.pushCall(t2.doc({ id: 'd3', direct: true, status: 'ended', endedReason: 'declined' }));
      expect(t2.c.getState().endedReason).toBe('rejected');
      expect(t2.log.includes('api.leave d3')).toBe(false);
      expect(t2.log).toContain('engine.leave');
      // 상대가 다른 통화 중
      const t3 = rig();
      t3.api.nextStart = t3.doc({ id: 'd4', direct: true, status: 'ringing', invitedIds: ['a'] });
      await t3.c.start({ roomId: 'dm', media: 'voice', direct: true });
      t3.pushCall(t3.doc({ id: 'd4', direct: true, status: 'ended', endedReason: 'busy' }));
      expect(t3.c.getState().endedReason).toBe('busy');
    } finally { mock.timers.reset(); }
  });

  it('1:1 받기: 벨 → 받기 → 통화 중 · 건 사람이 끊으면 부재중', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    try {
      const t = rig({ incoming: true });
      const inc = t.doc({ id: 'i1', direct: true, status: 'ringing', startedBy: 'a', startedByName: '김에이', invitedIds: ['me'], media: 'video', roomId: 'dm_a_me' });
      t.docs.set('i1', inc);
      t.pushIncoming([inc]);
      expect(t.phase()).toBe('incoming');
      expect(t.c.getState().peer).toEqual({ uid: 'a', name: '김에이', photo: 'https://x/a.jpg' });
      expect(t.log).toEqual(['ring incoming']);
      // 같은 목록이 다시 와도 다시 울리지 않는다
      t.pushIncoming([inc]);
      expect(t.log.filter((x) => x === 'ring incoming').length).toBe(1);
      await t.c.accept({ media: 'voice' });
      expect(t.phase()).toBe('inCall');
      expect(t.c.getState().media).toBe('voice');
      expect(t.log).toContain('api.join i1');
      expect(t.log).toContain('engine.join i1 11 cam=false');
      // 다른 통화가 오면 '통화 중' 으로 거절
      const other = t.doc({ id: 'i2', direct: true, status: 'ringing', startedBy: 'b', invitedIds: ['me'] });
      t.pushIncoming([other]);
      await flush();
      expect(t.log).toContain('api.decline i2 busy');
      expect(t.phase()).toBe('inCall');

      const t2 = rig({ incoming: true });
      const inc2 = t2.doc({ id: 'i3', direct: true, status: 'ringing', startedBy: 'a', invitedIds: ['me'] });
      t2.pushIncoming([inc2]);
      t2.pushCall(t2.doc({ id: 'i3', direct: true, status: 'ended', startedBy: 'a', endedReason: 'canceled' }));
      expect(t2.phase()).toBe('ended');
      expect(t2.c.getState().endedReason).toBe('missed');
      expect(t2.log).toContain('ring stop');
      // 오래된 벨은 울리지 않는다
      const t3 = rig({ incoming: true });
      t3.pushIncoming([t3.doc({ id: 'old', direct: true, status: 'ringing', startedBy: 'a', invitedIds: ['me'], createdAt: Date.now() - 120_000 })]);
      expect(t3.phase()).toBe('idle');
    } finally { mock.timers.reset(); }
  });

  it('OS 수신 화면(CallKit)에서 먼저 받기 · 거절 — 벨 상태가 오면 바로 처리', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    try {
      const t = rig({ incoming: true });
      await t.c.acceptById('k1');
      const inc = t.doc({ id: 'k1', direct: true, status: 'ringing', startedBy: 'a', invitedIds: ['me'] });
      t.docs.set('k1', inc);
      t.pushIncoming([inc]);
      await flush(); await flush();
      expect(t.phase()).toBe('inCall');
      expect(t.log.includes('ring incoming')).toBe(false);
      expect(t.log).toContain('api.join k1');

      const t2 = rig({ incoming: true });
      await t2.c.declineById('k2');
      expect(t2.log).toContain('api.decline k2 declined');
      expect(t2.phase()).toBe('idle');

      // 내 다른 기기에서 받음 — 벨을 멈추고 '끝' 화면 없이 idle
      const t3 = rig({ incoming: true });
      const inc3 = t3.doc({ id: 'k3', direct: true, status: 'ringing', startedBy: 'a', invitedIds: ['me'] });
      t3.pushIncoming([inc3]);
      expect(t3.phase()).toBe('incoming');
      t3.pushCall({ ...inc3, status: 'active', joinedIds: ['a', 'me'] });
      expect(t3.phase()).toBe('idle');
      expect(t3.log).toContain('ring stop');
      expect(t3.ended).toEqual(['k3:elsewhere']);
      expect(t3.log.includes('api.decline k3 declined')).toBe(false);
    } finally { mock.timers.reset(); }
  });

  it('통화 중 서버가 끝냄 (상대가 끊음 · 정리) · 연결 끊김 · 마이크 · 카메라', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    try {
      const t = rig();
      t.api.nextStart = t.doc({ id: 'g1' });
      await t.c.start({ roomId: 'r1', media: 'voice', direct: false });
      t.c.setMic(false);
      t.c.setCamera(true);
      t.c.setSpeaker(false);
      t.c.switchCamera();
      expect(t.log.slice(-4)).toEqual(['engine.mic false', 'engine.cam true', 'engine.speaker false', 'engine.switch']);
      const me = t.c.getState().participants.find((p) => p.isMe)!;
      expect([me.micOn, me.camOn]).toEqual([false, true]);
      t.ev().onConnection('reconnecting');
      expect(t.c.getState().participants.find((p) => p.isMe)!.connection).toBe('reconnecting');
      t.pushCall(t.doc({ id: 'g1', status: 'ended', endedReason: 'ended' }));
      expect(t.phase()).toBe('ended');
      expect(t.c.getState().endedReason).toBe('ended');
      // 끝난 뒤의 엔진 소식은 무시
      const before = t.c.getState().participants.length;
      t.ev().onRemoteJoined(99);
      expect(t.c.getState().participants.length).toBe(before);
    } finally { mock.timers.reset(); }
  });

  it('통화 기록 글 · Agora uid', () => {
    const v = (status: 'started' | 'ended' | 'missed' | 'canceled' | 'declined' | 'busy', mine: boolean) =>
      K.callLogText({ status, media: 'voice', durationMs: 192000 }, { direct: status !== 'started', mine, startedByName: '김에이', lang: 'ko' });
    expect(v('started', false)).toBe('김에이 님이 그룹 음성 통화를 시작했어요');
    expect(v('ended', true)).toBe('음성 통화 · 03:12');
    expect([v('missed', true), v('missed', false)]).toEqual(['응답 없음', '부재중 통화']);
    expect([v('canceled', true), v('canceled', false)]).toEqual(['취소한 통화', '부재중 통화']);
    expect([v('declined', true), v('declined', false)]).toEqual(['상대가 통화를 거절했어요', '통화를 거절했어요']);
    expect([v('busy', true), v('busy', false)]).toEqual(['상대가 다른 통화 중이에요', '부재중 통화']);
    expect(K.isMissedCallLog({ status: 'ended' })).toBe(false);
    const u = K.agoraUidFor('BDKfLE4sviOSWXqMExqv8I0YiWc2');
    expect(u > 0 && u < 2 ** 31).toBe(true);
    expect(K.agoraUidFor('BDKfLE4sviOSWXqMExqv8I0YiWc2')).toBe(u);
    expect(K.agoraUidFor('BDKfLE4sviOSWXqMExqv8I0YiWc2', 1) !== u).toBe(true);
  });
});
