/**
 * MCP OAuth 액세스 토큰 (JWT, HS256)
 *
 * 비밀키: MCP_JWT_SECRET 환경변수. 없으면 FIREBASE_PRIVATE_KEY 해시로 대체(경고 출력).
 */
import { createHash, randomBytes } from 'crypto';
import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { MCP_ENDPOINT, SITE_URL } from '@/lib/ai-content/site';

export const ACCESS_TOKEN_TTL_SEC = 60 * 60; // 1시간
export const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 30; // 30일
export const AUTH_CODE_TTL_SEC = 10 * 60; // 10분

let warned = false;

function getSecret(): Uint8Array {
  const explicit = process.env.MCP_JWT_SECRET;
  if (explicit && explicit.length >= 16) return new TextEncoder().encode(explicit);
  const fallback = process.env.FIREBASE_PRIVATE_KEY;
  if (!fallback) throw new Error('MCP_JWT_SECRET 환경변수가 설정되지 않았습니다.');
  if (!warned) {
    console.warn('⚠️ MCP_JWT_SECRET 이 없어 FIREBASE_PRIVATE_KEY 파생 키를 사용합니다. 운영 환경에서는 MCP_JWT_SECRET 을 설정하세요.');
    warned = true;
  }
  return createHash('sha256').update(`mcp-jwt:${fallback}`).digest();
}

export interface AccessTokenClaims extends JWTPayload {
  sub: string; // Firebase uid
  client_id: string;
  scope: string;
  role?: string;
  name?: string;
}

export async function signAccessToken(claims: { uid: string; clientId: string; scope: string; role: string; name: string }): Promise<string> {
  return new SignJWT({ client_id: claims.clientId, scope: claims.scope, role: claims.role, name: claims.name })
    .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
    .setIssuer(SITE_URL)
    .setAudience(MCP_ENDPOINT)
    .setSubject(claims.uid)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SEC}s`)
    .setJti(randomBytes(12).toString('hex'))
    .sign(getSecret());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { issuer: SITE_URL, audience: MCP_ENDPOINT });
    if (!payload.sub || typeof payload.client_id !== 'string') return null;
    return payload as AccessTokenClaims;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** PKCE S256: base64url(sha256(verifier)) */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
