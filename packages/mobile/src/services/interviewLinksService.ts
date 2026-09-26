import { createInterviewLinksService } from '@smis-mentor/shared';
import { db } from '../config/firebase';

export type { InterviewLinks } from '@smis-mentor/shared';

/** 면접 링크 — 구현은 shared (web 과 같은 코드) */
export const { getInterviewLinks, setInterviewLinks, validateUrl } = createInterviewLinksService(db);
