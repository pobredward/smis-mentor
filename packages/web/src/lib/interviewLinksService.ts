import { createInterviewLinksService } from '@smis-mentor/shared';
import { db } from './firebase';

export type { InterviewLinks } from '@smis-mentor/shared';

/** 면접 링크 — 구현은 shared (mobile 과 같은 코드) */
export const { getInterviewLinks, setInterviewLinks, validateUrl } = createInterviewLinksService(db);
