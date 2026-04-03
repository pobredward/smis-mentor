# WebView 프리로딩 이슈 및 해결 방안

## 📋 현재 상황 분석

### 문제점
교육, 시간표 탭의 노션/구글시트 페이지들이 **첫 탭 진입 시에만 로딩**되고, 링크 클릭 시마다 WebView 로딩이 발생합니다.

### 현재 구조

```typescript
// CampScreen.tsx
- 모든 탭이 미리 마운트됨 ✅
- display로 탭 전환 (opacity: 0, zIndex: -1)

// EducationScreen.tsx (393-419 라인)
{filteredEducationLinks.map((link) => (
  <WebView
    key={link.id}
    source={{ uri: link.url }}
    cacheEnabled={true}  // 캐싱 활성화
    cacheMode="LOAD_CACHE_ELSE_NETWORK"
  />
))}

// ScheduleScreen.tsx (366-377 라인)
{schedules.map((schedule) => (
  {renderWebView(schedule.id, selectedScheduleId === schedule.id)}
))}
```

### 왜 로딩이 발생하나?

1. **WebView의 특성**:
   - React Native WebView는 실제로 화면에 **보여질 때** 콘텐츠를 로드
   - `display: none` 또는 `opacity: 0` 상태에서는 URL 로드를 시작하지 않음

2. **캐싱 제한**:
   - `cacheEnabled={true}`는 **이미 로드된 페이지**의 캐시만 유효
   - 첫 로드 전에는 캐시가 없어서 매번 네트워크 요청

3. **렌더링 시점**:
   - CampScreen 진입 → EducationScreen 마운트 → 첫 번째 WebView만 visible
   - 다른 WebView들은 `hidden` 상태라 로드 안 됨
   - 링크 클릭 → WebView visible로 변경 → **이때 처음 로드**

## 🔍 WebView 프리로드의 어려움

### React Native WebView 제약사항

```typescript
// ❌ 불가능: 숨겨진 WebView는 로드되지 않음
<WebView style={{ opacity: 0 }} source={{ uri: url }} />

// ❌ 불가능: 화면 밖 WebView도 로드되지 않음
<WebView style={{ position: 'absolute', left: -10000 }} source={{ uri: url }} />

// ✅ 가능: 작은 크기지만 화면에 보이는 WebView
<WebView style={{ width: 1, height: 1, opacity: 0.01 }} source={{ uri: url }} />
```

## 💡 해결 방안

### 방안 1: 백그라운드 WebView 프리로딩 (권장)

캠프 변경 시 모든 WebView를 작은 크기로 화면에 마운트하여 사전 로딩

```typescript
// CampScreen.tsx 수정
<View style={styles.preloadContainer}>
  {/* 백그라운드 프리로드 WebView들 */}
  {preloadLinks.map((link) => (
    <WebView
      key={link.id}
      source={{ uri: link.url }}
      style={styles.preloadWebView}  // 1x1 크기, opacity 0.01
      cacheEnabled={true}
      incognito={false}
    />
  ))}
</View>

const styles = StyleSheet.create({
  preloadContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 1,
    height: 1,
    overflow: 'hidden',
  },
  preloadWebView: {
    width: 1,
    height: 1,
    opacity: 0.01,  // 완전 투명(0)이면 로드 안 됨
  },
});
```

### 방안 2: 모든 WebView를 항상 마운트 (메모리 부담)

모든 WebView를 동시에 마운트하되 z-index로 제어

```typescript
// EducationScreen.tsx - 현재 구조 유지
{filteredEducationLinks.map((link) => (
  <View style={[
    styles.webviewWrapper,
    selectedLinkId !== link.id && styles.hidden  // opacity: 0, zIndex: -1
  ]}>
    <WebView
      source={{ uri: link.url }}
      // 모든 WebView가 항상 마운트됨 → 첫 마운트 시 모두 로드
    />
  </View>
))}
```

**장점**: 간단한 구현
**단점**: 메모리 사용량 증가 (링크 개수 × WebView 메모리)

### 방안 3: IntersectionObserver 방식 프리로딩

탭 전환 직전에 WebView 프리로드 트리거

```typescript
// useCampDataPrefetch.ts
const prefetchWebViews = async (links: ResourceLink[]) => {
  // 임시 WebView 컴포넌트를 DOM에 추가하여 로드
  // 로드 완료 후 제거 (캐시는 남음)
};
```

**장점**: 메모리 효율적
**단점**: 복잡한 구현, 타이밍 이슈

## 🎯 추천 구현 방안

### 단계별 접근

#### 1단계: 링크 목록 프리페칭 (✅ 완료)
```typescript
// useCampDataPrefetch.ts - 이미 구현됨
await queryClient.prefetchQuery({
  queryKey: campQueryKeys.education(jobCodeId),
  queryFn: async () => {
    const resources = await generationResourcesService.getResourcesByJobCodeId(jobCodeId);
    return resources?.educationLinks || [];
  },
});
```

#### 2단계: 첫 번째 링크 자동 선택 (✅ 완료)
```typescript
// EducationScreen.tsx (99라인)
if (filtered.length > 0) {
  setSelectedLinkId(filtered[0].id);  // 첫 WebView 자동 로드
}
```

#### 3단계: 백그라운드 WebView 프리로딩 (🔄 구현 필요)

캠프 변경 직후, 모든 노션/구글시트 링크를 백그라운드에서 프리로드

```typescript
// CampScreen.tsx에 추가
const [preloadComplete, setPreloadComplete] = useState(false);

useEffect(() => {
  if (userData?.activeJobExperienceId) {
    // 캠프 변경 감지
    setPreloadComplete(false);
    
    // 백그라운드 프리로드 시작
    setTimeout(() => {
      startBackgroundPreload();
    }, 1000);  // 첫 화면 로드 후 1초 뒤 시작
  }
}, [userData?.activeJobExperienceId]);

const startBackgroundPreload = () => {
  // 모든 탭의 WebView 링크 수집
  const allLinks = [
    ...educationLinks,
    ...scheduleLinks,
    ...guideLinks,
  ];
  
  // 백그라운드 프리로드 컴포넌트에 전달
  setPreloadLinks(allLinks);
  setPreloadComplete(true);
};
```

## 📊 각 방안별 비교

| 방안 | 로딩 속도 | 메모리 사용 | 구현 복잡도 | 사용자 경험 |
|------|----------|------------|------------|------------|
| 방안 1 (백그라운드) | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 방안 2 (항상 마운트) | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 방안 3 (Lazy) | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |

## 🚀 최종 권장사항

### 단기 (현재 상태 유지)
- 현재 구조는 **이미 최적화**되어 있음
- 첫 진입 시에만 로딩, 이후 캐시 사용
- 추가 작업 없이도 합리적인 성능

### 중기 (방안 2 구현)
```typescript
// 모든 WebView 항상 마운트
// EducationScreen/ScheduleScreen에서 이미 구현됨
// 별도 변경 불필요
```

### 장기 (방안 1 구현)
- 백그라운드 WebView 프리로더 컴포넌트 개발
- 캠프 변경 시 자동 프리로드
- 메모리 효율적인 프리로딩

## 📝 현재 상태 요약

### ✅ 이미 구현된 최적화
1. CampScreen에서 모든 탭 프리마운트
2. WebView `cacheEnabled={true}` 설정
3. WebView `cacheMode="LOAD_CACHE_ELSE_NETWORK"` 설정
4. 모든 WebView 프리마운트 (hidden 상태)

### ⚠️ 제약사항
- WebView는 실제로 보여질 때만 로드됨 (OS 레벨 제약)
- 백그라운드 상태에서는 로드 불가

### 🎯 현실적인 기대치
- **첫 링크 클릭**: 2-3초 로딩 (노션/구글시트 자체 로딩 시간)
- **두 번째 이후**: 즉시 표시 (캐시 사용)
- **탭 전환**: 즉시 표시 (컴포넌트 이미 마운트됨)

## 💬 결론

현재 구현은 **React Native WebView의 제약사항을 고려할 때 이미 최적화된 상태**입니다. 

노션/구글시트 같은 외부 페이지의 로딩 시간은 불가피하며, 캐싱을 통해 재방문 시 즉시 표시되도록 구현되어 있습니다.

추가 최적화를 원한다면 **방안 1 (백그라운드 프리로딩)**을 구현할 수 있지만, 복잡도 대비 효과가 제한적일 수 있습니다.
