# 캠프 페이지 공유 기능

## 개요

교육 자료, 일정, 가이드 페이지를 로그인 없이도 접근 가능한 공개 링크로 공유할 수 있습니다.

## 주요 기능

### 1. 공개 공유 페이지

**경로**: `/share/{category}/{itemId}`

- **교육 자료**: `/share/education/[itemId]`
- **일정**: `/share/schedule/[itemId]`
- **가이드**: `/share/guide/[itemId]`

**특징**:
- 로그인 불필요
- 캠프 권한 체크 없음
- 누구나 링크만 있으면 열람 가능
- SEO 최적화 (Open Graph 메타데이터 포함)

### 2. 메타데이터 (SEO)

```typescript
{
  title: 'SMIS 교육 자료 페이지',
  description: '{페이지 제목}',
  openGraph: {
    title: 'SMIS 교육 자료 페이지',
    description: '{페이지 제목}',
    images: ['/logo-wide.png']
  }
}
```

### 3. 공유 버튼

#### 웹 (`packages/web`)

- 위치: 페이지 상세 화면 헤더
- 기능: 클립보드에 공유 링크 복사
- 피드백: Toast 메시지

#### 모바일 (`packages/mobile`)

- 위치: 화면 헤더 우측
- 기능:
  - iOS/Android: 네이티브 공유 시트
  - 기타: 클립보드 복사
- 피드백: Alert 메시지

## 환경 변수 설정

### 웹 (packages/web/.env.local)

```bash
# 웹사이트 URL (공유 링크용)
# 개발 환경
NEXT_PUBLIC_WEBSITE_URL=http://localhost:3000

# 프로덕션 환경
NEXT_PUBLIC_WEBSITE_URL=https://smis-mentor.com
```

### 모바일 (packages/mobile/app.config.ts)

```typescript
extra: {
  EXPO_PUBLIC_WEBSITE_URL: process.env.EXPO_PUBLIC_WEBSITE_URL || 'https://smis-mentor.com',
}
```

## 사용 예시

### 1. 교육 자료 공유

```
원본 URL (로그인 필요):
https://smis-mentor.com/camp/education/dbcbe89e-843a-41a9-8899-f8b1675b7220

공유 URL (로그인 불필요):
https://smis-mentor.com/share/education/dbcbe89e-843a-41a9-8899-f8b1675b7220
```

### 2. 웹에서 공유

1. 교육 자료 상세 페이지 접속
2. 헤더의 "공유" 버튼 클릭
3. 링크가 클립보드에 복사됨
4. 원하는 곳에 붙여넣기

### 3. 모바일에서 공유

1. 교육 자료 상세 화면 접속
2. 헤더의 "공유" 버튼 탭
3. 네이티브 공유 시트에서 공유 방법 선택
   - 카카오톡, 문자, 이메일 등

## 구현 세부사항

### 파일 구조

```
packages/web/src/app/share/
├── education/
│   └── [itemId]/
│       ├── page.tsx         # 교육 자료 공개 페이지
│       └── not-found.tsx    # 404 페이지
├── schedule/
│   └── [itemId]/
│       ├── page.tsx         # 일정 공개 페이지
│       └── not-found.tsx
└── guide/
    └── [itemId]/
        ├── page.tsx         # 가이드 공개 페이지
        └── not-found.tsx
```

### 권한 체크 로직

```typescript
// 기존 페이지 (/camp/education/[itemId])
// - 로그인 필수
// - activeJobCodeId 필요
// - targetRole 권한 체크

// 공유 페이지 (/share/education/[itemId])
// - 로그인 불필요
// - 권한 체크 없음
// - 읽기 전용
```

### 데이터 페칭

```typescript
// Server Component에서 직접 Firestore 조회
const campPageService = new CampPageService(db);
const page = await campPageService.getPage(itemId);

// 카테고리 검증
if (!page || page.category !== 'education') {
  notFound();
}
```

## 보안 고려사항

### 1. 공개 범위

- **공개됨**: 페이지 타입의 교육 자료, 일정, 가이드
- **비공개**: 외부 링크 (Notion, Google Sheets) - 원래 페이지에서만 접근

### 2. 민감 정보

- 개인정보가 포함된 페이지는 공유하지 않도록 주의
- 관리자가 공유 전 내용 검토 권장

### 3. 링크 무효화

- 페이지가 삭제되면 자동으로 404 페이지 표시
- 수동으로 링크를 무효화할 방법 없음 (페이지 삭제만 가능)

## 향후 개선 사항

### 1. 접근 제어 강화

- 비밀번호 보호 옵션
- 만료 기간 설정
- 조회 수 제한

### 2. 분석 기능

- 공유 링크 조회 수 추적
- 유입 경로 분석

### 3. 커스텀 슬러그

- UUID 대신 읽기 쉬운 URL
- 예: `/share/education/2024-winter-schedule`

## 트러블슈팅

### 1. 공유 링크가 작동하지 않음

- 환경 변수 확인: `NEXT_PUBLIC_WEBSITE_URL`
- 페이지가 실제로 존재하는지 확인
- 카테고리가 올바른지 확인

### 2. 메타데이터가 표시되지 않음

- 프로덕션 빌드에서만 작동
- 소셜 미디어 캐시 초기화 필요
- Open Graph 디버거 사용: https://developers.facebook.com/tools/debug/

### 3. 모바일 공유가 작동하지 않음

- `expo-clipboard` 설치 확인
- iOS/Android 권한 확인
- 환경 변수 확인: `EXPO_PUBLIC_WEBSITE_URL`

## 테스트

### 웹

```bash
# 개발 서버 실행
cd packages/web
npm run dev

# 공유 페이지 접속
http://localhost:3000/share/education/[실제-페이지-ID]
```

### 모바일

```bash
# Expo 서버 실행
cd packages/mobile
npx expo start

# 디바이스에서 교육 자료 상세 화면 접속
# 공유 버튼 탭하여 테스트
```

## 관련 파일

### 웹
- `packages/web/src/app/share/education/[itemId]/page.tsx`
- `packages/web/src/app/share/schedule/[itemId]/page.tsx`
- `packages/web/src/app/share/guide/[itemId]/page.tsx`
- `packages/web/src/components/camp/CampDetailView.tsx`

### 모바일
- `packages/mobile/src/screens/CampDetailScreen.tsx`
- `packages/mobile/app.config.ts`

### Shared
- `packages/shared/src/services/campPageService.ts`
- `packages/shared/src/types/campPage.ts`
