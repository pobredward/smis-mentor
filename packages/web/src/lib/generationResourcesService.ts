import { createGenerationResourcesService } from '@smis-mentor/shared';
import { db } from '@/lib/firebase';

export type { ResourceLink, ResourceLinkRole, STSheetConfig, GenerationResources, LinkType } from '@smis-mentor/shared';

/** 기수별 자료 링크 — 구현은 shared (mobile 과 같은 코드) */
export const generationResourcesService = createGenerationResourcesService(db);
