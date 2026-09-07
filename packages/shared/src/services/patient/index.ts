import {
  collection,
  doc,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  Timestamp,
  Firestore,
  Unsubscribe,
} from 'firebase/firestore';
import {
  PatientRecord,
  PatientType,
  HospitalVisitEntry,
  HospitalBilling,
  ParentContactLog,
  ContactReportType,
  ManagerCheck,
  ProgressStatus,
  ProgressLog,
  MedicationSchedule,
  IsolationCheckSchedule,
  ManagerAction,
  ManagerActionType,
  ManagerActionResponse,
} from '../../types/camp';
import { logger } from '../../utils/logger';

/**
 * Firestore에서 배열 필드가 dot-notation 업데이트로 인해
 * 객체({0: ..., 1: ...}) 형태로 저장될 수 있어 안전하게 배열로 변환
 */
function normalizeArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value !== null && typeof value === 'object') {
    // {0: item0, 1: item1, ...} 형태 처리
    const obj = value as Record<string, T>;
    const keys = Object.keys(obj).filter(k => !isNaN(Number(k))).sort((a, b) => Number(a) - Number(b));
    if (keys.length > 0) return keys.map(k => obj[k]);
  }
  return [];
}

/**
 * MedicationSchedule 내부 배열 필드(times, checkedTimes, skipDates)도 정규화
 */
function normalizeMedicationSchedules(value: unknown): MedicationSchedule[] {
  return normalizeArray<MedicationSchedule>(value).map(s => ({
    ...s,
    times: normalizeArray<string>(s.times) as MedicationSchedule['times'],
    checkedTimes: normalizeArray<string>(s.checkedTimes),
    skipDates: normalizeArray<string>(s.skipDates),
  }));
}

// ── 실시간 구독 ────────────────────────────────────────────────

export const subscribePatientRecords = (
  db: Firestore,
  campCode: string,
  onData: (records: PatientRecord[]) => void,
  onError?: (error: Error) => void
): Unsubscribe => {
  const q = query(
    collection(db, 'patientRecords'),
    where('campCode', '==', campCode)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const records = (snapshot.docs.map(d => {
        const data = d.data();
        // Firestore dot-notation 업데이트 후 배열 필드가 객체로 변질될 수 있어 정규화
        return {
          id: d.id,
          ...data,
          medicationSchedules: normalizeMedicationSchedules(data.medicationSchedules),
          hospitalVisits: normalizeArray(data.hospitalVisits),
          parentContactLogs: normalizeArray(data.parentContactLogs),
          progressLogs: normalizeArray(data.progressLogs),
          isolationCheckSchedules: normalizeArray(data.isolationCheckSchedules),
          types: normalizeArray(data.types),
        };
      }) as PatientRecord[]).sort(
        (a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()
      );
      onData(records);
    },
    (error) => {
      logger.error('환자 기록 구독 오류:', error);
      onError?.(error);
    }
  );
};

/** 내가 담당자인 미처리 환자 수 구독 (인앱 배지용) */
export const subscribeAssignedPatientCount = (
  db: Firestore,
  campCode: string,
  assigneeId: string,
  onCount: (count: number) => void
): Unsubscribe => {
  const q = query(
    collection(db, 'patientRecords'),
    where('campCode', '==', campCode),
    where('assigneeId', '==', assigneeId),
    where('progressStatus', 'in', ['최초보고', '조치완료', '호전중'])
  );
  return onSnapshot(q, (snapshot) => onCount(snapshot.size));
};

// ── CRUD ───────────────────────────────────────────────────────

export const addPatientRecord = async (
  db: Firestore,
  record: Omit<PatientRecord, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> => {
  const now = Timestamp.now();
  const docRef = await addDoc(collection(db, 'patientRecords'), {
    ...record,
    createdAt: now,
    updatedAt: now,
  });
  logger.info('환자 기록 추가:', docRef.id);
  return docRef.id;
};

export const updatePatientRecord = async (
  db: Firestore,
  recordId: string,
  updates: Partial<Omit<PatientRecord, 'id' | 'createdAt'>>
): Promise<void> => {
  await updateDoc(doc(db, 'patientRecords', recordId), {
    ...updates,
    updatedAt: Timestamp.now(),
  });
};

export const deletePatientRecord = async (
  db: Firestore,
  recordId: string
): Promise<void> => {
  await deleteDoc(doc(db, 'patientRecords', recordId));
  logger.info('환자 기록 삭제:', recordId);
};

// ── 경과 상태 ──────────────────────────────────────────────────

export const updateProgressStatus = async (
  db: Firestore,
  recordId: string,
  status: ProgressStatus,
  loggedBy: string,
  note?: string
): Promise<void> => {
  const log: ProgressLog = {
    loggedAt: Timestamp.now(),
    loggedBy,
    status,
    ...(note ? { note } : {}),
  };
  await updateDoc(doc(db, 'patientRecords', recordId), {
    progressStatus: status,
    progressLogs: arrayUnion(log),
    updatedAt: Timestamp.now(),
  });
  logger.info(`경과 상태 변경: ${recordId} → ${status}`);
};

/**
 * 경과 로그 추가 (위치·열감·증상 포함)
 * progressStatus도 최신 status로 업데이트
 */
export const addProgressLog = async (
  db: Firestore,
  recordId: string,
  log: Omit<ProgressLog, 'loggedAt'>
): Promise<void> => {
  const fullLog: ProgressLog = {
    ...log,
    loggedAt: Timestamp.now(),
  };
  await updateDoc(doc(db, 'patientRecords', recordId), {
    progressStatus: log.status,
    progressLogs: arrayUnion(fullLog),
    updatedAt: Timestamp.now(),
  });
  logger.info(`경과 로그 추가: ${recordId} → ${log.status}`);
};

/**
 * 특정 인덱스의 경과 로그를 삭제하고 progressStatus를 남은 로그 중 가장 최신 상태로 복원
 * @param logIndex 삭제할 로그의 인덱스 (0-based, 오래된 순서 기준)
 */
export const removeProgressLog = async (
  db: Firestore,
  recordId: string,
  currentLogs: ProgressLog[],
  logIndex: number
): Promise<void> => {
  if (currentLogs.length === 0 || logIndex < 0 || logIndex >= currentLogs.length) return;
  const newLogs = currentLogs.filter((_, i) => i !== logIndex);
  // 남은 로그 중 가장 마지막(최신) status로 복원
  const prevStatus: ProgressStatus = newLogs.length > 0
    ? newLogs[newLogs.length - 1].status
    : '최초보고';
  await updateDoc(doc(db, 'patientRecords', recordId), {
    progressLogs: newLogs,
    progressStatus: prevStatus,
    updatedAt: Timestamp.now(),
  });
  logger.info(`경과 로그 삭제: ${recordId} index=${logIndex}, 복원 → ${prevStatus}`);
};

// ── 내원 ───────────────────────────────────────────────────────

export const addHospitalVisit = async (
  db: Firestore,
  recordId: string,
  visit: HospitalVisitEntry
): Promise<void> => {
  await updateDoc(doc(db, 'patientRecords', recordId), {
    hospitalVisits: arrayUnion(visit),
    updatedAt: Timestamp.now(),
  });
  logger.info('내원 추가:', recordId);
};

export const updateHospitalVisitEntry = async (
  db: Firestore,
  recordId: string,
  allVisits: HospitalVisitEntry[]
): Promise<void> => {
  await updateDoc(doc(db, 'patientRecords', recordId), {
    hospitalVisits: allVisits,
    updatedAt: Timestamp.now(),
  });
};

// 레거시 호환 (HospitalVisit → HospitalVisitEntry 마이그레이션 전 대비)
export const updateHospitalVisit = async (
  db: Firestore,
  recordId: string,
  allVisits: HospitalVisitEntry[]
): Promise<void> => updateHospitalVisitEntry(db, recordId, allVisits);

// ── 약 복용 체크 ───────────────────────────────────────────────

/**
 * dot notation 대신 전체 배열 교체 방식 사용
 * (dot notation 업데이트 시 Firestore가 배열을 map 객체로 변질시키는 버그 방지)
 */
export const addMedicationCheck = async (
  db: Firestore,
  recordId: string,
  scheduleIndex: number,
  timeKey: string,
  allSchedules: MedicationSchedule[],
  checkerName?: string
): Promise<void> => {
  const updated = allSchedules.map((s, i) => {
    if (i !== scheduleIndex) return s;
    const checkedTimes = Array.isArray(s.checkedTimes) ? s.checkedTimes : [];
    const newTimes = checkedTimes.includes(timeKey) ? checkedTimes : [...checkedTimes, timeKey];
    // 체커 이름 기록
    const checkedBy: Record<string, string> = { ...(s.checkedBy ?? {}) };
    if (checkerName) checkedBy[timeKey] = checkerName;
    return { ...s, checkedTimes: newTimes, checkedBy };
  });
  await updateDoc(doc(db, 'patientRecords', recordId), {
    medicationSchedules: updated,
    updatedAt: Timestamp.now(),
  });
};

export const removeMedicationCheck = async (
  db: Firestore,
  recordId: string,
  scheduleIndex: number,
  timeKey: string,
  allSchedules: MedicationSchedule[]
): Promise<void> => {
  const updated = allSchedules.map((s, i) => {
    if (i !== scheduleIndex) return s;
    const checkedTimes = Array.isArray(s.checkedTimes) ? s.checkedTimes : [];
    // 체커 이름도 함께 제거
    const checkedBy: Record<string, string> = { ...(s.checkedBy ?? {}) };
    delete checkedBy[timeKey];
    return { ...s, checkedTimes: checkedTimes.filter(t => t !== timeKey), checkedBy };
  });
  await updateDoc(doc(db, 'patientRecords', recordId), {
    medicationSchedules: updated,
    updatedAt: Timestamp.now(),
  });
};

// ── 격리 복귀 체크 ─────────────────────────────────────────────

export const updateIsolationReturnChecks = async (
  db: Firestore,
  recordId: string,
  checks: boolean[]
): Promise<void> => {
  await updateDoc(doc(db, 'patientRecords', recordId), {
    isolationReturnChecks: checks,
    updatedAt: Timestamp.now(),
  });
};

// ── 매니저 확인 ────────────────────────────────────────────────

export const updateManagerCheck = async (
  db: Firestore,
  recordId: string,
  check: ManagerCheck | null
): Promise<void> => {
  await updateDoc(doc(db, 'patientRecords', recordId), {
    managerCheck: check ?? null,
    updatedAt: Timestamp.now(),
  });
  logger.info(`매니저 확인 업데이트: ${recordId}`);
};

// ── 보호자 연락 ────────────────────────────────────────────────

export const addParentContactLog = async (
  db: Firestore,
  recordId: string,
  log: Omit<ParentContactLog, 'contactedAt'>
): Promise<void> => {
  const newLog: ParentContactLog = {
    ...log,
    reportType: log.reportType ?? ('최초보고' as ContactReportType),
    contactedAt: Timestamp.now(),
  };
  await updateDoc(doc(db, 'patientRecords', recordId), {
    parentContactLogs: arrayUnion(newLog),
    updatedAt: Timestamp.now(),
  });
};

export const removeParentContactLog = async (
  db: Firestore,
  recordId: string,
  log: ParentContactLog
): Promise<void> => {
  await updateDoc(doc(db, 'patientRecords', recordId), {
    parentContactLogs: arrayRemove(log),
    updatedAt: Timestamp.now(),
  });
};

export const updateParentContactAssignee = async (
  db: Firestore,
  recordId: string,
  assigneeId: string,
  assigneeName: string,
  nextContactAt?: Timestamp
): Promise<void> => {
  await updateDoc(doc(db, 'patientRecords', recordId), {
    parentContactAssigneeId: assigneeId,
    parentContactAssigneeName: assigneeName,
    ...(nextContactAt ? { nextContactScheduledAt: nextContactAt } : {}),
    updatedAt: Timestamp.now(),
  });
};

// ── 담당자 ─────────────────────────────────────────────────────

export const updateAssignee = async (
  db: Firestore,
  recordId: string,
  assigneeId: string,
  assigneeName: string
): Promise<void> => {
  await updateDoc(doc(db, 'patientRecords', recordId), {
    assigneeId, assigneeName, updatedAt: Timestamp.now(),
  });
};

// ── 병원비 정산 ────────────────────────────────────────────────

export const updateBillingInfo = async (
  db: Firestore,
  recordId: string,
  billing: HospitalBilling
): Promise<void> => {
  await updateDoc(doc(db, 'patientRecords', recordId), {
    billing,
    updatedAt: Timestamp.now(),
  });
};

// ── 유형 토글 ──────────────────────────────────────────────────

export const togglePatientType = async (
  db: Firestore,
  recordId: string,
  type: PatientType,
  currentTypes: PatientType[]
): Promise<void> => {
  const next = currentTypes.includes(type)
    ? currentTypes.filter(t => t !== type)
    : [...currentTypes, type];
  await updateDoc(doc(db, 'patientRecords', recordId), {
    types: next, updatedAt: Timestamp.now(),
  });
};

// ── 격리 주기 체크 스케줄 ─────────────────────────────────────

export const addIsolationCheckSchedule = async (
  db: Firestore,
  recordId: string,
  schedule: IsolationCheckSchedule
): Promise<void> => {
  await updateDoc(doc(db, 'patientRecords', recordId), {
    isolationCheckSchedules: arrayUnion(schedule),
    updatedAt: Timestamp.now(),
  });
  logger.info('격리 체크 스케줄 추가:', recordId);
};

export const completeIsolationCheckSchedule = async (
  db: Firestore,
  recordId: string,
  allSchedules: IsolationCheckSchedule[]
): Promise<void> => {
  await updateDoc(doc(db, 'patientRecords', recordId), {
    isolationCheckSchedules: allSchedules,
    updatedAt: Timestamp.now(),
  });
};

// ── 휴약일 관리 ───────────────────────────────────────────────

export const addSkipDate = async (
  db: Firestore,
  recordId: string,
  scheduleIndex: number,
  date: string,          // "2026-08-03"
  allSchedules: MedicationSchedule[]
): Promise<void> => {
  const updated = allSchedules.map((s, i) => {
    if (i !== scheduleIndex) return s;
    const skipDates = Array.isArray(s.skipDates) ? s.skipDates : [];
    return { ...s, skipDates: skipDates.includes(date) ? skipDates : [...skipDates, date] };
  });
  await updateDoc(doc(db, 'patientRecords', recordId), {
    medicationSchedules: updated,
    updatedAt: Timestamp.now(),
  });
};

export const removeSkipDate = async (
  db: Firestore,
  recordId: string,
  scheduleIndex: number,
  date: string,
  allSchedules: MedicationSchedule[]
): Promise<void> => {
  const updated = allSchedules.map((s, i) => {
    if (i !== scheduleIndex) return s;
    const skipDates = Array.isArray(s.skipDates) ? s.skipDates : [];
    return { ...s, skipDates: skipDates.filter(d => d !== date) };
  });
  await updateDoc(doc(db, 'patientRecords', recordId), {
    medicationSchedules: updated,
    updatedAt: Timestamp.now(),
  });
};

// ── 매니저 액션 (지시 → 수행 흐름) ─────────────────────────────

/** 매니저가 새 액션을 발행 */
export const addManagerAction = async (
  db: Firestore,
  recordId: string,
  action: Omit<ManagerAction, 'id' | 'isDone' | 'response'>
): Promise<void> => {
  const current = await import('firebase/firestore').then(m =>
    m.getDoc(m.doc(db, 'patientRecords', recordId))
  );
  const existing: ManagerAction[] = normalizeArray(current.data()?.managerActions ?? []);
  const newAction: ManagerAction = {
    ...action,
    id: `action_${Date.now()}`,
    isDone: false,
  };
  await updateDoc(doc(db, 'patientRecords', recordId), {
    managerActions: [...existing, newAction],
    updatedAt: Timestamp.now(),
  });
};

/** 유저(담당자)가 액션에 응답 (약 복용 완료, 위치 전송 등) */
export const respondManagerAction = async (
  db: Firestore,
  recordId: string,
  actionId: string,
  response: Omit<ManagerActionResponse, 'respondedAt'>,
  respondedBy: string,
  allActions: ManagerAction[]
): Promise<void> => {
  const updated = allActions.map(a => {
    if (a.id !== actionId) return a;
    return {
      ...a,
      response: { ...response, respondedBy, respondedAt: Timestamp.now() },
      isDone: true,
    };
  });
  await updateDoc(doc(db, 'patientRecords', recordId), {
    managerActions: updated,
    updatedAt: Timestamp.now(),
  });
};

/** 매니저가 액션 완료 처리 (전화 완료, 직접 확인 등) */
export const completeManagerAction = async (
  db: Firestore,
  recordId: string,
  actionId: string,
  allActions: ManagerAction[]
): Promise<void> => {
  const updated = allActions.map(a =>
    a.id === actionId ? { ...a, isDone: true } : a
  );
  await updateDoc(doc(db, 'patientRecords', recordId), {
    managerActions: updated,
    updatedAt: Timestamp.now(),
  });
};

/** 매니저가 후속조치 결정 (내원여부·다음체크) */
export const updateManagerActionFollowUp = async (
  db: Firestore,
  recordId: string,
  actionId: string,
  followUp: NonNullable<ManagerAction['followUp']>,
  allActions: ManagerAction[]
): Promise<void> => {
  const updated = allActions.map(a =>
    a.id === actionId ? { ...a, followUp, isDone: true } : a
  );
  await updateDoc(doc(db, 'patientRecords', recordId), {
    managerActions: updated,
    updatedAt: Timestamp.now(),
  });
};

// ── 약별 처방전 사진 URL 관리 (MedicationSchedule.photos) ────────

/**
 * 특정 약 스케줄에 처방전 사진 URL 추가 (전체 배열 교체)
 */
export const addMedicationPhoto = async (
  db: Firestore,
  recordId: string,
  allSchedules: MedicationSchedule[],
  scheduleIndex: number,
  photoUrl: string
): Promise<void> => {
  const updated = allSchedules.map((s, i) => {
    if (i !== scheduleIndex) return s;
    const photos = Array.isArray(s.photos) ? s.photos : [];
    return { ...s, photos: photos.includes(photoUrl) ? photos : [...photos, photoUrl] };
  });
  await updateDoc(doc(db, 'patientRecords', recordId), {
    medicationSchedules: updated,
    updatedAt: Timestamp.now(),
  });
};

/**
 * 특정 약 스케줄에서 처방전 사진 URL 제거 (전체 배열 교체)
 */
export const removeMedicationPhoto = async (
  db: Firestore,
  recordId: string,
  allSchedules: MedicationSchedule[],
  scheduleIndex: number,
  photoUrl: string
): Promise<void> => {
  const updated = allSchedules.map((s, i) => {
    if (i !== scheduleIndex) return s;
    const photos = Array.isArray(s.photos) ? s.photos : [];
    return { ...s, photos: photos.filter(p => p !== photoUrl) };
  });
  await updateDoc(doc(db, 'patientRecords', recordId), {
    medicationSchedules: updated,
    updatedAt: Timestamp.now(),
  });
};

// ── 복용약 스케줄 추가 / 수정 / 삭제 ──────────────────────────

/**
 * 복용약 스케줄 추가 (중복 추가 가능 — push)
 */
export const addMedicationSchedule = async (
  db: Firestore,
  recordId: string,
  schedule: Omit<MedicationSchedule, 'checkedTimes'>
): Promise<void> => {
  const newSchedule: MedicationSchedule = { ...schedule, checkedTimes: [] };
  await updateDoc(doc(db, 'patientRecords', recordId), {
    medicationSchedules: arrayUnion(newSchedule),
    updatedAt: Timestamp.now(),
  });
};

/**
 * 복용약 스케줄 수정 (전체 배열 교체)
 */
export const updateMedicationSchedule = async (
  db: Firestore,
  recordId: string,
  allSchedules: MedicationSchedule[],
  index: number,
  updated: Omit<MedicationSchedule, 'checkedTimes'>
): Promise<void> => {
  const newSchedules = allSchedules.map((s, i) =>
    i === index ? { ...updated, checkedTimes: s.checkedTimes } : s
  );
  await updateDoc(doc(db, 'patientRecords', recordId), {
    medicationSchedules: newSchedules,
    updatedAt: Timestamp.now(),
  });
};

/**
 * 복용약 스케줄 삭제 (전체 배열 교체)
 */
export const removeMedicationSchedule = async (
  db: Firestore,
  recordId: string,
  allSchedules: MedicationSchedule[],
  index: number
): Promise<void> => {
  const newSchedules = allSchedules.filter((_, i) => i !== index);
  await updateDoc(doc(db, 'patientRecords', recordId), {
    medicationSchedules: newSchedules,
    updatedAt: Timestamp.now(),
  });
};

// ── 복귀 판단 기준 체크 (일반 환자에도 적용) ────────────────────

export const updateReturnCriteriaChecks = async (
  db: Firestore,
  recordId: string,
  checks: boolean[]
): Promise<void> => {
  await updateDoc(doc(db, 'patientRecords', recordId), {
    returnCriteriaChecks: checks,
    updatedAt: Timestamp.now(),
  });
};
