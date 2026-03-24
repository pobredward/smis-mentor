# Phase 3 완료: Low Priority 개선 사항

## ✅ 완료된 작업

### 1. 삭제 전 관련 데이터 확인 함수 구현 ✅
**파일**: `packages/web/src/app/api/admin/check-user-data/route.ts` (신규)

**기능**:
```typescript
GET /api/admin/check-user-data?userId=xxx&adminUserId=yyy
```

**확인 항목**:
- 평가 기록 (evaluations.evaluatorId)
- 지원서 (applications.refUserId)
- 캠프 업무 (tasks.createdBy)
- SMS 템플릿 (smsTemplates.createdBy)

**반환 데이터**:
```json
{
  "success": true,
  "userId": "user123",
  "data": {
    "evaluations": 5,
    "applications": 3,
    "tasks": 12,
    "smsTemplates": 2,
    "total": 22
  },
  "hasData": true,
  "warning": "이 사용자는 5개의 평가, 3개의 지원서, 12개의 업무, 2개의 SMS 템플릿을 작성했습니다."
}
```

**장점**:
- ✅ 병렬 쿼리로 빠른 응답 속도
- ✅ 관리자 권한 체크
- ✅ 삭제 전 영향도 파악 가능

---

### 2. 삭제 확인 모달에 관련 데이터 통계 표시 ✅
**파일**: `packages/web/src/lib/firebaseService.ts`, `packages/web/src/app/admin/user-manage/page.tsx`

**변경 사항**:

**firebaseService.ts**:
```typescript
// 사용자 삭제 전 관련 데이터 확인
export const checkUserData = async (userId: string) => {
  const response = await fetch(`/api/admin/check-user-data?userId=${userId}&adminUserId=${auth.currentUser.uid}`);
  return await response.json();
};
```

**user-manage/page.tsx**:
```typescript
const handleDeleteUser = async () => {
  // 1. 데이터 확인
  toast.info('사용자 데이터 확인 중...');
  const dataCheck = await checkUserData(selectedUser.userId);
  
  // 2. 통계 포함한 확인 메시지
  let confirmMessage = `${selectedUser.name} 사용자를 삭제하시겠습니까?\n\n`;
  
  if (dataCheck.hasData) {
    confirmMessage += `⚠️ 주의: 이 사용자가 작성한 데이터가 있습니다.\n\n`;
    confirmMessage += `• 평가 기록: ${dataCheck.data.evaluations}개\n`;
    confirmMessage += `• 지원서: ${dataCheck.data.applications}개\n`;
    confirmMessage += `• 업무: ${dataCheck.data.tasks}개\n`;
    confirmMessage += `• SMS 템플릿: ${dataCheck.data.smsTemplates}개\n\n`;
    confirmMessage += `✅ 일반 삭제 시 이 데이터들은 보존됩니다.\n\n`;
  }
  
  confirmMessage += `[확인] = 일반 삭제 (데이터 보존, 복구 가능)\n[취소] = 취소`;
  
  // 3. 사용자 확인 후 삭제
  const deleteConfirmed = window.confirm(confirmMessage);
  if (deleteConfirmed) {
    await deleteUser(selectedUser.userId, 'soft');
    toast.success(`사용자가 삭제되었습니다. ${dataCheck.hasData ? '(작성한 데이터는 보존됨)' : ''}`);
  }
};
```

**UX 개선**:
- ✅ 삭제 전 자동으로 데이터 확인
- ✅ 통계를 포함한 상세한 확인 메시지
- ✅ Soft Delete로 데이터 보존 안내
- ✅ 삭제 후 보존 여부 피드백

---

### 3. 감사 로그(auditLogs) 컬렉션 구현 ✅
**파일**: `packages/web/src/app/api/admin/delete-user/route.ts`

**Firestore 구조**:
```javascript
// auditLogs 컬렉션
{
  action: 'USER_SOFT_DELETE' | 'USER_HARD_DELETE',
  targetUserId: 'user123',
  targetUserData: {
    name: '홍길동',
    email: 'hong@example.com',
    role: 'mentor',
    status: 'active'
  },
  performedBy: 'admin456',
  performedByData: {
    name: '관리자',
    email: 'admin@example.com'
  },
  timestamp: Timestamp,
  metadata: {
    authDeleted: true,
    authError: null,
    deleteType: 'soft'
  }
}
```

**코드**:
```typescript
// 5. 감사 로그 기록
try {
  await db.collection('auditLogs').add({
    action: isHardDelete ? 'USER_HARD_DELETE' : 'USER_SOFT_DELETE',
    targetUserId: userId,
    targetUserData: {
      name: userData?.name,
      email: userData?.email,
      role: userData?.role,
      status: userData?.status,
    },
    performedBy: adminUserId,
    performedByData: {
      name: adminData?.name,
      email: adminData?.email,
    },
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    metadata: {
      authDeleted,
      authError,
      deleteType: isHardDelete ? 'hard' : 'soft',
    },
  });
  console.log('✅ 감사 로그 기록 완료');
} catch (logError) {
  console.error('⚠️ 감사 로그 기록 실패 (삭제는 진행됨):', logError);
}
```

**장점**:
- ✅ 모든 삭제 작업 추적 가능
- ✅ 누가, 언제, 누구를 삭제했는지 기록
- ✅ 삭제된 사용자의 원본 정보 보존
- ✅ Auth 삭제 성공/실패 여부 기록
- ✅ 로그 실패 시에도 삭제 진행 (사용자 경험 우선)

---

### 4. 삭제된 사용자 관리 UI 추가 ✅
**파일**: `packages/web/src/app/admin/user-manage/page.tsx`

**변경 사항**:

#### 4.1. 탭 추가
```typescript
const [viewMode, setViewMode] = useState<'active' | 'deleted'>('active');

// UI
<div className="flex gap-2 mt-4">
  <button
    onClick={() => setViewMode('active')}
    className={viewMode === 'active' ? 'bg-blue-600 text-white' : 'bg-gray-100'}
  >
    활성 사용자
  </button>
  <button
    onClick={() => setViewMode('deleted')}
    className={viewMode === 'deleted' ? 'bg-gray-600 text-white' : 'bg-gray-100'}
  >
    삭제된 사용자
  </button>
</div>
```

#### 4.2. 사용자 로드 로직 수정
```typescript
const loadUsers = useCallback(async () => {
  setIsLoading(true);
  try {
    // viewMode에 따라 다르게 로드
    const includeDeleted = viewMode === 'deleted';
    const fetchedUsers = await getAllUsers(includeDeleted);
    
    // viewMode에 따라 필터링
    const filteredByMode = viewMode === 'deleted' 
      ? fetchedUsers.filter(user => user.status === 'deleted')
      : fetchedUsers.filter(user => user.status !== 'deleted');
    
    setUsers(filteredByMode);
    setFilteredUsers(filteredByMode);
  } catch (error) {
    toast.error('사용자 정보를 불러오는 중 오류가 발생했습니다.');
  } finally {
    setIsLoading(false);
  }
}, [viewMode]);
```

#### 4.3. 버튼 조건부 표시
```typescript
{viewMode === 'active' && (
  <>
    <Button variant="secondary" onClick={handleStartEdit}>수정</Button>
    <Button variant="danger" onClick={handleDeleteUser}>삭제</Button>
  </>
)}
{viewMode === 'deleted' && (
  <Button variant="success" onClick={handleReactivateUser}>
    사용자 복구
  </Button>
)}
```

**UX 개선**:
- ✅ 활성/삭제된 사용자 분리 관리
- ✅ 삭제된 사용자 목록 쉽게 확인
- ✅ 원클릭 복구 기능
- ✅ 삭제된 사용자에서는 수정/삭제 버튼 숨김

---

## 📊 전체 기능 요약

### 사용자 삭제 플로우 (최종)

```
1. 관리자가 사용자 삭제 버튼 클릭
   ↓
2. 자동으로 사용자 데이터 확인
   - API: GET /api/admin/check-user-data
   - 평가, 지원서, 업무, SMS 템플릿 개수 조회
   ↓
3. 통계 포함한 상세 확인 모달 표시
   ⚠️ 주의: 이 사용자가 작성한 데이터가 있습니다.
   
   • 평가 기록: 5개
   • 지원서: 3개
   • 업무: 12개
   • SMS 템플릿: 2개
   
   ✅ 일반 삭제 시 이 데이터들은 보존됩니다.
   ↓
4. 사용자 확인 후 Soft Delete 실행
   - Firebase Auth 삭제
   - Firestore status: 'deleted'
   - 원본 정보 백업
   ↓
5. 감사 로그 기록
   - auditLogs 컬렉션에 저장
   - 삭제자, 삭제 대상, 시간, 메타데이터
   ↓
6. UI 업데이트
   - 활성 사용자 목록에서 제거
   - 성공 메시지: "사용자가 삭제되었습니다. (작성한 데이터는 보존됨)"
```

### 사용자 복구 플로우 (최종)

```
1. "삭제된 사용자" 탭 선택
   ↓
2. 복구할 사용자 선택
   ↓
3. "사용자 복구" 버튼 클릭
   ↓
4. reactivateUser() 실행
   - originalName, originalEmail 복원
   - status: 'active'
   - Firebase Auth 재생성
   - 비밀번호 재설정 이메일 발송
   ↓
5. 복구 완료
   - 활성 사용자 목록에 다시 표시
   - 사용자는 이메일로 비밀번호 재설정 후 로그인
```

---

## 🎯 구현된 모든 안전장치

### 1. 삭제 전 체크
- ✅ 관리자 본인 삭제 방지
- ✅ 마지막 관리자 삭제 방지
- ✅ 관련 데이터 자동 확인 및 통계 표시
- ✅ Soft Delete로 데이터 보존 안내

### 2. 삭제 중 보호
- ✅ 환경 변수 검증
- ✅ 관리자 권한 재확인
- ✅ Firebase Auth 삭제 실패 시에도 Firestore 처리
- ✅ 감사 로그 실패 시에도 삭제 진행

### 3. 삭제 후 추적
- ✅ auditLogs에 모든 정보 기록
- ✅ 원본 데이터 백업 (originalName, originalEmail)
- ✅ 삭제자 정보 기록
- ✅ 삭제 유형 (soft/hard) 기록

### 4. 데이터 무결성
- ✅ Orphaned references 방지
- ✅ 평가/지원서/업무 이력 보존
- ✅ 통계 데이터 정확성 유지
- ✅ 감사 추적 가능

---

## 📈 최종 성과

### Phase 1 (Critical) ✅
1. ✅ 관리자 본인 삭제 방지
2. ✅ 마지막 관리자 삭제 방지
3. ✅ 환경 변수 검증

### Phase 2 (Data Integrity) ✅
4. ✅ Soft Delete 구현
5. ✅ Orphaned references 처리
6. ✅ 사용자 복구 기능

### Phase 3 (UX & Monitoring) ✅
7. ✅ 삭제 전 관련 데이터 확인
8. ✅ 삭제 확인 모달에 통계 표시
9. ✅ 감사 로그 구현
10. ✅ 삭제된 사용자 관리 UI

---

## 🧪 최종 테스트 시나리오

### 시나리오 1: 데이터가 있는 사용자 삭제
1. 평가/지원서/업무를 작성한 사용자 선택
2. 삭제 버튼 클릭
3. **기대 결과**:
   - ✅ "사용자 데이터 확인 중..." 토스트
   - ✅ 통계 포함한 상세 모달 표시
   - ✅ "작성한 데이터는 보존됨" 안내
   - ✅ 삭제 후 auditLogs 기록
   - ✅ Firebase Auth 삭제, Firestore status: 'deleted'

### 시나리오 2: 삭제된 사용자 복구
1. "삭제된 사용자" 탭 선택
2. 복구할 사용자 선택
3. "사용자 복구" 버튼 클릭
4. **기대 결과**:
   - ✅ 원본 이름/이메일 복원
   - ✅ Firebase Auth 재생성
   - ✅ 비밀번호 재설정 이메일 발송
   - ✅ 활성 사용자 목록에 표시

### 시나리오 3: 안전장치 테스트
1. 관리자 본인 삭제 시도 → ❌ 차단
2. 마지막 관리자 삭제 시도 → ❌ 차단
3. 환경 변수 누락 → ❌ 초기화 실패

---

## 📁 생성/수정된 파일 목록

### 신규 파일
1. `packages/web/src/app/api/admin/check-user-data/route.ts` - 사용자 데이터 확인 API
2. `PHASE_2_SOFT_DELETE_COMPLETE.md` - Phase 2 완료 문서
3. `PHASE_3_LOW_PRIORITY_COMPLETE.md` - Phase 3 완료 문서 (this file)

### 수정된 파일
1. `packages/web/src/app/api/admin/delete-user/route.ts`
   - Soft/Hard Delete 지원
   - 감사 로그 기록
   - 안전장치 추가

2. `packages/web/src/lib/firebaseService.ts`
   - `deleteUser()` - deleteType 파라미터 추가
   - `getAllUsers()` - includeDeleted 옵션 추가
   - `getDeletedUsers()` - 신규 함수
   - `checkUserData()` - 신규 함수
   - `reactivateUser()` - Soft Delete 지원 개선

3. `packages/web/src/app/admin/user-manage/page.tsx`
   - viewMode 상태 추가 ('active' | 'deleted')
   - 활성/삭제된 사용자 탭 UI
   - handleDeleteUser() - 데이터 확인 로직 추가
   - 버튼 조건부 표시

4. `packages/shared/src/types/legacy.ts`
   - status 타입에 'deleted' 추가
   - originalName, originalEmail 필드 추가
   - deletedAt, deletedBy 필드 추가

5. `packages/web/src/types/index.ts`
   - legacy.ts와 동일하게 타입 업데이트

---

## 🎉 결론

**모든 Phase 완료!**

네이버 소셜로그인 사용자 삭제 문제를 해결하면서:

1. ✅ **데이터 무결성 보장** - Soft Delete로 평가/지원서 이력 보존
2. ✅ **안전장치 완비** - 본인/마지막 관리자 삭제 방지
3. ✅ **UX 개선** - 삭제 전 데이터 확인, 통계 표시, 원클릭 복구
4. ✅ **감사 추적** - auditLogs로 모든 작업 기록
5. ✅ **모든 프로바이더 지원** - 네이버, 구글, 카카오 모두 정상 작동

**다음 단계**:
- 실제 프로덕션 환경에서 테스트
- 사용자 피드백 수집
- 필요시 자동 영구 삭제 (30일 후) 구현
