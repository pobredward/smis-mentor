# Expo Go 소셜 로그인 정석 설정 가이드

## 🎯 현재 상태

### ✅ 코드는 이미 올바르게 설정됨!

**Google:**
```typescript
// expo-auth-session이 자동으로 Expo Auth Proxy 사용
Google.useAuthRequest({ webClientId, iosClientId, androidClientId })
```

**네이버:**
```typescript
// Expo Auth Proxy 사용
const redirectUri = __DEV__ 
  ? 'https://auth.expo.io/@pobredward02/smis-mentor'
  : 'smismentor://redirect';
```

### ⚠️ 필요한 것: OAuth 제공자 설정만!

---

## 🔧 1단계: Google OAuth 설정 (필수!)

### Google Cloud Console
https://console.cloud.google.com/apis/credentials

### 작업 순서

1. **프로젝트 선택**: `smis-mentor`

2. **OAuth 2.0 클라이언트 ID** 편집 (Web Client ID)
   - Client ID: `382190683951-d213f6sqm30lokbddeth6g2gucava2en.apps.googleusercontent.com`

3. **승인된 리디렉션 URI 추가**:
   ```
   https://auth.expo.io/@pobredward02/smis-mentor
   ```

4. **저장** 클릭

### ⚠️ 주의사항
- **Web Client ID**에만 추가 (iOS/Android는 불필요)
- 기존 URI 삭제하지 말 것 (웹용 유지)

---

## 🔧 2단계: 네이버 OAuth 설정 (필수!)

### 네이버 개발자 센터
https://developers.naver.com/apps

### 작업 순서

1. **애플리케이션 선택** (또는 신규 생성)
   - Client ID: `XgK86FxXznee_HFfBeH3`

2. **API 설정 → 네이버 로그인**

3. **Callback URL 추가**:
   ```
   https://auth.expo.io/@pobredward02/smis-mentor
   ```

4. **추가로 등록 (선택)**:
   ```
   smismentor://redirect
   https://www.smis-mentor.com/api/auth/callback/naver
   ```

5. **저장** 클릭

### ⚠️ 주의사항
- 네이버는 최대 5개 Callback URL 허용
- 기존 웹용 URL 삭제하지 말 것

---

## 🔧 3단계: 환경 변수 확인

### app.json (이미 설정됨 ✅)

```json
{
  "expo": {
    "scheme": "smismentor",
    "owner": "pobredward02",
    "slug": "smis-mentor",
    "extra": {
      "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "382190683951-d213f6sqm30lokbddeth6g2gucava2en.apps.googleusercontent.com",
      "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "382190683951-6qjb6jfc4ssfirqt7807ttt7b77rl8me.apps.googleusercontent.com",
      "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID": "382190683951-cs53mija3pru3p0na3t8tqmqgqej8okn.apps.googleusercontent.com",
      "EXPO_PUBLIC_NAVER_CLIENT_ID": "XgK86FxXznee_HFfBeH3",
      "EXPO_PUBLIC_NAVER_CLIENT_SECRET": "GcoXVzqEZs"
    }
  }
}
```

모든 설정이 이미 완료되어 있습니다! ✅

---

## 🚀 4단계: 앱 재시작

```bash
cd packages/mobile

# 캐시 지우고 재시작 (권장)
npm run start:clear

# 또는 일반 시작
npm run start
```

---

## 🧪 5단계: 테스트

### Expo Go에서 테스트

1. **Google 로그인**
   - "Google로 계속하기" 클릭
   - Google 계정 선택 팝업
   - 자동으로 앱으로 리디렉션 ✅

2. **네이버 로그인**
   - "네이버로 계속하기" 클릭
   - 네이버 로그인 웹뷰
   - 자동으로 앱으로 리디렉션 ✅

---

## 📊 최종 체크리스트

### Google OAuth Console
- [ ] Web Client ID의 리디렉션 URI에 추가:
  ```
  https://auth.expo.io/@pobredward02/smis-mentor
  ```

### 네이버 개발자 센터
- [ ] Callback URL에 추가:
  ```
  https://auth.expo.io/@pobredward02/smis-mentor
  ```

### 코드 (이미 완료 ✅)
- [x] Google: `expo-auth-session` 사용
- [x] 네이버: `useProxy: true` 사용
- [x] app.json: Client ID/Secret 설정

---

## ⚠️ 문제 해결

### Google 로그인 안되는 경우

**에러:** `redirect_uri_mismatch`

**해결:**
1. Google Cloud Console 접속
2. Web Client ID 편집
3. 정확히 이 URI 추가:
   ```
   https://auth.expo.io/@pobredward02/smis-mentor
   ```
4. 저장 후 5-10분 대기 (Google 서버 동기화)

### 네이버 로그인 안되는 경우

**에러:** `callback url이 등록되지 않았습니다`

**해결:**
1. 네이버 개발자 센터 접속
2. 애플리케이션 설정
3. 정확히 이 URI 추가:
   ```
   https://auth.expo.io/@pobredward02/smis-mentor
   ```
4. 저장 즉시 적용됨

### 로그 확인

터미널에서 다음이 보여야 정상:
```
LOG  📍 Redirect URI: https://auth.expo.io/@pobredward02/smis-mentor
LOG  ℹ️ Expo Auth Proxy 사용 중 (안정적)
```

---

## 🎉 완료!

**등록할 URL (Google + 네이버 모두):**
```
https://auth.expo.io/@pobredward02/smis-mentor
```

이 URL 하나만 Google Cloud Console과 네이버 개발자 센터에 추가하면 끝! 🚀

### 왜 이 방법이 정석인가?

1. ✅ **IP 주소 독립적** - Wi-Fi 변경해도 작동
2. ✅ **Expo 공식 지원** - 안정적
3. ✅ **설정 한 번만** - 추가 작업 불필요
4. ✅ **프로덕션 전환 쉬움** - 빌드 시 자동으로 custom scheme 사용

