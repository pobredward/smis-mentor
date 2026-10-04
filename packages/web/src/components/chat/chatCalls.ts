'use client';

/**
 * 채팅 통화 — 켜고 끄기 · 통화 연결 하나 · 앱 전체 상태
 *
 * - 실제 통화(Agora): NEXT_PUBLIC_AGORA_APP_ID 가 있으면 운영에서도 켜진다 (토큰은 서버 /api/chat/call 이 준다).
 *   앱 ID 가 없으면 개발 환경 · 미리보기(NEXT_PUBLIC_CHAT_CALLS=1)에서만 가짜 연결로 화면을 본다. 이 판단은 여기 한 곳에서만 한다.
 * - getChatCallAdapter(): 통화 연결은 여기서만 만든다 — shared createCallController + 웹 Agora 엔진.
 *   걸려 오는 1:1 통화는 chatCalls 구독(invitedIds)으로 벨 화면을 띄운다 (창이 닫혀 있으면 웹 알림이 대신).
 * - 상태는 모듈(화면 밖)에 하나 — 방을 옮기거나 다른 페이지로 가도 통화와 '작게 보기' 알약이 이어진다.
 */
import { useEffect, useSyncExternalStore } from 'react';
import toast from 'react-hot-toast';
import {
  L,
  createCallApi,
  createCallController,
  createMockCallAdapter,
  isChatStaff,
  logger,
  subscribeChatCall,
  subscribeIncomingChatCalls,
  type ChatCallAdapter,
  type ChatCallMedia,
  type ChatMemberInfo,
  type ChatUserLike,
} from '@smis-mentor/shared';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { authenticatedPost } from '@/lib/apiClient';
import { chatInboxRoom } from '@/hooks/useChatUnread';
import type { ChatCallView } from './ChatCall';
import { callTones } from './callTones';
import { createAgoraWebEngine, isMediaPermissionError, type AgoraWebEngine } from './agoraWebEngine';

/** 실제 통화(Agora)가 설정돼 있는가 */
export const chatCallsReal = (): boolean => !!process.env.NEXT_PUBLIC_AGORA_APP_ID;

/** 통화 화면을 보여 줄까 — Agora 가 있으면 늘, 없으면 개발 환경이거나 NEXT_PUBLIC_CHAT_CALLS=1 (가짜 연결) */
export function chatCallsEnabled(): boolean {
  return chatCallsReal() || process.env.NEXT_PUBLIC_CHAT_CALLS === '1' || process.env.NODE_ENV === 'development';
}

/** 가짜 연결에만 있는 '걸려 오는 통화 보기' · 실제 연결의 영상 엔진 */
export type ChatCallAdapterX = ChatCallAdapter & {
  simulateIncoming?: (peer: { uid: string; name: string; photo?: string }, media: ChatCallMedia, roomId: string) => void;
  engine?: AgoraWebEngine;
  dispose?: () => void;
};

/** 통화 오류 → 알림 (권한 · 서버가 준 이유) */
export function toastCallError(e: unknown) {
  if (isMediaPermissionError(e)) toast.error(L('chat.callPermission'));
  else if (e instanceof Error && e.message && !/^chat\./.test(e.message)) toast.error(e.message);
  else if (e instanceof Error && e.message === 'chat.callAlreadyInCall') toast(L('chat.callAlreadyInCall'));
  else toast.error(L('chat.callFailed'));
}

export type ChatCallMe = { uid: string; name: string; photo?: string };

/** 방 사람 (가짜 연결이 '들어올 사람'으로 쓴다) — 대화방이 열릴 때 알려 준다 */
const roomMembers = new Map<string, Record<string, ChatMemberInfo>>();
export function setCallRoomMembers(roomId: string, info: Record<string, ChatMemberInfo> | undefined) {
  if (info) roomMembers.set(roomId, info);
}

/** 방 사람 (이름 · 사진) — 열린 방이 알려 준 것, 없으면 받은 편지함의 방 */
const membersOf = (roomId: string): Record<string, ChatMemberInfo> =>
  roomMembers.get(roomId) ?? chatInboxRoom(roomId)?.memberInfo ?? {};

/**
 * 통화 연결 만들기 — 앱 전체에서 이 함수 하나로만 만든다.
 * Agora 앱 ID 가 있으면 실제 연결(createCallController + 웹 Agora 엔진), 없으면 가짜 연결(미리보기 · 개발용).
 * 영상은 ChatCallOverlay 가 ChatCallTile 의 renderVideo 자리에 엔진의 영상 트랙(AgoraVideo)을 그린다.
 */
export function getChatCallAdapter(me: ChatCallMe): ChatCallAdapterX {
  if (chatCallsReal()) {
    const engine = createAgoraWebEngine();
    const controller = createCallController({
      me,
      engine,
      api: createCallApi(authenticatedPost),
      watchCall: (id, cb) => subscribeChatCall(db, id, cb, (e) => logger.warn('통화 구독 오류:', e)),
      watchIncoming: (cb) => subscribeIncomingChatCalls(db, me.uid, cb, (e) => logger.warn('걸려 오는 통화 구독 오류:', e)),
      members: membersOf,
      ring: callTones,
      onError: (e, where) => {
        logger.warn('통화 오류:', where, e);
        if (where === 'accept') toastCallError(e);
      },
    });
    return Object.assign(controller, { engine });
  }
  const adapter: ChatCallAdapterX = createMockCallAdapter({
    me,
    members: () => membersOf(adapter.getState().roomId ?? ''),
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
  if (current.adapter.dispose) current.adapter.dispose();
  else if (st.phase !== 'idle' && st.phase !== 'ended') void current.adapter.leave();
  callTones.stop();
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
