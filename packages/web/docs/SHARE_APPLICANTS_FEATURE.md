# 지원자 정보 임시 공유 링크 기능

## 개요
관리자가 캠프별 지원자 정보를 시간 제한이 있는 임시 링크로 공유할 수 있는 기능입니다. 관리자가 아니어도 링크만 있으면 누구나 지원자 정보를 확인할 수 있으며, 설정한 시간이 지나면 자동으로 만료됩니다.

## 주요 기능

### 1. 공유 링크 생성
- **위치**: `/admin/job-board-manage/applicants/[id]`
- **방법**: "현재 목록 공유" 버튼 클릭
- **설정 가능 항목**:
  - 유효 시간: 1시간 ~ 30일(720시간)
  - 기본 옵션: 1시간, 6시간, 12시간, 24시간, 48시간, 72시간, 168시간(7일)
  - 직접 입력 가능

### 2. 공유 페이지
- **URL 형식**: `https://www.smis-mentor.com/shared/applicants/[token]`
- **접근 권한**: 링크를 가진 누구나 (로그인 불필요)
- **표시 정보**:
  - 캠프 정보 (제목, 기수, 코드)
  - 지원자 목록 및 상세 정보
  - 지원 상태 (서류/면접/최종)
  - 평가 점수 요약
  - 면접 일정
  - 만료 시간

### 3. 자동 만료 처리
- **Cron Job**: 6시간마다 자동 실행
- **설정 파일**: `packages/web/vercel.json`
- **API 엔드포인트**: `/api/share-applicants/cleanup-expired`

## 데이터 구조

### ShareToken (Firestore Collection: `shareTokens`)
```typescript
{
  id: string;                    // 문서 ID
  token: string;                 // 64자리 랜덤 토큰
  refJobBoardId: string;         // 캠프(JobBoard) ID
  refApplicationIds: string[];   // 공유할 지원서 ID 배열
  expiresAt: Timestamp;          // 만료 시간
  createdAt: Timestamp;          // 생성 시간
  createdBy: string;             // 생성한 관리자 UID
  isActive: boolean;             // 활성화 상태
}
```

## API 엔드포인트

### 1. 링크 생성
- **URL**: `POST /api/share-applicants/generate`
- **요청 본문**:
  ```json
  {
    "jobBoardId": "string",
    "applicationIds": ["string"],
    "expirationHours": 24,
    "createdBy": "string"
  }
  ```
- **응답**:
  ```json
  {
    "success": true,
    "token": "string",
    "shareUrl": "string",
    "expiresAt": "ISO 8601 string",
    "tokenId": "string"
  }
  ```

### 2. 지원자 정보 조회
- **URL**: `GET /api/share-applicants/[token]`
- **응답**:
  ```json
  {
    "success": true,
    "jobBoard": {
      "id": "string",
      "title": "string",
      "generation": "string",
      "jobCode": "string"
    },
    "applications": [...],
    "expiresAt": "ISO 8601 string"
  }
  ```

### 3. 만료 토큰 정리
- **URL**: `POST|GET /api/share-applicants/cleanup-expired`
- **인증**: Bearer 토큰 (환경변수 `CRON_SECRET`)
- **응답**:
  ```json
  {
    "success": true,
    "message": "string",
    "deactivatedCount": 0
  }
  ```

## 환경 변수

### 필수
- `NEXT_PUBLIC_BASE_URL`: 공유 링크의 기본 URL (예: `https://www.smis-mentor.com`)

### 선택 (보안 강화)
- `CRON_SECRET`: Cron Job API 호출 시 인증 토큰

## 보안 고려사항

1. **토큰 생성**: 32바이트 랜덤 문자열 (64자리 hex)
2. **만료 처리**: 
   - 클라이언트 측: 페이지 접근 시 만료 확인
   - 서버 측: 6시간마다 만료된 토큰 비활성화
3. **접근 제어**: 토큰 검증 및 활성화 상태 확인
4. **개인정보 보호**: 공유 페이지에 민감한 정보 노출 주의 필요

## 사용 예시

### 관리자 사용 시나리오
1. 지원자 관리 페이지 접속
2. 필터/검색으로 원하는 지원자 목록 조회
3. "현재 목록 공유" 버튼 클릭
4. 유효 시간 설정 (예: 24시간)
5. "링크 생성" 클릭
6. 생성된 링크 복사
7. 링크를 필요한 사람에게 전달

### 수신자 사용 시나리오
1. 받은 링크 클릭
2. 로그인 없이 지원자 정보 확인
3. 만료 시간 전까지 자유롭게 조회

## 주의사항

1. **개인정보 보호**: 링크를 받은 사람은 누구나 지원자 정보를 볼 수 있으므로 신중하게 공유해야 합니다.
2. **만료 시간**: 만료 후에는 링크가 즉시 작동하지 않습니다.
3. **링크 관리**: 링크를 분실하거나 유출된 경우, 새로운 링크를 생성하고 이전 링크가 만료될 때까지 기다려야 합니다.
4. **성능**: 한 번에 너무 많은 지원자를 공유하면 페이지 로딩이 느려질 수 있습니다.

## 향후 개선 사항

- [ ] 링크 조기 비활성화 기능
- [ ] 링크별 접근 로그 기록
- [ ] 비밀번호 보호 옵션
- [ ] 공유 가능 정보 범위 선택 (예: 평가 점수 제외)
- [ ] 관리자가 생성한 링크 목록 조회 페이지
