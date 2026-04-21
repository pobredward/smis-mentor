# SMIS Mentor Mobile App

SMIS Mentor 캠프 운영진을 위한 React Native 모바일 애플리케이션입니다.

## 📱 기술 스택

- **Expo SDK 52.0** - React Native 개발 플랫폼
- **React Native 0.81.5** - 크로스 플랫폼 모바일 프레임워크  
- **TypeScript** - 타입 안전성
- **React Navigation 6** - 네비게이션
- **@smis-mentor/shared** - 공유 라이브러리

## 🚀 개발 환경 설정

### 1. 의존성 설치 (루트에서)
```bash
cd ../../  # 모노레포 루트로 이동
npm install
npm run dev:setup  # shared 패키지 빌드
```

### 2. 개발 서버 시작
```bash
cd packages/mobile
npm start  # Expo Dev Server 시작
```

### 3. 플랫폼별 실행
```bash
npm run ios      # iOS 시뮬레이터
npm run android  # Android 에뮬레이터
npm run web      # 웹 브라우저 (개발용)
```

## 📦 배포

### iOS 배포 (App Store)
```bash
npm run deploy:ios              # 빌드 + 자동 제출
npm run deploy:build-only:ios   # 빌드만
npm run deploy:submit-only:ios  # 제출만 (최신 빌드)
```

### Android 배포 (Play Store)
```bash
npm run deploy:android              # 빌드 + 자동 제출  
npm run deploy:build-only:android   # 빌드만
npm run deploy:submit-only:android  # 제출만 (최신 빌드)
```

### 전체 배포
```bash
npm run deploy:all  # iOS + Android 동시 배포
```

## 📱 OTA 업데이트 (즉시 배포)

앱 스토어 심사 없이 JavaScript 변경사항만 즉시 배포:

```bash
npm run update:production  # 프로덕션 환경
npm run update:preview     # 프리뷰 환경
```

**제한사항**: 네이티브 코드 변경 불가 (새 라이브러리, 권한 등은 전체 빌드 필요)


## ⚙️ 설정

### 환경 변수
`packages/mobile/.env.local` 파일 생성:
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
│   ├── navigation/       # React Navigation 설정
│   ├── contexts/         # React Context
│   └── hooks/            # Custom Hooks
├── assets/               # 이미지, 아이콘, 폰트
├── app.config.ts         # Expo 설정
├── eas.json              # EAS Build 설정
└── package.json          # 의존성 및 스크립트
```

**공유 라이브러리**: `../../packages/shared/`
- 타입 정의, Firebase 서비스, 유틸리티 함수

---

## 🔧 개발 도구

```bash
# 타입 체크 (모노레포 루트에서)
npm run type-check --workspace=packages/mobile

# 린트 검사 (모노레포 루트에서) 
npm run lint --workspace=packages/mobile

# 전체 품질 검사
npm run lint && npm run type-check && npm run validate:monorepo
```

## 🔗 관련 링크

- **모노레포 루트**: [../../README.md](../../README.md)
- **공유 라이브러리**: [../shared/README.md](../shared/README.md)
- **Expo 대시보드**: https://expo.dev/accounts/pobredward02/projects/smis-mentor
- **App Store Connect**: https://appstoreconnect.apple.com  
- **Google Play Console**: https://play.google.com/console
