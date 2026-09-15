/**
 * 페이지별 마크다운 — 모든 "/{path}.md" 요청이 next.config rewrites 로 이곳에 도착한다.
 *
 *   GET /job-board.md            → /api/md/job-board
 *   GET /job-board/{id}.md       → /api/md/job-board/{id}
 *   GET /index.md                → /api/md/index (홈)
 *   GET /camp/tasks/S29.md       → 로그인 필요: Authorization: Bearer <MCP 액세스 토큰>
 */
import { NextRequest } from 'next/server';
import { renderMarkdown } from '@/lib/ai-content/resolve';
import { MCP_ENDPOINT } from '@/lib/ai-content/site';
import { verifyBearer } from '@/lib/mcp-auth/verify';

export const dynamic = 'force-dynamic';

const TEXT_HEADERS = {
  'Content-Type': 'text/markdown; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'X-Robots-Tag': 'noindex',
  Vary: 'Authorization',
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await params;
  const pathname = `/${path.join('/')}`;
  const query = req.nextUrl.search;

  const authHeader = req.headers.get('authorization');
  const verified = await verifyBearer(authHeader);
  if (authHeader && !verified) {
    return new Response('# 401 Unauthorized\n\n액세스 토큰이 유효하지 않거나 만료되었습니다.\n', {
      status: 401,
      headers: { ...TEXT_HEADERS, 'WWW-Authenticate': `Bearer resource_metadata="https://smis-mentor.com/.well-known/oauth-protected-resource/api/mcp", error="invalid_token"` },
    });
  }
  const viewer = verified?.viewer ?? null;

  const result = await renderMarkdown(`${pathname}${query}`, viewer);
  if (!result.ok) {
    const { error } = result;
    const status = error.error === 'not_found' ? 404 : error.error === 'auth_required' ? 401 : 403;
    const body = [`# ${status} ${error.error}`, '', error.message, '', `- 전체 목차: https://smis-mentor.com/llms.txt`, `- 로그인 접근(MCP): ${MCP_ENDPOINT}`, ''].join('\n');
    const headers: Record<string, string> = { ...TEXT_HEADERS };
    if (status === 401) headers['WWW-Authenticate'] = `Bearer resource_metadata="https://smis-mentor.com/.well-known/oauth-protected-resource/api/mcp"`;
    return new Response(body, { status, headers });
  }

  const isPublic = result.page.access === 'public';
  return new Response(result.markdown, {
    status: 200,
    headers: {
      ...TEXT_HEADERS,
      'Cache-Control': isPublic ? 'public, s-maxage=300, stale-while-revalidate=3600' : 'private, no-store',
    },
  });
}
