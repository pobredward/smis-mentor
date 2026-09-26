import { localizeLabels } from '../i18n';
import type { CampLodging } from './lodging';
import type { TimetableClassColumn } from './campTimetable';
import type { TimetableGuide } from './timetableGuide';

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
/** 반 하나의 이름·강의실 — 기수마다 다르고, 캠프당 한 벌만 둔다 */
export interface CampClassInfo {
  className?: string;   // 반이름 (e.g. "Grit")
  classroom?: string;   // 강의실 호수 (e.g. "243호")
  /** ESL 교재 L-Code (e.g. "Bc") — 교재 3권은 이 코드로 조회한다 */
  bookCode?: string;
  /** 보조 교재 코드 — 레벨이 안 맞는 학생용. 없는 반이 더 많다 */
  spareBookCode?: string;
}

/**
 * 한 그룹의 모든 Day(정규·스팀·입소…)가 함께 쓰는 시간표 값.
 *
 * 반 목록과 선생님 이름, 과목·주제는 Day 가 달라도 같은 게 보통이라
 * 표마다 따로 두면 같은 값을 Day 수만큼 다시 넣어야 하고 조용히 어긋난다.
 * 그래서 그룹당 한 벌만 여기 두고, 정말 달라야 하는 Day 만
 * CampTimetable.own 플래그를 켜서 자기 값을 쓴다.
 */
export interface CampTimetableCommon {
  /** 반 목록 + 직접 넣은 담임 이름 (반 구성 · 이름 수정) */
  classes?: TimetableClassColumn[];
  /** 역할키 → 직접 넣은 담당자 이름 (이름 수정의 원어민·스태프 부분) */
  staffOverrides?: Record<string, string>;
}

export interface CampSettings {
  campCode: string;
  groups?: CampGroup[];          // 그룹-반 매핑 (없으면 그룹 미설정)
  /**
   * 반코드 → 반이름·강의실.
   * 시간표 문서마다 따로 두면 표끼리 달라지므로 캠프 설정에 한 벌만 둔다.
   */
  classInfo?: Record<string, CampClassInfo>;
  /** 그룹명 → 그 그룹의 모든 Day 가 함께 쓰는 값 */
  timetableCommon?: Record<string, CampTimetableCommon>;
  /**
   * 칸 이름(소문자 정규화) → 그 칸을 눌렀을 때 뜨는 설명.
   * Day 가 아니라 캠프 단위라, Breakfast 처럼 여러 Day 에 걸치는 것도 한 번만 쓴다.
   */
  timetableGuides?: Record<string, TimetableGuide>;
  /** 숙소 — 방 용도·선생님 배치·장소 용도 (건물 자체는 shared/data/lodging 에 고정) */
  lodging?: CampLodging;
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

export const MANAGER_ACTION_LABELS: Record<ManagerActionType, string> = localizeLabels({
  medication: '💊 약 복용 지시',
  call:       '📞 전화할게요',
  visit:      '🚶 직접 확인 갈게요',
  escort:     '🚌 데리러 와주세요',
  confirmed:  '✅ 현장 확인 완료',
});

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

// ── 복통 위치 (증상에 '복통'이 포함될 때만 추가 선택, 복수 선택) ──
export const ABDOMINAL_PAIN_SYMPTOM = '복통';
export const ABDOMINAL_PAIN_SITES = [
  '명치 / 상복부',
  '배꼽 주변',
  '아랫배',
  '왼쪽 윗배',
  '오른쪽 윗배',
  '왼쪽 아랫배',
  '오른쪽 아랫배',
  '배 전체',
  '정확한 위치를 모르겠음',
] as const;
export type AbdominalPainSite = (typeof ABDOMINAL_PAIN_SITES)[number];

/** 증상에 복통이 포함되어 있는지 */
export function hasAbdominalPain(symptoms: string[]): boolean {
  return symptoms.some(s => s.includes(ABDOMINAL_PAIN_SYMPTOM));
}

/**
 * 증상 배열(+복통 위치) → 저장·표시용 한 줄 문자열
 * 예: ['복통', '구토'] + ['명치 / 상복부', '배꼽 주변'] → "복통(명치 / 상복부, 배꼽 주변), 구토"
 */
export function formatSymptomText(symptoms: string[], painSites?: string[]): string {
  const sites = (painSites ?? []).filter(Boolean);
  return symptoms
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => (s.includes(ABDOMINAL_PAIN_SYMPTOM) && sites.length > 0 ? `${s}(${sites.join(', ')})` : s))
    .join(', ');
}

// ── 체온 기준 (최초보고·경과보고·카드 표시 공통) ──────────────
// 기준을 바꿀 때는 이 값만 수정하면 모든 화면에 동일하게 반영됨
export const FEVER_THRESHOLDS = {
  /** 이 값 이상이면 미열 */
  slight: 37.5,
  /** 이 값 이상이면 고열 */
  high: 38.0,
} as const;

export const FEVER_LEVELS = ['정상', '미열', '고열'] as const;
export type FeverLevel = (typeof FEVER_LEVELS)[number];

/** 각 단계의 범위 안내 문구 (버튼 서브 라벨용) */
export const FEVER_LEVEL_RANGES: Record<FeverLevel, string> = {
  정상: `36.0–${(FEVER_THRESHOLDS.slight - 0.1).toFixed(1)}°`,
  미열: `${FEVER_THRESHOLDS.slight.toFixed(1)}–${(FEVER_THRESHOLDS.high - 0.1).toFixed(1)}°`,
  고열: `${FEVER_THRESHOLDS.high.toFixed(1)}° 이상`,
};

/** 체온 수치 → 열감 단계. 숫자가 아니면 null */
export function classifyFever(temp: number | string | null | undefined): FeverLevel | null {
  const n = typeof temp === 'number' ? temp : parseFloat(String(temp ?? ''));
  if (isNaN(n)) return null;
  if (n >= FEVER_THRESHOLDS.high) return '고열';
  if (n >= FEVER_THRESHOLDS.slight) return '미열';
  return '정상';
}

/** 열감 단계인지 (레거시 수치 문자열과 구분) */
export function isFeverLevel(value: unknown): value is FeverLevel {
  return typeof value === 'string' && (FEVER_LEVELS as readonly string[]).includes(value);
}

// ── 약 복용 기록 (재고 자동 연동) ─────────────────────────────
/**
 * 최초보고·경과보고에서 실제로 먹인 약 1건.
 * 저장 시 inventoryItems.stocks[groupId]에서 quantity만큼 차감되고,
 * 수정 시 차이만큼만, 삭제 시 전량 복구된다 (services/inventory.applyDoseStockChanges).
 */
export interface MedicationDose {
  id: string;
  /** inventoryItems 문서 ID */
  itemId: string;
  /** 약품명 스냅샷 (약품이 나중에 수정/비활성화되어도 기록 유지) */
  itemName: string;
  /** 종류 스냅샷 (같은 이름 구분: 모드코프 종합감기약/목감기약) */
  itemKind?: string;
  /** 주성분 스냅샷 (같은 성분 중복 복용 경고용) */
  ingredient?: string;
  quantity: number;
  /** 단위 스냅샷 (개, 포, ml 등) */
  unit?: string;
  /** 사용한 재고 그룹 (inventoryGroups 문서 ID) */
  groupId: string;
  groupName: string;
  memo?: string;
  givenAt: Timestamp;
  givenBy: string;
  /** 'initial' = 최초보고, 'progress' = 경과보고 */
  source: 'initial' | 'progress';
  /** 경과보고 연결 키: 해당 ProgressLog.loggedAt.toMillis() */
  progressLogAt?: number;
}

/**
 * 선생님에게 쓴 약 — 환자 탭에서 기록 (학생 환자 기록과 별도, 가상의 학생 기록을 만들지 않는다)
 * 재고 차감·복구는 학생 복용 기록과 같은 원장 방식 (inventoryDoseLedger/staff__{id})
 */
export interface StaffMedicationUse {
  id: string;
  campCode: string;
  /** 약을 쓴 선생님 */
  staffUserId: string;
  staffName: string;
  /** 그 선생님의 그룹 (기록 당시) */
  staffGroup?: string;
  /** 증상·사유 — 관리자가 선생님 건강 상태를 파악하도록 */
  symptom: string;
  note?: string;
  doses: MedicationDose[];
  recordedBy: string;
  recordedById: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 복용 기록 표시명: "모드코프(종합감기약)" */
export function doseLabel(d: Pick<MedicationDose, 'itemName' | 'itemKind'>): string {
  return d.itemKind ? `${d.itemName}(${d.itemKind})` : d.itemName;
}

/** 경과 로그에 연결된 복용 기록 필터 */
export function dosesForProgressLog(doses: MedicationDose[] | undefined, log: ProgressLog): MedicationDose[] {
  const key = log.loggedAt?.toMillis?.();
  if (!doses?.length || key == null) return [];
  return doses.filter(d => d.source === 'progress' && d.progressLogAt === key);
}

// ── 위치 모드 (일과중 / 휴식 / 격리) ──────────────────────────
export const LOCATION_MODES = ['일과중', '휴식', '격리'] as const;
export type LocationMode = (typeof LOCATION_MODES)[number];

// ── 경과 로그 ──────────────────────────────────────────────────
export interface ProgressLog {
  loggedAt: Timestamp;
  loggedBy: string;
  status: ProgressStatus;
  /** 현재 위치 모드 (일과중 / 휴식 / 격리) */
  locationMode?: LocationMode;
  /** 현재 위치 (예: 330호, 환자방) */
  location?: string;
  /** 열감 단계 (정상 | 미열 | 고열) — classifyFever()로 판정. 레거시 데이터는 수치 문자열일 수 있음 */
  fever?: string;
  /** 측정 체온 (℃). 입력 시 fever는 FEVER_THRESHOLDS 기준으로 자동 판정 */
  temperature?: number;
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
  `체온계로 정상 체온 (${FEVER_THRESHOLDS.slight}°C 미만)`,
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
  /** 증상 표시 문자열 (symptoms 배열을 formatSymptomText()로 합친 값 — 검색·목록 표시용) */
  symptom: string;
  /** 선택한 증상 목록 (복수 선택). 프리셋 라벨 + 직접 입력 */
  symptoms?: string[];
  /** 복통 위치 (symptoms에 '복통'이 있을 때만, 복수 선택) */
  abdominalPainSites?: string[];
  treatment: string;
  temperature?: number;
  /** 최초보고 시 열감 단계 ('정상' | '미열' | '고열') — temperature와 별개로 저장 */
  fever?: string;
  medication?: string;           // 단순 투약 메모
  medicationSchedules?: MedicationSchedule[];
  /** 실제 약 복용 기록 (최초보고·경과보고 누적, 재고 자동 연동) */
  medicationDoses?: MedicationDose[];

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
  /** 최초보고 시점의 현재 위치 모드 (일과중 / 휴식 / 격리) */
  locationMode?: LocationMode;
  /** 최초보고 시점의 현재 위치 */
  location?: string;
  recordedBy: string;
  /** 기록자 UID (삭제 권한 확인용) */
  recordedById?: string;
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
