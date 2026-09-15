/**
 * OAuth 2.1 토큰 엔드포인트 — POST /api/oauth/token
 *
 * - grant_type=authorization_code (+ PKCE S256 필수) → access_token(JWT 1h) + refresh_token(30d)
 * - grant_type=refresh_token → 회전(rotation)하여 새 토큰 발급
 */
import { NextRequest, NextResponse } from 'next/server';
import { MCP_ENDPOINT } from '@/lib/ai-content/site';
import { OAUTH_CORS_HEADERS } from '@/lib/mcp-auth/metadata';
import { ACCESS_TOKEN_TTL_SEC, pkceChallenge, sha256, signAccessToken } from '@/lib/mcp-auth/jwt';
import { cleanupExpiredOAuthDocs, consumeAuthCode, consumeRefreshToken, issueRefreshToken, OAuthClient, resolveClient } from '@/lib/mcp-auth/store';
import { loadViewer } from '@/lib/mcp-auth/verify';

export const dynamic = 'force-dynamic';

const NO_STORE = { ...OAUTH_CORS_HEADERS, 'Cache-Control': 'no-store', Pragma: 'no-cache' };

function oauthError(status: number, code: string, description: string, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json({ error: code, error_description: description }, { status, headers: { ...NO_STORE, ...extraHeaders } });
}

async function readParams(req: NextRequest): Promise<Record<string, string>> {
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? '')]));
  }
  const text = await req.text();
  return Object.fromEntries(new URLSearchParams(text).entries());
}

/** client_secret_basic / client_secret_post / none 인증 */
async function authenticateClient(req: NextRequest, params: Record<string, string>): Promise<{ client: OAuthClient } | { error: NextResponse }> {
  let clientId = params.client_id ?? '';
  let clientSecret = params.client_secret;

  const basic = req.headers.get('authorization');
  if (basic?.toLowerCase().startsWith('basic ')) {
    try {
      const decoded = Buffer.from(basic.slice(6), 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      clientId = decodeURIComponent(decoded.slice(0, idx));
      clientSecret = decodeURIComponent(decoded.slice(idx + 1));
    } catch {
      return { error: oauthError(401, 'invalid_client', 'Basic 인증 헤더 형식 오류', { 'WWW-Authenticate': 'Basic realm="oauth"' }) };
    }
  }
  if (!clientId) return { error: oauthError(400, 'invalid_request', 'client_id 가 필요합니다.') };

  const client = await resolveClient(clientId);
  if (!client) return { error: oauthError(401, 'invalid_client', '등록되지 않은 client_id 입니다.') };

  if (client.tokenEndpointAuthMethod !== 'none') {
    if (!clientSecret || !client.clientSecretHash || sha256(clientSecret) !== client.clientSecretHash) {
      return { error: oauthError(401, 'invalid_client', 'client_secret 이 올바르지 않습니다.') };
    }
  }
  return { client };
}

async function issueTokens(uid: string, client: OAuthClient, scope: string) {
  const viewer = await loadViewer(uid);
  if (!viewer) return oauthError(400, 'invalid_grant', '사용자 계정을 찾을 수 없거나 비활성 상태입니다.');
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({ uid, clientId: client.clientId, scope, role: viewer.role, name: viewer.name }),
    issueRefreshToken({ uid, clientId: client.clientId, scope }),
  ]);
  // 만료 문서 정리 (응답을 막지 않도록 결과는 기다리지 않음)
  cleanupExpiredOAuthDocs().catch(() => undefined);
  return NextResponse.json(
    { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TOKEN_TTL_SEC, refresh_token: refreshToken, scope },
    { headers: NO_STORE }
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const params = await readParams(req);
  const grantType = params.grant_type;

  const auth = await authenticateClient(req, params);
  if ('error' in auth) return auth.error;
  const { client } = auth;

  if (grantType === 'authorization_code') {
    const { code, redirect_uri: redirectUri, code_verifier: verifier, resource } = params;
    if (!code) return oauthError(400, 'invalid_request', 'code 가 필요합니다.');
    if (!verifier) return oauthError(400, 'invalid_request', 'code_verifier(PKCE)가 필요합니다.');

    const record = await consumeAuthCode(code);
    if (!record) return oauthError(400, 'invalid_grant', '인가 코드가 유효하지 않거나 만료되었습니다.');
    if (record.clientId !== client.clientId) return oauthError(400, 'invalid_grant', '인가 코드가 이 클라이언트의 것이 아닙니다.');
    if (redirectUri && redirectUri !== record.redirectUri) return oauthError(400, 'invalid_grant', 'redirect_uri 가 일치하지 않습니다.');
    if (resource && resource !== MCP_ENDPOINT && record.resource && resource !== record.resource) {
      return oauthError(400, 'invalid_target', `지원하지 않는 resource: ${resource}`);
    }

    const expected = record.codeChallengeMethod === 'plain' ? verifier : pkceChallenge(verifier);
    if (expected !== record.codeChallenge) return oauthError(400, 'invalid_grant', 'PKCE 검증에 실패했습니다.');

    return issueTokens(record.uid, client, record.scope);
  }

  if (grantType === 'refresh_token') {
    const { refresh_token: refreshToken } = params;
    if (!refreshToken) return oauthError(400, 'invalid_request', 'refresh_token 이 필요합니다.');
    const record = await consumeRefreshToken(refreshToken);
    if (!record) return oauthError(400, 'invalid_grant', '리프레시 토큰이 유효하지 않거나 만료되었습니다.');
    if (record.clientId !== client.clientId) return oauthError(400, 'invalid_grant', '리프레시 토큰이 이 클라이언트의 것이 아닙니다.');
    const scope = params.scope && params.scope.split(' ').every((s) => record.scope.split(' ').includes(s)) ? params.scope : record.scope;
    return issueTokens(record.uid, client, scope);
  }

  return oauthError(400, 'unsupported_grant_type', `지원하지 않는 grant_type: ${grantType ?? '(없음)'}`);
}
