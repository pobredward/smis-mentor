/**
 * 학생 용돈 장부 — 학생 상세 모달 "용돈 관리" 탭 (web·mobile 공용)
 *
 * - allowanceLedgers/{campCode}_{studentId}: 학생별 초기 봉투 구성(통화·권종별 장수)과 최근 현금 실사
 * - allowanceTxns/{id}: 사용·입금 거래 1건 (삭제는 소프트 삭제, 수정은 이력 남김)
 * - 잔액 = 초기 금액 + 입금 − 사용 (통화별로 따로)
 * - 병원비(용돈봉투 청구)·학생 물품(봉투 정산)은 "정산 대기"로 뜨고, 차감하면 거래가 생기며 원래 기록도 정산 처리
 */
import type { Timestamp } from 'firebase/firestore';
import type { CampType } from './student';
import type { PatientRecord } from './camp';
import type { SupplyRequest } from './inventory';

export type AllowanceCurrency = 'KRW' | 'SGD' | 'MYR';

export interface AllowanceCurrencyConfig {
  code: AllowanceCurrency;
  /** 권종 (큰 것부터) */
  denoms: number[];
  /** 기본 초기 구성 — 권종 → 장수 */
  defaultInitial: Record<string, number>;
}

export interface AllowanceCampConfig {
  currencies: AllowanceCurrencyConfig[];
  /** 액티비티 장소 프리셋 */
  activityPlaces: string[];
}

const KRW: AllowanceCurrencyConfig = { code: 'KRW', denoms: [50000, 10000, 5000, 1000], defaultInitial: { 10000: 9, 1000: 10 } };
const SGD: AllowanceCurrencyConfig = { code: 'SGD', denoms: [100, 50, 10, 5, 2], defaultInitial: { 50: 1, 10: 10 } };
const MYR: AllowanceCurrencyConfig = { code: 'MYR', denoms: [100, 50, 20, 10, 5, 1], defaultInitial: { 50: 4 } };

/** 캠프 타입별 용돈 기본 설정 — F캠프는 용돈 없음(null). DG는 S캠프 안의 그룹이라 S와 같음 */
export function allowanceConfigFor(campType: CampType): AllowanceCampConfig | null {
  switch (campType) {
    case 'F': return null;
    case 'S':
    case 'DG':
      return { currencies: [SGD, MYR], activityPlaces: ['유니버셜 스튜디오', '레고랜드 테마파크', '레고랜드 워터파크'] };
    default:
      return { currencies: [KRW], activityPlaces: ['바운스 슈퍼파크', '항공우주 박물관', '런닝맨 테마파크'] };
  }
}

export const ALLOWANCE_CURRENCY_LABEL: Record<AllowanceCurrency, { prefix: string; suffix: string }> = {
  KRW: { prefix: '', suffix: '원' },
  SGD: { prefix: 'S$', suffix: '' },
  MYR: { prefix: 'RM', suffix: '' },
};

/** 금액 표시 — 100000 → "100,000원", 150 → "S$150" */
export function formatAllowance(amount: number, currency: AllowanceCurrency, opts: { signed?: boolean } = {}): string {
  const { prefix, suffix } = ALLOWANCE_CURRENCY_LABEL[currency];
  const abs = Math.abs(amount);
  const body = abs.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const sign = amount < 0 ? '-' : opts.signed && amount > 0 ? '+' : '';
  return `${sign}${prefix}${body}${suffix}`;
}

/** 권종 라벨 — 10000 → "10,000원권", 50 → "S$50" */
export function formatDenom(denom: number, currency: AllowanceCurrency): string {
  if (currency === 'KRW') return `${denom.toLocaleString('en-US')}원권`;
  return formatAllowance(denom, currency);
}

export const denomTotal = (counts: Record<string, number> | undefined): number =>
  Object.entries(counts ?? {}).reduce((a, [d, n]) => a + Number(d) * (Number(n) || 0), 0);

// ── 거래 ────────────────────────────────────────────────────────
export const ALLOWANCE_CATEGORIES = ['hospital', 'pharmacy', 'goods', 'activity', 'etc'] as const;
export type AllowanceCategory = (typeof ALLOWANCE_CATEGORIES)[number] | 'deposit' | 'adjust';

/** 증빙 사진 종류 — 분류별로 고를 수 있는 것 */
export type AllowanceEvidenceKind = 'insuranceReceipt' | 'itemized' | 'pillBag' | 'receipt' | 'other';
export const ALLOWANCE_EVIDENCE_KINDS: Record<AllowanceCategory, AllowanceEvidenceKind[]> = {
  hospital: ['insuranceReceipt', 'itemized', 'other'],
  pharmacy: ['pillBag', 'receipt'],
  goods: ['receipt'],
  activity: ['receipt'],
  etc: ['receipt'],
  deposit: ['receipt'],
  adjust: ['receipt'],
};

export interface AllowanceEvidence {
  kind: AllowanceEvidenceKind;
  url: string;
  path: string;
}

/** 연동 원본 — 병원 내원(용돈봉투 청구) 또는 학생 물품 요청 한 줄 */
export type AllowanceSource =
  | { kind: 'patient'; recordId: string; visitId: string }
  | { kind: 'supply'; requestId: string; lineId: string };

export const allowanceSourceKey = (s: AllowanceSource): string =>
  s.kind === 'patient' ? `patient:${s.recordId}:${s.visitId}` : `supply:${s.requestId}:${s.lineId}`;

export interface AllowanceEdit {
  at: Timestamp;
  by: string;
  byId: string;
  /** 바뀌기 전 값 요약 */
  before: string;
}

export interface AllowanceTxn {
  id: string;
  campCode: string;
  studentId: string;
  studentName: string;
  classNumber?: string;
  currency: AllowanceCurrency;
  /** 사용(−) / 입금(+) */
  type: 'spend' | 'deposit';
  /** 항상 양수 */
  amount: number;
  category: AllowanceCategory;
  /** 액티비티 장소 등 */
  place?: string;
  memo?: string;
  /** 사용 날짜 */
  date: Timestamp;
  source?: AllowanceSource;
  sourceKey?: string;
  /** 일괄 등록 묶음 */
  batchId?: string;
  evidence?: AllowanceEvidence[];
  createdBy: string;
  createdById: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  edits?: AllowanceEdit[];
  deleted?: { at: Timestamp; by: string; byId: string };
}

/** 권종별 현금 실사 (통화별 최근 1건) */
export interface AllowanceCashCheck {
  counts: Record<string, number>;
  total: number;
  /** 실사 당시 장부 잔액 */
  ledgerBalance: number;
  at: Timestamp;
  by: string;
  byId: string;
  /** 차이 있음 표시 (나중에 원인 확인) */
  flagged?: boolean;
  resolved?: { at: Timestamp; by: string; note: string };
}

export interface AllowanceLedger {
  id: string;
  campCode: string;
  studentId: string;
  studentName?: string;
  /** 통화별 초기 봉투 구성 — 없으면 캠프 기본값 */
  initial?: Partial<Record<AllowanceCurrency, Record<string, number>>>;
  cashCheck?: Partial<Record<AllowanceCurrency, AllowanceCashCheck>>;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

export const allowanceLedgerId = (campCode: string, studentId: string) => `${campCode}_${studentId}`;

/** 통화별 초기 구성 (저장값 우선, 없으면 캠프 기본값) */
export function ledgerInitial(ledger: AllowanceLedger | null | undefined, cur: AllowanceCurrencyConfig): Record<string, number> {
  return ledger?.initial?.[cur.code] ?? cur.defaultInitial;
}

export const txnSigned = (t: Pick<AllowanceTxn, 'type' | 'amount'>): number => (t.type === 'deposit' ? t.amount : -t.amount);

const byDate = (a: Pick<AllowanceTxn, 'date' | 'createdAt'>, b: Pick<AllowanceTxn, 'date' | 'createdAt'>) =>
  (a.date?.toMillis?.() ?? 0) - (b.date?.toMillis?.() ?? 0) ||
  (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0);

/** 한 통화의 거래 (삭제 제외, 오래된 순) + 거래 후 잔액 */
export function allowanceRows(
  txns: AllowanceTxn[],
  currency: AllowanceCurrency,
  initialTotal: number,
): { txn: AllowanceTxn; balanceAfter: number }[] {
  const list = txns
    .filter(t => !t.deleted && t.currency === currency)
    .sort(byDate);
  let bal = initialTotal;
  return list.map(txn => { bal += txnSigned(txn); return { txn, balanceAfter: bal }; });
}

export function allowanceBalance(txns: AllowanceTxn[], currency: AllowanceCurrency, initialTotal: number): number {
  return txns.filter(t => !t.deleted && t.currency === currency).reduce((a, t) => a + txnSigned(t), initialTotal);
}

// ── 정산 대기 (환자·재고 연동) ─────────────────────────────────
export interface AllowancePending {
  key: string;
  source: AllowanceSource;
  category: 'hospital' | 'goods';
  title: string;
  amount: number;
  date?: Timestamp;
  /** 원래 기록에서 이미 정산 처리됨 (장부에만 반영 안 됨) */
  alreadySettled: boolean;
}

/** 이 학생의 연동 건 중 아직 장부에 반영되지 않은 것 */
export function allowancePendingItems(
  studentId: string,
  records: PatientRecord[],
  requests: SupplyRequest[],
  txns: AllowanceTxn[],
): AllowancePending[] {
  const recorded = new Set(txns.filter(t => !t.deleted && t.sourceKey).map(t => t.sourceKey!));
  const out: AllowancePending[] = [];
  records.forEach(r => {
    if (r.studentId !== studentId) return;
    (r.hospitalVisits ?? []).forEach(v => {
      const b = v.billing;
      if (!b || b.method !== '용돈봉투' || !(b.amount && b.amount > 0)) return;
      const source: AllowanceSource = { kind: 'patient', recordId: r.id, visitId: v.visitId };
      const key = allowanceSourceKey(source);
      if (recorded.has(key)) return;
      out.push({
        key, source, category: 'hospital',
        title: [v.hospitalName, r.symptom].filter(Boolean).join(' · ') || r.symptom || '-',
        amount: b.amount, date: v.completedAt ?? v.scheduledAt ?? r.visitDate, alreadySettled: !!b.isPaid,
      });
    });
  });
  requests.forEach(req => {
    if (req.forType !== 'student' || req.studentId !== studentId || req.status === 'rejected') return;
    req.items.forEach(line => {
      if (line.parentBill) return;
      const done = req.done?.[line.id];
      if (!done || !(done.amount && done.amount > 0)) return;
      const source: AllowanceSource = { kind: 'supply', requestId: req.id, lineId: line.id };
      const key = allowanceSourceKey(source);
      if (recorded.has(key)) return;
      out.push({
        key, source, category: 'goods',
        title: line.name, amount: done.amount, date: done.at, alreadySettled: !!req.settlements?.[line.id],
      });
    });
  });
  return out.sort((a, b) => (a.date?.toMillis?.() ?? 0) - (b.date?.toMillis?.() ?? 0));
}
