/** RFC 8414 — OAuth 인가 서버 메타데이터 (MCP 클라이언트가 로그인 흐름을 찾는 진입점) */
import { NextResponse } from 'next/server';
import { authorizationServerMetadata, OAUTH_CORS_HEADERS } from '@/lib/mcp-auth/metadata';

export const dynamic = 'force-static';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

export async function GET() {
  return NextResponse.json(authorizationServerMetadata(), {
    headers: { ...OAUTH_CORS_HEADERS, 'Cache-Control': 'public, max-age=3600' },
  });
}
