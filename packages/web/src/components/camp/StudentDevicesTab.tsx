'use client';
/**
 * 학생 상세 모달 — 전자기기 탭 (web)
 * 기기별 기종·잠금 해제 정보(바로 표시)·보관 위치 흐름·충전 메모, 명단 일괄 위치 변경
 */
import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import {
  L, logger, GADGET_KINDS, DEVICE_LOCK_TYPES, DEVICE_LOCATIONS, CHARGER_TYPES, parsePattern, patternToCode,
  deviceLocationDetail, getUsersByJobCodeId, isCampStaffRole, isCharger, matchingChargers,
  subscribeStudentDevices, getCampDevices, addStudentDevice, updateStudentDevice, moveStudentDevices, deleteStudentDevice,
  type StudentDevice, type DeviceKind, type DeviceLockType, type DeviceLocation, type ChargerType, type MessageKey,
  type STSheetStudent, type DeviceLocationContext,
} from '@smis-mentor/shared';
import { db } from '@/lib/firebase';

export const KIND_KEY: Record<DeviceKind, MessageKey> = {
  phone: 'studentDevice.kindPhone', tablet: 'studentDevice.kindTablet', watch: 'studentDevice.kindWatch',
  laptop: 'studentDevice.kindLaptop', etc: 'studentDevice.kindEtc', charger: 'studentDevice.kindCharger',
};
const KIND_ICON: Record<DeviceKind, string> = { phone: '📱', tablet: '📲', watch: '⌚', laptop: '💻', etc: '🎧', charger: '🔌' };
export const LOCK_KEY: Record<DeviceLockType, MessageKey> = {
  pin: 'studentDevice.lockPin', pattern: 'studentDevice.lockPattern', password: 'studentDevice.lockPassword', none: 'studentDevice.lockNone',
};
export const LOC_KEY: Record<DeviceLocation, MessageKey> = {
  student: 'studentDevice.locStudent', unit: 'studentDevice.locUnit', office: 'studentDevice.locOffice',
  teacher: 'studentDevice.locTeacher', lent: 'studentDevice.locLent', returned: 'studentDevice.locReturned',
};
const LOC_STYLE: Record<DeviceLocation, string> = {
  student: 'bg-red-50 text-red-700 border-red-200', unit: 'bg-blue-50 text-blue-700 border-blue-200',
  office: 'bg-indigo-50 text-indigo-700 border-indigo-200', teacher: 'bg-violet-50 text-violet-700 border-violet-200',
  lent: 'bg-amber-50 text-amber-700 border-amber-200', returned: 'bg-gray-100 text-gray-500 border-gray-200',
};
const CHG_KEY: Record<ChargerType, MessageKey> = {
  usbc: 'studentDevice.chg_usbc', lightning: 'studentDevice.chg_lightning', micro: 'studentDevice.chg_micro',
  wireless: 'studentDevice.chg_wireless', etc: 'studentDevice.chg_etc',
};

export interface StaffOption { id: string; name: string }

/** 보관 위치 상세(방 담당 방·그룹 교무실 호수)와 선생님 목록 — 캠프 설정·캠프 스태프에서 */
export function useDeviceContext(campCode: string | null, jobCodeId: string | undefined) {
  const [ctx, setCtx] = useState<DeviceLocationContext>({});
  const [staff, setStaff] = useState<StaffOption[]>([]);
  useEffect(() => {
    if (!campCode) return;
    getDoc(doc(db, 'campSettings', campCode))
      .then(snap => { const d = snap.data() ?? {}; setCtx({ groups: d.groups ?? [], rooms: d.lodging?.rooms ?? {} }); })
      .catch(e => logger.warn('[devices] campSettings', e));
  }, [campCode]);
  useEffect(() => {
    if (!jobCodeId) return;
    getUsersByJobCodeId(db, jobCodeId)
      .then(users => setStaff(users
        .filter(u => isCampStaffRole(u.role))
        .map(u => ({ id: u.userId ?? u.id ?? '', name: u.name }))
        .filter(u => u.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))))
      .catch(e => logger.warn('[devices] staff', e));
  }, [jobCodeId]);
  return { ctx, staff };
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
export default function StudentDevicesTab({ devices, student, campCode, roster, actor, ctx, staff }: {
  devices: StudentDevice[] | null; student: STSheetStudent; campCode: string; roster: STSheetStudent[]; actor: DeviceActorInfo;
  ctx: DeviceLocationContext; staff: StaffOption[];
}) {
  const [edit, setEdit] = useState<StudentDevice | 'new' | 'newCharger' | null>(null);
  const [bulk, setBulk] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickFor, setPickFor] = useState<StudentDevice | null>(null);

  const move = async (d: StudentDevice, to: DeviceLocation, holder?: StaffOption) => {
    if (to === 'teacher' && !holder) { setPickFor(d); return; }
    setBusyId(d.id);
    try { await moveStudentDevices(db, [d], to, actor, holder); } catch (e) { logger.error('[devices] move', e); alert(L('studentDevice.saveFailed')); } finally { setBusyId(null); }
  };
  const patch = async (d: StudentDevice, p: Parameters<typeof updateStudentDevice>[2]) => {
    try { await updateStudentDevice(db, d.id, p, actor); } catch (e) { logger.error('[devices] patch', e); alert(L('studentDevice.saveFailed')); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold text-gray-900 flex-1">{L('studentDevice.title')} {devices ? `(${devices.length})` : ''}</h4>
        {roster.length > 1 && <button type="button" onClick={() => setBulk(true)} className="text-xs px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50">{L('studentDevice.bulk')}</button>}
        <button type="button" onClick={() => setEdit('newCharger')} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">🔌 {L('studentDevice.addCharger')}</button>
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

          {isCharger(d) ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-500 mr-1">{L('studentDevice.chargerPorts')}</span>
              {(d.chargerTypes ?? []).map(t => <span key={t} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-900 text-white">{L(CHG_KEY[t])}</span>)}
            </div>
          ) : (
            <div className="flex items-center gap-4 rounded-lg bg-gray-50 px-3 py-2">
              <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">🔓 {L('studentDevice.lock')}</span>
              <LockDisplay d={d} />
            </div>
          )}

          <div>
            <p className="text-xs text-gray-500 mb-1.5">{L('studentDevice.location')}</p>
            <div className="flex flex-wrap gap-1.5">
              {DEVICE_LOCATIONS.map(loc => {
                const on = d.location === loc;
                const holder = on || loc !== 'teacher' ? deviceLocationDetail(loc, student, ctx, d.holderName) : '';
                return (
                  <button key={loc} type="button" disabled={busyId === d.id || (on && loc !== 'teacher')} onClick={() => move(d, loc)}
                    className={`text-xs px-2.5 py-1.5 rounded-lg border ${on ? `${LOC_STYLE[loc]} font-semibold` : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                    {on ? '● ' : ''}{L(LOC_KEY[loc])}{holder ? ` (${holder})` : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {!isCharger(d) && (<>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => patch(d, { needsCharge: !d.needsCharge })}
              className={`text-xs px-2.5 py-1 rounded-full border ${d.needsCharge ? 'bg-amber-100 border-amber-300 text-amber-800 font-semibold' : 'bg-white border-gray-200 text-gray-500'}`}>
              🔋 {L('studentDevice.needsCharge')}{d.needsCharge ? ' ✓' : ''}
            </button>
            {d.needsCharge && (
              <label className="flex items-center gap-1 text-xs text-gray-600">
                {L('studentDevice.batteryPercent')}
                <input key={`${d.id}-${d.batteryPercent ?? ''}`} type="number" min={0} max={100} inputMode="numeric" defaultValue={d.batteryPercent ?? ''}
                  onBlur={e => { const v = e.target.value === '' ? undefined : Math.max(0, Math.min(100, Number(e.target.value))); if (v !== d.batteryPercent) patch(d, { batteryPercent: v }); }}
                  className="w-14 border border-gray-200 rounded px-1.5 py-0.5 text-center tabular-nums" />%
              </label>
            )}
            {d.batteryNote && <span className="text-xs text-gray-600">{d.batteryNote}</span>}
            {d.note && <span className="text-xs text-gray-500">· {d.note}</span>}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-gray-500 mr-1">{L('studentDevice.chargePort')}</span>
            {CHARGER_TYPES.map(t => {
              const on = (d.chargerTypes ?? []).includes(t);
              return (
                <button key={t} type="button"
                  onClick={() => patch(d, { chargerTypes: on ? (d.chargerTypes ?? []).filter(x => x !== t) : [...(d.chargerTypes ?? []), t] })}
                  className={`text-[11px] px-2 py-0.5 rounded-full border ${on ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-500'}`}>
                  {L(CHG_KEY[t])}
                </button>
              );
            })}
            {!!d.chargerTypes?.length && (matchingChargers(d, devices ?? []).length
              ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-semibold">🔌 {L('studentDevice.chargerOk')}</span>
              : <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-semibold">🔌 {L('studentDevice.chargerNoMatch')}</span>)}
          </div>
          </>)}
          {isCharger(d) && d.note && <p className="text-xs text-gray-500">{d.note}</p>}

          {!!d.moves?.length && (
            <details className="text-[11px] text-gray-500">
              <summary className="cursor-pointer">{L('studentDevice.history')} ({d.moves.length})</summary>
              <ul className="mt-1 space-y-0.5">
                {d.moves.slice().reverse().map((m, i) => (
                  <li key={i}>{md(m.at?.toDate?.())} · {m.by} · {L(LOC_KEY[m.from])} → {L(LOC_KEY[m.to])}{m.holder ? ` (${m.holder})` : ''}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ))}

      {edit && <DeviceForm device={edit === 'new' || edit === 'newCharger' ? null : edit} charger={edit === 'newCharger' || (typeof edit === 'object' && isCharger(edit))} student={student} campCode={campCode} actor={actor} staff={staff} onClose={() => setEdit(null)} />}
      {bulk && <BulkMove campCode={campCode} roster={roster} actor={actor} staff={staff} onClose={() => setBulk(false)} />}
      {pickFor && <TeacherPicker staff={staff} onClose={() => setPickFor(null)} onPick={h => { const d = pickFor; setPickFor(null); move(d, 'teacher', h); }} />}
    </div>
  );
}

// ── 등록/수정 ───────────────────────────────────────────────────
function DeviceForm({ device, charger, student, campCode, actor, staff, onClose }: {
  device: StudentDevice | null; charger: boolean; student: STSheetStudent; campCode: string; actor: DeviceActorInfo; staff: StaffOption[]; onClose: () => void;
}) {
  const [kind, setKind] = useState<DeviceKind>(device?.kind ?? (charger ? 'charger' : 'phone'));
  const [model, setModel] = useState(device?.model ?? (charger ? L('studentDevice.chargerDefaultName') : ''));
  const [feature, setFeature] = useState(device?.feature ?? '');
  const [lockType, setLockType] = useState<DeviceLockType>(device?.lockType ?? 'pin');
  const [lockCode, setLockCode] = useState(device?.lockCode ?? '');
  const [location, setLocation] = useState<DeviceLocation>(device?.location ?? 'unit');
  const [holder, setHolder] = useState<StaffOption | null>(device?.holderName ? { id: device.holderId ?? '', name: device.holderName } : null);
  const [picking, setPicking] = useState(false);
  const [needsCharge, setNeedsCharge] = useState(!!device?.needsCharge);
  const [batteryPercent, setBatteryPercent] = useState(device?.batteryPercent != null ? String(device.batteryPercent) : '');
  const [chargerTypes, setChargerTypes] = useState<ChargerType[]>(device?.chargerTypes ?? []);
  const [batteryNote, setBatteryNote] = useState(device?.batteryNote ?? '');
  const [note, setNote] = useState(device?.note ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!model.trim()) { alert(L('studentDevice.modelRequired')); return; }
    if (charger && chargerTypes.length === 0) { alert(L('studentDevice.chargerPortsRequired')); return; }
    setBusy(true);
    try {
      if (location === 'teacher' && !holder) { setPicking(true); setBusy(false); return; }
      const code = lockType === 'none' ? '' : lockCode.trim();
      const pct = batteryPercent.trim() === '' ? undefined : Math.max(0, Math.min(100, Number(batteryPercent)));
      const common = charger
        ? { kind: 'charger' as DeviceKind, model: model.trim(), feature, lockType: 'none' as DeviceLockType, lockCode: '', needsCharge: false, chargerTypes, batteryNote: '', note }
        : { kind, model: model.trim(), feature, lockType, lockCode: code, needsCharge, batteryPercent: needsCharge ? pct : undefined, chargerTypes, batteryNote, note };
      if (device) {
        await updateStudentDevice(db, device.id, common, actor);
        if (device.location !== location || (location === 'teacher' && device.holderName !== holder?.name)) {
          await moveStudentDevices(db, [device], location, actor, holder ?? undefined);
        }
      } else {
        await addStudentDevice(db, campCode, student, { ...common, location, holderName: holder?.name, holderId: holder?.id }, actor);
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
    <Overlay title={charger ? (device ? L('studentDevice.editCharger') : L('studentDevice.addCharger')) : (device ? L('studentDevice.edit') : L('studentDevice.add'))} onClose={onClose}>
      <div className="space-y-3">
        {charger ? (
          <>
            <p className="text-[11px] text-gray-400">{L('studentDevice.chargerFormHint')}</p>
            <Field label={L('studentDevice.chargerPorts')}>
              <div className="flex flex-wrap gap-1.5">
                {CHARGER_TYPES.map(t => {
                  const on = chargerTypes.includes(t);
                  return <button key={t} type="button" className={chip(on)} onClick={() => setChargerTypes(p => (on ? p.filter(x => x !== t) : [...p, t]))}>{on ? '☑' : '☐'} {L(CHG_KEY[t])}</button>;
                })}
              </div>
            </Field>
            <Field label={L('studentDevice.chargerName')}>
              <input value={model} onChange={e => setModel(e.target.value)} placeholder={L('studentDevice.chargerNamePh')} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            </Field>
          </>
        ) : (
          <>
            <Field label={L('studentDevice.kind')}>
              <div className="flex flex-wrap gap-1.5">{GADGET_KINDS.map(k => <button key={k} type="button" className={chip(kind === k)} onClick={() => setKind(k)}>{KIND_ICON[k]} {L(KIND_KEY[k])}</button>)}</div>
            </Field>
            <Field label={L('studentDevice.model')}>
              <input value={model} onChange={e => setModel(e.target.value)} placeholder={L('studentDevice.modelPh')} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
            </Field>
          </>
        )}
        <Field label={L('studentDevice.feature')}>
          <input value={feature} onChange={e => setFeature(e.target.value)} placeholder={L('studentDevice.featurePh')} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </Field>
        {!charger && <Field label={L('studentDevice.lock')}>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {DEVICE_LOCK_TYPES.map(t => <button key={t} type="button" className={chip(lockType === t)} onClick={() => { if (t !== lockType) setLockCode(''); setLockType(t); }}>{L(LOCK_KEY[t])}</button>)}
          </div>
          {lockType === 'pattern' ? <PatternPad value={lockCode} onChange={setLockCode} />
            : lockType !== 'none' && (
              <input value={lockCode} onChange={e => setLockCode(e.target.value)} inputMode={lockType === 'pin' ? 'numeric' : 'text'}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-lg font-mono tracking-widest" />
            )}
        </Field>}
        <Field label={L('studentDevice.location')}>
          <div className="flex flex-wrap gap-1.5">{DEVICE_LOCATIONS.map(l => <button key={l} type="button" className={chip(location === l)} onClick={() => { setLocation(l); if (l === 'teacher') setPicking(true); }}>{L(LOC_KEY[l])}</button>)}</div>
          {location === 'teacher' && (
            <button type="button" onClick={() => setPicking(true)} className="mt-1.5 text-xs text-violet-700 underline">
              {holder ? `👤 ${holder.name}` : L('studentDevice.pickTeacher')}
            </button>
          )}
        </Field>
        {!charger && <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={needsCharge} onChange={e => setNeedsCharge(e.target.checked)} /> 🔋 {L('studentDevice.needsCharge')}
          </label>
          {needsCharge && (
            <label className="flex items-center gap-1 text-sm text-gray-600">
              {L('studentDevice.batteryPercent')}
              <input type="number" min={0} max={100} value={batteryPercent} onChange={e => setBatteryPercent(e.target.value)}
                className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-center tabular-nums" />%
            </label>
          )}
        </div>}
        {!charger && <Field label={L('studentDevice.chargePort')}>
          <div className="flex flex-wrap gap-1.5">
            {CHARGER_TYPES.map(t => {
              const on = chargerTypes.includes(t);
              return <button key={t} type="button" className={chip(on)} onClick={() => setChargerTypes(p => (on ? p.filter(x => x !== t) : [...p, t]))}>{on ? '☑' : '☐'} {L(CHG_KEY[t])}</button>;
            })}
          </div>
        </Field>}
        {!charger && <Field label={L('studentDevice.batteryNote')}>
          <input value={batteryNote} onChange={e => setBatteryNote(e.target.value)} placeholder={L('studentDevice.batteryNotePh')} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </Field>}
        <Field label={L('studentDevice.note')}>
          <input value={note} onChange={e => setNote(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm" />
        </Field>
      </div>
      <div className="flex items-center gap-2 mt-5">
        {device && <button type="button" onClick={remove} disabled={busy} className="text-sm px-3 py-2 rounded-lg text-red-600 hover:bg-red-50">{L('common.delete')}</button>}
        <button type="button" onClick={onClose} disabled={busy} className="ml-auto text-sm px-4 py-2 rounded-lg bg-gray-100 text-gray-700">{L('common.cancel')}</button>
        <button type="button" onClick={save} disabled={busy} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50">{busy ? '…' : L('common.save')}</button>
      </div>
      {picking && <TeacherPicker staff={staff} onClose={() => setPicking(false)} onPick={h => { setHolder(h); setPicking(false); }} />}
    </Overlay>
  );
}

// ── 선생님 선택 ─────────────────────────────────────────────────
function TeacherPicker({ staff, onPick, onClose }: { staff: StaffOption[]; onPick: (h: StaffOption) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const list = staff.filter(u => !q.trim() || u.name.includes(q.trim()));
  return (
    <Overlay title={L('studentDevice.pickTeacher')} onClose={onClose}>
      <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={L('studentDevice.teacherSearchPh')}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2" />
      <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 border rounded-lg">
        {list.map(u => (
          <button key={u.id || u.name} type="button" onClick={() => onPick(u)} className="w-full text-left px-3 py-2 text-sm hover:bg-violet-50">{u.name}</button>
        ))}
        {q.trim() && !staff.some(u => u.name === q.trim()) && (
          <button type="button" onClick={() => onPick({ id: '', name: q.trim() })} className="w-full text-left px-3 py-2 text-sm text-violet-700 hover:bg-violet-50">
            + {L('studentDevice.useTyped', { v0: q.trim() })}
          </button>
        )}
      </div>
    </Overlay>
  );
}

// ── 명단 일괄 위치 변경 ─────────────────────────────────────────
function BulkMove({ campCode, roster, actor, staff, onClose }: { campCode: string; roster: STSheetStudent[]; actor: DeviceActorInfo; staff: StaffOption[]; onClose: () => void }) {
  const [picking, setPicking] = useState(false);
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
  const moveTo = async (to: DeviceLocation, holder?: StaffOption) => {
    const list = (devices ?? []).filter(d => selected.has(d.id));
    if (!list.length) return;
    if (to === 'teacher' && !holder) { setPicking(true); return; }
    setBusy(true);
    try {
      await moveStudentDevices(db, list, to, actor, holder);
      setDevices(prev => (prev ?? []).map(d => (selected.has(d.id) ? { ...d, location: to, holderName: to === 'teacher' ? holder?.name : undefined } : d)));
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
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${LOC_STYLE[d.location]}`}>{L(LOC_KEY[d.location])}{d.location === 'teacher' && d.holderName ? ` · ${d.holderName}` : ''}</span>
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
      {picking && <TeacherPicker staff={staff} onClose={() => setPicking(false)} onPick={h => { setPicking(false); moveTo('teacher', h); }} />}
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
