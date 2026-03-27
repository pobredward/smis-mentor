# 모바일 소셜 로그인 연동 가이드

## ✅ 구현 완료 사항

### 1. 새로 생성된 파일
- `packages/mobile/src/services/cacheUtils.ts` - AsyncStorage 기반 캐시 유틸리티
- `packages/mobile/src/services/naverAuthService.ts` - 네이버 OAuth 서비스 (React Native용)

### 2. 수정된 파일
- `packages/mobile/src/services/googleAuthService.ts`
  - `getGoogleCredential` 함수 추가 (웹과 동일한 로직)
  - credential만 가져오기 (계정 연동용)

- `packages/mobile/src/services/authService.ts`
  - 캐시 지원 추가 (`getUserById`)
  - `updateUser` 함수 추가 (캐시 무효화 포함)

- `packages/mobile/src/screens/ProfileScreen.tsx`
  - 소셜 계정 연동 버튼 추가 (Google, 네이버)
  - 소셜 계정 해제 버튼 추가
  - `handleSocialLink` 함수 구현
  - `handleSocialUnlink` 함수 구현
  - 캐시 무효화 로직 추가

## 🎯 기능

### 지원하는 소셜 로그인
1. **Google** ✅
   - Expo AuthSession 사용
   - Multiple Email Policy 지원
   - Firebase Auth 연동

2. **네이버** ✅
   - WebBrowser OAuth 사용
   - Firestore에만 저장 (Firebase Auth 미지원)

3. **카카오** 🚧
   - 준비 중

### 주요 기능
- ✅ 소셜 계정 연동
- ✅ 소셜 계정 해제
- ✅ Multiple Email Policy (다른 이메일도 연동 가능)
- ✅ 캐시 무효화 (연동/해제 시)
- ✅ Transaction 기반 동시성 안전
- ✅ 웹과 동일한 로직 (monorepo shared 사용)

## 🔧 사용 방법

### 1. Google 연동
1. 프로필 화면에서 "Google 연동" 버튼 클릭
2. Google 계정 선택 팝업
3. 자동으로 Firebase Auth 및 Firestore 업데이트

### 2. 네이버 연동
1. 프로필 화면에서 "네이버 연동" 버튼 클릭
2. 네이버 로그인 웹뷰
3. Firestore에 연동 정보 저장

### 3. 계정 해제
1. 연동된 계정 옆 "해제" 버튼 클릭
2. 확인 Alert
3. Firestore 및 Firebase Auth에서 제거

## 📋 환경 변수 설정

`app.json` 또는 `.env`에 다음 설정 필요:

```json
{
  "expo": {
    "extra": {
      "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "your-web-client-id",
      "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "your-ios-client-id",
      "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID": "your-android-client-id",
      "EXPO_PUBLIC_NAVER_CLIENT_ID": "your-naver-client-id",
      "EXPO_PUBLIC_NAVER_CLIENT_SECRET": "your-naver-client-secret"
    }
  }
}
```

## 🔍 웹과의 차이점

| 항목 | 웹 | 모바일 |
|------|-----|--------|
| **Google OAuth** | `signInWithPopup` | `expo-auth-session` |
| **네이버 OAuth** | `window.location` | `expo-web-browser` |
| **캐시** | IndexedDB | AsyncStorage |
| **UI** | Tailwind CSS | React Native StyleSheet |
| **토스트** | `react-hot-toast` | `Alert` |

## 🚨 알려진 제한사항

1. **카카오 로그인**: 아직 미구현 (네이티브 SDK 필요)
2. **Apple 로그인**: 아직 미구현 (Expo In-App Purchase 필요)
3. **Custom Token**: 웹과 달리 구현되지 않음 (필요 시 추가 가능)

## 🧪 테스트 시나리오

1. ✅ 이메일/비밀번호 회원가입 → Google 연동
2. ✅ 이메일/비밀번호 회원가입 → 네이버 연동
3. ✅ Google 연동 → 해제 → 재연동
4. ✅ 네이버 연동 → 해제 → 재연동
5. ✅ 여러 소셜 동시 연동 (이메일 + Google + 네이버)

## 🔒 보안

- ✅ CSRF 방지 (state 파라미터)
- ✅ Transaction 기반 동시성 제어
- ✅ 캐시 TTL 설정 (1시간)
- ✅ 최소 1개 로그인 방법 유지 강제

## 📱 UI/UX

- ✅ 연동된 계정 표시 (아이콘 + 이메일)
- ✅ 연동 가능한 계정만 버튼 표시
- ✅ 기본 계정은 "기본" 뱃지
- ✅ 해제 가능한 계정만 "해제" 버튼
- ✅ Alert 확인창 (연동/해제 시)

## 🎉 완료!

모바일에서도 웹과 동일하게 소셜 로그인 연동/해제가 가능합니다!
