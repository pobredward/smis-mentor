/**
 * Next.js 16 proxy (구 middleware) — AI 에이전트용 콘텐츠 협상
 *
 * AI 에이전트(Claude, ChatGPT, Perplexity 등)의 fetch 도구나 `Accept: text/markdown` 요청이
 * 일반 페이지 URL(예: https://smis-mentor.com/)을 열면, 브라우저용 HTML(대부분 클라이언트 렌더링이라
 * 본문이 비어 있음) 대신 같은 페이지의 마크다운(/api/md/...)을 돌려준다.
 * → "링크만 줘도" 루트에서 llms.txt 안내와 하위 페이지 링크까지 바로 읽힌다.
 *
 * 사람(브라우저)·검색엔진 요청은 건드리지 않는다. Cloudflare "Markdown for Agents" 와 같은 방식.
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

export default function proxy(req: NextRequest) {
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
  // 정적 파일·API·Next 내부 경로 제외
  matcher: ['/((?!api|_next|monitoring|oauth|\\.well-known|llms|sitemap\\.xml|robots\\.txt|manifest\\.json|.*\\.[a-zA-Z0-9]+$).*)'],
};
