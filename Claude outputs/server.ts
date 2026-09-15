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
import { getCamps, getUsers, getUserSummary } from '@/lib/ai-content/data';
import { renderUserDetail } from '@/lib/ai-content/render/admin';
import { lessonMaterialsMarkdown } from '@/lib/ai-content/render/lesson';
import { fmtRange } from '@/lib/ai-content/markdown';
import { verifyBearer } from '@/lib/mcp-auth/verify';
import { DataToolError, describeSchema, getDocument, queryDocuments, writeDocuments } from '@/lib/mcp/data-tools';
import { DATA_TOOL_LIMITS } from '@/lib/mcp/datamodel';

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

/** 데이터 도구 공통 래퍼 — 검증 오류는 ❌ 텍스트로, 그 외 예외는 그대로 */
async function dataTool(fn: () => Promise<unknown> | unknown) {
  try {
    return json(await fn());
  } catch (e) {
    if (e instanceof DataToolError) return { ...text(`❌ ${e.message}`), isError: true };
    throw e;
  }
}

function instructions(mode: McpMode): string {
  return [
    `${SITE_NAME} (${SITE_URL}) 콘텐츠 서버. ${SITE_DESCRIPTION}`,
    '',
    '사용 순서: 1) list_pages 또는 search 로 페이지를 찾고 2) read_page 로 마크다운을 읽거나 3) crawl 로 페이지와 하위 페이지를 한 번에 수집합니다.',
    '모든 페이지는 URL 뒤에 .md 를 붙여 마크다운으로 받을 수도 있고, 공개 전문은 llms-full.txt 에 있습니다.',
    mode === 'auth'
      ? [
          '이 엔드포인트는 로그인 사용자용입니다. whoami 로 현재 계정과 역할을 확인하고, 캠프 페이지는 list_camps 의 캠프 코드(예: S29)를 camp 파라미터에 넣으세요.',
          '데이터 작업: describe_schema 로 컬렉션·필드·권한·작업 레시피를 확인한 뒤 query_documents / get_document 로 읽습니다. 관리자는 write_documents 로 생성·수정·삭제할 수 있는데, 반드시 먼저 confirm 없이 호출해(dry-run) 미리보기를 사용자에게 보여주고 승인을 받은 뒤 previewHash 와 confirm=true 로 실행하세요. 사용자 승인 없이 confirm 을 보내지 마세요.',
        ].join('\n')
      : '이 엔드포인트는 공개 페이지 전용입니다. 로그인이 필요한 캠프 운영·관리자 페이지는 /api/mcp (OAuth) 로 연결하세요.',
  ].join('\n');
}

const whereClauseSchema = z.object({
  field: z.string().min(1).describe('필드 이름 (점 표기 가능. 예: "author.id")'),
  op: z.enum(['==', '!=', '<', '<=', '>', '>=', 'in', 'not-in', 'array-contains', 'contains', 'exists']).describe('연산자. contains=문자열 부분 일치(대소문자 무시), exists=필드 존재 여부'),
  value: z.any().optional().describe('비교 값. in/not-in 은 배열, 날짜는 "YYYY-MM-DD" 또는 ISO 8601 문자열'),
});

const writeOperationSchema = z.object({
  op: z.enum(['create', 'update', 'delete']),
  collection: z.string().min(1).describe('컬렉션 이름 (describe_schema 의 write 에 해당 op 가 있어야 함)'),
  id: z.string().optional().describe('문서 ID. update/delete 필수. create 는 idOnCreate 가 required 인 컬렉션(캠프 코드/캠프 ID 가 ID)만 필수'),
  data: z.record(z.string(), z.any()).optional().describe('create: 전체 필드, update: 바꿀 최상위 필드만. 날짜는 "YYYY-MM-DD"(한국시간 자정) 또는 ISO 8601'),
});

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

  if (mode === 'auth') {
    server.registerTool(
      'get_lesson_materials',
      {
        title: '수업 자료 링크 추출',
        description:
          '특정 선생님(멘토)의 수업 자료를 대주제(예: "S28 패턴")별로 섹션과 보기/원본(편집) 링크까지 전부 표로 정리합니다. 관리자는 이름 또는 사용자 ID로 아무 선생님이나 조회, 그 외는 본인 것만. 이름이 여러 명과 일치하면 후보 목록을 돌려줍니다.',
        inputSchema: z.object({
          user: z.string().optional().describe('선생님 이름 또는 사용자 ID. 생략하면 본인'),
          camp: z.string().optional().describe('캠프 코드로 대주제 필터 (예: "S28" → 제목에 S28 이 들어간 대주제만)'),
        }),
      },
      async ({ user, camp }, ctx) => {
        const viewer = viewerOf(ctx as ToolCtx);
        if (!viewer || !canAccess('mentor', viewer)) return text('멘토·원어민·관리자 계정이 필요합니다.');
        let targetUid = viewer.uid;
        if (user && user.trim() && user.trim() !== viewer.uid && user.trim() !== viewer.name) {
          if (!canAccess('admin', viewer)) return text('다른 선생님의 수업 자료는 관리자만 조회할 수 있습니다.');
          const q = user.trim();
          const byId = await getUserSummary(q);
          if (byId) targetUid = byId.uid;
          else {
            const matches = (await getUsers()).filter((u) => u.name === q || u.name.includes(q));
            if (matches.length === 0) return text(`"${q}" 에 해당하는 사용자가 없습니다.`);
            if (matches.length > 1) {
              return text(
                `"${q}" 에 해당하는 사용자가 ${matches.length}명입니다. 사용자 ID로 다시 요청하세요:\n` +
                  matches.map((u) => `- ${u.name} (${u.role}${u.university ? `, ${u.university}` : ''}) — ID: ${u.uid}`).join('\n')
              );
            }
            targetUid = matches[0].uid;
          }
        }
        const target = await getUserSummary(targetUid);
        if (!target) return text('사용자를 찾을 수 없습니다.');
        let md = await lessonMaterialsMarkdown(target);
        if (camp) {
          const code = camp.trim().toLowerCase();
          // 대주제 섹션(### 제목) 단위로 필터
          const parts = md.split(/\n(?=### )/);
          const head = parts.shift() ?? '';
          const kept = parts.filter((p) => p.split('\n')[0].toLowerCase().includes(code));
          md = [head, ...(kept.length ? kept : [`_"${camp}" 에 해당하는 대주제가 없습니다._`])].join('\n');
        }
        return text(`# 수업 자료 — ${target.name}\n\n${md}`);
      }
    );
  }

  // ─── 범용 데이터 도구 (스키마 기반 읽기/쓰기) ─────────────────────────
  if (mode === 'auth') {
    server.registerTool(
      'describe_schema',
      {
        title: '데이터 스키마 설명',
        description:
          '현재 계정이 다룰 수 있는 Firestore 컬렉션과 필드·타입·권한·쓰기 규칙·작업 레시피(캠프 간 교육 자료/업무 복사, 서류 전형 평가 초안, 수업 자료 링크 추출 등)를 설명합니다. query_documents / write_documents 를 쓰기 전에 먼저 호출하세요. collection 을 주면 그 컬렉션의 필드 상세를 반환합니다.',
        inputSchema: z.object({
          collection: z.string().optional().describe('상세를 볼 컬렉션 이름. 생략하면 전체 개요 + 레시피'),
        }),
      },
      async ({ collection }, ctx) => {
        const viewer = viewerOf(ctx as ToolCtx);
        if (!viewer) return text('로그인 정보가 없습니다.');
        return dataTool(() => describeSchema(viewer, collection));
      }
    );

    server.registerTool(
      'query_documents',
      {
        title: '문서 조회 (조건·정렬·페이지)',
        description:
          `컬렉션에서 조건에 맞는 문서를 가져옵니다. == 와 in 은 Firestore 에서, 나머지 연산자와 정렬은 메모리에서 처리하므로(처음 ${DATA_TOOL_LIMITS.scanCap}건) 가능하면 == / in 으로 먼저 좁히세요. 개인정보 필드는 제거되고, large 필드(HTML 본문 등)는 includeLarge=true 또는 fields 로 요청해야 포함됩니다. 관리자가 아니면 본인 참여 캠프/본인 문서로 자동 제한됩니다.`,
        inputSchema: z.object({
          collection: z.string().min(1).describe('컬렉션 이름. 예: campPages, campTasks, jobCodes, users'),
          parentId: z.string().optional().describe('서브컬렉션(sections)일 때 상위 문서 ID'),
          where: z.array(whereClauseSchema).optional().describe('조건 목록 (AND)'),
          orderBy: z.object({ field: z.string().min(1), direction: z.enum(['asc', 'desc']).optional() }).optional(),
          limit: z.number().int().min(1).max(DATA_TOOL_LIMITS.queryMaxLimit).optional().describe(`반환 개수 (기본 ${DATA_TOOL_LIMITS.queryDefaultLimit})`),
          offset: z.number().int().min(0).optional().describe('건너뛸 개수 (페이지네이션)'),
          fields: z.array(z.string()).optional().describe('반환할 필드만 지정 (large 필드 포함 가능)'),
          includeLarge: z.boolean().optional().describe('large 필드 포함 여부 (기본 false)'),
        }),
      },
      async (args, ctx) => {
        const viewer = viewerOf(ctx as ToolCtx);
        if (!viewer) return text('로그인 정보가 없습니다.');
        return dataTool(() => queryDocuments(args, viewer));
      }
    );

    server.registerTool(
      'get_document',
      {
        title: '문서 하나 읽기',
        description: '문서 ID 로 문서 하나를 전체(large 필드 포함) 읽습니다. 복사·수정 전에 원본을 확보할 때 사용합니다.',
        inputSchema: z.object({
          collection: z.string().min(1),
          id: z.string().min(1),
          parentId: z.string().optional().describe('서브컬렉션일 때 상위 문서 ID'),
          fields: z.array(z.string()).optional().describe('반환할 필드만 지정'),
          includeLarge: z.boolean().optional().describe('기본 true'),
        }),
      },
      async (args, ctx) => {
        const viewer = viewerOf(ctx as ToolCtx);
        if (!viewer) return text('로그인 정보가 없습니다.');
        return dataTool(() => getDocument(args, viewer));
      }
    );

    server.registerTool(
      'write_documents',
      {
        title: '문서 생성·수정·삭제 (관리자, dry-run → confirm)',
        description:
          `관리자 전용. 최대 ${DATA_TOOL_LIMITS.maxWriteOps}개 작업을 한 배치로 처리합니다. confirm 을 주지 않으면 dry-run: 스키마·필수값·참조(캠프 ID/코드, 카테고리 등) 검증과 변경 미리보기, previewHash 를 돌려주고 아무것도 바꾸지 않습니다. 반드시 미리보기를 사용자에게 보여주고 승인을 받은 뒤, 동일한 operations 와 previewHash 에 confirm=true 를 붙여 다시 호출하세요. 실행 내역은 mcpAuditLogs 에 남습니다. 서버 관리 필드(createdAt 등)와 숨김 필드는 지정할 수 없고, 필수 필드는 describe_schema(collection) 으로 확인합니다.`,
        inputSchema: z.object({
          operations: z.array(writeOperationSchema).min(1).max(DATA_TOOL_LIMITS.maxWriteOps),
          note: z.string().optional().describe('감사 로그에 남길 작업 설명. 예: "J28 교육 자료 → J29 복사"'),
          confirm: z.boolean().optional().describe('true 면 실행 (previewHash 필수). 기본 false = dry-run'),
          previewHash: z.string().optional().describe('직전 dry-run 이 돌려준 previewHash'),
        }),
      },
      async (args, ctx) => {
        const viewer = viewerOf(ctx as ToolCtx);
        if (!viewer) return text('로그인 정보가 없습니다.');
        return dataTool(() => writeDocuments(args, viewer));
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
        ? 'Claude.ai 커넥터 / ChatGPT 커넥터에 이 URL 을 추가하면 SMIS Mentor 로그인 창이 열립니다. 로그인 후 역할에 맞는 페이지를 읽을 수 있고, 관리자는 데이터 도구로 캠프 자료·업무·평가를 조회·수정(dry-run → confirm)할 수 있습니다.'
        : '인증 없이 공개 페이지(채용 공고, 지원 안내, 후기, 약관)를 읽을 수 있는 엔드포인트입니다.',
    setup: {
      claudeAi: 'Settings → Connectors → Add custom connector → URL 에 endpoint 입력',
      chatgpt: 'Settings → Apps & Connectors → Developer mode 활성화 → Create → URL 에 endpoint 입력 (Auth: OAuth 또는 None)',
      claudeCode: `claude mcp add --transport http smis-mentor ${endpoint}`,
      cursor: { mcpServers: { 'smis-mentor': { url: endpoint } } },
    },
    tools: mode === 'auth'
      ? [
          'get_site_overview',
          'list_pages',
          'search',
          'fetch',
          'read_page',
          'crawl',
          'whoami',
          'list_camps',
          'find_users',
          'get_lesson_materials',
          'describe_schema',
          'query_documents',
          'get_document',
          'write_documents',
        ]
      : ['get_site_overview', 'list_pages', 'search', 'fetch', 'read_page', 'crawl'],
    alsoSee: { llmsTxt: LLMS_TXT_URL, llmsFullTxt: LLMS_FULL_URL, markdownSuffix: `${SITE_URL}/{path}.md` },
  };
}
