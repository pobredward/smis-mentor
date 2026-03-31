'use client';

import * as Sentry from '@sentry/nextjs';

export default function SentryTestPage() {
  const testLoggerError = () => {
    console.error('Logger 테스트 에러 (콘솔)', new Error('logger.error() 테스트'));
    Sentry.captureMessage('Logger 테스트 에러', {
      level: 'error',
      extra: { source: 'logger test button' },
    });
  };

  const testSentryException = () => {
    try {
      throw new Error('Sentry 직접 전송 테스트');
    } catch (error) {
      Sentry.captureException(error);
    }
  };

  const testSentryMessage = () => {
    Sentry.captureMessage('Sentry 메시지 테스트', {
      level: 'warning',
      tags: { test: true },
    });
  };

  const testUncaughtError = () => {
    throw new Error('Uncaught 에러 테스트 - 이 에러는 자동으로 Sentry에 전송됩니다');
  };

  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Sentry 테스트 페이지</h1>
      <p>
        이 페이지는 Sentry가 올바르게 동작하는지 테스트하기 위한 페이지입니다.
        <br />
        각 버튼을 클릭하면 Sentry 대시보드에 이벤트가 전송됩니다.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '32px' }}>
        <button
          onClick={testLoggerError}
          style={{
            padding: '16px',
            fontSize: '16px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          1. logger.error() 테스트
        </button>

        <button
          onClick={testSentryException}
          style={{
            padding: '16px',
            fontSize: '16px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          2. Sentry.captureException() 테스트
        </button>

        <button
          onClick={testSentryMessage}
          style={{
            padding: '16px',
            fontSize: '16px',
            backgroundColor: '#FF9800',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          3. Sentry.captureMessage() 테스트
        </button>

        <button
          onClick={testUncaughtError}
          style={{
            padding: '16px',
            fontSize: '16px',
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          4. Uncaught Error 테스트 (자동 수집)
        </button>
      </div>

      <div style={{ marginTop: '32px', padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
        <h3>테스트 방법</h3>
        <ol>
          <li>개발 서버 실행: <code>npm run dev --workspace=packages/web</code></li>
          <li>이 페이지 접속: <code>http://localhost:3000/sentry-test</code></li>
          <li>각 버튼을 순서대로 클릭</li>
          <li>Sentry 대시보드 확인: <a href="https://sentry.io" target="_blank">https://sentry.io</a></li>
          <li>Issues 탭에서 4개의 이벤트가 수집되었는지 확인</li>
        </ol>
        <p><strong>참고:</strong> 개발 환경에서는 전송이 비활성화되어 있으므로, 프로덕션 빌드로 테스트하거나 설정 파일에서 <code>debug: true</code>로 변경하여 테스트하세요.</p>
      </div>
    </div>
  );
}
