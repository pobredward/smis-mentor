'use client';
/**
 * 학생 상세 모달 — 전자기기 탭 (web)
 * 기기별 기종·잠금 해제 정보(바로 표시)·보관 위치 흐름·충전 메모, 명단 일괄 위치 변경
 */
import { useEffect, useMemo, useState } from 'react';
import {
  L, logger, DEVICE_KINDS, DEVICE_LOCK_TYPES, DEVICE_LOCATIONS, parsePattern, patternToCode,
  subscribeStudentDevices, getCampDevices, addStudentDevice, updateStudentDevice, moveStudentDevices, deleteStudentDevice,
  type StudentDevice, type DeviceKind, type DeviceLockType, type DeviceLocation, type MessageKey, type STSheetStudent,
} from '@smis-mentor/shared';
import { db } from '@/lib/firebase';

export const KIND_KEY: Record<DeviceKind, MessageKey> = {
  phone: 'studentDevice.kindPhone', tablet: 'studentDevice.kindTablet', watch: 'studentDevice.kindWatch',
  laptop: 'studentDevice.kindLaptop', etc: 'studentDevice.kindEtc',
};
const KIND_ICON: Record<DeviceKind, string> = { phone: '📱', tablet: '📲', watch: '⌚', laptop: '💻', etc: '🔌' };
export const LOCK_KEY: Record<DeviceLockType, MessageKey> = {
  pin: 'studentDevice.lockPin', pattern: 'studentDevice.lockPattern', password: 'studentDevice.lockPassword', none: 'studentDevice.lockNone',
};
export const LOC_KEY: Record<DeviceLocation, MessageKey> = {
  student: 'studentDevice.locStudent', unit: 'studentDevice.locUnit', office: 'studentDevice.locOffice', returned: 'studentDevice.locReturned',
};
const LOC_STYLE: Record<DeviceLocation, string> = {
  student: 'bg-red-50 text-red-700 border-red-200', unit: 'bg-blue-50 text-blue-700 border-blue-200',
  office: 'bg-indigo-50 text-indigo-700 border-indigo-200', returned: 'bg-gray-100 text-gray-500 border-gray-200',
};

/** 보관 위치 옆 괄호 — 방 담당은 유닛 멘토, 교무실은 반 코드 */
export function locationHolder(loc: DeviceLocation, s: Pick<STSheetStudent, 'unitMentor' | 'unit' | 'classNumber'>): string {
  if (loc === 'unit') return s.unitMentor || s.unit || '';
  if (loc === 'office') return s.classNumber?.substring(0, 3) || '';
  return '';
}

export interface DeviceActorInfo { uid: string; name: string }

export function useStudentDevices(campCode: string | null, studentId: string | undefined) {
  const [byId, setById] = useState<Record<string, StudentDevice[]>>({});
  useEffect(() => {
    if (!campCode || !studentId) return;
    return subscribeStudentDevices(db, campCode, studentId, d => setById(p => ({ ...p, [studentId]: d })), e => logger.warn('[devices]', e));
  }, [campCode, studentId]);
  return studentId ? byId[studentId] ?? null : null;
}

// ── 패턴 표시 / 입력 ────────────────────────────────────────────
export function PatternView({ code, size = 72 }: { code?: string; size?: number }) {
  const dots = parsePattern(code);
  const pos = (n: number) => ({ x: ((n - 1) % 3) * (size / 3) + size / 6, y: Math.floor((n - 1) / 3) * (size / 3) + size / 6 });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <polyline points={dots.map(n => `${pos(n).x},${pos(n).y}`).join(' ')} fill="none" stroke="#2563eb" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => {
        const i = dots.indexOf(n);
        return (
          <g key={n}>
            <circle cx={pos(n).x} cy={pos(n).y} r={i >= 0 ? size / 11 : size / 22} fill={i === 0 ? '#16a34a' : i > 0 ? '#2563eb' : '#d1d5db'} />
            {i >= 0 && <text x={pos(n).x} y={pos(n).y + size / 30} textAnchor="middle" fontSize={size / 9} fill="#fff" fontWeight={700}>{i + 1}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function PatternPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const dots = parsePattern(value);
  return (
    <div className="flex items-center gap-4">
      <div className="grid grid-cols-3 gap-2 w-36">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => {
          const i = dots.indexOf(n);
          return (
            <button key={n} type="button" onClick={() => { if (i < 0) onChange(patternToCode([...dots, n])); }}
              className={`w-10 h-10 rounded-full text-sm font-bold ${i === 0 ? 'bg-green-600 text-white' : i > 0 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-300 hover:bg-gray-200'}`}>
              {i >= 0 ? i + 1 : '•'}
            </button>
          );
        })}
      </div>
      <div className="space-y-2">
        <PatternView code={value} size={64} />
        <p className="text-[11px] text-gray-400">{L('studentDevice.patternHint')}</p>
        <button type="button" onClick={() => onChange('')} className="text-xs text-blue-600">{L('studentDevice.patternReset')}</button>
      </div>
    </div>
  );
}

function LockDisplay({ d }: { d: StudentDevice }) {
  if (d.lockType === 'none') return <span className="text-xs text-gray-400">{L('studentDevice.lockNone')}</span>;
  if (d.lockType === 'pattern') return <PatternView code={d.lockCode} />;
  return (
    <div>
      <p className="text-[10px] text-gray-400">{L(LOCK_KEY[d.lockType])}</p>
      <p className="font-mono text-xl font-bold tracking-widest text-gray-900 select-all">{d.lockCode || '-'}</p>
    </div>
  );
}

const md = (d?: Date | null) => (d ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '-');

// ── 탭 ─────────────────────────────────────────────────────────
export default function StudentDevicesTab({ devices, student, campCode, roster, actor }: {
  devices: StudentDevice[] | null; student: STSheetStudent; campCode: string; roster: STSheetStudent[]; actor: DeviceActorInfo;
}) {
  const [edit, setEdit] = useState<StudentDevice | 'new' | null>(null);
  const [bulk, setBulk] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const move = async (d: StudentDevice, to: DeviceLocation) => {
    setBusyId(d.id);
    try { await moveStudentDevices(db, [d], to, actor); } catch (e) { logger.error('[devices] move', e); alert(L('studentDevice.saveFailed')); } finally { setBusyId(null); }
  };
  const toggleCharge = async (d: StudentDevice) => {
    try { await updateStudentDevice(db, d.id, { needsCharge: !d.needsCharge }, actor); } catch (e) { logger.error('[devices] charge', e); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold text-gray-900 flex-1">{L('studentDevice.title')} {devices ? `(${devices.length})` : ''}</h4>
        {roster.length > 1 && <button type="button" onClick={() => setBulk(true)} className="text-xs px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50">{L('studentDevice.bulk')}</button>}
        <button type="button" onClick={() => setEdit('new')} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700">+ {L('studentDevice.add')}</button>
      </div>

      {devices === null ? (
        <div className="py-6 flex justify-center"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : devices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
          <p className="text-3xl mb-2">📱</p>
          <p className="text-sm font-semibold text-gray-800">{L('studentDevice.none')}</p>
          <p className="text-xs text-gray-500 mt-1">{L('studentDevice.noneHint')}</p>
        </div>
      ) : devices.map(d => (
        <div key={d.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">{KIND_ICON[d.kind]}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">{d.model} <span className="text-xs font-normal text-gray-500">· {L(KIND_KEY[d.kind])}</span></p>
              {d.feature && <p className="text-xs text-gray-500 mt-0.5">{d.feature}</p>}
            </div>
            <button type="button" onClick={() => setEdit(d)} className="text-xs text-blue-600 hover:underline">{L('common.edit')}</button>
          </div>

          <div className="flex items-center gap-4 rounded-lg bg-gray-50 px-3 py-2">
            <span className="text-xs text-gray-500 w-16 shrink-0">🔓 {L('studentDevice.lock')}</span>
            <LockDisplay d={d} />
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1.5">{L('studentDevice.location')}</p>
            <div className="flex flex-wrap gap-1.5">
              {DEVICE_LOCATIONS.map(loc => {
                const on = d.location === loc;
                const holder = locationHolder(loc, student);
                return (
                  <button key={loc} type="button" disabled={busyId === d.id || on} onClick={() => move(d, loc)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border ${on ? `${LOC_STYLE[loc]} font-semibold` : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    {on ? '● ' : ''}{L(LOC_KEY[loc])}{holder ? ` (${holder})` : ''}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => toggleCharge(d)}
              className={`text-xs px-2.5 py-1 rounded-full border ${d.needsCharge ? 'bg-amber-100 border-amber-300 text-amber-800 font-semibold' : 'bg-white border-gray-200 text-gray-500'}`}>
              🔋 {L('studentDevice.needsCharge')}{d.needsCharge ? ' ✓' : ''}
            </button>
            {d.batteryNote && <span className="text-xs text-gray-600">{d.batteryNote}</span>}
            {d.note && <span className="text-xs text-gray-500">· {d.note}</span>}
          </div>

          {!!d.moves?.length && (
            <details className="text-[11px] text-gray-500">
              <summary className="cursor-pointer">{L('studentDevice.history')} ({d.moves.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {d.moves.slice().reverse().map((m, i) => (
                  <li key={i}>{md(m.at?.toDate?.())} · {m.by} · {L(LOC_KEY[m.from])} → {L(LOC_KEY[m.to])}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}

      {edit && <DeviceForm device={edit === 'new' ? null : edit} student={student} campCode={campCode} actor={actor} onClose={() => setEdit(null)} />}
      {bulk && <BulkMove campCode={campCode} roster={roster} actor={actor} onClose={() => setBulk(false)} />}
    </div>
  );
}

// ── 등록/수정 ───────────────────────────────────────────────────
function DeviceForm({ device, student, campCode, actor, onClose }: {
  device: StudentDevice | null; student: STSheetStudent; campCode: string; actor: DeviceActorInfo; onClose: () => void;
}) {
  const [kind, setKind] = useState<DeviceKind>(device?.kind ?? 'phone');
  const [model, setModel] = useState(device?.model ?? '');
  const [feature, setFeature] = useState(device?.feature ?? '');
  const [lockType, setLockType] = useState<DeviceLockType>(device?.lockType ?? 'pin');
  const [lockCode, setLockCode] = useState(device?.lockCode ?? '');
  const [location, setLocation] = useState<DeviceLocation>(device?.location ?? 'unit');
  const [needsCharge, setNeedsCharge] = useState(!!device?.needsCharge);
  const [batteryNote, setBatteryNote] = useState(device?.batteryNote ?? '');
  const [note, setNote] = useState(device?.note ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!model.trim()) { alert(L('studentDevice.modelRequired')); return; }
    setBusy(true);
    try {
      const code = lockType === 'none' ? '' : lockCode.trim();
      if (device) {
        await updateStudentDevice(db, device.id, { kind, model: model.trim(), feature, lockType, lockCode: code, needsCharge, batteryNote, note }, actor);
        if (device.location !== location) await moveStudentDevices(db, [device], location, actor);
      } else {
        await addStudentDevice(db, campCode, student, { kind, model: model.trim(), feature, lockType, lockCode: code, location, needsCharge, batteryNote, note }, actor);
      }
      onClose();
    } catch (e) { logger.error('[devices] save', e); alert(L('studentDevice.saveFailed')); setBusy(false); }
  };
  const remove = async () => {
    if (!device || !confirm(L('studentDevice.confirmDelete'))) return;
    setBusy(true);
    try { await deleteStudentDevice(db, device.id); onClose(); } catch (e) { logger.error('[devices] delete', e); alert(L('studentDevice.saveFailed')); setBusy(false); }
  };

  const chip = (on: boolean) => `text-xs px-2.5 py-1 rounded-full border ${on ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`;

  return (
    <Overlay title={device ? L('studentDevice.edit') : L('studentDevice.add')} onClose={onClose}>
      <div className="space-y-3">
        <Field label={L('studentDevice.kind')}>
          <div className="flex flex-wrap gap-1.5">{DEVICE_KINDS.map(k => <button key={k} type="button" className={chip(kind === k)} onClick={() => setKind(k)}>{KIND_ICON[k]} {L(KIND_KEY[k])}</button>)}</div>
        </Field>
        <Field label={L('studentDevice.model')}>
          <input value={model} onChange={e => setModel(e.target.value)} placeholder={L('studentDevice.modelPh')} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </Field>
        <Field label={L('studentDevice.feature')}>
          <input value={feature} onChange={e => setFeature(e.target.value)} placeholder={L('studentDevice.featurePh')} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </Field>
        <Field label={L('studentDevice.lock')}>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {DEVICE_LOCK_TYPES.map(t => <button key={t} type="button" className={chip(lockType === t)} onClick={() => { if (t !== lockType) setLockCode(''); setLockType(t); }}>{L(LOCK_KEY[t])}</button>)}
          </div>
          {lockType === 'pattern' ? <PatternPad value={lockCode} onChange={setLockCode} />
            : lockType !== 'none' && (
              <input value={lockCode} onChange={e => setLockCode(e.target.value)} inputMode={lockType === 'pin' ? 'numeric' : 'text'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-lg font-mono tracking-widest" />
            )}
        </Field>
        <Field label={L('studentDevice.location')}>
          <div className="flex flex-wrap gap-1.5">{DEVICE_LOCATIONS.map(l => <button key={l} type="button" className={chip(location === l)} onClick={() => setLocation(l)}>{L(LOC_KEY[l])}</button>)}</div>
        </Field>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={needsCharge} onChange={e => setNeedsCharge(e.target.checked)} /> 🔋 {L('studentDevice.needsCharge')}
        </label>
        <Field label={L('studentDevice.batteryNote')}>
          <input value={batteryNote} onChange={e => setBatteryNote(e.target.value)} placeholder={L('studentDevice.batteryNotePh')} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </Field>
        <Field label={L('studentDevice.note')}>
          <input value={note} onChange={e => setNote(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </Field>
      </div>
      <div className="flex items-center gap-2 mt-5">
        {device && <button type="button" onClick={remove} disabled={busy} className="text-sm px-3 py-2 rounded-lg text-red-600 hover:bg-red-50">{L('common.delete')}</button>}
        <button type="button" onClick={onClose} disabled={busy} className="ml-auto text-sm px-4 py-2 rounded-lg bg-gray-100 text-gray-700">{L('common.cancel')}</button>
        <button type="button" onClick={save} disabled={busy} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{busy ? '…' : L('common.save')}</button>
      </div>
    </Overlay>
  );
}

// ── 명단 일괄 위치 변경 ─────────────────────────────────────────
function BulkMove({ campCode, roster, actor, onClose }: { campCode: string; roster: STSheetStudent[]; actor: DeviceActorInfo; onClose: () => void }) {
  const [devices, setDevices] = useState<StudentDevice[] | null>(null);
  const [filter, setFilter] = useState<DeviceLocation | 'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const rosterIds = useMemo(() => new Set(roster.map(s => s.studentId)), [roster]);
  const order = useMemo(() => new Map(roster.map((s, i) => [s.studentId, i])), [roster]);

  useEffect(() => {
    getCampDevices(db, campCode)
      .then(list => setDevices(list.filter(d => rosterIds.has(d.studentId)).sort((a, b) => (order.get(a.studentId) ?? 0) - (order.get(b.studentId) ?? 0))))
      .catch(e => { logger.error('[devices] bulk load', e); setDevices([]); });
  }, [campCode, rosterIds, order]);

  const shown = (devices ?? []).filter(d => filter === 'all' || d.location === filter);
  const toggle = (id: string) => setSelected(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const moveTo = async (to: DeviceLocation) => {
    const list = (devices ?? []).filter(d => selected.has(d.id));
    if (!list.length) return;
    setBusy(true);
    try {
      await moveStudentDevices(db, list, to, actor);
      setDevices(prev => (prev ?? []).map(d => (selected.has(d.id) ? { ...d, location: to } : d)));
      setSelected(new Set());
    } catch (e) { logger.error('[devices] bulk move', e); alert(L('studentDevice.saveFailed')); } finally { setBusy(false); }
  };

  return (
    <Overlay title={L('studentDevice.bulk')} onClose={onClose} wide>
      <p className="text-xs text-gray-500 mb-3">{L('studentDevice.bulkHint')}</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {(['all', ...DEVICE_LOCATIONS] as const).map(f => (
          <button key={f} type="button" onClick={() => { setFilter(f); setSelected(new Set()); }}
            className={`text-xs px-2.5 py-1 rounded-full border ${filter === f ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600'}`}>
            {f === 'all' ? L('studentDevice.all') : L(LOC_KEY[f])} ({(devices ?? []).filter(d => f === 'all' || d.location === f).length})
          </button>
        ))}
      </div>
      {devices === null ? (
        <div className="py-6 flex justify-center"><div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : shown.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-6">{L('studentDevice.noRosterDevices')}</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs text-gray-600 mb-1">
            <input type="checkbox" checked={shown.every(d => selected.has(d.id))}
              onChange={e => setSelected(e.target.checked ? new Set(shown.map(d => d.id)) : new Set())} /> {L('allowance.selectAll')}
          </label>
          <ul className="max-h-72 overflow-y-auto divide-y divide-gray-100 border rounded-lg">
            {shown.map(d => (
              <li key={d.id}>
                <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} />
                  <span className="font-medium text-gray-900 w-20 truncate">{d.studentName}</span>
                  <span className="flex-1 text-gray-600 truncate">{KIND_ICON[d.kind]} {d.model}</span>
                  {d.needsCharge && <span>🔋</span>}
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${LOC_STYLE[d.location]}`}>{L(LOC_KEY[d.location])}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap items-center gap-1.5 mt-4">
        <span className="text-xs text-gray-500 mr-1">{L('studentDevice.bulkMove', { v0: selected.size })}:</span>
        {DEVICE_LOCATIONS.map(loc => (
          <button key={loc} type="button" disabled={busy || selected.size === 0} onClick={() => moveTo(loc)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border disabled:opacity-40 ${LOC_STYLE[loc]}`}>{L(LOC_KEY[loc])}</button>
        ))}
      </div>
    </Overlay>
  );
}

function Overlay({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div data-modal-overlay className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={e => { e.stopPropagation(); onClose(); }}>
      <div className={`bg-white w-full ${wide ? 'sm:max-w-xl' : 'sm:max-w-md'} max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl p-5`} onClick={e => e.stopPropagation()}>
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
