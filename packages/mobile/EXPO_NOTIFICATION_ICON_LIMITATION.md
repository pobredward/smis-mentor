# Expo 개발 환경에서 알림 아이콘 제한사항

## 문제 상황

Expo Go 또는 Expo Development Client에서 푸시 알림을 테스트할 때, `notification-icon.png`를 설정해도 Expo 기본 아이콘이 표시됩니다.

## 원인

### Expo Go의 제한사항
- **Expo Go**는 사전 빌드된 앱으로, 커스텀 네이티브 설정을 적용할 수 없습니다
- 알림 아이콘은 네이티브 리소스로 앱 빌드 시 포함되어야 합니다
- `app.json`의 `expo-notifications` 플러그인 설정은 **빌드 시에만** 적용됩니다

### Development Build vs Expo Go

| 기능 | Expo Go | Development Build | Production Build |
|------|---------|-------------------|------------------|
| 커스텀 알림 아이콘 | ❌ 불가능 | ✅ 가능 | ✅ 가능 |
| 네이티브 모듈 | ❌ 제한적 | ✅ 모두 가능 | ✅ 모두 가능 |
| 빠른 개발 | ✅ 매우 빠름 | ⚠️ 빌드 필요 | ⚠️ 빌드 필요 |

## 해결 방법

### ✅ 방법 1: Development Build 생성 (권장)

커스텀 알림 아이콘을 테스트하려면 Development Build를 생성해야 합니다.

```bash
cd packages/mobile

# 1. EAS Build로 Development Build 생성
npm run build:dev:android  # Android
npm run build:dev:ios      # iOS

# 또는 로컬에서 빌드
npx expo prebuild --clean
npx expo run:android       # Android
npx expo run:ios          # iOS
```

#### Development Build란?
- Expo Go와 유사하지만 **네이티브 설정이 적용된** 개발용 앱
- 커스텀 네이티브 모듈, 아이콘, 스플래시 등 모두 적용 가능
- 여전히 Fast Refresh, Hot Reload 등 개발 기능 사용 가능

### ⚠️ 방법 2: Production Build (최종 확인용)

```bash
cd packages/mobile

# EAS Build로 프로덕션 빌드
npm run build:prod:android
npm run build:prod:ios
```

## 현재 상황 분석

### 로그 분석
```
LOG  Expo Push Token: ExponentPushToken[mY2cxsEqKTB7yqPfRtSLZg]
LOG  푸시 토큰 저장 완료: ExponentPushToken[mY2cxsEqKTB7yqPfRtSLZg]
LOG  알림 수신: {"date": 1773982421.429487, ...}
WARN  [expo-notifications]: `shouldShowAlert` is deprecated.
```

**결과**:
- ✅ 푸시 토큰 등록 성공
- ✅ 알림 수신 기능 정상 작동
- ⚠️ 알림 핸들러 경고 (deprecation warning)
- ❌ 커스텀 아이콘은 Expo Go에서 표시 불가

## 즉시 적용 가능한 해결책

### 옵션 A: Development Build 사용 (추천)

**장점**:
- 커스텀 알림 아이콘 테스트 가능
- 모든 네이티브 기능 테스트 가능
- 개발 속도 유지 (Fast Refresh 지원)

**단점**:
- 초기 빌드 시간 필요 (15-30분)
- 기기에 별도 앱 설치 필요

```bash
# EAS Build로 생성 (클라우드에서 빌드)
cd packages/mobile
eas build --profile development --platform android

# 생성된 APK를 기기에 설치
```

### 옵션 B: 프로덕션 빌드로 최종 확인

알림 아이콘은 프로덕션 배포 전 최종 확인 단계에서 테스트:

```bash
# TestFlight (iOS) 또는 Internal Testing (Android)
npm run build:prod:android
npm run build:prod:ios
```

## Deprecation Warning 해결

로그의 경고 메시지를 해결하겠습니다:

```
WARN  [expo-notifications]: `shouldShowAlert` is deprecated. 
      Specify `shouldShowBanner` and / or `shouldShowList` instead.
```

### 수정 필요 파일: notificationService.ts

```typescript
// 기존 (deprecated)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// 수정 (최신)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,    // 배너 표시 (상단 알림)
    shouldShowList: true,      // 알림 센터에 표시
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});
```

## 권장 개발 워크플로우

### 1. 일반 개발 (Expo Go 사용)
```bash
npm start:mobile
# 빠른 개발, UI/로직 테스트
```

### 2. 네이티브 기능 테스트 (Development Build)
```bash
npm run build:dev:android
# 알림 아이콘, 네이티브 모듈 테스트
```

### 3. 최종 배포 전 검증 (Production Build)
```bash
npm run build:prod:android
# TestFlight/Internal Testing으로 배포
```

## 결론

### 현재 상황
- ✅ 알림 기능 자체는 정상 작동
- ✅ 푸시 토큰 등록 성공
- ❌ **Expo Go에서는 커스텀 아이콘 표시 불가** (정상)
- ⚠️ Deprecation warning 수정 필요

### 다음 단계
1. **즉시**: Deprecation warning 수정
2. **테스트**: Development Build로 알림 아이콘 확인
3. **배포**: Production Build로 최종 검증

### 빠른 테스트를 원한다면

```bash
# 로컬에서 Development Build 생성 (가장 빠름)
cd packages/mobile
npx expo prebuild --clean
npx expo run:android  # Android Studio 필요
npx expo run:ios     # Xcode 필요 (macOS만)
```

이렇게 하면 5-10분 내에 커스텀 알림 아이콘이 적용된 앱을 기기에서 테스트할 수 있습니다.
