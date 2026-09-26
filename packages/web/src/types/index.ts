import { Timestamp } from 'firebase/firestore';
import type { JobExperienceGroupRole, NotificationSettings } from '@smis-mentor/shared';

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
  originalEmail?: string; // Soft Delete 시 원본 이메일 백업
  originalName?: string; // Soft Delete 시 원본 이름 백업
  phone?: string;
  phoneNumber: string;
  password: string;
  address: string;
  addressDetail: string;
  
  // 지오코딩 정보 (위치 기반 기능용)
  geocode?: {
    lat: number;
    lng: number;
    updatedAt: Timestamp;
  };
  
  role: 'mentor' | 'mentor_temp' | 'foreign' | 'foreign_temp' | 'admin';
  jobExperiences?: Array<{
    id: string,
    group: JobGroup,
    groupRole: JobExperienceGroupRole,
    classCode?: string
  }>;
  jobCodeIds?: string[];
  activeJobExperienceId?: string;
  /** 기기별 Expo 푸시 토큰 — 앱에서 알림을 허용하고 로그인하면 등록된다 */
  pushTokens?: Record<string, { platform?: string; addedAt?: Timestamp; lastUsed?: Timestamp }>;
  /** 알림 설정 (전체 on/off + 종류별) */
  notificationSettings?: NotificationSettings;
  /** 커뮤니티에서 내가 차단한 사용자 uid 목록 */
  blockedUsers?: string[];
  /** 가입 시 동의한 약관·개인정보처리방침 버전 (CONSENT_VERSION) 과 시각 */
  consentVersion?: string;
  consentedAt?: any;
  /** 앱이 기록한 휴대폰 알림 권한 상태 */
  notificationPermission?: { status: 'granted' | 'denied' | 'undetermined'; platform?: string; updatedAt?: Timestamp };
  /** 모바일 앱을 마지막으로 연 시각 */
  lastMobileAt?: Timestamp;
  partTimeJobs?: PartTimeJob[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastLoginAt?: Timestamp;
  deletedAt?: Timestamp | null; // Soft Delete 시간
  deletedBy?: string | null; // Soft Delete 실행한 관리자 ID
  age?: number;
  dateOfBirth?: string;
  agreedTerms: boolean;
  agreedPersonal: boolean;
  profileImage: string;
  status: 'temp' | 'active' | 'inactive' | 'deleted';
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
  /** 주민번호 뒷자리 첫 숫자 (가입 시 수집 — 성별·세기 판단용). 뒷자리 전체는 rrnLastEncrypted */
  rrnGenderDigit?: string;
  /** 명찰용 영어 닉네임 (캠프 참가 정보) */
  englishNickname?: string;
  rrnLast?: string;
  rrnLastEncrypted?: string;
  university?: string;
  grade?: number;
  isOnLeave?: boolean | null;
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
  
  // 원어민 교사 전용 정보
  foreignTeacher?: {
    firstName: string;
    lastName: string;
    middleName?: string;
    countryCode: string;
    cvUrl?: string;
    passportPhotoUrl?: string;
    foreignIdCardUrl?: string;
    bankBookUrl?: string;
    eslCertUrl?: string;
    applicationDate?: Timestamp;
  };
  
  // 평가 요약 정보 추가
  evaluationSummary?: {
    documentReview?: {
      averageScore: number;
      totalEvaluations: number;
      highestScore: number;
      lowestScore: number;
      lastEvaluatedAt: Timestamp;
    };
    interview?: {
      averageScore: number;
      totalEvaluations: number;
      highestScore: number;
      lowestScore: number;
      lastEvaluatedAt: Timestamp;
    };
    faceToFaceEducation?: {
      averageScore: number;
      totalEvaluations: number;
      highestScore: number;
      lowestScore: number;
      lastEvaluatedAt: Timestamp;
    };
    campLife?: {
      averageScore: number;
      totalEvaluations: number;
      highestScore: number;
      lowestScore: number;
      lastEvaluatedAt: Timestamp;
    };
    overallAverage: number;      // 전체 평균 점수
    totalEvaluations: number;    // 총 평가 횟수
    lastUpdatedAt: Timestamp;
  };
  
  // 소셜 로그인 관련 필드
  authProviders?: AuthProvider[];
  primaryAuthMethod?: AuthMethod;
}

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