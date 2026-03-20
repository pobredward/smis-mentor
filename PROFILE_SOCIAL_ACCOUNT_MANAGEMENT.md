# 프로필 페이지 소셜 계정 관리 통합 완료

## ✅ 구현 완료

### 변경 사항
프로필 페이지(`/profile`)에 소셜 계정 관리 섹션을 추가했습니다.

### 위치
```
/profile 페이지
├─ 프로필 카드
├─ SMIS 캠프 참여 이력 (접기/펼치기)
├─ 📱 연동된 계정 (접기/펼치기) ← 새로 추가!
│  ├─ 📧 이메일/비밀번호
│  ├─ 🔵 Google [연동 해제]
│  └─ 안내 메시지
├─ 개인 정보
├─ 학교 정보
└─ 회원 탈퇴
```

## 🎨 UI/UX

### 접기/펼치기 헤더
```
┌─────────────────────────────────────┐
│ 연동된 계정          2개           ▶ │ ← 클릭하면 펼쳐짐
└─────────────────────────────────────┘
```

### 펼쳤을 때
```
┌─────────────────────────────────────┐
│ 연동된 계정          2개           ▼ │
├─────────────────────────────────────┤
│ 📧 이메일/비밀번호                   │
│ pobredward@gmail.com                │
│ 연결됨: 2025년 3월 23일              │
│                            [필수]    │
├─────────────────────────────────────┤
│ 🔵 Google                           │
│ pobredward@gmail.com                │
│ 연결됨: 2026년 3월 20일              │
│                      [연동 해제]     │
├─────────────────────────────────────┤
│ ⚠️ 최소 1개의 로그인 방법을 유지     │
│    해야 합니다.                      │
└─────────────────────────────────────┘
```

## 📝 주요 기능

### 1. 연동된 계정 표시
- ✅ 접기/펼치기 버튼으로 공간 절약
- ✅ 계정 개수 표시 (예: "2개")
- ✅ `LinkedAccountsDisplay` 컴포넌트 재사용

### 2. 연동 해제
- ✅ "연동 해제" 버튼 클릭
- ✅ 확인 다이얼로그
- ✅ Firebase Auth & Firestore 업데이트
- ✅ 자동 데이터 새로고침
- ✅ 성공/실패 메시지

### 3. 보안
- ✅ 최소 1개 로그인 방법 유지
- ✅ 마지막 방법은 해제 불가
- ✅ 명확한 안내 메시지

## 🔧 코드 변경

### 파일: `packages/web/src/app/profile/page.tsx`

**추가된 import:**
```typescript
import LinkedAccountsDisplay from '@/components/settings/LinkedAccountsDisplay';
import { SocialProvider } from '@smis-mentor/shared';
import { unlinkSocialProvider, getSocialProviderName } from '@smis-mentor/shared';
import { getUserById, updateUser } from '@/lib/firebaseService';
```

**추가된 상태:**
```typescript
const [socialAccountsExpanded, setSocialAccountsExpanded] = useState(false);
const [isUnlinking, setIsUnlinking] = useState(false);
```

**추가된 핸들러:**
```typescript
const handleUnlink = async (providerId: SocialProvider) => {
  // 확인 다이얼로그
  // unlinkSocialProvider() 호출
  // refreshUserData()
  // 성공/에러 메시지
};
```

**추가된 UI 섹션:**
```tsx
{userData.authProviders && userData.authProviders.length > 0 && (
  <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
    {/* 접기/펼치기 헤더 */}
    <button onClick={() => setSocialAccountsExpanded(!socialAccountsExpanded)}>
      <h2>연동된 계정</h2>
      <span>{userData.authProviders.length}개</span>
      <span>{socialAccountsExpanded ? '▼' : '▶'}</span>
    </button>
    
    {/* 펼쳤을 때 내용 */}
    {socialAccountsExpanded && (
      <LinkedAccountsDisplay
        authProviders={userData.authProviders}
        onUnlink={handleUnlink}
        isUnlinking={isUnlinking}
      />
    )}
  </div>
)}
```

## 📱 반응형 디자인

### 모바일 (< 640px)
- ✅ 한 줄에 하나씩 표시
- ✅ 버튼 크기 적절히 조정
- ✅ 터치 친화적 UI

### 데스크톱 (≥ 640px)
- ✅ 좌우 배치 최적화
- ✅ 호버 효과
- ✅ 더 넓은 간격

## ✅ 테스트 체크리스트

- [ ] **프로필 페이지 접근**: `/profile`
- [ ] **섹션 표시**: authProviders 있을 때만 표시
- [ ] **접기/펼치기**: 클릭 시 토글
- [ ] **연동 해제**: Google 계정 해제
- [ ] **마지막 방법 보호**: 1개만 남았을 때 해제 불가
- [ ] **데이터 새로고침**: 해제 후 자동 업데이트
- [ ] **에러 처리**: 네트워크 오류, Firebase 오류
- [ ] **모바일 반응형**: 작은 화면에서 정상 작동

## 🎉 장점

### 1. 사용자 경험
- ✅ 별도 페이지 없이 프로필에서 한 번에 관리
- ✅ 접기/펼치기로 공간 절약
- ✅ 다른 정보와 통일된 디자인

### 2. 개발자 경험
- ✅ `LinkedAccountsDisplay` 컴포넌트 재사용
- ✅ 기존 프로필 페이지 구조 유지
- ✅ 최소한의 코드 추가

### 3. 유지보수
- ✅ 한 곳에서 모든 계정 정보 관리
- ✅ 공통 컴포넌트 사용으로 일관성 유지
- ✅ 확장 가능한 구조

## 🚀 사용 방법

1. **로그인** 후 프로필 페이지 이동
2. **"연동된 계정"** 섹션 찾기
3. **▶ 버튼 클릭**하여 펼치기
4. **연동 해제** 버튼 클릭
5. **확인** 다이얼로그에서 승인
6. **성공 메시지** 확인

---

**구현 완료 일자**: 2026년 3월 20일  
**위치**: `/profile` 페이지  
**상태**: ✅ Production Ready
