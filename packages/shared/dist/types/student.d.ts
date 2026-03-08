export declare const ST_SHEET_HEADER_MAPPING: {
    readonly 고유번호: "studentId";
    readonly '\uD559\uC0DD \uC774\uB984': "name";
    readonly '\uC601\uC5B4 \uB2C9\uB124\uC784': "englishName";
    readonly 학년: "grade";
    readonly 성별: "gender";
    readonly '\uBD80\uBAA8\uB2D8 \uC5F0\uB77D\uCC98': "parentPhone";
    readonly '\uBD80\uBAA8\uB2D8 \uC131\uD568': "parentName";
    readonly '\uAE30\uD0C0 \uC5F0\uB77D\uCC98': "otherPhone";
    readonly '\uAE30\uD0C0 \uC5F0\uB77D\uCC98 \uC131\uD568': "otherName";
    readonly '\uBCF5\uC6A9\uC57D & \uC54C\uB808\uB974\uAE30': "medication";
    readonly 특이사항: "notes";
    readonly 주민등록번호: "ssn";
    readonly 지역: "region";
    readonly '\uB3C4\uB85C\uBA85 \uC8FC\uC18C': "address";
    readonly '\uC138\uBD80 \uC8FC\uC18C': "addressDetail";
    readonly '\uC774\uBA54\uC77C \uC8FC\uC18C': "email";
    readonly 입소여정: "departureRoute";
    readonly 퇴소여정: "arrivalRoute";
    readonly 기타: "etc";
    readonly 단체티: "shirtSize";
    readonly '\uC5EC\uAD8C\uC0C1 \uC601\uBB38\uC774\uB984': "passportName";
    readonly '\uC5EC\uAD8C \uBC88\uD638': "passportNumber";
    readonly '\uC5EC\uAD8C \uB9CC\uB8CC\uC77C\uC790': "passportExpiry";
    readonly 반번호: "classNumber";
    readonly 반이름: "className";
    readonly 반멘토: "classMentor";
    readonly 유닛: "unit";
    readonly 호수: "roomNumber";
};
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
    readonly SHIRT_SIZE: "X";
    readonly PASSPORT_NAME: "Y";
    readonly PASSPORT_NUMBER: "Z";
    readonly PASSPORT_EXPIRY: "AA";
    readonly UNIT: "AB";
    readonly CLASS_NUMBER: "BA";
    readonly CLASS_NAME: "BB";
    readonly CLASS_MENTOR: "BC";
    readonly UNIT_MENTOR: "BD";
    readonly ROOM_NUMBER: "BE";
};
export declare const CAMP_SHEET_CONFIG: {
    readonly E27: {
        readonly spreadsheetId: "1hHO1Lm3ezpzo6JILHRzdC2j1OhkTpRxhNzKew3tcJp8";
        readonly sheetName: "ST";
        readonly gid: "0";
        readonly type: "EJ";
        readonly useHeaderMapping: true;
    };
    readonly J27: {
        readonly spreadsheetId: "17tdhLYotT3IqkUCrUTXt9wjs5lB5pMAKKSSxtLQ3m6c";
        readonly sheetName: "ST";
        readonly gid: "0";
        readonly type: "EJ";
        readonly useHeaderMapping: true;
    };
    readonly S27: {
        readonly spreadsheetId: "1GQ9klMrYnv57nnbQ92LFYxBFig1EF9ewDe72obyjpC8";
        readonly sheetName: "ST";
        readonly gid: "296268666";
        readonly type: "S";
        readonly useHeaderMapping: true;
    };
};
export type CampCode = keyof typeof CAMP_SHEET_CONFIG;
export type CampType = 'EJ' | 'S';
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
    departureRoute?: string;
    arrivalRoute?: string;
    shirtSize?: string;
    passportName?: string;
    passportNumber?: string;
    passportExpiry?: string;
    unit?: string;
    etc?: string;
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