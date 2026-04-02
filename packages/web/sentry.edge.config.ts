import * as Sentry from '@sentry/nextjs';

// 임시 비활성화
const SENTRY_DISABLED = true;

if (!SENTRY_DISABLED) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    
    // 환경 설정
    environment: process.env.NODE_ENV,
    
    // Edge Runtime은 트레이싱 비율 낮게
    tracesSampleRate: 0.05,
    
    // 디버그 모드
    debug: process.env.NODE_ENV === 'development',
    
    // Edge Runtime에서는 Replay 비활성화
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  });
}
