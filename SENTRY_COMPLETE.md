# Sentry 에러 모니터링 설정 완료

## ✅ 작업 완료

### 1. 패키지 설치
- `@sentry/nextjs` (웹)
- `@sentry/react-native` (모바일)

### 2. 설정 파일 생성

#### Web
- `sentry.client.config.ts` - 클라이언트 설정 (Session Replay)
- `sentry.server.config.ts` - 서버 설정
- `sentry.edge.config.ts` - Edge Runtime 설정
- `instrumentation.ts` - Next.js 통합
- `next.config.ts` - Sentry 빌드 통합

#### Mobile
- `sentry.config.ts` - React Native 설정
- `App.tsx` - Sentry 초기화

### 3. 환경변수 설정
- `packages/web/.env.local` - DSN, ORG, PROJECT, AUTH_TOKEN ✅
- `packages/mobile/.env.local` - DSN, ORG, PROJECT, AUTH_TOKEN ✅

### 4. 동작 테스트
- Sentry Wizard 연동 완료 ✅
- Feed에 에러 이벤트 수집 확인 ✅

---

## 🎯 주요 기능

### 자동 에러 수집
- JavaScript 런타임 에러
- Unhandled Promise Rejection
- API 호출 실패
- React 렌더링 에러

### 성능 모니터링
- 페이지 로드 시간 추적 (10% 샘플링)
- API 응답 시간 측정
- React Native 네이티브 프레임 추적

### Session Replay (웹)
- 에러 발생 시 사용자 세션 100% 기록
- 민감 정보 자동 마스킹

### 보안
- 비밀번호/토큰 자동 제거
- 이메일 마스킹
- Authorization 헤더 삭제

---

## 📖 사용법

### logger 통합 (권장)
```typescript
import { logger } from '@smis-mentor/shared';

// 개발: 콘솔 출력만
// 프로덕션: 콘솔 + Sentry 전송 (현재는 Sentry 설정파일에서만)
logger.error('사용자 로드 실패', error);
logger.warn('데이터 정합성 이슈', { userId });
```

### 직접 사용
```typescript
import * as Sentry from '@sentry/nextjs'; // 또는 @sentry/react-native

Sentry.captureException(error);
Sentry.captureMessage('중요 이벤트', { level: 'info' });
Sentry.setUser({ id: user.uid, email: user.email });
```

---

## 🔔 Sentry 대시보드 활용

### Issues
- 실시간 에러 모니터링
- 빈도/영향도별 우선순위
- 에러 해결 여부 추적

### Performance
- 트랜잭션별 성능 분석
- 느린 API 엔드포인트 식별
- 페이지 로드 시간 비교

### Alerts
- 이메일/Slack 알림 설정
- 특정 에러 임계값 설정
- 팀원별 알림 규칙

---

## 🚀 다음 단계

### 즉시 가능
1. Alert 규칙 세부 조정 (Sentry > Alerts)
2. 팀원 초대 (Sentry > Settings > Members)
3. Slack/Discord 연동 (선택)

### 향후 권장
1. **성능 모니터링 (Web Vitals)** - CLS, FCP, LCP 측정
2. **API 문서화 (Swagger)** - 엔드포인트 자동 문서화
3. **E2E 테스트** - Playwright 도입

---

## 📂 생성된 파일

- `packages/web/sentry.client.config.ts`
- `packages/web/sentry.server.config.ts`
- `packages/web/sentry.edge.config.ts`
- `packages/web/instrumentation.ts`
- `packages/mobile/sentry.config.ts`
- `SENTRY_SETUP_GUIDE.md`

프로덕션 배포 후 실제 사용자 에러가 수집되기 시작합니다!
