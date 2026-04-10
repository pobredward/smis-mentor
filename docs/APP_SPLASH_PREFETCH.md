# 앱 로딩 화면 프리페칭 시스템

## 개요

모바일 앱 시작 시 스플래시 화면에서 캠프 데이터를 프리페칭하여 사용자 경험을 개선합니다.

## 구조

### 1. 네이티브 스플래시 → 커스텀 로딩 화면

**흐름:**
1. **네이티브 스플래시** (500ms): Expo의 네이티브 스플래시 이미지 표시
2. **커스텀 로딩 화면** (프리페칭 완료까지): 작은 로고 + 로딩 상태 + 랜덤 문구
3. **앱 진입**: 프리페칭 완료 후 부드럽게 페이드아웃

### 2. 프리페칭 단계

```
📦 캐시 정리 → 📦 캠프 데이터 → 📦 페이지 프리로드 → ✅ 완료
```

- **캐시 정리**: 기존 React Query 캐시 무효화
- **캠프 데이터**: 사용자의 활성 캠프 데이터 로딩
- **페이지 프리로드**: WebView 프리로드 (진행률 표시)

### 3. 로딩 문구 시스템

**관리:**
- 관리자 대시보드 → "앱 설정 관리" 메뉴
- Firebase Firestore: `appConfig/main` 문서
- 실시간 반영 (다음 앱 실행부터)

**랜덤 표시:**
- 앱 시작 시 문구 중 1개를 랜덤으로 선택
- 화면 하단에 표시

## 파일 구조

### Shared (packages/shared)
```
src/
├── types/
│   └── appConfig.ts          # 앱 설정 타입 정의
└── services/
    └── appConfigService.ts    # 앱 설정 CRUD 서비스
```

### Mobile (packages/mobile)
```
src/
├── components/
│   └── SplashPrefetchScreen.tsx  # 커스텀 로딩 화면
└── App.tsx                        # 프리페칭 트리거
```

### Web (packages/web)
```
src/
└── app/
    └── admin/
        └── app-config/
            └── page.tsx       # 앱 설정 관리 페이지
```

## 사용법

### 1. 초기 설정 (최초 1회)

**옵션 A: 스크립트 사용 (권장)**

```bash
# Firebase Admin SDK 서비스 계정 키가 필요합니다
# functions/serviceAccountKey.json 파일이 있어야 합니다

node scripts/init-app-config.js
```

**옵션 B: Firebase Console에서 수동 생성**

1. Firebase Console → Firestore Database
2. 컬렉션 생성: `appConfig`
3. 문서 ID: `main`
4. 필드 추가:
   ```
   loadingQuotes (array):
     - "오늘도 학생들과 함께 성장하는 하루 되세요 ✨"
     - "멘토링의 순간들이 모여 특별한 여름을 만듭니다 🌟"
     - (나머지 기본 문구들...)
   
   updatedAt (timestamp): 현재 시간
   updatedBy (string): "system"
   ```

**옵션 C: 웹 관리자 페이지에서 생성**

1. 웹 앱 접속 (관리자 계정)
2. 관리자 대시보드 → "앱 설정 관리"
3. 초기 로드 시 기본 문구가 자동으로 표시됨
4. "저장" 버튼 클릭

### 2. Firestore 보안 규칙 배포

```bash
firebase deploy --only firestore:rules
```

### 3. 관리자 - 로딩 문구 관리

1. 웹 앱 접속 (관리자 계정)
2. 관리자 대시보드 → "앱 설정 관리"
3. 문구 추가/삭제 후 저장

**권장 사항:**
- 긍정적이고 격려하는 문구
- 15-30자 내외 (너무 길지 않게)
- 이모지 활용 (선택 사항)

### 4. 개발자 - 프리페칭 커스터마이징

#### 최소 표시 시간 변경
```typescript
// packages/mobile/App.tsx
<SplashPrefetchScreen 
  onComplete={handleSplashComplete}
  minDisplayTime={1500}  // ms 단위
/>
```

#### 로딩 단계 추가
```typescript
// packages/mobile/src/components/SplashPrefetchScreen.tsx
const [loadingStage, setLoadingStage] = useState<
  '캐시 정리' | '캠프 데이터' | '페이지 프리로드' | '새로운 단계' | '완료'
>('캐시 정리');
```

## Firebase 구조

### Firestore 컬렉션

**appConfig/main**
```typescript
{
  loadingQuotes: string[];    // 로딩 문구 배열
  updatedAt: Timestamp;       // 최종 수정 시간
  updatedBy?: string;         // 수정한 관리자 ID
}
```

### 보안 규칙

```javascript
match /appConfig/{configId} {
  // 읽기: 인증된 사용자만
  allow read: if isSignedIn();

  // 생성/수정: Admin만
  allow create, update: if isAdmin();

  // 삭제: 금지
  allow delete: if false;
}
```

## 테스트

### 1. 로컬 테스트 (모바일)

```bash
cd packages/mobile
npm start

# iOS 시뮬레이터
i

# Android 에뮬레이터
a
```

**확인 사항:**
- [ ] 네이티브 스플래시 표시 (500ms)
- [ ] 커스텀 로딩 화면 페이드인
- [ ] 작은 로고 표시
- [ ] 로딩 단계 텍스트 변경
- [ ] 프로그레스 바 동작
- [ ] 랜덤 문구 표시 (하단)
- [ ] 완료 후 페이드아웃

### 2. 관리자 기능 테스트 (웹)

```bash
cd packages/web
npm run dev
```

**확인 사항:**
- [ ] `/admin/app-config` 접근 (관리자만)
- [ ] 현재 문구 목록 표시
- [ ] 새 문구 추가
- [ ] 문구 삭제
- [ ] 저장 버튼
- [ ] 기본값으로 초기화

### 3. 통합 테스트

1. 웹에서 문구 변경 후 저장
2. 모바일 앱 재시작
3. 새로운 문구가 랜덤으로 표시되는지 확인

## 트러블슈팅

### 문제: 스플래시가 즉시 사라짐

**원인:** 프리페칭이 빠르게 완료되어 최소 표시 시간이 적용되지 않음

**해결:**
```typescript
// App.tsx
minDisplayTime={2000}  // 2초로 증가
```

### 문제: 로딩 문구가 표시되지 않음

**원인:** Firebase 연결 실패 또는 appConfig 문서 없음

**해결:**
1. `scripts/init-app-config.js` 실행
2. Firestore 규칙 확인
3. 콘솔 로그 확인 (`logger.error`)

### 문제: 네이티브 스플래시와 커스텀 화면이 겹침

**원인:** `expo-splash-screen` 초기화 타이밍 문제

**해결:**
```typescript
// SplashPrefetchScreen.tsx
// preventAutoHideAsync()가 제대로 호출되었는지 확인
SplashScreen.preventAutoHideAsync().catch(() => {
  console.log('이미 숨겨진 스플래시');
});
```

## 성능 고려사항

### 1. 프리페칭 최적화

- **병렬 처리**: React Query의 `prefetchQuery`는 병렬로 실행됨
- **캐시 활용**: 이미 캐시된 데이터는 재사용
- **선택적 프리페칭**: 중요한 데이터만 프리페칭

### 2. 번들 크기

- `expo-splash-screen`: ~50KB (이미 포함됨)
- `getAppConfig` 서비스: ~2KB
- 추가 의존성 없음

### 3. 네트워크 사용량

- 로딩 문구: ~2KB (캐시 가능)
- 캠프 데이터: 변동적 (일반적으로 10-50KB)

## 향후 개선 사항

- [ ] 로딩 문구 다국어 지원 (원어민용)
- [ ] 로딩 문구 A/B 테스트
- [ ] 프리페칭 우선순위 설정 (관리자)
- [ ] 오프라인 모드 지원
- [ ] 애니메이션 개선 (Lottie 등)

## 관련 문서

- [Expo Splash Screen 공식 문서](https://docs.expo.dev/versions/latest/sdk/splash-screen/)
- [React Query Prefetching](https://tanstack.com/query/latest/docs/react/guides/prefetching)
- [Firebase Firestore 보안 규칙](https://firebase.google.com/docs/firestore/security/get-started)
