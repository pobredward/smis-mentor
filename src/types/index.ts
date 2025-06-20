import { Timestamp } from 'firebase/firestore';

export interface PartTimeJob {
  period: string;
  companyName: string;
  position: string;
  description: string;
}

export interface User {
  id: string;
  userId: string;
  name: string;
  email: string;
  originalEmail?: string;
  phone?: string;
  phoneNumber: string;
  password: string;
  address: string;
  addressDetail: string;
  role: 'user' | 'mentor' | 'admin';
  jobExperiences?: Array<{
    id: string,
    group: JobGroup,
    groupRole: JobExperienceGroupRole,
    classCode?: string
  }>;
  partTimeJobs?: PartTimeJob[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
  age?: number;
  agreedTerms: boolean;
  agreedPersonal: boolean;
  profileImage: string;
  status: 'temp' | 'active' | 'inactive';
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isProfileCompleted: boolean;
  isTermsAgreed: boolean;
  isPersonalAgreed: boolean;
  isAddressVerified: boolean;
  isProfileImageUploaded: boolean;
  jobMotivation: string;
  selfIntroduction?: string;
  feedback: string;
  gender?: 'M' | 'F';
  rrnFront?: string;
  rrnLast?: string;
  university?: string;
  grade?: number;
  isOnLeave?: boolean;
  major1?: string;
  major2?: string;
  referralPath?: string;
  referrerName?: string;
  school?: string;
  major?: string;
  schoolActivities?: {
    name: string;
    period: string;
    description: string;
  }[];
}

export type JobGroup = 'junior' | 'middle' | 'senior' | 'spring' | 'summer' | 'autumn' | 'winter' | 'common' | 'manager';

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

export type JobExperienceGroupRole = '담임' | '수업' | '서포트' | '리더' | '매니저' | '부매니저';

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