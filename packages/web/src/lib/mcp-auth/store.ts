/**
 * MCP OAuth 저장소 (Firestore, Admin SDK 전용)
 *
 * 컬렉션 — 클라이언트 SDK 규칙은 기본 거부이므로 브라우저에서 접근 불가:
 * - mcpOAuthClients/{clientId}          : 동적 등록(DCR) 또는 CIMD 로 알게 된 클라이언트
 * - mcpOAuthCodes/{code}                : 인가 코드 (10분)
 * - mcpOAuthRefreshTokens/{sha256(token)}: 리프레시 토큰 (30일, 회전)
 */
import type { DocumentData } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { AUTH_CODE_TTL_SEC, randomToken, REFRESH_TOKEN_TTL_SEC, sha256 } from './jwt';

export interface OAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: 'none' | 'client_secret_post' | 'client_secret_basic';
  clientSecretHash?: string;
  grantTypes: string[];
  responseTypes: string[];
  scope?: string;
  clientUri?: string;
  logoUri?: string;
  source: 'dcr' | 'cimd';
  createdAt: Date;
}

export interface AuthCode {
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256' | 'plain';
  uid: string;
  scope: string;
  resource?: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface RefreshTokenRecord {
  tokenHash: string;
  uid: string;
  clientId: string;
  scope: string;
  createdAt: Date;
  expiresAt: Date;
}

const CLIENTS = 'mcpOAuthClients';
const CODES = 'mcpOAuthCodes';
const REFRESH = 'mcpOAuthRefreshTokens';

type Doc = DocumentData;

function toDateSafe(v: unknown): Date {
  if (v instanceof Date) return v;
  if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  return new Date(0);
}

// ─── 클라이언트 ────────────────────────────────────────────────────────

function toClient(d: Doc): OAuthClient {
  return {
    clientId: d.clientId,
    clientName: d.clientName ?? '',
    redirectUris: Array.isArray(d.redirectUris) ? d.redirectUris : [],
    tokenEndpointAuthMethod: d.tokenEndpointAuthMethod ?? 'none',
    clientSecretHash: d.clientSecretHash,
    grantTypes: Array.isArray(d.grantTypes) ? d.grantTypes : ['authorization_code', 'refresh_token'],
    responseTypes: Array.isArray(d.responseTypes) ? d.responseTypes : ['code'],
    scope: d.scope,
    clientUri: d.clientUri,
    logoUri: d.logoUri,
    source: d.source ?? 'dcr',
    createdAt: toDateSafe(d.createdAt),
  };
}

function clientDocId(clientId: string): string {
  return encodeURIComponent(clientId);
}

export async function saveClient(client: OAuthClient): Promise<void> {
  const data: Doc = { ...client };
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);
  await getAdminFirestore().collection(CLIENTS).doc(clientDocId(client.clientId)).set(data);
}

export async function getStoredClient(clientId: string): Promise<OAuthClient | null> {
  const snap = await getAdminFirestore().collection(CLIENTS).doc(clientDocId(clientId)).get();
  return snap.exists ? toClient(snap.data() as Doc) : null;
}

/**
 * client_id 로 클라이언트 조회. 등록되지 않은 https URL 이면
 * CIMD(Client ID Metadata Document, MCP 2026 스펙)로 메타데이터를 가져와 캐시한다.
 */
export async function resolveClient(clientId: string): Promise<OAuthClient | null> {
  const stored = await getStoredClient(clientId);
  if (stored) return stored;

  if (/^https:\/\//i.test(clientId)) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(clientId, { headers: { accept: 'application/json' }, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const meta = (await res.json()) as Doc;
      if (meta.client_id !== clientId || !Array.isArray(meta.redirect_uris)) return null;
      const client: OAuthClient = {
        clientId,
        clientName: meta.client_name ?? new URL(clientId).hostname,
        redirectUris: meta.redirect_uris.filter((u: unknown) => typeof u === 'string'),
        tokenEndpointAuthMethod: 'none',
        grantTypes: Array.isArray(meta.grant_types) ? meta.grant_types : ['authorization_code', 'refresh_token'],
        responseTypes: ['code'],
        scope: meta.scope,
        clientUri: meta.client_uri,
        logoUri: meta.logo_uri,
        source: 'cimd',
        createdAt: new Date(),
      };
      await saveClient(client);
      return client;
    } catch {
      return null;
    }
  }
  return null;
}

// ─── 인가 코드 ─────────────────────────────────────────────────────────

export async function createAuthCode(data: Omit<AuthCode, 'code' | 'createdAt' | 'expiresAt'>): Promise<string> {
  const code = randomToken(32);
  const now = new Date();
  const record: AuthCode = { ...data, code, createdAt: now, expiresAt: new Date(now.getTime() + AUTH_CODE_TTL_SEC * 1000) };
  await getAdminFirestore().collection(CODES).doc(code).set(record);
  return code;
}

/** 코드를 소비(삭제)하면서 반환. 만료·미존재면 null */
export async function consumeAuthCode(code: string): Promise<AuthCode | null> {
  const ref = getAdminFirestore().collection(CODES).doc(code);
  const db = getAdminFirestore();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.delete(ref);
    const d = snap.data() as Doc;
    const record: AuthCode = {
      code,
      clientId: d.clientId,
      redirectUri: d.redirectUri,
      codeChallenge: d.codeChallenge,
      codeChallengeMethod: d.codeChallengeMethod ?? 'S256',
      uid: d.uid,
      scope: d.scope ?? 'read',
      resource: d.resource,
      createdAt: toDateSafe(d.createdAt),
      expiresAt: toDateSafe(d.expiresAt),
    };
    if (record.expiresAt.getTime() < Date.now()) return null;
    return record;
  });
}

// ─── 리프레시 토큰 ─────────────────────────────────────────────────────

export async function issueRefreshToken(data: { uid: string; clientId: string; scope: string }): Promise<string> {
  const token = randomToken(48);
  const now = new Date();
  const record: RefreshTokenRecord = {
    tokenHash: sha256(token),
    uid: data.uid,
    clientId: data.clientId,
    scope: data.scope,
    createdAt: now,
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SEC * 1000),
  };
  await getAdminFirestore().collection(REFRESH).doc(record.tokenHash).set(record);
  return token;
}

/** 리프레시 토큰을 소비(삭제)하고 반환 — 회전(rotation)용 */
export async function consumeRefreshToken(token: string): Promise<RefreshTokenRecord | null> {
  const hash = sha256(token);
  const ref = getAdminFirestore().collection(REFRESH).doc(hash);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.delete();
  const d = snap.data() as Doc;
  const record: RefreshTokenRecord = {
    tokenHash: hash,
    uid: d.uid,
    clientId: d.clientId,
    scope: d.scope ?? 'read',
    createdAt: toDateSafe(d.createdAt),
    expiresAt: toDateSafe(d.expiresAt),
  };
  if (record.expiresAt.getTime() < Date.now()) return null;
  return record;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await getAdminFirestore().collection(REFRESH).doc(sha256(token)).delete().catch(() => undefined);
}
