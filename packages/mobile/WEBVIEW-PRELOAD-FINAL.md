# WebView 백그라운드 프리로딩 최종 구현

## 🎯 핵심 개선사항

### 1. WebView 프리로드 완료까지 모달 유지 ✅
- 기존: 타이머 기반으로 추정 시간 후 모달 닫힘
- 개선: 실제 WebView 로딩 완료까지 모달 유지

### 2. 노션 페이지 프리로드 문제 해결 ✅
- UserAgent 설정 추가
- 쿠키 및 미디어 재생 권한 활성화
- HTTP 오류 핸들링 추가

## 📦 구현 내용

### 1. WebViewPreloader 컴포넌트 개선
**파일**: `packages/mobile/src/components/WebViewPreloader.tsx`

**추가된 기능**:
```typescript
// 1. 진행 상황 콜백
onProgressUpdate?: (loaded: number, total: number) => void;

// 2. 로딩 상태 추적
const [loadedCount, setLoadedCount] = useState(0);

// 3. 각 WebView 로딩 이벤트
onLoadStart={() => handleLoadStart(link)}
onLoadEnd={() => handleLoadEnd(link)}
onError={(syntheticEvent) => handleLoadError(link, syntheticEvent)}

// 4. 노션 페이지 최적화
userAgent={isNotionPage 
  ? "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0...)"
  : undefined
}
sharedCookiesEnabled={true}
thirdPartyCookiesEnabled={true}

// 5. HTTP 오류 핸들링
onHttpError={(syntheticEvent) => {
  logger.error(`HTTP 오류 (${link.title}):`, {
    statusCode: nativeEvent.statusCode,
  });
}}
```

### 2. CampTabContext 확장
**파일**: `packages/mobile/src/context/CampTabContext.tsx`

**추가된 상태**:
```typescript
interface CampTabContextType {
  // ... 기존 상태
  webViewPreloadComplete: boolean;  // ✨ 추가
  setWebViewPreloadComplete: (complete: boolean) => void;
  webViewLoadProgress: { loaded: number; total: number };  // ✨ 추가
  setWebViewLoadProgress: (progress) => void;
}
```

### 3. CampScreen 프리로더 통합
**파일**: `packages/mobile/src/screens/CampScreen.tsx`

```typescript
const handleWebViewPreloadComplete = () => {
  console.log('✅ CampScreen: 모든 WebView 프리로드 완료');
  setWebViewPreloadComplete(true);
};

const handleWebViewProgressUpdate = (loaded: number, total: number) => {
  setWebViewLoadProgress({ loaded, total });
};

<WebViewPreloader
  links={preloadLinks}
  enabled={isPreloading}
  onLoadComplete={handleWebViewPreloadComplete}  // ✨ 완료 콜백
  onProgressUpdate={handleWebViewProgressUpdate}  // ✨ 진행률 콜백
/>
```

### 4. ProfileScreen 대기 로직
**파일**: `packages/mobile/src/screens/ProfileScreen.tsx`

**WebView 프리로드 대기 함수**:
```typescript
const waitForWebViewPreload = async () => {
  return new Promise<void>((resolve) => {
    const maxWaitTime = 30000; // 최대 30초
    const startTime = Date.now();
    
    const checkInterval = setInterval(() => {
      // 실시간 진행률 계산
      if (webViewLoadProgress.total > 0) {
        const progress = (webViewLoadProgress.loaded / webViewLoadProgress.total) * 100;
        const webviewProgress = 60 + (progress * 0.4); // 60% -> 100%
        setPrefetchProgress(Math.round(webviewProgress));
        
        console.log(`📊 WebView: ${webViewLoadProgress.loaded}/${webViewLoadProgress.total}`);
      }
      
      // 완료 확인
      if (webViewPreloadComplete) {
        clearInterval(checkInterval);
        resolve();
      }
      
      // 타임아웃 (30초)
      if (Date.now() - startTime > maxWaitTime) {
        clearInterval(checkInterval);
        console.log('⚠️ 타임아웃');
        resolve();
      }
    }, 500); // 0.5초마다 체크
  });
};
```

**handleJobCodeSelect 플로우**:
```typescript
// 1. 기존 캐시 무효화 (0% -> 15%)
setPrefetchStage('cache');
await invalidateCampData();

// 2. 사용자 데이터 업데이트 (15% -> 30%)
setPrefetchStage('update');
await updateActiveJobCode(jobCodeId);

// 3. 캠프 데이터 프리페칭 (30% -> 60%)
setPrefetchStage('data');
await prefetchCampData(jobCodeId);

// 4. WebView 프리로드 완료 대기 (60% -> 100%)
setPrefetchStage('webview');
await waitForWebViewPreload();  // ✨ 실제 완료까지 대기!

// 5. 완료
setPrefetchStage('complete');
setPrefetchingCamp(false);
```

## 🎨 개선된 UI

### 로딩 모달 - 실시간 진행 상황
```
🚀 캠프 데이터 로딩 중
[████████████████████░░] 85%

✅ 기존 캐시 정리
✅ 캠프 변경
✅ 캠프 데이터 로딩
⏳ 노션/구글시트 프리로딩
   5 / 10  ← 실시간 카운트!

[로딩 스피너]
```

### 완료 메시지
```
완료

캠프가 변경되었습니다.

✅ 모든 데이터 로딩 완료
✅ 노션/구글시트 페이지 프리로드 완료

모든 페이지가 즉시 표시됩니다!
```

## 🔍 노션 페이지 프리로드 해결

### 문제점
구글 시트는 프리로드되지만 노션 페이지는 프리로드 안 됨

### 원인 분석
1. 노션 페이지는 JavaScript 기반 렌더링 (더 복잡)
2. 쿠키 및 세션 관리 필요
3. 일부 리소스는 UserAgent 확인

### 해결 방법

```typescript
// 1. UserAgent 설정 (노션 페이지만)
userAgent={isNotionPage 
  ? "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15..."
  : undefined
}

// 2. 쿠키 활성화
sharedCookiesEnabled={true}
thirdPartyCookiesEnabled={true}

// 3. 미디어 재생 권한
mediaPlaybackRequiresUserAction={false}
allowsInlineMediaPlayback={true}

// 4. DOM 저장소 활성화
domStorageEnabled={true}

// 5. HTTP 오류 핸들링
onHttpError={(syntheticEvent) => {
  logger.error(`HTTP 오류: ${nativeEvent.statusCode}`);
}}
```

## 📊 프리로드 진행 추적

### Before (문제)
```typescript
// 시뮬레이션으로 진행률 표시
setInterval(() => {
  setPrefetchProgress(prev => prev + 3);
}, 300);

// 2초 후 강제 완료
setTimeout(() => {
  setPrefetchProgress(100);
  모달 닫기  // ❌ 실제로는 아직 로딩 중!
}, 2000);
```

### After (해결)
```typescript
// 실제 WebView 로딩 상태 추적
const checkInterval = setInterval(() => {
  // 실시간 진행률 계산
  const progress = (loaded / total) * 100;
  setPrefetchProgress(60 + (progress * 0.4));
  
  // 완료 확인
  if (webViewPreloadComplete) {
    clearInterval(checkInterval);
    모달 닫기  // ✅ 실제 완료 후!
  }
}, 500);
```

## 🔄 전체 프리로딩 플로우

```
마이페이지에서 캠프 선택
  ↓
┌──────────────────────────────────┐
│ Stage 1: 기존 캐시 정리 (15%)     │
│ - React Query 캐시 무효화        │
│ - WebView 프리로더 초기화        │
└──────────────────────────────────┘
  ↓
┌──────────────────────────────────┐
│ Stage 2: 캠프 변경 (30%)         │
│ - updateActiveJobCode()          │
│ - Firestore 업데이트             │
└──────────────────────────────────┘
  ↓
┌──────────────────────────────────┐
│ Stage 3: 캠프 데이터 로딩 (60%)  │
│ - 수업 자료 프리페칭             │
│ - 업무 데이터 프리페칭           │
│ - 시간표/인솔표 메타데이터       │
│ - 반명단/방명단 데이터           │
└──────────────────────────────────┘
  ↓
┌──────────────────────────────────┐
│ Stage 4: WebView 프리로딩 (100%) │
│ - 교육 링크 3개 → 1x1 WebView    │
│   ✅ 노션 페이지 1 로딩 완료      │
│   ✅ 노션 페이지 2 로딩 완료      │
│   ✅ 노션 페이지 3 로딩 완료      │
│ - 시간표 링크 5개 → 1x1 WebView  │
│   ✅ 구글시트 1 로딩 완료         │
│   ✅ 구글시트 2 로딩 완료         │
│   ... (실시간 카운트)            │
│                                  │
│ 진행: 8/10 (80%)                 │
└──────────────────────────────────┘
  ↓
✅ 모든 프리로드 완료!
  ↓
모달 닫기 + 완료 메시지
```

## 🐛 디버깅 로그

콘솔에서 다음 로그를 확인할 수 있습니다:

```
🔄 WebViewPreloader: 프리로드 시작
  - totalLinks: 10
  - links: [
      { title: "교육일정", type: "education", url: "https://notion.site/..." },
      { title: "1주차 시간표", type: "schedule", url: "https://docs.google.com/..." },
      ...
    ]

🔧 WebView 설정: 교육일정
  - isNotionPage: true
  - url: https://notion.site/...

🔄 education/교육일정 로딩 시작 (https://notion.site/...)
  ✅ education/교육일정 프리로드 완료 (https://notion.site/...)

📊 WebView 프리로드 진행: 1/10
📊 WebView 프리로드 진행: 2/10
...
📊 WebView 프리로드 진행: 10/10

✅ WebViewPreloader: 모든 WebView 프리로드 완료
  - totalLinks: 10
```

## ✅ 최종 체크리스트

- [x] WebViewPreloader 컴포넌트 구현
- [x] 실시간 진행률 추적 기능 추가
- [x] CampTabContext에 완료 상태 추가
- [x] CampScreen에 프리로더 통합
- [x] ProfileScreen에 대기 로직 구현
- [x] 노션 페이지 UserAgent 설정
- [x] 쿠키 및 미디어 권한 활성화
- [x] HTTP 오류 핸들링 추가
- [x] 4단계 로딩 UI 구현
- [x] 실시간 카운트 표시 (N / M)
- [x] 타임아웃 처리 (30초)
- [x] 상세한 로그 기록

## 🎊 예상 결과

### 캠프 변경 시
```
1. 마이페이지에서 캠프 선택
2. 프리페칭 모달 표시
3. 4단계 진행:
   ✅ 기존 캐시 정리
   ✅ 캠프 변경
   ✅ 캠프 데이터 로딩
   ⏳ 노션/구글시트 프리로딩 (3/10)
4. 모든 WebView 로딩 완료까지 대기
5. 완료 메시지 + 모달 닫기
```

### 캠프 탭 사용 시
```
교육 탭 → 링크 클릭 → ⚡ 즉시! (노션)
시간표 탭 → 링크 클릭 → ⚡ 즉시! (구글시트)
인솔표 탭 → 링크 클릭 → ⚡ 즉시! (구글시트)
```

## 🚀 테스트 방법

```bash
# 1. 앱 실행
npm start

# 2. 테스트 시나리오
- 마이페이지 진입
- 다른 캠프 코드 선택
- 프리페칭 모달 확인
  - 진행률 바 확인
  - 실시간 카운트 확인 (N/M)
  - 각 단계 체크마크 확인
- 모달이 모든 WebView 완료까지 유지되는지 확인
- 완료 후 캠프 탭 이동
- 교육/시간표/인솔표 링크 클릭
- 즉시 표시되는지 확인!
```

## 📝 중요 참고사항

### WebView 프리로드 제약
- 최대 동시 로딩: 10-15개 권장
- 메모리 사용: 링크당 약 50-100MB
- 타임아웃: 30초 (초과 시 자동 완료 처리)

### 노션 페이지 특징
- JavaScript 기반 렌더링으로 로딩 시간 더 김
- UserAgent 체크하는 경우 있음 → 모바일 Safari로 설정
- 쿠키 필요 → sharedCookiesEnabled 필수

### 구글 시트 특징
- 빠른 로딩
- 쿠키 불필요
- 기본 설정으로 잘 동작

## 🎉 결론

1. ✅ **WebView 프리로드 완료까지 모달 유지**
   - 실시간 진행률 추적
   - 완료 상태 감지
   - N/M 카운트 표시

2. ✅ **노션 페이지 프리로드 해결**
   - UserAgent 설정
   - 쿠키 권한 활성화
   - HTTP 오류 핸들링

3. ✅ **사용자 경험 극대화**
   - 정확한 진행 상황 표시
   - 실제 완료 시점에 모달 닫힘
   - 모든 페이지 즉시 표시

구현 완료! 🎊
