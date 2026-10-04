'use client';

/**
 * 채팅 통화 (Agora 예정 — 지금은 화면만) — 켜고 끄기 · 통화 연결 하나 · 앱 전체 상태
 *
 * - chatCallsEnabled(): 아직 실제 통화가 안 되므로 개발 환경 · 미리보기(NEXT_PUBLIC_CHAT_CALLS=1)에서만 보인다.
 *   운영에서는 통화 버튼 · 띠 · 기록 · 통화 화면이 하나도 그려지지 않는다. 이 판단은 여기 한 곳에서만 한다.
 * - getChatCallAdapter(): 통화 연결은 여기서만 만든다 (지금은 가짜 — createMockCallAdapter).
 * - 상태는 모듈(화면 밖)에 하나 — 방을 옮기거나 다른 페이지로 가도 통화와 '작게 보기' 알약이 이어진다.
 */
import { useEffect, useSyncExternalStore } from 'react';
import {
  createMockCallAdapter,
  isChatStaff,
  type ChatCallAdapter,
  type ChatCallMedia,
  type ChatMemberInfo,
  type ChatUserLike,
} from '@smis-mentor/shared';
import { useAuth } from '@/contexts/AuthContext';
import type { ChatCallView } from './ChatCall';

/** 통화 화면을 보여 줄까 — 개발 환경이거나 NEXT_PUBLIC_CHAT_CALLS=1 */
export function chatCallsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CHAT_CALLS === '1' || process.env.NODE_ENV === 'development';
}

/** 가짜 연결에만 있는 '걸려 오는 통화 보기' */
export type ChatCallAdapterX = ChatCallAdapter & {
  simulateIncoming?: (peer: { uid: string; name: string; photo?: string }, media: ChatCallMedia, roomId: string) => void;
};

export type ChatCallMe = { uid: string; name: string; photo?: string };

/** 방 사람 (가짜 연결이 '들어올 사람'으로 쓴다) — 대화방이 열릴 때 알려 준다 */
const roomMembers = new Map<string, Record<string, ChatMemberInfo>>();
export function setCallRoomMembers(roomId: string, info: Record<string, ChatMemberInfo> | undefined) {
  if (info) roomMembers.set(roomId, info);
}

/**
 * 통화 연결 만들기 — 앱 전체에서 이 함수 하나로만 만든다.
 *
 * 지금: createMockCallAdapter — 가짜 연결 (서버 · Agora · 마이크/카메라 권한 없음). 미리보기 · 개발용.
 * 나중: ▶ Agora 를 붙일 때 여기서 Agora 어댑터를 돌려주면 된다. 예)
 *         return createAgoraCallAdapter({ appId: process.env.NEXT_PUBLIC_AGORA_APP_ID!, me, tokenUrl: '/api/chat/call-token' });
 *       ChatCallAdapter 모양(start · join · accept · decline · leave · setMic · setCamera …)만 맞추면 화면은 그대로 쓴다.
 *       영상은 ChatCallTile 의 renderVideo(uid, isMe) 자리에 Agora 영상 트랙을 그린다.
 */
export function getChatCallAdapter(me: ChatCallMe): ChatCallAdapterX {
  const adapter: ChatCallAdapterX = createMockCallAdapter({
    me,
    members: () => roomMembers.get(adapter.getState().roomId ?? '') ?? {},
    fakeJoiners: 5,
  });
  return adapter;
}

export { isCallActive, type ChatCallView } from './ChatCall';

const IDLE: ChatCallView = { phase: 'idle', media: 'voice', participants: [], micOn: true, camOn: false, speakerOn: true, frontCamera: true, minimized: false };

let current: { uid: string; adapter: ChatCallAdapterX; off: () => void } | null = null;
let snapshot: ChatCallView = IDLE;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function ensure(me: ChatCallMe): ChatCallAdapterX {
  if (current?.uid === me.uid) return current.adapter;
  drop();
  const adapter = getChatCallAdapter(me);
  const off = adapter.subscribe((s) => {
    const prev = snapshot;
    snapshot = s.phase === 'ended' ? { ...s, endedAt: prev.phase === 'ended' ? prev.endedAt : Date.now() } : s;
    emit();
  });
  current = { uid: me.uid, adapter, off };
  return adapter;
}

function drop() {
  if (!current) return;
  const st = current.adapter.getState();
  if (st.phase !== 'idle' && st.phase !== 'ended') void current.adapter.leave();
  current.off();
  current = null;
  snapshot = IDLE;
  emit();
}

if (typeof window !== 'undefined') {
  window.addEventListener('user-logout', drop);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** 앱 전체 통화 — 켜져 있고 채팅을 쓸 수 있는 계정일 때만 연결을 만든다 */
export function useChatCall(): { enabled: boolean; state: ChatCallView; adapter: ChatCallAdapterX | null; me: ChatCallMe | null } {
  const { userData, currentUser } = useAuth();
  const uid = currentUser?.uid || userData?.userId || '';
  const enabled = chatCallsEnabled() && !!uid && isChatStaff(userData as unknown as ChatUserLike);
  const name = String(userData?.name ?? '');
  const photo = typeof userData?.profileImage === 'string' && /^https?:\/\//.test(userData.profileImage) ? userData.profileImage : undefined;

  useEffect(() => {
    if (enabled) ensure({ uid, name, photo });
  }, [enabled, uid, name, photo]);

  const state = useSyncExternalStore(subscribe, () => snapshot, () => IDLE);
  const adapter = enabled && current?.uid === uid ? current.adapter : null;
  return { enabled, state: adapter ? state : IDLE, adapter, me: enabled ? { uid, name, photo } : null };
}
