# SMIS Mentor 소셜 로그인 안내 문구 가이드

## 📋 개선된 안내 문구 목록

### 1. 성공 메시지

#### 연동 성공
```typescript
✅ "소셜 계정이 성공적으로 연동되었습니다."
- Duration: 3초
- 사용 위치: profile/page.tsx - handleLink
```

#### 연동 해제 성공
```typescript
✅ "Google 계정 연동이 해제되었습니다."
- Duration: 3초
- 동적으로 제공자 이름 표시
- 사용 위치: profile/page.tsx - handleUnlink
```

#### 로그인 성공
```typescript
✅ "로그인에 성공했습니다!"
- Duration: 2초
- 사용 위치: SignInClient.tsx
```

---

### 2. 에러 메시지

#### 세션 만료
```typescript
❌ "로그인 세션이 만료되었습니다. 다시 로그인해주세요."
- Duration: 4초
- 2초 후 자동으로 로그인 페이지로 리다이렉트
- 사용 위치: profile/page.tsx - handleLink
```

#### 소셜 계정 이미 연동된 경우
```typescript
❌ "이 이메일은 이미 Google로 가입되어 있습니다.
Google로 로그인한 후 마이페이지에서 네이버를 연동해주세요."
- Duration: 6초
- 동적으로 제공자 이름 표시
- 사용 위치: SignInClient.tsx - LINK_ACTIVE 처리
```

#### 팝업 차단
```typescript
❌ "팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용한 후 다시 시도해주세요."
- Duration: 5초
- 사용 위치: profile/page.tsx, shared/socialAuthService.ts
```

#### 팝업 닫힘
```typescript
❌ "로그인 창이 닫혔습니다. 다시 시도해주세요."
- Duration: 5초
- 사용 위치: profile/page.tsx, shared/socialAuthService.ts
```

#### 일반 연동 오류
```typescript
❌ "소셜 계정 연동 중 오류가 발생했습니다. 다시 시도해주세요."
- Duration: 5초
- 사용 위치: profile/page.tsx - handleLink
```

#### 연동 해제 오류
```typescript
❌ "연동 해제 중 오류가 발생했습니다. 다시 시도해주세요."
- Duration: 5초
- 사용 위치: profile/page.tsx - handleUnlink
```

#### 보안 재로그인 필요
```typescript
❌ "보안을 위해 다시 로그인한 후 연동을 시도해주세요."
- Firebase Auth requires-recent-login 에러
- Duration: 5초
```

#### 비밀번호 오류 (관리자 연락처 포함)
```typescript
❌ "비밀번호가 올바르지 않습니다.
본인의 계정이 아니라면 관리자에게 문의하세요.

관리자: 010-7656-7933 (신선웅)"
- Duration: 8초
- 줄바꿈으로 가독성 향상
```

#### 전화번호 중복 (관리자 연락처 포함)
```typescript
❌ "이 전화번호는 "홍길동"님 이름으로 등록되어 있습니다.
본인이 아니라면 관리자에게 문의해주세요.

관리자: 010-7656-7933 (신선웅)"
- Duration: 8초
- 줄바꿈으로 가독성 향상
```

#### 탈퇴/삭제 계정 (관리자 연락처 포함)
```typescript
❌ "탈퇴한 계정입니다. 계정 복구를 원하시면 관리자에게 문의하세요.

관리자: 010-7656-7933 (신선웅)"
- Duration: 기본값
- ACCOUNT_INACTIVE 에러
```

#### 너무 많은 시도
```typescript
❌ "너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요."
- Duration: 5초
- "나중에" → "잠시 후"로 변경 (더 구체적)
```

---

### 3. 원어민 전용 메시지 (영어)

#### 이름 중복 - 멘토 계정
```typescript
❌ "This name is registered as a mentor account. Please contact the administrator if this is incorrect.

Administrator: 010-7656-7933 (Shin Sunwoong)"
- Duration: 8초
- 줄바꿈으로 가독성 향상
```

#### 이름 중복 - 다른 역할
```typescript
❌ "This name is already registered with a different role. Please contact the administrator.

Administrator: 010-7656-7933 (Shin Sunwoong)"
- Duration: 8초
- 줄바꿈으로 가독성 향상
```

#### 원어민 로그인 성공
```typescript
✅ "Welcome back! Logging you in..."
- 기존 계정 발견 시
```

#### 임시 계정 발견
```typescript
ℹ️ "Temporary account found. Please complete your registration."
```

---

### 4. 안내 메시지 (정보성)

#### 최소 로그인 방법 유지
```typescript
⚠️ "최소 1개의 로그인 방법을 유지해야 합니다. 마지막 방법은 해제할 수 없습니다."
- LinkedAccountsDisplay 컴포넌트
- 마지막 로그인 방법 해제 시도 시 표시
```

#### 계정 정보 로드 실패
```typescript
⚠️ "계정 정보를 불러올 수 없습니다. 페이지를 새로고침해주세요."
- LinkedAccountsDisplay 컴포넌트
- authProviders null/undefined 시
```

---

## 🎯 안내 문구 작성 원칙

### 1. 명확성 (Clarity)
- ✅ "다시 시도해주세요" (구체적 행동)
- ❌ "오류가 발생했습니다" (모호함)

### 2. 친절함 (Friendliness)
- ✅ "로그인 세션이 만료되었습니다. 다시 로그인해주세요."
- ❌ "세션 만료. 재로그인 필요"

### 3. 구체성 (Specificity)
- ✅ "팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용한 후 다시 시도해주세요."
- ❌ "팝업 차단됨"

### 4. 시간 표현
- ✅ "잠시 후 다시 시도해주세요" (구체적)
- ❌ "나중에 다시 시도해주세요" (모호함)

### 5. 줄바꿈 활용
관리자 연락처 등 중요 정보는 줄바꿈으로 구분:
```typescript
"비밀번호가 올바르지 않습니다.\n본인의 계정이 아니라면 관리자에게 문의하세요.\n\n관리자: 010-7656-7933 (신선웅)"
```

### 6. Duration 설정
- 짧은 성공 메시지: 2-3초
- 일반 에러: 5초
- 중요 정보/관리자 연락처: 8초
- 자동 리다이렉트: 4초 + 2초 딜레이

---

## 📊 메시지 타입별 Duration

| 메시지 타입 | Duration | 이유 |
|-----------|----------|------|
| 간단한 성공 | 2-3초 | 빠른 피드백, 작업 흐름 방해 최소화 |
| 일반 에러 | 5초 | 충분한 읽기 시간 제공 |
| 관리자 연락처 포함 | 8초 | 전화번호 메모 시간 확보 |
| 자동 리다이렉트 | 4초 | 사용자에게 상황 인지 시간 제공 |

---

## ✅ 모든 시나리오 커버

### 로그인/인증
- [x] 로그인 성공
- [x] 로그인 실패 (이메일/비밀번호 불일치)
- [x] 너무 많은 시도
- [x] 세션 만료
- [x] 비밀번호 재설정 성공

### 소셜 계정 연동
- [x] 연동 성공 (Google, 네이버)
- [x] 연동 실패 (일반)
- [x] 팝업 차단
- [x] 팝업 닫힘
- [x] 이미 연동된 계정
- [x] 보안 재로그인 필요
- [x] 다른 계정에 이미 사용 중

### 소셜 계정 연동 해제
- [x] 해제 성공
- [x] 해제 실패
- [x] 마지막 로그인 방법 (해제 불가)

### 회원가입
- [x] 전화번호 중복 (본인 아님)
- [x] 이름 중복 (멘토/원어민)
- [x] 임시 계정 발견
- [x] 탈퇴/삭제 계정

### 시스템
- [x] 계정 정보 로드 실패
- [x] 사용자 정보 없음

---

## 🌍 다국어 지원

### 한국어 (멘토)
- 존댓말 사용 ("~해주세요", "~입니다")
- 명확하고 친절한 표현

### 영어 (원어민)
- Professional but friendly tone
- Clear action items
- Administrator contact included

---

## 🎨 Toast 스타일 가이드

### Success (toast.success)
```typescript
toast.success('메시지', { duration: 2000-3000 });
```
- 녹색 배경
- 체크 아이콘
- 짧은 duration

### Error (toast.error)
```typescript
toast.error('메시지', { duration: 5000-8000 });
```
- 빨간색 배경
- X 아이콘
- 긴 duration (읽기 시간 확보)

### Warning (사용 안 함)
- 현재 프로젝트에서 사용하지 않음
- Error로 통일

---

## 📌 유지보수 가이드

### 새로운 메시지 추가 시
1. **명확한 행동 지침** 포함
2. **적절한 Duration** 설정
3. **줄바꿈** 활용 (가독성)
4. **이 문서에 추가** (문서화)

### 메시지 수정 시
1. **사용자 테스트** (실제로 읽기 쉬운지)
2. **Duration 재검토** (충분한 시간인지)
3. **다국어 일관성** 확인 (한/영)

---

## 🎯 결과

모든 안내 문구가 다음 원칙을 따릅니다:
- ✅ **명확함**: 사용자가 다음에 무엇을 해야 하는지 알 수 있음
- ✅ **친절함**: 존댓말 사용, 공감하는 톤
- ✅ **구체적**: 모호한 표현 없음
- ✅ **일관성**: 동일한 상황에 동일한 패턴
- ✅ **접근성**: 충분한 읽기 시간 제공
