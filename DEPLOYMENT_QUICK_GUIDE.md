# 푸시 알림 배포 설정 - 빠른 가이드

## 🚨 배포 전 필수 작업 2가지

### 1. Android: google-services.json 추가

**현재 상태**: ❌ 파일 없음

**작업 방법**:
```bash
# 1. Firebase Console 접속
https://console.firebase.google.com/project/smis-mentor/settings/general

# 2. Android 앱 선택 → google-services.json 다운로드

# 3. 파일 배치
cp ~/Downloads/google-services.json packages/mobile/google-services.json

# 4. 확인
ls -la packages/mobile/google-services.json
```

### 2. iOS: APNs 인증 키 업로드

**현재 상태**: ⚠️ 확인 필요

**작업 방법**:

#### Step 1: Apple Developer에서 APNs Key 생성
```
1. https://developer.apple.com/account/resources/authkeys/list 접속
2. "+" 버튼 클릭
3. Key Name: "SMIS Mentor Push"
4. Apple Push Notifications service (APNs) 체크
5. Continue → Download .p8 파일 (재다운로드 불가!)
6. Key ID와 Team ID 기록
```

#### Step 2: Firebase에 업로드
```
1. https://console.firebase.google.com/project/smis-mentor/settings/cloudmessaging
2. Apple app configuration 섹션
3. APNs Authentication Key → Upload
4. .p8 파일 선택
5. Key ID 입력
6. Team ID 입력
7. Upload 클릭
```

---

## ✅ 이미 완료된 설정

### 코드
- [x] expo-notifications 설치 및 설정
- [x] 푸시 토큰 등록 로직
- [x] 알림 핸들러 설정
- [x] Cloud Functions (checkOverdueTasks)
- [x] 알림 설정 화면
- [x] 알림 테스트 화면

### 설정 파일
- [x] app.json - 알림 플러그인 설정
- [x] eas.json - 빌드 설정
- [x] notification-icon.png - SMIS 아이콘
- [x] GoogleService-Info.plist (iOS)

### Android 권한
- [x] POST_NOTIFICATIONS (Android 13+)
- [x] 알림 채널 설정

---

## 🚀 배포 명령어

### Android
```bash
# 1. google-services.json 확인 (필수!)
ls packages/mobile/google-services.json

# 2. 빌드
npm run build:mobile:prod:android

# 3. 업로드
npm run submit:android
```

### iOS
```bash
# 1. APNs Key 업로드 확인 (필수!)
# Firebase Console에서 확인

# 2. 빌드
npm run build:mobile:prod:ios

# 3. 업로드
npm run submit:ios
```

---

## 🧪 배포 후 테스트

### 1. TestFlight/Internal Testing
```bash
# Preview 빌드
npm run build:mobile:preview:android
npm run build:mobile:preview:ios
```

### 2. 테스트 항목
- [ ] 알림 권한 요청
- [ ] 푸시 토큰 등록 (Firestore 확인)
- [ ] 즉시 알림 수신
- [ ] 예약 알림 수신
- [ ] SMIS 아이콘 표시
- [ ] 알림 클릭 시 앱 이동

---

## 🔍 확인 방법

### Firebase Console
```
1. Firestore → users/{userId} → pushTokens 확인
2. Cloud Messaging → API 활성화 확인
3. Cloud Functions → checkOverdueTasks 로그 확인
```

### 앱에서 확인
```
1. 마이페이지 → 푸시 알림 테스트
2. "푸시 토큰 확인" 클릭
3. ExponentPushToken[...] 표시 확인
```

---

## ⚠️ 주의사항

### Android
- google-services.json 없으면 빌드 실패
- 파일은 프로젝트 루트(packages/mobile/)에 위치

### iOS
- APNs Key 없으면 푸시 알림 수신 불가
- TestFlight로 배포 후에만 테스트 가능
- .p8 파일은 한 번만 다운로드 가능 (분실 시 재생성)

---

## 📄 상세 문서

더 자세한 내용은 다음 문서 참조:
- `DEPLOYMENT_PUSH_NOTIFICATION_CHECKLIST.md` - 전체 체크리스트
- `PUSH_NOTIFICATION_GUIDE.md` - 구현 가이드
- `NOTIFICATION_TEST_GUIDE.md` - 테스트 가이드

---

## 🎯 요약

**배포하기 전에 꼭 하세요**:
1. ✅ google-services.json 파일 추가 (Android)
2. ✅ APNs Key 업로드 (iOS)

그 외는 모두 준비 완료! 🎉
