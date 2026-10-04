'use client';

/**
 * 통화 칸 안의 실제 영상 (Agora 트랙) — ChatCallTile 의 renderVideo 자리에 들어간다.
 * 트랙이 아직 없으면(연결 중 · 카메라 권한 없음) 어두운 바탕만.
 */
import { useEffect, useReducer, useRef } from 'react';
import type { AgoraWebEngine } from './agoraWebEngine';

export default function AgoraVideo({ engine, agoraUid, mirror }: { engine: AgoraWebEngine; agoraUid: number; mirror?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => engine.onVideoChange(bump), [engine]);
  const track = engine.trackOf(agoraUid);
  useEffect(() => {
    const el = ref.current;
    if (!track || !el) return;
    track.play(el, { fit: 'cover', mirror: !!mirror });
    return () => track.stop();
  }, [track, mirror]);
  return <div ref={ref} className="absolute inset-0 bg-gray-900" />;
}
