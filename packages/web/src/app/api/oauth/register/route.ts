/**
 * OAuth 2.0 동적 클라이언트 등록 (RFC 7591) — Claude.ai 등 MCP 클라이언트가 자동 호출
 * POST /api/oauth/register
 */
import { NextRequest, NextResponse } from 'next/server';
import { OAUTH_CORS_HEADERS } from '@/lib/mcp-auth/metadata';
import { randomToken, sha256 } from '@/lib/mcp-auth/jwt';
import { OAuthClient, saveClient } from '@/lib/mcp-auth/store';

export const dynamic = 'force-dynamic';

function error(status: number, code: string, description: string) {
  return NextResponse.json({ error: code, error_description: description }, { status, headers: OAUTH_CORS_HEADERS });
}

function isAllowedRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === 'https:') return true;
    // 로컬 개발 도구(Claude Code, MCP Inspector 등)의 loopback 리다이렉트 허용
    if (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]')) return true;
    // 네이티브 앱 커스텀 스킴
    return !['javascript:', 'data:', 'file:'].includes(u.protocol) && u.protocol !== 'http:';
  } catch {
    return false;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return error(400, 'invalid_client_metadata', 'JSON 본문이 필요합니다.');
  }

  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === 'string') : [];
  if (!redirectUris.length) return error(400, 'invalid_redirect_uri', 'redirect_uris 가 필요합니다.');
  const bad = redirectUris.find((u) => !isAllowedRedirectUri(u));
  if (bad) return error(400, 'invalid_redirect_uri', `허용되지 않는 redirect_uri: ${bad}`);

  const requestedMethod = typeof body.token_endpoint_auth_method === 'string' ? body.token_endpoint_auth_method : 'none';
  const authMethod: OAuthClient['tokenEndpointAuthMethod'] =
    requestedMethod === 'client_secret_post' || requestedMethod === 'client_secret_basic' ? requestedMethod : 'none';

  const grantTypes = Array.isArray(body.grant_types) ? body.grant_types.filter((g): g is string => typeof g === 'string') : ['authorization_code', 'refresh_token'];
  const responseTypes = Array.isArray(body.response_types) ? body.response_types.filter((r): r is string => typeof r === 'string') : ['code'];

  const clientId = `smis_${randomToken(18)}`;
  const clientSecret = authMethod === 'none' ? undefined : randomToken(32);
  const now = new Date();

  const client: OAuthClient = {
    clientId,
    clientName: typeof body.client_name === 'string' ? body.client_name.slice(0, 120) : 'MCP Client',
    redirectUris,
    tokenEndpointAuthMethod: authMethod,
    clientSecretHash: clientSecret ? sha256(clientSecret) : undefined,
    grantTypes: grantTypes.filter((g) => g === 'authorization_code' || g === 'refresh_token'),
    responseTypes: responseTypes.filter((r) => r === 'code'),
    scope: typeof body.scope === 'string' ? body.scope : 'read',
    clientUri: typeof body.client_uri === 'string' ? body.client_uri : undefined,
    logoUri: typeof body.logo_uri === 'string' ? body.logo_uri : undefined,
    source: 'dcr',
    createdAt: now,
  };
  await saveClient(client);

  return NextResponse.json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(now.getTime() / 1000),
      ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      grant_types: client.grantTypes,
      response_types: client.responseTypes,
      scope: client.scope,
      ...(client.clientUri ? { client_uri: client.clientUri } : {}),
      ...(client.logoUri ? { logo_uri: client.logoUri } : {}),
    },
    { status: 201, headers: OAUTH_CORS_HEADERS }
  );
}
