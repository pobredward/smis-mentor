import { registerRootComponent } from 'expo';
import App from './App';
// 채팅 통화 — OS 통화 화면(CallKit · ConnectionService) 이벤트와 Android 통화 푸시 백그라운드 작업을 앱보다 먼저 잡는다
import { initNativeCalls } from './src/services/nativeCallsImpl';

initNativeCalls();
registerRootComponent(App);
