# 평가자 이름 기본값 개선 완료

## 📋 수정 사항

### ✅ 평가자 이름 기본값을 현재 로그인한 사용자 이름으로 변경

**파일**: `/packages/mobile/src/screens/ApplicantDetailScreen.tsx`

### 변경 전
```typescript
<EvaluationForm
  targetUserId={application.user.userId}
  targetUserName={application.user.name}
  evaluatorId=""
  evaluatorName="관리자"  // 하드코딩된 "관리자"
  evaluationStage={selectedEvaluationStage}
  // ...
/>
```

### 변경 후
```typescript
<EvaluationForm
  targetUserId={application.user.userId}
  targetUserName={application.user.name}
  evaluatorId={auth.currentUser?.uid || ''}
  evaluatorName={currentUser?.name || '관리자'}  // 현재 로그인한 사용자 이름
  evaluationStage={selectedEvaluationStage}
  // ...
/>
```

---

## 🔧 구현 상세

### 1. Import 추가
```typescript
import { db, auth } from '../config/firebase';
```

### 2. 상태 추가
```typescript
// 현재 로그인한 사용자 정보
const [currentUser, setCurrentUser] = useState<{ name: string } | null>(null);
```

### 3. 사용자 정보 로드 함수
```typescript
// 현재 로그인한 사용자 정보 로드
const loadCurrentUser = async () => {
  try {
    const currentAuthUser = auth.currentUser;
    if (currentAuthUser) {
      const userData = await getUserById(db, currentAuthUser.uid);
      if (userData && userData.name) {
        setCurrentUser({ name: userData.name });
      } else {
        setCurrentUser({ name: '관리자' });
      }
    } else {
      setCurrentUser({ name: '관리자' });
    }
  } catch (error) {
    console.error('현재 사용자 정보 로드 오류:', error);
    setCurrentUser({ name: '관리자' });
  }
};
```

### 4. useEffect 수정
```typescript
useEffect(() => {
  loadData();
  loadCurrentUser();  // 사용자 정보 로드 추가
}, [loadData]);
```

### 5. EvaluationForm에 전달
```typescript
evaluatorId={auth.currentUser?.uid || ''}
evaluatorName={currentUser?.name || '관리자'}
```

---

## ✅ Web과의 일관성

### Web 로직 (참고)
```typescript
// EvaluationStageCards.tsx (Web)
export default function EvaluationStageCards({ 
  userId, 
  targetUserName, 
  evaluatorName,  // props로 받음
  // ...
}) {
  // ...
  const formData: EvaluationFormData = {
    // ...
    evaluatorName: evaluatorName  // 기본값으로 설정
  };
}
```

**Web에서의 호출**:
- ApplicantsManageClient에서 `evaluatorName={session.user.name}` 형태로 전달
- 현재 로그인한 사용자의 이름을 사용

**Mobile 구현**:
- Web과 동일하게 현재 로그인한 사용자의 이름을 기본값으로 사용
- `auth.currentUser`를 통해 사용자 정보 획득
- `getUserById`로 사용자 상세 정보 조회
- fallback: 사용자 정보가 없으면 "관리자"로 표시

---

## 🎯 동작 흐름

1. **화면 로드**:
   - `ApplicantDetailScreen` 마운트
   - `useEffect`에서 `loadData()` 및 `loadCurrentUser()` 실행

2. **사용자 정보 로드**:
   - `auth.currentUser`에서 현재 인증된 사용자 UID 획득
   - `getUserById(db, uid)`로 Firestore에서 사용자 정보 조회
   - `userData.name`을 `currentUser` 상태에 저장

3. **평가 추가 버튼 클릭**:
   - `EvaluationForm` 모달 열림
   - `evaluatorName`에 `currentUser?.name || '관리자'` 전달

4. **평가 폼에서**:
   - 입력 필드에 평가자 이름 표시 (기본값: 현재 사용자 이름)
   - 사용자가 필요시 수정 가능
   - 저장 시 입력된 평가자 이름으로 저장

---

## 🔍 에러 처리

### 사용자 정보 로드 실패 시
```typescript
catch (error) {
  console.error('현재 사용자 정보 로드 오류:', error);
  setCurrentUser({ name: '관리자' });  // Fallback
}
```

### 사용자가 로그인하지 않은 경우
```typescript
if (!currentAuthUser) {
  setCurrentUser({ name: '관리자' });
}
```

### 사용자 이름이 없는 경우
```typescript
if (userData && userData.name) {
  setCurrentUser({ name: userData.name });
} else {
  setCurrentUser({ name: '관리자' });
}
```

---

## 📱 사용자 경험

### 변경 전
- ❌ 평가자 이름이 항상 "관리자"로 표시
- ❌ 누가 평가했는지 구별 어려움
- ❌ 매번 평가자 이름을 수동으로 입력해야 함

### 변경 후
- ✅ 평가자 이름이 자동으로 본인 이름으로 설정
- ✅ 평가자 구별 용이
- ✅ 이름 수정 가능 (필요시)
- ✅ Web과 동일한 사용자 경험

---

## 🎨 UI 변화

### EvaluationForm
```
┌─────────────────────────────────────┐
│  평가자 이름 *                      │
│  ┌───────────────────────────────┐ │
│  │ 홍길동                        │ │  ← 자동으로 로그인한 사용자 이름
│  └───────────────────────────────┘ │
└─────────────────────────────────────┘
```

### 평가 목록
```
┌─────────────────────────────────────┐
│  📝 평가자: 홍길동                  │  ← 본인 이름으로 표시
│  📅 2024.02.28                      │
│  ⭐ 8.5점                           │
└─────────────────────────────────────┘
```

---

## ✅ 테스트 체크리스트

- [x] 로그인한 사용자 이름이 기본값으로 설정되는지 확인
- [x] 사용자 정보가 없을 때 "관리자"로 fallback되는지 확인
- [x] 로그인하지 않은 경우 "관리자"로 표시되는지 확인
- [x] 평가자 이름 수정 가능한지 확인
- [x] 저장 시 수정된 이름이 반영되는지 확인
- [x] Web과 동일한 동작인지 확인

---

## 🚀 추가 개선 사항 (선택)

1. **평가자 역할 추가**:
   - 사용자 역할에 따라 "관리자", "팀장", "매니저" 등 표시
   - `userData.role`을 활용

2. **평가자 프로필 연동**:
   - 평가자 아바타 클릭 시 프로필 상세 보기
   - 평가자의 다른 평가 이력 확인

3. **평가자 권한 관리**:
   - 특정 역할만 평가 추가 가능하도록 제한
   - 본인이 작성한 평가만 수정/삭제 가능

4. **평가자 통계**:
   - 평가자별 평균 점수
   - 평가 횟수
   - 평가 경향 분석

---

## 📝 관련 파일

- `/packages/mobile/src/screens/ApplicantDetailScreen.tsx` - 수정됨
- `/packages/mobile/src/components/EvaluationForm.tsx` - 변경 없음 (props로 받음)
- `/packages/mobile/src/config/firebase.ts` - 변경 없음 (auth export 확인)
- `/packages/shared/src/services/user/index.ts` - 변경 없음 (getUserById 사용)

---

## 🎉 결론

평가자 이름 기본값이 Web과 동일하게 현재 로그인한 사용자의 이름으로 설정되도록 개선되었습니다. 이를 통해:

1. **사용자 편의성 향상**: 매번 이름을 입력할 필요 없음
2. **데이터 정확성 향상**: 실제 평가자 이름이 자동으로 기록됨
3. **Web과 일관성**: 동일한 사용자 경험 제공
4. **에러 처리 강화**: Fallback 메커니즘으로 안정성 확보
