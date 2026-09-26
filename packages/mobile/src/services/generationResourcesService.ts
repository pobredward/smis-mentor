import { createGenerationResourcesService } from '@smis-mentor/shared';
import { db } from '../config/firebase';

export type { ResourceLink, ResourceLinkRole, STSheetConfig, GenerationResources, LinkType } from '@smis-mentor/shared';

/** 기수별 자료 링크 — 구현은 shared (web 과 같은 코드) */
const generationResourcesService = createGenerationResourcesService(db);
export { generationResourcesService };
export default generationResourcesService;
