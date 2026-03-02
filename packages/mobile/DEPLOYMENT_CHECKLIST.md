# SMIS Mentor Mobile - Expo 배포 완료 체크리스트

## ✅ 완료된 설정

### 1. EAS 빌드 설정
- ✅ `eas.json` 생성 완료
- ✅ Development, Preview, Production 프로필 구성
- ✅ 자동 버전 증가 설정
- ✅ iOS/Android 빌드 타입 설정

### 2. 앱 설정 (app.json)
- ✅ Bundle ID 변경: `com.smis.smismentor`
- ✅ iOS 권한 설명 추가 (카메라, 사진 라이브러리)
- ✅ Android 권한 추가
- ✅ Firebase 설정 경로 추가
- ✅ 플러그인 설정 (expo-dev-client, expo-image-picker, google-signin)

### 3. 배포 스크립트
- ✅ `package.json`에 빌드/배포 명령어 추가
- ✅ 모노레포 루트에 빌드 명령어 통합
- ✅ OTA 업데이트 스크립트 추가

### 4. 의존성
- ✅ `expo-dev-client` 설치 완료

### 5. .gitignore 업데이트
- ✅ Firebase 설정 파일 제외
- ✅ EAS 빌드 파일 제외
- ✅ Expo 임시 파일 제외

### 6. 문서화
- ✅ `DEPLOYMENT.md` - 상세 배포 가이드
- ✅ `FIREBASE_SETUP.md` - Firebase 설정 가이드
- ✅ `QUICKSTART.md` - 빠른 시작 가이드
- ✅ `DEPLOYMENT_CHECKLIST.md` - 이 파일

---

## 🚨 필수 작업 (배포 전)

### 1. EAS 프로젝트 초기화
```bash
cd packages/mobile
eas login
eas init
```

**결과**: `app.json`의 `extra.eas.projectId`가 자동으로 업데이트됩니다.

### 2. app.json 수정
다음 필드를 수동으로 업데이트하세요:

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "YOUR_EAS_PROJECT_ID"  // eas init 후 자동 생성됨
      }
    },
    "owner": "YOUR_EXPO_USERNAME"  // 본인의 Expo 사용자명으로 변경
  }
}
```

### 3. Firebase Android 설정 파일 다운로드

#### 현재 상태
- ✅ iOS: `GoogleService-Info.plist` 존재
- ❌ Android: `google-services.json` **없음** (필수)

#### 다운로드 방법
1. [Firebase Console](https://console.firebase.google.com/) → `smis-mentor` 프로젝트
2. 프로젝트 설정 → 일반
3. Android 앱에서 `google-services.json` 다운로드
   - 패키지 이름: `com.smis.smismentor`
   - 없다면 Android 앱 추가 필요
4. 파일 배치:
   ```bash
   /Users/sunwoongshin/Desktop/dev/smis-mentor/google-services.json
   ```

### 4. Expo Secrets 환경 변수 설정

[Expo 대시보드](https://expo.dev) → 프로젝트 → Secrets 탭에서 추가:

```bash
EXPO_PUBLIC_WEB_API_URL=https://www.smis-mentor.com
NAVER_CLOUD_SMS_SERVICE_ID=<your-service-id>
NAVER_CLOUD_SMS_ACCESS_KEY=<your-access-key>
NAVER_CLOUD_SMS_SECRET_KEY=<your-secret-key>
```

**참고**: 로컬 `.env` 파일에 있는 값들을 Expo Secrets로 옮기세요.

### 5. 앱스토어 계정 및 앱 생성

#### iOS - App Store Connect
1. Apple Developer 계정 필요 ($99/년)
2. [App Store Connect](https://appstoreconnect.apple.com/)에서 앱 생성
   - Bundle ID: `com.smis.smismentor`
   - 앱 이름: `SMIS Mentor`

#### Android - Google Play Console
1. Google Play Developer 계정 필요 ($25 일회성)
2. [Google Play Console](https://play.google.com/console/)에서 앱 생성
   - 패키지 이름: `com.smis.smismentor`
   - 앱 이름: `SMIS Mentor`

---

## 🎯 첫 배포 단계별 가이드

### 1단계: 초기 설정 확인
```bash
cd packages/mobile

# EAS 로그인
eas login

# 프로젝트 초기화
eas init

# app.json의 owner 필드 수정 (에디터에서)
```

### 2단계: Firebase 파일 배치
```bash
# google-services.json을 프로젝트 루트에 복사
cp ~/Downloads/google-services.json ../../google-services.json
```

### 3단계: 환경 변수 설정
Expo 대시보드에서 Secrets 추가

### 4단계: Preview 빌드로 테스트
```bash
# iOS
npm run build:preview:ios

# Android  
npm run build:preview:android
```

빌드 완료 후 QR 코드로 테스트 디바이스에 설치하여 테스트

### 5단계: Production 빌드
```bash
# 모든 플랫폼
npm run build:prod:all

# 또는 개별
npm run build:prod:ios
npm run build:prod:android
```

### 6단계: 앱스토어 제출
```bash
# iOS
npm run submit:ios

# Android
npm run submit:android
```

---

## 📋 모노레포 빌드 주의사항

### Shared 패키지 의존성

모바일 앱은 `@smis-mentor/shared` 패키지를 사용합니다.

#### 빌드 전 체크
```bash
# 1. Shared 패키지 빌드 (변경사항 있을 때)
cd /Users/sunwoongshin/Desktop/dev/smis-mentor
npm run build:shared

# 2. 의존성 확인
cd packages/mobile
npm list @smis-mentor/shared
```

#### 현재 설정 (정상)
- ✅ `package.json`: `"@smis-mentor/shared": "file:../shared"`
- ✅ `tsconfig.json`: paths 별칭 설정됨
- ✅ 상대 경로 참조로 EAS Build 호환

---

## 🔄 일상적인 배포 워크플로우

### JavaScript만 변경 (OTA 업데이트)
```bash
cd packages/mobile
npm run update:production
```

### 네이티브 코드 변경 (재빌드)
```bash
# 1. Shared 빌드 (필요시)
npm run build:shared

# 2. 프로덕션 빌드
cd packages/mobile
npm run build:prod:all

# 3. 제출
npm run submit:ios
npm run submit:android
```

---

## 🛠️ 트러블슈팅

### 빌드 실패 시
```bash
# 캐시 클리어
npx expo start --clear

# 의존성 재설치
npm run clean
npm install

# Prebuild 재생성
npm run prebuild:clean
```

### Firebase 오류
- `google-services.json` 위치 확인 (프로젝트 루트)
- Bundle ID 일치 확인
- Firebase Console에 앱 등록 확인

### EAS 관련
```bash
# 빌드 목록 조회
eas build:list

# 빌드 상세
eas build:view [BUILD_ID]

# Secrets 조회
eas secret:list
```

---

## 📚 참고 문서

- **빠른 시작**: `QUICKSTART.md`
- **상세 가이드**: `DEPLOYMENT.md`
- **Firebase 설정**: `FIREBASE_SETUP.md`

---

## ✅ 최종 체크리스트

배포 전에 이 항목들을 모두 확인하세요:

### 초기 설정
- [ ] `eas login` 실행
- [ ] `eas init` 실행
- [ ] `app.json`의 `projectId` 자동 생성 확인
- [ ] `app.json`의 `owner` 필드 수동 업데이트

### Firebase
- [ ] `GoogleService-Info.plist` 존재 확인 (루트)
- [ ] `google-services.json` 다운로드 및 배치 (루트)
- [ ] Firebase Console에 iOS/Android 앱 등록 확인
- [ ] Bundle ID 일치 확인 (`com.smis.smismentor`)

### 환경 변수
- [ ] Expo Secrets에 모든 환경 변수 추가
- [ ] 로컬 `.env` 파일 내용 마이그레이션

### 앱스토어
- [ ] App Store Connect 앱 생성 (iOS)
- [ ] Google Play Console 앱 생성 (Android)
- [ ] 스크린샷 및 앱 설명 준비
- [ ] 개인정보 처리방침 URL 준비

### 빌드 테스트
- [ ] Preview 빌드 성공
- [ ] Preview 빌드로 실제 디바이스 테스트
- [ ] Production 빌드 성공
- [ ] 제출 성공

### 문서
- [ ] 팀원에게 배포 가이드 공유
- [ ] 버전 관리 프로세스 확립
- [ ] CI/CD 파이프라인 고려 (선택)

---

## 🎉 완료!

모든 체크리스트 항목이 완료되면 배포 준비가 끝났습니다.

첫 배포는 `QUICKSTART.md`를 따라 진행하세요!
