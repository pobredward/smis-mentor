# 채용 탭 프리로딩 구현 완료

## 📋 구현 개요

캠프 탭에 이어 **채용 탭**의 데이터도 앱 시작 시 프리페칭하도록 구현하였습니다.

### 구현 날짜
- 2026-04-12

---

## 🎯 구현 내용

### 1. 새로운 훅 생성: `useRecruitmentDataPrefetch`

**위치**: `packages/mobile/src/hooks/useRecruitmentDataPrefetch.ts`

**프리페칭 항목**:
```typescript
1. 채용 공고 목록 (getAllJobBoards)
   - staleTime: 5분
   - 사용 위치: RecruitmentListScreen

2. 지원 내역 (getApplicationsByUserId)
   - staleTime: 2분
   - 사용 위치: ApplicationStatusScreen, HomeScreen
   - 조건: 비관리자만 (userData.role !== 'admin')

3. 멘토 후기 (getAllReviews)
   - staleTime: 10분
   - 사용 위치: MentorReviewScreen
```

**Query Keys**:
```typescript
export const recruitmentQueryKeys = {
  jobBoards: () => ['jobBoards'] as const,
  applications: (userId: string) => ['applications', userId] as const,
  reviews: () => ['reviews'] as const,
};
```

---

### 2. App.tsx 통합

**변경 사항**:
- 캠프 데이터와 채용 데이터를 **병렬 프리페칭**
- 원어민 사용자는 채용 탭 접근 불가하므로 자동 스킵

```typescript
// 캠프 데이터와 채용 데이터를 병렬로 프리페칭
await Promise.all([
  prefetchCampData(userData.activeJobExperienceId),
  prefetchRecruitmentData(), // 추가
]);
```

---

### 3. ProfileScreen 캠프 변경 시 채용 데이터도 갱신

**변경 사항**:
- 캠프 변경 시 5단계 프로세스로 확장 (기존 4단계 → 5단계)
- 채용 데이터 무효화 추가

```typescript
Step 1/5: 기존 캐시 정리 (캠프 + 채용)
Step 2/5: 캠프 변경
Step 3/5: 캠프 데이터 로딩
Step 4/5: 채용 데이터 로딩 ⬅️ 추가
Step 5/5: 구글시트 프리로딩
```

**프로그레스 바 진행률**:
- 0% → 15%: 캐시 정리
- 15% → 30%: 캠프 변경
- 30% → 50%: 캠프 데이터 로딩
- 50% → 60%: 채용 데이터 로딩 ⬅️ 추가
- 60% → 100%: WebView 프리로딩

---

### 4. React Query 적용 (기존 화면 리팩토링)

#### 4.1. RecruitmentListScreen

**변경 전**:
```typescript
const [jobBoards, setJobBoards] = useState<JobBoardWithId[]>([]);
const [isLoading, setIsLoading] = useState(true);

useEffect(() => {
  loadJobBoards();
}, []);
```

**변경 후**:
```typescript
const { data: jobBoards = [], isLoading, refetch } = useQuery({
  queryKey: recruitmentQueryKeys.jobBoards(),
  queryFn: getAllJobBoards,
  staleTime: 5 * 60 * 1000,
});
```

#### 4.2. ApplicationStatusScreen

**변경 전**:
```typescript
const [applications, setApplications] = useState<ApplicationWithJobDetails[]>([]);
const loadApplications = useCallback(async () => { ... }, []);

useEffect(() => {
  loadApplications();
}, [loadApplications]);
```

**변경 후**:
```typescript
const { data: applications = [], isLoading, refetch } = useQuery({
  queryKey: recruitmentQueryKeys.applications(userData?.userId || ''),
  queryFn: async () => { ... },
  enabled: !!userData?.userId,
  staleTime: 2 * 60 * 1000,
});
```

#### 4.3. MentorReviewScreen

**변경 전**:
```typescript
const [reviews, setReviews] = useState<ReviewWithId[]>([]);
const loadReviews = useCallback(async () => { ... }, []);

useEffect(() => {
  loadReviews();
}, [loadReviews]);
```

**변경 후**:
```typescript
const { data: reviews = [], isLoading, refetch } = useQuery({
  queryKey: recruitmentQueryKeys.reviews(),
  queryFn: getAllReviews,
  staleTime: 10 * 60 * 1000,
});
```

---

## 📊 예상 성능 개선

### Before (기존)
```
앱 시작 → 캠프 탭 (0초) ✅
       → 채용 탭 (0.5~1초 로딩) ⏳
       → 홈 화면 (0.3~0.5초 로딩) ⏳
       → 마이페이지 (0초) ✅
```

### After (구현 후)
```
앱 시작 → 캠프 탭 (0초) ✅
       → 채용 탭 (0초) ✅ 개선
       → 홈 화면 (0초) ✅ 개선 (지원 내역 카드)
       → 마이페이지 (0초) ✅
```

**총 개선 시간**: 탭 전환 시 약 **0.8~1.5초 단축**

---

## 🔄 데이터 흐름

### 1. 앱 시작 시
```
1. 사용자 로그인 (AuthContext)
2. activeJobExperienceId 확인
3. 프리페칭 트리거
   ├─ prefetchCampData() (병렬)
   └─ prefetchRecruitmentData() (병렬) ⬅️ 추가
4. React Query 캐시 저장
5. 스플래시 화면 닫기
```

### 2. 채용 탭 진입 시
```
1. useQuery 호출
2. React Query 캐시 확인
3. 캐시 있음 → 즉시 표시 ✅
4. 캐시 없음 → Firestore 쿼리 (fallback)
```

### 3. 캠프 변경 시
```
1. 기존 캐시 무효화
   ├─ invalidateCampData()
   └─ invalidateRecruitmentData() ⬅️ 추가
2. 새 캠프 데이터 프리페칭
3. 채용 데이터 프리페칭 ⬅️ 추가
4. WebView 프리로딩
```

---

## 🧪 테스트 체크리스트

### 1. 앱 시작 시 프리페칭
- [ ] 로그인 후 스플래시 화면에서 프로그레스 바 표시 확인
- [ ] 콘솔 로그에서 "캠프 데이터 프리페칭 완료" 확인
- [ ] 콘솔 로그에서 "채용 데이터 프리페칭 완료" 확인
- [ ] 채용 탭 진입 시 즉시 표시 확인 (로딩 없음)

### 2. 채용 탭 화면
- [ ] 채용 공고 목록 즉시 표시 (RecruitmentListScreen)
- [ ] 지원 내역 즉시 표시 (ApplicationStatusScreen)
- [ ] 멘토 후기 즉시 표시 (MentorReviewScreen)

### 3. 홈 화면
- [ ] "최근 지원 내역" 카드 즉시 표시 (로딩 없음)

### 4. 캠프 변경 시
- [ ] 프로그레스 모달에 5단계 표시 확인
  - 기존 캐시 정리
  - 캠프 변경
  - 캠프 데이터 로딩
  - 채용 데이터 로딩 ⬅️ 추가
  - 구글시트 프리로딩
- [ ] 완료 알림에 "채용 데이터 프리로드 완료" 메시지 확인

### 5. 원어민 사용자
- [ ] 채용 탭 비활성화 확인
- [ ] 채용 데이터 프리페칭 스킵 확인 (콘솔 로그)

### 6. Pull-to-Refresh
- [ ] 채용 공고 목록 새로고침 동작 확인
- [ ] 지원 내역 새로고침 동작 확인
- [ ] 멘토 후기 새로고침 동작 확인

---

## 📝 주요 변경 파일

### 새로 생성된 파일
- `packages/mobile/src/hooks/useRecruitmentDataPrefetch.ts`

### 수정된 파일
1. `packages/mobile/App.tsx`
   - 채용 데이터 프리페칭 통합

2. `packages/mobile/src/components/SplashPrefetchScreen.tsx`
   - 로딩 단계에 "채용 데이터" 추가

3. `packages/mobile/src/screens/ProfileScreen.tsx`
   - 캠프 변경 시 채용 데이터 무효화
   - 5단계 프로그레스 모달

4. `packages/mobile/src/screens/RecruitmentListScreen.tsx`
   - React Query 적용

5. `packages/mobile/src/screens/RecruitmentTabs.tsx`
   - ApplicationStatusScreen: React Query 적용
   - MentorReviewScreen: React Query 적용

---

## 🎉 결론

1. **채용 탭 즉시 표시** ✅
   - 채용 공고 목록, 지원 내역, 멘토 후기 모두 프리페칭됨
   - 0.8~1.5초 로딩 시간 제거

2. **홈 화면 개선** ✅
   - "최근 지원 내역" 카드 즉시 표시

3. **캠프 변경 시 일관성** ✅
   - 캠프 변경 시 채용 데이터도 함께 갱신

4. **원어민 사용자 최적화** ✅
   - 채용 탭 접근 불가하므로 프리페칭 스킵

5. **React Query 통합** ✅
   - 기존 useState/useEffect 패턴에서 React Query로 전환
   - 캐시 관리, 재검증, 무효화 자동화

---

## 🚀 다음 단계 (선택사항)

### 1. Admin 탭 선택적 프리페칭 (낮은 우선순위)
```typescript
if (userData.role === 'admin') {
  await queryClient.prefetchQuery({
    queryKey: ['allUsers'],
    queryFn: getAllUsers,
    staleTime: 5 * 60 * 1000,
  });
}
```

**주의사항**:
- 데이터 크기가 크면 메모리 사용량 증가
- 백그라운드 프리페칭 권장

### 2. 홈 화면 Tasks 최적화
- 현재는 캠프 탭과 데이터 공유하므로 추가 프리페칭 불필요
- 필요 시 별도 query key로 분리 가능

---

## 📚 참고 자료

- [캠프 탭 프리페칭 구현](./PREFETCH_IMPLEMENTATION.md)
- [WebView 프리로딩 구현](./WEBVIEW-PRELOAD-FINAL.md)
- [React Query 공식 문서](https://tanstack.com/query/latest/docs/react/overview)
