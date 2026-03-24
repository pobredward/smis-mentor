# Firebase Auth UID 통일 시 문제 코드 체크리스트

## 📊 요약
- ✅ 정상 작동: 대부분의 코드
- 🔴 필수 수정: 6개 항목
- 🟡 주의 필요: 2개 항목
- 📦 데이터 업데이트: 672개 문서

---

## 🔴 1. createUser 함수 (필수 수정)

### 위치
`packages/web/src/lib/firebaseService.ts:40-48`

### 현재 코드
```typescript
export const createUser = async (userData: Omit<User, 'userId' | 'id'>) => {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, 'users'), {  // ❌ 랜덤 ID 생성
    ...userData,
    createdAt: now,
    updatedAt: now
  });
  return await updateDoc(doc(db, 'users', docRef.id), { userId: docRef.id, id: docRef.id });
};
```

### 수정 후
```typescript
export const createUser = async (userData: Omit<User, 'userId' | 'id'>, userId: string) => {
  const now = Timestamp.now();
  await setDoc(doc(db, 'users', userId), {  // ✅ Auth UID를 Document ID로 사용
    ...userData,
    userId,
    id: userId,
    createdAt: now,
    updatedAt: now
  });
};
```

---

## 🔴 2. 회원가입 페이지 (필수 수정)

### 위치
`packages/web/src/app/sign-up/details/page.tsx:225-231`

### 현재 코드
```typescript
// Firebase Auth에 사용자 등록
const userCredential = await signUp(email, password || '');

const now = Timestamp.now();

// Firestore에 사용자 정보 저장
await createUser({  // ❌ Auth UID 전달 안 함
  name,
  phoneNumber,
  email,
  // ...
});
```

### 수정 후
```typescript
// Firebase Auth에 사용자 등록
const userCredential = await signUp(email, password || '');

const now = Timestamp.now();

// Firestore에 사용자 정보 저장
await createUser({
  name,
  phoneNumber,
  email,
  // ...
}, userCredential.user.uid);  // ✅ Auth UID 전달
```

---

## 🔴 3. SignInClient.tsx 위험 코드 (삭제 필요)

### 위치
`packages/web/src/app/sign-in/SignInClient.tsx:162-170`

### 현재 코드 (삭제 필요)
```typescript
// Firestore의 userId와 Firebase Auth의 uid가 일치하는지 확인
if (result.user && result.user.userId !== currentUser.uid) {
  console.warn('⚠️ userId 불일치:', {
    firestoreUserId: result.user.userId,
    firebaseAuthUid: currentUser.uid,
  });
  // userId가 다르면 기존 계정 정보를 업데이트
  await updateUser(result.user.userId, { userId: currentUser.uid });  // 🔴 위험!
}
```

### 이유
- Auth UID 통일 후에는 이 코드가 불필요함
- 오히려 Document ID와 userId 필드 불일치를 발생시킬 수 있음

---

## 🔴 4. 참조 필드 업데이트 (필수 - 데이터)

### 영향받는 컬렉션

#### evaluations (113개 문서)
- **필드**: `evaluatorId`
- **업데이트 필요**: 구 userId → 새 Auth UID

#### lessonMaterials (559개 문서)
- **필드**: `userId`
- **업데이트 필요**: 구 userId → 새 Auth UID

#### 기타 (확인 필요)
- `applications.refUserId`
- `tasks.completions[].userId`
- `reviews.authorId` (있다면)
- `interviews.applicants[].userId` (있다면)

### 업데이트 스크립트 예시
```typescript
// evaluations 업데이트
const evaluationsRef = collection(db, 'evaluations');
const snapshot = await getDocs(evaluationsRef);

for (const doc of snapshot.docs) {
  const data = doc.data();
  const oldUserId = data.evaluatorId;
  
  // 백업 테이블에서 새 Auth UID 조회
  const backupDoc = await getDoc(doc(db, 'user_id_mappings_backup', oldUserId));
  if (backupDoc.exists()) {
    const newUserId = backupDoc.data().firebaseAuthUid;
    if (newUserId) {
      await updateDoc(doc.ref, { evaluatorId: newUserId });
    }
  }
}
```

---

## 🟡 5. URL 파라미터 (주의)

### 위치
`packages/web/src/app/sign-in/SignInClient.tsx:450`

### 코드
```typescript
router.push(`/sign-up/foreign/account?socialSignUp=true&tempUserId=${result.user.userId}&socialProvider=google`);
```

### 문제
- 마이그레이션 후 기존에 공유된 URL의 `tempUserId`는 구 ID
- 페이지 접근 시 조회 실패 가능

### 해결방안
```typescript
// foreign/account/page.tsx에서
const tempUserId = searchParams.get('tempUserId');
let user = await getUserById(tempUserId);

// 조회 실패 시 fallback
if (!user && tempUserId) {
  // 백업 테이블에서 새 ID 조회
  const backupDoc = await getDoc(doc(db, 'user_id_mappings_backup', tempUserId));
  if (backupDoc.exists() && backupDoc.data().firebaseAuthUid) {
    user = await getUserById(backupDoc.data().firebaseAuthUid);
  }
}
```

---

## 🟡 6. 캐시 무효화 (주의)

### 위치
`packages/web/src/lib/firebaseService.ts`

### 문제
- IndexedDB에 구 userId로 캐시 저장됨
- 마이그레이션 후 캐시 키 불일치

### 해결방안
```typescript
// CACHE_STORE에 버전 추가
export const CACHE_STORE = {
  USERS: 'users_v2',  // v1 → v2로 변경
  JOB_BOARDS: 'job_boards_v2',
  // ...
};

// 또는 마이그레이션 후 전체 캐시 초기화
await clearAllCaches();
```

---

## ✅ 정상 작동하는 코드 (수정 불필요)

### 1. 모든 조회 함수
```typescript
getUserById(userId)          // ✅ userId = Auth UID로 직접 조회 가능
getUserByEmail(email)        // ✅ 이메일 조회는 영향 없음
getUserByPhone(phone)        // ✅ 전화번호 조회는 영향 없음
```

### 2. 모든 업데이트 함수
```typescript
updateUser(userId, updates)      // ✅ 정상
updateUserActiveJobCode(userId)  // ✅ 정상
deactivateUser(userId)           // ✅ 정상
reactivateUser(userId)           // ✅ 정상
deleteUser(userId)               // ✅ 정상
```

### 3. Document 직접 조회
```typescript
doc(db, 'users', userId)  // ✅ 모든 곳에서 정상 작동
```

### 4. AuthContext
```typescript
// 현재 (우회 필요)
const user = await getUserByEmail(currentUser.email);

// 마이그레이션 후 (직접 조회)
const user = await getUserById(currentUser.uid);  // ✅ 훨씬 간단!
```

---

## 📋 마이그레이션 체크리스트

### 마이그레이션 전 코드 수정
- [ ] 1. `createUser` 함수 수정 (userId 매개변수 추가)
- [ ] 2. `details/page.tsx` 수정 (Auth UID 전달)
- [ ] 3. `SignInClient.tsx` 위험 코드 삭제 (라인 162-170)
- [ ] 4. URL 파라미터 fallback 로직 추가
- [ ] 5. 캐시 버전 업데이트

### 마이그레이션 실행
- [ ] 6. 서비스 점검 모드 전환
- [ ] 7. Firestore 백업 (Export)
- [ ] 8. users 컬렉션 마이그레이션 (Document ID 변경)
- [ ] 9. evaluations.evaluatorId 업데이트 (113개)
- [ ] 10. lessonMaterials.userId 업데이트 (559개)
- [ ] 11. 기타 참조 필드 업데이트

### 마이그레이션 후 검증
- [ ] 12. ID 일관성 검증 (/admin/user-consistency)
- [ ] 13. 샘플 로그인 테스트
- [ ] 14. 소셜 로그인 테스트
- [ ] 15. 평가 기능 테스트
- [ ] 16. 수업자료 기능 테스트

### 서비스 재개
- [ ] 17. 클라이언트 캐시 초기화 공지
- [ ] 18. 서비스 재개
- [ ] 19. 모니터링 (오류 로그 확인)

---

## 🎯 결론

**필수 수정 항목: 6개**
- 3개는 코드 수정
- 2개는 데이터 업데이트 (672개 문서)
- 1개는 주의사항

**대부분의 코드는 수정 불필요**하며, userId가 Auth UID로 바뀌기만 하면 자동으로 정상 작동합니다.
