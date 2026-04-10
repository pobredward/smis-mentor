# 모바일 WebView 기반 에디터 구현 가이드

## 개요

모바일 앱에서 웹과 동일한 Tiptap 에디터를 사용하여 캠프 페이지를 편집할 수 있는 기능을 구현했습니다.

## 구현 방식

### 방법: WebView 기반 에디터

- **장점**:
  - 웹의 Tiptap 에디터를 WebView로 임베드하여 완전히 동일한 편집 경험 제공
  - React Native와 WebView 간 메시지 통신(`postMessage`)으로 데이터 교환
  - 구현이 비교적 간단하고 유지보수 용이
  - 테이블, YouTube, 이미지 등 모든 Tiptap 기능 지원

- **단점**:
  - 이미지 업로드는 모바일에서 제한적 (웹에서 편집 권장)
  - 초기 로딩 시간 (Tiptap CDN 라이브러리 로드)

## 구현된 파일

### 1. CampPageWebEditor 컴포넌트
**경로**: `packages/mobile/src/components/CampPageWebEditor.tsx`

**역할**: WebView 기반 Tiptap 에디터 래퍼

**주요 기능**:
- Tiptap CDN을 통해 에디터 라이브러리 로드
- React Native ↔ WebView 메시지 통신
  - `EDITOR_READY`: 에디터 초기화 완료
  - `CONTENT_CHANGED`: 콘텐츠 변경 시 React Native로 전달
  - `SET_CONTENT`: React Native에서 초기 콘텐츠 설정
- 툴바 UI (H1-H3, Bold, Italic, Underline, 리스트, 테이블, 링크, YouTube 등)
- 테이블 리사이즈 및 열/행 추가/삭제 지원

**Props**:
```typescript
interface CampPageWebEditorProps {
  content: string;           // 초기 HTML 콘텐츠
  onChange: (content: string) => void; // 콘텐츠 변경 콜백
  placeholder?: string;      // 플레이스홀더 텍스트
}
```

**Tiptap 라이브러리** (CDN):
- `@tiptap/core`
- `@tiptap/starter-kit`
- `@tiptap/extension-image`
- `@tiptap/extension-link`
- `@tiptap/extension-table` (+ TableRow, TableCell, TableHeader)
- `@tiptap/extension-youtube`
- `@tiptap/extension-text-align`
- `@tiptap/extension-underline`

### 2. CampEditorScreen
**경로**: `packages/mobile/src/screens/CampEditorScreen.tsx`

**역할**: 전체 화면 편집 모드

**주요 기능**:
- `CampPageWebEditor` 컴포넌트를 전체 화면으로 표시
- 헤더 오른쪽에 "저장" 버튼 표시
- 저장 시 Firebase에 콘텐츠 업데이트 및 성공/실패 알림
- 저장 후 자동으로 이전 화면으로 돌아가기

**내비게이션 파라미터**:
```typescript
{
  category: CampPageCategory;     // 'education' | 'schedule' | 'guide'
  itemId: string;                 // 페이지 ID
  itemTitle: string;              // 페이지 제목
  initialContent: string;         // 초기 HTML 콘텐츠
}
```

### 3. CampDetailScreen 수정
**경로**: `packages/mobile/src/screens/CampDetailScreen.tsx`

**변경 사항**:
- 관리자(`admin`)일 때 헤더 오른쪽에 "편집" 버튼 추가
- "편집" 버튼 클릭 시 `CampEditor` 화면으로 이동
- `page` 타입 아이템만 편집 가능 (`link` 타입은 편집 불가)

**추가된 함수**:
```typescript
const handleEditPress = () => {
  if (!item || item.type !== 'page') return;

  navigation.navigate('CampEditor', {
    category,
    itemId: item.id,
    itemTitle: itemTitle,
    initialContent: item.content || '',
  });
};
```

### 4. 네비게이션 라우트 추가
**경로**: `packages/mobile/src/navigation/types.ts`

**추가된 타입**:
```typescript
export type RootStackParamList = {
  // ... 기존 라우트들
  CampEditor: {
    category: CampPageCategory;
    itemId: string;
    itemTitle: string;
    initialContent: string;
  };
};
```

**경로**: `packages/mobile/src/navigation/RootNavigator.tsx`

**변경 사항**:
- `CampEditorScreen` import
- 딥링킹 설정: `camp/:category/:itemId/edit`
- 스택 네비게이터에 `CampEditor` 화면 추가

### 5. 컴포넌트 Export
**경로**: `packages/mobile/src/components/index.ts`

**추가**:
```typescript
export { CampPageWebEditor } from './CampPageWebEditor';
```

## 사용 흐름

### 관리자 편집 플로우

1. **캠프 탭** → **교육/시간표/가이드** 탭 진입
2. **카드 클릭** → `CampDetailScreen` (세부 페이지)
3. **관리자라면 헤더 오른쪽에 "편집" 버튼 표시**
4. **"편집" 버튼 클릭** → `CampEditorScreen` (전체 화면 에디터)
5. **Tiptap 에디터에서 콘텐츠 수정**
   - 제목 스타일 (H1, H2, H3)
   - 텍스트 서식 (굵게, 기울임, 밑줄)
   - 리스트 (글머리 기호, 번호 매기기)
   - 테이블 (삽입, 열/행 추가/삭제)
   - 링크 (텍스트에 URL 연결)
   - YouTube (동영상 임베드)
6. **헤더 "저장" 버튼 클릭** → Firebase 업데이트
7. **저장 성공 알림** → 자동으로 `CampDetailScreen`으로 돌아감
8. **새로고침하여 변경 사항 확인**

### 일반 사용자 플로우

- 관리자가 아닌 사용자는 "편집" 버튼이 보이지 않음
- 읽기 전용으로만 콘텐츠 확인 가능

## 제약 사항

### 1. 이미지 업로드
- 모바일에서는 이미지 업로드 기능이 제한됩니다.
- 이미지 업로드가 필요한 경우 웹에서 편집을 권장합니다.
- 에디터에서 이미지 업로드 시도 시 알림:
  ```
  "모바일에서는 이미지 업로드 기능이 제한됩니다. 웹에서 편집해주세요."
  ```

### 2. 초기 로딩
- Tiptap 라이브러리를 CDN에서 로드하므로 초기 로딩 시간이 있습니다.
- 로딩 중에는 "에디터 로딩 중..." 표시

### 3. 테이블 리사이즈
- 테이블 열 너비 조절은 웹과 동일하게 드래그로 가능합니다.
- 모바일 화면 특성상 작은 화면에서는 조작이 다소 어려울 수 있습니다.

## 웹과 모바일 비교

| 기능 | 웹 | 모바일 |
|------|-----|--------|
| 텍스트 서식 | ✅ | ✅ |
| 제목 스타일 | ✅ | ✅ |
| 리스트 | ✅ | ✅ |
| 테이블 | ✅ | ✅ |
| 테이블 리사이즈 | ✅ | ✅ |
| 링크 | ✅ | ✅ |
| YouTube | ✅ | ✅ |
| 이미지 업로드 | ✅ | ⚠️ 제한적 |
| 저장 | ✅ | ✅ |
| UI/UX | 최적화됨 | 웹과 동일 |

## 기술적 세부 사항

### WebView ↔ React Native 메시지 통신

**React Native → WebView**:
```typescript
webViewRef.current?.postMessage(JSON.stringify({
  type: 'SET_CONTENT',
  content: htmlContent,
}));
```

**WebView → React Native**:
```javascript
window.ReactNativeWebView?.postMessage(JSON.stringify({
  type: 'CONTENT_CHANGED',
  content: editor.getHTML(),
}));
```

### HTML 템플릿 구조

```html
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="...">
    <!-- Tiptap CDN 라이브러리 -->
    <script src="https://unpkg.com/@tiptap/..."></script>
    <style>/* 에디터 스타일 */</style>
  </head>
  <body>
    <div id="toolbar"></div>
    <div id="editor"></div>
    <script>
      // Tiptap 에디터 초기화
      let editor = new window.TiptapEditor({ ... });
      
      // 메시지 통신 설정
      document.addEventListener('message', ...);
      window.addEventListener('message', ...);
    </script>
  </body>
</html>
```

### 저장 로직

```typescript
await campPageService.updatePage(itemId, {
  content,                    // 수정된 HTML
  updatedBy: userData.id,     // 수정자 ID
});
```

## 향후 개선 사항

1. **이미지 업로드 개선**
   - React Native Image Picker 통합
   - Firebase Storage 직접 업로드
   - WebView와 React Native 간 이미지 데이터 전달

2. **오프라인 편집**
   - AsyncStorage에 임시 저장
   - 네트워크 복구 시 자동 동기화

3. **협업 편집**
   - 실시간 동기화 (Firebase Realtime Database 또는 Firestore onSnapshot)
   - 충돌 방지 (낙관적 잠금)

4. **성능 최적화**
   - Tiptap 라이브러리 번들링 (CDN 대신 로컬)
   - 에디터 프리로딩

## 트러블슈팅

### 1. 에디터가 로딩되지 않음
- 인터넷 연결 확인 (Tiptap CDN 접근 필요)
- WebView `javaScriptEnabled={true}` 확인

### 2. 콘텐츠가 저장되지 않음
- Firebase 권한 확인 (Firestore rules)
- 사용자 인증 상태 확인 (`userData` null 여부)
- `activeJobCodeId` 존재 여부 확인

### 3. 메시지 통신 오류
- WebView `onMessage` 핸들러 확인
- JSON 직렬화/역직렬화 오류 확인
- iOS와 Android 양쪽에서 `message` 이벤트 리스너 등록 확인

## 참고 자료

- [Tiptap 공식 문서](https://tiptap.dev/)
- [React Native WebView](https://github.com/react-native-webview/react-native-webview)
- [Firebase Firestore](https://firebase.google.com/docs/firestore)
