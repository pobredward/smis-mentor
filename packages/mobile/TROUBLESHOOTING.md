# React Native 개발 환경 오류 해결 가이드

## 🔴 RNCWebView 중복 등록 오류

### 오류 메시지
```
ERROR: Invariant Violation: Tried to register two views with the same name RNCWebView
```

### 원인
- Metro bundler 캐시 문제
- `react-native-webview`가 중복으로 로드됨
- 이전 빌드 아티팩트가 남아있음

### 해결 방법

#### 방법 1: 자동 캐시 클리어 (권장)
```bash
cd packages/mobile
npm run start:clear
```

#### 방법 2: 수동 캐시 클리어
```bash
cd packages/mobile

# Metro 캐시 클리어
rm -rf $TMPDIR/metro-*
rm -rf $TMPDIR/haste-map-*
rm -rf $TMPDIR/react-*

# Expo 캐시 클리어
rm -rf .expo
rm -rf node_modules/.cache

# Watchman 캐시 클리어 (설치된 경우)
watchman watch-del-all

# Expo 재시작
npx expo start -c
```

#### 방법 3: 완전 초기화
```bash
cd packages/mobile

# node_modules 삭제
rm -rf node_modules

# 패키지 재설치
npm install

# 캐시 클리어와 함께 시작
npm run start:clear
```

---

## ⚠️ Firebase Auth AsyncStorage 경고

### 경고 메시지
```
@firebase/auth: Auth (11.5.0): 
You are initializing Firebase Auth for React Native without providing
AsyncStorage. Auth state will default to memory persistence and will not
persist between sessions.
```

### 원인
- Firebase Auth가 React Native의 AsyncStorage를 찾지 못함
- 일반적으로 캐시 문제로 발생

### 해결 방법

#### 1. 캐시 클리어 (대부분의 경우 해결됨)
```bash
npm run start:clear
```

#### 2. Firebase 설정 확인

`src/config/firebase.ts`가 다음과 같이 설정되어 있는지 확인:

```typescript
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Auth 초기화
let auth;
try {
  auth = getAuth(app);
} catch (error) {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}
```

#### 3. AsyncStorage 패키지 확인
```bash
npm list @react-native-async-storage/async-storage
```

패키지가 설치되어 있지 않으면:
```bash
npm install @react-native-async-storage/async-storage
```

---

## 🐛 기타 일반적인 오류

### Metro Bundler 오류
```bash
# Metro 완전 재시작
pkill -f "expo"
npm run start:clear
```

### 포트 충돌 (Port already in use)
```bash
# 8081 포트 사용 중인 프로세스 찾기
lsof -i :8081

# 프로세스 종료
kill -9 <PID>

# 또는 다른 포트 사용
npx expo start --port 8082
```

### Watchman 오류
```bash
# Watchman 재설정
watchman watch-del-all
watchman shutdown-server
```

### iOS Simulator 오류
```bash
# Simulator 재설정
xcrun simctl shutdown all
xcrun simctl erase all

# Xcode 캐시 클리어
rm -rf ~/Library/Developer/Xcode/DerivedData/*
```

### Android 에뮬레이터 오류
```bash
# ADB 재시작
adb kill-server
adb start-server

# 에뮬레이터 콜드 부팅
emulator -avd <AVD_NAME> -wipe-data
```

---

## 🔧 패키지 버전 문제

### Expo SDK 호환성 확인
```bash
cd packages/mobile
npx expo-doctor
```

### 패키지 버전 자동 수정
```bash
npx expo install --fix
```

---

## 📱 빌드 오류

### EAS Build 실패
```bash
# 로컬에서 prebuild 테스트
npx expo prebuild --clean

# 빌드 로그 확인
eas build:view <BUILD_ID>
```

### 네이티브 모듈 링크 오류
```bash
# iOS
cd ios && pod install && cd ..

# Android
cd android && ./gradlew clean && cd ..
```

---

## 🚀 빠른 해결책

대부분의 개발 환경 오류는 다음 단계로 해결됩니다:

```bash
cd packages/mobile

# 1. 모든 캐시 클리어
npm run start:clear

# 2. 안 되면 node_modules 재설치
rm -rf node_modules
npm install
npm run start:clear

# 3. 여전히 안 되면 완전 초기화
rm -rf node_modules .expo ios android
npm install
npx expo prebuild --clean
npm run start:clear
```

---

## 💡 예방 팁

1. **정기적인 캐시 클리어**: 이상한 오류가 보이면 먼저 캐시를 클리어하세요
2. **패키지 버전 관리**: `npx expo-doctor`를 정기적으로 실행
3. **Git 커밋 전**: 테스트를 위해 깨끗한 환경에서 확인
4. **의존성 업데이트**: `npx expo install --fix` 사용

---

## 📞 추가 도움

- Expo 문서: https://docs.expo.dev/troubleshooting/
- React Native 문서: https://reactnative.dev/docs/troubleshooting
- Firebase 문서: https://firebase.google.com/docs/auth/web/react-native
