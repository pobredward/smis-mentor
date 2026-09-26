import { createCampDisplayService } from '@smis-mentor/shared';
import { db } from '../config/firebase';

/** 캠프 페이지 + 링크 목록 — 구현은 shared (web 과 같은 코드) */
export const { campPageService, getDisplayItems, getCampPagesByJobCodeId } = createCampDisplayService(db);
