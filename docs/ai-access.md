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

## 2층 — MCP 서버

구현: `src/lib/mcp/server.ts` (mcp-handler 2.x + MCP SDK v2, Streamable HTTP, stateless). 도구는 모두 **읽기 전용**입니다.

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

리소스(`resources/list`)로도 레지스트리 페이지가 `https://smis-mentor.com/{path}.md` URI 로 노출됩니다.

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

Firestore 컬렉션(Admin SDK 전용, 클라이언트 규칙은 기본 거부): `mcpOAuthClients`, `mcpOAuthCodes`, `mcpOAuthRefreshTokens`. 선택: Firestore TTL 정책을 `expiresAt` 필드에 걸어두면 만료 문서가 자동 삭제됩니다.

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

## 페이지를 추가·수정할 때

- 정적 페이지 메타는 `src/lib/ai-content/registry.ts` 에, 본문 렌더러는 `src/lib/ai-content/render/*.ts` 에, 경로 매칭은 `src/lib/ai-content/resolve.ts` 의 `resolvePage()` 에 추가합니다.
- 개인정보처리방침·이용약관은 JSX 를 직접 직렬화하므로 페이지를 고치면 마크다운도 따라옵니다(훅 없는 순수 JSX 만 가능).
- 새 Firestore 데이터를 노출할 때는 `data.ts` 에서 필요한 필드만 골라 담고, 연락처·식별번호·건강 정보는 넣지 않습니다.
- 공개 응답은 `s-maxage=300` 으로 CDN 캐시되고, 프로세스 내 캐시도 60초~5분입니다. 즉시 반영이 필요하면 `clearAiContentCache()` 를 호출하는 관리자 라우트를 추가하세요.
