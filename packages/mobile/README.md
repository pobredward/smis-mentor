# SMIS Mentor Mobile App

SMIS Mentor 캠프 운영진을 위한 모바일 애플리케이션입니다.

## 🚀 빠른 시작

### 개발 환경 실행
```bash
npm start
```

### 플랫폼별 실행
```bash
npm run ios      # iOS 시뮬레이터
npm run android  # Android 에뮬레이터
```

---

## 📦 배포 명령어

### iOS 배포 (App Store)
```bash
# 🍎 빌드 + 자동 제출
npm run deploy:ios

# 빌드만
npm run deploy:build-only:ios

# 제출만 (최신 빌드)
npm run deploy:submit-only:ios
```

### Android 배포 (Play Store)
```bash
# 🤖 빌드 + 자동 제출
npm run deploy:android

# 빌드만
npm run deploy:build-only:android

# 제출만 (최신 빌드)
npm run deploy:submit-only:android
```

### 양쪽 모두 배포
```bash
npm run deploy:all
```

---

## 📱 OTA 업데이트 (즉시 배포)

앱 스토어 심사 없이 JavaScript 변경사항만 즉시 배포:

```bash
# 프로덕션 환경
npm run update:production

# 프리뷰 환경
npm run update:preview
```

**제한사항**: 네이티브 코드 변경 불가 (새 라이브러리, 권한 등은 전체 빌드 필요)

---

## 🔧 프로젝트 설정

### 환경 변수
`.env.local` 파일 생성 필요:
```env
# Firebase
EXPO_PUBLIC_WEB_API_URL=https://www.smis-mentor.com

# 네이버 소셜 로그인
EXPO_PUBLIC_NAVER_CLIENT_ID=
EXPO_PUBLIC_NAVER_CLIENT_SECRET=

# Google 소셜 로그인
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=

# Sentry
EXPO_PUBLIC_SENTRY_DSN=
```

### 필수 파일
- `GoogleService-Info.plist` (iOS Firebase 설정)
- `google-services.json` (Android Firebase 설정)

---

## 📖 상세 가이드

배포 프로세스, 문제 해결 등 자세한 내용은 [DEPLOYMENT.md](./DEPLOYMENT.md)를 참조하세요.

### 주요 내용
- ✅ 단계별 배포 프로세스
- ✅ App Store Connect 설정
- ✅ Google Play Console 설정
- ✅ 문제 해결 가이드
- ✅ Transporter 수동 제출 방법

---

## 🏗️ 기술 스택

- **Framework**: React Native (Expo SDK 54)
- **Language**: TypeScript
- **Navigation**: React Navigation 6
- **State Management**: React Hooks, React Query (TanStack Query)
- **Backend**: Firebase (Firestore, Auth, Storage)
- **Forms**: React Hook Form + Zod
- **Deployment**: EAS Build & Submit

---

## ⚡ 성능 최적화

### 캠프 탭 프리로딩
마이페이지에서 캠프 코드 변경 시, 캠프 탭의 모든 데이터를 사전에 로딩하여 즉각적인 탭 전환이 가능합니다.

```bash
# 상세 구현 내용
cat CAMP-PRELOAD-IMPLEMENTATION.md
cat WEBVIEW-PRELOAD-IMPLEMENTATION.md
cat FINAL-IMPLEMENTATION-SUMMARY.md
```

**Phase 1: 데이터 프리페칭**
- ✅ React Query 기반 스마트 캐싱 (staleTime: 5분)
- ✅ 7개 서브탭 데이터 병렬 프리페칭
- ✅ 자동 캐시 무효화

**Phase 2: WebView 백그라운드 프리로딩** 🌟
- ✅ 1x1 크기 WebView로 노션/구글시트 페이지 사전 로딩
- ✅ opacity 0.01 트릭으로 OS 제약 우회
- ✅ 교육/시간표/인솔표 모든 링크 즉시 표시

**Phase 3: 사용자 경험**
- ✅ 4단계 프리페칭 모달 (진행률 표시)
- ✅ 단계별 체크리스트 UI
- ✅ 완료 메시지 및 사용자 안내

### 성능 비교
```
Before: 링크 클릭 → 🐌 2-3초 대기
After:  링크 클릭 → ⚡ 즉시 표시!
```

---

## 📂 프로젝트 구조

```
packages/mobile/
├── src/
│   ├── components/       # 재사용 가능한 컴포넌트
│   ├── screens/          # 화면 컴포넌트
│   ├── navigation/       # 네비게이션 설정
│   ├── services/         # Firebase 서비스
│   └── utils/            # 유틸리티 함수
├── assets/               # 이미지, 아이콘 등
├── scripts/              # 배포 스크립트
├── app.config.ts         # Expo 설정
├── eas.json              # EAS Build 설정
└── DEPLOYMENT.md         # 배포 가이드
```

---

## 🧪 테스트

```bash
# TypeScript 타입 체크
npm run type-check

# Linter 실행
npm run lint
```

---

## 📞 도움말

### 빌드 상태 확인
- Expo 대시보드: https://expo.dev/accounts/pobredward02/projects/smis-mentor/builds

### 스토어 관리
- App Store Connect: https://appstoreconnect.apple.com/apps/6759916856
- Google Play Console: https://play.google.com/console

### 문제 발생 시
1. `DEPLOYMENT.md`의 문제 해결 섹션 참조
2. Expo 대시보드에서 빌드 로그 확인
3. Firebase 콘솔에서 에러 로그 확인

---

## 📄 라이선스

Private - SMIS Mentor
