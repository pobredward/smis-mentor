# Apple 로그인 설정 가이드

## ✅ 구현 완료 항목

### 1. 패키지 설치
- ✅ `expo-apple-authentication` 패키지 설치 완료

### 2. 서비스 생성
- ✅ `src/services/appleAuthService.ts` 생성
  - `signInWithApple()`: 애플 로그인 메인 함수
  - `isAppleAuthAvailable()`: iOS 13+ 확인 함수
  - `signOutApple()`: 로그아웃 함수

### 3. 컴포넌트 생성
- ✅ `src/components/AppleSignInButton.tsx` 생성
  - iOS에서만 렌더링
  - 검은색 배경 + 흰색 텍스트 (Apple Design Guidelines)

### 4. SignInScreen 통합
- ✅ Apple 로그인 핸들러 추가 (`handleAppleSignInSuccess`, `handleAppleSignInError`)
- ✅ UI에 Apple 로그인 버튼 추가 (Google, 네이버 버튼 아래)

### 5. app.config.ts 업데이트
- ✅ `expo-apple-authentication` 플러그인 추가

---

## 📋 추가 설정 필요 사항

### 1. Apple Developer Account 설정

#### 1.1 Sign In with Apple 활성화
1. [Apple Developer Console](https://developer.apple.com/) 접속
2. **Certificates, Identifiers & Profiles** 이동
3. **Identifiers** → 앱 Bundle ID(`com.smis.smismentor`) 선택
4. **Sign In with Apple** 체크박스 활성화
5. **Save** 클릭

#### 1.2 Service ID 생성 (Optional - 웹에서도 사용 시)
1. **Identifiers** → **+** 버튼 클릭
2. **Services IDs** 선택 → Continue
3. Description 입력: `SMIS Mentor Web`
4. Identifier 입력: `com.smis.smismentor.web`
5. **Sign In with Apple** 활성화
6. **Configure** 클릭
   - Primary App ID: `com.smis.smismentor` 선택
   - Domains: `smis-mentor.com`, `www.smis-mentor.com` 추가
   - Return URLs: `https://www.smis-mentor.com/api/auth/callback/apple` 추가
7. **Save** → **Continue** → **Register**

---

### 2. EAS Build 설정

#### 2.1 Prebuild 실행
```bash
cd packages/mobile
npx expo prebuild --clean
```

#### 2.2 Development Build (테스트용)
```bash
# iOS Development Build
eas build --profile development --platform ios

# 빌드 완료 후 디바이스에 설치
# QR 코드 스캔 또는 다운로드 링크 사용
```

#### 2.3 Production Build
```bash
# iOS Production Build
eas build --profile production --platform ios
```

---

### 3. Firebase Custom Token 설정 (이미 완료됨)

애플 로그인은 Firebase Custom Token을 사용하여 Firebase Auth와 연동됩니다.

**기존 구현 확인:**
- ✅ `functions/src/index.ts`에 `createCustomToken` 함수 존재 확인
- ✅ `packages/mobile/src/services/authService.ts`에 `signInWithCustomToken` 함수 존재 확인

**작동 방식:**
```
1. 사용자가 Apple로 로그인
2. Apple에서 idToken, user (Apple ID) 반환
3. handleSocialLogin으로 Firestore에서 사용자 확인
4. signInWithCustomToken(userId, email)로 Firebase Auth 로그인
5. Firebase Functions의 createCustomToken이 Custom Token 생성
6. Firebase Auth에 로그인 완료
```

---

## 🧪 테스트 방법

### iOS에서 테스트 (필수)

애플 로그인은 **iOS 13 이상**에서만 동작합니다.

#### 1. Expo Go에서는 테스트 불가 ❌
애플 로그인은 **Development Build**에서만 테스트 가능합니다.

#### 2. Development Build에서 테스트 ✅

**Step 1: Development Build 생성**
```bash
cd packages/mobile
eas build --profile development --platform ios
```

**Step 2: 디바이스에 설치**
- EAS 대시보드에서 QR 코드 스캔
- 또는 다운로드 링크로 직접 설치

**Step 3: 앱 실행**
```bash
npx expo start --dev-client
```

**Step 4: 로그인 테스트**
1. 로그인 화면에서 **"Apple로 계속하기"** 버튼 확인 (검은색 버튼)
2. 버튼 클릭 → Apple 로그인 화면
3. Apple ID로 로그인
4. 이름/이메일 제공 허용
5. 전화번호 입력 (신규 사용자인 경우)
6. 회원가입 완료 또는 로그인 성공

---

## 📱 UI/UX

### 버튼 디자인 (Apple Design Guidelines 준수)
- **배경색**: 검은색 (`#000000`)
- **텍스트**: 흰색 (`#FFFFFF`)
- **아이콘**: Apple 로고 (Ionicons `logo-apple`)
- **텍스트**: "Apple로 계속하기"

### 버튼 순서
1. Google (파란색 테두리, 흰색 배경)
2. 네이버 (녹색)
3. **Apple (검은색)** ← 새로 추가됨

### iOS 전용 렌더링
- Android에서는 Apple 버튼이 표시되지 않습니다.
- `isAppleAuthAvailable()` 함수가 자동으로 플랫폼 체크

---

## 🔐 보안 고려사항

### 1. Apple Privacy Policy
- Apple은 첫 로그인 시에만 이름을 제공합니다.
- 재로그인 시에는 **이메일만** 제공됩니다.
- 따라서 첫 로그인 때 받은 이름을 Firestore에 저장해야 합니다.

### 2. 이메일 숨기기 기능
- Apple은 "이메일 숨기기" 기능을 제공합니다.
- 예: `abc123xyz@privaterelay.appleid.com`
- 이 경우에도 정상 작동합니다 (고유 이메일이므로).

### 3. 계정 삭제 시 주의사항
- Apple은 30일 이내에 계정 삭제 기능을 제공하도록 요구합니다.
- 현재 SMIS Mentor는 `status: 'deleted'`로 소프트 삭제를 지원합니다.

---

## 🐛 문제 해결

### "이 기기에서는 애플 로그인을 사용할 수 없습니다"
- iOS 13 미만 버전
- **해결**: iOS 업데이트 필요

### "이메일 정보를 가져올 수 없습니다"
- 재로그인 시 Apple이 이메일을 제공하지 않음
- **해결**: 사용자에게 안내 메시지 표시
  - 설정 > Apple ID > 암호 및 보안 > Apple로 로그인
  - SMIS Mentor 앱 삭제 후 다시 시도

### Expo Go에서 버튼이 보이지 않음
- Expo Go는 애플 로그인을 지원하지 않습니다.
- **해결**: Development Build 사용

---

## 📚 참고 자료

- [Expo Apple Authentication Docs](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
- [Apple Sign In Guidelines](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)
- [Firebase Custom Token Docs](https://firebase.google.com/docs/auth/admin/create-custom-tokens)

---

## ✅ 체크리스트

테스트 전 확인 사항:

- [ ] Apple Developer Account에서 Sign In with Apple 활성화
- [ ] `eas.json`에 `development` 프로필 존재 확인
- [ ] Development Build 생성 완료
- [ ] iOS 13+ 디바이스 준비
- [ ] Firebase Functions의 `createCustomToken` 배포 확인
- [ ] 애플 로그인 → 전화번호 입력 → 회원가입/로그인 플로우 테스트
- [ ] 기존 계정에 애플 연동 테스트
- [ ] 애플 로그아웃 후 재로그인 테스트

---

## 🎉 완료!

애플 소셜 로그인이 성공적으로 추가되었습니다. Development Build를 생성하고 iOS 디바이스에서 테스트하세요!
