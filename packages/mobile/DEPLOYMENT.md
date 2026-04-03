# SMIS Mentor 모바일 앱 배포 가이드

## 📱 빠른 배포 명령어

### iOS 배포
```bash
# 방법 1: 빌드 + 자동 제출 (한 번에)
npm run deploy:ios

# 방법 2: 단계별 실행
npm run build:prod:ios    # 빌드만
npm run submit:ios        # 최신 빌드 제출
```

### Android 배포
```bash
# 방법 1: 빌드 + 자동 제출 (한 번에)
npm run deploy:android

# 방법 2: 단계별 실행
npm run build:prod:android    # 빌드만
npm run submit:android        # 최신 빌드 제출
```

### iOS + Android 동시 배포
```bash
npm run deploy:all
```

---

## 🔧 설정 정보

### App Store Connect
- **Apple ID**: 6759916856
- **Bundle ID**: com.smis.smismentor
- **App Name**: SMIS Mentor
- **Team ID**: 3V8G7Y74HY
- **Issuer ID**: d6174485-f3ab-4658-866e-7ab524b197d1
- **API Key ID**: 3XHH4P2YTX

### Expo 프로젝트
- **Project ID**: 684d0445-c299-4e77-a362-42efa9c671ac
- **Owner**: pobredward02
- **Slug**: smis-mentor

---

## ⚠️ 중요: API Key 설정

자동 제출을 위해서는 App Store Connect API Key가 필요합니다.

### 방법 1: 로컬 API Key 파일 사용
1. `AuthKey_3XHH4P2YTX.p8` 파일을 `packages/mobile/` 디렉토리에 저장
2. 파일은 이미 `.gitignore`에 포함되어 있어 안전합니다
3. 자세한 가이드: [API-KEY-SETUP.md](./API-KEY-SETUP.md)

### 방법 2: EAS Credentials 서버 사용
```bash
cd packages/mobile
eas credentials
# ios → App Store Connect API Key → Upload
```

---

## 📋 배포 전 체크리스트

### 1. 버전 확인
- [ ] `app.config.ts`의 `version` 업데이트
- [ ] `package.json`의 `version` 동기화
- [ ] 변경사항 커밋 및 푸시

### 2. 테스트
- [ ] iOS 시뮬레이터에서 테스트
- [ ] Android 에뮬레이터에서 테스트
- [ ] 실제 디바이스에서 테스트 (선택)

### 3. 빌드 설정 확인
- [ ] Firebase 설정 파일 존재 확인
  - iOS: `GoogleService-Info.plist`
  - Android: `google-services.json`
- [ ] 환경 변수 `.env.local` 확인
- [ ] `eas.json` 설정 확인

---

## 🚀 상세 배포 프로세스

### iOS App Store 배포

#### Step 1: 프로덕션 빌드 생성
```bash
npm run build:prod:ios
```

**예상 소요 시간**: 5-10분
**결과**: EAS 서버에서 IPA 파일 생성

#### Step 2: 빌드 상태 확인
```bash
# 최근 빌드 목록 확인
eas build:list --platform ios --limit 5

# 특정 빌드 상세 정보
eas build:view [BUILD_ID]
```

#### Step 3: App Store Connect 제출

**방법 A: 자동 제출 (EAS CLI)**
```bash
npm run submit:ios
```

**방법 B: 수동 제출 (Transporter 앱)**

1. IPA 파일 다운로드
   ```bash
   # Expo 대시보드에서 IPA URL 확인
   # https://expo.dev/accounts/pobredward02/projects/smis-mentor/builds
   
   cd ~/Downloads
   curl -L -o SMISMentor.ipa "[IPA_URL]"
   ```

2. Transporter 앱 사용
   - Mac App Store에서 "Transporter" 설치
   - IPA 파일을 드래그 앤 드롭
   - "Deliver" 버튼 클릭
   - Apple ID로 로그인
   - 업로드 완료 대기 (5-10분)

3. App Store Connect에서 확인
   - https://appstoreconnect.apple.com
   - "SMIS Mentor" 선택
   - "App Store" 또는 "TestFlight" 탭
   - 빌드가 나타날 때까지 대기 (처리 시간: 5-10분)

#### Step 4: App Store 제출 준비

1. **App Store Connect** 접속
   - https://appstoreconnect.apple.com

2. **새 버전 생성**
   - "App Store" 탭 클릭
   - "+" 버튼 → 버전 번호 입력 (예: 1.1.0)

3. **필수 정보 입력**
   - [ ] 스크린샷 업로드 (최소 3장)
   - [ ] 앱 설명 작성
   - [ ] 키워드 설정
   - [ ] 지원 URL: https://www.smis-mentor.com
   - [ ] 마케팅 URL (선택)
   - [ ] 개인정보 처리방침 URL

4. **빌드 선택**
   - "Build" 섹션에서 빌드 선택
   - 최신 빌드 번호 확인

5. **심사 정보 입력**
   - 데모 계정 정보 (멘토/원어민)
   - 연락처 정보
   - 특이사항 메모

6. **제출**
   - "Submit for Review" 클릭
   - 심사 기간: 평균 24-48시간

---

### Android Play Store 배포

#### Step 1: 프로덕션 빌드 생성
```bash
npm run build:prod:android
```

**예상 소요 시간**: 5-10분
**결과**: EAS 서버에서 AAB 파일 생성

#### Step 2: Play Console 제출

**방법 A: 자동 제출 (EAS CLI)**
```bash
npm run submit:android
```

**방법 B: 수동 제출 (Play Console)**

1. AAB 파일 다운로드
   ```bash
   cd ~/Downloads
   curl -L -o SMISMentor.aab "[AAB_URL]"
   ```

2. Play Console 접속
   - https://play.google.com/console
   - "SMIS Mentor" 앱 선택

3. 내부 테스트 트랙 업로드
   - "테스트" → "내부 테스트"
   - "새 버전 만들기"
   - AAB 파일 업로드
   - 변경사항 입력
   - "검토" → "출시" 클릭

4. 프로덕션 승격 (선택)
   - 내부 테스트 완료 후
   - "프로덕션으로 승격" 선택
   - 스토어 등록정보 확인
   - 심사 제출

---

## 🔥 긴급 업데이트 (OTA Update)

앱 스토어 심사 없이 즉시 배포 (JavaScript 변경만 가능):

```bash
# 프리뷰 환경
npm run update:preview

# 프로덕션 환경
npm run update:production
```

**제한사항**:
- 네이티브 코드 변경 불가 (새 라이브러리, 권한 등)
- `app.config.ts` 변경 시 전체 빌드 필요

---

## 📊 빌드 및 제출 상태 확인

### Expo 대시보드
```bash
# 빌드 목록
eas build:list --platform ios
eas build:list --platform android

# 제출 상태 (웹에서 확인)
open "https://expo.dev/accounts/pobredward02/projects/smis-mentor/builds"
```

### App Store Connect
```bash
open "https://appstoreconnect.apple.com/apps/6759916856"
```

### Google Play Console
```bash
open "https://play.google.com/console"
```

---

## 🐛 문제 해결

### iOS 제출 실패 시

1. **Apple ID 인증 실패**
   ```bash
   # API Key 재설정
   eas credentials
   ```

2. **빌드 프로파일 문제**
   - App Store Connect에서 프로파일 확인
   - 필요 시 프로파일 재생성

3. **수동 제출로 우회**
   - Transporter 앱 사용 (위 가이드 참조)

### Android 제출 실패 시

1. **Service Account Key 문제**
   ```bash
   # 새 키 생성
   eas credentials
   ```

2. **트랙 설정 확인**
   - `eas.json`에서 `track` 확인
   - internal / alpha / beta / production

### 빌드 실패 시

1. **로그 확인**
   ```bash
   eas build:view [BUILD_ID]
   ```

2. **캐시 클리어 후 재시도**
   ```bash
   eas build --clear-cache --platform ios
   eas build --clear-cache --platform android
   ```

3. **의존성 문제**
   ```bash
   # node_modules 재설치
   rm -rf node_modules
   npm install
   
   # prebuild 재생성
   npm run prebuild:clean
   ```

---

## 📞 지원

### EAS 문서
- https://docs.expo.dev/eas/

### App Store Connect 가이드
- https://developer.apple.com/app-store-connect/

### Google Play Console 가이드
- https://support.google.com/googleplay/android-developer/

### 문제 발생 시
1. Expo 대시보드에서 빌드 로그 확인
2. App Store Connect / Play Console에서 심사 거부 사유 확인
3. Firebase 콘솔에서 에러 로그 확인 (Crashlytics)
