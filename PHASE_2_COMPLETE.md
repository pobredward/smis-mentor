# Phase 2 완료: SignInScreen 통합 및 Google 로그인 플로우 ✅

## 완료 항목

### 1. Google Sign In 설정 ✅

#### Web Client ID 설정
- ✅ `google-services.json`에서 Web Client ID 확인
- ✅ `packages/mobile/src/services/googleAuthService.ts` 업데이트
  - Web Client ID: `382190683951-d213f6sqm30lokbddeth6g2gucava2en.apps.googleusercontent.com`

#### App 초기화
- ✅ `packages/mobile/App.tsx` 업데이트
  - `configureGoogleSignIn()` 초기화 추가
  - useEffect에서 실행

### 2. SignInScreen 통합 ✅

#### Import 추가
- ✅ `GoogleSignInButton`, `PhoneInputModal`, `PasswordInputModal` 컴포넌트 import
- ✅ Shared 서비스 함수들 import
  - `handleSocialLogin`
  - `checkTempAccountByPhone`
  - `linkSocialToExistingAccount`
  - `handleSocialAuthError`
  - `getSocialProviderName`

#### 상태 관리
- ✅ 소셜 로그인 관련 상태 추가
  - `showPhoneModal` - 전화번호 입력 모달 표시 여부
  - `showPasswordModal` - 비밀번호 입력 모달 표시 여부
  - `socialData` - 소셜 로그인 사용자 데이터
  - `existingUserEmail` - 기존 계정 이메일 (연동 시)

#### 핸들러 함수
- ✅ `handleGoogleSignInSuccess()` - Google 로그인 성공 처리
- ✅ `handleGoogleSignInError()` - Google 로그인 에러 처리
- ✅ `handlePhoneSubmit()` - 전화번호 입력 후 temp 계정 확인
- ✅ `handlePasswordSubmit()` - 비밀번호 입력 후 기존 계정 연동
- ✅ `handleForgotPasswordFromModal()` - 모달에서 비밀번호 찾기

### 3. UI 업데이트 ✅

#### 소셜 로그인 버튼
- ✅ 구분선 ("또는") 추가
- ✅ Google 로그인 버튼 배치
- ✅ 스타일링 완료

#### 모달 컴포넌트
- ✅ `PhoneInputModal` 연동
- ✅ `PasswordInputModal` 연동

## 구현된 플로우

### 시나리오 1: 신규 사용자 (소셜 로그인)
```
Google 로그인 버튼 클릭
  ↓
Google OAuth 인증
  ↓
이메일로 계정 검색 → 없음
  ↓
전화번호 입력 모달 표시
  ↓
전화번호 입력
  ↓
temp 계정 없음
  ↓
회원가입 화면으로 이동 (TODO: Phase 3)
```

### 시나리오 2: temp 계정 있는 사용자
```
Google 로그인 버튼 클릭
  ↓
Google OAuth 인증
  ↓
이메일로 계정 검색 → 없음
  ↓
전화번호 입력 모달 표시
  ↓
전화번호 입력
  ↓
temp 계정 발견 + 이름 일치
  ↓
연동 확인 Alert
  ↓
[연동하기] 선택
  ↓
회원가입 플로우로 이동 (TODO: Phase 3)
```

### 시나리오 3: 기존 active 계정 (같은 이메일)
```
Google 로그인 버튼 클릭
  ↓
Google OAuth 인증
  ↓
이메일로 계정 검색 → active 발견
  ↓
즉시 로그인 완료 ✅
```

### 시나리오 4: 기존 active 계정 (다른 이메일)
```
Google 로그인 버튼 클릭
  ↓
Google OAuth 인증
  ↓
이메일로 계정 검색 → 없음
  ↓
전화번호 입력 모달 표시
  ↓
전화번호 입력
  ↓
active 계정 발견
  ↓
계정 연결 확인 Alert
  ↓
[계정 연결] 선택
  ↓
비밀번호 입력 모달 표시
  ↓
비밀번호 입력
  ↓
기존 계정으로 로그인
  ↓
Firebase Auth에 Google 제공자 연결
  ↓
Firestore authProviders 업데이트
  ↓
연결 완료! ✅
```

## 업데이트된 파일

```
✅ packages/mobile/src/services/googleAuthService.ts
   - Web Client ID 설정

✅ packages/mobile/App.tsx
   - Google Sign In 초기화 추가

✅ packages/mobile/src/screens/SignInScreen.tsx
   - Import 추가
   - 상태 관리 추가
   - 소셜 로그인 핸들러 함수들 추가
   - UI 업데이트 (Google 버튼, 모달)
   - 스타일 추가
```

## UI 미리보기

### 로그인 화면
```
┌─────────────────────────┐
│         SMIS            │
│  SMIS English Camp      │
│  Recruiting Page        │
├─────────────────────────┤
│ 이메일 / Email          │
│ [_________________]     │
│                         │
│ 비밀번호 / Password     │
│ [_________________] 👁   │
│                         │
│ ☐ 로그인 저장 (30일)    │
│                         │
│ [     로그인     ]      │
│                         │
│ 비밀번호 찾기  회원가입  │
│                         │
│ ─────── 또는 ──────     │
│                         │
│ [🔵 Google로 계속하기]  │ ← 새로 추가!
└─────────────────────────┘
```

## 테스트 체크리스트

### 기본 동작
- [ ] Google 로그인 버튼이 표시되는지 확인
- [ ] Google 로그인 버튼 클릭 시 Google OAuth 화면 표시
- [ ] Google 로그인 성공 시 전화번호 모달 표시
- [ ] 전화번호 입력 시 유효성 검사 동작

### 소셜 로그인 플로우
- [ ] 신규 사용자: 회원가입 화면으로 이동
- [ ] temp 계정: 연동 확인 Alert 표시
- [ ] 기존 active (같은 이메일): 즉시 로그인
- [ ] 기존 active (다른 이메일): 계정 연결 플로우

### 에러 처리
- [ ] Google 로그인 취소 시 에러 메시지
- [ ] 네트워크 오류 시 에러 메시지
- [ ] 비밀번호 불일치 시 재시도/비밀번호 찾기 옵션

### 모달
- [ ] 전화번호 입력 모달 표시/숨김
- [ ] 비밀번호 입력 모달 표시/숨김
- [ ] 모달 취소 시 정상 동작

## 알려진 제한사항

### Phase 3에서 구현 필요
1. **회원가입 플로우 통합**
   - 소셜 로그인 후 회원가입 화면으로 이동
   - Step 2 (이메일/비밀번호) 건너뛰기
   - temp 계정 연동 시 나머지 정보 입력

2. **SignUpFlow 컴포넌트**
   - 소셜 로그인 상태 관리
   - 단계별 플로우 제어
   - Firestore 업데이트

## 다음 단계: Phase 3

### Phase 3 작업 목록

1. **SignUpFlow 컴포넌트 생성**
   - 소셜/일반 회원가입 통합
   - 단계별 상태 관리
   - Step 2 조건부 렌더링

2. **SignUpStep1Screen 수정**
   - `isSocialSignUp` prop 추가
   - 소셜 로그인 데이터 처리
   - temp 계정 연동 로직

3. **회원가입 완료 처리**
   - temp 계정 활성화
   - 신규 소셜 계정 생성
   - Firestore 업데이트

4. **네비게이션 통합**
   - 소셜 로그인 → 회원가입 플로우
   - 역할 선택 → SignUpFlow

## 환경 설정

### Firebase Console 설정 확인
- ✅ Authentication > Sign-in method > Google 활성화
- ✅ Android SHA-1 인증서 등록 필요 (EAS Build 시)
- ✅ iOS 번들 ID 등록 확인

### 빌드 설정
```bash
# Android 빌드 (개발용)
npx expo prebuild --platform android
npx expo run:android

# iOS 빌드 (개발용)
npx expo prebuild --platform ios
npx expo run:ios
```

## Phase 2 완료! 🎉

Google 로그인 기본 플로우가 완성되었습니다.
다음은 Phase 3 (회원가입 플로우 통합)으로 진행합니다.
