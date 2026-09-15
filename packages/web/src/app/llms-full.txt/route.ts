/**
 * /llms-full.txt — 공개 콘텐츠 전문을 한 파일로 (홈, 공고 목록·상세, 지원 안내, 후기, 약관)
 */
import { buildLlmsFullTxt } from '@/lib/ai-content/resolve';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const body = await buildLlmsFullTxt();
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
