'use client';

/**
 * 앱 전체 통화 화면 — 공통 Layout 에 하나. 통화 중이면 전체 화면, 작게 보기면 오른쪽 아래 알약.
 * 다른 페이지로 가도 통화 상태(chatCalls.ts)는 이어진다. Esc = 작게 보기 (끊지 않는다).
 * 운영(chatCallsEnabled() 아님)에서는 아무것도 그리지 않는다.
 */
import { useEffect } from 'react';
import { callTitle, getCurrentLocale } from '@smis-mentor/shared';
import { useChatInbox } from '@/hooks/useChatUnread';
import { ChatCallPill, ChatCallScreen } from './ChatCall';
import { useChatCall } from './chatCalls';

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
      onMinimize={() => adapter.setMinimized(true)}
      onLeave={() => void adapter.leave()}
      onAccept={(media) => void adapter.accept(media ? { media } : undefined)}
      onDecline={() => void adapter.decline()}
      onMic={(on) => adapter.setMic(on)}
      onCamera={(on) => adapter.setCamera(on)}
    />
  );
}
