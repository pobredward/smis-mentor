/**
 * 캠프 탭 화면 목록 — campPages(직접 만든 페이지) + generationResources(링크) 합쳐 보여주기 (web·mobile 공용)
 */
import type { Firestore } from 'firebase/firestore';
import { CampPageService } from './campPageService';
import { createGenerationResourcesService } from './generationResources';
import type { CampPage, CampPageCategory, DisplayItem } from '../types/campPage';
import type { ResourceLink } from '../types/camp';
import { logger } from '../utils/logger';

export function createCampDisplayService(db: Firestore) {
  const pageSvc = new CampPageService(db);
  const resourceSvc = createGenerationResourcesService(db);

  // Hybrid 모드: 페이지 + 링크 통합 조회
  async function getDisplayItems(
    jobCodeId: string,
    category: CampPageCategory
  ): Promise<DisplayItem[]> {
    try {
      // 1. campPages에서 해당 카테고리 페이지 조회
      const pages = await pageSvc.getPagesByCategory(jobCodeId, category);
    
      // 2. generationResources에서 기존 링크 조회
      const resources = await resourceSvc.getResourcesByJobCodeId(jobCodeId);
    
      let links: ResourceLink[] = [];
      if (category === 'education') {
        links = resources?.educationLinks || [];
      } else if (category === 'schedule') {
        links = resources?.scheduleLinks || [];
      } else if (category === 'guide') {
        links = resources?.guideLinks || [];
      }
    
      // 3. 페이지를 DisplayItem으로 변환
      const pageItems: DisplayItem[] = pages.map(page => ({
        id: page.id,
        title: page.title,
        type: 'page' as const,
        targetRole: page.targetRole,
        order: page.order,
        content: page.content,
        emoji: page.emoji,
      }));
    
      // 4. 링크를 DisplayItem으로 변환 (order는 페이지 최댓값 + 1부터)
      const maxPageOrder = pageItems.length > 0 
        ? Math.max(...pageItems.map(p => p.order))
        : -1;
    
      const linkItems: DisplayItem[] = links.map((link, index) => ({
        id: link.id,
        title: link.title,
        type: 'link' as const,
        targetRole: link.targetRole || 'common',
        order: maxPageOrder + 1 + index,
        url: link.url,
        emoji: '🔗',
      }));
    
      // 5. 병합 및 정렬
      return [...pageItems, ...linkItems].sort((a, b) => a.order - b.order);
    } catch (error) {
      logger.error(`getDisplayItems (${category}) 실패:`, error);
      throw error;
    }
  }

  // jobCodeId로 모든 카테고리의 campPages를 한 번에 조회
  // useCampDataPrefetch의 prefetchCampPagesData에서 사용
  async function getCampPagesByJobCodeId(jobCodeId: string): Promise<{
    education: CampPage[];
    schedule: CampPage[];
    guide: CampPage[];
  }> {
    try {
      const categories: CampPageCategory[] = ['education', 'schedule', 'guide'];
      const results = await Promise.all(
        categories.map(category => pageSvc.getPagesByCategory(jobCodeId, category))
      );
      return {
        education: results[0],
        schedule: results[1],
        guide: results[2],
      };
    } catch (error) {
      logger.error('getCampPagesByJobCodeId 실패:', error);
      throw error;
    }
  }

  return { campPageService: pageSvc, getDisplayItems, getCampPagesByJobCodeId };
}
