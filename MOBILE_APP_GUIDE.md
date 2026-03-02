# 📱 React Native 모바일 앱 실행 가이드

## 🚀 빠른 시작

### 1. Expo Go 앱 설치

스마트폰에 Expo Go 앱을 설치하세요:
- **iOS**: [App Store에서 다운로드](https://apps.apple.com/app/expo-go/id982107779)
- **Android**: [Google Play에서 다운로드](https://play.google.com/store/apps/details?id=host.exp.exponent)

### 2. 개발 서버 실행

```bash
cd packages/mobile
npx expo start
```

또는 루트 폴더에서:

```bash
npm run start:mobile
```

### 3. QR 코드 스캔

터미널에 표시되는 QR 코드를 스캔:
- **iOS**: 카메라 앱으로 QR 코드 스캔
- **Android**: Expo Go 앱 내 스캔 기능 사용

## 📱 앱 구조

### 메인 네비게이션 (하단 탭바)

1. **🏠 홈** - 대시보드 (추후 구현)
2. **📋 채용** - 채용 공고 및 지원 현황 (추후 구현)
3. **⛺ 캠프** - 캠프 관리 기능
4. **⚙️ 설정** - 앱 설정 (추후 구현)
5. **👤 마이페이지** - 프로필 관리 (추후 구현)

### 캠프 탭 (상단 세부 탭)

- **교육** - 1~4차 교육 자료 (추후 구현)
- **업무** - 일자별 업무 목록 (추후 구현)
- **반** - 반/유닛 학생 관리 ✅ 구현 완료
- **방** - 방 배정 관리 (추후 구현)
- **환자** - 환자 기록 관리 (추후 구현)

### 반 탭 (학생 관리)

현재 **"이겸수"** 멘토로 고정되어 있습니다.

#### 반 학생 탭
- BC열(반멘토)에 "이겸수"가 있는 학생들 표시
- Google Sheets ST 시트에서 실시간 데이터 가져오기
- 학생 카드 클릭 시 상세 정보 모달 표시

#### 유닛 학생 탭
- BD열(유닛)에 "이겸수"가 있는 학생들 표시
- 동일한 상세 정보 모달 기능

#### 주요 기능
- 🔄 **동기화 버튼**: Google Sheets에서 최신 데이터 가져오기
- ↓ **당겨서 새로고침**: 캐시된 데이터 갱신
- 📱 **학생 상세 정보**: 이름, 학번, 전화번호, 학교, 전공 등

## 🔥 Firebase Functions 연동

모바일 앱은 다음 Cloud Functions를 사용합니다:

### 1. `getStudentsByMentor`
```typescript
// 멘토별 학생 조회
const students = await stSheetService.getStudentsByMentor('이겸수', 'class');
```

### 2. `syncSTSheet`
```typescript
// ST 시트 동기화 (Google Sheets → Firestore)
const result = await stSheetService.syncSTSheet();
```

### 3. `getStudentDetail`
```typescript
// 학생 상세 정보 조회
const student = await stSheetService.getStudentDetail(studentId);
```

## 🛠️ 개발 명령어

```bash
# 개발 서버 시작
npx expo start

# iOS 시뮬레이터에서 실행 (macOS만 가능)
npx expo start --ios

# Android 에뮬레이터에서 실행
npx expo start --android

# 웹 브라우저에서 실행
npx expo start --web

# 캐시 클리어 후 시작
npx expo start --clear
```

## 📦 주요 의존성

- `expo ~54.0.33` - Expo 플랫폼
- `react-native 0.81.5` - React Native
- `@react-navigation/bottom-tabs` - 하단 탭 네비게이션
- `@react-navigation/material-top-tabs` - 상단 탭 네비게이션
- `firebase ^11.5.0` - Firebase SDK
- `@react-native-async-storage/async-storage` - 로컬 스토리지
- `@smis-mentor/shared` - 공유 타입 및 유틸리티

## 🔧 트러블슈팅

### QR 코드가 스캔되지 않을 때
- 스마트폰과 컴퓨터가 같은 Wi-Fi 네트워크에 연결되어 있는지 확인
- 방화벽이 포트 8081을 차단하고 있지 않은지 확인

### "Metro bundler error" 발생 시
```bash
# 캐시 클리어 후 재시작
npx expo start --clear
```

### Firebase Functions 호출 실패 시
- Firebase Functions가 배포되어 있는지 확인
- `asia-northeast3` 리전이 올바르게 설정되었는지 확인
- Firebase Console에서 Functions 로그 확인

### "Component auth has not been registered yet" 오류
- `@react-native-async-storage/async-storage`가 설치되어 있는지 확인
- Firebase 설정에 `initializeAuth` 사용 확인 (완료)

## 🎯 다음 단계

1. **Firebase Functions 배포**
   ```bash
   cd ../../functions
   npm run deploy
   ```

2. **실제 멘토 인증 구현**
   - 로그인 기능 추가
   - 멘토 이름을 사용자 프로필에서 가져오기

3. **추가 기능 구현**
   - 교육 자료 관리
   - 일일 업무 체크리스트
   - 방 배정 관리
   - 환자 기록 관리

## 💡 참고사항

- 현재 "이겸수" 멘토로 하드코딩되어 있습니다
- 실제 배포 시 로그인 및 권한 관리 구현 필요
- Google Sheets API 할당량에 주의 (분당 100회 읽기)
- Firestore 캐시 전략으로 API 호출 최소화
