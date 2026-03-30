# Web Apple 로그인 설정 가이드

## ✅ 구현 완료 항목

### 1. 서비스 생성
- ✅ `src/lib/appleAuthService.ts` 생성
  - `signInWithApplePopup()`: Firebase OAuthProvider 사용
  - `getAppleCredential()`: 계정 연동용
  - `handleAppleAuthError()`: 에러 처리

### 2. 컴포넌트 생성
- ✅ `src/components/common/AppleSignInButton.tsx` 생성
  - 검은색 배경 + 흰색 텍스트 (Apple Design Guidelines)
  - Google, 네이버와 동일한 UX

### 3. SignInClient 통합
- ✅ Apple 로그인 핸들러 추가
- ✅ UI에 Apple 로그인 버튼 추가
- ✅ 에러 처리 통합

---

## 📋 Firebase Console 설정

### 1. Firebase Console에서 Apple 로그인 활성화

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. **Authentication** → **Sign-in method** 이동
3. **Apple** 제공업체 선택
4. **사용 설정** 토글 ON
5. 다음 정보 입력:

#### Services ID (선택사항 - 웹에서 사용)
- **Services ID**: 스크린샷에서 보이는 입력 필드
- 예: `com.smis.smismentor.web`

#### OAuth 코드 흐름 구성
Apple Developer Console에서 설정한 후 돌아옴 (아래 2번 참조)

---

### 2. Apple Developer Console 설정

#### 2.1 App ID 설정
1. [Apple Developer Console](https://developer.apple.com/) 접속
2. **Certificates, Identifiers & Profiles** 이동
3. **Identifiers** → 기존 App ID(`com.smis.smismentor`) 선택
4. **Sign In with Apple** 체크박스 활성화
5. **Save**

#### 2.2 Services ID 생성 (웹 전용)
1. **Identifiers** → **+** 버튼 클릭
2. **Services IDs** 선택 → Continue
3. 정보 입력:
   - **Description**: `SMIS Mentor Web`
   - **Identifier**: `com.smis.smismentor.web`
4. **Sign In with Apple** 활성화
5. **Configure** 클릭:
   - **Primary App ID**: `com.smis.smismentor` 선택
   - **Domains**: 다음 도메인 추가
     - `smis-mentor.com`
     - `www.smis-mentor.com`
     - `smis-mentor.firebaseapp.com` (Firebase 도메인)
   - **Return URLs**: 다음 URL 추가
     - `https://smis-mentor.firebaseapp.com/__/auth/handler` (Firebase Auth 콜백)
     - `https://www.smis-mentor.com/__/auth/handler`
6. **Save** → **Continue** → **Register**

#### 2.3 Firebase Console로 돌아가기
1. Firebase Console → Authentication → Sign-in method → Apple
2. 다음 정보 입력:
   - **Services ID**: `com.smis.smismentor.web`
   - **Apple Team ID**: Apple Developer Console에서 확인
     - [Membership](https://developer.apple.com/account/#/membership/) → Team ID 복사
3. **저장** 클릭

---

## 🧪 테스트 방법

### 로컬 테스트 (localhost)

⚠️ **중요**: Apple 로그인은 localhost에서 바로 테스트할 수 없습니다.

**해결 방법:**
1. **Firebase Hosting 배포** (추천)
   ```bash
   cd packages/web
   npm run build
   firebase deploy --only hosting
   ```
   - 배포된 URL: `https://smis-mentor.firebaseapp.com`

2. **프로덕션 도메인 사용**
   - `https://www.smis-mentor.com`

### 테스트 플로우

1. 로그인 화면 접속
2. **"Apple로 계속하기"** 버튼 클릭 (검은색)
3. Apple 로그인 팝업
4. Apple ID로 로그인
5. 이름/이메일 제공 허용
6. 역할 선택 (멘토/원어민)
7. 전화번호 입력 (신규 사용자)
8. 회원가입 완료 또는 로그인 성공

---

## 🔐 보안 고려사항

### 1. Apple Privacy Policy
- Apple은 첫 로그인 시에만 이름을 제공합니다.
- 재로그인 시에는 **이메일만** 제공됩니다.
- Firebase는 이를 자동으로 처리합니다.

### 2. 이메일 숨기기 기능
- Apple "이메일 숨기기" 기능:
  - 예: `abc123xyz@privaterelay.appleid.com`
- 이 경우에도 정상 작동합니다 (고유 이메일).

### 3. 도메인 검증
- Apple Developer Console에서 등록한 도메인에서만 작동합니다.
- 테스트 시 반드시 Firebase Hosting 또는 프로덕션 도메인 사용.

---

## 📱 UI/UX

### 버튼 디자인
- **배경색**: 검은색 (`#000000`)
- **텍스트**: 흰색 (`#FFFFFF`)
- **아이콘**: Apple 로고 (FaApple from react-icons)
- **텍스트**: "Apple로 계속하기"

### 버튼 순서
1. Google (흰색 배경, 회색 테두리)
2. 네이버 (녹색)
3. **Apple (검은색)** ← 새로 추가됨

---

## 🔄 Firebase Auth 통합

### Web vs Mobile 차이점

**Web (현재 구현):**
- Firebase OAuthProvider 사용
- `signInWithPopup(auth, appleProvider)`
- Firebase Auth가 모든 것을 자동 처리
- Google과 동일한 플로우

**Mobile (expo-apple-authentication):**
- Native SDK 사용
- Custom Token으로 Firebase Auth 연동
- iOS 13+ 필수

### 장점
- ✅ Google과 동일한 코드 패턴
- ✅ Firebase Auth Provider 통합
- ✅ 계정 연동 자동 처리
- ✅ 세션 관리 간편

---

## 🐛 문제 해결

### "이 도메인에서는 Apple 로그인을 사용할 수 없습니다"
- Apple Developer Console에서 도메인 등록 확인
- Firebase Auth 콜백 URL 확인
- **해결**: Services ID 설정에서 도메인 추가

### localhost에서 작동하지 않음
- Apple은 localhost를 지원하지 않습니다.
- **해결**: Firebase Hosting 또는 프로덕션 도메인 사용

### "팝업이 차단되었습니다"
- 브라우저 팝업 차단 설정 확인
- **해결**: 브라우저 설정 → 팝업 허용

### "Apple 인증에 실패했습니다"
- Services ID와 Firebase 설정 불일치
- **해결**: Services ID를 Firebase Console과 동일하게 설정

---

## 📚 참고 자료

- [Firebase Apple 로그인 문서](https://firebase.google.com/docs/auth/web/apple)
- [Apple Sign In 가이드](https://developer.apple.com/sign-in-with-apple/get-started/)
- [Firebase Auth Handler URL](https://firebase.google.com/docs/auth/web/redirect-best-practices)

---

## ✅ 체크리스트

배포 전 확인 사항:

- [ ] Apple Developer Console에서 Services ID 생성
- [ ] Services ID에 도메인 등록 (smis-mentor.com, Firebase 도메인)
- [ ] Services ID에 Return URLs 등록 (Firebase Auth 콜백)
- [ ] Firebase Console에서 Apple 로그인 활성화
- [ ] Services ID와 Apple Team ID 입력
- [ ] Firebase Hosting 배포 또는 프로덕션 도메인에서 테스트
- [ ] Apple 로그인 → 역할 선택 → 전화번호 입력 → 회원가입/로그인 플로우 테스트
- [ ] 기존 계정에 Apple 연동 테스트
- [ ] Apple 로그아웃 후 재로그인 테스트

---

## 🎉 완료!

웹에 Apple 소셜 로그인이 성공적으로 추가되었습니다. Firebase Hosting에 배포하고 테스트하세요!

### 배포 명령어

```bash
cd packages/web
npm run build
firebase deploy --only hosting
```

배포 후 `https://smis-mentor.firebaseapp.com` 또는 `https://www.smis-mentor.com`에서 테스트하세요!
