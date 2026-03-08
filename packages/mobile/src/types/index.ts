import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'mentor' | 'mentor_temp' | 'foreign' | 'foreign_temp';
export type UserStatus = 'active' | 'deactivated' | 'temp';

export interface JobExperience {
  id: string;
  group: string;
  groupRole: string;
  classCode?: string;
}

export interface PartTimeJob {
  period: string;
  companyName: string;
  position: string;
  description: string;
}

export interface User {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  phone?: string;
  phoneNumber?: string;
  birth?: string;
  age?: number;
  address?: string;
  addressDetail?: string;
  profileImage?: string;
  school?: string;
  university?: string;
  major?: string;
  major1?: string;
  major2?: string;
  studentId?: string;
  grade?: number;
  isOnLeave?: boolean;
  jobExperiences?: JobExperience[];
  activeJobExperienceId?: string;
  selfIntroduction?: string;
  jobMotivation?: string;
  partTimeJobs?: PartTimeJob[];
  gender?: 'M' | 'F';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
}

export interface AuthContextType {
  currentUser: any | null;
  userData: User | null;
  loading: boolean;
  authReady: boolean;
  refreshUserData: () => Promise<void>;
  waitForAuthReady: () => Promise<void>;
  updateActiveJobCode: (jobCodeId: string) => Promise<void>;
}
