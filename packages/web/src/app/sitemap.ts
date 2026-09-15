import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/ai-content/site';
import { getJobBoards } from '@/lib/ai-content/data';

export const dynamic = 'force-dynamic';

/**
 * 사이트맵 — 공개 페이지 + 채용 공고 상세(동적)
 * apex 도메인(smis-mentor.com)을 사용한다. www 는 308 리다이렉트.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/job-board`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${SITE_URL}/recruitment`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE_URL}/recruitment?tab=review`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/sign-in`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
    { url: `${SITE_URL}/sign-up`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${SITE_URL}/privacy-policy`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms-of-service`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];

  let boardPages: MetadataRoute.Sitemap = [];
  try {
    const boards = await getJobBoards();
    boardPages = boards.map((b) => ({
      url: `${SITE_URL}/job-board/${b.id}`,
      lastModified: b.updatedAt ?? b.createdAt ?? now,
      changeFrequency: b.status === 'active' ? ('daily' as const) : ('monthly' as const),
      priority: b.status === 'active' ? 0.9 : 0.5,
    }));
  } catch (error) {
    console.error('sitemap: 채용 공고 조회 실패', error);
  }

  return [...staticPages, ...boardPages];
}
