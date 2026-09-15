/**
 * SMIS Mentor MCP 서버 — 로그인(OAuth) 엔드포인트
 *
 * Claude.ai / ChatGPT 커넥터에 https://smis-mentor.com/api/mcp 를 추가하면
 * 401 + WWW-Authenticate → OAuth 메타데이터 탐색 → 동적 클라이언트 등록 → 로그인/동의 →
 * 액세스 토큰 발급 순으로 연결된다. 도구 구현은 src/lib/mcp/server.ts 참고.
 *
 * ⚠️ 반드시 apex 도메인(smis-mentor.com)을 사용할 것 — www 는 308 리다이렉트되어 POST 가 깨진다.
 */
import { NextResponse } from 'next/server';
import { createSmisMcpHandler, mcpInfo } from '@/lib/mcp/server';
import { OAUTH_CORS_HEADERS } from '@/lib/mcp-auth/metadata';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const handler = createSmisMcpHandler('auth');

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  Object.entries(OAUTH_CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

/** 사람이 브라우저로 열었을 때 안내 */
export async function GET() {
  return NextResponse.json(mcpInfo('auth'), { headers: OAUTH_CORS_HEADERS });
}

export async function POST(req: Request) {
  return withCors(await handler(req));
}

export async function DELETE(req: Request) {
  return withCors(await handler(req));
}
