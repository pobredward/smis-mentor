'use client';

/**
 * 마이페이지 섹션 — 섹션마다 제자리에서 따로 수정한다 (별도 수정 페이지 없음).
 * 각 섹션은 [수정] → 입력 → [저장]/[취소] 로 자기 필드만 저장한다.
 */
import { useEffect, useState, type ReactNode } from 'react';
import DaumPostcode, { type Address } from 'react-daum-postcode';
import toast from 'react-hot-toast';
import { FaCamera, FaEye, FaEyeSlash, FaLock } from 'react-icons/fa';
import { useAuth } from '@/contexts/AuthContext';
import { updateUser, getUserByPhone, uploadProfileImage } from '@/lib/firebaseService';
import { updateGeocodeIfAddressChanged } from '@/lib/geocoding';
import { authenticatedGet, authenticatedPost } from '@/lib/apiClient';
import ImageCropper from '@/components/common/ImageCropper';
import CampProfileForm from '@/components/camp-profile/CampProfileForm';
import type { PartTimeJob, User } from '@/types';
import {
  formatPhoneNumber,
  getPhonePlaceholder,
  calculateAgeFromDateOfBirth,
  rrnPurposeLines,
  NATIONALITIES,
  CAMP_PROFILE_FIELD_LABELS,
  bankCountryDef,
  logger,
  type CampProfileStatus,
} from '@smis-mentor/shared';
import { PHONE_COUNTRY_CODES, splitPhoneByCountry as splitPhone } from '@smis-mentor/shared';
import { L, isEnglishUI } from '@smis-mentor/shared';
export { PHONE_COUNTRY_CODES };

// ─── 공통 ───────────────────────────────────────────────────────────────────

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500';
const errCls = 'border-red-500';

const REFERRAL_PATHS = ['에브리타임', '학교 커뮤니티', '링커리어', '캠퍼스픽', '인스타그램', '페이스북', '구글/네이버 등 검색', '지인 소개', '기타'];

function useIsForeign() {
  const { userData } = useAuth();
  return userData?.role === 'foreign' || userData?.role === 'foreign_temp';
}

/** 저장 → 사용자 정보 새로고침 */
function useSave() {
  const { userData, refreshUserData } = useAuth();
  return async (updates: Partial<User>) => {
    if (!userData) return;
    await updateUser(userData.userId, updates);
    await refreshUserData();
    toast.success(L('profile.saved'));
  };
}

function Field({ label, error, children, wide }: { label: string; error?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function View({ label, value, wide }: { label: string; value?: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900 whitespace-pre-wrap break-words">{value || <span className="text-gray-300">—</span>}</p>
    </div>
  );
}

function GenderPicker({ value, onChange }: { value?: string; onChange: (v: 'M' | 'F') => void }) {
  return (
    <div className="flex gap-2">
      {(['M', 'F'] as const).map((g) => (
        <button key={g} type="button" onClick={() => onChange(g)}
          className={`px-4 py-2 border rounded-md text-sm font-medium transition ${value === g ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-700 hover:border-blue-300'}`}>
          {g === 'M' ? (L('profile.male')) : (L('profile.female'))}
        </button>
      ))}
    </div>
  );
}

/**
 * 섹션 카드 — 보기/수정 전환과 저장·취소 버튼을 가진 틀.
 * onSave 가 false 를 돌려주면(검증 실패) 수정 상태를 유지한다.
 */
export function EditableSection({
  title, badge, onStartEdit, onSave, view, edit, editable = true, id, editing: editingProp, onEditingChange,
}: {
  title: string;
  badge?: ReactNode;
  onStartEdit?: () => void;
  /** 없으면 편집 화면이 자체 저장 버튼을 가진다 (헤더에는 [취소]만) */
  onSave?: () => Promise<boolean | void>;
  view: ReactNode;
  edit?: ReactNode;
  editable?: boolean;
  id?: string;
  /** 바깥에서 편집 상태를 제어할 때 (예: 폼 저장 후 닫기) */
  editing?: boolean;
  onEditingChange?: (v: boolean) => void;
}) {
  const [editingState, setEditingState] = useState(false);
  const editing = editingProp ?? editingState;
  const setEditing = onEditingChange ?? setEditingState;
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      const ok = await onSave();
      if (ok !== false) setEditing(false);
    } catch (e) {
      logger.error(`${title} 저장 오류:`, e);
      toast.error((e as Error)?.message || (L('profile.failedToSave')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section id={id} className="bg-white shadow-sm border border-gray-100 rounded-xl overflow-hidden mb-4 scroll-mt-20">
      <div className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {badge}
        <div className="ml-auto flex gap-2">
          {editable && edit && !editing && (
            <button type="button" onClick={() => { onStartEdit?.(); setEditing(true); }}
              className="px-3 py-1 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50">
              {L('task.edit')}
            </button>
          )}
          {editing && (
            <>
              <button type="button" onClick={() => setEditing(false)} disabled={saving}
                className="px-3 py-1 text-xs font-medium rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                {L('common.cancel')}
              </button>
              {onSave && (
                <button type="button" onClick={save} disabled={saving}
                  className="px-3 py-1 text-xs font-semibold rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? (L('common.saving')) : (L('common.save'))}
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div className="px-4 sm:px-5 py-4">{editing ? edit : view}</div>
    </section>
  );
}

// ─── 프로필 사진 ─────────────────────────────────────────────────────────────

function ProfileImage() {
  const { userData, refreshUserData } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  if (!userData) return null;

  const onCropped = async (cropped: File) => {
    setFile(null);
    setUploading(true);
    try {
      await uploadProfileImage(userData.userId, cropped, () => undefined);
      await refreshUserData();
      toast.success(L('profile.profileImageUpdated'));
    } catch {
      toast.error(L('profile.failedToUploadTheImage'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative w-20 h-20 shrink-0">
      {userData.profileImage ? (
        <img src={userData.profileImage} alt={userData.name} className="w-20 h-20 object-cover rounded-xl border border-gray-200" />
      ) : (
        <div className="w-20 h-20 bg-blue-500 rounded-xl flex items-center justify-center">
          <span className="text-white text-2xl font-bold">{userData.name?.charAt(0)}</span>
        </div>
      )}
      {uploading && (
        <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
        </div>
      )}
      <label className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-white border border-gray-300 shadow flex items-center justify-center cursor-pointer hover:bg-gray-50"
        title={L('profile.changePhoto')}>
        <FaCamera size={12} className="text-gray-600" />
        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          if (!/^image\/(jpeg|png|jpg|gif|webp)$/.test(f.type)) { toast.error(L('profile.pleaseChooseAnImageFile')); return; }
          setFile(f);
        }} />
      </label>
      {file && (
        <div className="fixed inset-0 z-[1100] bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-4 max-w-lg w-full max-h-[90vh] overflow-auto">
            <ImageCropper file={file} onCropComplete={onCropped} onCancel={() => setFile(null)} aspectRatio={1} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 기본 정보 (사진·이름·성별·이메일·연락처 / 원어민: 이름 3칸·생년월일) ────────

export function BasicInfoSection({ statusBadges }: { statusBadges?: ReactNode }) {
  const { userData } = useAuth();
  const en = useIsForeign();
  const save = useSave();
  const [f, setF] = useState({ name: '', firstName: '', middleName: '', lastName: '', gender: '', dateOfBirth: '', email: '', phone: '', cc: '+82', nationality: '' });
  const [natOther, setNatOther] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  if (!userData) return null;
  const ft = userData.foreignTeacher;
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const start = () => {
    const { cc, num } = splitPhone(userData.phoneNumber, en);
    setF({
      name: userData.name || '', firstName: ft?.firstName || '', middleName: ft?.middleName || '', lastName: ft?.lastName || '',
      gender: userData.gender || '', dateOfBirth: userData.dateOfBirth ? String(userData.dateOfBirth).substring(0, 10) : '',
      email: userData.email || '', phone: num, cc,
      nationality: (userData as { nationality?: string }).nationality || '',
    });
    const nat = (userData as { nationality?: string }).nationality || '';
    setNatOther(!!nat && !(NATIONALITIES as readonly string[]).includes(nat));
    setErr({});
  };

  const onSave = async () => {
    const e: Record<string, string> = {};
    if (en) {
      if (!f.firstName.trim()) e.firstName = 'Please enter your first name.';
      if (!f.lastName.trim()) e.lastName = 'Please enter your last name.';
      if (!f.nationality.trim()) e.nationality = 'Please select your nationality.';
      if (f.dateOfBirth) {
        const d = new Date(f.dateOfBirth);
        if (isNaN(d.getTime()) || d > new Date() || d < new Date('1900-01-01')) e.dateOfBirth = 'Please enter a valid date of birth.';
      }
    } else if (f.name.trim().length < 2) e.name = L('profile.nameMustBeAtLeast');
    if (!f.gender) e.gender = L('profile.pleaseSelectYourGender');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = L('profile.pleaseEnterAValidEmail');
    if (f.phone.replace(/\D/g, '').length < 8) e.phone = L('profile.pleaseEnterAValidPhone');
    setErr(e);
    if (Object.keys(e).length) return false;

    let phone = f.phone.replace(/[^0-9]/g, '');
    if (en) { if (f.cc === '+82' && phone.startsWith('0')) phone = phone.substring(1); phone = `${f.cc}${phone}`; }
    if (phone !== userData.phoneNumber) {
      const existing = await getUserByPhone(phone);
      if (existing && existing.userId !== userData.userId) { setErr({ phone: L('profile.thisPhoneNumberIsAlready2') }); return false; }
    }
    // 이메일은 Auth 와 함께 바뀌어야 하므로 서버가 처리
    if (f.email.trim().toLowerCase() !== (userData.email || '').toLowerCase()) {
      try {
        await authenticatedPost('/api/user/change-email', { email: f.email.trim() });
      } catch (ex) {
        const msg = String((ex as Error)?.message || '');
        setErr({ email: /이미 사용|ALREADY_EXISTS|409/.test(msg) ? (L('profile.thisEmailIsAlreadyIn')) : (L('profile.couldNotChangeTheEmail')) });
        return false;
      }
    }
    const u: Partial<User> = { phoneNumber: phone, gender: f.gender as 'M' | 'F' };
    if (en) {
      const first = f.firstName.trim(); const last = f.lastName.trim(); const mid = f.middleName.trim();
      u.name = mid ? `${first} ${mid} ${last}` : `${first} ${last}`;
      u.foreignTeacher = { ...(ft || {}), firstName: first, lastName: last, middleName: mid, countryCode: f.cc } as User['foreignTeacher'];
      if (f.dateOfBirth) { u.dateOfBirth = f.dateOfBirth; u.age = calculateAgeFromDateOfBirth(f.dateOfBirth); }
      (u as Record<string, unknown>).nationality = f.nationality.trim();
    } else {
      u.name = f.name.trim();
    }
    await save(u);
  };

  const view = (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex justify-center sm:block"><ProfileImage /></div>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <p className="text-lg font-bold text-gray-900">{userData.name}</p>
          {statusBadges}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {en && <View label="First / Middle / Last" value={[ft?.firstName, ft?.middleName, ft?.lastName].filter(Boolean).join(' / ')} />}
          {en && <View label="Nationality" value={(userData as { nationality?: string }).nationality} />}
          <View label={L('profile.gender')} value={userData.gender ? (userData.gender === 'M' ? (L('profile.male')) : (L('profile.female'))) : ''} />
          {en ? (
            <View label="Date of Birth" value={userData.dateOfBirth ? `${String(userData.dateOfBirth).substring(0, 10)}${userData.age ? ` (${userData.age})` : ''}` : ''} />
          ) : (
            <View label={L('profile.age')} value={userData.age ? `${userData.age}세` : ''} />
          )}
          <View label={L('students.email')} value={userData.email} />
          <View label={L('profile.phone3')} value={userData.phoneNumber ? formatPhoneNumber(userData.phoneNumber) : ''} />
        </div>
      </div>
    </div>
  );

  const edit = (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex justify-center sm:block"><ProfileImage /></div>
      <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {en ? (
          <>
            <Field label="First Name *" error={err.firstName}><input className={`${inputCls} ${err.firstName ? errCls : ''}`} value={f.firstName} onChange={(e) => set('firstName')(e.target.value)} /></Field>
            <Field label="Last Name *" error={err.lastName}><input className={`${inputCls} ${err.lastName ? errCls : ''}`} value={f.lastName} onChange={(e) => set('lastName')(e.target.value)} /></Field>
            <Field label="Middle Name (optional)"><input className={inputCls} value={f.middleName} onChange={(e) => set('middleName')(e.target.value)} /></Field>
            <Field label="Nationality *" error={err.nationality}>
              <select className={`${inputCls} ${err.nationality ? errCls : ''}`} value={natOther ? '__other' : f.nationality}
                onChange={(e) => { if (e.target.value === '__other') { setNatOther(true); set('nationality')(''); } else { setNatOther(false); set('nationality')(e.target.value); } }}>
                <option value="">Select your nationality…</option>
                {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
                <option value="__other">Other</option>
              </select>
              {natOther && <input className={`${inputCls} mt-2`} value={f.nationality} onChange={(e) => set('nationality')(e.target.value)} placeholder="Your nationality" />}
            </Field>
            <Field label="Date of Birth" error={err.dateOfBirth}><input type="date" className={`${inputCls} ${err.dateOfBirth ? errCls : ''}`} value={f.dateOfBirth} onChange={(e) => set('dateOfBirth')(e.target.value)} /></Field>
          </>
        ) : (
          <Field label={L('profile.name')} error={err.name}><input className={`${inputCls} ${err.name ? errCls : ''}`} value={f.name} onChange={(e) => set('name')(e.target.value)} /></Field>
        )}
        <Field label={L('profile.gender2')} error={err.gender}><GenderPicker value={f.gender} onChange={set('gender')} /></Field>
        <Field label={L('profile.email')} error={err.email}><input type="email" className={`${inputCls} ${err.email ? errCls : ''}`} value={f.email} onChange={(e) => set('email')(e.target.value)} /></Field>
        <Field label={L('profile.phone2')} error={err.phone}>
          {en ? (
            <div className="flex gap-1.5">
              <select className="px-2 py-2 border border-gray-300 rounded-md text-xs bg-gray-50" value={f.cc} onChange={(e) => set('cc')(e.target.value)}>
                {PHONE_COUNTRY_CODES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
              </select>
              <input type="tel" className={`${inputCls} ${err.phone ? errCls : ''}`} placeholder={getPhonePlaceholder(f.cc)} value={f.phone} onChange={(e) => set('phone')(e.target.value)} />
            </div>
          ) : (
            <input type="tel" className={`${inputCls} ${err.phone ? errCls : ''}`} placeholder="01012345678" value={f.phone} onChange={(e) => set('phone')(e.target.value)} />
          )}
        </Field>
      </div>
    </div>
  );

  const needNat = en && !(userData as { nationality?: string }).nationality;
  return <EditableSection id="basic" title={L('profile.basicInformation')} onStartEdit={start} onSave={onSave} view={view} edit={edit}
    badge={needNat ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">Nationality needed</span> : undefined} />;
}

// ─── 캠프 참가 정보 (캠프 코드가 있는 멘토·원어민) ─────────────────────────

type CampStatus = CampProfileStatus & { applies: boolean };
const EN_CAMP_LABELS: Record<string, string> = {
  englishNickname: 'English nickname', rrnLast: 'Resident registration no.', bankAccount: 'Bank account',
  passportName: 'Name on passport', passportNumber: 'Passport number', passportExpiry: 'Passport expiry',
  shirtSize: 'T-shirt size', phoneModel: 'Phone model', nationality: 'Nationality', visaType: 'Visa type',
};

export function CampProfileSection() {
  const { userData } = useAuth();
  const en = useIsForeign();
  const [status, setStatus] = useState<CampStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const campKey = (userData?.jobCodeIds ?? []).join(',');
  useEffect(() => {
    authenticatedGet<CampStatus>('/api/user/camp-profile').then(setStatus).catch(() => undefined);
  }, [campKey]);
  if (!userData || (userData.role !== 'mentor' && userData.role !== 'foreign')) return null;

  const p = status?.profile;
  const isS = status?.tier === 'S';
  const label = (k: string) => (isEnglishUI() ? EN_CAMP_LABELS[k] : CAMP_PROFILE_FIELD_LABELS[k as keyof typeof CAMP_PROFILE_FIELD_LABELS]);
  const bank = (() => {
    if (!p) return '';
    if (en && p.intlBank?.country) {
      const def = bankCountryDef(p.intlBank.country);
      const country = p.intlBank.countryName || def?.name || p.intlBank.country;
      return [country, p.intlBank.bankName, p.accountNumberMasked || p.intlBank.iban, p.intlBank.holderName].filter(Boolean).join(' · ');
    }
    return p.accountNumberMasked ? `${p.bankName ?? ''} ${p.accountNumberMasked} (${p.accountHolder ?? ''})` : '';
  })();

  const view = !status ? (
    <p className="text-sm text-gray-400">{L('profile.loading')}</p>
  ) : !status.tier ? (
    <p className="text-sm text-gray-500">{L('profile.youHaveNoCampAssigned')}</p>
  ) : (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        {L('nav.camp')}: <b className="text-gray-800">{status.campCodes.join(', ')}</b>
        {!status.active && <span className="ml-1 text-gray-400">({L('profile.ended')})</span>}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {!en && <View label={label('englishNickname')} value={p?.englishNickname} />}
        <View label={L('profile.salaryBankAccount')} value={bank} wide={en} />
        {en && status.required.includes('visaType') && <View label={label('visaType')} value={p?.visaType} />}
        {en && p?.intlBank?.swift && <View label="SWIFT / BIC" value={p.intlBank.swift} />}
        {isS && (
          <>
            <View label={label('passportName')} value={p?.passportName} />
            <View label={label('passportNumber')} value={p?.passportNumber} />
            <View label={label('passportExpiry')} value={p?.passportExpiry} />
            <View label={label('shirtSize')} value={p?.shirtSize} />
            <View label={label('phoneModel')} value={p?.phoneModel} />
          </>
        )}
        {!en && <View label={L('profile.residentRegistrationNumberLast7')} value={p?.hasRrnLast ? L('profile.entered') : L('profile.missingEnterInRrn')} />}
      </div>
      {status.missing.length > 0 && (
        <p className="text-xs text-amber-700">{L('profile.missing')}: {status.missing.map(label).join(', ')}</p>
      )}
    </div>
  );

  return (
    <EditableSection id="camp-info" title={L('profile.campInformation')}
      badge={status && status.tier && status.missing.length > 0
        ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">{L('profile.incomplete')}</span> : undefined}
      editable={!!status?.tier}
      editing={editing} onEditingChange={setEditing}
      view={view}
      edit={<CampProfileForm mode="edit" onDone={(s) => { setStatus(s as CampStatus); setEditing(false); }} />} />
  );
}

// ─── 주민등록번호 (멘토) ──────────────────────────────────────────────────────

export function RrnSection() {
  const { userData, refreshUserData } = useAuth();
  const [codes, setCodes] = useState<string[]>([]);
  const [front, setFront] = useState('');
  const [last, setLast] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    authenticatedGet<CampProfileStatus>('/api/user/camp-profile').then((s) => setCodes(s.campCodes ?? [])).catch(() => undefined);
  }, [userData?.jobCodeIds?.join(',')]);

  if (!userData) return null;
  const has = !!(userData.rrnLastEncrypted || userData.rrnLast);
  const purposes = rrnPurposeLines(codes);

  const onSave = async () => {
    if (!/^\d{6}$/.test(front)) { setErr(L('profile.enterTheFirst6Digits')); return false; }
    if (!/^[1-8]\d{6}$/.test(last)) { setErr(L('profile.enterTheLast7Digits')); return false; }
    setErr('');
    await authenticatedPost('/api/user/save-sensitive', { userId: userData.userId, rrnFront: front, rrnLast: last });
    await refreshUserData();
    toast.success(L('profile.yourIdNumberWasEncrypted'));
  };

  const purposeBox = purposes.length > 0 && (
    <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-900 leading-relaxed mb-3">
      <p className="font-semibold mb-0.5">{L('profile.purpose')}</p>
      {purposes.map((p) => <p key={p.tier}><b>{p.codes.join('·')}</b> {L('profile.theLast7DigitsAre')} {p.text}</p>)}
    </div>
  );

  const view = (
    <>
      <div className="flex items-center gap-3">
        <p className="font-mono text-sm tracking-widest text-gray-900">
          {userData.rrnFront || '______'}-{has ? '●●●●●●●' : (userData.rrnGenderDigit ? `${userData.rrnGenderDigit}●●●●●●` : '_______')}
        </p>
        {has ? <span className="text-xs text-green-700">{L('profile.lastDigitsEntered')}</span>
          : <span className="text-xs text-amber-700 font-medium">{L('profile.lastDigitsNotEntered2')}{purposes.length ? L('profile.enterForCampSuffix') : ''}</span>}
      </div>
    </>
  );

  const edit = (
    <>
      {purposeBox}
      <div className="flex items-end gap-2 max-w-md">
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">{L('profile.firstDigits6')}</label>
          <input className={`${inputCls} font-mono tracking-widest`} inputMode="numeric" maxLength={6} value={front} onChange={(e) => setFront(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
        </div>
        <span className="mb-2 text-gray-300">-</span>
        <div className="flex-1">
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs text-gray-500">{L('profile.lastDigits7')}</label>
            <button type="button" onClick={() => setShow(!show)} className="text-gray-400 hover:text-gray-600">{show ? <FaEyeSlash size={11} /> : <FaEye size={11} />}</button>
          </div>
          <input className={`${inputCls} font-mono tracking-widest`} type={show ? 'text' : 'password'} inputMode="numeric" maxLength={7} autoComplete="off"
            value={last} onChange={(e) => setLast(e.target.value.replace(/\D/g, ''))} placeholder={has ? L('profile.entered2') : '0000000'} />
        </div>
      </div>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
      <p className="mt-2 text-[11px] text-gray-500 flex items-center gap-1"><FaLock size={9} /> {L('profile.theLastDigitsAreEncrypted2')}</p>
    </>
  );

  return (
    <EditableSection id="rrn" title={L('profile.residentRegistrationNumber')} onStartEdit={() => { setFront(userData.rrnFront || ''); setLast(''); setShow(false); setErr(''); }}
      onSave={onSave} view={view} edit={edit}
      badge={!has && purposes.length ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">{L('profile.incomplete')}</span> : undefined} />
  );
}

// ─── 주소 ────────────────────────────────────────────────────────────────────

export function AddressSection() {
  const { userData } = useAuth();
  const en = useIsForeign();
  const save = useSave();
  const [address, setAddress] = useState('');
  const [detail, setDetail] = useState('');
  const [search, setSearch] = useState(false);
  const [err, setErr] = useState('');
  if (!userData) return null;

  const onSave = async () => {
    if (!en && (!address.trim() || !detail.trim())) { setErr(L('profile.pleaseEnterTheAddressAnd')); return false; }
    setErr('');
    const u: Partial<User> = { address: address.trim(), addressDetail: detail.trim() };
    if (address && address !== userData.address) Object.assign(u, await updateGeocodeIfAddressChanged(userData.address, address));
    await save(u);
  };

  const view = <p className="text-sm text-gray-900">{userData.address ? `${userData.address} ${userData.addressDetail || ''}` : <span className="text-gray-300">—</span>}</p>;
  const edit = (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input disabled className={`${inputCls} bg-gray-50`} value={address} placeholder={L('profile.clickSearch')} />
        <button type="button" onClick={() => setSearch(!search)} className="shrink-0 px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200">{L('profile.search')}</button>
      </div>
      {search && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <DaumPostcode onComplete={(d: Address) => { setAddress(d.address); setSearch(false); }} />
        </div>
      )}
      <input className={inputCls} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder={L('profile.detailedAddressOptional2')} />
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
  return <EditableSection id="address" title={L('profile.address')} onStartEdit={() => { setAddress(userData.address || ''); setDetail(userData.addressDetail || ''); setSearch(false); setErr(''); }} onSave={onSave} view={view} edit={edit} />;
}

// ─── 학교 정보 (멘토) ─────────────────────────────────────────────────────────

export function EducationSection() {
  const { userData } = useAuth();
  const save = useSave();
  const [f, setF] = useState({ university: '', grade: 0, isOnLeave: false, major1: '', major2: '' });
  const [err, setErr] = useState('');
  if (!userData) return null;

  const onSave = async () => {
    if (!f.university.trim() || !f.grade || !f.major1.trim()) { setErr(L('profile.pleaseEnterYourSchoolYear')); return false; }
    setErr('');
    await save({ university: f.university.trim(), grade: f.grade, isOnLeave: f.isOnLeave, major1: f.major1.trim(), major2: f.major2.trim() });
  };

  const view = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <View label={L('profile.school')} value={userData.university} />
      <View label={L('profile.year')} value={userData.grade ? `${userData.grade === 6 ? '졸업생' : `${userData.grade}학년`}${userData.isOnLeave ? ' (휴학 중)' : ''}` : ''} />
      <View wide label={L('profile.major')} value={userData.major1 ? `${userData.major1}${userData.major2 ? ` / ${userData.major2}` : ''}` : ''} />
    </div>
  );
  const edit = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label={L('profile.school2')}><input className={inputCls} value={f.university} onChange={(e) => setF({ ...f, university: e.target.value })} /></Field>
      <Field label={L('profile.year2')}>
        <div className="flex gap-1 flex-wrap">
          {[1, 2, 3, 4, 5, 6].map((g) => (
            <button key={g} type="button" onClick={() => setF({ ...f, grade: g })}
              className={`px-2.5 py-1.5 border rounded-md text-xs font-medium ${f.grade === g ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-blue-300'}`}>
              {g === 6 ? L('profile.graduated') : L('profile.gradeN', { v0: g })}
            </button>
          ))}
        </div>
      </Field>
      <Field label={L('profile.major2')}><input className={inputCls} value={f.major1} onChange={(e) => setF({ ...f, major1: e.target.value })} /></Field>
      <Field label={L('profile.secondMajorMinor')}><input className={inputCls} value={f.major2} onChange={(e) => setF({ ...f, major2: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm text-gray-700 sm:col-span-2">
        <input type="checkbox" checked={f.isOnLeave} onChange={(e) => setF({ ...f, isOnLeave: e.target.checked })} /> {L('profile.currentlyOnLeave')}
      </label>
      {err && <p className="text-xs text-red-600 sm:col-span-2">{err}</p>}
    </div>
  );
  return (
    <EditableSection id="education" title={L('profile.schoolInfo')} view={view} edit={edit} onSave={onSave}
      onStartEdit={() => { setF({ university: userData.university || '', grade: Number(userData.grade) || 0, isOnLeave: !!userData.isOnLeave, major1: userData.major1 || '', major2: userData.major2 || '' }); setErr(''); }} />
  );
}

// ─── 알바 & 멘토링 경력 (멘토) ────────────────────────────────────────────────

export function ExperienceSection() {
  const { userData } = useAuth();
  const save = useSave();
  const [jobs, setJobs] = useState<PartTimeJob[]>([]);
  const [err, setErr] = useState('');
  if (!userData) return null;
  const list = userData.partTimeJobs ?? [];

  const onSave = async () => {
    const cleaned = jobs.filter((j) => j.period || j.companyName || j.position || j.description);
    if (cleaned.some((j) => !j.period.trim() || !j.companyName.trim() || !j.position.trim())) { setErr(L('profile.periodCompanyAndRoleAre')); return false; }
    setErr('');
    await save({ partTimeJobs: cleaned.map((j) => ({ ...j, description: j.description || '' })) });
  };
  const upd = (i: number, k: keyof PartTimeJob, v: string) => setJobs(jobs.map((j, x) => (x === i ? { ...j, [k]: v } : j)));

  const view = list.length === 0 ? <p className="text-sm text-gray-400">{L('profile.noExperienceRegistered')}</p> : (
    <div className="space-y-3">
      {list.map((job, i) => (
        <div key={i} className="border rounded-md p-3">
          <div className="flex flex-col sm:flex-row sm:justify-between">
            <div><p className="font-semibold text-gray-900 text-sm">{job.companyName}</p><p className="text-xs text-blue-600">{job.position}</p></div>
            <p className="text-xs text-gray-500 mt-1 sm:mt-0">{job.period}</p>
          </div>
          {job.description && <p className="text-sm text-gray-700 mt-2">{job.description}</p>}
        </div>
      ))}
    </div>
  );
  const edit = (
    <div className="space-y-2">
      {jobs.map((job, i) => (
        <div key={i} className="border border-gray-200 rounded-md p-3 relative">
          <button type="button" onClick={() => setJobs(jobs.filter((_, x) => x !== i))} className="absolute top-2 right-2 text-xs text-gray-400 hover:text-red-500">{L('common.delete')}</button>
          <div className="grid grid-cols-2 gap-2 pr-8">
            <input className={inputCls} value={job.period} onChange={(e) => upd(i, 'period', e.target.value)} placeholder={L('profile.period20220309')} />
            <input className={inputCls} value={job.companyName} onChange={(e) => upd(i, 'companyName', e.target.value)} placeholder={L('profile.company')} />
            <input className={inputCls} value={job.position} onChange={(e) => upd(i, 'position', e.target.value)} placeholder={L('profile.role')} />
            <input className={inputCls} value={job.description || ''} onChange={(e) => upd(i, 'description', e.target.value)} placeholder={L('profile.detailsOptional')} />
          </div>
        </div>
      ))}
      <button type="button" onClick={() => setJobs([...jobs, { period: '', companyName: '', position: '', description: '' }])}
        className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">{L('profile.addExperience')}</button>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  );
  return <EditableSection id="experience" title={L('profile.partTimeMentoringExperience')} view={view} edit={edit} onSave={onSave} onStartEdit={() => { setJobs(list.map((j) => ({ ...j }))); setErr(''); }} />;
}

// ─── 자기소개 & 지원동기 (멘토) ───────────────────────────────────────────────

export function IntroSection() {
  const { userData } = useAuth();
  const save = useSave();
  const [intro, setIntro] = useState('');
  const [motive, setMotive] = useState('');
  if (!userData) return null;
  const view = (
    <div className="space-y-3">
      <View label={L('admin.selfIntroduction')} value={userData.selfIntroduction} />
      <View label={L('profile.motivation')} value={userData.jobMotivation} />
    </div>
  );
  const ta = 'w-full px-3 py-2 border border-gray-300 rounded-md text-sm min-h-[7rem] resize-y focus:outline-none focus:ring-1 focus:ring-blue-500';
  const edit = (
    <div className="space-y-3">
      <div><div className="flex justify-between text-xs text-gray-500 mb-1"><span>{L('admin.selfIntroduction')}</span><span>{intro.length}/500</span></div>
        <textarea className={ta} maxLength={500} value={intro} onChange={(e) => setIntro(e.target.value)} /></div>
      <div><div className="flex justify-between text-xs text-gray-500 mb-1"><span>{L('profile.motivation')}</span><span>{motive.length}/500</span></div>
        <textarea className={ta} maxLength={500} value={motive} onChange={(e) => setMotive(e.target.value)} /></div>
    </div>
  );
  return <EditableSection id="intro" title={L('profile.selfIntroductionMotivation')} view={view} edit={edit}
    onStartEdit={() => { setIntro(userData.selfIntroduction || ''); setMotive(userData.jobMotivation || ''); }}
    onSave={async () => { await save({ selfIntroduction: intro, jobMotivation: motive }); }} />;
}

// ─── 가입 경로 (멘토) ─────────────────────────────────────────────────────────

export function ReferralSection() {
  const { userData } = useAuth();
  const save = useSave();
  const [path, setPath] = useState('');
  const [referrer, setReferrer] = useState('');
  const [other, setOther] = useState('');
  if (!userData) return null;
  const view = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <View label={L('profile.howDidYouHearAbout')} value={userData.referralPath} />
      {userData.referrerName && <View label={L('profile.referrer')} value={userData.referrerName} />}
    </div>
  );
  const edit = (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <select className={inputCls} value={path} onChange={(e) => setPath(e.target.value)}>
        <option value="">{L('profile.pleaseSelect')}</option>
        {REFERRAL_PATHS.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      {path === '지인 소개' && <input className={inputCls} value={referrer} onChange={(e) => setReferrer(e.target.value)} placeholder={L('profile.referrerName')} />}
      {path === '기타' && <input className={inputCls} value={other} onChange={(e) => setOther(e.target.value)} placeholder={L('profile.whichChannel')} />}
    </div>
  );
  return <EditableSection id="referral" title={L('profile.howDidYouHearAbout')} view={view} edit={edit}
    onStartEdit={() => {
      const rp = userData.referralPath || '';
      if (rp.startsWith('기타: ')) { setPath('기타'); setOther(rp.substring(4).trim()); } else { setPath(rp); setOther(''); }
      setReferrer(userData.referrerName || '');
    }}
    onSave={async () => {
      await save({ referralPath: path === '기타' && other.trim() ? `기타: ${other.trim()}` : path, referrerName: path === '지인 소개' ? referrer.trim() : '' });
    }} />;
}
