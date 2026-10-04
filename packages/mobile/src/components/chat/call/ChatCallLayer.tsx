/**
 * 앱 전체 통화 화면 — App 에 하나. 통화 중이면 전체 화면, 작게 보기면 화면 위 초록 막대.
 * 다른 탭 · 화면으로 가도 통화 상태(services/chatCalls.ts)는 이어진다.
 * 걸려 오는 1:1 통화: OS 수신 화면(CallKit · ConnectionService)이 맡으면 앱 안 벨 화면은 그리지 않는다.
 */
import React from 'react';
import { callTitle, getCurrentLocale } from '@smis-mentor/shared';
import { useChatStore } from '../../../hooks/useChatUnread';
import { alertCallError, chatCallsReal, useChatCall } from '../../../services/chatCalls';
import { nativeCalls } from '../../../services/nativeCalls';
import { CallBar, CallScreen } from './CallViews';

export function ChatCallLayer() {
  const { enabled, state, adapter, me } = useChatCall();
  const { rooms } = useChatStore();
  const lang = getCurrentLocale();
  if (!enabled || !adapter || !me || state.phase === 'idle') return null;
  const room = rooms.find((r) => r.id === state.roomId);
  const title = room ? callTitle(room, lang, me.uid) : state.peer?.name ?? '';
  const hideIncoming = nativeCalls().handlesIncoming();
  const showBar = state.minimized && state.phase !== 'ended' && state.phase !== 'incoming';
  return (
    <>
      <CallScreen
        state={state}
        title={title}
        lang={lang}
        real={chatCallsReal() && !state.mock}
        hideIncoming={hideIncoming}
        onMinimize={() => adapter.setMinimized(true)}
        onLeave={() => void adapter.leave()}
        onAccept={(media) => { adapter.accept(media ? { media } : undefined).catch(alertCallError); }}
        onDecline={() => void adapter.decline()}
        onMic={(on) => {
          adapter.setMic(on);
          if (state.callId) nativeCalls().setMuted(state.callId, !on);
        }}
        onCamera={(on) => adapter.setCamera(on)}
        onSwitchCamera={() => adapter.switchCamera()}
        onSpeaker={(on) => adapter.setSpeaker(on)}
      />
      {showBar ? <CallBar state={state} title={title} lang={lang} onReturn={() => adapter.setMinimized(false)} /> : null}
    </>
  );
}
