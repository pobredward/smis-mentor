# 지원장소 변경 기능 - 완전 구현

## ✅ 구현 완료된 플랫폼

### 웹 (Next.js)
**위치**: `packages/web/src/app/admin/job-board-manage/applicants/[id]/ApplicantsManageClient.tsx`

**기능**:
- 지원자 상세 페이지에 "지원장소 관리" 섹션 추가
- 현재 지원장소 표시
- "지원장소 변경" 버튼으로 모달 열기
- 모든 채용 공고 목록에서 선택
- 확인 대화상자로 실수 방지
- 변경 완료 후 업데이트된 평가 수 표시

### 모바일 (React Native + Expo)
**위치**: `packages/mobile/src/screens/ApplicantDetailScreen.tsx`

**기능**:
- 웹과 동일한 UI/UX
- Native 모달로 지원장소 변경
- Alert API로 확인 대화상자
- 변경 완료 후 자동으로 이전 페이지로 이동

## 📦 백엔드 구현

### API 엔드포인트
**위치**: `packages/web/src/app/api/admin/change-job-board/route.ts`

**기능**:
- Firebase Admin SDK 사용
- authMiddleware로 관리자 권한 검증
- applicationHistories + evaluations 일괄 업데이트
- Batch Write로 성능 최적화
- 감사 로그 자동 기록
- 통계 자동 재계산 (백그라운드)

### 서비스 함수

**웹**: 기존 Shared 함수 사용 (Client SDK)
- `packages/shared/src/services/jobBoard/index.ts`
- `changeApplicationJobBoard()`
- `recalculateJobBoardStats()`

**모바일**: API Client 추가
- `packages/mobile/src/services/apiClient.ts` (새로 생성)
- `packages/mobile/src/services/recruitmentService.ts`
- `changeApplicationJobBoard()` - API 호출

## 🎯 데이터 흐름

### 1. 클라이언트 → API
```typescript
// 웹/모바일 모두 동일
const result = await changeApplicationJobBoard(applicationId, newJobBoardId);
// 또는 (모바일 내부)
const result = await authenticatedPost('/api/admin/change-job-board', {
  applicationId,
  newJobBoardId,
});
```

### 2. API → Firestore
```typescript
// 1. applicationHistories 업데이트
await db.collection('applicationHistories').doc(applicationId).update({
  refJobBoardId: newJobBoardId,
  updatedAt: serverTimestamp(),
});

// 2. evaluations 일괄 업데이트 (Batch)
const batch = db.batch();
evaluationsSnapshot.docs.forEach(doc => {
  batch.update(doc.ref, {
    refJobBoardId: newJobBoardId,
    updatedAt: serverTimestamp(),
  });
});
await batch.commit();
```

### 3. 부가 작업 (백그라운드)
- 이전/새 JobBoard의 통계 재계산
- 감사 로그 기록
- 실패해도 메인 작업은 성공

## 📱 UI/UX

### 웹 화면 구성
```
┌─────────────────────────────────────┐
│ 직무 경험 추가 섹션                 │
├─────────────────────────────────────┤
│ 지원장소 관리          [변경 버튼]   │
│ ┌─────────────────────────────────┐ │
│ │ 현재 지원장소: 2026겨울 A코드    │ │
│ │ 2026겨울 | A코드                 │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ 평가 점수 현황                       │
└─────────────────────────────────────┘
```

### 모달 구성
```
┌─────────────────────────────────────┐
│ 지원장소 변경                    [X] │
├─────────────────────────────────────┤
│ 📋 현재 정보                        │
│   지원자: 홍길동                     │
│   현재: 2026겨울 A코드               │
│                                     │
│ 📝 변경할 채용 공고 선택             │
│   □ 2026여름 B코드 (모집중)          │
│   ☑ 2026겨울 C코드 (마감)            │
│   □ 2025겨울 D코드 (마감)            │
│                                     │
│ ⚠️ 주의사항                         │
│   • 평가 데이터도 함께 업데이트      │
│   • 되돌릴 수 없음                   │
├─────────────────────────────────────┤
│       [취소]      [변경하기]         │
└─────────────────────────────────────┘
```

## 🔐 보안 및 권한

- ✅ 관리자만 접근 가능 (requireAdmin)
- ✅ Firebase ID Token 검증
- ✅ 서버 사이드 검증 (클라이언트 우회 불가)
- ✅ 감사 로그 자동 기록

## 📊 자동 업데이트되는 데이터

1. **applicationHistories**
   - `refJobBoardId`: 새 공고 ID
   - `updatedAt`: 현재 시간

2. **evaluations** (해당 지원서의 모든 평가)
   - `refJobBoardId`: 새 공고 ID
   - `updatedAt`: 현재 시간

3. **auditLogs** (자동 생성)
   - action: 'APPLICATION_JOB_BOARD_CHANGE'
   - 이전/새 공고 정보
   - 수행 관리자 정보
   - 업데이트된 문서 수

4. **통계** (백그라운드)
   - 이전 JobBoard 통계
   - 새 JobBoard 통계

## 🎉 완성도

| 항목 | 웹 | 모바일 | 설명 |
|-----|-----|--------|------|
| UI | ✅ | ✅ | 직관적인 변경 UI |
| API | ✅ | ✅ | 동일한 API 사용 |
| 인증 | ✅ | ✅ | 관리자 권한 검증 |
| 감사 로그 | ✅ | ✅ | 자동 기록 |
| 통계 갱신 | ✅ | ✅ | 백그라운드 처리 |
| 에러 처리 | ✅ | ✅ | 사용자 친화적 |
| 확인 대화상자 | ✅ | ✅ | 실수 방지 |

## 🚀 사용 방법

### 웹
1. 관리자 대시보드 > 지원 유저 관리
2. 캠프별 지원자 관리 > 특정 공고 선택
3. 지원자 선택
4. 우측 패널에서 "지원장소 관리" 섹션 찾기
5. "지원장소 변경" 버튼 클릭
6. 모달에서 새 공고 선택
7. "변경하기" 클릭 → 확인

### 모바일
1. 관리자 탭 > 지원 유저 관리
2. 캠프별 지원자 관리 > 특정 공고 선택
3. 지원자 선택
4. "지원장소 관리" 섹션에서 "지원장소 변경" 버튼 탭
5. 모달에서 새 공고 선택
6. "변경하기" 탭 → Alert 확인
7. 자동으로 이전 화면으로 이동

## 📝 테스트 체크리스트

- [ ] 웹에서 지원장소 변경
- [ ] 모바일에서 지원장소 변경
- [ ] evaluations refJobBoardId 확인
- [ ] 감사 로그 생성 확인
- [ ] 통계 재계산 확인
- [ ] 비관리자 접근 차단 확인
- [ ] 동일 공고 변경 방지 확인
- [ ] 존재하지 않는 공고 선택 방지 확인

## 🎯 향후 개선 사항

문서의 "추가 고려사항" 섹션 참조:
- 감사 로그 조회 UI
- 통계 대시보드
- 알림 시스템
- 롤백 기능
- 일괄 변경 기능
