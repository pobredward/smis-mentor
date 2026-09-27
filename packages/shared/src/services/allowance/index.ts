/**
 * 학생 용돈 장부 Firestore 서비스 — 타입·계산은 types/allowance.ts
 */
import {
  collection, doc, query, where, getDoc, getDocs, onSnapshot, setDoc, writeBatch, updateDoc,
  arrayUnion, deleteField, Timestamp, type Firestore, type Unsubscribe,
} from 'firebase/firestore';
import type {
  AllowanceLedger, AllowanceTxn, AllowanceCurrency, AllowanceCashCheck, AllowanceSource, AllowanceEvidence,
  AllowanceCategory,
} from '../../types/allowance';
import { allowanceLedgerId, allowanceSourceKey } from '../../types/allowance';
import type { HospitalVisitEntry, PatientRecord } from '../../types/camp';
import type { SupplyRequest } from '../../types/inventory';

const LEDGERS = 'allowanceLedgers';
const TXNS = 'allowanceTxns';

export interface AllowanceActor { uid: string; name: string }

/** Firestore 는 undefined 필드를 거부하므로 제거 */
const clean = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export const subscribeAllowanceLedger = (
  db: Firestore, campCode: string, studentId: string,
  onData: (l: AllowanceLedger | null) => void, onError?: (e: Error) => void,
): Unsubscribe =>
  onSnapshot(doc(db, LEDGERS, allowanceLedgerId(campCode, studentId)),
    snap => onData(snap.exists() ? ({ id: snap.id, ...snap.data() } as AllowanceLedger) : null),
    e => onError?.(e));

export const subscribeAllowanceTxns = (
  db: Firestore, campCode: string, studentId: string,
  onData: (t: AllowanceTxn[]) => void, onError?: (e: Error) => void,
): Unsubscribe =>
  onSnapshot(query(collection(db, TXNS), where('campCode', '==', campCode), where('studentId', '==', studentId)),
    snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data() }) as AllowanceTxn)),
    e => onError?.(e));

/** 한 학생의 학생 물품 요청 (정산 대기 계산용) */
export const getStudentSupplyRequests = async (db: Firestore, campCode: string, studentId: string): Promise<SupplyRequest[]> => {
  const snap = await getDocs(query(collection(db, 'supplyRequests'), where('campCode', '==', campCode), where('studentId', '==', studentId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as SupplyRequest);
};

/** 초기 봉투 구성 저장 (통화 1개) */
export const setAllowanceInitial = async (
  db: Firestore, campCode: string, studentId: string, studentName: string,
  currency: AllowanceCurrency, counts: Record<string, number>, actor: AllowanceActor,
): Promise<void> => {
  await setDoc(doc(db, LEDGERS, allowanceLedgerId(campCode, studentId)), {
    campCode, studentId, studentName,
    initial: { [currency]: counts },
    updatedAt: Timestamp.now(), updatedBy: actor.name,
  }, { merge: true });
};

/** 현금 실사 저장 (통화별 최근 1건 덮어씀) */
export const saveAllowanceCashCheck = async (
  db: Firestore, campCode: string, studentId: string, studentName: string,
  currency: AllowanceCurrency, check: Omit<AllowanceCashCheck, 'at' | 'by' | 'byId'>, actor: AllowanceActor,
): Promise<void> => {
  const now = Timestamp.now();
  await setDoc(doc(db, LEDGERS, allowanceLedgerId(campCode, studentId)), {
    campCode, studentId, studentName,
    cashCheck: { [currency]: clean({ ...check, at: now, by: actor.name, byId: actor.uid }) },
    updatedAt: now, updatedBy: actor.name,
  }, { merge: true });
};

/** 실사 차이 있음 표시 / 해제 */
export const flagAllowanceCashCheck = async (
  db: Firestore, campCode: string, studentId: string, currency: AllowanceCurrency, flagged: boolean, actor: AllowanceActor,
): Promise<void> => {
  await updateDoc(doc(db, LEDGERS, allowanceLedgerId(campCode, studentId)), {
    [`cashCheck.${currency}.flagged`]: flagged,
    updatedAt: Timestamp.now(), updatedBy: actor.name,
  });
};

/** 실사 차이 원인 확인 완료 */
export const resolveAllowanceCashCheck = async (
  db: Firestore, campCode: string, studentId: string, currency: AllowanceCurrency, note: string, actor: AllowanceActor,
): Promise<void> => {
  await updateDoc(doc(db, LEDGERS, allowanceLedgerId(campCode, studentId)), {
    [`cashCheck.${currency}.resolved`]: { at: Timestamp.now(), by: actor.name, note },
    updatedAt: Timestamp.now(), updatedBy: actor.name,
  });
};

export interface AllowanceTxnInput {
  currency: AllowanceCurrency;
  type: 'spend' | 'deposit';
  amount: number;
  category: AllowanceCategory;
  place?: string;
  memo?: string;
  date: Date;
  source?: AllowanceSource;
  evidence?: AllowanceEvidence[];
}

export interface AllowanceStudentRef { studentId: string; studentName: string; classNumber?: string }

/** 거래 등록 — 여러 학생이면 같은 batchId 로 묶음. 반환: 생성된 거래 id 목록 */
export const addAllowanceTxns = async (
  db: Firestore, campCode: string, students: AllowanceStudentRef[], input: AllowanceTxnInput, actor: AllowanceActor,
): Promise<string[]> => {
  const now = Timestamp.now();
  const batch = writeBatch(db);
  const batchId = students.length > 1 ? doc(collection(db, TXNS)).id : undefined;
  const ids: string[] = [];
  students.forEach(s => {
    const ref = doc(collection(db, TXNS));
    ids.push(ref.id);
    batch.set(ref, clean({
      campCode,
      studentId: s.studentId,
      studentName: s.studentName,
      classNumber: s.classNumber || undefined,
      currency: input.currency,
      type: input.type,
      amount: input.amount,
      category: input.category,
      place: input.place?.trim() || undefined,
      memo: input.memo?.trim() || undefined,
      date: Timestamp.fromDate(input.date),
      source: input.source,
      sourceKey: input.source ? allowanceSourceKey(input.source) : undefined,
      batchId,
      evidence: input.evidence?.length ? input.evidence : undefined,
      createdBy: actor.name,
      createdById: actor.uid,
      createdAt: now,
      updatedAt: now,
    }));
  });
  await batch.commit();
  return ids;
};

const summarize = (t: AllowanceTxn) =>
  `${t.type}/${t.category}${t.place ? `/${t.place}` : ''} ${t.amount} ${t.currency} ${t.memo ?? ''}`.trim();

/** 거래 수정 — 바뀌기 전 값을 이력에 남김 */
export const updateAllowanceTxn = async (
  db: Firestore, txn: AllowanceTxn,
  patch: Partial<Pick<AllowanceTxn, 'amount' | 'category' | 'place' | 'memo' | 'currency' | 'type' | 'evidence'>> & { date?: Date },
  actor: AllowanceActor,
): Promise<void> => {
  const now = Timestamp.now();
  const { date, ...rest } = patch;
  await updateDoc(doc(db, TXNS, txn.id), {
    ...Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === undefined || v === '' ? null : v])),
    ...(date ? { date: Timestamp.fromDate(date) } : {}),
    edits: arrayUnion({ at: now, by: actor.name, byId: actor.uid, before: summarize(txn) }),
    updatedAt: now,
  });
};

/** 거래 삭제(소프트) / 복구 */
export const setAllowanceTxnDeleted = async (db: Firestore, txnId: string, deleted: boolean, actor: AllowanceActor): Promise<void> => {
  const now = Timestamp.now();
  await updateDoc(doc(db, TXNS, txnId), {
    deleted: deleted ? { at: now, by: actor.name, byId: actor.uid } : null,
    updatedAt: now,
  });
};

/**
 * 연동 원본도 정산 처리 — 병원: 내원 정산 완료(isPaid), 물품: 봉투 정산 체크.
 * 장부 반영과 함께 호출. 실패해도 장부 거래는 남는다.
 */
export const markAllowanceSourceSettled = async (
  db: Firestore, source: AllowanceSource, settled: boolean, actor: AllowanceActor,
): Promise<void> => {
  const now = Timestamp.now();
  if (source.kind === 'supply') {
    await updateDoc(doc(db, 'supplyRequests', source.requestId), {
      [`settlements.${source.lineId}`]: settled ? { at: now, by: actor.name, byId: actor.uid } : deleteField(),
      updatedAt: now,
    });
    return;
  }
  const snap = await getDoc(doc(db, 'patientRecords', source.recordId));
  if (!snap.exists()) return;
  const rec = snap.data() as PatientRecord;
  const visits = (Array.isArray(rec.hospitalVisits) ? rec.hospitalVisits : Object.values(rec.hospitalVisits ?? {})) as HospitalVisitEntry[];
  const next = visits.map(v => (v.visitId === source.visitId && v.billing
    ? { ...v, billing: { ...v.billing, isPaid: settled, ...(settled ? { pocketMoneyHandler: actor.name } : {}) } }
    : v));
  await updateDoc(doc(db, 'patientRecords', source.recordId), { hospitalVisits: next, updatedAt: now });
};

/** Storage 경로: allowance/{campCode}/{studentId|batch}/{timestamp}_{name} */
export function allowanceEvidencePath(campCode: string, owner: string, fileName: string): string {
  const safe = fileName.replace(/[^\w.\-가-힣]/g, '_').slice(-60) || 'photo.jpg';
  return `allowance/${campCode}/${owner}/${Date.now()}_${safe}`;
}
