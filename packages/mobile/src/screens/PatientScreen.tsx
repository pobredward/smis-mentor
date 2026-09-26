'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Timestamp } from 'firebase/firestore';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../context/AuthContext';
import { db } from '../config/firebase';
import {
  subscribePatientRecords,
  addPatientRecord,
  updatePatientRecord,
  deletePatientRecord,
  addMedicationCheck,
  removeMedicationCheck,
  addSkipDate,
  removeSkipDate,
  updateIsolationReturnChecks,
  updateHospitalVisitEntry,
  addParentContactLog,
  removeParentContactLog,
  updateParentContactAssignee,
  updateProgressStatus,
  addProgressLog,
  removeProgressLog,
  updateManagerCheck,
  addMedicationSchedule,
  updateMedicationSchedule,
  removeMedicationSchedule,
  addIsolationCheckSchedule,
  completeIsolationCheckSchedule,
  updateReturnCriteriaChecks,
  getCampGroups,
  getSameGroupClassCodes,
  getUsersByJobCodeId,
  MEDICATION_TIMES,
  MEDICATION_CATEGORIES,
  PATIENT_TYPES,
  PROGRESS_STATUSES,
  HOSPITAL_STATUSES,
  RETURN_CRITERIA_LABELS,
  TRANSPORT_SLOTS,
  PARENT_REPORT_METHODS,
  isCarSlot,
  LOCATION_MODES,
  subscribeInventoryItems,
  subscribeInventoryGroups,
  subscribeInventoryStocks,
  buildInventoryViews,
  updateMedicationDoses,
  newDoseId,
  getGroupStock,
  getTotalStock,
  getItemUsage,
  itemThumb,
  INVENTORY_USAGE_LABELS,
  itemLabel,
  getDoseWarnings,
  doseLabel,
  findGroupByClassCode,
  TREATMENT_USAGES,
  ABDOMINAL_PAIN_SITES,
  hasAbdominalPain,
  formatSymptomText,
  FEVER_LEVELS,
  FEVER_LEVEL_RANGES,
  FEVER_THRESHOLDS,
  classifyFever,
  isFeverLevel,
  dosesForProgressLog, L, dataLabel, isEnglishUI, localizeLabels, isMultiUse, subscribeStaffMedicationUses, addStaffMedicationUse, updateStaffMedicationUse, deleteStaffMedicationUse } from '@smis-mentor/shared';
import type {
  PatientRecord,
  PatientType,
  MedicationSchedule,
  HospitalVisitEntry,
  MedicationTime,
  ProgressStatus,
  ProgressLog,
  HospitalStatus,
  ManagerCheck,
  IsolationCheckSchedule,
  HospitalBilling,
  BillingMethod,
  TransportSlot,
  ParentReportMethod,
  CampGroup,
  User,
  ContactMethod,
  ContactReportType,
  LocationMode,
  MedicationDose,
  InventoryItem,
  InventoryItemView,
  InventoryStock,
  InventoryGroup,
  InventoryUsage,
  FeverLevel, StaffMedicationUse } from '@smis-mentor/shared';
import jobCodesService from '../services/jobCodesService';
import { stSheetService } from '../services/stSheet';
import { authenticatedFetch } from '../utils/apiClient';
import { MyEscortPanel } from '../components/patient/MyEscortPanel';
import { EscortSsn } from '../components/patient/EscortSsn';
import { isActiveEscortVisit } from '@smis-mentor/shared';
import {
  SYMPTOM_GUIDES, getHospitalPresets, isKoreanStaff, ACTION_NOTE_PLACEHOLDER, ACTION_NOTE_EXAMPLE,
  makeMedTimeKey, schedActiveOn, isInDateRange, calcTotalDoses, todayDateKey as todayStr,
} from '@smis-mentor/shared';
import type { SymptomGuide } from '@smis-mentor/shared';

/**
 * 약 복용 기록 → 재고 정산 요청 (서버가 원장과 비교해 차이만 반영, 여러 번 호출해도 안전).
 * 실패해도 저장은 유지되고, 다음 저장 때 다시 맞춰진다.
 */
function syncDoseStock(recordId: string | undefined, campCode?: string | null) {
  if (!recordId) return;
  authenticatedFetch('/api/inventory/sync-dose', { method: 'POST', body: JSON.stringify({ recordId, campCode: campCode ?? undefined }) })
    .catch(e => console.warn('재고 정산 요청 실패 (다음 저장 때 다시 맞춰짐):', e));
}
import { STSheetStudent, CampCode } from '@smis-mentor/shared';

// ==================== 상수 ====================

const PROGRESS_COLOR: Record<ProgressStatus, { bg: string; text: string; dot: string; line: string }> = {
  최초보고: { bg: '#f3f4f6', text: '#374151', dot: '#9ca3af', line: '#d1d5db' },
  중간보고: { bg: '#eff6ff', text: '#1d4ed8', dot: '#60a5fa', line: '#bfdbfe' },
  완치:     { bg: '#dcfce7', text: '#166534', dot: '#22c55e', line: '#bbf7d0' },
};

const HOSPITAL_STATUS_COLOR: Record<HospitalStatus, { bg: string; text: string }> = {
  필요없음: { bg: '#f3f4f6', text: '#4b5563' },
  내원예정: { bg: '#fff7ed', text: '#c2410c' },
  내원완료: { bg: '#dcfce7', text: '#166534' },
};

const FIXED_GROUP_ORDER = ['junior', 'middle', 'senior', 'spring', 'summer', 'autumn', 'winter', 'common', 'short1', 'short2', 'short3', 'short4', 'manager'] as const;

const GROUP_DISPLAY_NAMES: Record<string, string> = localizeLabels({
  junior: '주니어', middle: '미들', senior: '시니어',
  spring: '스프링', summer: '서머', autumn: '어텀', winter: '원터',
  common: '공통', short1: '단기1', short2: '단기2', short3: '단기3', short4: '단기4',
  manager: '매니저',
});

const GROUP_BG_COLORS: Record<string, string> = {
  spring: '#fefce8', junior: '#fefce8',
  summer: '#f0fdf4', middle: '#f0fdf4',
  autumn: '#faf5ff', senior: '#faf5ff',
  winter: '#fef2f2',
  common: '#f9fafb',
  short1: '#f9fafb', short2: '#f9fafb', short3: '#f9fafb', short4: '#f9fafb',
  manager: '#f8fafc',
};

const GROUP_TEXT_COLORS: Record<string, string> = {
  spring: '#a16207', junior: '#a16207',
  summer: '#15803d', middle: '#15803d',
  autumn: '#7e22ce', senior: '#7e22ce',
  winter: '#b91c1c',
  common: '#6b7280',
  short1: '#4b5563', short2: '#4b5563', short3: '#4b5563', short4: '#4b5563',
  manager: '#475569',
};

const GROUP_BORDER_COLORS: Record<string, string> = {
  spring: '#fde68a', junior: '#fde68a',
  summer: '#bbf7d0', middle: '#bbf7d0',
  autumn: '#e9d5ff', senior: '#e9d5ff',
  winter: '#fecaca',
  common: '#e5e7eb',
  short1: '#e5e7eb', short2: '#e5e7eb', short3: '#e5e7eb', short4: '#e5e7eb',
  manager: '#cbd5e1',
};

// 열감 단계는 shared 공통 기준(FEVER_LEVELS / FEVER_THRESHOLDS) 사용 — 최초보고·경과보고 동일
const FEVER_OPTIONS = FEVER_LEVELS;
type FeverOption = FeverLevel;

// 재고(약품) 컨텍스트 — 최초보고·경과보고 약 복용 섹션이 같은 목록 사용
interface PatientInventory {
  /** 처치에 쓰는 사용 중 품목만 (먹는 약·바르는 약·처치 소모품) */
  medicines: InventoryItemView[];
  groups: InventoryGroup[];
  defaultGroupIdForClass: (classCode?: string) => string;
  dosesForStudent: (studentId?: string) => MedicationDose[];
  studentNote: (studentId?: string) => string | undefined;
}
const PatientInventoryContext = createContext<PatientInventory>({
  medicines: [], groups: [], defaultGroupIdForClass: () => '', dosesForStudent: () => [], studentNote: () => undefined,
});
const usePatientInventory = () => useContext(PatientInventoryContext);


const QUICK_ACTION_OPTIONS = [
  { id: '직접조치',   get label() { return L('patient.willHandleDirectly'); }, color: '#3b82f6', get desc() { return L('patient.iLlHandleItAs'); } },
  { id: '매니저대기', get label() { return L('patient.waitingForManager'); },    color: '#f97316', get desc() { return L('patient.needsAManagerSDecision'); } },
] as const;
type QuickActionId = typeof QUICK_ACTION_OPTIONS[number]['id'];

// ==================== 증상 가이드 (공유) ====================


const TYPE_COLOR: Record<PatientType, { bg: string; text: string }> = {
  처치전:   { bg: '#f3f4f6', text: '#374151' },
  단순처치: { bg: '#eff6ff', text: '#1d4ed8' },
  약복용:   { bg: '#fff7ed', text: '#c2410c' },
  격리:     { bg: '#f3e8ff', text: '#7e22ce' },
  병원내원: { bg: '#fef2f2', text: '#b91c1c' },
};

// ==================== 유틸 ====================

function formatDate(ts: Timestamp): string {
  const d = ts.toDate();
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatTime(ts: Timestamp): string {
  const d = ts.toDate();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}


/**
 * 시작 날 firstTime 이전 · 마지막 날 lastTime 이후 시간은 복용하지 않는다 (웹과 같은 규칙).
 * 예: 중식후부터 시작한 약은 첫날 기상후 · 조식후를 체크할 수 없다.
 */
function isMedTimeOff(
  s: { startDate: string; endDate: string; endDateAuto?: boolean; firstTime?: MedicationTime; lastTime?: MedicationTime },
  time: MedicationTime,
  date: string,
): boolean {
  const i = MEDICATION_TIMES.indexOf(time);
  const first = s.firstTime ? MEDICATION_TIMES.indexOf(s.firstTime) : -1;
  const last = s.lastTime ? MEDICATION_TIMES.indexOf(s.lastTime) : -1;
  if (date === s.startDate && first >= 0 && i < first) return true;
  if (!s.endDateAuto && date === s.endDate && last >= 0 && i > last) return true;
  return false;
}


/** 복용약 기간 한 줄 표시: 2026-09-06 (중식후~) ~ 2026-09-08 (~기상후) */
function formatMedPeriod(sched: MedicationSchedule): string {
  if (sched.endDateAuto) {
    const start = sched.startDate + (sched.firstTime ? ` (${sched.firstTime}~)` : '');
    return L('patient.campEnd3', { v0: start });
  }
  const start = sched.startDate + (sched.firstTime ? ` (${sched.firstTime}~)` : '');
  const end = sched.endDate + (sched.lastTime ? ` (~${sched.lastTime})` : '');
  return `${start} ~ ${end}`;
}


// ==================== 폼 타입 ====================

interface MedScheduleForm {
  name: string;
  times: MedicationTime[];
  startDate: string;
  endDate: string;
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
  assigneeId: string;
  assigneeName: string;
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
  assigneeId: '',
  assigneeName: '',
};

// ==================== 메인 컴포넌트 ====================

export function PatientScreen() {
  const { userData } = useAuth();
  const [records, setRecords] = useState<PatientRecord[]>([]);
  const [campCode, setCampCode] = useState<CampCode | null>(null);
  const [students, setStudents] = useState<STSheetStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [showQuickReport, setShowQuickReport] = useState(false);
  const [campGroups, setCampGroups] = useState<CampGroup[]>([]);
  const [campUsers, setCampUsers] = useState<User[]>([]);
  // 날짜가 바뀌면(자정 넘김) 오늘도 바뀐다 — 켜 둔 채 밤을 넘겨도 복용 체크가 전날로 기록되지 않게
  const [today, setToday] = useState(todayStr());
  useEffect(() => {
    const t = setInterval(() => setToday(prev => (prev === todayStr() ? prev : todayStr())), 30_000);
    return () => clearInterval(t);
  }, []);
  // 주 탭: 환자 현황 / 약복용명단
  const [mainTab, setMainTab] = useState<'환자 현황' | '약복용명단' | '선생님 약'>('환자 현황');

  const activeJobCodeId = useMemo(() => {
    const isAdmin = userData?.role === 'admin';
    return isAdmin
      ? ((userData as unknown as Record<string, unknown>).adminTempActiveCamp as string | undefined) ||
        userData?.activeJobExperienceId
      : userData?.activeJobExperienceId || userData?.jobExperiences?.[0]?.id;
  }, [userData]);

  // 캠프 코드 + 학생 목록 로드
  useEffect(() => {
    if (!activeJobCodeId) { setLoading(false); return; }
    jobCodesService.getJobCodesByIds([activeJobCodeId]).then(async codes => {
      if (codes.length > 0 && codes[0].code) {
        const cc = codes[0].code as CampCode;
        setCampCode(cc);
        try {
          const users = await getUsersByJobCodeId(db, activeJobCodeId);
          setCampUsers(users);
        } catch { /* 없어도 무방 */ }
        try {
          const groups = await getCampGroups(db, cc);
          setCampGroups(groups);
        } catch { /* 그룹 미설정 캠프는 무방 */ }
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

  // 재고(약품·그룹) 구독 — 약 복용 섹션에서 사용
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryStocks, setInventoryStocks] = useState<Record<string, InventoryStock>>({});
  const [inventoryGroups, setInventoryGroups] = useState<InventoryGroup[]>([]);
  useEffect(() => {
    if (!campCode) return;
    const unsubItems = subscribeInventoryItems(db, setInventoryItems);          // 품목 마스터 (회사 공통)
    const unsubStocks = subscribeInventoryStocks(db, campCode, setInventoryStocks); // 캠프별 수량
    const unsubGroups = subscribeInventoryGroups(db, campCode, setInventoryGroups); // 캠프별 그룹
    return () => { unsubItems(); unsubStocks(); unsubGroups(); };
  }, [campCode]);
  const patientInventory = useMemo<PatientInventory>(() => {
    const byCampGroup = new Map(
      inventoryGroups.filter(g => g.campGroupName).map(g => [g.campGroupName!.toLowerCase(), g.id] as const)
    );
    return {
      medicines: buildInventoryViews(
        inventoryItems.filter(i => i.isActive !== false && TREATMENT_USAGES.includes(getItemUsage(i))),
        inventoryStocks,
        inventoryGroups
      ),
      groups: inventoryGroups,
      defaultGroupIdForClass: (classCode) => {
        if (!classCode) return '';
        const cg = findGroupByClassCode(campGroups, classCode);
        return cg ? byCampGroup.get(cg.name.toLowerCase()) ?? '' : '';
      },
      dosesForStudent: (studentId) =>
        studentId ? records.filter(r => r.studentId === studentId).flatMap(r => r.medicationDoses ?? []) : [],
      studentNote: (studentId) => {
        const st = students.find(x => x.studentId === studentId) as (STSheetStudent & { medication?: string; notes?: string }) | undefined;
        const parts = [st?.medication && `복용약 ${st.medication}`, st?.notes && `특이사항 ${st.notes}`].filter(Boolean);
        return parts.length ? parts.join(' · ') : undefined;
      },
    };
  }, [inventoryItems, inventoryStocks, inventoryGroups, campGroups, records, students]);

  // 현재 환자 / 완치 분리
  const activeRecords = useMemo(() =>
    records.filter(r => r.progressStatus !== '완치'), [records]);
  const resolvedRecords = useMemo(() =>
    records.filter(r => r.progressStatus === '완치'), [records]);

  // 필터 (항상 전체 — 필터 UI 제거됨)
  const filterByMyUnit = useCallback((list: PatientRecord[]) => list, []);

  // 검색 필터
  const filterBySearch = useCallback((list: PatientRecord[]) => {
    const q = searchQuery.trim();
    if (!q) return list;
    return list.filter(r =>
      r.studentName.includes(q) || r.symptom.includes(q) || (r.className?.includes(q))
    );
  }, [searchQuery]);

  // 반별 그룹핑
  const activeByClass = useMemo(() => {
    const filtered = filterByMyUnit(filterBySearch(activeRecords));
    const map = new Map<string, PatientRecord[]>();
    filtered.forEach(r => {
      const key = r.className || '반 미배정';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    });
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === '반 미배정') return 1;
      if (b === '반 미배정') return -1;
      return a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' });
    });
  }, [activeRecords, filterBySearch, filterByMyUnit]);

  const classNameToGroupKey = useMemo((): Map<string, string> => {
    const result = new Map<string, string>();
    // 1차: campGroups에서 className → group 매핑
    campGroups.forEach(g => {
      g.classCodes.forEach(code => {
        if (!result.has(code)) result.set(code, g.name.toLowerCase());
      });
    });
    // 2차: campUsers에서 classMentor 기반 fallback
    records.forEach(r => {
      if (!r.className || result.has(r.className)) return;
      if (!r.classMentor) return;
      const mentorUser = campUsers.find(u => u.name === r.classMentor);
      if (!mentorUser) return;
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
  }, [records, campUsers, campGroups, activeJobCodeId]);

  const groupOrder = useMemo((): string[] => {
    if (campGroups.length > 0) return campGroups.map(g => g.name.toLowerCase());
    return [...FIXED_GROUP_ORDER];
  }, [campGroups]);

  const filteredResolved = useMemo(() =>
    filterByMyUnit(filterBySearch(resolvedRecords)), [resolvedRecords, filterBySearch, filterByMyUnit]);

  // 오늘 약 복용 명단
  const medicationRecords = useMemo(() => {
    return filterByMyUnit(records.filter(r => {
      if (r.progressStatus === '완치') return false;
      return (r.medicationSchedules ?? []).some(s => schedActiveOn(s, today));
    }));
  }, [records, today, filterByMyUnit]);

  const myPendingCount = useMemo(() =>
    records.filter(r => r.assigneeId === userData?.userId && r.progressStatus !== '완치').length,
    [records, userData?.userId]
  );

  const counts = useMemo(() => ({
    active: activeRecords.length,
    최초보고: activeRecords.filter(r => r.progressStatus === '최초보고').length,
    중간보고: activeRecords.filter(r => r.progressStatus === '중간보고').length,
    내원예정: activeRecords.filter(r =>
      (r.hospitalVisits ?? []).some(v => v.hospitalStatus === '내원예정')
    ).length,
    격리: activeRecords.filter(r => r.types.includes('격리')).length,
    완치: resolvedRecords.length,
  }), [activeRecords, resolvedRecords]);

  // ==================== 핸들러 ====================

  const openAddForm = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, assigneeName: userData?.name ?? '', assigneeId: userData?.userId ?? '' });
    setShowForm(true);
  };

  const openEditForm = (record: PatientRecord) => {
    setEditingId(record.id);
    const hv = (record.hospitalVisits ?? [])[0];
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
      })),
      hospitalStatus: hv?.hospitalStatus ?? '필요없음',
      hospitalEscort: hv?.escort ?? '',
      hospitalDate: hv?.scheduledAt ? hv.scheduledAt.toDate().toISOString().slice(0, 10) : '',
      hospitalTime: hv?.scheduledAt ? hv.scheduledAt.toDate().toTimeString().slice(0, 5) : '',
      hospitalPrescription: hv?.prescription ?? '',
      hospitalNotes: hv?.notes ?? '',
      assigneeId: record.assigneeId ?? '',
      assigneeName: record.assigneeName ?? '',
    });
    setShowForm(true);
  };

  const handleSubmit = useCallback(async () => {
    if (!campCode || !userData) return;
    if (!form.studentName.trim() || !form.symptom.trim()) {
      Alert.alert(L('patient.inputError'), L('patient.nameAndSymptomsAreRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const medSchedules: MedicationSchedule[] = form.medSchedules.map((s, si) => {
        const existing = editingId
          ? (records.find(r => r.id === editingId)?.medicationSchedules ?? [])[si]
          : undefined;
        const sched: MedicationSchedule = {
          name: s.name, times: s.times, startDate: s.startDate, endDate: s.endDate,
          totalDoses: 0, checkedTimes: existing?.checkedTimes ?? [],
        };
        sched.totalDoses = calcTotalDoses(sched);
        return sched;
      });

      const hospitalVisits: HospitalVisitEntry[] = [];
      if (form.types.includes('병원내원')) {
        let scheduledAt: Timestamp | undefined;
        if (form.hospitalDate) {
          const dt = form.hospitalTime
            ? `${form.hospitalDate}T${form.hospitalTime}:00`
            : `${form.hospitalDate}T00:00:00`;
          scheduledAt = Timestamp.fromDate(new Date(dt));
        }
        hospitalVisits.push({
          visitId: Date.now().toString(),
          hospitalStatus: form.hospitalStatus,
          escort: form.hospitalEscort.trim(),
          scheduledAt,
          prescription: form.hospitalPrescription.trim() || undefined,
          notes: form.hospitalNotes.trim() || undefined,
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

  const handleDelete = useCallback((id: string, name: string) => {
    const target = records.find(r => r.id === id);
    Alert.alert(L('common.confirmDelete'), L('patient.deleteThePatientRecordFor', { v0: name }), [
      { text: L('common.cancel'), style: 'cancel' },
      // 기록 삭제 시 남아 있는 약 복용 수량은 재고에 복구
      { text: L('common.delete'), style: 'destructive', onPress: async () => {
        await deletePatientRecord(db, id, target && campCode
          ? { campCode, currentDoses: target.medicationDoses ?? [], by: userData?.name ?? '', studentName: target.studentName }
          : undefined);
        // 삭제된 기록에 남아 있던 복용 수량은 서버가 원장 기준으로 재고에 복구
        if (target?.medicationDoses?.length) syncDoseStock(id, campCode);
      } },
    ]);
  }, [records, campCode, userData]);

  const handleProgressChange = useCallback(async (record: PatientRecord, status: ProgressStatus) => {
    if (!userData) return;
    await updateProgressStatus(db, record.id, status, userData.name);
  }, [userData]);

  const handleAddProgressLog = useCallback(async (
    record: PatientRecord,
    log: Omit<ProgressLog, 'loggedAt' | 'loggedBy'>,
    doses?: MedicationDose[]
  ) => {
    if (!userData || !campCode) return;
    // 경과보고와 함께 기록한 약 복용은 저장 시 1회만 재고 차감
    await addProgressLog(db, record.id, { ...log, loggedBy: userData.name },
      doses?.length ? { campCode, doses, by: userData.name, studentName: record.studentName } : undefined);
    if (doses?.length) syncDoseStock(record.id, campCode);
  }, [userData, campCode]);

  const handleRemoveProgressLog = useCallback(async (record: PatientRecord, logIndex: number) => {
    const logs = record.progressLogs ?? [];
    if (logs.length === 0) return;
    Alert.alert(L('common.confirmDelete'), L('patient.deleteThisProgressEntryMedication'), [
      { text: L('common.cancel'), style: 'cancel' },
      { text: L('common.delete'), style: 'destructive', onPress: async () => {
        await removeProgressLog(db, record.id, logs, logIndex,
          campCode ? { campCode, currentDoses: record.medicationDoses ?? [], by: userData?.name ?? '', studentName: record.studentName } : undefined);
        if (record.medicationDoses?.length) syncDoseStock(record.id, campCode);
      } },
    ]);
  }, [campCode, userData]);

  const handleManagerCheck = useCallback(async (record: PatientRecord, memo?: string) => {
    if (!userData) return;
    if (record.managerCheck) {
      await updateManagerCheck(db, record.id, null);
    } else {
      const check: ManagerCheck = {
        checkedAt: Timestamp.now(),
        checkedBy: userData.name,
        checkedById: userData.userId,
        ...(memo?.trim() ? { memo: memo.trim() } : {}),
      };
      await updateManagerCheck(db, record.id, check);
    }
  }, [userData]);

  const handleMedCheck = useCallback(async (
    record: PatientRecord, si: number, time: MedicationTime, checked: boolean
  ) => {
    const key = makeMedTimeKey(time, today);
    const allSchedules = Array.isArray(record.medicationSchedules) ? record.medicationSchedules : [];
    if (checked) await removeMedicationCheck(db, record.id, si, key, allSchedules);
    else await addMedicationCheck(db, record.id, si, key, allSchedules, userData?.name);
  }, [today, userData?.name]);

  const handleSkipDate = useCallback(async (
    record: PatientRecord, si: number, isCurrentlySkip: boolean
  ) => {
    const allSchedules = Array.isArray(record.medicationSchedules) ? record.medicationSchedules : [];
    if (isCurrentlySkip) await removeSkipDate(db, record.id, si, today, allSchedules);
    else await addSkipDate(db, record.id, si, today, allSchedules);
  }, [today]);

  const handleMedScheduleAdd = useCallback(async (
    record: PatientRecord, sched: Omit<MedicationSchedule, 'checkedTimes'>
  ) => {
    await addMedicationSchedule(db, record.id, sched);
  }, []);

  const handleMedScheduleUpdate = useCallback(async (
    record: PatientRecord, idx: number, sched: Omit<MedicationSchedule, 'checkedTimes'>
  ) => {
    const allSchedules = Array.isArray(record.medicationSchedules) ? record.medicationSchedules : [];
    await updateMedicationSchedule(db, record.id, allSchedules, idx, sched);
  }, []);

  const handleMedScheduleRemove = useCallback(async (
    record: PatientRecord, idx: number
  ) => {
    const allSchedules = Array.isArray(record.medicationSchedules) ? record.medicationSchedules : [];
    await removeMedicationSchedule(db, record.id, allSchedules, idx);
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

  const handleReturnCriteriaCheck = useCallback(async (record: PatientRecord, idx: number, val: boolean) => {
    const current = record.returnCriteriaChecks ?? [false, false, false];
    const updated = [...current];
    updated[idx] = val;
    await updateReturnCriteriaChecks(db, record.id, updated);
    if (updated.every(Boolean) && userData && record.progressStatus !== '완치') {
      await updateProgressStatus(db, record.id, '중간보고', userData.name, '복귀 기준 모두 충족');
    }
  }, [userData]);

  const handleAddIsolationCheckSchedule = useCallback(async (record: PatientRecord, minutesLater: number) => {
    if (!userData) return;
    const now = new Date();
    now.setMinutes(now.getMinutes() + minutesLater);
    const schedule: IsolationCheckSchedule = {
      id: Date.now().toString(),
      scheduledAt: Timestamp.fromDate(now),
    };
    await addIsolationCheckSchedule(db, record.id, schedule);
  }, [userData]);

  const handleCompleteIsolationCheck = useCallback(async (
    record: PatientRecord, scheduleId: string, temperature?: number,
    status?: IsolationCheckSchedule['status'], note?: string
  ) => {
    if (!userData) return;
    const updated = (record.isolationCheckSchedules ?? []).map(s =>
      s.id === scheduleId
        ? { ...s, completedAt: Timestamp.now(), checkedBy: userData.name, temperature, status, note }
        : s
    );
    await completeIsolationCheckSchedule(db, record.id, updated);
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

  const orderedPatientGroups = useMemo(() => {
    const groupMap = new Map<string, [string, PatientRecord[]][]>();
    activeByClass.forEach(([className, classRecords]) => {
      const groupKey = classNameToGroupKey.get(className) ?? '';
      if (!groupMap.has(groupKey)) groupMap.set(groupKey, []);
      groupMap.get(groupKey)!.push([className, classRecords]);
    });
    const ordered: { key: string; classes: [string, PatientRecord[]][] }[] = [];
    groupOrder.forEach(gk => {
      if (groupMap.has(gk)) {
        ordered.push({ key: gk, classes: groupMap.get(gk)! });
        groupMap.delete(gk);
      }
    });
    groupMap.forEach((classes, key) => ordered.push({ key, classes }));
    return ordered;
  }, [activeByClass, classNameToGroupKey, groupOrder]);

  if (!activeJobCodeId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>{L('patient.pleaseSelectAnActiveCamp')}</Text>
      </View>
    );
  }

  return (
    <PatientInventoryContext.Provider value={patientInventory}>
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        {/* ── 대탭: 환자 현황 / 약복용명단 — 최상단 */}
        <View style={styles.mainTabRow}>
          {(['환자 현황', '약복용명단', '선생님 약'] as const).map(tab => (
            <TouchableOpacity
              key={dataLabel(tab)}
              style={[styles.mainTab, mainTab === tab && styles.mainTabActive]}
              onPress={() => setMainTab(tab)}
            >
              <Text style={[styles.mainTabText, mainTab === tab && styles.mainTabTextActive]}>
                {dataLabel(tab)}
              </Text>
              {tab === '약복용명단' && medicationRecords.length > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{medicationRecords.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── 탭별 서브헤더 */}
        {mainTab === '환자 현황' ? (
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <View style={styles.headerTitleRow}>
                <Text style={styles.headerTitle}>{L('patient.patientCare')}</Text>
                {myPendingCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{myPendingCount}</Text>
                  </View>
                )}
              </View>
              <View style={styles.pillRow}>
                {counts.최초보고 > 0 && <Pill label={L('data.progFirstReport')} count={counts.최초보고} color="#6b7280" />}
                {counts.중간보고 > 0 && <Pill label={L('data.progMidReport')} count={counts.중간보고} color="#1d4ed8" />}
                {counts.내원예정 > 0 && <Pill label={L('data.hospitalPlanned')} count={counts.내원예정} color="#b91c1c" />}
                {counts.격리 > 0 && <Pill label={L('data.ptIsolation')} count={counts.격리} color="#7c3aed" />}
                {counts.active === 0 && <Text style={styles.emptySmall}>{L('patient.noCurrentPatients')}</Text>}
              </View>
            </View>
            <TouchableOpacity style={styles.quickReportBtn} onPress={() => setShowQuickReport(true)}>
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={styles.quickReportBtnText}>{L('data.progFirstReport')}</Text>
            </TouchableOpacity>
          </View>
        ) : mainTab === '약복용명단' ? (
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={styles.headerTitle}>{L('patient.medicationList')}</Text>
              <Text style={styles.subHeaderSub}>
                {medicationRecords.length > 0 ? L('patient.studentsOnMedication', { v0: medicationRecords.length }) : L('patient.noStudentsOnMedication')}
              </Text>
            </View>
            <TouchableOpacity style={styles.addBtnDisabled} disabled>
              <Ionicons name="add" size={14} color="#9ca3af" />
              <Text style={styles.addBtnDisabledText}>{L('patient.addToList')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      {/* 검색 (환자 현황 탭만) */}
      {mainTab === '환자 현황' && (
        <View style={styles.searchBar}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={14} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={L('patient.searchNameSymptomClass')}
              placeholderTextColor="#9ca3af"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={14} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* 콘텐츠 */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#ef4444" />
        </View>
      ) : mainTab === '선생님 약' ? (
        <StaffMedicationSectionMobile campCode={campCode} jobCodeId={activeJobCodeId} campUsers={campUsers} />
      ) : mainTab === '약복용명단' ? (
        <MedicationListView
          records={medicationRecords}
          today={today}
          currentUserName={userData?.name ?? ''}
          onCheck={(record, si, t, checked) => handleMedCheck(record, si, t, checked)}
        />
      ) : (
        <FlatList
          data={orderedPatientGroups}
          keyExtractor={(item) => item.key || 'nogroup'}
          ListHeaderComponent={() => (
            <View>
              <MyEscortPanel records={records} myName={userData?.name} onOpen={(id) => setExpandedId(id)} />
              <TransportBoardMobile allRecords={records} />
            </View>
          )}
          renderItem={({ item: { key: groupKey, classes } }) => {
            const campGroupName = campGroups.find(g => g.name.toLowerCase() === groupKey)?.name;
            const groupDisplayName = campGroupName ?? GROUP_DISPLAY_NAMES[groupKey] ?? (groupKey || '기타');
            const bgColor = GROUP_BG_COLORS[groupKey] ?? '#f9fafb';
            const textColor = GROUP_TEXT_COLORS[groupKey] ?? '#6b7280';
            const borderColor = GROUP_BORDER_COLORS[groupKey] ?? '#e5e7eb';
            const groupTotal = classes.reduce((sum, [, rs]) => sum + rs.length, 0);
            // hasUrgent: 긴급 배너 제거로 미사용

            return (
              <View style={{ borderRadius: 12, borderWidth: 1.5, borderColor, backgroundColor: bgColor, marginBottom: 12, overflow: 'hidden' }}>
                {groupKey ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: borderColor }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: textColor }}>{groupDisplayName}</Text>
                    <Text style={{ fontSize: 11, color: textColor, opacity: 0.6 }}>{groupTotal}{L('common.people2')}</Text>
                  </View>
                ) : null}
                {classes.map(([className, classRecords], ci) => (
                  <React.Fragment key={className}>
                    {ci > 0 && <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.08)', marginTop: 2 }} />}
                  <ClassGroup
                    className={className}
                    records={classRecords}
                    today={today}
                    currentUserId={userData?.userId ?? ''}
                    currentUserName={userData?.name ?? ''}
                    currentUserRole={userData?.role}
                    campUsers={campUsers}
                    campGroups={campGroups}
                    allRecords={records}
                    expandedId={expandedId}
                    groupBorderColor={borderColor}
                    onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
                    onEdit={openEditForm}
                    onDelete={(id, name) => handleDelete(id, name)}
                    onProgressChange={(record, s) => handleProgressChange(record, s)}
                    onAddProgressLog={(record, log, doses) => handleAddProgressLog(record, log, doses)}
                    onRemoveProgressLog={(record, idx) => handleRemoveProgressLog(record, idx)}
                    onMedCheck={(record, si, t, checked) => handleMedCheck(record, si, t, checked)}
                    onAddMedSchedule={(record, s) => handleMedScheduleAdd(record, s)}
                    onUpdateMedSchedule={(record, idx, s) => handleMedScheduleUpdate(record, idx, s)}
                    onRemoveMedSchedule={(record, idx) => handleMedScheduleRemove(record, idx)}
                    onIsolationCheck={(record, i, v) => handleIsolationCheck(record, i, v)}
                    onAddHospitalVisit={(record) => handleAddHospitalVisit(record)}
                    onUpdateHospitalVisit={(record, visits) => handleUpdateHospitalVisit(record, visits)}
                    onAddIsolationCheckSchedule={(record, min) => handleAddIsolationCheckSchedule(record, min)}
                    onCompleteIsolationCheck={(record, id, temp, status, note) => handleCompleteIsolationCheck(record, id, temp, status, note)}
                    onReturnCriteriaCheck={(record, i, v) => handleReturnCriteriaCheck(record, i, v)}
                  />
                  </React.Fragment>
                ))}
              </View>
            );
          }}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>{L('patient.thereAreNoCurrentPatients')}</Text>
              <TouchableOpacity onPress={() => setShowQuickReport(true)}>
                <Text style={styles.emptyAction}>{L('patient.submitFirstReport2')}</Text>
              </TouchableOpacity>
            </View>
          )}
          ListFooterComponent={filteredResolved.length > 0 ? (
            <View style={styles.resolvedSection}>
              <TouchableOpacity
                style={styles.resolvedHeader}
                onPress={() => setShowResolved(v => !v)}
              >
                <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                <Text style={styles.resolvedTitle}>{L('patient.recoveredRecords')}</Text>
                <View style={styles.resolvedCount}>
                  <Text style={styles.resolvedCountText}>{filteredResolved.length}</Text>
                </View>
                <Ionicons name={showResolved ? 'chevron-up' : 'chevron-down'} size={14} color="#9ca3af" />
              </TouchableOpacity>
              {showResolved && filteredResolved.map(record => (
                <PatientCard
                  key={record.id}
                  record={record}
                  today={today}
                  currentUserId={userData?.userId ?? ''}
                  currentUserName={userData?.name ?? ''}
                  currentUserRole={userData?.role}
                  campUsers={campUsers}
                  campGroups={campGroups}
                  allRecords={records}
                  expandedId={expandedId}
                  onToggleExpand={() => setExpandedId(expandedId === record.id ? null : record.id)}
                  onEdit={() => openEditForm(record)}
                  onDelete={() => handleDelete(record.id, record.studentName)}
                  onProgressChange={(s) => handleProgressChange(record, s)}
                  onAddProgressLog={(log, doses) => handleAddProgressLog(record, log, doses)}
                  onRemoveProgressLog={(idx) => handleRemoveProgressLog(record, idx)}
                  onMedCheck={(si, t, checked) => handleMedCheck(record, si, t, checked)}
                  onAddMedSchedule={(s) => handleMedScheduleAdd(record, s)}
                  onUpdateMedSchedule={(idx, s) => handleMedScheduleUpdate(record, idx, s)}
                  onRemoveMedSchedule={(idx) => handleMedScheduleRemove(record, idx)}
                  onIsolationCheck={(i, v) => handleIsolationCheck(record, i, v)}
                  onAddHospitalVisit={() => handleAddHospitalVisit(record)}
                  onUpdateHospitalVisit={(visits) => handleUpdateHospitalVisit(record, visits)}
                  onAddIsolationCheckSchedule={(min) => handleAddIsolationCheckSchedule(record, min)}
                  onCompleteIsolationCheck={(id, temp, status, note) => handleCompleteIsolationCheck(record, id, temp, status, note)}
                  onReturnCriteriaCheck={(i, v) => handleReturnCriteriaCheck(record, i, v)}
                />
              ))}
            </View>
          ) : null}
          contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* 최초보고 모달 */}
      <Modal visible={showQuickReport} animationType="none" transparent>
        <QuickReportModalMobile
          students={students}
          reporterName={userData?.name ?? ''}
          onClose={() => setShowQuickReport(false)}
          onSubmit={async (quickForm) => {
            if (!campCode || !userData) return;
            const newRecordId = await addPatientRecord(db, {
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
              ...(quickForm.symptoms?.length ? { symptoms: quickForm.symptoms } : {}),
              ...(quickForm.abdominalPainSites?.length ? { abdominalPainSites: quickForm.abdominalPainSites } : {}),
              treatment: quickForm.treatment,
              temperature: quickForm.temperature ? parseFloat(quickForm.temperature) : undefined,
              fever: quickForm.fever || undefined,
              ...(quickForm.doses?.length ? { medicationDoses: quickForm.doses } : {}),
              notes: quickForm.actionNote || undefined,
              locationMode: quickForm.locationMode,
              location: quickForm.location || undefined,
              progressStatus: '최초보고',
              visitDate: Timestamp.now(),
              assigneeName: userData.name,
              assigneeId: userData.userId,
              recordedBy: userData.name,
              recordedById: userData.userId,
            });
            if (quickForm.doses?.length) syncDoseStock(newRecordId, campCode);
            setShowQuickReport(false);
          }}
        />
      </Modal>

      {/* 폼 모달 */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <PatientFormModal
          form={form}
          setForm={setForm}
          editingId={editingId}
          submitting={submitting}
          today={today}
          students={students}
          onClose={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}
          onSubmit={handleSubmit}
        />
      </Modal>
    </View>
    </PatientInventoryContext.Provider>
  );
}

// ==================== 뱃지 컴포넌트 ====================

function Pill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: color + '20' }]}>
      <Text style={[styles.pillText, { color }]}>{label} {count}</Text>
    </View>
  );
}

// ==================== 약 복용 명단 뷰 ====================

// 방 담당: 기상 직후 / 취침 전 투약
const ROOM_TIMES_M: MedicationTime[] = ['기상후', '취침전'];
// 반 담당: 식사 후 투약
const CLASS_TIMES_M: MedicationTime[] = ['조식후', '중식후', '석식후'];

/** 반 이름 표시용: "OnePiece" → "OnePiece반" */
const fmtClassM = (name: string) =>
  name === '반 미배정' ? dataLabel(name) : isEnglishUI() ? name : name.endsWith('반') ? name : `${name}반`;

/** grade 문자열("3F", "4M")에서 성별: F=0(여, 위), M=1(남, 아래) */
const genderOrderM = (grade?: string) => (grade?.endsWith('F') ? 0 : 1);

/** visitDate 기준 경과일 (0=오늘, 1=어제 등) */
function daysElapsedM(visitDate: Timestamp): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const visit = visitDate.toDate();
  visit.setHours(0, 0, 0, 0);
  return Math.floor((today.getTime() - visit.getTime()) / 86400000);
}

/** 환자 긴급도 점수: 낮을수록 우선 */
function urgencyScoreM(r: PatientRecord): number {
  if (r.types.includes('격리')) return 0;
  if (r.progressStatus === '최초보고') return 2;
  if (r.types.includes('병원내원')) return 3;
  if (r.progressStatus === '중간보고') return 5;
  return 9;
}

/** 방담당 정렬: ①여자먼저 ②className 반코드 오름차순 ③이름 */
const sortRoomRecordsM = (list: PatientRecord[]) =>
  [...list].sort((a, b) => {
    const gA = genderOrderM(a.grade), gB = genderOrderM(b.grade);
    if (gA !== gB) return gA - gB;
    const cA = a.className ?? '', cB = b.className ?? '';
    const cmp = cA.localeCompare(cB, 'ko', { numeric: true, sensitivity: 'base' });
    return cmp !== 0 ? cmp : a.studentName.localeCompare(b.studentName, 'ko');
  });

function MedicationListView({
  records, today, currentUserName, onCheck, onSkipDate,
}: {
  records: PatientRecord[];
  today: string;
  currentUserName: string;
  onCheck: (record: PatientRecord, si: number, t: MedicationTime, checked: boolean) => void;
  onSkipDate?: (record: PatientRecord, si: number, isCurrentlySkip: boolean) => void;
}) {
  const [selectedTime, setSelectedTime] = useState<MedicationTime | null>(null);
  const [confirmPending, setConfirmPending] = useState<{
    record: PatientRecord; si: number; time: MedicationTime; medName: string;
  } | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (records.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 40, marginBottom: 8 }}>💊</Text>
        <Text style={styles.emptyText}>{L('patient.noMedicationScheduledForToday')}</Text>
      </View>
    );
  }

  // 시간대별 진행률 계산
  const calcTimeProgress = (time: MedicationTime) => {
    let total = 0, done = 0;
    records.forEach(r => {
      (r.medicationSchedules ?? []).forEach(sched => {
        if (!schedActiveOn(sched, today)) return;
        if (!sched.times.includes(time)) return;
        if ((sched.skipDates ?? []).includes(today)) return; // 휴약일 제외
        if (isMedTimeOff(sched, time, today)) return; // 첫날 시작 전 · 마지막 날 이후
        total++;
        if (sched.checkedTimes.includes(makeMedTimeKey(time, today))) done++;
      });
    });
    return { total, done, allDone: total > 0 && done === total, none: total === 0 };
  };

  const recordsWithTimes = (filterTimes: MedicationTime[]) =>
    records.filter(r =>
      (r.medicationSchedules ?? []).some(sched =>
        schedActiveOn(sched, today) &&
        sched.times.some(t => filterTimes.includes(t))
      )
    );

  // 시간대별 색상 메타
  const timeMeta: Record<MedicationTime, { group: 'room' | 'class'; bg: string; text: string; border: string; selectedBorder: string }> = {
    '기상후': { group: 'room',  bg: '#eef2ff', text: '#4f46e5', border: '#c7d2fe', selectedBorder: '#6366f1' },
    '조식후': { group: 'class', bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', selectedBorder: '#f97316' },
    '중식후': { group: 'class', bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', selectedBorder: '#f97316' },
    '석식후': { group: 'class', bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', selectedBorder: '#f97316' },
    '취침전': { group: 'room',  bg: '#eef2ff', text: '#4f46e5', border: '#c7d2fe', selectedBorder: '#6366f1' },
  };

  // 필터 적용된 섹션 타임
  const activeRoomTimes = selectedTime
    ? (ROOM_TIMES_M.includes(selectedTime) ? [selectedTime] : [])
    : ROOM_TIMES_M;
  const activeClassTimes = selectedTime
    ? (CLASS_TIMES_M.includes(selectedTime) ? [selectedTime] : [])
    : CLASS_TIMES_M;

  // 방담당: 여자먼저 → className 반코드 오름차순 → 이름
  const roomRecords = sortRoomRecordsM(recordsWithTimes(activeRoomTimes));
  // 반담당: className 반코드 오름차순 → 이름
  const classRecords = [...recordsWithTimes(activeClassTimes)].sort((a, b) => {
    const cA = a.className ?? '', cB = b.className ?? '';
    const cmp = cA.localeCompare(cB, 'ko', { numeric: true, sensitivity: 'base' });
    return cmp !== 0 ? cmp : a.studentName.localeCompare(b.studentName, 'ko');
  });

  const roomLabel = selectedTime && ROOM_TIMES_M.includes(selectedTime) ? selectedTime : L('patient.afterWakingBeforeBed2');
  const classLabel = selectedTime && CLASS_TIMES_M.includes(selectedTime) ? selectedTime : L('patient.afterBreakfastLunchDinner2');

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Modal visible={!!confirmPending} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, gap: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', textAlign: 'center', color: '#111827' }}>{L('patient.confirmDoseTaken')}</Text>
            <Text style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', lineHeight: 18 }}>
              {confirmPending ? L('patient.markSDoseAsTaken', { v0: confirmPending.record.studentName, v1: confirmPending.medName, v2: confirmPending.time }) : ''}
            </Text>
            <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center' }}>{L('patient.didTheStudentReallyTake')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.editBtn, { flex: 1 }]} onPress={() => setConfirmPending(null)}>
                <Text style={styles.editBtnText}>{L('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#22c55e', borderRadius: 8, padding: 10, alignItems: 'center' }}
                onPress={() => {
                  if (confirmPending) onCheck(confirmPending.record, confirmPending.si, confirmPending.time, false);
                  setConfirmPending(null);
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>{L('patient.confirm')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!lightboxUrl} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 16 }} activeOpacity={1} onPress={() => setLightboxUrl(null)}>
          {lightboxUrl && <Image source={{ uri: lightboxUrl }} style={{ width: '100%', height: 400 }} contentFit="contain" />}
        </TouchableOpacity>
      </Modal>
      {/* 시간대별 현황 헤더 */}
      <View style={[styles.medHeader, { margin: 12, borderRadius: 12, padding: 12, gap: 8 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', color: '#374151', fontSize: 12 }}>{L('patient.dosesByTime')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {selectedTime && (
              <TouchableOpacity
                onPress={() => setSelectedTime(null)}
                style={{ backgroundColor: '#f3f4f6', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}
              >
                <Text style={{ fontSize: 10, color: '#6b7280' }}>{L('patient.all')}</Text>
              </TouchableOpacity>
            )}
            <Text style={{ color: '#9ca3af', fontSize: 10 }}>{records.length}{L('common.people2')}</Text>
          </View>
        </View>
        {/* 5개 시간대 타일 */}
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {MEDICATION_TIMES.map(time => {
            const prog = calcTimeProgress(time);
            const meta = timeMeta[time];
            const isSelected = selectedTime === time;

            if (prog.none) {
              return (
                <View key={time} style={{ flex: 1, alignItems: 'center', gap: 2, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#f9fafb', paddingVertical: 8, opacity: 0.5 }}>
                  <Text style={{ fontSize: 9, color: '#d1d5db', fontWeight: '600' }}>{dataLabel(time)}</Text>
                  <Text style={{ fontSize: 9, color: '#d1d5db' }}>-</Text>
                </View>
              );
            }
            return (
              <TouchableOpacity
                key={time}
                onPress={() => setSelectedTime(prev => prev === time ? null : time)}
                activeOpacity={0.75}
                style={{
                  flex: 1, alignItems: 'center', gap: 2, borderRadius: 8,
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? meta.selectedBorder : (prog.allDone ? '#86efac' : meta.border),
                  backgroundColor: prog.allDone ? '#f0fdf4' : meta.bg,
                  paddingVertical: 8,
                  // 선택시 살짝 눌린 느낌
                  transform: [{ scale: isSelected ? 1.04 : 1 }],
                }}
              >
                <Text style={{ fontSize: 9, fontWeight: '700', color: prog.allDone && !isSelected ? '#16a34a' : meta.text }}>{dataLabel(time)}</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: prog.allDone && !isSelected ? '#16a34a' : meta.text }}>
                  {prog.done}/{prog.total}
                </Text>
                {prog.allDone
                  ? <Text style={{ fontSize: 8, color: '#16a34a' }}>{L('patient.done4')}</Text>
                  : isSelected
                    ? <Text style={{ fontSize: 8, color: meta.text, opacity: 0.7 }}>{L('patient.selected2')}</Text>
                    : <Text style={{ fontSize: 8, color: '#d1d5db' }}>{L('patient.tap')}</Text>
                }
              </TouchableOpacity>
            );
          })}
        </View>
        {/* 범례 */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#818cf8' }} />
            <Text style={{ fontSize: 9, color: '#6366f1' }}>{L('patient.roomLead')}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#f97316' }} />
            <Text style={{ fontSize: 9, color: '#ea580c' }}>{L('patient.classLead')}</Text>
          </View>
        </View>
      </View>

      {/* 방 담당 섹션 */}
      {activeRoomTimes.length > 0 && roomRecords.length > 0 && (
        <View>
          <View style={{ backgroundColor: '#eef2ff', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#c7d2fe', paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#818cf8' }} />
            <Text style={{ fontWeight: '700', color: '#4f46e5', fontSize: 11 }}>{L('patient.roomLead2')}</Text>
            <Text style={{ color: '#6366f1', fontSize: 10 }}>{roomLabel}</Text>
            <Text style={{ marginLeft: 'auto', color: '#6366f1', fontSize: 10 }}>{roomRecords.length}{L('common.people2')}</Text>
          </View>
          <View style={{ paddingHorizontal: 12, paddingTop: 8, gap: 8 }}>
            {roomRecords.map(record => (
              <MedPatientCard
                key={record.id}
                record={record}
                today={today}
                filterTimes={activeRoomTimes}
                accentBg="#eef2ff"
                accentColor="#4f46e5"
                dotColor="#818cf8"
                barColor="#818cf8"
                responsibleName={record.unitMentor || undefined}
                onCheck={(si, t, checked) => onCheck(record, si, t, checked)}
                onSkipDate={onSkipDate ? (si, isSkip) => onSkipDate(record, si, isSkip) : undefined}
                onRequestConfirm={(si, time, medName) => setConfirmPending({ record, si, time, medName })}
                onViewPhoto={setLightboxUrl}
              />
            ))}
          </View>
        </View>
      )}

      {/* 반 담당 섹션 */}
      {activeClassTimes.length > 0 && classRecords.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <View style={{ backgroundColor: '#fff7ed', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#fed7aa', paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#f97316' }} />
            <Text style={{ fontWeight: '700', color: '#c2410c', fontSize: 11 }}>{L('patient.classLead2')}</Text>
            <Text style={{ color: '#ea580c', fontSize: 10 }}>{classLabel}</Text>
            <Text style={{ marginLeft: 'auto', color: '#ea580c', fontSize: 10 }}>{classRecords.length}{L('common.people2')}</Text>
          </View>
          <View style={{ paddingHorizontal: 12, paddingTop: 8, gap: 8 }}>
            {classRecords.map(record => (
              <MedPatientCard
                key={record.id}
                record={record}
                today={today}
                filterTimes={activeClassTimes}
                accentBg="#fff7ed"
                accentColor="#c2410c"
                dotColor="#f97316"
                barColor="#fb923c"
                responsibleName={record.classMentor || undefined}
                onCheck={(si, t, checked) => onCheck(record, si, t, checked)}
                onSkipDate={onSkipDate ? (si, isSkip) => onSkipDate(record, si, isSkip) : undefined}
                onRequestConfirm={(si, time, medName) => setConfirmPending({ record, si, time, medName })}
                onViewPhoto={setLightboxUrl}
              />
            ))}
          </View>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

/** 약복용명단 전용 환자 카드 (filterTimes에 해당 시간대만 표시) */
function MedPatientCard({
  record, today, filterTimes, accentBg, accentColor, dotColor, barColor, responsibleName, onCheck, onSkipDate, onRequestConfirm, onViewPhoto,
}: {
  record: PatientRecord;
  today: string;
  filterTimes: MedicationTime[];
  accentBg: string;
  accentColor: string;
  dotColor: string;
  barColor: string;
  responsibleName?: string;
  onCheck: (si: number, t: MedicationTime, checked: boolean) => void;
  onSkipDate?: (si: number, isCurrentlySkip: boolean) => void;
  onRequestConfirm?: (si: number, time: MedicationTime, medName: string) => void;
  onViewPhoto?: (url: string) => void;
}) {
  const [openPhotoIdxs, setOpenPhotoIdxs] = useState<Set<number>>(new Set());
  const togglePhotoPanel = (idx: number) =>
    setOpenPhotoIdxs(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  const todayScheds = (record.medicationSchedules ?? [])
    .map((s, idx) => ({ ...s, idx }))
    .filter(s =>
      schedActiveOn(s, today) &&
      s.times.some(t => filterTimes.includes(t))
    );

  // 휴약일인 스케줄은 진행률 집계에서 제외
  const todayTotal = todayScheds.reduce((sum, s) => {
    if ((s.skipDates ?? []).includes(today)) return sum;
    return sum + s.times.filter(t => filterTimes.includes(t) && !isMedTimeOff(s, t, today)).length;
  }, 0);
  const todayDone = todayScheds.reduce((sum, s) => {
    if ((s.skipDates ?? []).includes(today)) return sum;
    return sum + s.times.filter(t => filterTimes.includes(t) && !isMedTimeOff(s, t, today) && s.checkedTimes.includes(makeMedTimeKey(t, today))).length;
  }, 0);
  const allDone = todayTotal > 0 && todayDone === todayTotal;

  return (
    <View style={[styles.medCard, { borderColor: allDone ? '#86efac' : '#e5e7eb' }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: allDone ? '#22c55e' : dotColor }} />
          <Text style={{ fontWeight: '700', fontSize: 14, color: '#111827' }}>{record.studentName}</Text>
          {record.grade && <Text style={{ color: '#6b7280', fontSize: 11 }}>{record.grade}</Text>}
          {record.className && (
            <View style={{ backgroundColor: '#eff6ff', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: '#1d4ed8', fontSize: 10 }}>{fmtClassM(record.className)}</Text>
            </View>
          )}
          {record.roomNumber && (
            <View style={{ backgroundColor: '#f9fafb', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: '#6b7280', fontSize: 10 }}>{record.roomNumber}{L('students.text')}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {responsibleName && (
            <View style={{ backgroundColor: accentBg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: accentColor, fontSize: 10, fontWeight: '600' }}>{L('patient.assigned')} {responsibleName}</Text>
            </View>
          )}
          <View style={{ backgroundColor: allDone ? '#dcfce7' : accentBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: allDone ? '#166534' : accentColor, fontSize: 10, fontWeight: '700' }}>
              {allDone ? L('patient.done') : L('patient.doses', { v0: todayDone, v1: todayTotal })}
            </Text>
          </View>
        </View>
      </View>

      {todayScheds.map(sched => {
        const skipToday = (sched.skipDates ?? []).includes(today);
        const visibleTimes = sched.times.filter(t => filterTimes.includes(t));
        return (
          <View key={sched.idx} style={{ marginBottom: 8, opacity: skipToday ? 0.5 : 1 }}>
            {/* 약 이름 + 패턴 배지 + 휴약일 버튼 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }}>
                <Text style={{ color: accentColor, fontWeight: '700', fontSize: 11 }}>{sched.name}</Text>
                {sched.endDateAuto && (
                  <View style={{ backgroundColor: '#fff7ed', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: '#fed7aa' }}>
                    <Text style={{ color: '#c2410c', fontSize: 9 }}>{L('patient.campEnd2')}</Text>
                  </View>
                )}
                {sched.daysPerWeek && (
                  <View style={{ backgroundColor: '#f9fafb', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: '#e5e7eb' }}>
                    <Text style={{ color: '#6b7280', fontSize: 9 }}>{L('patient.wk')}{sched.daysPerWeek}{L('patient.d')}</Text>
                  </View>
                )}
              </View>
              {onSkipDate && (
                <TouchableOpacity
                  onPress={() => onSkipDate(sched.idx, skipToday)}
                  style={{ backgroundColor: skipToday ? '#e5e7eb' : '#f9fafb', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: skipToday ? '#d1d5db' : '#e5e7eb' }}
                >
                  <Text style={{ color: skipToday ? '#374151' : '#9ca3af', fontSize: 9, fontWeight: '600' }}>
                    {skipToday ? L('patient.skipDay2') : L('patient.skipDay')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {/* 휴약일이면 안내, 아니면 버튼 */}
            {skipToday ? (
              <View style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#e5e7eb' }}>
                <Text style={{ color: '#6b7280', fontSize: 10 }}>{L('patient.noDoseTodaySkipDay')}</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {visibleTimes.map(time => {
                  const key = makeMedTimeKey(time, today);
                  const checked = sched.checkedTimes.includes(key);
                  const checkerName = sched.checkedBy?.[key];
                  const off = !checked && isMedTimeOff(sched, time, today);
                  return (
                    <View key={time} style={{ alignItems: 'flex-start' }}>
                      <TouchableOpacity
                        disabled={off}
                        style={[styles.medTimeBtn, checked && styles.medTimeBtnDone, off && { opacity: 0.35 }]}
                        onPress={() => {
                          if (checked) onCheck(sched.idx, time, true);
                          else onRequestConfirm?.(sched.idx, time, sched.name);
                        }}
                      >
                        {checked && <Text style={{ color: '#fff', fontSize: 10, marginRight: 2 }}>✓</Text>}
                        <Text style={[styles.medTimeBtnText, checked && { color: '#fff' }]}>{dataLabel(time)}</Text>
                      </TouchableOpacity>
                      {checked && checkerName && (
                        <Text style={{ fontSize: 8, color: '#9ca3af', marginTop: 2 }}>{checkerName}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
            {(sched.photos?.length ?? 0) > 0 && (
              <View style={{ marginTop: 6 }}>
                <TouchableOpacity onPress={() => togglePhotoPanel(sched.idx)}>
                  <Text style={{ fontSize: 10, color: accentColor, fontWeight: '600' }}>
                    {openPhotoIdxs.has(sched.idx) ? L('patient.hideMedicationPhotos') : L('patient.viewMedicationPhotos2')}
                  </Text>
                </TouchableOpacity>
                {openPhotoIdxs.has(sched.idx) && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {(sched.photos ?? []).map((url, pi) => (
                      <TouchableOpacity key={pi} onPress={() => onViewPhoto?.(url)}>
                        <Image source={{ uri: url }} style={{ width: 64, height: 64, borderRadius: 8 }} contentFit="cover" />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
            {/* 잔량 바 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View style={{ flex: 1, height: 4, backgroundColor: '#f3f4f6', borderRadius: 2, overflow: 'hidden' }}>
                <View style={{
                  width: `${Math.min(100, Math.round((sched.checkedTimes.length / Math.max(1, calcTotalDoses(sched))) * 100))}%`,
                  height: '100%',
                  backgroundColor: barColor,
                  borderRadius: 2,
                }} />
              </View>
              <Text style={{ color: '#9ca3af', fontSize: 9 }}>{formatMedPeriod(sched)}</Text>
            </View>
          </View>
        );
      })}
    </View>
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
  campUsers: User[];
  campGroups: CampGroup[];
  allRecords: PatientRecord[];
  expandedId: string | null;
  groupBorderColor?: string;
  onToggleExpand: (id: string) => void;
  onEdit: (record: PatientRecord) => void;
  onDelete: (id: string, name: string) => void;
  onProgressChange: (record: PatientRecord, s: ProgressStatus) => void;
  onAddProgressLog: (record: PatientRecord, log: Omit<ProgressLog, 'loggedAt' | 'loggedBy'>, doses?: MedicationDose[]) => void;
  onRemoveProgressLog: (record: PatientRecord, logIndex: number) => void;
  onMedCheck: (record: PatientRecord, si: number, t: MedicationTime, checked: boolean) => void;
  onAddMedSchedule: (record: PatientRecord, s: Omit<MedicationSchedule, 'checkedTimes'>) => void;
  onUpdateMedSchedule: (record: PatientRecord, idx: number, s: Omit<MedicationSchedule, 'checkedTimes'>) => void;
  onRemoveMedSchedule: (record: PatientRecord, idx: number) => void;
  onIsolationCheck: (record: PatientRecord, i: number, v: boolean) => void;
  onAddHospitalVisit: (record: PatientRecord) => void;
  onUpdateHospitalVisit: (record: PatientRecord, visits: HospitalVisitEntry[]) => void;
  onAddIsolationCheckSchedule: (record: PatientRecord, minutesLater: number) => void;
  onCompleteIsolationCheck: (record: PatientRecord, scheduleId: string, temperature?: number, status?: IsolationCheckSchedule['status'], note?: string) => void;
  onReturnCriteriaCheck: (record: PatientRecord, i: number, v: boolean) => void;
}

function ClassGroup({
  className, records, today, currentUserId, currentUserName, currentUserRole,
  campUsers, campGroups, allRecords, expandedId, groupBorderColor = '#e5e7eb',
  onToggleExpand, onEdit, onDelete, onProgressChange, onAddProgressLog, onRemoveProgressLog,
  onMedCheck, onAddMedSchedule, onUpdateMedSchedule, onRemoveMedSchedule,
  onIsolationCheck, onAddHospitalVisit, onUpdateHospitalVisit,
  onAddIsolationCheckSchedule, onCompleteIsolationCheck, onReturnCriteriaCheck,
}: ClassGroupProps) {
  // ① 긴급도 ② visitDate 최신순
  const sorted = [...records].sort((a, b) => {
    const uDiff = urgencyScoreM(a) - urgencyScoreM(b);
    if (uDiff !== 0) return uDiff;
    return (b.visitDate?.toMillis() ?? 0) - (a.visitDate?.toMillis() ?? 0);
  });
  const classMentorName = records.find(r => r.classMentor)?.classMentor;

  return (
    <View style={styles.classGroup}>
      <View style={styles.classGroupHeader}>
        {/* 좌: 반 이름 */}
        <Text style={[styles.classGroupTitle, { color: '#374151' }]}>{fmtClassM(className)}</Text>
        {/* 중: 담임 이름 */}
        {classMentorName && (
          <Text style={{ fontSize: 11, color: '#6b7280', flex: 1 }}>{classMentorName}</Text>
        )}
        {/* 우: 경과 뱃지 + 숫자 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {(['최초보고', '중간보고'] as ProgressStatus[]).map(s => {
            const c = records.filter(r => r.progressStatus === s).length;
            if (!c) return null;
            const col = PROGRESS_COLOR[s];
            return (
              <View key={s} style={{ backgroundColor: col.bg, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, color: col.text, fontWeight: '700' }}>{c}</Text>
              </View>
            );
          })}
          <Text style={styles.classGroupCount}>{records.length}</Text>
        </View>
      </View>
      <View style={{ paddingTop: 6, paddingBottom: 6 }}>
      {sorted.map((record) => (
        <React.Fragment key={record.id}>
          <PatientCard
            record={record}
            today={today}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserRole={currentUserRole}
            campUsers={campUsers}
            campGroups={campGroups}
            allRecords={allRecords}
            expandedId={expandedId}
            onToggleExpand={() => onToggleExpand(record.id)}
            onEdit={() => onEdit(record)}
            onDelete={() => onDelete(record.id, record.studentName)}
            onProgressChange={(s) => onProgressChange(record, s)}
            onAddProgressLog={(log, doses) => onAddProgressLog(record, log, doses)}
            onRemoveProgressLog={(idx) => onRemoveProgressLog(record, idx)}
            onMedCheck={(si, t, checked) => onMedCheck(record, si, t, checked)}
            onAddMedSchedule={(s) => onAddMedSchedule(record, s)}
            onUpdateMedSchedule={(idx, s) => onUpdateMedSchedule(record, idx, s)}
            onRemoveMedSchedule={(idx) => onRemoveMedSchedule(record, idx)}
            onIsolationCheck={(i, v) => onIsolationCheck(record, i, v)}
            onAddHospitalVisit={() => onAddHospitalVisit(record)}
            onUpdateHospitalVisit={(visits) => onUpdateHospitalVisit(record, visits)}
            onAddIsolationCheckSchedule={(min) => onAddIsolationCheckSchedule(record, min)}
            onCompleteIsolationCheck={(id, temp, status, note) => onCompleteIsolationCheck(record, id, temp, status, note)}
            onReturnCriteriaCheck={(i, v) => onReturnCriteriaCheck(record, i, v)}
            grouped
            groupBorderColor={groupBorderColor}
          />
        </React.Fragment>
      ))}
      </View>
    </View>
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
  expandedId?: string | null;
  onToggleExpand?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onProgressChange: (s: ProgressStatus) => void;
  onAddProgressLog: (log: Omit<ProgressLog, 'loggedAt' | 'loggedBy'>, doses?: MedicationDose[]) => void;
  onRemoveProgressLog: (logIndex: number) => void;
  onMedCheck: (si: number, t: MedicationTime, checked: boolean) => void;
  onAddMedSchedule: (s: Omit<MedicationSchedule, 'checkedTimes'>) => void;
  onUpdateMedSchedule: (idx: number, s: Omit<MedicationSchedule, 'checkedTimes'>) => void;
  onRemoveMedSchedule: (idx: number) => void;
  onIsolationCheck: (i: number, v: boolean) => void;
  onAddHospitalVisit: () => void;
  onUpdateHospitalVisit: (visits: HospitalVisitEntry[]) => void;
  onAddIsolationCheckSchedule: (minutesLater: number) => void;
  onCompleteIsolationCheck: (scheduleId: string, temperature?: number, status?: IsolationCheckSchedule['status'], note?: string) => void;
  onReturnCriteriaCheck: (i: number, v: boolean) => void;
  grouped?: boolean;
  groupBorderColor?: string;
}

type DetailTab = '경과' | '내원' | '복용약' | '부모연락';

function PatientCard({
  record, today, currentUserId, currentUserName, currentUserRole,
  campUsers, campGroups, allRecords, expandedId, onToggleExpand,
  onEdit, onDelete, onProgressChange, onAddProgressLog, onRemoveProgressLog,
  onMedCheck, onAddMedSchedule, onUpdateMedSchedule, onRemoveMedSchedule,
  onIsolationCheck, onAddHospitalVisit, onUpdateHospitalVisit,
  onAddIsolationCheckSchedule, onCompleteIsolationCheck, onReturnCriteriaCheck,
  grouped = false, groupBorderColor = '#e5e7eb',
}: PatientCardProps) {
  const progressStyle = PROGRESS_COLOR[record.progressStatus ?? '최초보고'];
  const isMyRecord = record.classMentor === currentUserName || record.unitMentor === currentUserName;
  const [activeTab, setActiveTab] = useState<DetailTab | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (expandedId === record.id && activeTab === null) {
      setActiveTab('경과');
    }
  }, [expandedId, record.id, activeTab]);

  const handleTabClick = (tab: DetailTab) => {
    setActiveTab(prev => (prev === tab ? null : tab));
  };

  const elapsed = daysElapsedM(record.visitDate);
  const elapsedLabel = elapsed === 0 ? L('common.today') : elapsed === 1 ? L('common.yesterday') : L('patient.day', { v0: elapsed });
  const elapsedColor = elapsed >= 3 ? '#f97316' : elapsed >= 1 ? '#ca8a04' : '#9ca3af';

  const medInfo = useMemo(() => {
    const tempSchedules = (record.medicationSchedules ?? []).filter(s => !s.endDateAuto);
    if (!tempSchedules.length) return null;
    let todayTotal = 0, todayDone = 0;
    tempSchedules.forEach(s => {
      s.times.forEach(t => {
        if (schedActiveOn(s, today)) {
          todayTotal++;
          if (s.checkedTimes.includes(makeMedTimeKey(t, today))) todayDone++;
        }
      });
    });
    return { todayTotal, todayDone };
  }, [record.medicationSchedules, today]);

  const hospitalVisits = record.hospitalVisits ?? [];
  // 내원 탭 빨간 점: '내원예정'(내원 필요)인 건이 있을 때만 — '필요없음'·'내원완료'만 있으면 표시 안 함
  const hasHospital = hospitalVisits.some(v => v.hospitalStatus === '내원예정');
  const hasMed = (record.medicationSchedules ?? []).some(s => !s.endDateAuto);
  const parentContactPending = record.progressStatus !== '완치' && !!record.parentContactAssigneeName &&
    !(record.parentContactLogs?.some(l => l.isResolved));

  const tabs: DetailTab[] = ['경과', '내원', '복용약', '부모연락'];

  const cardStyle = grouped
    ? [styles.cardGrouped, { backgroundColor: isMyRecord ? '#eff6ff' : '#fff', borderLeftWidth: 3, borderLeftColor: groupBorderColor }]
    : [styles.card, isMyRecord && { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }];

  return (
    <View style={cardStyle}>
      <View style={styles.cardHeader}>
        <View style={[styles.progressDot, { backgroundColor: progressStyle.dot }]} />
        {showDeleteConfirm ? (
          <View style={styles.deleteConfirmBox}>
            <Text style={{ fontSize: 11, color: '#b91c1c', fontWeight: '600' }}>{L('patient.reallyDelete')}</Text>
            <TouchableOpacity style={styles.deleteConfirmBtn} onPress={onDelete}>
              <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>{L('common.delete')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowDeleteConfirm(false)}>
              <Text style={{ fontSize: 10, color: '#6b7280' }}>{L('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.cardDeleteBtn} onPress={() => setShowDeleteConfirm(true)}>
            <Text style={{ fontSize: 12 }}>🗑️</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }}>
          {/* 1행: 이름 · 학년 · 반뱃지 · 담임 · 유닛 · 방 */}
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardName}>{record.studentName}</Text>
            {record.grade && <Text style={styles.cardGrade}>{record.grade}</Text>}
            {record.className && (
              <View style={styles.classBadge}>
                <Text style={styles.classBadgeText}>{fmtClassM(record.className)}</Text>
              </View>
            )}
            {record.classMentor && (
              <Text style={{ fontSize: 10, color: '#6b7280' }}>{L('patient.homeroom')} {record.classMentor}</Text>
            )}
            {record.unitMentor && (
              <Text style={{ fontSize: 10, color: '#6b7280' }}>{L('students.unit')} {record.unitMentor}</Text>
            )}
            {record.roomNumber && <Text style={styles.roomText}>{record.roomNumber}{L('students.text')}</Text>}
          </View>
          {/* 2행: 증상 */}
          <Text style={styles.cardSymptom} numberOfLines={1}>{record.symptom}</Text>
          <View style={styles.cardTagRow}>
            {(record.types ?? [])
              .filter(t => t !== '처치전' && t !== '단순처치')
              .map(t => (
                <View key={t} style={[styles.typeTag, { backgroundColor: TYPE_COLOR[t]?.bg ?? '#f3f4f6' }]}>
                  <Text style={[styles.typeTagText, { color: TYPE_COLOR[t]?.text ?? '#374151' }]}>{dataLabel(t)}</Text>
                </View>
              ))}
            <View style={[styles.progressBadge, { backgroundColor: progressStyle.bg }]}>
              <Text style={[styles.progressBadgeText, { color: progressStyle.text }]}>
                {record.progressStatus ?? L('data.progFirstReport')}
              </Text>
            </View>
            {record.temperature != null && (
              <View style={{ backgroundColor: record.temperature >= FEVER_THRESHOLDS.slight ? '#fef2f2' : '#f3f4f6', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, color: record.temperature >= FEVER_THRESHOLDS.slight ? '#b91c1c' : '#4b5563', fontWeight: '600' }}>
                  {record.temperature}°C
                </Text>
              </View>
            )}
            {hospitalVisits.length > 0 && (() => {
              const latest = hospitalVisits[hospitalVisits.length - 1];
              const hs = HOSPITAL_STATUS_COLOR[latest.hospitalStatus];
              return (
                <View style={{ backgroundColor: hs.bg, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9, color: hs.text, fontWeight: '600' }}>{dataLabel(latest.hospitalStatus)}</Text>
                </View>
              );
            })()}
            {medInfo && (
              <View style={{ backgroundColor: medInfo.todayDone === medInfo.todayTotal && medInfo.todayTotal > 0 ? '#dcfce7' : '#fff7ed', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, color: medInfo.todayDone === medInfo.todayTotal && medInfo.todayTotal > 0 ? '#166534' : '#c2410c', fontWeight: '700' }}>
                  💊 {medInfo.todayDone}/{medInfo.todayTotal}
                </Text>
              </View>
            )}
            {parentContactPending && (
              <View style={{ backgroundColor: '#fdf2f8', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, color: '#be185d', fontWeight: '600' }}>{L('patient.parentContact')}</Text>
              </View>
            )}
          </View>
          <View style={styles.cardMeta}>
            <Text style={[styles.cardMetaText, { color: elapsedColor, fontWeight: '600' }]}>{elapsedLabel}</Text>
            <Text style={styles.cardMetaDot}>·</Text>
            <Text style={styles.cardMetaText}>{formatDate(record.visitDate)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.tabRow}>
        {tabs.map(tab => {
          const hasAlert =
            (tab === '내원' && hasHospital) ||
            (tab === '복용약' && hasMed) ||
            (tab === '부모연락' && !!parentContactPending);
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={dataLabel(tab)}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => handleTabClick(tab)}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{dataLabel(tab)}</Text>
              {hasAlert && <View style={styles.tabDot} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab !== null && (
        <View style={styles.cardExpanded}>
          {activeTab === '경과' && (
            <ProgressTabMobile
              record={record}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              campUsers={campUsers}
              onAddProgressLog={onAddProgressLog}
              onRemoveProgressLog={onRemoveProgressLog}
              onIsolationCheck={onIsolationCheck}
              onAddIsolationCheckSchedule={onAddIsolationCheckSchedule}
              onCompleteIsolationCheck={onCompleteIsolationCheck}
              onReturnCriteriaCheck={onReturnCriteriaCheck}
            />
          )}
          {activeTab === '내원' && (
            <HospitalTabMobile
              record={record}
              campUsers={campUsers}
              allRecords={allRecords}
              onUpdateVisits={onUpdateHospitalVisit}
            />
          )}
          {activeTab === '복용약' && (
            <MedicationTabMobile
              schedules={record.medicationSchedules ?? []}
              today={today}
              onCheck={onMedCheck}
              onAddSchedule={(s) => onAddMedSchedule(s)}
              onUpdateSchedule={(idx, s) => onUpdateMedSchedule(idx, s)}
              onRemoveSchedule={(idx) => onRemoveMedSchedule(idx)}
            />
          )}
          {activeTab === '부모연락' && (
            <ParentContactSectionMobile
              record={record}
              campUsers={campUsers}
              campGroups={campGroups}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserRole={currentUserRole}
            />
          )}
        </View>
      )}
    </View>
  );
}

// 상세 행

// ==================== 👩‍🏫 선생님 약 사용 ====================
function syncStaffDoseStock(id: string, campCode?: string | null) {
  authenticatedFetch('/api/inventory/sync-dose', { method: 'POST', body: JSON.stringify({ recordId: id, campCode: campCode ?? undefined, source: 'staff' }) })
    .catch(e => console.warn('재고 정산 요청 실패 (다음 저장 때 다시 맞춰짐):', e));
}

function StaffMedicationSectionMobile({ campCode, jobCodeId, campUsers }: { campCode: string | null; jobCodeId?: string; campUsers: User[] }) {
  const { userData } = useAuth();
  const [list, setList] = useState<StaffMedicationUse[]>([]);
  const [editing, setEditing] = useState<StaffMedicationUse | 'new' | null>(null);
  useEffect(() => (campCode ? subscribeStaffMedicationUses(db, campCode, setList) : undefined), [campCode]);
  const isAdmin = userData?.role === 'admin';
  const canEdit = (u: StaffMedicationUse) => isAdmin || u.recordedById === userData?.userId;
  const remove = (u: StaffMedicationUse) => Alert.alert(L('common.delete'), L('patient.deleteThisRecordTheQuantity'), [
    { text: L('common.cancel'), style: 'cancel' },
    { text: L('common.delete'), style: 'destructive', onPress: async () => {
      try { await deleteStaffMedicationUse(db, u.id); syncStaffDoseStock(u.id, u.campCode); }
      catch { Alert.alert(L('common.error'), L('inventory.couldNotDelete')); }
    } },
  ]);
  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827' }}>{L('patient.staffMedicationUse')}</Text>
          <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{L('patient.logMedicineGivenToStaff')}</Text>
        </View>
        <TouchableOpacity disabled={!campCode} onPress={() => setEditing('new')} style={{ backgroundColor: '#ef4444', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, opacity: campCode ? 1 : 0.4 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{L('patient.log')}</Text>
        </TouchableOpacity>
      </View>
      {list.length === 0 ? <Text style={{ textAlign: 'center', color: '#9ca3af', paddingVertical: 30 }}>{L('patient.noRecordsYet')}</Text> : list.map(u => (
        <View key={u.id} style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', padding: 10, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#111827' }} numberOfLines={1}>{u.staffName} <Text style={{ fontSize: 11, fontWeight: '400', color: '#9ca3af' }}>{u.staffGroup ?? ''} · {formatDate(u.createdAt)} {formatTime(u.createdAt)}</Text></Text>
            {canEdit(u) && <TouchableOpacity onPress={() => setEditing(u)}><Text style={{ fontSize: 11, color: '#6b7280' }}>{L('task.edit')}</Text></TouchableOpacity>}
            {canEdit(u) && <TouchableOpacity onPress={() => remove(u)}><Text style={{ fontSize: 11, color: '#f87171' }}>{L('common.delete')}</Text></TouchableOpacity>}
          </View>
          <Text style={{ fontSize: 12, color: '#374151' }}>🤒 {u.symptom}</Text>
          {u.doses.map(d => <Text key={d.id} style={{ fontSize: 11, color: '#065f46' }}>💊 {doseLabel(d)} {d.quantity}{dataLabel(d.unit ?? '개')} · {d.groupName}{d.memo ? ` · ${d.memo}` : ''}</Text>)}
          {u.note ? <Text style={{ fontSize: 11, color: '#6b7280' }}>📝 {u.note}</Text> : null}
          <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('patient.loggedBy', { v0: u.recordedBy })}</Text>
        </View>
      ))}
      <Modal visible={!!editing && !!campCode} animationType="fade" transparent onRequestClose={() => setEditing(null)}>
        {editing && campCode ? (
          <StaffMedicationFormMobile campCode={campCode} jobCodeId={jobCodeId} campUsers={campUsers} existing={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
        ) : null}
      </Modal>
    </ScrollView>
  );
}

function StaffMedicationFormMobile({ campCode, jobCodeId, campUsers, existing, onClose }: {
  campCode: string; jobCodeId?: string; campUsers: User[]; existing?: StaffMedicationUse; onClose: () => void;
}) {
  const { userData } = useAuth();
  const { medicines, groups } = usePatientInventory();
  const me = userData?.userId ?? '';
  const [who, setWho] = useState(existing?.staffUserId ?? me);
  const [q, setQ] = useState('');
  const [symptom, setSymptom] = useState(existing?.symptom ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [doses, setDoses] = useState<MedicationDose[]>(existing?.doses ?? []);
  const [busy, setBusy] = useState(false);
  const groupOf = (u?: User) => u?.jobExperiences?.find(e => e.id === jobCodeId)?.group;
  const target = campUsers.find(u => u.userId === who);
  const whoName = target?.name ?? (who === me ? userData?.name : existing?.staffName) ?? '';
  const results = q.trim() ? campUsers.filter(u => u.name?.includes(q.trim())).slice(0, 6) : [];
  const defaultGroupId = useMemo(() => {
    const g = groupOf(target ?? (userData as unknown as User | undefined));
    return g ? groups.find(x => x.campGroupName?.toLowerCase() === String(g).toLowerCase())?.id : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [who, groups]);
  const save = async () => {
    if (!symptom.trim()) { Alert.alert(L('patient.checkNeeded'), L('patient.pleaseEnterTheSymptoms')); return; }
    if (doses.length === 0) { Alert.alert(L('patient.checkNeeded'), L('patient.addAtLeastOneMedicine')); return; }
    if (doses.some(d => !d.itemId || !d.groupId)) { Alert.alert(L('patient.checkNeeded'), L('patient.selectBothAMedicineAnd')); return; }
    setBusy(true);
    try {
      let id = existing?.id;
      if (existing) await updateStaffMedicationUse(db, existing.id, { symptom, note, doses });
      else id = await addStaffMedicationUse(db, {
        campCode, staffUserId: who, staffName: whoName, staffGroup: groupOf(target) || undefined,
        symptom, note, doses, recordedBy: userData?.name ?? '', recordedById: me,
      });
      if (id) syncStaffDoseStock(id, campCode);
      onClose();
    } catch (e) { console.error('선생님 약 사용 저장 오류:', e); Alert.alert(L('common.error'), L('profile.couldNotSave')); }
    finally { setBusy(false); }
  };
  const input = { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#111827', backgroundColor: '#fff' } as const;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 }}>
      <View style={{ backgroundColor: '#fff', borderRadius: 16, maxHeight: '88%', overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: '#111827' }}>{existing ? L('patient.editStaffMedicationUse') : L('patient.logStaffMedicationUse')}</Text>
          <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color="#9ca3af" /></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 5 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>{L('patient.staffMember')}</Text>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#1e3a8a', backgroundColor: '#eff6ff', borderRadius: 8, padding: 8 }}>{whoName}{groupOf(target) ? `  · ${groupOf(target)}` : ''}</Text>
            {!existing && <TextInput value={q} onChangeText={setQ} placeholder={L('patient.searchName')} placeholderTextColor="#9ca3af" style={input} />}
            {results.map(u => (
              <TouchableOpacity key={u.userId} onPress={() => { setWho(u.userId); setQ(''); }} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6, backgroundColor: '#f9fafb' }}>
                <Text style={{ fontSize: 12, color: '#111827' }}>{u.name} <Text style={{ fontSize: 10, color: '#9ca3af' }}>{groupOf(u) ?? ''}</Text></Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ gap: 5 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>{L('patient.symptomsReason')}</Text>
            <TextInput value={symptom} onChangeText={setSymptom} placeholder={L('patient.eGHeadacheMosquitoBite')} placeholderTextColor="#9ca3af" style={input} />
          </View>
          <MedicationDoseEditorMobile doses={doses} onChange={setDoses} medicines={medicines} groups={groups} givenBy={userData?.name ?? ''} defaultGroupId={defaultGroupId} />
          <View style={{ gap: 5 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#374151' }}>{L('task.note')} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{L('patient.optional')}</Text></Text>
            <TextInput value={note} onChangeText={setNote} multiline style={[input, { minHeight: 44 }]} />
          </View>
          <TouchableOpacity onPress={save} disabled={busy} style={{ backgroundColor: '#ef4444', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: busy ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>{busy ? L('task.saving') : L('common.save')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// ==================== 경과 탭 (모바일) ====================

function ProgressTabMobile({
  record, currentUserId, currentUserName, campUsers,
  onAddProgressLog, onRemoveProgressLog,
  onIsolationCheck, onAddIsolationCheckSchedule, onCompleteIsolationCheck, onReturnCriteriaCheck,
}: {
  record: PatientRecord;
  currentUserId: string;
  currentUserName: string;
  campUsers: User[];
  onAddProgressLog: (log: Omit<ProgressLog, 'loggedAt' | 'loggedBy'>, doses?: MedicationDose[]) => void;
  onRemoveProgressLog: (logIndex: number) => void;
  onIsolationCheck: (i: number, v: boolean) => void;
  onAddIsolationCheckSchedule: (minutesLater: number) => void;
  onCompleteIsolationCheck: (scheduleId: string, temperature?: number, status?: IsolationCheckSchedule['status'], note?: string) => void;
  onReturnCriteriaCheck: (i: number, v: boolean) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [logStatus, setLogStatus] = useState<ProgressStatus>('중간보고');
  const [logLocationMode, setLogLocationMode] = useState<LocationMode>('일과중');
  const [logLocation, setLogLocation] = useState('');
  const [logFever, setLogFever] = useState<FeverOption | ''>('');
  const [logFeverDirect, setLogFeverDirect] = useState('');   // 체온 수치 (입력 시 단계 자동 판정)
  const [logSymptom, setLogSymptom] = useState('');
  const [logNote, setLogNote] = useState('');
  // 경과보고 약 복용 (최초보고와 동일 섹션·재고 연동)
  const [logDoses, setLogDoses] = useState<MedicationDose[]>([]);
  const inventory = usePatientInventory();
  const [nextCheckTime, setNextCheckTime] = useState('');
  const [nextCheckAssigneeId, setNextCheckAssigneeId] = useState(currentUserId);
  const [nextCheckAssigneeName, setNextCheckAssigneeName] = useState(currentUserName);
  const [nextCheckQuery, setNextCheckQuery] = useState('');
  const [showAssigneeList, setShowAssigneeList] = useState(false);

  const handleAddLog = () => {
    if (logDoses.some(d => !d.itemId || !d.groupId)) { Alert.alert(L('patient.checkNeeded'), L('patient.inMedicationSupplyUseSelect')); return; }
    if (logStatus === '중간보고' && (!nextCheckTime || !nextCheckAssigneeName)) {
      Alert.alert(L('profile.incomplete'), L('patient.forAnUpdateSetThe'));
      return;
    }
    // 체온 수치가 있으면 공통 기준(FEVER_THRESHOLDS)으로 자동 판정, 없으면 선택한 단계
    const directTemp = parseFloat(logFeverDirect);
    const hasTemp = !isNaN(directTemp);
    const feverValue = hasTemp ? (classifyFever(directTemp) ?? undefined) : (logFever || undefined);
    let nextCheckAt: Timestamp | undefined;
    if (logStatus === '중간보고' && nextCheckTime) {
      const [hh, mm] = nextCheckTime.split(':').map(Number);
      const dt = new Date();
      dt.setHours(hh, mm, 0, 0);
      if (dt < new Date()) dt.setDate(dt.getDate() + 1);
      nextCheckAt = Timestamp.fromDate(dt);
    }
    onAddProgressLog({
      status: logStatus,
      locationMode: logStatus !== '완치' ? logLocationMode : undefined,
      location: logLocation || undefined,
      fever: feverValue,
      ...(hasTemp ? { temperature: directTemp } : {}),
      symptom: logSymptom || undefined,
      note: logNote || undefined,
      nextCheckAt,
      nextCheckAssigneeId: logStatus === '중간보고' ? nextCheckAssigneeId : undefined,
      nextCheckAssigneeName: logStatus === '중간보고' ? nextCheckAssigneeName : undefined,
    }, logDoses.filter(d => d.itemId && d.quantity > 0));
    setShowForm(false);
    setLogLocationMode('일과중');
    setLogLocation(''); setLogFever(''); setLogFeverDirect(''); setLogSymptom(''); setLogNote(''); setLogDoses([]);
    setNextCheckTime(''); setNextCheckAssigneeId(currentUserId); setNextCheckAssigneeName(currentUserName);
    setNextCheckQuery(''); setShowAssigneeList(false);
  };

  const rawLogs = record.progressLogs ?? [];
  const hasInitialLog = rawLogs.some(l => l.status === '최초보고');
  const parsedNotes = (() => {
    const raw = record.notes ?? '';
    const locMatch = raw.match(/\[위치:\s*([^\]]+)\]/);
    const location = record.location || (locMatch ? locMatch[1].trim() : undefined);
    const cleanNote = raw.replace(/\[위치:[^\]]*\]/g, '').replace(/\[[^\]]+\]/g, '').trim();
    return { location, cleanNote: cleanNote || undefined };
  })();
  const syntheticInitial: ProgressLog | null = !hasInitialLog ? {
    loggedAt: record.visitDate ?? record.createdAt,
    loggedBy: record.recordedBy ?? '',
    status: '최초보고',
    locationMode: record.locationMode,
    location: parsedNotes.location,
    fever: record.fever ? record.fever : record.temperature != null ? `${record.temperature}` : undefined,
    symptom: record.symptom,
    note: parsedNotes.cleanNote,
  } : null;
  type LogEntry = { log: ProgressLog; isSynthetic: boolean; rawIndex: number };
  const allEntries: LogEntry[] = rawLogs.map((log, i) => ({ log, isSynthetic: false, rawIndex: i }));
  if (syntheticInitial) allEntries.push({ log: syntheticInitial, isSynthetic: true, rawIndex: -1 });
  const logs = allEntries.reverse();

  // 다음 체크 담당자 후보: 외국인 선생님 제외 (환자 관리·병원 인솔은 한국인 선생님 담당)
  const assigneeCandidates = [
    { userId: currentUserId, name: currentUserName },
    ...campUsers.filter(isKoreanStaff).filter(u => u.userId !== currentUserId),
  ].filter(u => !nextCheckQuery || u.name.includes(nextCheckQuery));

  return (
    <View style={{ gap: 12 }}>
      <View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text style={styles.sectionLabel}>{L('patient.progressLog')}</Text>
          <TouchableOpacity onPress={() => setShowForm(true)}>
            <Text style={{ fontSize: 11, color: '#2563eb', fontWeight: '600' }}>{L('patient.addReport')}</Text>
          </TouchableOpacity>
        </View>

        {showForm && (
          <TabFormModalMobile
            title={L('patient.addProgressReport')}
            icon="📋"
            onClose={() => setShowForm(false)}
            onSubmit={handleAddLog}
            submitLabel={L('patient.addEntry')}
            submitColor={logStatus === '완치' ? '#22c55e' : '#3b82f6'}
          >
            {/* 보고 유형 */}
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {PROGRESS_STATUSES.filter(s => s !== '최초보고').map(s => {
                const col = PROGRESS_COLOR[s];
                return (
                  <TouchableOpacity key={s} onPress={() => setLogStatus(s)}
                    style={{ flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: logStatus === s ? col.dot : '#f3f4f6', borderWidth: 1, borderColor: logStatus === s ? col.dot : '#e5e7eb' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: logStatus === s ? '#fff' : '#6b7280' }}>{dataLabel(s)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {logStatus !== '완치' && (
              <>
                <View>
                  <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{L('patient.currentLocation2')}</Text>
                  {/* 위치 모드 버튼 */}
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                    {([
                      { id: '일과중' as LocationMode, emoji: '🏃', activeColor: '#3b82f6' },
                      { id: '휴식'   as LocationMode, emoji: '😴', activeColor: '#f59e0b' },
                      { id: '격리'   as LocationMode, emoji: '🏠', activeColor: '#8b5cf6' },
                    ] as const).map(opt => {
                      const selected = logLocationMode === opt.id;
                      return (
                        <TouchableOpacity
                          key={opt.id}
                          onPress={() => setLogLocationMode(opt.id)}
                          style={{
                            flex: 1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 3,
                            paddingVertical: 6,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: selected ? opt.activeColor : '#e5e7eb',
                            backgroundColor: selected ? opt.activeColor : '#fff',
                          }}
                        >
                          <Text style={{ fontSize: 12 }}>{opt.emoji}</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: selected ? '#fff' : '#6b7280' }}>{opt.id}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <TextInput
                    value={logLocation}
                    onChangeText={setLogLocation}
                    placeholder={
                      logLocationMode === '휴식' ? L('patient.eGRoom110Lounge2') :
                      logLocationMode === '격리' ? L('patient.eGIsolationRoom2142') :
                      L('patient.eGRoom330Sick')
                    }
                    placeholderTextColor="#9ca3af"
                    style={[styles.formInput, { fontSize: 12, paddingVertical: 7 }]}
                  />
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{L('patient.fever2')}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                    {FEVER_OPTIONS.map(f => (
                      <TouchableOpacity key={f}
                        style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: logFever === f ? (f === '고열' ? '#ef4444' : f === '미열' ? '#fb923c' : '#22c55e') : '#f3f4f6' }}
                        onPress={() => { setLogFever(logFever === f ? '' : f); setLogFeverDirect(''); }}>
                        <Text style={{ fontSize: 11, color: logFever === f ? '#fff' : '#6b7280', fontWeight: '600' }}>{f}</Text>
                      </TouchableOpacity>
                    ))}
                    <TextInput value={logFeverDirect}
                      onChangeText={v => {
                        setLogFeverDirect(v);
                        // 체온 입력 시 공통 기준으로 단계 자동 판정 (최초보고와 같은 기준)
                        setLogFever(classifyFever(v) ?? '');
                      }}
                      placeholder={L('patient.temperature378')} placeholderTextColor="#9ca3af" keyboardType="decimal-pad"
                      style={[styles.formInput, { flex: 1, minWidth: 80, fontSize: 12, paddingVertical: 5 }]} />
                  </View>
                  {(() => {
                    const level = classifyFever(logFeverDirect);
                    if (!level) return null;
                    const color = level === '고열' ? '#dc2626' : level === '미열' ? '#ea580c' : '#16a34a';
                    return (
                      <Text style={{ fontSize: 10, fontWeight: '600', color, marginTop: 4 }}>
                        {parseFloat(logFeverDirect).toFixed(1)}℃ → {level === '고열' ? L('patient.highFever') : level === '미열' ? L('patient.mildFever') : L('patient.normal')}
                        <Text style={{ color: '#9ca3af', fontWeight: '400' }}> {L('patient.mildFever2')} {FEVER_THRESHOLDS.slight}{L('patient.orHigherHighFever')} {FEVER_THRESHOLDS.high}{L('patient.orHigher')}</Text>
                      </Text>
                    );
                  })()}
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{L('patient.symptoms4')}</Text>
                  <TextInput value={logSymptom} onChangeText={setLogSymptom} placeholder={L('patient.currentSymptoms')} placeholderTextColor="#9ca3af" style={[styles.formInput, { fontSize: 12, paddingVertical: 7 }]} />
                </View>
              </>
            )}

            {logStatus === '중간보고' && (
              <View style={{ backgroundColor: '#fffbeb', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#fde68a', gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#b45309' }}>{L('patient.scheduleNextCheck')}</Text>
                <View>
                  <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{L('patient.checkTime')}</Text>
                  <TextInput value={nextCheckTime}
                    onChangeText={v => { const raw = v.replace(/\D/g, '').slice(0, 4); setNextCheckTime(raw.length >= 3 ? `${raw.slice(0, 2)}:${raw.slice(2)}` : raw); }}
                    placeholder="1430 → 14:30" placeholderTextColor="#9ca3af" keyboardType="number-pad"
                    style={[styles.formInput, { fontSize: 12, paddingVertical: 7 }]} />
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{L('patient.assignee')}</Text>
                  <TextInput value={nextCheckQuery || nextCheckAssigneeName}
                    onChangeText={v => { setNextCheckQuery(v); setShowAssigneeList(true); }}
                    onFocus={() => setShowAssigneeList(true)}
                    placeholder={L('patient.searchName')} placeholderTextColor="#9ca3af"
                    style={[styles.formInput, { fontSize: 12, paddingVertical: 7 }]} />
                  {showAssigneeList && assigneeCandidates.length > 0 && (
                    <View style={{ borderWidth: 1, borderColor: '#fde68a', borderRadius: 8, backgroundColor: '#fff', marginTop: 3 }}>
                      {assigneeCandidates.slice(0, 5).map(u => (
                        <TouchableOpacity key={u.userId}
                          style={{ paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#fef3c7' }}
                          onPress={() => { setNextCheckAssigneeId(u.userId); setNextCheckAssigneeName(u.name); setNextCheckQuery(''); setShowAssigneeList(false); }}>
                          <Text style={{ fontSize: 12, color: '#374151' }}>{u.name}{u.userId === currentUserId ? L('patient.me') : ''}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            )}

            {logStatus !== '완치' && (
              <MedicationDoseEditorMobile
                doses={logDoses}
                onChange={setLogDoses}
                medicines={inventory.medicines}
                groups={inventory.groups}
                givenBy={currentUserName}
                defaultGroupId={inventory.defaultGroupIdForClass(record.className)}
                history={inventory.dosesForStudent(record.studentId)}
                studentNote={inventory.studentNote(record.studentId)}
              />
            )}

            <View>
              <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{L('patient.noteOptional')}</Text>
              <TextInput value={logNote} onChangeText={setLogNote} placeholder={L('patient.additionalNotes2')} placeholderTextColor="#9ca3af" style={[styles.formInput, { fontSize: 12, paddingVertical: 7 }]} />
            </View>
          </TabFormModalMobile>
        )}

        {logs.length === 0 ? (
          <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 }}>{L('patient.noProgressEntries')}</Text>
        ) : (
          <View style={{ paddingLeft: 12 }}>
            {logs.map(({ log, isSynthetic, rawIndex }, i) => {
              const col = PROGRESS_COLOR[log.status] ?? PROGRESS_COLOR['중간보고'];
              const nextCheckDate = log.nextCheckAt?.toDate();
              let nextCheckLabel = '';
              if (nextCheckDate) {
                const diffMin = Math.round((nextCheckDate.getTime() - Date.now()) / 60000);
                if (diffMin < 0) nextCheckLabel = L('patient.minOverdue', { v0: Math.abs(diffMin) });
                else if (diffMin < 60) nextCheckLabel = L('patient.inMin', { v0: diffMin });
                else nextCheckLabel = `${String(nextCheckDate.getHours()).padStart(2, '0')}:${String(nextCheckDate.getMinutes()).padStart(2, '0')}`;
              }
              return (
                <View key={i} style={{ marginBottom: 10, paddingLeft: 8, borderLeftWidth: 2, borderLeftColor: col.line }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <View style={{ backgroundColor: col.bg, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: col.text }}>{dataLabel(log.status)}</Text>
                    </View>
                    <Text style={{ fontSize: 10, color: '#6b7280' }}>{log.loggedBy}</Text>
                    <Text style={{ fontSize: 10, color: '#9ca3af' }}>{formatDate(log.loggedAt)}</Text>
                    {!isSynthetic && (
                      <TouchableOpacity onPress={() => onRemoveProgressLog(rawIndex)} style={{ marginLeft: 'auto' }}>
                        <Text style={{ fontSize: 11 }}>🗑️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {(log.locationMode || log.location || log.fever || log.symptom) && (
                    <View style={{ marginTop: 4, gap: 2 }}>
                      {log.locationMode && (
                        <Text style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: log.locationMode === '격리' ? '#7c3aed' : log.locationMode === '휴식' ? '#d97706' : '#2563eb',
                        }}>
                          {log.locationMode === '격리' ? '🏠' : log.locationMode === '휴식' ? '😴' : '🏃'} {log.locationMode}
                        </Text>
                      )}
                      {log.location && <Text style={{ fontSize: 11, color: '#6b7280' }}>📍 {log.location}</Text>}
                      {log.fever && (
                        <Text style={{ fontSize: 11, color: log.fever === '고열' ? '#dc2626' : log.fever === '정상' ? '#16a34a' : '#ea580c' }}>
                          🌡 {log.fever}{log.temperature != null && isFeverLevel(log.fever) ? ` ${log.temperature}℃` : ''}
                        </Text>
                      )}
                      {log.symptom && <Text style={{ fontSize: 11, color: '#374151' }}>{log.symptom}</Text>}
                    </View>
                  )}
                  {log.note && <Text style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic', marginTop: 2 }}>{log.note}</Text>}
                  {(() => {
                    const doses = log.status === '최초보고'
                      ? (record.medicationDoses ?? []).filter(d => d.source === 'initial')
                      : dosesForProgressLog(record.medicationDoses, log);
                    if (doses.length === 0) return null;
                    return (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                        {doses.map(d => (
                          <View key={d.id} style={{ backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#d1fae5', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, color: '#047857' }}>💊 {doseLabel(d)} {d.quantity}{d.unit ?? L('patient.pcs')} · {d.groupName}{d.memo ? ` · ${d.memo}` : ''}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  })()}
                  {(log.nextCheckAt || log.nextCheckAssigneeName) && (
                    <View style={{ marginTop: 4, backgroundColor: '#fffbeb', borderRadius: 6, padding: 6 }}>
                      <Text style={{ fontSize: 10, color: '#b45309' }}>
                        ⏰ {nextCheckLabel}{log.nextCheckAssigneeName ? ` · ${log.nextCheckAssigneeName}` : ''}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* 누적 투약 내역 — 수량 ±/삭제 시 재고는 차이만큼만 반영 */}
      <DoseHistoryMobile record={record} currentUserName={currentUserName} />

      {record.types.includes('격리') && (
        <IsolationManageMobile record={record} onIsolationCheck={onIsolationCheck} onAddSchedule={onAddIsolationCheckSchedule} onCompleteSchedule={onCompleteIsolationCheck} />
      )}
      <ReturnCriteriaMobile record={record} onReturnCriteriaCheck={onReturnCriteriaCheck} />
    </View>
  );
}

// ==================== 약 복용 (재고 연동, 모바일) ====================

/** 약·처치 물품 사용 입력 — 최초보고·경과보고 공용. 품목·그룹은 재고 탭 데이터 그대로 사용 */
function MedicationDoseEditorMobile({ doses, onChange, medicines, groups, givenBy, defaultGroupId, history, studentNote }: {
  doses: MedicationDose[];
  onChange: (next: MedicationDose[]) => void;
  medicines: InventoryItemView[];
  groups: InventoryGroup[];
  givenBy: string;
  defaultGroupId?: string;
  history?: MedicationDose[];
  studentNote?: string;
}) {
  const canAdd = medicines.length > 0 && groups.length > 0;
  const addRow = () => {
    if (!canAdd) return;
    // 기본값을 비워 둔다 — 확인 없이 저장해 엉뚱한 약이 차감되는 것을 막기 위해
    const g = groups.find(x => x.id === defaultGroupId);
    onChange([...doses, {
      id: newDoseId(), itemId: '', itemName: '', unit: '개', quantity: 1,
      groupId: g?.id ?? '', groupName: g?.name ?? '', givenAt: Timestamp.now(), givenBy, source: 'initial',
    }]);
  };
  const update = (idx: number, patch: Partial<MedicationDose>) =>
    onChange(doses.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  const remove = (idx: number) => onChange(doses.filter((_, i) => i !== idx));
  const past = (history ?? []).filter(h => !doses.some(d => d.id === h.id));

  return (
    <View style={{ backgroundColor: '#ecfdf5', borderRadius: 10, borderWidth: 1, borderColor: '#a7f3d0', padding: 10, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#065f46' }}>{L('patient.medicationSupplyUse2')}</Text>
          <Text style={{ fontSize: 9, color: '#047857' }}>{L('patient.logOnlyWhatWasActually2')}</Text>
        </View>
        <TouchableOpacity onPress={addRow} disabled={!canAdd}
          style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: canAdd ? '#059669' : '#e5e7eb' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: canAdd ? '#fff' : '#9ca3af' }}>{L('patient.add')}</Text>
        </TouchableOpacity>
      </View>

      {studentNote ? (
        <Text style={{ fontSize: 10, color: '#be123c', backgroundColor: '#fff1f2', borderRadius: 6, padding: 6 }}>{L('patient.studentInfo2')} {studentNote}</Text>
      ) : null}

      {!canAdd && (
        <Text style={{ fontSize: 10, color: '#b45309', backgroundColor: '#fffbeb', borderRadius: 6, padding: 6 }}>
          {medicines.length === 0
            ? L('patient.noMedicationCareItemsRegistered2')
            : L('patient.noInventoryGroupsAskAn')}
        </Text>
      )}

      {doses.map((d, idx) => (
        <DoseRowMobile key={d.id} dose={d} idx={idx} doses={doses} medicines={medicines} groups={groups} past={past}
          onUpdate={patch => update(idx, patch)} onRemove={() => remove(idx)} />
      ))}
    </View>
  );
}

function DoseRowMobile({ dose: d, idx, doses, medicines, groups, past, onUpdate, onRemove }: {
  dose: MedicationDose; idx: number; doses: MedicationDose[]; medicines: InventoryItemView[]; groups: InventoryGroup[];
  past: MedicationDose[]; onUpdate: (patch: Partial<MedicationDose>) => void; onRemove: () => void;
}) {
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(!d.itemId);
  const item = medicines.find(m => m.id === d.itemId);
  const groupStock = item && d.groupId ? getGroupStock(item, d.groupId) : 0;
  const total = item ? getTotalStock(item) : 0;
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order: InventoryUsage[] = ['oral', 'topical', 'supply'];
    return medicines
      .filter(m => !q || [m.name, m.kind, m.spec, m.subCategory, m.ingredient, m.description].some(f => f?.toLowerCase().includes(q)))
      .sort((a, b) => order.indexOf(getItemUsage(a)) - order.indexOf(getItemUsage(b)) || a.name.localeCompare(b.name, 'ko'));
  }, [medicines, query]);
  const sameKey = (x: MedicationDose) => (item?.ingredient ? x.ingredient === item.ingredient : x.itemId === d.itemId);
  const pending = item ? doses.slice(0, idx + 1).filter(x => x.itemId && sameKey(x)).length : 0;
  const warnings = item && getItemUsage(item) === 'oral' ? getDoseWarnings(item, past, pending) : [];
  const incomplete = !d.itemId || !d.groupId;

  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: incomplete ? '#fcd34d' : '#d1fae5', padding: 8, gap: 6 }}>
      {/* 약·물품 선택 */}
      {picking || !item ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TextInput value={query} onChangeText={setQuery} placeholder={L('patient.searchItemsTylenolColdMedicine')} placeholderTextColor="#9ca3af"
              style={[styles.formInput, { flex: 1, fontSize: 12, paddingVertical: 6 }]} />
            {item && <TouchableOpacity onPress={() => setPicking(false)}><Text style={{ fontSize: 11, color: '#6b7280' }}>{L('common.cancel')}</Text></TouchableOpacity>}
            <TouchableOpacity onPress={onRemove} style={{ padding: 2 }}><Text style={{ fontSize: 12 }}>🗑️</Text></TouchableOpacity>
          </View>
          {candidates.length === 0 ? (
            <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', paddingVertical: 12 }}>{L('students.noResults')}</Text>
          ) : (
            <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
              {candidates.map((m, i) => {
                const gStock = d.groupId ? getGroupStock(m, d.groupId) : 0;
                const on = m.id === d.itemId;
                return (
                  <TouchableOpacity key={m.id} activeOpacity={0.6}
                    onPress={() => { onUpdate({ itemId: m.id, itemName: m.name, itemKind: m.kind, ingredient: m.ingredient, unit: m.unit || '개' }); setPicking(false); setQuery(''); }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, paddingHorizontal: 8,
                      backgroundColor: on ? '#ecfdf5' : '#fff', borderTopWidth: i > 0 ? StyleSheet.hairlineWidth : 0, borderTopColor: '#e5e7eb' }}>
                    {itemThumb(m)
                      ? <Image source={{ uri: itemThumb(m) }} style={{ width: 34, height: 34, borderRadius: 6, backgroundColor: '#f3f4f6' }} contentFit="cover" />
                      : <View style={{ width: 34, height: 34, borderRadius: 6, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 14 }}>💊</Text></View>}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '700', color: '#111827' }}>{m.name}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 10, color: '#9ca3af' }}>{[m.kind, m.spec, INVENTORY_USAGE_LABELS[getItemUsage(m)]].filter(Boolean).join(' · ')}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: d.groupId && gStock <= 0 ? '#dc2626' : '#374151' }}>
                        {d.groupId ? `${d.groupName ?? ''} ${gStock}` : L('patient.total', { v0: getTotalStock(m) })}<Text style={{ fontSize: 9, color: '#9ca3af' }}>{dataLabel(m.unit)}</Text>
                      </Text>
                      {d.groupId ? <Text style={{ fontSize: 9, color: '#9ca3af' }}>{L('common.all')} {getTotalStock(m)}{dataLabel(m.unit)}</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity onPress={() => setPicking(true)} style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#065f46' }}>{itemLabel(item)} <Text style={{ fontSize: 10, fontWeight: '400', color: '#6b7280' }}>{L('patient.change')}</Text></Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onRemove} style={{ padding: 2 }}><Text style={{ fontSize: 12 }}>🗑️</Text></TouchableOpacity>
        </View>
      )}

      {/* 수량 + 그룹 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TouchableOpacity onPress={() => onUpdate({ quantity: Math.max(1, d.quantity - 1) })}
          style={{ width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, color: '#374151' }}>−</Text>
        </TouchableOpacity>
        <Text style={{ minWidth: 40, textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#111827' }}>{d.quantity}{d.unit ?? L('patient.pcs')}</Text>
        <TouchableOpacity onPress={() => onUpdate({ quantity: d.quantity + 1 })}
          style={{ width: 26, height: 26, borderRadius: 6, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, color: '#374151' }}>+</Text>
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4 }} style={{ flex: 1 }}>
          {groups.map(g => {
            const on = g.id === d.groupId;
            return (
              <TouchableOpacity key={g.id} onPress={() => onUpdate({ groupId: g.id, groupName: g.name })}
                style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: on ? '#fef3c7' : '#f3f4f6', borderWidth: 1, borderColor: on ? '#f59e0b' : '#f3f4f6' }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: on ? '#92400e' : '#6b7280' }}>{g.name}{item ? ` ${getGroupStock(item, g.id)}` : ''}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      <TextInput value={d.memo ?? ''} onChangeText={v => onUpdate({ memo: v })}
        placeholder={L('patient.noteEGTakeAfter')} placeholderTextColor="#9ca3af"
        style={[styles.formInput, { fontSize: 11, paddingVertical: 5 }]} />
      {incomplete && <Text style={{ fontSize: 10, color: '#b45309' }}>{L('patient.selectTheItemAndThe')}</Text>}
      {warnings.map((w, i) => (
        <Text key={i} style={{ fontSize: 10, fontWeight: w.level === 'warn' ? '700' : '400', color: w.level === 'warn' ? '#b91c1c' : '#1d4ed8', backgroundColor: w.level === 'warn' ? '#fef2f2' : 'transparent', borderRadius: 4, padding: w.level === 'warn' ? 4 : 0 }}>
          {w.level === 'warn' ? '⚠️ ' : 'ℹ️ '}{w.message}
        </Text>
      ))}
      {item && isMultiUse(item) ? <Text style={{ fontSize: 10, color: '#c2410c', fontWeight: '600' }}>{L('patient.multiUseOnlyTheUse')}</Text> : null}
      {item?.dosageNote ? <Text style={{ fontSize: 10, color: '#065f46' }}>📋 {item.dosageNote}</Text> : null}
      {item?.description ? <Text style={{ fontSize: 10, color: '#4b5563' }}>ℹ️ {item.description}</Text> : null}
      {item && d.groupId ? (
        <Text style={{ fontSize: 10, color: groupStock - (isMultiUse(item) ? 0 : d.quantity) < 0 ? '#dc2626' : '#6b7280', fontWeight: groupStock - (isMultiUse(item) ? 0 : d.quantity) < 0 ? '600' : '400' }}>
          {L('nav.inventory')} {d.groupName} {groupStock}{d.unit ?? L('patient.pcs')} {L('patient.total2')} {total}{d.unit ?? L('patient.pcs')}{groupStock - (isMultiUse(item) ? 0 : d.quantity) < 0 ? L('patient.shortOnRecordCanSave') : ''}
        </Text>
      ) : null}
    </View>
  );
}

/** 환자별 누적 투약 내역 (시간순). 수량 ±/삭제 시 재고는 변경된 차이만큼만 반영 */
function DoseHistoryMobile({ record, currentUserName }: { record: PatientRecord; currentUserName: string }) {
  const doses = useMemo(() =>
    [...(record.medicationDoses ?? [])].sort((a, b) => (a.givenAt?.toMillis?.() ?? 0) - (b.givenAt?.toMillis?.() ?? 0)),
  [record.medicationDoses]);
  const [busy, setBusy] = useState(false);
  if (doses.length === 0) return null;

  const commit = async (next: MedicationDose[]) => {
    if (busy) return;
    setBusy(true);
    try {
      await updateMedicationDoses(db, record.id,
        { campCode: record.campCode, currentDoses: record.medicationDoses ?? [], by: currentUserName, studentName: record.studentName }, next);
      syncDoseStock(record.id, record.campCode);
    } catch (e) {
      console.error('약 복용 기록 수정 오류:', e);
    } finally {
      setBusy(false);
    }
  };
  const changeQty = (id: string, delta: number) => {
    const current = record.medicationDoses ?? [];
    const next = current.map(d => d.id === id ? { ...d, quantity: Math.max(1, d.quantity + delta) } : d);
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    commit(next);
  };
  const removeDose = (id: string) => {
    Alert.alert(L('common.confirmDelete'), L('patient.deleteThisMedicationRecordThe'), [
      { text: L('common.cancel'), style: 'cancel' },
      { text: L('common.delete'), style: 'destructive', onPress: () => commit((record.medicationDoses ?? []).filter(d => d.id !== id)) },
    ]);
  };

  return (
    <View style={{ backgroundColor: '#f0fdf4', borderRadius: 10, borderWidth: 1, borderColor: '#d1fae5', padding: 10, marginTop: 10 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#065f46', marginBottom: 6 }}>{L('patient.medicationHistory')} <Text style={{ color: '#9ca3af', fontWeight: '400' }}>({doses.length}{L('patient.entriesByTime')}</Text></Text>
      <View style={{ gap: 4 }}>
        {doses.map(d => (
          <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#d1fae5', paddingHorizontal: 8, paddingVertical: 5 }}>
            <Text style={{ fontSize: 10, color: '#9ca3af', width: 34 }}>{d.givenAt ? formatTime(d.givenAt) : ''}</Text>
            <View style={{ backgroundColor: d.source === 'initial' ? '#f3f4f6' : '#eff6ff', borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 }}>
              <Text style={{ fontSize: 9, color: d.source === 'initial' ? '#4b5563' : '#2563eb' }}>{d.source === 'initial' ? L('patient.initial') : L('patient.progress')}</Text>
            </View>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: '#1f2937' }}>
              <Text style={{ fontWeight: '700' }}>{doseLabel(d)}</Text> · {d.groupName}{d.memo ? ` · ${d.memo}` : ''}
            </Text>
            <TouchableOpacity disabled={busy || d.quantity <= 1} onPress={() => changeQty(d.id, -1)}
              style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', opacity: busy || d.quantity <= 1 ? 0.4 : 1 }}>
              <Text style={{ fontSize: 12, color: '#374151' }}>−</Text>
            </TouchableOpacity>
            <Text style={{ minWidth: 30, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#111827' }}>{d.quantity}{d.unit ?? L('patient.pcs')}</Text>
            <TouchableOpacity disabled={busy} onPress={() => changeQty(d.id, 1)}
              style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.4 : 1 }}>
              <Text style={{ fontSize: 12, color: '#374151' }}>+</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={() => removeDose(d.id)} style={{ padding: 2 }}>
              <Text style={{ fontSize: 12 }}>🗑️</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );
}

// ==================== 공통 탭 폼 모달 (모바일) ====================
// 경과·내원·복용약·부모연락 모두 동일한 껍데기 사용

function TabFormModalMobile({
  title, icon, onClose, onSubmit, submitLabel = L('common.save'), submitColor = '#3b82f6', children,
}: {
  title: string;
  icon?: string;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: string;
  submitColor?: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible animationType="none" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableOpacity
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16 }}
          activeOpacity={1}
          onPress={onClose}
        >
          <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}
            style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxHeight: '85%', overflow: 'hidden' }}>
            {/* 헤더 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#111827' }}>
                {icon ? `${icon} ` : ''}{title}
              </Text>
              <TouchableOpacity onPress={onClose} style={{ padding: 3 }}>
                <Text style={{ fontSize: 16, color: '#9ca3af' }}>✕</Text>
              </TouchableOpacity>
            </View>
            {/* 내용 */}
            <ScrollView style={{ paddingHorizontal: 14, paddingTop: 12 }} contentContainerStyle={{ gap: 10, paddingBottom: 6 }}>
              {children}
            </ScrollView>
            {/* 푸터 */}
            {onSubmit && (
              <View style={{ flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' }}>
                <TouchableOpacity onPress={onClose}
                  style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: '#f3f4f6' }}>
                  <Text style={{ fontSize: 12, color: '#6b7280', fontWeight: '600' }}>{L('common.cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onSubmit}
                  style={{ flex: 2, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: submitColor }}>
                  <Text style={{ fontSize: 12, color: '#fff', fontWeight: '700' }}>{submitLabel}</Text>
                </TouchableOpacity>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ==================== 격리 관리 (모바일) ====================

function IsolationManageMobile({
  record, onIsolationCheck, onAddSchedule, onCompleteSchedule,
}: {
  record: PatientRecord;
  onIsolationCheck: (i: number, v: boolean) => void;
  onAddSchedule: (minutesLater: number) => void;
  onCompleteSchedule: (scheduleId: string, temperature?: number, status?: IsolationCheckSchedule['status'], note?: string) => void;
}) {
  const [completing, setCompleting] = useState<string | null>(null);
  const [checkTemp, setCheckTemp] = useState('');
  const [checkStatus, setCheckStatus] = useState<IsolationCheckSchedule['status']>('동일');
  const [checkNote, setCheckNote] = useState('');

  const schedules = record.isolationCheckSchedules ?? [];
  const pending = schedules.filter(s => !s.completedAt);
  const done = schedules.filter(s => !!s.completedAt);
  const ISOLATION_RETURN_LABELS = [`열 없음 (${FEVER_THRESHOLDS.slight}°C 미만)`, '주요 증상 호전', '담당 매니저 확인'];

  const isOverdue = (ts: Timestamp) => ts.toDate() < new Date();

  return (
    <View style={{ backgroundColor: '#f5f3ff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#ddd6fe' }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#5b21b6', marginBottom: 10 }}>{L('patient.isolationCare')}</Text>

      {/* 주기 체크 */}
      <Text style={{ fontSize: 11, fontWeight: '600', color: '#6d28d9', marginBottom: 6 }}>{L('patient.scheduledChecks')}</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
        {[30, 60, 120].map(min => (
          <TouchableOpacity
            key={min}
            style={{ backgroundColor: '#ddd6fe', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
            onPress={() => onAddSchedule(min)}
          >
            <Text style={{ color: '#5b21b6', fontSize: 11, fontWeight: '700' }}>
              +{min >= 60 ? `${min / 60}h` : `${min}m`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {pending.map(s => (
        completing === s.id ? (
          <View key={s.id} style={{ backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 6 }}>
            <Text style={{ color: '#6d28d9', fontSize: 11, fontWeight: '600', marginBottom: 6 }}>
              {formatTime(s.scheduledAt)} {L('patient.checkDone')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
              <TextInput
                value={checkTemp}
                onChangeText={setCheckTemp}
                placeholder={L('patient.temperature')}
                keyboardType="decimal-pad"
                placeholderTextColor="#9ca3af"
                style={{ flex: 1, borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 6, padding: 8, fontSize: 12 }}
              />
              <View style={{ flex: 1 }}>
                {(['정상', '호전', '악화', '동일'] as const).map(o => (
                  <TouchableOpacity
                    key={o}
                    style={{ backgroundColor: checkStatus === o ? '#7c3aed' : '#f3f4f6', borderRadius: 4, paddingVertical: 4, paddingHorizontal: 6, marginBottom: 2 }}
                    onPress={() => setCheckStatus(o)}
                  >
                    <Text style={{ color: checkStatus === o ? '#fff' : '#374151', fontSize: 10, fontWeight: '600' }}>{dataLabel(o)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.editBtn, { flex: 1 }]} onPress={() => setCompleting(null)}>
                <Text style={styles.editBtnText}>{L('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#7c3aed', borderRadius: 8, padding: 8, alignItems: 'center' }}
                onPress={() => {
                  onCompleteSchedule(s.id, checkTemp ? parseFloat(checkTemp) : undefined, checkStatus, checkNote.trim() || undefined);
                  setCompleting(null);
                  setCheckTemp(''); setCheckStatus('동일'); setCheckNote('');
                }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{L('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isOverdue(s.scheduledAt) ? '#fee2e2' : '#fff', borderRadius: 8, padding: 8, marginBottom: 4, borderWidth: 1, borderColor: isOverdue(s.scheduledAt) ? '#fecaca' : '#ede9fe' }}>
            <Text style={{ color: isOverdue(s.scheduledAt) ? '#dc2626' : '#5b21b6', fontSize: 12, fontWeight: '600' }}>
              {isOverdue(s.scheduledAt) ? '⚠️ ' : '⏰ '}{formatTime(s.scheduledAt)}
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: '#7c3aed', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 }}
              onPress={() => setCompleting(s.id)}
            >
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{L('patient.checkDone')}</Text>
            </TouchableOpacity>
          </View>
        )
      ))}

      {done.length > 0 && (
        <View style={{ marginTop: 6 }}>
          <Text style={{ color: '#9ca3af', fontSize: 10, fontWeight: '600', marginBottom: 4 }}>{L('patient.completedChecks')}</Text>
          {done.map(s => (
            <View key={s.id} style={{ flexDirection: 'row', gap: 6, marginBottom: 2 }}>
              <Text style={{ color: '#22c55e', fontSize: 10 }}>✓</Text>
              <Text style={{ color: '#6b7280', fontSize: 10 }}>{formatTime(s.scheduledAt)}</Text>
              {s.temperature && <Text style={{ color: '#f97316', fontSize: 10 }}>{s.temperature}°C</Text>}
              {s.status && <Text style={{ color: '#6b7280', fontSize: 10, fontWeight: '600' }}>{dataLabel(s.status)}</Text>}
            </View>
          ))}
        </View>
      )}

      {/* 레거시 복귀 기준 */}
      <View style={{ marginTop: 10 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: '#6d28d9', marginBottom: 6 }}>{L('patient.isolationReleaseCriteria')}</Text>
        {ISOLATION_RETURN_LABELS.map((label, i) => {
          const checked = record.isolationReturnChecks?.[i] ?? false;
          return (
            <TouchableOpacity
              key={i}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}
              onPress={() => onIsolationCheck(i, !checked)}
            >
              <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: checked ? '#7c3aed' : '#9ca3af', backgroundColor: checked ? '#7c3aed' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                {checked && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
              </View>
              <Text style={{ flex: 1, fontSize: 11, color: checked ? '#6d28d9' : '#374151', textDecorationLine: checked ? 'line-through' : 'none' }}>
                {dataLabel(label)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ==================== 복귀 판단 기준 (모바일) ====================

function ReturnCriteriaMobile({
  record, onReturnCriteriaCheck,
}: {
  record: PatientRecord;
  onReturnCriteriaCheck: (i: number, v: boolean) => void;
}) {
  const criteria = RETURN_CRITERIA_LABELS as readonly string[];
  const checks = record.returnCriteriaChecks ?? Array(criteria.length).fill(false);
  const allDone = checks.every(Boolean);

  const hideTypes: PatientType[] = ['처치전', '단순처치'];
  const shouldShow = !record.types.every(t => hideTypes.includes(t));
  if (!shouldShow) return null;

  return (
    <View style={{ backgroundColor: allDone ? '#f0fdf4' : '#fffbeb', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: allDone ? '#bbf7d0' : '#fde68a' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: allDone ? '#166534' : '#92400e' }}>{L('patient.returnToClassCriteria')}</Text>
        {allDone && (
          <View style={{ backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: '#166534', fontSize: 10, fontWeight: '700' }}>{L('patient.canReturn')}</Text>
          </View>
        )}
      </View>
      {criteria.map((label, i) => {
        const checked = checks[i] ?? false;
        return (
          <TouchableOpacity
            key={i}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}
            onPress={() => onReturnCriteriaCheck(i, !checked)}
          >
            <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: checked ? (allDone ? '#22c55e' : '#f59e0b') : '#9ca3af', backgroundColor: checked ? (allDone ? '#22c55e' : '#f59e0b') : '#fff', alignItems: 'center', justifyContent: 'center' }}>
              {checked && <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>✓</Text>}
            </View>
            <Text style={{ flex: 1, fontSize: 11, color: checked ? '#9ca3af' : '#374151', textDecorationLine: checked ? 'line-through' : 'none' }}>
              {dataLabel(label)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ==================== 내원 탭 (모바일) ====================

function HospitalTabMobile({ record, campUsers, allRecords, onUpdateVisits }: {
  record: PatientRecord;
  campUsers: User[];
  allRecords: PatientRecord[];
  onUpdateVisits: (visits: HospitalVisitEntry[]) => void;
}) {
  const { userData: viewer } = useAuth();
  const visits = record.hospitalVisits ?? [];
  const [showForm, setShowForm] = useState(false);
  const [editingIdx, setEditingIdx] = useState(-1);
  const hospitalSubmitRef = useRef<(() => void) | null>(null);

  const handleDeleteVisit = (idx: number) => {
    Alert.alert(L('common.confirmDelete'), L('patient.deleteHospitalVisit', { v0: idx + 1 }), [
      { text: L('common.cancel'), style: 'cancel' },
      { text: L('common.delete'), style: 'destructive', onPress: () => onUpdateVisits(visits.filter((_, i) => i !== idx)) },
    ]);
  };

  const handleSubmitForm = (entry: Partial<HospitalVisitEntry>) => {
    if (editingIdx >= 0) {
      const next = visits.map((v, i) => i === editingIdx ? { ...v, ...entry } : v);
      onUpdateVisits(next);
    } else {
      onUpdateVisits([...visits, {
        visitId: Date.now().toString(),
        hospitalStatus: '내원예정',
        escort: '',
        ...entry,
      } as HospitalVisitEntry]);
    }
    setShowForm(false);
    setEditingIdx(-1);
  };

  return (
    <View style={{ gap: 8 }}>
      {visits.length === 0 && !showForm ? (
        <Text style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center', paddingVertical: 12 }}>{L('patient.noHospitalVisits')}</Text>
      ) : (
        visits.map((visit, idx) => (
          <View key={visit.visitId} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#fed7aa' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: '#c2410c', fontSize: 11, fontWeight: '700' }}>{idx + 1}{L('patient.visit2')} {dataLabel(visit.hospitalStatus)}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity onPress={() => { setEditingIdx(idx); setShowForm(true); }}>
                  <Text style={{ fontSize: 11, color: '#6b7280' }}>{L('task.edit')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteVisit(idx)}>
                  <Text style={{ fontSize: 11 }}>🗑️</Text>
                </TouchableOpacity>
              </View>
            </View>
            {visit.transportSlot && <Text style={{ fontSize: 11, color: '#374151' }}>{L('patient.method')} {dataLabel(visit.transportSlot)}</Text>}
            {visit.departureTime && <Text style={{ fontSize: 11, color: '#374151' }}>{L('patient.departure')} {visit.departureTime}</Text>}
            {visit.driver && <Text style={{ fontSize: 11, color: '#374151' }}>{L('patient.driver')} {visit.driver}</Text>}
            {visit.escort && <Text style={{ fontSize: 11, color: '#374151' }}>{L('students.escort')} {visit.escort}</Text>}
            {(isActiveEscortVisit(visit, viewer?.name) || viewer?.role === 'admin') && visit.hospitalStatus !== '필요없음' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 11, color: '#374151' }}>{L('patient.id')}</Text>
                <EscortSsn recordId={record.id} auto={isActiveEscortVisit(visit, viewer?.name)} />
              </View>
            )}
            {visit.hospitalName && <Text style={{ fontSize: 11, color: '#374151' }}>{L('patient.hospital')} {visit.hospitalName}</Text>}
            {visit.hospitalStatus === '내원예정' && (
              <TouchableOpacity
                style={{ backgroundColor: '#22c55e', borderRadius: 8, padding: 8, alignItems: 'center', marginTop: 8 }}
                onPress={() => onUpdateVisits(visits.map((v, i) => i === idx ? { ...v, hospitalStatus: '내원완료' as HospitalStatus } : v))}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{L('patient.markVisitComplete')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
      <TouchableOpacity
        style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#fca5a5', borderRadius: 10, padding: 10, alignItems: 'center' }}
        onPress={() => { setEditingIdx(-1); setShowForm(true); }}
      >
        <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>
          + {visits.length === 0 ? L('patient.registerPlannedVisit') : L('patient.addAnotherVisit')}
        </Text>
      </TouchableOpacity>

      {showForm && (
        <TabFormModalMobile
          title={editingIdx >= 0 ? L('patient.editVisitInfo') : L('patient.registerPlannedVisit')}
          icon="🏥"
          onClose={() => { setShowForm(false); setEditingIdx(-1); }}
          onSubmit={() => hospitalSubmitRef.current?.()}
          submitLabel={editingIdx >= 0 ? L('common.saveChanges') : L('common.register')}
          submitColor="#f97316"
        >
          <HospitalScheduleFormMobile
            campUsers={campUsers}
            allRecords={allRecords}
            classMentor={record.classMentor}
            campCode={record.campCode}
            initialValues={editingIdx >= 0 ? visits[editingIdx] : undefined}
            isEdit={editingIdx >= 0}
            onSubmit={handleSubmitForm}
            onCancel={() => { setShowForm(false); setEditingIdx(-1); }}
            submitRef={hospitalSubmitRef}
          />
        </TabFormModalMobile>
      )}
    </View>
  );
}

function HospitalScheduleFormMobile({
  onSubmit, onCancel, campUsers, allRecords, initialValues, isEdit, classMentor, campCode, submitRef,
}: {
  onSubmit: (entry: Partial<HospitalVisitEntry>) => void;
  onCancel: () => void;
  campUsers: User[];
  allRecords: PatientRecord[];
  initialValues?: Partial<HospitalVisitEntry>;
  isEdit?: boolean;
  classMentor?: string;
  campCode?: string;
  submitRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [transportSlot, setTransportSlot] = useState<TransportSlot>(initialValues?.transportSlot ?? '차량1');
  const [departureTime, setDepartureTime] = useState(initialValues?.departureTime ?? '');
  const [driver, setDriver] = useState(initialValues?.driver ?? '');
  const [escort, setEscort] = useState(initialValues?.escort ?? '');
  const [hospitalName, setHospitalName] = useState(initialValues?.hospitalName ?? '');
  const [parentReporter, setParentReporter] = useState(initialValues?.parentReporter ?? classMentor ?? '');
  const [parentReportMethod, setParentReportMethod] = useState<ParentReportMethod>(initialValues?.parentReportMethod ?? '문자');

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

  // 처음 열 때 한 번만 같은 차량의 출발 시간 · 운전자를 채운다 (웹과 같음).
  // 다른 사람이 저장할 때마다 다시 채우면 입력 중인 값이 덮어써진다.
  useEffect(() => {
    if (isEdit) return;
    const info = findSlotInfo(transportSlot);
    if (info) {
      if (info.departureTime) setDepartureTime(info.departureTime);
      if (info.driver) setDriver(info.driver);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const presets = getHospitalPresets(campCode ?? '');

  // 외부(TabFormModalMobile)에서 저장 버튼 클릭 시 호출될 submit 함수 등록
  const handleSubmitInternal = () => {
    // 상태는 넘기지 않는다 — 새로 추가할 때만 '내원예정'으로 시작하고, 수정 때는 기존 상태(내원완료 등)를 유지
    onSubmit({ transportSlot, departureTime, driver: isCar ? driver : undefined, escort, hospitalName, parentReporter, parentReportMethod });
  };
  useEffect(() => {
    if (submitRef) submitRef.current = handleSubmitInternal;
  });

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>{L('patient.transport')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
        {TRANSPORT_SLOTS.map(s => (
          <TouchableOpacity key={s} onPress={() => handleSlotChange(s)}
            style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: transportSlot === s ? '#f97316' : '#fff', borderWidth: 1, borderColor: '#fed7aa' }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: transportSlot === s ? '#fff' : '#6b7280' }}>{dataLabel(s)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ fontSize: 10, color: '#6b7280' }}>{L('patient.departureTime24h')}</Text>
      <TextInput value={departureTime}
        onChangeText={v => { const raw = v.replace(/[^\d:]/g, ''); if (/^\d{4}$/.test(raw)) setDepartureTime(`${raw.slice(0, 2)}:${raw.slice(2)}`); else setDepartureTime(raw); }}
        placeholder={L('patient.eG1430')} placeholderTextColor="#9ca3af" maxLength={5}
        style={[styles.formInput, { fontSize: 12, paddingVertical: 7 }]} />
      {isCar && (
        <>
          <Text style={{ fontSize: 10, color: '#6b7280' }}>{L('patient.driver2')}</Text>
          <UserSearchInputMobile value={driver} onChange={setDriver} campUsers={campUsers} placeholder={L('patient.searchDriver')} />
        </>
      )}
      <Text style={{ fontSize: 10, color: '#6b7280' }}>{L('patient.escort')}</Text>
      <UserSearchInputMobile value={escort} onChange={setEscort} campUsers={campUsers} placeholder={L('patient.searchEscort')} />
      <Text style={{ fontSize: 10, color: '#6b7280' }}>{L('patient.hospitalName')}</Text>
      {presets.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          {presets.map(name => (
            <TouchableOpacity key={name} onPress={() => setHospitalName(name)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: hospitalName === name ? '#f97316' : '#fff', borderWidth: 1, borderColor: '#fed7aa' }}>
              <Text style={{ fontSize: 10, color: hospitalName === name ? '#fff' : '#6b7280' }}>{name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TextInput value={hospitalName} onChangeText={setHospitalName} placeholder={L('patient.enterHospitalName')} placeholderTextColor="#9ca3af" style={[styles.formInput, { fontSize: 12, paddingVertical: 7 }]} />
      <Text style={{ fontSize: 10, color: '#6b7280' }}>{L('patient.parentReporter2')}</Text>
      <TextInput value={parentReporter} onChangeText={setParentReporter} placeholder={L('patient.reporter2')} placeholderTextColor="#9ca3af" style={[styles.formInput, { fontSize: 12, paddingVertical: 7 }]} />
      <Text style={{ fontSize: 10, color: '#6b7280' }}>{L('patient.parentReportMethod')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
        {PARENT_REPORT_METHODS.map(m => (
          <TouchableOpacity key={m} onPress={() => setParentReportMethod(m)} style={{ paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: parentReportMethod === m ? '#f97316' : '#fff', borderWidth: 1, borderColor: '#fed7aa' }}>
            <Text style={{ fontSize: 11, color: parentReportMethod === m ? '#fff' : '#6b7280' }}>{dataLabel(m)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function UserSearchInputMobile({ value, onChange, campUsers, placeholder }: {
  value: string; onChange: (v: string) => void; campUsers: User[]; placeholder: string;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const results = query.trim()
    ? campUsers.filter(u => u.name.includes(query.trim())).slice(0, 6)
    : campUsers.slice(0, 6);

  const handleSelect = (name: string) => {
    setQuery(name);
    onChange(name);
    setOpen(false);
  };

  return (
    <View>
      <TextInput
        value={query}
        onChangeText={v => { setQuery(v); onChange(v); setOpen(true); }}
        onFocus={() => setOpen(true)}
        // onBlur 없음 — 최초보고 드롭다운과 동일한 패턴
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        style={styles.formInput}
      />
      {open && results.length > 0 && (
        <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, backgroundColor: '#fff', marginTop: 2 }}>
          {results.map(u => (
            <TouchableOpacity
              key={u.userId}
              style={{ padding: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
              onPress={() => handleSelect(u.name)}
            >
              <Text style={{ fontSize: 12, color: '#374151' }}>{u.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

function TransportBoardMobile({ allRecords }: { allRecords: PatientRecord[] }) {
  type GroupEntry = { slot: TransportSlot; escort: string; driver?: string; departureTime?: string; hospitalName?: string; students: string[] };
  const groupMap = new Map<string, GroupEntry>();
  allRecords.forEach(r => {
    (r.hospitalVisits ?? []).forEach(v => {
      if (v.hospitalStatus !== '내원예정' || !v.transportSlot) return;
      const key = `${v.transportSlot}::${v.escort ?? ''}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, { slot: v.transportSlot, escort: v.escort ?? '', driver: v.driver, departureTime: v.departureTime, hospitalName: v.hospitalName, students: [] });
      }
      groupMap.get(key)!.students.push(r.studentName);
    });
  });
  if (groupMap.size === 0) return null;
  // 등록된 transportSlot 값 그대로 차량별로 먼저 묶고, 같은 차량 안에서는 인솔자별 한 줄씩
  const bySlot = TRANSPORT_SLOTS
    .map(slot => ({
      slot,
      rows: [...groupMap.values()].filter(g => g.slot === slot).sort((a, b) => a.escort.localeCompare(b.escort, 'ko')),
    }))
    .filter(s => s.rows.length > 0);
  return (
    <View style={{ backgroundColor: '#fff7ed', borderRadius: 12, borderWidth: 1, borderColor: '#fed7aa', marginBottom: 12, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#fed7aa' }}>
        <Text style={{ fontSize: 11, fontWeight: '700', color: '#c2410c' }}>{L('patient.hospitalTransport')}</Text>
      </View>
      {bySlot.map(({ slot, rows }, i) => (
        <View key={slot} style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: i < bySlot.length - 1 ? 1 : 0, borderBottomColor: '#fed7aa' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#ea580c' }}>{dataLabel(slot)}</Text>
            {rows[0]?.driver && (
              <Text style={{ fontSize: 11, color: '#374151' }}>{L('patient.driver3')} <Text style={{ fontWeight: '600' }}>{rows[0].driver}</Text></Text>
            )}
          </View>
          <View style={{ gap: 3 }}>
            {rows.map((g, ri) => (
              <Text key={ri} style={{ fontSize: 11, color: '#374151', lineHeight: 16 }}>
                <Text style={{ fontWeight: '700', color: '#111827' }}>{g.escort || L('patient.escortTbd')}</Text>
                {' '}<Text style={{ color: '#c2410c' }}>({g.students.join(', ')})</Text>
                {g.hospitalName ? <Text style={{ color: '#6b7280' }}> : {g.hospitalName}</Text> : null}
                {g.departureTime ? <Text style={{ fontSize: 10, color: '#9ca3af' }}> · {g.departureTime} {L('patient.departs')}</Text> : null}
              </Text>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// ==================== 복용약 탭 (모바일) ====================

function MedicationTabMobile({
  schedules, today, onCheck, onAddSchedule, onUpdateSchedule, onRemoveSchedule,
}: {
  schedules: MedicationSchedule[];
  today: string;
  onCheck: (si: number, t: MedicationTime, checked: boolean) => void;
  onAddSchedule?: (s: Omit<MedicationSchedule, 'checkedTimes'>) => void;
  onUpdateSchedule?: (idx: number, s: Omit<MedicationSchedule, 'checkedTimes'>) => void;
  onRemoveSchedule?: (idx: number) => void;
}) {
  const EMPTY_SCHED = (): Omit<MedicationSchedule, 'checkedTimes'> => ({
    name: '', category: undefined, memo: '', times: [],
    startDate: today, endDate: today, endDateAuto: false,
    firstTime: undefined, lastTime: undefined, totalDoses: 0,
  });

  const [showForm, setShowForm] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [formData, setFormData] = useState<Omit<MedicationSchedule, 'checkedTimes'>>(EMPTY_SCHED());
  const [dayCount, setDayCount] = useState('1');
  const [confirmDeleteIdx, setConfirmDeleteIdx] = useState<number | null>(null);

  const openAdd = () => { setFormData(EMPTY_SCHED()); setDayCount('1'); setEditingIdx(null); setShowForm(true); };
  const openEdit = (idx: number) => {
    const s = schedules[idx];
    setFormData({ name: s.name, category: s.category, memo: s.memo ?? '', times: [...s.times],
      startDate: s.startDate, endDate: s.endDate, endDateAuto: s.endDateAuto ?? false,
      firstTime: s.firstTime, lastTime: s.lastTime, daysPerWeek: s.daysPerWeek,
      skipDates: s.skipDates, totalDoses: s.totalDoses });
    const diff = Math.round((new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 86400000) + 1;
    setDayCount(String(diff));
    setEditingIdx(idx); setShowForm(true);
  };

  const handleDayCount = (val: string) => {
    setDayCount(val);
    const n = parseInt(val);
    if (!isNaN(n) && n >= 1) {
      const start = new Date(formData.startDate);
      start.setDate(start.getDate() + n - 1);
      setFormData(f => ({ ...f, endDate: start.toISOString().slice(0, 10) }));
    }
  };

  const toggleTime = (t: MedicationTime) =>
    setFormData(f => ({ ...f, times: f.times.includes(t) ? f.times.filter(x => x !== t) : [...f.times, t] }));

  const handleSubmit = () => {
    if (!formData.name.trim() || formData.times.length === 0) return;
    const days = parseInt(dayCount) || 1;
    const final: Omit<MedicationSchedule, 'checkedTimes'> = {
      ...formData,
      totalDoses: formData.endDateAuto ? 0 : days * formData.times.length,
      firstTime: formData.endDateAuto ? undefined : formData.firstTime,
      lastTime: formData.endDateAuto ? undefined : formData.lastTime,
    };
    if (editingIdx !== null) onUpdateSchedule?.(editingIdx, final);
    else onAddSchedule?.(final);
    setShowForm(false); setEditingIdx(null);
  };

  const MedCard = ({ sched, idx }: { sched: MedicationSchedule; idx: number }) => {
    const total = calcTotalDoses(sched);
    const done = (sched.checkedTimes ?? []).length;
    const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
    const isActive = schedActiveOn(sched, today);
    return (
      <View style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#fed7aa', marginBottom: 8 }}>
        {/* 헤더 행 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
          {sched.category && (
            <View style={{ backgroundColor: '#fde68a', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginRight: 6 }}>
              <Text style={{ fontSize: 9, color: '#92400e', fontWeight: '700' }}>{dataLabel(sched.category)}</Text>
            </View>
          )}
          <Text style={{ color: '#c2410c', fontSize: 12, fontWeight: '700', flex: 1 }}>{sched.name}</Text>
          <Text style={{ color: '#f97316', fontSize: 10 }}>{done}/{total}{L('patient.x2')}</Text>
          <TouchableOpacity onPress={() => openEdit(idx)} style={{ marginLeft: 8 }}>
            <Text style={{ fontSize: 12 }}>✏️</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setConfirmDeleteIdx(idx)} style={{ marginLeft: 6 }}>
            <Text style={{ fontSize: 12 }}>🗑️</Text>
          </TouchableOpacity>
        </View>
        {/* 진행 바 */}
        <View style={{ height: 5, backgroundColor: '#fed7aa', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
          <View style={{ width: `${pct}%` as any, height: '100%', backgroundColor: pct >= 100 ? '#22c55e' : '#f97316', borderRadius: 3 }} />
        </View>
        {/* 기간 */}
        <Text style={{ color: '#9ca3af', fontSize: 10, marginBottom: 6 }}>
          {formatMedPeriod(sched)}{!isActive && L('patient.noDoseToday')}
        </Text>
        {sched.memo ? <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 6 }}>📝 {sched.memo}</Text> : null}
        {/* 복용 시간 버튼 */}
        {isActive && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {MEDICATION_TIMES.filter(t => sched.times.includes(t)).map(time => {
              const key = makeMedTimeKey(time, today);
              const checked = (sched.checkedTimes ?? []).includes(key);
              const off = !checked && isMedTimeOff(sched, time, today);
              return (
                <TouchableOpacity key={time} disabled={off} style={[styles.medTimeBtn, checked && styles.medTimeBtnDone, off && { opacity: 0.35 }]}
                  onPress={() => onCheck(idx, time, checked)}>
                  {checked && <Text style={{ color: '#fff', fontSize: 10 }}>✓ </Text>}
                  <Text style={[styles.medTimeBtnText, checked && { color: '#fff' }]}>{dataLabel(time)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {/* 삭제 확인 */}
        {confirmDeleteIdx === idx && (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: '#fed7aa', paddingTop: 8 }}>
            <Text style={{ flex: 1, fontSize: 11, color: '#374151' }}>{L('patient.reallyDelete')}</Text>
            <TouchableOpacity onPress={() => setConfirmDeleteIdx(null)} style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#f3f4f6' }}>
              <Text style={{ fontSize: 11, color: '#6b7280' }}>{L('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { onRemoveSchedule?.(idx); setConfirmDeleteIdx(null); }}
              style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#ef4444' }}>
              <Text style={{ fontSize: 11, color: '#fff', fontWeight: '700' }}>{L('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ gap: 6 }}>
      <TouchableOpacity onPress={openAdd}
        style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#fed7aa', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
        <Text style={{ color: '#f97316', fontSize: 12, fontWeight: '600' }}>{L('patient.addMedication3')}</Text>
      </TouchableOpacity>

      {showForm && (
        <TabFormModalMobile
          title={editingIdx !== null ? L('patient.editMedication') : L('patient.addMedication2')}
          icon="💊"
          onClose={() => { setShowForm(false); setEditingIdx(null); }}
          onSubmit={handleSubmit}
          submitLabel={editingIdx !== null ? L('common.saveChanges') : L('task.add')}
          submitColor="#f97316"
        >
          {/* 약 이름 */}
          <View>
            <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{L('patient.medicationName2')}</Text>
            <TextInput value={formData.name} onChangeText={v => setFormData(f => ({ ...f, name: v }))}
              placeholder={L('patient.enterMedicationName')} placeholderTextColor="#9ca3af" style={[styles.formInput, { fontSize: 12, paddingVertical: 7 }]} />
          </View>

          {/* 종류 */}
          <View>
            <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{L('patient.type')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              {MEDICATION_CATEGORIES.map(cat => (
                <TouchableOpacity key={cat} onPress={() => setFormData(f => ({ ...f, category: f.category === cat ? undefined : cat }))}
                  style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: formData.category === cat ? '#f97316' : '#f3f4f6' }}>
                  <Text style={{ fontSize: 11, color: formData.category === cat ? '#fff' : '#6b7280', fontWeight: '600' }}>{dataLabel(cat)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 복용 시간 */}
          <View>
            <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{L('patient.doseTimesMultiple')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
              {MEDICATION_TIMES.map(t => (
                <TouchableOpacity key={t} onPress={() => toggleTime(t)}
                  style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: formData.times.includes(t) ? '#f97316' : '#f3f4f6' }}>
                  <Text style={{ fontSize: 11, color: formData.times.includes(t) ? '#fff' : '#6b7280', fontWeight: '600' }}>{dataLabel(t)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 복용 기간 */}
          <View>
            <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{L('patient.duration')}</Text>
            <TouchableOpacity onPress={() => setFormData(f => ({ ...f, endDateAuto: !f.endDateAuto, lastTime: undefined }))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <View style={{ width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, borderColor: formData.endDateAuto ? '#f97316' : '#d1d5db', backgroundColor: formData.endDateAuto ? '#f97316' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                {formData.endDateAuto && <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>✓</Text>}
              </View>
              <Text style={{ fontSize: 12, color: '#374151', fontWeight: '500' }}>{L('patient.untilCampEnds')}</Text>
            </TouchableOpacity>
            {!formData.endDateAuto && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TextInput value={dayCount} onChangeText={handleDayCount} keyboardType="number-pad"
                  style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, width: 52, textAlign: 'center', backgroundColor: '#fff', color: '#111827' }} />
                <Text style={{ fontSize: 11, color: '#6b7280' }}>{L('patient.d')}  {formData.startDate} ~ {formData.endDate}</Text>
              </View>
            )}

            {!formData.endDateAuto && formData.times.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>{L('patient.startTimeOnFirstDay2')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {MEDICATION_TIMES.filter(t => formData.times.includes(t)).map(t => (
                    <TouchableOpacity key={t} onPress={() => setFormData(f => ({ ...f, firstTime: t }))}
                      style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: formData.firstTime === t ? '#14b8a6' : '#f3f4f6' }}>
                      <Text style={{ fontSize: 10, color: formData.firstTime === t ? '#fff' : '#6b7280', fontWeight: '600' }}>{dataLabel(t)}{L('patient.start')}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {!formData.endDateAuto && parseInt(dayCount) > 1 && formData.times.length > 0 && (
              <View style={{ marginTop: 6 }}>
                <Text style={{ fontSize: 10, color: '#9ca3af', marginBottom: 4 }}>{L('patient.endTimeOnLastDay')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {MEDICATION_TIMES.filter(t => formData.times.includes(t)).map(t => (
                    <TouchableOpacity key={t} onPress={() => setFormData(f => ({ ...f, lastTime: t }))}
                      style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: formData.lastTime === t ? '#f97316' : '#f3f4f6' }}>
                      <Text style={{ fontSize: 10, color: formData.lastTime === t ? '#fff' : '#6b7280', fontWeight: '600' }}>{dataLabel(t)}{L('patient.end')}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* 메모 */}
          <View>
            <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{L('common.memo')}</Text>
            <TextInput value={formData.memo ?? ''} onChangeText={v => setFormData(f => ({ ...f, memo: v }))}
              placeholder={L('patient.eG30MinAfter')} placeholderTextColor="#9ca3af" style={[styles.formInput, { fontSize: 12, paddingVertical: 7 }]} />
          </View>
        </TabFormModalMobile>
      )}

      {schedules.length === 0 && !showForm && (
        <Text style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center', paddingVertical: 8 }}>{L('patient.noMedicationSchedule')}</Text>
      )}

      {/* 약 카드 목록 */}
      {schedules.map((sched, idx) => (
        <MedCard key={idx} sched={sched} idx={idx} />
      ))}
    </View>
  );
}

// ==================== 폼 모달 ====================

function PatientFormModal({
  form, setForm, editingId, submitting, today, students,
  onClose, onSubmit,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  editingId: string | null;
  submitting: boolean;
  today: string;
  students: STSheetStudent[];
  onClose: () => void;
  onSubmit: () => void;
}) {
  const setField = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(f => ({ ...f, [key]: val }));

  const [studentSearch, setStudentSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [studentLocked, setStudentLocked] = useState(!!editingId && !!form.studentName);

  const studentResults = useMemo(() => {
    if (!studentSearch.trim()) return [];
    return students.filter(s => s.name.includes(studentSearch.trim())).slice(0, 6);
  }, [studentSearch, students]);

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
    setShowDropdown(false);
    setStudentLocked(true);
  };

  const toggleType = (t: PatientType) => {
    setForm(f => {
      const has = f.types.includes(t);
      const next = has ? f.types.filter(x => x !== t) : [...f.types, t];
      return { ...f, types: next.length === 0 ? ['처치전'] : next };
    });
  };

  const addMedSchedule = () => {
    setForm(f => ({
      ...f,
      medSchedules: [...f.medSchedules, { name: '', times: [], startDate: today, endDate: today }],
    }));
  };

  const hasMedType = form.types.includes('약복용');
  const hasIsolation = form.types.includes('격리');
  const hasHospital = form.types.includes('병원내원');

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.modalTitle}>{editingId ? L('patient.editPatientRecord') : L('patient.addPatientRecord')}</Text>
        <TouchableOpacity
          onPress={onSubmit}
          disabled={submitting || !form.studentName.trim() || !form.symptom.trim()}
          style={[styles.modalSaveBtn, (submitting || !form.studentName.trim() || !form.symptom.trim()) && styles.modalSaveBtnDisabled]}
        >
          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalSaveBtnText}>{L('common.save')}</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        {/* 학생 정보 */}
        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>{L('patient.studentInfo')}</Text>
          {/* 이름 검색 */}
          <View>
            <Text style={styles.formLabel}>{L('profile.name')}</Text>
            <TextInput
              value={studentSearch || form.studentName}
              onChangeText={v => {
                if (studentLocked) return;
                setStudentSearch(v);
                setField('studentName', v);
                setShowDropdown(true);
              }}
              onFocus={() => { if (!studentLocked) setShowDropdown(true); }}
              placeholder={L('patient.searchByName')}
              placeholderTextColor="#9ca3af"
              editable={!studentLocked}
              style={[styles.formInput, studentLocked && { backgroundColor: '#f9fafb', color: '#374151' }]}
            />
            {studentLocked && (
              <TouchableOpacity
                style={{ position: 'absolute', right: 10, top: 34, backgroundColor: '#e5e7eb', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}
                onPress={() => {
                  setStudentLocked(false);
                  setStudentSearch('');
                  setForm(f => ({ ...f, studentName: '', grade: '', className: '', classMentor: '', unitMentor: '', roomNumber: '' }));
                }}
              >
                <Text style={{ color: '#6b7280', fontSize: 11 }}>{L('patient.change')}</Text>
              </TouchableOpacity>
            )}
            {showDropdown && studentResults.length > 0 && !studentLocked && (
              <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, backgroundColor: '#fff', marginTop: 2 }}>
                {studentResults.map(s => (
                  <TouchableOpacity
                    key={s.studentId}
                    style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
                    onPress={() => selectStudent(s)}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#111827' }}>{s.name}</Text>
                    <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                      {s.grade}{s.gender ? s.gender : ''} · {s.className ?? '-'} · {s.roomNumber ? L('lodging.roomV0', { v0: s.roomNumber }) : '-'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          {/* 자동 매핑 표시 (잠긴 상태) */}
          {studentLocked && (
            <View style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, marginTop: 4 }}>
              {form.grade && <Text style={{ fontSize: 11, color: '#6b7280' }}>{L('patient.grade')} {form.grade}</Text>}
              {form.className && <Text style={{ fontSize: 11, color: '#6b7280' }}>{L('students.class3')} {form.className}</Text>}
              {form.classMentor && <Text style={{ fontSize: 11, color: '#6b7280' }}>{L('patient.homeroom2')} {form.classMentor}</Text>}
              {form.roomNumber && <Text style={{ fontSize: 11, color: '#6b7280' }}>{L('students.room3')} {form.roomNumber}{L('students.text')}</Text>}
            </View>
          )}
        </View>

        {/* 유형 선택 */}
        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>{L('patient.typeMultiple2')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {PATIENT_TYPES.map(t => {
              const selected = form.types.includes(t);
              const col = TYPE_COLOR[t];
              return (
                <TouchableOpacity
                  key={t}
                  style={{ backgroundColor: selected ? col.bg : '#f3f4f6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: selected ? col.text + '40' : '#e5e7eb' }}
                  onPress={() => toggleType(t)}
                >
                  <Text style={{ color: selected ? col.text : '#6b7280', fontSize: 12, fontWeight: '600' }}>{dataLabel(t)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 증상 */}
        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>{L('patient.symptomsCare')}</Text>
          <Text style={styles.formLabel}>{L('patient.symptoms2')}</Text>
          <TextInput
            value={form.symptom}
            onChangeText={v => setField('symptom', v)}
            placeholder={L('patient.enterSymptoms')}
            placeholderTextColor="#9ca3af"
            multiline
            style={[styles.formInput, { minHeight: 60 }]}
          />
          <Text style={[styles.formLabel, { marginTop: 8 }]}>{L('patient.care')}</Text>
          <TextInput
            value={form.treatment}
            onChangeText={v => setField('treatment', v)}
            placeholder={L('patient.careGiven')}
            placeholderTextColor="#9ca3af"
            multiline
            style={[styles.formInput, { minHeight: 60 }]}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>{L('patient.temperature')}</Text>
              <TextInput
                value={form.temperature}
                onChangeText={v => setField('temperature', v)}
                keyboardType="decimal-pad"
                placeholder="37.0"
                placeholderTextColor="#9ca3af"
                style={styles.formInput}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>{L('patient.quickMedication')}</Text>
              <TextInput
                value={form.medication}
                onChangeText={v => setField('medication', v)}
                placeholder={L('patient.tylenol')}
                placeholderTextColor="#9ca3af"
                style={styles.formInput}
              />
            </View>
          </View>
        </View>

        {/* 경과 */}
        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>{L('patient.progressStatus')}</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {PROGRESS_STATUSES.map(s => {
              const isActive = form.progressStatus === s;
              const col = PROGRESS_COLOR[s];
              return (
                <TouchableOpacity
                  key={s}
                  style={{ flex: 1, backgroundColor: isActive ? col.dot : '#f3f4f6', borderRadius: 8, padding: 6, alignItems: 'center' }}
                  onPress={() => setField('progressStatus', s)}
                >
                  <Text style={{ color: isActive ? '#fff' : '#6b7280', fontSize: 10, fontWeight: '700' }}>{dataLabel(s)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 격리방 */}
        {hasIsolation && (
          <View style={styles.formSection}>
            <Text style={styles.formSectionTitle}>{L('patient.isolationInfo')}</Text>
            <Text style={styles.formLabel}>{L('patient.isolationRoomNumber')}</Text>
            <TextInput
              value={form.isolationRoom}
              onChangeText={v => setField('isolationRoom', v)}
              placeholder="213"
              placeholderTextColor="#9ca3af"
              style={styles.formInput}
            />
          </View>
        )}

        {/* 약 스케줄 */}
        {hasMedType && (
          <View style={styles.formSection}>
            <Text style={styles.formSectionTitle}>{L('patient.medicationSchedule')}</Text>
            {form.medSchedules.map((sched, idx) => (
              <View key={idx} style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#c2410c' }}>{L('patient.med')}{idx + 1}</Text>
                  <TouchableOpacity onPress={() => setForm(f => ({ ...f, medSchedules: f.medSchedules.filter((_, i) => i !== idx) }))}>
                    <Ionicons name="close-circle" size={18} color="#f97316" />
                  </TouchableOpacity>
                </View>
                <TextInput
                  value={sched.name}
                  onChangeText={v => {
                    const updated = [...form.medSchedules];
                    updated[idx] = { ...updated[idx], name: v };
                    setField('medSchedules', updated);
                  }}
                  placeholder={L('patient.medicationNameEGTylenol2')}
                  placeholderTextColor="#9ca3af"
                  style={[styles.formInput, { marginBottom: 6 }]}
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {MEDICATION_TIMES.map(time => {
                    const selected = sched.times.includes(time);
                    return (
                      <TouchableOpacity
                        key={time}
                        style={{ backgroundColor: selected ? '#f97316' : '#fff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: selected ? '#f97316' : '#e5e7eb' }}
                        onPress={() => {
                          const updated = [...form.medSchedules];
                          const s = { ...updated[idx] };
                          s.times = s.times.includes(time) ? s.times.filter(t => t !== time) : [...s.times, time];
                          updated[idx] = s;
                          setField('medSchedules', updated);
                        }}
                      >
                        <Text style={{ color: selected ? '#fff' : '#374151', fontSize: 11, fontWeight: '600' }}>{dataLabel(time)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formLabel}>{L('patient.startDate')}</Text>
                    <TextInput
                      value={sched.startDate}
                      onChangeText={v => {
                        const updated = [...form.medSchedules];
                        updated[idx] = { ...updated[idx], startDate: v };
                        setField('medSchedules', updated);
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9ca3af"
                      style={styles.formInput}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formLabel}>{L('patient.endDate')}</Text>
                    <TextInput
                      value={sched.endDate}
                      onChangeText={v => {
                        const updated = [...form.medSchedules];
                        updated[idx] = { ...updated[idx], endDate: v };
                        setField('medSchedules', updated);
                      }}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor="#9ca3af"
                      style={styles.formInput}
                    />
                  </View>
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#fed7aa', borderRadius: 10, padding: 10, alignItems: 'center' }}
              onPress={addMedSchedule}
            >
              <Text style={{ color: '#f97316', fontSize: 12, fontWeight: '600' }}>{L('patient.addMedicationSchedule')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 메모 */}
        <View style={styles.formSection}>
          <Text style={styles.formLabel}>{L('common.memo')}</Text>
          <TextInput
            value={form.notes}
            onChangeText={v => setField('notes', v)}
            placeholder={L('patient.additionalNotes2')}
            placeholderTextColor="#9ca3af"
            multiline
            style={[styles.formInput, { minHeight: 60 }]}
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ==================== 스타일 ====================

// ==================== 부모연락 탭 (모바일) ====================

// ── 부모연락 상수 ─────────────────────────────────────────────
const REPORT_TYPE_OPTIONS_M: { id: ContactReportType; label: string; color: string }[] = [
  { id: '최초보고', get label() { return L('data.progFirstReport'); }, color: '#3b82f6' },
  { id: '경과보고', get label() { return L('patient.progressReport2'); }, color: '#f97316' },
  { id: '내원예정', get label() { return L('data.hospitalPlanned'); }, color: '#8b5cf6' },
  { id: '내원결과', get label() { return L('patient.hospitalResult'); }, color: '#6366f1' },
  { id: '완치보고', get label() { return L('patient.recoveryReport3'); }, color: '#22c55e' },
];

const METHOD_OPTIONS_M: { id: ContactMethod; label: string; emoji: string }[] = [
  { id: '통화',   get label() { return L('patient.call2'); },   emoji: '📞' },
  { id: '문자',   get label() { return L('data.reportText'); },   emoji: '💬' },
  { id: '카카오', get label() { return L('data.reportKakao'); }, emoji: '🟡' },
  { id: '기타',   get label() { return L('data.other'); },   emoji: '📝' },
];

// 부모연락 담당자: 지정된 담당자 > 반멘토 > '담임' 순서로 fallback
function getPresetSenderNameM(r: PatientRecord): string {
  return r.parentContactAssigneeName ?? r.classMentor ?? '담임';
}

// 복용약: medicationSchedules 약 이름 → medication 메모 → '없음' 순서로 fallback
function getPresetMedicationM(r: PatientRecord): string {
  const names = (r.medicationSchedules ?? [])
    .map(s => s.name?.trim())
    .filter((n): n is string => !!n);
  if (names.length > 0) return names.join(', ');
  const memo = r.medication?.trim();
  return memo || '없음';
}

// 값이 없거나 빈 문자열이면 '없음' 반환
function orFallbackM(value: string | undefined): string {
  return value?.trim() || '없음';
}

const SMS_PRESETS_M: { label: string; text: (r: PatientRecord) => string }[] = [
  {
    get label() { return L('patient.firstReport'); },
    text: (r) =>
`안녕하세요 어머님, ${getPresetSenderNameM(r)} 멘토입니다.\n\n증상: ${orFallbackM(r.symptom)}\n복용약: ${getPresetMedicationM(r)}\n조치: ${orFallbackM(r.treatment)}\n\n차도 없을 시 다시 연락드리겠습니다.`,
  },
  {
    get label() { return L('patient.progressReport'); },
    text: (r) =>
`안녕하세요 어머님, ${getPresetSenderNameM(r)} 멘토입니다.\n\n${r.studentName} 학생 상태가 많이 호전되었습니다.\n현재 정상적으로 생활하고 있으니 안심하세요.`,
  },
  {
    get label() { return L('patient.plannedVisit'); },
    text: (r) =>
`안녕하세요 어머님, ${getPresetSenderNameM(r)} 멘토입니다.\n\n${r.studentName} 학생 상태를 보다 정확히 확인하기 위해\n병원 진료를 받을 예정입니다.\n결과 확인 후 다시 연락드리겠습니다.`,
  },
  {
    get label() { return L('patient.visitResult'); },
    text: (r) =>
`안녕하세요 어머님, ${getPresetSenderNameM(r)} 멘토입니다.\n\n${r.studentName} 학생 병원 진료 결과를 안내드립니다.\n진단명: (직접 입력)\n처방: (직접 입력)\n\n추가 사항은 연락드리겠습니다.`,
  },
  {
    get label() { return L('patient.recoveryReport2'); },
    text: (r) =>
`안녕하세요 어머님, ${getPresetSenderNameM(r)} 멘토입니다.\n\n${r.studentName} 학생이 완전히 회복하여 정상 생활 중입니다.\n걱정 끼쳐드려 죄송합니다. 감사합니다.`,
  },
];

function ParentContactSectionMobile({
  record, campUsers, campGroups, currentUserId, currentUserName, currentUserRole,
}: {
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
  const [saving, setSaving] = useState(false);

  // 담당자 지정
  const [showAssigneeSearch, setShowAssigneeSearch] = useState(false);
  const [assigneeSearch, setAssigneeSearch] = useState('');
  const [assigneeSaving, setAssigneeSaving] = useState(false);

  // 프리셋 패널
  const [presetTab, setPresetTab] = useState<'sms' | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const logs = record.parentContactLogs ?? [];
  const isCompleted = logs.some(l => l.isResolved);
  const effectiveAssigneeName = record.parentContactAssigneeName ?? record.classMentor ?? '';

  // 그룹 찾기 (웹과 동일 2단계 로직)
  const groupClassCodes = record.className ? getSameGroupClassCodes(campGroups, record.className) : [];
  const classMentorUser = campUsers.find(u => u.name === record.classMentor);
  const classMentorGroupKey = classMentorUser?.jobExperiences
    ?.find(je => je.classCode === record.className || je.groupRole === '담임')?.group ?? null;
  const sameGroupUsers: User[] = (() => {
    if (groupClassCodes.length > 0) return campUsers.filter(u => u.jobExperiences?.some(je => groupClassCodes.includes(je.classCode ?? '')));
    if (classMentorGroupKey) return campUsers.filter(u => u.jobExperiences?.some(je => je.group === classMentorGroupKey));
    return [];
  })();
  const groupManager = sameGroupUsers.find(u => u.jobExperiences?.some(je => je.groupRole === '매니저'));
  const groupSubManager = sameGroupUsers.find(u => u.jobExperiences?.some(je => je.groupRole === '부매니저') && u.userId !== groupManager?.userId);
  const campManager = campUsers.find(u => u.role === 'admin');
  const isManagerOfThisGroup = groupManager?.userId === currentUserId || groupSubManager?.userId === currentUserId;
  const canEditAssignee = currentUserRole === 'admin' || isManagerOfThisGroup || currentUserId === record.parentContactAssigneeId;

  const contactorOptions: { label: string; name: string }[] = [
    ...(record.classMentor ? [{ label: L('patient.classMentor2'), name: record.classMentor }] : []),
    ...(record.unitMentor && record.unitMentor !== record.classMentor ? [{ label: L('patient.roomMentor'), name: record.unitMentor }] : []),
    ...(groupManager ? [{ label: L('patient.groupManager'), name: groupManager.name }] : []),
    ...(groupSubManager && groupSubManager.name !== groupManager?.name ? [{ label: L('patient.groupSubManager'), name: groupSubManager.name }] : []),
    ...(campManager && campManager.name !== groupManager?.name && campManager.name !== groupSubManager?.name ? [{ label: L('patient.campManager'), name: campManager.name }] : []),
    ...(currentUserName && ![record.classMentor, record.unitMentor, groupManager?.name, groupSubManager?.name, campManager?.name].includes(currentUserName) ? [{ label: L('patient.myself'), name: currentUserName }] : []),
  ].filter((o, i, arr) => arr.findIndex(x => x.name === o.name) === i);

  // 검색어 있을 때만 드롭다운 표시
  const filteredUsers = campUsers.filter(u => u.name.includes(assigneeSearch.trim()));

  const handleRemoveLog = async (log: (typeof logs)[number]) => {
    Alert.alert(L('patient.deleteContactLog'), L('patient.deleteThisContactLog'), [
      { text: L('common.cancel'), style: 'cancel' },
      {
        text: L('common.delete'), style: 'destructive',
        onPress: async () => {
          try { await removeParentContactLog(db, record.id, log); }
          catch { Alert.alert(L('common.error'), L('task.anErrorOccurredWhileDeleting')); }
        },
      },
    ]);
  };

  const handleAddLog = async () => {
    const actor = contactorName || effectiveAssigneeName || currentUserName;
    setSaving(true);
    try {
      await addParentContactLog(db, record.id, {
        contactedBy: actor, contactedById: currentUserId, method, reportType,
        isResolved: reportType === '완치보고',
      });
      setContactorName(''); setShowLogForm(false);
    } finally { setSaving(false); }
  };

  const handleAssignee = async (u: User) => {
    setAssigneeSaving(true);
    try {
      await updateParentContactAssignee(db, record.id, u.userId, u.name);
      setShowAssigneeSearch(false); setAssigneeSearch('');
    } finally { setAssigneeSaving(false); }
  };

  const copyToClipboard = async (text: string, idx: number) => {
    try {
      // 예전에는 설치되지 않은 @react-native-clipboard 를 불러 늘 실패 → 알림창으로만 보였다
      await Clipboard.setStringAsync(text);
    } catch {
      Alert.alert(L('patient.textToCopy'), text, [{ text: L('common.close') }]);
    }
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
  };

  return (
    <View style={{ gap: 10 }}>
      {/* 담당자 지정 */}
      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: '#fbcfe8', backgroundColor: '#fdf2f8', padding: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#9d174d', flex: 1 }}>{L('patient.guardianContact')}</Text>
          {isCompleted && (
            <View style={{ backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 }}>
              <Text style={{ fontSize: 9, color: '#166534', fontWeight: '700' }}>{L('patient.recoveryReported')}</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#9d174d' }}>👤 {effectiveAssigneeName || L('data.unspecified')}</Text>
          {!record.parentContactAssigneeName && <Text style={{ fontSize: 10, color: '#f9a8d4' }}>{L('patient.classMentorByDefault')}</Text>}
          {canEditAssignee && (
            <TouchableOpacity onPress={() => setShowAssigneeSearch(v => !v)} style={{ marginLeft: 'auto' as any }}>
              <Text style={{ fontSize: 11, color: '#db2777' }}>{L('patient.change')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {showAssigneeSearch && (
          <View>
            <TextInput value={assigneeSearch} onChangeText={setAssigneeSearch}
              placeholder={L('students.searchByName')} placeholderTextColor="#9ca3af"
              style={[styles.formInput, { borderColor: '#fbcfe8' }]} />
            {assigneeSearch.trim() && filteredUsers.slice(0, 6).map(u => (
              <TouchableOpacity key={u.userId} onPress={() => handleAssignee(u)} disabled={assigneeSaving}
                style={{ paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#fce7f3' }}>
                <Text style={{ fontSize: 12, color: '#111827' }}>{u.name} <Text style={{ color: '#9ca3af', fontSize: 10 }}>{u.role}</Text></Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* 프리셋 멘트 */}
      <View style={{ borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#fff', padding: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: '#374151' }}>{L('patient.presetMessage')}</Text>
            <Text style={{ fontSize: 10, color: '#9ca3af' }}>{L('patient.from')} <Text style={{ fontWeight: '700', color: '#db2777' }}>{effectiveAssigneeName || L('patient.homeroom')}</Text> {L('common.roleMentor')}</Text>
          </View>
          <TouchableOpacity onPress={() => setPresetTab(presetTab === 'sms' ? null : 'sms')}
            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1,
              borderColor: presetTab === 'sms' ? '#db2777' : '#e5e7eb',
              backgroundColor: presetTab === 'sms' ? '#db2777' : '#fff' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: presetTab === 'sms' ? '#fff' : '#6b7280' }}>{L('patient.textPresets')}</Text>
          </TouchableOpacity>
        </View>
        {presetTab === 'sms' && (
          <View style={{ gap: 8 }}>
            {SMS_PRESETS_M.map((p, i) => {
              const txt = p.text(record);
              return (
                <View key={i} style={{ borderRadius: 8, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#f3f4f6', padding: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#374151', flex: 1 }}>{p.label}</Text>
                    <TouchableOpacity onPress={() => copyToClipboard(txt, i)}
                      style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
                        backgroundColor: copiedIdx === i ? '#dcfce7' : '#fce7f3' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: copiedIdx === i ? '#166534' : '#db2777' }}>
                        {copiedIdx === i ? L('patient.copied') : L('task.copy2')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 10, color: '#4b5563', lineHeight: 16 }}>{txt}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* 연락 기록 */}
      {logs.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#9ca3af' }}>{L('patient.contactLog')}</Text>
          {[...logs].reverse().map((log, i) => {
            const rt = REPORT_TYPE_OPTIONS_M.find(r => r.id === log.reportType);
            const mt = METHOD_OPTIONS_M.find(m => m.id === log.method);
            // 삭제 권한: 기록 추가한 본인 또는 admin
            const canDelete = currentUserRole === 'admin' || log.contactedById === currentUserId;
            return (
              <View key={i} style={{ backgroundColor: '#fff', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#f3f4f6' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                  {rt && (
                    <View style={{ backgroundColor: rt.color, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 9, color: '#fff', fontWeight: '700' }}>{dataLabel(log.reportType)}</Text>
                    </View>
                  )}
                  <View style={{ borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
                    backgroundColor: log.method === '통화' ? '#eff6ff' : log.method === '문자' ? '#fdf2f8' : log.method === '카카오' ? '#fefce8' : '#f9fafb' }}>
                    <Text style={{ fontSize: 9, fontWeight: '700',
                      color: log.method === '통화' ? '#1d4ed8' : log.method === '문자' ? '#be185d' : log.method === '카카오' ? '#854d0e' : '#4b5563' }}>
                      {mt?.emoji ?? '📝'} {log.method ?? L('data.other')}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#374151', flex: 1 }}>{log.contactedBy}</Text>
                  <Text style={{ fontSize: 9, color: '#9ca3af' }}>{formatDate(log.contactedAt)}</Text>
                  {canDelete && (
                    <TouchableOpacity onPress={() => handleRemoveLog(log)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ fontSize: 12, color: '#f87171' }}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {log.isResolved && <Text style={{ fontSize: 10, color: '#16a34a', fontWeight: '700' }}>{L('patient.recoveryReport')}</Text>}
              </View>
            );
          })}
        </View>
      )}

      {/* 연락 기록 추가 */}
      {!isCompleted && (
        <>
          <TouchableOpacity style={{ paddingVertical: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#f9a8d4', borderRadius: 10, alignItems: 'center' }}
            onPress={() => setShowLogForm(true)}>
            <Text style={{ color: '#db2777', fontSize: 12, fontWeight: '600' }}>{L('patient.addContactLog2')}</Text>
          </TouchableOpacity>

          {showLogForm && (
            <TabFormModalMobile
              title={L('patient.addContactLog')}
              icon="📞"
              onClose={() => setShowLogForm(false)}
              onSubmit={handleAddLog}
              submitLabel={saving ? L('task.saving') : L('common.save')}
              submitColor="#db2777"
            >
              {/* ① 보고 유형 */}
              <View>
                <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{L('patient.reportType')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {REPORT_TYPE_OPTIONS_M.map(rt => (
                    <TouchableOpacity key={rt.id} onPress={() => setReportType(rt.id)}
                      style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: reportType === rt.id ? rt.color : '#f3f4f6' }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: reportType === rt.id ? '#fff' : '#6b7280' }}>{rt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* ② 연락한 사람 */}
              <View>
                <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{L('patient.personContacted')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {contactorOptions.map(opt => (
                    <TouchableOpacity key={opt.name} onPress={() => setContactorName(prev => prev === opt.name ? '' : opt.name)}
                      style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: contactorName === opt.name ? '#db2777' : '#f3f4f6' }}>
                      <Text style={{ fontSize: 11, color: contactorName === opt.name ? '#fff' : '#6b7280', fontWeight: '600' }}>
                        {opt.label} {opt.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {contactorName ? <Text style={{ fontSize: 10, color: '#db2777', marginTop: 3 }}>✓ {contactorName}</Text> : null}
              </View>

              {/* ③ 연락 방법 */}
              <View>
                <Text style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>{L('patient.contactMethod')}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {METHOD_OPTIONS_M.map(m => (
                    <TouchableOpacity key={m.id} onPress={() => setMethod(m.id)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: method === m.id ? '#db2777' : '#f3f4f6' }}>
                      <Text style={{ fontSize: 12 }}>{m.emoji}</Text>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: method === m.id ? '#fff' : '#6b7280' }}>{dataLabel(m.label)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </TabFormModalMobile>
          )}
        </>
      )}
    </View>
  );
}

// ==================== 최초보고 모달 (모바일) ====================

interface QuickReportFormMobile {
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
  temperature: string;
  fever: string;
  locationMode: LocationMode; // 현재 위치 모드 (일과중 / 휴식 / 격리)
  location: string;
  actionNote: string;
  /** 선택한 증상 목록 (복수) — symptom은 이 배열을 합친 표시 문자열 */
  symptoms?: string[];
  /** 복통 위치 (복수) */
  abdominalPainSites?: string[];
  /** 약 복용 기록 (재고 연동) */
  doses?: MedicationDose[];
}

function QuickReportModalMobile({
  students, reporterName, onClose, onSubmit,
}: {
  students: STSheetStudent[];
  reporterName: string;
  onClose: () => void;
  onSubmit: (form: QuickReportFormMobile) => Promise<void>;
}) {
  const [form, setForm] = useState<QuickReportFormMobile>({
    studentId: '', studentName: '', grade: '', className: '',
    classMentor: '', unitMentor: '', roomNumber: '',
    types: ['처치전'], symptom: '', treatment: '', temperature: '', fever: '', locationMode: '일과중', location: '', actionNote: '',
  });
  const setField = <K extends keyof QuickReportFormMobile>(k: K, v: QuickReportFormMobile[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const [studentSearch, setStudentSearch] = useState('');
  const [studentLocked, setStudentLocked] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  // 증상 검색 · 복수 선택
  const [symptomSearch, setSymptomSearch] = useState('');
  const [selectedGuides, setSelectedGuides] = useState<SymptomGuide[]>([]);
  // 복통 위치 (증상에 복통이 있을 때만, 복수 선택)
  const [painSites, setPainSites] = useState<string[]>([]);
  // 약 복용 (재고 연동)
  const [doses, setDoses] = useState<MedicationDose[]>([]);
  const inventory = usePatientInventory();

  const [actionStatus, setActionStatus] = useState<QuickActionId>('직접조치');
  const [feverLevel, setFeverLevel] = useState<'normal' | 'slight' | 'high'>('normal');
  const [showFeverGuide, setShowFeverGuide] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const studentResults = useMemo(() => {
    const q = studentSearch.trim();
    if (!q) return [];
    return students.filter(s => s.name.includes(q)).slice(0, 8);
  }, [studentSearch, students]);

  const filteredGuides = useMemo(() => {
    const q = symptomSearch.trim();
    if (!q) return SYMPTOM_GUIDES;
    return SYMPTOM_GUIDES.filter(g => g.label.includes(q) || g.treatment.includes(q));
  }, [symptomSearch]);

  const selectStudent = (s: STSheetStudent) => {
    setForm(f => ({
      ...f,
      studentId: s.studentId,
      studentName: s.name,
      grade: s.grade ? `${s.grade}${s.gender ?? ''}` : '',
      className: s.className ?? '',
      classMentor: s.classMentor ?? '',
      unitMentor: s.unitMentor ?? '',
      roomNumber: s.roomNumber ?? '',
    }));
    setStudentSearch(s.name);
    setStudentLocked(true);
    setShowDropdown(false);
  };

  // 프리셋 토글 (복수 선택). 처치는 선택한 증상들의 기본 처치를 이어 붙임
  const selectGuide = (guide: SymptomGuide) => {
    const has = selectedGuides.some(g => g.label === guide.label);
    const next = has ? selectedGuides.filter(g => g.label !== guide.label) : [...selectedGuides, guide];
    setSelectedGuides(next);
    setForm(f => ({ ...f, treatment: next.map(g => g.treatment).join(' / ') }));
    if (!next.some(g => g.label.includes('복통'))) setPainSites([]);
  };

  // 선택 증상 + 직접 입력(쉼표 구분) → 배열
  const symptomList = useMemo(() => {
    const custom = form.symptom.split(',').map(s => s.trim()).filter(Boolean);
    return [...selectedGuides.map(g => g.label), ...custom];
  }, [selectedGuides, form.symptom]);
  const showPainSites = hasAbdominalPain(symptomList);
  const togglePainSite = (site: string) =>
    setPainSites(prev => prev.includes(site) ? prev.filter(s => s !== site) : [...prev, site]);

  const canSubmit = !!form.studentName && symptomList.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    if (doses.some(d => !d.itemId || !d.groupId)) { Alert.alert(L('patient.checkNeeded'), L('patient.inMedicationSupplyUseSelect')); return; }
    setSubmitting(true);
    try {
      const feverLabel = feverLevel === 'normal' ? '정상' : feverLevel === 'slight' ? '미열' : '고열';
      const temp = feverLevel === 'normal' ? '' : form.temperature;
      const sites = showPainSites ? painSites : [];
      await onSubmit({
        ...form,
        symptom: formatSymptomText(symptomList, sites),
        symptoms: symptomList,
        abdominalPainSites: sites,
        doses: doses.filter(d => d.itemId && d.quantity > 0).map(d => ({ ...d, source: 'initial' as const })),
        temperature: temp,
        fever: feverLabel,
        actionNote: [`[${actionStatus}]`, form.actionNote.trim()].filter(Boolean).join(' '),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 16 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxHeight: '90%', overflow: 'hidden' }}>
      {/* 헤더 */}
      <View style={[styles.modalHeader, { borderTopLeftRadius: 16, borderTopRightRadius: 16 }]}>
        <View>
          <Text style={styles.modalTitle}>{L('patient.firstPatientReport')}</Text>
          <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{L('patient.reporter')} {reporterName}</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
          <Ionicons name="close" size={22} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12, gap: 14 }} keyboardShouldPersistTaps="handled">

        {/* ① 대상 */}
        <View>
          <Text style={styles.formSectionTitle}>{L('patient.student')}</Text>
          <View style={{ position: 'relative' }}>
            <TextInput
              value={studentSearch || form.studentName}
              onChangeText={v => { if (!studentLocked) { setStudentSearch(v); setShowDropdown(true); } }}
              editable={!studentLocked}
              placeholder={L('patient.searchByName')}
              placeholderTextColor="#9ca3af"
              style={[styles.formInput, studentLocked && { backgroundColor: '#f9fafb', fontWeight: '600' }]}
            />
          </View>
          {studentLocked && (
            <TouchableOpacity onPress={() => {
              setStudentLocked(false); setStudentSearch('');
              setForm(f => ({ ...f, studentId: '', studentName: '', grade: '', className: '', classMentor: '', unitMentor: '', roomNumber: '' }));
            }}>
              <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{L('patient.change')}</Text>
            </TouchableOpacity>
          )}
          {/* 드롭다운 */}
          {showDropdown && studentResults.length > 0 && !studentLocked && (
            <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginTop: 4, overflow: 'hidden' }}>
              {studentResults.map(s => (
                <TouchableOpacity key={s.studentId} style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#f9fafb' }} onPress={() => selectStudent(s)}>
                  <Text style={{ fontWeight: '600', color: '#111827' }}>{s.name}</Text>
                  <Text style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    {s.grade}{s.gender} · {fmtClassM(s.className ?? '')} · {s.roomNumber}{L('students.text')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          {/* 선택된 학생 정보 칩 */}
          {studentLocked && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {form.grade && <View style={{ backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 }}><Text style={{ fontSize: 11, color: '#4b5563' }}>{form.grade}</Text></View>}
              {form.className && <View style={{ backgroundColor: '#eff6ff', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 }}><Text style={{ fontSize: 11, color: '#1d4ed8' }}>{fmtClassM(form.className)}</Text></View>}
              {form.roomNumber && <View style={{ backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 }}><Text style={{ fontSize: 11, color: '#4b5563' }}>{form.roomNumber}{L('students.text')}</Text></View>}
              {form.classMentor && <View style={{ backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 }}><Text style={{ fontSize: 11, color: '#15803d' }}>{L('patient.homeroom')} {form.classMentor}</Text></View>}
            </View>
          )}
        </View>

        {/* ② 현재 위치 */}
        <View>
          <Text style={styles.formSectionTitle}>{L('patient.currentLocation')}</Text>
          {/* 위치 모드 버튼 */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {([
              { id: '일과중' as LocationMode, emoji: '🏃', activeColor: '#3b82f6' },
              { id: '휴식'   as LocationMode, emoji: '😴', activeColor: '#f59e0b' },
              { id: '격리'   as LocationMode, emoji: '🏠', activeColor: '#8b5cf6' },
            ] as const).map(opt => {
              const selected = form.locationMode === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => setField('locationMode', opt.id)}
                  style={{
                    flex: 1,
                    flexDirection: 'column',
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: selected ? opt.activeColor : '#e5e7eb',
                    backgroundColor: selected ? opt.activeColor : '#fff',
                    gap: 2,
                  }}
                >
                  <Text style={{ fontSize: 18 }}>{opt.emoji}</Text>
                  <Text style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: selected ? '#fff' : '#6b7280',
                  }}>{opt.id}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            value={form.location}
            onChangeText={v => setField('location', v)}
            placeholder={
              form.locationMode === '휴식' ? L('patient.eGRoom110Lounge') :
              form.locationMode === '격리' ? L('patient.eGIsolationRoom214') :
              L('patient.eGAuditoriumGymClassroom')
            }
            placeholderTextColor="#9ca3af"
            style={styles.formInput}
          />
          <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>{L('patient.itMayNotBeTheir')}</Text>
        </View>

        {/* ③ 열감 */}
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={styles.formSectionTitle}>{L('patient.fever')}</Text>
            <TouchableOpacity onPress={() => setShowFeverGuide(v => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 11, color: '#3b82f6', fontWeight: '500' }}>{L('patient.howToUseTheThermometer')} {showFeverGuide ? '▲' : '▼'}</Text>
            </TouchableOpacity>
          </View>

          {/* 체온계 가이드 (토글) */}
          {showFeverGuide && (
            <View style={{ marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', padding: 12, gap: 8 }}>
              {[
                { n: '1️⃣', t: L('patient.pressThePowerButton') },
                { n: '2️⃣', t: L('patient.whenLCBlinksOn') },
                { n: '3️⃣', t: L('patient.placeTheThermometerAgainstBare') },
                { n: '4️⃣', t: L('patient.measurementIsDoneWhenThe') },
              ].map(({ n, t }) => (
                <View key={n} style={{ flexDirection: 'row', gap: 8 }}>
                  <Text style={{ fontSize: 13 }}>{n}</Text>
                  <Text style={{ fontSize: 11, color: '#374151', flex: 1, lineHeight: 17 }}>{t}</Text>
                </View>
              ))}
              <View style={{ borderRadius: 8, backgroundColor: '#fefce8', borderWidth: 1, borderColor: '#fef08a', padding: 10, marginTop: 4 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400e', marginBottom: 4 }}>{L('patient.alsoCheck')}</Text>
                <Text style={{ fontSize: 11, color: '#92400e', lineHeight: 16 }}>{L('patient.alsoFeelTheForeheadAnd4')}</Text>
              </View>
            </View>
          )}

          {/* 열감 단계 선택 */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {([
              { id: 'normal' as const, label: L('data.feverNormal'),  sub: FEVER_LEVEL_RANGES.정상, activeColor: '#22c55e' },
              { id: 'slight' as const, label: L('data.feverSlight'),  sub: FEVER_LEVEL_RANGES.미열, activeColor: '#f97316' },
              { id: 'high'   as const, label: L('data.feverHigh'),  sub: FEVER_LEVEL_RANGES.고열, activeColor: '#ef4444' },
            ]).map(opt => {
              const selected = feverLevel === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => {
                    if (opt.id === 'normal') { setFeverLevel('normal'); setField('temperature', ''); }
                    else if (opt.id === 'slight') {
                      setFeverLevel('slight');
                      if (form.temperature && classifyFever(form.temperature) !== '미열') setField('temperature', ''); // 재지 않았으면 비워 둔다 (열감만 기록)
                    } else {
                      setFeverLevel('high');
                      if (form.temperature && classifyFever(form.temperature) !== '고열') setField('temperature', '');
                    }
                  }}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: selected ? opt.activeColor : '#e5e7eb', backgroundColor: selected ? opt.activeColor : '#fff' }}
                >
                  <Text style={{ fontWeight: '700', fontSize: 13, color: selected ? '#fff' : '#6b7280' }}>{opt.label}</Text>
                  <Text style={{ fontSize: 9, color: selected ? 'rgba(255,255,255,0.8)' : '#9ca3af', marginTop: 2 }}>{opt.sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 정상이 아닐 때 수치 입력 */}
          {feverLevel !== 'normal' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, position: 'relative' }}>
                <TextInput
                  value={form.temperature}
                  onChangeText={v => {
                    setField('temperature', v);
                    const level = classifyFever(v);
                    if (level === '고열') setFeverLevel('high');
                    else if (level === '미열') setFeverLevel('slight');
                  }}
                  placeholder={L('patient.measuredTemperatureEG37')}
                  placeholderTextColor="#9ca3af"
                  keyboardType="decimal-pad"
                  style={[styles.formInput, { paddingRight: 36 }]}
                />
                <Text style={{ position: 'absolute', right: 12, top: 10, fontSize: 12, color: '#9ca3af' }}>°C</Text>
              </View>
              <View style={{ borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: feverLevel === 'high' ? '#fef2f2' : '#fff7ed' }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: feverLevel === 'high' ? '#dc2626' : '#ea580c' }}>
                  {feverLevel === 'high' ? L('patient.highFever') : L('patient.mildFever')}
                </Text>
              </View>
            </View>
          )}

          {/* 정상 시 추가 확인 안내 */}
          {feverLevel === 'normal' && (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', padding: 12, marginTop: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400e', marginBottom: 4 }}>{L('patient.normalTemperaturePleaseCheckThe')}</Text>
              <Text style={{ fontSize: 11, color: '#92400e', lineHeight: 16 }}>
                {L('patient.alsoFeelTheForeheadAnd3')}{'\n'}
                {L('patient.ifItSColdOutside')}
              </Text>
            </View>
          )}
        </View>

        {/* ④ 증상 */}
        <View>
          <Text style={styles.formSectionTitle}>{L('patient.symptoms3')}</Text>

          {/* 프리셋 검색 */}
          <TextInput
            value={symptomSearch}
            onChangeText={setSymptomSearch}
            placeholder={L('patient.searchSymptomsHeadacheStomachacheFever')}
            placeholderTextColor="#9ca3af"
            style={[styles.formInput, { marginBottom: 8 }]}
          />

          <Text style={{ fontSize: 10, color: '#9ca3af', marginBottom: 6 }}>{L('patient.selectAllSymptomsThatApply')}</Text>

          {/* 프리셋 그리드 */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {filteredGuides.map(guide => {
              const isSelected = selectedGuides.some(g => g.label === guide.label);
              const isEmg = guide.category === '응급';
              return (
                <TouchableOpacity
                  key={guide.label}
                  onPress={() => selectGuide(guide)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 4,
                    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1,
                    borderColor: isSelected ? (isEmg ? '#ef4444' : '#3b82f6') : (isEmg ? '#fecaca' : '#e5e7eb'),
                    backgroundColor: isSelected ? (isEmg ? '#ef4444' : '#3b82f6') : (isEmg ? '#fef2f2' : '#f9fafb'),
                  }}
                >
                  <Text style={{ fontSize: 13 }}>{guide.emoji}</Text>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: isSelected ? '#fff' : (isEmg ? '#dc2626' : '#374151') }}>{guide.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 복통 위치 — 증상에 복통이 있을 때만 (복수 선택) */}
          {showPainSites && (
            <View style={{ borderRadius: 12, borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', padding: 10, marginBottom: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400e', marginBottom: 6 }}>{L('patient.stomachPainLocation')} <Text style={{ fontWeight: '400', color: '#b45309' }}>{L('patient.selectAllThatApply')}</Text></Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {ABDOMINAL_PAIN_SITES.map(site => {
                  const on = painSites.includes(site);
                  return (
                    <TouchableOpacity key={site} onPress={() => togglePainSite(site)}
                      style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: on ? '#f59e0b' : '#fde68a', backgroundColor: on ? '#f59e0b' : '#fff' }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: on ? '#fff' : '#92400e' }}>{dataLabel(site)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* 선택된 가이드 → 조치 미리보기 (선택한 증상마다) */}
          {selectedGuides.map(guide => (
            <View key={guide.label} style={{
              borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8,
              borderColor: guide.category === '응급' ? '#fca5a5' : '#bfdbfe',
              backgroundColor: guide.category === '응급' ? '#fef2f2' : '#eff6ff',
            }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827', marginBottom: 6 }}>{guide.emoji} {guide.label} {L('patient.care2')}</Text>
              <Text style={{ fontSize: 11, color: '#374151', marginBottom: 4 }}>🩺 {guide.treatment}</Text>
              {guide.medication !== '(약 불필요)' && (
                <Text style={{ fontSize: 11, color: '#ea580c', marginBottom: 4 }}>💊 {guide.medication}</Text>
              )}
              {guide.notes && (
                <Text style={{ fontSize: 11, fontWeight: '600', color: guide.category === '응급' ? '#dc2626' : '#b45309' }}>⚠️ {guide.notes}</Text>
              )}
            </View>
          ))}

          {/* 직접 입력 (프리셋에 없는 증상 추가, 쉼표로 여러 개) */}
          <TextInput
            value={form.symptom}
            onChangeText={v => setField('symptom', v)}
            placeholder={L('patient.ifNotInThePresets')}
            placeholderTextColor="#9ca3af"
            style={styles.formInput}
          />
          {symptomList.length > 0 && (
            <Text style={{ fontSize: 10, color: '#2563eb', marginTop: 4 }}>{L('patient.selectedSymptoms')} {formatSymptomText(symptomList, showPainSites ? painSites : [])}</Text>
          )}
        </View>

        {/* ⑤ 현재 상태 */}
        <View>
          <Text style={styles.formSectionTitle}>{L('patient.currentStatus')}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            {QUICK_ACTION_OPTIONS.map(opt => {
              const isSelected = actionStatus === opt.id;
              return (
                <TouchableOpacity
                  key={opt.id}
                  onPress={() => setActionStatus(opt.id)}
                  style={{
                    flex: 1, paddingVertical: 14, paddingHorizontal: 8, borderRadius: 12, alignItems: 'center',
                    borderWidth: 1.5, borderColor: isSelected ? opt.color : '#e5e7eb',
                    backgroundColor: isSelected ? opt.color : '#fff',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#fff' : '#374151', marginBottom: 3 }}>{opt.label}</Text>
                  <Text style={{ fontSize: 10, color: isSelected ? 'rgba(255,255,255,0.8)' : '#9ca3af', textAlign: 'center' }}>{opt.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            value={form.actionNote}
            onChangeText={v => setField('actionNote', v)}
            placeholder={ACTION_NOTE_PLACEHOLDER}
            placeholderTextColor="#9ca3af"
            multiline
            textAlignVertical="top"
            style={[styles.formInput, { minHeight: 72, lineHeight: 18 }]}
          />
          <Text style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, lineHeight: 14 }}>{ACTION_NOTE_EXAMPLE}</Text>
        </View>

        {/* ⑥ 약 복용 (실제로 먹인 경우) — 저장 시 재고 자동 차감 */}
        <View>
          <Text style={styles.formSectionTitle}>{L('patient.medicationSupplyUse')} <Text style={{ fontWeight: '400', color: '#9ca3af' }}>{L('patient.optional')}</Text></Text>
          <MedicationDoseEditorMobile
            doses={doses}
            onChange={setDoses}
            medicines={inventory.medicines}
            groups={inventory.groups}
            givenBy={reporterName}
            defaultGroupId={inventory.defaultGroupIdForClass(form.className)}
            history={inventory.dosesForStudent(form.studentId)}
            studentNote={inventory.studentNote(form.studentId)}
          />
        </View>

        {/* 여백 */}
        <View style={{ height: 8 }} />
      </ScrollView>

      {/* 하단 제출 버튼 */}
      <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#f3f4f6', backgroundColor: '#fff' }}>
        <TouchableOpacity onPress={handleSubmit} disabled={!canSubmit || submitting}
          style={{ borderRadius: 10, paddingVertical: 11, alignItems: 'center', backgroundColor: canSubmit && !submitting ? '#ef4444' : '#f3f4f6' }}>
          <Text style={{ fontWeight: '700', fontSize: 13, color: canSubmit && !submitting ? '#fff' : '#9ca3af' }}>
            {submitting ? L('patient.reporting') : L('patient.submitFirstReport')}
          </Text>
        </TouchableOpacity>
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerLeft: { flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  subHeaderSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  badge: { backgroundColor: '#ef4444', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  pillRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  pill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 10, fontWeight: '700' },
  emptySmall: { fontSize: 11, color: '#9ca3af' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  addBtnDisabled: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f3f4f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnDisabledText: { color: '#9ca3af', fontWeight: '700', fontSize: 13 },
  mainTabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingTop: 4 },
  mainTab: { flex: 1, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  mainTabActive: { borderBottomWidth: 2, borderBottomColor: '#ef4444' },
  mainTabText: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  mainTabTextActive: { color: '#ef4444' },
  tabBadge: { backgroundColor: '#f97316', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2, minWidth: 16, alignItems: 'center' },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  searchBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, gap: 6 },
  searchInput: { flex: 1, fontSize: 12, color: '#374151', padding: 0 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  emptyAction: { marginTop: 8, color: '#ef4444', fontWeight: '600', fontSize: 13 },
  resolvedSection: { marginTop: 8 },
  resolvedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f3f4f6', borderRadius: 12, padding: 12 },
  resolvedTitle: { fontSize: 13, fontWeight: '700', color: '#374151', flex: 1 },
  resolvedCount: { backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  resolvedCountText: { fontSize: 11, color: '#166534', fontWeight: '700' },
  classGroup: {},
  classGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  classGroupTitle: { fontSize: 13, fontWeight: '700', color: '#1f2937' },
  classGroupCount: { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  cardGrouped: { backgroundColor: '#fff', marginHorizontal: 8, marginBottom: 6, borderRadius: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowOffset: { width: 0, height: 1 }, shadowRadius: 3, elevation: 2 },
  cardMyRecord: { borderColor: '#bfdbfe' },
  cardDeleteBtn: { position: 'absolute', top: 8, right: 8, zIndex: 10, padding: 4 },
  deleteConfirmBox: { position: 'absolute', top: 6, right: 6, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  deleteConfirmBtn: { backgroundColor: '#ef4444', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  quickReportBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  quickReportBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12 },
  progressDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, flexShrink: 0 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  cardGrade: { fontSize: 11, color: '#9ca3af' },
  classBadge: { backgroundColor: '#eff6ff', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  classBadgeText: { color: '#1d4ed8', fontSize: 10 },
  roomText: { fontSize: 11, color: '#9ca3af' },
  managerBadge: { backgroundColor: '#e0e7ff', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  managerBadgeText: { color: '#4338ca', fontSize: 9, fontWeight: '700' },
  cardSymptom: { fontSize: 12, color: '#4b5563', marginTop: 2 },
  cardTagRow: { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  typeTag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  typeTagText: { fontSize: 10, fontWeight: '600' },
  progressBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  progressBadgeText: { fontSize: 10, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  cardMetaText: { fontSize: 10, color: '#9ca3af' },
  cardMetaDot: { fontSize: 10, color: '#d1d5db' },
  cardExpanded: { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 14 },
  detailRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  detailLabel: { fontSize: 11, color: '#9ca3af', width: 32, flexShrink: 0 },
  detailValue: { fontSize: 11, color: '#374151', flex: 1 },
  tabRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#3b82f6' },
  tabText: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },
  tabTextActive: { color: '#3b82f6' },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f97316' },
  tabContent: { padding: 12 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editBtn: { flex: 1, backgroundColor: '#f3f4f6', borderRadius: 8, padding: 8, alignItems: 'center' },
  editBtnText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  deleteBtn: { flex: 1, backgroundColor: '#fef2f2', borderRadius: 8, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#fecaca' },
  deleteBtnText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
  progressBtnRow: { flexDirection: 'row', gap: 4 },
  progressBtn: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 6, alignItems: 'center', backgroundColor: '#f9fafb' },
  progressBtnText: { fontSize: 10, fontWeight: '700', color: '#9ca3af' },
  managerSection: { backgroundColor: '#eef2ff', borderRadius: 12, padding: 12 },
  managerCheckBtn: { backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#c7d2fe' },
  managerCheckBtnDone: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  managerCheckBtnText: { fontSize: 11, fontWeight: '700', color: '#4f46e5' },
  medHeader: { backgroundColor: '#fff', padding: 14, borderWidth: 1, borderColor: '#fed7aa' },
  medCard: { backgroundColor: '#fff', borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 8 },
  medTimeBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#e5e7eb' },
  medTimeBtnDone: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  medTimeBtnText: { fontSize: 11, fontWeight: '600', color: '#374151' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fff' },
  modalTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  modalSaveBtn: { backgroundColor: '#ef4444', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  modalSaveBtnDisabled: { backgroundColor: '#d1d5db' },
  modalSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  formSection: { backgroundColor: '#fff', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#f3f4f6' },
  formSectionTitle: { fontSize: 12, fontWeight: '700', color: '#1f2937', marginBottom: 8 },
  formLabel: { fontSize: 10, fontWeight: '600', color: '#6b7280', marginBottom: 3 },
  formInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, color: '#111827', backgroundColor: '#fff' },
});
