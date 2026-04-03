# WebView 프리로딩 무한반복 해결 및 중단 기능 추가

## 🐛 발견된 문제

### 1. WebView 프리로딩 타임아웃 무한반복
**증상**: 30초 타임아웃 후 계속 반복 실행됨

**원인**:
```typescript
// ❌ 문제 코드
useEffect(() => {
  if (loadedCount === links.length && loadedCount > 0 && enabled) {
    onLoadComplete?.(); // 이 함수가 매번 새로 생성되어 재실행 트리거
  }
}, [loadedCount, links.length, enabled, onLoadComplete, onProgressUpdate]);
// 의존성에 onLoadComplete가 있으면 부모 컴포넌트 리렌더링마다 재실행!
```

### 2. 모달 중단 불가
**문제**: 사용자가 프리로딩을 멈출 수 없음

## ✅ 해결 방법

### 1. 무한반복 방지

#### WebViewPreloader 수정
```typescript
// ✅ hasCompleted 플래그 추가
const [hasCompleted, setHasCompleted] = useState(false);

useEffect(() => {
  if (!enabled) {
    setHasCompleted(false); // enabled false 시 리셋
    return;
  }
  setHasCompleted(false); // 새로운 links 시작 시 리셋
}, [links, enabled]);

useEffect(() => {
  // 완료 확인 (한 번만 호출)
  if (loadedCount === links.length && loadedCount > 0 && enabled && !hasCompleted) {
    setHasCompleted(true);
    onLoadComplete?.();
  }
}, [loadedCount, links.length, enabled, hasCompleted]);
// onLoadComplete를 의존성에서 제거!
```

#### CampScreen 최적화
```typescript
// ✅ useCallback으로 함수 메모이제이션
const handleWebViewPreloadComplete = useCallback(() => {
  console.log('✅ CampScreen: 모든 WebView 프리로드 완료');
  setWebViewPreloadComplete(true);
}, [setWebViewPreloadComplete]);

const handleWebViewProgressUpdate = useCallback((loaded: number, total: number) => {
  setWebViewLoadProgress({ loaded, total });
}, [setWebViewLoadProgress]);
```

#### useCampDataPrefetch 강화
```typescript
// ✅ invalidateCampData에서 완료 상태도 초기화
const invalidateCampData = async () => {
  setPreloadLinks([]);
  setIsPreloading(false);
  setWebViewPreloadComplete(false); // 추가!
  
  await Promise.all([...]);
};
```

### 2. 모달 중단 기능 추가

#### ProfileScreen 수정
```typescript
// ✅ 중단 플래그 추가
const [prefetchCancelled, setPrefetchCancelled] = useState(false);

// ✅ 중단 핸들러
const handleCancelPrefetch = () => {
  Alert.alert(
    '프리로딩 중단',
    '캠프 데이터 프리로딩을 중단하시겠습니까?\n\n기본 데이터는 로드되지만 일부 페이지는 처음 접속 시 로딩이 필요할 수 있습니다.',
    [
      { text: '계속하기', style: 'cancel' },
      {
        text: '중단',
        style: 'destructive',
        onPress: () => {
          setPrefetchCancelled(true);
          setPrefetchingCamp(false);
          setChangingJobCode(false);
          invalidateCampData();
        },
      },
    ]
  );
};

// ✅ 각 단계에서 중단 체크
await invalidateCampData();
if (prefetchCancelled) return; // 중단됐으면 여기서 종료

await updateActiveJobCode(jobCodeId);
if (prefetchCancelled) return;

await prefetchCampData(jobCodeId);
if (prefetchCancelled) return;

await waitForWebViewPreload();
if (prefetchCancelled) return;
```

#### waitForWebViewPreload 수정
```typescript
// ✅ 중단 체크 추가
const checkInterval = setInterval(() => {
  // 중단 확인 (최우선)
  if (prefetchCancelled) {
    clearInterval(checkInterval);
    console.log('🛑 WebView 프리로드 중단됨');
    resolve();
    return;
  }
  
  // 완료 확인
  if (webViewPreloadComplete) {
    clearInterval(checkInterval);
    resolve();
  }
  
  // 타임아웃
  if (elapsed > maxWaitTime) {
    clearInterval(checkInterval);
    resolve();
  }
}, 500);
```

#### 모달 UI 수정
```typescript
// ✅ X 버튼 추가
<View style={styles.modalHeader}>
  <View style={styles.modalHeaderTop}>
    <Ionicons name="rocket" size={48} color="#3b82f6" />
    <TouchableOpacity 
      style={styles.closeButton}
      onPress={handleCancelPrefetch}
    >
      <Ionicons name="close" size={24} color="#64748b" />
    </TouchableOpacity>
  </View>
  <Text style={styles.modalTitle}>캠프 데이터 로딩 중</Text>
  <Text style={styles.modalSubtitle}>...</Text>
</View>
```

## 📊 개선 효과

### Before (문제)
```
프리로딩 시작
  ↓
30초 타임아웃
  ↓
onLoadComplete 호출
  ↓
부모 리렌더링
  ↓
onLoadComplete 새 함수 생성
  ↓
useEffect 재실행 ← 무한반복!
```

### After (해결)
```
프리로딩 시작
  ↓
hasCompleted = false
  ↓
모든 링크 로딩 완료
  ↓
hasCompleted = true
onLoadComplete 호출 (1회만!)
  ↓
이후 재실행 차단 ✅
```

## 🎮 사용자 경험

### 중단 기능 플로우
```
1. 프리로딩 모달 표시
   ┌─────────────────────┐
   │ 🚀  [X]             │ ← X 버튼 클릭 가능
   │ 캠프 데이터 로딩 중  │
   │ [████░░░] 45%       │
   └─────────────────────┘

2. X 버튼 클릭
   ↓
   "프리로딩을 중단하시겠습니까?"
   [계속하기] [중단]

3. [중단] 선택 시
   ↓
   - prefetchCancelled = true
   - 모든 진행 중인 작업 중단
   - 프리로더 정리
   - 모달 닫기
```

## 🔧 수정된 파일

1. **WebViewPreloader.tsx**
   - `hasCompleted` 플래그 추가
   - `onLoadComplete` 의존성 제거
   - 1회만 완료 콜백 호출 보장

2. **CampScreen.tsx**
   - `useCallback`으로 콜백 메모이제이션
   - 재렌더링 시 함수 재생성 방지

3. **CampTabContext.tsx**
   - `webViewPreloadComplete` 상태 추가
   - `webViewLoadProgress` 상태 추가
   - `setWebViewPreloadComplete` 함수 제공

4. **useCampDataPrefetch.ts**
   - `invalidateCampData`에서 `setWebViewPreloadComplete(false)` 추가
   - 완전한 초기화 보장

5. **ProfileScreen.tsx**
   - `prefetchCancelled` 플래그 추가
   - `handleCancelPrefetch` 함수 구현
   - 각 단계에서 중단 체크
   - 모달에 X 버튼 UI 추가
   - 스타일 추가 (`modalHeaderTop`, `closeButton`)

## 🎯 체크리스트

- [x] 무한반복 원인 파악 (`useEffect` 의존성)
- [x] `hasCompleted` 플래그 추가
- [x] `onLoadComplete` 의존성 제거
- [x] 콜백 함수 메모이제이션
- [x] 중단 플래그 추가 (`prefetchCancelled`)
- [x] 중단 핸들러 구현
- [x] 각 단계 중단 체크
- [x] 모달 X 버튼 UI 추가
- [x] 중단 확인 다이얼로그 추가
- [x] `invalidateCampData` 강화

## 🚀 예상 결과

1. ✅ **무한반복 해결**: 프리로딩이 정확히 1회만 실행되고 완료
2. ✅ **중단 가능**: 사용자가 언제든 X 버튼으로 중단 가능
3. ✅ **정확한 진행률**: 실시간 WebView 로딩 상태 반영
4. ✅ **타임아웃 정상화**: 30초 후 자동 완료, 재시작 없음

구현 완료! 🎊
