'use client';
/**
 * 학생 상세 모달 — 용돈 관리 탭 (web)
 * 요약 카드 · 사용 내역 · 권종별 현금 확인 · 환자/재고 연동 정산 대기 · 사용/입금/일괄 차감 등록
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  L, dataLabel, logger,
  allowanceConfigFor, allowanceRows, allowanceBalance, allowancePendingItems, ledgerInitial, denomTotal,
  formatAllowance, formatDenom, ALLOWANCE_CATEGORIES, ALLOWANCE_EVIDENCE_KINDS,
  subscribeAllowanceLedger, subscribeAllowanceTxns, getStudentSupplyRequests, setAllowanceInitial,
  saveAllowanceCashCheck, flagAllowanceCashCheck, resolveAllowanceCashCheck, addAllowanceTxns, updateAllowanceTxn,
  setAllowanceTxnDeleted, markAllowanceSourceSettled, allowanceEvidencePath,
  type AllowanceLedger, type AllowanceTxn, type AllowanceCashCheck, type AllowanceCurrency, type AllowanceCategory, type AllowanceEvidence,
  type AllowanceEvidenceKind, type AllowancePending, type AllowanceSource, type AllowanceCampConfig,
  type PatientRecord, type SupplyRequest, type MessageKey, type STSheetStudent, type CampType,
} from '@smis-mentor/shared';
import { db, storage } from '@/lib/firebase';

export const CAT_KEY: Record<AllowanceCategory, MessageKey> = {
  hospital: 'allowance.catHospital', pharmacy: 'allowance.catPharmacy', goods: 'allowance.catGoods',
  activity: 'allowance.catActivity', etc: 'allowance.catEtc', deposit: 'allowance.catDeposit', adjust: 'allowance.catAdjust',
};
export const EV_KEY: Record<AllowanceEvidenceKind, MessageKey> = {
  insuranceReceipt: 'allowance.evInsuranceReceipt', itemized: 'allowance.evItemized', pillBag: 'allowance.evPillBag',
  receipt: 'allowance.evReceipt', other: 'allowance.evOther',
};
const CAT_STYLE: Record<AllowanceCategory, string> = {
  hospital: 'bg-rose-50 text-rose-700', pharmacy: 'bg-emerald-50 text-emerald-700', goods: 'bg-violet-50 text-violet-700',
  activity: 'bg-blue-50 text-blue-700', etc: 'bg-gray-100 text-gray-600', deposit: 'bg-teal-50 text-teal-700', adjust: 'bg-amber-50 text-amber-700',
};

const md = (d?: Date | null) => (d ? `${d.getMonth() + 1}/${d.getDate()}` : '-');
const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export interface AllowanceActorInfo { uid: string; name: string }

/** 모달 헤더 배지·탭이 함께 쓰는 용돈 데이터 */
export function useStudentAllowance(campCode: string | null, campType: CampType, student: STSheetStudent | undefined, records: PatientRecord[] | null) {
  const config = useMemo(() => allowanceConfigFor(campType), [campType]);
  const studentId = student?.studentId;
  const [ledger, setLedger] = useState<AllowanceLedger | null>(null);
  const [txnsById, setTxnsById] = useState<Record<string, AllowanceTxn[]>>({});
  const [reqsById, setReqsById] = useState<Record<string, SupplyRequest[]>>({});
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!config || !campCode || !studentId) return;
    const u1 = subscribeAllowanceLedger(db, campCode, studentId, setLedger, e => logger.warn('[allowance] ledger', e));
    const u2 = subscribeAllowanceTxns(db, campCode, studentId, t => setTxnsById(p => ({ ...p, [studentId]: t })), e => logger.warn('[allowance] txns', e));
    return () => { u1(); u2(); };
  }, [config, campCode, studentId]);

  useEffect(() => {
    if (!config || !campCode || !studentId) return;
    getStudentSupplyRequests(db, campCode, studentId)
      .then(r => setReqsById(p => ({ ...p, [studentId]: r })))
      .catch(e => { logger.warn('[allowance] supply', e); setReqsById(p => ({ ...p, [studentId]: [] })); });
  }, [config, campCode, studentId, reload]);

  const txns = studentId ? txnsById[studentId] ?? null : null;
  const reqs = studentId ? reqsById[studentId] ?? null : null;
  const currentLedger = ledger && ledger.studentId === studentId ? ledger : null;
  const pending = useMemo(
    () => (studentId && txns && reqs && records ? allowancePendingItems(studentId, records, reqs, txns) : []),
    [studentId, txns, reqs, records],
  );
  const balances = useMemo(() => {
    if (!config || !txns) return [] as { currency: AllowanceCurrency; balance: number }[];
    return config.currencies.map(c => ({ currency: c.code, balance: allowanceBalance(txns, c.code, denomTotal(ledgerInitial(currentLedger, c))) }));
  }, [config, txns, currentLedger]);

  return { config, ledger: currentLedger, txns, pending, balances, refreshSupply: () => setReload(x => x + 1) };
}

type AllowanceData = ReturnType<typeof useStudentAllowance>;

interface TabProps {
  data: AllowanceData;
  student: STSheetStudent;
  campCode: string;
  /** 일괄 차감 대상 후보 (지금 보고 있는 명단) */
  roster: STSheetStudent[];
  actor: AllowanceActorInfo;
}

type FormState =
  | { mode: 'spend' | 'deposit'; pending?: AllowancePending }
  | { mode: 'bulk' }
  | { mode: 'edit'; txn: AllowanceTxn }
  | { mode: 'initial' };

export default function StudentAllowanceTab({ data, student, campCode, roster, actor }: TabProps) {
  const { config, ledger, txns, pending } = data;
  const [currency, setCurrency] = useState<AllowanceCurrency>(config?.currencies[0]?.code ?? 'KRW');
  const [form, setForm] = useState<FormState | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  if (!config) return <p className="text-sm text-gray-500 text-center py-10">{L('studentModal.nothingToShow')}</p>;
  const cur = config.currencies.find(c => c.code === currency) ?? config.currencies[0];
  const initialCounts = ledgerInitial(ledger, cur);
  const initialTotal = denomTotal(initialCounts);
  const rows = txns ? allowanceRows(txns, cur.code, initialTotal) : [];
  const balance = rows.length ? rows[rows.length - 1].balanceAfter : initialTotal;
  const deletedTxns = (txns ?? []).filter(t => t.deleted && t.currency === cur.code);
  const check = ledger?.cashCheck?.[cur.code];

  return (
    <div className="space-y-3">
      {config.currencies.length > 1 && (
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
          {config.currencies.map(c => (
            <button key={c.code} type="button" onClick={() => setCurrency(c.code)}
              className={`px-3 py-1 text-xs font-semibold rounded-md ${c.code === cur.code ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
              {c.code}
            </button>
          ))}
        </div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <button type="button" onClick={() => setForm({ mode: 'initial' })} className="text-left rounded-xl bg-blue-50 px-3 py-3 hover:ring-2 hover:ring-blue-200">
          <p className="text-[11px] text-blue-700">💳 {L('allowance.initialAmount')} ✎</p>
          <p className="text-lg font-bold text-blue-900 tabular-nums">{formatAllowance(initialTotal, cur.code)}</p>
        </button>
        <div className={`rounded-xl px-3 py-3 ${balance < 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
          <p className={`text-[11px] ${balance < 0 ? 'text-red-700' : 'text-emerald-700'}`}>👛 {L('allowance.balance')}</p>
          <p className={`text-lg font-bold tabular-nums ${balance < 0 ? 'text-red-700' : 'text-emerald-900'}`}>{txns ? formatAllowance(balance, cur.code) : '…'}</p>
        </div>
        <div className="rounded-xl bg-orange-50 px-3 py-3">
          <p className="text-[11px] text-orange-700">🧾 {L('allowance.pending')}</p>
          <p className={`text-lg font-bold tabular-nums ${pending.length ? 'text-red-600' : 'text-orange-900'}`}>{L('allowance.pendingCount', { v0: pending.length })}</p>
        </div>
        <div className="rounded-xl bg-purple-50 px-3 py-3">
          <p className="text-[11px] text-purple-700">💵 {L('allowance.envelopeCash')}</p>
          <p className="text-lg font-bold text-purple-900 tabular-nums">{check ? formatAllowance(check.total, cur.code) : L('allowance.notCounted')}</p>
          {check?.flagged && !check.resolved && <p className="text-[10px] font-semibold text-red-600">⚠ {L('allowance.flagged')}</p>}
        </div>
      </div>

      {/* 사용 내역 */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-100">
          <h4 className="text-sm font-semibold text-gray-900 flex-1">{L('allowance.history')}</h4>
          <span className="text-xs text-gray-400">{L('allowance.totalCount', { v0: rows.length })}</span>
          <button type="button" onClick={() => setForm({ mode: 'deposit' })} className="text-xs px-2.5 py-1.5 rounded-lg border border-teal-200 text-teal-700 hover:bg-teal-50">+ {L('allowance.addDeposit')}</button>
          {roster.length > 1 && (
            <button type="button" onClick={() => setForm({ mode: 'bulk' })} className="text-xs px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50">{L('allowance.bulkSpend')}</button>
          )}
          <button type="button" onClick={() => setForm({ mode: 'spend' })} className="text-xs px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-700 font-semibold hover:bg-blue-50">+ {L('allowance.addSpend')}</button>
        </div>
        {txns === null ? (
          <div className="py-6 flex justify-center"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : rows.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">{L('allowance.noTxns')}</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-500 hidden sm:table-header-group">
              <tr>
                <th className="text-left font-medium px-4 py-2">{L('allowance.colDate')}</th>
                <th className="text-left font-medium px-2 py-2">{L('allowance.colContent')}</th>
                <th className="text-left font-medium px-2 py-2">{L('allowance.colLink')}</th>
                <th className="text-right font-medium px-2 py-2">{L('allowance.colAmount')}</th>
                <th className="text-right font-medium px-2 py-2">{L('allowance.colBalance')}</th>
                <th className="text-left font-medium px-4 py-2 hidden md:table-cell">{L('allowance.colNote')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ txn: t, balanceAfter }) => (
                <tr key={t.id} onClick={() => setForm({ mode: 'edit', txn: t })} className="cursor-pointer hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-600 whitespace-nowrap tabular-nums">{md(t.date?.toDate?.())}</td>
                  <td className="px-2 py-2">
                    <span className="font-medium text-gray-900">{t.place ? dataLabel(t.place) : L(CAT_KEY[t.category])}</span>
                    <span className={`ml-1.5 inline-block text-[10px] px-1.5 py-0.5 rounded-full ${CAT_STYLE[t.category]}`}>{L(CAT_KEY[t.category])}</span>
                    {!!t.evidence?.length && <span className="ml-1 text-[10px] text-gray-400">📎{t.evidence.length}</span>}
                    <p className="sm:hidden text-[11px] text-gray-400 mt-0.5">{t.memo}</p>
                  </td>
                  <td className="px-2 py-2">
                    {t.source && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${t.source.kind === 'patient' ? 'bg-rose-50 text-rose-700' : 'bg-violet-50 text-violet-700'}`}>
                        {L(t.source.kind === 'patient' ? 'allowance.linkPatient' : 'allowance.linkSupply')}
                      </span>
                    )}
                  </td>
                  <td className={`px-2 py-2 text-right font-semibold tabular-nums whitespace-nowrap ${t.type === 'deposit' ? 'text-teal-600' : 'text-red-600'}`}>
                    {formatAllowance(t.type === 'deposit' ? t.amount : -t.amount, cur.code, { signed: true })}
                  </td>
                  <td className="px-2 py-2 text-right text-gray-700 tabular-nums whitespace-nowrap">{formatAllowance(balanceAfter, cur.code)}</td>
                  <td className="px-4 py-2 text-gray-500 hidden md:table-cell max-w-[12rem] truncate">{t.memo || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {deletedTxns.length > 0 && (
          <div className="border-t border-gray-100 px-4 py-2">
            <button type="button" onClick={() => setShowDeleted(v => !v)} className="text-[11px] text-gray-400 hover:text-gray-600">
              {L('allowance.showDeleted')} ({deletedTxns.length}) {showDeleted ? '▴' : '▾'}
            </button>
            {showDeleted && deletedTxns.map(t => (
              <button key={t.id} type="button" onClick={() => setForm({ mode: 'edit', txn: t })}
                className="w-full flex justify-between text-[11px] text-gray-400 line-through py-1">
                <span>{md(t.date?.toDate?.())} {t.place ? dataLabel(t.place) : L(CAT_KEY[t.category])}</span>
                <span>{formatAllowance(t.type === 'deposit' ? t.amount : -t.amount, cur.code, { signed: true })}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <CashCheckCard key={`${student.studentId}-${cur.code}-${check?.at?.toMillis?.() ?? 0}-${txns === null ? 'l' : rows.length}`}
          denoms={cur.denoms} currency={cur.code} balance={balance} check={check}
          prefill={txns !== null && rows.length === 0 ? initialCounts : undefined}
          onSave={async counts => {
            await saveAllowanceCashCheck(db, campCode, student.studentId, student.name, cur.code,
              { counts, total: denomTotal(counts), ledgerBalance: balance }, actor);
          }}
          onFlag={flag => flagAllowanceCashCheck(db, campCode, student.studentId, cur.code, flag, actor)}
          onResolve={note => resolveAllowanceCashCheck(db, campCode, student.studentId, cur.code, note, actor)}
        />

        {/* 환자·재고 연동 정산 대기 */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100">
            <h4 className="text-sm font-semibold text-gray-900">{L('allowance.pendingTitle')}</h4>
            <p className="text-[11px] text-gray-400 mt-0.5">{L('allowance.pendingHint')}</p>
          </div>
          {pending.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">{L('allowance.noPending')}</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {pending.map(p => (
                <li key={p.key} className="px-4 py-2.5 flex items-center gap-3">
                  <span className="text-lg">{p.category === 'hospital' ? '🏥' : '📦'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                    <p className="text-[11px] text-gray-500">
                      {md(p.date?.toDate?.())} · {L(p.category === 'hospital' ? 'allowance.linkPatient' : 'allowance.linkSupply')}
                      {p.alreadySettled && <span className="ml-1 text-amber-600">· {L('allowance.alreadySettled')}</span>}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">{p.amount.toLocaleString('en-US')}</span>
                  <button type="button" onClick={() => setForm({ mode: 'spend', pending: p })}
                    className="text-xs px-2.5 py-1.5 rounded-lg bg-orange-500 text-white font-semibold hover:bg-orange-600 whitespace-nowrap">
                    {L('allowance.deduct')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {form?.mode === 'initial' && (
        <InitialModal currency={cur.code} denoms={cur.denoms} counts={initialCounts} onClose={() => setForm(null)}
          onSave={async counts => { await setAllowanceInitial(db, campCode, student.studentId, student.name, cur.code, counts, actor); setForm(null); }} />
      )}
      {form && form.mode !== 'initial' && (
        <TxnModal form={form} config={config} defaultCurrency={cur.code} student={student} roster={roster}
          campCode={campCode} actor={actor} onClose={() => setForm(null)} onSourceSettled={data.refreshSupply} />
      )}
    </div>
  );
}

// ── 권종별 현금 확인 ─────────────────────────────────────────────
function CashCheckCard({ denoms, currency, balance, check, prefill, onSave, onFlag, onResolve }: {
  denoms: number[]; currency: AllowanceCurrency; balance: number;
  /** 실사 기록·사용 내역이 없으면 캠프 기본 봉투 구성으로 채워 둠 */
  prefill?: Record<string, number>;
  check?: AllowanceCashCheck;
  onSave: (counts: Record<string, number>) => Promise<void>;
  onFlag: (flag: boolean) => Promise<void>;
  onResolve: (note: string) => Promise<void>;
}) {
  const [counts, setCounts] = useState<Record<string, number>>(() => ({ ...(check?.counts ?? prefill ?? {}) }));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const total = denomTotal(counts);
  const diff = total - balance;
  const savedDiff = check ? check.total - balance : 0;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { logger.error('[allowance] cash check', e); alert(L('allowance.saveFailed')); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-gray-900">{L('allowance.cashCheck')}</h4>
          <p className="text-[11px] text-gray-400 mt-0.5">{L('allowance.cashCheckHint')}</p>
        </div>
      </div>
      <table className="w-full text-xs">
        <thead className="bg-gray-50 text-gray-500">
          <tr><th className="text-left font-medium px-4 py-1.5">{L('allowance.denom')}</th><th className="font-medium py-1.5">{L('allowance.sheets')}</th><th className="text-right font-medium px-4 py-1.5">{L('allowance.amount')}</th></tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {denoms.map(d => (
            <tr key={d}>
              <td className="px-4 py-1.5 text-gray-700">{formatDenom(d, currency)}</td>
              <td className="py-1.5 text-center">
                <input type="number" min={0} inputMode="numeric" value={counts[d] ?? ''} placeholder="0"
                  onChange={e => setCounts(p => ({ ...p, [d]: Math.max(0, Number(e.target.value) || 0) }))}
                  className="w-16 border border-gray-200 rounded px-2 py-1 text-center tabular-nums" />
              </td>
              <td className="px-4 py-1.5 text-right tabular-nums text-gray-700">{formatAllowance(d * (counts[d] ?? 0), currency)}</td>
            </tr>
          ))}
          <tr className="bg-blue-50 font-semibold">
            <td className="px-4 py-2 text-gray-900">{L('allowance.total')}</td>
            <td className="py-2 text-center text-blue-700 tabular-nums">{Object.values(counts).reduce((a, n) => a + (n || 0), 0)}</td>
            <td className="px-4 py-2 text-right text-gray-900 tabular-nums">{formatAllowance(total, currency)}</td>
          </tr>
        </tbody>
      </table>
      <div className="px-4 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <span className={`flex-1 text-xs font-medium ${diff === 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {diff === 0 ? `✓ ${L('allowance.matches')}` : `⚠ ${L('allowance.differs', { v0: formatAllowance(diff, currency, { signed: true }) })}`}
          </span>
          <button type="button" disabled={busy} onClick={() => run(() => onSave(counts))}
            className="text-xs px-3 py-1.5 rounded-lg bg-gray-900 text-white font-semibold disabled:opacity-50">{L('allowance.saveCount')}</button>
        </div>
        {check && (
          <div className="text-[11px] text-gray-500 space-y-1.5">
            <p>{L('allowance.lastCounted', { v0: `${md(check.at?.toDate?.())} ${check.by}`, v1: formatAllowance(check.total, currency) })}
              {savedDiff !== 0 && <span className="text-red-600"> · {L('allowance.differs', { v0: formatAllowance(savedDiff, currency, { signed: true }) })}</span>}
            </p>
            {savedDiff !== 0 && !check.flagged && !check.resolved && (
              <button type="button" disabled={busy} onClick={() => run(() => onFlag(true))} className="px-2.5 py-1 rounded-lg bg-red-50 text-red-700 font-semibold">⚠ {L('allowance.flagDiff')}</button>
            )}
            {check.flagged && !check.resolved && (
              <div className="rounded-lg bg-red-50 p-2 space-y-1.5">
                <p className="font-semibold text-red-700">⚠ {L('allowance.flagged')}</p>
                <div className="flex gap-1.5">
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder={L('allowance.resolveNotePh')}
                    className="flex-1 border border-red-200 rounded px-2 py-1 text-xs bg-white" />
                  <button type="button" disabled={busy || !note.trim()} onClick={() => run(() => onResolve(note.trim()))}
                    className="px-2.5 py-1 rounded bg-red-600 text-white font-semibold disabled:opacity-40">{L('allowance.resolve')}</button>
                </div>
                <button type="button" disabled={busy} onClick={() => run(() => onFlag(false))} className="text-red-500 underline">{L('allowance.unflag')}</button>
              </div>
            )}
            {check.resolved && <p className="text-emerald-700">✓ {L('allowance.resolvedBy', { v0: check.resolved.by, v1: check.resolved.note })}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 초기 금액 ────────────────────────────────────────────────────
function InitialModal({ currency, denoms, counts, onClose, onSave }: {
  currency: AllowanceCurrency; denoms: number[]; counts: Record<string, number>;
  onClose: () => void; onSave: (c: Record<string, number>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, number>>({ ...counts });
  const [busy, setBusy] = useState(false);
  return (
    <Overlay title={L('allowance.editInitial')} onClose={onClose}>
      <p className="text-xs text-gray-500 mb-3">{L('allowance.initialHint')}</p>
      <div className="space-y-2">
        {denoms.map(d => (
          <div key={d} className="flex items-center gap-2">
            <span className="w-28 text-sm text-gray-700">{formatDenom(d, currency)}</span>
            <input type="number" min={0} value={draft[d] ?? ''} placeholder="0"
              onChange={e => setDraft(p => ({ ...p, [d]: Math.max(0, Number(e.target.value) || 0) }))}
              className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center tabular-nums" />
            <span className="flex-1 text-right text-sm text-gray-500 tabular-nums">{formatAllowance(d * (draft[d] ?? 0), currency)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t pt-2 text-sm font-bold"><span>{L('allowance.total')}</span><span className="tabular-nums">{formatAllowance(denomTotal(draft), currency)}</span></div>
      </div>
      <FormButtons busy={busy} onCancel={onClose} onSave={async () => {
        setBusy(true);
        try { await onSave(Object.fromEntries(Object.entries(draft).filter(([, n]) => n > 0))); }
        catch (e) { logger.error('[allowance] initial', e); alert(L('allowance.saveFailed')); setBusy(false); }
      }} />
    </Overlay>
  );
}

// ── 거래 등록/수정 ───────────────────────────────────────────────
function TxnModal({ form, config, defaultCurrency, student, roster, campCode, actor, onClose, onSourceSettled }: {
  form: Exclude<FormState, { mode: 'initial' }>; config: AllowanceCampConfig; defaultCurrency: AllowanceCurrency;
  student: STSheetStudent; roster: STSheetStudent[]; campCode: string; actor: AllowanceActorInfo;
  onClose: () => void; onSourceSettled: () => void;
}) {
  const editing = form.mode === 'edit' ? form.txn : null;
  const pendingItem = form.mode === 'spend' ? form.pending : undefined;
  const isDeposit = form.mode === 'deposit' || editing?.type === 'deposit';
  const isBulk = form.mode === 'bulk';

  const [currency, setCurrency] = useState<AllowanceCurrency>(editing?.currency ?? defaultCurrency);
  const [category, setCategory] = useState<AllowanceCategory>(editing?.category ?? pendingItem?.category ?? (isDeposit ? 'deposit' : isBulk ? 'activity' : 'hospital'));
  const [place, setPlace] = useState(editing?.place ?? '');
  const [amount, setAmount] = useState(editing ? String(editing.amount) : pendingItem ? String(pendingItem.amount) : '');
  const [date, setDate] = useState(toInputDate(editing?.date?.toDate?.() ?? pendingItem?.date?.toDate?.() ?? new Date()));
  const [memo, setMemo] = useState(editing?.memo ?? pendingItem?.title ?? '');
  const [evidence, setEvidence] = useState<AllowanceEvidence[]>(editing?.evidence ?? []);
  const [files, setFiles] = useState<{ file: File; kind: AllowanceEvidenceKind }[]>([]);
  const evKinds = ALLOWANCE_EVIDENCE_KINDS[category];
  const [evKind, setEvKind] = useState<AllowanceEvidenceKind>(evKinds[0]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(roster.map(s => s.studentId)));
  const [busy, setBusy] = useState(false);

  const curEvKind = evKinds.includes(evKind) ? evKind : evKinds[0];

  const title = editing ? L('allowance.txnDetail') : isBulk ? L('allowance.bulkTitle') : isDeposit ? L('allowance.depositTitle') : L('allowance.spendTitle');

  const save = useCallback(async () => {
    const n = Number(amount);
    if (!(n > 0)) { alert(L('allowance.amountRequired')); return; }
    const targets = isBulk ? roster.filter(s => selected.has(s.studentId)) : [student];
    if (targets.length === 0) { alert(L('allowance.studentsRequired')); return; }
    setBusy(true);
    try {
      const uploaded: AllowanceEvidence[] = [];
      for (const f of files) {
        const path = allowanceEvidencePath(campCode, isBulk ? 'batch' : student.studentId, f.file.name);
        const r = storageRef(storage, path);
        await uploadBytes(r, f.file, { contentType: f.file.type || 'image/jpeg' });
        uploaded.push({ kind: f.kind, path, url: await getDownloadURL(r) });
      }
      const allEvidence = [...evidence, ...uploaded];
      const [y, m, d] = date.split('-').map(Number);
      const when = new Date(y, (m || 1) - 1, d || 1, 12);
      if (editing) {
        await updateAllowanceTxn(db, editing, {
          amount: n, category, place: category === 'activity' ? place : '', memo, currency, evidence: allEvidence, date: when,
        }, actor);
      } else {
        const source: AllowanceSource | undefined = pendingItem?.source;
        await addAllowanceTxns(db, campCode,
          targets.map(s => ({ studentId: s.studentId, studentName: s.name, classNumber: s.classNumber })),
          { currency, type: isDeposit ? 'deposit' : 'spend', amount: n, category, place: category === 'activity' ? place : undefined, memo, date: when, source, evidence: allEvidence },
          actor);
        if (source && !pendingItem?.alreadySettled) {
          await markAllowanceSourceSettled(db, source, true, actor).catch(e => logger.warn('[allowance] source settle', e));
          onSourceSettled();
        }
      }
      onClose();
    } catch (e) {
      logger.error('[allowance] save txn', e);
      alert(L('allowance.saveFailed'));
      setBusy(false);
    }
  }, [amount, isBulk, roster, selected, student, files, evidence, date, editing, category, place, memo, currency, campCode, actor, pendingItem, isDeposit, onClose, onSourceSettled]);

  const toggleDeleted = async () => {
    if (!editing) return;
    if (!editing.deleted && !confirm(L('allowance.confirmDelete'))) return;
    setBusy(true);
    try {
      await setAllowanceTxnDeleted(db, editing.id, !editing.deleted, actor);
      if (editing.source && !editing.deleted) {
        await markAllowanceSourceSettled(db, editing.source, false, actor).catch(e => logger.warn('[allowance] source unsettle', e));
        onSourceSettled();
      }
      onClose();
    } catch (e) { logger.error('[allowance] delete', e); alert(L('allowance.saveFailed')); setBusy(false); }
  };

  return (
    <Overlay title={title} onClose={onClose}>
      <div className="space-y-3">
        {pendingItem && <p className="text-xs rounded-lg bg-orange-50 text-orange-800 px-3 py-2">{L('allowance.fromLink', { v0: pendingItem.title })}</p>}
        {isBulk && <p className="text-xs text-gray-500">{L('allowance.bulkHint')}</p>}

        {config.currencies.length > 1 && (
          <Field label={L('allowance.currency')}>
            <div className="flex gap-1.5">
              {config.currencies.map(c => (
                <Chip key={c.code} on={currency === c.code} onClick={() => setCurrency(c.code)}>{c.code}</Chip>
              ))}
            </div>
          </Field>
        )}

        {!isDeposit && (
          <Field label={L('allowance.category')}>
            <div className="flex flex-wrap gap-1.5">
              {ALLOWANCE_CATEGORIES.map(c => (
                <Chip key={c} on={category === c} onClick={() => setCategory(c)}>{L(CAT_KEY[c])}</Chip>
              ))}
            </div>
          </Field>
        )}

        {category === 'activity' && (
          <Field label={L('allowance.place')}>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {config.activityPlaces.map(p => (
                <Chip key={p} on={place === p} onClick={() => setPlace(p)}>{dataLabel(p)}</Chip>
              ))}
            </div>
            <input value={config.activityPlaces.includes(place) ? '' : place} onChange={e => setPlace(e.target.value)}
              placeholder={L('allowance.placeCustom')} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Field label={isBulk ? L('allowance.perStudent') : L('allowance.amount')}>
            <input type="number" min={0} inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm tabular-nums" />
          </Field>
          <Field label={L('allowance.date')}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
          </Field>
        </div>
        {!isDeposit && (
          <p className="-mt-1 text-[11px] text-amber-700">💡 {currency === 'KRW' ? L('allowance.roundHint') : L('allowance.roundHintOther')}</p>
        )}

        <Field label={L('allowance.memo')}>
          <input value={memo} onChange={e => setMemo(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </Field>

        <Field label={L('allowance.evidence')}>
          <div className="flex flex-wrap gap-2 mb-2">
            {evidence.map(ev => (
              <div key={ev.path} className="relative">
                <a href={ev.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ev.url} alt="" className="w-16 h-16 object-cover rounded-lg border" />
                </a>
                <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-black/50 text-white rounded-b-lg">{L(EV_KEY[ev.kind])}</span>
                <button type="button" onClick={() => setEvidence(p => p.filter(x => x.path !== ev.path))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800 text-white text-[10px]">✕</button>
              </div>
            ))}
            {files.map((f, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={URL.createObjectURL(f.file)} alt="" className="w-16 h-16 object-cover rounded-lg border" />
                <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-black/50 text-white rounded-b-lg">{L(EV_KEY[f.kind])}</span>
                <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800 text-white text-[10px]">✕</button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {evKinds.length > 1 && evKinds.map(k => <Chip key={k} on={curEvKind === k} onClick={() => setEvKind(k)}>{L(EV_KEY[k])}</Chip>)}
            <label className="text-xs px-2.5 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-600 cursor-pointer hover:bg-gray-50">
              📷 {L('allowance.addPhoto')}
              <input type="file" accept="image/*" multiple className="hidden"
                onChange={e => { const list = Array.from(e.target.files ?? []); setFiles(p => [...p, ...list.map(file => ({ file, kind: curEvKind }))]); e.target.value = ''; }} />
            </label>
          </div>
        </Field>

        {isBulk && (
          <Field label={`${L('allowance.students')} · ${L('allowance.selectedCount', { v0: selected.size })}`}>
            <label className="flex items-center gap-2 text-xs text-gray-600 mb-1">
              <input type="checkbox" checked={selected.size === roster.length}
                onChange={e => setSelected(e.target.checked ? new Set(roster.map(s => s.studentId)) : new Set())} />
              {L('allowance.selectAll')}
            </label>
            <div className="max-h-40 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1 border rounded-lg p-2">
              {roster.map(s => (
                <label key={s.studentId} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={selected.has(s.studentId)}
                    onChange={e => setSelected(p => { const n = new Set(p); if (e.target.checked) n.add(s.studentId); else n.delete(s.studentId); return n; })} />
                  <span className="truncate">{s.name}</span>
                </label>
              ))}
            </div>
          </Field>
        )}

        {editing && (
          <div className="text-[11px] text-gray-400 space-y-0.5">
            <p>{L('allowance.createdBy', { v0: editing.createdBy })} · {md(editing.createdAt?.toDate?.())}</p>
            {!!editing.edits?.length && (
              <details><summary className="cursor-pointer">{L('allowance.editHistory')} ({editing.edits.length})</summary>
                {editing.edits.map((e, i) => <p key={i}>{md(e.at?.toDate?.())} {e.by}: {e.before}</p>)}
              </details>
            )}
          </div>
        )}
      </div>
      <FormButtons busy={busy} onCancel={onClose} onSave={save}
        extra={editing ? (
          <button type="button" disabled={busy} onClick={toggleDeleted}
            className={`mr-auto text-sm px-3 py-2 rounded-lg ${editing.deleted ? 'text-blue-600 hover:bg-blue-50' : 'text-red-600 hover:bg-red-50'}`}>
            {editing.deleted ? L('allowance.restore') : L('common.delete')}
          </button>
        ) : null}
        busyLabel={files.length ? L('allowance.uploading') : undefined} />
    </Overlay>
  );
}

// ── 공통 UI ──────────────────────────────────────────────────────
function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div data-modal-overlay className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className="bg-white w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><p className="text-xs font-medium text-gray-500 mb-1">{label}</p>{children}</div>;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
      {children}
    </button>
  );
}

function FormButtons({ busy, onCancel, onSave, extra, busyLabel }: { busy: boolean; onCancel: () => void; onSave: () => void; extra?: React.ReactNode; busyLabel?: string }) {
  return (
    <div className="flex items-center gap-2 mt-5">
      {extra}
      <button type="button" onClick={onCancel} disabled={busy} className="ml-auto text-sm px-4 py-2 rounded-lg bg-gray-100 text-gray-700">{L('common.cancel')}</button>
      <button type="button" onClick={onSave} disabled={busy} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">
        {busy ? (busyLabel ?? '…') : L('common.save')}
      </button>
    </div>
  );
}
