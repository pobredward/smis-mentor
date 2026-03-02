# TypeScript 경로 별칭 "@/" 오류 해결

## 문제
Monorepo 구조로 전환 후 `@/` 경로 별칭이 작동하지 않음

## 해결 완료 ✅

### 1. packages/web/tsconfig.json 생성
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@smis-mentor/shared": ["../shared/src"]
    }
  }
}
```

### 2. Next.js 설정 업데이트
```typescript
// packages/web/next.config.ts
transpilePackages: ['@smis-mentor/shared']
```

## 사용 가능한 경로

### 웹 앱 내부 import
```typescript
import Layout from '@/components/common/Layout';
import { getUserById } from '@/lib/firebaseService';
import type { User } from '@/types';
```

### Shared 패키지 import
```typescript
import { STSheetStudent, STSheetService } from '@smis-mentor/shared';
```

## 다음 단계

1. **VSCode 재시작** (TypeScript 서버 재시작)
   - Cmd + Shift + P → "TypeScript: Restart TS Server"

2. **개발 서버 재시작**
   ```bash
   npm run dev:web
   ```

3. **빌드 테스트**
   ```bash
   npm run build:web
   ```

## 확인 사항

✅ packages/web/tsconfig.json 생성됨
✅ baseUrl과 paths 설정됨
✅ Next.js transpilePackages 설정됨

이제 "@/" 경로가 정상적으로 작동해야 합니다!
