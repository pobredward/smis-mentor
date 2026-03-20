# iOS/Android 배포 시 푸시 알림 설정 체크리스트

## 📋 배포 전 필수 체크리스트

### Android 배포

#### ✅ 완료된 항목
- [x] `expo-notifications` 플러그인 설치
- [x] `POST_NOTIFICATIONS` 권한 추가 (Android 13+)
- [x] 알림 아이콘 설정 (`notification-icon.png`)
- [x] `app.json` 설정 완료
- [x] `eas.json` 설정 완료

#### ⚠️ 확인 필요 항목

**1. google-services.json 파일 추가**

현재 상태: ❌ 파일 없음

```bash
# Firebase Console에서 다운로드
# https://console.firebase.google.com/project/smis-mentor/settings/general

# Android 앱 → google-services.json 다운로드
# 파일을 다음 위치에 배치:
packages/mobile/google-services.json
```

**2. Firebase Cloud Messaging 확인**

- [ ] Firebase Console → Project Settings → Cloud Messaging
- [ ] Cloud Messaging API 활성화 확인
- [ ] Server Key 확인 (Expo는 자동으로 처리하므로 선택사항)

**3. Firebase Android 앱 등록 확인**

- [ ] Package name: `com.smis.smismentor`
- [ ] SHA-1 인증서 등록 (Google Sign-In 사용 시)

### iOS 배포

#### ✅ 완료된 항목
- [x] `expo-notifications` 플러그인 설치
- [x] `GoogleService-Info.plist` 존재
- [x] Bundle Identifier 설정 (`com.smis.smismentor`)
- [x] `app.json` 설정 완료
- [x] `eas.json` 설정 완료

#### ⚠️ 필수 작업 (iOS 푸시 알림 핵심!)

**1. APNs 인증 키 생성 및 업로드** (가장 중요!)

```
단계별 가이드:

1️⃣ Apple Developer Console에서 APNs Key 생성
   https://developer.apple.com/account/resources/authkeys/list
   
   - Keys → "+" 클릭
   - Key Name: "SMIS Mentor Push"
   - Enable: Apple Push Notifications service (APNs) ✓
   - Continue → Download .p8 file
   
   ⚠️ 중요: .p8 파일은 한 번만 다운로드 가능!

2️⃣ Key 정보 기록
   - Key ID: _________________ (예: ABC123DEF4)
   - Team ID: ________________ (Developer Account에서 확인)
   - .p8 파일 저장 위치: _____________________

3️⃣ Firebase Console에 업로드
   https://console.firebase.google.com/project/smis-mentor/settings/cloudmessaging
   
   - Apple app configuration
   - APNs Authentication Key
   - Upload 버튼 클릭
   - .p8 파일 선택
   - Key ID 입력
   - Team ID 입력
   - Upload
```

**2. iOS Capabilities 확인** (자동 설정되지만 확인)

EAS Build가 자동으로 추가:
- Push Notifications
- Background Modes → Remote notifications

---

## 🚀 배포 명령어

### Android

```bash
# 1. google-services.json 파일 추가 (필수!)
cp ~/Downloads/google-services.json packages/mobile/google-services.json

# 2. Production 빌드
cd packages/mobile
npm run build:mobile:prod:android

# 또는
eas build --profile production --platform android

# 3. Google Play Console에 업로드
npm run submit:android
```

### iOS

```bash
# 1. APNs Key를 Firebase에 업로드 (필수!)
# (위의 가이드 참조)

# 2. Production 빌드
cd packages/mobile
npm run build:mobile:prod:ios

# 또는
eas build --profile production --platform ios

# 3. App Store Connect에 업로드
npm run submit:ios
```

---

## 🧪 배포 후 테스트

### 1. TestFlight / Internal Testing 단계

```bash
# Preview 빌드로 먼저 테스트
eas build --profile preview --platform ios
eas build --profile preview --platform android
```

**테스트 항목**:
- [ ] 앱 설치 후 알림 권한 요청 확인
- [ ] 푸시 토큰 정상 등록 확인 (Firestore 확인)
- [ ] 즉시 알림 수신 테스트
- [ ] 예약 알림 수신 테스트
- [ ] 업무 독촉 알림 수신 테스트
- [ ] 알림 아이콘 표시 확인 (SMIS 아이콘)
- [ ] 알림 클릭 시 앱 이동 확인

### 2. 프로덕션 배포 전 최종 확인

**Firestore 확인**:
```
Firebase Console → Firestore Database → users/{userId}

확인:
- pushTokens: { [token]: { platform, addedAt, lastUsed } }
- notificationSettings: { taskReminders, generalNotifications }
```

**Cloud Functions 확인**:
```bash
# 로그 확인
firebase functions:log

# 확인 사항:
# - checkOverdueTasks 실행 로그
# - 알림 전송 성공/실패 로그
```

---

## 📱 플랫폼별 주의사항

### Android

#### A. 알림 채널 (Android 8.0+)
- ✅ 자동 설정됨 (`notificationService.ts`)
- 채널: `task-reminders` (업무 알림 전용)

#### B. 알림 권한 (Android 13+)
- ✅ `POST_NOTIFICATIONS` 권한 추가됨
- 앱 설치 시 자동으로 권한 요청

#### C. 배터리 최적화
- 일부 기기(샤오미, 화웨이 등)는 백그라운드 제한
- 사용자가 배터리 최적화 예외 설정 필요 (선택사항)

### iOS

#### A. APNs 환경
- Development: Sandbox APNs (개발/테스트)
- Production: Production APNs (App Store 배포)
- EAS Build가 자동으로 처리

#### B. 알림 권한
- 앱 최초 실행 시 시스템이 권한 요청
- 한 번 거부하면 설정에서 수동 허용 필요

#### C. Silent Notifications
- 백그라운드 알림은 iOS에서 자동 처리
- `content-available` 플래그 자동 설정

---

## 🔧 트러블슈팅

### Android

**문제**: `google-services.json not found`
```bash
# 해결: 파일 추가
cp ~/Downloads/google-services.json packages/mobile/google-services.json
```

**문제**: 알림이 수신되지 않음
```
1. Firebase Console → Cloud Messaging API 활성화 확인
2. google-services.json 파일이 최신인지 확인
3. 앱 재설치 후 테스트
```

### iOS

**문제**: 알림이 수신되지 않음 (가장 흔함)
```
1. APNs Key가 Firebase에 업로드되었는지 확인 ⭐
2. Key ID, Team ID가 정확한지 확인
3. Bundle Identifier가 일치하는지 확인 (com.smis.smismentor)
4. TestFlight로 배포 후 테스트
```

**문제**: `Invalid APNs certificate`
```
해결:
1. Apple Developer Console에서 새 APNs Key 생성
2. Firebase Console에서 기존 키 삭제
3. 새 키 업로드
```

---

## 📊 Firebase Console 필수 설정 요약

### 1. Project Settings

**General**:
- ✅ Android app: `com.smis.smismentor` (등록됨)
- ✅ iOS app: `com.smis.smismentor` (등록됨)
- ⚠️ google-services.json 다운로드 (Android)
- ✅ GoogleService-Info.plist 다운로드 (iOS, 완료)

**Cloud Messaging**:
- ⚠️ Cloud Messaging API: Enabled 확인
- ⚠️ iOS APNs Key: 업로드 필수 ⭐

### 2. Firestore Database

**Security Rules** 확인:
```javascript
// users 컬렉션에 pushTokens 쓰기 권한
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

### 3. Cloud Functions

**배포 확인**:
```bash
# Functions 배포
cd functions
npm run build
cd ..
firebase deploy --only functions
```

**함수 확인**:
- `checkOverdueTasks`: 30분마다 자동 실행
- `sendTestNotification`: 수동 테스트용

---

## ✅ 최종 배포 체크리스트

### 배포 전

- [ ] **Android**: `google-services.json` 파일 추가
- [ ] **iOS**: APNs Key를 Firebase에 업로드
- [ ] **공통**: Firebase Cloud Messaging API 활성화
- [ ] **공통**: Cloud Functions 배포 완료
- [ ] **공통**: Firestore Security Rules 확인

### 배포 중

- [ ] **Android**: Production 빌드 생성
- [ ] **iOS**: Production 빌드 생성
- [ ] **공통**: TestFlight/Internal Testing으로 먼저 테스트

### 배포 후

- [ ] 테스터에게 알림 테스트 요청
- [ ] Firestore에서 pushTokens 등록 확인
- [ ] Cloud Functions 로그 확인
- [ ] 실제 업무 독촉 알림 작동 확인

---

## 📞 도움이 필요한 경우

### Firebase 관련
- Firebase Console: https://console.firebase.google.com/project/smis-mentor
- Firebase 문서: https://firebase.google.com/docs/cloud-messaging

### Apple Developer 관련
- Developer Console: https://developer.apple.com/account
- APNs 가이드: https://developer.apple.com/documentation/usernotifications

### Expo 관련
- EAS Build: https://docs.expo.dev/build/introduction/
- Expo Notifications: https://docs.expo.dev/push-notifications/overview/

---

## 🎯 핵심 요약

### Android 배포 필수
1. ⚠️ **google-services.json 파일 추가** (현재 없음!)
2. ✅ Firebase Cloud Messaging 활성화 확인

### iOS 배포 필수
1. ⚠️ **APNs Key 생성 및 Firebase 업로드** (가장 중요!)
2. ✅ Bundle Identifier 일치 확인

### 공통
1. ✅ Cloud Functions 배포
2. ✅ 알림 아이콘 설정 완료
3. ✅ 알림 핸들러 설정 완료

**현재 상태**: Android google-services.json과 iOS APNs Key만 추가하면 배포 준비 완료!
