'use client';

/**
 * 통화 소리 (파일 없이 WebAudio 로) — 걸려 올 때 벨 · 거는 중 연결음.
 * 브라우저가 소리를 막으면(사용자가 아직 페이지를 누르지 않음) 조용히 넘어간다 — 웹 알림이 대신 알린다.
 */
let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let nodes: OscillatorNode[] = [];

function beep(freqs: number[], ms: number, gain: number) {
  if (!ctx) return;
  const g = ctx.createGain();
  g.gain.value = gain;
  g.connect(ctx.destination);
  const t = ctx.currentTime;
  nodes = freqs.map((f) => {
    const o = ctx!.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(g);
    o.start(t);
    o.stop(t + ms / 1000);
    return o;
  });
}

export const callTones = {
  start(kind: 'incoming' | 'outgoing') {
    callTones.stop();
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx = ctx ?? new AC();
      void ctx.resume().catch(() => undefined);
    } catch {
      return;
    }
    // 받는 벨: 짧게 두 번 (0.4s · 0.4s) 2초마다 / 거는 연결음: 1초 울리고 2초 쉼
    const play = () => {
      if (kind === 'incoming') {
        beep([880, 660], 400, 0.12);
        setTimeout(() => beep([880, 660], 400, 0.12), 550);
      } else {
        beep([440, 480], 1000, 0.08);
      }
    };
    play();
    timer = setInterval(play, kind === 'incoming' ? 2000 : 3000);
  },
  stop() {
    if (timer) clearInterval(timer);
    timer = null;
    nodes.forEach((n) => { try { n.stop(); } catch { /* 이미 멈춤 */ } });
    nodes = [];
  },
};
