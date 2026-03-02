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
//# sourceMappingURL=camp.d.ts.map