/**
 * 학생 상세 모달 — 용돈 관리 탭 (mobile)
 * web(StudentAllowanceTab)과 같은 정보·기능, 화면만 모바일에 맞춤
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  L, dataLabel, logger,
  allowanceConfigFor, allowanceRows, allowanceBalance, allowancePendingItems, ledgerInitial, denomTotal,
  formatAllowance, formatDenom, ALLOWANCE_CATEGORIES, ALLOWANCE_EVIDENCE_KINDS,
  subscribeAllowanceLedger, subscribeAllowanceTxns, getStudentSupplyRequests, setAllowanceInitial,
  saveAllowanceCashCheck, flagAllowanceCashCheck, resolveAllowanceCashCheck, addAllowanceTxns, updateAllowanceTxn,
  setAllowanceTxnDeleted, markAllowanceSourceSettled, allowanceEvidencePath,
  type AllowanceLedger, type AllowanceTxn, type AllowanceCurrency, type AllowanceCategory, type AllowanceEvidence,
  type AllowanceEvidenceKind, type AllowancePending, type AllowanceSource, type AllowanceCampConfig, type AllowanceCashCheck,
  type PatientRecord, type SupplyRequest, type MessageKey, type STSheetStudent, type CampType,
} from '@smis-mentor/shared';
import { db, storage } from '../config/firebase';
import { uriToBlob } from '../utils';

export const CAT_KEY: Record<AllowanceCategory, MessageKey> = {
  hospital: 'allowance.catHospital', pharmacy: 'allowance.catPharmacy', goods: 'allowance.catGoods',
  activity: 'allowance.catActivity', etc: 'allowance.catEtc', deposit: 'allowance.catDeposit', adjust: 'allowance.catAdjust',
};
const EV_KEY: Record<AllowanceEvidenceKind, MessageKey> = {
  insuranceReceipt: 'allowance.evInsuranceReceipt', itemized: 'allowance.evItemized', pillBag: 'allowance.evPillBag',
  receipt: 'allowance.evReceipt', other: 'allowance.evOther',
};
const CAT_COLOR: Record<AllowanceCategory, [string, string]> = {
  hospital: ['#fff1f2', '#be123c'], pharmacy: ['#ecfdf5', '#047857'], goods: ['#f5f3ff', '#6d28d9'],
  activity: ['#eff6ff', '#1d4ed8'], etc: ['#f3f4f6', '#4b5563'], deposit: ['#f0fdfa', '#0f766e'], adjust: ['#fffbeb', '#b45309'],
};
const WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];
const md = (d?: Date | null) => (d ? `${d.getMonth() + 1}/${d.getDate()}` : '-');

export interface AllowanceActorInfo { uid: string; name: string }

/** 모달 헤더 배지·탭이 함께 쓰는 용돈 데이터 */
export function useStudentAllowance(campCode: string | undefined, campType: CampType, student: STSheetStudent | undefined, records: PatientRecord[] | null, active: boolean) {
  const config = useMemo(() => allowanceConfigFor(campType), [campType]);
  const studentId = student?.studentId;
  const [ledger, setLedger] = useState<AllowanceLedger | null>(null);
  const [txnsById, setTxnsById] = useState<Record<string, AllowanceTxn[]>>({});
  const [reqsById, setReqsById] = useState<Record<string, SupplyRequest[]>>({});
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!active || !config || !campCode || !studentId) return;
    const u1 = subscribeAllowanceLedger(db, campCode, studentId, setLedger, e => logger.warn('[allowance] ledger', e));
    const u2 = subscribeAllowanceTxns(db, campCode, studentId, t => setTxnsById(p => ({ ...p, [studentId]: t })), e => logger.warn('[allowance] txns', e));
    return () => { u1(); u2(); };
  }, [active, config, campCode, studentId]);

  useEffect(() => {
    if (!active || !config || !campCode || !studentId) return;
    getStudentSupplyRequests(db, campCode, studentId)
      .then(r => setReqsById(p => ({ ...p, [studentId]: r })))
      .catch(e => { logger.warn('[allowance] supply', e); setReqsById(p => ({ ...p, [studentId]: [] })); });
  }, [active, config, campCode, studentId, reload]);

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

export type AllowanceData = ReturnType<typeof useStudentAllowance>;

type FormState =
  | { mode: 'spend' | 'deposit'; pending?: AllowancePending }
  | { mode: 'bulk' }
  | { mode: 'edit'; txn: AllowanceTxn }
  | { mode: 'initial' };

interface TabProps {
  data: AllowanceData;
  student: STSheetStudent;
  campCode: string;
  roster: STSheetStudent[];
  actor: AllowanceActorInfo;
}

export function StudentAllowanceTab({ data, student, campCode, roster, actor }: TabProps) {
  const { config, ledger, txns, pending } = data;
  const [currency, setCurrency] = useState<AllowanceCurrency>(config?.currencies[0]?.code ?? 'KRW');
  const [form, setForm] = useState<FormState | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);

  if (!config) return <Text style={s.empty}>{L('studentModal.nothingToShow')}</Text>;
  const cur = config.currencies.find(c => c.code === currency) ?? config.currencies[0];
  const initialCounts = ledgerInitial(ledger, cur);
  const initialTotal = denomTotal(initialCounts);
  const rows = txns ? allowanceRows(txns, cur.code, initialTotal) : [];
  const balance = rows.length ? rows[rows.length - 1].balanceAfter : initialTotal;
  const deletedTxns = (txns ?? []).filter(t => t.deleted && t.currency === cur.code);
  const check = ledger?.cashCheck?.[cur.code];

  return (
    <View style={{ gap: 10 }}>
      {config.currencies.length > 1 && (
        <View style={s.segment}>
          {config.currencies.map(c => (
            <TouchableOpacity key={c.code} onPress={() => setCurrency(c.code)} style={[s.segItem, c.code === cur.code && s.segItemOn]}>
              <Text style={[s.segText, c.code === cur.code && s.segTextOn]}>{c.code}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* 요약 카드 */}
      <View style={s.cards}>
        <TouchableOpacity style={[s.sumCard, { backgroundColor: '#eff6ff' }]} onPress={() => setForm({ mode: 'initial' })}>
          <Text style={[s.sumLabel, { color: '#1d4ed8' }]}>{L('allowance.initialAmount')} ✎</Text>
          <Text style={[s.sumValue, { color: '#1e3a8a' }]}>{formatAllowance(initialTotal, cur.code)}</Text>
        </TouchableOpacity>
        <View style={[s.sumCard, { backgroundColor: balance < 0 ? '#fef2f2' : '#ecfdf5' }]}>
          <Text style={[s.sumLabel, { color: balance < 0 ? '#b91c1c' : '#047857' }]}>{L('allowance.balance')}</Text>
          <Text style={[s.sumValue, { color: balance < 0 ? '#b91c1c' : '#064e3b' }]}>{txns ? formatAllowance(balance, cur.code) : '…'}</Text>
        </View>
        <View style={[s.sumCard, { backgroundColor: '#fff7ed' }]}>
          <Text style={[s.sumLabel, { color: '#c2410c' }]}>{L('allowance.pending')}</Text>
          <Text style={[s.sumValue, { color: pending.length ? '#dc2626' : '#7c2d12' }]}>{L('allowance.pendingCount', { v0: pending.length })}</Text>
        </View>
        <View style={[s.sumCard, { backgroundColor: '#faf5ff' }]}>
          <Text style={[s.sumLabel, { color: '#7e22ce' }]}>{L('allowance.envelopeCash')}</Text>
          <Text style={[s.sumValue, { color: '#581c87' }]}>{check ? formatAllowance(check.total, cur.code) : L('allowance.notCounted')}</Text>
          {check?.flagged && !check.resolved && <Text style={s.flagSmall}>⚠ {L('allowance.flagged')}</Text>}
        </View>
      </View>

      {/* 버튼 */}
      <View style={s.btnRow}>
        <TouchableOpacity style={[s.btn, s.btnOutline, { flexGrow: 1, justifyContent: 'center' }]} onPress={() => setForm({ mode: 'spend' })}>
          <Ionicons name="remove-circle-outline" size={16} color="#1d4ed8" />
          <Text style={s.btnOutlineText}>{L('allowance.addSpend')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => setForm({ mode: 'deposit' })}>
          <Text style={[s.btnOutlineText, { color: '#0f766e' }]}>+ {L('allowance.addDeposit')}</Text>
        </TouchableOpacity>
        {roster.length > 1 && (
          <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => setForm({ mode: 'bulk' })}>
            <Text style={s.btnOutlineText}>{L('allowance.bulkSpend')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 거래 내역 */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <Text style={s.cardTitle}>{L('allowance.history')}</Text>
          <Text style={s.muted}>{L('allowance.totalCount', { v0: rows.length })}</Text>
        </View>
        {txns === null ? <ActivityIndicator style={{ marginVertical: 14 }} color="#3b82f6" />
          : rows.length === 0 ? <Text style={s.empty}>{L('allowance.noTxns')}</Text>
          : rows.slice().reverse().map(({ txn: t, balanceAfter }) => (
            <TouchableOpacity key={t.id} style={s.txnRow} onPress={() => setForm({ mode: 'edit', txn: t })}>
              <Text style={s.txnDate}>{md(t.date?.toDate?.())}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={s.inlineWrap}>
                  <Text style={s.txnTitle} numberOfLines={1}>{t.place ? dataLabel(t.place) : L(CAT_KEY[t.category])}</Text>
                  <Text style={[s.badge, { backgroundColor: CAT_COLOR[t.category][0], color: CAT_COLOR[t.category][1] }]}>{L(CAT_KEY[t.category])}</Text>
                  {t.source && <Text style={[s.badge, { backgroundColor: '#f3f4f6', color: '#4b5563' }]}>{L(t.source.kind === 'patient' ? 'allowance.linkPatient' : 'allowance.linkSupply')}</Text>}
                  {!!t.evidence?.length && <Text style={s.muted}>📎{t.evidence.length}</Text>}
                </View>
                {!!t.memo && <Text style={s.txnMemo} numberOfLines={1}>{t.memo}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.txnAmount, { color: t.type === 'deposit' ? '#0d9488' : '#dc2626' }]}>
                  {formatAllowance(t.type === 'deposit' ? t.amount : -t.amount, cur.code, { signed: true })}
                </Text>
                <Text style={s.muted}>{formatAllowance(balanceAfter, cur.code)}</Text>
              </View>
            </TouchableOpacity>
          ))}
        {deletedTxns.length > 0 && (
          <View style={{ paddingVertical: 8 }}>
            <TouchableOpacity onPress={() => setShowDeleted(v => !v)}>
              <Text style={s.muted}>{L('allowance.showDeleted')} ({deletedTxns.length}) {showDeleted ? '▴' : '▾'}</Text>
            </TouchableOpacity>
            {showDeleted && deletedTxns.map(t => (
              <TouchableOpacity key={t.id} onPress={() => setForm({ mode: 'edit', txn: t })} style={s.deletedRow}>
                <Text style={s.deletedText}>{md(t.date?.toDate?.())} {t.place ? dataLabel(t.place) : L(CAT_KEY[t.category])}</Text>
                <Text style={s.deletedText}>{formatAllowance(t.type === 'deposit' ? t.amount : -t.amount, cur.code, { signed: true })}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* 정산 대기 */}
      <View style={s.card}>
        <View style={[s.cardHeader, { flexDirection: 'column', alignItems: 'flex-start' }]}>
          <Text style={s.cardTitle}>{L('allowance.pendingTitle')}</Text>
          <Text style={[s.muted, { marginTop: 2 }]}>{L('allowance.pendingHint')}</Text>
        </View>
        {pending.length === 0 ? <Text style={s.empty}>{L('allowance.noPending')}</Text> : pending.map(p => (
          <View key={p.key} style={s.pendRow}>
            <Text style={{ fontSize: 18 }}>{p.category === 'hospital' ? '🏥' : '📦'}</Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.txnTitle} numberOfLines={1}>{p.title}</Text>
              <Text style={s.muted}>
                {md(p.date?.toDate?.())} · {L(p.category === 'hospital' ? 'allowance.linkPatient' : 'allowance.linkSupply')}
                {p.alreadySettled ? ` · ${L('allowance.alreadySettled')}` : ''}
              </Text>
            </View>
            <Text style={s.pendAmount}>{p.amount.toLocaleString('en-US')}</Text>
            <TouchableOpacity style={s.deductBtn} onPress={() => setForm({ mode: 'spend', pending: p })}>
              <Text style={s.deductText}>{L('allowance.deduct')}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <CashCheckCard key={`${student.studentId}-${cur.code}-${check?.at?.toMillis?.() ?? 0}-${txns === null ? 'l' : rows.length}`}
        denoms={cur.denoms} currency={cur.code} balance={balance} check={check}
        prefill={txns !== null && rows.length === 0 ? initialCounts : undefined}
        onSave={counts => saveAllowanceCashCheck(db, campCode, student.studentId, student.name, cur.code, { counts, total: denomTotal(counts), ledgerBalance: balance }, actor)}
        onFlag={flag => flagAllowanceCashCheck(db, campCode, student.studentId, cur.code, flag, actor)}
        onResolve={note => resolveAllowanceCashCheck(db, campCode, student.studentId, cur.code, note, actor)} />

      {form?.mode === 'initial' && (
        <InitialSheet currency={cur.code} denoms={cur.denoms} counts={initialCounts} onClose={() => setForm(null)}
          onSave={async counts => { await setAllowanceInitial(db, campCode, student.studentId, student.name, cur.code, counts, actor); setForm(null); }} />
      )}
      {form && form.mode !== 'initial' && (
        <TxnSheet form={form} config={config} defaultCurrency={cur.code} student={student} roster={roster}
          campCode={campCode} actor={actor} onClose={() => setForm(null)} onSourceSettled={data.refreshSupply} />
      )}
    </View>
  );
}

// ── 권종별 현금 확인 ─────────────────────────────────────────────
function CashCheckCard({ denoms, currency, balance, check, prefill, onSave, onFlag, onResolve }: {
  denoms: number[]; currency: AllowanceCurrency; balance: number; check?: AllowanceCashCheck;
  /** 실사 기록·사용 내역이 없으면 캠프 기본 봉투 구성으로 채워 둠 */
  prefill?: Record<string, number>;
  onSave: (c: Record<string, number>) => Promise<void>; onFlag: (f: boolean) => Promise<void>; onResolve: (n: string) => Promise<void>;
}) {
  const [counts, setCounts] = useState<Record<string, number>>(() => ({ ...(check?.counts ?? prefill ?? {}) }));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const total = denomTotal(counts);
  const diff = total - balance;
  const savedDiff = check ? check.total - balance : 0;
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } catch (e) { logger.error('[allowance] cash', e); Alert.alert(L('allowance.saveFailed')); } finally { setBusy(false); }
  };
  return (
    <View style={s.card}>
      <View style={[s.cardHeader, { flexDirection: 'column', alignItems: 'flex-start' }]}>
        <Text style={s.cardTitle}>{L('allowance.cashCheck')}</Text>
        <Text style={[s.muted, { marginTop: 2 }]}>{L('allowance.cashCheckHint')}</Text>
      </View>
      <View style={s.denomGrid}>
        {denoms.map(d => (
          <View key={d} style={s.denomBox}>
            <Text style={s.denomLabel}>{formatDenom(d, currency)}</Text>
            <View style={s.stepper}>
              <TouchableOpacity onPress={() => setCounts(p => ({ ...p, [d]: Math.max(0, (p[d] ?? 0) - 1) }))} hitSlop={6}><Ionicons name="remove" size={16} color="#6b7280" /></TouchableOpacity>
              <TextInput keyboardType="number-pad" value={counts[d] ? String(counts[d]) : ''} placeholder="0" placeholderTextColor="#cbd5e1"
                onChangeText={v => setCounts(p => ({ ...p, [d]: Math.max(0, Number(v.replace(/\D/g, '')) || 0) }))} style={s.stepInput} />
              <TouchableOpacity onPress={() => setCounts(p => ({ ...p, [d]: (p[d] ?? 0) + 1 }))} hitSlop={6}><Ionicons name="add" size={16} color="#6b7280" /></TouchableOpacity>
            </View>
          </View>
        ))}
      </View>
      <View style={s.totalRow}>
        <Text style={s.totalLabel}>{L('allowance.total')}</Text>
        <Text style={s.totalValue}>{formatAllowance(total, currency)}</Text>
      </View>
      <View style={s.checkFoot}>
        <Text style={[s.diffText, { color: diff === 0 ? '#059669' : '#dc2626' }]}>
          {diff === 0 ? `✓ ${L('allowance.matches')}` : `⚠ ${L('allowance.differs', { v0: formatAllowance(diff, currency, { signed: true }) })}`}
        </Text>
        <TouchableOpacity disabled={busy} onPress={() => run(() => onSave(counts))} style={s.darkBtn}>
          <Text style={s.darkBtnText}>{L('allowance.saveCount')}</Text>
        </TouchableOpacity>
      </View>
      {check && (
        <View style={{ gap: 6, paddingBottom: 10 }}>
          <Text style={s.muted}>
            {L('allowance.lastCounted', { v0: `${md(check.at?.toDate?.())} ${check.by}`, v1: formatAllowance(check.total, currency) })}
            {savedDiff !== 0 ? ` · ${L('allowance.differs', { v0: formatAllowance(savedDiff, currency, { signed: true }) })}` : ''}
          </Text>
          {savedDiff !== 0 && !check.flagged && !check.resolved && (
            <TouchableOpacity disabled={busy} onPress={() => run(() => onFlag(true))} style={s.flagBtn}>
              <Text style={s.flagBtnText}>⚠ {L('allowance.flagDiff')}</Text>
            </TouchableOpacity>
          )}
          {check.flagged && !check.resolved && (
            <View style={s.flagBox}>
              <Text style={[s.flagBtnText, { marginBottom: 6 }]}>⚠ {L('allowance.flagged')}</Text>
              <TextInput value={note} onChangeText={setNote} placeholder={L('allowance.resolveNotePh')} placeholderTextColor="#fca5a5" style={s.flagInput} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                <TouchableOpacity disabled={busy || !note.trim()} onPress={() => run(() => onResolve(note.trim()))} style={[s.flagSolid, !note.trim() && { opacity: 0.4 }]}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>{L('allowance.resolve')}</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={() => run(() => onFlag(false))}><Text style={{ color: '#ef4444', fontSize: 12, paddingVertical: 6 }}>{L('allowance.unflag')}</Text></TouchableOpacity>
              </View>
            </View>
          )}
          {check.resolved && <Text style={{ fontSize: 12, color: '#047857' }}>✓ {L('allowance.resolvedBy', { v0: check.resolved.by, v1: check.resolved.note })}</Text>}
        </View>
      )}
    </View>
  );
}

// ── 시트(하단 모달) 공통 ─────────────────────────────────────────
function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color="#374151" /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          <View style={s.sheetFooter}>{footer}</View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <View><Text style={s.fieldLabel}>{label}</Text>{children}</View>;
}

function Chip({ on, onPress, children }: { on: boolean; onPress: () => void; children: React.ReactNode }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.chip, on && s.chipOn]}>
      <Text style={[s.chipText, on && s.chipTextOn]}>{children}</Text>
    </TouchableOpacity>
  );
}

function FooterButtons({ busy, onCancel, onSave, left }: { busy: boolean; onCancel: () => void; onSave: () => void; left?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {left}
      <View style={{ flex: 1 }} />
      <TouchableOpacity onPress={onCancel} disabled={busy} style={[s.footBtn, { backgroundColor: '#f3f4f6' }]}><Text style={{ color: '#374151', fontWeight: '600' }}>{L('common.cancel')}</Text></TouchableOpacity>
      <TouchableOpacity onPress={onSave} disabled={busy} style={[s.footBtn, { backgroundColor: '#2563eb', opacity: busy ? 0.6 : 1 }]}>
        {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{L('common.save')}</Text>}
      </TouchableOpacity>
    </View>
  );
}

function InitialSheet({ currency, denoms, counts, onClose, onSave }: {
  currency: AllowanceCurrency; denoms: number[]; counts: Record<string, number>; onClose: () => void; onSave: (c: Record<string, number>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, number>>({ ...counts });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await onSave(Object.fromEntries(Object.entries(draft).filter(([, n]) => n > 0))); }
    catch (e) { logger.error('[allowance] initial', e); Alert.alert(L('allowance.saveFailed')); setBusy(false); }
  };
  return (
    <Sheet title={L('allowance.editInitial')} onClose={onClose} footer={<FooterButtons busy={busy} onCancel={onClose} onSave={save} />}>
      <Text style={s.muted}>{L('allowance.initialHint')}</Text>
      {denoms.map(d => (
        <View key={d} style={s.initRow}>
          <Text style={{ width: 110, fontSize: 14, color: '#374151' }}>{formatDenom(d, currency)}</Text>
          <View style={s.stepper}>
            <TouchableOpacity onPress={() => setDraft(p => ({ ...p, [d]: Math.max(0, (p[d] ?? 0) - 1) }))} hitSlop={6}><Ionicons name="remove" size={18} color="#6b7280" /></TouchableOpacity>
            <TextInput keyboardType="number-pad" value={draft[d] ? String(draft[d]) : ''} placeholder="0" placeholderTextColor="#cbd5e1"
              onChangeText={v => setDraft(p => ({ ...p, [d]: Math.max(0, Number(v.replace(/\D/g, '')) || 0) }))} style={s.stepInput} />
            <TouchableOpacity onPress={() => setDraft(p => ({ ...p, [d]: (p[d] ?? 0) + 1 }))} hitSlop={6}><Ionicons name="add" size={18} color="#6b7280" /></TouchableOpacity>
          </View>
          <Text style={{ flex: 1, textAlign: 'right', color: '#6b7280' }}>{formatAllowance(d * (draft[d] ?? 0), currency)}</Text>
        </View>
      ))}
      <View style={s.totalRow}><Text style={s.totalLabel}>{L('allowance.total')}</Text><Text style={s.totalValue}>{formatAllowance(denomTotal(draft), currency)}</Text></View>
    </Sheet>
  );
}

type Picked = { uri: string; kind: AllowanceEvidenceKind; mimeType?: string; fileName?: string };

function TxnSheet({ form, config, defaultCurrency, student, roster, campCode, actor, onClose, onSourceSettled }: {
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
  const [date, setDate] = useState<Date>(() => editing?.date?.toDate?.() ?? pendingItem?.date?.toDate?.() ?? new Date());
  const [memo, setMemo] = useState(editing?.memo ?? pendingItem?.title ?? '');
  const [evidence, setEvidence] = useState<AllowanceEvidence[]>(editing?.evidence ?? []);
  const [picked, setPicked] = useState<Picked[]>([]);
  const evKinds = ALLOWANCE_EVIDENCE_KINDS[category];
  const [evKind, setEvKind] = useState<AllowanceEvidenceKind>(evKinds[0]);
  const curEvKind = evKinds.includes(evKind) ? evKind : evKinds[0];
  const [selected, setSelected] = useState<Set<string>>(() => new Set(roster.map(r => r.studentId)));
  const [busy, setBusy] = useState(false);

  const title = editing ? L('allowance.txnDetail') : isBulk ? L('allowance.bulkTitle') : isDeposit ? L('allowance.depositTitle') : L('allowance.spendTitle');

  const pick = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert(L('common.permissionRequired'), L(camera ? 'inventory.pleaseAllowCameraAccess' : 'inventory.pleaseAllowPhotoAccess')); return; }
    const res = camera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.7, selectionLimit: 10 });
    if (res.canceled) return;
    setPicked(p => [...p, ...res.assets.map(a => ({ uri: a.uri, kind: curEvKind, mimeType: a.mimeType ?? undefined, fileName: a.fileName ?? undefined }))]);
  };

  const save = useCallback(async () => {
    const n = Number(amount.replace(/,/g, ''));
    if (!(n > 0)) { Alert.alert(L('allowance.amountRequired')); return; }
    const targets = isBulk ? roster.filter(r => selected.has(r.studentId)) : [student];
    if (targets.length === 0) { Alert.alert(L('allowance.studentsRequired')); return; }
    setBusy(true);
    try {
      const uploaded: AllowanceEvidence[] = [];
      for (const p of picked) {
        const blob = await uriToBlob(p.uri);
        const path = allowanceEvidencePath(campCode, isBulk ? 'batch' : student.studentId, p.fileName || 'photo.jpg');
        const r = storageRef(storage, path);
        await uploadBytes(r, blob, { contentType: p.mimeType || blob.type || 'image/jpeg' });
        uploaded.push({ kind: p.kind, path, url: await getDownloadURL(r) });
      }
      const allEvidence = [...evidence, ...uploaded];
      const when = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
      if (editing) {
        await updateAllowanceTxn(db, editing, { amount: n, category, place: category === 'activity' ? place : '', memo, currency, evidence: allEvidence, date: when }, actor);
      } else {
        const source: AllowanceSource | undefined = pendingItem?.source;
        await addAllowanceTxns(db, campCode,
          targets.map(t => ({ studentId: t.studentId, studentName: t.name, classNumber: t.classNumber })),
          { currency, type: isDeposit ? 'deposit' : 'spend', amount: n, category, place: category === 'activity' ? place : undefined, memo, date: when, source, evidence: allEvidence },
          actor);
        if (source && !pendingItem?.alreadySettled) {
          await markAllowanceSourceSettled(db, source, true, actor).catch(e => logger.warn('[allowance] source settle', e));
          onSourceSettled();
        }
      }
      onClose();
    } catch (e) {
      logger.error('[allowance] save', e);
      Alert.alert(L('allowance.saveFailed'));
      setBusy(false);
    }
  }, [amount, isBulk, roster, selected, student, picked, campCode, evidence, date, editing, category, place, memo, currency, actor, pendingItem, isDeposit, onClose, onSourceSettled]);

  const toggleDeleted = () => {
    if (!editing) return;
    const go = async () => {
      setBusy(true);
      try {
        await setAllowanceTxnDeleted(db, editing.id, !editing.deleted, actor);
        if (editing.source && !editing.deleted) {
          await markAllowanceSourceSettled(db, editing.source, false, actor).catch(e => logger.warn('[allowance] unsettle', e));
          onSourceSettled();
        }
        onClose();
      } catch (e) { logger.error('[allowance] delete', e); Alert.alert(L('allowance.saveFailed')); setBusy(false); }
    };
    if (editing.deleted) { go(); return; }
    Alert.alert(L('common.delete'), L('allowance.confirmDelete'), [
      { text: L('common.cancel'), style: 'cancel' },
      { text: L('common.delete'), style: 'destructive', onPress: go },
    ]);
  };

  const shiftDate = (days: number) => setDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));

  return (
    <Sheet title={title} onClose={onClose}
      footer={<FooterButtons busy={busy} onCancel={onClose} onSave={save}
        left={editing ? (
          <TouchableOpacity onPress={toggleDeleted} disabled={busy}>
            <Text style={{ color: editing.deleted ? '#2563eb' : '#dc2626', fontWeight: '600' }}>{editing.deleted ? L('allowance.restore') : L('common.delete')}</Text>
          </TouchableOpacity>
        ) : undefined} />}>
      {pendingItem && <Text style={s.linkNote}>{L('allowance.fromLink', { v0: pendingItem.title })}</Text>}
      {isBulk && <Text style={s.muted}>{L('allowance.bulkHint')}</Text>}

      {config.currencies.length > 1 && (
        <Field label={L('allowance.currency')}>
          <View style={s.chipWrap}>{config.currencies.map(c => <Chip key={c.code} on={currency === c.code} onPress={() => setCurrency(c.code)}>{c.code}</Chip>)}</View>
        </Field>
      )}

      {!isDeposit && (
        <Field label={L('allowance.category')}>
          <View style={s.chipWrap}>{ALLOWANCE_CATEGORIES.map(c => <Chip key={c} on={category === c} onPress={() => setCategory(c)}>{L(CAT_KEY[c])}</Chip>)}</View>
        </Field>
      )}

      {category === 'activity' && (
        <Field label={L('allowance.place')}>
          {config.activityPlaces.length > 0 && (
            <View style={[s.chipWrap, { marginBottom: 6 }]}>
              {config.activityPlaces.map(p => <Chip key={p} on={place === p} onPress={() => setPlace(p)}>{dataLabel(p)}</Chip>)}
            </View>
          )}
          <TextInput value={config.activityPlaces.includes(place) ? '' : place} onChangeText={setPlace} placeholder={L('allowance.placeCustom')} placeholderTextColor="#9ca3af" style={s.input} />
        </Field>
      )}

      <Field label={isBulk ? L('allowance.perStudent') : L('allowance.amount')}>
        <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="#cbd5e1" style={[s.input, { fontSize: 18, fontWeight: '700' }]} />
        {!isDeposit && (
          <Text style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>💡 {currency === 'KRW' ? L('allowance.roundHint') : L('allowance.roundHintOther')}</Text>
        )}
      </Field>

      <Field label={L('allowance.date')}>
        <View style={s.dateRow}>
          <TouchableOpacity onPress={() => shiftDate(-1)} hitSlop={8}><Ionicons name="chevron-back" size={20} color="#374151" /></TouchableOpacity>
          <Text style={s.dateText}>{`${date.getMonth() + 1}/${date.getDate()} (${WEEK_KO[date.getDay()]})`}</Text>
          <TouchableOpacity onPress={() => shiftDate(1)} hitSlop={8}><Ionicons name="chevron-forward" size={20} color="#374151" /></TouchableOpacity>
        </View>
      </Field>

      <Field label={L('allowance.memo')}>
        <TextInput value={memo} onChangeText={setMemo} placeholderTextColor="#9ca3af" style={s.input} />
      </Field>

      <Field label={L('allowance.evidence')}>
        <View style={[s.chipWrap, { marginBottom: 8 }]}>
          {evidence.map(ev => (
            <View key={ev.path} style={s.thumbWrap}>
              <Image source={ev.url} style={s.thumb} contentFit="cover" />
              <Text style={s.thumbLabel}>{L(EV_KEY[ev.kind])}</Text>
              <TouchableOpacity style={s.thumbX} onPress={() => setEvidence(p => p.filter(x => x.path !== ev.path))}><Ionicons name="close" size={12} color="#fff" /></TouchableOpacity>
            </View>
          ))}
          {picked.map((p, i) => (
            <View key={`${p.uri}-${i}`} style={s.thumbWrap}>
              <Image source={p.uri} style={s.thumb} contentFit="cover" />
              <Text style={s.thumbLabel}>{L(EV_KEY[p.kind])}</Text>
              <TouchableOpacity style={s.thumbX} onPress={() => setPicked(q => q.filter((_, j) => j !== i))}><Ionicons name="close" size={12} color="#fff" /></TouchableOpacity>
            </View>
          ))}
        </View>
        {evKinds.length > 1 && (
          <View style={[s.chipWrap, { marginBottom: 6 }]}>{evKinds.map(k => <Chip key={k} on={curEvKind === k} onPress={() => setEvKind(k)}>{L(EV_KEY[k])}</Chip>)}</View>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={s.photoBtn} onPress={() => pick(true)}><Ionicons name="camera-outline" size={16} color="#374151" /><Text style={s.photoBtnText}>{L('allowance.addPhoto')}</Text></TouchableOpacity>
          <TouchableOpacity style={s.photoBtn} onPress={() => pick(false)}><Ionicons name="images-outline" size={16} color="#374151" /></TouchableOpacity>
        </View>
      </Field>

      {isBulk && (
        <Field label={`${L('allowance.students')} · ${L('allowance.selectedCount', { v0: selected.size })}`}>
          <TouchableOpacity onPress={() => setSelected(selected.size === roster.length ? new Set() : new Set(roster.map(r => r.studentId)))} style={{ marginBottom: 6 }}>
            <Text style={{ color: '#2563eb', fontSize: 13, fontWeight: '600' }}>{selected.size === roster.length ? '☑' : '☐'} {L('allowance.selectAll')}</Text>
          </TouchableOpacity>
          <View style={s.chipWrap}>
            {roster.map(r => (
              <Chip key={r.studentId} on={selected.has(r.studentId)} onPress={() => setSelected(p => { const n = new Set(p); if (n.has(r.studentId)) n.delete(r.studentId); else n.add(r.studentId); return n; })}>{r.name}</Chip>
            ))}
          </View>
        </Field>
      )}

      {editing && (
        <View style={{ gap: 2 }}>
          <Text style={s.muted}>{L('allowance.createdBy', { v0: editing.createdBy })} · {md(editing.createdAt?.toDate?.())}</Text>
          {!!editing.edits?.length && (
            <>
              <Text style={[s.muted, { fontWeight: '700', marginTop: 4 }]}>{L('allowance.editHistory')}</Text>
              {editing.edits.map((e, i) => <Text key={i} style={s.muted}>{md(e.at?.toDate?.())} {e.by}: {e.before}</Text>)}
            </>
          )}
        </View>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  empty: { fontSize: 12, color: '#9ca3af', textAlign: 'center', paddingVertical: 14 },
  muted: { fontSize: 11, color: '#6b7280' },
  segment: { flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: '#f3f4f6', borderRadius: 10, padding: 2 },
  segItem: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 8 },
  segItemOn: { backgroundColor: '#fff' },
  segText: { fontSize: 12, fontWeight: '700', color: '#6b7280' },
  segTextOn: { color: '#111827' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sumCard: { width: '48%', flexGrow: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  sumLabel: { fontSize: 11, fontWeight: '600' },
  sumValue: { fontSize: 18, fontWeight: '800', marginTop: 2, fontVariant: ['tabular-nums'] },
  flagSmall: { fontSize: 10, color: '#dc2626', fontWeight: '700', marginTop: 2 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  btnPrimary: { backgroundColor: '#2563eb', flexGrow: 1, justifyContent: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnOutline: { borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#fff' },
  btnOutlineText: { color: '#1d4ed8', fontSize: 13, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  txnRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  txnDate: { width: 38, fontSize: 12, color: '#6b7280' },
  inlineWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  txnTitle: { fontSize: 13, fontWeight: '600', color: '#111827', flexShrink: 1 },
  txnMemo: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  txnAmount: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  badge: { fontSize: 10, fontWeight: '600', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, overflow: 'hidden' },
  deletedRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  deletedText: { fontSize: 11, color: '#9ca3af', textDecorationLine: 'line-through' },
  pendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  pendAmount: { fontSize: 13, fontWeight: '700', color: '#111827', fontVariant: ['tabular-nums'] },
  deductBtn: { backgroundColor: '#f97316', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  deductText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  denomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 10 },
  denomBox: { width: '48%', flexGrow: 1, backgroundColor: '#f9fafb', borderRadius: 10, padding: 8, alignItems: 'center', gap: 4 },
  denomLabel: { fontSize: 12, color: '#374151', fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 8, paddingVertical: 2 },
  stepInput: { minWidth: 36, textAlign: 'center', fontSize: 15, fontWeight: '700', color: '#111827', paddingVertical: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#eff6ff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  totalLabel: { fontSize: 13, fontWeight: '700', color: '#1e3a8a' },
  totalValue: { fontSize: 15, fontWeight: '800', color: '#111827', fontVariant: ['tabular-nums'] },
  checkFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  diffText: { flex: 1, fontSize: 12, fontWeight: '600' },
  darkBtn: { backgroundColor: '#111827', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  darkBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  flagBtn: { alignSelf: 'flex-start', backgroundColor: '#fef2f2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  flagBtnText: { color: '#b91c1c', fontSize: 12, fontWeight: '700' },
  flagBox: { backgroundColor: '#fef2f2', borderRadius: 10, padding: 10 },
  flagInput: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#111827' },
  flagSolid: { backgroundColor: '#dc2626', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  sheetFooter: { padding: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  footBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, minWidth: 72, alignItems: 'center' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#4b5563' },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 16, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  dateText: { fontSize: 15, fontWeight: '700', color: '#111827', minWidth: 80, textAlign: 'center' },
  linkNote: { fontSize: 12, color: '#9a3412', backgroundColor: '#fff7ed', borderRadius: 10, padding: 10 },
  thumbWrap: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden' },
  thumb: { width: 64, height: 64 },
  thumbLabel: { position: 'absolute', bottom: 0, left: 0, right: 0, fontSize: 9, textAlign: 'center', color: '#fff', backgroundColor: 'rgba(0,0,0,0.5)' },
  thumbX: { position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(17,24,39,0.8)', alignItems: 'center', justifyContent: 'center' },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderStyle: 'dashed', borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  photoBtnText: { fontSize: 13, color: '#374151' },
  initRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
