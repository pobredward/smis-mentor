/** RFC 9728 — 보호 리소스 메타데이터 (루트 경로) */
import { NextResponse } from 'next/server';
import { OAUTH_CORS_HEADERS, protectedResourceMetadata } from '@/lib/mcp-auth/metadata';

export const dynamic = 'force-static';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

export async function GET() {
  return NextResponse.json(protectedResourceMetadata(), {
    headers: { ...OAUTH_CORS_HEADERS, 'Cache-Control': 'public, max-age=3600' },
  });
}
