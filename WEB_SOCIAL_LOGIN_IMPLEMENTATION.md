# Web 소셜 로그인 구현 완료

## 개요
Web 버전에 Google 소셜 로그인이 성공적으로 구현되었습니다. Mobile과 동일한 플로우를 따릅니다.

## 구현된 파일

### 1. 서비스 레이어
- **`packages/web/src/lib/googleAuthService.ts`**
  - Firebase의 `signInWithPopup` (데스크톱) 및 `signInWithRedirect` (모바일) 사용
  - 자동으로 기기를 감지하여 적절한 방식 선택
  - `SocialUserData` 추출 및 에러 처리

### 2. UI 컴포넌트
- **`packages/web/src/components/common/GoogleSignInButton.tsx`**
  - 재사용 가능한 Google 로그인 버튼 컴포넌트
  - 로딩 상태 관리

- **`packages/web/src/components/common/PhoneInputModal.tsx`**
  - 전화번호 입력 모달
  - 소셜 로그인 후 계정 확인용

- **`packages/web/src/components/common/PasswordInputModal.tsx`**
  - 비밀번호 입력 모달
  - 기존 계정과 소셜 계정 연동용

### 3. 페이지 통합
- **`packages/web/src/app/sign-in/SignInClient.tsx`**
  - Google 로그인 버튼 추가
  - 소셜 로그인 플로우 핸들러 구현:
    - `handleGoogleSignInSuccess`: 성공 시 처리
    - `handlePhoneSubmit`: 전화번호로 temp 계정 확인
    - `handlePasswordSubmit`: 기존 계정과 연동
  - 리다이렉트 결과 자동 확인 (모바일용)

- **`packages/web/src/app/sign-up/account/page.tsx`**
  - 소셜 로그인 파라미터 전달 지원
  - `socialSignUp`, `tempUserId`, `socialProvider` 파라미터 처리

- **`packages/web/src/app/sign-up/foreign/account/page.tsx`**
  - Foreign 회원가입에 소셜 로그인 파라미터 추가

## 소셜 로그인 플로우

### 시나리오 1: 신규 사용자 (이메일 & 전화번호 모두 없음)
1. Google 로그인 버튼 클릭
2. Google 인증 완료
3. 전화번호 입력 모달 표시
4. 전화번호 입력 후 temp 계정 확인
5. temp 계정이 없으면 역할 선택 페이지로 이동
6. 회원가입 플로우 진행 (2단계 이메일 스킵)

### 시나리오 2: Temp 계정이 있는 사용자
1. Google 로그인 버튼 클릭
2. Google 인증 완료
3. 전화번호 입력 모달 표시
4. 전화번호로 temp 계정 발견
5. 해당 역할의 회원가입 페이지로 이동하여 활성화

### 시나리오 3: 기존 소셜 계정 사용자
1. Google 로그인 버튼 클릭
2. Google 인증 완료
3. 기존 계정 확인 → 바로 로그인 완료

### 시나리오 4: 기존 이메일/비밀번호 계정이 있는 사용자
1. Google 로그인 버튼 클릭
2. Google 인증 완료
3. 이메일로 기존 계정 발견
4. 비밀번호 입력 모달 표시
5. 비밀번호 입력 후 Google 계정 연동
6. 로그인 완료

## 환경 변수 설정

`packages/web/.env.local` 파일을 생성하고 다음 값을 설정하세요:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id

# Google OAuth Web Client ID
NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
```

## Google Cloud Console 설정

### 1. OAuth 동의 화면 설정
- Google Cloud Console → APIs & Services → OAuth consent screen
- 앱 이름, 지원 이메일, 개발자 연락처 정보 입력
- 범위 추가: `email`, `profile`, `openid`

### 2. OAuth 2.0 클라이언트 ID 생성 (Web)
- Google Cloud Console → APIs & Services → Credentials
- "Create Credentials" → "OAuth client ID"
- Application type: **Web application**
- Authorized JavaScript origins:
  - `http://localhost:3000` (개발용)
  - `https://yourdomain.com` (프로덕션)
- Authorized redirect URIs:
  - `http://localhost:3000` (개발용)
  - `https://yourdomain.com` (프로덕션)

### 3. Client ID 복사
- 생성된 Web Client ID를 복사하여 `.env.local`의 `NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID`에 설정

## 테스트 방법

### 로컬 개발 환경
1. 환경 변수 설정 완료
2. `npm run dev` 실행
3. 로그인 페이지로 이동
4. "Google로 계속하기" 버튼 클릭
5. 각 시나리오별 플로우 테스트

### 모바일 브라우저 테스트
- 모바일 브라우저에서는 자동으로 redirect 방식 사용
- 팝업 차단 걱정 없음

### 데스크톱 브라우저 테스트
- 데스크톱에서는 popup 방식 사용
- 더 나은 UX

## 주요 특징

### 🎯 플랫폼 자동 감지
- 모바일: `signInWithRedirect` 사용
- 데스크톱: `signInWithPopup` 사용

### 🔒 보안
- Firebase Authentication 기반
- 기존 계정 연동 시 비밀번호 재확인 필수

### 🔄 Shared 패키지 활용
- `@smis-mentor/shared`의 `socialAuthService` 사용
- Mobile과 Web에서 동일한 비즈니스 로직 공유

### ✨ 사용자 경험
- 회원가입 시 이메일 입력 단계 스킵
- temp 계정 자동 연동
- 기존 계정과의 안전한 연동

## 다음 단계

### 추가 소셜 로그인 구현 (예정)
1. Apple Sign In (iOS)
2. Kakao Login
3. Naver Login

### 개선 사항
- 소셜 계정 연동 해제 기능
- 프로필에서 연동된 계정 표시
- 여러 소셜 계정 동시 연동 지원

## 문제 해결

### 팝업이 차단되는 경우
- 브라우저의 팝업 차단 설정 확인
- 모바일에서는 자동으로 redirect 방식 사용

### 리다이렉트가 작동하지 않는 경우
- Google Cloud Console에서 redirect URI 확인
- `Authorized redirect URIs`에 현재 도메인 추가 필요

### "auth/popup-closed-by-user" 에러
- 사용자가 팝업을 닫은 경우
- 다시 시도하도록 안내

## 참고 자료
- [Firebase Authentication - Google Sign In](https://firebase.google.com/docs/auth/web/google-signin)
- [Google Cloud Console](https://console.cloud.google.com/)
- Mobile 구현: `packages/mobile/src/services/googleAuthService.ts`
- Shared 로직: `packages/shared/src/services/socialAuthService.ts`
