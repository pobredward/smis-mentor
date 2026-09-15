/**
 * OAuth 인가 처리 API — /oauth/authorize 동의 페이지가 호출
 *
 * GET  ?client_id&redirect_uri&response_type&code_challenge&... → 파라미터 검증 + 클라이언트 정보
 * POST { idToken, decision, ...params }                          → Firebase ID 토큰 검증 후 인가 코드 발급, 리다이렉트 URL 반환
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { MCP_ENDPOINT, SITE_URL } from '@/lib/ai-content/site';
import { OAUTH_SCOPES } from '@/lib/mcp-auth/metadata';
import { createAuthCode, OAuthClient, resolveClient } from '@/lib/mcp-auth/store';
import { loadViewer } from '@/lib/mcp-auth/verify';

export const dynamic = 'force-dynamic';

export interface AuthorizeParams {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  state?: string;
  scope?: string;
  code_challenge: string;
  code_challenge_method?: string;
  resource?: string;
}

type Validation =
  | { ok: true; client: OAuthClient; params: AuthorizeParams; scope: string }
  | { ok: false; status: number; error: string; description: string; redirectable: boolean; redirectUri?: string; state?: string };

async function validate(raw: Record<string, string | undefined>): Promise<Validation> {
  const params: AuthorizeParams = {
    response_type: raw.response_type ?? '',
    client_id: raw.client_id ?? '',
    redirect_uri: raw.redirect_uri ?? '',
    state: raw.state,
    scope: raw.scope,
    code_challenge: raw.code_challenge ?? '',
    code_challenge_method: raw.code_challenge_method,
    resource: raw.resource,
  };

  if (!params.client_id) return { ok: false, status: 400, error: 'invalid_request', description: 'client_id 가 없습니다.', redirectable: false };
  const client = await resolveClient(params.client_id);
  if (!client) return { ok: false, status: 400, error: 'invalid_client', description: '등록되지 않은 클라이언트입니다. 먼저 동적 클라이언트 등록(/api/oauth/register)을 수행하세요.', redirectable: false };

  if (!params.redirect_uri || !client.redirectUris.includes(params.redirect_uri)) {
    return { ok: false, status: 400, error: 'invalid_request', description: 'redirect_uri 가 등록된 값과 일치하지 않습니다.', redirectable: false };
  }

  const redirectable = { redirectUri: params.redirect_uri, state: params.state };
  if (params.response_type !== 'code') {
    return { ok: false, status: 400, error: 'unsupported_response_type', description: 'response_type 은 code 만 지원합니다.', redirectable: true, ...redirectable };
  }
  if (!params.code_challenge) {
    return { ok: false, status: 400, error: 'invalid_request', description: 'PKCE code_challenge 가 필요합니다.', redirectable: true, ...redirectable };
  }
  if ((params.code_challenge_method ?? 'S256') !== 'S256') {
    return { ok: false, status: 400, error: 'invalid_request', description: 'code_challenge_method 는 S256 만 지원합니다.', redirectable: true, ...redirectable };
  }
  if (params.resource && params.resource !== MCP_ENDPOINT && !params.resource.startsWith(SITE_URL)) {
    return { ok: false, status: 400, error: 'invalid_target', description: `지원하지 않는 resource: ${params.resource}`, redirectable: true, ...redirectable };
  }

  const requested = (params.scope ?? '').split(/\s+/).filter(Boolean);
  const unknown = requested.filter((s) => !(OAUTH_SCOPES as readonly string[]).includes(s));
  if (unknown.length) {
    return { ok: false, status: 400, error: 'invalid_scope', description: `지원하지 않는 scope: ${unknown.join(' ')}`, redirectable: true, ...redirectable };
  }
  const scope = requested.length ? requested.join(' ') : 'read';
  return { ok: true, client, params, scope };
}

function errorRedirect(redirectUri: string, error: string, description: string, state?: string): string {
  const u = new URL(redirectUri);
  u.searchParams.set('error', error);
  u.searchParams.set('error_description', description);
  if (state) u.searchParams.set('state', state);
  return u.toString();
}

export async function GET(req: NextRequest) {
  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  const v = await validate(raw);
  if (!v.ok) {
    return NextResponse.json(
      { valid: false, error: v.error, error_description: v.description, redirectTo: v.redirectable && v.redirectUri ? errorRedirect(v.redirectUri, v.error, v.description, v.state) : undefined },
      { status: v.status, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return NextResponse.json(
    {
      valid: true,
      client: { id: v.client.clientId, name: v.client.clientName, uri: v.client.clientUri ?? null, logo: v.client.logoUri ?? null, source: v.client.source },
      scope: v.scope,
      redirectHost: new URL(v.params.redirect_uri).host,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as (Record<string, string | undefined> & { idToken?: string; decision?: string }) | null;
  if (!body) return NextResponse.json({ error: 'invalid_request', error_description: 'JSON 본문이 필요합니다.' }, { status: 400 });

  const v = await validate(body);
  if (!v.ok) {
    return NextResponse.json(
      { error: v.error, error_description: v.description, redirectTo: v.redirectable && v.redirectUri ? errorRedirect(v.redirectUri, v.error, v.description, v.state) : undefined },
      { status: v.status }
    );
  }

  if (body.decision !== 'allow') {
    return NextResponse.json({ redirectTo: errorRedirect(v.params.redirect_uri, 'access_denied', '사용자가 요청을 거부했습니다.', v.params.state) });
  }

  if (!body.idToken) return NextResponse.json({ error: 'login_required', error_description: '로그인이 필요합니다.' }, { status: 401 });
  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(body.idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'login_required', error_description: '로그인 정보가 만료되었습니다. 다시 로그인하세요.' }, { status: 401 });
  }
  const viewer = await loadViewer(uid);
  if (!viewer) return NextResponse.json({ error: 'access_denied', error_description: '활성 사용자 계정이 아닙니다.' }, { status: 403 });

  const code = await createAuthCode({
    clientId: v.client.clientId,
    redirectUri: v.params.redirect_uri,
    codeChallenge: v.params.code_challenge,
    codeChallengeMethod: 'S256',
    uid,
    scope: v.scope,
    resource: v.params.resource,
  });

  const u = new URL(v.params.redirect_uri);
  u.searchParams.set('code', code);
  if (v.params.state) u.searchParams.set('state', v.params.state);
  return NextResponse.json({ redirectTo: u.toString(), viewer: { name: viewer.name, role: viewer.role } }, { headers: { 'Cache-Control': 'no-store' } });
}
