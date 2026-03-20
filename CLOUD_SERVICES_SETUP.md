# Cloud Messaging & Cloud Functions 설정 체크리스트

## 1️⃣ Firebase Cloud Messaging (FCM) 설정

### ✅ 자동으로 처리되는 것들

#### Android
- **google-services.json** 파일에 FCM 설정 자동 포함
- Firebase SDK가 자동으로 FCM 초기화
- Expo Notifications가 FCM과 자동 연동

#### iOS  
- **GoogleService-Info.plist** 파일에 FCM 설정 자동 포함
- APNs Key를 Firebase에 업로드하면 자동 연결
- Expo Notifications가 APNs와 자동 연동

### ⚠️ 확인 필요: Cloud Messaging API 활성화

**Firebase Console 확인**:
```
1. Firebase Console → 프로젝트 설정 → Cloud Messaging
   https://console.firebase.google.com/project/smis-mentor/settings/cloudmessaging

2. 확인 사항:
   - Cloud Messaging API (Legacy): Enabled
   - Firebase Cloud Messaging API (V1): Enabled (권장)
```

**API 활성화 방법**:
```
1. Firebase Console → Project Settings → Cloud Messaging
2. "Firebase Cloud Messaging API (V1)" 섹션
3. "Manage API in Google Cloud Console" 클릭
4. "Enable API" 클릭 (비활성화 상태인 경우)
```

---

## 2️⃣ Cloud Functions 설정

### ✅ 이미 완료된 것

#### 함수 구현
- ✅ `checkOverdueTasks` - 30분마다 실행되는 스케줄러
- ✅ `sendTestNotification` - 테스트용 함수
- ✅ Expo Push Notification 전송 로직
- ✅ 빌드 완료 (`functions/lib/index.js` 존재)

#### 패키지
- ✅ `expo-server-sdk` 설치됨
- ✅ `firebase-admin` 설치됨
- ✅ `firebase-functions` 설치됨

### ⚠️ 배포 필요!

**현재 상태**: 로컬에서만 빌드됨, Firebase에 배포 필요

**배포 명령어**:
```bash
# 함수 빌드 (이미 완료)
cd functions
npm run build

# Firebase에 배포
cd ..
firebase deploy --only functions

# 또는 npm script 사용
npm run deploy:functions
```

### 🔍 배포 확인

**Firebase Console에서 확인**:
```
Firebase Console → Functions
https://console.firebase.google.com/project/smis-mentor/functions

확인 사항:
- checkOverdueTasks 함수 존재
- sendTestNotification 함수 존재
- 상태: Active
- 리전: asia-northeast3
```

---

## 3️⃣ Firebase 프로젝트 설정

### ✅ 확인 필요 항목

#### A. Firestore Database Rules

**Security Rules 확인**:
```javascript
// users 컬렉션 접근 권한
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}

// tasks 컬렉션 접근 권한
match /tasks/{taskId} {
  allow read, write: if request.auth != null;
}
```

**확인 방법**:
```
Firebase Console → Firestore Database → Rules
```

#### B. Firebase Authentication

**활성화된 로그인 방법 확인**:
```
Firebase Console → Authentication → Sign-in method

확인:
- Email/Password: Enabled
- Google: Enabled (사용 중인 경우)
```

---

## 4️⃣ Cloud Scheduler 설정

### ✅ 자동 설정

**`checkOverdueTasks` 함수**:
```typescript
export const checkOverdueTasks = functions
  .region('asia-northeast3')
  .pubsub.schedule('every 30 minutes')  // ✅ 자동으로 스케줄러 생성
  .timeZone('Asia/Seoul')
  .onRun(async (context) => { ... });
```

**배포 시 자동 생성**:
- Cloud Scheduler가 자동으로 생성됨
- 30분마다 자동 실행
- 추가 설정 불필요

### 🔍 확인 방법

**Google Cloud Console**:
```
1. https://console.cloud.google.com/cloudscheduler
2. 프로젝트: smis-mentor
3. Job 확인: firebase-schedule-checkOverdueTasks-...
4. 상태: Enabled
5. 스케줄: */30 * * * * (30분마다)
```

---

## 5️⃣ 필수 설정 요약

### 🚨 지금 해야 할 것

#### 1. Cloud Messaging API 활성화 확인
```bash
# Firebase Console에서 확인
https://console.firebase.google.com/project/smis-mentor/settings/cloudmessaging

# Cloud Messaging API (V1) 활성화 확인
```

#### 2. Cloud Functions 배포
```bash
cd /Users/sunwoongshin/Desktop/dev/smis-mentor
firebase deploy --only functions

# 배포 후 확인
firebase functions:log
```

### ✅ 이미 완료된 것

- [x] google-services.json 추가
- [x] GoogleService-Info.plist 존재
- [x] APNs Key 업로드 (iOS)
- [x] Functions 코드 구현
- [x] Functions 빌드 완료
- [x] expo-server-sdk 설치

### ⏳ 선택 사항 (나중에)

- [ ] Android SHA 인증서 추가 (Google Sign-In 사용 시)
- [ ] Firestore Security Rules 검토
- [ ] Cloud Functions 로그 모니터링 설정
- [ ] Budget Alerts 설정 (비용 관리)

---

## 6️⃣ 배포 및 테스트 순서

### Step 1: Cloud Functions 배포
```bash
# 1. Functions 빌드 확인
cd functions
npm run build

# 2. Firebase 배포
cd ..
firebase deploy --only functions

# 3. 배포 확인
firebase functions:log
```

### Step 2: Cloud Messaging API 확인
```
Firebase Console → Project Settings → Cloud Messaging
→ API 활성화 상태 확인
```

### Step 3: 모바일 앱 빌드
```bash
cd packages/mobile

# Development Build (테스트용)
npm run build:mobile:dev:android
npm run build:mobile:dev:ios

# Production Build (배포용)
npm run build:mobile:prod:android
npm run build:mobile:prod:ios
```

### Step 4: 테스트
```
1. 앱 설치 및 로그인
2. 푸시 토큰 등록 확인 (Firestore)
3. 푸시 알림 테스트 화면에서 즉시 알림 테스트
4. 업무 생성 (과거 시간)
5. 30분 대기 후 독촉 알림 수신 확인
```

---

## 7️⃣ 트러블슈팅

### Cloud Functions 배포 실패
```bash
# Firebase CLI 로그인 확인
firebase login

# 프로젝트 확인
firebase projects:list

# 프로젝트 선택
firebase use smis-mentor

# 다시 배포
firebase deploy --only functions
```

### Cloud Messaging API 오류
```
1. Google Cloud Console 접속
   https://console.cloud.google.com/apis/library/fcm.googleapis.com
2. 프로젝트 선택: smis-mentor
3. "Enable" 클릭
```

### 푸시 알림 수신 안 됨
```
1. Firestore에서 pushTokens 확인
2. Cloud Functions 로그 확인: firebase functions:log
3. Firebase Console → Cloud Messaging → Test 메시지 전송
```

---

## 🎯 요약

### 필수 작업 (지금)
1. ✅ Cloud Messaging API 활성화 확인
2. ✅ Cloud Functions 배포

### 선택 작업 (나중에)
- Android SHA 인증서 추가
- Firestore Rules 최적화
- 모니터링 설정

**대부분 자동으로 처리되므로, Functions 배포만 하면 완료!**
