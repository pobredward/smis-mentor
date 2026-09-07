'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Timestamp } from 'firebase/firestore';
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
  updateProgressStatus,
  updateManagerCheck,
  addIsolationCheckSchedule,
  completeIsolationCheckSchedule,
  updateReturnCriteriaChecks,
  MEDICATION_TIMES,
  PATIENT_TYPES,
  PROGRESS_STATUSES,
  HOSPITAL_STATUSES,
  RETURN_CRITERIA_LABELS,
} from '@smis-mentor/shared';
import type {
  PatientRecord,
  PatientType,
  MedicationSchedule,
  HospitalVisitEntry,
  MedicationTime,
  ProgressStatus,
  HospitalStatus,
  ManagerCheck,
  IsolationCheckSchedule,
  HospitalBilling,
  BillingMethod,
} from '@smis-mentor/shared';
import jobCodesService from '../services/jobCodesService';
import { stSheetService } from '../services/stSheet';
import { STSheetStudent, CampCode } from '@smis-mentor/shared';

// ==================== 상수 ====================

const PROGRESS_COLOR: Record<ProgressStatus, { bg: string; text: string; dot: string }> = {
  최초보고: { bg: '#f3f4f6', text: '#374151', dot: '#9ca3af' },
  조치완료: { bg: '#eff6ff', text: '#1d4ed8', dot: '#60a5fa' },
  호전중:   { bg: '#fef9c3', text: '#92400e', dot: '#facc15' },
  완치:     { bg: '#dcfce7', text: '#166534', dot: '#22c55e' },
};

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

function makeMedTimeKey(time: MedicationTime, dateStr: string): string {
  return `${time}_${dateStr.replace(/-/g, '')}`;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isInDateRange(start: string, end: string, date: string): boolean {
  return date >= start && date <= end;
}

function calcTotalDoses(sched: MedicationSchedule): number {
  if (!sched.startDate || !sched.endDate || sched.times.length === 0) return 0;
  const start = new Date(sched.startDate);
  const end = new Date(sched.endDate);
  const days = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
  return days * sched.times.length;
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
  const [today] = useState(todayStr());
  // 주 탭: 현황 / 약복용명단
  const [mainTab, setMainTab] = useState<'현황' | '약복용명단'>('현황');
  // 내 유닛/반 필터
  const [myFilter, setMyFilter] = useState<'전체' | '내유닛' | '내반'>('전체');

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

  // 현재 환자 / 완치 분리
  const activeRecords = useMemo(() =>
    records.filter(r => r.progressStatus !== '완치'), [records]);
  const resolvedRecords = useMemo(() =>
    records.filter(r => r.progressStatus === '완치'), [records]);

  // 내 유닛/반 필터
  const filterByMyUnit = useCallback((list: PatientRecord[]) => {
    if (myFilter === '전체') return list;
    const myName = userData?.name;
    if (!myName) return list;
    if (myFilter === '내유닛') return list.filter(r => r.unitMentor === myName || r.assigneeName === myName);
    if (myFilter === '내반') return list.filter(r => r.classMentor === myName);
    return list;
  }, [myFilter, userData?.name]);

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

  const filteredResolved = useMemo(() =>
    filterByMyUnit(filterBySearch(resolvedRecords)), [resolvedRecords, filterBySearch, filterByMyUnit]);

  // 오늘 약 복용 명단
  const medicationRecords = useMemo(() => {
    return filterByMyUnit(records.filter(r => {
      if (r.progressStatus === '완치') return false;
      return (r.medicationSchedules ?? []).some(s => isInDateRange(s.startDate, s.endDate, today));
    }));
  }, [records, today, filterByMyUnit]);

  const myPendingCount = useMemo(() =>
    records.filter(r => r.assigneeId === userData?.userId && r.progressStatus !== '완치').length,
    [records, userData?.userId]
  );

  const counts = useMemo(() => ({
    active: activeRecords.length,
    최초보고: activeRecords.filter(r => r.progressStatus === '최초보고').length,
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
      Alert.alert('입력 오류', '이름과 증상은 필수입니다.');
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
    Alert.alert('삭제 확인', `"${name}" 환자 기록을 삭제하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => deletePatientRecord(db, id) },
    ]);
  }, []);

  const handleProgressChange = useCallback(async (record: PatientRecord, status: ProgressStatus) => {
    if (!userData) return;
    await updateProgressStatus(db, record.id, status, userData.name);
  }, [userData]);

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
    else await addMedicationCheck(db, record.id, si, key, allSchedules);
  }, [today]);

  const handleSkipDate = useCallback(async (
    record: PatientRecord, si: number, isCurrentlySkip: boolean
  ) => {
    const allSchedules = Array.isArray(record.medicationSchedules) ? record.medicationSchedules : [];
    if (isCurrentlySkip) await removeSkipDate(db, record.id, si, today, allSchedules);
    else await addSkipDate(db, record.id, si, today, allSchedules);
  }, [today]);

  const handleIsolationCheck = useCallback(async (record: PatientRecord, idx: number, val: boolean) => {
    const current = record.isolationReturnChecks ?? [false, false, false];
    const updated = [...current];
    updated[idx] = val;
    await updateIsolationReturnChecks(db, record.id, updated);
    if (updated.every(Boolean) && userData) {
      await updateProgressStatus(db, record.id, '조치완료', userData.name);
    }
  }, [userData]);

  const handleReturnCriteriaCheck = useCallback(async (record: PatientRecord, idx: number, val: boolean) => {
    const current = record.returnCriteriaChecks ?? [false, false, false];
    const updated = [...current];
    updated[idx] = val;
    await updateReturnCriteriaChecks(db, record.id, updated);
    if (updated.every(Boolean) && userData && record.progressStatus !== '완치') {
      await updateProgressStatus(db, record.id, '호전중', userData.name, '복귀 기준 모두 충족');
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

  if (!activeJobCodeId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>활성 캠프를 선택해주세요.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerLeft}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>환자 관리</Text>
              {myPendingCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{myPendingCount}</Text>
                </View>
              )}
            </View>
            <View style={styles.pillRow}>
              {counts.최초보고 > 0 && <Pill label="최초보고" count={counts.최초보고} color="#6b7280" />}
              {counts.격리 > 0 && <Pill label="격리" count={counts.격리} color="#7c3aed" />}
              {counts.active === 0 && <Text style={styles.emptySmall}>현재 환자 없음</Text>}
            </View>
          </View>
          <TouchableOpacity style={styles.addBtn} onPress={openAddForm}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addBtnText}>추가</Text>
          </TouchableOpacity>
        </View>

        {/* 주 탭 */}
        <View style={styles.mainTabRow}>
          {(['현황', '약복용명단'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.mainTab, mainTab === tab && styles.mainTabActive]}
              onPress={() => setMainTab(tab)}
            >
              <Text style={[styles.mainTabText, mainTab === tab && styles.mainTabTextActive]}>
                {tab}
              </Text>
              {tab === '약복용명단' && medicationRecords.length > 0 && (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{medicationRecords.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 검색 + 필터 (현황 탭만) */}
      {mainTab === '현황' && (
        <View style={styles.filterBar}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={14} color="#9ca3af" />
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="이름·증상·반 검색"
              placeholderTextColor="#9ca3af"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={14} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.filterPills}>
            {(['전체', '내유닛', '내반'] as const).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterPill, myFilter === f && styles.filterPillActive]}
                onPress={() => setMyFilter(f)}
              >
                <Text style={[styles.filterPillText, myFilter === f && styles.filterPillTextActive]}>
                  {f === '전체' ? '전체' : f === '내유닛' ? '내 유닛' : '내 반'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* 콘텐츠 */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#ef4444" />
        </View>
      ) : mainTab === '약복용명단' ? (
        <MedicationListView
          records={medicationRecords}
          today={today}
          onCheck={(record, si, t, checked) => handleMedCheck(record, si, t, checked)}
          onSkipDate={(record, si, isSkip) => handleSkipDate(record, si, isSkip)}
        />
      ) : (
        <FlatList
          data={activeByClass}
          keyExtractor={([cls]) => cls}
          ListHeaderComponent={() => {
            const urgents = activeRecords.filter(r => urgencyScoreM(r) <= 1)
              .sort((a, b) => urgencyScoreM(a) - urgencyScoreM(b));
            if (!urgents.length) return null;
            return (
              <View style={{ margin: 12, marginBottom: 0, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#fca5a5' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fee2e2' }}>
                  <Text style={{ fontSize: 14 }}>🚨</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#991b1b' }}>긴급 주의 환자</Text>
                  <Text style={{ marginLeft: 'auto', fontSize: 11, color: '#ef4444' }}>{urgents.length}명</Text>
                </View>
                {urgents.map(record => (
                  <TouchableOpacity
                    key={record.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#fff5f5', borderTopWidth: 1, borderTopColor: '#fecaca' }}
                    onPress={() => setExpandedId(expandedId === record.id ? null : record.id)}
                    activeOpacity={0.7}
                  >
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: record.types.includes('격리') ? '#a855f7' : '#f97316' }} />
                    <Text style={{ fontWeight: '700', fontSize: 14, color: '#111827' }}>{record.studentName}</Text>
                    {record.grade && <Text style={{ fontSize: 11, color: '#9ca3af' }}>{record.grade}</Text>}
                    {record.className && (
                      <View style={{ backgroundColor: '#eff6ff', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, color: '#1d4ed8' }}>{fmtClassM(record.className)}</Text>
                      </View>
                    )}
                    <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      {record.types.includes('격리') && (
                        <View style={{ backgroundColor: '#f3e8ff', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, color: '#7e22ce', fontWeight: '700' }}>격리중</Text>
                        </View>
                      )}
                      {(record.hospitalVisits ?? []).some(v => v.hospitalStatus === '내원예정') && (
                        <View style={{ backgroundColor: '#fff7ed', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                          <Text style={{ fontSize: 10, color: '#c2410c', fontWeight: '700' }}>내원예정</Text>
                        </View>
                      )}
                      {record.assigneeName && (
                        <Text style={{ fontSize: 10, color: '#9ca3af' }}>담당: {record.assigneeName}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            );
          }}
          renderItem={({ item: [className, classRecords] }) => (
            <ClassGroup
              className={className}
              records={classRecords}
              today={today}
              currentUserId={userData?.userId ?? ''}
              currentUserName={userData?.name ?? ''}
              expandedId={expandedId}
              onToggleExpand={(id) => setExpandedId(expandedId === id ? null : id)}
              onEdit={openEditForm}
              onDelete={(id, name) => handleDelete(id, name)}
              onProgressChange={(record, s) => handleProgressChange(record, s)}
              onMedCheck={(record, si, t, checked) => handleMedCheck(record, si, t, checked)}
              onIsolationCheck={(record, i, v) => handleIsolationCheck(record, i, v)}
              onManagerCheck={(record, memo) => handleManagerCheck(record, memo)}
              onAddHospitalVisit={(record) => handleAddHospitalVisit(record)}
              onUpdateHospitalVisit={(record, visits) => handleUpdateHospitalVisit(record, visits)}
              onAddIsolationCheckSchedule={(record, min) => handleAddIsolationCheckSchedule(record, min)}
              onCompleteIsolationCheck={(record, id, temp, status, note) => handleCompleteIsolationCheck(record, id, temp, status, note)}
              onReturnCriteriaCheck={(record, i, v) => handleReturnCriteriaCheck(record, i, v)}
            />
          )}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>현재 환자가 없습니다.</Text>
              <TouchableOpacity onPress={openAddForm}>
                <Text style={styles.emptyAction}>기록 추가하기</Text>
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
                <Text style={styles.resolvedTitle}>완치 기록</Text>
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
                  isExpanded={expandedId === record.id}
                  onToggleExpand={() => setExpandedId(expandedId === record.id ? null : record.id)}
                  onEdit={() => openEditForm(record)}
                  onDelete={() => handleDelete(record.id, record.studentName)}
                  onProgressChange={(s) => handleProgressChange(record, s)}
                  onMedCheck={(si, t, checked) => handleMedCheck(record, si, t, checked)}
                  onIsolationCheck={(i, v) => handleIsolationCheck(record, i, v)}
                  onManagerCheck={(memo) => handleManagerCheck(record, memo)}
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
  name === '반 미배정' || name.endsWith('반') ? name : `${name}반`;

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
  if ((r.hospitalVisits ?? []).some(v => v.hospitalStatus === '내원예정')) return 1;
  if (r.progressStatus === '최초보고') return 2;
  if (r.types.includes('병원내원')) return 3;
  if (r.progressStatus === '조치완료') return 4;
  if (r.progressStatus === '호전중') return 5;
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
  records, today, onCheck, onSkipDate,
}: {
  records: PatientRecord[];
  today: string;
  onCheck: (record: PatientRecord, si: number, t: MedicationTime, checked: boolean) => void;
  onSkipDate: (record: PatientRecord, si: number, isCurrentlySkip: boolean) => void;
}) {
  // 선택된 시간대 필터 (null = 전체)
  const [selectedTime, setSelectedTime] = useState<MedicationTime | null>(null);

  if (records.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={{ fontSize: 40, marginBottom: 8 }}>💊</Text>
        <Text style={styles.emptyText}>오늘 복용 예정 약이 없습니다.</Text>
      </View>
    );
  }

  // 시간대별 진행률 계산
  const calcTimeProgress = (time: MedicationTime) => {
    let total = 0, done = 0;
    records.forEach(r => {
      (r.medicationSchedules ?? []).forEach(sched => {
        if (!isInDateRange(sched.startDate, sched.endDate, today)) return;
        if (!sched.times.includes(time)) return;
        if ((sched.skipDates ?? []).includes(today)) return; // 휴약일 제외
        total++;
        if (sched.checkedTimes.includes(makeMedTimeKey(time, today))) done++;
      });
    });
    return { total, done, allDone: total > 0 && done === total, none: total === 0 };
  };

  const recordsWithTimes = (filterTimes: MedicationTime[]) =>
    records.filter(r =>
      (r.medicationSchedules ?? []).some(sched =>
        isInDateRange(sched.startDate, sched.endDate, today) &&
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

  const roomLabel = selectedTime && ROOM_TIMES_M.includes(selectedTime) ? selectedTime : '기상후 · 취침전';
  const classLabel = selectedTime && CLASS_TIMES_M.includes(selectedTime) ? selectedTime : '조식후 · 중식후 · 석식후';

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      {/* 시간대별 현황 헤더 */}
      <View style={[styles.medHeader, { margin: 12, borderRadius: 12, padding: 12, gap: 8 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', color: '#374151', fontSize: 12 }}>시간대별 복용 현황</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {selectedTime && (
              <TouchableOpacity
                onPress={() => setSelectedTime(null)}
                style={{ backgroundColor: '#f3f4f6', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}
              >
                <Text style={{ fontSize: 10, color: '#6b7280' }}>전체 ✕</Text>
              </TouchableOpacity>
            )}
            <Text style={{ color: '#9ca3af', fontSize: 10 }}>{records.length}명</Text>
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
                  <Text style={{ fontSize: 9, color: '#d1d5db', fontWeight: '600' }}>{time}</Text>
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
                <Text style={{ fontSize: 9, fontWeight: '700', color: prog.allDone && !isSelected ? '#16a34a' : meta.text }}>{time}</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: prog.allDone && !isSelected ? '#16a34a' : meta.text }}>
                  {prog.done}/{prog.total}
                </Text>
                {prog.allDone
                  ? <Text style={{ fontSize: 8, color: '#16a34a' }}>✓완료</Text>
                  : isSelected
                    ? <Text style={{ fontSize: 8, color: meta.text, opacity: 0.7 }}>●선택</Text>
                    : <Text style={{ fontSize: 8, color: '#d1d5db' }}>탭</Text>
                }
              </TouchableOpacity>
            );
          })}
        </View>
        {/* 범례 */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#818cf8' }} />
            <Text style={{ fontSize: 9, color: '#6366f1' }}>방담당</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#f97316' }} />
            <Text style={{ fontSize: 9, color: '#ea580c' }}>반담당</Text>
          </View>
        </View>
      </View>

      {/* 방 담당 섹션 */}
      {activeRoomTimes.length > 0 && roomRecords.length > 0 && (
        <View>
          <View style={{ backgroundColor: '#eef2ff', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#c7d2fe', paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#818cf8' }} />
            <Text style={{ fontWeight: '700', color: '#4f46e5', fontSize: 11 }}>방 담당</Text>
            <Text style={{ color: '#6366f1', fontSize: 10 }}>{roomLabel}</Text>
            <Text style={{ marginLeft: 'auto', color: '#6366f1', fontSize: 10 }}>{roomRecords.length}명</Text>
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
                onSkipDate={(si, isSkip) => onSkipDate(record, si, isSkip)}
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
            <Text style={{ fontWeight: '700', color: '#c2410c', fontSize: 11 }}>반 담당</Text>
            <Text style={{ color: '#ea580c', fontSize: 10 }}>{classLabel}</Text>
            <Text style={{ marginLeft: 'auto', color: '#ea580c', fontSize: 10 }}>{classRecords.length}명</Text>
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
                onSkipDate={(si, isSkip) => onSkipDate(record, si, isSkip)}
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
  record, today, filterTimes, accentBg, accentColor, dotColor, barColor, responsibleName, onCheck, onSkipDate,
}: {
  record: PatientRecord;
  today: string;
  filterTimes: MedicationTime[];
  accentBg: string;
  accentColor: string;
  dotColor: string;
  barColor: string;
  /** 이 섹션의 담당자 (방담당=unitMentor, 반담당=classMentor) */
  responsibleName?: string;
  onCheck: (si: number, t: MedicationTime, checked: boolean) => void;
  onSkipDate?: (si: number, isCurrentlySkip: boolean) => void;
}) {
  const todayScheds = (record.medicationSchedules ?? [])
    .map((s, idx) => ({ ...s, idx }))
    .filter(s =>
      isInDateRange(s.startDate, s.endDate, today) &&
      s.times.some(t => filterTimes.includes(t))
    );

  // 휴약일인 스케줄은 진행률 집계에서 제외
  const todayTotal = todayScheds.reduce((sum, s) => {
    if ((s.skipDates ?? []).includes(today)) return sum;
    return sum + s.times.filter(t => filterTimes.includes(t)).length;
  }, 0);
  const todayDone = todayScheds.reduce((sum, s) => {
    if ((s.skipDates ?? []).includes(today)) return sum;
    return sum + s.times.filter(t => filterTimes.includes(t) && s.checkedTimes.includes(makeMedTimeKey(t, today))).length;
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
              <Text style={{ color: '#6b7280', fontSize: 10 }}>{record.roomNumber}호</Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {responsibleName && (
            <View style={{ backgroundColor: accentBg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ color: accentColor, fontSize: 10, fontWeight: '600' }}>담당: {responsibleName}</Text>
            </View>
          )}
          <View style={{ backgroundColor: allDone ? '#dcfce7' : accentBg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: allDone ? '#166534' : accentColor, fontSize: 10, fontWeight: '700' }}>
              {allDone ? '완료 ✓' : `${todayDone}/${todayTotal}회`}
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
                    <Text style={{ color: '#c2410c', fontSize: 9 }}>📌캠프끝</Text>
                  </View>
                )}
                {sched.daysPerWeek && (
                  <View style={{ backgroundColor: '#f9fafb', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: '#e5e7eb' }}>
                    <Text style={{ color: '#6b7280', fontSize: 9 }}>주{sched.daysPerWeek}일</Text>
                  </View>
                )}
              </View>
              {onSkipDate && (
                <TouchableOpacity
                  onPress={() => onSkipDate(sched.idx, skipToday)}
                  style={{ backgroundColor: skipToday ? '#e5e7eb' : '#f9fafb', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: skipToday ? '#d1d5db' : '#e5e7eb' }}
                >
                  <Text style={{ color: skipToday ? '#374151' : '#9ca3af', fontSize: 9, fontWeight: '600' }}>
                    {skipToday ? '휴약일 ✕' : '휴약일'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {/* 휴약일이면 안내, 아니면 버튼 */}
            {skipToday ? (
              <View style={{ backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#e5e7eb' }}>
                <Text style={{ color: '#6b7280', fontSize: 10 }}>💤 오늘은 휴약일입니다</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {visibleTimes.map(time => {
                  const key = makeMedTimeKey(time, today);
                  const checked = sched.checkedTimes.includes(key);
                  return (
                    <TouchableOpacity
                      key={time}
                      style={[styles.medTimeBtn, checked && styles.medTimeBtnDone]}
                      onPress={() => onCheck(sched.idx, time, checked)}
                    >
                      {checked && <Text style={{ color: '#fff', fontSize: 10, marginRight: 2 }}>✓</Text>}
                      <Text style={[styles.medTimeBtnText, checked && { color: '#fff' }]}>{time}</Text>
                    </TouchableOpacity>
                  );
                })}
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
              <Text style={{ color: '#9ca3af', fontSize: 9 }}>{sched.endDateAuto ? '캠프 끝까지' : `${sched.endDate}까지`}</Text>
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
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onEdit: (record: PatientRecord) => void;
  onDelete: (id: string, name: string) => void;
  onProgressChange: (record: PatientRecord, s: ProgressStatus) => void;
  onMedCheck: (record: PatientRecord, si: number, t: MedicationTime, checked: boolean) => void;
  onIsolationCheck: (record: PatientRecord, i: number, v: boolean) => void;
  onManagerCheck: (record: PatientRecord, memo?: string) => void;
  onAddHospitalVisit: (record: PatientRecord) => void;
  onUpdateHospitalVisit: (record: PatientRecord, visits: HospitalVisitEntry[]) => void;
  onAddIsolationCheckSchedule: (record: PatientRecord, minutesLater: number) => void;
  onCompleteIsolationCheck: (record: PatientRecord, scheduleId: string, temperature?: number, status?: IsolationCheckSchedule['status'], note?: string) => void;
  onReturnCriteriaCheck: (record: PatientRecord, i: number, v: boolean) => void;
}

function ClassGroup({
  className, records, today, currentUserId, currentUserName, expandedId,
  onToggleExpand, onEdit, onDelete, onProgressChange, onMedCheck, onIsolationCheck,
  onManagerCheck, onAddHospitalVisit, onUpdateHospitalVisit,
  onAddIsolationCheckSchedule, onCompleteIsolationCheck, onReturnCriteriaCheck,
}: ClassGroupProps) {
  // ① 긴급도 ② visitDate 최신순
  const sorted = [...records].sort((a, b) => {
    const uDiff = urgencyScoreM(a) - urgencyScoreM(b);
    if (uDiff !== 0) return uDiff;
    return b.visitDate.toMillis() - a.visitDate.toMillis();
  });
  const urgentCount = records.filter(r => urgencyScoreM(r) <= 1).length;
  const classMentorName = records.find(r => r.classMentor)?.classMentor;
  const isUrgentGroup = urgentCount > 0;

  return (
    <View style={[styles.classGroup, isUrgentGroup && { borderColor: '#fca5a5' }]}>
      <View style={[styles.classGroupHeader, isUrgentGroup && { backgroundColor: '#fef2f2' }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={[styles.classGroupTitle, isUrgentGroup && { color: '#991b1b' }]}>{fmtClassM(className)}</Text>
            {classMentorName && <Text style={{ fontSize: 10, color: '#9ca3af' }}>{classMentorName}</Text>}
            <Text style={styles.classGroupCount}>{records.length}명</Text>
            {urgentCount > 0 && (
              <View style={{ backgroundColor: '#ef4444', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, color: '#fff', fontWeight: '700' }}>🚨 {urgentCount}</Text>
              </View>
            )}
          </View>
        </View>
        {/* 경과 상태 pill */}
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {(['최초보고', '조치완료', '호전중'] as ProgressStatus[]).map(s => {
            const c = records.filter(r => r.progressStatus === s).length;
            if (!c) return null;
            const col = PROGRESS_COLOR[s];
            return (
              <View key={s} style={{ backgroundColor: col.bg, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, color: col.text, fontWeight: '700' }}>{c}</Text>
              </View>
            );
          })}
        </View>
      </View>
      {sorted.map(record => (
        <PatientCard
          key={record.id}
          record={record}
          today={today}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          isExpanded={expandedId === record.id}
          onToggleExpand={() => onToggleExpand(record.id)}
          onEdit={() => onEdit(record)}
          onDelete={() => onDelete(record.id, record.studentName)}
          onProgressChange={(s) => onProgressChange(record, s)}
          onMedCheck={(si, t, checked) => onMedCheck(record, si, t, checked)}
          onIsolationCheck={(i, v) => onIsolationCheck(record, i, v)}
          onManagerCheck={(memo) => onManagerCheck(record, memo)}
          onAddHospitalVisit={() => onAddHospitalVisit(record)}
          onUpdateHospitalVisit={(visits) => onUpdateHospitalVisit(record, visits)}
          onAddIsolationCheckSchedule={(min) => onAddIsolationCheckSchedule(record, min)}
          onCompleteIsolationCheck={(id, temp, status, note) => onCompleteIsolationCheck(record, id, temp, status, note)}
          onReturnCriteriaCheck={(i, v) => onReturnCriteriaCheck(record, i, v)}
          grouped
        />
      ))}
    </View>
  );
}

// ==================== 환자 카드 ====================

interface PatientCardProps {
  record: PatientRecord;
  today: string;
  currentUserId: string;
  currentUserName: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onProgressChange: (s: ProgressStatus) => void;
  onMedCheck: (si: number, t: MedicationTime, checked: boolean) => void;
  onIsolationCheck: (i: number, v: boolean) => void;
  onManagerCheck: (memo?: string) => void;
  onAddHospitalVisit: () => void;
  onUpdateHospitalVisit: (visits: HospitalVisitEntry[]) => void;
  onAddIsolationCheckSchedule: (minutesLater: number) => void;
  onCompleteIsolationCheck: (scheduleId: string, temperature?: number, status?: IsolationCheckSchedule['status'], note?: string) => void;
  onReturnCriteriaCheck: (i: number, v: boolean) => void;
  grouped?: boolean;
}

type DetailTab = '경과' | '내원' | '복용약';

function PatientCard({
  record, today, currentUserId, currentUserName, isExpanded, onToggleExpand,
  onEdit, onDelete, onProgressChange, onMedCheck, onIsolationCheck,
  onManagerCheck, onAddHospitalVisit, onUpdateHospitalVisit,
  onAddIsolationCheckSchedule, onCompleteIsolationCheck, onReturnCriteriaCheck,
  grouped = false,
}: PatientCardProps) {
  const progressStyle = PROGRESS_COLOR[record.progressStatus ?? '최초보고'];
  const isMyRecord = record.assigneeId === currentUserId;
  const [activeTab, setActiveTab] = useState<DetailTab>('경과');
  const [managerMemo, setManagerMemo] = useState('');
  const [showMemoInput, setShowMemoInput] = useState(false);
  const elapsed = daysElapsedM(record.visitDate);
  const elapsedLabel = elapsed === 0 ? '오늘' : elapsed === 1 ? '어제' : `${elapsed}일째`;
  const elapsedColor = elapsed >= 3 ? '#f97316' : elapsed >= 1 ? '#ca8a04' : '#9ca3af';

  const medInfo = useMemo(() => {
    if (!record.medicationSchedules?.length) return null;
    let todayTotal = 0, todayDone = 0;
    record.medicationSchedules.forEach(s => {
      s.times.forEach(t => {
        if (isInDateRange(s.startDate, s.endDate, today)) {
          todayTotal++;
          if (s.checkedTimes.includes(makeMedTimeKey(t, today))) todayDone++;
        }
      });
    });
    return { todayTotal, todayDone };
  }, [record.medicationSchedules, today]);

  const hospitalVisits = record.hospitalVisits ?? [];
  const hasMed = (record.medicationSchedules?.length ?? 0) > 0;

  const tabs: DetailTab[] = ['경과', '내원', '복용약'];

  const cardStyle = grouped
    ? [styles.cardGrouped, isMyRecord && styles.cardMyRecord]
    : [styles.card, isMyRecord && styles.cardMyRecord];

  return (
    <View style={cardStyle}>
      {/* 내 담당 왼쪽 강조 바 */}
      {grouped && isMyRecord && (
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: '#60a5fa' }} />
      )}
      <TouchableOpacity style={styles.cardHeader} onPress={onToggleExpand} activeOpacity={0.7}>
        <View style={[styles.progressDot, { backgroundColor: progressStyle.dot }]} />
        <View style={{ flex: 1 }}>
          {/* 1행: 이름 + 학년 + 반 + 방 + 뱃지 */}
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardName}>{record.studentName}</Text>
            {record.grade && <Text style={styles.cardGrade}>{record.grade}</Text>}
            {record.className && (
              <View style={styles.classBadge}>
                <Text style={styles.classBadgeText}>{fmtClassM(record.className)}</Text>
              </View>
            )}
            {record.roomNumber && (
              <Text style={styles.roomText}>{record.roomNumber}호</Text>
            )}
            {isMyRecord && (
              <View style={{ backgroundColor: '#dbeafe', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, color: '#1d4ed8', fontWeight: '700' }}>내 담당</Text>
              </View>
            )}
            {record.managerCheck && (
              <View style={styles.managerBadge}>
                <Text style={styles.managerBadgeText}>✓ 매니저</Text>
              </View>
            )}
          </View>
          {/* 2행: 증상 */}
          <Text style={styles.cardSymptom} numberOfLines={1}>{record.symptom}</Text>
          {/* 3행: 상태 뱃지 */}
          <View style={styles.cardTagRow}>
            {(record.types ?? []).map(t => (
              <View key={t} style={[styles.typeTag, { backgroundColor: TYPE_COLOR[t]?.bg ?? '#f3f4f6' }]}>
                <Text style={[styles.typeTagText, { color: TYPE_COLOR[t]?.text ?? '#374151' }]}>{t}</Text>
              </View>
            ))}
            <View style={[styles.progressBadge, { backgroundColor: progressStyle.bg }]}>
              <Text style={[styles.progressBadgeText, { color: progressStyle.text }]}>
                {record.progressStatus ?? '최초보고'}
              </Text>
            </View>
            {medInfo && (
              <View style={{ backgroundColor: medInfo.todayDone === medInfo.todayTotal && medInfo.todayTotal > 0 ? '#dcfce7' : '#fff7ed', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, color: medInfo.todayDone === medInfo.todayTotal && medInfo.todayTotal > 0 ? '#166534' : '#c2410c', fontWeight: '700' }}>
                  💊 {medInfo.todayDone}/{medInfo.todayTotal}
                </Text>
              </View>
            )}
          </View>
          {/* 4행: 경과일 + 날짜 + 담당자 */}
          <View style={styles.cardMeta}>
            <Text style={[styles.cardMetaText, { color: elapsedColor, fontWeight: '600' }]}>{elapsedLabel}</Text>
            <Text style={styles.cardMetaDot}>·</Text>
            <Text style={styles.cardMetaText}>{formatDate(record.visitDate)}</Text>
            {record.assigneeName && (
              <>
                <Text style={styles.cardMetaDot}>·</Text>
                <Text style={[styles.cardMetaText, isMyRecord && { color: '#3b82f6', fontWeight: '600' }]}>
                  담당: {record.assigneeName}
                </Text>
              </>
            )}
          </View>
        </View>
        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#9ca3af" />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.cardExpanded}>
          {/* 기본 정보 */}
          {record.treatment && <DetailRow label="처치" value={record.treatment} />}
          {record.medication && <DetailRow label="투약" value={record.medication} />}
          {record.notes && <DetailRow label="메모" value={record.notes} />}
          {record.classMentor && <DetailRow label="담임" value={record.classMentor} />}
          {record.unitMentor && <DetailRow label="유닛" value={record.unitMentor} />}

          {/* 탭 */}
          <View style={styles.tabRow}>
            {tabs.map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, activeTab === tab && styles.tabActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
                {tab === '복용약' && hasMed && (
                  <View style={styles.tabDot} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* 탭 콘텐츠 */}
          <View style={styles.tabContent}>
            {activeTab === '경과' && (
              <ProgressTabMobile
                record={record}
                onProgressChange={onProgressChange}
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
                onIsolationCheck={onIsolationCheck}
                onAddIsolationCheckSchedule={onAddIsolationCheckSchedule}
                onCompleteIsolationCheck={onCompleteIsolationCheck}
                onReturnCriteriaCheck={onReturnCriteriaCheck}
              />
            )}
            {activeTab === '내원' && (
              <HospitalTabMobile
                record={record}
                onAddVisit={onAddHospitalVisit}
                onUpdateVisits={onUpdateHospitalVisit}
              />
            )}
            {activeTab === '복용약' && (
              <MedicationTabMobile
                schedules={record.medicationSchedules ?? []}
                today={today}
                onCheck={onMedCheck}
              />
            )}
          </View>

          {/* 수정/삭제 */}
          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.editBtn} onPress={onEdit}>
              <Text style={styles.editBtnText}>수정</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
              <Text style={styles.deleteBtnText}>삭제</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// 상세 행
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
  record, onProgressChange, onManagerCheck,
  showMemoInput, managerMemo, onMemoChange, onMemoConfirm, onMemoCancel,
  onIsolationCheck, onAddIsolationCheckSchedule, onCompleteIsolationCheck, onReturnCriteriaCheck,
}: {
  record: PatientRecord;
  onProgressChange: (s: ProgressStatus) => void;
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
}) {
  return (
    <View style={{ gap: 12 }}>
      {/* 경과 상태 버튼 */}
      <View>
        <Text style={styles.sectionLabel}>경과 상태</Text>
        <View style={styles.progressBtnRow}>
          {PROGRESS_STATUSES.map(s => {
            const isActive = record.progressStatus === s;
            const col = PROGRESS_COLOR[s];
            return (
              <TouchableOpacity
                key={s}
                style={[styles.progressBtn, isActive && { backgroundColor: col.dot, borderColor: col.dot }]}
                onPress={() => onProgressChange(s)}
              >
                <Text style={[styles.progressBtnText, isActive && { color: '#fff' }]}>{s}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 격리 관리 섹션 */}
      {record.types.includes('격리') && (
        <IsolationManageMobile
          record={record}
          onIsolationCheck={onIsolationCheck}
          onAddSchedule={onAddIsolationCheckSchedule}
          onCompleteSchedule={onCompleteIsolationCheck}
        />
      )}

      {/* 복귀 판단 기준 */}
      <ReturnCriteriaMobile
        record={record}
        onReturnCriteriaCheck={onReturnCriteriaCheck}
      />

      {/* 매니저 확인 */}
      <View style={styles.managerSection}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.sectionLabel}>매니저 확인</Text>
          <TouchableOpacity
            style={[styles.managerCheckBtn, record.managerCheck && styles.managerCheckBtnDone]}
            onPress={onManagerCheck}
          >
            <Text style={[styles.managerCheckBtnText, record.managerCheck && { color: '#fff' }]}>
              {record.managerCheck ? '✓ 확인 완료' : '확인 전'}
            </Text>
          </TouchableOpacity>
        </View>
        {record.managerCheck && (
          <View style={{ marginTop: 6 }}>
            <Text style={{ color: '#4338ca', fontSize: 11, fontWeight: '600' }}>{record.managerCheck.checkedBy}</Text>
            <Text style={{ color: '#9ca3af', fontSize: 10 }}>{formatDate(record.managerCheck.checkedAt)}</Text>
            {record.managerCheck.memo && (
              <Text style={{ color: '#374151', fontSize: 11, marginTop: 4, backgroundColor: '#fff', padding: 8, borderRadius: 6 }}>
                {record.managerCheck.memo}
              </Text>
            )}
          </View>
        )}
        {showMemoInput && (
          <View style={{ marginTop: 8 }}>
            <TextInput
              value={managerMemo}
              onChangeText={onMemoChange}
              placeholder="매니저 메모 (선택)"
              placeholderTextColor="#9ca3af"
              multiline
              style={{ borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 8, padding: 10, fontSize: 12, color: '#111827', backgroundColor: '#fff', minHeight: 60 }}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={[styles.editBtn, { flex: 1 }]} onPress={onMemoCancel}>
                <Text style={styles.editBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.deleteBtn, { flex: 1, backgroundColor: '#6366f1', borderColor: '#6366f1' }]} onPress={onMemoConfirm}>
                <Text style={[styles.deleteBtnText, { color: '#fff' }]}>확인</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
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
  const ISOLATION_RETURN_LABELS = ['열 없음 (37.5°C 미만)', '주요 증상 호전', '담당 매니저 확인'];

  const isOverdue = (ts: Timestamp) => ts.toDate() < new Date();

  return (
    <View style={{ backgroundColor: '#f5f3ff', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#ddd6fe' }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: '#5b21b6', marginBottom: 10 }}>🏠 격리 관리</Text>

      {/* 주기 체크 */}
      <Text style={{ fontSize: 11, fontWeight: '600', color: '#6d28d9', marginBottom: 6 }}>주기 체크</Text>
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
              {formatTime(s.scheduledAt)} 체크 완료
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
              <TextInput
                value={checkTemp}
                onChangeText={setCheckTemp}
                placeholder="체온"
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
                    <Text style={{ color: checkStatus === o ? '#fff' : '#374151', fontSize: 10, fontWeight: '600' }}>{o}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.editBtn, { flex: 1 }]} onPress={() => setCompleting(null)}>
                <Text style={styles.editBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#7c3aed', borderRadius: 8, padding: 8, alignItems: 'center' }}
                onPress={() => {
                  onCompleteSchedule(s.id, checkTemp ? parseFloat(checkTemp) : undefined, checkStatus, checkNote.trim() || undefined);
                  setCompleting(null);
                  setCheckTemp(''); setCheckStatus('동일'); setCheckNote('');
                }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>저장</Text>
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
              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>체크 완료</Text>
            </TouchableOpacity>
          </View>
        )
      ))}

      {done.length > 0 && (
        <View style={{ marginTop: 6 }}>
          <Text style={{ color: '#9ca3af', fontSize: 10, fontWeight: '600', marginBottom: 4 }}>완료 기록</Text>
          {done.map(s => (
            <View key={s.id} style={{ flexDirection: 'row', gap: 6, marginBottom: 2 }}>
              <Text style={{ color: '#22c55e', fontSize: 10 }}>✓</Text>
              <Text style={{ color: '#6b7280', fontSize: 10 }}>{formatTime(s.scheduledAt)}</Text>
              {s.temperature && <Text style={{ color: '#f97316', fontSize: 10 }}>{s.temperature}°C</Text>}
              {s.status && <Text style={{ color: '#6b7280', fontSize: 10, fontWeight: '600' }}>{s.status}</Text>}
            </View>
          ))}
        </View>
      )}

      {/* 레거시 복귀 기준 */}
      <View style={{ marginTop: 10 }}>
        <Text style={{ fontSize: 11, fontWeight: '600', color: '#6d28d9', marginBottom: 6 }}>격리 해제 기준</Text>
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
                {label}
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
        <Text style={{ fontSize: 12, fontWeight: '700', color: allDone ? '#166534' : '#92400e' }}>복귀 판단 기준</Text>
        {allDone && (
          <View style={{ backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ color: '#166534', fontSize: 10, fontWeight: '700' }}>✓ 복귀 가능</Text>
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
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ==================== 내원 탭 (모바일) ====================

function HospitalTabMobile({ record, onAddVisit, onUpdateVisits }: {
  record: PatientRecord;
  onAddVisit: () => void;
  onUpdateVisits: (visits: HospitalVisitEntry[]) => void;
}) {
  const visits = record.hospitalVisits ?? [];

  const setVisitField = <K extends keyof HospitalVisitEntry>(
    idx: number, key: K, val: HospitalVisitEntry[K]
  ) => {
    const next = visits.map((v, i) => i === idx ? { ...v, [key]: val } : v);
    onUpdateVisits(next);
  };

  return (
    <View style={{ gap: 8 }}>
      {visits.length === 0 ? (
        <Text style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center', paddingVertical: 12 }}>내원 기록이 없습니다.</Text>
      ) : (
        visits.map((visit, idx) => (
          <View key={visit.visitId} style={{ backgroundColor: '#fef2f2', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#fecaca' }}>
            <Text style={{ color: '#991b1b', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>{idx + 1}차 내원</Text>
            {/* 내원 상태 */}
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
              {HOSPITAL_STATUSES.map(s => (
                <TouchableOpacity
                  key={s}
                  style={{ flex: 1, backgroundColor: visit.hospitalStatus === s ? (s === '내원완료' ? '#22c55e' : s === '내원예정' ? '#f97316' : '#6b7280') : '#fff', borderRadius: 8, padding: 6, borderWidth: 1, borderColor: '#fecaca', alignItems: 'center' }}
                  onPress={() => setVisitField(idx, 'hospitalStatus', s)}
                >
                  <Text style={{ color: visit.hospitalStatus === s ? '#fff' : '#6b7280', fontSize: 10, fontWeight: '700' }}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* 인솔자 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#9ca3af', fontSize: 11, width: 30 }}>인솔</Text>
              <TextInput
                value={visit.escort}
                onChangeText={v => setVisitField(idx, 'escort', v)}
                onBlur={() => onUpdateVisits(visits)}
                placeholder="인솔자"
                placeholderTextColor="#9ca3af"
                style={{ flex: 1, borderWidth: 1, borderColor: '#fecaca', borderRadius: 6, padding: 6, fontSize: 12 }}
              />
            </View>
            {visit.hospitalStatus === '내원예정' && (
              <TouchableOpacity
                style={{ backgroundColor: '#22c55e', borderRadius: 8, padding: 8, alignItems: 'center', marginTop: 8 }}
                onPress={() => setVisitField(idx, 'hospitalStatus', '내원완료')}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>내원 완료 처리</Text>
              </TouchableOpacity>
            )}
          </View>
        ))
      )}
      <TouchableOpacity
        style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#fca5a5', borderRadius: 10, padding: 10, alignItems: 'center' }}
        onPress={onAddVisit}
      >
        <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>
          + {visits.length === 0 ? '내원 등록' : '재내원 추가'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ==================== 복용약 탭 (모바일) ====================

function MedicationTabMobile({ schedules, today, onCheck }: {
  schedules: MedicationSchedule[];
  today: string;
  onCheck: (si: number, t: MedicationTime, checked: boolean) => void;
}) {
  if (schedules.length === 0) {
    return <Text style={{ color: '#9ca3af', fontSize: 12, textAlign: 'center', paddingVertical: 12 }}>복용약 일정이 없습니다.</Text>;
  }
  return (
    <View style={{ gap: 10 }}>
      {schedules.map((sched, idx) => {
        const total = calcTotalDoses(sched);
        const done = sched.checkedTimes.length;
        const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
        const isActive = isInDateRange(sched.startDate, sched.endDate, today);
        return (
          <View key={idx} style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#fed7aa' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#c2410c', fontSize: 12, fontWeight: '700' }}>{sched.name}</Text>
              <Text style={{ color: '#f97316', fontSize: 10 }}>{done}/{total}회 ({pct}%)</Text>
            </View>
            <View style={{ height: 6, backgroundColor: '#fed7aa', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
              <View style={{ width: `${pct}%`, height: '100%', backgroundColor: pct >= 100 ? '#22c55e' : '#f97316', borderRadius: 3 }} />
            </View>
            <Text style={{ color: '#9ca3af', fontSize: 10, marginBottom: 6 }}>
              {sched.startDate} ~ {sched.endDate}
              {!isActive && ' (오늘 복용일 아님)'}
            </Text>
            {isActive && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {sched.times.map(time => {
                  const key = makeMedTimeKey(time, today);
                  const checked = sched.checkedTimes.includes(key);
                  return (
                    <TouchableOpacity
                      key={time}
                      style={[styles.medTimeBtn, checked && styles.medTimeBtnDone]}
                      onPress={() => onCheck(idx, time, checked)}
                    >
                      {checked && <Text style={{ color: '#fff', fontSize: 10 }}>✓ </Text>}
                      <Text style={[styles.medTimeBtnText, checked && { color: '#fff' }]}>{time}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
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
        <Text style={styles.modalTitle}>{editingId ? '환자 기록 수정' : '환자 기록 추가'}</Text>
        <TouchableOpacity
          onPress={onSubmit}
          disabled={submitting || !form.studentName.trim() || !form.symptom.trim()}
          style={[styles.modalSaveBtn, (submitting || !form.studentName.trim() || !form.symptom.trim()) && styles.modalSaveBtnDisabled]}
        >
          {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalSaveBtnText}>저장</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
        {/* 학생 정보 */}
        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>학생 정보</Text>
          {/* 이름 검색 */}
          <View>
            <Text style={styles.formLabel}>이름 *</Text>
            <TextInput
              value={studentSearch || form.studentName}
              onChangeText={v => {
                if (studentLocked) return;
                setStudentSearch(v);
                setField('studentName', v);
                setShowDropdown(true);
              }}
              onFocus={() => { if (!studentLocked) setShowDropdown(true); }}
              placeholder="이름으로 검색..."
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
                <Text style={{ color: '#6b7280', fontSize: 11 }}>변경</Text>
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
                      {s.grade}{s.gender ? s.gender : ''} · {s.className ?? '-'} · {s.roomNumber ? `${s.roomNumber}호` : '-'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          {/* 자동 매핑 표시 (잠긴 상태) */}
          {studentLocked && (
            <View style={{ backgroundColor: '#f9fafb', borderRadius: 8, padding: 10, marginTop: 4 }}>
              {form.grade && <Text style={{ fontSize: 11, color: '#6b7280' }}>학년: {form.grade}</Text>}
              {form.className && <Text style={{ fontSize: 11, color: '#6b7280' }}>반: {form.className}</Text>}
              {form.classMentor && <Text style={{ fontSize: 11, color: '#6b7280' }}>담임: {form.classMentor}</Text>}
              {form.roomNumber && <Text style={{ fontSize: 11, color: '#6b7280' }}>방: {form.roomNumber}호</Text>}
            </View>
          )}
        </View>

        {/* 유형 선택 */}
        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>유형 (복수 선택)</Text>
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
                  <Text style={{ color: selected ? col.text : '#6b7280', fontSize: 12, fontWeight: '600' }}>{t}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 증상 */}
        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>증상 & 처치</Text>
          <Text style={styles.formLabel}>증상 *</Text>
          <TextInput
            value={form.symptom}
            onChangeText={v => setField('symptom', v)}
            placeholder="증상을 입력하세요"
            placeholderTextColor="#9ca3af"
            multiline
            style={[styles.formInput, { minHeight: 60 }]}
          />
          <Text style={[styles.formLabel, { marginTop: 8 }]}>처치</Text>
          <TextInput
            value={form.treatment}
            onChangeText={v => setField('treatment', v)}
            placeholder="처치 내용"
            placeholderTextColor="#9ca3af"
            multiline
            style={[styles.formInput, { minHeight: 60 }]}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.formLabel}>체온</Text>
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
              <Text style={styles.formLabel}>간단 투약</Text>
              <TextInput
                value={form.medication}
                onChangeText={v => setField('medication', v)}
                placeholder="타이레놀"
                placeholderTextColor="#9ca3af"
                style={styles.formInput}
              />
            </View>
          </View>
        </View>

        {/* 경과 */}
        <View style={styles.formSection}>
          <Text style={styles.formSectionTitle}>경과 상태</Text>
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
                  <Text style={{ color: isActive ? '#fff' : '#6b7280', fontSize: 10, fontWeight: '700' }}>{s}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* 격리방 */}
        {hasIsolation && (
          <View style={styles.formSection}>
            <Text style={styles.formSectionTitle}>격리 정보</Text>
            <Text style={styles.formLabel}>격리방 번호</Text>
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
            <Text style={styles.formSectionTitle}>복용약 스케줄</Text>
            {form.medSchedules.map((sched, idx) => (
              <View key={idx} style={{ backgroundColor: '#fff7ed', borderRadius: 10, padding: 10, marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#c2410c' }}>약 #{idx + 1}</Text>
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
                  placeholder="약 이름 (예: 타이레놀)"
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
                        <Text style={{ color: selected ? '#fff' : '#374151', fontSize: 11, fontWeight: '600' }}>{time}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formLabel}>시작일</Text>
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
                    <Text style={styles.formLabel}>종료일</Text>
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
              <Text style={{ color: '#f97316', fontSize: 12, fontWeight: '600' }}>+ 약 스케줄 추가</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 메모 */}
        <View style={styles.formSection}>
          <Text style={styles.formLabel}>메모</Text>
          <TextInput
            value={form.notes}
            onChangeText={v => setField('notes', v)}
            placeholder="추가 메모"
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerLeft: { flex: 1 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  badge: { backgroundColor: '#ef4444', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  pillRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  pill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 10, fontWeight: '700' },
  emptySmall: { fontSize: 11, color: '#9ca3af' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  mainTabRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  mainTab: { flex: 1, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  mainTabActive: { borderBottomWidth: 2, borderBottomColor: '#ef4444' },
  mainTabText: { fontSize: 13, fontWeight: '600', color: '#9ca3af' },
  mainTabTextActive: { color: '#ef4444' },
  tabBadge: { backgroundColor: '#f97316', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2, minWidth: 16, alignItems: 'center' },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  filterBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, gap: 6 },
  searchInput: { flex: 1, fontSize: 12, color: '#374151', padding: 0 },
  filterPills: { flexDirection: 'row', gap: 6 },
  filterPill: { backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  filterPillActive: { backgroundColor: '#3b82f6' },
  filterPillText: { fontSize: 11, fontWeight: '600', color: '#6b7280' },
  filterPillTextActive: { color: '#fff' },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: '#9ca3af', textAlign: 'center' },
  emptyAction: { marginTop: 8, color: '#ef4444', fontWeight: '600', fontSize: 13 },
  resolvedSection: { marginTop: 8 },
  resolvedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#f3f4f6', borderRadius: 12, padding: 12 },
  resolvedTitle: { fontSize: 13, fontWeight: '700', color: '#374151', flex: 1 },
  resolvedCount: { backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  resolvedCountText: { fontSize: 11, color: '#166534', fontWeight: '700' },
  classGroup: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 10, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  classGroupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  classGroupTitle: { fontSize: 13, fontWeight: '700', color: '#1f2937' },
  classGroupCount: { fontSize: 11, color: '#9ca3af', fontWeight: '500' },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  cardGrouped: { backgroundColor: '#fff' },
  cardMyRecord: { borderColor: '#bfdbfe' },
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
  cardExpanded: { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  detailRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  detailLabel: { fontSize: 11, color: '#9ca3af', width: 32, flexShrink: 0 },
  detailValue: { fontSize: 11, color: '#374151', flex: 1 },
  tabRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', marginVertical: 8 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#3b82f6' },
  tabText: { fontSize: 11, fontWeight: '600', color: '#9ca3af' },
  tabTextActive: { color: '#3b82f6' },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#f97316' },
  tabContent: { marginTop: 4 },
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
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', backgroundColor: '#fff' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  modalSaveBtn: { backgroundColor: '#ef4444', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  modalSaveBtnDisabled: { backgroundColor: '#d1d5db' },
  modalSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  formSection: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#f3f4f6' },
  formSectionTitle: { fontSize: 13, fontWeight: '700', color: '#1f2937', marginBottom: 10 },
  formLabel: { fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 4 },
  formInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#111827', backgroundColor: '#fff' },
});
