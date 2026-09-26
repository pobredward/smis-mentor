import { Timestamp } from 'firebase/firestore';

/**
 * 사용자·채용 공통 타입 — shared 한 벌을 쓴다 (예전에는 web·shared 에 각각 정의돼 어긋났음)
 */
export type {
  User, PartTimeJob, JobGroup, JobCode, JobCodeWithId, JobCodeWithGroup, JobExperience, JobExperienceGroupRole,
  JobBoard, JobBoardWithId, ApplicationHistory, ApplicationHistoryWithId, Review,
} from '@smis-mentor/shared';

export interface ShareToken {
  id: string;
  token: string;
  refJobBoardId: string;
  refApplicationIds: string[];
  expiresAt: Timestamp;
  createdAt: Timestamp;
  createdBy: string;
  isActive: boolean;
} 