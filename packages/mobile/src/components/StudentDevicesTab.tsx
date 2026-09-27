/**
 * 학생 상세 모달 — 전자기기 탭 (mobile)
 * web(StudentDevicesTab)과 같은 정보·기능, 화면만 모바일에 맞춤
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import {
  L, logger, GADGET_KINDS, DEVICE_LOCK_TYPES, DEVICE_LOCATIONS, CHARGER_TYPES, parsePattern, patternToCode,
  deviceLocationDetail, getUsersByJobCodeId, isCampStaffRole, isCharger, matchingChargers,
  subscribeStudentDevices, getCampDevices, addStudentDevice, updateStudentDevice, moveStudentDevices, deleteStudentDevice,
  type StudentDevice, type DeviceKind, type DeviceLockType, type DeviceLocation, type ChargerType, type MessageKey,
  type STSheetStudent, type DeviceLocationContext,
} from '@smis-mentor/shared';
import { db } from '../config/firebase';

const KIND_KEY: Record<DeviceKind, MessageKey> = {
  phone: 'studentDevice.kindPhone', tablet: 'studentDevice.kindTablet', watch: 'studentDevice.kindWatch',
  laptop: 'studentDevice.kindLaptop', etc: 'studentDevice.kindEtc', charger: 'studentDevice.kindCharger',
};
const KIND_ICON: Record<DeviceKind, keyof typeof Ionicons.glyphMap> = {
  phone: 'phone-portrait-outline', tablet: 'tablet-portrait-outline', watch: 'watch-outline', laptop: 'laptop-outline', etc: 'headset-outline', charger: 'flash-outline',
};
const LOCK_KEY: Record<DeviceLockType, MessageKey> = {
  pin: 'studentDevice.lockPin', pattern: 'studentDevice.lockPattern', password: 'studentDevice.lockPassword', none: 'studentDevice.lockNone',
};
const LOC_KEY: Record<DeviceLocation, MessageKey> = {
  student: 'studentDevice.locStudent', unit: 'studentDevice.locUnit', office: 'studentDevice.locOffice',
  teacher: 'studentDevice.locTeacher', lent: 'studentDevice.locLent', returned: 'studentDevice.locReturned',
};
const LOC_COLOR: Record<DeviceLocation, [string, string]> = {
  student: ['#fef2f2', '#b91c1c'], unit: ['#eff6ff', '#1d4ed8'], office: ['#eef2ff', '#4338ca'],
  teacher: ['#f5f3ff', '#6d28d9'], lent: ['#fffbeb', '#b45309'], returned: ['#f3f4f6', '#6b7280'],
};
const CHG_KEY: Record<ChargerType, MessageKey> = {
  usbc: 'studentDevice.chg_usbc', lightning: 'studentDevice.chg_lightning', micro: 'studentDevice.chg_micro',
  wireless: 'studentDevice.chg_wireless', etc: 'studentDevice.chg_etc',
};

export interface StaffOption { id: string; name: string }

/** 보관 위치 상세(방 담당 방·그룹 교무실 호수)와 선생님 목록 — 캠프 설정·캠프 스태프에서 */
export function useDeviceContext(campCode: string | undefined, jobCodeId: string | undefined, active: boolean) {
  const [ctx, setCtx] = useState<DeviceLocationContext>({});
  const [staff, setStaff] = useState<StaffOption[]>([]);
  useEffect(() => {
    if (!active || !campCode) return;
    getDoc(doc(db, 'campSettings', campCode))
      .then(snap => { const d = snap.data() ?? {}; setCtx({ groups: d.groups ?? [], rooms: d.lodging?.rooms ?? {} }); })
      .catch(e => logger.warn('[devices] campSettings', e));
  }, [active, campCode]);
  useEffect(() => {
    if (!active || !jobCodeId) return;
    getUsersByJobCodeId(db, jobCodeId)
      .then(users => setStaff(users
        .filter(u => isCampStaffRole(u.role))
        .map(u => ({ id: u.userId ?? u.id ?? '', name: u.name }))
        .filter(u => u.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))))
      .catch(e => logger.warn('[devices] staff', e));
  }, [active, jobCodeId]);
  return { ctx, staff };
}

export interface DeviceActorInfo { uid: string; name: string }

export function useStudentDevices(campCode: string | undefined, studentId: string | undefined, active: boolean) {
  const [byId, setById] = useState<Record<string, StudentDevice[]>>({});
  useEffect(() => {
    if (!active || !campCode || !studentId) return;
    return subscribeStudentDevices(db, campCode, studentId, d => setById(p => ({ ...p, [studentId]: d })), e => logger.warn('[devices]', e));
  }, [active, campCode, studentId]);
  return studentId ? byId[studentId] ?? null : null;
}

const md = (d?: Date | null) => (d ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '-');

// ── 패턴 (3×3 점 + 순서 번호) ───────────────────────────────────
function PatternGrid({ code, onTap, size = 22 }: { code?: string; onTap?: (n: number) => void; size?: number }) {
  const dots = parsePattern(code);
  return (
    <View style={{ width: size * 3 + 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => {
        const i = dots.indexOf(n);
        const bg = i === 0 ? '#16a34a' : i > 0 ? '#2563eb' : '#e5e7eb';
        const Cmp = onTap ? TouchableOpacity : View;
        return (
          <Cmp key={n} onPress={onTap ? () => onTap(n) : undefined}
            style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
            {i >= 0 && <Text style={{ color: '#fff', fontSize: size * 0.5, fontWeight: '800' }}>{i + 1}</Text>}
          </Cmp>
        );
      })}
    </View>
  );
}

function LockDisplay({ d }: { d: StudentDevice }) {
  if (d.lockType === 'none') return <Text style={s.muted}>{L('studentDevice.lockNone')}</Text>;
  if (d.lockType === 'pattern') return <PatternGrid code={d.lockCode} size={20} />;
  return (
    <View>
      <Text style={s.tiny}>{L(LOCK_KEY[d.lockType])}</Text>
      <Text selectable style={s.lockCode}>{d.lockCode || '-'}</Text>
    </View>
  );
}

// ── 탭 ─────────────────────────────────────────────────────────
export function StudentDevicesTab({ devices, student, campCode, roster, actor, ctx, staff }: {
  devices: StudentDevice[] | null; student: STSheetStudent; campCode: string; roster: STSheetStudent[]; actor: DeviceActorInfo;
  ctx: DeviceLocationContext; staff: StaffOption[];
}) {
  const [pickFor, setPickFor] = useState<StudentDevice | null>(null);
  const [edit, setEdit] = useState<StudentDevice | 'new' | 'newCharger' | null>(null);
  const [bulk, setBulk] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const move = async (d: StudentDevice, to: DeviceLocation, holder?: StaffOption) => {
    if (to === 'teacher' && !holder) { setPickFor(d); return; }
    setBusyId(d.id);
    try { await moveStudentDevices(db, [d], to, actor, holder); } catch (e) { logger.error('[devices] move', e); Alert.alert(L('studentDevice.saveFailed')); } finally { setBusyId(null); }
  };
  const patch = (d: StudentDevice, p: Parameters<typeof updateStudentDevice>[2]) => {
    updateStudentDevice(db, d.id, p, actor).catch(e => { logger.error('[devices] patch', e); Alert.alert(L('studentDevice.saveFailed')); });
  };

  return (
    <View style={{ gap: 10 }}>
      <View style={s.btnRow}>
        <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={() => setEdit('new')}>
          <Ionicons name="add" size={16} color="#fff" /><Text style={s.btnPrimaryText}>{L('studentDevice.add')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => setEdit('newCharger')}>
          <Text style={[s.btnOutlineText, { color: '#374151' }]}>🔌 {L('studentDevice.addCharger')}</Text>
        </TouchableOpacity>
        {roster.length > 1 && (
          <TouchableOpacity style={[s.btn, s.btnOutline]} onPress={() => setBulk(true)}>
            <Text style={s.btnOutlineText}>{L('studentDevice.bulk')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {devices === null ? <ActivityIndicator style={{ marginTop: 16 }} color="#3b82f6" />
        : devices.length === 0 ? (
          <View style={s.emptyBox}>
            <Ionicons name="phone-portrait-outline" size={30} color="#9ca3af" />
            <Text style={s.emptyTitle}>{L('studentDevice.none')}</Text>
            <Text style={[s.muted, { textAlign: 'center', marginTop: 4 }]}>{L('studentDevice.noneHint')}</Text>
          </View>
        ) : devices.map(d => (
          <View key={d.id} style={s.card}>
            <View style={s.cardTop}>
              <Ionicons name={KIND_ICON[d.kind]} size={22} color="#374151" />
              <View style={{ flex: 1 }}>
                <Text style={s.model}>{d.model} <Text style={s.muted}>· {L(KIND_KEY[d.kind])}</Text></Text>
                {!!d.feature && <Text style={s.muted}>{d.feature}</Text>}
              </View>
              <TouchableOpacity onPress={() => setEdit(d)} hitSlop={8}><Text style={s.link}>{L('common.edit')}</Text></TouchableOpacity>
            </View>

            {isCharger(d) ? (
              <View style={[s.chipWrap, { alignItems: 'center', marginBottom: 10 }]}>
                <Text style={s.muted}>{L('studentDevice.chargerPorts')}</Text>
                {(d.chargerTypes ?? []).map(t => <Text key={t} style={s.portBadge}>{L(CHG_KEY[t])}</Text>)}
                {!!d.note && <Text style={s.muted}>· {d.note}</Text>}
              </View>
            ) : (
              <View style={s.lockBox}>
                <Text style={[s.muted, { width: 64 }]}>🔓 {L('studentDevice.lock')}</Text>
                <LockDisplay d={d} />
              </View>
            )}

            <Text style={[s.muted, { marginBottom: 6 }]}>{L('studentDevice.location')}</Text>
            <View style={s.chipWrap}>
              {DEVICE_LOCATIONS.map(loc => {
                const on = d.location === loc;
                const holder = on || loc !== 'teacher' ? deviceLocationDetail(loc, student, ctx, d.holderName) : '';
                return (
                  <TouchableOpacity key={loc} disabled={busyId === d.id || (on && loc !== 'teacher')} onPress={() => move(d, loc)}
                    style={[s.locChip, on && { backgroundColor: LOC_COLOR[loc][0], borderColor: LOC_COLOR[loc][1] }]}>
                    <Text style={[s.locText, on && { color: LOC_COLOR[loc][1], fontWeight: '700' }]}>
                      {on ? '● ' : ''}{L(LOC_KEY[loc])}{holder ? ` (${holder})` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {!isCharger(d) && (<>
            <View style={[s.chipWrap, { marginTop: 10, alignItems: 'center' }]}>
              <TouchableOpacity onPress={() => patch(d, { needsCharge: !d.needsCharge })} style={[s.chargeChip, d.needsCharge && s.chargeChipOn]}>
                <Text style={[s.chargeText, d.needsCharge && { color: '#92400e', fontWeight: '700' }]}>🔋 {L('studentDevice.needsCharge')}{d.needsCharge ? ' ✓' : ''}</Text>
              </TouchableOpacity>
              {d.needsCharge && (
                <View style={s.pctRow}>
                  <Text style={s.muted}>{L('studentDevice.batteryPercent')}</Text>
                  <TextInput key={`${d.id}-${d.batteryPercent ?? ''}`} defaultValue={d.batteryPercent != null ? String(d.batteryPercent) : ''} keyboardType="number-pad"
                    placeholder="--" placeholderTextColor="#cbd5e1" style={s.pctInput}
                    onEndEditing={e => { const t = e.nativeEvent.text.replace(/\D/g, ''); const v = t === '' ? undefined : Math.min(100, Number(t)); if (v !== d.batteryPercent) patch(d, { batteryPercent: v }); }} />
                  <Text style={s.muted}>%</Text>
                </View>
              )}
              {!!d.batteryNote && <Text style={s.noteText}>{d.batteryNote}</Text>}
              {!!d.note && <Text style={s.muted}>· {d.note}</Text>}
            </View>

            <View style={[s.chipWrap, { marginTop: 8, alignItems: 'center' }]}>
              <Text style={s.muted}>{L('studentDevice.chargePort')}</Text>
              {CHARGER_TYPES.map(t => {
                const on = (d.chargerTypes ?? []).includes(t);
                return (
                  <TouchableOpacity key={t} onPress={() => patch(d, { chargerTypes: on ? (d.chargerTypes ?? []).filter(x => x !== t) : [...(d.chargerTypes ?? []), t] })}
                    style={[s.chgChip, on && s.chgChipOn]}>
                    <Text style={[s.chgText, on && { color: '#fff' }]}>{L(CHG_KEY[t])}</Text>
                  </TouchableOpacity>
                );
              })}
              {!!d.chargerTypes?.length && (matchingChargers(d, devices ?? []).length
                ? <Text style={[s.portStatus, { backgroundColor: '#ecfdf5', color: '#047857' }]}>🔌 {L('studentDevice.chargerOk')}</Text>
                : <Text style={[s.portStatus, { backgroundColor: '#fef2f2', color: '#dc2626' }]}>🔌 {L('studentDevice.chargerNoMatch')}</Text>)}
            </View>
            </>)}

            {!!d.moves?.length && (
              <View style={{ marginTop: 8 }}>
                <TouchableOpacity onPress={() => setOpenHistory(h => (h === d.id ? null : d.id))}>
                  <Text style={s.muted}>{L('studentDevice.history')} ({d.moves.length}) {openHistory === d.id ? '▴' : '▾'}</Text>
                </TouchableOpacity>
                {openHistory === d.id && d.moves.slice().reverse().map((m, i) => (
                  <Text key={i} style={s.tiny}>{md(m.at?.toDate?.())} · {m.by} · {L(LOC_KEY[m.from])} → {L(LOC_KEY[m.to])}{m.holder ? ` (${m.holder})` : ''}</Text>
                ))}
              </View>
            )}
          </View>
        ))}

      {edit && <DeviceSheet device={edit === 'new' || edit === 'newCharger' ? null : edit} charger={edit === 'newCharger' || (typeof edit === 'object' && isCharger(edit))} student={student} campCode={campCode} actor={actor} staff={staff} onClose={() => setEdit(null)} />}
      {bulk && <BulkSheet campCode={campCode} roster={roster} actor={actor} staff={staff} onClose={() => setBulk(false)} />}
      {pickFor && <TeacherPicker staff={staff} onClose={() => setPickFor(null)} onPick={h => { const d = pickFor; setPickFor(null); move(d, 'teacher', h); }} />}
    </View>
  );
}

function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color="#374151" /></TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer && <View style={s.sheetFooter}>{footer}</View>}
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

function DeviceSheet({ device, charger, student, campCode, actor, staff, onClose }: {
  device: StudentDevice | null; charger: boolean; student: STSheetStudent; campCode: string; actor: DeviceActorInfo; staff: StaffOption[]; onClose: () => void;
}) {
  const [holder, setHolder] = useState<StaffOption | null>(device?.holderName ? { id: device.holderId ?? '', name: device.holderName } : null);
  const [picking, setPicking] = useState(false);
  const [batteryPercent, setBatteryPercent] = useState(device?.batteryPercent != null ? String(device.batteryPercent) : '');
  const [chargerTypes, setChargerTypes] = useState<ChargerType[]>(device?.chargerTypes ?? []);
  const [kind, setKind] = useState<DeviceKind>(device?.kind ?? (charger ? 'charger' : 'phone'));
  const [model, setModel] = useState(device?.model ?? (charger ? L('studentDevice.chargerDefaultName') : ''));
  const [feature, setFeature] = useState(device?.feature ?? '');
  const [lockType, setLockType] = useState<DeviceLockType>(device?.lockType ?? 'pin');
  const [lockCode, setLockCode] = useState(device?.lockCode ?? '');
  const [location, setLocation] = useState<DeviceLocation>(device?.location ?? 'unit');
  const [needsCharge, setNeedsCharge] = useState(!!device?.needsCharge);
  const [batteryNote, setBatteryNote] = useState(device?.batteryNote ?? '');
  const [note, setNote] = useState(device?.note ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!model.trim()) { Alert.alert(L('studentDevice.modelRequired')); return; }
    if (charger && chargerTypes.length === 0) { Alert.alert(L('studentDevice.chargerPortsRequired')); return; }
    setBusy(true);
    try {
      if (location === 'teacher' && !holder) { setPicking(true); setBusy(false); return; }
      const code = lockType === 'none' ? '' : lockCode.trim();
      const t = batteryPercent.replace(/\D/g, '');
      const pct = t === '' ? undefined : Math.min(100, Number(t));
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
    } catch (e) { logger.error('[devices] save', e); Alert.alert(L('studentDevice.saveFailed')); setBusy(false); }
  };
  const remove = () => {
    if (!device) return;
    Alert.alert(L('common.delete'), L('studentDevice.confirmDelete'), [
      { text: L('common.cancel'), style: 'cancel' },
      { text: L('common.delete'), style: 'destructive', onPress: async () => {
        setBusy(true);
        try { await deleteStudentDevice(db, device.id); onClose(); } catch (e) { logger.error('[devices] delete', e); Alert.alert(L('studentDevice.saveFailed')); setBusy(false); }
      } },
    ]);
  };

  const dots = parsePattern(lockCode);

  return (
    <Sheet title={charger ? (device ? L('studentDevice.editCharger') : L('studentDevice.addCharger')) : (device ? L('studentDevice.edit') : L('studentDevice.add'))} onClose={onClose}
      footer={(
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {device && <TouchableOpacity onPress={remove} disabled={busy}><Text style={{ color: '#dc2626', fontWeight: '600' }}>{L('common.delete')}</Text></TouchableOpacity>}
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={onClose} disabled={busy} style={[s.footBtn, { backgroundColor: '#f3f4f6' }]}><Text style={{ color: '#374151', fontWeight: '600' }}>{L('common.cancel')}</Text></TouchableOpacity>
          <TouchableOpacity onPress={save} disabled={busy} style={[s.footBtn, { backgroundColor: '#2563eb', opacity: busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{L('common.save')}</Text>}
          </TouchableOpacity>
        </View>
      )}>
      {charger ? (
        <>
          <Text style={s.tiny}>{L('studentDevice.chargerFormHint')}</Text>
          <Field label={L('studentDevice.chargerPorts')}>
            <View style={s.chipWrap}>
              {CHARGER_TYPES.map(t => {
                const on = chargerTypes.includes(t);
                return <Chip key={t} on={on} onPress={() => setChargerTypes(p => (on ? p.filter(x => x !== t) : [...p, t]))}>{on ? '☑' : '☐'} {L(CHG_KEY[t])}</Chip>;
              })}
            </View>
          </Field>
          <Field label={L('studentDevice.chargerName')}>
            <TextInput value={model} onChangeText={setModel} placeholder={L('studentDevice.chargerNamePh')} placeholderTextColor="#9ca3af" style={s.input} />
          </Field>
        </>
      ) : (
        <>
          <Field label={L('studentDevice.kind')}>
            <View style={s.chipWrap}>{GADGET_KINDS.map(k => <Chip key={k} on={kind === k} onPress={() => setKind(k)}>{L(KIND_KEY[k])}</Chip>)}</View>
          </Field>
          <Field label={L('studentDevice.model')}>
            <TextInput value={model} onChangeText={setModel} placeholder={L('studentDevice.modelPh')} placeholderTextColor="#9ca3af" style={s.input} />
          </Field>
        </>
      )}
      <Field label={L('studentDevice.feature')}>
        <TextInput value={feature} onChangeText={setFeature} placeholder={L('studentDevice.featurePh')} placeholderTextColor="#9ca3af" style={s.input} />
      </Field>
      {!charger && <Field label={L('studentDevice.lock')}>
        <View style={[s.chipWrap, { marginBottom: 8 }]}>
          {DEVICE_LOCK_TYPES.map(t => <Chip key={t} on={lockType === t} onPress={() => { if (t !== lockType) setLockCode(''); setLockType(t); }}>{L(LOCK_KEY[t])}</Chip>)}
        </View>
        {lockType === 'pattern' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <PatternGrid code={lockCode} size={44} onTap={n => { if (!dots.includes(n)) setLockCode(patternToCode([...dots, n])); }} />
            <View style={{ gap: 6 }}>
              <Text style={s.muted}>{L('studentDevice.patternHint')}</Text>
              <TouchableOpacity onPress={() => setLockCode('')}><Text style={s.link}>{L('studentDevice.patternReset')}</Text></TouchableOpacity>
            </View>
          </View>
        ) : lockType !== 'none' && (
          <TextInput value={lockCode} onChangeText={setLockCode} keyboardType={lockType === 'pin' ? 'number-pad' : 'default'} autoCapitalize="none"
            style={[s.input, { fontSize: 20, fontWeight: '700', letterSpacing: 4 }]} />
        )}
      </Field>}
      <Field label={L('studentDevice.location')}>
        <View style={s.chipWrap}>{DEVICE_LOCATIONS.map(l => <Chip key={l} on={location === l} onPress={() => { setLocation(l); if (l === 'teacher') setPicking(true); }}>{L(LOC_KEY[l])}</Chip>)}</View>
        {location === 'teacher' && (
          <TouchableOpacity onPress={() => setPicking(true)} style={{ marginTop: 8 }}>
            <Text style={[s.link, { color: '#6d28d9' }]}>{holder ? `👤 ${holder.name}` : L('studentDevice.pickTeacher')}</Text>
          </TouchableOpacity>
        )}
      </Field>
      {!charger && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 14, color: '#374151' }}>🔋 {L('studentDevice.needsCharge')}</Text>
        <Switch value={needsCharge} onValueChange={setNeedsCharge} />
      </View>}
      {!charger && needsCharge && (
        <View style={s.pctRow}>
          <Text style={s.muted}>{L('studentDevice.batteryPercent')}</Text>
          <TextInput value={batteryPercent} onChangeText={setBatteryPercent} keyboardType="number-pad" placeholder="--" placeholderTextColor="#cbd5e1" style={[s.pctInput, { width: 64 }]} />
          <Text style={s.muted}>%</Text>
        </View>
      )}
      {!charger && <Field label={L('studentDevice.chargePort')}>
        <View style={s.chipWrap}>
          {CHARGER_TYPES.map(t => {
            const on = chargerTypes.includes(t);
            return <Chip key={t} on={on} onPress={() => setChargerTypes(p => (on ? p.filter(x => x !== t) : [...p, t]))}>{on ? '☑' : '☐'} {L(CHG_KEY[t])}</Chip>;
          })}
        </View>
      </Field>}
      {picking && <TeacherPicker staff={staff} onClose={() => setPicking(false)} onPick={h => { setHolder(h); setPicking(false); }} />}
      {!charger && <Field label={L('studentDevice.batteryNote')}>
        <TextInput value={batteryNote} onChangeText={setBatteryNote} placeholder={L('studentDevice.batteryNotePh')} placeholderTextColor="#9ca3af" style={s.input} />
      </Field>}
      <Field label={L('studentDevice.note')}>
        <TextInput value={note} onChangeText={setNote} style={s.input} />
      </Field>
    </Sheet>
  );
}

function BulkSheet({ campCode, roster, actor, staff, onClose }: { campCode: string; roster: STSheetStudent[]; actor: DeviceActorInfo; staff: StaffOption[]; onClose: () => void }) {
  const [picking, setPicking] = useState(false);
  const [devices, setDevices] = useState<StudentDevice[] | null>(null);
  const [filter, setFilter] = useState<DeviceLocation | 'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const rosterIds = useMemo(() => new Set(roster.map(r => r.studentId)), [roster]);
  const order = useMemo(() => new Map(roster.map((r, i) => [r.studentId, i])), [roster]);

  useEffect(() => {
    getCampDevices(db, campCode)
      .then(list => setDevices(list.filter(d => rosterIds.has(d.studentId)).sort((a, b) => (order.get(a.studentId) ?? 0) - (order.get(b.studentId) ?? 0))))
      .catch(e => { logger.error('[devices] bulk load', e); setDevices([]); });
  }, [campCode, rosterIds, order]);

  const shown = (devices ?? []).filter(d => filter === 'all' || d.location === filter);
  const allOn = shown.length > 0 && shown.every(d => selected.has(d.id));
  const moveTo = async (to: DeviceLocation, holder?: StaffOption) => {
    const list = (devices ?? []).filter(d => selected.has(d.id));
    if (!list.length) return;
    if (to === 'teacher' && !holder) { setPicking(true); return; }
    setBusy(true);
    try {
      await moveStudentDevices(db, list, to, actor, holder);
      setDevices(prev => (prev ?? []).map(d => (selected.has(d.id) ? { ...d, location: to, holderName: to === 'teacher' ? holder?.name : undefined } : d)));
      setSelected(new Set());
    } catch (e) { logger.error('[devices] bulk', e); Alert.alert(L('studentDevice.saveFailed')); } finally { setBusy(false); }
  };

  return (
    <Sheet title={L('studentDevice.bulk')} onClose={onClose}
      footer={(
        <View style={{ gap: 6 }}>
          <Text style={s.muted}>{L('studentDevice.bulkMove', { v0: selected.size })}</Text>
          <View style={s.chipWrap}>
            {DEVICE_LOCATIONS.map(loc => (
              <TouchableOpacity key={loc} disabled={busy || selected.size === 0} onPress={() => moveTo(loc)}
                style={[s.locChip, { backgroundColor: LOC_COLOR[loc][0], borderColor: LOC_COLOR[loc][1], opacity: selected.size === 0 ? 0.4 : 1 }]}>
                <Text style={[s.locText, { color: LOC_COLOR[loc][1], fontWeight: '700' }]}>{L(LOC_KEY[loc])}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}>
      <Text style={s.muted}>{L('studentDevice.bulkHint')}</Text>
      <View style={s.chipWrap}>
        {(['all', ...DEVICE_LOCATIONS] as const).map(f => (
          <Chip key={f} on={filter === f} onPress={() => { setFilter(f); setSelected(new Set()); }}>
            {f === 'all' ? L('studentDevice.all') : L(LOC_KEY[f])} ({(devices ?? []).filter(d => f === 'all' || d.location === f).length})
          </Chip>
        ))}
      </View>
      {devices === null ? <ActivityIndicator color="#3b82f6" />
        : shown.length === 0 ? <Text style={[s.muted, { textAlign: 'center', paddingVertical: 16 }]}>{L('studentDevice.noRosterDevices')}</Text>
        : (
          <View>
            <TouchableOpacity onPress={() => setSelected(allOn ? new Set() : new Set(shown.map(d => d.id)))} style={{ marginBottom: 6 }}>
              <Text style={{ color: '#2563eb', fontSize: 13, fontWeight: '600' }}>{allOn ? '☑' : '☐'} {L('allowance.selectAll')}</Text>
            </TouchableOpacity>
            {shown.map(d => {
              const on = selected.has(d.id);
              return (
                <TouchableOpacity key={d.id} style={s.bulkRow}
                  onPress={() => setSelected(p => { const n = new Set(p); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })}>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? '#2563eb' : '#9ca3af'} />
                  <Text style={s.bulkName} numberOfLines={1}>{d.studentName}</Text>
                  <Text style={s.bulkModel} numberOfLines={1}>{d.model}{d.needsCharge ? ' 🔋' : ''}</Text>
                  <Text style={[s.locBadge, { backgroundColor: LOC_COLOR[d.location][0], color: LOC_COLOR[d.location][1] }]}>{L(LOC_KEY[d.location])}{d.location === 'teacher' && d.holderName ? ` · ${d.holderName}` : ''}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      {picking && <TeacherPicker staff={staff} onClose={() => setPicking(false)} onPick={h => { setPicking(false); moveTo('teacher', h); }} />}
    </Sheet>
  );
}

function TeacherPicker({ staff, onPick, onClose }: { staff: StaffOption[]; onPick: (h: StaffOption) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const list = staff.filter(u => !q.trim() || u.name.includes(q.trim()));
  return (
    <Sheet title={L('studentDevice.pickTeacher')} onClose={onClose}>
      <TextInput autoFocus value={q} onChangeText={setQ} placeholder={L('studentDevice.teacherSearchPh')} placeholderTextColor="#9ca3af" style={s.input} />
      <View>
        {list.map(u => (
          <TouchableOpacity key={u.id || u.name} onPress={() => onPick(u)} style={s.pickRow}><Text style={s.pickText}>{u.name}</Text></TouchableOpacity>
        ))}
        {!!q.trim() && !staff.some(u => u.name === q.trim()) && (
          <TouchableOpacity onPress={() => onPick({ id: '', name: q.trim() })} style={s.pickRow}>
            <Text style={[s.pickText, { color: '#6d28d9' }]}>+ {L('studentDevice.useTyped', { v0: q.trim() })}</Text>
          </TouchableOpacity>
        )}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  muted: { fontSize: 12, color: '#6b7280' },
  tiny: { fontSize: 11, color: '#6b7280' },
  link: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  btnRow: { flexDirection: 'row', gap: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10 },
  btnPrimary: { backgroundColor: '#2563eb', flexGrow: 1, justifyContent: 'center' },
  btnPrimaryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  btnOutline: { borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#fff' },
  btnOutlineText: { color: '#1d4ed8', fontSize: 13, fontWeight: '600' },
  emptyBox: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#d1d5db', paddingVertical: 32, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937', marginTop: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#e5e7eb', padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  model: { fontSize: 15, fontWeight: '800', color: '#111827' },
  lockBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f9fafb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  lockCode: { fontSize: 22, fontWeight: '800', color: '#111827', letterSpacing: 4, fontVariant: ['tabular-nums'] },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  locChip: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  locText: { fontSize: 12, color: '#6b7280' },
  locBadge: { fontSize: 10, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  chargeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb' },
  chargeChipOn: { backgroundColor: '#fef3c7', borderColor: '#fcd34d' },
  chargeText: { fontSize: 12, color: '#6b7280' },
  noteText: { fontSize: 12, color: '#4b5563' },
  portBadge: { fontSize: 11, fontWeight: '700', color: '#fff', backgroundColor: '#111827', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  portStatus: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  pctRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pctInput: { width: 48, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingVertical: 4, textAlign: 'center', fontSize: 13, color: '#111827' },
  chgChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  chgChipOn: { backgroundColor: '#111827', borderColor: '#111827' },
  chgText: { fontSize: 11, color: '#6b7280' },
  pickRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  pickText: { fontSize: 15, color: '#111827' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  sheetFooter: { padding: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  footBtn: { paddingHorizontal: 18, paddingVertical: 11, borderRadius: 10, minWidth: 72, alignItems: 'center' },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, color: '#4b5563' },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#111827' },
  bulkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  bulkName: { width: 64, fontSize: 13, fontWeight: '700', color: '#111827' },
  bulkModel: { flex: 1, fontSize: 13, color: '#4b5563' },
});
