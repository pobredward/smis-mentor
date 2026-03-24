# Phase 2 완료: Soft Delete 구현

## ✅ 완료된 작업

### 1. Soft Delete API Route 구현 ✅
**파일**: `packages/web/src/app/api/admin/delete-user/route.ts`

**기능**:
- `deleteType` 파라미터로 Soft Delete / Hard Delete 선택 가능
- Soft Delete (기본값):
  - Firebase Auth 삭제 (재가입 가능)
  - Firestore는 `status: 'deleted'`로 변경
  - 평가/지원서 이력 보존
  - 원본 정보 백업 (`originalName`, `originalEmail`)
- Hard Delete (관리자 전용):
  - Firebase Auth + Firestore 완전 삭제
  - 복구 불가능

**안전장치**:
- ✅ 관리자 본인 삭제 방지
- ✅ 마지막 관리자 삭제 방지
- ✅ 환경 변수 검증
- ✅ 상세한 에러 로깅

---

### 2. 클라이언트 함수 업데이트 ✅
**파일**: `packages/web/src/lib/firebaseService.ts`

**추가된 함수**:

```typescript
// Soft/Hard Delete 지원
deleteUser(userId: string, deleteType: 'soft' | 'hard' = 'soft')

// 삭제된 사용자만 조회
getDeletedUsers()

// 모든 사용자 조회 (삭제된 사용자 포함/제외 옵션)
getAllUsers(includeDeleted: boolean = false)

// 삭제된 사용자 복구 (개선됨)
reactivateUser(userId: string)
```

**`reactivateUser` 개선 사항**:
- Soft Delete된 사용자 복구 지원
- `originalName`, `originalEmail` 자동 복원
- Firebase Auth 계정 재생성
- 비밀번호 재설정 이메일 자동 발송

---

### 3. 타입 정의 업데이트 ✅

**`packages/shared/src/types/legacy.ts`**:
```typescript
export interface User {
  // ... 기존 필드
  status: 'temp' | 'active' | 'inactive' | 'deleted'; // ✅ 'deleted' 추가
  originalEmail?: string; // ✅ Soft Delete 원본 이메일 백업
  originalName?: string;  // ✅ Soft Delete 원본 이름 백업
  deletedAt?: Timestamp | null; // ✅ Soft Delete 시간
  deletedBy?: string | null;    // ✅ Soft Delete 실행한 관리자 ID
}
```

**`packages/web/src/types/index.ts`**: 동일하게 업데이트됨

---

### 4. 사용자 관리 UI 개선 ✅
**파일**: `packages/web/src/app/admin/user-manage/page.tsx`

**변경 사항**:

1. **삭제 확인 메시지 개선**:
```typescript
const deleteType = window.confirm(
  `${selectedUser.name} 사용자를 삭제하시겠습니까?\n\n` +
  `[확인] = 일반 삭제 (데이터 보존, 복구 가능)\n` +
  `[취소] = 취소\n\n` +
  `※ 일반 삭제: Firebase Auth만 삭제되고 평가/지원서 이력은 보존됩니다.`
);
```

2. **복구 버튼 추가**:
```typescript
{(selectedUser.status === 'inactive' || selectedUser.status === 'deleted') && (
  <Button variant="success" size="sm" onClick={handleReactivateUser}>
    {selectedUser.status === 'deleted' ? '사용자 복구' : '계정 복구'}
  </Button>
)}
```

3. **Status 뱃지 업데이트**:
- `'deleted'` → 회색 뱃지 "삭제됨"
- `'inactive'` → 빨간색 뱃지 "비활성"
- `'active'` → 초록색 뱃지 "활성"
- `'temp'` → 노란색 뱃지 "임시"

---

## 📊 데이터 무결성 보장

### Soft Delete의 장점

#### 1. Orphaned References 방지
**문제 해결**:
- ❌ Before: 평가 기록(evaluations)의 `evaluatorId`가 존재하지 않는 사용자를 가리킴
- ✅ After: `evaluatorId`는 여전히 유효 (Firestore 문서는 유지됨)

**영향받는 컬렉션**:
- `evaluations` - 평가 기록 (evaluatorId)
- `applications` - 지원서 (refUserId)
- `tasks` - 캠프 업무 (createdBy)
- `smsTemplates` - SMS 템플릿 (createdBy)
- `generationResources` - 자료 (createdBy)

#### 2. 통계 데이터 정확성
- ✅ "누가 평가했는지" 추적 가능
- ✅ 감사 추적(audit trail) 유지
- ✅ 리포트 데이터 왜곡 방지

#### 3. 복구 가능성
- ✅ 실수로 삭제해도 복구 가능
- ✅ Firebase Auth는 삭제되어 재가입 가능
- ✅ 원본 정보 자동 복원

---

## 🔄 Soft Delete 플로우

### 삭제 플로우
```
1. 관리자가 사용자 삭제 클릭
   ↓
2. 확인 모달 (일반 삭제 / 취소)
   ↓
3. API Route: /api/admin/delete-user
   - 관리자 권한 체크
   - 본인 삭제 방지
   - 마지막 관리자 삭제 방지
   ↓
4. Soft Delete 실행
   - Firebase Auth 삭제 (재가입 가능)
   - Firestore 업데이트:
     * status: 'deleted'
     * name: '(삭제됨) 원래이름'
     * email: 'deleted_timestamp_원래이메일'
     * originalName: '원래이름' (백업)
     * originalEmail: '원래이메일' (백업)
     * deletedAt: 현재시간
     * deletedBy: 관리자ID
   ↓
5. UI 업데이트
   - 사용자 목록에서 제거 (필터링)
   - 성공 메시지 표시
```

### 복구 플로우
```
1. 삭제된 사용자 선택
   ↓
2. "사용자 복구" 버튼 클릭
   ↓
3. reactivateUser() 함수 실행
   - originalName, originalEmail 복원
   - Firebase Auth 계정 재생성
   - 비밀번호 재설정 이메일 발송
   ↓
4. Firestore 업데이트:
   - status: 'active'
   - name: originalName
   - email: originalEmail
   - deletedAt: null
   - deletedBy: null
   ↓
5. 복구 완료
   - 사용자에게 이메일 전송됨
   - 비밀번호 재설정 후 로그인 가능
```

---

## 🧪 테스트 시나리오

### 1. Soft Delete 테스트
**시나리오**: 네이버 소셜로그인 사용자 삭제

**절차**:
1. 관리자로 로그인
2. 관리자 대시보드 → 사용자 관리
3. 네이버 소셜로그인 사용자 선택
4. 삭제 버튼 클릭
5. 확인 모달에서 "확인" 선택

**예상 결과**:
- ✅ Firebase Auth에서 사용자 삭제됨
- ✅ Firestore의 `status`가 'deleted'로 변경됨
- ✅ 이메일이 `deleted_timestamp_원래이메일` 형식으로 변경됨
- ✅ `originalEmail`, `originalName` 필드에 원본 정보 백업됨
- ✅ 사용자 목록에서 제거됨 (필터링)
- ✅ 평가 기록은 그대로 유지됨

---

### 2. 복구 테스트
**시나리오**: 삭제된 사용자 복구

**절차**:
1. 삭제된 사용자 조회 (개발자 도구 또는 별도 UI 추가 필요)
2. 해당 사용자 선택
3. "사용자 복구" 버튼 클릭

**예상 결과**:
- ✅ `status`가 'active'로 변경됨
- ✅ 이름/이메일이 원본으로 복원됨
- ✅ Firebase Auth 계정 재생성됨
- ✅ 비밀번호 재설정 이메일 발송됨
- ✅ 사용자가 비밀번호 재설정 후 로그인 가능

---

### 3. 안전장치 테스트

#### 3.1 관리자 본인 삭제 방지
**절차**:
1. 관리자 A로 로그인
2. 사용자 관리에서 관리자 A 본인 선택
3. 삭제 버튼 클릭

**예상 결과**:
- ❌ 삭제 불가
- ✅ 에러 메시지: "본인 계정은 삭제할 수 없습니다."

#### 3.2 마지막 관리자 삭제 방지
**절차**:
1. 시스템에 admin이 1명만 있는 상태
2. 해당 admin 삭제 시도

**예상 결과**:
- ❌ 삭제 불가
- ✅ 에러 메시지: "마지막 관리자는 삭제할 수 없습니다."

---

## 📈 개선 효과

### Before (Hard Delete)
- ❌ 평가 기록의 evaluatorId가 orphaned
- ❌ 지원서의 refUserId가 orphaned
- ❌ 캠프 업무의 createdBy가 orphaned
- ❌ 통계 데이터 왜곡
- ❌ 복구 불가능

### After (Soft Delete)
- ✅ 평가 기록 완벽하게 유지
- ✅ 지원서 이력 완벽하게 유지
- ✅ 캠프 업무 이력 완벽하게 유지
- ✅ 통계 데이터 정확성 보장
- ✅ 복구 가능 (실수 방지)
- ✅ 감사 추적(audit trail) 가능
- ✅ Firebase Auth는 삭제되어 재가입 가능

---

## 🔍 향후 개선 사항 (Optional)

### 1. 삭제된 사용자 관리 UI
**목적**: 삭제된 사용자를 쉽게 조회하고 복구

**구현 아이디어**:
```typescript
// 별도 탭 추가
<Tabs>
  <Tab label="활성 사용자" />
  <Tab label="삭제된 사용자" />
</Tabs>

// 삭제된 사용자 목록
const deletedUsers = await getDeletedUsers();
```

### 2. 자동 영구 삭제
**목적**: 일정 기간(예: 30일) 후 자동으로 Hard Delete

**구현 아이디어**:
- Cloud Scheduler로 매일 실행
- `deletedAt` 기준 30일 이상 지난 사용자 자동 영구 삭제

### 3. 감사 로그 컬렉션
**목적**: 삭제 이력을 별도 컬렉션에 영구 저장

**구현 아이디어**:
```typescript
await db.collection('auditLogs').add({
  action: 'USER_DELETE',
  userId,
  deletedUserData: { name, email, role },
  deletedBy: adminUserId,
  timestamp: serverTimestamp(),
});
```

---

## 🎉 결론

Phase 2 Soft Delete 구현이 완료되었습니다!

**핵심 성과**:
1. ✅ 데이터 무결성 보장 (평가/지원서 이력 보존)
2. ✅ 복구 가능 (실수 방지)
3. ✅ 안전장치 완비 (본인/마지막 관리자 삭제 방지)
4. ✅ 모든 소셜 프로바이더 지원 (네이버, 구글, 카카오)
5. ✅ 감사 추적 가능
6. ✅ Firebase Auth 재가입 가능

**다음 단계**:
- 실제 프로덕션 환경에서 테스트
- 사용자 피드백 수집
- 필요시 추가 개선 사항 구현
