import { Timestamp } from 'firebase/firestore';

export interface User {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  phoneNumber: string;
  password: string;
  address: string;
  addressDetail: string;
  role: 'user' | 'mentor' | 'admin';
  jobExperiences?: Array<{id: string, group: JobGroup}>;
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
}

export type JobGroup = 'junior' | 'middle' | 'senior' | 'spring' | 'summer' | 'autumn' | 'winter' | 'common';

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
}

export type JobCodeWithId = JobCode & { id: string };

export type JobCodeWithGroup = JobCodeWithId & { group: JobGroup };

export type JobExperience = {
  jobExperienceId: string;
  refUserId: string;
  refGeneration: string;
  refCode: string;
};

export interface JobBoard {
  title: string;
  description: string;
  status: 'active' | 'closed';
  generation: string;
  jobCode: string;
  refJobCodeId: string;
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
  interviewStatus?: 'pending' | 'passed' | 'failed';
  finalStatus?: 'finalAccepted' | 'finalRejected';
  refJobBoardId: string;
  refUserId: string;
  interviewDate?: Timestamp;
  interviewDateTime?: Timestamp;
  interviewFeedback?: string;
  interviewBaseLink?: string;
  interviewBaseDuration?: number;
  interviewBaseNotes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ApplicationHistoryWithId = ApplicationHistory & { id: string }; 