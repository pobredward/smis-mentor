# WebView 프리로딩 로그 분석 가이드

## 📋 출력되는 로그 구조

캠프 변경 시 다음과 같은 상세 로그가 출력됩니다:

### 1. 캠프 변경 시작
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 ProfileScreen: 캠프 변경 시작
   현재: camp-2024-summer
   변경: camp-2025-winter
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 2. Step 1: 기존 캐시 정리
```
📍 Step 1/4: 기존 캐시 정리 중...
🗑️ 캠프 데이터 캐시 무효화
   ✅ 완료 (0.12초)
```

### 3. Step 2: 캠프 변경
```
📍 Step 2/4: 캠프 변경 중...
   ✅ 완료 (0.45초)
```

### 4. Step 3: 캠프 데이터 로딩
```
📍 Step 3/4: 캠프 데이터 로딩 중...
🚀 캠프 데이터 프리페칭 시작
  ✅ 수업 자료 데이터 프리페칭 완료
  ✅ 업무 데이터 프리페칭 완료
  ✅ 시간표 데이터 프리페칭 완료
  ✅ 인솔표 데이터 프리페칭 완료
  ✅ 반명단 데이터 프리페칭 완료
  ✅ 방명단 데이터 프리페칭 완료
  ✅ 교육 자료 데이터 프리페칭 완료
✅ 캠프 데이터 프리페칭 완료
   ✅ 완료 (2.34초)
```

### 5. Step 4: WebView 프리로딩 (가장 중요!)
```
📍 Step 4/4: WebView 프리로딩 대기 중...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 WebView 프리로딩 설정 시작
📚 교육 링크: 3개
   1. 교육일정 - https://notion.site/xxx
   2. 안전수칙 - https://notion.site/yyy
   3. 캠프소개 - https://notion.site/zzz
📅 시간표 링크: 5개
   1. 1주차 - https://docs.google.com/spreadsheets/d/aaa
   2. 2주차 - https://docs.google.com/spreadsheets/d/bbb
   3. 3주차 - https://docs.google.com/spreadsheets/d/ccc
   4. 4주차 - https://docs.google.com/spreadsheets/d/ddd
   5. 5주차 - https://docs.google.com/spreadsheets/d/eee
🧭 인솔표 링크: 2개
   1. 멘토용 - https://docs.google.com/spreadsheets/d/fff
   2. 원어민용 - https://docs.google.com/spreadsheets/d/ggg
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 총 10개 WebView 프리로드 시작
   - 교육: 3개
   - 시간표: 5개
   - 인솔표: 2개
✅ WebView 프리로딩 대기열 설정 완료
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔄 WebViewPreloader: 프리로드 시작
📋 총 10개 링크 프리로드 예정:
   1. [education] 교육일정
      URL: https://notion.site/xxx
   2. [education] 안전수칙
      URL: https://notion.site/yyy
   3. [education] 캠프소개
      URL: https://notion.site/zzz
   4. [schedule] 1주차
      URL: https://docs.google.com/spreadsheets/d/aaa
   ... (생략)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔄 [education] 교육일정 - 로딩 시작
   🔗 URL: https://notion.site/xxx
✅ [education] 교육일정 - 로딩 완료
   ⏱️  소요 시간: 3.45초
   🔗 URL: https://notion.site/xxx
📊 진행: 1/10 (10%)

🔄 [education] 안전수칙 - 로딩 시작
   🔗 URL: https://notion.site/yyy
✅ [education] 안전수칙 - 로딩 완료
   ⏱️  소요 시간: 2.87초
   🔗 URL: https://notion.site/yyy
📊 진행: 2/10 (20%)

🔄 [schedule] 1주차 - 로딩 시작
   🔗 URL: https://docs.google.com/spreadsheets/d/aaa
✅ [schedule] 1주차 - 로딩 완료
   ⏱️  소요 시간: 1.23초
   🔗 URL: https://docs.google.com/spreadsheets/d/aaa
📊 진행: 3/10 (30%)

... (나머지 링크 로딩)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ WebViewPreloader: 모든 WebView 프리로드 완료!
📊 통계:
   - 총 링크 수: 10개
   - 총 소요 시간: 18.45초
   - 평균 로딩 시간: 1.85초/링크
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 WebView 진행: 10/10 (100%) - 경과: 18.5초
✅ WebView 프리로드 완료! (18.45초 소요)
   ✅ 완료 (18.45초)
```

### 6. 최종 완료
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ ProfileScreen: 모든 프리로딩 완료!
⏱️  총 소요 시간: 21.34초
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## 🔍 로그 분석 방법

### 시간이 오래 걸리는 경우 체크 포인트

#### 1. 링크 개수 확인
```
📊 총 10개 WebView 프리로드 시작
```
→ **링크가 너무 많으면 (15개 이상)** 시간이 오래 걸림

#### 2. 개별 링크 소요 시간
```
✅ [education] 교육일정 - 로딩 완료
   ⏱️  소요 시간: 3.45초  ← 이 값 확인!
```
→ **5초 이상 걸리는 링크**가 있으면 문제

#### 3. 노션 vs 구글시트 비교
```
노션:       평균 3-5초
구글시트:   평균 1-2초
```
→ 노션 페이지가 더 느림 (정상)

#### 4. 에러 확인
```
❌ [education] 교육일정 - 로딩 실패
   💥 에러: { code: -1009, description: "네트워크 연결 없음" }
```
→ 네트워크, 권한, URL 문제 확인

## 🚨 문제 패턴별 대응

### Pattern 1: 특정 링크가 10초 이상 걸림
```
✅ [education] 교육일정 - 로딩 완료
   ⏱️  소요 시간: 12.34초  ← 너무 느림!
```
**원인**: 
- 노션 페이지가 너무 무거움 (이미지, 동영상 많음)
- URL이 리다이렉트됨
- 페이지가 JavaScript 에러 있음

**해결**:
- 해당 링크를 프리로드 대상에서 제외
- URL 정리 (리다이렉트 제거)

### Pattern 2: 모든 링크가 느림
```
평균 로딩 시간: 8.23초/링크  ← 너무 느림!
```
**원인**: 
- 네트워크 상태 불량
- 디바이스 메모리 부족
- 동시 로딩 링크 수 과다

**해결**:
- 네트워크 확인
- 링크 개수 줄이기 (우선순위 높은 것만)

### Pattern 3: 타임아웃 발생
```
⚠️ WebView 프리로드 타임아웃 (30초 초과)
📊 최종 진행: 7/10
```
**원인**: 
- 일부 링크가 응답 없음
- 링크가 너무 많음

**해결**:
- 타임아웃을 60초로 늘림
- 또는 링크 개수 줄이기

### Pattern 4: 에러 반복
```
❌ [education] 교육일정 - 로딩 실패
   💥 에러: { code: -1100, description: "URL을 로드할 수 없음" }
```
**원인**: 
- 잘못된 URL
- 권한 문제
- 노션 페이지 비공개

**해결**:
- URL 유효성 확인
- 노션 페이지 공개 설정 확인

## 💡 최적화 제안

### 1. 링크 개수 제한
```typescript
// 최대 10개까지만 프리로드
const limitedLinks = allLinks.slice(0, 10);
setPreloadLinks(limitedLinks);
```

### 2. 우선순위 설정
```typescript
// 자주 사용하는 링크만 프리로드
const priorityLinks = allLinks.filter(link => 
  link.title.includes('1주차') || link.title.includes('일정')
);
```

### 3. 느린 링크 제외
```typescript
// 노션 페이지 제외 (선택적)
const fastLinks = allLinks.filter(link => 
  !link.url.includes('notion')
);
```

## 🎯 체크리스트

테스트 시 다음을 확인하세요:

- [ ] 프리로드할 링크 개수 (10개 이하 권장)
- [ ] 각 링크별 소요 시간 (5초 이하 정상)
- [ ] 노션 페이지 로딩 시간 (3-5초 정상)
- [ ] 구글시트 로딩 시간 (1-2초 정상)
- [ ] 에러 발생 여부
- [ ] 총 소요 시간 (20초 이하 권장)
- [ ] 타임아웃 발생 여부

## 🔧 다음 단계

로그를 확인한 후:

1. **링크가 너무 많으면**: 우선순위 필터링 구현
2. **특정 링크가 느리면**: 해당 링크 제외 또는 최적화
3. **노션이 너무 느리면**: 노션 페이지 경량화 또는 제외
4. **타임아웃 자주 발생**: 타임아웃 시간 조정 또는 링크 줄이기

로그를 공유해주시면 구체적인 최적화 방안을 제안하겠습니다!
