// 캠프 관련 타입 정의

import { Timestamp } from 'firebase/firestore';

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

export interface ResourceLink {
  id: string;
  title: string;
  url: string;
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

export type JobExperienceGroupRole = '담임' | '수업' | '서포트' | '리더' | '매니저' | '부매니저';

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
  
  // 날짜 및 시간 (단순화)
  date: Timestamp;          // 업무 날짜
  time?: string;            // 시간 (HH:mm 형식, 옵션)
  
  estimatedDuration?: {
    value: number;
    unit: 'minutes' | 'hours';
  };
  
  attachments?: TaskAttachment[];
  priority: 'low' | 'medium' | 'high';
  completions: TaskCompletion[];
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}
