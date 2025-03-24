import { Timestamp } from 'firebase/firestore';

export type User = {
  userId: string;
  name: string;
  phoneNumber: string;
  jobExperiences: string[];
  email: string;
  password: string;
  address: string;
  addressDetail: string;
  rrnFront: string;
  rrnLast: string;
  gender: 'M' | 'F' | '';
  age: number;
  agreedPersonal: boolean;
  profileImage: string;
  role: 'user' | 'mentor' | 'admin';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  status: 'temp' | 'active' | 'inactive';
  isEmailVerified: boolean;
  lastLoginAt: Timestamp;
  selfIntroduction: string;
  jobMotivation: string;
  feedback: string;
};

export interface JobCode {
  id?: string;
  generation: string;
  code: string;
  name: string;
  eduDates: Timestamp[];
  startDate: Timestamp;
  endDate: Timestamp;
  location: string;
}

export type JobExperience = {
  jobExperienceId: string;
  refUserId: string;
  refGeneration: string;
  refCode: string;
};

export type JobBoard = {
  jobBoardId: string;
  refJobCodeId: string;
  refGeneration: string;
  refCode: string;
  title: string;
  description: string;
  createdAt: Timestamp;
  createdBy: string;
  status: 'active' | 'closed';
  interviewDates: Timestamp[];
  customInterviewDateAllowed: boolean;
  refEduDates: Timestamp[];
  interviewBaseLink?: string;
  interviewBaseDuration?: number;
  interviewBaseNote?: string;
};

export interface ApplicationHistory {
  applicationHistoryId: string;
  applicationDate: Timestamp;
  applicationStatus: 'pending' | 'accepted' | 'rejected';
  interviewStatus?: 'pending' | 'passed' | 'failed';
  finalStatus?: 'finalAccepted' | 'finalRejected';
  refJobBoardId: string;
  refUserId: string;
  interviewDate?: Timestamp;
  interviewFeedback?: string;
  interviewLink?: string;
  interviewDuration?: number;
  interviewNote?: string;
} 