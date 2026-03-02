# Mobile SMS 템플릿 시스템 구현 완료

## 📋 개요

모바일 앱에서 웹과 동일한 SMS 템플릿 시스템을 구현했습니다.
- ✅ Firestore 기반 템플릿 동적 로드
- ✅ 메시지 내용 열기/닫기 토글
- ✅ 발신번호 선택 (010-7656-7933, 010-6711-7933)
- ✅ 템플릿 수정 및 저장
- ✅ 웹과 100% 동일한 기능

## 🎯 구현된 기능

### 1. 템플릿 관리
- **자동 로드**: 화면 로드 시 Firestore에서 모든 템플릿 자동 로드
- **우선순위**:
  1. 공고별 전용 템플릿 (refJobBoardId = jobBoardId)
  2. 공통 템플릿 (refJobBoardId = null)
  3. 기본 메시지 (코드 하드코딩)

### 2. UI 구성 (웹과 동일)

#### 상태별 "메시지 내용 열기/닫기" 버튼
- ✅ 서류 합격: `accepted` 상태일 때 표시
- ✅ 서류 불합격: `rejected` 상태일 때 표시
- ✅ 면접 예정: `interviewStatus: pending` 일 때 표시
- ✅ 면접 합격: `interviewStatus: passed` 일 때 표시
- ✅ 면접 불합격: `interviewStatus: failed` 일 때 표시
- ✅ 최종 합격: `finalStatus: finalAccepted` 일 때 표시
- ✅ 최종 불합격: `finalStatus: finalRejected` 일 때 표시

#### SMS 메시지 박스 (`SMSMessageBox` 컴포넌트)
- ✅ **TextInput**: 멀티라인 메시지 입력 (최소 6줄)
- ✅ **발신번호 선택**: 라디오 버튼
  - 010-7656-7933 (대표)
  - 010-6711-7933
- ✅ **취소 버튼**: 메시지 박스 닫기 & 상태 원복
- ✅ **저장 및 전송 버튼**: 템플릿 저장 + SMS 전송 + 상태 변경
- ✅ **로딩 상태**: 전송 중 ActivityIndicator 표시
- ✅ **색상 코딩**:
  - 합격: 초록색 배경 (#d1fae5)
  - 불합격: 빨간색 배경 (#fee2e2)
  - 면접 예정: 파란색 배경 (#dbeafe)

### 3. 동작 흐름

#### 서류 합격 예시
```
1. 서류 상태를 "합격"으로 변경
   ↓
2. "메시지 내용 열기" 버튼 자동 표시
   ↓
3. 버튼 클릭 → SMS 메시지 박스 열림
   ↓
4. 템플릿 내용 확인/수정
   ↓
5. 발신번호 선택
   ↓
6. "저장 및 전송" 클릭
   ↓
7. Firestore에 템플릿 저장 (기존 템플릿 업데이트 또는 신규 생성)
   ↓
8. Application 상태 업데이트 (applicationStatus: 'accepted')
   ↓
9. SMS 전송 (웹 API 호출)
   ↓
10. 성공 알림 & 메시지 박스 닫힘 & 데이터 새로고침
```

## 📦 구현된 파일

### 신규 생성
- `packages/mobile/src/components/SMSMessageBox.tsx`: 재사용 가능한 SMS 메시지 박스 컴포넌트
- `packages/shared/src/types/sms.ts`: SMS 템플릿 타입 정의
- `packages/shared/src/services/smsTemplate/index.ts`: 템플릿 조회/저장 로직

### 수정
- `packages/mobile/src/screens/ApplicantDetailScreen.tsx`: 
  - 템플릿 시스템 통합
  - 메시지 박스 UI 추가
  - 상태 관리 로직 개선
- `packages/mobile/src/services/smsService.ts`: 
  - `sendCustomSMS()` 함수에 fromNumber 파라미터 추가
- `packages/shared/src/services/sms/index.ts`: 웹 API 호출 로직

## 🔄 웹 vs 모바일 기능 비교

| 기능 | 웹 | 모바일 | 상태 |
|------|-----|--------|------|
| Firestore 템플릿 로드 | ✅ | ✅ | 동일 |
| 템플릿 우선순위 (공고별 → 공통 → 기본) | ✅ | ✅ | 동일 |
| 메시지 내용 열기/닫기 | ✅ | ✅ | 동일 |
| 메시지 내용 수정 | ✅ | ✅ | 동일 |
| 발신번호 선택 | ✅ | ✅ | 동일 |
| 템플릿 저장 | ✅ | ✅ | 동일 |
| SMS 전송 | ✅ | ✅ | 동일 |
| 변수 치환 ({이름}, {면접링크} 등) | ✅ | ✅ | 동일 |
| 색상 코딩 (합격/불합격) | ✅ | ✅ | 동일 |
| 로딩 상태 표시 | ✅ | ✅ | 동일 |

## 🎨 UI 스크린샷 위치

### 서류 상태
- 합격 선택 → "메시지 내용 열기" 버튼 표시
- 버튼 클릭 → 초록색 배경의 메시지 박스 표시
- 메시지 수정 가능
- 발신번호 라디오 버튼 (2개)
- "취소" / "저장 및 전송" 버튼

### 면접 상태
- 면접 예정: 파란색 배경
- 면접 합격: 초록색 배경
- 면접 불합격: 빨간색 배경

### 최종 상태
- 최종 합격: 초록색 배경
- 최종 불합격: 빨간색 배경

## 🔧 사용 방법

### 1. 웹 서버 실행 (필수)
```bash
cd packages/web
npm run dev
# 네트워크 IP 확인 (예: http://192.168.45.63:3000)
```

### 2. 모바일 환경 변수 설정
```bash
cd packages/mobile
# .env 파일 확인
EXPO_PUBLIC_WEB_API_URL=http://192.168.45.63:3000
```

### 3. 모바일 앱 실행
```bash
npx expo start --clear
```

### 4. SMS 전송 테스트
1. 지원자 상세 화면 진입
2. 서류 상태를 "합격"으로 변경
3. "메시지 내용 열기" 버튼 클릭
4. 메시지 확인/수정
5. 발신번호 선택
6. "저장 및 전송" 클릭
7. ✅ 성공 알림 확인

## 📝 템플릿 변수

모든 템플릿에서 사용 가능한 변수:
- `{이름}`: 지원자 이름
- `{면접링크}`: 면접 화상 링크
- `{면접소요시간}`: 면접 예상 소요 시간
- `{면접참고사항}`: 면접 추가 안내사항

예시:
```
안녕하세요, {이름}님.
서류 전형 합격을 축하드립니다.

면접 일정을 안내드립니다.
• 면접 링크: {면접링크}
• 소요 시간: 약 {면접소요시간}분

{면접참고사항}

면접에 참석해주시기 바랍니다.
```

## ⚠️ 주의사항

1. **웹 서버 실행 필수**: 로컬 개발 시 웹 서버가 실행 중이어야 SMS 전송 가능
2. **네트워크 연결**: 실제 디바이스는 컴퓨터와 같은 Wi-Fi 필요
3. **환경 변수**: `.env` 변경 시 `npx expo start --clear` 필수
4. **템플릿 우선순위**: 공고별 → 공통 → 기본 순서
5. **발신번호**: 010-7656-7933 (기본값)

## 🎉 완료된 작업

### Shared 패키지
- ✅ SMS 타입 정의 (`packages/shared/src/types/sms.ts`)
- ✅ 템플릿 서비스 (`packages/shared/src/services/smsTemplate/`)
- ✅ `getSMSTemplateByTypeAndJobBoard()` 함수
- ✅ `saveSMSTemplate()`, `updateSMSTemplate()` 함수
- ✅ `replaceTemplateVariables()` 함수
- ✅ `DEFAULT_SMS_TEMPLATES` 상수
- ✅ 빌드 완료

### Mobile 패키지
- ✅ `SMSMessageBox` 컴포넌트 (재사용 가능)
- ✅ `ApplicantDetailScreen` 템플릿 시스템 통합
- ✅ 상태별 "메시지 내용 열기/닫기" 버튼
- ✅ 7개 상태 모두 메시지 박스 구현
  - document_pass, document_fail
  - interview_scheduled, interview_pass, interview_fail
  - final_pass, final_fail
- ✅ 발신번호 선택 기능
- ✅ 템플릿 자동 로드 (`loadTemplates()`)
- ✅ 템플릿 저장 및 SMS 전송 (`saveTemplateAndSend()`)
- ✅ 메시지 박스 토글 (`showMessageBox()`)

## 🆚 웹과의 차이점

거의 없음! 단, UI 스타일은 모바일에 최적화:
- 웹: 마우스 호버 효과
- 모바일: 터치 피드백
- 레이아웃: 모바일 화면 크기에 맞게 조정

## 🔒 보안

- ✅ API 키는 웹 서버에만 저장
- ✅ 모바일은 웹 API만 호출
- ✅ 템플릿은 Firestore에서 동적 로드 (보안 규칙 적용 가능)
- ✅ `.env` 파일은 gitignore 처리

## 📚 관련 문서

- [SMS 전송 기능 구현](./MOBILE_SMS_IMPLEMENTATION.md)
- [템플릿 시스템 설명](#템플릿-관리)

---

**모바일 앱에서 웹과 100% 동일한 SMS 템플릿 시스템이 작동합니다!** 🎉
