# 모노레포 아키텍처 강화 규칙

## 🏗️ 모노레포 구조 보호 (CRITICAL)

Cursor Agent가 코드를 수정하거나 추가할 때 **반드시 준수해야 할 모노레포 규칙**입니다.

### 📂 패키지 구조 (절대 변경 금지)

```
smis-mentor/
├── packages/
│   ├── web/          # Next.js 웹 애플리케이션
│   ├── mobile/       # Expo 모바일 앱  
│   └── shared/       # 공유 라이브러리
├── functions/        # Firebase Cloud Functions
├── .github/          # CI/CD 워크플로
└── package.json      # 루트 패키지 (workspaces 설정)
```

### 🚫 의존성 방향 규칙 (절대 위반 금지)

#### ✅ 허용되는 의존성 방향
- `packages/web` → `packages/shared` ✅
- `packages/mobile` → `packages/shared` ✅ 
- `functions` → `packages/shared` ✅

#### ❌ 금지되는 의존성 방향
- `packages/shared` → `packages/web` ❌
- `packages/shared` → `packages/mobile` ❌
- `packages/web` ↔ `packages/mobile` ❌

### 📋 코드 배치 의무사항

#### packages/shared에 **반드시** 배치해야 할 코드

1. **타입 정의**
   ```typescript
   // ✅ packages/shared/src/types/user.ts
   export interface User {
     id: string;
     name: string;
     role: UserRole;
   }
   ```

2. **비즈니스 로직**
   ```typescript
   // ✅ packages/shared/src/services/evaluation.ts
   export function calculateTotalScore(scores: EvaluationScore[]): number {
     return scores.reduce((sum, score) => sum + score.value, 0);
   }
   ```

3. **Firebase 서비스 함수**
   ```typescript
   // ✅ packages/shared/src/services/firebase/userService.ts
   export async function getUserById(userId: string): Promise<User> {
     const userDoc = await getDoc(doc(db, 'users', userId));
     return userDoc.data() as User;
   }
   ```

4. **유틸리티 함수**
   ```typescript
   // ✅ packages/shared/src/utils/phoneUtils.ts
   export function formatPhoneNumber(phone: string): string {
     return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
   }
   ```

5. **상수 및 열거형**
   ```typescript
   // ✅ packages/shared/src/constants/roles.ts
   export const USER_ROLES = ['mentor', 'foreign', 'admin'] as const;
   export type UserRole = typeof USER_ROLES[number];
   ```

#### packages/shared에서 **절대 금지**되는 코드

1. **플랫폼 특화 라이브러리**
   ```typescript
   // ❌ 웹 전용
   import { toast } from 'react-hot-toast';
   import { useRouter } from 'next/navigation';
   
   // ❌ 모바일 전용  
   import { Alert } from 'react-native';
   import { useNavigation } from '@react-navigation/native';
   ```

2. **UI 컴포넌트**
   ```typescript
   // ❌ shared에서 UI 컴포넌트 금지
   export function Button({ children }: { children: ReactNode }) {
     return <button>{children}</button>; // 플랫폼별로 다름
   }
   ```

3. **플랫폼별 API 호출**
   ```typescript
   // ❌ fetch 직접 사용 금지 (웹 전용일 수 있음)
   export async function apiCall() {
     return fetch('/api/users'); // Next.js API 경로
   }
   ```

### 🔄 중복 코드 감지 및 리팩토링

Agent가 코드 작성 시 **자동으로 체크해야 할 사항**:

#### 1. 중복 로직 감지
```typescript
// Before: 웹과 모바일에 동일 로직 존재
// packages/web/src/utils/evaluation.ts
function calculateScore(scores: number[]) { ... }

// packages/mobile/src/utils/evaluation.ts  
function calculateScore(scores: number[]) { ... }

// After: shared로 즉시 이동
// packages/shared/src/services/evaluation/index.ts
export function calculateTotalScore(scores: EvaluationScore[]): number { ... }
```

#### 2. 플랫폼 중립적 구현 원칙
```typescript
// ✅ shared에서 플랫폼 중립적 구현
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// ✅ 플랫폼별 구현은 각 패키지에서
// packages/web/src/utils/notification.ts
export function showNotification(message: string) {
  toast.success(message); // 웹용
}

// packages/mobile/src/utils/notification.ts
export function showNotification(message: string) {
  Alert.alert('알림', message); // 모바일용
}
```

### 📦 패키지 관리 규칙

#### 1. 의존성 설치 위치

```json
// ✅ 루트 package.json - 개발 도구
{
  "devDependencies": {
    "typescript": "^5.3.3",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "prettier": "^3.0.0"
  }
}

// ✅ packages/web/package.json - 웹 전용
{
  "dependencies": {
    "next": "^16.2.4",
    "react": "19.1.0",
    "react-hot-toast": "^2.4.1"
  }
}

// ✅ packages/mobile/package.json - 모바일 전용  
{
  "dependencies": {
    "expo": "~52.0.0",
    "react-native": "0.81.5",
    "@react-navigation/native": "^6.1.0"
  }
}

// ✅ packages/shared/package.json - 플랫폼 공통
{
  "dependencies": {
    "firebase": "^11.5.0",
    "zod": "^3.22.0"
  }
}
```

#### 2. 내부 패키지 참조 (file: 프로토콜 사용)
```json
// ✅ 올바른 내부 참조
{
  "dependencies": {
    "@smis-mentor/shared": "file:../shared"
  }
}

// ❌ 절대 경로 사용 금지
{
  "dependencies": {
    "@smis-mentor/shared": "/absolute/path/to/shared"
  }
}
```

### 🔧 빌드 시스템 보호

#### 1. 빌드 순서 의존성 (절대 변경 금지)
```json
// 루트 package.json 스크립트 (순서 중요!)
{
  "scripts": {
    "dev:setup": "npm run build:shared",
    "build:shared": "npm run build --workspace=packages/shared",
    "build:web": "npm run build:shared && npm run build --workspace=packages/web",
    "build:functions": "npm run build:shared && npm run build --workspace=functions",
    "build:all": "npm run build:shared && npm run build:parallel",
    "build:parallel": "npm-run-all -p build:web:only build:functions:only"
  }
}
```

#### 2. TypeScript 설정 계층 (절대 변경 금지)
```
tsconfig.json (루트 - 기본 설정)
├── packages/shared/tsconfig.json (extends 루트)
├── packages/web/tsconfig.json (extends 루트 + Next.js 설정)
├── packages/mobile/tsconfig.json (extends 루트 + Expo 설정)
└── functions/tsconfig.json (extends 루트 + Node.js 설정)
```

### 🚨 Agent 체크리스트

코드 작성/수정 시 Agent가 **반드시 확인해야 할 사항**:

#### ✅ 작업 전 체크
1. **파일 위치 확인**: 새 코드가 올바른 패키지에 위치하는가?
2. **의존성 방향 검증**: shared → web/mobile 의존성이 없는가?
3. **중복 코드 검사**: 다른 패키지에 유사한 로직이 있는가?
4. **플랫폼 중립성**: shared 코드가 플랫폼 특화 라이브러리를 사용하지 않는가?

#### ✅ 작업 후 검증
1. **빌드 테스트**: `npm run build:all`이 성공하는가?
2. **타입 체크**: `npm run type-check`가 통과하는가?
3. **린트 검사**: `npm run lint`가 통과하는가?
4. **의존성 검토**: package.json에 불필요한 의존성이 추가되지 않았는가?

### 🔒 위반 시 대응

Agent가 모노레포 규칙을 위반하려 할 때:

1. **즉시 중단**: 작업을 중단하고 올바른 위치로 이동
2. **명시적 경고**: 사용자에게 모노레포 규칙 위반 사실 알림
3. **대안 제시**: 올바른 구현 방법 제안
4. **리팩토링 권장**: 기존 중복 코드가 있다면 shared로 이동 제안

### 📝 예시: 올바른 Agent 응답

```
❌ 사용자 요청: "웹과 모바일에 사용자 검증 로직을 추가해주세요"

🚨 모노레포 규칙 위반 감지!
- 동일한 로직을 두 패키지에 중복 생성하는 것은 금지됩니다.
- 대신 packages/shared에 공통 로직을 생성하겠습니다.

✅ 올바른 구현:
1. packages/shared/src/services/user/validation.ts - 검증 로직
2. packages/web에서 import하여 사용
3. packages/mobile에서 import하여 사용
```

### 🎯 결론

이 규칙들은 **모노레포 아키텍처의 일관성과 안정성**을 보장하기 위한 필수 조건입니다. Agent는 모든 코드 작성 시 이 규칙들을 자동으로 적용하여, SMIS Mentor 프로젝트의 구조적 무결성을 유지해야 합니다.