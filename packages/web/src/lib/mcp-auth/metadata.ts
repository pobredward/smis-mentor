/**
 * OAuth 2.0 메타데이터 (RFC 8414 인가 서버 메타데이터, RFC 9728 보호 리소스 메타데이터)
 */
import { MCP_ENDPOINT, SITE_URL } from '@/lib/ai-content/site';

export const OAUTH_SCOPES = ['read'] as const;

export const OAUTH_ENDPOINTS = {
  issuer: SITE_URL,
  authorization: `${SITE_URL}/oauth/authorize`,
  token: `${SITE_URL}/api/oauth/token`,
  registration: `${SITE_URL}/api/oauth/register`,
  revocation: `${SITE_URL}/api/oauth/revoke`,
};

export function authorizationServerMetadata() {
  return {
    issuer: OAUTH_ENDPOINTS.issuer,
    authorization_endpoint: OAUTH_ENDPOINTS.authorization,
    token_endpoint: OAUTH_ENDPOINTS.token,
    registration_endpoint: OAUTH_ENDPOINTS.registration,
    revocation_endpoint: OAUTH_ENDPOINTS.revocation,
    scopes_supported: [...OAUTH_SCOPES],
    response_types_supported: ['code'],
    response_modes_supported: ['query'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    code_challenge_methods_supported: ['S256'],
    // MCP 2026-07-28: Client ID Metadata Documents 지원
    client_id_metadata_document_supported: true,
    service_documentation: `${SITE_URL}/llms.txt`,
    ui_locales_supported: ['ko-KR', 'en-US'],
  };
}

export function protectedResourceMetadata() {
  return {
    resource: MCP_ENDPOINT,
    authorization_servers: [OAUTH_ENDPOINTS.issuer],
    scopes_supported: [...OAUTH_SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'SMIS Mentor MCP',
    resource_documentation: `${SITE_URL}/llms.txt`,
  };
}

export const OAUTH_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Mcp-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version',
  'Access-Control-Max-Age': '86400',
};
