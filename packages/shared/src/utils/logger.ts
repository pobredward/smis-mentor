/**
 * 통합 로깅 유틸리티
 * 환경별로 적절한 로그 레벨을 제공합니다.
 * Sentry와 통합하여 프로덕션 에러를 추적합니다.
 * 
 * 프로덕션 환경에서는 보안을 위해 debug/info 로그가 출력되지 않습니다.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enableDebug: boolean;
  enableInfo: boolean;
  isProd: boolean;
}

class Logger {
  private config: LoggerConfig;

  constructor() {
    // Node.js 환경 (웹 서버, Cloud Functions)
    const isDevelopment = typeof process !== 'undefined' 
      ? process.env.NODE_ENV === 'development'
      : false;

    // React Native 환경 (모바일)
    const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
    const isProd = !isDevelopment && !__DEV__;

    this.config = {
      enableDebug: isDevelopment || (isReactNative && __DEV__),
      enableInfo: isDevelopment || (isReactNative && __DEV__),
      isProd,
    };
  }

  private log(level: LogLevel, ...args: unknown[]): void {
    // 프로덕션에서는 error와 warn만 출력
    if (this.config.isProd && (level === 'debug' || level === 'info')) {
      return;
    }

    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

    switch (level) {
      case 'debug':
        if (this.config.enableDebug) {
          console.log(prefix, ...args);
        }
        break;
      case 'info':
        if (this.config.enableInfo) {
          console.log(prefix, ...args);
        }
        break;
      case 'warn':
        console.warn(prefix, ...args);
        break;
      case 'error':
        console.error(prefix, ...args);
        break;
    }
  }

  debug(...args: unknown[]): void {
    this.log('debug', ...args);
  }

  info(...args: unknown[]): void {
    this.log('info', ...args);
  }

  warn(...args: unknown[]): void {
    this.log('warn', ...args);
  }

  error(...args: unknown[]): void {
    this.log('error', ...args);
  }
}

export const logger = new Logger();
