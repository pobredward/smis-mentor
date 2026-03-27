# 네이버 OAuth Callback URL 우회 등록 가이드

## 🎯 문제
네이버 개발자 센터에서 `exp://` 스킴을 허용하지 않음

## ✅ 해결 방법들

### 방법 1: localhost 사용 (권장, 가장 간단)

네이버는 **localhost를 허용**합니다!

#### 네이버 개발자 센터에 등록할 URL:
```
http://localhost:19006/redirect
http://localhost:8081/redirect
http://localhost:3000/redirect
```

#### 코드 수정 (이미 적용됨):
```typescript
const redirectUri = __DEV__ 
  ? 'http://localhost:19006/redirect'  // 개발
  : 'smismentor://redirect';           // 프로덕션
```

#### 장점:
- ✅ 네이버에서 공식 지원
- ✅ IP 변경 걱정 없음
- ✅ 설정 한 번만 하면 됨

### 방법 2: 실제 도메인 사용

개발 서버를 실제 도메인으로 터널링

#### ngrok 사용:
```bash
# ngrok 설치
brew install ngrok

# 터널 시작
npx expo start
ngrok http 8081

# 출력된 URL 사용 (예: https://abc123.ngrok.io/redirect)
```

#### 네이버 개발자 센터에 등록:
```
https://abc123.ngrok.io/redirect
```

#### 단점:
- 매번 URL이 변경됨 (유료 플랜 필요)

### 방법 3: 프로덕션 도메인 사용 (현재 상태)

웹 서버의 Callback을 그대로 사용

#### 네이버 개발자 센터에 이미 등록되어 있을 것:
```
https://smis-mentor.com/api/auth/callback/naver
```

이것은 웹에서 사용 중이므로 **변경하지 마세요!**

### 방법 4: Custom URL Scheme (프로덕션용)

네이버는 custom scheme도 지원합니다.

#### 네이버 개발자 센터에 등록:
```
smismentor://redirect
com.smis.smismentor://redirect
```

#### app.json에 이미 설정됨:
```json
{
  "scheme": "smismentor"
}
```

## 🚀 빠른 시작 (추천 방법)

### 1단계: 네이버 개발자 센터 설정

https://developers.naver.com/apps 접속

**Callback URL에 추가:**
```
http://localhost:19006/redirect
http://localhost:8081/redirect
smismentor://redirect
```

### 2단계: Client ID/Secret 설정

`packages/mobile/app.json`:
```json
{
  "extra": {
    "EXPO_PUBLIC_NAVER_CLIENT_ID": "발급받은_Client_ID",
    "EXPO_PUBLIC_NAVER_CLIENT_SECRET": "발급받은_Client_Secret"
  }
}
```

### 3단계: 코드 확인

`packages/mobile/src/services/naverAuthService.ts` (이미 수정됨):
```typescript
const redirectUri = __DEV__ 
  ? 'http://localhost:19006/redirect'
  : 'smismentor://redirect';
```

### 4단계: 앱 재시작

```bash
cd packages/mobile
npm run start
```

## 🧪 테스트

1. Expo Go 앱 열기
2. "네이버로 계속하기" 클릭
3. 브라우저에서 네이버 로그인
4. **localhost로 리디렉션** → Expo가 자동으로 앱으로 전환

## ⚠️ 주의사항

### localhost 포트 확인

Expo 개발 서버 포트 확인:
```bash
npm run start

# 출력 예시:
# Metro waiting on exp://192.168.45.80:8081
# Web is waiting on http://localhost:19006
```

**사용할 포트:**
- Expo Go: `8081`
- Web (브라우저): `19006`

네이버에는 **두 개 모두 등록** 추천:
```
http://localhost:8081/redirect
http://localhost:19006/redirect
```

### Expo Go vs Standalone Build

| 환경 | Redirect URI | 등록 위치 |
|------|-------------|----------|
| **Expo Go (개발)** | `http://localhost:19006/redirect` | 네이버 개발자 센터 |
| **Standalone (프로덕션)** | `smismentor://redirect` | 네이버 개발자 센터 |

## 🎉 완료!

이제 네이버 OAuth가 Expo Go에서 작동합니다!

### 등록할 Callback URL 전체 목록:

```
http://localhost:8081/redirect
http://localhost:19006/redirect
smismentor://redirect
https://smis-mentor.com/api/auth/callback/naver (웹용, 이미 있음)
```

### Google OAuth도 동일하게:

```
http://localhost:8081
http://localhost:19006
smismentor://
https://smis-mentor.com/api/auth/callback/google (웹용, 이미 있음)
```
