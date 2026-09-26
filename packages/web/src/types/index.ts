import { Timestamp } from 'firebase/firestore';
import type { JobExperienceGroupRole, NotificationSettings } from '@smis-mentor/shared';

export interface PartTimeJob {
  period: string;
  companyName: string;
  position: string;
  description: string;
}

/** 사용자 — shared 의 User 한 벌을 쓴다 (예전에는 web·shared 에 각각 정의돼 어긋났음) */
export type { User } from '@smis-mentor/shared';

export type JobGroup = 'junior' | 'middle' | 'senior' | 'spring' | 'summer' | 'autumn' | 'winter' | 'common' | 'manager' | 'short1' | 'short2' | 'short3' | 'short4';

export interface JobCode {
  name: string;
  code: string;
  generation: string;
  location: string;
  startDate: Timestamp;
  endDate: Timestamp;
  eduDates: Timestamp[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  group?: JobGroup;
  korea: boolean;
}

export type JobCodeWithId = JobCode & { id: string };

export type JobCodeWithGroup = JobCodeWithId & { group: JobGroup };

export type JobExperience = {
  jobExperienceId: string;
  refUserId: string;
  refGeneration: string;
  refCode: string;
};

// JobExperienceGroupRole은 shared에서 import
export type { JobExperienceGroupRole };

export interface JobBoard {
  title: string;
  description: string;
  status: 'active' | 'closed';
  generation: string;
  jobCode: string;
  refJobCodeId: string;
  korea: boolean;
  interviewDates: { start: Timestamp; end: Timestamp }[];
  interviewBaseDuration: number;
  interviewBaseLink: string;
  interviewPassword: string;
  interviewBaseNotes: string;
  educationStartDate: Timestamp;
  educationEndDate: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type JobBoardWithId = JobBoard & { id: string };

export interface ApplicationHistory {
  applicationHistoryId: string;
  applicationDate: Timestamp;
  applicationStatus: 'pending' | 'accepted' | 'rejected';
  interviewStatus?: 'pending' | 'complete' | 'passed' | 'failed' | 'absent';
  finalStatus?: 'finalAccepted' | 'finalRejected' | 'finalAbsent';
  refJobBoardId: string;
  refUserId: string;
  interviewDate?: Timestamp;
  interviewFeedback?: string;
  interviewBaseLink?: string;
  interviewBaseDuration?: number;
  interviewBaseNotes?: string;
  applicationPath?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ApplicationHistoryWithId = ApplicationHistory & { id: string };

export interface Review {
  id: string;
  title: string;
  content: string;
  author: {
    id: string;
    name: string;
    profileImage?: string;
  };
  generation: string;
  jobCode: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  rating?: number;
  writer?: string;
  reviewId?: string;
}

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