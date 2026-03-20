# 소셜 로그인 연동 관리 기능 분석

## ✅ 기술적 가능성 분석

### 1. Firebase Authentication 지원 여부
**결론: 완전히 가능합니다!**

Firebase Authentication은 다음을 지원합니다:
- ✅ **계정 연동 (Link)**: `linkWithCredential()` - 이미 구현됨
- ✅ **연동 해제 (Unlink)**: `unlink(providerId)` - 구현 필요
- ✅ **연동된 제공자 조회**: `user.providerData` - 사용 가능
- ✅ **여러 제공자 동시 연동**: Google + Apple + Kakao + Naver 가능

### 2. 데이터 구조 준비 상태
**현재 데이터 모델:**
```typescript
// User Document (Firestore)
interface User {
  authProviders?: AuthProvider[];  // ✅ 이미 구현됨!
  primaryAuthMethod?: 'email' | 'social';
}

interface AuthProvider {
  providerId: 'google.com' | 'apple.com' | 'kakao' | 'naver' | 'password';
  uid: string;
  email?: string;
  linkedAt: Timestamp;
  displayName?: string;
  photoURL?: string;
}
```

**평가**: ✅ 데이터 구조가 이미 완벽하게 준비되어 있음!

---

## 🎯 구현 가능한 기능

### A. 소셜 계정 연동 (Link)
- ✅ **이미 구현됨**: `linkSocialToExistingAccount()`
- 사용자가 비밀번호로 가입했다가 나중에 Google 추가 가능

### B. 소셜 계정 연동 해제 (Unlink)
- ✅ **구현 가능**: Firebase `unlink()` API 사용
- **제한 사항**: 최소 1개의 로그인 방법은 유지해야 함

### C. 여러 소셜 계정 동시 관리
- ✅ **완전 가능**: Google + Apple + Kakao + Naver 모두 연동 가능
- 사용자가 원하는 방법으로 로그인 선택 가능

---

## ⚠️ 주의사항 및 제약

### 1. 최소 1개 로그인 방법 유지 필수
**시나리오:**
- 사용자 A: 이메일/비밀번호 + Google 연동
- 사용자 B: Google만 연동

**제약:**
- ❌ 사용자 A: Google 연동 해제 가능 (이메일/비밀번호 남음)
- ❌ 사용자 B: Google 연동 해제 **불가능** (로그인 방법이 없어짐)

**해결 방법:**
```typescript
// 연동 해제 전 체크
const canUnlink = (user: User, providerId: string) => {
  const providers = user.authProviders || [];
  const remainingProviders = providers.filter(p => p.providerId !== providerId);
  
  // 최소 1개의 로그인 방법 남아야 함
  return remainingProviders.length > 0;
};
```

### 2. 이메일 변경 불가
- Firebase Auth의 Email은 고유 식별자
- 소셜 계정 연동 해제 시 이메일은 그대로 유지

### 3. Primary 로그인 방법 관리
- `primaryAuthMethod` 필드로 주 로그인 방법 표시
- 사용자가 선호하는 방법 저장

---

## 🎨 UI/UX 설계

### 설정 페이지 구성안

```
┌─────────────────────────────────────┐
│  계정 및 보안                         │
├─────────────────────────────────────┤
│                                      │
│  📧 이메일/비밀번호                   │
│  ├─ pobredward@gmail.com             │
│  ├─ 연결됨 (2025년 3월 23일)         │
│  └─ [비밀번호 변경]                  │
│                                      │
│  🔗 연동된 소셜 계정                  │
│                                      │
│  🔵 Google                           │
│  ├─ pobredward@gmail.com             │
│  ├─ 연결됨 (2026년 3월 20일)         │
│  └─ [연동 해제]                      │
│                                      │
│  🍎 Apple (연동 안됨)                 │
│  └─ [연동하기]                       │
│                                      │
│  💬 Kakao (연동 안됨)                 │
│  └─ [연동하기]                       │
│                                      │
│  🟢 Naver (연동 안됨)                 │
│  └─ [연동하기]                       │
│                                      │
│  ⚠️ 보안 알림                         │
│  최소 1개의 로그인 방법을 유지해야    │
│  합니다. 마지막 방법은 해제할 수      │
│  없습니다.                            │
│                                      │
└─────────────────────────────────────┘
```

---

## 📝 구현 계획

### Phase 1: 소셜 계정 표시
1. ✅ User 데이터에 `authProviders` 배열 읽기
2. ✅ 연동된 제공자 목록 표시
3. ✅ 연동 날짜, 이메일 정보 표시

### Phase 2: 연동 해제 기능
1. ✅ `unlinkSocialProvider()` 함수 구현
2. ✅ Firebase Auth `unlink()` 호출
3. ✅ Firestore `authProviders` 배열 업데이트
4. ✅ 최소 1개 로그인 방법 검증

### Phase 3: 추가 연동 기능
1. ✅ 각 소셜 제공자 연동 버튼
2. ✅ 이미 로그인한 상태에서 연동
3. ✅ 연동 성공/실패 처리

### Phase 4: Primary 로그인 방법 설정
1. ✅ 사용자가 선호하는 방법 선택
2. ✅ `primaryAuthMethod` 업데이트
3. ✅ 로그인 화면에서 추천 방법 표시

---

## 🔧 핵심 함수 구현

### 1. unlinkSocialProvider
```typescript
export async function unlinkSocialProvider(
  auth: any,
  providerId: SocialProvider,
  getUserById: (userId: string) => Promise<any>,
  updateUser: (userId: string, data: any) => Promise<void>
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('로그인이 필요합니다');

  // 1. Firebase Auth에서 연동 해제
  await unlink(currentUser, providerId);

  // 2. Firestore 업데이트
  const user = await getUserById(currentUser.uid);
  const updatedProviders = (user.authProviders || []).filter(
    (p: AuthProvider) => p.providerId !== providerId
  );

  await updateUser(currentUser.uid, {
    authProviders: updatedProviders,
    updatedAt: Timestamp.now(),
  });
}
```

### 2. canUnlinkProvider (검증)
```typescript
export function canUnlinkProvider(
  user: User,
  providerId: string
): { canUnlink: boolean; reason?: string } {
  const providers = user.authProviders || [];
  
  if (providers.length <= 1) {
    return {
      canUnlink: false,
      reason: '최소 1개의 로그인 방법을 유지해야 합니다.',
    };
  }

  const hasProvider = providers.some(p => p.providerId === providerId);
  if (!hasProvider) {
    return {
      canUnlink: false,
      reason: '연동되지 않은 제공자입니다.',
    };
  }

  return { canUnlink: true };
}
```

### 3. linkAdditionalProvider (추가 연동)
```typescript
export async function linkAdditionalProvider(
  auth: any,
  socialData: SocialUserData,
  getUserById: (userId: string) => Promise<any>,
  updateUser: (userId: string, data: any) => Promise<void>
): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('로그인이 필요합니다');

  // 1. 이미 연동되어 있는지 확인
  const user = await getUserById(currentUser.uid);
  const alreadyLinked = user.authProviders?.some(
    (p: AuthProvider) => p.providerId === socialData.providerId
  );

  if (alreadyLinked) {
    throw new Error('이미 연동된 제공자입니다.');
  }

  // 2. Firebase Auth 연동
  let credential;
  if (socialData.providerId === 'google.com') {
    credential = GoogleAuthProvider.credential(
      socialData.idToken,
      socialData.accessToken
    );
  }
  // ... 다른 제공자 처리

  if (credential) {
    await linkWithCredential(currentUser, credential);
  }

  // 3. Firestore 업데이트
  const newProvider: AuthProvider = {
    providerId: socialData.providerId,
    uid: socialData.providerUid,
    email: socialData.email,
    linkedAt: Timestamp.now(),
    displayName: socialData.name,
    photoURL: socialData.photoURL,
  };

  await updateUser(currentUser.uid, {
    authProviders: [...(user.authProviders || []), newProvider],
    updatedAt: Timestamp.now(),
  });
}
```

---

## ✅ 최종 판정

### 기술적 가능성: 100% 가능 ✅

**이유:**
1. ✅ Firebase Authentication이 모든 기능 지원
2. ✅ 데이터 구조가 이미 완벽하게 준비됨
3. ✅ 기존 코드와 잘 통합됨
4. ✅ 보안 검증 가능 (최소 1개 로그인 방법)

**제약 사항:**
- ⚠️ 최소 1개 로그인 방법 유지 필수
- ⚠️ 이메일 변경 불가 (Firebase 제약)

**권장 사항:**
- ✅ 설정 페이지에 "계정 및 보안" 섹션 추가
- ✅ 연동/해제 UI 구현
- ✅ 명확한 안내 메시지 제공
- ✅ Primary 로그인 방법 설정 기능

---

## 🎯 구현 우선순위

### 높음 (High Priority)
1. 연동된 소셜 계정 표시
2. 소셜 계정 연동 해제
3. 최소 1개 로그인 방법 검증

### 중간 (Medium Priority)
1. 추가 소셜 계정 연동
2. Primary 로그인 방법 설정
3. 연동 히스토리 표시

### 낮음 (Low Priority)
1. 로그인 활동 로그
2. 보안 알림
3. 2단계 인증 (추후)

---

**결론**: 소셜 로그인 연동 관리 기능은 **완전히 구현 가능**하며, 현재 코드베이스와 잘 통합될 수 있습니다! 🎉
