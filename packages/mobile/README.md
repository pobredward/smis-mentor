# SMIS Mentor Mobile App

React Native (Expo SDK 54) 기반 모바일 앱입니다.

## 🚀 빠른 시작

### 개발 서버 실행

```bash
npm start
```

### Expo Go에서 실행 (제한적)

```bash
# Android
npm run android

# iOS
npm run ios
```

**⚠️ 주의**: Expo Go에서는 일부 기능이 제한됩니다:
- **원격 푸시 알림 (Remote Push Notifications)**: Expo SDK 53부터 Expo Go에서 제거됨
- **기타 네이티브 모듈**: 일부 커스텀 네이티브 코드 실행 불가

## 📱 Development Build (권장)

모든 기능을 테스트하려면 Development Build를 사용하세요.

### 1. 사전 준비

#### Android
- Android Studio 설치
- Java 17 설치
- 환경 변수 설정 (`ANDROID_HOME`, `JAVA_HOME`)

#### iOS (macOS만 가능)
- Xcode 설치 (최신 버전)
- CocoaPods 설치: `sudo gem install cocoapods`

### 2. Development Build 생성

#### 로컬 빌드 (빠름, 로컬 머신 필요)

```bash
# Android
npm run prebuild
npm run android

# iOS (macOS만 가능)
npm run prebuild
npm run ios
```

#### EAS Build (느림, 클라우드 빌드)

```bash
# EAS CLI 설치 (한 번만)
npm install -g eas-cli

# EAS 로그인
eas login

# Development Build 생성
npm run build:dev:android  # Android
npm run build:dev:ios      # iOS (Apple Developer 계정 필요)
```

빌드 완료 후:
1. QR 코드 또는 다운로드 링크를 받습니다
2. 실제 기기에 앱을 설치합니다
3. 설치된 앱을 실행하고 `npx expo start --dev-client` 실행
4. QR 코드를 스캔하여 개발 서버에 연결

### 3. Development Build에서 개발

```bash
# Development Build 전용 서버 시작
npx expo start --dev-client

# 또는 일반 시작 (자동 감지)
npm start
```

## 🔔 푸시 알림 테스트

### Expo Go (로컬 알림만)
- ✅ 로컬 알림 (예약 알림, 즉시 알림)
- ❌ 원격 푸시 알림 (서버에서 전송)

### Development Build (전체 기능)
- ✅ 로컬 알림
- ✅ 원격 푸시 알림
- ✅ FCM (Firebase Cloud Messaging)

### 푸시 알림 테스트 방법

1. Development Build 설치 및 실행
2. 앱에서 로그인
3. 푸시 알림 권한 허용
4. 콘솔에서 Expo Push Token 확인
5. [Expo Push Notification Tool](https://expo.dev/notifications)에서 테스트

## 🛠️ 캐시 초기화

문제 발생 시 캐시를 초기화하세요:

```bash
npm run start:clear

# 또는 수동 실행
npx expo start --clear
```

## 📦 빌드

### Preview 빌드 (내부 테스트)

```bash
npm run build:preview:android
npm run build:preview:ios
```

### Production 빌드 (스토어 배포)

```bash
npm run build:prod:android
npm run build:prod:ios

# 또는 동시에
npm run build:prod:all
```

## 🚢 배포

### Google Play Store

```bash
# 빌드 생성
npm run build:prod:android

# 스토어 제출
npm run submit:android
```

### Apple App Store

```bash
# 빌드 생성
npm run build:prod:ios

# 스토어 제출
npm run submit:ios
```

## 📚 더 알아보기

- [Expo Documentation](https://docs.expo.dev/)
- [Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)
- [EAS Build](https://docs.expo.dev/build/introduction/)
- [Push Notifications](https://docs.expo.dev/push-notifications/overview/)
