// ST시트 관련 타입 정의

// 헤더 이름과 필드 매핑 (1행의 실제 컬럼 이름)
export const ST_SHEET_HEADER_MAPPING = {
  // 기본 정보
  '고유번호': 'studentId',
  '학생 이름': 'name',
  '영어 닉네임': 'englishName',
  '학년': 'grade',
  '성별': 'gender',
  
  // 연락처
  '부모님 연락처': 'parentPhone',
  '부모님 성함': 'parentName',
  '기타 연락처': 'otherPhone',
  '기타 연락처 성함': 'otherName',
  '복용약 & 알레르기': 'medication',
  '특이사항': 'notes',
  
  // 개인정보
  '주민등록번호': 'ssn',
  '지역': 'region',
  '도로명 주소': 'address',
  '세부 주소': 'addressDetail',
  '이메일 주소': 'email',
  '입소여정': 'departureRoute',
  '퇴소여정': 'arrivalRoute',
  
  // 기타
  '기타': 'etc',
  
  // S 캠프 전용
  '단체티': 'shirtSize',
  '여권상 영문이름': 'passportName',
  '여권 번호': 'passportNumber',
  '여권 만료일자': 'passportExpiry',
  
  // 멘토 및 반 배정
  '반번호': 'classNumber',
  '반이름': 'className',
  '반멘토': 'classMentor',
  '유닛': 'unit', // 모든 캠프에서 "유닛" 컬럼을 unit과 unitMentor 둘 다에 사용
  '호수': 'roomNumber',
} as const;

// 레거시: 고정 컬럼 레터 매핑 (E27, J27용 - 기존 호환성)
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
  
  // 추가 필드 (E/J27용)
  SHIRT_SIZE: 'X',           // 단체티 사이즈
  PASSPORT_NAME: 'Y',        // 여권상 영문이름
  PASSPORT_NUMBER: 'Z',      // 여권 번호
  PASSPORT_EXPIRY: 'AA',     // 여권 만료일자
  UNIT: 'AB',                // 유닛
  
  // ⭐️ 핵심: 멘토 및 반 배정 (실제 스프레드시트 기준)
  CLASS_NUMBER: 'BA',  // 반 번호 (예: E03.10) - BA열
  CLASS_NAME: 'BB',    // 반 이름 (예: Sailor) - BB열
  CLASS_MENTOR: 'BC',  // 반멘토 (사용자 확인: BC열)
  UNIT_MENTOR: 'BD',   // 유닛멘토 (사용자 확인: BD열)
  ROOM_NUMBER: 'BE',   // 방 번호 - BE열
} as const;

// 캠프 타입별 스프레드시트 설정
export const CAMP_SHEET_CONFIG = {
  E27: {
    spreadsheetId: '1hHO1Lm3ezpzo6JILHRzdC2j1OhkTpRxhNzKew3tcJp8',
    sheetName: 'ST',
    gid: '0', // ST 시트의 gid
    type: 'EJ' as const, // E/J 타입 (입소공항/퇴소공항)
    useHeaderMapping: true, // 헤더 이름으로 동적 매핑
  },
  J27: {
    spreadsheetId: '17tdhLYotT3IqkUCrUTXt9wjs5lB5pMAKKSSxtLQ3m6c',
    sheetName: 'ST',
    gid: '0', // ST 시트의 gid
    type: 'EJ' as const, // E/J 타입 (입소공항/퇴소공항)
    useHeaderMapping: true, // 헤더 이름으로 동적 매핑
  },
  S27: {
    spreadsheetId: '1GQ9klMrYnv57nnbQ92LFYxBFig1EF9ewDe72obyjpC8',
    sheetName: 'ST',
    gid: '296268666', // ST 시트의 gid
    type: 'S' as const, // S 타입 (단체티/여권정보)
    useHeaderMapping: true, // 헤더 이름으로 동적 매핑
  },
} as const;

export type CampCode = keyof typeof CAMP_SHEET_CONFIG;
export type CampType = 'EJ' | 'S';

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
  
  // E/J 캠프 전용 필드
  departureRoute?: string;  // 입소공항
  arrivalRoute?: string;    // 퇴소공항
  
  // S 캠프 전용 필드
  shirtSize?: string;       // 단체티 사이즈
  passportName?: string;    // 여권상 영문이름
  passportNumber?: string;  // 여권 번호
  passportExpiry?: string;  // 여권 만료일자
  unit?: string;            // 유닛
  
  // 기타
  etc?: string;
  
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
