/**
 * 채팅 통화 (앱) — 켜고 끄기 · 통화 연결 하나 · 앱 전체 상태 (web components/chat/chatCalls.ts 와 같은 구조)
 *
 * - 실제 통화(Agora): EXPO_PUBLIC_AGORA_APP_ID 가 있으면 켜진다 (토큰은 서버 /api/chat/call 이 준다).
 *   없으면 개발 환경(__DEV__) · 미리보기(EXPO_PUBLIC_CHAT_CALLS=1)에서만 가짜 연결로 화면을 본다.
 * - 통화 연결은 getChatCallAdapter() 하나로만 — shared createCallController + 앱 Agora 엔진.
 *   걸려 오는 1:1 통화는 chatCalls 구독(invitedIds)으로 알고, OS 수신 화면(nativeCalls — CallKit/ConnectionService)이 있으면 그쪽이 울린다.
 * - 상태는 모듈(화면 밖)에 하나 — 방을 옮기거나 다른 탭으로 가도 통화와 '작게 보기' 막대가 이어진다.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { Alert, Vibration } from 'react-native';
import {
  L,
  createCallApi,
  createCallController,
  createMockCallAdapter,
  isChatStaff,
  logger,
  subscribeChatCall,
  subscribeIncomingChatCalls,
  type CallController,
  type ChatCallAdapter,
  type ChatCallMedia,
  type ChatCallState,
  type ChatMemberInfo,
  type ChatUserLike,
} from '@smis-mentor/shared';
import { auth, db } from '../config/firebase';
import { useAuth } from '../context/AuthContext';
import { chatStoreRoom } from '../hooks/useChatUnread';
import { mobileAuthenticatedPost } from './apiClient';
import { createAgoraNativeEngine, CallPermissionError } from './agoraNativeEngine';
import { agoraLinked } from './agoraNative';
import { nativeCalls } from './nativeCalls';

/** 화면용 통화 상태 — 끝난 시각을 붙인다 */
export type ChatCallView = ChatCallState & { endedAt?: number };
export const isCallActive = (s: Pick<ChatCallState, 'phase'>) => s.phase !== 'idle' && s.phase !== 'ended';

/** 실제 통화(Agora)가 설정돼 있는가 — 키가 있고, 앱에 Agora 네이티브 모듈이 들어 있을 때 (Expo Go 는 가짜 연결) */
export const chatCallsReal = (): boolean => !!process.env.EXPO_PUBLIC_AGORA_APP_ID && agoraLinked();
/** 통화 버튼 · 화면을 보여 줄까 */
export function chatCallsEnabled(): boolean {
  return chatCallsReal() || __DEV__ || process.env.EXPO_PUBLIC_CHAT_CALLS === '1';
}

export type ChatCallAdapterX = ChatCallAdapter & {
  simulateIncoming?: (peer: { uid: string; name: string; photo?: string }, media: ChatCallMedia, roomId: string) => void;
  /** 실제 연결 (OS 수신 화면에서 받기 · 거절 · 정리) */
  controller?: CallController;
};
export type ChatCallMe = { uid: string; name: string; photo?: string };

/** 방 사람 — 열린 방이 알려 준 것, 없으면 방 목록의 것 */
const roomMembers = new Map<string, Record<string, ChatMemberInfo>>();
export function setCallRoomMembers(roomId: string, info: Record<string, ChatMemberInfo> | undefined) {
  if (info) roomMembers.set(roomId, info);
}
const membersOf = (roomId: string): Record<string, ChatMemberInfo> => roomMembers.get(roomId) ?? chatStoreRoom(roomId)?.memberInfo ?? {};

/** 통화 오류 알림 */
export function alertCallError(e: unknown) {
  if (e instanceof CallPermissionError) Alert.alert(L('chat.callPermission'));
  else if (e instanceof Error && e.message === 'chat.callAlreadyInCall') Alert.alert(L('chat.callAlreadyInCall'));
  else if (e instanceof Error && e.message && !/^chat\./.test(e.message) && !/^agora/.test(e.message)) Alert.alert(L('chat.callFailed'), e.message);
  else Alert.alert(L('chat.callFailed'));
}

const ring = {
  start(kind: 'incoming' | 'outgoing') {
    if (kind === 'incoming') Vibration.vibrate([0, 900, 1100], true);
  },
  stop() {
    Vibration.cancel();
  },
};

export function getChatCallAdapter(me: ChatCallMe): ChatCallAdapterX {
  if (chatCallsReal()) {
    const engine = createAgoraNativeEngine();
    const controller = createCallController({
      me,
      engine,
      api: createCallApi((path, body) => mobileAuthenticatedPost(path, body as Record<string, unknown>)),
      watchCall: (id, cb) => subscribeChatCall(db, id, cb, (e) => logger.warn('통화 구독 오류:', e)),
      watchIncoming: (cb) => subscribeIncomingChatCalls(db, me.uid, cb, (e) => logger.warn('걸려 오는 통화 구독 오류:', e)),
      members: membersOf,
      ring,
      onIncoming: (call) => {
        const n = nativeCalls();
        if (!n.handlesIncoming()) return true;
        n.reportIncoming(call, membersOf(call.roomId)[call.startedBy]?.name || call.startedByName);
        return false;
      },
      onOutgoing: (callId, call) => {
        const peer = call.invitedIds[0];
        nativeCalls().reportOutgoing(call, membersOf(call.roomId)[peer]?.name ?? '');
      },
      onConnected: (callId) => nativeCalls().reportConnected(callId),
      onEnded: (callId, reason) => nativeCalls().reportEnded(callId, reason),
      onError: (e, where) => {
        logger.warn('통화 오류:', where, e);
        if (where === 'accept') alertCallError(e);
      },
    });
    return Object.assign(controller, { controller });
  }
  const adapter: ChatCallAdapterX = createMockCallAdapter({
    me,
    members: () => membersOf(adapter.getState().roomId ?? ''),
    fakeJoiners: 5,
  });
  return adapter;
}

const IDLE: ChatCallView = { phase: 'idle', media: 'voice', participants: [], micOn: true, camOn: false, speakerOn: true, frontCamera: true, minimized: false };

let current: { uid: string; adapter: ChatCallAdapterX; off: () => void } | null = null;
let snapshot: ChatCallView = IDLE;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** 앱 전체 통화 연결 (만들어져 있지 않으면 만든다) */
export function ensureChatCall(me: ChatCallMe): ChatCallAdapterX {
  if (current?.uid === me.uid) return current.adapter;
  dropChatCall();
  const adapter = getChatCallAdapter(me);
  const off = adapter.subscribe((s) => {
    const prev = snapshot;
    snapshot = s.phase === 'ended' ? { ...s, endedAt: prev.phase === 'ended' ? prev.endedAt : Date.now() } : s;
    emit();
  });
  current = { uid: me.uid, adapter, off };
  if (adapter.controller) nativeCalls().onController?.(adapter.controller);
  return adapter;
}

/** 지금 통화 연결 (없으면 null) — OS 수신 화면 이벤트가 쓴다 */
export const currentChatCall = (): ChatCallAdapterX | null => current?.adapter ?? null;

/** 로그아웃 — 통화 중이면 나가고 구독을 끊는다 */
export function dropChatCall() {
  if (!current) return;
  const st = current.adapter.getState();
  if (current.adapter.controller) current.adapter.controller.dispose();
  else if (st.phase !== 'idle' && st.phase !== 'ended') void current.adapter.leave();
  ring.stop();
  current.off();
  current = null;
  snapshot = IDLE;
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** 앱 전체 통화 — 켜져 있고 채팅을 쓸 수 있는 계정일 때만 연결을 만든다 */
export function useChatCall(): { enabled: boolean; state: ChatCallView; adapter: ChatCallAdapterX | null; me: ChatCallMe | null } {
  const { userData } = useAuth();
  const uid = userData?.userId ?? '';
  const enabled = chatCallsEnabled() && !!uid && isChatStaff(userData as unknown as ChatUserLike);
  const name = String(userData?.name ?? '');
  const photo = typeof userData?.profileImage === 'string' && /^https?:\/\//.test(userData.profileImage) ? userData.profileImage : undefined;

  useEffect(() => {
    if (enabled) ensureChatCall({ uid, name, photo });
    // 로그아웃일 때만 끊는다 — 앱이 잠금화면 통화로 깨어나 사용자 정보를 읽는 중(userData 가 아직 없음)에는 통화를 이어 간다
    else if (!uid && !auth.currentUser) dropChatCall();
  }, [enabled, uid, name, photo]);

  const state = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const adapter = enabled && current?.uid === uid ? current.adapter : null;
  return { enabled, state: adapter ? state : IDLE, adapter, me: enabled ? { uid, name, photo } : null };
}
