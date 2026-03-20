# Google Cloud Console 리다이렉트 URI 설정 가이드

## 🎯 현재 상황
- ✅ Client ID를 .env.local에 추가 완료
- ❌ Google Cloud Console에 리다이렉트 URI 미등록 → **400 에러 발생**

## 📝 해결 방법

### 1단계: Google Cloud Console 접속

1. https://console.cloud.google.com 접속
2. 프로젝트 선택: **smis-mentor**
3. 좌측 메뉴에서 **"APIs & Services"** 클릭
4. **"Credentials"** (사용자 인증 정보) 클릭

### 2단계: OAuth 2.0 Client ID 찾기

**Web Client ID 찾기:**
```
Client ID: 382190683951-d213f6sqm30lokbddeth6g2gucava2en.apps.googleusercontent.com
```

1. **Credentials** 페이지에서 위 Client ID 찾기
2. 이름: "Web client (auto created by Google Service)" 또는 비슷한 이름
3. 해당 Client ID 클릭 (편집)

### 3단계: 승인된 리디렉션 URI 추가

**"Authorized redirect URIs" 섹션에 다음 URI들 추가:**

#### 필수 (Expo Go 개발용)
```
https://auth.expo.io/@pobredward02/smis-mentor
```

#### 선택 (로컬 테스트용)
```
http://localhost:8081
http://localhost:19006
```

#### 선택 (Production 빌드용)
```
com.smis.smismentor:/oauth2redirect/google
```

### 4단계: 승인된 JavaScript 원본 추가

**"Authorized JavaScript origins" 섹션에 추가:**

```
https://auth.expo.io
```

### 5단계: 저장

1. **"SAVE"** 버튼 클릭
2. 변경사항이 적용될 때까지 몇 초 대기

## 🖼️ Google Cloud Console 화면 예시

```
┌──────────────────────────────────────────────┐
│ Edit OAuth client                            │
├──────────────────────────────────────────────┤
│ Name:                                        │
│ Web client (auto created by Google Service) │
│                                              │
│ Client ID:                                   │
│ 382190683951-d213f6sqm30lokbddeth...        │
│                                              │
│ Client secret:                               │
│ [보안 정보]                                   │
│                                              │
│ Authorized JavaScript origins:               │
│ [+ ADD URI]                                  │
│ 1. https://auth.expo.io                     │
│                                              │
│ Authorized redirect URIs:                    │
│ [+ ADD URI]                                  │
│ 1. https://auth.expo.io/@pobredward02/      │
│    smis-mentor                              │
│                                              │
│              [CANCEL]  [SAVE]               │
└──────────────────────────────────────────────┘
```

## 📋 상세 단계

### Google Cloud Console 전체 경로

```
https://console.cloud.google.com
  ↓
프로젝트 선택: smis-mentor
  ↓
☰ 메뉴 (좌측 상단)
  ↓
APIs & Services
  ↓
Credentials
  ↓
OAuth 2.0 Client IDs 섹션
  ↓
"Web client" 클릭
  ↓
Authorized redirect URIs
  ↓
[+ ADD URI]
  ↓
https://auth.expo.io/@pobredward02/smis-mentor
  ↓
[SAVE]
```

## 🔍 Client ID 확인 방법

### .env.local 파일에서 확인
```bash
# Web Client ID (type: 3)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=382190683951-d213f6sqm30lokbddeth6g2gucava2en.apps.googleusercontent.com

# Android Client ID (type: 1)
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=382190683951-cs53mija3pru3p0na3t8tqmqgqej8okn.apps.googleusercontent.com

# iOS Client ID (type: 2)
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=382190683951-6qjb6jfc4ssfirqt7807ttt7b77rl8me.apps.googleusercontent.com
```

### Google Cloud Console에서 확인

1. **APIs & Services > Credentials**
2. **OAuth 2.0 Client IDs** 섹션 확인:
   - Web client (Type: Web application) ← 이것 수정
   - Android client (Type: Android)
   - iOS client (Type: iOS)

## ✅ 설정할 리다이렉트 URI 목록

### 개발 환경 (Expo Go)
```
https://auth.expo.io/@pobredward02/smis-mentor
```

**URI 구성:**
- `https://auth.expo.io` - Expo Auth 서비스
- `@pobredward02` - Expo 계정 (app.json의 "owner")
- `smis-mentor` - 앱 slug (app.json의 "slug")

### Production 환경 (빌드 후)
```
com.smis.smismentor:/oauth2redirect/google
smismentor://oauth2redirect/google
```

## 🚨 주의사항

### 1. Web Client ID에만 추가
- ✅ **Web client** (type: Web application)에 추가
- ❌ Android client에는 추가 불필요
- ❌ iOS client에는 추가 불필요

### 2. URI 정확성
```
✅ https://auth.expo.io/@pobredward02/smis-mentor
❌ https://auth.expo.io/@pobredward02/smis-mentor/  (끝에 슬래시)
❌ http://auth.expo.io/@pobredward02/smis-mentor    (http)
❌ https://auth.expo.io/@Pobredward02/smis-mentor   (대문자)
```

### 3. Expo 계정 확인
```bash
# 현재 Expo 계정 확인
cd /Users/sunwoongshin/Desktop/dev/smis-mentor/packages/mobile
npx expo whoami
```

출력 예시:
```
pobredward02
```

## 🔧 설정 후 테스트

### 1. 변경사항 저장 확인
- Google Cloud Console에서 "SAVE" 클릭
- "OAuth client updated" 메시지 확인

### 2. Expo Go 앱 새로고침
```
Expo Go 앱에서:
1. 화면 흔들기 (Shake)
2. "Reload" 클릭
```

### 3. Google 로그인 테스트
```
1. 로그인 화면 이동
2. "Google로 계속하기" 클릭
3. 브라우저 열림 확인
4. Google 로그인 진행
5. 앱으로 복귀 확인 ✅
```

## 🐛 문제 해결

### 여전히 400 에러가 발생하면?

#### 1. URI 재확인
```bash
# 정확한 URI 확인
echo "https://auth.expo.io/@$(npx expo whoami)/smis-mentor"
```

#### 2. 캐시 클리어
```bash
# Expo 캐시 클리어
cd /Users/sunwoongshin/Desktop/dev/smis-mentor/packages/mobile
rm -rf .expo
npx expo start --clear
```

#### 3. 다른 Client ID 확인
만약 여러 개의 Web Client가 있다면, 각각에 모두 리다이렉트 URI 추가

#### 4. 변경사항 반영 대기
Google Cloud Console 변경사항이 반영되기까지 최대 5분 소요될 수 있음

## 📱 테스트 체크리스트

- [ ] Google Cloud Console 접속
- [ ] APIs & Services > Credentials 이동
- [ ] Web client 클릭 (382190683951-d213f6sqm30lok...)
- [ ] Authorized redirect URIs에 추가:
  ```
  https://auth.expo.io/@pobredward02/smis-mentor
  ```
- [ ] Authorized JavaScript origins에 추가:
  ```
  https://auth.expo.io
  ```
- [ ] SAVE 클릭
- [ ] Expo Go 앱 새로고침
- [ ] Google 로그인 테스트

## 🎉 성공 시 동작

```
1. "Google로 계속하기" 클릭
   ↓
2. 기기 브라우저 열림
   ↓
3. Google 로그인 화면 표시
   ↓
4. 계정 선택 및 로그인
   ↓
5. "SMIS Mentor가 다음을 요청합니다" 권한 화면
   ↓
6. "허용" 클릭
   ↓
7. 자동으로 앱 복귀 ✅
   ↓
8. 전화번호 입력 모달 표시
```

## 🔗 참고 링크

- [Google Cloud Console](https://console.cloud.google.com)
- [Expo AuthSession 문서](https://docs.expo.dev/guides/authentication/)
- [OAuth 2.0 설정 가이드](https://developers.google.com/identity/protocols/oauth2)

## 💡 핵심 요약

1. **Google Cloud Console** (Firebase Console 아님!)
2. **APIs & Services > Credentials**
3. **Web client** OAuth 클라이언트 선택
4. **Authorized redirect URIs** 섹션에 추가:
   ```
   https://auth.expo.io/@pobredward02/smis-mentor
   ```
5. **저장** 후 Expo Go 앱 새로고침

이제 Google 로그인이 정상 작동합니다! 🚀
