/**
 * 통합 로깅 유틸리티
 * 환경별로 적절한 로그 레벨을 제공합니다.
 * Sentry와 통합하여 프로덕션 에러를 추적합니다.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enableDebug: boolean;
  enableInfo: boolean;
}

class Logger {
  private config: LoggerConfig;

  constructor() {
    const isDevelopment = typeof process !== 'undefined' 
      ? process.env.NODE_ENV === 'development'
      : true;

    this.config = {
      enableDebug: isDevelopment,
      enableInfo: true,
    };
  }

  private log(level: LogLevel, ...args: unknown[]): void {
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
