/**
 * OAuth 2.0 토큰 폐기 (RFC 7009) — POST /api/oauth/revoke
 * 리프레시 토큰만 즉시 폐기된다(액세스 토큰은 최대 1시간 후 자동 만료).
 */
import { NextRequest, NextResponse } from 'next/server';
import { OAUTH_CORS_HEADERS } from '@/lib/mcp-auth/metadata';
import { revokeRefreshToken } from '@/lib/mcp-auth/store';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? '';
  let token = '';
  if (ct.includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as { token?: string };
    token = body.token ?? '';
  } else {
    token = new URLSearchParams(await req.text()).get('token') ?? '';
  }
  if (token) await revokeRefreshToken(token);
  // RFC 7009: 존재 여부와 무관하게 200
  return new NextResponse(null, { status: 200, headers: { ...OAUTH_CORS_HEADERS, 'Cache-Control': 'no-store' } });
}
