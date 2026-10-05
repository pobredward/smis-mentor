/**
 * Next.js 16 proxy (구 middleware) — AI 에이전트용 콘텐츠 협상
 *
 * AI 에이전트(Claude, ChatGPT, Perplexity 등)의 fetch 도구나 `Accept: text/markdown` 요청이
 * 일반 페이지 URL(예: https://smis-mentor.com/)을 열면, 브라우저용 HTML(대부분 클라이언트 렌더링이라
 * 본문이 비어 있음) 대신 같은 페이지의 마크다운(/api/md/...)을 돌려준다.
 * → "링크만 줘도" 루트에서 llms.txt 안내와 하위 페이지 링크까지 바로 읽힌다.
 *
 * 사람(브라우저)·검색엔진 요청은 건드리지 않는다. Cloudflare "Markdown for Agents" 와 같은 방식.
 *
 * 점검 모드 (이관 · 리허설) — Vercel 환경 변수
 *   MAINTENANCE_MODE=1    화면만 막는다 (API 는 그대로 — 앱 시험용)
 *   MAINTENANCE_MODE=all  화면 + API 모두 막는다 (전환 당일 옛 사이트: 복사하는 동안 쓰기 금지)
 *   MAINTENANCE_BYPASS_TOKEN=<임의 문자열>  주소 뒤에 ?bypass=<값> 을 붙여 한 번 열면 그 브라우저는 14일 동안 통과
 *   MAINTENANCE_MESSAGE   안내 문구 (없으면 기본 문구)
 */
import { NextRequest, NextResponse } from 'next/server';

const AI_USER_AGENTS =
  /(Claude-User|ClaudeBot|Claude-SearchBot|anthropic-ai|ChatGPT-User|GPTBot|OAI-SearchBot|PerplexityBot|Perplexity-User|cohere-ai|Applebot-Extended|meta-externalagent|Bytespider|DuckAssistBot|YouBot|MistralAI-User)/i;

/** 마크다운 버전이 존재하는 페이지 경로만 협상 대상 */
const NEGOTIABLE_PATH =
  /^\/(|job-board(\/[^/]+)?|recruitment(\/reviews)?|privacy-policy|terms-of-service|sign-in|sign-up|profile|camp(\/.*)?|admin(\/.*)?)$/;

function prefersMarkdown(req: NextRequest): boolean {
  if (req.method !== 'GET') return false;
  const accept = req.headers.get('accept') ?? '';
  // 브라우저는 text/markdown 을 보내지 않는다. 명시적으로 원하면 협상.
  if (/text\/markdown/i.test(accept)) return true;
  const ua = req.headers.get('user-agent') ?? '';
  return AI_USER_AGENTS.test(ua);
}

const MAINTENANCE = process.env.MAINTENANCE_MODE ?? '';
const BYPASS = process.env.MAINTENANCE_BYPASS_TOKEN ?? '';
const BYPASS_COOKIE = 'smis_maintenance_bypass';
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

function maintenance(req: NextRequest): NextResponse | null {
  if (MAINTENANCE !== '1' && MAINTENANCE !== 'all') return null;
  const { pathname, searchParams } = req.nextUrl;
  if (BYPASS && searchParams.get('bypass') === BYPASS) {
    const url = req.nextUrl.clone();
    url.searchParams.delete('bypass');
    const res = NextResponse.redirect(url);
    res.cookies.set(BYPASS_COOKIE, BYPASS, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 14, path: '/' });
    return res;
  }
  if (BYPASS && req.cookies.get(BYPASS_COOKIE)?.value === BYPASS) return null;
  const isApi = pathname.startsWith('/api/');
  if (isApi && MAINTENANCE !== 'all') return null;
  const message = process.env.MAINTENANCE_MESSAGE || '서비스 점검 중입니다. 잠시 후 다시 접속해주세요.';
  if (isApi) {
    return NextResponse.json({ error: message, maintenance: true }, { status: 503, headers: { 'Retry-After': '3600' } });
  }
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>점검 중 · SMIS CAMP</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,'Apple SD Gothic Neo',sans-serif;background:#f8fafc;color:#0f172a}main{max-width:420px;padding:32px 24px;text-align:center}h1{font-size:22px;margin:0 0 12px}p{font-size:15px;line-height:1.6;color:#475569;margin:0}</style></head>
<body><main><h1>SMIS CAMP</h1><p>${escapeHtml(message)}</p></main></body></html>`;
  return new NextResponse(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'Retry-After': '3600' } });
}

export default function proxy(req: NextRequest) {
  const blocked = maintenance(req);
  if (blocked) return blocked;
  const { pathname, search } = req.nextUrl;
  if (!NEGOTIABLE_PATH.test(pathname) || !prefersMarkdown(req)) return NextResponse.next();

  const target = req.nextUrl.clone();
  target.pathname = `/api/md${pathname === '/' ? '/index' : pathname}`;
  target.search = search;

  const headers = new Headers(req.headers);
  headers.set('x-smis-md-negotiated', '1');
  return NextResponse.rewrite(target, { request: { headers } });
}

export const config = {
  // 정적 파일 · Next 내부 경로 · 앱 링크 파일 제외 (API 는 점검 모드 때문에 포함 — 마크다운 협상은 페이지 경로만 본다)
  matcher: ['/((?!_next|monitoring|\\.well-known|.*\\.[a-zA-Z0-9]+$).*)'],
};
