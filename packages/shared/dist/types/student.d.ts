export declare const ST_SHEET_COLUMNS: {
    readonly STUDENT_ID: "A";
    readonly NAME: "B";
    readonly ENGLISH_NAME: "C";
    readonly GRADE: "D";
    readonly GENDER: "E";
    readonly PARENT_PHONE: "F";
    readonly PARENT_NAME: "G";
    readonly OTHER_PHONE: "H";
    readonly OTHER_NAME: "I";
    readonly MEDICATION: "J";
    readonly NOTES: "K";
    readonly SSN: "L";
    readonly REGION: "M";
    readonly ADDRESS: "N";
    readonly ADDRESS_DETAIL: "O";
    readonly EMAIL: "P";
    readonly DEPARTURE_ROUTE: "Q";
    readonly ARRIVAL_ROUTE: "R";
    readonly ETC: "S";
    readonly CASH_RECEIPT: "T";
    readonly REGISTRATION_SOURCE: "U";
    readonly MEMO: "V";
    readonly ROOM_NOTES: "W";
    readonly CLASS_NUMBER: "BA";
    readonly CLASS_NAME: "BB";
    readonly CLASS_MENTOR: "BC";
    readonly UNIT_MENTOR: "BD";
    readonly ROOM_NUMBER: "BE";
};
export declare const MENTORS: readonly ["윤수빈", "박현정", "강준서", "박성빈", "백현길", "이겸수", "윤연우", "김가람", "강경제", "김용재", "박준우", "허난"];
export declare const CLASS_NAMES: readonly ["Grit", "Sailor", "Halo", "Fable", "Dolphin", "Vivid", "Act", "Chef", "Puzzle"];
export type MentorName = typeof MENTORS[number];
export type ClassName = typeof CLASS_NAMES[number];
export interface STSheetStudent {
    studentId: string;
    name: string;
    englishName: string;
    grade: string;
    gender: 'M' | 'F';
    parentPhone: string;
    parentName: string;
    otherPhone?: string;
    otherName?: string;
    medication?: string;
    notes?: string;
    ssn?: string;
    region?: string;
    address?: string;
    addressDetail?: string;
    email?: string;
    classNumber: string;
    className: string;
    classMentor: string;
    unitMentor: string;
    roomNumber: string;
    rowNumber: number;
    lastSyncedAt: Date;
    displayFields?: Record<string, any>;
}
export interface STSheetDetailedConfig {
    spreadsheetId: string;
    sheetName: string;
    headerRow: number;
    columnMapping: typeof ST_SHEET_COLUMNS;
    displayColumns?: Array<{
        columnLetter: string;
        label: string;
        type: 'text' | 'number' | 'date' | 'boolean';
        order: number;
    }>;
}
export interface STSheetCache {
    id: string;
    campCode: string;
    data: STSheetStudent[];
    lastSyncedAt: Date;
    syncedBy: string;
    syncedByName: string;
    version: number;
    totalStudents: number;
}
export interface MentorStudentFilter {
    mentorName: string;
    filterType: 'class' | 'unit';
}
//# sourceMappingURL=student.d.ts.map