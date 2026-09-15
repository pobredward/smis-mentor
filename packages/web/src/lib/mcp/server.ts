/**
 * SMIS Mentor MCP 서버 (mcp-handler + MCP SDK v2, Streamable HTTP, stateless)
 *
 * - /api/mcp        : OAuth 로그인 필수. 역할(멘토/원어민/관리자)에 맞는 페이지까지 읽기 전용 제공
 * - /api/mcp/public : 인증 없음. 공개 페이지만
 *
 * 도구 이름 `search` / `fetch` 는 ChatGPT 커넥터(딥리서치) 규격을 따르고,
 * `read_page` / `crawl` 은 Claude 등 범용 클라이언트용 마크다운 도구다.
 */
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod4';
import {
  ACCESS_LABEL,
  canAccess,
  COMPANY_INFO,
  EVALUATION_STAGES,
  LLMS_FULL_URL,
  LLMS_TXT_URL,
  MCP_ENDPOINT,
  MCP_PUBLIC_ENDPOINT,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  toMarkdownUrl,
  Viewer,
} from '@/lib/ai-content/site';
import { crawlPages, listPages, renderMarkdown, searchPages } from '@/lib/ai-content/resolve';
import { PAGE_REGISTRY } from '@/lib/ai-content/registry';
import { getCamps, getUsers } from '@/lib/ai-content/data';
import { renderUserDetail } from '@/lib/ai-content/render/admin';
import { fmtRange } from '@/lib/ai-content/markdown';
import { verifyBearer } from '@/lib/mcp-auth/verify';

export type McpMode = 'public' | 'auth';

const SERVER_VERSION = '2.0.0';

type ToolCtx = { http?: { authInfo?: { extra?: Record<string, unknown> } } } | undefined;

function viewerOf(ctx: ToolCtx): Viewer | null {
  const v = ctx?.http?.authInfo?.extra?.viewer;
  return v ? (v as Viewer) : null;
}

function text(t: string) {
  return { content: [{ type: 'text' as const, text: t }] };
}

function json(value: unknown) {
  return text(JSON.stringify(value, null, 2));
}

function instructions(mode: McpMode): string {
  return [
    `${SITE_NAME} (${SITE_URL}) 콘텐츠 서버. ${SITE_DESCRIPTION}`,
    '',
    '사용 순서: 1) list_pages 또는 search 로 페이지를 찾고 2) read_page 로 마크다운을 읽거나 3) crawl 로 페이지와 하위 페이지를 한 번에 수집합니다.',
    '모든 페이지는 URL 뒤에 .md 를 붙여 마크다운으로 받을 수도 있고, 공개 전문은 llms-full.txt 에 있습니다.',
    mode === 'auth'
      ? '이 엔드포인트는 로그인 사용자용입니다. whoami 로 현재 계정과 역할을 확인하고, 캠프 페이지는 list_camps 의 캠프 코드(예: S29)를 camp 파라미터에 넣으세요. 모든 도구는 읽기 전용입니다.'
      : '이 엔드포인트는 공개 페이지 전용입니다. 로그인이 필요한 캠프 운영·관리자 페이지는 /api/mcp (OAuth) 로 연결하세요.',
  ].join('\n');
}

function registerTools(server: McpServer, mode: McpMode) {
  server.registerTool(
    'get_site_overview',
    {
      title: '사이트 개요',
      description: 'SMIS 멘토 플랫폼의 개요 — 서비스 목적, 회사 정보, 평가 단계, AI 접근 방법(llms.txt, .md, MCP 엔드포인트)을 반환합니다.',
      inputSchema: z.object({}),
    },
    async (_args, ctx) => {
      const viewer = viewerOf(ctx as ToolCtx);
      return json({
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        company: COMPANY_INFO,
        evaluationStages: EVALUATION_STAGES,
        aiAccess: {
          llmsTxt: LLMS_TXT_URL,
          llmsFullTxt: LLMS_FULL_URL,
          markdownSuffix: '.md',
          mcpPublic: MCP_PUBLIC_ENDPOINT,
          mcpAuth: MCP_ENDPOINT,
        },
        viewer: viewer ? { name: viewer.name, role: viewer.role } : null,
        totalRegisteredPages: PAGE_REGISTRY.length,
      });
    }
  );

  server.registerTool(
    'list_pages',
    {
      title: '페이지 목록',
      description:
        '현재 권한으로 읽을 수 있는 모든 페이지 목록(경로, 제목, 설명, 접근 권한, 태그, 마크다운 URL). 채용 공고와 캠프 탭은 동적으로 포함됩니다. access 또는 tag 로 필터링할 수 있습니다.',
      inputSchema: z.object({
        access: z.enum(['public', 'auth', 'mentor', 'admin']).optional().describe('접근 등급으로 필터'),
        tag: z.string().optional().describe('태그 부분 일치 필터. 예: "채용", "업무"'),
      }),
    },
    async ({ access, tag }, ctx) => {
      const viewer = viewerOf(ctx as ToolCtx);
      const pages = await listPages(viewer, { access, tag });
      return json({
        total: pages.length,
        pages: pages.map((p) => ({
          path: p.path,
          title: p.title,
          description: p.description,
          access: p.access,
          accessLabel: ACCESS_LABEL[p.access],
          url: p.url,
          markdownUrl: p.markdownUrl,
          tags: p.tags,
          hasContent: p.hasContent,
        })),
      });
    }
  );

  server.registerTool(
    'search',
    {
      title: '검색',
      description:
        '키워드로 페이지를 검색합니다(제목·설명·태그·본문). 채용 공고, 후기, (로그인 시) 캠프 페이지·업무까지 검색됩니다. 결과의 id 를 fetch 또는 read_page 에 넘기세요.',
      inputSchema: z.object({
        query: z.string().min(1).describe('검색어. 예: "싱가포르 캠프 혜택", "면접 일정", "밴드 작성"'),
      }),
    },
    async ({ query }, ctx) => {
      const viewer = viewerOf(ctx as ToolCtx);
      const hits = await searchPages(query, viewer, 20);
      return json({
        results: hits.map((h) => ({ id: h.path, title: h.title, url: h.url, markdownUrl: h.markdownUrl, snippet: h.snippet, access: h.access })),
      });
    }
  );

  server.registerTool(
    'fetch',
    {
      title: '페이지 가져오기 (ChatGPT 호환)',
      description: 'id(경로 또는 URL)로 페이지 전체 텍스트를 가져옵니다. 응답은 {id, title, text, url, metadata} JSON 입니다. 하위 페이지 목록은 metadata.children 에 있습니다.',
      inputSchema: z.object({
        id: z.string().min(1).describe('페이지 경로 또는 URL. 예: "/job-board", "https://smis-mentor.com/camp/tasks/S29"'),
      }),
    },
    async ({ id }, ctx) => {
      const viewer = viewerOf(ctx as ToolCtx);
      const result = await renderMarkdown(id, viewer);
      if (!result.ok) {
        return json({ id, title: '오류', text: result.error.message, url: `${SITE_URL}${result.error.path}`, metadata: { error: result.error.error } });
      }
      const { page, markdown } = result;
      return json({
        id: page.path,
        title: page.title,
        text: markdown,
        url: `${SITE_URL}${page.path === '/' ? '' : page.path}`,
        metadata: {
          description: page.description,
          access: page.access,
          tags: page.tags,
          markdownUrl: toMarkdownUrl(page.path),
          updatedAt: page.updatedAt?.toISOString(),
          children: page.children.map((c) => ({ id: c.path, title: c.title, access: c.access })),
        },
      });
    }
  );

  server.registerTool(
    'read_page',
    {
      title: '페이지 읽기 (마크다운)',
      description:
        '페이지 하나를 마크다운으로 읽습니다. 문서 끝의 "하위 · 관련 페이지" 목록으로 다음 페이지를 탐색할 수 있습니다. 캠프 페이지는 경로에 캠프 코드를 포함하거나 camp 파라미터를 주세요.',
      inputSchema: z.object({
        url: z.string().min(1).describe('페이지 URL 또는 경로. 예: "https://smis-mentor.com/", "/job-board", "/camp/education/S29"'),
        camp: z.string().optional().describe('캠프 코드(예: S29) 또는 jobCodes ID — 캠프 경로에 코드가 없을 때 사용'),
      }),
    },
    async ({ url, camp }, ctx) => {
      const viewer = viewerOf(ctx as ToolCtx);
      const target = camp && !/\/camp\/[a-z]+\/[^/]+/.test(url) ? `${url}${url.includes('?') ? '&' : '?'}camp=${encodeURIComponent(camp)}` : url;
      const result = await renderMarkdown(target, viewer);
      if (!result.ok) return text(`❌ ${result.error.message}`);
      return text(result.markdown);
    }
  );

  server.registerTool(
    'crawl',
    {
      title: '페이지 + 하위 페이지 수집',
      description:
        '지정한 페이지와 그 하위·관련 페이지를 BFS 로 따라가며 마크다운으로 한 번에 수집합니다. 루트 URL 만 주면 사이트 전체(권한 범위 내)를 읽을 수 있습니다. 분량 한도에 걸리면 truncated 로 표시되며, 생략된 경로는 read_page 로 개별 조회하세요.',
      inputSchema: z.object({
        url: z.string().min(1).describe('시작 페이지 URL 또는 경로. 예: "https://smis-mentor.com/"'),
        max_depth: z.number().int().min(0).max(4).default(2).describe('따라갈 링크 깊이 (기본 2)'),
        max_pages: z.number().int().min(1).max(100).default(30).describe('최대 페이지 수 (기본 30)'),
        max_chars: z.number().int().min(5000).max(140000).default(120000).describe('최대 글자 수 (기본 120,000)'),
      }),
    },
    async ({ url, max_depth, max_pages, max_chars }, ctx) => {
      const viewer = viewerOf(ctx as ToolCtx);
      const result = await crawlPages(url, viewer, { maxDepth: max_depth, maxPages: max_pages, maxChars: max_chars });
      return text(result.markdown);
    }
  );

  if (mode === 'auth') {
    server.registerTool(
      'whoami',
      {
        title: '현재 계정',
        description: '로그인한 계정의 이름·역할·상태·참여 캠프를 반환합니다. 어떤 페이지를 읽을 수 있는지 판단할 때 먼저 호출하세요.',
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        const viewer = viewerOf(ctx as ToolCtx);
        if (!viewer) return text('로그인 정보가 없습니다.');
        const camps = await getCamps();
        const mine = camps.filter((c) => viewer.jobCodeIds.includes(c.id) || viewer.activeJobCodeId === c.id);
        return json({
          name: viewer.name,
          role: viewer.role,
          status: viewer.status,
          canRead: {
            public: true,
            profile: canAccess('auth', viewer),
            camp: canAccess('mentor', viewer),
            admin: canAccess('admin', viewer),
          },
          activeCamp: mine.find((c) => c.id === viewer.activeJobCodeId)?.code ?? null,
          camps: mine.map((c) => ({ code: c.code, name: c.name, generation: c.generation, period: fmtRange(c.startDate, c.endDate) })),
        });
      }
    );

    server.registerTool(
      'list_camps',
      {
        title: '캠프 목록',
        description: '캠프(jobCodes) 목록 — 코드, 기수, 이름, 장소, 기간. 캠프 페이지 경로(/camp/tasks/{code} 등)에 쓸 코드를 확인합니다. 관리자는 전체, 그 외는 본인 참여 캠프만.',
        inputSchema: z.object({}),
      },
      async (_args, ctx) => {
        const viewer = viewerOf(ctx as ToolCtx);
        if (!viewer || !canAccess('mentor', viewer)) return text('멘토·원어민·관리자 계정이 필요합니다.');
        const camps = await getCamps();
        const listed = viewer.role === 'admin' ? camps : camps.filter((c) => viewer.jobCodeIds.includes(c.id) || viewer.activeJobCodeId === c.id);
        // 최근 캠프·활성 캠프만 페이지 URL 을 펼쳐 주고, 나머지는 경로 패턴으로 안내해 응답을 짧게 유지
        const recent = new Set(listed.slice(0, 10).map((c) => c.id));
        return json({
          total: listed.length,
          pathPattern: `${SITE_URL}/camp/{education|schedule|guide|tasks|roster|class|room}/{code}.md`,
          camps: listed.map((c) => ({
            code: c.code,
            id: c.id,
            generation: c.generation,
            name: c.name,
            location: c.location,
            korea: c.korea,
            period: fmtRange(c.startDate, c.endDate),
            active: c.id === viewer.activeJobCodeId,
            ...(recent.has(c.id) || c.id === viewer.activeJobCodeId
              ? {
                  pages: {
                    education: toMarkdownUrl(`/camp/education/${c.code}`),
                    schedule: toMarkdownUrl(`/camp/schedule/${c.code}`),
                    guide: toMarkdownUrl(`/camp/guide/${c.code}`),
                    tasks: toMarkdownUrl(`/camp/tasks/${c.code}`),
                    roster: toMarkdownUrl(`/camp/roster/${c.code}`),
                  },
                }
              : {}),
          })),
        });
      }
    );

    server.registerTool(
      'find_users',
      {
        title: '사용자 검색 (관리자)',
        description:
          '관리자 전용. 이름·대학·전공으로 사용자를 검색하고, 일치하는 사용자의 상세(참여 캠프, 지원 이력, 평가 요약)를 반환합니다. 연락처·주민번호 등 개인정보는 제공하지 않습니다.',
        inputSchema: z.object({
          query: z.string().min(1).describe('이름 또는 대학/전공 키워드'),
          role: z.enum(['mentor', 'mentor_temp', 'foreign', 'foreign_temp', 'admin']).optional().describe('역할 필터'),
          limit: z.number().int().min(1).max(20).default(5).describe('상세를 반환할 최대 인원 (기본 5)'),
        }),
      },
      async ({ query, role, limit }, ctx) => {
        const viewer = viewerOf(ctx as ToolCtx);
        if (!viewer || !canAccess('admin', viewer)) return text('관리자 계정이 필요합니다.');
        const q = query.toLowerCase();
        const users = (await getUsers()).filter(
          (u) => (!role || u.role === role) && [u.name, u.university, u.major].some((v) => v?.toLowerCase().includes(q))
        );
        if (!users.length) return text(`"${query}" 에 해당하는 사용자가 없습니다.`);
        const details = await Promise.all(users.slice(0, limit).map((u) => renderUserDetail(u.uid)));
        const more = users.length > limit ? `\n\n_외 ${users.length - limit}명: ${users.slice(limit).map((u) => u.name).join(', ')}_` : '';
        return text(`검색 결과 ${users.length}명\n\n${details.filter(Boolean).join('\n\n---\n\n')}${more}`);
      }
    );
  }

  // ─── 리소스: 레지스트리 페이지를 마크다운 리소스로 노출 ──────────────
  PAGE_REGISTRY.filter((m) => !m.path.includes('{') && m.hasContent !== false && !m.excluded)
    .filter((m) => (mode === 'public' ? m.access === 'public' : true))
    .forEach((m) => {
      server.registerResource(
        `page:${m.path}`,
        toMarkdownUrl(m.path),
        { title: m.title, description: `${m.description} (${ACCESS_LABEL[m.access]})`, mimeType: 'text/markdown' },
        async (uri, ctx) => {
          const viewer = viewerOf(ctx as ToolCtx);
          const result = await renderMarkdown(m.path, viewer);
          const body = result.ok ? result.markdown : `❌ ${result.error.message}`;
          return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: body }] };
        }
      );
    });
}

/** 모드별 MCP 라우트 핸들러 생성 */
export function createSmisMcpHandler(mode: McpMode): (req: Request) => Promise<Response> {
  const handler = createMcpHandler((server) => registerTools(server, mode), {
    serverInfo: { name: mode === 'auth' ? 'smis-mentor' : 'smis-mentor-public', version: SERVER_VERSION },
    instructions: instructions(mode),
  });

  if (mode === 'public') return handler;

  return withMcpAuth(
    handler,
    async (_req, token) => {
      const verified = await verifyBearer(token ? `Bearer ${token}` : null);
      if (!verified) return undefined;
      return {
        token: verified.token,
        clientId: verified.clientId,
        scopes: verified.scope.split(' ').filter(Boolean),
        expiresAt: verified.expiresAt,
        extra: { viewer: verified.viewer },
      };
    },
    {
      required: true,
      // resource_metadata = `${resourceUrl(origin)}${resourceMetadataPath}`
      resourceMetadataPath: '/.well-known/oauth-protected-resource/api/mcp',
      resourceUrl: SITE_URL,
    }
  );
}

/** 사람이 브라우저로 GET 했을 때 보여줄 안내 JSON */
export function mcpInfo(mode: McpMode) {
  const endpoint = mode === 'auth' ? MCP_ENDPOINT : MCP_PUBLIC_ENDPOINT;
  return {
    name: mode === 'auth' ? 'SMIS Mentor MCP Server' : 'SMIS Mentor MCP Server (public)',
    version: SERVER_VERSION,
    transport: 'Streamable HTTP (MCP)',
    endpoint,
    auth: mode === 'auth' ? 'OAuth 2.1 (authorization code + PKCE, dynamic client registration 지원)' : 'none',
    description:
      mode === 'auth'
        ? 'Claude.ai 커넥터 / ChatGPT 커넥터에 이 URL 을 추가하면 SMIS Mentor 로그인 창이 열립니다. 로그인 후 역할에 맞는 페이지를 읽을 수 있습니다 (읽기 전용).'
        : '인증 없이 공개 페이지(채용 공고, 지원 안내, 후기, 약관)를 읽을 수 있는 엔드포인트입니다.',
    setup: {
      claudeAi: 'Settings → Connectors → Add custom connector → URL 에 endpoint 입력',
      chatgpt: 'Settings → Apps & Connectors → Developer mode 활성화 → Create → URL 에 endpoint 입력 (Auth: OAuth 또는 None)',
      claudeCode: `claude mcp add --transport http smis-mentor ${endpoint}`,
      cursor: { mcpServers: { 'smis-mentor': { url: endpoint } } },
    },
    tools: mode === 'auth'
      ? ['get_site_overview', 'list_pages', 'search', 'fetch', 'read_page', 'crawl', 'whoami', 'list_camps', 'find_users']
      : ['get_site_overview', 'list_pages', 'search', 'fetch', 'read_page', 'crawl'],
    alsoSee: { llmsTxt: LLMS_TXT_URL, llmsFullTxt: LLMS_FULL_URL, markdownSuffix: `${SITE_URL}/{path}.md` },
  };
}
