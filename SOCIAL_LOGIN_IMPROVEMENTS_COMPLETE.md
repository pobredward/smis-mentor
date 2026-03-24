# 소셜 로그인 개선 작업 완료

## 📋 작업 개요

소셜 로그인 전체 케이스 분석 결과를 바탕으로 식별된 Critical Issues를 해결하고 시스템 안정성을 향상시켰습니다.

**작업 일시**: 2026-03-23  
**관련 분석 문서**: `SOCIAL_LOGIN_ALL_CASES_ANALYSIS.md`

---

## ✅ 완료된 개선 사항

### 1. 탈퇴/삭제 사용자 소셜 로그인 차단

**문제점**: inactive/deleted 상태 사용자가 소셜 로그인을 시도할 경우 예상치 못한 동작 발생 가능

**개선 내용**:
- `handleSocialLogin` 함수에 탈퇴/삭제 계정 체크 로직 추가
- inactive/deleted 상태 발견 시 `ACCOUNT_INACTIVE` 또는 `ACCOUNT_DELETED` 에러 발생
- `handleSocialAuthError`에 사용자 친화적 에러 메시지 추가

**변경 파일**:
- `packages/shared/src/services/socialAuthService.ts`

```typescript
// 탈퇴/삭제된 계정 처리
if (existingUser.status === 'inactive' || existingUser.status === 'deleted') {
  console.log('⚠️ 탈퇴/삭제된 계정:', existingUser.status);
  throw new Error(`ACCOUNT_${existingUser.status.toUpperCase()}`);
}
```

**에러 메시지**:
- `ACCOUNT_INACTIVE`: "탈퇴한 계정입니다. 계정 복구를 원하시면 관리자에게 문의하세요."
- `ACCOUNT_DELETED`: "삭제된 계정입니다. 계정 복구를 원하시면 관리자에게 문의하세요."

---

### 2. LINK_TEMP 데드 코드 정리

**문제점**: `LINK_TEMP` 액션은 temp 계정이 이메일을 가질 수 없다는 비즈니스 로직상 절대 발생하지 않음

**개선 내용**:
- `handleSocialLogin`에서 LINK_TEMP 분기를 데이터 무결성 오류로 변경
- temp 계정에 이메일이 있으면 에러 발생 (데이터 무결성 문제)
- `SocialLoginAction` 타입에 `@deprecated` 주석 추가

**변경 파일**:
- `packages/shared/src/services/socialAuthService.ts`
- `packages/shared/src/types/auth.ts`

```typescript
// Before: LINK_TEMP 반환
return {
  action: 'LINK_TEMP',
  tempUserId: existingUser.userId || existingUser.id,
  user: existingUser,
  socialData,
};

// After: 데이터 무결성 오류
console.error('⚠️ [데이터 무결성 오류] Temp 계정에 이메일이 있음:', existingUser);
throw new Error('계정 상태가 비정상적입니다. 관리자에게 문의하세요.');
```

**타입 정의 개선**:
```typescript
export type SocialLoginAction = 
  | 'LOGIN'              // 기존 계정으로 즉시 로그인
  | 'SIGNUP'             // 신규 회원가입 필요
  | 'LINK_ACTIVE'        // 기존 active 계정 연동 필요
  | 'LINK_TEMP'          // @deprecated temp 계정은 이메일이 없으므로 이 액션은 실제로 발생하지 않음
  | 'NEED_PHONE';        // 전화번호 입력 필요 (temp 계정 확인용)
```

---

### 3. 소셜 로그인 감사 로그 추가

**문제점**: 소셜 로그인 시 감사 로그가 기록되지 않아 보안 감사 추적 불가

**개선 내용**:
- 소셜 로그인 감사 로그 기록용 API 엔드포인트 생성
- 로그인 성공/실패, 계정 연동, 탈퇴/삭제 계정 접근 시도 등 기록 가능
- IP 주소, User-Agent 자동 기록

**변경 파일**:
- `packages/web/src/app/api/admin/audit-log/social-login/route.ts` (신규)

**API 스펙**:
- **Endpoint**: `POST /api/admin/audit-log/social-login`
- **Request Body**:
  ```typescript
  {
    action: 'SOCIAL_LOGIN' | 'SOCIAL_SIGNUP' | 'SOCIAL_LINK' | 'SOCIAL_UNLINK' | 'SOCIAL_LOGIN_FAILED',
    userId: string,
    providerId: SocialProvider,
    email: string,
    status: 'SUCCESS' | 'FAILED' | 'BLOCKED',
    metadata: Record<string, any>
  }
  ```
- **Response**:
  ```typescript
  {
    success: boolean,
    message: string
  }
  ```

**Firestore 스키마** (`auditLogs` 컬렉션):
```typescript
{
  action: string,
  category: 'SOCIAL_AUTH',
  userId: string,
  userEmail: string,
  providerId: SocialProvider,
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED',
  metadata: {
    userAgent: string,
    ip: string,
    ...customData
  },
  timestamp: Timestamp,
  createdAt: Timestamp
}
```

**향후 통합 작업 필요**:
- 현재는 API 엔드포인트만 구현됨
- 실제 로그인/회원가입 플로우에서 이 API를 호출하는 작업은 추후 진행 필요
- `SignInClient.tsx`, `GoogleSignInButton.tsx`, `NaverSignInButton.tsx` 등에서 호출

---

### 4. 재가입 시 inactive/deleted 사용자 처리

**문제점**: 탈퇴/삭제 사용자가 소셜 로그인 재시도 시 적절한 안내 부족

**개선 내용**:
- 1번 개선 사항에서 이미 처리됨
- 프론트엔드에서 `handleSocialAuthError` 사용하여 사용자 친화적 메시지 표시 확인
- `SignInClient.tsx`에서 에러 처리 로직 이미 구현되어 있음

**확인 사항**:
- ✅ `handleSocialLogin`에서 에러 발생
- ✅ `handleSocialAuthError`에서 에러 메시지 변환
- ✅ `SignInClient.tsx`에서 toast로 사용자에게 표시

---

### 5. 전화번호 중복 체크 강화

**문제점**: 
- 동일 전화번호로 여러 계정 존재 시 처리 로직 불명확
- inactive/deleted 계정 고려하지 않음

**개선 내용**:
- `getUserByPhone` 함수 개선: 여러 사용자 발견 시 우선순위 적용
  1. active 사용자 우선 반환
  2. temp 사용자 우선 반환
  3. 그 외 첫 번째 사용자 반환
- 데이터 무결성 문제 경고 로그 추가
- `checkTempAccountByPhone` 함수에 inactive/deleted 계정 체크 추가

**변경 파일**:
- `packages/web/src/lib/firebaseService.ts`
- `packages/shared/src/services/socialAuthService.ts`

**getUserByPhone 개선**:
```typescript
// 여러 사용자가 있는 경우 (데이터 무결성 문제)
if (querySnapshot.docs.length > 1) {
  console.warn('⚠️ 동일한 전화번호로 여러 사용자 발견:', {
    phoneNumber,
    count: querySnapshot.docs.length,
    users: querySnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name,
      status: doc.data().status,
    })),
  });
  
  // active 사용자 우선 반환
  const activeUser = querySnapshot.docs.find(doc => doc.data().status === 'active');
  if (activeUser) {
    console.log('✅ active 사용자 반환');
    return activeUser.data() as User;
  }
  
  // temp 사용자 우선 반환
  const tempUser = querySnapshot.docs.find(doc => doc.data().status === 'temp');
  if (tempUser) {
    console.log('✅ temp 사용자 반환');
    return tempUser.data() as User;
  }
  
  // 그 외 첫 번째 사용자 반환
  console.log('⚠️ inactive/deleted 사용자 반환');
  return querySnapshot.docs[0].data() as User;
}
```

**checkTempAccountByPhone 개선**:
```typescript
// inactive/deleted 계정 처리
if (user.status === 'inactive' || user.status === 'deleted') {
  console.log('⚠️ 탈퇴/삭제된 계정:', user.status);
  throw new Error(`ACCOUNT_${user.status.toUpperCase()}`);
}
```

---

## 🔍 테스트 및 검증

### 빌드 테스트
```bash
# Shared 패키지 빌드 성공
cd packages/shared
npm run build
✅ 빌드 성공 (0 errors)
```

### Linter 검증
```bash
# 변경된 파일 linter 검증
✅ packages/shared/src/services/socialAuthService.ts (0 errors)
✅ packages/shared/src/types/auth.ts (0 errors)
✅ packages/web/src/lib/firebaseService.ts (0 errors)
```

---

## 📊 영향도 분석

### 변경된 파일
1. **packages/shared/src/services/socialAuthService.ts**
   - `handleSocialLogin`: inactive/deleted 체크 추가
   - `checkTempAccountByPhone`: inactive/deleted 체크 추가
   - `handleSocialAuthError`: 새로운 에러 메시지 추가

2. **packages/shared/src/types/auth.ts**
   - `SocialLoginAction`: LINK_TEMP에 @deprecated 주석 추가

3. **packages/web/src/lib/firebaseService.ts**
   - `getUserByPhone`: 여러 사용자 처리 로직 개선

4. **packages/web/src/app/api/admin/audit-log/social-login/route.ts** (신규)
   - 소셜 로그인 감사 로그 API 엔드포인트

### 하위 호환성
- ✅ 기존 API는 변경 없음
- ✅ 타입 변경 최소화 (주석 추가만)
- ✅ 에러 처리 강화 (기존 기능 유지)

### 배포 전 확인 사항
1. ✅ Shared 패키지 빌드 성공
2. ✅ Linter 오류 없음
3. ⚠️ 감사 로그 API 통합 필요 (향후 작업)
4. ⚠️ 실제 환경에서 탈퇴/삭제 사용자 로그인 시나리오 테스트 필요

---

## 🚀 향후 개선 사항 (Medium Priority)

### 1. 감사 로그 통합
- [ ] `SignInClient.tsx`에서 로그인 성공/실패 시 감사 로그 호출
- [ ] `GoogleSignInButton.tsx`, `NaverSignInButton.tsx`에서 호출
- [ ] 계정 연동 시 감사 로그 호출
- [ ] 탈퇴/삭제 계정 접근 시도 감사 로그 호출

### 2. 전화번호 중복 방지
- [ ] Firestore Security Rules에 전화번호 unique 제약 추가
- [ ] 회원가입 시 전화번호 중복 체크 강화
- [ ] 데이터 마이그레이션: 중복 전화번호 정리

### 3. providerId 정규화
- [ ] DB에 저장되는 providerId를 `google.com`, `naver`, `kakao`로 통일
- [ ] 기존 데이터 마이그레이션 스크립트 작성
- [ ] 정규화 유틸 함수 제거

### 4. 소셜 로그인 재시도 메커니즘
- [ ] 네이버/카카오 Custom Token 생성 실패 시 재시도 로직
- [ ] Firebase Auth 타임아웃 처리
- [ ] 사용자 친화적 에러 메시지 개선

---

## 📚 관련 문서

- **SOCIAL_LOGIN_ALL_CASES_ANALYSIS.md**: 소셜 로그인 전체 케이스 분석
- **USER_SELF_WITHDRAWAL_EDGE_CASES.md**: 사용자 자발적 탈퇴 엣지 케이스 분석
- **EDGE_CASES_USER_DELETE_ANALYSIS.md**: 관리자 사용자 삭제 엣지 케이스 분석
- **PHASE_3_LOW_PRIORITY_COMPLETE.md**: 관리자 사용자 삭제 Phase 3 완료

---

## ✅ 작업 완료 체크리스트

- [x] 1. 탈퇴/삭제 사용자 소셜 로그인 차단
- [x] 2. LINK_TEMP 데드 코드 정리
- [x] 3. 소셜 로그인 감사 로그 API 생성
- [x] 4. 재가입 시 inactive/deleted 사용자 처리
- [x] 5. 전화번호 중복 체크 강화
- [x] 6. 테스트 및 검증
- [x] 7. 문서 작성

---

## 🎯 결론

소셜 로그인 시스템의 Critical Issues를 해결하고 시스템 안정성을 크게 향상시켰습니다. 특히 탈퇴/삭제 사용자의 재접근 차단, 전화번호 중복 처리 강화, 데드 코드 정리를 통해 예상치 못한 버그를 사전에 방지했습니다.

감사 로그 API는 생성되었으나, 실제 로그인 플로우에서 호출하는 작업은 향후 진행이 필요합니다. 또한 전화번호 unique 제약, providerId 정규화 등의 개선 사항은 Medium Priority로 분류하여 추후 진행할 예정입니다.

**작성자**: AI Assistant  
**검토자**: (검토 필요)  
**승인자**: (승인 필요)
