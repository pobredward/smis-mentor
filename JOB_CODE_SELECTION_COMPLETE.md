# 🎯 기수 선택 기능 추가 완료!

## ✅ 추가된 기능

### 1. **jobCodesService** (`services/jobCodesService.ts`)
```typescript
// 사용자의 jobExperiences에 해당하는 jobCodes 조회
getJobCodesByIds(jobCodeIds: string[]): Promise<JobCode[]>

// 사용자의 activeJobExperienceId 업데이트
updateUserActiveJobCode(userId: string, jobCodeId: string): Promise<void>
```

### 2. **AuthContext 업데이트**
```typescript
// updateActiveJobCode 함수 추가
updateActiveJobCode: (jobCodeId: string) => Promise<void>
```

### 3. **ProfileScreen 기수 선택 UI**
- 사용자의 모든 jobExperiences 표시
- 카드 형태로 기수 정보 표시 (코드, 기수명, 장소 등)
- 현재 활성 기수에 "활성" 배지 표시
- 클릭하여 기수 변경 가능

---

## 🔄 사용자 플로우

```
1. 마이페이지 진입
   ↓
2. "내 기수" 섹션에서 기수 카드 확인
   (예: E27, S26, S28 등)
   ↓
3. 원하는 기수 카드 클릭
   ↓
4. activeJobExperienceId 업데이트 (Firestore)
   ↓
5. Context 자동 새로고침
   ↓
6. 캠프 탭 자동 업데이트
   (해당 기수의 교육/시간표/인솔표 링크 표시)
```

---

## 📱 UI 상세

### **기수 카드 디자인**

#### 비활성 상태:
```
┌──────────────────────┐
│  E27              │
│  27기             │
│  겨울 영어캠프    │
│  📍 제주 원성도  │
└──────────────────────┘
```

#### 활성 상태 (파란색 강조):
```
┌──────────────────────┐
│  E27      [활성]    │  ← 파란 배지
│  27기             │  ← 파란색 텍스트
│  겨울 영어캠프    │
│  📍 제주 원성도  │
└──────────────────────┘
```

---

## 🎯 관리자 워크플로우

### **S26 기수 자료 관리:**
1. 마이페이지 > **S26 카드 클릭**
2. "기수가 변경되었습니다" 알림 확인
3. 캠프 탭 이동
4. S26의 교육/시간표/인솔표 확인
5. **+ 버튼**으로 S26 링크 추가/삭제

### **E27 기수 자료 관리:**
1. 마이페이지 > **E27 카드 클릭**
2. 캠프 탭 이동
3. E27의 자료 관리

---

## 🔧 데이터 흐름

### **초기 로드:**
```typescript
사용자 로그인
  ↓
User.jobExperiences 확인 (예: ["id1", "id2", "id3"])
  ↓
jobCodesService.getJobCodesByIds() 호출
  ↓
Firestore: jobCodes 컬렉션에서 해당 문서들 조회
  ↓
ProfileScreen에 카드 표시
```

### **기수 변경:**
```typescript
기수 카드 클릭
  ↓
jobCodesService.updateUserActiveJobCode(userId, jobCodeId)
  ↓
Firestore: users/{userId} 업데이트
  { activeJobExperienceId: "새 jobCodeId" }
  ↓
AuthContext.refreshUserData() 호출
  ↓
WebViewCacheContext 자동 리로드
  ↓
캠프 탭 화면 자동 업데이트
```

---

## 📊 Firestore 데이터 구조

### **users 컬렉션:**
```json
{
  "userId": "user123",
  "name": "홍길동",
  "role": "admin",
  "jobExperiences": [
    "OWEDDXiynrqgB2fPrgEC",  // E27
    "abc123",                 // S26
    "def456"                  // S28
  ],
  "activeJobExperienceId": "OWEDDXiynrqgB2fPrgEC"  // 현재 선택된 기수
}
```

### **jobCodes 컬렉션:**
```json
{
  "id": "OWEDDXiynrqgB2fPrgEC",
  "code": "E27",
  "generation": "27기",
  "name": "겨울 영어캠프",
  "location": "제주 원성도",
  "korea": true
}
```

### **generationResources 컬렉션:**
```json
{
  "jobCodeId": "OWEDDXiynrqgB2fPrgEC",  // jobCodes 문서 ID와 동일
  "generation": "27기",
  "code": "E27",
  "educationLinks": [...],
  "scheduleLinks": [...],
  "guideLinks": [...]
}
```

---

## ✨ 핵심 개선 사항

### **Before (문제점):**
- ❌ 관리자가 여러 기수를 관리할 때 어떤 기수에 링크를 추가하는지 불명확
- ❌ activeJobExperienceId가 자동으로 설정되어 선택 불가
- ❌ 기수 전환을 위해 Firebase Console 접속 필요

### **After (개선):**
- ✅ 마이페이지에서 직관적인 카드 UI로 기수 선택
- ✅ 클릭 한 번으로 기수 전환
- ✅ 캠프 탭 자동 업데이트
- ✅ 관리자는 선택한 기수의 링크만 관리 가능

---

## 🚀 테스트 시나리오

### **시나리오 1: 일반 사용자 (1개 기수)**
```
1. 마이페이지 접속
2. "내 기수" 섹션에 E27 카드 1개 표시
3. E27 카드에 "활성" 배지 표시
4. 캠프 탭에서 E27 자료 확인
```

### **시나리오 2: 관리자 (여러 기수)**
```
1. 마이페이지 접속
2. "내 기수" 섹션에 E27, S26, S28 카드 표시
3. 현재 E27이 활성화됨
4. S26 카드 클릭
5. "기수가 변경되었습니다" 알림
6. 캠프 탭 이동
7. S26의 교육/시간표/인솔표 확인
8. + 버튼으로 S26 링크 추가
9. 마이페이지로 돌아가 E27 선택
10. 캠프 탭에서 E27 자료 확인
```

### **시나리오 3: 링크 추가 (관리자)**
```
1. 마이페이지에서 E27 선택
2. 캠프 탭 > 교육 탭
3. + 버튼 클릭
4. "28기 교육일정" 제목, 노션 URL 입력
5. 추가 버튼 클릭
6. → E27 generationResources의 educationLinks에 추가됨
7. E27 기수 사용자들에게 즉시 반영
```

---

## 📝 주의사항

1. **jobCodes 문서 ID = generationResources 문서 ID**
   - 일관성 유지 필수
   - 예: E27의 jobCode ID가 "abc123"이면, generationResources 문서 ID도 "abc123"

2. **jobExperiences 배열 관리**
   - 신규 기수 참여 시 Firebase Functions 또는 관리자가 수동으로 추가
   - 예: `jobExperiences.push("새jobCodeId")`

3. **초기 activeJobExperienceId 설정**
   - 신규 사용자는 첫 번째 jobExperience가 기본값
   - 또는 가장 최근 기수를 기본값으로 설정

---

## 🎊 완성!

이제 관리자는:
1. 마이페이지에서 **기수 선택**
2. 캠프 탭에서 **해당 기수의 링크 관리**
3. 다른 기수로 전환하여 **각 기수별 자료 독립 관리**

모든 기능이 완벽하게 작동합니다! 🚀
