# 사용자 본인 탈퇴 엣지 케이스 분석

## 📋 현재 구현 상태

### 웹 (packages/web/src/lib/firebaseService.ts)
```typescript
export const deactivateUser = async (userId: string) => {
  const userRef = doc(db, 'users', userId);
  const userData = userDoc.data() as User;
  
  // Firestore 업데이트
  await updateDoc(userRef, {
    status: 'inactive',
    name: `(탈퇴)${userData.name}`,
    originalEmail: userData.email,
    updatedAt: now
  });
  
  // Firebase Auth 삭제
  if (auth.currentUser && auth.currentUser.email === userData.email) {
    await deleteAuthUser(auth.currentUser);
  }
  
  return true;
};
```

### 모바일 (packages/mobile)
- `deactivateUser` 공통 함수 사용
- 프로필 화면에서 탈퇴 버튼 제공

### 호출 경로
```
웹: /profile → handleDeactivateAccount() → deactivateUser()
모바일: ProfileScreen → handleDeactivateAccount() → deactivateUser()
```

---

## 🚨 엣지 케이스 분석

### 1. 인증 관련 엣지 케이스

#### 1.1 여러 소셜 계정이 연동된 사용자의 탈퇴
**상황**: 구글 + 네이버 + 카카오 모두 연동된 사용자가 탈퇴

**현재 동작**:
```typescript
if (auth.currentUser && auth.currentUser.email === userData.email) {
  await deleteAuthUser(auth.currentUser);
}
```

**문제점**:
- ✅ Firebase Auth UID 기준으로 삭제되므로 모든 연동 프로바이더 함께 삭제됨
- ✅ 문제 없음

---

#### 1.2 소셜 로그인 사용자의 탈퇴
**상황**: 네이버 소셜로그인으로 가입한 사용자가 탈퇴

**현재 동작**:
- Firebase Auth 삭제: ✅ 정상
- Firestore status: 'inactive'로 변경
- 이메일 백업: `originalEmail` 저장

**문제점**:
- ✅ 정상 작동
- ✅ 관리자 삭제(Soft Delete)와 동일한 효과

**차이점**:
```typescript
// 관리자 삭제 (Soft Delete)
status: 'deleted'
name: `(삭제됨) ${userData.name}`
email: `deleted_${Date.now()}_${originalEmail}`
deletedAt: Timestamp
deletedBy: adminUserId

// 사용자 탈퇴 (Deactivate)
status: 'inactive'
name: `(탈퇴)${userData.name}`
email: 원본 이메일 유지
originalEmail: 백업
// deletedAt, deletedBy 없음
```

---

#### 1.3 탈퇴 중 세션 만료
**상황**: 탈퇴 처리 중 Firebase Auth 세션이 만료됨

**현재 동작**:
```typescript
if (auth.currentUser && auth.currentUser.email === userData.email) {
  await deleteAuthUser(auth.currentUser);
}
```

**문제점**:
- ❌ `auth.currentUser`가 null이면 Firebase Auth 삭제 건너뜀
- ❌ Firestore는 'inactive'로 변경되지만 Auth는 남음
- ❌ 사용자가 다시 로그인 가능 (혼란 발생)

**개선 방안**:
```typescript
// 세션 확인 후 재인증 요청
if (!auth.currentUser) {
  throw new Error('세션이 만료되었습니다. 다시 로그인 후 시도해주세요.');
}

// 또는 재인증 강제
await reauthenticateWithCredential(auth.currentUser, credential);
```

---

#### 1.4 탈퇴 후 즉시 재가입 시도
**상황**: 탈퇴 직후 동일 이메일로 재가입 시도

**현재 동작**:
1. 탈퇴: Firebase Auth 삭제, Firestore status: 'inactive'
2. 재가입: 새 Firebase Auth 계정 생성

**문제점**:
- ⚠️ Firestore에 이미 'inactive' 상태의 문서 존재
- ⚠️ 회원가입 로직이 기존 문서를 확인하지 않으면 충돌 발생
- ⚠️ `(탈퇴)` 접두사가 붙은 이름 그대로 유지

**개선 방안**:
```typescript
// 회원가입 시 inactive 사용자 확인
const existingUser = await getUserByEmail(email);

if (existingUser && existingUser.status === 'inactive') {
  // 옵션 1: 재활성화 안내
  throw new Error('탈퇴한 계정입니다. 계정 복구를 원하시면 관리자에게 문의하세요.');
  
  // 옵션 2: 자동 재활성화
  await reactivateUser(existingUser.userId);
  
  // 옵션 3: 완전히 새 계정 생성 (기존 문서 덮어쓰기)
  await updateDoc(userRef, {
    status: 'active',
    name: newName, // (탈퇴) 제거
    ...newUserData
  });
}
```

---

### 2. 데이터 무결성 관련 엣지 케이스

#### 2.1 탈퇴한 사용자의 평가 기록
**상황**: 평가를 작성한 사용자가 탈퇴

**현재 동작**:
- Firestore 문서 유지 (status: 'inactive')
- 평가 기록의 `evaluatorId`는 여전히 유효

**문제점**:
- ✅ Orphaned reference 없음 (문서 유지)
- ⚠️ 하지만 사용자 이름이 `(탈퇴)홍길동`으로 표시됨
- ⚠️ UI에서 탈퇴한 사용자를 어떻게 표시할지 불명확

**개선 방안**:
```typescript
// 평가 조회 시 status 확인
const evaluator = await getUserById(evaluation.evaluatorId);

if (evaluator.status === 'inactive') {
  // 옵션 1: "(탈퇴)" 제거하고 표시
  evaluatorName = evaluator.name.replace(/^\(탈퇴\)/, '') + ' (탈퇴함)';
  
  // 옵션 2: 익명화
  evaluatorName = '(탈퇴한 사용자)';
  
  // 옵션 3: 그대로 표시
  evaluatorName = evaluator.name; // "(탈퇴)홍길동"
}
```

---

#### 2.2 탈퇴한 사용자의 지원서
**상황**: 채용 공고에 지원한 사용자가 탈퇴

**현재 동작**:
- applications 컬렉션의 `refUserId`는 여전히 유효
- Firestore 문서 유지

**문제점**:
- ⚠️ 지원서 목록에서 `(탈퇴)홍길동` 표시
- ⚠️ 관리자가 탈퇴한 사용자의 지원서를 어떻게 처리해야 할지 불명확

**개선 방안**:
```typescript
// 지원서 목록 필터링 옵션 추가
const applications = await getApplications();
const activeApplications = applications.filter(app => {
  const user = await getUserById(app.refUserId);
  return user.status === 'active';
});

// 또는 탈퇴한 사용자 표시
{user.status === 'inactive' && (
  <Badge color="gray">탈퇴함</Badge>
)}
```

---

#### 2.3 탈퇴한 멘토의 캠프 업무
**상황**: 캠프 업무를 생성한 멘토가 탈퇴

**현재 동작**:
- tasks 컬렉션의 `createdBy`는 여전히 유효
- Firestore 문서 유지

**문제점**:
- ⚠️ 업무 목록에서 생성자 이름이 `(탈퇴)홍길동`
- ⚠️ 탈퇴한 멘토의 업무를 다른 멘토가 관리해야 할 수 있음

**개선 방안**:
```typescript
// 업무 조회 시 생성자 status 확인
const creator = await getUserById(task.createdBy);

if (creator.status === 'inactive') {
  // 옵션 1: 관리자로 재할당
  task.createdBy = 'system_admin';
  
  // 옵션 2: 탈퇴 표시
  task.creatorNote = `원래 생성자: ${creator.name} (탈퇴함)`;
}
```

---

### 3. UI/UX 관련 엣지 케이스

#### 3.1 탈퇴 확인 모달의 정보 부족
**상황**: 사용자가 탈퇴 시 어떤 데이터가 삭제/유지되는지 불명확

**현재 동작**:
```typescript
confirm(
  '정말로 회원 탈퇴를 진행하시겠습니까? 탈퇴 후에는 동일한 이메일로 다시 로그인할 수 없으며, 모든 계정 정보가 비활성화됩니다.'
);
```

**문제점**:
- ❌ 작성한 평가/지원서가 어떻게 되는지 안내 없음
- ❌ 복구 가능 여부 안내 없음
- ❌ 데이터 보관 기간 안내 없음

**개선 방안**:
```typescript
// 1. 먼저 사용자 데이터 확인
const dataCheck = await checkUserData(userData.userId);

// 2. 상세한 확인 메시지
const confirmMessage = `
회원 탈퇴를 진행하시겠습니까?

📊 회원님의 활동 내역:
• 평가 기록: ${dataCheck.data.evaluations}개
• 지원서: ${dataCheck.data.applications}개
• 작성한 업무: ${dataCheck.data.tasks}개

⚠️ 탈퇴 시:
• 즉시 로그인 불가능
• 작성한 데이터는 보존됨 (익명화)
• 동일 이메일로 재가입 가능
• 계정 복구를 원하시면 관리자에게 문의

✅ 계속하시겠습니까?
`;

if (window.confirm(confirmMessage)) {
  await deactivateUser(userData.userId);
}
```

---

#### 3.2 탈퇴 후 로그아웃 실패
**상황**: 탈퇴 처리는 성공했으나 로그아웃 실패

**현재 동작**:
```typescript
await deactivateUser(userData.userId);
toast.success('회원 탈퇴가 완료되었습니다.');

// 로그아웃 처리
await signOut(auth);

// 로그인 페이지로 이동
router.push('/sign-in');
```

**문제점**:
- ❌ `signOut()` 실패 시 에러 처리 없음
- ❌ 사용자가 탈퇴했는데 로그인 상태로 남을 수 있음
- ❌ 혼란스러운 UX

**개선 방안**:
```typescript
try {
  // 1. 탈퇴 처리
  await deactivateUser(userData.userId);
  
  // 2. 강제 로그아웃 (에러 무시)
  try {
    await signOut(auth);
  } catch (logoutError) {
    console.warn('로그아웃 실패, 강제 이동:', logoutError);
  }
  
  // 3. 토큰 제거 및 페이지 이동
  localStorage.clear();
  sessionStorage.clear();
  
  toast.success('회원 탈퇴가 완료되었습니다.');
  
  // 4. 강제 페이지 이동 (replace 사용)
  window.location.replace('/sign-in');
  
} catch (error) {
  // 5. 탈퇴 실패 시에만 에러 표시
  toast.error('회원 탈퇴 중 오류가 발생했습니다.');
}
```

---

#### 3.3 탈퇴 버튼 중복 클릭
**상황**: 사용자가 탈퇴 버튼을 여러 번 클릭

**현재 동작**:
```typescript
const [deactivating, setDeactivating] = useState(false);

// 탈퇴 처리
setDeactivating(true);
await deactivateUser(userData.userId);
setDeactivating(false);
```

**문제점**:
- ⚠️ `deactivating` 상태로 버튼 비활성화는 되지만
- ⚠️ 네트워크 지연 시 첫 요청이 완료되기 전 두 번째 클릭 가능
- ⚠️ 중복 요청 발생 가능

**개선 방안**:
```typescript
const [deactivating, setDeactivating] = useState(false);

const handleDeactivateAccount = async () => {
  // 이미 처리 중이면 무시
  if (deactivating) return;
  
  try {
    setDeactivating(true);
    
    // 확인 모달
    const confirmed = await showConfirmModal();
    if (!confirmed) return;
    
    // 탈퇴 처리
    await deactivateUser(userData.userId);
    
    // 성공 시에만 로그아웃
    await signOut(auth);
    router.push('/sign-in');
    
  } catch (error) {
    toast.error('회원 탈퇴 중 오류가 발생했습니다.');
  } finally {
    // 에러 발생 시에만 다시 활성화
    if (auth.currentUser) {
      setDeactivating(false);
    }
  }
};
```

---

### 4. 비즈니스 로직 관련 엣지 케이스

#### 4.1 캠프 진행 중인 멘토/원어민의 탈퇴
**상황**: 현재 캠프에서 활동 중인 멘토가 탈퇴 시도

**현재 동작**:
- 제한 없이 탈퇴 가능
- 담당 학생들은 orphaned 상태

**문제점**:
- ❌ 캠프 운영에 차질
- ❌ 학생 관리 문제 발생
- ❌ 업무 인수인계 없음

**개선 방안**:
```typescript
// 탈퇴 전 현재 캠프 활동 확인
const activeJobExperience = user.jobExperiences?.find(
  exp => exp.id === user.activeJobExperienceId
);

if (activeJobExperience) {
  // 현재 캠프에서 담당 학생/업무 확인
  const hasActiveAssignments = await checkActiveAssignments(user.userId);
  
  if (hasActiveAssignments) {
    throw new Error(
      '현재 캠프에서 활동 중입니다. 탈퇴 전 관리자에게 업무 인수인계를 요청하세요.'
    );
  }
}
```

---

#### 4.2 진행 중인 평가가 있는 평가자의 탈퇴
**상황**: 현재 지원자를 평가 중인 사용자가 탈퇴

**현재 동작**:
- 제한 없이 탈퇴 가능
- 평가 기록은 유지

**문제점**:
- ⚠️ 진행 중인 평가가 중단됨
- ⚠️ 지원자에게 불공정

**개선 방안**:
```typescript
// 진행 중인 평가 확인
const pendingEvaluations = await db.collection('evaluations')
  .where('evaluatorId', '==', userId)
  .where('status', '==', 'pending')
  .get();

if (!pendingEvaluations.empty) {
  throw new Error(
    `진행 중인 평가가 ${pendingEvaluations.size}개 있습니다. 모두 완료한 후 탈퇴해주세요.`
  );
}
```

---

#### 4.3 관리자(admin)의 탈퇴
**상황**: admin 역할 사용자가 탈퇴 시도

**현재 동작**:
- 제한 없이 탈퇴 가능

**문제점**:
- ❌ 마지막 관리자가 탈퇴하면 시스템 관리 불가
- ❌ 관리자 삭제와 달리 체크 없음

**개선 방안**:
```typescript
// 관리자 탈퇴 시 체크
if (userData.role === 'admin') {
  const adminCount = await db.collection('users')
    .where('role', '==', 'admin')
    .where('status', '==', 'active')
    .count()
    .get();
  
  if (adminCount.data().count <= 1) {
    throw new Error(
      '마지막 관리자는 탈퇴할 수 없습니다. 먼저 다른 사용자를 관리자로 지정하세요.'
    );
  }
  
  // 추가 확인
  const doubleConfirm = window.confirm(
    '관리자 계정을 탈퇴하시겠습니까? 관리자 권한이 즉시 삭제됩니다.'
  );
  
  if (!doubleConfirm) return;
}
```

---

### 5. 탈퇴 vs 삭제 비교

| 항목 | 사용자 탈퇴 (deactivate) | 관리자 삭제 (Soft Delete) |
|------|------------------------|--------------------------|
| **Firestore status** | `inactive` | `deleted` |
| **이름 표시** | `(탈퇴)홍길동` | `(삭제됨)홍길동` |
| **이메일** | 원본 유지 | `deleted_timestamp_원본` |
| **Firebase Auth** | 삭제 | 삭제 |
| **실행자** | 본인 | 관리자 |
| **deletedBy** | ❌ 없음 | ✅ adminUserId |
| **deletedAt** | ❌ 없음 | ✅ Timestamp |
| **복구 가능** | ⚠️ 불명확 | ✅ 명확 (재활성화) |
| **재가입** | ⚠️ 혼란 가능 | ✅ 가능 |
| **감사 로그** | ❌ 없음 | ✅ auditLogs |

**문제점**:
- ❌ `deactivate`와 `soft delete`가 서로 다른 status 사용
- ❌ 재활성화 함수가 `inactive`와 `deleted` 모두 처리하지만 혼란스러움
- ❌ 감사 추적이 안 됨

---

## 📊 우선순위별 개선 방안

### 🔴 High Priority (즉시 수정 필요)

#### 1. 탈퇴 시 감사 로그 추가
```typescript
export const deactivateUser = async (userId: string) => {
  // ... 기존 로직
  
  // 감사 로그 기록
  try {
    await db.collection('auditLogs').add({
      action: 'USER_SELF_WITHDRAWAL',
      targetUserId: userId,
      targetUserData: {
        name: userData.name,
        email: userData.email,
        role: userData.role,
      },
      performedBy: userId, // 본인
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      metadata: {
        authDeleted: true,
      },
    });
  } catch (logError) {
    console.error('⚠️ 감사 로그 실패:', logError);
  }
};
```

#### 2. 세션 만료 시 재인증 요청
```typescript
export const deactivateUser = async (userId: string) => {
  // 세션 확인
  if (!auth.currentUser) {
    throw new Error('세션이 만료되었습니다. 다시 로그인 후 시도해주세요.');
  }
  
  // 본인 확인
  if (auth.currentUser.uid !== userId) {
    throw new Error('권한이 없습니다.');
  }
  
  // ... 기존 로직
};
```

#### 3. 관리자 탈퇴 방지
```typescript
export const deactivateUser = async (userId: string) => {
  const userData = userDoc.data() as User;
  
  // 관리자 체크
  if (userData.role === 'admin') {
    const adminCount = await db.collection('users')
      .where('role', '==', 'admin')
      .where('status', '==', 'active')
      .count()
      .get();
    
    if (adminCount.data().count <= 1) {
      throw new Error('마지막 관리자는 탈퇴할 수 없습니다.');
    }
  }
  
  // ... 기존 로직
};
```

---

### 🟡 Medium Priority (점진적 개선)

#### 4. 탈퇴 확인 모달에 데이터 통계 표시
```typescript
const handleDeactivateAccount = async () => {
  // 사용자 데이터 확인
  const dataCheck = await checkUserData(userData.userId);
  
  const confirmMessage = `
회원 탈퇴를 진행하시겠습니까?

📊 활동 내역:
• 평가 기록: ${dataCheck.data.evaluations}개
• 지원서: ${dataCheck.data.applications}개
• 작성한 업무: ${dataCheck.data.tasks}개

⚠️ 탈퇴 시:
• 즉시 로그인 불가능
• 작성한 데이터는 보존됨
• 복구를 원하시면 관리자에게 문의
  `;
  
  if (window.confirm(confirmMessage)) {
    await deactivateUser(userData.userId);
  }
};
```

#### 5. 재가입 시 inactive 사용자 처리
```typescript
// 회원가입 로직에 추가
const existingUser = await getUserByEmail(email);

if (existingUser && existingUser.status === 'inactive') {
  // 옵션 제공
  const reactivate = window.confirm(
    '이전에 탈퇴한 계정입니다. 계정을 복구하시겠습니까?\n\n' +
    '[확인] = 계정 복구\n' +
    '[취소] = 새 계정 생성'
  );
  
  if (reactivate) {
    await reactivateUser(existingUser.userId);
  } else {
    // 새 계정으로 덮어쓰기
    await updateDoc(userRef, { ...newUserData, status: 'active' });
  }
}
```

#### 6. 캠프 활동 중 탈퇴 방지
```typescript
const activeJobExperience = user.jobExperiences?.find(
  exp => exp.id === user.activeJobExperienceId
);

if (activeJobExperience) {
  throw new Error(
    '현재 캠프에서 활동 중입니다. 탈퇴 전 관리자에게 문의하세요.'
  );
}
```

---

### 🟢 Low Priority (선택적 개선)

#### 7. status 통일 ('inactive' → 'deleted')
```typescript
// 사용자 탈퇴도 'deleted' status 사용하여 통일
await updateDoc(userRef, {
  status: 'deleted',
  name: `(탈퇴)${userData.name}`,
  deletedAt: now,
  deletedBy: userId, // 본인
  withdrawalReason: 'self', // 탈퇴 이유 구분
});
```

#### 8. 탈퇴한 사용자 익명화 옵션
```typescript
// UI에서 탈퇴한 사용자 표시 시
const displayName = user.status === 'inactive' 
  ? user.name.replace(/^\(탈퇴\)/, '') + ' (탈퇴함)'
  : user.name;
```

#### 9. 탈퇴 사유 수집
```typescript
// 탈퇴 시 사유 선택 옵션 제공
const withdrawalReasons = [
  '더 이상 사용하지 않음',
  '다른 서비스 사용',
  '개인정보 보호',
  '기타'
];

// Firestore에 저장
await updateDoc(userRef, {
  withdrawalReason: selectedReason,
  withdrawalNote: userNote,
});
```

---

## 🎯 권장 구현 순서

### Phase 1: 필수 안전장치 (즉시)
1. ✅ 세션 만료 체크
2. ✅ 관리자 탈퇴 방지
3. ✅ 감사 로그 추가

### Phase 2: UX 개선 (1주일 내)
4. ✅ 탈퇴 확인 모달 개선 (데이터 통계)
5. ✅ 재가입 시 inactive 처리
6. ✅ 캠프 활동 중 탈퇴 방지

### Phase 3: 데이터 정합성 (2주일 내)
7. ✅ status 통일 검토
8. ✅ 탈퇴한 사용자 UI 표시 개선
9. ✅ 탈퇴 사유 수집

---

## 🔄 deactivate vs soft delete 통합 제안

### 현재 문제
- 두 가지 다른 status ('inactive', 'deleted')
- 재활성화 함수가 두 status 모두 처리
- 감사 추적 불일치

### 통합 방안

**옵션 1: status 통일**
```typescript
// 모두 'deleted' status 사용
// withdrawalType으로 구분

interface User {
  status: 'temp' | 'active' | 'deleted';
  withdrawalType?: 'self' | 'admin_soft' | 'admin_hard';
  deletedAt?: Timestamp;
  deletedBy?: string; // 본인이면 userId, 관리자면 adminUserId
}
```

**옵션 2: 별도 필드 추가**
```typescript
interface User {
  status: 'temp' | 'active' | 'inactive' | 'deleted';
  isWithdrawn: boolean; // 사용자 본인 탈퇴 여부
  withdrawnAt?: Timestamp;
  deletedAt?: Timestamp;
  deletedBy?: string;
}
```

**권장: 옵션 1 (status 통일)**
- 더 간단하고 명확함
- 재활성화 로직 통일 가능
- 감사 로그로 구분 가능

---

## 🎉 결론

### 주요 이슈

1. **🔴 Critical**
   - 세션 만료 시 Auth 삭제 안 됨
   - 관리자 탈퇴 방지 없음
   - 감사 로그 없음

2. **🟡 Important**
   - 탈퇴 확인 시 데이터 통계 없음
   - 재가입 시 혼란
   - 캠프 활동 중 탈퇴 가능

3. **🟢 Nice to have**
   - status 불일치 ('inactive' vs 'deleted')
   - 탈퇴 사유 미수집
   - UI 표시 개선 필요

### 다음 단계

Phase 1 (High Priority) 개선 사항을 즉시 구현하는 것을 권장합니다!
