# Sentry 에러 모니터링 설정 가이드

## 설치 완료

### 웹 (Next.js)
- `@sentry/nextjs` 설치 완료
- 설정 파일:
  - `sentry.client.config.ts` (클라이언트)
  - `sentry.server.config.ts` (서버)
  - `sentry.edge.config.ts` (Edge Runtime)
  - `instrumentation.ts` (Next.js 통합)
  - `next.config.ts` (Sentry 빌드 통합)

### 모바일 (React Native)
- `@sentry/react-native` 설치 완료
- 설정 파일:
  - `sentry.config.ts`
  - `App.tsx` (Sentry 초기화)

### Shared
- `logger.ts` Sentry 통합 완료
- `logger.error()` / `logger.warn()` 호출 시 프로덕션에서 자동으로 Sentry에 전송

---

## 환경변수 설정 (중요!)

### 1. Sentry 프로젝트 생성

1. https://sentry.io 접속
2. 조직(Organization) 생성 또는 선택
3. 새 프로젝트 생성:
   - **Web**: Platform = Next.js
   - **Mobile**: Platform = React Native

### 2. DSN 키 복사

각 프로젝트의 Settings > Client Keys (DSN)에서 복사

### 3. 환경변수 추가

#### `packages/web/.env.local`
```bash
# Sentry (에러 모니터링)
NEXT_PUBLIC_SENTRY_DSN=https://your-web-dsn@sentry.io/project-id
SENTRY_ORG=your-organization-slug
SENTRY_PROJECT=your-web-project-slug
SENTRY_AUTH_TOKEN=your-auth-token
```

#### `packages/mobile/.env.local`
```bash
# Sentry (에러 모니터링)
EXPO_PUBLIC_SENTRY_DSN=https://your-mobile-dsn@sentry.io/project-id
```

### 4. Auth Token 생성 (소스맵 업로드용)

1. Sentry > Settings > Developer Settings > Auth Tokens
2. Create New Token
3. Scopes: `project:read`, `project:releases`, `org:read`
4. `SENTRY_AUTH_TOKEN`에 추가

---

## 기능

### 자동 에러 수집
- JavaScript 런타임 에러
- Unhandled Promise Rejection
- API 에러 (axios, fetch)
- React 렌더링 에러

### 성능 모니터링
- 페이지 로드 성능
- API 응답 시간
- 네비게이션 성능

### 세션 재생 (웹 전용)
- 에러 발생 시 사용자 세션 자동 기록
- 버그 재현에 유용

### 민감 정보 보호
- 비밀번호, 토큰 자동 제거
- 이메일 마스킹
- Authorization 헤더 제거

---

## 사용법

### logger 통합 (자동)

```typescript
import { logger } from '@smis-mentor/shared';

// 프로덕션 환경에서 자동으로 Sentry에 전송
logger.error('사용자 로드 실패', error);
logger.warn('데이터 일관성 문제', { userId, resourceId });
```

### 수동 전송

```typescript
import * as Sentry from '@sentry/nextjs'; // 또는 '@sentry/react-native'

// 예외 전송
try {
  riskyOperation();
} catch (error) {
  Sentry.captureException(error);
}

// 메시지 전송
Sentry.captureMessage('중요한 이벤트 발생', {
  level: 'warning',
  extra: { userId: 'xxx' },
});

// 사용자 컨텍스트 설정
Sentry.setUser({
  id: user.uid,
  email: user.email,
  userType: user.userType,
});
```

---

## 다음 단계

1. Sentry 계정 생성 및 프로젝트 설정
2. 환경변수 추가 (DSN, ORG, PROJECT, AUTH_TOKEN)
3. 앱 배포 후 대시보드에서 에러 확인
4. Alert 규칙 설정 (이메일/Slack 알림)

---

## 참고

- Sentry 대시보드: https://sentry.io
- 프로덕션 환경에서만 Sentry 전송 활성화
- 개발 환경에서는 콘솔 로그만 출력
