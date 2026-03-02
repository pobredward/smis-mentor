# SMIS Mentor Mobile - 빠른 시작 가이드

## 🚀 첫 배포 시작하기

### 1단계: EAS 로그인 및 프로젝트 초기화

```bash
cd packages/mobile

# Expo 계정으로 로그인
eas login

# 프로젝트 초기화 (최초 1회)
eas init
```

이 명령어는 Expo 프로젝트를 생성하고 `projectId`를 자동으로 `app.json`에 추가합니다.

### 2단계: app.json 업데이트

`eas init` 후 `app.json`을 열어 `owner` 필드를 업데이트하세요:

```json
{
  "expo": {
    "owner": "YOUR_EXPO_USERNAME"  // 본인의 Expo 사용자명으로 변경
  }
}
```

### 3단계: Firebase 파일 배치

#### Android (필수)
Firebase Console에서 `google-services.json` 다운로드 후:
```bash
# 프로젝트 루트에 배치
cp ~/Downloads/google-services.json /Users/sunwoongshin/Desktop/dev/smis-mentor/
```

#### iOS
✅ 이미 배치되어 있습니다: `GoogleService-Info.plist`

### 4단계: 환경 변수 설정

[Expo 대시보드](https://expo.dev)에서:
1. 프로젝트 선택
2. Secrets 탭
3. 다음 변수들 추가:
   - `EXPO_PUBLIC_WEB_API_URL`
   - `NAVER_CLOUD_SMS_SERVICE_ID`
   - `NAVER_CLOUD_SMS_ACCESS_KEY`
   - `NAVER_CLOUD_SMS_SECRET_KEY`

### 5단계: 첫 빌드

#### Preview 빌드로 테스트 (권장)

```bash
# iOS
npm run build:preview:ios

# Android
npm run build:preview:android
```

빌드가 완료되면 QR 코드로 다운로드하여 테스트할 수 있습니다.

#### Production 빌드

```bash
# iOS + Android 동시
npm run build:prod:all

# 또는 개별 빌드
npm run build:prod:ios
npm run build:prod:android
```

### 6단계: 앱스토어 제출

#### iOS - App Store Connect

1. [App Store Connect](https://appstoreconnect.apple.com/) 접속
2. 새 앱 생성
   - **Bundle ID**: `com.smis.smismentor`
   - **앱 이름**: `SMIS Mentor`
3. 앱 정보 입력 (스크린샷, 설명 등)
4. EAS로 제출:
   ```bash
   npm run submit:ios
   ```

#### Android - Google Play Console

1. [Google Play Console](https://play.google.com/console/) 접속
2. 새 앱 만들기
   - **패키지 이름**: `com.smis.smismentor`
   - **앱 이름**: `SMIS Mentor`
3. 앱 정보 입력
4. EAS로 제출:
   ```bash
   npm run submit:android
   ```

---

## 📱 일상적인 배포 워크플로우

### JavaScript 변경만 있는 경우 (OTA 업데이트)

```bash
cd packages/mobile

# Preview 환경에 배포
npm run update:preview

# Production 환경에 배포
npm run update:production
```

사용자는 다음 앱 실행 시 자동으로 업데이트를 받습니다.

### 네이티브 코드 변경이 있는 경우 (재빌드 필요)

```bash
# 1. Shared 패키지 빌드 (변경사항 있는 경우)
cd ../../
npm run build:shared

# 2. 프로덕션 빌드
cd packages/mobile
npm run build:prod:all

# 3. 앱스토어 제출
npm run submit:ios
npm run submit:android
```

---

## ⚙️ 주요 명령어

### 개발

```bash
npm run start              # Expo 개발 서버 시작
npm run ios                # iOS 시뮬레이터
npm run android            # Android 에뮬레이터
```

### 빌드

```bash
npm run build:dev:ios           # iOS 개발 빌드
npm run build:dev:android       # Android 개발 빌드
npm run build:preview:ios       # iOS 미리보기 빌드
npm run build:preview:android   # Android 미리보기 빌드
npm run build:prod:ios          # iOS 프로덕션 빌드
npm run build:prod:android      # Android 프로덕션 빌드
npm run build:prod:all          # 모든 플랫폼 프로덕션 빌드
```

### 제출

```bash
npm run submit:ios         # App Store 제출
npm run submit:android     # Google Play 제출
```

### OTA 업데이트

```bash
npm run update             # 기본 업데이트
npm run update:preview     # Preview 브랜치 업데이트
npm run update:production  # Production 브랜치 업데이트
```

### 유틸리티

```bash
eas build:list             # 빌드 목록 조회
eas build:view [BUILD_ID]  # 빌드 상세 조회
eas update:list            # 업데이트 목록 조회
eas credentials            # 인증서 관리
```

---

## 🔍 문제 해결

### 빌드 실패 시

```bash
# 1. 캐시 클리어
npx expo start --clear

# 2. 의존성 재설치
npm run clean
npm install

# 3. Prebuild 재생성
npm run prebuild:clean
```

### Shared 패키지 에러 시

```bash
# 프로젝트 루트에서
npm run build:shared
cd packages/mobile
npm install
```

---

## 📚 더 알아보기

- **상세 가이드**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Firebase 설정**: [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)
- **Expo 문서**: [docs.expo.dev](https://docs.expo.dev)

---

## ✅ 체크리스트

배포 전:

- [ ] `eas login` 및 `eas init` 실행
- [ ] `app.json`의 `owner` 필드 업데이트
- [ ] `google-services.json` 파일 배치 (Android)
- [ ] Expo Secrets 환경 변수 설정
- [ ] App Store Connect / Google Play Console 앱 생성

첫 배포 후:

- [ ] Preview 빌드로 테스트 완료
- [ ] Production 빌드 성공
- [ ] 앱스토어 제출 완료
- [ ] 심사 통과 확인
