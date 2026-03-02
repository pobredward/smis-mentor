# 🐛 타입 에러 수정 완료

## 문제 상황

```
ERROR  JobCodes 조회 실패: [FirebaseError: Invalid query. When querying with documentId(), 
you must provide a valid string or a DocumentReference, but it was: a custom Object object.]
```

## 원인 분석

### Firestore 실제 데이터 구조:
```json
{
  "userId": "user123",
  "jobExperiences": [
    {
      "id": "OWEDDXiynrqgB2fPrgEC",
      "group": "junior",
      "groupRole": "담임",
      "classCode": "E03"
    },
    {
      "id": "abc123",
      "group": "senior",
      "groupRole": "수업"
    }
  ]
}
```

### 잘못된 타입 정의 (Before):
```typescript
// mobile/src/types/index.ts
interface User {
  jobExperiences?: string[];  // ❌ 문자열 배열로 정의
}
```

### 수정된 타입 정의 (After):
```typescript
// mobile/src/types/index.ts
interface JobExperience {
  id: string;
  group: string;
  groupRole: string;
  classCode?: string;
}

interface User {
  jobExperiences?: JobExperience[];  // ✅ 객체 배열로 정의
  activeJobExperienceId?: string;
}
```

## 수정 사항

### 1. **types/index.ts**
```typescript
// JobExperience 인터페이스 추가
export interface JobExperience {
  id: string;
  group: string;
  groupRole: string;
  classCode?: string;
}

// User 타입 수정
jobExperiences?: JobExperience[];  // string[] → JobExperience[]
```

### 2. **services/jobCodesService.ts**
```typescript
// 파라미터 타입 수정
getJobCodesByIds: async (
  jobExperiences: Array<{ id: string }>  // string[] → Array<{ id: string }>
): Promise<JobCode[]> => {
  const jobCodeIds = jobExperiences.map(exp => exp.id);  // id 추출
  // ...
}
```

### 3. **context/WebViewCacheContext.tsx**
```typescript
// activeJobCodeId 계산 수정
const activeJobCodeId = 
  userData?.activeJobExperienceId || 
  userData?.jobExperiences?.[0]?.id;  // .id 추가
```

### 4. **screens (Education/Schedule/Guide)**
```typescript
// 모든 화면에서 동일하게 수정
const activeJobCodeId = 
  userData?.activeJobExperienceId || 
  userData?.jobExperiences?.[0]?.id;  // .id 추가
```

## 데이터 흐름 (수정 후)

```typescript
// 1. User 데이터 로드
const userData = {
  jobExperiences: [
    { id: "OWEDDXiynrqgB2fPrgEC", group: "junior", ... },
    { id: "abc123", group: "senior", ... }
  ],
  activeJobExperienceId: "OWEDDXiynrqgB2fPrgEC"
}

// 2. ProfileScreen - 기수 카드 표시
const codes = await jobCodesService.getJobCodesByIds(userData.jobExperiences);
// → jobExperiences.map(exp => exp.id) = ["OWEDDXiynrqgB2fPrgEC", "abc123"]

// 3. WebViewCacheContext - 리소스 로드
const activeJobCodeId = 
  userData.activeJobExperienceId || 
  userData.jobExperiences[0].id;
// → "OWEDDXiynrqgB2fPrgEC"

const resources = await generationResourcesService.getResourcesByJobCodeId(activeJobCodeId);
// ✅ 정상 작동
```

## 테스트 체크리스트

- ✅ ProfileScreen에서 기수 카드 정상 로드
- ✅ 기수 선택 시 activeJobExperienceId 업데이트
- ✅ WebViewCacheContext에서 리소스 정상 로드
- ✅ 교육/시간표/인솔표 링크 정상 표시
- ✅ 관리자 링크 추가/삭제 기능 정상 작동

## 주의사항

### Firestore 데이터 구조 일관성
모든 사용자의 `jobExperiences`는 다음 형식을 따라야 합니다:

```json
{
  "jobExperiences": [
    {
      "id": "jobCode 문서 ID",
      "group": "junior | middle | senior | ...",
      "groupRole": "담임 | 수업 | 서포트 | ...",
      "classCode": "E03" (선택적)
    }
  ]
}
```

### 초기 activeJobExperienceId 설정
신규 사용자의 경우:
```typescript
activeJobExperienceId = jobExperiences[0].id  // 첫 번째 기수를 기본값으로
```

## 🎊 수정 완료!

모든 타입 에러가 해결되었습니다. 이제 시스템이 정상적으로 작동합니다!
