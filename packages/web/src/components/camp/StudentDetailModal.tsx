'use client';
/**
 * 학생 상세 모달 (web) — 반/방/입소/퇴소 명단 공용.
 * 데스크탑: 왼쪽 프로필 패널 고정 + 오른쪽 탭. 좁은 화면: 전체 화면 + 상단 요약 + 가로 스크롤 탭.
 * 탭 구성·표시 판단은 shared/utils/studentModal 과 같아 mobile 과 동일하다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  L, dataLabel, logger, resolveActiveJobCodeId, formatAllowance, toDriveImageUrl, getFieldValue, getFixedFieldValue, getDefaultFieldConfig,
  getStudentPatientRecords, studentTabsFor, sectionsForTab, visibleDynamicFields, hasMedicationInfo,
  isOpenPatientRecord, placementSummary, guardianContacts, dialablePhone, STUDENT_TAB_LABEL_KEYS,
  type STSheetFieldConfig, type FieldSectionConfig, type PatientRecord, type StudentTabId, type MessageKey,
} from '@smis-mentor/shared';
import { useAuth } from '@/contexts/AuthContext';
import { placementOverrideService, type STSheetStudent, type CampCode, type CampType } from '@/lib/stSheetService';
import { authenticatedPost } from '@/lib/apiClient';
import { db } from '@/lib/firebase';
import StudentAllowanceTab, { useStudentAllowance } from './StudentAllowanceTab';
import StudentDevicesTab, { useStudentDevices, useDeviceContext } from './StudentDevicesTab';
import StudentMemoCard from './StudentMemoCard';

type EditPermission = 'readonly' | 'admin' | 'all' | 'mentor';

function canEditField(permission: EditPermission, role: string): boolean {
  if (permission === 'readonly') return false;
  if (role === 'admin') return true;
  if (permission === 'all') return true;
  if (permission === 'mentor') return role === 'mentor' || role === 'mentor_temp';
  return false;
}

const SECTION_ICON: Record<string, string> = {
  campInfo: '🏕️', basicInfo: '👤', guardianInfo: '👪', detail: '📝', placement: '📊', counsel: '💬', survey: '📋',
};

// 모달을 다시 열어도 마지막으로 보던 탭을 유지
const tabMemory: { current: StudentTabId } = { current: 'basic' };

interface Props {
  /** 이전/다음 이동 순서 (화면에 보이는 명단 순서) */
  students: STSheetStudent[];
  /** 처음 열 학생 */
  initialStudentId: string;
  onClose: () => void;
  campCode: CampCode | null;
  campType: CampType;
  fieldConfig: STSheetFieldConfig | null;
  /** 프로필 패널 하단에 덧붙일 내용 (예: 입소/퇴소 조) */
  renderExtra?: (s: STSheetStudent) => ReactNode;
}

export default function StudentDetailModal({
  students, initialStudentId, onClose, campCode, campType, fieldConfig, renderExtra,
}: Props) {
  const { userData } = useAuth();
  const role = userData?.role ?? '';
  const isAdmin = role === 'admin';
  const isForeign = role === 'foreign' || role === 'foreign_temp';
  const activeJobCodeId = resolveActiveJobCodeId(userData);
  const activeJobExp = userData?.jobExperiences?.find(exp => exp.id === activeJobCodeId);
  const groupRole = activeJobExp?.groupRole;

  const config = fieldConfig ?? getDefaultFieldConfig(campType ?? 'EJ');

  const [index, setIndex] = useState(() => Math.max(0, students.findIndex(s => s.studentId === initialStudentId)));
  // 학생별 override + 이 모달에서 저장한 값
  const [patches, setPatches] = useState<Record<string, Partial<STSheetStudent>>>({});
  const [tab, setTab] = useState<StudentTabId>(() => tabMemory.current);
  useEffect(() => { tabMemory.current = tab; }, [tab]);

  const [editingField, setEditingField] = useState<{ key: string; value: string; sheetHeader: string; isLegacy: boolean } | null>(null);
  const [fieldSaving, setFieldSaving] = useState(false);
  const [recordsById, setRecordsById] = useState<Record<string, PatientRecord[]>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  const base = students[index] ?? students[0];
  const student: STSheetStudent | undefined = useMemo(() => {
    if (!base) return undefined;
    const p = patches[base.studentId];
    if (!p) return base;
    return { ...base, ...p, displayFields: { ...(base.displayFields ?? {}), ...(p.displayFields ?? {}) } };
  }, [base, patches]);

  // placement override 병합 (학생이 바뀔 때마다)
  useEffect(() => {
    if (!campCode || !base) return;
    let alive = true;
    placementOverrideService.getOverride(campCode, base.studentId).then(ov => {
      if (!alive || !ov) return;
      const merged = placementOverrideService.mergeOverride(base, ov);
      setPatches(prev => ({ ...prev, [base.studentId]: { ...merged, ...(prev[base.studentId] ?? {}) } }));
    }).catch(() => {});
    return () => { alive = false; };
  }, [campCode, base]);

  // 보건 기록
  useEffect(() => {
    if (!campCode || !base) return;
    const id = base.studentId;
    getStudentPatientRecords(db, campCode, id)
      .then(r => setRecordsById(prev => ({ ...prev, [id]: r })))
      .catch(e => { logger.warn('[StudentDetailModal] 보건 기록 조회 실패', e); setRecordsById(prev => ({ ...prev, [id]: [] })); });
  }, [campCode, base]);

  const allowance = useStudentAllowance(campCode, campType, student, base ? recordsById[base.studentId] ?? null : null);
  const actor = useMemo(() => ({ uid: userData?.userId ?? '', name: userData?.name ?? '' }), [userData?.userId, userData?.name]);
  const devices = useStudentDevices(campCode, base?.studentId);
  const deviceCtx = useDeviceContext(campCode, activeJobCodeId);

  const tabs = useMemo(() => (student ? studentTabsFor(student, campType, config) : []), [student, campType, config]);
  const activeTab: StudentTabId = tabs.includes(tab) ? tab : 'basic';

  const go = useCallback((delta: number) => {
    setEditingField(null);
    setIndex(i => Math.min(students.length - 1, Math.max(0, i + delta)));
    contentRef.current?.scrollTo({ top: 0 });
  }, [students.length]);

  // ESC 닫기, ←/→ 학생 이동 (입력 중에는 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (document.querySelector('[data-modal-overlay]')) return; // 위에 뜬 입력 창이 있으면 무시
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === 'Escape' && !typing) onClose();
      if (typing) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  const handleSaveField = useCallback(async () => {
    if (!student || !campCode || !editingField) return;
    setFieldSaving(true);
    try {
      await authenticatedPost('/api/st/update-placement', {
        campCode,
        studentId: student.studentId,
        rowNumber: student.rowNumber,
        fields: { [editingField.key]: editingField.value },
      });
      setPatches(prev => {
        const cur = prev[student.studentId] ?? {};
        if (editingField.isLegacy) {
          return { ...prev, [student.studentId]: { ...cur, [editingField.key]: editingField.value || undefined } };
        }
        return {
          ...prev,
          [student.studentId]: { ...cur, displayFields: { ...(cur.displayFields ?? {}), [editingField.sheetHeader]: editingField.value } },
        };
      });
      setEditingField(null);
    } catch (e) {
      logger.error('학생 카드 저장 실패:', e);
      alert(L('common.failedToSavePleaseTry'));
    } finally {
      setFieldSaving(false);
    }
  }, [student, campCode, editingField]);

  if (!student) return null;
  const records: PatientRecord[] | null = recordsById[student.studentId] ?? null;

  const photoUrl = toDriveImageUrl(student.profilePhoto);
  const fixedOpts = { isForeign, isAdmin, groupRole };
  const classLine = getFixedFieldValue(student, 'classInfo', campType, fixedOpts);
  const unitLine = getFixedFieldValue(student, 'unitInfo', campType, fixedOpts);
  const openCount = (records ?? []).filter(isOpenPatientRecord).length;
  const allowancePending = allowance.pending.length;
  const negative = allowance.balances.filter(b => b.balance < 0);
  const uncollected = (devices ?? []).filter(d => d.location === 'student').length; // 잠깐 지급(lent)은 미수거로 치지 않음
  const needCharge = (devices ?? []).filter(d => d.needsCharge && d.location !== 'returned').length;
  const genderLabel = student.gender === 'M' ? L('students.m') : L('students.f');

  const avatar = (cls: string, iconCls: string) => (
    <div className={`relative overflow-hidden border border-gray-200 ${cls}`}
      style={{ backgroundColor: student.gender === 'M' ? '#dbeafe' : '#fef9c3' }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
        className={`absolute inset-0 m-auto ${iconCls}`} style={{ color: student.gender === 'M' ? '#93c5fd' : '#fcd34d' }}>
        <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
      </svg>
      {photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={photoUrl} src={photoUrl} alt={L('common.sProfile', { v0: student.name })}
          className="absolute inset-0 w-full h-full object-cover"
          onError={e => { e.currentTarget.style.display = 'none'; }} />
      )}
    </div>
  );

  // 영어 닉네임 | 학년 | 성별 — 한 줄 (고유번호는 캠프·기본 탭에만)
  const subline = [student.englishName, student.grade, genderLabel].filter(Boolean).join(' | ');

  const alerts = (compact: boolean) => (
    <>
      {(uncollected > 0 || needCharge > 0) && (
        <button type="button" onClick={() => setTab('devices')}
          className={`w-full text-left rounded-xl border border-sky-200 bg-sky-50 text-xs font-semibold text-sky-800 ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
          📱 {[
            uncollected > 0 ? L('studentDevice.uncollectedBadge', { v0: uncollected }) : '',
            needCharge > 0 ? L('studentDevice.chargeBadge', { v0: needCharge }) : '',
          ].filter(Boolean).join(' · ')}
        </button>
      )}
      {(allowancePending > 0 || negative.length > 0) && (
        <button type="button" onClick={() => setTab('allowance')}
          className={`w-full text-left rounded-xl border border-orange-200 bg-orange-50 text-xs font-semibold text-orange-800 ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
          💰 {[
            allowancePending > 0 ? L('allowance.pendingBadge', { v0: allowancePending }) : '',
            ...negative.map(b => `${L('allowance.lowBalance')} ${formatAllowance(b.balance, b.currency)}`),
          ].filter(Boolean).join(' · ')}
        </button>
      )}
      {openCount > 0 && (
        <button type="button" onClick={() => setTab('health')}
          className={`w-full text-left rounded-xl border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-800 ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'}`}>
          🩹 {L('studentModal.patientOpen', { v0: openCount })}
        </button>
      )}
    </>
  );

  const nav = (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label={L('studentModal.prevStudent')}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30">‹</button>
      <span className="text-xs text-gray-500 tabular-nums min-w-[3rem] text-center">{index + 1} / {students.length}</span>
      <button type="button" onClick={() => go(1)} disabled={index >= students.length - 1} aria-label={L('studentModal.nextStudent')}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30">›</button>
    </div>
  );

  // ── 섹션 렌더링 ─────────────────────────────────────────────
  const renderSection = (section: FieldSectionConfig) => {
    const icon = SECTION_ICON[section.id] ?? '📄';
    const card = (body: ReactNode) => (
      <div key={section.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
          <span className="text-base leading-none">{icon}</span>
          <h4 className="text-sm font-semibold text-gray-900">{dataLabel(section.label)}</h4>
        </div>
        <div className="px-4 py-1">{body}</div>
      </div>
    );

    if (section.isFixed) {
      const rows = section.fields
        .filter(f => f.isVisible)
        .sort((a, b) => a.order - b.order)
        .map(f => ({
          key: f.fieldKey,
          label: f.label,
          value: f.isLegacy
            ? getFixedFieldValue(student, f.fieldKey, campType, fixedOpts)
            : (getFieldValue(student, { fieldKey: f.fieldKey, sheetHeader: f.sheetHeader, isLegacy: false }) || null),
        }))
        .filter(r => r.value !== null);
      if (rows.length === 0) return null;
      return card(rows.map(r => (
        <div key={r.key} className="flex gap-3 py-2 border-b border-gray-100 last:border-b-0">
          <span className="w-28 shrink-0 text-xs text-gray-500">{dataLabel(r.label)}</span>
          <span className="flex-1 min-w-0 text-xs text-gray-900 font-medium break-words">{r.value}</span>
        </div>
      )));
    }

    const fields = visibleDynamicFields(student, section);
    if (fields.length === 0) return null;

    // 설문: 읽기 전용 문답을 타일로
    if (section.id === 'survey') {
      return card(
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 py-2">
          {fields.map(f => {
            const v = getFieldValue(student, { fieldKey: f.fieldKey, sheetHeader: f.sheetHeader, isLegacy: f.isLegacy });
            return (
              <div key={f.fieldKey} className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-[11px] text-gray-500">{dataLabel(f.label)}</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5 break-words">{v || '-'}</p>
              </div>
            );
          })}
        </div>,
      );
    }

    return card(fields.map(field => {
      const canEdit = canEditField(field.permission as EditPermission, role) && field.isEditable;
      const isThisEditing = editingField?.key === field.fieldKey;
      const isSavingThis = isThisEditing && fieldSaving;
      const rawValue = getFieldValue(student, { fieldKey: field.fieldKey, sheetHeader: field.sheetHeader, isLegacy: field.isLegacy });
      const displayValue = rawValue ? (field.fieldType === 'score' && field.maxScore ? `${rawValue} / ${field.maxScore}` : rawValue) : '';
      const isTextArea = field.fieldType === 'text' && !field.maxScore;
      const highlight = field.fieldKey === 'medication' && hasMedicationInfo(student);
      return (
        <div key={field.fieldKey}
          className={`flex ${isTextArea ? 'items-start' : 'items-center'} gap-2 py-2 border-b border-gray-100 last:border-b-0 ${highlight ? 'bg-red-50 -mx-4 px-4' : ''}`}>
          <span className={`w-28 shrink-0 text-xs pt-0.5 ${highlight ? 'text-red-700 font-semibold' : 'text-gray-500'}`}>{dataLabel(field.label)}</span>
          {isThisEditing ? (
            <>
              {isTextArea ? (
                <textarea autoFocus rows={3} value={editingField.value}
                  onChange={e => setEditingField(prev => prev ? { ...prev, value: e.target.value } : null)}
                  onKeyDown={e => { if (e.key === 'Escape') setEditingField(null); }}
                  className="flex-1 text-xs text-gray-900 border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                  placeholder={L('common.enterDetails')} />
              ) : (
                <input type="text" autoFocus value={editingField.value}
                  onChange={e => setEditingField(prev => prev ? { ...prev, value: e.target.value } : null)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveField(); if (e.key === 'Escape') setEditingField(null); }}
                  className="flex-1 text-xs text-gray-900 border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  placeholder="-" />
              )}
              <div className={`flex ${isTextArea ? 'flex-col' : ''} gap-1 shrink-0`}>
                <button onClick={handleSaveField} disabled={isSavingThis} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
                  {isSavingThis ? '…' : L('common.save')}
                </button>
                <button onClick={() => setEditingField(null)} disabled={isSavingThis} className="text-xs text-gray-500 px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-50">
                  {L('common.cancel')}
                </button>
              </div>
            </>
          ) : (
            <>
              <span className={`flex-1 min-w-0 text-xs font-medium ${highlight ? 'text-red-800' : 'text-gray-900'} ${isTextArea ? 'whitespace-pre-wrap break-words' : ''}`}>
                {displayValue || <span className="text-gray-300">-</span>}
              </span>
              {canEdit && !editingField && (
                <button
                  onClick={() => setEditingField({ key: field.fieldKey, value: rawValue, sheetHeader: field.sheetHeader, isLegacy: field.isLegacy })}
                  className="text-xs text-blue-500 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50 shrink-0 transition-colors">
                  {L('task.edit')}
                </button>
              )}
            </>
          )}
        </div>
      );
    }));
  };

  // ── 탭별 콘텐츠 ────────────────────────────────────────────
  const sectionBlocks = (t: StudentTabId) => sectionsForTab(config, t).map(renderSection);

  const healthExtras = (
    <>
      {guardianContacts(student).length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-xs font-semibold text-gray-700 mb-2">📞 {L('studentModal.quickContact')}</p>
          <div className="space-y-2">
            {guardianContacts(student).map(c => (
              <div key={c.role} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-20 shrink-0">{c.role === 'primary' ? L('studentModal.primaryGuardian') : L('studentModal.otherGuardian')}</span>
                <span className="flex-1 min-w-0 text-xs text-gray-900 font-medium truncate">{c.name ? `${c.name} · ` : ''}{c.phone}</span>
                <a href={`tel:${dialablePhone(c.phone)}`} className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">{L('studentModal.call')}</a>
                <a href={`sms:${dialablePhone(c.phone)}`} className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100">{L('studentModal.sms')}</a>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const patientTimeline = (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
        <span className="text-base leading-none">🩺</span>
        <h4 className="text-sm font-semibold text-gray-900 flex-1">{L('studentModal.patientHistory')}</h4>
        <Link href="/camp/patient" className="text-xs text-blue-600 hover:underline">{L('studentModal.openPatientTab')} ›</Link>
      </div>
      {records === null ? (
        <div className="py-6 flex justify-center"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : records.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-5">{L('studentModal.noPatientRecords')}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {records.map(r => {
            const d = r.visitDate?.toDate?.();
            const open = isOpenPatientRecord(r);
            const visits = (r.hospitalVisits ?? []).length;
            return (
              <li key={r.id} className="px-4 py-2.5 flex gap-3">
                <span className="text-xs text-gray-500 w-12 shrink-0 tabular-nums pt-0.5">{d ? `${d.getMonth() + 1}/${d.getDate()}` : '-'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 break-words">{r.symptom || '-'}</span>
                    <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${open ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>{dataLabel(r.progressStatus)}</span>
                    {(r.types ?? []).map(t => <span key={t} className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{dataLabel(t)}</span>)}
                  </div>
                  {(r.treatment || visits > 0) && (
                    <p className="text-xs text-gray-500 mt-0.5 break-words">
                      {r.treatment}{r.treatment && visits > 0 ? ' · ' : ''}{visits > 0 ? L('studentModal.hospitalVisits', { v0: visits }) : ''}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const levelProgress = (() => {
    const rows = placementSummary(student);
    if (rows.length === 0 || rows.every(r => r.final === null)) return null;
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-3">
        <p className="text-xs font-semibold text-gray-700 mb-2">📈 {L('studentModal.levelProgress')}</p>
        <div className="grid grid-cols-3 gap-2">
          {rows.map(r => {
            const diff = r.entry !== null && r.final !== null ? r.final - r.entry : null;
            return (
              <div key={r.skill} className="rounded-lg bg-gray-50 px-2 py-2 text-center">
                <p className="text-[11px] text-gray-500">{r.skill}</p>
                <p className="text-sm font-semibold text-gray-900 tabular-nums">{r.entry ?? '-'} → {r.final ?? '-'}</p>
                {diff !== null && (
                  <p className={`text-[11px] font-semibold tabular-nums ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                    {diff > 0 ? `+${diff}` : diff}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

  const comingSoon = (icon: string, bodyKey: MessageKey) => (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
      <p className="text-3xl mb-2">{icon}</p>
      <p className="text-sm font-semibold text-gray-800">{L('studentModal.comingSoon')}</p>
      <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">{L(bodyKey)}</p>
    </div>
  );

  let body: ReactNode;
  switch (activeTab) {
    case 'health': body = <>{healthExtras}{sectionBlocks('health')}{campCode && <StudentMemoCard campCode={campCode} student={student} actor={actor} />}{patientTimeline}</>; break;
    case 'allowance': body = campCode
      ? <StudentAllowanceTab data={allowance} student={student} campCode={campCode} roster={students} actor={actor} />
      : comingSoon('💰', 'studentModal.allowanceSoon'); break;
    case 'devices': body = campCode
      ? <StudentDevicesTab devices={devices} student={student} campCode={campCode} roster={students} actor={actor} ctx={deviceCtx.ctx} staff={deviceCtx.staff} />
      : comingSoon('📱', 'studentModal.devicesSoon'); break;
    case 'study': body = <>{levelProgress}{sectionBlocks('study')}</>; break;
    case 'survey': body = <>{sectionBlocks('survey')}</>; break;
    default: body = <>{sectionBlocks('basic')}</>;
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-stretch md:items-center justify-center z-50 md:p-6" onClick={onClose}>
      <div className="bg-white w-full h-full md:h-[85vh] md:max-w-5xl md:rounded-2xl shadow-xl flex flex-col md:flex-row overflow-hidden"
        onClick={e => e.stopPropagation()}>

        {/* 데스크탑: 왼쪽 프로필 패널 */}
        <aside className="hidden md:flex md:flex-col md:w-80 md:shrink-0 md:border-r md:border-gray-200 md:bg-gray-50">
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {avatar('w-full aspect-square rounded-2xl', 'w-1/2 h-1/2')}
            <div className="text-center pt-1">
              <h3 className="text-xl font-bold text-gray-900">{student.name}</h3>
              {subline && <p className="text-sm text-gray-500 mt-0.5">{subline}</p>}
            </div>
            {(classLine || unitLine) && (
              <div className="rounded-xl bg-white border border-gray-200 px-3 py-2 space-y-1">
                {classLine && <p className="text-xs text-gray-700 break-words">🏫 {classLine}</p>}
                {unitLine && <p className="text-xs text-gray-700 break-words">🏠 {unitLine}</p>}
              </div>
            )}
            {alerts(false)}
            {renderExtra?.(student)}
          </div>
          <div className="border-t border-gray-200 px-3 py-2 flex justify-center">{nav}</div>
        </aside>

        {/* 오른쪽(데스크탑) / 전체(좁은 화면) */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* 좁은 화면: 상단 바 + 요약 */}
          <div className="md:hidden shrink-0 max-h-[45vh] overflow-y-auto border-b border-gray-200">
            <div className="flex items-center justify-between px-2 py-1.5">
              <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-600 text-xl" aria-label={L('common.close')}>✕</button>
              <span className="text-sm font-semibold text-gray-900">{L('studentModal.studentDetails')}</span>
              {nav}
            </div>
            <div className="flex gap-3 px-4 pb-3">
              {avatar('w-20 h-20 rounded-xl shrink-0', 'w-10 h-10')}
              <div className="flex-1 min-w-0">
                <p className="text-lg font-bold text-gray-900 leading-tight">{student.name}</p>
                {subline && <p className="text-xs text-gray-500 mt-0.5">{subline}</p>}
                {classLine && <p className="text-[11px] text-gray-600 mt-1 truncate">{classLine}</p>}
                {unitLine && <p className="text-[11px] text-gray-600 truncate">{unitLine}</p>}
              </div>
            </div>
            {(openCount > 0 || allowancePending > 0 || negative.length > 0 || uncollected > 0 || needCharge > 0) && <div className="px-4 pb-3 space-y-1.5">{alerts(true)}</div>}
            {renderExtra && <div className="px-4 pb-3">{renderExtra(student)}</div>}
          </div>

          {/* 탭 */}
          <div className="shrink-0 flex items-center border-b border-gray-200 bg-white">
            <div className="flex-1 flex overflow-x-auto [scrollbar-width:none] px-2 md:px-4">
              {tabs.map(t => (
                <button key={t} type="button" onClick={() => { setTab(t); setEditingField(null); contentRef.current?.scrollTo({ top: 0 }); }}
                  className={`shrink-0 px-3 md:px-4 py-3 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                    activeTab === t ? 'border-blue-600 text-blue-600 font-semibold' : 'border-transparent text-gray-500 hover:text-gray-800'
                  }`}>
                  {L(STUDENT_TAB_LABEL_KEYS[t])}
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className="hidden md:flex w-10 h-10 mr-2 items-center justify-center text-gray-500 hover:text-gray-800 text-xl" aria-label={L('common.close')}>✕</button>
          </div>

          {/* 탭 내용 */}
          <div ref={contentRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-gray-50 md:bg-white px-4 md:px-6 py-4 space-y-3">
            {body}
          </div>
        </div>
      </div>
    </div>
  );
}
