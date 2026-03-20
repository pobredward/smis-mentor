# Phase 3 완료: 회원가입 플로우 통합 ✅

## 완료 항목

### 1. SignUpFlow 컴포넌트 생성 ✅

#### 파일: `packages/mobile/src/screens/SignUpFlow.tsx`

**기능:**
- 소셜 로그인과 일반 회원가입 통합 관리
- 단계별 플로우 제어 (Step 1 → Step 2 → Step 3)
- 소셜 로그인 시 Step 2 자동 건너뛰기
- temp 계정 활성화 처리
- 신규 소셜 계정 생성 처리

**주요 함수:**
- `handleStep1Complete()` - Step 1 완료 후 플로우 결정
- `handleStep2Complete()` - Step 2 완료 (일반 회원가입만)
- `handleStep3Complete()` - Step 3 완료 후 회원가입 실행
- `handleSocialSignUp()` - 소셜 회원가입 처리
- `handleNormalSignUp()` - 일반 회원가입 처리

### 2. SignInScreen 업데이트 ✅

#### 소셜 회원가입 네비게이션
- ✅ `onSocialSignUp` prop 추가
- ✅ temp 계정 연동 시 `tempUserId` 전달
- ✅ 신규 소셜 가입 시 `socialData` 전달
- ✅ 모든 TODO 제거 완료

### 3. ProfileScreen 통합 ✅

#### 상태 관리
- ✅ `social-signup` 화면 타입 추가
- ✅ `socialData`, `tempUserId` 상태 추가
- ✅ `handleSocialSignUp()` 핸들러 추가

#### 화면 렌더링
- ✅ `social-signup` 케이스에서 `SignUpFlow` 렌더링
- ✅ SignInScreen에 `onSocialSignUp` 연결

### 4. Export 업데이트 ✅
- ✅ `packages/mobile/src/screens/index.ts` - SignUpFlow export 추가

## 구현된 플로우

### 🎯 소셜 회원가입 - 신규 사용자

```
Google 로그인 버튼 클릭
  ↓
Google OAuth 인증
  ↓
이메일로 계정 검색 → 없음
  ↓
전화번호 입력 모달
  ↓
전화번호 입력
  ↓
temp 계정 없음
  ↓
SignUpFlow 시작 (isSocialSignUp: true)
  ↓
Step 1: 이름(자동입력), 전화번호(자동입력) 표시만
  ↓
[Step 2 건너뛰기] ✨
  ↓
Step 3: 교육정보 입력
  - 대학교
  - 학년
  - 휴학 여부
  - 전공
  ↓
Firestore에 신규 계정 생성
  - email: Google 이메일
  - name, phone, university, grade, major1, major2
  - authProviders: [{ providerId: 'google.com', ... }]
  - primaryAuthMethod: 'social'
  - status: 'active'
  ↓
회원가입 완료! 🎉
  ↓
로그인 화면으로 이동
```

### 🔗 소셜 회원가입 - temp 계정 연동

```
Google 로그인 버튼 클릭
  ↓
Google OAuth 인증
  ↓
이메일로 계정 검색 → 없음
  ↓
전화번호 입력 모달
  ↓
전화번호 입력
  ↓
temp 계정 발견 + 이름 일치
  ↓
"연동하시겠습니까?" Alert
  ↓
[연동하기] 선택
  ↓
SignUpFlow 시작 (isSocialSignUp: true, tempUserId: xxx)
  ↓
Step 1: 이름, 전화번호 확인
  ↓
[Step 2 건너뛰기] ✨
  ↓
Step 3: 교육정보 입력
  ↓
temp 계정 활성화 (activateTempAccountWithSocial)
  - email 업데이트: Google 이메일
  - status: temp → active
  - authProviders 추가
  - 교육정보 업데이트
  ↓
회원가입 완료! 🎉
  ↓
로그인 화면으로 이동
```

### 📝 일반 회원가입 (기존 플로우 유지)

```
회원가입 버튼 클릭
  ↓
역할 선택 (멘토/원어민)
  ↓
Step 1: 이름, 전화번호
  ↓
Step 2: 이메일, 비밀번호 ✅
  ↓
Step 3: 교육정보
  ↓
Firebase Auth 계정 생성
  ↓
Firestore에 사용자 정보 저장
  ↓
회원가입 완료! 🎉
```

## 업데이트된 파일

```
✅ packages/mobile/src/screens/SignUpFlow.tsx (새로 생성)
   - 소셜/일반 회원가입 통합 컴포넌트
   
✅ packages/mobile/src/screens/SignInScreen.tsx
   - onSocialSignUp prop 추가
   - TODO 제거 및 실제 네비게이션 연결
   
✅ packages/mobile/src/screens/ProfileScreen.tsx
   - social-signup 상태 추가
   - handleSocialSignUp 핸들러
   - SignUpFlow 렌더링
   
✅ packages/mobile/src/screens/index.ts
   - SignUpFlow export 추가
```

## 핵심 기능

### 1. Step 2 자동 건너뛰기 ✨

```typescript
const handleStep1Complete = (data) => {
  setSignUpData(prev => ({ ...prev, ...data }));

  // 소셜 로그인이면 Step 2 건너뛰기
  if (signUpData.isSocialSignUp) {
    setStep(3);  // Step 2 → Step 3
  } else {
    setStep(2);  // Step 1 → Step 2
  }
};
```

### 2. temp 계정 활성화

```typescript
await activateTempAccountWithSocial(
  tempUserId,
  socialData,
  {
    phone,
    university,
    grade,
    isOnLeave,
    major1,
    major2,
    role: 'mentor',
  },
  updateUser
);
```

### 3. 신규 소셜 계정 생성

```typescript
await setDoc(doc(db, 'users', userId), {
  userId,
  email: socialData.email,
  name,
  phone,
  university,
  grade,
  // ...
  authProviders: [{
    providerId: socialData.providerId,
    uid: socialData.providerUid,
    email: socialData.email,
    linkedAt: Timestamp.now(),
  }],
  primaryAuthMethod: 'social',
  status: 'active',
});
```

## 테스트 체크리스트

### 소셜 로그인 회원가입
- [ ] Google 로그인 후 전화번호 입력
- [ ] 신규 사용자: Step 1 → Step 3 (Step 2 건너뛰기 확인)
- [ ] 교육정보 입력 후 회원가입 완료
- [ ] Firestore에 계정 생성 확인
- [ ] authProviders 필드 확인

### temp 계정 연동
- [ ] Google 로그인 후 전화번호 입력
- [ ] temp 계정 발견 시 연동 확인 Alert
- [ ] 연동 선택 후 Step 1 → Step 3
- [ ] temp → active 전환 확인
- [ ] email 업데이트 확인
- [ ] authProviders 추가 확인

### 일반 회원가입 (기존 플로우)
- [ ] Step 1 → Step 2 → Step 3 정상 동작
- [ ] Firebase Auth 계정 생성
- [ ] Firestore 저장 확인

### 에러 처리
- [ ] 네트워크 오류 시 에러 메시지
- [ ] 중복 이메일 처리
- [ ] 필수 필드 누락 시 유효성 검사

## UI 플로우 비교

### 일반 회원가입 (4단계)
```
역할 선택
  ↓
Step 1: 개인정보 (이름, 전화번호)
  ↓
Step 2: 계정정보 (이메일, 비밀번호) ⬅ 있음
  ↓
Step 3: 교육정보
  ↓
완료
```

### 소셜 회원가입 (3단계)
```
Google 로그인
  ↓
전화번호 입력
  ↓
Step 1: 개인정보 (확인만)
  ↓
[Step 2 건너뛰기] ✨
  ↓
Step 3: 교육정보
  ↓
완료
```

## 데이터베이스 구조

### 소셜 계정 (Firestore)

```typescript
{
  userId: "auto-generated-id",
  email: "user@gmail.com",  // Google 이메일
  name: "홍길동",
  phone: "01012345678",
  university: "서울대학교",
  grade: 3,
  isOnLeave: false,
  major1: "컴퓨터공학",
  major2: "경영학",
  role: "mentor",
  status: "active",
  profileImage: "https://...",
  
  // 소셜 로그인 관련
  authProviders: [
    {
      providerId: "google.com",
      uid: "google-user-id",
      email: "user@gmail.com",
      linkedAt: Timestamp,
      displayName: "홍길동",
      photoURL: "https://..."
    }
  ],
  primaryAuthMethod: "social",
  
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### temp 계정 → active 전환

```typescript
// Before (temp)
{
  userId: "temp-user-id",
  name: "홍길동",
  phone: "01012345678",
  jobExperiences: ["job-code-id-1", "job-code-id-2"],
  role: "mentor_temp",
  status: "temp",
  // email 없음
}

// After (active)
{
  userId: "temp-user-id",  // 동일
  name: "홍길동",
  phone: "01012345678",
  jobExperiences: ["job-code-id-1", "job-code-id-2"],
  email: "user@gmail.com",  // 추가
  university: "서울대학교",  // 추가
  grade: 3,  // 추가
  // ...
  role: "mentor",  // temp → active
  status: "active",  // temp → active
  authProviders: [...],  // 추가
  primaryAuthMethod: "social",  // 추가
}
```

## 알려진 제한사항

### 현재 미구현 기능
1. **Step 4 (직무정보/자기소개)**
   - 웹에서 진행하도록 안내
   - 모바일 구현은 추후 계획

2. **원어민 소셜 회원가입**
   - 현재는 멘토만 지원
   - 원어민은 추후 확장 예정

3. **소셜 제공자 추가**
   - Apple Sign In (iOS) - Phase 4
   - 카카오 로그인 - Phase 5
   - 네이버 로그인 - Phase 6

## 다음 단계

### 개선 사항
1. **프로필 완성도 체크**
   - 추가 정보 입력 유도
   - Step 4 모바일 구현

2. **Apple Sign In** (iOS)
   - iOS 필수 요구사항
   - 구현 우선순위 높음

3. **에러 처리 강화**
   - 더 친절한 에러 메시지
   - 재시도 로직

4. **UI/UX 개선**
   - 소셜 계정 표시
   - 진행 상태 표시
   - 로딩 애니메이션

## Phase 3 완료! 🎉

소셜 로그인 회원가입 플로우가 완성되었습니다!

### 테스트 방법

```bash
# 개발 서버 실행
cd packages/mobile
npx expo start --go

# 또는
npx expo run:android
npx expo run:ios
```

### 테스트 시나리오
1. Google 로그인 버튼 클릭
2. Google 계정 선택
3. 전화번호 입력
4. 교육정보 입력
5. 회원가입 완료 확인
6. Firestore에서 계정 확인

## 🚀 다음: Phase 4 (Apple Sign In)

Apple Sign In 구현 예정 (iOS 필수)
