'use client';

/**
 * 음성 메시지 — 말풍선(▶/❚❚ · 진행 막대 · 길이) · 녹음 (MediaRecorder, m4a)
 * 한 번에 하나만 재생한다. 브라우저가 m4a(AAC) 녹음을 못 하면 녹음 버튼을 흐리게 하고 안내.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FiPause, FiPlay } from 'react-icons/fi';
import { CHAT_LIMITS, L, formatChatDuration } from '@smis-mentor/shared';

/** 지금 재생 중인 음성 (다른 것을 누르면 멈춘다) */
let playing: HTMLAudioElement | null = null;

export function ChatVoiceBubble({ url, durationMs, mine, pending }: { url: string | null; durationMs?: number; mine: boolean; pending?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  /** 파일에서 읽은 길이 (메시지에 길이가 없을 때) */
  const [fileDur, setFileDur] = useState(0);
  const total = (durationMs ?? 0) / 1000;

  useEffect(() => () => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      if (playing === a) playing = null;
    }
  }, []);

  const toggle = () => {
    if (!url) return;
    let a = audioRef.current;
    if (!a) {
      a = new Audio(url);
      a.preload = 'auto';
      a.addEventListener('play', () => setIsPlaying(true));
      a.addEventListener('pause', () => setIsPlaying(false));
      a.addEventListener('ended', () => { setIsPlaying(false); setPos(0); });
      a.addEventListener('timeupdate', () => setPos(a!.currentTime));
      a.addEventListener('loadedmetadata', () => setFileDur(Number.isFinite(a!.duration) ? a!.duration : 0));
      a.addEventListener('error', () => { setIsPlaying(false); toast.error(L('chat.voicePlayFailed')); });
      audioRef.current = a;
    }
    if (!a.paused) {
      a.pause();
      return;
    }
    if (playing && playing !== a) playing.pause();
    playing = a;
    a.play().catch(() => toast.error(L('chat.voicePlayFailed')));
  };

  const dur = total || fileDur;
  const ratio = dur ? Math.min(1, pos / dur) : 0;
  return (
    <div className={`flex items-center gap-2.5 rounded-2xl px-3 py-2 w-[220px] max-w-full ${mine ? 'bg-blue-500 text-white' : 'bg-white text-gray-900'} ${pending ? 'opacity-70' : ''}`}>
      <button
        type="button"
        onClick={toggle}
        disabled={!url}
        className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center ${mine ? 'bg-white/20 hover:bg-white/30' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'} disabled:opacity-60`}
        aria-label={L('chat.play')}
      >
        {isPlaying ? <FiPause size={16} /> : <FiPlay size={16} className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`h-1.5 rounded-full overflow-hidden ${mine ? 'bg-white/30' : 'bg-gray-200'}`}>
          <div className={`h-full rounded-full ${mine ? 'bg-white' : 'bg-blue-500'}`} style={{ width: `${ratio * 100}%` }} />
        </div>
        <div className={`mt-1 text-[11px] tabular-nums ${mine ? 'text-white/80' : 'text-gray-500'}`}>
          {isPlaying || pos > 0 ? `${formatChatDuration(pos * 1000)} / ` : ''}
          {formatChatDuration(dur * 1000)}
        </div>
      </div>
    </div>
  );
}

const MIME_CANDIDATES = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4'];

/** 이 브라우저가 m4a(AAC)로 녹음할 수 있나 — 되면 그 mimeType */
export function voiceRecordMime(): string | null {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null;
  return MIME_CANDIDATES.find((t) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  }) ?? null;
}

/**
 * 녹음 — start() 로 시작, stop(true) 로 끝내고 파일 받기, stop(false) 로 취소.
 * 5분이 되면 저절로 끝나고 onAutoStop 으로 넘긴다.
 */
export function useVoiceRecorder(onAutoStop: (r: { blob: Blob; durationMs: number }) => void) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recRef = useRef<{ rec: MediaRecorder; stream: MediaStream; chunks: Blob[]; startedAt: number; timer: ReturnType<typeof setInterval>; done: ((v: { blob: Blob; durationMs: number } | null) => void) | null; keep: boolean } | null>(null);
  const autoStopRef = useRef(onAutoStop);
  useEffect(() => {
    autoStopRef.current = onAutoStop;
  }, [onAutoStop]);

  const finish = useCallback((keep: boolean): Promise<{ blob: Blob; durationMs: number } | null> => {
    const r = recRef.current;
    if (!r) return Promise.resolve(null);
    return new Promise((resolve) => {
      r.keep = keep;
      r.done = resolve;
      clearInterval(r.timer);
      if (r.rec.state !== 'inactive') r.rec.stop();
      else resolve(null);
    });
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    const mime = voiceRecordMime();
    if (!mime) {
      toast(L('chat.voiceWebUnsupported'));
      return false;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error(L('chat.permissionMic'));
      return false;
    }
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const state = {
      rec,
      stream,
      chunks: [] as Blob[],
      startedAt: Date.now(),
      timer: setInterval(() => {
        const ms = Date.now() - state.startedAt;
        setElapsed(ms);
        if (ms >= CHAT_LIMITS.voiceMaxMs) {
          toast(L('chat.voiceTooLong'));
          void finish(true).then((v) => { if (v) autoStopRef.current(v); });
        }
      }, 250),
      done: null as ((v: { blob: Blob; durationMs: number } | null) => void) | null,
      keep: false,
    };
    rec.addEventListener('dataavailable', (e) => { if (e.data.size) state.chunks.push(e.data); });
    rec.addEventListener('stop', () => {
      stream.getTracks().forEach((t) => t.stop());
      const durationMs = Math.min(CHAT_LIMITS.voiceMaxMs, Date.now() - state.startedAt);
      const blob = new Blob(state.chunks, { type: 'audio/mp4' });
      recRef.current = null;
      setRecording(false);
      setElapsed(0);
      state.done?.(state.keep && blob.size && durationMs >= 500 ? { blob, durationMs } : null);
    });
    recRef.current = state;
    rec.start(1000);
    setElapsed(0);
    setRecording(true);
    return true;
  }, [finish]);

  // 화면을 떠나면 녹음 취소 (마이크 끄기)
  useEffect(() => () => {
    const r = recRef.current;
    if (r) {
      clearInterval(r.timer);
      if (r.rec.state !== 'inactive') r.rec.stop();
      r.stream.getTracks().forEach((t) => t.stop());
    }
  }, []);

  return { recording, elapsed, start, stop: finish };
}
