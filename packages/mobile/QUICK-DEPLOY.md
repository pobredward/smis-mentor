# 🚀 SMIS Mentor 배포 빠른 참조

## 한 줄 명령어로 배포하기

### iOS App Store 배포
```bash
cd packages/mobile && npm run deploy:ios
```

### Android Play Store 배포
```bash
cd packages/mobile && npm run deploy:android
```

### 양쪽 모두 배포
```bash
cd packages/mobile && npm run deploy:all
```

---

## 루트에서 실행
```bash
# iOS
npm run deploy:mobile:ios

# Android
npm run deploy:mobile:android

# 모두
npm run deploy:mobile:all
```

---

## 단계별 실행

### 1단계: 빌드만
```bash
# iOS
npm run deploy:build-only:ios

# Android
npm run deploy:build-only:android
```

### 2단계: 제출만 (빌드 완료 후)
```bash
# iOS
npm run deploy:submit-only:ios

# Android
npm run deploy:submit-only:android
```

---

## 긴급 업데이트 (OTA)
JavaScript 변경사항만 즉시 배포 (스토어 심사 불필요):

```bash
npm run update:production
```

---

## 수동 배포 (자동 제출 실패 시)

### iOS - Transporter 사용
```bash
# 1. IPA 다운로드
bash scripts/download-ipa.sh

# 2. Transporter 앱으로 업로드
# - Transporter 실행
# - IPA 드래그 앤 드롭
# - Deliver 클릭
```

### Android - Play Console
```bash
# 1. AAB 다운로드
# https://expo.dev/accounts/pobredward02/projects/smis-mentor/builds

# 2. Play Console 업로드
# https://play.google.com/console
```

---

## 빌드 상태 확인

```bash
# 최근 빌드 목록
eas build:list --platform ios --limit 5
eas build:list --platform android --limit 5

# 웹에서 확인
open https://expo.dev/accounts/pobredward02/projects/smis-mentor/builds
```

---

## 스토어 관리

### App Store Connect
```bash
open https://appstoreconnect.apple.com/apps/6759916856
```

### Google Play Console
```bash
open https://play.google.com/console
```

---

## 설정 정보

| 항목 | 값 |
|------|-----|
| **Apple ID** | 6759916856 |
| **Bundle ID** | com.smis.smismentor |
| **Expo Owner** | pobredward02 |
| **Project ID** | 684d0445-c299-4e77-a362-42efa9c671ac |

---

## 문제 해결

### EAS CLI 재설치
```bash
npm install -g eas-cli@latest
```

### 캐시 클리어 후 빌드
```bash
eas build --clear-cache --platform ios
eas build --clear-cache --platform android
```

### 로그 확인
```bash
# 특정 빌드 로그
eas build:view [BUILD_ID]

# 제출 상태 (웹)
open https://expo.dev/accounts/pobredward02/projects/smis-mentor/submissions
```

---

## 자세한 가이드

📖 **전체 문서**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- 단계별 프로세스
- App Store Connect 설정
- 문제 해결 상세 가이드
