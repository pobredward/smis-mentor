/**
 * SMIS Mentor MCP 서버 — 공개(인증 없음) 엔드포인트
 * https://smis-mentor.com/api/mcp/public
 */
import { NextResponse } from 'next/server';
import { createSmisMcpHandler, mcpInfo } from '@/lib/mcp/server';
import { OAUTH_CORS_HEADERS } from '@/lib/mcp-auth/metadata';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const handler = createSmisMcpHandler('public');

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  Object.entries(OAUTH_CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

export async function GET() {
  return NextResponse.json(mcpInfo('public'), { headers: OAUTH_CORS_HEADERS });
}

export async function POST(req: Request) {
  return withCors(await handler(req));
}

export async function DELETE(req: Request) {
  return withCors(await handler(req));
}
