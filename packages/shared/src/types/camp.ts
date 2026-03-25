// 캠프 관련 타입 정의

import { Timestamp } from 'firebase/firestore';

// 그룹 선택지 (주니어, 미들, 시니어, 계절)
export const JOB_EXPERIENCE_GROUPS = [
  '주니어',
  '미들',
  '시니어',
  '스프링',
  '서머',
  '어텀',
  '윈터',
  '공통',
] as const;

export type JobExperienceGroup = typeof JOB_EXPERIENCE_GROUPS[number];

// 그룹 역할 선택지 - 멘토용
export const MENTOR_GROUP_ROLES = [
  '담임',
  '수업',
  '매니저',
  '부매니저',
] as const;

// 그룹 역할 선택지 - 원어민용
export const FOREIGN_GROUP_ROLES = [
  'Speaking',
  'Reading',
  'Writing',
  'Mix',
  'Manager',
  'Sub Manager',
] as const;

// 전체 그룹 역할 (호환성 유지)
export const JOB_EXPERIENCE_GROUP_ROLES = [
  ...MENTOR_GROUP_ROLES,
  ...FOREIGN_GROUP_ROLES,
] as const;

export type MentorGroupRole = typeof MENTOR_GROUP_ROLES[number];
export type ForeignGroupRole = typeof FOREIGN_GROUP_ROLES[number];
export type JobExperienceGroupRole = typeof JOB_EXPERIENCE_GROUP_ROLES[number];

// 레거시 그룹 매핑 (junior/middle/senior <-> 주니어/미들/시니어)
export const LEGACY_GROUP_MAP: Record<string, string> = {
  'junior': '주니어',
  'middle': '미들',
  'senior': '시니어',
  'spring': '스프링',
  'summer': '서머',
  'autumn': '어텀',
  'winter': '윈터',
  'common': '공통',
};

export const LEGACY_GROUP_REVERSE_MAP: Record<string, string> = {
  '주니어': 'junior',
  '미들': 'middle',
  '시니어': 'senior',
  '스프링': 'spring',
  '서머': 'summer',
  '어텀': 'autumn',
  '윈터': 'winter',
  '공통': 'common',
};

// 그룹 표시 이름 가져오기
export const getGroupLabel = (group: string): string => {
  return LEGACY_GROUP_MAP[group] || group;
};

// 그룹 값 가져오기
export const getGroupValue = (label: string): string => {
  return LEGACY_GROUP_REVERSE_MAP[label] || label;
};

export interface Camp {
  id: string;
  code: string;
  name: string;
  location: string;
  startDate: Timestamp;
  endDate: Timestamp;
  status: 'upcoming' | 'ongoing' | 'completed';
  mentors: string[];
  stSheetConfigId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EducationMaterial {
  id: string;
  campCode: string;
  stage: 1 | 2 | 3 | 4;
  title: string;
  description: string;
  materials: Array<{
    type: 'video' | 'pdf' | 'link';
    url: string;
    label: string;
  }>;
  order: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface DailyTask {
  id: string;
  campCode: string;
  date: Timestamp;
  tasks: Array<{
    id: string;
    title: string;
    description: string;
    time: string;
    category: '준비' | '수업' | '생활' | '행정';
    targetRole: 'all' | 'mentor' | 'admin';
    isCompleted: boolean;
  }>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface RoomAssignment {
  id: string;
  campCode: string;
  roomNumber: string;
  students: Array<{
    studentId: string;
    name: string;
  }>;
  mentor: string;
  building: string;
  floor: number;
  capacity: number;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PatientRecord {
  id: string;
  campCode: string;
  studentId: string;
  studentName: string;
  symptom: string;
  treatment: string;
  medication?: string;
  visitDate: Timestamp;
  status: '경과관찰' | '완치' | '병원이송';
  notes?: string;
  recordedBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type ResourceLinkRole = 'common' | 'mentor' | 'foreign';

export interface ResourceLink {
  id: string;
  title: string;
  url: string;
  targetRole?: ResourceLinkRole; // 대상 권한: 공통(기본값), 멘토, 원어민
  createdAt: Timestamp;
  createdBy: string;
}

export interface STSheetConfig {
  spreadsheetId: string;
  sheetName: string;
  lastSyncedAt?: Timestamp;
}

export interface GenerationResources {
  jobCodeId: string;
  generation: string;
  code: string;
  educationLinks: ResourceLink[];
  scheduleLinks: ResourceLink[];
  guideLinks: ResourceLink[];
  stSheetConfig?: STSheetConfig;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TaskAttachment {
  type: 'image' | 'video' | 'link' | 'file';
  url: string;
  label: string;
  thumbnail?: string;
}

export interface TaskCompletion {
  userId: string;
  userName: string;
  userRole: JobExperienceGroupRole;
  completedAt: Timestamp;
}

// 캘린더 기반 업무
export interface Task {
  id: string;
  campCode: string;
  title: string;
  description: string;
  targetRoles: JobExperienceGroupRole[];
  targetGroups: JobExperienceGroup[];  // 새로 추가: 대상 그룹
  
  // 날짜 및 시간 (단순화)
  date: Timestamp;          // 업무 날짜
  time?: string;            // 시간 (HH:mm 형식, 옵션)
  
  estimatedDuration?: {
    value: number;
    unit: 'minutes' | 'hours';
  };
  
  attachments?: TaskAttachment[];
  completions: TaskCompletion[];
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}
