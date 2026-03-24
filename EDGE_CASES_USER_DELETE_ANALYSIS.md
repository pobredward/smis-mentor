# 사용자 삭제 기능 엣지 케이스 분석 및 개선 방안

## 📋 현재 구현 상태

### 구현된 기능
- ✅ Firebase Admin SDK를 통한 Auth 삭제
- ✅ Firestore 사용자 문서 삭제
- ✅ 관리자 권한 체크
- ✅ Auth 삭제 실패 시에도 Firestore는 삭제 진행

### API Route: `/api/admin/delete-user`
```typescript
POST /api/admin/delete-user
{
  userId: string,
  adminUserId: string
}
```

---

## 🚨 엣지 케이스 분석

### 1. 인증 관련 엣지 케이스

#### 1.1 여러 소셜 계정이 연동된 사용자 (authProviders)
**상황**: 구글 + 네이버 + 카카오 모두 연동된 사용자

**현재 동작**:
```typescript
await auth.deleteUser(userId); // Firebase Auth UID로 삭제 → 모든 연동 계정 한 번에 삭제
```

**문제점**: 
- ❌ 사용자가 여러 소셜 계정을 연동했어도 Firebase Auth에서는 단일 UID로 관리됨
- ✅ Firebase Admin SDK의 `deleteUser(uid)`는 해당 UID와 연동된 모든 프로바이더 정보를 함께 삭제하므로 문제 없음

**검증 필요**:
```typescript
// Firestore의 authProviders 배열 확인
const userData = {
  authProviders: [
    { providerId: 'google.com', uid: 'google-uid', linkedAt: ... },
    { providerId: 'naver', uid: 'naver-uid', linkedAt: ... },
    { providerId: 'kakao', uid: 'kakao-uid', linkedAt: ... },
  ]
}
```

**상태**: ✅ 문제 없음 (Firebase Auth UID 기준 삭제)

---

#### 1.2 Firebase Auth에 없지만 Firestore에만 있는 사용자
**상황**: 
- DB 불일치로 Firestore에만 존재
- 이전 마이그레이션 실패로 Auth가 먼저 삭제된 경우

**현재 동작**:
```typescript
try {
  await auth.deleteUser(userId);
  authDeleted = true;
} catch (error: any) {
  if (error.code === 'auth/user-not-found') {
    console.log('⚠️ Firebase Auth에 사용자가 없음');
    // 계속 진행
  }
}
await db.collection('users').doc(userId).delete(); // Firestore는 삭제
```

**상태**: ✅ 정상 처리됨

---

#### 1.3 관리자 본인을 삭제하려는 경우
**상황**: 관리자가 자기 자신의 계정을 삭제 시도

**현재 동작**:
```typescript
if (!adminUserId) {
  return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 });
}

const adminDoc = await db.collection('users').doc(adminUserId).get();
if (adminData?.role !== 'admin') {
  return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
}

// userId === adminUserId 체크 없음!
await auth.deleteUser(userId); // 관리자 본인도 삭제 가능
```

**문제점**: 
- ❌ 관리자가 본인을 삭제할 수 있음
- ❌ 관리자 삭제 후 orphaned session이 남을 수 있음

**개선 방안**:
```typescript
// 추가 체크
if (userId === adminUserId) {
  return NextResponse.json(
    { error: '본인 계정은 삭제할 수 없습니다. 다른 관리자에게 요청하세요.' },
    { status: 403 }
  );
}
```

---

#### 1.4 삭제 중인 사용자가 현재 로그인 중인 경우
**상황**: 삭제 대상 사용자가 다른 기기에서 로그인된 상태

**현재 동작**:
```typescript
await auth.deleteUser(userId); // Firebase Auth 삭제
// 해당 사용자의 모든 세션 즉시 무효화
```

**동작 확인**:
- ✅ Firebase Auth 삭제 시 모든 세션 토큰 자동 무효화
- ✅ 다음 API 요청 시 401 Unauthorized 반환
- ⚠️ 클라이언트에서 실시간으로 로그아웃 알림은 없음 (onAuthStateChanged는 토큰 갱신 시점에 트리거)

**개선 가능**:
- Firebase Cloud Messaging으로 강제 로그아웃 알림 전송
- 삭제 전 활성 세션 수 확인 및 경고 메시지

---

### 2. 데이터 무결성 관련 엣지 케이스

#### 2.1 사용자가 작성한 평가(Evaluations)가 있는 경우
**상황**: 삭제 대상 사용자가 다른 지원자를 평가한 기록이 있음

**현재 동작**:
```typescript
// 사용자만 삭제, evaluations는 그대로 유지
await db.collection('users').doc(userId).delete();

// evaluations 컬렉션의 evaluatorId는 orphaned 상태
{
  evaluatorId: 'deleted-user-id', // 존재하지 않는 사용자 참조
  evaluatorName: '삭제된 사용자',
  score: 85,
  ...
}
```

**문제점**: 
- ❌ Orphaned reference: evaluatorId가 존재하지 않는 사용자를 가리킴
- ❌ 평가 이력 조회 시 evaluator 정보를 못 가져옴
- ❌ 통계나 리포트에서 "알 수 없는 평가자"로 표시됨

**개선 방안 옵션**:

**옵션 1: Soft Delete (권장)**
```typescript
// 사용자 문서를 삭제하지 않고 status만 변경
await db.collection('users').doc(userId).update({
  status: 'deleted',
  name: `(삭제됨) ${userData.name}`,
  email: `deleted_${Date.now()}@deleted.local`,
  deletedAt: admin.firestore.FieldValue.serverTimestamp(),
  deletedBy: adminUserId,
});
```
- ✅ 평가 이력 유지
- ✅ 통계 데이터 무결성 보장
- ✅ 감사 추적(audit trail) 가능
- ⚠️ Firebase Auth는 여전히 삭제 (재가입 가능)

**옵션 2: Cascade Update**
```typescript
// 모든 평가 문서에서 evaluator 정보를 익명화
const evaluationsSnapshot = await db.collection('evaluations')
  .where('evaluatorId', '==', userId)
  .get();

const batch = db.batch();
evaluationsSnapshot.docs.forEach(doc => {
  batch.update(doc.ref, {
    evaluatorId: 'DELETED_USER',
    evaluatorName: '(삭제된 평가자)',
    evaluatorDeletedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
});
await batch.commit();
```
- ✅ 평가 데이터는 유지하되 익명화
- ❌ 대량 업데이트 시 성능 이슈
- ❌ 트랜잭션 한계 (500개)

**옵션 3: Hard Delete with Cleanup**
```typescript
// 모든 관련 평가 삭제
const evaluationsSnapshot = await db.collection('evaluations')
  .where('evaluatorId', '==', userId)
  .get();

const batch = db.batch();
evaluationsSnapshot.docs.forEach(doc => {
  batch.delete(doc.ref);
});
await batch.commit();
```
- ❌ 평가 이력 손실
- ❌ 통계 데이터 왜곡

---

#### 2.2 사용자가 작성한 지원서(Applications)가 있는 경우
**상황**: 삭제 대상 사용자가 채용 공고에 지원한 이력이 있음

**현재 동작**:
```typescript
// applications 컬렉션의 refUserId는 orphaned 상태
{
  refUserId: 'deleted-user-id', // 존재하지 않는 사용자 참조
  ...
}
```

**문제점**: 
- ❌ 채용 공고 지원자 목록에서 사용자 정보를 못 가져옴
- ❌ `where('refUserId', '==', userId)` 쿼리는 작동하지만 조인 실패

**개선 방안**: Soft Delete 권장

---

#### 2.3 사용자가 생성한 리소스(Tasks, 자료 등)가 있는 경우
**상황**: 캠프 운영 중 업무(tasks), 자료를 생성한 멘토/원어민 삭제

**현재 동작**:
```typescript
// tasks의 createdBy는 orphaned
{
  createdBy: 'deleted-user-id',
  title: '학생 상담',
  ...
}
```

**문제점**: 
- ❌ "누가 만들었는지" 추적 불가
- ❌ 감사 추적(audit trail) 손실

**개선 방안**: Soft Delete 또는 createdBy 정보 비정규화 (이름 포함)

---

#### 2.4 사용자가 SMS 템플릿을 작성한 경우
**상황**: SMS 템플릿에 createdBy가 삭제된 사용자를 가리킴

**검증 필요**:
```typescript
// SMS templates 구조 확인
const template = {
  createdBy: userId, // orphaned될 가능성
  ...
}
```

---

### 3. 역할(Role) 관련 엣지 케이스

#### 3.1 temp 역할 사용자 삭제
**상황**: `mentor_temp` 또는 `foreign_temp` 사용자 삭제

**현재 동작**:
```typescript
if (adminData?.role !== 'admin') {
  return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
}
// temp 사용자도 동일하게 삭제됨
```

**고려사항**:
- ✅ temp 사용자는 가입 프로세스 미완료 상태이므로 삭제해도 무방
- ⚠️ 하지만 이미 생성된 데이터가 있을 수 있음 (평가, 지원서 등)

**개선 방안**:
```typescript
// temp 사용자 삭제 시 특별 처리
if (userData.role.endsWith('_temp')) {
  console.log(`⚠️ temp 역할 사용자 삭제: ${userId}`);
  // 추가 검증: 생성된 데이터가 있는지 확인
  const hasEvaluations = await checkUserEvaluations(userId);
  const hasApplications = await checkUserApplications(userId);
  
  if (hasEvaluations || hasApplications) {
    console.warn('⚠️ temp 사용자이지만 생성된 데이터가 있습니다.');
  }
}
```

---

#### 3.2 마지막 남은 관리자 삭제
**상황**: 시스템에 admin이 1명만 남았는데 삭제 시도

**현재 동작**:
```typescript
if (adminData?.role !== 'admin') {
  return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
}
// 마지막 admin도 삭제 가능
```

**문제점**: 
- ❌ 시스템에 admin이 없어져 관리 불가 상태 발생

**개선 방안**:
```typescript
// 삭제 대상이 admin인 경우 체크
if (userData.role === 'admin') {
  // 다른 admin이 있는지 확인
  const adminCountSnapshot = await db.collection('users')
    .where('role', '==', 'admin')
    .where('status', '==', 'active')
    .count()
    .get();
  
  const adminCount = adminCountSnapshot.data().count;
  
  if (adminCount <= 1) {
    return NextResponse.json(
      { error: '마지막 관리자는 삭제할 수 없습니다. 먼저 다른 관리자를 지정하세요.' },
      { status: 403 }
    );
  }
}
```

---

### 4. 동시성 관련 엣지 케이스

#### 4.1 동시에 여러 관리자가 같은 사용자를 삭제 시도
**상황**: Admin A와 Admin B가 동시에 User X 삭제 요청

**현재 동작**:
```typescript
// 트랜잭션 없이 순차 처리
const userDoc = await db.collection('users').doc(userId).get();
if (!userDoc.exists) {
  return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
}
await auth.deleteUser(userId);
await db.collection('users').doc(userId).delete();
```

**시나리오**:
1. Admin A: `getDoc(userId)` → 존재함 ✅
2. Admin B: `getDoc(userId)` → 존재함 ✅
3. Admin A: `auth.deleteUser(userId)` → 성공 ✅
4. Admin A: `db.delete(userId)` → 성공 ✅
5. Admin B: `auth.deleteUser(userId)` → ❌ `auth/user-not-found`
6. Admin B: `db.delete(userId)` → ❌ 문서 없음 (오류 없이 완료)

**결과**: 
- ✅ 데이터 무결성은 유지됨
- ⚠️ Admin B에게 오해의 소지가 있는 응답 (성공으로 표시됨)

**개선 방안**:
```typescript
// 삭제 전 낙관적 잠금(optimistic locking) 또는 삭제 시점 기록
await db.collection('users').doc(userId).update({
  deletingBy: adminUserId,
  deletingAt: admin.firestore.FieldValue.serverTimestamp(),
});

// 일정 시간 후 다시 확인
const updatedDoc = await db.collection('users').doc(userId).get();
if (updatedDoc.data()?.deletingBy !== adminUserId) {
  return NextResponse.json(
    { error: '다른 관리자가 이미 삭제 처리 중입니다.' },
    { status: 409 } // Conflict
  );
}
```

---

#### 4.2 삭제 중 API 타임아웃
**상황**: 대용량 데이터 정리로 인해 API Route가 30초를 초과

**현재 동작**:
```typescript
// Vercel API Route 기본 타임아웃: 10초 (Hobby), 60초 (Pro)
// Firebase Auth 삭제는 빠름 (~100ms)
// Firestore 삭제도 빠름 (~50ms)
```

**문제점**: 
- ⚠️ Cascade delete 구현 시 타임아웃 가능성

**개선 방안**:
```typescript
// 1. 즉시 응답 + 백그라운드 처리
return NextResponse.json({
  success: true,
  message: '삭제가 시작되었습니다. 관련 데이터 정리는 백그라운드에서 진행됩니다.',
});

// 2. Cloud Functions로 위임
await admin.firestore().collection('deletionQueue').add({
  userId,
  requestedBy: adminUserId,
  requestedAt: admin.firestore.FieldValue.serverTimestamp(),
  status: 'pending',
});
```

---

### 5. 환경 변수 및 권한 관련 엣지 케이스

#### 5.1 Firebase Admin SDK 초기화 실패
**상황**: 환경 변수 누락 또는 잘못된 서비스 계정

**현재 동작**:
```typescript
if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    }),
  });
}
```

**문제점**: 
- ❌ 환경 변수 누락 시 런타임 에러
- ❌ privateKey 형식 오류 시 초기화 실패

**개선 방안**:
```typescript
// 환경 변수 검증
const requiredEnvVars = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ 필수 환경 변수 누락:', missingVars);
  throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
}

// 초기화 에러 핸들링
try {
  if (!admin.apps.length) {
    admin.initializeApp({ ... });
  }
} catch (error) {
  console.error('❌ Firebase Admin SDK 초기화 실패:', error);
  return NextResponse.json(
    { error: 'Firebase 서비스 초기화에 실패했습니다.' },
    { status: 500 }
  );
}
```

---

#### 5.2 Firebase Admin SDK 권한 부족
**상황**: 서비스 계정에 `auth.users.delete` 권한이 없음

**현재 동작**:
```typescript
try {
  await auth.deleteUser(userId);
} catch (error: any) {
  console.error('❌ Firebase Auth 삭제 실패:', error);
  authError = error.message;
}
// Firestore는 계속 삭제됨
```

**개선 방안**:
```typescript
// 권한 오류를 명확히 구분
if (error.code === 'auth/insufficient-permission') {
  return NextResponse.json(
    { 
      error: 'Firebase Admin SDK 권한이 부족합니다. 서비스 계정 권한을 확인하세요.',
      details: 'auth.users.delete 권한이 필요합니다.'
    },
    { status: 500 }
  );
}
```

---

### 6. 재활성화 시나리오 엣지 케이스

#### 6.1 삭제된 사용자를 재활성화하려는 경우
**상황**: Hard delete 후 재활성화 불가

**현재 상태**:
- Soft delete 구현: `reactivateUser()` 함수 존재
- Hard delete 구현: `deleteUser()` 함수 (새로 추가)

**문제점**: 
- ❌ Hard delete는 복구 불가능
- ⚠️ 관리자가 실수로 Hard delete 선택 가능

**개선 방안**:
```typescript
// 삭제 유형 선택 옵션 제공
export async function POST(request: Request) {
  const { userId, adminUserId, deleteType } = await request.json();
  
  if (deleteType === 'hard') {
    // 확인 단계 추가
    const { confirmed } = await request.json();
    if (!confirmed) {
      return NextResponse.json({
        warning: '영구 삭제는 복구할 수 없습니다. 정말 삭제하시겠습니까?',
        requiresConfirmation: true,
      });
    }
    
    // Hard delete 진행
    await hardDeleteUser(userId);
  } else {
    // Soft delete (기본)
    await softDeleteUser(userId);
  }
}
```

---

## 📊 우선순위별 개선 방안

### 🔴 High Priority (즉시 수정 필요)

1. **관리자 본인 삭제 방지**
```typescript
if (userId === adminUserId) {
  return NextResponse.json(
    { error: '본인 계정은 삭제할 수 없습니다.' },
    { status: 403 }
  );
}
```

2. **마지막 관리자 삭제 방지**
```typescript
if (userData.role === 'admin') {
  const adminCount = await countActiveAdmins();
  if (adminCount <= 1) {
    return NextResponse.json(
      { error: '마지막 관리자는 삭제할 수 없습니다.' },
      { status: 403 }
    );
  }
}
```

3. **Soft Delete 구현 (데이터 무결성)**
```typescript
// Hard delete 대신 status 변경
await db.collection('users').doc(userId).update({
  status: 'deleted',
  name: `(삭제됨) ${userData.name}`,
  email: `deleted_${Date.now()}@deleted.local`,
  deletedAt: admin.firestore.FieldValue.serverTimestamp(),
  deletedBy: adminUserId,
});

// Firebase Auth는 여전히 삭제 (재가입 가능)
await auth.deleteUser(userId);
```

---

### 🟡 Medium Priority (점진적 개선)

4. **환경 변수 검증**
```typescript
const requiredEnvVars = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  throw new Error(`Missing environment variables: ${missingVars.join(', ')}`);
}
```

5. **상세한 에러 로깅**
```typescript
console.error('❌ 사용자 삭제 실패:', {
  userId,
  adminUserId,
  error: error.message,
  code: error.code,
  stack: error.stack,
  timestamp: new Date().toISOString(),
});
```

---

### 🟢 Low Priority (선택적 개선)

6. **삭제 전 관련 데이터 확인**
```typescript
const hasEvaluations = await checkUserEvaluations(userId);
const hasApplications = await checkUserApplications(userId);
const hasTasks = await checkUserTasks(userId);

return NextResponse.json({
  warning: `이 사용자는 ${hasEvaluations}개의 평가, ${hasApplications}개의 지원서를 작성했습니다.`,
  requiresConfirmation: true,
});
```

7. **삭제 감사 로그**
```typescript
await db.collection('auditLogs').add({
  action: 'USER_DELETE',
  userId,
  adminUserId,
  deletedUserData: {
    name: userData.name,
    email: userData.email,
    role: userData.role,
  },
  timestamp: admin.firestore.FieldValue.serverTimestamp(),
  ip: request.headers.get('x-forwarded-for'),
});
```

---

## 🎯 권장 구현 순서

### Phase 1: 즉시 적용 (Critical)
1. ✅ 관리자 본인 삭제 방지
2. ✅ 마지막 관리자 삭제 방지
3. ✅ 환경 변수 검증

### Phase 2: 데이터 무결성 (1주일 내)
4. ✅ Soft Delete 구현
5. ✅ Orphaned references 처리

### Phase 3: 사용자 경험 개선 (2주일 내)
6. ✅ 삭제 전 데이터 확인 UI
7. ✅ 삭제 확인 모달 개선
8. ✅ 삭제 후 알림 개선

### Phase 4: 감사 및 모니터링 (선택)
9. ✅ 감사 로그 구현
10. ✅ 삭제 통계 대시보드
