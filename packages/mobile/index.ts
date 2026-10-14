/**
 * SMIS Mentor 는 2026-10-15 에 종료했다 — 앱은 종료 안내 화면 하나만 띄운다.
 * 코드푸시(EAS Update)로 스토어 빌드에 내려간다. react-native 기본 모듈만 쓰는 화면이라 어느 빌드에서도 열린다.
 * 예전 진입점(App · 채팅 통화 초기화)은 git 기록에 있다. 새 서비스는 SMIS CAMP.
 */
import { registerRootComponent } from 'expo';
import ClosedApp from './src/closed/ClosedApp';

registerRootComponent(ClosedApp);
