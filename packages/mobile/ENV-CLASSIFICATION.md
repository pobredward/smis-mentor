# 환경 변수 분류 가이드

## 모바일 앱 환경 변수 분류

### 1. 모바일 앱에서 사용 (EAS에 추가 필요) ✅

#### 클라이언트 사이드 (EXPO_PUBLIC_* - 앱 번들에 포함)

```bash
# 웹 API URL
EXPO_PUBLIC_WEB_API_URL=https://www.smis-mentor.com

# Google 로그인
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=382190683951-d213f6sqm30lokbddeth6g2gucava2en.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=382190683951-6qjb6jfc4ssfirqt7807ttt7b77rl8me.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=382190683951-cs53mija3pru3p0na3t8tqmqgqej8okn.apps.googleusercontent.com

# 네이버 로그인
EXPO_PUBLIC_NAVER_CLIENT_ID=XgK86FxXznee_HFfBeH3
EXPO_PUBLIC_NAVER_CLIENT_SECRET=GcoXVzqEZs
EXPO_PUBLIC_NAVER_CALLBACK_URL=https://auth.expo.io/@pobredward02/smis-mentor

# Sentry (클라이언트)
EXPO_PUBLIC_SENTRY_DSN=https://8df6107450a728a3f4eca979860e74ca@o4511139689791488.ingest.us.sentry.io/4511139715088384
```

#### 빌드 타임 (비밀 정보 - visibility: secret)

```bash
# Sentry (빌드 시 소스맵 업로드)
SENTRY_ORG=pobredward
SENTRY_PROJECT=smis-mentor-mobile
SENTRY_AUTH_TOKEN=sntrys_...
```

### 2. 웹 서버에서만 사용 (EAS 불필요) ❌

다음 환경 변수는 **Next.js API 라우트**에서만 사용되므로 **모바일 EAS에 추가하지 않습니다**:

```bash
# 네이버 클라우드 SMS API (웹 서버 전용)
NAVER_CLOUD_SMS_SERVICE_ID=ncp:sms:kr:YOUR_SERVICE_ID:your-service-name
NAVER_CLOUD_SMS_ACCESS_KEY=ncp_iam_XXXXXXXXXXXXXXXXXXXXX
NAVER_CLOUD_SMS_SECRET_KEY=ncp_iam_YYYYYYYYYYYYYYYYYYYYYYY

# Firebase Admin SDK (웹 서버 전용)
FIREBASE_PROJECT_ID=smis-mentor
FIREBASE_PRIVATE_KEY_ID=85622f4a78cd9880d5c13f7a5372c6751e059b3d
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@smis-mentor.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=114641709715548547776
```

**이유:**
- 모바일 앱에서는 `EXPO_PUBLIC_WEB_API_URL`로 웹 API를 호출
- 웹 API 라우트(`/api/sms`, `/api/auth` 등)에서 SMS 발송, Firebase Admin 작업 수행
- 민감한 API 키를 모바일 앱 번들에 포함하면 보안 위험

---

## 환경별 설정

### development 환경

```bash
EXPO_PUBLIC_WEB_API_URL=http://localhost:3000  # 로컬 개발 서버
```

### preview 환경

```bash
EXPO_PUBLIC_WEB_API_URL=https://www.smis-mentor.com  # 프로덕션 서버
```

### production 환경

```bash
EXPO_PUBLIC_WEB_API_URL=https://www.smis-mentor.com  # 프로덕션 서버
```

---

## EAS 환경 변수 추가 방법

### 방법 1: 스크립트 실행 (권장)

```bash
cd packages/mobile
chmod +x scripts/setup-eas-env.sh

# 모든 환경 (development, preview, production)
./scripts/setup-eas-env.sh

# 특정 환경만
./scripts/setup-eas-env.sh production
```

### 방법 2: 웹사이트에서 수동 추가

1. [Expo Dashboard](https://expo.dev/accounts/pobredward02/projects/smis-mentor/environment-variables) 접속
2. "+ Add Variable" 클릭
3. 위의 환경 변수들을 하나씩 추가
4. 각 변수마다 환경(`development`, `preview`, `production`) 선택

**Visibility 설정:**
- `EXPO_PUBLIC_*` → Plain text (앱 번들에 포함되므로)
- `SENTRY_AUTH_TOKEN` → Secret (빌드 서버에서만 사용)

---

## 확인 방법

```bash
# 모든 환경 변수 확인
eas env:list

# 특정 환경만 확인
eas env:list --environment production

# 로컬에 다운로드 (.env.local 생성)
eas env:pull
```

---

## 보안 주의사항

### ✅ 안전함

- `EXPO_PUBLIC_*` 변수는 앱 번들에 포함되어도 안전 (공개 정보)
- Google/Naver Client ID는 OAuth 제공자에서 도메인 제한 가능

### ⚠️ 주의

- `EXPO_PUBLIC_NAVER_CLIENT_SECRET`은 공개되어도 **Callback URL이 제한되어 있어** 상대적으로 안전
- 그래도 가능하면 서버 사이드에서만 사용 권장

### ❌ 위험 (절대 클라이언트에 노출 금지)

- `NAVER_CLOUD_SMS_*` (SMS API 키)
- `FIREBASE_PRIVATE_KEY` (Firebase Admin SDK)
- `SENTRY_AUTH_TOKEN` (소스맵 업로드 권한)

이러한 변수들은 **웹 서버 환경 변수**로만 관리하고, **모바일 앱에는 포함하지 않습니다**.

---

## 아키텍처 다이어그램

```
┌─────────────────┐
│  모바일 앱       │
│  (React Native) │
└────────┬────────┘
         │ EXPO_PUBLIC_WEB_API_URL
         │
         ▼
┌─────────────────────────────────────┐
│  웹 서버 (Next.js)                   │
│  ┌─────────────────────────────┐   │
│  │ API 라우트                   │   │
│  │ - /api/sms (SMS 발송)       │   │
│  │ - /api/auth (Firebase)      │   │
│  └─────────────────────────────┘   │
│  ↓ NAVER_CLOUD_SMS_*               │
│  ↓ FIREBASE_PRIVATE_KEY            │
└─────────────────────────────────────┘
         │
         ▼
   외부 API (네이버 SMS, Firebase)
```

**장점:**
- 모바일 앱에 민감한 API 키 노출 안 됨
- 웹 서버에서 중앙 집중식 관리
- API 키 변경 시 앱 재배포 불필요
