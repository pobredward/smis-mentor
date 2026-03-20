# 앱 푸시 알림 설정 가이드

## 개요

캠프 업무 탭에서 업무의 날짜+시간이 지났는데 유저가 체크하지 않으면 독촉 푸시 알림을 자동으로 전송하는 기능이 구현되었습니다.

## 구현된 기능

### 1. 모바일 앱 (packages/mobile)

#### 1.1 푸시 알림 패키지 설치
- `expo-notifications` - 푸시 알림 송수신
- `expo-device` - 디바이스 타입 확인

#### 1.2 알림 서비스 (`src/services/notificationService.ts`)
- **푸시 토큰 등록**: 앱 실행 시 자동으로 Expo Push Token 생성 및 Firestore 저장
- **알림 권한 요청**: Android/iOS 푸시 알림 권한 자동 요청
- **알림 채널 설정**: Android 전용 알림 채널 구성
- **알림 설정 관리**: 사용자별 알림 설정 저장/조회

주요 함수:
- `registerForPushNotificationsAsync()`: 푸시 토큰 등록
- `savePushToken()`: Firestore에 토큰 저장
- `getNotificationSettings()`: 사용자 알림 설정 조회
- `updateNotificationSettings()`: 알림 설정 업데이트

#### 1.3 AuthContext 통합 (`src/context/AuthContext.tsx`)
- 로그인 시 자동으로 푸시 토큰 등록
- 알림 수신 리스너 설정
- 알림 클릭 시 해당 업무로 이동

#### 1.4 설정 화면 (`src/screens/SettingsScreen.tsx`)
- 업무 알림 on/off 토글
- 일반 알림 on/off 토글
- 프로필 화면에서 "알림 설정" 버튼으로 접근 가능

### 2. Cloud Functions (functions)

#### 2.1 업무 독촉 스케줄러 (`src/index.ts`)

**`checkOverdueTasks` 함수**
- 실행 주기: 30분마다 자동 실행
- 시간대: 한국 표준시(Asia/Seoul)
- 작동 방식:
  1. 오늘 날짜의 모든 업무 조회
  2. 시간이 설정된 업무 중 현재 시간이 지난 업무 필터링
  3. 각 업무에 대해 미완료 사용자 조회
  4. 알림 설정을 확인하여 알림 수신을 원하는 사용자에게만 전송

**알림 전송 로직**
- Expo Push Notification API 사용
- 실패한 토큰 자동 감지 및 로그
- 배치 처리로 효율적인 알림 전송

**테스트 함수**
- `sendTestNotification`: 수동으로 테스트 알림 전송 가능

### 3. Firestore 데이터 구조

#### 3.1 사용자 문서 (`users/{userId}`)
```typescript
{
  pushTokens: {
    [token: string]: {
      platform: 'ios' | 'android',
      addedAt: Timestamp,
      lastUsed: Timestamp
    }
  },
  notificationSettings: {
    taskReminders: boolean,        // 업무 알림 (기본: true)
    generalNotifications: boolean  // 일반 알림 (기본: true)
  }
}
```

## 배포 방법

### 1. 모바일 앱 빌드

```bash
# 개발 빌드
npm run build:mobile:dev:ios
npm run build:mobile:dev:android

# 프로덕션 빌드
npm run build:mobile:prod:ios
npm run build:mobile:prod:android
```

### 2. Cloud Functions 배포

```bash
# Functions 빌드
cd functions
npm run build

# Firebase에 배포
cd ..
npm run deploy:functions
```

## 테스트 방법

### 1. 로컬 테스트

```bash
# Firebase Functions 에뮬레이터 실행
npm run dev:functions
```

### 2. 실제 기기 테스트

1. 앱 설치 후 로그인
2. 알림 권한 허용
3. 캠프 탭 → 업무 탭에서 시간이 지난 업무 확인
4. 30분마다 자동으로 독촉 알림 수신

### 3. 수동 테스트

Firebase Console에서 `sendTestNotification` 함수를 직접 호출하여 테스트 알림 전송 가능

## 주의사항

### 1. 푸시 알림 권한
- 사용자가 시스템 설정에서 알림 권한을 거부하면 앱 내 설정과 관계없이 알림 수신 불가
- iOS는 앱 설치 시, Android는 Android 13+ 부터 권한 요청

### 2. 토큰 관리
- 푸시 토큰은 앱 재설치, 로그아웃 시 갱신 필요
- 만료된 토큰은 자동으로 감지되어 로그에 기록됨

### 3. 알림 스케줄러
- Cloud Functions의 `checkOverdueTasks`는 30분마다 실행
- 실행 시간을 변경하려면 `functions/src/index.ts`의 cron 표현식 수정

### 4. 비용
- Expo Push Notifications는 무료
- Firebase Functions 실행 비용 발생 (30분마다 실행)

## 추가 개선 사항 (선택)

1. **알림 빈도 조절**: 같은 업무에 대해 반복 알림 방지 로직 추가
2. **알림 통계**: 알림 발송 성공/실패 통계 대시보드
3. **알림 히스토리**: 사용자별 알림 수신 내역 저장
4. **커스텀 알림 시간**: 사용자가 독촉 알림 시간 설정 가능하도록 확장

## 트러블슈팅

### 알림이 수신되지 않을 때

1. **푸시 토큰 확인**
   - Firestore에서 `users/{userId}/pushTokens` 확인
   - 로그에서 토큰 등록 성공 메시지 확인

2. **알림 권한 확인**
   - 기기 설정 → 앱 → 알림 권한 확인

3. **알림 설정 확인**
   - 앱 내 설정 화면에서 "업무 알림" 활성화 확인

4. **Cloud Functions 로그 확인**
   ```bash
   npm run logs
   ```

5. **실제 기기 사용**
   - 시뮬레이터/에뮬레이터는 푸시 알림 미지원

## 파일 구조

```
packages/mobile/
├── src/
│   ├── services/
│   │   └── notificationService.ts  # 푸시 알림 서비스
│   ├── screens/
│   │   └── SettingsScreen.tsx      # 알림 설정 화면
│   ├── context/
│   │   └── AuthContext.tsx         # 푸시 토큰 등록 통합
│   └── navigation/
│       └── RootNavigator.tsx       # 설정 화면 라우팅
└── app.json                        # Expo 설정 (알림 플러그인)

functions/
└── src/
    └── index.ts                    # 독촉 알림 Cloud Function
```

## 참고 자료

- [Expo Notifications Documentation](https://docs.expo.dev/versions/latest/sdk/notifications/)
- [Firebase Cloud Functions Documentation](https://firebase.google.com/docs/functions)
- [Expo Push Notification Service](https://docs.expo.dev/push-notifications/overview/)
