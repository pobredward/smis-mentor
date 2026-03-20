# Google 로그인 400 오류 해결 가이드

## 🔴 오류 원인

**400 Error: redirect_uri_mismatch**
- Firebase Console에 Expo의 리다이렉트 URI가 등록되지 않음
- OAuth 인증 시 Google이 앱으로 돌아올 수 없음

## ✅ 해결 방법

### 1단계: Firebase Console 접속

1. https://console.firebase.google.com 접속
2. `smis-mentor` 프로젝트 선택
3. **Authentication** 메뉴 클릭
4. **Sign-in method** 탭 클릭
5. **Google** 제공업체 클릭

### 2단계: 승인된 리다이렉트 URI 추가

**추가해야 할 URI:**

#### Expo Go 개발 환경용
```
https://auth.expo.io/@pobredward02/smis-mentor
```

#### Production 빌드용 (추후)
```
smismentor://
```

#### Web 버전용 (선택사항)
```
http://localhost:19006
https://smis-mentor.com
```

### 3단계: URI 등록 방법

1. **Google 제공업체 설정** 화면에서 하단의 **"승인된 도메인"** 섹션 찾기
2. **"URI 추가"** 또는 **"Edit"** 버튼 클릭
3. 다음 URI 입력:
   ```
   https://auth.expo.io/@pobredward02/smis-mentor
   ```
4. **저장** 클릭

### 4단계: Expo 계정 확인

현재 Expo 계정: `@pobredward02`

만약 다른 계정이라면 URI를 변경해야 합니다:
```
https://auth.expo.io/@[YOUR_EXPO_USERNAME]/smis-mentor
```

Expo 계정 확인:
```bash
npx expo whoami
```

### 5단계: app.json 확인

`packages/mobile/app.json`:
```json
{
  "expo": {
    "owner": "pobredward02",  // ← 이 값 확인
    "scheme": "smismentor"
  }
}
```

## 🔧 상세 설정 가이드

### Firebase Console 전체 경로

```
Firebase Console
  ↓
Authentication
  ↓
Sign-in method
  ↓
Google (제공업체)
  ↓
[편집 아이콘 클릭]
  ↓
"승인된 리다이렉트 URI" 섹션
  ↓
[URI 추가]
  ↓
https://auth.expo.io/@pobredward02/smis-mentor
  ↓
[저장]
```

### 스크린샷 위치

**Firebase Console → Authentication → Sign-in method → Google:**

```
┌─────────────────────────────────────────┐
│ Google                         [편집 ✏️] │
├─────────────────────────────────────────┤
│ 상태: 사용 설정됨                        │
│                                         │
│ 승인된 도메인:                           │
│ • smis-mentor.firebaseapp.com          │
│ • localhost                            │
│                                         │
│ 승인된 리다이렉트 URI:  [URI 추가 +]   │
│ • [여기에 추가!]                        │
│   https://auth.expo.io/@pobredward02/  │
│   smis-mentor                          │
│                                         │
│ Web SDK 구성:                           │
│ Web Client ID: 382190683951-...        │
└─────────────────────────────────────────┘
```

## 🎯 빠른 체크리스트

- [ ] Firebase Console 접속
- [ ] Authentication > Sign-in method 이동
- [ ] Google 제공업체 클릭
- [ ] 승인된 리다이렉트 URI에 추가:
  ```
  https://auth.expo.io/@pobredward02/smis-mentor
  ```
- [ ] 저장
- [ ] Expo Go 앱 새로고침
- [ ] Google 로그인 재시도

## 🔍 추가 디버깅

### 현재 Expo 사용자 확인
```bash
cd /Users/sunwoongshin/Desktop/dev/smis-mentor/packages/mobile
npx expo whoami
```

### 리다이렉트 URI 형식 확인
```
형식: https://auth.expo.io/@[EXPO_USERNAME]/[APP_SLUG]

현재:
- EXPO_USERNAME: pobredward02
- APP_SLUG: smis-mentor (app.json의 "slug" 값)

결과:
https://auth.expo.io/@pobredward02/smis-mentor
```

### app.json 확인
```json
{
  "expo": {
    "name": "SMIS Mentor",
    "slug": "smis-mentor",        // ← 이것
    "owner": "pobredward02",       // ← 이것
    "scheme": "smismentor"
  }
}
```

## ⚠️ 주의사항

### 1. 대소문자 구분
```
✅ https://auth.expo.io/@pobredward02/smis-mentor
❌ https://auth.expo.io/@Pobredward02/smis-mentor
❌ https://auth.expo.io/@pobredward02/SMIS-mentor
```

### 2. 슬래시 확인
```
✅ https://auth.expo.io/@pobredward02/smis-mentor
❌ https://auth.expo.io/@pobredward02/smis-mentor/
```

### 3. 프로토콜 확인
```
✅ https://auth.expo.io/@pobredward02/smis-mentor
❌ http://auth.expo.io/@pobredward02/smis-mentor
```

## 🚀 설정 후 테스트

1. Firebase Console에서 저장 확인
2. Expo Go 앱 새로고침 (Shake → Reload)
3. 로그인 화면 이동
4. "Google로 계속하기" 클릭
5. 브라우저가 열리고 Google 로그인 진행
6. 앱으로 자동 복귀 확인

## 💡 여전히 안 되면?

### 캐시 클리어
```bash
# Expo 캐시 클리어
cd /Users/sunwoongshin/Desktop/dev/smis-mentor/packages/mobile
rm -rf .expo
npx expo start --clear
```

### 브라우저 캐시 클리어
- 기기에서 Chrome/Safari 캐시 삭제
- 시크릿 모드로 테스트

### Firebase Console 재확인
1. URI가 정확히 저장되었는지 확인
2. Google 제공업체가 "사용 설정됨" 상태인지 확인
3. Web Client ID가 올바른지 확인

## 📝 예상 에러 메시지들

### 400 Error
```
Error: redirect_uri_mismatch
→ Firebase Console에 URI 추가 필요
```

### 401 Error
```
Error: invalid_client
→ Web Client ID 확인 필요
```

### 403 Error
```
Error: access_denied
→ 사용자가 권한 거부
```

## ✅ 설정 완료 후 정상 동작

```
1. Google 로그인 버튼 클릭
2. 브라우저 열림
3. Google 로그인 화면
4. 계정 선택
5. 권한 승인
6. 앱으로 복귀 ✅
7. 전화번호 입력 모달 표시
```

## 🔗 참고 링크

- [Firebase Console](https://console.firebase.google.com)
- [Expo AuthSession 문서](https://docs.expo.dev/guides/authentication/)
- [Google OAuth 문서](https://developers.google.com/identity/protocols/oauth2)
