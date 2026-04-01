import * as Sentry from '@sentry/react-native';

// Sentry 초기화 (앱 시작 시 한 번만)
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  
  // 환경 설정
  environment: __DEV__ ? 'development' : 'production',
  
  // 디버그 모드 (개발 환경에서만)
  debug: __DEV__,
  
  // 트레이싱 샘플링 (개발: 100%, 프로덕션: 10%)
  tracesSampleRate: __DEV__ ? 1.0 : 0.1,
  
  // 에러 전송 전 필터링
  beforeSend(event, hint) {
    // 개발 환경에서는 에러를 콘솔에도 출력
    if (__DEV__) {
      console.error('Sentry captured error:', event);
    }
    
    // 민감 정보 제거
    if (event.user) {
      delete event.user.ip_address;
      if (event.user.email) {
        // 이메일 일부 마스킹
        event.user.email = event.user.email.replace(/(.{2}).*(@.*)/, '$1***$2');
      }
    }
    
    // Request 데이터에서 민감 정보 제거
    if (event.request?.data) {
      const data = event.request.data as any;
      if (data.password) data.password = '[REDACTED]';
      if (data.token) data.token = '[REDACTED]';
      if (data.apiKey) data.apiKey = '[REDACTED]';
      if (data.ssn) data.ssn = '[REDACTED]';
      if (data.passportNumber) data.passportNumber = '[REDACTED]';
    }
    
    return event;
  },
  
  // 통합 설정
  integrations: [
    // React Native 성능 추적
    Sentry.reactNativeTracingIntegration({
      enableNativeFramesTracking: true,
      enableStallTracking: true,
    }),
  ],
  
  // 무시할 에러 (네트워크 에러는 추적하지 않음)
  ignoreErrors: [
    'Network request failed',
    'Aborted',
    'cancelled',
    'timeout',
  ],
});

export default Sentry;
