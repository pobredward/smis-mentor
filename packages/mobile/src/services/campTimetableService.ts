import { CampTimetableService } from '@smis-mentor/shared';
import { db } from '../config/firebase';

/** 캠프 시간표 서비스 (모바일 인스턴스) — 로직은 web 과 동일한 shared 구현을 쓴다 */
export const campTimetableService = new CampTimetableService(db);

export default campTimetableService;
