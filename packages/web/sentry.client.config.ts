import * as Sentry from '@sentry/nextjs';

// 임시 비활성화
const SENTRY_DISABLED = true;

if (!SENTRY_DISABLED) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    
    // 환경 설정
    environment: process.env.NODE_ENV,
    
    // 트레이싱 샘플링 비율 (10%)
    tracesSampleRate: 0.1,
    
    // 디버그 모드 (개발 환경에서만)
    debug: process.env.NODE_ENV === 'development',
    
    // Replay 설정 (사용자 세션 재생)
    replaysSessionSampleRate: 0.1, // 세션의 10% 기록
    replaysOnErrorSampleRate: 1.0, // 에러 발생 시 100% 기록
    
    integrations: [
      Sentry.replayIntegration({
        maskAllText: true, // 모든 텍스트 마스킹
        blockAllMedia: true, // 모든 미디어 차단
      }),
    ],
    
    // 에러 전송 전 필터링
    beforeSend(event, hint) {
      // 민감 정보 제거
      if (event.request) {
        // 쿠키 제거
        delete event.request.cookies;
        
        // Authorization 헤더 제거
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.Authorization;
        }
      }
      
      // 특정 에러 무시
      const error = hint.originalException;
      if (error instanceof Error) {
        // 네트워크 에러 중 일부 무시
        if (error.message.includes('Load failed') || error.message.includes('NetworkError')) {
          return null;
        }
      }
      
      return event;
    },
    
    // 무시할 에러 패턴
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      'NotAllowedError: Permission denied',
    ],
  });
}
