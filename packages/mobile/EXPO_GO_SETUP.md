# Expo Go 소셜 로그인 정석 설정 가이드

## 🎯 구현 방식

### Google 로그인
- **방식**: Expo Auth Session (OAuth 2.0)
- **상태**: ✅ Expo Go 호환

### 네이버 로그인
- **Expo Go**: OAuth 2.0 (WebBrowser)
- **Development Build**: Native SDK (`@react-native-seoul/naver-login`)
- **상태**: ✅ 두 방식 모두 구현됨

---

## 🔧 1단계: Google OAuth 설정

### Google Cloud Console
https://console.cloud.google.com/apis/credentials

1. **프로젝트 선택**: `smis-mentor`
2. **OAuth 2.0 클라이언트 ID** 편집 (Web Client ID)
3. **승인된 리디렉션 URI 추가**:
   ```
   https://auth.expo.io/@pobredward02/smis-mentor
   ```
4. **저장** 클릭

---

## 🔧 2단계: 네이버 OAuth 설정

### 네이버 개발자 센터
https://developers.naver.com/apps

### ⚠️ 중요: 서비스 URL 방식 사용!

1. **애플리케이션 선택**
   - Client ID: `XgK86FxXznee_HFfBeH3`

2. **API 설정 → 네이버 로그인 → 서비스 URL**
   - Callback URL에 추가:
   ```
   https://auth.expo.io/@pobredward02/smis-mentor
   ```

3. **PC 웹** 환경도 추가하면 더 안정적:
   ```
   https://auth.expo.io/@pobredward02/smis-mentor
   https://www.smis-mentor.com/api/auth/callback/naver
   ```

---

## 🚀 3단계: 앱 재시작

```bash
cd packages/mobile
npm run start:clear
```

---

## 🧪 4단계: Expo Go에서 테스트

### Google 로그인
- "Google로 계속하기" 클릭
- Google 계정 선택 팝업
- 자동으로 앱으로 리디렉션 ✅

### 네이버 로그인
- "네이버로 계속하기" 클릭
- 네이버 로그인 웹뷰
- 자동으로 앱으로 리디렉션 ✅

---

## 📊 네이버 두 가지 방식 비교

| 항목 | OAuth 2.0 (현재) | Native SDK |
|------|------------------|------------|
| **Expo Go** | ✅ 작동 | ❌ 불가능 |
| **Development Build** | ✅ 작동 | ✅ 작동 (권장) |
| **네이버 설정** | 서비스 URL (Callback) | iOS 환경 (URL Scheme) |
| **등록 값** | `https://auth.expo.io/...` | `com.smis.smismentor` |
| **장점** | Expo Go 테스트 가능 | 더 안정적, 빠름 |

---

## ⚠️ 문제 해결

### 에러: "Something went wrong trying to finish signing in"

**원인:**
- 네이버 개발자 센터에 Callback URL이 등록되지 않음

**해결:**
1. 네이버 개발자 센터 접속
2. API 설정 → 네이버 로그인 → **서비스 URL**
3. **Callback URL에 추가**:
   ```
   https://auth.expo.io/@pobredward02/smis-mentor
   ```
4. 저장 즉시 적용됨

### 에러: "로그인이 취소되었습니다"

**원인:**
- 웹뷰에서 사용자가 취소 버튼 클릭
- 또는 리다이렉트 실패

**해결:**
- Callback URL이 정확히 등록되었는지 재확인
- 네트워크 연결 확인

---

## 🎉 완료!

**등록할 URL (Google + 네이버 모두):**
```
https://auth.expo.io/@pobredward02/smis-mentor
```

### Google
- **위치**: OAuth 2.0 클라이언트 ID → 승인된 리디렉션 URI

### 네이버
- **위치**: API 설정 → 네이버 로그인 → 서비스 URL → Callback URL

---

## 🚀 프로덕션 빌드 시

Development Build로 전환하면 네이버는 **Native SDK**를 사용하도록 자동 전환됩니다:

```bash
# Development Build 생성
npx expo run:ios
# 또는
npx expo run:android
```

이 경우 네이버 개발자 센터에 **iOS/Android 환경도 추가**해야 합니다:
- iOS URL Scheme: `com.smis.smismentor`
- Android Package Name: `com.smis.smismentor`

