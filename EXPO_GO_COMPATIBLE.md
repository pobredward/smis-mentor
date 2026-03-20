# Expo Go 호환 업데이트 완료 ✅

## 변경 사항

### ❌ 제거된 것
- `@react-native-google-signin/google-signin` (네이티브 모듈)
- App.tsx의 `configureGoogleSignIn()` 초기화
- app.json의 `@react-native-google-signin/google-signin` 플러그인

### ✅ 추가된 것
- `expo-auth-session` - Expo의 OAuth 인증 시스템
- `expo-crypto` - 보안 랜덤 생성 (AuthSession 의존성)
- `expo-web-browser` - 인증 브라우저 (AuthSession 의존성)

## 주요 변경 파일

### 1. `packages/mobile/src/services/googleAuthService.ts`
**이전 방식 (네이티브 모듈):**
```typescript
import { GoogleSignin } from '@react-native-google-signin/google-signin';

export function configureGoogleSignIn() {
  GoogleSignin.configure({ ... });
}

export async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices();
  const userInfo = await GoogleSignin.signIn();
  // ...
}
```

**새로운 방식 (Expo AuthSession):**
```typescript
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';

export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
  });
  
  return { request, response, promptAsync };
}

export async function handleGoogleAuthResponse(response: any) {
  const { id_token } = response.params;
  const credential = GoogleAuthProvider.credential(id_token);
  const result = await signInWithCredential(auth, credential);
  // ...
}
```

### 2. `packages/mobile/src/components/GoogleSignInButton.tsx`
**이전 방식:**
```typescript
const handlePress = async () => {
  const socialData = await signInWithGoogle();
  onSuccess(socialData);
};
```

**새로운 방식:**
```typescript
const { request, response, promptAsync } = useGoogleAuth();

useEffect(() => {
  if (response) {
    handleAuthResponse();
  }
}, [response]);

const handlePress = async () => {
  await promptAsync();
};
```

### 3. `packages/mobile/App.tsx`
**이전:**
```typescript
useEffect(() => {
  configureGoogleSignIn();
}, []);
```

**새로운:**
```typescript
// 초기화 불필요 - Expo AuthSession이 자동으로 처리
```

### 4. `packages/mobile/app.json`
**이전:**
```json
"plugins": [
  "@react-native-google-signin/google-signin",
  // ...
]
```

**새로운:**
```json
"plugins": [
  "expo-web-browser",
  // ...
]
```

## Expo Go vs EAS Build 비교

### Expo Go 환경 (개발용) ✅
- ✅ 즉시 테스트 가능
- ✅ QR 코드로 빠른 개발
- ✅ 네이티브 빌드 불필요
- ⚠️ 제한된 네이티브 모듈만 사용 가능
- ✅ Expo AuthSession 완벽 지원

### EAS Build / Development Build
- ✅ 모든 네이티브 모듈 사용 가능
- ✅ 커스텀 네이티브 코드
- ⚠️ 빌드 시간 필요
- ✅ `@react-native-google-signin/google-signin` 사용 가능
- ✅ Expo AuthSession도 동시 사용 가능

## 동작 방식

### Expo AuthSession 플로우
```
1. Google 로그인 버튼 클릭
   ↓
2. promptAsync() 호출
   ↓
3. 기기 브라우저 열림 (Chrome/Safari)
   ↓
4. Google 로그인 페이지
   ↓
5. 사용자 로그인 + 권한 승인
   ↓
6. 리다이렉트: smismentor://
   ↓
7. 앱으로 돌아옴
   ↓
8. response에 id_token 포함
   ↓
9. Firebase 로그인 처리
   ↓
10. 완료! ✨
```

### 리다이렉트 URI
```
Expo Go: exp://192.168.x.x:8081
Standalone: smismentor://
Web: https://auth.expo.io/@username/smis-mentor
```

## 테스트 방법

### Expo Go 테스트
```bash
# 1. 의존성 설치 확인
cd /Users/sunwoongshin/Desktop/dev/smis-mentor/packages/mobile
npm list expo-auth-session expo-crypto expo-web-browser

# 2. 개발 서버 실행 (이미 실행 중)
npx expo start --go

# 3. Expo Go 앱에서 QR 코드 스캔

# 4. Google 로그인 버튼 클릭

# 5. 브라우저 열림 → Google 로그인

# 6. 권한 승인 후 앱으로 자동 복귀
```

### 예상 동작
1. ✅ Google 로그인 버튼 표시
2. ✅ 버튼 클릭 시 기기 브라우저 열림
3. ✅ Google 로그인 화면
4. ✅ 로그인 후 앱으로 복귀
5. ✅ 전화번호 입력 모달 표시
6. ✅ 나머지 회원가입 플로우 진행

### 에러 해결

#### 1. "Could not find TurboModule" 에러
**해결됨!** ✅
- 네이티브 모듈 제거
- Expo AuthSession 사용

#### 2. "redirect_uri_mismatch" 에러
**해결 방법:**
```
Firebase Console > Authentication > Sign-in method > Google
→ Authorized redirect URIs 추가:
- https://auth.expo.io/@pobredward02/smis-mentor
```

#### 3. 브라우저가 열리지 않음
**해결 방법:**
```typescript
// WebBrowser 설정 확인
WebBrowser.maybeCompleteAuthSession();
```

## Firebase Console 설정

### OAuth Client ID 확인
```
Firebase Console > Project Settings > General
→ iOS/Android 앱에서 Client ID 확인
```

### Authorized Redirect URIs
```
Firebase Console > Authentication > Sign-in method > Google
→ Authorized redirect URIs에 추가:
- https://auth.expo.io/@pobredward02/smis-mentor
```

## 장점

### ✅ Expo Go 호환
- 개발 속도 향상
- QR 코드로 즉시 테스트
- 빌드 불필요

### ✅ 크로스 플랫폼
- iOS, Android 동일 코드
- 웹도 지원 가능

### ✅ 유지보수 용이
- Expo가 네이티브 코드 관리
- 업데이트 간편

### ✅ 안정성
- Expo 공식 지원
- 커뮤니티 검증됨

## 제한사항

### ⚠️ 브라우저 필요
- 기기에 Chrome/Safari 필요
- 인터넷 연결 필수

### ⚠️ 사용자 경험
- 앱 → 브라우저 → 앱 전환
- 네이티브 방식보다 약간 느림

### ⚠️ 오프라인
- 오프라인 로그인 불가
- 첫 로그인은 온라인 필수

## 다음 단계

### Apple Sign In (Phase 4)
```typescript
import * as AppleAuthentication from 'expo-apple-authentication';

// Expo Go에서도 동작!
await AppleAuthentication.signInAsync({
  requestedScopes: [
    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
    AppleAuthentication.AppleAuthenticationScope.EMAIL,
  ],
});
```

### 카카오/네이버 로그인
```typescript
import * as AuthSession from 'expo-auth-session';

// 커스텀 OAuth 제공자
const discovery = {
  authorizationEndpoint: 'https://kauth.kakao.com/oauth/authorize',
  tokenEndpoint: 'https://kauth.kakao.com/oauth/token',
};
```

## 요약

### 변경 사항
- ❌ `@react-native-google-signin/google-signin` 제거
- ✅ `expo-auth-session` 사용
- ✅ Expo Go 완벽 호환
- ✅ 동일한 기능 유지

### 테스트
```bash
# 현재 실행 중인 개발 서버 새로고침
# Expo Go 앱에서 다시 테스트
```

### 동작 확인
- ✅ Google 로그인 버튼 표시
- ✅ 브라우저 열림
- ✅ 로그인 후 앱 복귀
- ✅ 회원가입 플로우 진행

## Expo Go에서 바로 테스트 가능! 🎉
