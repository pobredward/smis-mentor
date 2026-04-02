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
        
        // 쿼리 파라미터에서 민감 정보 제거
        if (event.request.query_string) {
          const queryString = event.request.query_string;
          if (queryString.includes('token') || queryString.includes('key')) {
            event.request.query_string = '[REDACTED]';
          }
        }
      }
      
      // 사용자 정보에서 민감 데이터 제거
      if (event.user) {
        delete event.user.ip_address;
        if (event.user.email) {
          event.user.email = event.user.email.replace(/(.{2}).*(@.*)/, '$1***$2');
        }
      }
      
      return event;
    },
  });
}
