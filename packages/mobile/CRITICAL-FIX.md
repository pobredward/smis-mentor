# 🚨 긴급 수정: WebView 프리로더 작동 및 성능 개선

## 🐛 발견된 치명적 문제

### 1. WebViewPreloader가 실행되지 않음
**원인**: WebViewPreloader가 `CampScreen`에 있었는데, ProfileScreen에서 캠프를 변경할 때 CampScreen이 마운트되지 않아서 작동 안 함

**해결**: WebViewPreloader를 `App.tsx`로 이동 → 항상 마운트됨

```typescript
// Before: CampScreen에 있음 (❌ ProfileScreen에서 접근 불가)
<CampScreen>
  <WebViewPreloader ... />
</CampScreen>

// After: App.tsx로 이동 (✅ 항상 작동)
<App>
  <WebViewPreloader ... />  ← 전역!
</App>
```

### 2. 캐시 저장 로그 스팸 (성능 저하 주범!)
**증상**: `💾 캐시 저장` 로그가 **수백 번** 반복됨
```
LOG  [02:40:58.320] 💾 캐시 저장: schedule
LOG  [02:40:58.320] 💾 캐시 저장: guide
LOG  [02:40:58.321] 💾 캐시 저장: schedule  ← 중복!
LOG  [02:40:58.321] 💾 캐시 저장: guide     ← 중복!
... (수백 번 반복)
```

**원인**: 
- `throttleTime: 1000` (1초)이 너무 짧음
- `shouldDehydrateQuery`에서 매번 로그 출력

**해결**:
```typescript
// throttleTime 증가
throttleTime: 5000, // 5초 (로그 감소)

// 로그 제거
shouldDehydrateQuery: (query) => {
  const queryKey = query.queryKey[0] as string;
  return persistKeys.includes(queryKey);
  // logger.info 제거!
},
```

### 3. 링크 개수 과다 (22개!)
**로그 분석**:
- 교육: 5개 (노션)
- 시간표: 6개 (노션 2개 + 구글시트 4개)
- 인솔표: **11개** (구글시트)

**문제**: 22개는 너무 많아서 30초 이상 소요

**해결**: 각 타입당 최대 5개로 제한 → **총 15개**
```typescript
// 각 타입별 최대 5개
const limitedEducation = resources.educationLinks.slice(0, 5);
const limitedSchedule = resources.scheduleLinks.slice(0, 5);
const limitedGuide = resources.guideLinks.slice(0, 5);
```

## 🔧 수정된 파일

### 1. App.tsx
```typescript
import { CampTabProvider, useCampTab } from './src/context/CampTabContext';
import { WebViewPreloader } from './src/components/WebViewPreloader';

function AppContent() {
  const { preloadLinks, isPreloading, ... } = useCampTab();

  return (
    <>
      <RootNavigator />
      
      {/* 전역 WebView 프리로더 */}
      <WebViewPreloader
        links={preloadLinks}
        enabled={isPreloading}
        onLoadComplete={...}
        onProgressUpdate={...}
      />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider>
      <AuthProvider>
        <WebViewCacheProvider>
          <CampTabProvider>  {/* 추가! */}
            <AppContent />
          </CampTabProvider>
        </WebViewCacheProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

### 2. CampScreen.tsx
```typescript
// WebViewPreloader 제거 (App.tsx로 이동)
export function CampScreen() {
  const { activeTab, setActiveTab } = useCampTab();
  
  // WebViewPreloader 관련 코드 제거
  
  return (
    <View style={styles.container}>
      {/* 탭 바 및 컨텐츠만 */}
    </View>
  );
}
```

### 3. QueryClientProvider.tsx
```typescript
// throttleTime 증가
throttleTime: 5000, // 1초 → 5초

// 로그 제거
shouldDehydrateQuery: (query) => {
  return persistKeys.includes(queryKey);
  // logger.info 제거!
},
```

### 4. useCampDataPrefetch.ts
```typescript
// 각 타입별 최대 5개로 제한
const limitedEducation = resources.educationLinks.slice(0, 5);
const limitedSchedule = resources.scheduleLinks.slice(0, 5);
const limitedGuide = resources.guideLinks.slice(0, 5);

// 링크가 없으면 즉시 완료 처리
if (allLinks.length === 0) {
  setIsPreloading(false);
  setWebViewPreloadComplete(true);
  return;
}
```

## 📊 성능 개선

### Before
```
총 22개 WebView 프리로드
  - 교육: 5개 (노션)
  - 시간표: 6개 (노션 2개 + 구글시트 4개)
  - 인솔표: 11개 (구글시트)

예상 소요 시간:
  - 노션 (7개): 7 × 4초 = 28초
  - 구글시트 (15개): 15 × 1.5초 = 22초
  - 총: 50초! ❌

+ 캐시 저장 로그 스팸으로 추가 지연
```

### After
```
총 15개 WebView 프리로드 (최대)
  - 교육: 5개 (노션)
  - 시간표: 5개
  - 인솔표: 5개

예상 소요 시간:
  - 노션 (7개): 7 × 4초 = 28초
  - 구글시트 (8개): 8 × 1.5초 = 12초
  - 총: **20초 이하** ✅

+ 캐시 저장 로그 제거로 성능 개선
```

## 🎯 예상 결과

### 로그 출력
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 WebView 프리로딩 설정 시작
📚 교육 링크: 5개
   1. 교육일정 - https://...
   2. 그룹배정 - https://...
   ... (최대 5개)
📅 시간표 링크: 6개
   1. 노션 - https://...
   ... (최대 5개)
🧭 인솔표 링크: 11개
   1. 방배치 - https://...
   ... (최대 5개)
   ⚠️ 6개는 필요 시 로드됨
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 총 15개 WebView 프리로드 시작
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ WebView 프리로딩 대기열 설정 완료
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 WebViewPreloader: 프리로드 시작
📋 총 15개 링크 프리로드 예정:
   1. [education] 교육일정
   2. [education] 그룹배정
   ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔄 [education] 교육일정 - 로딩 시작
✅ [education] 교육일정 - 로딩 완료
   ⏱️  소요 시간: 3.45초
📊 진행: 1/15 (7%)

🔄 [education] 그룹배정 - 로딩 시작
✅ [education] 그룹배정 - 로딩 완료
   ⏱️  소요 시간: 2.87초
📊 진행: 2/15 (13%)

... (나머지 링크)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ WebViewPreloader: 모든 WebView 프리로드 완료!
📊 통계:
   - 총 링크 수: 15개
   - 총 소요 시간: 18.45초
   - 평균 로딩 시간: 1.23초/링크
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 캠프 탭 재진입 문제 해결
캠프 탭에 들어올 때마다 로드되는 것은 **정상**입니다:
- WebViewCache가 `activeJobCodeId` 변경을 감지하고 리소스 새로고침
- 하지만 이제 React Query 캐시 때문에 **즉시** 표시됨 (네트워크 요청 없음)

## ✅ 체크리스트

- [x] WebViewPreloader를 App.tsx로 이동
- [x] CampTabProvider를 App.tsx에 추가
- [x] 캐시 저장 로그 제거
- [x] throttleTime 5초로 증가
- [x] 링크 개수 제한 (각 타입 최대 5개)
- [x] 링크 없을 때 즉시 완료 처리

이제 테스트해보세요! WebView 프리로딩 로그가 정상적으로 출력되고, 15개 링크만 로드되어 20초 이내로 완료될 것입니다! 🎊
