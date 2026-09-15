/**
 * /llms.txt — AI 에이전트용 사이트 목차 (llmstxt.org 규격)
 * 공개 페이지 + 채용 공고 링크 + 로그인 페이지 안내 + MCP 접근 방법
 */
import { buildLlmsTxt } from '@/lib/ai-content/resolve';

export const dynamic = 'force-dynamic';

export async function GET() {
  const body = await buildLlmsTxt();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
