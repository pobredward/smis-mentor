# Expo Go에서 소셜 로그인 설정 가이드

## 🎯 현재 상황

로그에서 보이는 Redirect URI:
```
exp://192.168.45.80:8081/--/redirect
```

이것은 **Expo Go 개발 환경**에서 사용되는 URL입니다.

## ✅ 설정 단계

### 1. Google OAuth 설정

#### 1-1. Google Cloud Console 접속
https://console.cloud.google.com/apis/credentials

#### 1-2. OAuth 2.0 클라이언트 ID에 리디렉션 URI 추가

**Expo Go용 URI 추가:**
```
exp://192.168.45.80:8081/--/redirect  (현재 개발 IP)
```

**프로덕션용 URI (이미 있을 것):**
```
com.smis.smismentor:/
smismentor://
https://auth.expo.io/@pobredward02/smis-mentor
```

#### 1-3. 주의사항
- `192.168.45.80`는 현재 로컬 네트워크 IP이므로 **개발 중에만** 작동
- 다른 네트워크에서는 IP가 변경될 수 있음
- **권장**: `localhost` 또는 Expo 공식 리디렉션 사용

### 2. 네이버 OAuth 설정

#### 2-1. 네이버 개발자 센터 접속
https://developers.naver.com/apps

#### 2-2. 애플리케이션 등록

1. **애플리케이션 이름**: SMIS Mentor
2. **사용 API**: 네이버 로그인
3. **서비스 URL**: `https://smis-mentor.com`

#### 2-3. Callback URL 설정

**개발용 (Expo Go):**
```
exp://192.168.45.80:8081/--/redirect
```

**프로덕션용:**
```
smismentor://redirect
com.smis.smismentor://redirect
https://smis-mentor.com/api/auth/callback/naver
```

#### 2-4. Client ID/Secret 발급받기

발급받은 값을 `app.json`에 입력:

```json
{
  "extra": {
    "EXPO_PUBLIC_NAVER_CLIENT_ID": "여기에_Client_ID",
    "EXPO_PUBLIC_NAVER_CLIENT_SECRET": "여기에_Client_Secret"
  }
}
```

### 3. Expo Go에서 동적 Redirect URI 사용

현재 IP 주소가 자주 변경되는 경우, 코드에서 동적으로 생성하고 있습니다:

**`packages/mobile/src/services/naverAuthService.ts`** (이미 구현됨):
```typescript
const redirectUri = makeRedirectUri({
  scheme: 'smis-mentor',  // app.json의 scheme과 일치
  path: 'redirect',
});
```

### 4. 프로덕션 빌드 설정

#### 4-1. Custom Deep Link Scheme

`app.json`에 이미 설정됨:
```json
{
  "scheme": "smismentor"
}
```

#### 4-2. 프로덕션용 Redirect URI

**Google:**
```
smismentor://
com.smis.smismentor:/
```

**네이버:**
```
smismentor://redirect
com.smis.smismentor://redirect
```

## 🚀 빠른 시작 (Expo Go)

### 방법 1: 현재 IP 사용 (간단)

1. 터미널에서 현재 Redirect URI 확인:
   ```
   LOG  📍 Redirect URI: exp://192.168.45.80:8081/--/redirect
   ```

2. 이 URI를 Google/네이버 OAuth 설정에 추가

3. 앱 재시작

### 방법 2: Expo Auth Proxy 사용 (권장)

Expo에서 제공하는 인증 프록시를 사용하면 더 안정적입니다.

**`packages/mobile/src/services/googleAuthService.ts` 수정:**
```typescript
const redirectUri = makeRedirectUri({
  useProxy: true,  // Expo Auth Proxy 사용
});
```

**Google/네이버 OAuth에 등록할 URI:**
```
https://auth.expo.io/@pobredward02/smis-mentor
```

> `@pobredward02`는 `app.json`의 `owner` 값입니다.

## 🧪 테스트

### Expo Go 테스트
```bash
cd packages/mobile
npm run start
```

1. Expo Go 앱에서 프로젝트 열기
2. "Google로 계속하기" 또는 "네이버로 계속하기" 클릭
3. 브라우저에서 로그인
4. 앱으로 자동 리디렉션

### 프로덕션 빌드 테스트
```bash
# iOS
npm run build:dev:ios

# Android
npm run build:dev:android
```

## ⚠️ 문제 해결

### Google 로그인이 작동하지 않는 경우

1. **Redirect URI 불일치**
   ```
   Error: redirect_uri_mismatch
   ```
   → Google Cloud Console에서 정확한 URI 추가

2. **Client ID 불일치**
   ```
   Error: invalid_client
   ```
   → `app.json`의 Client ID 확인

### 네이버 로그인이 작동하지 않는 경우

1. **Callback URL 미등록**
   ```
   에러: callback url이 등록되지 않았습니다
   ```
   → 네이버 개발자 센터에서 Callback URL 추가

2. **Client Secret 오류**
   ```
   Error: invalid_client
   ```
   → `app.json`의 Client Secret 확인

## 📝 최종 체크리스트

### Google OAuth
- [ ] Google Cloud Console에서 OAuth 2.0 클라이언트 ID 생성
- [ ] Redirect URI 추가 (Expo Go용 + 프로덕션용)
- [ ] `app.json`에 Client ID 설정
- [ ] 테스트

### 네이버 OAuth
- [ ] 네이버 개발자 센터에서 애플리케이션 등록
- [ ] Callback URL 추가 (Expo Go용 + 프로덕션용)
- [ ] `app.json`에 Client ID/Secret 설정
- [ ] 테스트

## 🎉 완료!

설정이 완료되면 Expo Go와 프로덕션 빌드 모두에서 소셜 로그인이 작동합니다!
