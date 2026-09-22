import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Expo Go 앱에서 실행 중인지 (Development Build · 스토어 빌드가 아님)
 * Expo Go에는 커스텀 네이티브 모듈(RNGoogleSignin 등)이 없어서, import 하는 순간 모듈 초기화 오류가
 * 빨간 화면(Uncaught Error)으로 뜬다. try/catch로는 막히지 않으므로 import 전에 이걸로 걸러야 한다.
 */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient || Constants.appOwnership === 'expo';
}
