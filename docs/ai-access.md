# AI 에이전트 접근 계층 (llms.txt · .md · MCP)

Claude, ChatGPT 등 AI 에이전트가 smis-mentor.com 의 모든 페이지를 읽을 수 있게 하는 두 개의 층과, 로그인 사용자용 OAuth 인가 레이어에 대한 문서입니다.

## 왜 두 층인가

AI 에게 URL 을 붙여넣으면 내장 fetch 도구가 그 페이지를 GET 해서 텍스트로 바꿀 뿐, 사이트의 MCP 서버를 자동으로 찾아 붙지 않습니다. 반대로 MCP 커넥터는 설정에서 직접 등록해야 하지만 로그인·검색·크롤 같은 구조화된 접근이 가능합니다. 그래서:

| 층 | 진입점 | 인증 | 용도 |
| --- | --- | --- | --- |
| 1층 마크다운 미러 | `/llms.txt`, `/llms-full.txt`, `/{path}.md` | 없음 (공개 페이지) | 링크만 줘도 읽히게 |
| 2층 MCP 공개 | `/api/mcp/public` | 없음 | 커넥터로 공개 페이지 검색·크롤 |
| 2층 MCP 로그인 | `/api/mcp` | OAuth 2.1 (사이트 계정) | 역할별(멘토·원어민·관리자) 페이지 읽기 |

두 층 모두 `src/lib/ai-content/` 의 "페이지 → 마크다운" 생성기를 공유합니다. **반드시 apex 도메인(`https://smis-mentor.com`)** 을 쓰세요. `www` 는 308 리다이렉트되어 MCP 클라이언트의 POST 가 깨집니다.

## 1층 — 마크다운 미러

- `GET /llms.txt` — 사이트 목차(llmstxt.org 규격). 공개 페이지, 채용 공고(동적), 로그인 페이지 안내, MCP 접근 방법.
- `GET /llms-full.txt` — 공개 콘텐츠 전문(홈, 공고 목록·상세, 지원 안내, 후기, 약관)을 한 파일로.
- `GET /{path}.md` — 어떤 페이지든 마크다운 버전. `next.config.ts` 의 `rewrites` 가 `/:path*.md → /api/md/:path*` 로 보냅니다. 홈은 `/index.md`.
  - 로그인 페이지(`/camp/...`, `/admin/...`, `/profile`)는 `Authorization: Bearer <MCP 액세스 토큰>` 헤더가 있으면 같은 경로로 읽을 수 있습니다. 없으면 401 과 안내문.
- 모든 마크다운 문서 첫머리에 "전체 목차: /llms.txt 를 먼저 읽으세요" 안내가 붙고, 끝에 "하위 · 관련 페이지" 링크 목록이 붙습니다. 이 두 장치가 "루트만 줘도 전체", "특정 페이지만 줘도 하위까지"를 실제로 동작하게 합니다.
- HTML 쪽: 푸터에 `llms.txt` 링크, `<link rel="alternate" type="text/markdown" href="/llms-full.txt">`(layout.tsx `alternates.types`), `robots.txt` 에서 AI UA 허용, `sitemap.xml` 에 공고 상세 동적 포함.

### AI 에이전트 콘텐츠 협상 (`src/proxy.ts`)

사이트의 `AuthProvider` 는 인증 확인이 끝나기 전에는 아무것도 렌더하지 않으므로, JS 를 실행하지 않는 클라이언트(AI fetch 도구, 검색엔진 1차 크롤)에게 일반 페이지 HTML 은 본문이 비어 있습니다. 그래서 `proxy.ts` 가 다음 요청에 한해 같은 페이지의 마크다운(`/api/md/...`)을 대신 돌려줍니다.

- User-Agent 가 AI 에이전트인 경우: `Claude-User`, `ClaudeBot`, `Claude-SearchBot`, `ChatGPT-User`, `GPTBot`, `OAI-SearchBot`, `PerplexityBot` 등 (`AI_USER_AGENTS` 정규식)
- 또는 `Accept: text/markdown` 을 보낸 경우
- 대상 경로는 마크다운 버전이 있는 페이지 경로만 (`NEGOTIABLE_PATH`). `/api`, `/oauth`, `/.well-known`, 정적 파일은 제외

협상된 응답은 `Cache-Control: private, no-store` + `Vary` 로 내려가서 브라우저 사용자용 CDN 캐시를 오염시키지 않습니다. 확인: `curl -A "Claude-User" https://smis-mentor.com/` → 마크다운, `curl -A "Mozilla/5.0" https://smis-mentor.com/` → HTML.

## 2층 — MCP 서버

구현: `src/lib/mcp/server.ts` (mcp-handler 2.x + MCP SDK v2, Streamable HTTP, stateless). 페이지 도구는 읽기 전용이고, 데이터 도구(아래)만 관리자에게 쓰기를 허용합니다.

| 도구 | 설명 |
| --- | --- |
| `get_site_overview` | 사이트 개요·회사 정보·AI 접근 방법 |
| `list_pages` | 권한 내 전체 페이지 목록 (채용 공고·캠프 탭 동적 포함) |
| `search` | 제목·설명·태그·본문 검색 — ChatGPT 딥리서치 커넥터 규격 (`{results:[{id,title,url}]}`) |
| `fetch` | 페이지 전체 텍스트 — ChatGPT 규격 (`{id,title,text,url,metadata}`) |
| `read_page` | 페이지 하나를 마크다운으로 (`camp` 파라미터로 캠프 지정 가능) |
| `crawl` | 페이지 + 하위 페이지 BFS 수집 (기본 깊이 2, 30페이지, 12만 자) |
| `whoami` (로그인) | 현재 계정·역할·참여 캠프 |
| `list_camps` (로그인) | 캠프 코드 목록 (관리자는 전체, 그 외 본인 캠프) |
| `find_users` (관리자) | 이름·대학·전공으로 사용자 검색 + 지원 이력·평가 요약 |
| `get_lesson_materials` (로그인) | 선생님의 수업 자료 대주제·섹션별 보기/원본 링크 전체 (관리자는 이름/ID로 아무나, 그 외 본인만; `camp` 로 대주제 필터) |
| `describe_schema` (로그인) | 데이터 도구가 다루는 컬렉션·필드·권한·쓰기 규칙 + 작업 레시피 (`collection` 지정 시 필드 상세) |
| `query_documents` (로그인) | 컬렉션 조건 조회 (`where`/`orderBy`/`limit`/`offset`/`fields`/`includeLarge`, 서브컬렉션은 `parentId`) |
| `get_document` (로그인) | 문서 하나 전체 읽기 (large 필드 포함) |
| `write_documents` (관리자) | 생성·수정·삭제 배치 (≤50). **기본 dry-run** → `previewHash` + `confirm=true` 로 실행, `mcpAuditLogs` 기록 |

리소스(`resources/list`)로도 레지스트리 페이지가 `https://smis-mentor.com/{path}.md` URI 로 노출됩니다.

### 범용 데이터 도구 (`src/lib/mcp/datamodel.ts`, `data-tools.ts`)

작업(예: "J28 교육 자료를 J29 로 복사")마다 전용 도구를 만들지 않고, AI 가 스키마를 읽고 원시 도구를 조합하도록 했습니다. 규칙은 전부 `datamodel.ts` 한 곳에 선언되어 있습니다.

- **컬렉션 선언** (`COLLECTIONS`): 읽기 권한(`read`), 허용 쓰기(`write.ops`), 멘토 범위 제한(`scope` — 참여 캠프 ID/코드 또는 본인 uid), 필드별 타입·필수·`writable`·`enum`·`ref`(참조 무결성: `jobCodes.id`, `jobCodes.code`, `taskCategories.id` …)·`large`(query 기본 생략)·`adminOnly`, `hidden`(응답 제거 + 쓰기 거부), `serverManaged`(createdAt/updatedAt/createdBy/updatedBy 등 서버가 채움), `forcedOnCreate`(예: `campTasks.completions=[]`, `evaluations` 의 `isFinalized=false / isVisible=false / aiDraft=true / evaluatorName="이름 (AI 초안)"`), `idOnCreate`(auto / uuid / required).
- **차단 컬렉션** (`EXCLUDED_COLLECTIONS`): 환자 기록, ST시트 원본(학생 연락처·주민번호), 토큰, OAuth 내부 데이터 등은 이름조차 조회되지 않습니다.
- **개인정보 방어선**: `hidden` 목록과 별개로 `email / phone / address / rrn / passport / birth / bank / account / password / token …` 이 들어간 키는 모든 깊이에서 항상 제거되고, 조건·정렬 필드로도 쓸 수 없습니다 (`isSensitiveKey`).
- **query**: `==` 전부와 `in` 하나는 Firestore 에 내려보내고(복합 색인 불필요) 나머지 연산자(`!= < <= > >= not-in array-contains contains exists`)·정렬·offset 은 메모리에서 처리합니다 (최대 1,000건 스캔, 넘으면 `warning`). 타임스탬프는 한국시간 ISO(`+09:00`)로 반환, 입력은 `YYYY-MM-DD`(KST 자정) 또는 ISO 8601.
- **write**: 관리자만. `confirm` 없이 호출하면 검증(스키마·필수·enum·타입·참조·컬렉션별 정합성: 카테고리 캠프 일치, 공고 코드/ID 일치, 평가 점수 범위·중복 초안 등)과 미리보기(`after` / `changes` / `before`)만 돌려주고 아무것도 쓰지 않습니다. 같은 operations + `previewHash` + `confirm=true` 로 재호출하면 재검증 후 한 배치로 실행하고, 같은 배치에 `mcpAuditLogs` 문서(실행자, 메모, 작업 목록)를 남깁니다. 평가(`evaluations`)는 앱과 같은 방식으로 `totalScore`(평균)/`maxTotalScore`(10)/`percentage` 를 서버가 계산합니다.
- **레시피** (`RECIPES`): 교육 자료 캠프 간 복사, 업무 복사(날짜 이동), 서류 전형 평가 초안, 선생님 수업 자료 링크 추출 — `describe_schema` 응답에 포함되어 AI 가 절차를 따릅니다.
- 새 컬렉션이나 필드를 열고 싶으면 `datamodel.ts` 에 선언만 추가하면 됩니다. 코드 수정은 필요 없습니다.

### 접근 권한

`src/lib/ai-content/site.ts` 의 `canAccess()`:

- `public` — 누구나
- `auth` — 로그인 (프로필)
- `mentor` — mentor / foreign / admin (캠프 운영 페이지). 관리자는 모든 캠프, 그 외는 본인 참여 캠프만
- `admin` — 관리자 (사용자·지원자·공고 관리)

**제외 항목**: 환자 기록(`/camp/patient`, 건강 정보), 학생 연락처·주민번호·여권·주소·투약 정보, 사용자 연락처·주소·주민번호, 공고의 면접 링크·비밀번호(면접 안내는 관리자에게만). `data.ts` 단계에서 아예 읽지 않습니다.

## OAuth 인가 레이어 (Firebase Auth 브리지)

Claude.ai 커넥터는 OAuth 2.1 + 동적 클라이언트 등록(DCR)을 요구하고, Firebase Auth 는 OAuth 인가 서버가 아니므로 사이트 안에 얇은 인가 서버를 두었습니다.

| 엔드포인트 | 역할 |
| --- | --- |
| `/.well-known/oauth-authorization-server` | RFC 8414 메타데이터 |
| `/.well-known/oauth-protected-resource[/api/mcp]` | RFC 9728 보호 리소스 메타데이터 (401 의 `WWW-Authenticate` 가 가리킴) |
| `POST /api/oauth/register` | RFC 7591 동적 클라이언트 등록 (+ CIMD: https URL 형태 client_id 도 지원) |
| `GET /oauth/authorize` | 동의 화면 (미로그인 시 `/sign-in?redirect=` 로 보냈다가 복귀) |
| `POST /api/oauth/authorize` | Firebase ID 토큰 검증 → 인가 코드 발급 |
| `POST /api/oauth/token` | code + PKCE(S256) → 액세스 토큰(JWT HS256, 1시간) + 리프레시 토큰(30일, 회전) |
| `POST /api/oauth/revoke` | 리프레시 토큰 폐기 |

흐름: 커넥터에 `https://smis-mentor.com/api/mcp` 추가 → 401 → 메타데이터 탐색 → DCR → 브라우저에서 `/oauth/authorize` (사이트 로그인 + 허용) → 토큰 발급 → 도구 호출. 액세스 토큰 검증 시마다 `users/{uid}` 를 다시 읽어 현재 역할·상태를 반영합니다(60초 캐시).

Firestore 컬렉션(Admin SDK 전용, 클라이언트 규칙은 기본 거부): `mcpOAuthClients`, `mcpOAuthCodes`, `mcpOAuthRefreshTokens`. 만료된 코드·리프레시 토큰은 토큰 발급 시마다 백그라운드로 최대 50건씩 정리됩니다(`cleanupExpiredOAuthDocs`). 추가로 Firestore 콘솔 → TTL 정책에서 두 컬렉션의 `expiresAt` 필드에 TTL 을 걸어두면 정리 코드 없이도 자동 삭제됩니다 (서비스 계정 권한으로는 설정 불가 → 콘솔 또는 `gcloud firestore fields ttls update expiresAt --collection-group=mcpOAuthCodes`).

## 배포

1. **환경변수** — Vercel 프로젝트에 `MCP_JWT_SECRET` 추가 (로컬 `.env.local` 에 이미 생성된 값과 동일하게). 없으면 `FIREBASE_PRIVATE_KEY` 파생 키로 동작하지만 경고가 출력됩니다.
2. `npm run deploy:web` (= `vercel --prod`) 또는 git push.
3. 배포 후 확인:

```bash
curl -s https://smis-mentor.com/llms.txt | head -30
curl -s https://smis-mentor.com/job-board.md | head -20
curl -s https://smis-mentor.com/.well-known/oauth-authorization-server
curl -si -X POST https://smis-mentor.com/api/mcp -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}' | head -5
# → 401 + WWW-Authenticate: Bearer ... resource_metadata="https://smis-mentor.com/.well-known/oauth-protected-resource/api/mcp"
```

## 커넥터 등록

- **Claude.ai / 데스크톱**: Settings → Connectors → Add custom connector → URL `https://smis-mentor.com/api/mcp` → 로그인 창에서 SMIS 계정으로 로그인 후 "허용". 공개 전용은 `https://smis-mentor.com/api/mcp/public` (인증 없음).
- **ChatGPT**: Settings → Apps & Connectors → Advanced → Developer mode 켜기 → Create → URL 입력, Auth: OAuth (공개 엔드포인트는 None). 딥리서치는 `search`/`fetch` 도구를 사용합니다.
- **Claude Code**: `claude mcp add --transport http smis-mentor https://smis-mentor.com/api/mcp` → `/mcp` 에서 로그인.
- **Cursor**: `{"mcpServers":{"smis-mentor":{"url":"https://smis-mentor.com/api/mcp"}}}`

## 앱 내부 시간표 (campTimetables)

캠프 > 시간표 탭은 구글시트 웹뷰 링크 대신 Firestore 문서를 앱에서 직접 그린다. 로딩이 iframe 대비 즉시이고, 모바일에서도 표가 제대로 보인다.

- 저장 단위: **캠프 × 그룹 × 일과 유형 = 문서 1개** (예: J29 × Junior × Regular Day). `campTimetables` 컬렉션.
- **반 개수는 데이터로 정해진다.** `classes` 배열 길이가 곧 열 개수라 4반이든 5반이든 코드 변경이 없다.
- **담임 이름은 저장하지 않는다.** `classes[].classCode` 가 `users.jobExperiences[].classCode` 와 같으면 화면에서 조인해 붙인다. 멘토를 교체하면 앱 배정만 바꿔도 시간표가 따라 바뀐다 (시트의 VLOOKUP 과 같은 역할).
- 교시는 `shared`(그룹 전체 병합 — 식사·P.E·인문학)와 `class`(반별 칸) 두 종류. 반이 아닌 전담 열(Pattern 등)은 `extraColumns`.
- 로테이션(과목이 반마다 한 칸씩 밀리는 구조)은 **편집기가 칸을 채워 주는 도구**이고 저장은 항상 칸 단위다. 예외 칸을 자유롭게 덮어쓸 수 있어야 하기 때문.
- 관리자 편집: 시간표 탭 → 편집. 그룹·반 추가/삭제, 교시 설정, 로테이션 자동 채우기, 다른 그룹·일과로 복사.
- 그룹-반 구성의 출처는 `campSettings/{campCode}.groups` 이고, 편집기의 "새 시간표" 버튼이 이걸 읽는다.
- Firestore 규칙: 캠프 스태프 읽기, admin 쓰기. **규칙 배포 필요** (`firebase deploy --only firestore:rules`).
- 관리시트에서 한 번에 밀어 넣기: `node scripts/seed-timetable.cjs scripts/seed/<camp>-timetable.json [--apply]` (--apply 없으면 드라이런).
- MCP 로도 다룰 수 있다 — `describe_schema("campTimetables")`, `query_documents`, `write_documents`. 레시피 "시간표를 A 캠프에서 B 캠프로 복사" 참고.

## 공개 페이지 서버 렌더링 (SEO)

`AuthProvider` 는 인증 확인이 끝나기 전에는 자식을 렌더하지 않는데(로그인 상태에 의존하는 페이지들의 전제), `src/lib/publicSsrPaths.ts` 에 열거된 공개 경로(홈, 공고 목록/상세, 지원 안내, 약관)만 예외로 두어 서버 HTML 에 실제 본문과 푸터가 포함됩니다. 이 경로의 컴포넌트는 `loading` 동안 `userData` 가 null 일 수 있으므로 로그인 안내를 바로 띄우지 말고 `loading` 을 먼저 확인해야 합니다(Header, ApplicationSection, JobApplyStatusContent, 공고 상세가 그렇게 되어 있음). `useSearchParams()` 를 쓰는 컴포넌트는 정적 프리렌더 시 Suspense 경계가 필요하므로 본문과 분리된 작은 컴포넌트로 감쌉니다(AnalyticsProvider, /recruitment 참고).

## 페이지를 추가·수정할 때

- 정적 페이지 메타는 `src/lib/ai-content/registry.ts` 에, 본문 렌더러는 `src/lib/ai-content/render/*.ts` 에, 경로 매칭은 `src/lib/ai-content/resolve.ts` 의 `resolvePage()` 에 추가합니다.
- 개인정보처리방침·이용약관은 JSX 를 직접 직렬화하므로 페이지를 고치면 마크다운도 따라옵니다(훅 없는 순수 JSX 만 가능).
- 새 Firestore 데이터를 노출할 때는 `data.ts` 에서 필요한 필드만 골라 담고, 연락처·식별번호·건강 정보는 넣지 않습니다.
- 공개 응답은 `s-maxage=300` 으로 CDN 캐시되고, 프로세스 내 캐시도 60초~5분입니다. 즉시 반영이 필요하면 `clearAiContentCache()` 를 호출하는 관리자 라우트를 추가하세요.
