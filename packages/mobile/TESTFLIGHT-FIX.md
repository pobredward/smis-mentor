# TestFlight 구글 로그인 크래시 수정

## 문제 원인

TestFlight에서 구글 로그인 시 앱이 튕기는 이유:

1. **환경 변수 누락**: EAS Build 시 `.env.local` 파일이 자동으로 로드되지 않아 Google Client ID가 `undefined`로 설정됨
2. **URL Scheme 미등록**: `Info.plist`에 Google OAuth Redirect URL Scheme이 등록되지 않아 로그인 완료 후 앱으로 돌아오는 deep link 실패

## 수정 사항

### 1. `eas.json` - 환경 변수 명시적 전달

```json
{
  "build": {
    "development": {
      "env": {
        "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID": "382190683951-d213f6sqm30lokbddeth6g2gucava2en.apps.googleusercontent.com",
        "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID": "382190683951-6qjb6jfc4ssfirqt7807ttt7b77rl8me.apps.googleusercontent.com",
        "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID": "382190683951-cs53mija3pru3p0na3t8tqmqgqej8okn.apps.googleusercontent.com"
      }
    },
    "preview": { ... },
    "production": { ... }
  }
}
```

### 2. `app.config.ts` - URL Scheme 명시적 추가

```typescript
ios: {
  infoPlist: {
    CFBundleURLTypes: [
      {
        CFBundleURLSchemes: ['com.googleusercontent.apps.382190683951-6qjb6jfc4ssfirqt7807ttt7b77rl8me'],
      },
      {
        CFBundleURLSchemes: ['smismentor'],
      },
    ],
  },
}
```

## 빌드 명령어

### TestFlight 빌드 (production)

```bash
cd packages/mobile
eas build --platform ios --profile production
```

### Preview 빌드 (internal)

```bash
cd packages/mobile
eas build --platform ios --profile preview
```

## 확인 사항

### 1. Google Cloud Console 확인

- **URL Scheme**: `com.googleusercontent.apps.382190683951-6qjb6jfc4ssfirqt7807ttt7b77rl8me`
- **Bundle ID**: `com.smis.smismentor`
- **iOS Client ID**: `382190683951-6qjb6jfc4ssfirqt7807ttt7b77rl8me.apps.googleusercontent.com`

### 2. 빌드 후 확인

TestFlight 설치 후:

1. 로그인 화면에서 "구글 로그인" 버튼 클릭
2. Google 로그인 화면 정상 표시 확인
3. 로그인 완료 후 앱으로 복귀 확인
4. 사용자 정보 정상 로드 확인

## 추가 디버깅 (필요 시)

### 1. EAS Build 로그 확인

```bash
eas build:list
eas build:view [BUILD_ID]
```

### 2. Sentry 로그 확인

- [Sentry Dashboard](https://sentry.io/organizations/pobredward/projects/smis-mentor-mobile/)
- 구글 로그인 관련 에러 필터링

### 3. TestFlight 크래시 로그

- App Store Connect > TestFlight > Crashes
- 구글 로그인 시점의 크래시 로그 확인

## 참고

- Development Build에서는 `.env.local` 파일이 로드되므로 정상 작동
- TestFlight/Production Build에서는 `eas.json`의 `env` 필드에 명시적으로 환경 변수 전달 필요
- Google OAuth는 URL Scheme을 통해 앱으로 돌아오므로 `Info.plist`에 반드시 등록 필요
