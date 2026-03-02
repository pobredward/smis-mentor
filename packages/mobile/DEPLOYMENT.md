# SMIS Mentor Mobile 앱 배포 가이드

## 📋 목차
1. [사전 준비](#사전-준비)
2. [초기 설정](#초기-설정)
3. [빌드 프로필](#빌드-프로필)
4. [배포 프로세스](#배포-프로세스)
5. [OTA 업데이트](#ota-업데이트)
6. [트러블슈팅](#트러블슈팅)

---

## 사전 준비

### 1. 필수 계정 및 도구

- **Expo 계정**: [expo.dev](https://expo.dev)에서 가입
- **Apple Developer 계정** (iOS 배포): $99/년
- **Google Play Console 계정** (Android 배포): $25 일회성
- **EAS CLI 설치**: 이미 설치됨 (`/opt/homebrew/bin/eas`)

### 2. Firebase 설정

#### Android (`google-services.json`)
1. [Firebase Console](https://console.firebase.google.com/)에서 `smis-mentor` 프로젝트 선택
2. 프로젝트 설정 > 일반 탭
3. Android 앱 추가 또는 선택 (Package name: `com.smis.smismentor`)
4. `google-services.json` 다운로드
5. 프로젝트 루트에 배치: `/Users/sunwoongshin/Desktop/dev/smis-mentor/google-services.json`

#### iOS (GoogleService-Info.plist)
✅ 이미 설정됨: `/Users/sunwoongshin/Desktop/dev/smis-mentor/GoogleService-Info.plist`

### 3. 환경 변수 설정

Expo 대시보드에서 환경 변수를 설정하세요:

```bash
# Expo 대시보드 > 프로젝트 > Secrets 탭에서 추가
EXPO_PUBLIC_WEB_API_URL=https://www.smis-mentor.com
NAVER_CLOUD_SMS_SERVICE_ID=<your-service-id>
NAVER_CLOUD_SMS_ACCESS_KEY=<your-access-key>
NAVER_CLOUD_SMS_SECRET_KEY=<your-secret-key>
```

---

## 초기 설정

### 1. EAS 프로젝트 초기화

```bash
cd packages/mobile

# Expo 로그인
eas login

# 프로젝트 초기화 (처음 한 번만)
eas init
```

이 명령어는 자동으로 Expo 프로젝트를 생성하고 `app.json`의 `extra.eas.projectId`를 업데이트합니다.

### 2. app.json에서 업데이트 필요한 항목

```json
{
  "extra": {
    "eas": {
      "projectId": "YOUR_PROJECT_ID" // eas init 후 자동 생성됨
    }
  },
  "owner": "YOUR_EXPO_USERNAME" // Expo 계정 사용자명
}
```

---

## 빌드 프로필

`eas.json`에 3가지 빌드 프로필이 설정되어 있습니다:

### 1. Development
- **용도**: 개발 중 테스트
- **특징**: Development client 포함, 빠른 새로고침
- **배포**: Internal distribution (팀 내부)

```bash
# iOS
npm run build:dev:ios

# Android
npm run build:dev:android
```

### 2. Preview
- **용도**: 스테이징/베타 테스트
- **특징**: 프로덕션과 유사하지만 앱스토어 미제출
- **배포**: Internal distribution

```bash
# iOS
npm run build:preview:ios

# Android (APK)
npm run build:preview:android
```

### 3. Production
- **용도**: 실제 앱스토어 배포
- **특징**: 최적화된 빌드, 자동 버전 증가
- **배포**: 앱스토어/플레이스토어

```bash
# iOS
npm run build:prod:ios

# Android (AAB)
npm run build:prod:android

# 둘 다
npm run build:prod:all
```

---

## 배포 프로세스

### 📱 iOS 배포

#### 1단계: 프로덕션 빌드

```bash
cd packages/mobile
npm run build:prod:ios
```

#### 2단계: App Store Connect 설정

1. [App Store Connect](https://appstoreconnect.apple.com/) 접속
2. 새 앱 생성
   - Bundle ID: `com.smis.smismentor`
   - 앱 이름: `SMIS Mentor`
3. 앱 정보, 스크린샷, 설명 추가

#### 3단계: 제출

```bash
npm run submit:ios
```

또는 App Store Connect에서 수동 업로드 가능

#### 4단계: 앱 심사 제출

App Store Connect에서 "심사를 위해 제출" 클릭

---

### 🤖 Android 배포

#### 1단계: 프로덕션 빌드

```bash
cd packages/mobile
npm run build:prod:android
```

#### 2단계: Google Play Console 설정

1. [Google Play Console](https://play.google.com/console/) 접속
2. 새 앱 만들기
   - 패키지 이름: `com.smis.smismentor`
   - 앱 이름: `SMIS Mentor`
3. 앱 카테고리, 콘텐츠 등급 설정
4. 스크린샷, 설명 추가

#### 3단계: 제출

```bash
npm run submit:android
```

또는 Google Play Console에서 수동 업로드 (AAB 파일)

#### 4단계: 심사 및 배포

- **내부 테스트**: 즉시 사용 가능
- **비공개/공개 테스트**: 몇 시간 소요
- **프로덕션**: 몇 일 소요

---

## OTA 업데이트

앱스토어 심사 없이 JavaScript/React 코드 업데이트 가능 (네이티브 코드 변경은 불가)

### 업데이트 배포

```bash
cd packages/mobile

# Preview 환경
npm run update:preview

# Production 환경
npm run update:production
```

### 사용 가능한 경우

✅ 가능:
- UI 변경
- 비즈니스 로직 수정
- 버그 수정
- API 엔드포인트 변경

❌ 불가능 (재빌드 필요):
- 네이티브 라이브러리 추가/제거
- 권한 변경
- `app.json` 설정 변경
- 네이티브 코드 수정

---

## 모노레포 빌드 고려사항

### Shared 패키지 의존성

현재 프로젝트는 `@smis-mentor/shared` 패키지를 사용합니다.

#### 빌드 전 체크리스트

1. **Shared 패키지 빌드**
   ```bash
   npm run build:shared
   ```

2. **의존성 확인**
   ```bash
   cd packages/mobile
   npm list @smis-mentor/shared
   ```

3. **로컬 링크 대신 상대 경로**
   - `package.json`에서 `"@smis-mentor/shared": "file:../shared"` 사용
   - 이미 올바르게 설정되어 있습니다 ✅

---

## 버전 관리

### 자동 버전 증가

프로덕션 빌드 시 자동으로 버전이 증가됩니다 (`eas.json`의 `autoIncrement: true`).

### 수동 버전 관리

`app.json`에서 수정:

```json
{
  "version": "1.0.0",  // 사용자에게 표시되는 버전
  "ios": {
    "buildNumber": "1"  // iOS 빌드 번호
  },
  "android": {
    "versionCode": 1    // Android 버전 코드
  }
}
```

---

## 트러블슈팅

### 빌드 실패

#### 1. Metro bundler 캐시 클리어

```bash
npx expo start --clear
```

#### 2. Node modules 재설치

```bash
npm run clean
npm install
```

#### 3. Prebuild 재생성

```bash
cd packages/mobile
npm run prebuild:clean
```

### 의존성 문제

#### Shared 패키지를 찾을 수 없음

```bash
cd packages/shared
npm run build
cd ../mobile
npm install
```

### Firebase 설정 오류

- `google-services.json` (Android)가 프로젝트 루트에 있는지 확인
- `GoogleService-Info.plist` (iOS)가 프로젝트 루트에 있는지 확인
- Bundle ID가 Firebase Console과 일치하는지 확인

### EAS Secrets 오류

```bash
# Secrets 조회
eas secret:list

# Secret 추가
eas secret:create --scope project --name EXPO_PUBLIC_WEB_API_URL --value "https://www.smis-mentor.com"
```

---

## 유용한 명령어

```bash
# 프로젝트 루트에서 실행
npm run start:mobile              # 개발 서버 시작
npm run build:mobile:prod:all     # iOS + Android 프로덕션 빌드

# packages/mobile에서 실행
eas build:list                    # 빌드 목록 조회
eas build:view [BUILD_ID]         # 특정 빌드 상세 조회
eas build:cancel [BUILD_ID]       # 빌드 취소
eas update:list                   # OTA 업데이트 목록
eas credentials                   # 인증서 관리
```

---

## 참고 자료

- [Expo EAS Build 문서](https://docs.expo.dev/build/introduction/)
- [Expo EAS Submit 문서](https://docs.expo.dev/submit/introduction/)
- [Expo EAS Update 문서](https://docs.expo.dev/eas-update/introduction/)
- [Firebase 설정](./FIREBASE_SETUP.md)

---

## 체크리스트

배포 전 확인사항:

- [ ] `eas init` 실행 완료
- [ ] `app.json`의 `projectId`와 `owner` 업데이트
- [ ] Firebase `google-services.json` 파일 배치 (Android)
- [ ] Expo 대시보드에 환경 변수 설정
- [ ] `@smis-mentor/shared` 패키지 빌드
- [ ] App Store Connect / Google Play Console 앱 생성
- [ ] 스크린샷 및 앱 설명 준비
- [ ] 개인정보 처리방침 URL 준비
