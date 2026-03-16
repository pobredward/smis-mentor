import { Timestamp } from 'firebase/firestore';
export declare const JOB_EXPERIENCE_GROUPS: readonly ["주니어", "미들", "시니어", "스프링", "서머", "어텀", "윈터", "공통"];
export type JobExperienceGroup = typeof JOB_EXPERIENCE_GROUPS[number];
export declare const MENTOR_GROUP_ROLES: readonly ["담임", "수업", "매니저"];
export declare const FOREIGN_GROUP_ROLES: readonly ["Speaking", "Reading", "Writing", "Mix", "Manager"];
export declare const JOB_EXPERIENCE_GROUP_ROLES: readonly ["담임", "수업", "매니저", "Speaking", "Reading", "Writing", "Mix", "Manager"];
export type MentorGroupRole = typeof MENTOR_GROUP_ROLES[number];
export type ForeignGroupRole = typeof FOREIGN_GROUP_ROLES[number];
export type JobExperienceGroupRole = typeof JOB_EXPERIENCE_GROUP_ROLES[number];
export declare const LEGACY_GROUP_MAP: Record<string, string>;
export declare const LEGACY_GROUP_REVERSE_MAP: Record<string, string>;
export declare const getGroupLabel: (group: string) => string;
export declare const getGroupValue: (label: string) => string;
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
    targetRole?: ResourceLinkRole;
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
export interface Task {
    id: string;
    campCode: string;
    title: string;
    description: string;
    targetRoles: JobExperienceGroupRole[];
    targetGroups: JobExperienceGroup[];
    date: Timestamp;
    time?: string;
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
//# sourceMappingURL=camp.d.ts.map