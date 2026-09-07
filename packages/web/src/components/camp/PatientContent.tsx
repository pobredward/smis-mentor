'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Timestamp } from 'firebase/firestore';
import ImageCropper from '@/components/common/ImageCropper';
import { useAuth } from '@/contexts/AuthContext';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import {
  subscribePatientRecords,
  addPatientRecord,
  updatePatientRecord,
  deletePatientRecord,
  addMedicationCheck,
  removeMedicationCheck,
  updateIsolationReturnChecks,
  updateHospitalVisitEntry,
  addParentContactLog,
  removeParentContactLog,
  updateParentContactAssignee,
  updateProgressStatus,
  addProgressLog,
  removeProgressLog,
  updateManagerCheck,
  addIsolationCheckSchedule,
  completeIsolationCheckSchedule,
  updateReturnCriteriaChecks,
  addSkipDate,
  removeSkipDate,
  addMedicationSchedule,
  updateMedicationSchedule,
  removeMedicationSchedule,
  addMedicationPhoto,
  removeMedicationPhoto,
  addManagerAction,
  respondManagerAction,
  completeManagerAction,
  updateManagerActionFollowUp,
  getCampGroups,
  getSameGroupClassCodes,
  MEDICATION_TIMES,
  MEDICATION_CATEGORIES,
  PATIENT_TYPES,
  PROGRESS_STATUSES,
  HOSPITAL_STATUSES,
  RETURN_CRITERIA_LABELS,
  MANAGER_ACTION_TYPES,
  MANAGER_ACTION_LABELS,
  getUsersByJobCodeId,
} from '@smis-mentor/shared';
import type {
  PatientRecord,
  PatientType,
  MedicationSchedule,
  MedicationCategory,
  HospitalVisitEntry,
  HospitalBilling,
  BillingMethod,
  TransportSlot,
  ParentReportMethod,
  MedicationTime,
  ProgressStatus,
  ProgressLog,
  HospitalStatus,
  ManagerCheck,
  IsolationCheckSchedule,
  ManagerAction,
  ManagerActionType,
  ContactMethod,
  ContactReportType,
  CampGroup,
  User,
  Camp,
} from '@smis-mentor/shared';
import { TRANSPORT_SLOTS, PARENT_REPORT_METHODS, isCarSlot, LOCATION_MODES } from '@smis-mentor/shared';
import type { LocationMode } from '@smis-mentor/shared';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { jobCodesService, stSheetService, CampCode } from '@/lib/stSheetService';
import type { STSheetStudent } from '@/lib/stSheetService';

// ==================== 매뉴얼 데이터 (하드코딩, 딜레이 없음) ====================

interface SymptomGuide {
  label: string;
  emoji: string;
  category: '내과' | '외과' | '응급';
  treatment: string;   // 기본 처치
  medication: string;  // 추천 약
  notes?: string;      // 추가 안내
}

const SYMPTOM_GUIDES: SymptomGuide[] = [
  // ── 내과/소아과 ──────────────────────────────────────────
  {
    label: '두통/발열',
    emoji: '🌡️',
    category: '내과',
    treatment: '타이레놀(해열제) 투여 후 안정, 미지근한 물 충분히 섭취, 서늘한 환경에서 휴식',
    medication: '해열제 (타이레놀 / 어린이용 부루펜)',
    notes: '37.2°C 이상이면 해열제, 38.5°C 이상이면 즉시 보고. 10분 간격으로 체온 체크.',
  },
  {
    label: '인후통 (목)',
    emoji: '😮',
    category: '내과',
    treatment: '소금물 가글, 따뜻한 물 섭취, 안정',
    medication: '목감기약 (용각산, 페니라민)',
    notes: '38°C 이상 동반 시 내원 고려.',
  },
  {
    label: '코막힘/콧물',
    emoji: '🤧',
    category: '내과',
    treatment: '코 세척(생리식염수), 충분한 수분 섭취',
    medication: '코감기약 (페니라민, 지르텍)',
  },
  {
    label: '알레르기 (재채기/콧물)',
    emoji: '🌿',
    category: '내과',
    treatment: '알레르기 유발 환경 제거, 냉찜질 (두드러기)',
    medication: '항히스타민제 (지르텍, 페니라민)',
  },
  {
    label: '복통',
    emoji: '🤢',
    category: '내과',
    treatment: '배를 따뜻하게 하고 안정, 식사 중단, 수분 보충',
    medication: '소화제 (훼스탈, 베아제), 설사 → 정로환, 변비 → 둘코락스',
    notes: '구토 동반 시 음식·물 섭취 중단 후 즉시 보고.',
  },
  {
    label: '근육통',
    emoji: '💪',
    category: '외과',
    treatment: '냉찜질(24시간 내) → 온찜질(24시간 후), 충분한 휴식',
    medication: '에어파스, 멘소래담',
  },
  {
    label: '코피',
    emoji: '🩸',
    category: '외과',
    treatment: '고개를 앞으로 숙이고 코날개 양쪽을 5~10분 압박. 절대 뒤로 젖히지 않기.',
    medication: '(약 불필요)',
    notes: '10분 이상 지속되면 즉시 내원.',
  },
  {
    label: '베임/찰과상',
    emoji: '🩹',
    category: '외과',
    treatment: '흐르는 물로 세척 → 소독약 → 밴드 또는 후시딘/마데카솔 도포',
    medication: '소독약, 후시딘(항생 연고), 마데카솔(재생 연고)',
    notes: '깊은 상처나 출혈이 멈추지 않으면 내원.',
  },
  {
    label: '화상',
    emoji: '🔥',
    category: '외과',
    treatment: '즉시 흐르는 찬물에 10~20분 냉각. 얼음 직접 금지. 물집 터뜨리지 않기.',
    medication: '실바딘크림 (처방 시), 마데카솔',
    notes: '2도 이상이거나 범위가 넓으면 즉시 내원.',
  },
  {
    label: '눈에 이물질',
    emoji: '👁️',
    category: '외과',
    treatment: '눈 비비지 않기. 흐르는 깨끗한 물로 눈을 씻어내기. 개선 없으면 내원.',
    medication: '인공눈물',
    notes: '시력 이상·통증 지속 시 즉시 내원.',
  },
  {
    label: '골절 의심',
    emoji: '🦴',
    category: '외과',
    treatment: '부목 고정 후 이동 최소화, 냉찜질, 즉시 내원',
    medication: '(약 불필요)',
    notes: '이동 시 골절 부위 고정 필수. 즉시 병원.',
  },
  {
    label: '쥐 (경련)',
    emoji: '⚡',
    category: '외과',
    treatment: '발바닥을 세게 당겨 스트레칭, 따뜻하게 찜질',
    medication: '(약 불필요)',
    notes: '반복 발생 시 전해질 음료 섭취 권장.',
  },
  {
    label: '다래끼',
    emoji: '👁️‍🗨️',
    category: '외과',
    treatment: '따뜻한 찜질(하루 3~4회, 10분씩), 눈 비비지 않기',
    medication: '점안 항생제 (처방 필요)',
  },
  {
    label: '구내염',
    emoji: '👄',
    category: '내과',
    treatment: '구강 위생 유지, 자극적 음식 금지, 충분한 수분',
    medication: '알보칠, 구강연고',
  },
  {
    label: '두드러기',
    emoji: '🔴',
    category: '내과',
    treatment: '알레르기 원인 제거, 냉찜질, 긁지 않기',
    medication: '항히스타민제 (지르텍, 페니라민)',
    notes: '호흡 곤란 동반 시 즉시 119 및 운영진 연락.',
  },
  {
    label: '멀미',
    emoji: '🚌',
    category: '내과',
    treatment: '신선한 공기, 앞좌석 이동, 눕히기',
    medication: '멀미약 (키미테, 보나링)',
  },
  // ── 응급 ────────────────────────────────────────────────
  {
    label: '심정지 의심',
    emoji: '❤️',
    category: '응급',
    treatment: '즉시 119 신고 → CPR 시작 (30:2 압박:인공호흡). AED 사용 가능 시 사용.',
    medication: '(약 불필요)',
    notes: '절대 혼자 판단하지 말고 즉시 119 신고.',
  },
  {
    label: '기도폐쇄 (목막힘)',
    emoji: '🫁',
    category: '응급',
    treatment: '등 두드리기 5회 → 하임리히법 5회 반복. 의식 없으면 119 신고 + CPR.',
    medication: '(약 불필요)',
    notes: '즉시 119 신고.',
  },
];

const SYMPTOM_CATEGORIES = ['내과', '외과', '응급'] as const;
type SymptomCategory = (typeof SYMPTOM_CATEGORIES)[number];

// ==================== 상수 ====================

const BILLING_METHODS: BillingMethod[] = ['용돈봉투', '부모님청구', '미정'];
// ISOLATION_RETURN_LABELS는 레거시용 (IsolationManageSection 내부에서만 사용)
const ISOLATION_RETURN_LABELS = ['열 없음 (37.5°C 미만)', '주요 증상 호전', '담당 매니저 확인'];

const PROGRESS_STYLE: Record<ProgressStatus, { dot: string; badge: string; step: string; line: string; label: string }> = {
  최초보고: { dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-700',     step: 'bg-gray-400',   line: 'border-gray-300',  label: 'text-gray-700' },
  중간보고: { dot: 'bg-blue-400',   badge: 'bg-blue-100 text-blue-700',     step: 'bg-blue-400',   line: 'border-blue-200',  label: 'text-blue-700' },
  완치:     { dot: 'bg-green-400',  badge: 'bg-green-100 text-green-800',   step: 'bg-green-500',  line: 'border-green-200', label: 'text-green-800' },
};

const HOSPITAL_STATUS_STYLE: Record<HospitalStatus, { badge: string }> = {
  필요없음: { badge: 'bg-gray-100 text-gray-600' },
  내원예정: { badge: 'bg-orange-100 text-orange-700' },
  내원완료: { badge: 'bg-green-100 text-green-700' },
};

const TYPE_STYLE: Record<PatientType, { bg: string; text: string }> = {
  처치전:   { bg: 'bg-gray-50',    text: 'text-gray-600' },
  단순처치: { bg: 'bg-blue-50',    text: 'text-blue-700' },
  약복용:   { bg: 'bg-orange-50',  text: 'text-orange-700' },
  격리:     { bg: 'bg-purple-50',  text: 'text-purple-700' },
  병원내원: { bg: 'bg-red-50',     text: 'text-red-700' },
};

const PARENT_REPORT_TEMPLATE = (record: PatientRecord) =>
  `안녕하세요, SMIS 캠프입니다.\n${record.studentName} 학생 관련 보고 드립니다.\n\n` +
  `증상: ${record.symptom}\n처치: ${record.treatment}\n` +
  (record.temperature ? `체온: ${record.temperature}°C\n` : '') +
  `현재 경과: ${record.progressStatus}\n\n경과를 계속 모니터링하겠습니다.`;

// ==================== 유틸 ====================

function formatDate(ts: Timestamp | undefined): string {
  if (!ts?.toDate) return '--/--';
  const d = ts.toDate();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${min}`;
}

function makeMedTimeKey(time: MedicationTime, dateStr: string): string {
  return `${time}_${dateStr.replace(/-/g, '')}`;
}

// 방 담당: 기상 직후 / 취침 전 투약 담당
const ROOM_TIMES: MedicationTime[] = ['기상후', '취침전'];
// 반 담당: 식사 후 투약 담당
const CLASS_TIMES: MedicationTime[] = ['조식후', '중식후', '석식후'];

/** 반 이름 표시용: "OnePiece" → "OnePiece반" (이미 '반'으로 끝나거나 미배정이면 그대로) */
const fmtClass = (name: string) =>
  name === '반 미배정' || name.endsWith('반') ? name : `${name}반`;

/** grade 문자열("3F", "4M" 등)에서 성별 추출: F=0(여, 위), M=1(남, 아래) */
const genderOrder = (grade?: string) => (grade?.endsWith('F') ? 0 : 1);

/** visitDate 기준 경과일 계산 (0 = 오늘, 1 = 어제 포함 1일차 등) */
function daysElapsed(visitDate: Timestamp | undefined): number {
  if (!visitDate?.toDate) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const visit = visitDate.toDate();
  visit.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - visit.getTime()) / 86400000);
}

/** 환자 긴급도 점수: 낮을수록 우선 */
function urgencyScore(r: PatientRecord): number {
  if (r.types.includes('격리')) return 0;
  if (r.progressStatus === '최초보고') return 2;
  if (r.types.includes('병원내원')) return 3;
  if (r.progressStatus === '중간보고') return 5;
  return 9;
}

/** 방담당 섹션 환자 정렬: ①여자 먼저 ②classMentor의 반코드 오름차순 ③이름 */
const sortRoomRecords = (list: PatientRecord[]) =>
  [...list].sort((a, b) => {
    const gA = genderOrder(a.grade), gB = genderOrder(b.grade);
    if (gA !== gB) return gA - gB;
    // classMentor 반코드: classMentor 자체가 반코드를 표현하지 않으므로
    // className 기준으로 반코드 오름차순 정렬
    const cA = a.className ?? '', cB = b.className ?? '';
    const cmp = cA.localeCompare(cB, 'ko', { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    return a.studentName.localeCompare(b.studentName, 'ko');
  });

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isInDateRange(start: string, end: string, date: string): boolean {
  return date >= start && date <= end;
}

/** 스케줄의 총 복용 횟수 계산 */
function calcTotalDoses(sched: MedicationSchedule): number {
  if (!sched.startDate || !sched.endDate || sched.times.length === 0) return 0;
  const start = new Date(sched.startDate);
  const end = new Date(sched.endDate);
  const totalDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  // 휴약일 제외
  const skipCount = (sched.skipDates ?? []).filter(d => d >= sched.startDate && d <= sched.endDate).length;
  // 주 N일 복용인 경우 유효 일수 조정 (소수점 올림)
  const effectiveDays = sched.daysPerWeek
    ? Math.max(0, Math.ceil((totalDays - skipCount) * (sched.daysPerWeek / 7)))
    : Math.max(0, totalDays - skipCount);
  return effectiveDays * sched.times.length;
}

/** 날짜가 오늘 휴약일인지 확인 */
function isSkipDate(sched: MedicationSchedule, date: string): boolean {
  return (sched.skipDates ?? []).includes(date);
}

/** 오늘까지 완료 가능한 복용 횟수 (시작~오늘 또는 종료일 중 이른 날) */
function calcExpectedDosesUntilToday(sched: MedicationSchedule, today: string): number {
  if (!sched.startDate || sched.times.length === 0) return 0;
  const start = new Date(sched.startDate);
  const endDate = sched.endDate < today ? sched.endDate : today;
  const end = new Date(endDate);
  if (end < start) return 0;
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return days * sched.times.length;
}

// ==================== 폼 타입 ====================

interface MedScheduleForm {
  name: string;
  times: MedicationTime[];
  startDate: string;
  endDate: string;
  endDateAuto: boolean;      // 캠프 끝까지
  daysPerWeek: number | '';  // 주 N일 (빈 문자열 = 매일)
}

interface FormState {
  studentName: string;
  grade: string;
  className: string;
  classMentor: string;
  unitMentor: string;
  roomNumber: string;
  types: PatientType[];
  symptom: string;
  treatment: string;
  temperature: string;
  medication: string;
  notes: string;
  progressStatus: ProgressStatus;
  isolationRoom: string;
  medSchedules: MedScheduleForm[];
  hospitalEscort: string;
  hospitalDate: string;
  hospitalTime: string;
  hospitalStatus: HospitalStatus;
  hospitalPrescription: string;
  hospitalNotes: string;
  billingMethod: BillingMethod;
  billingAmount: string;
  billingPocketHandler: string;
  billingPaid: boolean;
  billingNotes: string;
  assigneeId: string;
  assigneeName: string;
  parentContactAssigneeId: string;
  parentContactAssigneeName: string;
}

const EMPTY_FORM: FormState = {
  studentName: '',
  grade: '',
  className: '',
  classMentor: '',
  unitMentor: '',
  roomNumber: '',
  types: ['처치전'],
  symptom: '',
  treatment: '',
  temperature: '',
  medication: '',
  notes: '',
  progressStatus: '최초보고',
  isolationRoom: '',
  medSchedules: [],
  hospitalEscort: '',
  hospitalDate: '',
  hospitalTime: '',
  hospitalStatus: '필요없음',
  hospitalPrescription: '',
  hospitalNotes: '',
  billingMethod: '미정',
  billingAmount: '',
  billingPocketHandler: '',
  billingPaid: false,
  billingNotes: '',
  assigneeId: '',
  assigneeName: '',
  parentContactAssigneeId: '',
  parentContactAssigneeName: '',
};

// ── 약 사진용 ImageCropper wrapper (자유 비율) ──────────────────
function ImageCropperWrapper({ file, onCropComplete, onCancel }: {
  file: File;
  onCropComplete: (f: File) => void;
  onCancel: () => void;
}) {
  // aspectRatio 미전달 → 자유 비율로 크롭 가능
  return (
    <ImageCropper
      file={file}
      onCropComplete={onCropComplete}
      onCancel={onCancel}
    />
  );
}

// ==================== 메인 컴포넌트 ====================

export default function PatientContent() {
  const { userData } = useAuth();
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [campCode, setCampCode] = useState<CampCode | null>(null);
  const [campUsers, setCampUsers] = useState<User[]>([]);
  const [students, setStudents] = useState<STSheetStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showQuickReport, setShowQuickReport] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [today] = useState(todayStr());
  const [campEndDate, setCampEndDate] = useState<string>('');  // "2026-08-14"
  const [campGroups, setCampGroups] = useState<CampGroup[]>([]); // 그룹-반 매핑
  // 주 탭: 환자 현황 / 약복용명단
  const [mainTab, setMainTab] = useState<'환자 현황' | '약복용명단'>('환자 현황');
  // 내 유닛/반 필터
  const [myFilter, setMyFilter] = useState<'전체' | '내유닛' | '내반'>('전체');
  const activeJobCodeId = useMemo(() => {
    const isAdmin = userData?.role === 'admin';
    return isAdmin
      ? ((userData as unknown as Record<string, unknown>).adminTempActiveCamp as string | undefined) ||
        userData?.activeJobExperienceId
      : userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;
  }, [userData]);

  // 캠프 코드 + 유저 목록 로드
  useEffect(() => {
    if (!activeJobCodeId) { setLoading(false); return; }
    jobCodesService.getJobCodesByIds([activeJobCodeId]).then(async codes => {
      if (codes.length > 0 && codes[0].code) {
        const cc = codes[0].code as CampCode;
        setCampCode(cc);
        // 캠프 참여 유저 목록
        try {
          const users = await getUsersByJobCodeId(db, activeJobCodeId);
          setCampUsers(users);
        } catch { /* 유저 목록 없어도 무방 */ }
        // 캠프 종료일 로드 (약 "캠프 끝까지" 기능용)
        try {
          const campSnap = await getDocs(query(collection(db, 'camps'), where('code', '==', cc)));
          if (!campSnap.empty) {
            const campData = campSnap.docs[0].data() as Camp;
            if (campData.endDate) {
              const d = campData.endDate.toDate();
              setCampEndDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
            }
          }
        } catch { /* 없어도 무방 */ }
        // 그룹-반 매핑 로드 (campSettings.groups)
        try {
          const groups = await getCampGroups(db, cc);
          setCampGroups(groups);
        } catch { /* 그룹 미설정 캠프는 무방 */ }
        // ST시트 학생 목록 (검색 자동완성용)
        try {
          const sts = await stSheetService.getCachedData(cc);
          setStudents(sts);
        } catch { /* 없어도 무방 */ }
      } else {
        setLoading(false);
      }
    }).catch(() => setLoading(false));
  }, [activeJobCodeId]);

  // Firestore 실시간 구독
  useEffect(() => {
    if (!campCode) return;
    setLoading(true);
    const unsub = subscribePatientRecords(
      db, campCode,
      (data) => { setRecords(data); setLoading(false); },
      () => setLoading(false)
    );
    return () => unsub();
  }, [campCode]);

  // 현재 환자 (완치 제외) / 완치 환자 분리
  const activeRecords = useMemo(() =>
    records.filter(r => r.progressStatus !== '완치'), [records]);
  const resolvedRecords = useMemo(() =>
    records.filter(r => r.progressStatus === '완치'), [records]);

  // 검색 필터 적용
  const filterBySearch = useCallback((list: PatientRecord[]) => {
    const q = searchQuery.trim();
    if (!q) return list;
    return list.filter(r =>
      r.studentName.includes(q) || r.symptom.includes(q) || (r.className?.includes(q))
    );
  }, [searchQuery]);

  // 내 유닛/반 필터 적용
  const filterByMyUnit = useCallback((list: PatientRecord[]) => {
    if (myFilter === '전체') return list;
    const myName = userData?.name;
    if (!myName) return list;
    if (myFilter === '내유닛') return list.filter(r => r.unitMentor === myName || r.assigneeName === myName);
    if (myFilter === '내반') return list.filter(r => r.classMentor === myName);
    return list;
  }, [myFilter, userData?.name]);

  // 반 이름(className) → group 키 매핑 테이블
  // campUsers는 이미 현재 캠프 소속 유저들만 포함되어 있으므로
  // classMentor 이름으로 campUsers에서 찾아 담임 jobExperience의 group 사용
  const classNameToGroupKey = useMemo((): Map<string, string> => {
    const result = new Map<string, string>();
    records.forEach(r => {
      if (!r.className || result.has(r.className)) return;
      if (!r.classMentor) return;
      // campUsers(현재 캠프 소속)에서 classMentor 검색
      const mentorUser = campUsers.find(u => u.name === r.classMentor);
      if (!mentorUser) return;
      // campUsers는 이미 현재 캠프 멤버 → activeJobCodeId 비교 없이 담임 role만 체크
      // 우선순위: 1) 현재 jobCodeId + 담임  2) 현재 jobCodeId  3) 담임  4) 첫 번째
      const je = mentorUser.jobExperiences?.find(
        j => j.id === activeJobCodeId && j.groupRole === '담임'
      ) ?? mentorUser.jobExperiences?.find(
        j => j.id === activeJobCodeId
      ) ?? mentorUser.jobExperiences?.find(
        j => j.groupRole === '담임' && j.group && j.group !== 'manager' && j.group !== 'common'
      ) ?? mentorUser.jobExperiences?.find(
        j => j.group && j.group !== 'manager' && j.group !== 'common'
      );
      if (je?.group) result.set(r.className, je.group.toLowerCase());
    });
    return result;
  }, [records, campUsers, activeJobCodeId]);

  // 그룹 순서 (고정 순서 기준, 알 수 없는 그룹은 뒤로)
  const FIXED_GROUP_ORDER = ['junior', 'middle', 'senior', 'spring', 'summer', 'autumn', 'winter', 'common', 'short1', 'short2', 'short3', 'short4', 'manager'];
  const GROUP_DISPLAY_NAMES: Record<string, string> = {
    junior: '주니어', middle: '미들', senior: '시니어',
    spring: '스프링', summer: '서머', autumn: '어텀', winter: '원터',
    common: '공통', short1: '단기1', short2: '단기2', short3: '단기3', short4: '단기4',
    manager: '매니저',
  };
  // 스프링/주니어=노랑, 서머/미들=초록, 어텀/시니어=보라, 원터=빨강, 단기=회색
  const GROUP_BG_COLORS: Record<string, string> = {
    spring:  'bg-yellow-50',  junior: 'bg-yellow-50',
    summer:  'bg-green-50',   middle: 'bg-green-50',
    autumn:  'bg-purple-50',  senior: 'bg-purple-50',
    winter:  'bg-red-50',
    common:  'bg-gray-50',
    short1:  'bg-gray-50',    short2: 'bg-gray-50',
    short3:  'bg-gray-50',    short4: 'bg-gray-50',
    manager: 'bg-slate-50',
  };
  const GROUP_TEXT_COLORS: Record<string, string> = {
    spring:  'text-yellow-700',  junior: 'text-yellow-700',
    summer:  'text-green-700',   middle: 'text-green-700',
    autumn:  'text-purple-700',  senior: 'text-purple-700',
    winter:  'text-red-700',
    common:  'text-gray-500',
    short1:  'text-gray-600',    short2: 'text-gray-600',
    short3:  'text-gray-600',    short4: 'text-gray-600',
    manager: 'text-slate-600',
  };
  const GROUP_BORDER_COLORS: Record<string, string> = {
    spring:  'border-yellow-200',  junior: 'border-yellow-200',
    summer:  'border-green-200',   middle: 'border-green-200',
    autumn:  'border-purple-200',  senior: 'border-purple-200',
    winter:  'border-red-200',
    common:  'border-gray-200',
    short1:  'border-gray-200',    short2: 'border-gray-200',
    short3:  'border-gray-200',    short4: 'border-gray-200',
    manager: 'border-slate-200',
  };

  const groupOrder = useMemo((): string[] => {
    // campGroups.name은 "Spring"/"Summer" 등 대소문자 혼용 가능 → 소문자로 정규화해서 FIXED_GROUP_ORDER와 통일
    if (campGroups.length > 0) return campGroups.map(g => g.name.toLowerCase());
    return FIXED_GROUP_ORDER;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campGroups]);

  // 현재 환자 → 반별 그룹핑 후 그룹 순서로 정렬
  const activeByClass = useMemo(() => {
    const filtered = filterByMyUnit(filterBySearch(activeRecords));

    // 반별 map
    const map = new Map<string, PatientRecord[]>();
    filtered.forEach(r => {
      const key = r.className || '반 미배정';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });

    // 반 이름 오름차순 정렬 (그룹 순서는 렌더 단계에서 처리)
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === '반 미배정') return 1;
      if (b === '반 미배정') return -1;
      return a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
    });
  }, [activeRecords, filterBySearch, filterByMyUnit]);

  const filteredResolved = useMemo(() =>
    filterByMyUnit(filterBySearch(resolvedRecords)), [resolvedRecords, filterBySearch, filterByMyUnit]);

  // 약 복용 명단: 오늘 복용 스케줄이 있는 환자만
  const medicationRecords = useMemo(() => {
    return filterByMyUnit(records.filter(r => {
      if (r.progressStatus === '완치') return false;
      const schedules = Array.isArray(r.medicationSchedules) ? r.medicationSchedules : [];
      return schedules.some(s => isInDateRange(s.startDate, s.endDate, today));
    }));
  }, [records, today, filterByMyUnit]);

  const counts = useMemo(() => ({
    active: activeRecords.length,
    최초보고: activeRecords.filter(r => r.progressStatus === '최초보고').length,
    중간보고: activeRecords.filter(r => r.progressStatus === '중간보고').length,
    내원예정: activeRecords.filter(r => (r.hospitalVisits ?? []).some(v => v.hospitalStatus === '내원예정')).length,
    격리: activeRecords.filter(r => r.types.includes('격리')).length,
    완치: resolvedRecords.length,
  }), [activeRecords, resolvedRecords]);

  // 내가 담당자인 미처리 수
  const myPendingCount = useMemo(() =>
    records.filter(r => r.assigneeId === userData?.id && r.progressStatus !== '완치').length,
    [records, userData?.id]
  );

  // ==================== 폼 핸들러 ====================

  const openAddForm = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, assigneeName: userData?.name ?? '', assigneeId: userData?.id ?? '' });
    setShowForm(true);
  };

  const openEditForm = (record: PatientRecord) => {
    setEditingId(record.id);
    const hv = (record.hospitalVisits ?? [])[0];
    const b = hv?.billing;
    setForm({
      studentName: record.studentName,
      grade: record.grade ?? '',
      className: record.className ?? '',
      classMentor: record.classMentor ?? '',
      unitMentor: record.unitMentor ?? '',
      roomNumber: record.roomNumber ?? '',
      types: record.types ?? ['처치전'],
      symptom: record.symptom,
      treatment: record.treatment,
      temperature: record.temperature != null ? String(record.temperature) : '',
      medication: record.medication ?? '',
      notes: record.notes ?? '',
      progressStatus: record.progressStatus ?? '최초보고',
      isolationRoom: record.isolationRoom ?? '',
      medSchedules: (record.medicationSchedules ?? []).map(s => ({
        name: s.name, times: s.times, startDate: s.startDate, endDate: s.endDate,
        endDateAuto: s.endDateAuto ?? false, daysPerWeek: s.daysPerWeek ?? '',
      })),
      hospitalStatus: hv?.hospitalStatus ?? '필요없음',
      hospitalEscort: hv?.escort ?? '',
      hospitalDate: hv?.scheduledAt ? hv.scheduledAt.toDate().toISOString().slice(0, 10) : '',
      hospitalTime: hv?.scheduledAt ? hv.scheduledAt.toDate().toTimeString().slice(0, 5) : '',
      hospitalPrescription: hv?.prescription ?? '',
      hospitalNotes: hv?.notes ?? '',
      billingMethod: b?.method ?? '미정',
      billingAmount: b?.amount != null ? String(b.amount) : '',
      billingPocketHandler: b?.pocketMoneyHandler ?? '',
      billingPaid: b?.isPaid ?? false,
      billingNotes: b?.notes ?? '',
      assigneeId: record.assigneeId ?? '',
      assigneeName: record.assigneeName ?? '',
      parentContactAssigneeId: record.parentContactAssigneeId ?? '',
      parentContactAssigneeName: record.parentContactAssigneeName ?? '',
    });
    setShowForm(true);
  };

  const handleSubmit = useCallback(async () => {
    if (!campCode || !userData) return;
    if (!form.studentName.trim() || !form.symptom.trim()) return;
    setSubmitting(true);
    try {
      const medSchedules: MedicationSchedule[] = form.medSchedules.map((s, si) => {
        const existing = editingId
          ? (records.find(r => r.id === editingId)?.medicationSchedules ?? [])[si]
          : undefined;
        const sched: MedicationSchedule = {
          name: s.name,
          times: s.times,
          startDate: s.startDate,
          endDate: s.endDate,
          ...(s.endDateAuto ? { endDateAuto: true } : {}),
          ...(s.daysPerWeek !== '' ? { daysPerWeek: Number(s.daysPerWeek) } : {}),
          totalDoses: 0,
          checkedTimes: existing?.checkedTimes ?? [],
          skipDates: existing?.skipDates ?? [],
        };
        sched.totalDoses = calcTotalDoses(sched);
        return sched;
      });

      // 첫 번째 내원 정보 (등록 시)
      const hospitalVisits: HospitalVisitEntry[] = [];
      if (form.types.includes('병원내원')) {
        let scheduledAt: Timestamp | undefined;
        if (form.hospitalDate) {
          const dt = form.hospitalTime
            ? `${form.hospitalDate}T${form.hospitalTime}:00`
            : `${form.hospitalDate}T00:00:00`;
          scheduledAt = Timestamp.fromDate(new Date(dt));
        }
        const hasBilling = form.hospitalStatus === '내원완료' && form.billingMethod !== '미정';
        const billing: HospitalBilling | undefined = hasBilling ? {
          method: form.billingMethod,
          amount: form.billingAmount ? parseInt(form.billingAmount) : undefined,
          pocketMoneyHandler: form.billingMethod === '용돈봉투' ? form.billingPocketHandler.trim() || undefined : undefined,
          isPaid: form.billingPaid,
          notes: form.billingNotes.trim() || undefined,
        } : undefined;
        hospitalVisits.push({
          visitId: Date.now().toString(),
          hospitalStatus: form.hospitalStatus,
          escort: form.hospitalEscort.trim(),
          scheduledAt,
          prescription: form.hospitalPrescription.trim() || undefined,
          notes: form.hospitalNotes.trim() || undefined,
          billing,
        });
      }

      const payload = {
        campCode: campCode as string,
        studentId: '',
        studentName: form.studentName.trim(),
        grade: form.grade.trim() || undefined,
        className: form.className.trim() || undefined,
        classMentor: form.classMentor.trim() || undefined,
        unitMentor: form.unitMentor.trim() || undefined,
        roomNumber: form.roomNumber.trim() || undefined,
        types: form.types,
        symptom: form.symptom.trim(),
        treatment: form.treatment.trim(),
        temperature: form.temperature ? parseFloat(form.temperature) : undefined,
        medication: form.medication.trim() || undefined,
        notes: form.notes.trim() || undefined,
        progressStatus: form.progressStatus,
        isolationRoom: form.types.includes('격리') ? form.isolationRoom.trim() || undefined : undefined,
        medicationSchedules: medSchedules.length > 0 ? medSchedules : undefined,
        hospitalVisits: hospitalVisits.length > 0 ? hospitalVisits : undefined,
        assigneeId: form.assigneeId || undefined,
        assigneeName: form.assigneeName || undefined,
        parentContactAssigneeId: form.parentContactAssigneeId || undefined,
        parentContactAssigneeName: form.parentContactAssigneeName || undefined,
        visitDate: Timestamp.now(),
        recordedBy: userData.name,
      };

      if (editingId) {
        await updatePatientRecord(db, editingId, payload);
      } else {
        await addPatientRecord(db, payload);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    } finally {
      setSubmitting(false);
    }
  }, [campCode, userData, editingId, form, records]);

  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!confirm(`"${name}" 환자 기록을 삭제하시겠습니까?`)) return;
    await deletePatientRecord(db, id);
  }, []);

  const handleProgressChange = useCallback(async (record: PatientRecord, status: ProgressStatus) => {
    if (!userData) return;
    await updateProgressStatus(db, record.id, status, userData.name);
  }, [userData]);

  const handleAddProgressLog = useCallback(async (record: PatientRecord, log: Parameters<typeof addProgressLog>[2]) => {
    if (!userData) return;
    await addProgressLog(db, record.id, { ...log, loggedBy: userData.name });
  }, [userData]);

  const handleRemoveProgressLog = useCallback(async (record: PatientRecord, logIndex: number) => {
    const logs = record.progressLogs ?? [];
    if (logs.length === 0) return;
    if (!confirm('이 경과 기록을 삭제할까요?')) return;
    await removeProgressLog(db, record.id, logs, logIndex);
  }, []);

  const handleManagerCheck = useCallback(async (record: PatientRecord, memo?: string) => {
    if (!userData) return;
    if (record.managerCheck) {
      await updateManagerCheck(db, record.id, null);
    } else {
      const check: ManagerCheck = {
        checkedAt: Timestamp.now(),
        checkedBy: userData.name,
        checkedById: userData.id,
        ...(memo?.trim() ? { memo: memo.trim() } : {}),
      };
      await updateManagerCheck(db, record.id, check);
    }
  }, [userData]);

  const handleAddHospitalVisit = useCallback(async (record: PatientRecord) => {
    const entry: HospitalVisitEntry = {
      visitId: Date.now().toString(),
      hospitalStatus: '내원예정',
      escort: '',
    };
    const existing = record.hospitalVisits ?? [];
    await updateHospitalVisitEntry(db, record.id, [...existing, entry]);
  }, []);

  const handleUpdateHospitalVisit = useCallback(async (
    record: PatientRecord, updated: HospitalVisitEntry[]
  ) => {
    await updateHospitalVisitEntry(db, record.id, updated);
  }, []);

  const handleMedCheck = useCallback(async (
    record: PatientRecord, scheduleIdx: number, time: MedicationTime, checked: boolean
  ) => {
    const key = makeMedTimeKey(time, today);
    const allSchedules = Array.isArray(record.medicationSchedules) ? record.medicationSchedules : [];
    if (checked) await removeMedicationCheck(db, record.id, scheduleIdx, key, allSchedules);
    else await addMedicationCheck(db, record.id, scheduleIdx, key, allSchedules, userData?.name);
  }, [today, userData?.name]);

  const handleSkipDate = useCallback(async (
    record: PatientRecord, scheduleIdx: number, isSkip: boolean
  ) => {
    const allSchedules = Array.isArray(record.medicationSchedules) ? record.medicationSchedules : [];
    if (isSkip) await removeSkipDate(db, record.id, scheduleIdx, today, allSchedules);
    else await addSkipDate(db, record.id, scheduleIdx, today, allSchedules);
  }, [today]);

  const handleAddMedicationSchedule = useCallback(async (
    record: PatientRecord, schedule: Omit<MedicationSchedule, 'checkedTimes'>
  ) => {
    await addMedicationSchedule(db, record.id, schedule);
  }, []);

  /** 특정 약 스케줄에 사진 업로드 후 URL 저장 */
  const handleUploadMedicationPhoto = useCallback(async (
    record: PatientRecord, scheduleIdx: number, file: File
  ): Promise<string> => {
    const path = `patientRecords/${record.id}/prescriptions/${scheduleIdx}_${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    const all = Array.isArray(record.medicationSchedules) ? record.medicationSchedules : [];
    await addMedicationPhoto(db, record.id, all, scheduleIdx, url);
    return url;
  }, []);

  /** 특정 약 스케줄에서 사진 삭제 */
  const handleRemoveMedicationPhoto = useCallback(async (
    record: PatientRecord, scheduleIdx: number, photoUrl: string
  ) => {
    try {
      await deleteObject(ref(storage, photoUrl));
    } catch { /* 이미 없어도 무시 */ }
    const all = Array.isArray(record.medicationSchedules) ? record.medicationSchedules : [];
    await removeMedicationPhoto(db, record.id, all, scheduleIdx, photoUrl);
  }, []);

  const handleUpdateMedicationSchedule = useCallback(async (
    record: PatientRecord, index: number, schedule: Omit<MedicationSchedule, 'checkedTimes'>
  ) => {
    const all = Array.isArray(record.medicationSchedules) ? record.medicationSchedules : [];
    await updateMedicationSchedule(db, record.id, all, index, schedule);
  }, []);

  const handleRemoveMedicationSchedule = useCallback(async (
    record: PatientRecord, index: number
  ) => {
    const all = Array.isArray(record.medicationSchedules) ? record.medicationSchedules : [];
    await removeMedicationSchedule(db, record.id, all, index);
  }, []);

  // 격리 주기 체크 스케줄 추가
  const handleAddIsolationCheckSchedule = useCallback(async (record: PatientRecord, minutesLater: number) => {
    if (!userData) return;
    const now = new Date();
    now.setMinutes(now.getMinutes() + minutesLater);
    const schedule: IsolationCheckSchedule = {
      id: Date.now().toString(),
      scheduledAt: Timestamp.fromDate(now),
      checkedBy: undefined,
    };
    await addIsolationCheckSchedule(db, record.id, schedule);
  }, [userData]);

  // 격리 체크 완료 처리
  const handleCompleteIsolationCheck = useCallback(async (
    record: PatientRecord, scheduleId: string, temperature?: number, status?: IsolationCheckSchedule['status'], note?: string
  ) => {
    if (!userData) return;
    const updated = (record.isolationCheckSchedules ?? []).map(s =>
      s.id === scheduleId
        ? { ...s, completedAt: Timestamp.now(), checkedBy: userData.name, temperature, status, note }
        : s
    );
    await completeIsolationCheckSchedule(db, record.id, updated);
  }, [userData]);

  // 복귀 판단 기준 체크 (일반 환자에도 적용)
  const handleReturnCriteriaCheck = useCallback(async (record: PatientRecord, idx: number, val: boolean) => {
    const current = record.returnCriteriaChecks ?? [false, false, false];
    const updated = [...current];
    updated[idx] = val;
    await updateReturnCriteriaChecks(db, record.id, updated);
    // 모든 기준 충족 시 경과 → 중간보고(호전 중)
    if (updated.every(Boolean) && userData && record.progressStatus !== '완치') {
      await updateProgressStatus(db, record.id, '중간보고', userData.name, '복귀 기준 모두 충족');
    }
  }, [userData]);

  // ── 매니저 액션 핸들러 ────────────────────────────────────────
  const handleAssignIsolation = useCallback(async (
    record: PatientRecord,
    assigneeId: string,
    assigneeName: string
  ) => {
    await updatePatientRecord(db, record.id, {
      isolationAssigneeId: assigneeId,
      isolationAssigneeName: assigneeName,
    });
  }, []);

  const handleAddManagerAction = useCallback(async (
    record: PatientRecord,
    action: Omit<ManagerAction, 'id' | 'isDone' | 'response'>
  ) => {
    await addManagerAction(db, record.id, action);
  }, []);

  const handleRespondManagerAction = useCallback(async (
    record: PatientRecord,
    actionId: string,
    response: { medicationName?: string; medicationTime?: string; currentLocation?: string; note?: string; respondedBy?: string }
  ) => {
    const allActions = record.managerActions ?? [];
    await respondManagerAction(db, record.id, actionId, { ...response, respondedBy: response.respondedBy ?? userData?.name ?? '' }, userData?.name ?? '', allActions);
  }, [userData?.name]);

  const handleCompleteManagerAction = useCallback(async (
    record: PatientRecord,
    actionId: string
  ) => {
    const allActions = record.managerActions ?? [];
    await completeManagerAction(db, record.id, actionId, allActions);
  }, []);

  const handleUpdateManagerActionFollowUp = useCallback(async (
    record: PatientRecord,
    actionId: string,
    followUp: NonNullable<ManagerAction['followUp']>
  ) => {
    const allActions = record.managerActions ?? [];
    await updateManagerActionFollowUp(db, record.id, actionId, followUp, allActions);
  }, []);

  const handleIsolationCheck = useCallback(async (record: PatientRecord, idx: number, val: boolean) => {
    const current = record.isolationReturnChecks ?? [false, false, false];
    const updated = [...current];
    updated[idx] = val;
    await updateIsolationReturnChecks(db, record.id, updated);
    if (updated.every(Boolean) && userData) {
      await updateProgressStatus(db, record.id, '중간보고', userData.name);
    }
  }, [userData]);

  if (!activeJobCodeId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
        <p className="text-gray-600 font-medium">활성 캠프를 선택해주세요.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-200 px-4 pt-0 pb-0">

        {/* ── 대탭: 환자 현황 / 약복용명단 ── 제목보다 위에 위치 */}
        <div className="flex border-b border-gray-100 -mx-4 px-4">
          {(['환자 현황', '약복용명단'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setMainTab(tab)}
              className={`relative flex-1 py-2.5 text-sm font-semibold transition-colors ${
                mainTab === tab
                  ? 'text-red-600 border-b-2 border-red-500 -mb-px'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab}
              {tab === '약복용명단' && medicationRecords.length > 0 && (
                <span className="absolute top-1.5 right-2 min-w-[16px] h-4 rounded-full bg-orange-400 text-white text-[9px] font-bold flex items-center justify-center px-1">
                  {medicationRecords.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── 탭별 서브헤더 ── */}
        {mainTab === '환자 현황' ? (
          <div className="flex items-start justify-between py-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-gray-900">환자 관리</h1>
                {myPendingCount > 0 && (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                    {myPendingCount}
                  </span>
                )}
              </div>
              {/* 현황 뱃지 */}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {counts.최초보고 > 0 && <StatusPill label="최초보고" count={counts.최초보고} color="gray" />}
                {counts.중간보고 > 0 && <StatusPill label="중간보고" count={counts.중간보고} color="blue" />}
                {counts.내원예정 > 0 && <StatusPill label="내원예정" count={counts.내원예정} color="red" />}
                {counts.격리 > 0 && <StatusPill label="격리" count={counts.격리} color="purple" />}
                {counts.active === 0 && <span className="text-xs text-gray-400">현재 환자 없음</span>}
              </div>
            </div>
            <button
              onClick={() => setShowQuickReport(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-lg transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              최초보고
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between py-3">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">약복용명단</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {medicationRecords.length > 0 ? `총 ${medicationRecords.length}명 복용 중` : '복용 중인 학생 없음'}
              </p>
            </div>
            <button
              disabled
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-400 text-sm font-bold rounded-lg flex-shrink-0 cursor-not-allowed"
              title="준비 중"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              명단추가
            </button>
          </div>
        )}
      </div>

      {/* 검색 (환자 현황 탭만) */}
      {mainTab === '환자 현황' && (
        <div className="bg-white border-b border-gray-100 px-4 py-2">
          <div className="flex items-center bg-gray-100 rounded-full px-3 py-1.5">
            <svg className="w-3.5 h-3.5 text-gray-400 mr-2 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="이름·증상·반 검색"
              className="bg-transparent text-xs outline-none w-full text-gray-700 placeholder-gray-400"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-gray-400 hover:text-gray-600 ml-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-4 border-red-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : mainTab === '약복용명단' ? (
          /* ── 약복용명단 탭 ── */
          <MedicationListView
            records={medicationRecords}
            today={today}
            currentUserName={userData?.name ?? ''}
            onCheck={(record, si, t, checked) => handleMedCheck(record, si, t, checked)}
          />
        ) : (
          /* ── 현황 탭 ── */
          <div className="p-3 space-y-3">
            {/* 🚗 내원 차량 현황 (내원예정 있을 때만 표시) */}
            <TransportBoard allRecords={records} />

            {/* 😴 휴식 및 격리 현황 */}
            <RestIsolationBoard allRecords={records} />

            {/* 다음 체크 현황 */}
            <NextCheckBoard allRecords={records} currentUserId={userData?.userId ?? ''} currentUserName={userData?.name ?? ''} />

            {/* 현재 환자 (그룹 → 반별) */}
            {activeByClass.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                <p className="text-gray-400 text-sm font-medium">현재 환자가 없습니다.</p>
                <button onClick={() => setShowQuickReport(true)} className="text-sm text-red-500 hover:text-red-600 font-medium">
                  최초보고 하기
                </button>
              </div>
            ) : (
              (() => {
                // 1) 그룹 키 → 반 목록 Map으로 먼저 수집 (중복 그룹 키 방지)
                const groupMap = new Map<string, [string, PatientRecord[]][]>();
                activeByClass.forEach(([className, classRecords]) => {
                  const groupKey = classNameToGroupKey.get(className) ?? '';
                  if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
                  groupMap.get(groupKey)!.push([className, classRecords]);
                });

                // 2) groupOrder 순서대로 정렬 → 미포함 그룹은 뒤로, 그룹 없는 반은 맨 뒤
                const orderedGroups: { key: string; classes: [string, PatientRecord[]][] }[] = [];
                groupOrder.forEach(gk => {
                  if (groupMap.has(gk)) {
                    orderedGroups.push({ key: gk, classes: groupMap.get(gk)! });
                    groupMap.delete(gk);
                  }
                });
                // 남은 그룹 (groupOrder에 없는 것)
                groupMap.forEach((classes, key) => {
                  orderedGroups.push({ key, classes });
                });

                return orderedGroups.map(({ key: groupKey, classes }) => {
                  // 표시명: campGroups 원본명 우선 (예: "Spring"), 없으면 한글 매핑, 없으면 키 그대로
                  const campGroupName = campGroups.find(g => g.name.toLowerCase() === groupKey)?.name;
                  const groupDisplayName = campGroupName ?? GROUP_DISPLAY_NAMES[groupKey] ?? (groupKey || '기타');
                  const bgColor = GROUP_BG_COLORS[groupKey] ?? 'bg-gray-50';
                  const textColor = GROUP_TEXT_COLORS[groupKey] ?? 'text-gray-500';
                  const borderColor = GROUP_BORDER_COLORS[groupKey] ?? 'border-gray-200';
                  const groupTotal = classes.reduce((sum, [, rs]) => sum + rs.length, 0);
                  const hasUrgent = classes.some(([, rs]) => rs.some(r => urgencyScore(r) <= 1));

                  return (
                    <div key={groupKey || 'nogroup'} className={`rounded-xl border overflow-hidden mb-3 ${groupKey ? `${bgColor} ${borderColor}` : 'bg-white border-gray-200'}`}>
                      {/* 그룹 헤더 */}
                      {groupKey && (
                        <div className={`flex items-center gap-2 px-3 py-1.5 border-b ${borderColor}`}>
                          {hasUrgent && <span className="text-[11px]">🚨</span>}
                          <span className={`text-[12px] font-bold ${textColor}`}>{groupDisplayName}</span>
                          <span className={`text-[10px] font-medium ${textColor} opacity-60`}>{groupTotal}명</span>
                        </div>
                      )}
                      {/* 반별 ClassGroup */}
                      <div className="divide-y divide-black/5 px-0">
                        {classes.map(([className, classRecords]) => (
                          <ClassGroup
                            key={className}
                            className={className}
                            records={classRecords}
                            today={today}
                            currentUserId={userData?.id ?? ''}
                            currentUserName={userData?.name ?? ''}
                            currentUserRole={userData?.role}
                            campUsers={campUsers}
                            campGroups={campGroups}
                            allRecords={records}
                            expandedId={expandedId}
                            onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                            onEdit={openEditForm}
                            onDelete={(id, name) => handleDelete(id, name)}
                            onProgressChange={handleProgressChange}
                            onAddProgressLog={handleAddProgressLog}
                            onRemoveProgressLog={handleRemoveProgressLog}
                            onMedCheck={handleMedCheck}
                            onAddMedicationSchedule={handleAddMedicationSchedule}
                            onUpdateMedicationSchedule={handleUpdateMedicationSchedule}
                            onRemoveMedicationSchedule={handleRemoveMedicationSchedule}
                            onUploadMedicationPhoto={handleUploadMedicationPhoto}
                            onRemoveMedicationPhoto={handleRemoveMedicationPhoto}
                            onIsolationCheck={handleIsolationCheck}
                            onManagerCheck={handleManagerCheck}
                            onAddHospitalVisit={handleAddHospitalVisit}
                            onUpdateHospitalVisit={handleUpdateHospitalVisit}
                            onAddIsolationCheckSchedule={handleAddIsolationCheckSchedule}
                            onCompleteIsolationCheck={handleCompleteIsolationCheck}
                            onReturnCriteriaCheck={handleReturnCriteriaCheck}
                            onAssignIsolation={handleAssignIsolation}
                            onAddManagerAction={handleAddManagerAction}
                            onRespondManagerAction={handleRespondManagerAction}
                            onCompleteManagerAction={handleCompleteManagerAction}
                            onUpdateManagerActionFollowUp={handleUpdateManagerActionFollowUp}
                            groupBorderColor={borderColor}
                          />
                        ))}
                      </div>
                    </div>
                  );
                });
              })()
            )}

            {/* 완치 환자 섹션 */}
            {filteredResolved.length > 0 && (
              <div className="mt-2">
                <button
                  onClick={() => setShowResolved(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-semibold text-gray-600">완치 기록</span>
                    <span className="text-xs bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">
                      {filteredResolved.length}
                    </span>
                  </div>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${showResolved ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {showResolved && (
                  <div className="mt-2 space-y-2">
                    {filteredResolved.map(record => (
                      <PatientCard
                        key={record.id}
                        record={record}
                        today={today}
                        currentUserId={userData?.id ?? ''}
                        currentUserName={userData?.name ?? ''}
                        currentUserRole={userData?.role}
                        campUsers={campUsers}
                        campGroups={campGroups}
                        allRecords={records}
                        isExpanded={expandedId === record.id}
                        onToggleExpand={() => setExpandedId(expandedId === record.id ? null : record.id)}
                        onEdit={() => openEditForm(record)}
                        onDelete={() => handleDelete(record.id, record.studentName)}
                        onProgressChange={(s) => handleProgressChange(record, s)}
                        onAddProgressLog={(log) => handleAddProgressLog(record, log)}
                        onRemoveProgressLog={(logIndex) => handleRemoveProgressLog(record, logIndex)}
                        onMedCheck={(si, t, checked) => handleMedCheck(record, si, t, checked)}
                        onAddMedicationSchedule={(s) => handleAddMedicationSchedule(record, s)}
                        onUpdateMedicationSchedule={(idx, s) => handleUpdateMedicationSchedule(record, idx, s)}
                        onRemoveMedicationSchedule={(idx) => handleRemoveMedicationSchedule(record, idx)}
                        onUploadMedicationPhoto={(si, file) => handleUploadMedicationPhoto(record, si, file)}
                        onRemoveMedicationPhoto={(si, url) => handleRemoveMedicationPhoto(record, si, url)}
                        onIsolationCheck={(i, v) => handleIsolationCheck(record, i, v)}
                        onManagerCheck={(memo) => handleManagerCheck(record, memo)}
                        onAddHospitalVisit={() => handleAddHospitalVisit(record)}
                        onUpdateHospitalVisit={(visits) => handleUpdateHospitalVisit(record, visits)}
                        onAddIsolationCheckSchedule={(min) => handleAddIsolationCheckSchedule(record, min)}
                        onCompleteIsolationCheck={(id, temp, status, note) => handleCompleteIsolationCheck(record, id, temp, status, note)}
                        onReturnCriteriaCheck={(i, v) => handleReturnCriteriaCheck(record, i, v)}
                        onAssignIsolation={(aId, aName) => handleAssignIsolation(record, aId, aName)}
                        onAddManagerAction={(action) => handleAddManagerAction(record, action)}
                        onRespondManagerAction={(actionId, resp) => handleRespondManagerAction(record, actionId, resp)}
                        onCompleteManagerAction={(actionId) => handleCompleteManagerAction(record, actionId)}
                        onUpdateManagerActionFollowUp={(actionId, fu) => handleUpdateManagerActionFollowUp(record, actionId, fu)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 최초보고 간소화 모달 */}
      {showQuickReport && (
        <QuickReportModal
          today={today}
          students={students}
          reporterName={userData?.name ?? ''}
          reporterId={userData?.id ?? ''}
          onClose={() => setShowQuickReport(false)}
          onSubmit={async (quickForm) => {
            try {
              if (!campCode) return;
              await addPatientRecord(db, {
                campCode,
                studentId: quickForm.studentId,
                studentName: quickForm.studentName,
                grade: quickForm.grade || undefined,
                className: quickForm.className || undefined,
                classMentor: quickForm.classMentor || undefined,
                unitMentor: quickForm.unitMentor || undefined,
                roomNumber: quickForm.roomNumber || undefined,
                types: quickForm.types,
                symptom: quickForm.symptom,
                treatment: quickForm.treatment,
                temperature: quickForm.temperature ? parseFloat(quickForm.temperature) : undefined,
                fever: quickForm.fever || undefined,
                notes: quickForm.actionNote || undefined,
                locationMode: quickForm.locationMode,
                location: quickForm.location || undefined,
                progressStatus: '최초보고',
                visitDate: Timestamp.now(),
                assigneeName: userData?.name ?? '',
                assigneeId: userData?.id ?? '',
                recordedBy: userData?.name ?? '',
              });
              setShowQuickReport(false);
            } catch (e) {
              console.error('최초보고 제출 오류:', e);
            }
          }}
        />
      )}

      {/* 추가/수정 폼 모달 (상세 수정용) */}
      {showForm && (
        <PatientFormModal
          form={form}
          setForm={setForm}
          editingId={editingId}
          submitting={submitting}
          today={today}
          students={students}
          campUsers={campUsers}
          onClose={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

// ==================== 상태 뱃지 ====================

function StatusPill({ label, count, color }: { label: string; count: number; color: string }) {
  const cls: Record<string, string> = {
    gray:   'bg-gray-100 text-gray-700',
    blue:   'bg-blue-100 text-blue-700',
    yellow: 'bg-yellow-100 text-yellow-800',
    purple: 'bg-purple-100 text-purple-800',
    red:    'bg-red-100 text-red-800',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls[color] ?? cls.gray}`}>
      {label} <span className="font-bold">{count}</span>
    </span>
  );
}

// ==================== 반별 그룹 ====================

interface ClassGroupProps {
  className: string;
  records: PatientRecord[];
  today: string;
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: string;
  groupBorderColor?: string; // 그룹 테두리 색상
  campUsers: User[];
  campGroups: CampGroup[];
  allRecords: PatientRecord[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onEdit: (record: PatientRecord) => void;
  onDelete: (id: string, name: string) => void;
  onProgressChange: (record: PatientRecord, s: ProgressStatus) => void;
  onAddProgressLog: (record: PatientRecord, log: Omit<ProgressLog, 'loggedAt'>) => void;
  onRemoveProgressLog: (record: PatientRecord, logIndex: number) => void;
  onMedCheck: (record: PatientRecord, si: number, t: MedicationTime, checked: boolean) => void;
  onAddMedicationSchedule: (record: PatientRecord, s: Omit<MedicationSchedule, 'checkedTimes'>) => void;
  onUpdateMedicationSchedule: (record: PatientRecord, idx: number, s: Omit<MedicationSchedule, 'checkedTimes'>) => void;
  onRemoveMedicationSchedule: (record: PatientRecord, idx: number) => void;
  onUploadMedicationPhoto: (record: PatientRecord, schedIdx: number, file: File) => Promise<string>;
  onRemoveMedicationPhoto: (record: PatientRecord, schedIdx: number, url: string) => void;
  onIsolationCheck: (record: PatientRecord, i: number, v: boolean) => void;

  onManagerCheck: (record: PatientRecord, memo?: string) => void;
  onAddHospitalVisit: (record: PatientRecord) => void;
  onUpdateHospitalVisit: (record: PatientRecord, visits: HospitalVisitEntry[]) => void;
  onAddIsolationCheckSchedule: (record: PatientRecord, minutesLater: number) => void;
  onCompleteIsolationCheck: (record: PatientRecord, scheduleId: string, temperature?: number, status?: IsolationCheckSchedule['status'], note?: string) => void;
  onReturnCriteriaCheck: (record: PatientRecord, i: number, v: boolean) => void;
  onAssignIsolation: (record: PatientRecord, assigneeId: string, assigneeName: string) => void;
  onAddManagerAction: (record: PatientRecord, action: Omit<ManagerAction, 'id' | 'isDone' | 'response'>) => void;
  onRespondManagerAction: (record: PatientRecord, actionId: string, response: { medicationName?: string; medicationTime?: string; currentLocation?: string; note?: string }) => void;
  onCompleteManagerAction: (record: PatientRecord, actionId: string) => void;
  onUpdateManagerActionFollowUp: (record: PatientRecord, actionId: string, followUp: NonNullable<ManagerAction['followUp']>) => void;
}

function ClassGroup({
  className, records, today, currentUserId, currentUserName, currentUserRole, campUsers, campGroups, allRecords, expandedId, onAddProgressLog, onRemoveProgressLog,
  onToggleExpand, onEdit, onDelete, onProgressChange, onMedCheck,
  onAddMedicationSchedule, onUpdateMedicationSchedule, onRemoveMedicationSchedule,
  onUploadMedicationPhoto, onRemoveMedicationPhoto,
  onIsolationCheck, onManagerCheck, onAddHospitalVisit, onUpdateHospitalVisit,
  onAddIsolationCheckSchedule, onCompleteIsolationCheck, onReturnCriteriaCheck, onAssignIsolation,
  onAddManagerAction, onRespondManagerAction, onCompleteManagerAction, onUpdateManagerActionFollowUp,
  groupBorderColor = 'border-gray-200',
}: ClassGroupProps) {
  // ① 긴급도 ② visitDate 최신순 (visitDate 없을 수 있으므로 방어)
  const sorted = [...records].sort((a, b) => {
    const uDiff = urgencyScore(a) - urgencyScore(b);
    if (uDiff !== 0) return uDiff;
    const aMs = a.visitDate?.toMillis?.() ?? 0;
    const bMs = b.visitDate?.toMillis?.() ?? 0;
    return bMs - aMs;
  });

  const urgentCount = records.filter(r => urgencyScore(r) <= 1).length; // 격리·내원예정
  // 해당 반 담당멘토 (첫 번째 학생 기준)
  const classMentorName = records.find(r => r.classMentor)?.classMentor;

  return (
    <div className="overflow-hidden">
      {/* 반 헤더 */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[13px] font-bold ${urgentCount > 0 ? 'text-red-700' : 'text-gray-700'}`}>
            {fmtClass(className)}
          </span>
          {classMentorName && (
            <span className="text-[10px] text-gray-400">{classMentorName}</span>
          )}
          {urgentCount > 0 && (
            <span className="text-[10px] bg-red-500 text-white font-bold px-1.5 py-0.5 rounded-full">
              🚨 {urgentCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {(PROGRESS_STATUSES.filter(s => s !== '완치')).map(s => {
            const c = records.filter(r => r.progressStatus === s).length;
            if (!c) return null;
            const style = PROGRESS_STYLE[s];
            return (
              <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${style.badge}`}>
                {c}
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 px-2 pb-2 pt-1">
        {sorted.map(record => (
          <PatientCard
            key={record.id}
            record={record}
            today={today}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserRole={currentUserRole}
            campUsers={campUsers}
            campGroups={campGroups}
            allRecords={allRecords}
            isExpanded={expandedId === record.id}
            onToggleExpand={() => onToggleExpand(record.id)}
            onEdit={() => onEdit(record)}
            onDelete={() => onDelete(record.id, record.studentName)}
                        onProgressChange={(s) => onProgressChange(record, s)}
                        onAddProgressLog={(log) => onAddProgressLog(record, log)}
                        onRemoveProgressLog={(logIndex) => onRemoveProgressLog(record, logIndex)}
                        onMedCheck={(si, t, checked) => onMedCheck(record, si, t, checked)}
                        onAddMedicationSchedule={(s) => onAddMedicationSchedule(record, s)}
                        onUpdateMedicationSchedule={(idx, s) => onUpdateMedicationSchedule(record, idx, s)}
                        onRemoveMedicationSchedule={(idx) => onRemoveMedicationSchedule(record, idx)}
                        onUploadMedicationPhoto={(si, file) => onUploadMedicationPhoto(record, si, file)}
                        onRemoveMedicationPhoto={(si, url) => onRemoveMedicationPhoto(record, si, url)}
            onIsolationCheck={(i, v) => onIsolationCheck(record, i, v)}
            onManagerCheck={(memo) => onManagerCheck(record, memo)}
            onAddHospitalVisit={() => onAddHospitalVisit(record)}
            onUpdateHospitalVisit={(visits) => onUpdateHospitalVisit(record, visits)}
            onAddIsolationCheckSchedule={(min) => onAddIsolationCheckSchedule(record, min)}
            onCompleteIsolationCheck={(id, temp, status, note) => onCompleteIsolationCheck(record, id, temp, status, note)}
            onReturnCriteriaCheck={(i, v) => onReturnCriteriaCheck(record, i, v)}
            onAssignIsolation={(aId, aName) => onAssignIsolation(record, aId, aName)}
            onAddManagerAction={(action) => onAddManagerAction(record, action)}
            onRespondManagerAction={(actionId, response) => onRespondManagerAction(record, actionId, response)}
            onCompleteManagerAction={(actionId) => onCompleteManagerAction(record, actionId)}
            onUpdateManagerActionFollowUp={(actionId, followUp) => onUpdateManagerActionFollowUp(record, actionId, followUp)}
            grouped
            groupBorderColor={groupBorderColor}
          />
        ))}
      </div>
    </div>
  );
}

// ==================== 환자 카드 ====================

interface PatientCardProps {
  record: PatientRecord;
  today: string;
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: string;
  campUsers: User[];
  campGroups: CampGroup[];
  allRecords: PatientRecord[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onProgressChange: (s: ProgressStatus) => void;
  onAddProgressLog: (log: Omit<ProgressLog, 'loggedAt'>) => void;
  onRemoveProgressLog: (logIndex: number) => void;
  onMedCheck: (si: number, t: MedicationTime, checked: boolean) => void;
  onAddMedicationSchedule: (s: Omit<MedicationSchedule, 'checkedTimes'>) => void;
  onUpdateMedicationSchedule: (idx: number, s: Omit<MedicationSchedule, 'checkedTimes'>) => void;
  onRemoveMedicationSchedule: (idx: number) => void;
  onUploadMedicationPhoto: (schedIdx: number, file: File) => Promise<string>;
  onRemoveMedicationPhoto: (schedIdx: number, url: string) => void;
  onIsolationCheck: (i: number, v: boolean) => void;
  onManagerCheck: (memo?: string) => void;
  onAddHospitalVisit: () => void;
  onUpdateHospitalVisit: (visits: HospitalVisitEntry[]) => void;
  onAddIsolationCheckSchedule: (minutesLater: number) => void;
  onCompleteIsolationCheck: (scheduleId: string, temperature?: number, status?: IsolationCheckSchedule['status'], note?: string) => void;
  onReturnCriteriaCheck: (i: number, v: boolean) => void;
  onAssignIsolation: (assigneeId: string, assigneeName: string) => void;
  onAddManagerAction: (action: Omit<ManagerAction, 'id' | 'isDone' | 'response'>) => void;
  onRespondManagerAction: (actionId: string, response: { medicationName?: string; medicationTime?: string; currentLocation?: string; note?: string }) => void;
  onCompleteManagerAction: (actionId: string) => void;
  onUpdateManagerActionFollowUp: (actionId: string, followUp: NonNullable<ManagerAction['followUp']>) => void;
  grouped?: boolean;
  groupBorderColor?: string; // 그룹 테두리 색상 (e.g. 'border-yellow-200')
}

type DetailTab = '경과' | '내원' | '복용약' | '부모연락';

function PatientCard({
  record, today, currentUserId, currentUserName, currentUserRole, campUsers, campGroups, allRecords, isExpanded, onToggleExpand,
  onEdit, onDelete, onProgressChange, onAddProgressLog, onRemoveProgressLog, onMedCheck,
  onAddMedicationSchedule, onUpdateMedicationSchedule, onRemoveMedicationSchedule,
  onUploadMedicationPhoto, onRemoveMedicationPhoto,
  onIsolationCheck, onManagerCheck, onAddHospitalVisit, onUpdateHospitalVisit,
  onAddIsolationCheckSchedule, onCompleteIsolationCheck, onReturnCriteriaCheck, onAssignIsolation,
  onAddManagerAction, onRespondManagerAction, onCompleteManagerAction, onUpdateManagerActionFollowUp,
  grouped = false,
  groupBorderColor = 'border-gray-200',
}: PatientCardProps) {
  const progressStyle = PROGRESS_STYLE[record.progressStatus ?? '최초보고'];
  // 담임 또는 유닛이 본인일 때 배경 강조
  const isMyRecord = record.classMentor === currentUserName || record.unitMentor === currentUserName;
  // activeTab이 null이면 닫힌 상태, 값이 있으면 해당 탭이 열린 상태
  const [activeTab, setActiveTab] = useState<DetailTab | null>(null);
  const [managerMemo, setManagerMemo] = useState('');
  const [showMemoInput, setShowMemoInput] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 탭 버튼 클릭: 같은 탭이면 닫고, 다른 탭이면 열기
  const handleTabClick = (tab: DetailTab) => {
    setActiveTab(prev => (prev === tab ? null : tab));
  };

  // 오늘 약 진행률
  const medInfo = useMemo(() => {
    if (!record.medicationSchedules?.length) return null;
    // 현황 탭 뱃지: endDateAuto(상시 복용)는 제외하고 기간제 약만 집계
    const tempSchedules = record.medicationSchedules.filter(s => !s.endDateAuto);
    if (!tempSchedules.length) return null;
    let todayTotal = 0, todayDone = 0, allTotal = 0, allDone = 0;
    tempSchedules.forEach(s => {
      const total = calcTotalDoses(s);
      s.times.forEach(t => {
        if (isInDateRange(s.startDate, s.endDate, today)) {
          todayTotal++;
          if (s.checkedTimes.includes(makeMedTimeKey(t, today))) todayDone++;
        }
      });
      allTotal += total;
      allDone += s.checkedTimes.length;
    });
    return { todayTotal, todayDone, allTotal, allDone };
  }, [record.medicationSchedules, today]);

  const hospitalVisits = record.hospitalVisits ?? [];
  const hasHospital = hospitalVisits.length > 0;
  // 현황 탭 복용약 탭 표시: 기간제 약이 있을 때만
  const hasMed = (record.medicationSchedules ?? []).some(s => !s.endDateAuto);
  const parentContactPending = record.progressStatus !== '완치' && record.parentContactAssigneeName &&
    !(record.parentContactLogs?.some(l => l.isResolved));

  const tabs: DetailTab[] = ['경과', '내원', '복용약', '부모연락'];

  const elapsed = daysElapsed(record.visitDate);
  const elapsedLabel = elapsed === 0 ? '오늘' : elapsed === 1 ? '어제' : `${elapsed}일째`;

  return (
    <div className={
      grouped
        ? `relative overflow-hidden rounded-lg shadow-sm border-l-4 ${isMyRecord ? `bg-blue-50/70 border-y border-r border-gray-100 ${groupBorderColor}` : `bg-white border-y border-r border-gray-100 ${groupBorderColor}`}`
        : `relative bg-white rounded-xl border shadow-sm overflow-hidden ${isMyRecord ? 'border-blue-200' : 'border-gray-200'}`
    }>
      {/* 카드 헤더 */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-shrink-0 mt-1">
          <div className={`w-2.5 h-2.5 rounded-full ${progressStyle.dot}`} />
        </div>
        {/* 삭제 버튼 — 오른쪽 상단 고정 */}
        {showDeleteConfirm ? (
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-white border border-red-200 rounded-xl shadow-lg px-3 py-2">
            <span className="text-[11px] text-red-700 font-semibold">정말 삭제할까요?</span>
            <button onClick={onDelete}
              className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-lg transition-colors">
              삭제
            </button>
            <button onClick={() => setShowDeleteConfirm(false)}
              className="text-[10px] text-gray-500 hover:text-gray-700 px-2 py-1">
              취소
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="absolute top-2 right-2 z-10 text-[10px] text-gray-300 hover:text-red-400 transition-colors px-1.5 py-0.5 rounded hover:bg-red-50"
            title="기록 삭제"
          >
            🗑️
          </button>
        )}

        <div className="flex-1 min-w-0">
          {/* 1행: 이름 + 학년 + 반 + 담임/유닛뱃지 + 방 + 내담당/매니저 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-gray-900">{record.studentName}</span>
            {record.grade && <span className="text-xs text-gray-400">{record.grade}</span>}
            {record.className && (
              <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{fmtClass(record.className)}</span>
            )}
            {record.classMentor && (
              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">담임 {record.classMentor}</span>
            )}
            {record.unitMentor && (
              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">유닛 {record.unitMentor}</span>
            )}
            {record.roomNumber && (
              <span className="text-xs text-gray-400">{record.roomNumber}호</span>
            )}
            {record.managerCheck && (
              <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">✓ 매니저</span>
            )}
          </div>

          {/* 2행: 증상 */}
          <p className="text-xs text-gray-600 mt-0.5 truncate">{record.symptom}</p>

          {/* 3행: 상태 뱃지들 */}
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {(record.types ?? [])
              // 처치전·단순처치는 기본값이므로 카드에서 생략
              .filter(t => t !== '처치전' && t !== '단순처치')
              .map(t => {
                const ts = TYPE_STYLE[t as PatientType] ?? { bg: 'bg-gray-50', text: 'text-gray-600' };
                return (
                  <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${ts.bg} ${ts.text}`}>{t}</span>
                );
              })}
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${progressStyle.badge}`}>
              {record.progressStatus ?? '최초보고'}
            </span>
            {record.temperature != null && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                record.temperature >= 37.5 ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-600'
              }`}>
                {record.temperature}°C
              </span>
            )}
            {record.types.includes('격리') && record.isolationRoom && (
              <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                {record.isolationRoom}호 격리
              </span>
            )}
            {hasHospital && (() => {
              const latestVisit = hospitalVisits[hospitalVisits.length - 1];
              return (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                  HOSPITAL_STATUS_STYLE[latestVisit.hospitalStatus].badge
                }`}>
                  {latestVisit.hospitalStatus}
                </span>
              );
            })()}
            {medInfo && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                medInfo.todayDone === medInfo.todayTotal && medInfo.todayTotal > 0
                  ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
              }`}>
                💊 {medInfo.todayDone}/{medInfo.todayTotal}
              </span>
            )}
            {parentContactPending && (
              <span className="text-[10px] bg-pink-50 text-pink-700 px-1.5 py-0.5 rounded font-medium">
                부모연락↑
              </span>
            )}
          </div>

          {/* 4행: 날짜 + 경과일 */}
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className={`text-[11px] font-semibold ${
              elapsed >= 3 ? 'text-orange-500' : elapsed >= 1 ? 'text-yellow-600' : 'text-gray-400'
            }`}>{elapsedLabel}</span>
            <span className="text-[11px] text-gray-300">·</span>
            <span className="text-[11px] text-gray-400">{formatDate(record.visitDate)}</span>
          </div>
        </div>

      </div>

      {/* 탭 네비게이션 — 항상 노출 */}
      <div className="flex border-t border-gray-100 px-4">
        {tabs.map(tab => {
          const hasAlert =
            (tab === '내원' && hasHospital) ||
            (tab === '복용약' && hasMed) ||
            (tab === '부모연락' && !!parentContactPending);
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => handleTabClick(tab)}
              className={`relative flex-1 py-2 text-[11px] font-semibold transition-colors ${
                isActive
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab}
              {hasAlert && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* 탭 콘텐츠 — activeTab이 있을 때만 */}
      {activeTab !== null && (
        <div className="border-t border-gray-100">
          <div className="px-4 pt-3 pb-4">
            {activeTab === '경과' && (
              <ProgressTab
                record={record}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                onAddProgressLog={onAddProgressLog}
                onRemoveProgressLog={onRemoveProgressLog}
                onManagerCheck={() => {
                  if (record.managerCheck) {
                    onManagerCheck();
                  } else {
                    setShowMemoInput(true);
                  }
                }}
                showMemoInput={showMemoInput}
                managerMemo={managerMemo}
                onMemoChange={setManagerMemo}
                onMemoConfirm={() => {
                  onManagerCheck(managerMemo);
                  setManagerMemo('');
                  setShowMemoInput(false);
                }}
                onMemoCancel={() => { setShowMemoInput(false); setManagerMemo(''); }}
                campUsers={campUsers}
                onIsolationCheck={onIsolationCheck}
                onAddIsolationCheckSchedule={onAddIsolationCheckSchedule}
                onCompleteIsolationCheck={onCompleteIsolationCheck}
                onReturnCriteriaCheck={onReturnCriteriaCheck}
                onAssignIsolation={onAssignIsolation}
                onAddManagerAction={onAddManagerAction}
                onRespondManagerAction={onRespondManagerAction}
                onCompleteManagerAction={onCompleteManagerAction}
                onUpdateManagerActionFollowUp={onUpdateManagerActionFollowUp}
              />
            )}
            {activeTab === '내원' && (
              <HospitalTab
                record={record}
                campUsers={campUsers}
                allRecords={allRecords}
                onAddVisit={onAddHospitalVisit}
                onUpdateVisits={onUpdateHospitalVisit}
              />
            )}
            {activeTab === '복용약' && (
              <MedicationSection
                schedules={record.medicationSchedules ?? []}
                today={today}
                unitMentor={record.unitMentor}
                classMentor={record.classMentor}
                onCheck={onMedCheck}
                onAddSchedule={onAddMedicationSchedule}
                onUpdateSchedule={onUpdateMedicationSchedule}
                onRemoveSchedule={onRemoveMedicationSchedule}
                onUploadMedPhoto={onUploadMedicationPhoto}
                onRemoveMedPhoto={onRemoveMedicationPhoto}
                compact
              />
            )}
            {activeTab === '부모연락' && (
              <ParentContactSection record={record} campUsers={campUsers} campGroups={campGroups} currentUserId={currentUserId} currentUserName={currentUserName} currentUserRole={currentUserRole} />
            )}
          </div>

        </div>
      )}
    </div>
  );
}

// ==================== 경과 탭 ====================

interface ProgressTabProps {
  record: PatientRecord;
  currentUserId: string;
  currentUserName: string;
  campUsers: User[];
  onAddProgressLog: (log: Omit<ProgressLog, 'loggedAt'>) => void;
  onRemoveProgressLog: (logIndex: number) => void;
  onManagerCheck: () => void;
  showMemoInput: boolean;
  managerMemo: string;
  onMemoChange: (v: string) => void;
  onMemoConfirm: () => void;
  onMemoCancel: () => void;
  onIsolationCheck: (i: number, v: boolean) => void;
  onAddIsolationCheckSchedule: (minutesLater: number) => void;
  onCompleteIsolationCheck: (scheduleId: string, temperature?: number, status?: IsolationCheckSchedule['status'], note?: string) => void;
  onReturnCriteriaCheck: (i: number, v: boolean) => void;
  onAssignIsolation: (assigneeId: string, assigneeName: string) => void;
  onAddManagerAction: (action: Omit<ManagerAction, 'id' | 'isDone' | 'response'>) => void;
  onRespondManagerAction: (actionId: string, response: { medicationName?: string; medicationTime?: string; currentLocation?: string; note?: string }) => void;
  onCompleteManagerAction: (actionId: string) => void;
  onUpdateManagerActionFollowUp: (actionId: string, followUp: NonNullable<ManagerAction['followUp']>) => void;
}

const FEVER_OPTIONS = ['정상', '미열', '고열'] as const;
type FeverOption = (typeof FEVER_OPTIONS)[number];

function ProgressTab({
  record, currentUserId, currentUserName, campUsers, onAddProgressLog, onRemoveProgressLog, onManagerCheck,
  showMemoInput, managerMemo, onMemoChange, onMemoConfirm, onMemoCancel, onIsolationCheck,
  onAddIsolationCheckSchedule, onCompleteIsolationCheck, onReturnCriteriaCheck, onAssignIsolation,
  onAddManagerAction, onRespondManagerAction, onCompleteManagerAction, onUpdateManagerActionFollowUp,
}: ProgressTabProps) {
  const [showForm, setShowForm] = useState(false);
  const [logStatus, setLogStatus] = useState<ProgressStatus>('중간보고');
  const [logLocationMode, setLogLocationMode] = useState<LocationMode>('일과중');
  const [logLocation, setLogLocation] = useState('');
  const [logFever, setLogFever] = useState<FeverOption | ''>('');
  const [logFeverDirect, setLogFeverDirect] = useState('');
  const [logSymptom, setLogSymptom] = useState('');
  const [logNote, setLogNote] = useState('');
  // 다음 체크 지정 (중간보고 전용)
  const [nextCheckTime, setNextCheckTime] = useState('');       // "HH:mm" 형태 문자열
  const [nextCheckAssigneeId, setNextCheckAssigneeId] = useState(currentUserId);
  const [nextCheckAssigneeName, setNextCheckAssigneeName] = useState(currentUserName);
  const [nextCheckQuery, setNextCheckQuery] = useState('');    // 담당자 검색어
  const [showNextCheckDropdown, setShowNextCheckDropdown] = useState(false);

  const handleAddLog = () => {
    if (!logStatus) return;
    const feverValue = logFever === '고열' || logFever === '미열' || logFever === '정상'
      ? logFever
      : logFeverDirect || undefined;

    // 다음 체크 Timestamp 변환
    let nextCheckAt: Timestamp | undefined;
    if (logStatus === '중간보고' && nextCheckTime) {
      const [hh, mm] = nextCheckTime.split(':').map(Number);
      const dt = new Date();
      dt.setHours(hh, mm, 0, 0);
      // 지정 시각이 이미 지났으면 내일로
      if (dt < new Date()) dt.setDate(dt.getDate() + 1);
      nextCheckAt = Timestamp.fromDate(dt);
    }

    onAddProgressLog({
      loggedBy: currentUserName,
      status: logStatus,
      locationMode: logStatus !== '완치' ? logLocationMode : undefined,
      location: logLocation || undefined,
      fever: feverValue,
      symptom: logSymptom || undefined,
      note: logNote || undefined,
      nextCheckAt,
      nextCheckAssigneeId: (logStatus === '중간보고' && nextCheckAssigneeId) ? nextCheckAssigneeId : undefined,
      nextCheckAssigneeName: (logStatus === '중간보고' && nextCheckAssigneeName) ? nextCheckAssigneeName : undefined,
    });
    // 폼 초기화
    setShowForm(false);
    setLogLocationMode('일과중');
    setLogLocation('');
    setLogFever('');
    setLogFeverDirect('');
    setLogSymptom('');
    setLogNote('');
    setNextCheckTime('');
    setNextCheckAssigneeId(currentUserId);
    setNextCheckAssigneeName(currentUserName);
    setNextCheckQuery('');
    setShowNextCheckDropdown(false);
  };

  // progressLogs에 최초보고가 없으면 record 자체 정보로 맨 아래(oldest)에 추가해서 표시
  const rawLogs = record.progressLogs ?? [];
  const hasInitialLog = rawLogs.some(l => l.status === '최초보고');
  // notes 필드에 "[위치: 220호] [직접조치] 메모" 형태로 묶인 레거시 데이터를 분리
  const parsedNotes = (() => {
    const raw = record.notes ?? '';
    // location: record.location 우선, 없으면 notes에서 [위치: ...] 파싱
    const locMatch = raw.match(/\[위치:\s*([^\]]+)\]/);
    const location = record.location || (locMatch ? locMatch[1].trim() : undefined);
    // [직접조치], [매니저대기] 등 액션 태그 제거
    const cleanNote = raw
      .replace(/\[위치:[^\]]*\]/g, '')
      .replace(/\[[^\]]+\]/g, '')
      .trim();
    return { location, cleanNote: cleanNote || undefined };
  })();

  const syntheticInitial: ProgressLog | null = !hasInitialLog ? {
    loggedAt: record.visitDate ?? record.createdAt,
    loggedBy: record.recordedBy ?? '',
    status: '최초보고',
    locationMode: record.locationMode,
    location: parsedNotes.location,
    // fever 우선: record.fever('정상'|'미열'|'고열'), 없으면 temperature 수치, 없으면 undefined
    fever: record.fever
      ? record.fever
      : record.temperature != null ? `${record.temperature}` : undefined,
    symptom: record.symptom,
    note: parsedNotes.cleanNote,
  } : null;
  // 오래된 순서 → reverse해서 최신이 위로
  // isSynthetic: 가상 최초보고(삭제 불가), rawIndex: 실제 rawLogs 인덱스(삭제 시 사용)
  type LogEntry = { log: ProgressLog; isSynthetic: boolean; rawIndex: number };
  const allEntries: LogEntry[] = rawLogs.map((log, i) => ({ log, isSynthetic: false, rawIndex: i }));
  if (syntheticInitial) allEntries.push({ log: syntheticInitial, isSynthetic: true, rawIndex: -1 });
  const logs = allEntries.reverse();

  return (
    <div className="space-y-4">
      {/* 경과 타임라인 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-gray-500">경과 기록</p>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50 transition-colors"
            >
              + 보고 추가
            </button>
          )}
        </div>

        {/* 보고 추가 모달 */}
        {showForm && (
          <TabFormModal
            title="경과 보고 추가"
            icon="📋"
            onClose={() => setShowForm(false)}
            onSubmit={handleAddLog}
            submitLabel="기록 추가"
            submitColor={logStatus === '완치' ? 'green' : 'blue'}
          >
            {/* 보고 유형 */}
            <div className="flex gap-1">
              {(PROGRESS_STATUSES as readonly ProgressStatus[])
                .filter(s => s !== '최초보고')
                .map(s => (
                  <button key={s} type="button" onClick={() => setLogStatus(s)}
                    className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                      logStatus === s ? `${PROGRESS_STYLE[s].step} text-white` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}>{s}</button>
                ))}
            </div>

            {logStatus !== '완치' && (
              <>
                <FormRow label="현재 위치">
                  <div className="flex-1 space-y-1.5">
                    {/* 위치 모드 버튼 */}
                    <div className="flex gap-1">
                      {([
                        { id: '일과중' as LocationMode, emoji: '🏃', active: 'bg-blue-500 text-white', inactive: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
                        { id: '휴식'   as LocationMode, emoji: '😴', active: 'bg-amber-400 text-white', inactive: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
                        { id: '격리'   as LocationMode, emoji: '🏠', active: 'bg-purple-500 text-white', inactive: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
                      ] as const).map(opt => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setLogLocationMode(opt.id)}
                          className={`flex items-center gap-0.5 px-2 py-1 rounded text-[11px] font-bold transition-colors ${
                            logLocationMode === opt.id ? opt.active : opt.inactive
                          }`}
                        >
                          {opt.emoji} {opt.id}
                        </button>
                      ))}
                    </div>
                    <input type="text" value={logLocation} onChange={e => setLogLocation(e.target.value)}
                      placeholder={
                        logLocationMode === '휴식' ? '예) 110호, 휴게실' :
                        logLocationMode === '격리' ? '예) 격리실 214호' :
                        '예) 330호, 보건실'
                      }
                      className="w-full text-[11px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-300 bg-white" />
                  </div>
                </FormRow>
                <FormRow label="열감">
                  <div className="flex gap-1 flex-wrap flex-1">
                    {FEVER_OPTIONS.map(f => (
                      <button key={f} type="button"
                        onClick={() => { setLogFever(f === logFever ? '' : f); setLogFeverDirect(''); }}
                        className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                          logFever === f
                            ? f === '고열' ? 'bg-red-500 text-white' : f === '미열' ? 'bg-orange-400 text-white' : 'bg-green-500 text-white'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>{f}</button>
                    ))}
                    <input type="text" value={logFeverDirect}
                      onChange={e => { setLogFeverDirect(e.target.value); setLogFever(''); }}
                      placeholder="직접 입력 (37.8)"
                      className="flex-1 min-w-[70px] text-[11px] border border-gray-200 rounded px-2 py-0.5 outline-none focus:border-blue-300 bg-white" />
                  </div>
                </FormRow>
                <FormRow label="증상">
                  <input type="text" value={logSymptom} onChange={e => setLogSymptom(e.target.value)}
                    placeholder="현재 증상 요약"
                    className="flex-1 text-[11px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-300 bg-white" />
                </FormRow>
              </>
            )}

            {logStatus === '중간보고' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-1.5">
                <p className="text-[10px] font-bold text-amber-700">⏰ 다음 체크 지정</p>
                <FormRow label="체크 시간">
                  <input type="text" inputMode="numeric" value={nextCheckTime}
                    onChange={e => { const raw = e.target.value.replace(/\D/g, '').slice(0, 4); setNextCheckTime(raw.length >= 3 ? raw.slice(0, 2) + ':' + raw.slice(2) : raw); }}
                    placeholder="1430 → 14:30"
                    className="flex-1 text-[11px] border border-amber-200 rounded px-2 py-1 outline-none focus:border-amber-400 bg-white" />
                </FormRow>
                <FormRow label="담당자">
                  <div className="relative flex-1">
                    <input type="text" value={nextCheckQuery}
                      onChange={e => { setNextCheckQuery(e.target.value); setShowNextCheckDropdown(true); }}
                      onFocus={() => setShowNextCheckDropdown(true)}
                      onBlur={() => setTimeout(() => setShowNextCheckDropdown(false), 150)}
                      placeholder={nextCheckAssigneeName || '이름 검색'}
                      className="w-full text-[11px] border border-amber-200 rounded px-2 py-1 outline-none focus:border-amber-400 bg-white" />
                    {nextCheckAssigneeName && !nextCheckQuery && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-amber-700 font-semibold pointer-events-none">✓ {nextCheckAssigneeName}</span>
                    )}
                    {showNextCheckDropdown && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-white border border-amber-200 rounded shadow-lg max-h-32 overflow-y-auto">
                        {[{ userId: currentUserId, name: currentUserName }, ...campUsers.filter(u => u.userId !== currentUserId)]
                          .filter(u => !nextCheckQuery || u.name.includes(nextCheckQuery))
                          .map(u => (
                            <button key={u.userId} type="button"
                              onMouseDown={() => { setNextCheckAssigneeId(u.userId); setNextCheckAssigneeName(u.name); setNextCheckQuery(''); setShowNextCheckDropdown(false); }}
                              className={`w-full text-left px-2 py-1 text-[11px] hover:bg-amber-50 ${nextCheckAssigneeId === u.userId ? 'font-bold text-amber-700' : 'text-gray-700'}`}
                            >{u.name}{u.userId === currentUserId ? ' (나)' : ''}</button>
                          ))}
                      </div>
                    )}
                  </div>
                </FormRow>
              </div>
            )}

            <FormRow label="메모">
              <input type="text" value={logNote} onChange={e => setLogNote(e.target.value)}
                placeholder={logStatus === '완치' ? '완치 메모 (선택)' : '추가 메모 (선택)'}
                className="flex-1 text-[11px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-300 bg-white" />
            </FormRow>
          </TabFormModal>
        )}

        {/* 타임라인 */}
        {logs.length === 0 ? (
          <p className="text-[11px] text-gray-400 text-center py-3">경과 기록이 없습니다.</p>
        ) : (
          <div className="relative pl-4">
            {/* 세로 타임라인 선 */}
            <div className="absolute left-1.5 top-2 bottom-2 w-px bg-gray-200" />
            <div className="space-y-3">
              {logs.map(({ log, isSynthetic, rawIndex }, i) => {
                const style = PROGRESS_STYLE[log.status] ?? PROGRESS_STYLE['중간보고'];

                // 다음 체크 시간 계산
                const nextCheckDate = log.nextCheckAt?.toDate();
                const nowMs = Date.now();
                let nextCheckLabel = '';
                let nextCheckOverdue = false;
                if (nextCheckDate) {
                  const diffMs = nextCheckDate.getTime() - nowMs;
                  const diffMin = Math.round(diffMs / 60000);
                  if (diffMs < 0) {
                    nextCheckOverdue = true;
                    const overdueMin = Math.abs(diffMin);
                    nextCheckLabel = overdueMin < 60
                      ? `${overdueMin}분 지남`
                      : `${Math.floor(overdueMin / 60)}시간 ${overdueMin % 60}분 지남`;
                  } else if (diffMin < 60) {
                    nextCheckLabel = `${diffMin}분 후`;
                  } else {
                    const h = String(nextCheckDate.getHours()).padStart(2, '0');
                    const m = String(nextCheckDate.getMinutes()).padStart(2, '0');
                    nextCheckLabel = `${h}:${m}`;
                  }
                }

                return (
                  <div key={i} className="relative">
                    {/* 점 */}
                    <div className={`absolute -left-2.5 top-1.5 w-2 h-2 rounded-full ${style.dot} ring-2 ring-white`} />
                    <div className={`rounded-lg border ${style.line} bg-white p-2.5 space-y-1`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${style.badge}`}>{log.status}</span>
                        <span className="text-[10px] text-gray-500">{log.loggedBy}</span>
                        <span className="text-[10px] text-gray-400">{formatDate(log.loggedAt)}</span>
                        {/* 가상 최초보고(isSynthetic)는 삭제 불가, 실제 로그는 모두 삭제 가능 */}
                        {!isSynthetic && (
                          <button
                            onClick={() => onRemoveProgressLog(rawIndex)}
                            className="ml-auto text-[10px] text-gray-300 hover:text-red-400 transition-colors px-1"
                            title="이 기록 삭제"
                          >🗑️</button>
                        )}
                      </div>
                      {(log.locationMode || log.location || log.fever || log.symptom) && (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
                          {log.locationMode && (
                            <span className={`font-semibold ${
                              log.locationMode === '격리' ? 'text-purple-600' :
                              log.locationMode === '휴식' ? 'text-amber-600' :
                              'text-blue-600'
                            }`}>
                              {log.locationMode === '격리' ? '🏠' : log.locationMode === '휴식' ? '😴' : '🏃'} {log.locationMode}
                            </span>
                          )}
                          {log.location && <span className="text-gray-500">📍 {log.location}</span>}
                          {log.fever && (
                            <span className={
                              log.fever === '고열' ? 'text-red-600 font-semibold' :
                              log.fever === '미열' ? 'text-orange-500 font-semibold' :
                              log.fever === '정상' ? 'text-green-600' : 'text-orange-500'
                            }>🌡 {log.fever}{/^\d/.test(log.fever) ? '℃' : ''}</span>
                          )}
                          {log.symptom && <span className="text-gray-600">{log.symptom}</span>}
                        </div>
                      )}
                      {log.note && <p className="text-[11px] text-gray-500 italic">{log.note}</p>}

                      {/* 다음 체크 정보 */}
                      {(log.nextCheckAt || log.nextCheckAssigneeName) && (
                        <div className={`mt-1.5 flex items-center gap-1.5 rounded-md px-2 py-1 ${
                          nextCheckOverdue ? 'bg-red-50 border border-red-200' : 'bg-amber-50 border border-amber-200'
                        }`}>
                          <span className="text-[10px]">⏰</span>
                          <span className={`text-[10px] font-bold ${nextCheckOverdue ? 'text-red-600' : 'text-amber-700'}`}>
                            다음 체크
                          </span>
                          {nextCheckLabel && (
                            <span className={`text-[10px] ${nextCheckOverdue ? 'text-red-500' : 'text-amber-600'}`}>
                              {nextCheckLabel}
                            </span>
                          )}
                          {log.nextCheckAssigneeName && (
                            <span className={`text-[10px] font-semibold ml-auto ${nextCheckOverdue ? 'text-red-600' : 'text-amber-700'}`}>
                              → {log.nextCheckAssigneeName}
                            </span>
                          )}
                          {nextCheckOverdue && (
                            <span className="text-[9px] font-bold text-red-500 bg-red-100 px-1 py-0.5 rounded ml-1">누락주의</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 격리 환자: 주기 체크 스케줄 + 복귀 기준 */}
      {record.types.includes('격리') && (
        <IsolationManageSection
          record={record}
          campUsers={campUsers}
          onIsolationCheck={onIsolationCheck}
          onAddSchedule={onAddIsolationCheckSchedule}
          onCompleteSchedule={onCompleteIsolationCheck}
          onAssignIsolation={onAssignIsolation}
        />
      )}

      {/* 복귀 판단 기준 (모든 환자) */}
      <ReturnCriteriaSection
        record={record}
        onReturnCriteriaCheck={onReturnCriteriaCheck}
      />

      {/* 매니저 액션 패널 */}
      <ManagerActionPanel
        record={record}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        onAddAction={onAddManagerAction}
        onRespond={onRespondManagerAction}
        onComplete={onCompleteManagerAction}
        onFollowUp={onUpdateManagerActionFollowUp}
      />

    </div>
  );
}

// ==================== 매니저 액션 패널 ====================

/**
 * 매니저: 지시 버튼 → 유저: 수행 응답 → 매니저: 후속조치 결정
 * 역할 구분: 매니저(issuedById)는 버튼 발행, 담당자(assigneeId)는 응답
 */
function ManagerActionPanel({
  record, currentUserId, currentUserName, onAddAction, onRespond, onComplete, onFollowUp,
}: {
  record: PatientRecord;
  currentUserId: string;
  currentUserName: string;
  onAddAction: (action: Omit<ManagerAction, 'id' | 'isDone' | 'response'>) => void;
  onRespond: (actionId: string, response: { medicationName?: string; medicationTime?: string; currentLocation?: string; note?: string }) => void;
  onComplete: (actionId: string) => void;
  onFollowUp: (actionId: string, followUp: NonNullable<ManagerAction['followUp']>) => void;
}) {
  const [showIssuePicker, setShowIssuePicker] = useState(false);
  const [issuingType, setIssuingType] = useState<ManagerActionType | null>(null);
  const [medName, setMedName] = useState('');
  const [medTime, setMedTime] = useState('');
  const [meetingPlace, setMeetingPlace] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  // 응답 폼 상태
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [respMedName, setRespMedName] = useState('');
  const [respMedTime, setRespMedTime] = useState('');
  const [respLocation, setRespLocation] = useState('');
  const [respNote, setRespNote] = useState('');

  // 후속조치 폼 상태
  const [followUpId, setFollowUpId] = useState<string | null>(null);
  const [fuHospitalize, setFuHospitalize] = useState(false);
  const [fuNextTime, setFuNextTime] = useState('');
  const [fuNextAssignee, setFuNextAssignee] = useState('');
  const [fuNote, setFuNote] = useState('');

  const actions = record.managerActions ?? [];
  const pendingActions = actions.filter(a => !a.isDone);
  const doneActions = actions.filter(a => a.isDone);
  const isAssignee = record.assigneeId === currentUserId; // 담당자(유저)
  // 매니저: issuedById가 나인 액션이 있거나, 아직 아무도 발행 안 한 상태면 발행 가능
  const canIssue = !isAssignee || actions.length === 0;

  const now = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const handleIssue = () => {
    if (!issuingType) return;
    onAddAction({
      actionType: issuingType,
      issuedAt: Timestamp.now(),
      issuedBy: currentUserName,
      issuedById: currentUserId,
      medicationName: issuingType === 'medication' ? medName : undefined,
      medicationScheduledTime: issuingType === 'medication' ? medTime : undefined,
      meetingPlace: (issuingType === 'visit' || issuingType === 'escort') ? meetingPlace : undefined,
      scheduledTime: (issuingType === 'visit' || issuingType === 'escort') ? scheduledTime : undefined,
    });
    setIssuingType(null);
    setMedName(''); setMedTime(''); setMeetingPlace(''); setScheduledTime('');
    setShowIssuePicker(false);
  };

  const handleRespond = (actionId: string) => {
    onRespond(actionId, {
      medicationName: respMedName || undefined,
      medicationTime: respMedTime || undefined,
      currentLocation: respLocation || undefined,
      note: respNote || undefined,
    });
    setRespondingId(null);
    setRespMedName(''); setRespMedTime(''); setRespLocation(''); setRespNote('');
  };

  const handleFollowUp = (actionId: string) => {
    onFollowUp(actionId, {
      hospitalize: fuHospitalize,
      nextCheckAt: fuNextTime || undefined,
      nextCheckAssignee: fuNextAssignee || undefined,
      note: fuNote || undefined,
    });
    setFollowUpId(null);
    setFuHospitalize(false); setFuNextTime(''); setFuNextAssignee(''); setFuNote('');
  };

  const ACTION_CONFIG: Record<ManagerActionType, {
    color: string; border: string; bg: string; textColor: string;
    desc: (a: ManagerAction) => string;
    needsResponse: boolean;
  }> = {
    medication: {
      color: 'bg-green-500', border: 'border-green-200', bg: 'bg-green-50', textColor: 'text-green-800',
      desc: (a) => a.medicationName
        ? `${a.medicationName}${a.medicationScheduledTime ? ` (${a.medicationScheduledTime})` : ''} 복용하세요`
        : '약 복용하세요',
      needsResponse: true,
    },
    call: {
      color: 'bg-blue-500', border: 'border-blue-200', bg: 'bg-blue-50', textColor: 'text-blue-800',
      desc: () => '전화할게요 — 대기해주세요',
      needsResponse: false,
    },
    visit: {
      color: 'bg-purple-500', border: 'border-purple-200', bg: 'bg-purple-50', textColor: 'text-purple-800',
      desc: (a) => `직접 확인하러 갈게요${a.scheduledTime ? ` (${a.scheduledTime}까지)` : ''}${a.meetingPlace ? ` — ${a.meetingPlace}` : ''} — 현 위치 알려주세요`,
      needsResponse: true,
    },
    escort: {
      color: 'bg-orange-500', border: 'border-orange-200', bg: 'bg-orange-50', textColor: 'text-orange-800',
      desc: (a) => `${a.meetingPlace ? `${a.meetingPlace}으로` : ''} 데리러 갈게요${a.scheduledTime ? ` (${a.scheduledTime})` : ''} — 현 위치 알려주세요`,
      needsResponse: true,
    },
    confirmed: {
      color: 'bg-gray-500', border: 'border-gray-200', bg: 'bg-gray-50', textColor: 'text-gray-800',
      desc: () => '현장 직접 확인 완료',
      needsResponse: false,
    },
  };

  return (
    <div className="space-y-2">
      {/* 진행 중인 액션 */}
      {pendingActions.map(action => {
        const cfg = ACTION_CONFIG[action.actionType];
        const isIssuer = action.issuedById === currentUserId;
        const isMyTurn = isAssignee && !action.response && cfg.needsResponse;
        const waitingResponse = isIssuer && !action.response && cfg.needsResponse;
        const responseReceived = !!action.response;

        return (
          <div key={action.id} className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}>
            {/* 액션 헤더 */}
            <div className="flex items-start gap-2.5 p-3">
              <span className={`mt-0.5 w-7 h-7 rounded-full ${cfg.color} text-white flex items-center justify-center text-base flex-shrink-0`}>
                {action.actionType === 'medication' ? '💊' : action.actionType === 'call' ? '📞' : action.actionType === 'visit' ? '🚶' : action.actionType === 'escort' ? '🚌' : '✅'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-bold ${cfg.textColor}`}>{cfg.desc(action)}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{action.issuedBy} · {formatDate(action.issuedAt)}</p>
              </div>
              {/* 매니저: 직접 완료 처리 */}
              {isIssuer && !cfg.needsResponse && (
                <button
                  onClick={() => onComplete(action.id)}
                  className="text-[10px] bg-white border border-gray-200 text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-50"
                >완료</button>
              )}
            </div>

            {/* 담당자: 응답 대기 → 응답 버튼 */}
            {isMyTurn && respondingId !== action.id && (
              <div className="px-3 pb-3">
                <button
                  onClick={() => { setRespondingId(action.id); setRespMedTime(now()); }}
                  className={`w-full py-2 text-xs font-bold text-white rounded-lg ${cfg.color} hover:opacity-90`}
                >
                  {action.actionType === 'medication' ? '✓ 복용 완료 보고' : '📍 현재 위치 전송'}
                </button>
              </div>
            )}

            {/* 담당자 응답 폼 */}
            {isMyTurn && respondingId === action.id && (
              <div className="px-3 pb-3 space-y-2 border-t border-white/50 pt-2">
                {action.actionType === 'medication' && (
                  <>
                    <input value={respMedName} onChange={e => setRespMedName(e.target.value)}
                      placeholder="복용한 약 이름" className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none" />
                    <input type="time" value={respMedTime} onChange={e => setRespMedTime(e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none" />
                  </>
                )}
                {(action.actionType === 'visit' || action.actionType === 'escort') && (
                  <input value={respLocation} onChange={e => setRespLocation(e.target.value)}
                    placeholder="현재 위치 (예: 207호, 운동장)" className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none" />
                )}
                <input value={respNote} onChange={e => setRespNote(e.target.value)}
                  placeholder="추가 메모 (선택)" className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none" />
                <div className="flex gap-2">
                  <button onClick={() => setRespondingId(null)}
                    className="flex-1 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg">취소</button>
                  <button onClick={() => handleRespond(action.id)}
                    className={`flex-1 py-1.5 text-xs text-white font-bold rounded-lg ${cfg.color}`}>전송</button>
                </div>
              </div>
            )}

            {/* 응답 수신 표시 + 매니저 후속조치 */}
            {responseReceived && (
              <div className="px-3 pb-3 border-t border-white/50 pt-2 space-y-2">
                <div className="bg-white rounded-lg p-2 space-y-0.5">
                  <p className="text-[10px] font-bold text-gray-700">✓ {action.response!.respondedBy} 응답</p>
                  {action.response!.medicationName && (
                    <p className="text-[10px] text-gray-600">💊 {action.response!.medicationName} {action.response!.medicationTime && `(${action.response!.medicationTime})`}</p>
                  )}
                  {action.response!.currentLocation && (
                    <p className="text-[10px] text-gray-600">📍 {action.response!.currentLocation}</p>
                  )}
                  {action.response!.note && (
                    <p className="text-[10px] text-gray-500">{action.response!.note}</p>
                  )}
                </div>

                {/* 매니저: 후속조치 결정 */}
                {isIssuer && followUpId !== action.id && (
                  <button
                    onClick={() => setFollowUpId(action.id)}
                    className="w-full py-1.5 text-[11px] font-bold text-white bg-indigo-500 rounded-lg hover:bg-indigo-600"
                  >후속조치 결정 →</button>
                )}

                {isIssuer && followUpId === action.id && (
                  <div className="bg-white rounded-lg p-2.5 space-y-2 border border-indigo-100">
                    <p className="text-[11px] font-bold text-indigo-800">후속조치 결정</p>

                    {/* 내원 여부 */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => setFuHospitalize(false)}
                        className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg border ${!fuHospitalize ? 'bg-green-500 text-white border-transparent' : 'bg-white text-gray-500 border-gray-200'}`}
                      >내원 불필요</button>
                      <button
                        onClick={() => setFuHospitalize(true)}
                        className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg border ${fuHospitalize ? 'bg-red-500 text-white border-transparent' : 'bg-white text-gray-500 border-gray-200'}`}
                      >내원 필요</button>
                    </div>

                    {/* 다음 체크 시간 */}
                    <div className="flex gap-2 items-center">
                      <label className="text-[10px] text-gray-500 whitespace-nowrap">다음 체크</label>
                      <input type="time" value={fuNextTime} onChange={e => setFuNextTime(e.target.value)}
                        className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none" />
                    </div>

                    {/* 다음 체크 담당자 */}
                    <input value={fuNextAssignee} onChange={e => setFuNextAssignee(e.target.value)}
                      placeholder="다음 체크 담당자 (선택)" className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none" />

                    {/* 메모 */}
                    <textarea value={fuNote} onChange={e => setFuNote(e.target.value)}
                      placeholder="지시 사항 메모" rows={2}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none resize-none" />

                    <div className="flex gap-2">
                      <button onClick={() => setFollowUpId(null)}
                        className="flex-1 py-1.5 text-xs text-gray-500 bg-gray-100 rounded-lg">취소</button>
                      <button onClick={() => handleFollowUp(action.id)}
                        className="flex-1 py-1.5 text-xs font-bold text-white bg-indigo-500 rounded-lg">결정 완료</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 매니저: 응답 불필요 액션도 응답 대기 표시 */}
            {waitingResponse && (
              <div className="px-3 pb-3">
                <p className="text-[10px] text-gray-500 text-center animate-pulse">담당자 응답 대기 중...</p>
              </div>
            )}
          </div>
        );
      })}

      {/* 매니저 액션 발행 버튼 */}
      {!isAssignee && (
        <div>
          {!showIssuePicker ? (
            <button
              onClick={() => setShowIssuePicker(true)}
              className="w-full py-2 text-[11px] font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl border border-dashed border-gray-300 transition-colors"
            >
              + 담당자에게 지시 보내기
            </button>
          ) : issuingType === null ? (
            <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-700">지시 유형 선택</p>
                <button onClick={() => setShowIssuePicker(false)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
              </div>
              <div className="grid grid-cols-1 gap-1.5">
                {MANAGER_ACTION_TYPES.map(type => (
                  <button
                    key={type}
                    onClick={() => setIssuingType(type)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50 text-left transition-colors"
                  >
                    <span className="text-base">
                      {type === 'medication' ? '💊' : type === 'call' ? '📞' : type === 'visit' ? '🚶' : type === 'escort' ? '🚌' : '✅'}
                    </span>
                    <span className="text-xs font-medium text-gray-700">{MANAGER_ACTION_LABELS[type]}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-blue-800">{MANAGER_ACTION_LABELS[issuingType]}</p>
                <button onClick={() => setIssuingType(null)} className="text-blue-400 hover:text-blue-600 text-xs">← 뒤로</button>
              </div>

              {issuingType === 'medication' && (
                <>
                  <input value={medName} onChange={e => setMedName(e.target.value)}
                    placeholder="약 이름 (예: 타이레놀)" className="w-full text-xs border border-blue-200 rounded-lg px-2.5 py-1.5 outline-none bg-white" />
                  <div className="flex gap-2 items-center">
                    <label className="text-[10px] text-blue-700 whitespace-nowrap">복용 시각</label>
                    <input type="time" value={medTime} onChange={e => setMedTime(e.target.value)}
                      className="flex-1 text-xs border border-blue-200 rounded-lg px-2 py-1 outline-none bg-white" />
                  </div>
                </>
              )}

              {(issuingType === 'visit' || issuingType === 'escort') && (
                <>
                  <input value={meetingPlace} onChange={e => setMeetingPlace(e.target.value)}
                    placeholder={issuingType === 'visit' ? '현재 위치 (어디 있나요?)' : '장소 (어디로 데리러 갈까요?)'}
                    className="w-full text-xs border border-blue-200 rounded-lg px-2.5 py-1.5 outline-none bg-white" />
                  <div className="flex gap-2 items-center">
                    <label className="text-[10px] text-blue-700 whitespace-nowrap">도착 시각</label>
                    <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
                      className="flex-1 text-xs border border-blue-200 rounded-lg px-2 py-1 outline-none bg-white" />
                  </div>
                </>
              )}

              {issuingType === 'call' && (
                <p className="text-[10px] text-blue-600">지시를 전송하면 담당자에게 전화 대기 알림이 갑니다.</p>
              )}
              {issuingType === 'confirmed' && (
                <p className="text-[10px] text-blue-600">현장에서 직접 확인했음을 기록합니다.</p>
              )}

              <div className="flex gap-2">
                <button onClick={() => setShowIssuePicker(false)}
                  className="flex-1 py-1.5 text-xs text-gray-500 bg-white border border-gray-200 rounded-lg">취소</button>
                <button onClick={handleIssue}
                  className="flex-1 py-1.5 text-xs font-bold text-white bg-blue-500 rounded-lg hover:bg-blue-600">전송</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 완료된 액션 히스토리 */}
      {doneActions.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-[10px] text-gray-400 hover:text-gray-600 list-none flex items-center gap-1">
            <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
            완료된 지시 {doneActions.length}건
          </summary>
          <div className="mt-1.5 space-y-1">
            {doneActions.map(action => {
              const cfg = ACTION_CONFIG[action.actionType];
              return (
                <div key={action.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 space-y-1 opacity-70">
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{action.actionType === 'medication' ? '💊' : action.actionType === 'call' ? '📞' : action.actionType === 'visit' ? '🚶' : action.actionType === 'escort' ? '🚌' : '✅'}</span>
                    <p className={`text-[10px] font-semibold ${cfg.textColor}`}>{cfg.desc(action)}</p>
                    <span className="ml-auto text-[9px] text-green-600 font-bold">완료</span>
                  </div>
                  {action.response && (
                    <p className="text-[10px] text-gray-500">↳ {action.response.respondedBy}: {action.response.medicationName ?? action.response.currentLocation ?? action.response.note}</p>
                  )}
                  {action.followUp && (
                    <p className="text-[10px] text-indigo-600">📋 {action.followUp.hospitalize ? '내원 필요' : '내원 불필요'}{action.followUp.nextCheckAt ? ` · 다음 체크 ${action.followUp.nextCheckAt}` : ''}{action.followUp.nextCheckAssignee ? ` (${action.followUp.nextCheckAssignee})` : ''}</p>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

// ==================== 격리 주기 체크 섹션 ====================

function IsolationManageSection({
  record, campUsers, onIsolationCheck, onAddSchedule, onCompleteSchedule, onAssignIsolation,
}: {
  record: PatientRecord;
  campUsers: User[];
  onIsolationCheck: (i: number, v: boolean) => void;
  onAddSchedule: (minutesLater: number) => void;
  onCompleteSchedule: (scheduleId: string, temperature?: number, status?: IsolationCheckSchedule['status'], note?: string) => void;
  onAssignIsolation: (assigneeId: string, assigneeName: string) => void;
}) {
  const [completing, setCompleting] = useState<string | null>(null);
  const [checkTemp, setCheckTemp] = useState('');
  const [checkStatus, setCheckStatus] = useState<IsolationCheckSchedule['status']>('동일');
  const [checkNote, setCheckNote] = useState('');
  const schedules = record.isolationCheckSchedules ?? [];
  const pending = schedules.filter(s => !s.completedAt);
  const done = schedules.filter(s => !!s.completedAt);

  // 담당자 지정 상태
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);

  // mentor 역할 유저만 필터 (mentor, mentor_temp)
  const mentorUsers = campUsers.filter(u =>
    u.role === 'mentor' || u.role === 'mentor_temp'
  );
  const filteredMentors = assigneeSearch.trim()
    ? mentorUsers.filter(u => u.name.includes(assigneeSearch.trim()))
    : mentorUsers;

  const currentAssignee = record.isolationAssigneeName ?? record.assigneeName;

  const CHECK_STATUS_OPTIONS: IsolationCheckSchedule['status'][] = ['정상', '호전', '악화', '동일'];

  const formatTime = (ts: Timestamp | undefined) => {
    if (!ts?.toDate) return '--:--';
    const d = ts.toDate();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const isOverdue = (ts: Timestamp | undefined) => !!ts?.toDate && ts.toDate() < new Date();

  const handleComplete = (scheduleId: string) => {
    onCompleteSchedule(
      scheduleId,
      checkTemp ? parseFloat(checkTemp) : undefined,
      checkStatus,
      checkNote.trim() || undefined
    );
    setCompleting(null);
    setCheckTemp('');
    setCheckStatus('동일');
    setCheckNote('');
  };

  return (
    <div className="rounded-lg bg-purple-50 border border-purple-100 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-purple-800">🏠 격리 관리</p>
      </div>

      {/* 담당자 지정 (매니저 전용) */}
      <div>
        <p className="text-[11px] font-semibold text-purple-700 mb-1.5">담당 멘토</p>
        {currentAssignee && (
          <div className="flex items-center gap-2 mb-1.5 bg-purple-100 rounded-lg px-2.5 py-1.5">
            <span className="text-[11px] font-bold text-purple-900">👤 {currentAssignee}</span>
            <button
              onClick={() => { setAssigneeSearch(''); setShowAssigneeDropdown(true); }}
              className="ml-auto text-[10px] text-purple-500 hover:text-purple-700 font-medium"
            >변경</button>
          </div>
        )}
        <div className="relative">
          <input
            type="text"
            value={assigneeSearch}
            onChange={e => { setAssigneeSearch(e.target.value); setShowAssigneeDropdown(true); }}
            onFocus={() => setShowAssigneeDropdown(true)}
            placeholder={currentAssignee ? '담당자 변경 검색...' : '멘토 이름 검색...'}
            className="w-full text-xs border border-purple-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-purple-400 bg-white"
          />
          {showAssigneeDropdown && filteredMentors.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 bg-white border border-purple-200 rounded-lg shadow-lg mt-0.5 max-h-36 overflow-y-auto">
              {filteredMentors.map(u => (
                <button
                  key={u.id}
                  onClick={() => {
                    onAssignIsolation(u.id, u.name);
                    setAssigneeSearch('');
                    setShowAssigneeDropdown(false);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-purple-50 flex items-center gap-2 border-b border-gray-50 last:border-0"
                >
                  <span className="font-semibold text-gray-800">{u.name}</span>
                  <span className="text-[10px] text-gray-400">{u.role}</span>
                </button>
              ))}
            </div>
          )}
          {showAssigneeDropdown && assigneeSearch.trim() && filteredMentors.length === 0 && (
            <div className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-0.5 px-3 py-2">
              <p className="text-xs text-gray-400">검색 결과 없음</p>
            </div>
          )}
        </div>
      </div>

      {/* 주기 체크 스케줄 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-semibold text-purple-700">주기 체크</p>
          {/* 빠른 스케줄 추가 버튼 */}
          <div className="flex gap-1">
            {[30, 60, 120].map(min => (
              <button
                key={min}
                onClick={() => onAddSchedule(min)}
                className="px-2 py-0.5 text-[10px] font-bold bg-purple-200 text-purple-800 rounded hover:bg-purple-300 transition-colors"
              >
                +{min >= 60 ? `${min / 60}h` : `${min}m`}
              </button>
            ))}
          </div>
        </div>

        {/* 대기 중인 체크 */}
        {pending.length === 0 && (
          <p className="text-[10px] text-purple-400">예정된 체크 없음</p>
        )}
        {pending.map(s => (
          <div key={s.id}>
            {completing === s.id ? (
              <div className="bg-white rounded-lg border border-purple-200 p-2.5 space-y-2 mb-1.5">
                <p className="text-[11px] font-semibold text-purple-700">{formatTime(s.scheduledAt)} 체크 완료 입력</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.1"
                    value={checkTemp}
                    onChange={e => setCheckTemp(e.target.value)}
                    placeholder="체온 (예: 37.1)"
                    className="flex-1 text-xs border border-purple-200 rounded px-2 py-1 outline-none"
                  />
                  <select
                    value={checkStatus}
                    onChange={e => setCheckStatus(e.target.value as IsolationCheckSchedule['status'])}
                    className="text-xs border border-purple-200 rounded px-2 py-1 outline-none bg-white"
                  >
                    {CHECK_STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <input
                  type="text"
                  value={checkNote}
                  onChange={e => setCheckNote(e.target.value)}
                  placeholder="메모 (선택)"
                  className="w-full text-xs border border-purple-200 rounded px-2 py-1 outline-none"
                />
                <div className="flex gap-2">
                  <button onClick={() => setCompleting(null)}
                    className="flex-1 py-1 text-xs text-gray-500 bg-gray-100 rounded hover:bg-gray-200">취소</button>
                  <button onClick={() => handleComplete(s.id)}
                    className="flex-1 py-1 text-xs text-white bg-purple-500 rounded hover:bg-purple-600">저장</button>
                </div>
              </div>
            ) : (
              <div key={s.id} className={`flex items-center justify-between py-1.5 px-2 rounded mb-1 ${
                isOverdue(s.scheduledAt) ? 'bg-red-50 border border-red-100' : 'bg-white border border-purple-100'
              }`}>
                <span className={`text-xs font-semibold ${isOverdue(s.scheduledAt) ? 'text-red-600' : 'text-purple-700'}`}>
                  {isOverdue(s.scheduledAt) ? '⚠️ ' : '⏰ '}{formatTime(s.scheduledAt)}
                </span>
                <button
                  onClick={() => setCompleting(s.id)}
                  className="px-2 py-0.5 text-[10px] font-bold bg-purple-500 text-white rounded hover:bg-purple-600"
                >
                  체크 완료
                </button>
              </div>
            )}
          </div>
        ))}

        {/* 완료된 체크 기록 */}
        {done.length > 0 && (
          <div className="mt-1 space-y-1">
            <p className="text-[10px] font-semibold text-gray-400">완료 기록</p>
            {done.map(s => (
              <div key={s.id} className="flex items-center gap-2 text-[10px] text-gray-500">
                <span className="text-green-600 font-bold">✓</span>
                <span>{formatTime(s.scheduledAt)}</span>
                {s.completedAt && <span>→ {formatTime(s.completedAt)}</span>}
                {s.temperature && <span className="text-orange-600">{s.temperature}°C</span>}
                {s.status && (
                  <span className={`px-1 rounded font-bold text-[9px] ${
                    s.status === '악화' ? 'bg-red-100 text-red-600' :
                    s.status === '호전' ? 'bg-green-100 text-green-600' :
                    'bg-gray-100 text-gray-600'
                  }`}>{s.status}</span>
                )}
                {s.checkedBy && <span>{s.checkedBy}</span>}
                {s.note && <span className="text-gray-400 truncate max-w-[80px]">{s.note}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

// ==================== 복귀 판단 기준 (일반 환자 포함) ====================

function ReturnCriteriaSection({
  record, onReturnCriteriaCheck,
}: {
  record: PatientRecord;
  onReturnCriteriaCheck: (i: number, v: boolean) => void;
}) {
  const criteria = RETURN_CRITERIA_LABELS as readonly string[];
  const checks = record.returnCriteriaChecks ?? Array(criteria.length).fill(false);
  const allDone = checks.every(Boolean);

  // 처치전/단순처치만이면 숨김
  const hideTypes: PatientType[] = ['처치전', '단순처치'];
  const shouldShow = !record.types.every(t => hideTypes.includes(t));
  if (!shouldShow) return null;

  return (
    <div className={`rounded-lg border p-3 space-y-1.5 ${
      allDone ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-100'
    }`}>
      <div className="flex items-center justify-between">
        <p className={`text-xs font-semibold ${allDone ? 'text-green-700' : 'text-amber-800'}`}>
          복귀 판단 기준
        </p>
        {allDone && (
          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">
            ✓ 복귀 가능
          </span>
        )}
      </div>
      {criteria.map((label, i) => {
        const checked = checks[i] ?? false;
        return (
          <label key={i} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={checked}
              onChange={e => onReturnCriteriaCheck(i, e.target.checked)}
              className={`w-4 h-4 ${allDone ? 'accent-green-500' : 'accent-amber-500'}`} />
            <span className={`text-xs ${checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>{label}</span>
          </label>
        );
      })}
    </div>
  );
}

// ==================== 내원 탭 ====================

/**
 * 검색 가능한 유저 선택 인풋
 * - 내부 query state로 타이핑을 처리하고, 선택 시 외부 onChange 호출
 * - value prop은 초기값(및 외부 리셋)으로만 사용
 */
function UserSearchInput({ value, onChange, placeholder, campUsers }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  campUsers: User[];
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  // 외부에서 value가 바뀔 때만 동기화 (자동채움 등)
  const prevValue = useRef(value);
  useEffect(() => {
    if (prevValue.current !== value) {
      setQuery(value);
      prevValue.current = value;
    }
  }, [value]);

  const filtered = campUsers.filter(
    u => u.name.includes(query) && query.length > 0 && u.name !== query
  );

  return (
    <div className="relative flex-1">
      <input
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-orange-300 bg-white"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-white border border-gray-200 rounded shadow-lg max-h-32 overflow-y-auto">
          {filtered.map(u => (
            <button key={u.userId ?? u.name} type="button"
              className="w-full text-left px-2 py-1.5 text-xs hover:bg-orange-50"
              onMouseDown={() => {
                setQuery(u.name);
                onChange(u.name);
                setOpen(false);
              }}
            >
              {u.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 내원 차량 현황판 (전체 records에서 내원예정 슬롯 집계)
 * 같은 슬롯이라도 인솔자(escort)가 다르면 별도 행으로 표시 */
// ── 다음 체크 현황 보드 ───────────────────────────────────────
function NextCheckBoard({ allRecords, currentUserId, currentUserName }: {
  allRecords: PatientRecord[];
  currentUserId: string;
  currentUserName: string;
}) {
  const now = Date.now();

  // 활성 환자 중 가장 최신 progressLog에 nextCheckAt 또는 nextCheckAssigneeName이 있는 것만 수집
  type CheckItem = {
    recordId: string;
    studentName: string;
    className?: string;
    nextCheckAt?: Timestamp;
    nextCheckAssigneeName?: string;
    nextCheckAssigneeId?: string;
    isOverdue: boolean;
    diffMin: number; // 음수 = 지남
    loggedAt: Timestamp;
  };

  const items: CheckItem[] = [];
  for (const r of allRecords) {
    if (r.progressStatus === '완치') continue;
    const logs = r.progressLogs ?? [];
    // 가장 최신 중간보고 로그 찾기 (역순으로)
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      if (log.status !== '중간보고') continue;
      if (!log.nextCheckAt && !log.nextCheckAssigneeName) break;
      const checkDate = log.nextCheckAt?.toDate();
      const diffMin = checkDate ? Math.round((checkDate.getTime() - now) / 60000) : 0;
      items.push({
        recordId: r.id,
        studentName: r.studentName,
        className: r.className,
        nextCheckAt: log.nextCheckAt,
        nextCheckAssigneeName: log.nextCheckAssigneeName,
        nextCheckAssigneeId: log.nextCheckAssigneeId,
        isOverdue: checkDate ? checkDate.getTime() < now : false,
        diffMin,
        loggedAt: log.loggedAt,
      });
      break;
    }
  }

  if (items.length === 0) return null;

  // 내 담당 먼저, 그다음 시간 오름차순
  items.sort((a, b) => {
    const aMine = a.nextCheckAssigneeId === currentUserId || a.nextCheckAssigneeName === currentUserName ? 0 : 1;
    const bMine = b.nextCheckAssigneeId === currentUserId || b.nextCheckAssigneeName === currentUserName ? 0 : 1;
    if (aMine !== bMine) return aMine - bMine;
    return a.diffMin - b.diffMin;
  });

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden mb-2">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-amber-200 bg-amber-100">
        <span className="text-[11px]">⏰</span>
        <span className="text-[11px] font-bold text-amber-800">다음 체크 현황</span>
        <span className="ml-auto text-[10px] text-amber-600">{items.length}명</span>
      </div>
      <div className="divide-y divide-amber-100">
        {items.map(item => {
          const isMine = item.nextCheckAssigneeId === currentUserId || item.nextCheckAssigneeName === currentUserName;
          // 시간 레이블
          let timeLabel = '';
          if (item.nextCheckAt) {
            const d = item.nextCheckAt.toDate();
            const abs = Math.abs(item.diffMin);
            if (item.isOverdue) {
              timeLabel = abs < 60 ? `${abs}분 지남` : `${Math.floor(abs / 60)}시간 ${abs % 60}분 지남`;
            } else if (item.diffMin < 60) {
              timeLabel = `${item.diffMin}분 후`;
            } else {
              const h = String(d.getHours()).padStart(2, '0');
              const m = String(d.getMinutes()).padStart(2, '0');
              timeLabel = `${h}:${m}`;
            }
          }

          return (
            <div key={item.recordId}
              className={`flex items-center gap-2 px-3 py-2 ${isMine ? 'bg-amber-100/60' : ''}`}
            >
              {/* 학생 정보 */}
              <div className="flex-1 min-w-0">
                <span className="text-[11px] font-semibold text-gray-800">{item.studentName}</span>
                {item.className && (
                  <span className="ml-1.5 text-[10px] text-gray-500">{item.className}반</span>
                )}
              </div>
              {/* 담당자 */}
              {item.nextCheckAssigneeName && (
                <span className={`text-[10px] font-semibold ${isMine ? 'text-amber-700' : 'text-gray-600'}`}>
                  {isMine ? '👤 내 담당' : `→ ${item.nextCheckAssigneeName}`}
                </span>
              )}
              {/* 시간 뱃지 */}
              {timeLabel && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  item.isOverdue
                    ? 'bg-red-100 text-red-600'
                    : item.diffMin <= 30
                    ? 'bg-orange-100 text-orange-600'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {timeLabel}
                </span>
              )}
              {item.isOverdue && (
                <span className="text-[9px] font-bold text-red-500 bg-red-100 px-1 py-0.5 rounded">누락주의</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 내원 차량 현황 보드 ───────────────────────────────────────
function TransportBoard({ allRecords }: { allRecords: PatientRecord[] }) {
  // 슬롯 → (escort 기준) 그룹별 집계
  // key: "차량1::홍길동" (슬롯 + 인솔자 조합)
  type GroupEntry = {
    slot: TransportSlot;
    escort: string;
    driver?: string;
    departureTime?: string;
    hospitalName?: string;
    students: string[];
  };

  const groupMap = new Map<string, GroupEntry>();
  allRecords.forEach(r => {
    (r.hospitalVisits ?? []).forEach(v => {
      if (v.hospitalStatus !== '내원예정' || !v.transportSlot) return;
      const key = `${v.transportSlot}::${v.escort ?? ''}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          slot: v.transportSlot,
          escort: v.escort ?? '',
          driver: v.driver,
          departureTime: v.departureTime,
          hospitalName: v.hospitalName,
          students: [],
        });
      }
      groupMap.get(key)!.students.push(r.studentName);
    });
  });

  if (groupMap.size === 0) return null;

  // TRANSPORT_SLOTS 순서대로, 같은 슬롯 내에서는 escort 이름순
  const sorted = TRANSPORT_SLOTS.flatMap(slot =>
    [...groupMap.values()]
      .filter(g => g.slot === slot)
      .sort((a, b) => a.escort.localeCompare(b.escort, 'ko'))
  );

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 mb-1">
      <p className="text-[11px] font-bold text-orange-700 mb-2">🚗 내원 차량 현황</p>
      <div className="space-y-1.5">
        {sorted.map((g, i) => (
          <div key={i} className="bg-white rounded-lg border border-orange-100 p-2">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[11px] font-bold text-orange-600">{g.slot}</span>
              {g.departureTime && (
                <span className="text-[10px] text-gray-500">출발 <b className="text-gray-700">{g.departureTime}</b></span>
              )}
              {g.driver && (
                <span className="text-[10px] text-gray-500">운전 <b className="text-gray-700">{g.driver}</b></span>
              )}
              {g.escort && (
                <span className="text-[10px] text-gray-500">인솔 <b className="text-gray-700">{g.escort}</b></span>
              )}
              {g.hospitalName && (
                <span className="text-[10px] text-gray-400 ml-auto">→ {g.hospitalName}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {g.students.map((name, j) => (
                <span key={j} className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                  {name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 휴식 및 격리 현황 보드 ──────────────────────────────────────
/**
 * 활성 환자 중 가장 최신 ProgressLog의 locationMode가 '휴식' 또는 '격리'인 환자를 집계해 표시.
 * 최초보고 시 저장된 record.locationMode도 fallback으로 활용.
 */
function RestIsolationBoard({ allRecords }: { allRecords: PatientRecord[] }) {
  type Entry = {
    studentName: string;
    className?: string;
    locationMode: LocationMode;
    location?: string;
    loggedBy?: string;
  };

  const entries: Entry[] = [];

  for (const r of allRecords) {
    if (r.progressStatus === '완치') continue;

    // 가장 최신 ProgressLog에서 locationMode 확인 (역순 탐색)
    const logs = r.progressLogs ?? [];
    let found = false;
    for (let i = logs.length - 1; i >= 0; i--) {
      const log = logs[i];
      if (log.locationMode === '휴식' || log.locationMode === '격리') {
        entries.push({
          studentName: r.studentName,
          className: r.className,
          locationMode: log.locationMode,
          location: log.location,
          loggedBy: log.loggedBy,
        });
        found = true;
        break;
      }
      // locationMode가 '일과중'이면 복귀로 간주 → 더 이상 탐색 불필요
      if (log.locationMode === '일과중') break;
    }

    // ProgressLog에 locationMode가 없으면 record 자체 locationMode로 fallback
    if (!found && (r.locationMode === '휴식' || r.locationMode === '격리')) {
      entries.push({
        studentName: r.studentName,
        className: r.className,
        locationMode: r.locationMode,
        location: r.location,
        loggedBy: r.recordedBy,
      });
    }
  }

  if (entries.length === 0) return null;

  const restEntries = entries.filter(e => e.locationMode === '휴식');
  const isoEntries  = entries.filter(e => e.locationMode === '격리');

  return (
    <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 mb-1">
      <p className="text-[11px] font-bold text-purple-700 mb-2">😴 휴식 및 격리 현황</p>
      <div className="space-y-2">
        {/* 휴식 */}
        {restEntries.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-amber-700 mb-1">
              😴 휴식 중 <span className="ml-1 text-[10px] font-normal text-amber-600">{restEntries.length}명</span>
            </p>
            <div className="flex flex-wrap gap-1">
              {restEntries.map((e, i) => (
                <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                  <span className="text-[11px] font-semibold text-gray-800">{e.studentName}</span>
                  {e.className && <span className="text-[10px] text-gray-500 ml-1">{e.className}반</span>}
                  {e.location && <span className="text-[10px] text-amber-700 ml-1">📍 {e.location}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* 격리 */}
        {isoEntries.length > 0 && (
          <div>
            <p className="text-[10px] font-bold text-purple-700 mb-1">
              🏠 격리 중 <span className="ml-1 text-[10px] font-normal text-purple-600">{isoEntries.length}명</span>
            </p>
            <div className="flex flex-wrap gap-1">
              {isoEntries.map((e, i) => (
                <div key={i} className="bg-white border border-purple-200 rounded-lg px-2 py-1">
                  <span className="text-[11px] font-semibold text-gray-800">{e.studentName}</span>
                  {e.className && <span className="text-[10px] text-gray-500 ml-1">{e.className}반</span>}
                  {e.location && <span className="text-[10px] text-purple-700 ml-1">📍 {e.location}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 공통 탭 폼 모달 (경과·내원·복용약·부모연락 모두 동일 껍데기 사용)
// ─────────────────────────────────────────────────────────────
function TabFormModal({
  title, icon, onClose, onSubmit, submitLabel = '저장', submitColor = 'blue', children,
}: {
  title: string;
  icon?: string;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitColor?: 'blue' | 'green' | 'orange' | 'red';
  children: React.ReactNode;
}) {
  const colorMap = {
    blue:   'bg-blue-600 hover:bg-blue-700',
    green:  'bg-green-600 hover:bg-green-700',
    orange: 'bg-orange-500 hover:bg-orange-600',
    red:    'bg-red-500 hover:bg-red-600',
  };
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-[13px] font-bold text-gray-800">
            {icon && <span className="mr-1">{icon}</span>}{title}
          </h3>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* 내용 */}
        <div className="flex-1 overflow-y-auto px-3.5 py-3 space-y-2.5">
          {children}
        </div>
        {/* 푸터 */}
        {onSubmit && (
          <div className="flex gap-2 px-3.5 py-2.5 border-t border-gray-100 flex-shrink-0">
            <button onClick={onClose}
              className="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition font-medium">
              취소
            </button>
            <button onClick={onSubmit}
              className={`flex-[2] px-4 py-1.5 rounded-lg text-xs text-white font-bold transition ${colorMap[submitColor]}`}>
              {submitLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** 내원 폼 행 레이아웃 (외부 선언 → 리렌더마다 새 참조 생성 방지) */
function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-gray-500 w-14 flex-shrink-0">{label}</span>
      {children}
    </div>
  );
}

/** 캠프 코드별 병원 프리셋 */
const HOSPITAL_PRESETS: Record<string, string[]> = {
  J: [
    '건강한한림연합내과의원',
    '한림이비인후과의원',
    '한림본정형외과의원',
    '한림의원',
    '한림윤패밀리의원',
    '한림김안과의원',
    '한림본치과의원',
  ],
  S: [], // 추후 채울 예정
};

function getHospitalPresets(campCode: string): string[] {
  const prefix = campCode.charAt(0).toUpperCase();
  return HOSPITAL_PRESETS[prefix] ?? [];
}

/** 내원예정 등록/수정 폼 */
function HospitalScheduleForm({ onSubmit, onCancel, campUsers, allRecords, initialValues, isEdit, classMentor, campCode, submitRef }: {
  onSubmit: (entry: Partial<HospitalVisitEntry>) => void;
  onCancel: () => void;
  campUsers: User[];
  allRecords: PatientRecord[];
  initialValues?: Partial<HospitalVisitEntry>;
  isEdit?: boolean;
  /** 학부모 보고자 기본값으로 사용할 반 담당 선생님 이름 */
  classMentor?: string;
  campCode?: string;
  /** 외부에서 submit을 트리거하기 위한 ref */
  submitRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [transportSlot, setTransportSlot] = useState<TransportSlot>(initialValues?.transportSlot ?? '차량1');
  const [departureTime, setDepartureTime] = useState(initialValues?.departureTime ?? '');
  const [driver, setDriver] = useState(initialValues?.driver ?? '');
  const [escort, setEscort] = useState(initialValues?.escort ?? '');
  const [hospitalName, setHospitalName] = useState(initialValues?.hospitalName ?? '');
  // 기본값: 기존 값 > 반 담당 선생님 > 빈 문자열
  const [parentReporter, setParentReporter] = useState(initialValues?.parentReporter ?? classMentor ?? '');
  const [parentReportMethod, setParentReportMethod] = useState<ParentReportMethod>(initialValues?.parentReportMethod ?? '문자');

  /** 슬롯에 해당하는 기존 내원예정 정보를 allRecords에서 찾아 반환 */
  const findSlotInfo = useCallback((slot: TransportSlot) => {
    for (const r of allRecords) {
      for (const v of (r.hospitalVisits ?? [])) {
        if (v.hospitalStatus === '내원예정' && v.transportSlot === slot) {
          return { departureTime: v.departureTime ?? '', driver: v.driver ?? '' };
        }
      }
    }
    return null;
  }, [allRecords]);

  // 신규 폼 마운트 시 초기 슬롯(차량1)의 기존 정보 자동 채움
  useEffect(() => {
    if (isEdit) return; // 수정 모드에서는 initialValues를 그대로 사용
    const info = findSlotInfo(transportSlot);
    if (info) {
      if (info.departureTime) setDepartureTime(info.departureTime);
      if (info.driver) setDriver(info.driver);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 마운트 시 1회만

  // 슬롯 버튼 클릭 시 자동 채움
  const handleSlotChange = (slot: TransportSlot) => {
    setTransportSlot(slot);
    const info = findSlotInfo(slot);
    if (info) {
      setDepartureTime(info.departureTime);
      setDriver(info.driver);
    } else {
      setDepartureTime('');
      setDriver('');
    }
  };

  const isCar = isCarSlot(transportSlot);

  // 외부(TabFormModal)에서 저장 버튼 클릭 시 호출될 submit 함수 등록
  const handleSubmitInternal = () => {
    onSubmit({ transportSlot, departureTime, driver: isCar ? driver : undefined, escort, hospitalName, parentReporter, parentReportMethod });
  };
  useEffect(() => {
    if (submitRef) submitRef.current = handleSubmitInternal;
  });

  return (
    <div className="space-y-2">
      {/* 내원 방식 */}
      <FormRow label="내원 방식">
        <div className="flex flex-wrap gap-1">
          {TRANSPORT_SLOTS.map(s => (
            <button key={s} type="button" onClick={() => handleSlotChange(s)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                transportSlot === s ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-orange-300'
              }`}>{s}</button>
          ))}
        </div>
      </FormRow>

      <FormRow label="출발 시간">
        <input type="text" inputMode="numeric" value={departureTime}
          onChange={e => { const raw = e.target.value.replace(/[^\d:]/g, ''); if (/^\d{4}$/.test(raw)) { setDepartureTime(`${raw.slice(0, 2)}:${raw.slice(2)}`); } else { setDepartureTime(raw); } }}
          placeholder="예) 14:30" maxLength={5}
          className="flex-1 text-[11px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-orange-300 bg-white" />
      </FormRow>

      {isCar && (
        <FormRow label="운전자">
          <UserSearchInput value={driver} onChange={setDriver} placeholder="이름 검색" campUsers={campUsers} />
        </FormRow>
      )}

      <FormRow label="인솔자">
        <UserSearchInput value={escort} onChange={setEscort} placeholder="이름 검색" campUsers={campUsers} />
      </FormRow>

      {/* 병원 이름 */}
      <div>
        <p className="text-[10px] text-gray-500 mb-1">병원 이름</p>
        {(() => {
          const presets = getHospitalPresets(campCode ?? '');
          if (presets.length === 0) return null;
          return (
            <div className="flex flex-wrap gap-1 mb-1">
              {presets.map(name => (
                <button key={name} type="button" onClick={() => setHospitalName(name)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    hospitalName === name ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-orange-300'
                  }`}>{name}</button>
              ))}
            </div>
          );
        })()}
        <input type="text" value={hospitalName} onChange={e => setHospitalName(e.target.value)} placeholder="직접 입력"
          className="w-full text-[11px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-orange-300 bg-white" />
      </div>

      <FormRow label="학부모 보고자">
        <UserSearchInput value={parentReporter} onChange={setParentReporter} placeholder="이름 검색" campUsers={campUsers} />
      </FormRow>

      <FormRow label="학부모 보고 방식">
        <div className="flex gap-1 flex-wrap">
          {PARENT_REPORT_METHODS.map(m => (
            <button key={m} type="button" onClick={() => setParentReportMethod(m)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                parentReportMethod === m ? 'bg-orange-500 text-white' : 'bg-white text-gray-500 border border-gray-200'
              }`}>{m}</button>
          ))}
        </div>
      </FormRow>
    </div>
  );
}

function HospitalTab({ record, campUsers, allRecords, onAddVisit, onUpdateVisits }: {
  record: PatientRecord;
  campUsers: User[];
  allRecords: PatientRecord[];
  onAddVisit: () => void;
  onUpdateVisits: (visits: HospitalVisitEntry[]) => void;
}) {
  const visits = record.hospitalVisits ?? [];
  const [showForm, setShowForm] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number>(-1);
  const hospitalSubmitRef = useRef<(() => void) | null>(null);

  const setVisitField = <K extends keyof HospitalVisitEntry>(
    idx: number, key: K, val: HospitalVisitEntry[K]
  ) => {
    const next = visits.map((v, i) => i === idx ? { ...v, [key]: val } : v);
    onUpdateVisits(next);
  };

  const setBillingField = <K extends keyof HospitalBilling>(
    visitIdx: number, key: K, val: HospitalBilling[K]
  ) => {
    const next = visits.map((v, i) => {
      if (i !== visitIdx) return v;
      return { ...v, billing: { ...v.billing, [key]: val } as HospitalBilling };
    });
    onUpdateVisits(next);
  };

  const handleFormSubmit = (fields: Partial<HospitalVisitEntry>) => {
    if (editingIdx >= 0) {
      const next = visits.map((v, i) => i === editingIdx ? {
        ...v, ...fields, escort: fields.escort ?? v.escort,
      } : v);
      onUpdateVisits(next);
      setEditingIdx(-1);
    } else {
      const newEntry: HospitalVisitEntry = {
        visitId: Date.now().toString(),
        hospitalStatus: '내원예정',
        escort: fields.escort ?? '',
        ...fields,
      };
      onUpdateVisits([...visits, newEntry]);
    }
    setShowForm(false);
  };

  const handleDelete = (idx: number) => {
    if (!confirm(`${idx + 1}차 내원 기록을 삭제할까요?`)) return;
    onUpdateVisits(visits.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      {/* 기존 내원 기록 */}
      {visits.map((visit, idx) => (
        <div key={visit.visitId} className={`rounded-lg border p-3 space-y-2 ${
          visit.hospitalStatus === '내원예정' ? 'bg-orange-50 border-orange-100'
          : visit.hospitalStatus === '내원완료' ? 'bg-green-50 border-green-100'
          : 'bg-gray-50 border-gray-100'
        }`}>
          {/* 헤더 */}
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-gray-700 flex-shrink-0">{idx + 1}차 내원</p>
            <div className="flex gap-1 flex-1">
              {HOSPITAL_STATUSES.map(s => (
                <button key={s} onClick={() => setVisitField(idx, 'hospitalStatus', s)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors ${
                    visit.hospitalStatus === s
                      ? s === '필요없음' ? 'bg-gray-500 text-white'
                      : s === '내원예정' ? 'bg-orange-500 text-white'
                      : 'bg-green-500 text-white'
                      : 'bg-white text-gray-400 border border-gray-200'
                  }`}>{s}</button>
              ))}
            </div>
            <button onClick={() => { setEditingIdx(idx); setShowForm(true); }}
              className="text-[11px] text-gray-400 hover:text-orange-500 px-1" title="수정">✏️</button>
            <button onClick={() => handleDelete(idx)}
              className="text-[11px] text-gray-400 hover:text-red-500 px-1" title="삭제">🗑️</button>
          </div>

          {/* 정보 요약 */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            {visit.transportSlot && <span className="text-gray-500">방식: <b className="text-gray-700">{visit.transportSlot}</b></span>}
            {visit.departureTime && <span className="text-gray-500">출발: <b className="text-gray-700">{visit.departureTime}</b></span>}
            {visit.driver && <span className="text-gray-500">운전: <b className="text-gray-700">{visit.driver}</b></span>}
            {visit.escort && <span className="text-gray-500">인솔: <b className="text-gray-700">{visit.escort}</b></span>}
            {visit.hospitalName && <span className="text-gray-500 col-span-2">병원: <b className="text-gray-700">{visit.hospitalName}</b></span>}
            {visit.parentReporter && <span className="text-gray-500">학부모 보고자: <b className="text-gray-700">{visit.parentReporter}</b></span>}
            {visit.parentReportMethod && <span className="text-gray-500">보고 방식: <b className="text-gray-700">{visit.parentReportMethod}</b></span>}
          </div>

          {/* 처방약 (내원완료 시) */}
          {visit.hospitalStatus === '내원완료' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500 w-10 flex-shrink-0">처방</span>
              <input type="text" value={visit.prescription ?? ''}
                onChange={e => setVisitField(idx, 'prescription', e.target.value || undefined)}
                onBlur={() => onUpdateVisits(visits)} placeholder="처방약"
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white outline-none focus:border-green-300" />
            </div>
          )}

          {/* 정산 (내원완료 시) */}
          {visit.hospitalStatus === '내원완료' && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold text-amber-800">병원비 정산</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${visit.billing?.isPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {visit.billing?.isPaid ? '정산 완료' : '미정산'}
                </span>
              </div>
              <div className="flex gap-1">
                {BILLING_METHODS.map(m => (
                  <button key={m} onClick={() => setBillingField(idx, 'method', m)}
                    className={`flex-1 py-1 text-[11px] font-semibold rounded ${visit.billing?.method === m ? 'bg-amber-500 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>{m}</button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500 w-10 flex-shrink-0">금액</span>
                <input type="number" value={visit.billing?.amount ?? ''}
                  onChange={e => setBillingField(idx, 'amount', e.target.value ? parseInt(e.target.value) : undefined)}
                  onBlur={() => onUpdateVisits(visits)} placeholder="원"
                  className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white outline-none focus:border-amber-300" />
              </div>
              {visit.billing?.method === '용돈봉투' && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 w-10 flex-shrink-0">담당</span>
                  <UserSearchInput value={visit.billing?.pocketMoneyHandler ?? ''}
                    onChange={v => setBillingField(idx, 'pocketMoneyHandler', v || undefined)}
                    placeholder="차감 담당자" campUsers={campUsers} />
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={visit.billing?.isPaid ?? false}
                  onChange={e => setBillingField(idx, 'isPaid', e.target.checked)} className="accent-green-500" />
                <span className="text-xs text-gray-600">정산 완료</span>
              </label>
            </div>
          )}
        </div>
      ))}

      {/* 등록 버튼 */}
      <button onClick={() => { setEditingIdx(-1); setShowForm(true); }}
        className="w-full py-1.5 text-xs font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg border border-dashed border-orange-200 transition-colors">
        + {visits.length === 0 ? '내원예정 등록' : '재내원 추가'}
      </button>

      {/* 등록/수정 모달 */}
      {showForm && (
        <TabFormModal
          title={editingIdx >= 0 ? '내원 정보 수정' : '내원예정 등록'}
          icon="🏥"
          onClose={() => { setShowForm(false); setEditingIdx(-1); }}
          onSubmit={() => hospitalSubmitRef.current?.()}
          submitLabel={editingIdx >= 0 ? '수정 완료' : '등록'}
          submitColor="orange"
        >
          <HospitalScheduleForm
            campUsers={campUsers}
            allRecords={allRecords}
            onSubmit={handleFormSubmit}
            onCancel={() => { setShowForm(false); setEditingIdx(-1); }}
            initialValues={editingIdx >= 0 ? visits[editingIdx] : undefined}
            isEdit={editingIdx >= 0}
            classMentor={record.classMentor}
            campCode={record.campCode}
            submitRef={hospitalSubmitRef}
          />
        </TabFormModal>
      )}
    </div>
  );
}

// ==================== 약 복용 명단 전용 뷰 ====================

interface MedicationListViewProps {
  records: PatientRecord[];
  today: string;
  currentUserName: string;
  onCheck: (record: PatientRecord, si: number, t: MedicationTime, checked: boolean) => void;
  onSkipDate?: (record: PatientRecord, si: number, isSkip: boolean) => void;
}

function MedicationListView({ records, today, currentUserName, onCheck, onSkipDate }: MedicationListViewProps) {
  // 선택된 시간대 필터 (null = 전체)
  const [selectedTime, setSelectedTime] = useState<MedicationTime | null>(null);

  // 복용 확인 모달 상태
  const [confirmPending, setConfirmPending] = useState<{
    record: PatientRecord; si: number; time: MedicationTime; medName: string;
  } | null>(null);

  // 약 사진 라이트박스
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-2 text-center px-4">
        <div className="text-4xl mb-2">💊</div>
        <p className="text-gray-500 text-sm font-medium">오늘 복용 예정 약이 없습니다.</p>
        <p className="text-gray-400 text-xs">약복용 환자를 등록하면 여기에 표시됩니다.</p>
      </div>
    );
  }

  // 시간대별 진행률 계산 (firstTime/lastTime 비활성 반영)
  const calcTimeProgress = (time: MedicationTime) => {
    let total = 0, done = 0;
    const ORDER = MEDICATION_TIMES;
    const timeIdx = ORDER.indexOf(time);
    records.forEach(r => {
      (r.medicationSchedules ?? []).forEach(sched => {
        if (!isInDateRange(sched.startDate, sched.endDate, today)) return;
        if (!sched.times.includes(time)) return;
        if ((sched.skipDates ?? []).includes(today)) return;
        // firstTime 비활성
        const firstIdx = sched.firstTime ? ORDER.indexOf(sched.firstTime) : -1;
        if (today === sched.startDate && firstIdx >= 0 && timeIdx < firstIdx) return;
        // lastTime 비활성
        const lastIdx = sched.lastTime ? ORDER.indexOf(sched.lastTime) : -1;
        if (today === sched.endDate && lastIdx >= 0 && timeIdx > lastIdx) return;
        total++;
        if (sched.checkedTimes.includes(makeMedTimeKey(time, today))) done++;
      });
    });
    return { total, done, allDone: total > 0 && done === total, none: total === 0 };
  };

  // 특정 filterTimes에 해당 스케줄이 있는 환자만 필터
  const recordsWithTimes = (filterTimes: MedicationTime[]) =>
    records.filter(r =>
      (r.medicationSchedules ?? []).some(sched =>
        isInDateRange(sched.startDate, sched.endDate, today) &&
        sched.times.some(t => filterTimes.includes(t))
      )
    );

  // 시간대 메타 (담당 색상 포함)
  const TIME_META: Record<MedicationTime, { label: string; group: '방담당' | '반담당'; bg: string; text: string; border: string; selectedRing: string }> = {
    '기상후':  { label: '기상후',  group: '방담당', bg: 'bg-indigo-50',  text: 'text-indigo-700', border: 'border-indigo-200', selectedRing: 'ring-2 ring-indigo-500' },
    '조식후':  { label: '조식후',  group: '반담당', bg: 'bg-orange-50',  text: 'text-orange-700', border: 'border-orange-200', selectedRing: 'ring-2 ring-orange-500' },
    '중식후':  { label: '중식후',  group: '반담당', bg: 'bg-orange-50',  text: 'text-orange-700', border: 'border-orange-200', selectedRing: 'ring-2 ring-orange-500' },
    '석식후':  { label: '석식후',  group: '반담당', bg: 'bg-orange-50',  text: 'text-orange-700', border: 'border-orange-200', selectedRing: 'ring-2 ring-orange-500' },
    '취침전':  { label: '취침전',  group: '방담당', bg: 'bg-indigo-50',  text: 'text-indigo-700', border: 'border-indigo-200', selectedRing: 'ring-2 ring-indigo-500' },
  };

  // 실제 표시할 섹션 결정 (selectedTime 적용)
  const activeRoomTimes = selectedTime
    ? (ROOM_TIMES.includes(selectedTime) ? [selectedTime] : [])
    : ROOM_TIMES;
  const activeClassTimes = selectedTime
    ? (CLASS_TIMES.includes(selectedTime) ? [selectedTime] : [])
    : CLASS_TIMES;

  // 방담당: 여자먼저 → className(반코드) 오름차순 → 이름
  const roomRecords = sortRoomRecords(recordsWithTimes(activeRoomTimes));
  // 반담당: className(반코드) 오름차순 → 이름
  const classRecords = [...recordsWithTimes(activeClassTimes)].sort((a, b) => {
    const cA = a.className ?? '', cB = b.className ?? '';
    const cmp = cA.localeCompare(cB, 'ko', { numeric: true, sensitivity: 'base' });
    return cmp !== 0 ? cmp : a.studentName.localeCompare(b.studentName, 'ko');
  });

  const roomLabel = selectedTime && ROOM_TIMES.includes(selectedTime)
    ? selectedTime
    : '기상후 · 취침전';
  const classLabel = selectedTime && CLASS_TIMES.includes(selectedTime)
    ? selectedTime
    : '조식후 · 중식후 · 석식후';

  return (
    <div className="flex flex-col h-full">
      {/* ── 약 사진 라이트박스 ─────────────────────────────── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="약 사진 확대"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 text-white text-lg flex items-center justify-center hover:bg-white/30 transition"
            onClick={() => setLightboxUrl(null)}
          >✕</button>
        </div>
      )}

      {/* ── 복용 확인 모달 ───────────────────────────────── */}
      {confirmPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-5 space-y-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-3xl">💊</span>
              <p className="text-sm font-bold text-gray-800">복용 완료 확인</p>
              <p className="text-xs text-gray-500 leading-relaxed">
                <span className="font-semibold text-gray-700">{confirmPending.record.studentName}</span> 학생의
                <br />
                <span className="font-semibold text-orange-600">{confirmPending.medName}</span>{' '}
                <span className="font-semibold text-blue-600">{confirmPending.time}</span> 복용을
                <br />
                완료로 기록할까요?
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmPending(null)}
                className="flex-1 py-2 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  onCheck(confirmPending.record, confirmPending.si, confirmPending.time, false);
                  setConfirmPending(null);
                }}
                className="flex-1 py-2 text-sm text-white bg-green-500 hover:bg-green-600 rounded-xl font-bold transition-colors"
              >
                ✓ 완료 확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 시간대별 현황판 */}
      <div className="bg-white border-b border-gray-100 px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-gray-700">시간대별 복용 현황</p>
          <div className="flex items-center gap-2">
            {selectedTime && (
              <button
                onClick={() => setSelectedTime(null)}
                className="text-[9px] text-gray-500 bg-gray-100 hover:bg-gray-200 rounded px-1.5 py-0.5 transition"
              >
                전체 보기 ✕
              </button>
            )}
            <p className="text-[10px] text-gray-400">{today.replace(/-/g, '/')} · {records.length}명</p>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {MEDICATION_TIMES.map(time => {
            const prog = calcTimeProgress(time);
            const meta = TIME_META[time];
            const isSelected = selectedTime === time;

            if (prog.none) {
              return (
                <div key={time} className="flex flex-col items-center gap-0.5 rounded-lg border border-gray-100 bg-gray-50 px-1 py-2 cursor-not-allowed opacity-50">
                  <span className="text-[9px] text-gray-300 font-medium">{meta.label}</span>
                  <span className="text-[9px] text-gray-300">-</span>
                </div>
              );
            }
            return (
              <button
                key={time}
                onClick={() => setSelectedTime(prev => prev === time ? null : time)}
                className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 transition-all cursor-pointer ${
                  isSelected
                    ? `${meta.bg} ${meta.border} ${meta.selectedRing} scale-105 shadow-sm`
                    : prog.allDone
                      ? 'bg-green-50 border-green-200 hover:scale-105'
                      : `${meta.bg} ${meta.border} hover:scale-105 hover:shadow-sm`
                }`}
              >
                <span className={`text-[9px] font-bold ${prog.allDone && !isSelected ? 'text-green-700' : meta.text}`}>
                  {meta.label}
                </span>
                <span className={`text-[11px] font-extrabold ${prog.allDone && !isSelected ? 'text-green-600' : meta.text}`}>
                  {prog.done}/{prog.total}
                </span>
                {prog.allDone
                  ? <span className="text-[9px] text-green-600">✓ 완료</span>
                  : isSelected
                    ? <span className={`text-[9px] ${meta.text} opacity-70`}>● 선택됨</span>
                    : <span className="text-[9px] text-gray-300">탭</span>
                }
              </button>
            );
          })}
        </div>
        {/* 담당별 범례 */}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="flex items-center gap-1 text-[9px] text-indigo-500">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />방담당
          </span>
          <span className="flex items-center gap-1 text-[9px] text-orange-500">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />반담당
          </span>
        </div>
      </div>

      {/* 담당별 환자 목록 */}
      <div className="flex-1 overflow-y-auto">
        {/* 방 담당 섹션 */}
        {activeRoomTimes.length > 0 && roomRecords.length > 0 && (
          <div>
            <div className="sticky top-0 z-10 bg-indigo-50 border-b border-indigo-100 px-4 py-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 inline-block" />
              <span className="text-[11px] font-bold text-indigo-700">방 담당</span>
              <span className="text-[10px] text-indigo-500">{roomLabel}</span>
              <span className="ml-auto text-[10px] text-indigo-500">{roomRecords.length}명</span>
            </div>
            <div className="p-3 space-y-2">
              {roomRecords.map(record => (
                <MedicationPatientCard
                  key={record.id}
                  record={record}
                  today={today}
                  filterTimes={activeRoomTimes}
                  accentColor="indigo"
                  responsibleName={record.unitMentor || undefined}
                  currentUserName={currentUserName}
                  onCheck={(si, t, checked) => onCheck(record, si, t, checked)}
                  onSkipDate={onSkipDate ? (si, isSkip) => onSkipDate(record, si, isSkip) : undefined}
                  onRequestConfirm={(si, time, medName) => setConfirmPending({ record, si, time, medName })}
                  onViewPhoto={url => setLightboxUrl(url)}
                />
              ))}
            </div>
          </div>
        )}
        {/* 반 담당 섹션 */}
        {activeClassTimes.length > 0 && classRecords.length > 0 && (
          <div>
            <div className="sticky top-0 z-10 bg-orange-50 border-b border-orange-100 px-4 py-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />
              <span className="text-[11px] font-bold text-orange-700">반 담당</span>
              <span className="text-[10px] text-orange-500">{classLabel}</span>
              <span className="ml-auto text-[10px] text-orange-500">{classRecords.length}명</span>
            </div>
            <div className="p-3 space-y-2">
              {classRecords.map(record => (
                <MedicationPatientCard
                  key={record.id}
                  record={record}
                  today={today}
                  filterTimes={activeClassTimes}
                  accentColor="orange"
                  responsibleName={record.classMentor || undefined}
                  currentUserName={currentUserName}
                  onCheck={(si, t, checked) => onCheck(record, si, t, checked)}
                  onSkipDate={onSkipDate ? (si, isSkip) => onSkipDate(record, si, isSkip) : undefined}
                  onRequestConfirm={(si, time, medName) => setConfirmPending({ record, si, time, medName })}
                  onViewPhoto={url => setLightboxUrl(url)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MedicationPatientCard({
  record, today, filterTimes, accentColor = 'orange', responsibleName, currentUserName, onCheck, onSkipDate, onRequestConfirm, onViewPhoto,
}: {
  record: PatientRecord;
  today: string;
  /** 이 섹션에서 표시할 시간대만 필터 (없으면 전체 표시) */
  filterTimes?: MedicationTime[];
  /** 섹션 색상 테마 */
  accentColor?: 'orange' | 'indigo';
  /** 이 섹션의 담당자 이름 (방담당=unitMentor, 반담당=classMentor) */
  responsibleName?: string;
  /** 현재 로그인 사용자 이름 (체커 표시용) */
  currentUserName?: string;
  onCheck: (si: number, t: MedicationTime, checked: boolean) => void;
  onSkipDate?: (si: number, isCurrentlySkip: boolean) => void;
  /** 체크 버튼 클릭 시 확인 모달 요청 */
  onRequestConfirm?: (si: number, time: MedicationTime, medName: string) => void;
  /** 약 사진 라이트박스 요청 */
  onViewPhoto?: (url: string) => void;
}) {
  // 약별 사진 토글 상태 (열린 schedIdx set)
  const [openPhotoIdxs, setOpenPhotoIdxs] = useState<Set<number>>(new Set());
  const togglePhotoPanel = (idx: number) =>
    setOpenPhotoIdxs(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });

  // filterTimes가 있으면 해당 시간대를 포함하는 스케줄만 표시 (휴약일 제외)
  const todaySchedules = (record.medicationSchedules ?? [])
    .map((s, idx) => ({ ...s, idx }))
    .filter(s => {
      if (!isInDateRange(s.startDate, s.endDate, today)) return false;
      if (!filterTimes) return true;
      return s.times.some(t => filterTimes.includes(t));
    });

  // firstTime/lastTime 비활성화 여부 (카드 헤더 집계용)
  const isTimeDisabledForCard = (s: MedicationSchedule & { idx: number }, t: MedicationTime) => {
    const ORDER = MEDICATION_TIMES;
    const i = ORDER.indexOf(t);
    const firstIdx = s.firstTime ? ORDER.indexOf(s.firstTime) : -1;
    const lastIdx  = s.lastTime  ? ORDER.indexOf(s.lastTime)  : -1;
    if (today === s.startDate && firstIdx >= 0 && i < firstIdx) return true;
    if (today === s.endDate   && lastIdx  >= 0 && i > lastIdx)  return true;
    return false;
  };

  // 휴약일인 스케줄은 진행률 집계에서 제외, 비활성 시간도 제외
  const todayTotal = todaySchedules.reduce((sum, s) => {
    if (isSkipDate(s, today)) return sum;
    const relevantTimes = (filterTimes ? s.times.filter(t => filterTimes.includes(t)) : s.times)
      .filter(t => !isTimeDisabledForCard(s, t));
    return sum + relevantTimes.length;
  }, 0);
  const todayDone = todaySchedules.reduce((sum, s) => {
    if (isSkipDate(s, today)) return sum;
    const relevantTimes = (filterTimes ? s.times.filter(t => filterTimes.includes(t)) : s.times)
      .filter(t => !isTimeDisabledForCard(s, t));
    return sum + relevantTimes.filter(t => s.checkedTimes.includes(makeMedTimeKey(t, today))).length;
  }, 0);
  const allDone = todayTotal > 0 && todayDone === todayTotal;

  const accent = accentColor === 'indigo'
    ? { border: 'border-indigo-100', dot: 'bg-indigo-400', badge: 'bg-indigo-50 text-indigo-700', name: 'text-indigo-700', bar: 'bg-indigo-300', btnHover: 'hover:border-indigo-300 hover:text-indigo-600' }
    : { border: 'border-orange-100', dot: 'bg-orange-400', badge: 'bg-orange-50 text-orange-700', name: 'text-orange-700', bar: 'bg-orange-300', btnHover: 'hover:border-orange-300 hover:text-orange-600' };

  return (
    <div className={`bg-white rounded-xl border p-3 space-y-2.5 ${allDone ? 'border-green-200' : accent.border}`}>
      {/* 환자 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${allDone ? 'bg-green-400' : accent.dot}`} />
          <span className="text-sm font-bold text-gray-900">{record.studentName}</span>
          {record.grade && <span className="text-xs text-gray-400">{record.grade}</span>}
          {record.className && (
            <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{fmtClass(record.className)}</span>
          )}
          {record.roomNumber && (
            <span className="text-xs bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded">{record.roomNumber}호</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* 담당자 표시 */}
          {responsibleName && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${accent.badge}`}>
              담당: {responsibleName}
            </span>
          )}
          {allDone ? (
            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">완료 ✓</span>
          ) : (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${accent.badge}`}>{todayDone}/{todayTotal}회</span>
          )}
        </div>
      </div>

      {/* 약별 복용 체크 */}
      <div className="space-y-2">
        {todaySchedules.map((sched) => {
          const skipToday = isSkipDate(sched, today);

          // firstTime / lastTime 비활성 판단
          const ORDER = MEDICATION_TIMES;
          const firstIdx = sched.firstTime ? ORDER.indexOf(sched.firstTime) : -1;
          const lastIdx  = sched.lastTime  ? ORDER.indexOf(sched.lastTime)  : -1;
          const isStartDay = today === sched.startDate;
          const isEndDay   = today === sched.endDate;
          const isTimeDisabledHere = (t: MedicationTime) => {
            const i = ORDER.indexOf(t);
            if (isStartDay && firstIdx >= 0 && i < firstIdx) return true;
            if (isEndDay   && lastIdx  >= 0 && i > lastIdx)  return true;
            return false;
          };

          // filterTimes에 해당하고 MEDICATION_TIMES 순서로 정렬
          const visibleTimes = ORDER.filter(t =>
            sched.times.includes(t) && (!filterTimes || filterTimes.includes(t))
          );
          const schedDone = visibleTimes
            .filter(t => !isTimeDisabledHere(t))
            .filter(t => sched.checkedTimes.includes(makeMedTimeKey(t, today))).length;
          const schedPct = visibleTimes.length > 0 ? Math.round((schedDone / visibleTimes.length) * 100) : 0;
          return (
            <div key={sched.idx} className={`space-y-1.5 ${skipToday ? 'opacity-50' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[11px] font-semibold ${accent.name}`}>{sched.name}</span>
                  {/* 복용 패턴 배지 */}
                  {sched.endDateAuto && (
                    <span className="text-[9px] bg-orange-50 text-orange-600 px-1 py-0.5 rounded border border-orange-200">📌캠프끝</span>
                  )}
                  {sched.daysPerWeek && (
                    <span className="text-[9px] bg-gray-50 text-gray-500 px-1 py-0.5 rounded border border-gray-200">주{sched.daysPerWeek}일</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {/* 오늘 휴약일 토글 버튼 */}
                  {onSkipDate && (
                    <button
                      onClick={() => onSkipDate(sched.idx, skipToday)}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                        skipToday
                          ? 'bg-gray-200 text-gray-600 border-gray-300 hover:bg-gray-100'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-400 hover:text-gray-600'
                      }`}
                      title={skipToday ? '휴약일 취소' : '오늘 휴약일 지정'}
                    >
                      {skipToday ? '휴약일 ✕' : '휴약일'}
                    </button>
                  )}
                  <span className="text-[10px] text-gray-400">전체 {sched.checkedTimes.length}/{calcTotalDoses(sched)}회</span>
                </div>
              </div>
              {/* 휴약일이면 버튼 대신 안내 표시 */}
              {skipToday ? (
                <div className="flex items-center gap-1.5 px-2 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                  <span className="text-[10px] text-gray-500">💤 오늘은 휴약일입니다</span>
                </div>
              ) : (
                /* 해당 섹션 시간대 버튼만 표시 */
                <div className="flex gap-1.5 flex-wrap">
                  {visibleTimes.map(time => {
                    const key = makeMedTimeKey(time, today);
                    const checked = sched.checkedTimes.includes(key);
                    const checkerName = sched.checkedBy?.[key];
                    const disabled = isTimeDisabledHere(time);
                    if (disabled) return (
                      <div key={time} className="flex items-center gap-1">
                        <span
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border bg-gray-100 text-gray-300 border-gray-100 line-through cursor-not-allowed"
                          title={isStartDay && firstIdx >= 0 && MEDICATION_TIMES.indexOf(time) < firstIdx
                            ? `${sched.firstTime}부터 복용`
                            : `${sched.lastTime}까지 복용`}
                        >{time}</span>
                      </div>
                    );
                    return (
                      <div key={time} className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            if (checked) {
                              // 체크 해제는 바로 처리
                              onCheck(sched.idx, time, true);
                            } else {
                              // 체크는 확인 모달 먼저
                              onRequestConfirm?.(sched.idx, time, sched.name);
                            }
                          }}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                            checked
                              ? 'bg-green-500 text-white border-green-500 shadow-sm'
                              : `bg-white text-gray-500 border-gray-200 ${accent.btnHover}`
                          }`}
                        >
                          {checked && <span className="text-[10px]">✓</span>}
                          {time}
                        </button>
                        {/* 체커 이름 */}
                        {checked && checkerName && (
                          <span className={`text-[9px] font-medium whitespace-nowrap ${
                            checkerName === currentUserName ? 'text-green-600' : 'text-gray-400'
                          }`}>
                            {checkerName}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* 잔량 바 (전체 기간 기준) */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${schedPct >= 100 ? 'bg-green-400' : accent.bar}`}
                    style={{ width: `${Math.min(100, Math.round((sched.checkedTimes.length / Math.max(1, calcTotalDoses(sched))) * 100))}%` }}
                  />
                </div>
                <span className="text-[9px] text-gray-400 flex-shrink-0 text-right whitespace-nowrap">
                  {sched.endDateAuto
                    ? '📌캠프끝'
                    : sched.lastTime
                      ? `~${sched.endDate} (${sched.lastTime})`
                      : `~${sched.endDate}`}
                </span>
              </div>

              {/* 약 사진 토글 */}
              {(() => {
                const photos = Array.isArray(sched.photos) ? sched.photos : [];
                if (photos.length === 0) return null;
                const isOpen = openPhotoIdxs.has(sched.idx);
                return (
                  <div className="pt-2 border-t border-black/5 mt-1.5">
                    <button
                      type="button"
                      onClick={() => togglePhotoPanel(sched.idx)}
                      className="flex items-center gap-1.5 text-[10px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <span>🖼️ 약 사진 보기</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[9px] font-bold">
                        {photos.length}
                      </span>
                      <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                    </button>
                    {isOpen && (
                      <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                        {photos.map((url, pi) => (
                          <div key={pi} className="aspect-[3/4] rounded-lg overflow-hidden border border-gray-200 bg-gray-50 cursor-pointer"
                            onClick={() => onViewPhoto?.(url)}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`약 사진 ${pi + 1}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== 복용약 탭 ====================

/** checkedTimes에서 실제 체크된 날짜 목록 추출 (중복 제거, 내림차순) */
function extractCheckedDates(checkedTimes: string[]): string[] {
  const dates = new Set<string>();
  for (const key of checkedTimes) {
    // key 형식: "기상후_20260905"
    const parts = key.split('_');
    const raw = parts[parts.length - 1]; // 날짜 부분 (YYYYMMDD)
    if (raw && raw.length === 8) {
      dates.add(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`);
    }
  }
  return Array.from(dates).sort((a, b) => b.localeCompare(a)); // 최신 우선
}

/** 날짜 표시 레이블 */
function dateLabel(date: string, today: string): string {
  if (date === today) return '오늘';
  const diff = Math.round((new Date(today).getTime() - new Date(date).getTime()) / 86400000);
  if (diff === 1) return '어제';
  const [, mm, dd] = date.split('-');
  return `${mm}/${dd}`;
}

function MedicationSection({ schedules, today, unitMentor, classMentor, onCheck, onAddSchedule, onUpdateSchedule, onRemoveSchedule, onUploadMedPhoto, onRemoveMedPhoto, compact }: {
  schedules: MedicationSchedule[];
  today: string;
  unitMentor?: string;
  classMentor?: string;
  onCheck: (si: number, t: MedicationTime, checked: boolean) => void;
  onAddSchedule?: (s: Omit<MedicationSchedule, 'checkedTimes'>) => void;
  onUpdateSchedule?: (idx: number, s: Omit<MedicationSchedule, 'checkedTimes'>) => void;
  onRemoveSchedule?: (idx: number) => void;
  /** 약별 처방전 사진 업로드 */
  onUploadMedPhoto?: (schedIdx: number, file: File) => Promise<string>;
  /** 약별 처방전 사진 삭제 */
  onRemoveMedPhoto?: (schedIdx: number, url: string) => void;
  /** true = 현황 탭 내 카드 뷰 (담당 섹션·섹션 레이블 숨김) */
  compact?: boolean;
}) {
  const roomTimeSet = new Set<string>(ROOM_TIMES);

  // ── 약 추가/수정 폼 상태 ─────────────────────────────────────
  const EMPTY_SCHED = (): Omit<MedicationSchedule, 'checkedTimes'> => ({
    name: '',
    category: undefined,
    memo: '',
    times: [],
    startDate: today,
    endDate: today,
    endDateAuto: false,
    firstTime: undefined,
    lastTime: undefined,
    totalDoses: 0,
  });

  const [showForm, setShowForm] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [formData, setFormData] = useState<Omit<MedicationSchedule, 'checkedTimes'>>(EMPTY_SCHED());
  // "며칠동안" 편의 입력 (dayCount → endDate 자동 계산)
  const [dayCount, setDayCount] = useState('1');

  // 약 사진 (약별)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  // 약별 사진 토글 (열려있는 schedIdx set)
  const [openPhotoIdxs, setOpenPhotoIdxs] = useState<Set<number>>(new Set());
  const togglePhotoPanel = (idx: number) =>
    setOpenPhotoIdxs(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  // crop 모달: 어느 약(schedIdx)에 대해 어떤 파일을 crop 중인지
  const [cropState, setCropState] = useState<{ schedIdx: number; file: File } | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  // 각 약별 파일 input ref (동적으로 생성)
  const photoInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const openAdd = () => {
    setFormData(EMPTY_SCHED());
    setDayCount('1');
    setEditingIdx(null);
    setShowForm(true);
  };
  const openEdit = (idx: number) => {
    const s = schedules[idx];
    setFormData({
      name: s.name, category: s.category, memo: s.memo ?? '',
      times: s.times, startDate: s.startDate, endDate: s.endDate,
      endDateAuto: s.endDateAuto ?? false,
      firstTime: s.firstTime, lastTime: s.lastTime,
      daysPerWeek: s.daysPerWeek, skipDates: s.skipDates,
      totalDoses: s.totalDoses,
    });
    // dayCount 역산
    const diff = Math.round((new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 86400000) + 1;
    setDayCount(String(diff));
    setEditingIdx(idx);
    setShowForm(true);
  };

  // dayCount 변경 시 endDate 자동 갱신
  const handleDayCount = (val: string) => {
    setDayCount(val);
    const n = parseInt(val);
    if (!isNaN(n) && n >= 1) {
      const start = new Date(formData.startDate);
      start.setDate(start.getDate() + n - 1);
      setFormData(f => ({ ...f, endDate: start.toISOString().slice(0, 10) }));
    }
  };

  // times 토글
  const toggleTime = (t: MedicationTime) =>
    setFormData(f => ({
      ...f,
      times: f.times.includes(t) ? f.times.filter(x => x !== t) : [...f.times, t],
    }));

  // totalDoses 자동 계산 (days × times per day)
  const calcDoses = (f: Omit<MedicationSchedule, 'checkedTimes'>, days: number) =>
    f.endDateAuto ? 0 : days * f.times.length;

  const handleSubmit = () => {
    if (formData.times.length === 0) return;
    const days = parseInt(dayCount) || 1;
    const final: Omit<MedicationSchedule, 'checkedTimes'> = {
      ...formData,
      totalDoses: formData.endDateAuto ? 0 : calcDoses(formData, days),
      firstTime: formData.endDateAuto ? undefined : formData.firstTime,
      lastTime: formData.endDateAuto ? undefined : formData.lastTime,
    };
    if (editingIdx !== null) {
      onUpdateSchedule?.(editingIdx, final);
    } else {
      onAddSchedule?.(final);
    }
    setShowForm(false);
    setEditingIdx(null);
  };

  // 조회 날짜 선택 (기본: 오늘)
  const [viewDate, setViewDate] = useState(today);

  // 체크 기록이 있는 날짜 전체 취합
  const allCheckedDates = useMemo(() => {
    const dateSet = new Set<string>([today]);
    for (const sched of schedules) {
      for (const d of extractCheckedDates(sched.checkedTimes)) {
        dateSet.add(d);
      }
    }
    // 스케줄 범위 내 날짜 추가 (시작~오늘)
    for (const sched of schedules) {
      if (!sched.startDate) continue;
      const start = new Date(sched.startDate);
      const end = new Date(today);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        dateSet.add(iso);
      }
    }
    return Array.from(dateSet).sort((a, b) => b.localeCompare(a));
  }, [schedules, today]);

  const isViewingToday = viewDate === today;

  // 기간제 약 (현황 탭에도 뜨는 약) vs 상시 복용약 (캠프 끝까지)
  const tempSchedules = schedules.map((s, idx) => ({ ...s, idx })).filter(s => !s.endDateAuto);
  const dailySchedules = schedules.map((s, idx) => ({ ...s, idx })).filter(s => s.endDateAuto);

  return (
    <div className="space-y-3">
      {/* ── Crop 모달 ────────────────────────────────────── */}
      {cropState && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-4 pt-4 pb-2 border-b border-gray-100">
              <p className="text-sm font-bold text-gray-800">🖼️ 약 사진 편집</p>
              <p className="text-xs text-gray-400 mt-0.5">영역을 선택하거나 그대로 적용하세요</p>
            </div>
            <ImageCropperWrapper
              file={cropState.file}
              onCropComplete={async (croppedFile) => {
                if (!onUploadMedPhoto) return;
                setPhotoUploading(true);
                try {
                  await onUploadMedPhoto(cropState.schedIdx, croppedFile);
                } finally {
                  setPhotoUploading(false);
                  setCropState(null);
                }
              }}
              onCancel={() => setCropState(null)}
            />
            {photoUploading && (
              <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                <p className="text-sm text-gray-600 font-medium">업로드 중…</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 라이트박스 */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt="약 사진 확대"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={e => e.stopPropagation()}
          />
          <button
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 text-white text-lg flex items-center justify-center hover:bg-white/30 transition"
            onClick={() => setLightboxUrl(null)}
          >✕</button>
        </div>
      )}

      {/* ── 약 추가/수정 모달 ─────────────────────────────── */}
      <button type="button" onClick={openAdd}
        className="w-full py-1.5 text-xs font-medium text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg border border-dashed border-orange-300 transition-colors">
        + 복용약 추가
      </button>

      {showForm && (
        <TabFormModal
          title={editingIdx !== null ? '약 수정' : '복용약 추가'}
          icon="💊"
          onClose={() => { setShowForm(false); setEditingIdx(null); }}
          onSubmit={handleSubmit}
          submitLabel={editingIdx !== null ? '수정 완료' : '추가'}
          submitColor="orange"
        >
          {/* 약 이름 */}
          <div>
            <p className="text-[10px] text-gray-500 mb-1">약 이름 <span className="text-gray-400">(선택)</span></p>
            <input type="text" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
              placeholder="약 이름 입력 (없으면 생략 가능)"
              className="w-full text-[11px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-orange-400 bg-white" />
          </div>

          {/* 종류 */}
          <div>
            <p className="text-[10px] text-gray-500 mb-1">종류</p>
            <div className="flex flex-wrap gap-1">
              {MEDICATION_CATEGORIES.map(cat => (
                <button key={cat} type="button"
                  onClick={() => setFormData(f => ({ ...f, category: f.category === cat ? undefined : cat }))}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    formData.category === cat ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>{cat}</button>
              ))}
            </div>
          </div>

          {/* 복용 시간 */}
          <div>
            <p className="text-[10px] text-gray-500 mb-1">복용 시간 * (중복 선택)</p>
            <div className="flex flex-wrap gap-1">
              {MEDICATION_TIMES.map(t => (
                <button key={t} type="button" onClick={() => toggleTime(t)}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                    formData.times.includes(t) ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>{t}</button>
              ))}
            </div>
          </div>

          {/* 복용 기간 */}
          <div>
            <p className="text-[10px] text-gray-500 mb-1">복용 기간</p>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={!!formData.endDateAuto}
                  onChange={e => setFormData(f => ({ ...f, endDateAuto: e.target.checked, lastTime: undefined }))}
                  className="w-3 h-3 accent-orange-500" />
                <span className="text-[10px] text-gray-600 font-medium">캠프 끝까지</span>
              </label>
              {!formData.endDateAuto && (
                <>
                  <div className="flex items-center gap-1">
                    <input type="number" value={dayCount} min="1" max="30" onChange={e => handleDayCount(e.target.value)}
                      className="w-12 text-[11px] border border-gray-200 rounded px-1.5 py-0.5 outline-none focus:border-orange-400 bg-white text-center" />
                    <span className="text-[10px] text-gray-500">일</span>
                  </div>
                  <span className="text-[10px] text-gray-400">{formData.startDate} ~ {formData.endDate}</span>
                </>
              )}
            </div>

            {!formData.endDateAuto && formData.times.length > 0 && (
              <div className="mt-1.5">
                <p className="text-[9px] text-gray-400 mb-1">시작 날({formData.startDate}) 시작 시간</p>
                <div className="flex flex-wrap gap-1">
                  {MEDICATION_TIMES.filter(t => formData.times.includes(t)).map(t => (
                    <button key={t} type="button" onClick={() => setFormData(f => ({ ...f, firstTime: t }))}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                        formData.firstTime === t ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>{t}부터</button>
                  ))}
                </div>
              </div>
            )}

            {!formData.endDateAuto && parseInt(dayCount) > 1 && formData.times.length > 0 && (
              <div className="mt-1.5">
                <p className="text-[9px] text-gray-400 mb-1">마지막 날({formData.endDate}) 마감 시간</p>
                <div className="flex flex-wrap gap-1">
                  {MEDICATION_TIMES.filter(t => formData.times.includes(t)).map(t => (
                    <button key={t} type="button" onClick={() => setFormData(f => ({ ...f, lastTime: t }))}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                        formData.lastTime === t ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>{t}까지</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 메모 */}
          <div>
            <p className="text-[10px] text-gray-500 mb-1">메모</p>
            <input type="text" value={formData.memo ?? ''} onChange={e => setFormData(f => ({ ...f, memo: e.target.value }))}
              placeholder="예: 식후 30분, 물 충분히"
              className="w-full text-[11px] border border-gray-200 rounded px-2 py-1 outline-none focus:border-orange-400 bg-white" />
          </div>
        </TabFormModal>
      )}

      {schedules.length === 0 && !showForm && (
        <p className="text-xs text-gray-400 text-center py-2">복용약 일정이 없습니다.</p>
      )}

      {/* 담당자 정보 요약 (약복용명단 탭에서만 표시) */}
      {!compact && (unitMentor || classMentor) && (
        <div className="flex gap-2 flex-wrap">
          {unitMentor && (
            <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 rounded-lg px-2.5 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
              <span className="text-[10px] text-indigo-600 font-medium">방담당</span>
              <span className="text-[11px] font-bold text-indigo-800">{unitMentor}</span>
              <span className="text-[9px] text-indigo-400">(기상후·취침전)</span>
            </div>
          )}
          {classMentor && (
            <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-100 rounded-lg px-2.5 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
              <span className="text-[10px] text-orange-600 font-medium">반담당</span>
              <span className="text-[11px] font-bold text-orange-800">{classMentor}</span>
              <span className="text-[9px] text-orange-400">(조식후·중식후·석식후)</span>
            </div>
          )}
        </div>
      )}

      {/* 날짜 선택 슬라이더 */}
      <div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {allCheckedDates.map(date => {
            const isToday = date === today;
            const isSelected = date === viewDate;
            // 해당 날짜에 체크된 약이 있는지
            const hasCheck = schedules.some(s =>
              s.times.some(t => s.checkedTimes.includes(makeMedTimeKey(t, date)))
            );
            return (
              <button
                key={date}
                onClick={() => setViewDate(date)}
                className={`flex-shrink-0 flex flex-col items-center px-2.5 py-1.5 rounded-lg border text-[10px] font-bold transition-all ${
                  isSelected
                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'
                }`}
              >
                <span>{dateLabel(date, today)}</span>
                {hasCheck && (
                  <span className={`text-[8px] mt-0.5 ${isSelected ? 'text-orange-100' : 'text-green-500'}`}>✓</span>
                )}
                {isToday && !isSelected && (
                  <span className="text-[8px] text-orange-400 mt-0.5">●</span>
                )}
              </button>
            );
          })}
        </div>
        {!isViewingToday && (
          <p className="text-[10px] text-orange-500 font-medium mt-1">
            📅 {viewDate} 복용 기록 조회 중 — 과거 기록은 수정할 수 없습니다
          </p>
        )}
      </div>

      {/* 기간제 약 (현황 탭에도 표시되는 약) */}
      {tempSchedules.length > 0 && (
        <div className="space-y-2">
          {!compact && (
            <p className="text-[10px] font-bold text-orange-600 flex items-center gap-1">
              ⏱ 기간 복용 <span className="font-normal text-gray-400">— 현황 탭 뱃지에도 표시됨</span>
            </p>
          )}
          {tempSchedules.map(sched => renderSchedCard(sched, sched.idx))}
        </div>
      )}

      {/* 상시 복용약 (캠프 끝까지 — 현황 탭 제외) */}
      {dailySchedules.length > 0 && (
        <div className="space-y-2">
          {!compact && (
            <p className="text-[10px] font-bold text-blue-600 flex items-center gap-1">
              📌 상시 복용 <span className="font-normal text-gray-400">— 현황 탭 뱃지 미표시 (약복용명단에서만 관리)</span>
            </p>
          )}
          {dailySchedules.map(sched => renderSchedCard(sched, sched.idx, true))}
        </div>
      )}
    </div>
  );

  function renderSchedCard(sched: MedicationSchedule & { idx: number }, idx: number, isDaily = false) {
    const totalDoses = calcTotalDoses(sched);
    const totalDone = sched.checkedTimes.length;
    const pct = totalDoses > 0 ? Math.min(100, Math.round((totalDone / totalDoses) * 100)) : 0;
    const isActiveOnDate = isInDateRange(sched.startDate, sched.endDate, viewDate);

    const hasRoomTime = sched.times.some(t => roomTimeSet.has(t));
    const hasClassTime = sched.times.some(t => !roomTimeSet.has(t));
    const responsibleLabel =
      hasRoomTime && hasClassTime ? `방담당(${unitMentor ?? '-'}) · 반담당(${classMentor ?? '-'})` :
      hasRoomTime ? `방담당 (${unitMentor ?? '-'})` :
      hasClassTime ? `반담당 (${classMentor ?? '-'})` : '';

    const accentBg = isDaily ? 'bg-blue-50 border-blue-100' : 'bg-orange-50 border-orange-100';
    const accentBar = isDaily ? 'bg-blue-400' : 'bg-orange-400';
    const accentText = isDaily ? 'text-blue-700' : 'text-orange-700';
    const accentSub = isDaily ? 'text-blue-500' : 'text-orange-600';

    // firstTime / lastTime 비활성화 로직
    const ORDER = MEDICATION_TIMES;
    // 시작 날: firstTime 이전 시간 비활성
    const firstTimeIdx = sched.firstTime ? ORDER.indexOf(sched.firstTime) : -1;
    const isFirstDay = viewDate === sched.startDate && firstTimeIdx >= 0;
    const isTimeDisabledByFirstTime = (time: MedicationTime) =>
      isFirstDay && ORDER.indexOf(time) < firstTimeIdx;
    // 마지막 날: lastTime 이후 시간 비활성
    const lastTimeIdx = sched.lastTime ? ORDER.indexOf(sched.lastTime) : -1;
    const isLastDay = viewDate === sched.endDate && lastTimeIdx >= 0;
    const isTimeDisabledByLastTime = (time: MedicationTime) =>
      isLastDay && ORDER.indexOf(time) > lastTimeIdx;

    const isTimeDisabled = (time: MedicationTime) =>
      isTimeDisabledByFirstTime(time) || isTimeDisabledByLastTime(time);

    return (
      <div key={idx} className={`rounded-lg border p-3 ${isActiveOnDate ? accentBg : 'bg-gray-50 border-gray-100 opacity-60'}`}>
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-1">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className={`text-[11px] font-semibold ${accentText}`}>{sched.name}</p>
              {sched.category && (
                <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-[9px] text-gray-500 font-medium">{sched.category}</span>
              )}
            </div>
            {sched.memo && (
              <p className="text-[10px] text-gray-400 mt-0.5">📝 {sched.memo}</p>
            )}
          </div>
          {/* 수정/삭제 버튼 */}
          <div className="flex gap-1 ml-2 flex-shrink-0">
            <button type="button"
              onClick={() => openEdit(idx)}
              className="p-1 rounded text-gray-400 hover:text-orange-500 hover:bg-orange-100 transition-colors text-[11px]"
              title="수정">✏️</button>
            <button type="button"
              onClick={() => { if (window.confirm(`"${sched.name}" 복용약을 삭제할까요?`)) onRemoveSchedule?.(idx); }}
              className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors text-[11px]"
              title="삭제">🗑️</button>
          </div>
        </div>

        {/* 진행도 */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-400 flex items-center gap-1 flex-wrap">
            {/* 기간 표기: startDate(firstTime부터) ~ endDate(lastTime까지) */}
            {isDaily ? (
              <span>📌 {sched.startDate}{sched.firstTime ? ` (${sched.firstTime}~)` : ''} ~ 캠프끝</span>
            ) : (
              <span>
                {sched.startDate}{sched.firstTime ? <span className="text-teal-500"> ({sched.firstTime}~)</span> : ''}
                {' ~ '}
                {sched.endDate}{sched.lastTime ? <span className="text-orange-400"> (~{sched.lastTime})</span> : ''}
              </span>
            )}
            {!isActiveOnDate && <span className="text-gray-300">(해당일 복용 없음)</span>}
          </span>
          <span className={`text-[10px] ${accentSub}`}>{totalDone}/{totalDoses}회 ({pct}%)</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : accentBar}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {responsibleLabel && (
          <p className="text-[10px] text-gray-500 mb-2">담당: {responsibleLabel}</p>
        )}

        {/* 복용 시간 버튼 */}
        {isActiveOnDate && (
          <div className="flex gap-1.5 flex-wrap">
            {sched.times.map(time => {
              const key = makeMedTimeKey(time, viewDate);
              const checked = sched.checkedTimes.includes(key);
              const isRoom = roomTimeSet.has(time);
              const disabled = isTimeDisabled(time);
              const canCheck = isViewingToday && !disabled;
              const disabledTitle = isTimeDisabledByFirstTime(time)
                ? `${sched.firstTime}부터 복용`
                : isTimeDisabledByLastTime(time)
                  ? `${sched.lastTime}까지 복용`
                  : undefined;
              return (
                <button
                  key={time}
                  onClick={() => canCheck ? onCheck(idx, time, checked) : undefined}
                  disabled={!canCheck}
                  title={disabledTitle}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                    disabled
                      ? 'bg-gray-100 text-gray-300 border-gray-100 cursor-not-allowed line-through'
                      : checked
                        ? 'bg-green-500 text-white border-green-500'
                        : canCheck
                          ? isRoom
                            ? 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:border-indigo-400'
                            : isDaily
                              ? 'bg-blue-50 text-blue-600 border-blue-200 hover:border-blue-400'
                              : 'bg-orange-50 text-orange-600 border-orange-200 hover:border-orange-400'
                          : 'bg-gray-50 text-gray-400 border-gray-200 cursor-default'
                  }`}
                >
                  {checked && !disabled && <span>✓</span>}
                  {time}
                  {!isViewingToday && checked && <span className="text-[9px] opacity-70">완료</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* ── 약 사진 ─────────────────────────────────────── */}
        {(() => {
          const photos = Array.isArray(sched.photos) ? sched.photos : [];
          const isOpen = openPhotoIdxs.has(idx);
          return (
            <div className="pt-2 border-t border-black/5 mt-2">
              {/* 토글 버튼 행 */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => togglePhotoPanel(idx)}
                  className="flex items-center gap-1.5 text-[10px] font-medium text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <span>🖼️ 약 사진</span>
                  {photos.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[9px] font-bold">
                      {photos.length}
                    </span>
                  )}
                  <span className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                </button>
                {onUploadMedPhoto && isOpen && (
                  <label className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-medium cursor-pointer bg-white text-gray-500 border border-dashed border-gray-300 hover:border-orange-400 hover:text-orange-600 transition-colors">
                    + 사진 추가
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      ref={(el) => {
                        if (el) photoInputRefs.current.set(idx, el);
                        else photoInputRefs.current.delete(idx);
                      }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setCropState({ schedIdx: idx, file });
                        const inputEl = photoInputRefs.current.get(idx);
                        if (inputEl) inputEl.value = '';
                      }}
                    />
                  </label>
                )}
              </div>

              {/* 사진 패널 (열렸을 때만) */}
              {isOpen && (
                <div className="mt-1.5">
                  {photos.length === 0 ? (
                    <p className="text-[10px] text-gray-300 text-center py-2">사진이 없습니다</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5">
                      {photos.map((url, pi) => (
                        <div key={pi} className="relative group aspect-[3/4] rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt={`약 사진 ${pi + 1}`}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setLightboxUrl(url)}
                          />
                          {onRemoveMedPhoto && (
                            <button
                              type="button"
                              onClick={() => { if (window.confirm('이 사진을 삭제할까요?')) onRemoveMedPhoto(idx, url); }}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >✕</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  }
}

// ==================== 부모님 연락 ====================

// ==================== 부모 연락 프리셋 ====================

// 보고 유형 정의
const REPORT_TYPE_OPTIONS: { id: ContactReportType; label: string; color: string }[] = [
  { id: '최초보고',  label: '최초보고',  color: 'bg-blue-500' },
  { id: '경과보고',  label: '경과보고',  color: 'bg-orange-400' },
  { id: '내원예정',  label: '내원예정',  color: 'bg-purple-500' },
  { id: '내원결과',  label: '내원결과',  color: 'bg-indigo-500' },
  { id: '완치보고',  label: '완치보고',  color: 'bg-green-500' },
];

// 부모연락 담당자 이름: 지정된 담당자 > 반멘토 > '담임' 순서로 fallback
function getPresetSenderName(r: PatientRecord): string {
  return r.parentContactAssigneeName ?? r.classMentor ?? '담임';
}

// 복용약 목록: medicationSchedules 약 이름 → medication 메모 → '없음' 순서로 fallback
function getPresetMedication(r: PatientRecord): string {
  const names = (r.medicationSchedules ?? [])
    .map(s => s.name?.trim())
    .filter((n): n is string => !!n);
  if (names.length > 0) return names.join(', ');
  const memo = r.medication?.trim();
  if (memo) return memo;
  return '없음';
}

// 값이 없거나 빈 문자열이면 대체 텍스트 반환
function orFallback(value: string | undefined, fallback = '없음'): string {
  return value?.trim() || fallback;
}

const SMS_PRESETS: { label: string; reportType: ContactReportType; text: (r: PatientRecord) => string }[] = [
  {
    label: '최초 보고',
    reportType: '최초보고',
    text: (r) =>
`안녕하세요 어머님, ${getPresetSenderName(r)} 멘토입니다.

증상: ${orFallback(r.symptom)}
복용약: ${getPresetMedication(r)}
조치: ${orFallback(r.treatment)}

차도 없을 시 다시 연락드리겠습니다.`,
  },
  {
    label: '경과 보고',
    reportType: '경과보고',
    text: (r) =>
`안녕하세요 어머님, ${getPresetSenderName(r)} 멘토입니다.

${r.studentName} 학생 상태가 많이 호전되었습니다.
현재 정상적으로 생활하고 있으니 안심하세요.`,
  },
  {
    label: '내원 예정',
    reportType: '내원예정',
    text: (r) =>
`안녕하세요 어머님, ${getPresetSenderName(r)} 멘토입니다.

${r.studentName} 학생 상태를 보다 정확히 확인하기 위해
병원 진료를 받을 예정입니다.
결과 확인 후 다시 연락드리겠습니다.`,
  },
  {
    label: '내원 결과',
    reportType: '내원결과',
    text: (r) =>
`안녕하세요 어머님, ${getPresetSenderName(r)} 멘토입니다.

${r.studentName} 학생 병원 진료 결과를 안내드립니다.
진단명: (직접 입력)
처방: (직접 입력)

추가 사항은 연락드리겠습니다.`,
  },
  {
    label: '완치 보고',
    reportType: '완치보고',
    text: (r) =>
`안녕하세요 어머님, ${getPresetSenderName(r)} 멘토입니다.

${r.studentName} 학생이 완전히 회복하여 정상 생활 중입니다.
걱정 끼쳐드려 죄송합니다. 감사합니다.`,
  },
];

const CALL_PRESETS: { label: string; reportType: ContactReportType; text: (r: PatientRecord) => string }[] = [
  {
    label: '최초 보고',
    reportType: '최초보고',
    text: (r) =>
`"안녕하세요 어머님, ${getPresetSenderName(r)} 멘토입니다.
${r.studentName} 학생 보호자분 맞으신가요?

증상: ${orFallback(r.symptom)}
복용약: ${getPresetMedication(r)}
조치: ${orFallback(r.treatment)}

차도 없을 시 다시 연락드리겠습니다."`,
  },
  {
    label: '내원 예정',
    reportType: '내원예정',
    text: (r) =>
`"${r.studentName} 학생이 ${r.symptom} 증상이 있어
병원 진료를 받으려 합니다.
진료 후 결과를 다시 연락드릴게요."`,
  },
  {
    label: '내원 결과',
    reportType: '내원결과',
    text: (r) =>
`"${r.studentName} 학생 진료 결과를 안내드립니다.
진단명은 [  ]이고 [  ] 처방을 받았습니다.
당분간 경과를 지켜보겠습니다."`,
  },
  {
    label: '완치 보고',
    reportType: '완치보고',
    text: (r) =>
`"${r.studentName} 학생이 완전히 회복되었습니다.
걱정 끼쳐드려 죄송하고, 남은 캠프 잘 마치도록 하겠습니다."`,
  },
];

const METHOD_OPTIONS: { id: ContactMethod; label: string; emoji: string }[] = [
  { id: '통화',   label: '통화',   emoji: '📞' },
  { id: '문자',   label: '문자',   emoji: '💬' },
  { id: '카카오', label: '카카오', emoji: '🟡' },
  { id: '기타',   label: '기타',   emoji: '📝' },
];

function ParentContactSection({ record, campUsers, campGroups, currentUserId, currentUserName, currentUserRole }: {
  record: PatientRecord;
  campUsers: User[];
  campGroups: CampGroup[];
  currentUserId: string;
  currentUserName: string;
  currentUserRole?: string;
}) {
  const [showLogForm, setShowLogForm] = useState(false);
  const [method, setMethod] = useState<ContactMethod>('통화');
  const [reportType, setReportType] = useState<ContactReportType>('최초보고');
  const [contactorName, setContactorName] = useState('');
  const [isResolved, setIsResolved] = useState(false);
  const [saving, setSaving] = useState(false);

  // 담당자 지정
  const [showAssigneeSearch, setShowAssigneeSearch] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [assigneeSaving, setAssigneeSaving] = useState(false);

  // 프리셋 패널
  const [presetTab, setPresetTab] = useState<'sms' | 'call' | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const logs = record.parentContactLogs ?? [];
  const isCompleted = logs.some(l => l.isResolved);

  // ── 그룹 찾기: 2단계 fallback ──────────────────────────────
  // 1차: campGroups(campSettings.groups)에서 record.className으로 그룹 식별
  // 2차: campGroups 없으면 campUsers의 jobExperiences.group 필드로 역추적
  //      → 담임 멘토가 속한 group 값이 같은 유저 = 같은 그룹

  // 1차: campSettings 기반 classCodes
  const groupClassCodes = record.className
    ? getSameGroupClassCodes(campGroups, record.className)
    : [];

  // 담임 멘토 유저 + 2차 fallback 그룹 키
  const classMentorUser = campUsers.find(u => u.name === record.classMentor);
  const classMentorGroupKey = classMentorUser?.jobExperiences
    ?.find(je => je.classCode === record.className || je.groupRole === '담임')
    ?.group ?? null;

  // 같은 그룹 소속 유저 결정
  const sameGroupUsers: User[] = (() => {
    if (groupClassCodes.length > 0) {
      // 1차: campSettings classCodes 기반 (가장 정확)
      return campUsers.filter(u =>
        u.jobExperiences?.some(je => groupClassCodes.includes(je.classCode ?? ''))
      );
    }
    if (classMentorGroupKey) {
      // 2차: group 필드 기반 (같은 group 값 = 같은 그룹, 추가 read 0)
      return campUsers.filter(u =>
        u.jobExperiences?.some(je => je.group === classMentorGroupKey)
      );
    }
    return [];
  })();

  // 그룹 내 매니저/부매니저 (groupRole 기준)
  const groupManager = sameGroupUsers.find(u =>
    u.jobExperiences?.some(je => je.groupRole === '매니저')
  );
  const groupSubManager = sameGroupUsers.find(u =>
    u.jobExperiences?.some(je => je.groupRole === '부매니저') && u.id !== groupManager?.id
  );
  // 캠프 전체 최상위 매니저 (admin 역할)
  const campManager = campUsers.find(u => u.role === 'admin');

  // 수정 권한: admin, 본인, 해당 그룹의 매니저/부매니저
  const isManagerOfThisGroup =
    groupManager?.id === currentUserId || groupSubManager?.id === currentUserId;
  const canEditAssignee = currentUserRole === 'admin'
    || isManagerOfThisGroup
    || currentUserId === record.parentContactAssigneeId;

  // 검색어 있을 때만 드롭다운 표시: 전체 campUsers에서 이름 필터링
  const filteredUsers = campUsers.filter(u => u.name.includes(assigneeSearch.trim()));

  // 담당자가 없으면 기본값으로 반멘토 자동 지정 (렌더 시점)
  const effectiveAssigneeName = record.parentContactAssigneeName ?? record.classMentor ?? '';

  const handleAddLog = async () => {
    const actor = contactorName || effectiveAssigneeName || currentUserName;
    setSaving(true);
    try {
      await addParentContactLog(db, record.id, {
        contactedBy: actor,
        contactedById: currentUserId,
        method,
        reportType,
        summary: undefined,
        isResolved: reportType === '완치보고' ? true : isResolved,
      });
      setContactorName('');
      setIsResolved(false);
      setShowLogForm(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveLog = async (log: (typeof logs)[number]) => {
    if (!confirm('이 연락 기록을 삭제하시겠습니까?')) return;
    try {
      await removeParentContactLog(db, record.id, log);
    } catch {
      alert('삭제 중 오류가 발생했습니다.');
    }
  };

  const handleAssignee = async (u: User) => {
    setAssigneeSaving(true);
    try {
      await updateParentContactAssignee(db, record.id, u.id, u.name);
      setShowAssigneeSearch(false);
      setAssigneeSearch('');
    } finally {
      setAssigneeSaving(false);
    }
  };

  // 연락자 버튼 목록: 반멘토, 방멘토, 그룹매니저, 그룹부매니저, 캠프매니저, 본인
  const contactorOptions: { label: string; name: string }[] = [
    ...(record.classMentor ? [{ label: '반멘토', name: record.classMentor }] : []),
    ...(record.unitMentor && record.unitMentor !== record.classMentor
      ? [{ label: '방멘토', name: record.unitMentor }]
      : []),
    ...(groupManager ? [{ label: '그룹 매니저', name: groupManager.name }] : []),
    ...(groupSubManager && groupSubManager.name !== groupManager?.name
      ? [{ label: '그룹 부매니저', name: groupSubManager.name }]
      : []),
    ...(campManager &&
      campManager.name !== groupManager?.name &&
      campManager.name !== groupSubManager?.name
      ? [{ label: '캠프 매니저', name: campManager.name }]
      : []),
    ...(currentUserName &&
      ![ record.classMentor, record.unitMentor, groupManager?.name, groupSubManager?.name, campManager?.name ]
        .includes(currentUserName)
      ? [{ label: '직접(나)', name: currentUserName }]
      : []),
  ].filter((o, i, arr) => arr.findIndex(x => x.name === o.name) === i); // 중복 제거

  const copyPreset = (text: string, idx: number) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    });
  };

  return (
    <div className="space-y-3">

      {/* 담당자 지정 */}
      <div className="rounded-lg bg-pink-50 border border-pink-100 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-pink-800">📞 보호자 연락 담당</p>
          {isCompleted && (
            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold">✓ 완치 보고 완료</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-pink-800">👤 {effectiveAssigneeName || '미지정'}</span>
          {!record.parentContactAssigneeName && (
            <span className="text-[10px] text-pink-400">(반멘토 기본)</span>
          )}
          {canEditAssignee && (
            <button onClick={() => setShowAssigneeSearch(v => !v)}
              className="text-[10px] text-pink-400 hover:text-pink-600 font-medium ml-auto">변경</button>
          )}
        </div>
        {showAssigneeSearch && (
          <div className="relative">
            <input
              type="text"
              value={assigneeSearch}
              onChange={e => setAssigneeSearch(e.target.value)}
              placeholder="이름 검색..."
              className="w-full text-xs border border-pink-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-pink-400 bg-white"
            />
            {assigneeSearch.trim() && filteredUsers.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white border border-pink-200 rounded-lg shadow-lg mt-0.5 max-h-36 overflow-y-auto">
                {filteredUsers.slice(0, 8).map(u => (
                  <button key={u.id} onClick={() => handleAssignee(u)} disabled={assigneeSaving}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-pink-50 flex items-center gap-2 border-b border-gray-50 last:border-0">
                    <span className="font-semibold">{u.name}</span>
                    <span className="text-gray-400 text-[10px]">{u.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 프리셋 멘트 */}
      <div className="rounded-lg bg-white border border-gray-100 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <div>
            <p className="text-xs font-semibold text-gray-700">프리셋 멘트</p>
            <p className="text-[10px] text-gray-400">발신자: <span className="font-semibold text-pink-600">{effectiveAssigneeName || '담임'}</span> 멘토</p>
          </div>
          <div className="flex gap-1 ml-auto">
            {(['sms', 'call'] as const).map(t => (
              <button key={t} onClick={() => setPresetTab(presetTab === t ? null : t)}
                className={`px-2 py-0.5 text-[11px] font-bold rounded-md border transition-colors ${
                  presetTab === t ? 'bg-pink-500 text-white border-pink-500' : 'bg-white text-gray-500 border-gray-200 hover:border-pink-300'
                }`}>
                {t === 'sms' ? '💬 문자' : '📞 통화'}
              </button>
            ))}
          </div>
        </div>

        {presetTab === 'sms' && (
          <div className="space-y-2">
            {SMS_PRESETS.map((p, i) => {
              const txt = p.text(record);
              return (
                <div key={i} className="rounded-lg bg-gray-50 border border-gray-100 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-gray-600">{p.label}</span>
                    <button onClick={() => copyPreset(txt, i)}
                      className={`text-[10px] px-2 py-0.5 rounded font-bold transition-colors ${
                        copiedIdx === i ? 'bg-green-100 text-green-700' : 'bg-pink-50 text-pink-600 hover:bg-pink-100'
                      }`}>
                      {copiedIdx === i ? '✓ 복사됨' : '복사'}
                    </button>
                  </div>
                  <pre className="text-[10px] text-gray-600 whitespace-pre-wrap leading-relaxed">{txt}</pre>
                </div>
              );
            })}
          </div>
        )}

        {presetTab === 'call' && (
          <div className="space-y-2">
            <p className="text-[10px] text-gray-400">통화 시 참고할 멘트입니다.</p>
            {CALL_PRESETS.map((p, i) => {
              const txt = p.text(record);
              const callIdx = 100 + i;
              return (
                <div key={i} className="rounded-lg bg-gray-50 border border-gray-100 p-2.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-gray-600">{p.label}</span>
                    <button onClick={() => copyPreset(txt, callIdx)}
                      className={`text-[10px] px-2 py-0.5 rounded font-bold transition-colors ${
                        copiedIdx === callIdx ? 'bg-green-100 text-green-700' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                      }`}>
                      {copiedIdx === callIdx ? '✓ 복사됨' : '복사'}
                    </button>
                  </div>
                  <pre className="text-[10px] text-gray-600 whitespace-pre-wrap leading-relaxed">{txt}</pre>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 연락 기록 */}
      {logs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-gray-500">연락 기록</p>
          {[...logs].reverse().map((log, i) => {
            const rtDef = REPORT_TYPE_OPTIONS.find(r => r.id === log.reportType);
            // 삭제 권한: 기록을 추가한 본인 (contactedById) 또는 admin
            const canDelete = currentUserRole === 'admin' || log.contactedById === currentUserId;
            return (
              <div key={i} className="bg-white rounded-lg p-2.5 border border-gray-100 text-xs shadow-sm">
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  {/* 보고 유형 배지 */}
                  {rtDef && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold text-white ${rtDef.color}`}>
                      {log.reportType}
                    </span>
                  )}
                  {/* 연락 방법 배지 */}
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    log.method === '통화' ? 'bg-blue-50 text-blue-700' :
                    log.method === '문자' ? 'bg-pink-50 text-pink-700' :
                    log.method === '카카오' ? 'bg-yellow-50 text-yellow-700' :
                    'bg-gray-50 text-gray-600'
                  }`}>
                    {METHOD_OPTIONS.find(m => m.id === log.method)?.emoji ?? '📝'} {log.method ?? '기타'}
                  </span>
                  <span className="font-semibold text-gray-700">{log.contactedBy}</span>
                  <span className="text-gray-400 ml-auto text-[10px]">{formatDate(log.contactedAt)}</span>
                  {/* 삭제 버튼: 추가한 본인 또는 admin만 표시 */}
                  {canDelete && (
                    <button
                      onClick={() => handleRemoveLog(log)}
                      className="text-[10px] text-red-400 hover:text-red-600 font-medium ml-1"
                      title="이 기록 삭제"
                    >✕</button>
                  )}
                </div>
                {log.summary && (
                  <p className="text-gray-600 leading-relaxed mt-1">{log.summary}</p>
                )}
                {log.isResolved && (
                  <span className="text-[10px] text-green-600 font-bold mt-1 block">✓ 완치 보고</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 연락 기록 추가 */}
      {!isCompleted && (
        <div>
          <button onClick={() => setShowLogForm(true)}
            className="w-full py-2 text-xs font-medium text-pink-600 bg-pink-50 hover:bg-pink-100 rounded-lg border border-pink-100 transition-colors">
            + 연락 기록 추가
          </button>

          {showLogForm && (
            <TabFormModal
              title="연락 기록 추가"
              icon="📞"
              onClose={() => setShowLogForm(false)}
              onSubmit={handleAddLog}
              submitLabel={saving ? '저장 중...' : '저장'}
              submitColor="red"
            >
              {/* ① 보고 유형 */}
              <div>
                <p className="text-[10px] text-gray-500 mb-1">① 보고 유형</p>
                <div className="flex gap-1 flex-wrap">
                  {REPORT_TYPE_OPTIONS.map(rt => (
                    <button key={rt.id} onClick={() => { setReportType(rt.id); setIsResolved(rt.id === '완치보고'); }}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                        reportType === rt.id ? `${rt.color} text-white` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>{rt.label}</button>
                  ))}
                </div>
              </div>

              {/* ② 연락한 사람 */}
              <div>
                <p className="text-[10px] text-gray-500 mb-1">② 연락한 사람</p>
                <div className="flex gap-1 flex-wrap">
                  {contactorOptions.map(opt => (
                    <button key={opt.name} onClick={() => setContactorName(prev => prev === opt.name ? '' : opt.name)}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                        contactorName === opt.name ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>
                      <span className="opacity-60 mr-0.5">{opt.label}</span>{opt.name}
                    </button>
                  ))}
                </div>
                {contactorName && <p className="text-[9px] text-pink-600 mt-0.5">✓ {contactorName}</p>}
              </div>

              {/* ③ 연락 방법 */}
              <div>
                <p className="text-[10px] text-gray-500 mb-1">③ 연락 방법</p>
                <div className="flex gap-1 flex-wrap">
                  {METHOD_OPTIONS.map(m => (
                    <button key={m.id} onClick={() => setMethod(m.id)}
                      className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                        method === m.id ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}>{m.emoji} {m.label}</button>
                  ))}
                </div>
              </div>
            </TabFormModal>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== 폼 모달 ====================

// ==================== 최초보고 간소화 모달 ====================

interface QuickReportForm {
  studentId: string;
  studentName: string;
  grade: string;
  className: string;
  classMentor: string;
  unitMentor: string;
  roomNumber: string;
  types: PatientType[];
  symptom: string;
  treatment: string;
  temperature: string;    // 수치 (빈 문자열이면 미측정)
  fever: string;          // '정상' | '미열' | '고열' | '' (직접 입력만 했을 때)
  locationMode: LocationMode; // 현재 위치 모드 (일과중 / 휴식 / 격리)
  location: string;       // 현재 위치 (텍스트)
  actionNote: string;     // 조치 메모
}

// 조치 상태 (최초보고 전용)
const QUICK_ACTION_OPTIONS = [
  { id: '직접조치',   label: '직접 조치 예정', color: 'bg-blue-500',   desc: '조치사항대로 직접 조치할게요' },
  { id: '매니저대기', label: '매니저 대기',    color: 'bg-orange-500', desc: '매니저 판단이 필요해요' },
] as const;

type QuickActionId = typeof QUICK_ACTION_OPTIONS[number]['id'];

function QuickReportModal({
  today, students, reporterName, reporterId, onClose, onSubmit,
}: {
  today: string;
  students: STSheetStudent[];
  reporterName: string;
  reporterId: string;
  onClose: () => void;
  onSubmit: (form: QuickReportForm) => Promise<void>;
}) {
  const [form, setForm] = useState<QuickReportForm>({
    studentId: '', studentName: '', grade: '', className: '',
    classMentor: '', unitMentor: '', roomNumber: '',
    types: ['처치전'], symptom: '', treatment: '', temperature: '', fever: '', locationMode: '일과중', location: '', actionNote: '',
  });
  const [studentSearch, setStudentSearch] = useState('');
  const [studentLocked, setStudentLocked] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // 증상 검색
  const [symptomSearch, setSymptomSearch] = useState('');
  const [selectedGuide, setSelectedGuide] = useState<SymptomGuide | null>(null);

  // 조치 상태
  const [actionStatus, setActionStatus] = useState<QuickActionId>('직접조치');

  const [submitting, setSubmitting] = useState(false);

  const setField = <K extends keyof QuickReportForm>(k: K, v: QuickReportForm[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const studentResults = useMemo(() => {
    const q = studentSearch.trim();
    if (!q) return [];
    return students.filter(s => s.name.includes(q)).slice(0, 8);
  }, [studentSearch, students]);

  const selectStudent = (s: STSheetStudent) => {
    setForm(f => ({
      ...f,
      studentId: s.studentId,
      studentName: s.name,
      grade: s.grade ? `${s.grade}${s.gender ?? ''}` : '',
      className: s.className ?? '',
      classMentor: s.classMentor ?? '',
      unitMentor: s.unitMentor ?? '',
      // roomNumber는 참고용으로 저장하되 ② 위치는 직접 입력
      roomNumber: s.roomNumber ?? '',
    }));
    setStudentSearch(s.name);
    setStudentLocked(true);
    setShowDropdown(false);
    // 위치를 방번호로 미리 채워두되 사용자가 수정 가능
    // 위치는 자동 채우지 않음 — 사용자가 직접 입력
  };

  // 증상 프리셋 필터 (검색 포함)
  const filteredGuides = useMemo(() => {
    const q = symptomSearch.trim();
    if (!q) return SYMPTOM_GUIDES;
    return SYMPTOM_GUIDES.filter(g =>
      g.label.includes(q) || g.treatment.includes(q)
    );
  }, [symptomSearch]);

  const selectGuide = (guide: SymptomGuide) => {
    if (selectedGuide?.label === guide.label) {
      setSelectedGuide(null);
      return;
    }
    setSelectedGuide(guide);
    setForm(f => ({
      ...f,
      symptom: guide.label,
      treatment: guide.treatment,
    }));
  };

  const toggleType = (t: PatientType) => {
    setForm(f => {
      const has = f.types.includes(t);
      const next = has ? f.types.filter(x => x !== t) : [...f.types, t];
      return { ...f, types: next.length === 0 ? ['처치전'] : next };
    });
  };

  const canSubmit = form.studentName && form.symptom;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const actionPart = `[${actionStatus}]`;
      const memoPart = form.actionNote.trim();
      const actionNote = [actionPart, memoPart].filter(Boolean).join(' ');
      // fever 레이블 결정
      const feverLabel =
        feverLevel === 'normal' ? '정상' :
        feverLevel === 'slight' ? '미열' : '고열';
      await onSubmit({ ...form, fever: feverLabel, actionNote });
    } finally {
      setSubmitting(false);
    }
  };

  // 체온계 가이드 토글
  const [showFeverGuide, setShowFeverGuide] = useState(false);

  // 열감 단계 (독립 상태 — 정상 선택 시 temperature 입력 숨김)
  const [feverLevel, setFeverLevel] = useState<'normal' | 'slight' | 'high'>('normal');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50"
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-gray-900">🚑 환자 최초보고</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">보고자: {reporterName}</p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* ① 대상 */}
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1.5">① 대상 *</p>
            <div className="relative">
              <input
                type="text"
                value={studentSearch || form.studentName}
                onChange={e => {
                  if (studentLocked) return;
                  setStudentSearch(e.target.value);
                  setShowDropdown(true);
                }}
                readOnly={studentLocked}
                placeholder="이름으로 검색..."
                className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none transition-colors ${
                  studentLocked ? 'bg-gray-50 border-gray-200 text-gray-800 font-semibold' : 'border-gray-200 focus:border-blue-400'
                }`}
              />
              {studentLocked && (
                <button onClick={() => {
                  setStudentLocked(false);
                  setStudentSearch('');
                  setForm(f => ({ ...f, studentId: '', studentName: '', grade: '', className: '', classMentor: '', unitMentor: '', roomNumber: '' }));
                }} className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 hover:text-red-500">
                  변경
                </button>
              )}
              {!studentLocked && showDropdown && studentResults.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-44 overflow-y-auto">
                  {studentResults.map(s => (
                    <button key={s.studentId} onClick={() => selectStudent(s)}
                      className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 flex items-center gap-2 border-b border-gray-50 last:border-0">
                      <span className="font-semibold text-gray-900">{s.name}</span>
                      <span className="text-xs text-gray-400">{s.grade}{s.gender === 'F' ? 'F' : 'M'}</span>
                      {s.className && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{fmtClass(s.className)}</span>}
                      {s.roomNumber && <span className="text-xs text-gray-400">{s.roomNumber}호</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* 선택된 학생 정보 칩 */}
            {studentLocked && (
              <div className="flex flex-wrap gap-2 mt-2">
                {form.grade && <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{form.grade}</span>}
                {form.className && <span className="text-[11px] bg-blue-50 text-blue-700 px-2 py-1 rounded-full">{fmtClass(form.className)}</span>}
                {form.roomNumber && <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{form.roomNumber}호</span>}
                {form.classMentor && <span className="text-[11px] bg-green-50 text-green-700 px-2 py-1 rounded-full">담임 {form.classMentor}</span>}
              </div>
            )}
          </div>

          {/* ② 위치 */}
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1.5">② 현재 위치</p>
            {/* 위치 모드 선택 버튼 */}
            <div className="grid grid-cols-3 gap-2 mb-2">
              {([
                { id: '일과중' as LocationMode, emoji: '🏃', color: 'bg-blue-500',   border: 'border-blue-500' },
                { id: '휴식'   as LocationMode, emoji: '😴', color: 'bg-amber-400',  border: 'border-amber-400' },
                { id: '격리'   as LocationMode, emoji: '🏠', color: 'bg-purple-500', border: 'border-purple-500' },
              ] as const).map(opt => {
                const selected = form.locationMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setField('locationMode', opt.id)}
                    className={`flex flex-col items-center gap-0.5 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                      selected
                        ? `${opt.color} ${opt.border} text-white shadow-sm`
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <span className="text-base">{opt.emoji}</span>
                    <span>{opt.id}</span>
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={form.location}
              onChange={e => setField('location', e.target.value)}
              placeholder={
                form.locationMode === '휴식' ? '예: 110호, 휴게실...' :
                form.locationMode === '격리' ? '예: 격리실 214호...' :
                '예: 강당, 체육관, 교실...'
              }
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-400"
            />
            <p className="text-[10px] text-gray-400 mt-1">숙소 방번호가 아닐 수 있으니 현재 있는 장소를 직접 입력해주세요</p>
          </div>

          {/* ③ 열감 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-bold text-gray-700">③ 열감</p>
              <button
                type="button"
                onClick={() => setShowFeverGuide(p => !p)}
                className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 font-medium"
              >
                🌡️ 체온계 사용법 {showFeverGuide ? '▲' : '▼'}
              </button>
            </div>

            {/* 체온계 가이드 (토글) */}
            {showFeverGuide && (
              <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 space-y-2 text-[11px] text-gray-700 leading-relaxed">
                <div className="flex gap-2 items-start">
                  <span className="text-base shrink-0">1️⃣</span>
                  <p>전원 버튼을 눌러주세요.</p>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="text-base shrink-0">2️⃣</span>
                  <p>화면에 <b>L°C</b>가 깜박이면 측정 준비 완료 (실내 온도 32°C 이상일 때).</p>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="text-base shrink-0">3️⃣</span>
                  <p><b>겨드랑이 맨살</b>에 체온계를 끼워야 합니다. 학생 옷 안으로 체온계를 넣어 <b>"삐빅" 소리가 날 때까지</b> 대고 있어주세요. (30초~1분 소요)</p>
                </div>
                <div className="flex gap-2 items-start">
                  <span className="text-base shrink-0">4️⃣</span>
                  <p>표시 온도가 깜박임을 멈추면 측정 완료.</p>
                </div>
                <div className="mt-1 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                  <p className="font-semibold text-amber-800 mb-0.5">💡 추가 확인 방법</p>
                  <p className="text-amber-700">이마·목 뒤(동성일 시 옷 안까지)도 손으로 짚으며 열감이 있는지 같이 확인해주세요. 외부가 추우면 외부에 드러나는 피부는 몸보다 차가울 수 있습니다.</p>
                </div>
              </div>
            )}

            {/* 열감 단계 선택 — 정상 선택 시 체온 입력 불필요 */}
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[
                { id: 'normal',  label: '정상',  sub: '36.0–37.4°', color: 'bg-green-500',  border: 'border-green-500' },
                { id: 'slight',  label: '미열',  sub: '37.5–37.9°', color: 'bg-orange-400', border: 'border-orange-400' },
                { id: 'high',    label: '고열',  sub: '38.0° 이상', color: 'bg-red-500',    border: 'border-red-500' },
              ].map(opt => {
                const temp = parseFloat(form.temperature);
                const selected =
                  opt.id === 'normal'
                    ? feverLevel === 'normal'
                    : opt.id === 'slight'
                      ? feverLevel === 'slight'
                      : feverLevel === 'high';
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (opt.id === 'normal') {
                        setFeverLevel('normal');
                        setField('temperature', '');
                      } else if (opt.id === 'slight') {
                        setFeverLevel('slight');
                        // 이미 미열 범위면 유지, 아니면 기본값
                        if (!form.temperature || temp < 37.5 || temp >= 38.0) setField('temperature', '37.5');
                      } else {
                        setFeverLevel('high');
                        if (!form.temperature || temp < 38.0) setField('temperature', '38.0');
                      }
                    }}
                    className={`flex flex-col items-center gap-0.5 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                      selected ? `${opt.color} ${opt.border} text-white shadow-sm` : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <span className={`text-[9px] font-normal ${selected ? 'text-white/80' : 'text-gray-400'}`}>{opt.sub}</span>
                  </button>
                );
              })}
            </div>

            {/* 정상이 아닐 때만 수치 직접 입력 */}
            {feverLevel !== 'normal' && (
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="0.1"
                    min="35"
                    max="42"
                    value={form.temperature}
                    onChange={e => {
                      const val = e.target.value;
                      setField('temperature', val);
                      // 수치 입력 시 단계 자동 동기화
                      // — 단, 직접 입력 중 정상 범위로 내려가도 normal로 전환하지 않음
                      //   (백스페이스 도중 feverLevel이 바뀌어 입력 필드가 사라지는 버그 방지)
                      const n = parseFloat(val);
                      if (!isNaN(n) && n >= 37.5) {
                        if (n >= 38.0) setFeverLevel('high');
                        else setFeverLevel('slight');
                      }
                    }}
                    placeholder="체온 직접 입력 (예: 37.8)"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">°C</span>
                </div>
                <span className={`text-xs font-bold whitespace-nowrap px-2.5 py-1.5 rounded-lg ${
                  feverLevel === 'high' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                }`}>
                  {feverLevel === 'high' ? '⚠️ 고열' : '🌡 미열'}
                </span>
              </div>
            )}
            {feverLevel === 'normal' && (
              <div className="mt-1.5 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 space-y-1">
                <p className="text-[11px] font-bold text-amber-800">✅ 정상 체온 — 아래 항목도 함께 확인해주세요</p>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  이마·목 뒤(동성일 시 옷 안까지)도 손으로 짚으며 열감이 있는지 확인해주세요.
                  외부가 추우면 드러나는 피부는 몸보다 차가울 수 있습니다.
                </p>
              </div>
            )}
          </div>

          {/* ④ 증상 */}
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1.5">④ 증상 *</p>

            {/* 프리셋 검색 */}
            <div className="relative mb-2">
              <input
                type="text"
                value={symptomSearch}
                onChange={e => setSymptomSearch(e.target.value)}
                placeholder="증상 검색 (두통, 복통, 발열...)"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400 pr-8"
              />
              {symptomSearch && (
                <button onClick={() => setSymptomSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">✕</button>
              )}
            </div>

            {/* 프리셋 그리드 */}
            <div className="grid grid-cols-4 gap-1.5 max-h-44 overflow-y-auto">
              {filteredGuides.map(guide => {
                const isSelected = selectedGuide?.label === guide.label;
                const isEmg = guide.category === '응급';
                return (
                  <button key={guide.label} type="button" onClick={() => selectGuide(guide)}
                    className={`flex flex-col items-center gap-0.5 px-1 py-2 rounded-lg text-[10px] font-semibold border transition-all ${
                      isSelected
                        ? isEmg ? 'bg-red-500 text-white border-red-500' : 'bg-blue-600 text-white border-blue-600'
                        : isEmg ? 'bg-red-50 text-red-700 border-red-100 hover:bg-red-100' : 'bg-gray-50 text-gray-700 border-gray-100 hover:border-blue-200 hover:bg-blue-50'
                    }`}
                  >
                    <span className="text-base leading-none">{guide.emoji}</span>
                    <span className="text-center leading-tight">{guide.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 선택된 가이드 → 조치 미리보기 */}
            {selectedGuide && (
              <div className={`mt-2 rounded-xl p-3 border text-[11px] space-y-1 ${
                selectedGuide.category === '응급' ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-100'
              }`}>
                <p className="font-bold text-gray-800">{selectedGuide.emoji} {selectedGuide.label} 조치</p>
                <p className="text-gray-700">🩺 {selectedGuide.treatment}</p>
                {selectedGuide.medication !== '(약 불필요)' && (
                  <p className="text-orange-700">💊 {selectedGuide.medication}</p>
                )}
                {selectedGuide.notes && (
                  <p className={`font-medium ${selectedGuide.category === '응급' ? 'text-red-700' : 'text-amber-700'}`}>
                    ⚠️ {selectedGuide.notes}
                  </p>
                )}
              </div>
            )}

            {/* 직접 입력 */}
            <input
              type="text"
              value={form.symptom}
              onChange={e => setField('symptom', e.target.value)}
              placeholder="프리셋에 없으면 직접 입력..."
              className="w-full mt-2 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>

          {/* ⑤ 현재 상태 */}
          <div>
            <p className="text-xs font-bold text-gray-700 mb-1.5">⑤ 현재 상태</p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTION_OPTIONS.map(opt => (
                <button key={opt.id} type="button"
                  onClick={() => setActionStatus(opt.id)}
                  className={`flex flex-col items-center gap-1 py-3 px-3 rounded-xl border text-xs font-bold transition-all ${
                    actionStatus === opt.id
                      ? `${opt.color} text-white border-transparent shadow-sm`
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span className={`text-[9px] font-normal ${actionStatus === opt.id ? 'text-white/80' : 'text-gray-400'}`}>{opt.desc}</span>
                </button>
              ))}
            </div>
            <input
              type="text"
              value={form.actionNote}
              onChange={e => setField('actionNote', e.target.value)}
              placeholder="추가 메모 (선택)"
              className="w-full mt-2 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>

        </div>

        {/* 제출 버튼 */}
        <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className={`w-full py-3.5 text-sm font-bold rounded-xl transition-colors ${
              canSubmit && !submitting
                ? 'bg-red-500 hover:bg-red-600 text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {submitting ? '보고 중...' : '🚑 최초보고 제출'}
          </button>
          <p className="text-[10px] text-gray-400 text-center mt-2">
            복용약·내원 등 상세 기록은 카드에서 추가할 수 있습니다
          </p>
        </div>

      </div>
    </div>
  );
}

interface PatientFormModalProps {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  editingId: string | null;
  submitting: boolean;
  today: string;
  students: STSheetStudent[];
  campUsers: User[];
  onClose: () => void;
  onSubmit: () => void;
}

function PatientFormModal({
  form, setForm, editingId, submitting, today, students, campUsers,
  onClose, onSubmit,
}: PatientFormModalProps) {
  const setField = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  // campEndDate는 PatientContent 스코프의 상태이나 이 모달엔 전달되지 않으므로 빈 값으로 처리
  const campEndDate = '';

  const [studentSearch, setStudentSearch] = useState('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [studentLocked, setStudentLocked] = useState(!!editingId && !!form.studentName);
  const searchRef = useRef<HTMLDivElement>(null);

  // 증상 매뉴얼 가이드
  const [guideCategory, setGuideCategory] = useState<SymptomCategory>('내과');
  const [selectedGuide, setSelectedGuide] = useState<SymptomGuide | null>(null);

  const selectGuide = (guide: SymptomGuide) => {
    if (selectedGuide?.label === guide.label) {
      setSelectedGuide(null);
      return;
    }
    setSelectedGuide(guide);
    // 증상·처치 자동 채우기 (비어있을 때만)
    setForm(f => ({
      ...f,
      symptom: f.symptom || guide.label,
      treatment: f.treatment || guide.treatment,
      medication: f.medication || guide.medication,
    }));
  };

  // 학생 검색 결과
  const studentResults = useMemo(() => {
    if (!studentSearch.trim() || studentSearch.length < 1) return [];
    const q = studentSearch.trim();
    return students.filter(s => s.name.includes(q)).slice(0, 8);
  }, [studentSearch, students]);

  // 학생 선택 시 자동 매핑 + 잠금
  const selectStudent = (s: STSheetStudent) => {
    const grade = s.grade ? `${s.grade}${s.gender ?? ''}` : '';
    setForm(f => ({
      ...f,
      studentName: s.name,
      grade,
      className: s.className ?? '',
      classMentor: s.classMentor ?? '',
      unitMentor: s.unitMentor ?? '',
      roomNumber: s.roomNumber ?? '',
    }));
    setStudentSearch(s.name);
    setShowStudentDropdown(false);
    setStudentLocked(true);
  };

  const clearStudent = () => {
    setStudentLocked(false);
    setStudentSearch('');
    setForm(f => ({ ...f, studentName: '', grade: '', className: '', classMentor: '', unitMentor: '', roomNumber: '' }));
  };

  // 유형 토글
  const toggleType = (t: PatientType) => {
    setForm(f => {
      const has = f.types.includes(t);
      const next = has ? f.types.filter(x => x !== t) : [...f.types, t];
      return { ...f, types: next.length === 0 ? ['처치전'] : next };
    });
  };

  // 스케줄 관리
  const addMedSchedule = () => {
    setForm(f => ({
      ...f,
      medSchedules: [...f.medSchedules, { name: '', times: [], startDate: today, endDate: today, endDateAuto: false, daysPerWeek: '' }],
    }));
  };

  const removeMedSchedule = (idx: number) => {
    setForm(f => ({ ...f, medSchedules: f.medSchedules.filter((_, i) => i !== idx) }));
  };

  const toggleMedTime = (si: number, time: MedicationTime) => {
    setForm(f => {
      const updated = [...f.medSchedules];
      const s = { ...updated[si] };
      s.times = s.times.includes(time) ? s.times.filter(t => t !== time) : [...s.times, time];
      updated[si] = s;
      return { ...f, medSchedules: updated };
    });
  };

  const hasMedType = form.types.includes('약복용');
  const hasIsolation = form.types.includes('격리');
  const hasHospital = form.types.includes('병원내원');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">
            {editingId ? '환자 기록 수정' : '환자 기록 추가'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-7 h-7 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 학생 검색 + 정보 */}
          <SectionBox title="학생 정보">
            {/* 이름 검색 */}
            <div ref={searchRef} className="relative">
              <FormLabel label="이름 *" />
              <div className="relative">
                <input
                  type="text"
                  value={studentSearch || form.studentName}
                  onChange={e => {
                    if (studentLocked) return;
                    setStudentSearch(e.target.value);
                    setField('studentName', e.target.value);
                    setShowStudentDropdown(true);
                  }}
                  onFocus={() => { if (!studentLocked) setShowStudentDropdown(true); }}
                  readOnly={studentLocked}
                  placeholder="이름으로 학생 검색..."
                  className={`${inputCls} ${studentLocked ? 'bg-gray-50 text-gray-700 cursor-default pr-16' : ''}`}
                />
                {studentLocked && (
                  <button type="button" onClick={clearStudent}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 hover:text-red-500 font-medium px-1.5 py-0.5 rounded transition-colors">
                    변경
                  </button>
                )}
              </div>
              {!studentLocked && showStudentDropdown && studentResults.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {studentResults.map(s => (
                    <button key={s.studentId} onClick={() => selectStudent(s)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-xs text-gray-400">{s.grade}학년 {s.gender === 'F' ? '여' : '남'}</span>
                      {s.className && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 rounded">{fmtClass(s.className)}</span>}
                      {s.roomNumber && <span className="text-xs text-gray-400">{s.roomNumber}호</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 선택 후 읽기 전용 정보 표시 */}
            {studentLocked ? (
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 bg-gray-50 rounded-lg px-3 py-2.5">
                {[
                  { label: '학년/성별', value: form.grade },
                  { label: '담당 반', value: form.className },
                  { label: '반 멘토', value: form.classMentor },
                  { label: '유닛 멘토', value: form.unitMentor },
                  { label: '방 번호', value: form.roomNumber ? `${form.roomNumber}호` : '' },
                ].map(({ label, value }) => value ? (
                  <div key={label}>
                    <p className="text-[10px] text-gray-400 font-medium">{label}</p>
                    <p className="text-xs text-gray-700 font-semibold">{value}</p>
                  </div>
                ) : null)}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div>
                  <FormLabel label="학년/성별" />
                  <input type="text" value={form.grade}
                    onChange={e => setField('grade', e.target.value)}
                    placeholder="G5M" className={inputCls} />
                </div>
                <div>
                  <FormLabel label="담당 반" />
                  <input type="text" value={form.className}
                    onChange={e => setField('className', e.target.value)}
                    placeholder="무브반" className={inputCls} />
                </div>
                <div>
                  <FormLabel label="반 멘토" />
                  <input type="text" value={form.classMentor}
                    onChange={e => setField('classMentor', e.target.value)}
                    placeholder="김멘토" className={inputCls} />
                </div>
                <div>
                  <FormLabel label="유닛 멘토" />
                  <input type="text" value={form.unitMentor}
                    onChange={e => setField('unitMentor', e.target.value)}
                    placeholder="이멘토" className={inputCls} />
                </div>
                <div>
                  <FormLabel label="방 번호" />
                  <input type="text" value={form.roomNumber}
                    onChange={e => setField('roomNumber', e.target.value)}
                    placeholder="201" className={inputCls} />
                </div>
              </div>
            )}
          </SectionBox>

          {/* 유형 선택 (복합) */}
          <div>
            <FormLabel label="유형 (복합 선택 가능) *" />
            <div className="flex flex-wrap gap-1.5">
              {PATIENT_TYPES.map(t => {
                const selected = form.types.includes(t);
                return (
                  <button key={t} type="button" onClick={() => toggleType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      selected ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 증상 가이드 (매뉴얼 즉시 표시) ── */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 overflow-hidden">
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <p className="text-xs font-bold text-blue-800">📋 증상별 대처 가이드</p>
              <span className="text-[10px] text-blue-500">선택 시 증상·처치 자동 입력</span>
            </div>

            {/* 카테고리 탭 */}
            <div className="flex border-b border-blue-100 px-3">
              {SYMPTOM_CATEGORIES.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { setGuideCategory(cat); setSelectedGuide(null); }}
                  className={`flex-1 py-1.5 text-[11px] font-bold transition-colors ${
                    guideCategory === cat
                      ? cat === '응급'
                        ? 'text-red-600 border-b-2 border-red-500 -mb-px'
                        : 'text-blue-700 border-b-2 border-blue-500 -mb-px'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {cat === '내과' ? '🏥 내과' : cat === '외과' ? '🩹 외과' : '🚨 응급'}
                </button>
              ))}
            </div>

            {/* 증상 버튼 그리드 */}
            <div className="p-3 grid grid-cols-3 gap-1.5">
              {SYMPTOM_GUIDES.filter(g => g.category === guideCategory).map(guide => {
                const isSelected = selectedGuide?.label === guide.label;
                const isEmergency = guide.category === '응급';
                return (
                  <button
                    key={guide.label}
                    type="button"
                    onClick={() => selectGuide(guide)}
                    className={`flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg text-[11px] font-semibold border transition-all ${
                      isSelected
                        ? isEmergency
                          ? 'bg-red-500 text-white border-red-500 shadow-sm'
                          : 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : isEmergency
                          ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    <span className="text-base leading-none">{guide.emoji}</span>
                    <span className="text-center leading-tight">{guide.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 선택된 가이드 상세 패널 */}
            {selectedGuide && (
              <div className={`mx-3 mb-3 rounded-lg p-3 space-y-2 border ${
                selectedGuide.category === '응급'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-blue-100'
              }`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-base">{selectedGuide.emoji}</span>
                  <p className={`text-xs font-bold ${
                    selectedGuide.category === '응급' ? 'text-red-800' : 'text-gray-800'
                  }`}>
                    {selectedGuide.label}
                  </p>
                  {selectedGuide.category === '응급' && (
                    <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold ml-auto">
                      즉시 119
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-0.5">처치</p>
                    <p className="text-[11px] text-gray-700 leading-relaxed">{selectedGuide.treatment}</p>
                  </div>
                  {selectedGuide.medication !== '(약 불필요)' && (
                    <div>
                      <p className="text-[10px] font-bold text-orange-500 uppercase tracking-wide mb-0.5">약품</p>
                      <p className="text-[11px] text-orange-700 font-medium">{selectedGuide.medication}</p>
                    </div>
                  )}
                  {selectedGuide.notes && (
                    <div className={`rounded px-2 py-1.5 ${
                      selectedGuide.category === '응급' ? 'bg-red-100' : 'bg-amber-50'
                    }`}>
                      <p className={`text-[11px] font-medium leading-relaxed ${
                        selectedGuide.category === '응급' ? 'text-red-700' : 'text-amber-800'
                      }`}>
                        ⚠️ {selectedGuide.notes}
                      </p>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setForm(f => ({
                    ...f,
                    symptom: selectedGuide.label,
                    treatment: selectedGuide.treatment,
                    medication: selectedGuide.medication === '(약 불필요)' ? '' : selectedGuide.medication,
                  }))}
                  className="w-full py-1.5 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                >
                  ↓ 증상·처치·약 덮어쓰기
                </button>
              </div>
            )}
          </div>

          {/* 증상 / 처치 / 체온 */}
          <div>
            <FormLabel label="증상 *" />
            <input type="text" value={form.symptom}
              onChange={e => setField('symptom', e.target.value)}
              placeholder="두통, 복통, 발열 38.5도" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FormLabel label="처치" />
              <input type="text" value={form.treatment}
                onChange={e => setField('treatment', e.target.value)}
                placeholder="타이레놀 투여 후 안정" className={inputCls} />
            </div>
            <div>
              <FormLabel label="체온 (°C)" />
              <input type="number" step="0.1" min="35" max="42"
                value={form.temperature}
                onChange={e => setField('temperature', e.target.value)}
                placeholder="37.5" className={inputCls} />
            </div>
          </div>

          {/* 단순 투약 메모 (약복용 유형 아닐 때) */}
          {!hasMedType && (
            <div>
              <FormLabel label="투약 메모" />
              <input type="text" value={form.medication}
                onChange={e => setField('medication', e.target.value)}
                placeholder="백초 1포" className={inputCls} />
            </div>
          )}

          {/* 정기 복용 스케줄 */}
          {hasMedType && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <FormLabel label="정기 복용 스케줄" />
                <button type="button" onClick={addMedSchedule}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  + 약 추가
                </button>
              </div>
              {form.medSchedules.map((sched, si) => (
                <div key={si} className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-orange-700">약 {si + 1}</span>
                    <button type="button" onClick={() => removeMedSchedule(si)}
                      className="text-[11px] text-red-500 hover:text-red-600">삭제</button>
                  </div>
                  <input type="text" value={sched.name}
                    onChange={e => {
                      const updated = [...form.medSchedules];
                      updated[si] = { ...updated[si], name: e.target.value };
                      setField('medSchedules', updated);
                    }}
                    placeholder="약 이름 (예: 타이레놀 500mg)" className={inputCls} />
                  <div className="flex gap-1.5 flex-wrap">
                    {MEDICATION_TIMES.map(t => (
                      <button key={t} type="button" onClick={() => toggleMedTime(si, t)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                          sched.times.includes(t)
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-white text-gray-500 border-gray-300 hover:border-orange-300'
                        }`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <FormLabel label="시작일" />
                      <input type="date" value={sched.startDate}
                        onChange={e => {
                          const updated = [...form.medSchedules];
                          updated[si] = { ...updated[si], startDate: e.target.value };
                          setField('medSchedules', updated);
                        }} className={inputCls} />
                    </div>
                    <div>
                      <FormLabel label="종료일" />
                      {sched.endDateAuto ? (
                        <div className="flex items-center h-9 px-2 rounded-lg border border-orange-300 bg-orange-50 text-xs text-orange-700 font-semibold gap-1">
                          <span>📌</span>
                          <span>캠프 끝까지</span>
                          {campEndDate && <span className="text-gray-400 font-normal ml-1">({campEndDate})</span>}
                        </div>
                      ) : (
                        <input type="date" value={sched.endDate}
                          onChange={e => {
                            const updated = [...form.medSchedules];
                            updated[si] = { ...updated[si], endDate: e.target.value };
                            setField('medSchedules', updated);
                          }} className={inputCls} />
                      )}
                    </div>
                  </div>
                  {/* 캠프 끝까지 + 주 N일 옵션 */}
                  <div className="flex items-center gap-4 pt-1">
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={sched.endDateAuto}
                        onChange={e => {
                          const updated = [...form.medSchedules];
                          updated[si] = {
                            ...updated[si],
                            endDateAuto: e.target.checked,
                            endDate: e.target.checked ? (campEndDate || updated[si].endDate) : updated[si].endDate,
                          };
                          setField('medSchedules', updated);
                        }}
                        className="accent-orange-500"
                      />
                      <span className="text-[11px] text-gray-600 font-medium">캠프 끝까지</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-gray-500">주</span>
                      <input
                        type="number"
                        min={1}
                        max={7}
                        value={sched.daysPerWeek}
                        onChange={e => {
                          const updated = [...form.medSchedules];
                          updated[si] = { ...updated[si], daysPerWeek: e.target.value === '' ? '' : Number(e.target.value) };
                          setField('medSchedules', updated);
                        }}
                        placeholder="7"
                        className="w-10 text-center text-[11px] border border-gray-300 rounded-md px-1 py-1"
                      />
                      <span className="text-[11px] text-gray-500">일 복용 <span className="text-gray-400">(빈칸=매일)</span></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 격리 정보 */}
          {hasIsolation && (
            <div>
              <FormLabel label="격리방 번호" />
              <input type="text" value={form.isolationRoom}
                onChange={e => setField('isolationRoom', e.target.value)}
                placeholder="213" className={inputCls} />
            </div>
          )}

          {/* 경과 상태 */}
          <div>
            <FormLabel label="경과 상태" />
            <div className="flex gap-1.5 flex-wrap">
              {PROGRESS_STATUSES.map(s => (
                <button key={s} type="button" onClick={() => setField('progressStatus', s)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                    form.progressStatus === s
                      ? `${PROGRESS_STYLE[s].step} text-white border-transparent`
                      : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* 병원 내원 */}
          {hasHospital && (
            <SectionBox title="병원 내원 (1차)" color="red">
              {/* 내원 상태 */}
              <div className="flex gap-1.5 flex-wrap mb-2">
                {HOSPITAL_STATUSES.map(s => (
                  <button key={s} type="button" onClick={() => setField('hospitalStatus', s)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      form.hospitalStatus === s
                        ? s === '필요없음' ? 'bg-gray-600 text-white border-gray-600'
                        : s === '내원예정' ? 'bg-orange-500 text-white border-orange-500'
                        : 'bg-green-500 text-white border-green-500'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
              {form.hospitalStatus !== '필요없음' && (
                <>
                  <div>
                    <FormLabel label="인솔자" />
                    <input type="text" value={form.hospitalEscort}
                      onChange={e => setField('hospitalEscort', e.target.value)}
                      placeholder="김매니저" className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <FormLabel label="내원 날짜" />
                      <input type="date" value={form.hospitalDate}
                        onChange={e => setField('hospitalDate', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <FormLabel label="내원 시간" />
                      <input type="time" value={form.hospitalTime}
                        onChange={e => setField('hospitalTime', e.target.value)} className={inputCls} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <FormLabel label="처방약" />
                    <input type="text" value={form.hospitalPrescription}
                      onChange={e => setField('hospitalPrescription', e.target.value)}
                      placeholder="항생제 3일치" className={inputCls} />
                  </div>
                  <div className="mt-2">
                    <FormLabel label="메모" />
                    <input type="text" value={form.hospitalNotes}
                      onChange={e => setField('hospitalNotes', e.target.value)}
                      placeholder="특이사항" className={inputCls} />
                  </div>
                </>
              )}

              {/* 내원완료 시 정산 */}
              {form.hospitalStatus === '내원완료' && (
                <div className="mt-3 pt-3 border-t border-red-100">
                  <FormLabel label="병원비 정산" />
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {BILLING_METHODS.map(m => (
                      <button key={m} type="button"
                        onClick={() => setField('billingMethod', m)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          form.billingMethod === m
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
                        }`}>
                        {m}
                      </button>
                    ))}
                  </div>
                  {form.billingMethod !== '미정' && (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <FormLabel label="금액 (원)" />
                          <input type="number" value={form.billingAmount}
                            onChange={e => setField('billingAmount', e.target.value)}
                            placeholder="50000" className={inputCls} />
                        </div>
                        {form.billingMethod === '용돈봉투' && (
                          <div>
                            <FormLabel label="차감 담당자" />
                            <select value={form.billingPocketHandler}
                              onChange={e => setField('billingPocketHandler', e.target.value)}
                              className={inputCls}>
                              <option value="">선택</option>
                              {campUsers.map(u => (
                                <option key={u.id} value={u.name}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={form.billingPaid}
                          onChange={e => setField('billingPaid', e.target.checked)}
                          className="accent-green-500" />
                        정산 완료
                      </label>
                      <div>
                        <FormLabel label="메모" />
                        <input type="text" value={form.billingNotes}
                          onChange={e => setField('billingNotes', e.target.value)}
                          placeholder="영수증 부모님 전달 예정" className={inputCls} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </SectionBox>
          )}

          {/* 담당자 지정 */}
          <SectionBox title="담당자 지정">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FormLabel label="처치 담당자" />
                <select value={form.assigneeId}
                  onChange={e => {
                    const user = campUsers.find(u => u.id === e.target.value);
                    setForm(f => ({
                      ...f,
                      assigneeId: e.target.value,
                      assigneeName: user?.name ?? '',
                    }));
                  }}
                  className={inputCls}>
                  <option value="">미지정</option>
                  {campUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <FormLabel label="부모연락 담당자" />
                <select value={form.parentContactAssigneeId}
                  onChange={e => {
                    const user = campUsers.find(u => u.id === e.target.value);
                    setForm(f => ({
                      ...f,
                      parentContactAssigneeId: e.target.value,
                      parentContactAssigneeName: user?.name ?? '',
                    }));
                  }}
                  className={inputCls}>
                  <option value="">미지정</option>
                  {campUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </SectionBox>


          {/* 메모 */}
          <div>
            <FormLabel label="메모" />
            <textarea value={form.notes} onChange={e => setField('notes', e.target.value)}
              placeholder="추가 메모 사항..." rows={2}
              className={`${inputCls} resize-none`} />
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
            취소
          </button>
          <button onClick={onSubmit}
            disabled={submitting || !form.studentName.trim() || !form.symptom.trim()}
            className="flex-1 py-2.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 disabled:bg-gray-300 rounded-xl transition-colors">
            {submitting ? '저장 중...' : editingId ? '수정 완료' : '추가하기'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ==================== 공통 ====================

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-100 bg-white';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-400 w-12 flex-shrink-0">{label}</span>
      <span className="text-gray-700 flex-1 whitespace-pre-wrap">{value}</span>
    </div>
  );
}

function FormLabel({ label }: { label: string }) {
  return <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>;
}

function SectionBox({ title, children, color = 'gray' }: {
  title: string;
  children: React.ReactNode;
  color?: 'gray' | 'red';
}) {
  const bg = color === 'red' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200';
  const titleColor = color === 'red' ? 'text-red-700' : 'text-gray-500';
  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${titleColor}`}>{title}</p>
      {children}
    </div>
  );
}
