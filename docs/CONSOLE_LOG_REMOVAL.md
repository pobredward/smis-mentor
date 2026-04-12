# Console.log 제거 가이드

프로덕션 환경에서 보안과 성능을 위해 불필요한 console 로그를 자동으로 제거합니다.

## 설정 내용

### 1. Web (Next.js)
- **파일**: `packages/web/next.config.js`
- **설정**: Next.js 15의 내장 `compiler.removeConsole` 옵션 사용
- **동작**: 
  - 프로덕션 빌드 시 `console.log`, `console.info`, `console.debug` 제거
  - `console.error`, `console.warn`은 유지 (에러 추적용)

### 2. Mobile (React Native + Expo)
- **파일**: `packages/mobile/babel.config.js`
- **설정**: `babel-plugin-transform-remove-console` 플러그인 사용
- **동작**:
  - 프로덕션 빌드 시 `console.log`, `console.info`, `console.debug` 제거
  - `console.error`, `console.warn`은 유지 (에러 추적용)

### 3. Shared (공유 로거)
- **파일**: `packages/shared/src/utils/logger.ts`
- **개선**: 
  - 프로덕션 환경 감지 개선 (Node.js + React Native 모두 지원)
  - 프로덕션에서는 `debug`/`info` 로그 자동 비활성화
  - `warn`/`error`는 항상 출력

## 사용법

### 개발 환경
```typescript
// 모든 로그가 정상적으로 출력됨
console.log('디버그 정보');
console.info('정보 메시지');
console.warn('경고 메시지');
console.error('에러 메시지');

// logger 사용 (권장)
import { logger } from '@smis-mentor/shared/utils/logger';

logger.debug('디버그 정보');
logger.info('정보 메시지');
logger.warn('경고 메시지');
logger.error('에러 메시지');
```

### 프로덕션 환경
```typescript
// ❌ 제거됨 (빌드 시 코드에서 사라짐)
console.log('디버그 정보');
console.info('정보 메시지');

// ✅ 유지됨 (에러 추적용)
console.warn('경고 메시지');
console.error('에러 메시지');

// logger 사용 시
logger.debug('디버그 정보');  // 출력되지 않음
logger.info('정보 메시지');   // 출력되지 않음
logger.warn('경고 메시지');   // 출력됨
logger.error('에러 메시지');  // 출력됨
```

## 권장 사항

### 1. Logger 사용 권장
직접 `console.*` 대신 `logger`를 사용하는 것을 권장합니다:

```typescript
// ❌ 직접 console 사용
console.log('사용자 ID:', userId);

// ✅ logger 사용 (권장)
import { logger } from '@smis-mentor/shared/utils/logger';
logger.debug('사용자 ID:', userId);
```

**장점**:
- 타임스탬프 자동 추가
- 로그 레벨 구분
- 환경별 자동 제어
- 향후 Sentry 등 로깅 서비스 통합 용이

### 2. 민감 정보 로그 금지
개발 환경에서도 민감한 정보는 로그에 출력하지 않습니다:

```typescript
// ❌ 절대 금지
console.log('비밀번호:', password);
console.log('API 키:', apiKey);
console.log('토큰:', token);
console.log('주민번호:', ssn);
console.log('여권번호:', passportNumber);

// ✅ 안전한 로그
logger.debug('사용자 인증 성공', { userId: user.id });
logger.error('API 호출 실패', { endpoint: '/api/users', status: 401 });
```

### 3. 에러 로그는 적극 사용
`console.error`와 `console.warn`은 프로덕션에서도 유지되므로 적극적으로 사용:

```typescript
// ✅ 에러 추적용
try {
  await updateUser(userId, data);
} catch (error) {
  logger.error('사용자 업데이트 실패:', error);
  // 또는
  console.error('사용자 업데이트 실패:', error);
}

// ✅ 경고 메시지
if (!user.email) {
  logger.warn('이메일이 없는 사용자:', { userId: user.id });
}
```

## 빌드 확인

### Web
```bash
cd packages/web
npm run build

# 빌드 후 .next 폴더에서 console.log가 제거되었는지 확인
```

### Mobile
```bash
cd packages/mobile

# 프로덕션 빌드 (iOS)
npm run build:prod:ios

# 프로덕션 빌드 (Android)
npm run build:prod:android
```

## 문제 해결

### 개발 환경에서 로그가 안 보이는 경우
1. `NODE_ENV`가 `development`인지 확인
2. React Native: `__DEV__` 플래그 확인
3. 캐시 초기화:
   ```bash
   # Web
   rm -rf packages/web/.next
   
   # Mobile
   cd packages/mobile
   npm run start:clear
   ```

### 프로덕션에서 console.log가 여전히 보이는 경우
1. 빌드가 제대로 되었는지 확인
2. 환경 변수 확인:
   ```bash
   echo $NODE_ENV  # production 이어야 함
   ```
3. 번들 파일 직접 확인하여 console.log 제거 여부 확인
