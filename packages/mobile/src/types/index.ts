import { Timestamp } from 'firebase/firestore';
import type { AuthProvider, AuthMethod } from '@smis-mentor/shared';

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

/** 사용자 — shared 의 User 한 벌을 쓴다 (예전에는 mobile 전용 축소판이 따로 있었음) */
import type { User } from '@smis-mentor/shared';
export type { User };

export interface AuthContextType {
  currentUser: any | null;
  userData: User | null;
  loading: boolean;
  authReady: boolean;
  isAuthenticated: boolean;
  refreshUserData: () => Promise<void>;
  waitForAuthReady: () => Promise<void>;
  updateActiveJobCode: (jobCodeId: string) => Promise<void>;
  triggerDataPrefetch: () => void;
  isSharingLocation: boolean;
  setIsSharingLocation: (sharing: boolean) => void;
}
