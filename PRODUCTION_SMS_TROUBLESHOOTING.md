# 프로덕션 SMS 전송 문제 해결 가이드

## 증상
- 개발 환경에서는 SMS 전송 성공
- 프로덕션 환경에서는 401/403 에러 발생

## 주요 원인 및 해결책

### 1. Vercel 환경 변수 확인 ⭐️ (가장 흔한 원인)

#### 필수 환경 변수
```bash
# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour_Private_Key_Here\n-----END PRIVATE KEY-----"

# Naver Cloud SMS
NAVER_CLOUD_SMS_SERVICE_ID=ncp:sms:kr:...
NAVER_CLOUD_SMS_ACCESS_KEY=your-access-key
NAVER_CLOUD_SMS_SECRET_KEY=your-secret-key
```

#### Vercel 환경 변수 설정 방법
1. Vercel 대시보드 → 프로젝트 선택
2. Settings → Environment Variables
3. 위 변수들을 **Production** 환경에 추가
4. **중요**: `FIREBASE_PRIVATE_KEY`는 반드시 큰따옴표로 감싸고, `\n`을 실제 줄바꿈으로 변환하지 말 것

#### 올바른 Private Key 형식
```bash
# ❌ 잘못된 형식
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASC...
-----END PRIVATE KEY-----

# ✅ 올바른 형식
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASC...\n-----END PRIVATE KEY-----"
```

### 2. Firebase Admin SDK 권한 확인

#### Service Account 권한
Firebase Console → Project Settings → Service Accounts에서:
- **Firebase Admin SDK** 탭 확인
- Service Account에 다음 권한이 있는지 확인:
  - `Firebase Authentication Admin`
  - `Cloud Datastore User`

### 3. CORS 및 도메인 설정

#### Firebase Authentication
Firebase Console → Authentication → Settings → Authorized domains에 프로덕션 도메인 추가:
- `your-domain.vercel.app`
- `your-custom-domain.com`

### 4. 프로덕션 디버깅

#### 로그 확인 방법
1. Vercel 대시보드 → 프로젝트 → Deployments → 최신 배포 클릭
2. Functions 탭 → API 라우트 로그 확인
3. 다음 로그를 찾아보세요:
   ```
   🔥 Firebase Admin SDK 초기화 시도
   ✅ Firebase Admin SDK 초기화 성공
   🔐 토큰 검증 시작
   ✅ 토큰 검증 성공
   ✅ 사용자 정보 조회 성공
   ```

#### 로컬에서 프로덕션 환경 시뮬레이션
```bash
# .env.production.local 파일 생성
cp .env.local .env.production.local

# 프로덕션 빌드 테스트
npm run build
npm run start
```

### 5. 네트워크 및 타임아웃

#### Vercel Function 타임아웃
- Free Plan: 10초
- Pro Plan: 60초
- Enterprise: 900초

SMS 전송이 타임아웃되는 경우:
```typescript
// packages/web/src/app/api/send-sms/route.ts
export const maxDuration = 30; // 초 단위 (Pro 이상 필요)
```

### 6. 소셜 로그인 사용자 문제

#### Custom Token 생성 확인
```bash
# Cloud Functions 로그 확인
firebase functions:log --only createCustomToken

# 예상 로그:
🔑 Custom Token 생성 요청: { userId: 'xxx', email: 'user@example.com' }
✅ Custom Token 생성 완료: { uid: 'xxx' }
```

### 7. 일반적인 에러 메시지

#### "인증이 필요합니다" (401)
- `auth.currentUser`가 null
- Authorization 헤더 누락
- 소셜 로그인 사용자가 Firebase Auth에 미연동
- **해결**: `apiClient.ts`의 `ensureFirebaseAuth()` 함수 확인

#### "권한이 없습니다" (403)
- 사용자 role이 허용된 역할이 아님
- 현재 허용 역할: `admin`, `mentor`, `foreign`, `mentor_temp`, `foreign_temp`

#### "Firebase Admin SDK 환경 변수가 설정되지 않았습니다"
- Vercel 환경 변수 미설정
- 환경 변수 이름 오타
- **해결**: 위 "1. Vercel 환경 변수 확인" 참고

#### "auth/id-token-expired"
- Firebase ID Token 만료 (1시간 유효)
- **해결**: 자동으로 재발급됨 (`getIdToken()` 호출 시)

#### "auth/argument-error"
- Private Key 형식 오류
- `\n`이 실제 줄바�꿈으로 변환되지 않음
- **해결**: `.replace(/\\n/g, '\n')` 처리 확인

## 체크리스트

배포 전 확인사항:
- [ ] Vercel 환경 변수 모두 설정 (Production 환경)
- [ ] Firebase Admin SDK Service Account 권한 확인
- [ ] Firebase Authentication Authorized domains에 프로덕션 도메인 추가
- [ ] Naver Cloud Platform SMS 서비스 활성화 확인
- [ ] Cloud Functions 배포 완료 (`createCustomToken`)
- [ ] 로컬에서 프로덕션 빌드 테스트

배포 후 확인사항:
- [ ] Vercel Functions 로그에서 초기화 성공 메시지 확인
- [ ] 브라우저 콘솔에서 401/403 에러 없는지 확인
- [ ] SMS 테스트 전송 성공 확인

## 긴급 디버깅

프로덕션에서 문제 발생 시:

1. **Vercel 로그 확인**
   ```
   Vercel Dashboard → Functions → /api/send-sms 로그
   ```

2. **브라우저 콘솔 확인**
   ```
   F12 → Console → Network 탭 → send-sms 요청 확인
   ```

3. **환경 변수 재확인**
   ```bash
   # Vercel CLI로 확인
   vercel env ls
   ```

4. **재배포**
   ```bash
   # 환경 변수 변경 후 반드시 재배포
   git commit --allow-empty -m "Redeploy"
   git push
   ```

## 추가 도움이 필요한 경우

로그 파일에서 다음 정보를 수집하여 공유:
1. Vercel Functions 로그 (API route)
2. 브라우저 콘솔 에러 메시지
3. Network 탭의 요청/응답 헤더
4. Firebase Admin SDK 초기화 로그
