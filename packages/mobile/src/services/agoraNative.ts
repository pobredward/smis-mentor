/**
 * react-native-agora 를 필요할 때만 불러온다.
 * Expo Go · 예전 개발 빌드처럼 네이티브 모듈이 없는 앱에서 import 하면 바로 'not linked' 오류로 앱이 멈추기 때문 —
 * 없으면 통화는 가짜 연결(개발 환경)로 돌아간다 (services/chatCalls.ts chatCallsReal).
 */
import { NativeModules, TurboModuleRegistry } from 'react-native';

type Agora = typeof import('react-native-agora');

let linked: boolean | undefined;
/** 이 앱에 Agora 네이티브 모듈이 들어 있는가 */
export function agoraLinked(): boolean {
  if (linked !== undefined) return linked;
  try {
    linked = !!(TurboModuleRegistry.get('AgoraRtcNg') ?? NativeModules.AgoraRtcNg);
  } catch {
    linked = false;
  }
  return linked;
}

let mod: Agora | null = null;
/** react-native-agora (agoraLinked() 일 때만 부를 것) */
export function loadAgora(): Agora {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!mod) mod = require('react-native-agora') as Agora;
  return mod;
}
