import * as Sentry from '@sentry/react-native';

// Sentry 초기화 (앱 시작 시 한 번만)
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  
  // 환경 설정
  environment: __DEV__ ? 'development' : 'production',
  
  // 디버그 모드 (개발 환경에서만)
  debug: __DEV__,
  
  // 트레이싱 샘플링 (10%)
  tracesSampleRate: 0.1,
  
  // 프로파일링 샘플링
  profilesSampleRate: 0.1,
  
  // 에러 전송 전 필터링
  beforeSend(event, hint) {
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
    
    // 스크린샷 (에러 발생 시)
    Sentry.screenshotIntegration({
      quality: 0.7,
    }),
  ],
  
  // 무시할 에러
  ignoreErrors: [
    'Network request failed',
    'Aborted',
    'cancelled',
  ],
});

export default Sentry;
