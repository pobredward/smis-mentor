# SMS 전송 기능 구현 완료 (Monorepo 구조)

## 📋 개요

모바일 앱에서 유저에게 SMS를 전송하는 기능을 Monorepo 구조에 맞게 구현했습니다.
웹과 동일하게 **Firestore 기반 템플릿 시스템**을 사용합니다.

## 🏗️ 아키텍처 설계

### 보안 고려사항
- ✅ **API 키는 웹 서버에만 저장** (Next.js `.env.local`)
- ✅ **모바일 앱은 웹 API 호출** (클라이언트에 API 키 노출 방지)
- ✅ **Shared 패키지로 타입 및 로직 공유**
- ✅ **템플릿 기반 SMS 전송** (Firestore에서 동적 로드)

### 구조
```
packages/
├── shared/                           # 공유 로직
│   ├── src/types/sms.ts             # SMS 타입 정의
│   ├── src/services/sms/            # SMS API 클라이언트
│   └── src/services/smsTemplate/    # 템플릿 서비스 (Firestore 조회)
├── web/                              # Next.js (서버)
│   ├── .env.local                   # 네이버 클라우드 API 키 저장
│   └── src/app/api/send-sms/        # SMS 전송 API 엔드포인트
└── mobile/                           # Expo (클라이언트)
    ├── .env                          # 웹 API URL만 저장
    ├── .env.example                 # 환경 변수 예시
    └── src/services/smsService.ts   # 템플릿 기반 SMS 전송 서비스
```

## 📦 구현 내용

### 1. Shared 패키지 (`packages/shared`)

#### `src/types/sms.ts` (신규)
- SMS 템플릿 타입 정의
  - `TemplateType`: `document_pass`, `document_fail`, `interview_scheduled`, etc.
  - `SMSTemplate`: 템플릿 인터페이스

#### `src/services/sms/index.ts`
- SMS 관련 타입 정의 (`SendSMSParams`, `SendSMSResponse`, `PhoneNumber`)
- `SMSApiClient` 클래스: 웹 API 호출 로직

#### `src/services/smsTemplate/index.ts` (신규)
- `getSMSTemplateByTypeAndJobBoard()`: Firestore에서 템플릿 조회
  - 공고별 특화 템플릿 우선 검색
  - 없으면 공통 템플릿 검색
  - 없으면 null 반환
- `replaceTemplateVariables()`: 템플릿 변수 치환 (`{이름}` → 실제 값)
- `DEFAULT_SMS_TEMPLATES`: 기본 템플릿 메시지

### 2. Mobile 패키지 (`packages/mobile`)

#### 환경 변수 설정

**`.env`**
```env
# 실제 디바이스/Expo Go 사용 시
EXPO_PUBLIC_WEB_API_URL=http://192.168.45.63:3000

# iOS 시뮬레이터 사용 시
# EXPO_PUBLIC_WEB_API_URL=http://localhost:3000

# Android 에뮬레이터 사용 시
# EXPO_PUBLIC_WEB_API_URL=http://10.0.2.2:3000
```

#### `src/services/smsService.ts` (수정)

**템플릿 기반 SMS 전송:**
- `sendSMSWithTemplate()`: 템플릿 타입과 jobBoardId로 SMS 전송
  1. Firestore에서 템플릿 조회
  2. 템플릿 없으면 기본 메시지 사용
  3. 변수 치환
  4. 웹 API 호출

**헬퍼 함수들:**
- `sendDocumentPassSMS(phoneNumber, userName, jobBoardId?, variables?)`
- `sendDocumentFailSMS(phoneNumber, userName, jobBoardId?, variables?)`
- `sendInterviewScheduleSMS(phoneNumber, userName, jobBoardId?, variables?)`
- `sendInterviewPassSMS()`, `sendInterviewFailSMS()`
- `sendFinalPassSMS()`, `sendFinalFailSMS()`
- `sendCustomSMS()`: 커스텀 메시지

#### `src/screens/ApplicantDetailScreen.tsx` (수정)

SMS 전송 시 **jobBoardId 전달**:
```typescript
await sendDocumentPassSMS(
  application.user.phoneNumber,
  application.user.name,
  jobBoardId,  // ← jobBoardId 추가
  { 이름: application.user.name }
);
```

### 3. Web 패키지 (`packages/web`)

기존 코드 유지:
- `.env.local`: 네이버 클라우드 API 키
- `src/app/api/send-sms/route.ts`: API 엔드포인트
- `src/lib/naverCloudSMS.ts`: SMS 전송 로직
- `src/lib/smsTemplateService.ts`: 템플릿 관리 (웹 전용)

## 🔧 템플릿 시스템 동작 방식

### 1. 템플릿 우선순위
```
1순위: 해당 공고 전용 템플릿 (refJobBoardId = jobBoardId)
2순위: 공통 템플릿 (refJobBoardId = null)
3순위: 기본 메시지 (코드에 하드코딩)
```

### 2. 템플릿 조회 로직
```typescript
// 예: 서류 합격 SMS 전송
const template = await getSMSTemplateByTypeAndJobBoard(
  db,
  'document_pass',  // 템플릿 타입
  jobBoardId        // 공고 ID (옵션)
);

const content = template?.content || DEFAULT_SMS_TEMPLATES['document_pass'];
```

### 3. 변수 치환
템플릿에 `{이름}`, `{면접링크}` 등의 변수를 사용하면 자동으로 실제 값으로 치환됩니다.

**템플릿 예시:**
```
안녕하세요, {이름}님.
{공고제목} 서류 전형 합격을 축하드립니다.

면접 일정을 안내드립니다.
• 면접 링크: {면접링크}
• 소요 시간: 약 {면접소요시간}분
```

**치환 후:**
```
안녕하세요, 홍길동님.
2024년 상반기 신입 채용 서류 전형 합격을 축하드립니다.

면접 일정을 안내드립니다.
• 면접 링크: https://meet.google.com/abc-def-ghi
• 소요 시간: 약 30분
```

## 🚀 사용 방법

### 개발 환경 설정

1. **웹 서버 실행** (터미널 1)
   ```bash
   cd packages/web
   npm run dev
   # Network IP 확인: http://192.168.x.x:3000
   ```

2. **Mobile 환경 변수 설정**
   ```bash
   cd packages/mobile
   # .env 파일에서 EXPO_PUBLIC_WEB_API_URL 확인
   # 실제 디바이스: http://192.168.x.x:3000
   # iOS 시뮬레이터: http://localhost:3000
   # Android 에뮬레이터: http://10.0.2.2:3000
   ```

3. **모바일 앱 실행** (터미널 2)
   ```bash
   cd packages/mobile
   npx expo start --clear  # 캐시 클리어하고 시작
   ```

### 템플릿 관리 (웹 대시보드)

1. 웹 관리자 페이지에서 SMS 템플릿 생성
2. **Type** 선택: `document_pass`, `interview_scheduled`, etc.
3. **refJobBoardId** 설정:
   - 공고별 전용 템플릿: 공고 ID 입력
   - 공통 템플릿: 비워두기
4. **Content**에 변수 사용: `{이름}`, `{면접링크}`, etc.

### SMS 전송 (모바일 앱)

1. 지원자 상세 화면에서 상태 변경
2. 자동으로 해당 템플릿 조회 및 SMS 전송
3. 템플릿이 없으면 기본 메시지 사용

## 📱 테스트 기기별 설정

| 기기 | URL 설정 |
|------|----------|
| 실제 디바이스 (Expo Go) | `http://192.168.x.x:3000` (컴퓨터의 로컬 네트워크 IP) |
| iOS 시뮬레이터 | `http://localhost:3000` |
| Android 에뮬레이터 | `http://10.0.2.2:3000` |

## 🔒 보안 체크리스트

- ✅ API 키가 모바일 앱 번들에 포함되지 않음
- ✅ `.env` 파일이 `.gitignore`에 추가됨
- ✅ `.env.example` 파일로 설정 가이드 제공
- ✅ 웹 API는 Next.js 서버에서만 실행
- ✅ 모바일 앱은 HTTP 요청만 수행
- ✅ 템플릿은 Firestore에서 동적 로드 (보안 규칙 적용 가능)

## 📝 사용 가능한 변수

### 공통 변수
- `{이름}`: 지원자 이름

### 면접 관련
- `{면접링크}`: 면접 화상 링크
- `{면접소요시간}`: 면접 예상 소요 시간
- `{면접참고사항}`: 면접 추가 안내사항

### 커스텀 변수
`variables` 파라미터로 추가 변수 전달 가능:
```typescript
await sendDocumentPassSMS(
  phoneNumber,
  userName,
  jobBoardId,
  {
    공고제목: '2024년 상반기 신입 채용',
    회사명: 'SMIS',
    // ... 기타 변수
  }
);
```

## ⚠️ 주의사항

1. **웹 서버 실행 필수**: 로컬 개발 시 웹 서버가 실행 중이어야 함
2. **환경 변수 재시작**: `.env` 변경 시 `npx expo start --clear` 필수
3. **네트워크 연결**: 실제 디바이스는 컴퓨터와 같은 Wi-Fi 필요
4. **템플릿 우선순위**: 공고별 템플릿 → 공통 템플릿 → 기본 메시지 순서
5. **SMS 전송 실패**: 앱 프로세스는 계속 진행되며 사용자에게 알림만 표시

## 🎉 완료된 작업

- ✅ Shared 패키지에 SMS 타입 및 템플릿 서비스 추가
- ✅ Firestore 기반 템플릿 조회 로직 구현
- ✅ Mobile 패키지에 템플릿 기반 SMS 전송 서비스 구현
- ✅ ApplicantDetailScreen에 jobBoardId 전달 통합
- ✅ 기본 메시지 폴백 시스템 구현
- ✅ 환경 변수 설정 및 `.gitignore` 업데이트
- ✅ Shared 패키지 빌드 완료

## 🆚 웹 vs 모바일 비교

| 기능 | 웹 (Next.js) | 모바일 (Expo) |
|------|--------------|---------------|
| 템플릿 관리 | ✅ CRUD 가능 | ❌ 읽기 전용 |
| 템플릿 조회 | Firestore 직접 조회 | Shared 패키지 함수 사용 |
| SMS 전송 | 네이버 클라우드 직접 호출 | 웹 API 호출 |
| 기본 메시지 | 코드에 하드코딩 | Shared 패키지에서 공유 |
| 변수 치환 | 자체 구현 | Shared 패키지 함수 사용 |

웹과 모바일 모두 동일한 템플릿 시스템을 사용하여 **일관된 사용자 경험**을 제공합니다!
