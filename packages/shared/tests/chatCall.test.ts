import { mock } from 'node:test';
import { describe, expect, it } from './_expect';
import * as K from '../src/utils/chatCall';

describe('통화 화면 도우미', () => {
  it('시간 · 칸 · 순서', () => {
    expect(K.formatCallDuration(192000)).toBe('03:12');
    expect(K.formatCallDuration(3723000)).toBe('1:02:03');
    expect([1, 2, 3, 5, 10].map((n) => K.callGridColumns(n, false))).toEqual([1, 1, 2, 2, 3]);
    expect([1, 2, 4, 6, 12, 20].map((n) => K.callGridColumns(n, true))).toEqual([1, 2, 2, 3, 4, 5]);
    const list = [
      { uid: 'me', name: '나', isMe: true, micOn: true, camOn: true, joinedAt: 1 },
      { uid: 'a', name: 'A', micOn: true, camOn: false, joinedAt: 2 },
      { uid: 'b', name: 'B', micOn: true, camOn: true, joinedAt: 3, speaking: true },
    ];
    expect(K.orderCallTiles(list).map((p) => p.uid)).toEqual(['b', 'a', 'me']);
    expect(K.callMediaLabel('video', false, 'ko')).toBe('그룹 영상 통화');
  });

  it('가짜 연결 — 단체: 연결 중 → 통화 중 → 사람이 들어옴 → 나가기', () => {
    mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    try {
      const a = K.createMockCallAdapter({
        me: { uid: 'me', name: '나' },
        members: () => ({ me: { name: '나', kind: 'mentor' }, x: { name: 'X', kind: 'mentor' }, y: { name: 'Y', kind: 'manager' } }),
      });
      const phases: string[] = [];
      a.subscribe((s) => { if (phases[phases.length - 1] !== s.phase) phases.push(s.phase); });
      void a.start({ roomId: 'r', media: 'video', direct: false });
      mock.timers.tick(800);
      expect(a.getState().phase).toBe('inCall');
      mock.timers.tick(2000);
      expect(a.getState().participants.map((p) => p.uid)).toEqual(['me', 'x', 'y']);
      a.setMic(false);
      expect(a.getState().participants[0].micOn).toBe(false);
      void a.leave();
      mock.timers.tick(1500);
      expect(phases).toEqual(['idle', 'connecting', 'inCall', 'ended', 'idle']);
      // 1:1 걸려 옴 → 받기
      a.simulateIncoming({ uid: 'x', name: 'X' }, 'voice', 'dm');
      expect(a.getState().phase).toBe('incoming');
      void a.accept();
      mock.timers.tick(600);
      expect(a.getState().participants.map((p) => p.uid)).toEqual(['me', 'x']);
      void a.leave();
      mock.timers.tick(1500);
    } finally {
      mock.timers.reset();
    }
  });
});
