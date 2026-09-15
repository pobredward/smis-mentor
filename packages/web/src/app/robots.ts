import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/ai-content/site';

/**
 * robots.txt
 * - 일반 크롤러: 공개 페이지 + AI 문서(llms.txt, llms-full.txt, *.md, MCP 엔드포인트) 허용
 * - AI 에이전트(OpenAI, Anthropic, Google, Perplexity): 동일 + 명시 허용
 * - 관리자·캠프·프로필·OAuth 화면은 크롤 제외 (로그인 페이지)
 */
const AI_ALLOW = ['/', '/llms.txt', '/llms-full.txt', '/*.md', '/api/mcp', '/api/mcp/public', '/api/md/', '/.well-known/'];
const DISALLOW = ['/admin/', '/camp/', '/profile', '/settings', '/oauth/', '/api/'];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: AI_ALLOW,
        disallow: DISALLOW,
      },
      {
        userAgent: [
          // OpenAI
          'GPTBot',
          'ChatGPT-User',
          'OAI-SearchBot',
          // Anthropic
          'ClaudeBot',
          'Claude-User',
          'Claude-SearchBot',
          'anthropic-ai',
          // 기타
          'Google-Extended',
          'PerplexityBot',
          'Perplexity-User',
        ],
        allow: AI_ALLOW,
        disallow: ['/admin/', '/camp/', '/profile', '/settings', '/oauth/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
