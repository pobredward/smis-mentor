# Sentry 에러 모니터링 설정 완료 보고서

## 📋 작업 요약

### ✅ 완료 항목

1. **불필요한 MD 파일 정리**
   - 22개 → 9개로 축소
   - 삭제된 문서: 임시 작업 보고서, Phase 완료 문서, 분석 문서 등

2. **Sentry 패키지 설치**
   - `@sentry/nextjs` (웹)
   - `@sentry/react-native` (모바일)

3. **웹 패키지 Sentry 통합**
   - `sentry.client.config.ts` - 클라이언트 설정 (Session Replay 포함)
   - `sentry.server.config.ts` - 서버 설정
   - `sentry.edge.config.ts` - Edge Runtime 설정
   - `instrumentation.ts` - Next.js 계측
   - `next.config.ts` - Sentry 빌드 통합

4. **모바일 패키지 Sentry 통합**
   - `sentry.config.ts` - React Native 설정
   - `App.tsx` - Sentry 초기화

5. **환경변수 템플릿 추가**
   - `packages/web/.env.local` - Sentry DSN 주석 추가
   - `packages/mobile/.env.local` - Sentry DSN 주석 추가

6. **설정 가이드 문서**
   - `SENTRY_SETUP_GUIDE.md` 생성

7. **빌드 검증**
   - Shared 패키지 빌드 ✅
   - Web 패키지 빌드 ✅
   - Mobile 타입스크립트 체크 ✅ (기존 에러 외 문제 없음)

---

## 🔧 Sentry 주요 기능

### 자동 수집
- ✅ JavaScript 런타임 에러
- ✅ Unhandled Promise Rejection
- ✅ API 호출 실패
- ✅ React 렌더링 에러

### 성능 모니터링
- ✅ 페이지 로드 성능 추적
- ✅ API 응답 시간 측정
- ✅ React Native 네이티브 프레임 추적

### Session Replay (웹 전용)
- ✅ 에러 발생 시 사용자 세션 자동 기록
- ✅ 민감 정보 마스킹 (텍스트, 미디어)

### 보안
- ✅ 비밀번호/토큰 자동 제거
- ✅ 이메일 마스킹 (`ab***@example.com`)
- ✅ Authorization 헤더 삭제
- ✅ 민감 쿼리 파라미터 제거

---

## 📝 다음 설정 단계

### 1. Sentry 계정 생성
```
https://sentry.io
```

### 2. 프로젝트 생성
- **Web**: Platform = Next.js
- **Mobile**: Platform = React Native

### 3. 환경변수 설정

#### `packages/web/.env.local`
```bash
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_ORG=your-org
SENTRY_PROJECT=smis-mentor-web
SENTRY_AUTH_TOKEN=sntrys_xxx
```

#### `packages/mobile/.env.local`
```bash
EXPO_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
```

### 4. Auth Token 생성 (소스맵 업로드용)
- Sentry > Settings > Developer Settings > Auth Tokens
- Scopes: `project:read`, `project:releases`, `org:read`

---

## 📊 예상 효과

### 에러 추적
- 실시간 에러 알림 (이메일/Slack)
- 에러 발생 빈도/영향도 분석
- 에러 해결 여부 추적

### 성능 최적화
- 느린 API 엔드포인트 식별
- 페이지별 로드 시간 비교
- 프레임 드롭 감지 (모바일)

### 디버깅 효율
- 에러 발생 환경 자동 수집 (OS, 브라우저, 버전)
- 스택 트레이스 + 소스맵
- Session Replay로 버그 재현

---

## 🚀 배포 체크리스트

- [ ] Sentry 프로젝트 생성
- [ ] DSN 및 Auth Token 발급
- [ ] 환경변수 설정 (웹/모바일)
- [ ] 프로덕션 배포
- [ ] Sentry 대시보드에서 첫 이벤트 확인
- [ ] Alert 규칙 설정
- [ ] 팀원 초대 (선택)

---

## 📂 생성된 파일

### Web
- `packages/web/sentry.client.config.ts`
- `packages/web/sentry.server.config.ts`
- `packages/web/sentry.edge.config.ts`
- `packages/web/instrumentation.ts`

### Mobile
- `packages/mobile/sentry.config.ts`

### 문서
- `SENTRY_SETUP_GUIDE.md`

---

## 💡 참고사항

- **개발 환경**: Sentry 전송 비활성화, 콘솔 로그만 출력
- **프로덕션**: 자동으로 Sentry에 에러 전송
- **샘플링 비율**: 트래픽의 10%만 수집 (비용 최적화)
- **logger 통합**: 기존 `logger.error()` / `logger.warn()` 호출은 그대로 유지
- **민감 정보**: 자동으로 필터링 및 마스킹
