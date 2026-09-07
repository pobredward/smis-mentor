// 캠프 관련 타입 정의

import { Timestamp } from 'firebase/firestore';

// 그룹 선택지 (주니어, 미들, 시니어, 계절, 단기)
export const JOB_EXPERIENCE_GROUPS = [
  '주니어',
  '미들',
  '시니어',
  '스프링',
  '서머',
  '어텀',
  '윈터',
  '공통',
  '단기1',
  '단기2',
  '단기3',
  '단기4',
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
  'short1': '단기1',
  'short2': '단기2',
  'short3': '단기3',
  'short4': '단기4',
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
  '단기1': 'short1',
  '단기2': 'short2',
  '단기3': 'short3',
  '단기4': 'short4',
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

/**
 * 캠프 그룹 (Spring, Summer, Junior, Middle 등)
 * campSettings/{campCode}.groups 배열로 저장
 */
export interface CampGroup {
  name: string;       // 그룹명 (e.g. "Spring", "Junior")
  classCodes: string[]; // 해당 그룹에 속한 반 코드 (e.g. ["J01","J02","J03","J04"])
}

/**
 * campSettings 문서 구조
 */
export interface CampSettings {
  campCode: string;
  groups?: CampGroup[];          // 그룹-반 매핑 (없으면 그룹 미설정)
  useTemporaryData?: boolean;
  updatedAt?: string;
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

export const MEDICATION_TIMES = ['기상후', '조식후', '중식후', '석식후', '취침전'] as const;
export type MedicationTime = (typeof MEDICATION_TIMES)[number];

// 복합 선택 가능한 환자 유형 (배열로 저장)
export const PATIENT_TYPES = ['처치전', '단순처치', '약복용', '격리', '병원내원'] as const;
export type PatientType = (typeof PATIENT_TYPES)[number];

// ── 경과 상태 ──────────────────────────────────────────────────
// 단계형: 최초보고 → 조치완료 → 호전중 → 완치
export const PROGRESS_STATUSES = ['최초보고', '중간보고', '완치'] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

// ── 내원 상태 ──────────────────────────────────────────────────
export const HOSPITAL_STATUSES = ['필요없음', '내원예정', '내원완료'] as const;
export type HospitalStatus = (typeof HOSPITAL_STATUSES)[number];

// ── 복용약 카테고리 ─────────────────────────────────────────────
export const MEDICATION_CATEGORIES = ['봉지약', '항생제', '알약', '시럽', '안약', '연고', '기타'] as const;
export type MedicationCategory = (typeof MEDICATION_CATEGORIES)[number];

// ── 복용약 스케줄 ──────────────────────────────────────────────
export interface MedicationSchedule {
  name: string;
  /** 약 종류 (봉지약, 항생제 등) */
  category?: MedicationCategory;
  /** 메모 (복용 시 주의사항 등) */
  memo?: string;
  totalDoses: number;
  times: MedicationTime[];
  startDate: string; // "2026-07-27"
  endDate: string;   // "2026-07-29"
  /** true = 캠프 마지막 날까지 복용 (endDate는 캠프 종료일로 저장) */
  endDateAuto?: boolean;
  /** 주 N일 복용 (기본: 매일. totalDoses 계산 및 표시에 사용) */
  daysPerWeek?: number;
  /** 휴약일 날짜 목록: ["2026-08-03", "2026-08-10"] */
  skipDates?: string[];
  /**
   * 시작 날(startDate) 복용 시작 시간.
   * 지정 시 startDate 당일 해당 시간 이전 복용 시간은 비활성화됨.
   * 예: '중식후' → 시작 날 중식후·석식후·취침전만 복용
   */
  firstTime?: MedicationTime;
  /**
   * 마지막 날(endDate) 복용 마감 시간.
   * 지정 시 endDate 당일 해당 시간 이후 복용 시간은 비활성화됨.
   * 예: '중식후' → 마지막 날 기상후·조식후·중식후만 복용
   */
  lastTime?: MedicationTime;
  checkedTimes: string[]; // 키: "조식후_20260727"
  /** 복용 확인자 이름: { "조식후_20260727": "김예리" } */
  checkedBy?: Record<string, string>;
  /** 이 약의 처방전 사진 URL 목록 (Firebase Storage) */
  photos?: string[];
}

// ── 내원 차량 슬롯 ────────────────────────────────────────────
export const TRANSPORT_SLOTS = ['차량1', '차량2', '택시1', '택시2', '택시3'] as const;
export type TransportSlot = (typeof TRANSPORT_SLOTS)[number];

/** 슬롯이 차량(운전자 필요)인지 여부 */
export function isCarSlot(slot: TransportSlot): boolean {
  return slot.startsWith('차량');
}

// ── 학부모 보고 방식 ─────────────────────────────────────────
export const PARENT_REPORT_METHODS = ['문자', '전화', '카카오', '기타'] as const;
export type ParentReportMethod = (typeof PARENT_REPORT_METHODS)[number];

// ── 내원 기록 (다회 내원 지원) ──────────────────────────────────
export interface HospitalVisitEntry {
  visitId: string;              // 고유 ID (Date.now().toString())
  hospitalStatus: HospitalStatus;
  scheduledAt?: Timestamp;
  completedAt?: Timestamp;
  escort: string;               // 인솔자
  driver?: string;              // 운전자 (차량 슬롯만)
  transportSlot?: TransportSlot; // 내원 차량 슬롯 (차량1/차량2/택시1/택시2/택시3)
  departureTime?: string;       // 출발 시간 "HH:mm" (24시간)
  hospitalName?: string;        // 병원 이름
  parentReporter?: string;      // 학부모 내원 보고자
  parentReportMethod?: ParentReportMethod; // 학부모 보고 방식
  prescription?: string;        // 처방약
  notes?: string;
  billing?: HospitalBilling;    // 내원별 정산
}

// ── 병원비 정산 ────────────────────────────────────────────────
export type BillingMethod = '용돈봉투' | '부모님청구' | '미정';

export interface HospitalBilling {
  method: BillingMethod;
  amount?: number;
  pocketMoneyHandler?: string; // 용돈봉투 차감 담당자
  isPaid: boolean;
  notes?: string;
}

// ── 보호자 연락 기록 ───────────────────────────────────────────
export type ContactMethod = '통화' | '문자' | '카카오' | '기타';
export type ContactReportType = '최초보고' | '경과보고' | '내원예정' | '내원결과' | '완치보고';

export interface ParentContactLog {
  contactedAt: Timestamp;
  contactedBy: string;       // 연락한 사람 이름
  contactedById?: string;    // 연락한 사람 UID
  method: ContactMethod;     // 연락 방법
  reportType: ContactReportType; // 보고 유형
  summary?: string;          // 추가 메모 (선택)
  isResolved: boolean;       // 완치 보고 여부
}

// ── 매니저 확인 ────────────────────────────────────────────────
export interface ManagerCheck {
  checkedAt: Timestamp;
  checkedBy: string;   // 매니저 이름
  checkedById: string; // 매니저 유저 ID
  memo?: string;
}

// ── 매니저 액션 (최초보고 → 매니저 지시 → 유저 수행 흐름) ─────
export const MANAGER_ACTION_TYPES = [
  'medication',    // OO약 복용하세요
  'call',          // 전화할게요
  'visit',         // 직접 확인하러 갈게요 (+ 장소)
  'escort',        // 데리러와주세요 (+ 장소)
  'confirmed',     // 확인 완료 (현장 확인)
] as const;

export type ManagerActionType = typeof MANAGER_ACTION_TYPES[number];

export const MANAGER_ACTION_LABELS: Record<ManagerActionType, string> = {
  medication: '💊 약 복용 지시',
  call:       '📞 전화할게요',
  visit:      '🚶 직접 확인 갈게요',
  escort:     '🚌 데리러 와주세요',
  confirmed:  '✅ 현장 확인 완료',
};

export interface ManagerActionResponse {
  respondedAt: Timestamp;
  respondedBy: string;    // 유저(담당자) 이름
  // medication: 실제 복용 기록
  medicationName?: string;
  medicationTime?: string;  // HH:mm
  // visit/escort: 현재 위치
  currentLocation?: string;
  note?: string;
}

export interface ManagerAction {
  id: string;
  actionType: ManagerActionType;
  issuedAt: Timestamp;
  issuedBy: string;          // 매니저 이름
  issuedById: string;

  // medication 세부
  medicationName?: string;   // 어떤 약
  medicationScheduledTime?: string; // 몇 시에

  // visit/escort 세부
  meetingPlace?: string;     // 어디로 올지 / 어디 갈지
  scheduledTime?: string;    // HH:mm

  // 유저 응답
  response?: ManagerActionResponse;
  isDone: boolean;           // 완료 처리

  // 후속조치 (매니저가 액션 후 결정)
  followUp?: {
    hospitalize: boolean;           // 내원 필요 여부
    nextCheckAt?: string;           // 다음 체크 시간 HH:mm
    nextCheckAssignee?: string;     // 다음 체크 담당자
    note?: string;
  };
}

// ── 경과 로그 ──────────────────────────────────────────────────
export interface ProgressLog {
  loggedAt: Timestamp;
  loggedBy: string;
  status: ProgressStatus;
  /** 현재 위치 (예: 330호, 보건실) */
  location?: string;
  /** 열감 (정상 | 미열 | 고열 | 직접입력 수치) */
  fever?: string;
  /** 증상 요약 */
  symptom?: string;
  note?: string;
  /** 다음 체크 예정 시각 (중간보고 시 지정) */
  nextCheckAt?: Timestamp;
  /** 다음 체크 담당자 ID */
  nextCheckAssigneeId?: string;
  /** 다음 체크 담당자 이름 */
  nextCheckAssigneeName?: string;
}

// ── 격리 주기 체크 스케줄 ─────────────────────────────────────
// 격리 환자의 "30분 후 체크" 등 주기 체크 스케줄 관리
export interface IsolationCheckSchedule {
  id: string;             // 고유 ID
  scheduledAt: Timestamp; // 예정 체크 시각
  completedAt?: Timestamp;// 실제 체크 시각
  checkedBy?: string;     // 체크 담당자 이름
  temperature?: number;   // 체크 시 체온
  status?: '정상' | '호전' | '악화' | '동일';
  note?: string;          // 메모
}

// ── 복귀 판단 기준 ─────────────────────────────────────────────
// 격리 및 일반 환자 모두에 적용 가능
export const RETURN_CRITERIA_LABELS = [
  '체온계로 정상 체온 (37.5°C 미만)',
  '이마와 목 만졌을 때 정상',
  '수업 들어도 괜찮다고 함',
] as const;

// ── PatientRecord ──────────────────────────────────────────────
export interface PatientRecord {
  id: string;
  campCode: string;
  studentId: string;
  studentName: string;
  grade?: string;
  className?: string;
  classMentor?: string;
  unitMentor?: string;
  roomNumber?: string;

  // 유형 (복합)
  types: PatientType[];
  symptom: string;
  treatment: string;
  temperature?: number;
  /** 최초보고 시 열감 단계 ('정상' | '미열' | '고열') — temperature와 별개로 저장 */
  fever?: string;
  medication?: string;           // 단순 투약 메모
  medicationSchedules?: MedicationSchedule[];

  // 경과 상태
  progressStatus: ProgressStatus;
  progressLogs?: ProgressLog[];   // 경과 변경 이력

  // 내원 (다회 지원)
  hospitalVisits?: HospitalVisitEntry[];

  // 격리
  isolationRoom?: string;
  isolationAssigneeId?: string;    // 격리 담당 멘토 ID
  isolationAssigneeName?: string;  // 격리 담당 멘토 이름
  isolationReturnChecks?: boolean[];        // 복귀 판단 기준 3항목 체크 (레거시)
  isolationCheckSchedules?: IsolationCheckSchedule[]; // 주기 체크 스케줄 목록
  returnCriteriaChecks?: boolean[];         // 복귀 판단 기준 (일반 환자에도 적용)

  // 매니저 확인
  managerCheck?: ManagerCheck;

  // 매니저 액션 (지시 → 수행 흐름)
  managerActions?: ManagerAction[];

  // 담당자
  assigneeId?: string;
  assigneeName?: string;

  // 보호자 연락
  parentContactAssigneeId?: string;
  parentContactAssigneeName?: string;
  parentContactLogs?: ParentContactLog[];
  nextContactScheduledAt?: Timestamp;

  visitDate: Timestamp;
  notes?: string;
  /** 최초보고 시점의 현재 위치 */
  location?: string;
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

// 업무 카테고리 (관리자가 캠프별로 사전 등록, 유저는 읽기 전용)
export interface TaskCategory {
  id: string;
  campCode: string;     // 캠프별 카테고리
  name: string;         // 예: "수업 준비", "행정", "개인 루틴"
  color: string;        // hex 색상 (예: "#3b82f6")
  createdBy: string;    // admin userId
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// 개인 커스텀 업무 (본인만 열람 가능, 관리자 노출 없음)
export interface PersonalTask {
  id: string;
  ownerId: string;      // 작성자 userId
  campCode: string;     // 캠프 컨텍스트
  // 복수 날짜로 생성 시 UUID가 부여되며, 같은 groupId를 가진 PersonalTask들은 함께 수정/삭제됨
  groupId?: string;
  title: string;
  description: string;
  date: Timestamp;
  time?: string;        // HH:mm 형식
  estimatedDuration?: {
    value: number;
    unit: 'minutes';    // 분 단위 고정
  };
  categoryId?: string;  // 카테고리 ID (taskCategories/{campCode}/{categoryId})
  isCompleted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
  
  // 여러 날짜에 걸쳐 생성된 업무를 묶는 그룹 ID
  // 2개 이상의 날짜로 생성 시 UUID가 부여되며, 같은 groupId를 가진 Task들은 함께 수정됨
  groupId?: string;
  
  estimatedDuration?: {
    value: number;
    unit: 'minutes' | 'hours';
  };
  
  categoryId?: string;  // 카테고리 ID
  attachments?: TaskAttachment[];
  completions: TaskCompletion[];
  
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}
