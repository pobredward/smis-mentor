/**
 * OS 통화 화면 연결 자리 (iOS CallKit · Android ConnectionService) — 잠금화면 수신.
 * 실제 구현은 nativeCallsImpl.ts 가 setNativeCalls() 로 끼운다. 끼우지 않았으면(Expo Go · 아직 준비 안 됨) 아무것도 안 하고
 * 앱 안 벨 화면이 대신한다.
 */
import type { CallController, ChatCallDoc, ChatCallState } from '@smis-mentor/shared';

export interface NativeCalls {
  /** OS 수신 화면이 벨을 맡는가 (true 면 앱 안 벨 화면 · 진동을 쓰지 않는다) */
  handlesIncoming(): boolean;
  /** 걸려 온 통화를 OS 에 알리기 (VoIP 푸시로 이미 알렸으면 건너뛴다) */
  reportIncoming(call: ChatCallDoc, callerName: string): void;
  /** 내가 1:1 을 걸었음 · 연결됨 · 끝남 */
  reportOutgoing(call: ChatCallDoc, peerName: string): void;
  reportConnected(callId: string): void;
  reportEnded(callId: string, reason: ChatCallState['endedReason']): void;
  /** 마이크 상태를 OS 화면과 맞추기 */
  setMuted(callId: string, muted: boolean): void;
  /** 앱 통화 연결이 만들어졌다 — OS 화면에서 먼저 받은 통화를 이어서 처리한다 */
  onController?(c: CallController): void;
}

const NONE: NativeCalls = {
  handlesIncoming: () => false,
  reportIncoming: () => undefined,
  reportOutgoing: () => undefined,
  reportConnected: () => undefined,
  reportEnded: () => undefined,
  setMuted: () => undefined,
};

let current: NativeCalls = NONE;
export const nativeCalls = (): NativeCalls => current;
export function setNativeCalls(n: NativeCalls | null) {
  current = n ?? NONE;
}
