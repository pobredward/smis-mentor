// ST시트 관련 타입 정의

export const ST_SHEET_COLUMNS = {
  // 기본 정보 (A-E)
  STUDENT_ID: 'A',
  NAME: 'B',
  ENGLISH_NAME: 'C',
  GRADE: 'D',
  GENDER: 'E',
  
  // 연락처 정보 (F-K)
  PARENT_PHONE: 'F',
  PARENT_NAME: 'G',
  OTHER_PHONE: 'H',
  OTHER_NAME: 'I',
  MEDICATION: 'J',
  NOTES: 'K',
  
  // 개인정보 (L-R)
  SSN: 'L',
  REGION: 'M',
  ADDRESS: 'N',
  ADDRESS_DETAIL: 'O',
  EMAIL: 'P',
  DEPARTURE_ROUTE: 'Q',
  ARRIVAL_ROUTE: 'R',
  
  // 기타 (S-V)
  ETC: 'S',
  CASH_RECEIPT: 'T',
  REGISTRATION_SOURCE: 'U',
  MEMO: 'V',
  ROOM_NOTES: 'W',
  
  // ⭐️ 핵심: 멘토 및 반 배정 (실제 스프레드시트 기준)
  CLASS_NUMBER: 'BA',  // 반 번호 (예: E03.10) - BA열
  CLASS_NAME: 'BB',    // 반 이름 (예: Sailor) - BB열
  CLASS_MENTOR: 'BC',  // 반멘토 (사용자 확인: BC열)
  UNIT_MENTOR: 'BD',   // 유닛멘토 (사용자 확인: BD열)
  ROOM_NUMBER: 'BE',   // 방 번호 - BE열
} as const;

export const MENTORS = [
  '윤수빈',
  '박현정',
  '강준서',
  '박성빈',
  '백현길',
  '이겸수',
  '윤연우',
  '김가람',
  '강경제',
  '김용재',
  '박준우',
  '허난'
] as const;

export const CLASS_NAMES = [
  'Grit',
  'Sailor',
  'Halo',
  'Fable',
  'Dolphin',
  'Vivid',
  'Act',
  'Chef',
  'Puzzle'
] as const;

export type MentorName = typeof MENTORS[number];
export type ClassName = typeof CLASS_NAMES[number];

export interface STSheetStudent {
  // 기본 정보
  studentId: string;
  name: string;
  englishName: string;
  grade: string;
  gender: 'M' | 'F';
  
  // 연락처
  parentPhone: string;
  parentName: string;
  otherPhone?: string;
  otherName?: string;
  medication?: string;
  notes?: string;
  
  // 개인정보
  ssn?: string;
  region?: string;
  address?: string;
  addressDetail?: string;
  email?: string;
  
  // ⭐️ 멘토 및 반 배정 (핵심)
  classNumber: string;
  className: string;
  classMentor: string;
  unitMentor: string;
  roomNumber: string;
  
  // 메타 정보
  rowNumber: number;
  lastSyncedAt: Date;
  
  // 동적 필드 (관리자가 선택한 표시 열)
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
