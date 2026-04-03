# Expo 환경 변수 관리 가이드

## 문제 상황

- **Development Build**: `.env.local` 파일을 로컬에서 읽어서 정상 작동
- **TestFlight/Production**: EAS 서버에서 빌드되므로 로컬 `.env.local` 파일 접근 불가 → 환경 변수 `undefined`

## Expo 공식 권장 방법 (2026)

### 방법 1: EAS 환경 변수 (가장 권장) ⭐

**장점:**
- `.env` 파일을 git에 커밋할 필요 없음 (보안 강화)
- 빌드마다 환경별로 자동 주입
- 팀원들과 안전하게 공유 가능
- `eas.json`에 일일이 적을 필요 없음

#### 설정 방법

**1. CLI로 환경 변수 추가 (자동화)**

```bash
# 스크립트 실행 (한 번에 모든 환경 변수 추가)
cd packages/mobile
chmod +x scripts/setup-eas-env.sh

# 모든 환경 (development, preview, production)
./scripts/setup-eas-env.sh

# 특정 환경만
./scripts/setup-eas-env.sh production
```

**추가되는 환경 변수:**
- `EXPO_PUBLIC_WEB_API_URL` (환경별 다름)
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
- `EXPO_PUBLIC_NAVER_CLIENT_ID`
- `EXPO_PUBLIC_NAVER_CLIENT_SECRET`
- `EXPO_PUBLIC_NAVER_CALLBACK_URL`
- `EXPO_PUBLIC_SENTRY_DSN`
- `SENTRY_ORG` (secret)
- `SENTRY_PROJECT` (secret)
- `SENTRY_AUTH_TOKEN` (secret)

**2. 웹사이트에서 직접 추가 (더 편함)**

1. [Expo Dashboard](https://expo.dev/accounts/pobredward02/projects/smis-mentor/environment-variables) 접속
2. "+ Add Variable" 클릭
3. 변수 추가 후 환경 선택: `development`, `preview`, `production`

**Visibility 설정:**
- `EXPO_PUBLIC_*` → **Plain text** (앱 번들에 포함)
- `SENTRY_*` (빌드 타임) → **Secret** (빌드 서버에서만 사용)

#### eas.json 설정

```json
{
  "build": {
    "development": {
      "environment": "development"  // EAS 환경 변수 자동 로드
    },
    "preview": {
      "environment": "preview"
    },
    "production": {
      "environment": "production"
    }
  }
}
```

#### 확인

```bash
# CLI로 확인
eas env:list

# 특정 환경 확인
eas env:list --environment production

# 로컬에 다운로드 (.env.local 자동 생성)
eas env:pull --environment development
```

---

## 환경 변수 분류

### 모바일 앱에서 사용 (EAS에 추가) ✅

#### 클라이언트 사이드 (EXPO_PUBLIC_*)

```bash
EXPO_PUBLIC_WEB_API_URL=https://www.smis-mentor.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=...
EXPO_PUBLIC_NAVER_CLIENT_ID=...
EXPO_PUBLIC_NAVER_CLIENT_SECRET=...
EXPO_PUBLIC_NAVER_CALLBACK_URL=...
EXPO_PUBLIC_SENTRY_DSN=...
```

#### 빌드 타임 (Secret)

```bash
SENTRY_ORG=pobredward
SENTRY_PROJECT=smis-mentor-mobile
SENTRY_AUTH_TOKEN=sntrys_...
```

### 웹 서버에서만 사용 (EAS 불필요) ❌

다음 환경 변수는 **Next.js API 라우트**에서만 사용되므로 **모바일 EAS에 추가하지 않습니다**:

```bash
# 네이버 클라우드 SMS API (웹 서버 전용)
NAVER_CLOUD_SMS_SERVICE_ID=...
NAVER_CLOUD_SMS_ACCESS_KEY=...
NAVER_CLOUD_SMS_SECRET_KEY=...

# Firebase Admin SDK (웹 서버 전용)
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_CLIENT_ID=...
```

**이유:**
- 모바일 앱에서는 `EXPO_PUBLIC_WEB_API_URL`로 웹 API를 호출
- 웹 API 라우트에서 SMS 발송, Firebase Admin 작업 수행
- 민감한 API 키를 모바일 앱 번들에 포함하면 보안 위험

자세한 내용은 `ENV-CLASSIFICATION.md` 참고

---

### 방법 2: eas.json의 env 필드 (단순한 프로젝트)

**장점:**
- 간단한 설정
- 버전 관리 가능

**단점:**
- 민감한 정보가 git에 노출됨 (public repo에서는 위험)
- 환경 변수가 많으면 `eas.json`이 지저분해짐

```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "..."
      }
    }
  }
}
```

---

### 방법 3: .env 파일 (로컬 개발 전용)

`.env.local`은 **로컬 개발에만 사용**하고, EAS Build에서는 사용하지 않습니다.

```bash
# .gitignore에 포함되어 있음
.env*.local
.env
```

**로컬 개발 시:**
1. `eas env:pull` 명령어로 EAS 환경 변수를 `.env.local`로 다운로드
2. 로컬에서는 `.env.local` 파일 사용
3. EAS Build 시에는 EAS 서버의 환경 변수 사용

---

## 왜 이전에는 작동했는가?

### 가능한 이유

1. **app.config.ts에서 process.env 사용**

```typescript
// app.config.ts
export default {
  extra: {
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  }
}
```

- 로컬 빌드: 로컬 `.env.local` 파일에서 읽음 ✅
- EAS Build: EAS 서버의 환경 변수에서 읽음 ❌ (설정 안 했으면 `undefined`)

2. **.env 파일을 실수로 git에 커밋**
   - `.env.local`이 아닌 `.env` 파일을 사용했고, git에 커밋되어 EAS 서버로 업로드됨
   - **위험:** 민감한 정보 노출

3. **Development Build만 테스트**
   - Development Build는 로컬 환경 변수를 사용하므로 정상 작동
   - TestFlight/Production Build는 EAS 서버 환경 변수가 필요

---

## 최종 권장 설정

### 1. EAS 환경 변수 추가 (웹사이트 또는 CLI)

```bash
./scripts/setup-eas-env.sh
```

### 2. eas.json 설정

```json
{
  "build": {
    "development": {
      "environment": "development"
    },
    "preview": {
      "environment": "preview"
    },
    "production": {
      "environment": "production"
    }
  }
}
```

### 3. 로컬 개발 시

```bash
# EAS 환경 변수 다운로드
eas env:pull --environment development

# .env.local 파일 자동 생성됨 (gitignore에 포함되어 있음)
```

### 4. 빌드

```bash
# production 빌드 (EAS 서버의 production 환경 변수 사용)
eas build --platform ios --profile production

# preview 빌드 (EAS 서버의 preview 환경 변수 사용)
eas build --platform ios --profile preview
```

---

## 환경 변수 우선순위 (Expo 공식)

1. **EAS 환경 변수** (최우선)
2. **eas.json의 env 필드**
3. **app.config.ts의 extra 필드**
4. **.env 파일** (로컬 개발 전용)

EAS Build 시에는 **EAS 환경 변수 > eas.json > app.config.ts** 순서로 적용됩니다.

---

## 참고 문서

- [Expo Environment Variables (공식 문서)](https://docs.expo.dev/build-reference/variables/)
- [EAS Environment Variables FAQ](https://docs.expo.io/eas/environment-variables/faq)
- [Environment Variables Best Practices](https://docs.expo.dev/guides/environment-variables/)
- `ENV-CLASSIFICATION.md` - 환경 변수 분류 및 보안 가이드
