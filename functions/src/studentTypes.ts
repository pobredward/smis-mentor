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
  '집 주소': 'address',       // 25기 이하 단일 주소 필드
  '세부 주소': 'addressDetail',
  '이메일 주소': 'email',
  '입소여정': 'departureRoute',
  '퇴소여정': 'arrivalRoute',
  
  // 기타
  '기타': 'etc',
  '등록처': 'registrationSource',
  
  // S 캠프 전용
  '단체티': 'shirtSize',
  '여권상 영문이름': 'passportName',
  '여권 번호': 'passportNumber',
  '여권 만료일자': 'passportExpiry',
  
  // 멘토 및 반 배정
  '반번호': 'classNumber',
  '반이름': 'className',
  '반멘토': 'classMentor',
  '유닛': 'unit',
  '방호수': 'roomNumber',
  
  // 프로필
  '프로필사진': 'profilePhoto',
} as const;

/**
 * 기수/캠프마다 달라진 레거시 헤더명 → 현재 표준 헤더명 매핑
 * 동기화 시 실제 시트의 헤더를 읽어서, 이 표에 있는 옛 이름은 표준 이름으로 치환한다.
 */
export const LEGACY_HEADER_ALIASES: Record<string, string> = {
  // 복용약/알레르기
  '알레르기': '복용약 & 알레르기',
  '복용약&알레르기': '복용약 & 알레르기',
  '복용약 &알레르기': '복용약 & 알레르기',
  '복용약& 알레르기': '복용약 & 알레르기',

  // 주민번호
  '주민번호': '주민등록번호',
  '주민 번호': '주민등록번호',

  // 주소
  // '집 주소'는 ST_SHEET_HEADER_MAPPING에 정의되어 있으므로 그대로 유지

  // 여정 (E/J 캠프 구버전)
  '출발여정': '입소여정',
  '도착여정': '퇴소여정',

  // 방호수 (구버전)
  '호수': '방호수',

  // 단체티 (구버전)
  '단체티셔츠': '단체티',
};

/**
 * 실제 시트 헤더 배열을 받아 레거시 aliases를 정규화한 뒤
 * headerName → columnIndex 맵을 반환한다.
 */
export function buildNormalizedHeaderIndexMap(rawHeaders: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  rawHeaders.forEach((raw, index) => {
    const header = raw.trim();
    if (!header) return;
    // 레거시 이름이면 표준 이름으로 치환
    const normalized = LEGACY_HEADER_ALIASES[header] ?? header;
    // 이미 표준 이름으로 등록된 경우 먼저 나온 열을 우선시
    if (!(normalized in map)) {
      map[normalized] = index;
    }
    // 원본 이름도 별도 등록 (ST_SHEET_HEADER_MAPPING에 그대로 있는 이름용)
    if (!(header in map)) {
      map[header] = index;
    }
  });
  return map;
}

/**
 * headerIndexMap + row 데이터로 STSheetStudent를 생성한다.
 * 웹/모바일 양쪽에서 공통으로 사용.
 */
export function mapHeadersToStudent(
  row: string[],
  headerIndexMap: Record<string, number>,
  rowNumber: number,
  campCode: string,
  campType: CampType,
): STSheetStudent {
  const getValue = (headerName: string): string => {
    const idx = headerIndexMap[headerName];
    return idx !== undefined ? (row[idx]?.trim() ?? '') : '';
  };

  const student: STSheetStudent = {
    studentId:          getValue('고유번호'),
    name:               getValue('학생 이름'),
    englishName:        getValue('영어 닉네임'),
    grade:              getValue('학년'),
    gender:             (getValue('성별') || 'M') as 'M' | 'F',
    parentPhone:        getValue('부모님 연락처'),
    parentName:         getValue('부모님 성함'),
    otherPhone:         getValue('기타 연락처'),
    otherName:          getValue('기타 연락처 성함'),
    medication:         getValue('복용약 & 알레르기'),
    notes:              getValue('특이사항'),
    ssn:                getValue('주민등록번호'),
    region:             getValue('지역'),
    // '집 주소'도 ST_SHEET_HEADER_MAPPING에 address로 정의되어 있으므로
    // buildNormalizedHeaderIndexMap 이후 '도로명 주소'가 없으면 '집 주소'를 사용
    address:            getValue('도로명 주소') || getValue('집 주소'),
    addressDetail:      getValue('세부 주소'),
    email:              getValue('이메일 주소'),
    etc:                getValue('기타'),
    registrationSource: getValue('등록처'),
    classNumber:        getValue('반번호'),
    className:          getValue('반이름'),
    classMentor:        getValue('반멘토'),
    unitMentor:         getValue('유닛'),
    unit:               getValue('유닛'),
    roomNumber:         getValue('방호수'),
    profilePhoto:       getValue('프로필사진'),
    rowNumber,
    lastSyncedAt: new Date(),
    campCode,
    displayFields: {},
  };

  // E/J 캠프 전용: 여정
  if (campType === 'EJ') {
    student.departureRoute = getValue('입소여정');
    student.arrivalRoute   = getValue('퇴소여정');
  }

  // S/DG 캠프 전용: 단체티, 여권
  if (campType === 'S' || campType === 'DG') {
    student.shirtSize      = getValue('단체티');
    student.passportName   = getValue('여권상 영문이름');
    student.passportNumber = getValue('여권 번호');
    student.passportExpiry = getValue('여권 만료일자');
  }

  // F 캠프도 단체티 처리
  if (campType === 'F') {
    student.shirtSize = getValue('단체티');
  }

  return student;
}

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
  // 28기
  S28: {
    spreadsheetId: '1GMqbsYW4p9DTzccNd1Zo9obrQ7j6zj5NPPSidotNudE',
    sheetName: 'ST',
    gid: '296268666',
    type: 'S' as const,
    useHeaderMapping: true,
  },
  J28: {
    spreadsheetId: '1J4UIpj9RZQoJizEcPsGxcFX-aKYJ0e0gq-bY8fzHPWE',
    sheetName: 'ST',
    gid: '0',
    type: 'EJ' as const,
    useHeaderMapping: true,
  },
  F28: {
    spreadsheetId: '1JYh7__QhQ80eTksqk6DNYC7wyBg0Nn_nngBRVgS7fBM',
    sheetName: 'ST',
    gid: '0',
    type: 'F' as const,
    useHeaderMapping: true,
  },

  // 27기
  S27: {
    spreadsheetId: '1GQ9klMrYnv57nnbQ92LFYxBFig1EF9ewDe72obyjpC8',
    sheetName: 'ST',
    gid: '296268666',
    type: 'S' as const,
    useHeaderMapping: true,
  },
  J27: {
    spreadsheetId: '17tdhLYotT3IqkUCrUTXt9wjs5lB5pMAKKSSxtLQ3m6c',
    sheetName: 'ST',
    gid: '0',
    type: 'EJ' as const,
    useHeaderMapping: true,
  },
  E27: {
    spreadsheetId: '1hHO1Lm3ezpzo6JILHRzdC2j1OhkTpRxhNzKew3tcJp8',
    sheetName: 'ST',
    gid: '0',
    type: 'EJ' as const,
    useHeaderMapping: true,
  },
  F27_1: {
    spreadsheetId: '1PeUbMxaAVDRxK8zyIxLwjf60YFPGz0FaM8jJUointL0',
    sheetName: 'ST',
    gid: '0',
    type: 'F' as const,
    useHeaderMapping: true,
  },
  F27_2: {
    spreadsheetId: '1AhJP6y1qOlnosbdkMReCgfpuz81KUmo9WWfPRjn7qgI',
    sheetName: 'ST',
    gid: '0',
    type: 'F' as const,
    useHeaderMapping: true,
  },

  // 26기
  S26: {
    spreadsheetId: '17WeUVdbt3CroHDPnY6RTKjw5wJxCL4eJXZqSpL4857s',
    sheetName: 'ST',
    gid: '296268666',
    type: 'S' as const,
    useHeaderMapping: true,
  },
  D26: {
    spreadsheetId: '1E34jLaYvrffb8jBHFPcH8RNQBXdh2KDylPGda5qTGiQ',
    sheetName: 'ST',
    gid: '0',
    type: 'DG' as const,
    useHeaderMapping: true,
  },
  G26: {
    spreadsheetId: '1I--we4LhZXFwi7W57I2pf4rETXLX3AE8ezGewIlm354',
    sheetName: 'ST',
    gid: '0',
    type: 'DG' as const,
    useHeaderMapping: true,
  },
  F26: {
    spreadsheetId: '1rJgf-DFmUhdiUZS-GAtQ_7TBb-lsOiXKqZkY7292m1Y',
    sheetName: 'ST',
    gid: '0',
    type: 'F' as const,
    useHeaderMapping: true,
  },

  // 25기
  S25: {
    spreadsheetId: '1eWhbAcbIhVapAd86ONUmAhKY7j3oEB3iAYGD7LxO91Q',
    sheetName: 'ST',
    gid: '296268666',
    type: 'S' as const,
    useHeaderMapping: true,
  },
  J25: {
    spreadsheetId: '1vHO8A45aAqO5TKL-tyjMAcPfXpnmoxoah3ufrrpfhQs',
    sheetName: 'ST',
    gid: '0',
    type: 'EJ' as const,
    useHeaderMapping: true,
  },
  E25: {
    spreadsheetId: '1VcYEcD-pI3jfxgEfsPJqggPqnefcQ_Y1QPB1GjW0nUI',
    sheetName: 'ST',
    gid: '0',
    type: 'EJ' as const,
    useHeaderMapping: true,
  },
  F25_1: {
    spreadsheetId: '1D7ofcu9-Oq3t-CRCJrYznSmwZMnn4jy0TK9EQaFCN2U',
    sheetName: 'ST',
    gid: '0',
    type: 'F' as const,
    useHeaderMapping: true,
  },
  F25_2: {
    spreadsheetId: '1Lx9poTUoZFP_8S4jEDskfZGTTacYo7RYkaEIcNVe6r0',
    sheetName: 'ST',
    gid: '0',
    type: 'F' as const,
    useHeaderMapping: true,
  },

  // 24기
  S24: {
    spreadsheetId: '1GDYelPfULapXCdpmSeofNBk54IBsZC83u9-KGlQqEGI',
    sheetName: 'ST',
    gid: '0',
    type: 'S' as const,
    useHeaderMapping: true,
  },
  J24: {
    spreadsheetId: '14VKsU5svTFqE38go_W5CVWU0aLGxtKQjLfM2BiaTHNs',
    sheetName: 'ST',
    gid: '0',
    type: 'EJ' as const,
    useHeaderMapping: true,
  },
  F24: {
    spreadsheetId: '1_b1hiWNdIMT55Brn3Macg52CO-9A1XQvCp0SEqcCWig',
    sheetName: 'ST',
    gid: '0',
    type: 'F' as const,
    useHeaderMapping: true,
  },

  // 23기
  S23: {
    spreadsheetId: '1PrjSVo4qBepqSUBl_014skEfPlKzpfrYaojXjAHk70M',
    sheetName: 'ST',
    gid: '0',
    type: 'S' as const,
    useHeaderMapping: true,
  },
  J23: {
    spreadsheetId: '1dea1OfrELcUhsgCTRAKEwFZOXylkvrCzLJohOXoVSpI',
    sheetName: 'ST',
    gid: '0',
    type: 'EJ' as const,
    useHeaderMapping: true,
  },
  E23: {
    spreadsheetId: '1TZAuht2hNrw8IF_pVhE8oy__D-njnsYSYPBvF134eLI',
    sheetName: 'ST',
    gid: '0',
    type: 'EJ' as const,
    useHeaderMapping: true,
  },
  F23_1: {
    spreadsheetId: '14DuyBti1dhzBd_Sj4O5bmJ4AHmmRNXAcub9jo2AKIbg',
    sheetName: 'ST',
    gid: '0',
    type: 'F' as const,
    useHeaderMapping: true,
  },
  F23_2: {
    spreadsheetId: '1VY_cs5YgNYlLP7hvw8Fxxmwn4-fMslsog3BLp8NKICs',
    sheetName: 'ST',
    gid: '0',
    type: 'F' as const,
    useHeaderMapping: true,
  },

  // 22기
  S22: {
    spreadsheetId: '18IOLRkwrXdSediZ6CD3XfC5sUEtyuU_SYm2jzwX6O1Y',
    sheetName: 'ST',
    gid: '0',
    type: 'S' as const,
    useHeaderMapping: true,
  },
  J22: {
    spreadsheetId: '1kn3tzNLQskOn1gH19A7OD9XwRHk9bJSdlvyaLKizTVM',
    sheetName: 'ST',
    gid: '0',
    type: 'EJ' as const,
    useHeaderMapping: true,
  },
  F22: {
    spreadsheetId: '1DxVDyh6dsftQxOvN3hFEAWDYL0VPlSPd7WDju6u_w2Y',
    sheetName: 'ST',
    gid: '0',
    type: 'F' as const,
    useHeaderMapping: true,
  },

  // 21기
  J21: {
    spreadsheetId: '1SVySTYeloX2puyI10YuGkaEOCutR7GidX4ELYXZielo',
    sheetName: 'ST',
    gid: '0',
    type: 'EJ' as const,
    useHeaderMapping: true,
  },
  E21: {
    spreadsheetId: '1JNQIQKkvLFTQQprOPoFAEkrzh9Gq7X7Gp1C-pmxtZes',
    sheetName: 'ST',
    gid: '0',
    type: 'EJ' as const,
    useHeaderMapping: true,
  },
  K21: {
    spreadsheetId: '1hpICB7S3uazU8aWL7OF99j3YK6FSqm_eoJ3CrvDdbnA',
    sheetName: 'ST',
    gid: '826919857',
    type: 'DG' as const,
    useHeaderMapping: true,
  },
  F21: {
    spreadsheetId: '1im3noVCTbcCjyRSWbZZ_pgicT1iVeUbpe4fMrspsQk0',
    sheetName: 'ST',
    gid: '0',
    type: 'F' as const,
    useHeaderMapping: true,
  },

  // 20기
  J20: {
    spreadsheetId: '1Uk4YpL0M8EeVP78-saAqWQyT7mXs0cNnbOqm-ga2_dc',
    sheetName: 'ST',
    gid: '54998283',
    type: 'EJ' as const,
    useHeaderMapping: true,
  },
  K20: {
    spreadsheetId: '1Y9dzfFq-K675b7XXlRN6J8sIIiqRmxQlQCvKPB2neG8',
    sheetName: 'ST',
    gid: '726954309',
    type: 'DG' as const,
    useHeaderMapping: true,
  },
  G20: {
    spreadsheetId: '1191zvaVRlA0RcH-KKWc07C05QLyho1rmrOBcp3gDRj0',
    sheetName: 'ST',
    gid: '1895900601',
    type: 'DG' as const,
    useHeaderMapping: true,
  },

  // 19기
  K19: {
    spreadsheetId: '1DynB4qug0rroAL_Sg1oIIyCWtOsX7IKqf_wffideVqA',
    sheetName: 'ST',
    gid: '956580212',
    type: 'DG' as const,
    useHeaderMapping: true,
  },
  G19: {
    spreadsheetId: '1Kn9WBTkL0R2ZrkO-fF-l7JypHGWCzDU6RZ59dcnXE1g',
    sheetName: 'ST',
    gid: '1070801238',
    type: 'DG' as const,
    useHeaderMapping: true,
  },

  // 18기
  G18: {
    spreadsheetId: '1eAVBudFBkSsk0xuJAftkMZVUkSG3eqobWBD8ZqfU7XI',
    sheetName: 'ST',
    gid: '1400242978',
    type: 'DG' as const,
    useHeaderMapping: true,
  },
} as const;

export type CampCode = keyof typeof CAMP_SHEET_CONFIG;
// EJ: E/J 캠프 (입퇴소여정 있음, 반배정 있음)
// S:  S 캠프   (여권/단체티 있음, 반배정 없음)
// DG: D/G/K 캠프 (반배정 있음, 여권/여정 없음)
// F:  F 캠프   (가족형, 원어민+학생 혼합 구조 - 26번 열부터 학생 데이터)
export type CampType = 'EJ' | 'S' | 'DG' | 'F';

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
  registrationSource?: string;  // 등록처
  
  // ⭐️ 멘토 및 반 배정 (핵심)
  classNumber: string;
  className: string;
  classMentor: string;
  unitMentor: string;
  roomNumber: string;
  
  // 프로필
  profilePhoto?: string;
  
  // 메타 정보
  rowNumber: number;
  lastSyncedAt: Date;
  campCode?: string;            // 어느 캠프 데이터인지 (이력 조회용)
  
  // 동적 필드 (관리자가 선택한 표시 열)
  displayFields?: Record<string, any>;
}

/**
 * 이월자/취소자 판별 함수
 * 성별이 MM/FF처럼 2자 이상이거나, 학년이 G55처럼 두 자리 숫자인 경우 이월자/취소자로 판단
 */
export function isInactiveStudent(student: Pick<STSheetStudent, 'gender' | 'grade'>): boolean {
  const gender = student.gender || '';
  const grade = student.grade || '';
  if ((gender as string).length > 1) return true;
  if (/^G\d{2,}$/.test(grade)) return true;
  return false;
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

// ─── F 캠프 전용 가족 단위 타입 ─────────────────────────────────────────────

export interface FamilyParent {
  id: string;
  name: string;
  phone: string;
  region?: string;
  ssn?: string;
  passportName?: string;
  passportNumber?: string;
  passportExpiry?: string;
  nativeEnglish?: string;
  email?: string;
  address?: string;
  notes?: string;
  roomNumber?: string;
}

export interface FamilyStudent {
  id: string;
  name: string;
  englishName?: string;
  grade: string;
  gender: 'M' | 'F';
  ssn?: string;
  passportName?: string;
  passportNumber?: string;
  passportExpiry?: string;
  medication?: string;
  parentPhone?: string;
  registrationSource?: string;
}

export interface FamilyUnit {
  familyId: string;
  familyType: string;
  parents: FamilyParent[];
  students: FamilyStudent[];
  roomNumber?: string;
  rowNumber: number;
  lastSyncedAt: Date;
  campCode?: string;
}

export interface FamilySTSheetCache {
  id: string;
  campCode: string;
  families: FamilyUnit[];
  lastSyncedAt: Date;
  syncedBy: string;
  syncedByName: string;
  version: number;
  totalFamilies: number;
  totalStudents: number;
}

/**
 * F 캠프 시트의 행 배열을 FamilyUnit 배열로 파싱한다.
 *
 * 1행 헤더를 기반으로 열 인덱스를 자동 감지하므로,
 * 캠프마다 열 위치가 달라도 안전하게 처리된다.
 *
 * 부모 섹션: A열(가족번호) 기준 — "가족번호" 헤더가 있는 열
 * 학생 섹션: "고유번호" 헤더가 두 번째로 등장하는 열부터
 *
 * 데이터 행의 가족번호 패턴:
 *   P01.1 → 1번 가족 첫 번째 행 (부모 or 그 이후)
 *   P01.2, P01.3 → 동일 가족 추가 행 (자녀 or 부모2)
 */
export function parseFamilySheet(rows: string[][], campCode: string): FamilyUnit[] {
  if (rows.length < 2) return [];

  const header = rows[0].map(h => h?.trim() ?? '');

  // ── 부모 섹션 열 인덱스 (헤더 기반) ──────────────────────────────
  const col = (name: string, startFrom = 0): number => {
    const idx = header.indexOf(name, startFrom);
    return idx >= 0 ? idx : -1;
  };

  const pFamilyId   = col('가족번호');            // A열
  const pType       = col('유형');
  const pName       = col('성함') >= 0 ? col('성함') : col('부모님 성함');
  const pPhone      = col('연락처') >= 0 ? col('연락처') : col('부모님 연락처');
  const pRegion     = col('지역');
  const pSsn        = col('주민등록번호');
  const pPassName   = col('여권상 영문이름');
  const pPassNum    = col('여권 번호');
  const pPassExp    = col('여권 만료일자');
  const pNative     = col('원어민');
  const pEmail      = col('이메일 주소') >= 0 ? col('이메일 주소') : col('이메일주소');
  const pAddress    = col('집 주소');
  const pNotes      = col('기타');
  const pRoom       = col('방호수');

  // ── 학생 섹션 열 인덱스 ──────────────────────────────────────────
  // "고유번호"가 헤더에 두 번 등장: 첫 번째는 부모 섹션(없을 수 있음), 두 번째가 학생 섹션
  // 또는 "가족번호"와 "고유번호" 분리 이후 구조에서는 고유번호가 한 번만 등장
  let sStart = -1;
  {
    let found = 0;
    for (let i = 0; i < header.length; i++) {
      if (header[i] === '고유번호') {
        found++;
        // 부모 섹션에 "고유번호"가 없고 "가족번호"가 있으면 첫 번째가 학생 섹션
        // 부모 섹션에 "고유번호"가 있었던 구형 시트는 두 번째가 학생 섹션
        if (found === 1 && pFamilyId >= 0) {
          // "가족번호"가 있는 경우 → 첫 번째 "고유번호"가 학생 섹션
          sStart = i;
          break;
        }
        if (found === 2) {
          sStart = i;
          break;
        }
      }
    }
    // fallback: "고유번호"가 한 번만 있으면 그게 학생 섹션
    if (sStart === -1) {
      sStart = col('고유번호');
    }
  }

  if (sStart === -1) return []; // 학생 섹션 헤더 없으면 처리 불가

  // 학생 섹션 헤더 (sStart 이후)
  const sh = header.slice(sStart);
  const sc = (name: string): number => {
    const idx = sh.indexOf(name);
    return idx >= 0 ? sStart + idx : -1;
  };

  const sId       = sStart;                          // 고유번호
  const sName     = sc('학생 이름');
  const sEngName  = sc('영어 닉네임');
  const sGrade    = sc('학년');
  const sGender   = sc('성별');
  const sSsn      = sc('주민등록번호');
  const sPassName = sc('여권상 영문이름');
  const sPassNum  = sc('여권 번호');
  const sPassExp  = sc('여권 만료일자');
  // 건강정보: "학생 건강정보 및 특이사항" 또는 "특이사항"
  const sMed      = sc('학생 건강정보 및 특이사항') >= 0 ? sc('학생 건강정보 및 특이사항') : sc('특이사항');
  const sParPhone = sc('부모님 연락처');
  const sReg      = sc('등록처');

  // ── 행 파싱 ──────────────────────────────────────────────────────
  const familyMap = new Map<string, FamilyUnit>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(cell => !cell?.trim())) continue;

    const rawFamilyId = (pFamilyId >= 0 ? row[pFamilyId] : row[0])?.trim() ?? '';
    if (!rawFamilyId || rawFamilyId === '-') continue;

    const familyMatch = rawFamilyId.match(/^P(\d+)\./);
    if (!familyMatch) continue;
    const familyId = familyMatch[1].padStart(2, '0');

    if (!familyMap.has(familyId)) {
      const roomVal = pRoom >= 0 ? row[pRoom]?.trim() ?? '' : '';
      const typeVal = pType >= 0 ? row[pType]?.trim() ?? '' : '';
      familyMap.set(familyId, {
        familyId,
        familyType: typeVal,
        parents: [],
        students: [],
        roomNumber: roomVal,
        rowNumber: i + 1,
        lastSyncedAt: new Date(),
        campCode,
      });
    }

    const unit = familyMap.get(familyId)!;

    const typeVal = pType >= 0 ? row[pType]?.trim() : '';
    if (typeVal) unit.familyType = typeVal;

    const roomVal = pRoom >= 0 ? row[pRoom]?.trim() : '';
    if (roomVal) unit.roomNumber = roomVal;

    // 부모 정보: 성함(또는 부모님 성함) 열에 값이 있으면 부모
    const parentName = pName >= 0 ? row[pName]?.trim() ?? '' : '';
    if (parentName) {
      unit.parents.push({
        id: rawFamilyId,
        name: parentName,
        phone:         pPhone   >= 0 ? row[pPhone]?.trim()   ?? '' : '',
        region:        pRegion  >= 0 ? row[pRegion]?.trim()  ?? '' : '',
        ssn:           pSsn     >= 0 ? row[pSsn]?.trim()     ?? '' : '',
        passportName:  pPassName >= 0 ? row[pPassName]?.trim() ?? '' : '',
        passportNumber: pPassNum >= 0 ? row[pPassNum]?.trim() ?? '' : '',
        passportExpiry: pPassExp >= 0 ? row[pPassExp]?.trim() ?? '' : '',
        nativeEnglish: pNative  >= 0 ? row[pNative]?.trim()  ?? '' : '',
        email:         pEmail   >= 0 ? row[pEmail]?.trim()   ?? '' : '',
        address:       pAddress >= 0 ? row[pAddress]?.trim() ?? '' : '',
        notes:         pNotes   >= 0 ? row[pNotes]?.trim()   ?? '' : '',
        roomNumber:    pRoom    >= 0 ? row[pRoom]?.trim()    ?? '' : '',
      });
    }

    // 학생 정보: 고유번호(sId) 열에 값이 있으면 학생
    const studentId   = row[sId]?.trim() ?? '';
    const studentName = sName >= 0 ? row[sName]?.trim() ?? '' : '';
    if (studentId && studentId !== '-' && studentName) {
      const genderRaw = sGender >= 0 ? row[sGender]?.trim() ?? 'M' : 'M';
      unit.students.push({
        id: studentId,
        name: studentName,
        englishName:      sEngName  >= 0 ? row[sEngName]?.trim()  ?? '' : '',
        grade:            sGrade    >= 0 ? row[sGrade]?.trim()    ?? '' : '',
        gender:           (genderRaw.toUpperCase() === 'F' ? 'F' : 'M') as 'M' | 'F',
        ssn:              sSsn      >= 0 ? row[sSsn]?.trim()      ?? '' : '',
        passportName:     sPassName >= 0 ? row[sPassName]?.trim() ?? '' : '',
        passportNumber:   sPassNum  >= 0 ? row[sPassNum]?.trim()  ?? '' : '',
        passportExpiry:   sPassExp  >= 0 ? row[sPassExp]?.trim()  ?? '' : '',
        medication:       sMed      >= 0 ? row[sMed]?.trim()      ?? '' : '',
        parentPhone:      sParPhone >= 0 ? row[sParPhone]?.trim() ?? '' : '',
        registrationSource: sReg   >= 0 ? row[sReg]?.trim()      ?? '' : '',
      });
    }
  }

  return Array.from(familyMap.values())
    .filter(f => f.students.length > 0 || f.parents.length > 0)
    .sort((a, b) => a.familyId.localeCompare(b.familyId));
}
