'use client';

/**
 * 앱 전체 통화 화면 — 공통 Layout 에 하나. 통화 중이면 전체 화면, 작게 보기면 오른쪽 아래 알약.
 * 다른 페이지로 가도 통화 상태(chatCalls.ts)는 이어진다. Esc = 작게 보기 (끊지 않는다).
 * 걸려 오는 1:1 통화의 벨 화면도 여기서 (어느 페이지에 있든). 통화를 쓸 수 없으면(chatCallsEnabled() 아님) 아무것도 그리지 않는다.
 * 실제 연결이면 영상 칸에 Agora 영상(AgoraVideo)을 그린다.
 */
import { useCallback, useEffect } from 'react';
import { callTitle, getCurrentLocale } from '@smis-mentor/shared';
import { useChatInbox } from '@/hooks/useChatUnread';
import { ChatCallPill, ChatCallScreen } from './ChatCall';
import { toastCallError, useChatCall } from './chatCalls';
import AgoraVideo from './AgoraVideo';

export default function ChatCallOverlay() {
  const { enabled, state, adapter, me } = useChatCall();
  const inbox = useChatInbox();
  const lang = getCurrentLocale();
  const visible = enabled && !!adapter && state.phase !== 'idle';
  const full = visible && !state.minimized;

  // Esc = 작게 보기
  useEffect(() => {
    if (!full || !adapter || state.phase === 'ended') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') adapter.setMinimized(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [full, adapter, state.phase]);

  const engine = adapter?.engine;
  const participants = state.participants;
  const renderVideo = useCallback((uid: string, isMe: boolean) => {
    if (!engine) return null;
    const agoraUid = isMe ? 0 : participants.find((p) => p.uid === uid)?.agoraUid;
    if (agoraUid == null) return null;
    return <AgoraVideo engine={engine} agoraUid={agoraUid} mirror={isMe && state.frontCamera} />;
  }, [engine, participants, state.frontCamera]);

  if (!visible || !adapter || !me) return null;
  const room = inbox.rooms.find((r) => r.id === state.roomId);
  const title = room ? callTitle(room, lang, me.uid) : state.peer?.name ?? '';

  if (state.minimized && state.phase !== 'ended') {
    return <ChatCallPill state={state} title={title} lang={lang} onReturn={() => adapter.setMinimized(false)} />;
  }
  return (
    <ChatCallScreen
      state={state}
      title={title}
      lang={lang}
      renderVideo={engine ? renderVideo : undefined}
      onMinimize={() => adapter.setMinimized(true)}
      onLeave={() => void adapter.leave()}
      onAccept={(media) => { adapter.accept(media ? { media } : undefined).catch(toastCallError); }}
      onDecline={() => void adapter.decline()}
      onMic={(on) => adapter.setMic(on)}
      onCamera={(on) => adapter.setCamera(on)}
    />
  );
}
