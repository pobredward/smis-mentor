/**
 * 마이페이지 섹션 — 섹션마다 제자리에서 따로 수정한다 (별도 수정 화면 없음).
 * 각 섹션은 [수정] → 입력 → [저장]/[취소] 로 자기 필드만 저장한다.
 */
import React, { useEffect, useState, type ReactNode } from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, Alert, ActivityIndicator, StyleSheet, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import {
  logger,
  formatPhoneNumber,
  calculateAgeFromDateOfBirth,
  updateGeocodeIfAddressChanged,
  rrnPurposeLines,
  NATIONALITIES,
  CAMP_PROFILE_FIELD_LABELS,
  bankCountryDef,
} from '@smis-mentor/shared';
import { useAuth } from '../../context/AuthContext';
import { uploadProfileImage, updateUserProfile, checkPhoneExists } from '../../services/profileService';
import { saveSensitiveInfo, mobileAuthenticatedPost } from '../../services/apiClient';
import { compressImage, uriToBlob } from '../../utils';
import { getPhonePlaceholder } from '../../utils/phoneUtils';
import { DaumPostcode } from '../DaumPostcode';
import { fetchCampProfileStatus, CampProfileForm, type CampProfileApiStatus } from '../campProfile/CampProfileForm';

// ─── 공통 ───────────────────────────────────────────────────────────────────

const PHONE_COUNTRY_CODES = [
  { code: '+82', flag: '🇰🇷' }, { code: '+1', flag: '🇺🇸' }, { code: '+44', flag: '🇬🇧' }, { code: '+353', flag: '🇮🇪' },
  { code: '+61', flag: '🇦🇺' }, { code: '+64', flag: '🇳🇿' }, { code: '+27', flag: '🇿🇦' },
];
const REFERRAL_PATHS = ['에브리타임', '학교 커뮤니티', '링커리어', '캠퍼스픽', '인스타그램', '페이스북', '구글/네이버 등 검색', '지인 소개', '기타'];

interface PartTimeJob { period: string; companyName: string; position: string; description?: string }

function useIsForeign() {
  const { userData } = useAuth();
  return userData?.role === 'foreign' || userData?.role === 'foreign_temp';
}

function useSave() {
  const { userData, refreshUserData } = useAuth();
  const en = useIsForeign();
  return async (updates: Record<string, unknown>) => {
    if (!userData) return;
    await updateUserProfile(userData.userId, updates);
    await refreshUserData();
    Alert.alert(en ? 'Saved' : '저장 완료', en ? 'Your changes have been saved.' : '저장했습니다.');
  };
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

function Info({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <View style={s.info}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={[s.infoValue, !value && { color: '#cbd5e1' }]}>{value || '—'}</Text>
    </View>
  );
}

function Chips<T extends string | number>({ options, value, onChange }: { options: Array<{ v: T; label: string }>; value: T | undefined; onChange: (v: T) => void }) {
  return (
    <View style={s.chips}>
      {options.map((o) => (
        <TouchableOpacity key={String(o.v)} onPress={() => onChange(o.v)} style={[s.chip, value === o.v && s.chipOn]}>
          <Text style={[s.chipText, value === o.v && { color: '#fff' }]}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/**
 * 섹션 카드 — 보기/수정 전환과 저장·취소 버튼을 가진 틀.
 * onSave 가 false 를 돌려주면(검증 실패) 수정 상태를 유지한다.
 */
export function EditableSection({ title, badge, onStartEdit, onSave, view, edit, editable = true, editing: editingProp, onEditingChange }: {
  title: string; badge?: ReactNode; onStartEdit?: () => void;
  /** 없으면 편집 화면이 자체 저장 버튼을 가진다 (헤더에는 [취소]만) */
  onSave?: () => Promise<boolean | void>;
  view: ReactNode; edit?: ReactNode; editable?: boolean;
  /** 바깥에서 편집 상태를 제어할 때 (예: 폼 저장 후 닫기) */
  editing?: boolean; onEditingChange?: (v: boolean) => void;
}) {
  const en = useIsForeign();
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
      Alert.alert(en ? 'Error' : '오류', (e as Error)?.message || (en ? 'Failed to save.' : '저장하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <View style={s.card}>
      <View style={s.header}>
        <Text style={s.title}>{title}</Text>
        {badge}
        <View style={{ flex: 1 }} />
        {editable && edit && !editing && (
          <TouchableOpacity onPress={() => { onStartEdit?.(); setEditing(true); }} style={s.btnOutline} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.btnOutlineText}>{en ? 'Edit' : '수정'}</Text>
          </TouchableOpacity>
        )}
        {editing && (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TouchableOpacity onPress={() => setEditing(false)} disabled={saving} style={s.btnOutline}>
              <Text style={s.btnOutlineText}>{en ? 'Cancel' : '취소'}</Text>
            </TouchableOpacity>
            {onSave && (
              <TouchableOpacity onPress={save} disabled={saving} style={[s.btnPrimary, saving && { opacity: 0.5 }]}>
                <Text style={s.btnPrimaryText}>{saving ? (en ? 'Saving…' : '저장 중…') : (en ? 'Save' : '저장')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
      <View style={s.body}>{editing ? edit : view}</View>
    </View>
  );
}

// ─── 프로필 사진 ─────────────────────────────────────────────────────────────

function ProfileImage() {
  const { userData, refreshUserData } = useAuth();
  const en = useIsForeign();
  const [uploading, setUploading] = useState(false);
  if (!userData) return null;
  const pick = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert(en ? 'Permission Required' : '권한 필요', en ? 'Photo library access is required.' : '사진 라이브러리 접근 권한이 필요합니다.'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (r.canceled || !r.assets[0]) return;
      setUploading(true);
      const compressed = await compressImage(r.assets[0].uri, 0.8);
      const url = await uploadProfileImage(userData.userId, await uriToBlob(compressed.uri));
      await updateUserProfile(userData.userId, { profileImage: url });
      await refreshUserData();
    } catch (e) {
      logger.error('프로필 사진 업로드 오류:', e);
      Alert.alert(en ? 'Error' : '오류', en ? 'Failed to upload the image.' : '이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };
  return (
    <TouchableOpacity onPress={pick} activeOpacity={0.8} style={{ width: 72, height: 72 }}>
      {userData.profileImage
        ? <Image source={{ uri: userData.profileImage }} style={s.avatar} />
        : <View style={[s.avatar, { backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center' }]}><Text style={{ color: '#fff', fontSize: 26, fontWeight: '700' }}>{userData.name?.charAt(0)}</Text></View>}
      {uploading && <View style={[s.avatar, s.avatarOverlay]}><ActivityIndicator color="#fff" /></View>}
      <View style={s.camera}><Ionicons name="camera" size={13} color="#475569" /></View>
    </TouchableOpacity>
  );
}

// ─── 기본 정보 ───────────────────────────────────────────────────────────────

function splitPhone(phone: string | undefined, foreign: boolean) {
  let cc = '+82';
  let num = phone || '';
  if (foreign && phone) {
    const found = PHONE_COUNTRY_CODES.find((c) => phone.startsWith(c.code));
    if (found) {
      cc = found.code;
      num = phone.substring(found.code.length);
      if (cc === '+82' && num.length === 10 && !num.startsWith('0')) num = '0' + num;
    }
  }
  return { cc, num };
}

export function BasicInfoSection({ statusBadges }: { statusBadges?: ReactNode }) {
  const { userData } = useAuth();
  const en = useIsForeign();
  const save = useSave();
  const [f, setF] = useState({ name: '', firstName: '', middleName: '', lastName: '', gender: '', dateOfBirth: '', email: '', phone: '', cc: '+82', nationality: '' });
  const [natOther, setNatOther] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});
  if (!userData) return null;
  const ft = (userData as any).foreignTeacher as Record<string, any> | undefined;
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const start = () => {
    const { cc, num } = splitPhone(userData.phoneNumber, en);
    setF({
      name: userData.name || '', firstName: ft?.firstName || '', middleName: ft?.middleName || '', lastName: ft?.lastName || '',
      gender: userData.gender || '', dateOfBirth: (userData as any).dateOfBirth ? String((userData as any).dateOfBirth).substring(0, 10) : '',
      email: userData.email || '', phone: num, cc,
      nationality: (userData as any).nationality || '',
    });
    const nat: string = (userData as any).nationality || '';
    setNatOther(!!nat && !(NATIONALITIES as readonly string[]).includes(nat));
    setErr({});
  };

  const onSave = async () => {
    const e: Record<string, string> = {};
    if (en) {
      if (!f.firstName.trim()) e.firstName = 'Please enter your first name.';
      if (!f.lastName.trim()) e.lastName = 'Please enter your last name.';
      if (!f.nationality.trim()) e.nationality = 'Please select your nationality.';
      if (f.dateOfBirth && (!/^\d{4}-\d{2}-\d{2}$/.test(f.dateOfBirth) || isNaN(new Date(f.dateOfBirth).getTime()))) e.dateOfBirth = 'Use YYYY-MM-DD.';
    } else if (f.name.trim().length < 2) e.name = '이름은 2자 이상 입력해주세요.';
    if (!f.gender) e.gender = en ? 'Please select your gender.' : '성별을 선택해주세요.';
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = en ? 'Please enter a valid email.' : '올바른 이메일을 입력해주세요.';
    if (f.phone.replace(/\D/g, '').length < 8) e.phone = en ? 'Please enter a valid phone number.' : '올바른 휴대폰 번호를 입력해주세요.';
    setErr(e);
    if (Object.keys(e).length) return false;

    let phone = f.phone.replace(/[^0-9]/g, '');
    if (en) { if (f.cc === '+82' && phone.startsWith('0')) phone = phone.substring(1); phone = `${f.cc}${phone}`; }
    if (phone !== userData.phoneNumber && await checkPhoneExists(phone, userData.userId)) {
      setErr({ phone: en ? 'This phone number is already in use.' : '이미 사용 중인 번호입니다.' });
      return false;
    }
    if (f.email.trim().toLowerCase() !== (userData.email || '').toLowerCase()) {
      try {
        await mobileAuthenticatedPost('/api/user/change-email', { email: f.email.trim() });
      } catch (ex) {
        const msg = String((ex as Error)?.message || '');
        setErr({ email: /이미 사용|ALREADY_EXISTS|409/.test(msg) ? (en ? 'This email is already in use.' : '이미 사용 중인 이메일입니다.') : (en ? 'Could not change the email.' : '이메일을 바꾸지 못했습니다.') });
        return false;
      }
    }
    const u: Record<string, unknown> = { phoneNumber: phone, gender: f.gender };
    if (en) {
      const first = f.firstName.trim(); const last = f.lastName.trim(); const mid = f.middleName.trim();
      u.name = mid ? `${first} ${mid} ${last}` : `${first} ${last}`;
      u.foreignTeacher = { ...(ft || {}), firstName: first, lastName: last, middleName: mid, countryCode: f.cc };
      if (f.dateOfBirth) { u.dateOfBirth = f.dateOfBirth; u.age = calculateAgeFromDateOfBirth(f.dateOfBirth); }
      u.nationality = f.nationality.trim();
    } else {
      u.name = f.name.trim();
    }
    await save(u);
  };

  const genderLabel = (g?: string) => (g ? (g === 'M' ? (en ? 'Male' : '남성') : (en ? 'Female' : '여성')) : '');
  const view = (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <ProfileImage />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ fontSize: 19, fontWeight: '700', color: '#0f172a' }}>{userData.name}</Text>
          {statusBadges}
        </View>
      </View>
      <View style={s.grid}>
        {en ? <Info label="Nationality" value={(userData as any).nationality} /> : null}
        <Info label={en ? 'Gender' : '성별'} value={genderLabel(userData.gender)} />
        {en
          ? <Info label="Date of Birth" value={(userData as any).dateOfBirth ? `${String((userData as any).dateOfBirth).substring(0, 10)}${userData.age ? ` (${userData.age})` : ''}` : ''} />
          : <Info label="나이" value={userData.age ? `${userData.age}세` : ''} />}
        <Info label={en ? 'Email' : '이메일'} value={userData.email} />
        <Info label={en ? 'Phone' : '연락처'} value={userData.phoneNumber ? formatPhoneNumber(userData.phoneNumber) : ''} />
      </View>
    </View>
  );

  const edit = (
    <View style={{ gap: 12 }}>
      <View style={{ alignItems: 'center' }}><ProfileImage /></View>
      {en ? (
        <>
          <Field label="First Name *" error={err.firstName}><TextInput style={s.input} value={f.firstName} onChangeText={set('firstName')} /></Field>
          <Field label="Middle Name (optional)"><TextInput style={s.input} value={f.middleName} onChangeText={set('middleName')} /></Field>
          <Field label="Last Name *" error={err.lastName}><TextInput style={s.input} value={f.lastName} onChangeText={set('lastName')} /></Field>
          <Field label="Nationality *" error={err.nationality}>
            <Chips options={[...NATIONALITIES.map((n) => ({ v: n as string, label: n as string })), { v: '__other', label: 'Other' }]}
              value={natOther ? '__other' : f.nationality}
              onChange={(v) => { if (v === '__other') { setNatOther(true); set('nationality')(''); } else { setNatOther(false); set('nationality')(v); } }} />
            {natOther && <TextInput style={[s.input, { marginTop: 6 }]} value={f.nationality} onChangeText={set('nationality')} placeholder="Your nationality" />}
          </Field>
          <Field label="Date of Birth (YYYY-MM-DD)" error={err.dateOfBirth}><TextInput style={s.input} value={f.dateOfBirth} onChangeText={set('dateOfBirth')} placeholder="1995-04-21" keyboardType="numbers-and-punctuation" /></Field>
        </>
      ) : (
        <Field label="이름 *" error={err.name}><TextInput style={s.input} value={f.name} onChangeText={set('name')} /></Field>
      )}
      <Field label={en ? 'Gender *' : '성별 *'} error={err.gender}>
        <Chips options={[{ v: 'M', label: en ? 'Male' : '남성' }, { v: 'F', label: en ? 'Female' : '여성' }]} value={f.gender} onChange={set('gender')} />
      </Field>
      <Field label={en ? 'Email *' : '이메일 *'} error={err.email}>
        <TextInput style={s.input} value={f.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
      </Field>
      <Field label={en ? 'Phone *' : '휴대폰 번호 *'} error={err.phone}>
        {en && <Chips options={PHONE_COUNTRY_CODES.map((c) => ({ v: c.code, label: `${c.flag} ${c.code}` }))} value={f.cc} onChange={set('cc')} />}
        <TextInput style={[s.input, en && { marginTop: 6 }]} value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder={en ? getPhonePlaceholder(f.cc) : '01012345678'} />
      </Field>
    </View>
  );
  const needNat = en && !(userData as any).nationality;
  return <EditableSection title={en ? 'Basic Information' : '기본 정보'} onStartEdit={start} onSave={onSave} view={view} edit={edit}
    badge={needNat ? <View style={s.warnBadge}><Text style={s.warnBadgeText}>Nationality needed</Text></View> : undefined} />;
}

// ─── 캠프 참가 정보 (캠프 코드가 있는 멘토·원어민) ─────────────────────────

const EN_CAMP_LABELS: Record<string, string> = {
  englishNickname: 'English nickname', rrnLast: 'Resident registration no.', bankAccount: 'Bank account',
  passportName: 'Name on passport', passportNumber: 'Passport number', passportExpiry: 'Passport expiry',
  shirtSize: 'T-shirt size', phoneModel: 'Phone model', nationality: 'Nationality', visaType: 'Visa type',
};

export function CampProfileSection() {
  const { userData } = useAuth();
  const en = useIsForeign();
  const [status, setStatus] = useState<CampProfileApiStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const campKey = (userData?.jobExperiences ?? []).map((e: any) => e?.id).join(',');
  useEffect(() => { fetchCampProfileStatus().then(setStatus).catch(() => undefined); }, [campKey]);
  if (!userData || (userData.role !== 'mentor' && userData.role !== 'foreign')) return null;

  const p = status?.profile;
  const isS = status?.tier === 'S';
  const label = (k: string) => (en ? EN_CAMP_LABELS[k] : CAMP_PROFILE_FIELD_LABELS[k as keyof typeof CAMP_PROFILE_FIELD_LABELS]);
  let bank = '';
  if (p) {
    if (en && p.intlBank?.country) {
      const def = bankCountryDef(p.intlBank.country);
      bank = [p.intlBank.countryName || def?.name || p.intlBank.country, p.intlBank.bankName, p.accountNumberMasked || p.intlBank.iban, p.intlBank.holderName].filter(Boolean).join(' · ');
    } else if (p.accountNumberMasked) {
      bank = `${p.bankName ?? ''} ${p.accountNumberMasked} (${p.accountHolder ?? ''})`;
    }
  }

  const view = !status ? <ActivityIndicator /> : !status.tier ? (
    <Text style={s.help}>{en ? 'You have no camp assigned yet.' : '배정된 캠프가 없어 입력할 정보가 없습니다.'}</Text>
  ) : (
    <View style={{ gap: 12 }}>
      <Text style={s.help}>
        {en ? 'Camp' : '캠프'}: <Text style={{ fontWeight: '700', color: '#1e293b' }}>{status.campCodes.join(', ')}</Text>
        {!status.active ? ` (${en ? 'ended' : '종료'})` : ''}
      </Text>
      <View style={s.grid}>
        {!en && <Info label={label('englishNickname')} value={p?.englishNickname} />}
        <Info label={en ? 'Salary bank account' : '급여 계좌'} value={bank} />
        {en && status.required.includes('visaType') ? <Info label={label('visaType')} value={p?.visaType} /> : null}
        {en && p?.intlBank?.swift ? <Info label="SWIFT / BIC" value={p.intlBank.swift} /> : null}
        {isS && (
          <>
            <Info label={label('passportName')} value={p?.passportName} />
            <Info label={label('passportNumber')} value={p?.passportNumber} />
            <Info label={label('passportExpiry')} value={p?.passportExpiry} />
            <Info label={label('shirtSize')} value={p?.shirtSize} />
            <Info label={label('phoneModel')} value={p?.phoneModel} />
          </>
        )}
        {!en && <Info label="주민번호 뒷자리" value={p?.hasRrnLast ? '입력됨' : '미입력'} />}
      </View>
      {status.missing.length > 0 && (
        <Text style={{ fontSize: 12, color: '#b45309' }}>{en ? 'Missing' : '미입력'}: {status.missing.map(label).join(', ')}</Text>
      )}
    </View>
  );

  return (
    <EditableSection title={en ? 'Camp Information' : '캠프 참가 정보'}
      badge={status && status.tier && status.missing.length > 0
        ? <View style={s.warnBadge}><Text style={s.warnBadgeText}>{en ? 'Incomplete' : '입력 필요'}</Text></View> : undefined}
      editable={!!status?.tier}
      editing={editing} onEditingChange={setEditing}
      view={view}
      edit={<CampProfileForm mode="edit" onDone={(st) => { setStatus(st); setEditing(false); }} />} />
  );
}

// ─── 주민등록번호 (멘토) ──────────────────────────────────────────────────────

export function RrnSection() {
  const { userData, refreshUserData } = useAuth();
  const [codes, setCodes] = useState<string[]>([]);
  const [front, setFront] = useState('');
  const [last, setLast] = useState('');
  const [err, setErr] = useState('');
  const campKey = (userData?.jobExperiences ?? []).map((e: any) => e?.id).join(',');
  useEffect(() => { fetchCampProfileStatus().then((st) => setCodes(st.campCodes ?? [])).catch(() => undefined); }, [campKey]);
  if (!userData) return null;
  const u = userData as any;
  const has = !!(u.rrnLastEncrypted || u.rrnLast);
  const purposes = rrnPurposeLines(codes);

  const onSave = async () => {
    if (!/^\d{6}$/.test(front)) { setErr('앞자리 숫자 6자리를 입력해주세요.'); return false; }
    if (!/^[1-8]\d{6}$/.test(last)) { setErr('뒷자리 숫자 7자리를 입력해주세요.'); return false; }
    setErr('');
    await saveSensitiveInfo({ userId: userData.userId, rrnFront: front, rrnLast: last });
    await refreshUserData();
    Alert.alert('저장 완료', '주민등록번호를 암호화해 저장했습니다.');
  };

  const purposeBox = purposes.length > 0 ? (
    <View style={s.notice}>
      <Text style={[s.noticeText, { fontWeight: '700' }]}>사용 목적</Text>
      {purposes.map((p) => <Text key={p.tier} style={s.noticeText}><Text style={{ fontWeight: '700' }}>{p.codes.join('·')}</Text> — 주민등록번호 뒷자리는 {p.text}</Text>)}
    </View>
  ) : null;

  const view = (
    <View style={{ gap: 10 }}>
      <Text style={{ fontSize: 16, letterSpacing: 2, color: '#0f172a', fontVariant: ['tabular-nums'] }}>
        {u.rrnFront || '______'}-{has ? '●●●●●●●' : (u.rrnGenderDigit ? `${u.rrnGenderDigit}●●●●●●` : '_______')}
      </Text>
      <Text style={{ fontSize: 12, color: has ? '#15803d' : '#b45309', fontWeight: has ? '400' : '600' }}>
        {has ? '뒷자리 입력됨' : `뒷자리 미입력${purposes.length ? ' — 캠프 참가를 위해 입력해주세요' : ''}`}
      </Text>
    </View>
  );
  const edit = (
    <View style={{ gap: 10 }}>
      {purposeBox}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TextInput style={[s.input, { flex: 1, letterSpacing: 2 }]} value={front} onChangeText={(t) => setFront(t.replace(/\D/g, ''))} maxLength={6} keyboardType="number-pad" placeholder="앞 6자리" />
        <Text style={{ color: '#cbd5e1' }}>-</Text>
        <TextInput style={[s.input, { flex: 1, letterSpacing: 2 }]} value={last} onChangeText={(t) => setLast(t.replace(/\D/g, ''))} maxLength={7} keyboardType="number-pad" secureTextEntry placeholder={has ? '입력됨' : '뒤 7자리'} />
      </View>
      {err ? <Text style={s.error}>{err}</Text> : null}
      <Text style={s.help}>🔒 뒷자리는 AES-256-GCM 으로 암호화해 저장하며 관리자만 확인합니다.</Text>
    </View>
  );
  return (
    <EditableSection title="주민등록번호" view={view} edit={edit} onSave={onSave}
      onStartEdit={() => { setFront(u.rrnFront || ''); setLast(''); setErr(''); }}
      badge={!has && purposes.length ? <View style={s.warnBadge}><Text style={s.warnBadgeText}>입력 필요</Text></View> : undefined} />
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
    if (!en && (!address.trim() || !detail.trim())) { setErr('주소와 상세 주소를 입력해주세요.'); return false; }
    setErr('');
    const u: Record<string, unknown> = { address: address.trim(), addressDetail: detail.trim() };
    if (address && address !== userData.address) {
      Object.assign(u, await updateGeocodeIfAddressChanged(userData.address, address, Constants.expoConfig?.extra?.kakaoRestApiKey));
    }
    await save(u);
  };
  const view = <Text style={s.infoValue}>{userData.address ? `${userData.address} ${userData.addressDetail || ''}` : '—'}</Text>;
  const edit = (
    <View style={{ gap: 8 }}>
      <TouchableOpacity onPress={() => setSearch(true)} style={[s.input, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
        <Ionicons name="search" size={16} color="#64748b" />
        <Text style={{ flex: 1, color: address ? '#0f172a' : '#94a3b8' }}>{address || (en ? 'Tap to search address' : '눌러서 주소 검색')}</Text>
      </TouchableOpacity>
      <TextInput style={s.input} value={detail} onChangeText={setDetail} placeholder={en ? 'Detailed address (optional)' : '상세 주소'} />
      {err ? <Text style={s.error}>{err}</Text> : null}
      <DaumPostcode visible={search} onComplete={(d) => { setAddress(d.address); setSearch(false); }} onClose={() => setSearch(false)} title={en ? 'Search Address' : '주소 검색'} />
    </View>
  );
  return <EditableSection title={en ? 'Address' : '주소'} view={view} edit={edit} onSave={onSave}
    onStartEdit={() => { setAddress(userData.address || ''); setDetail(userData.addressDetail || ''); setErr(''); }} />;
}

// ─── 학교 정보 (멘토) ─────────────────────────────────────────────────────────

export function EducationSection() {
  const { userData } = useAuth();
  const save = useSave();
  const [f, setF] = useState({ university: '', grade: 0, isOnLeave: false, major1: '', major2: '' });
  const [err, setErr] = useState('');
  if (!userData) return null;
  const u = userData as any;
  const view = (
    <View style={s.grid}>
      <Info label="학교" value={u.university || u.school} />
      <Info label="학년" value={u.grade ? `${u.grade === 6 ? '졸업생' : `${u.grade}학년`}${u.isOnLeave ? ' (휴학 중)' : ''}` : ''} />
      <Info label="전공" value={(u.major1 || u.major) ? `${u.major1 || u.major}${u.major2 ? ` / ${u.major2}` : ''}` : ''} />
    </View>
  );
  const edit = (
    <View style={{ gap: 12 }}>
      <Field label="학교 *"><TextInput style={s.input} value={f.university} onChangeText={(v) => setF({ ...f, university: v })} /></Field>
      <Field label="학년 *">
        <Chips options={[1, 2, 3, 4, 5, 6].map((g) => ({ v: g, label: g === 6 ? '졸업' : `${g}학년` }))} value={f.grade} onChange={(g) => setF({ ...f, grade: g })} />
      </Field>
      <Field label="1전공 *"><TextInput style={s.input} value={f.major1} onChangeText={(v) => setF({ ...f, major1: v })} /></Field>
      <Field label="2전공/부전공"><TextInput style={s.input} value={f.major2} onChangeText={(v) => setF({ ...f, major2: v })} /></Field>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={s.fieldLabel}>현재 휴학 중</Text>
        <Switch value={f.isOnLeave} onValueChange={(v) => setF({ ...f, isOnLeave: v })} />
      </View>
      {err ? <Text style={s.error}>{err}</Text> : null}
    </View>
  );
  return <EditableSection title="학교 정보" view={view} edit={edit}
    onStartEdit={() => { setF({ university: u.university || u.school || '', grade: Number(u.grade) || 0, isOnLeave: !!u.isOnLeave, major1: u.major1 || u.major || '', major2: u.major2 || '' }); setErr(''); }}
    onSave={async () => {
      if (!f.university.trim() || !f.grade || !f.major1.trim()) { setErr('학교, 학년, 1전공을 입력해주세요.'); return false; }
      setErr('');
      await save({ university: f.university.trim(), grade: f.grade, isOnLeave: f.isOnLeave, major1: f.major1.trim(), major2: f.major2.trim() });
    }} />;
}

// ─── 알바 & 멘토링 경력 (멘토) ────────────────────────────────────────────────

export function ExperienceSection() {
  const { userData } = useAuth();
  const save = useSave();
  const [jobs, setJobs] = useState<PartTimeJob[]>([]);
  const [err, setErr] = useState('');
  if (!userData) return null;
  const list: PartTimeJob[] = (userData as any).partTimeJobs ?? [];
  const upd = (i: number, k: keyof PartTimeJob, v: string) => setJobs(jobs.map((j, x) => (x === i ? { ...j, [k]: v } : j)));
  const view = list.length === 0 ? <Text style={s.help}>등록된 경력이 없습니다.</Text> : (
    <View style={{ gap: 10 }}>
      {list.map((job, i) => (
        <View key={i} style={s.job}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontWeight: '600', color: '#0f172a' }}>{job.companyName}</Text>
            <Text style={{ fontSize: 12, color: '#64748b' }}>{job.period}</Text>
          </View>
          <Text style={{ fontSize: 13, color: '#2563eb', marginTop: 2 }}>{job.position}</Text>
          {job.description ? <Text style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>{job.description}</Text> : null}
        </View>
      ))}
    </View>
  );
  const edit = (
    <View style={{ gap: 10 }}>
      {jobs.map((job, i) => (
        <View key={i} style={[s.job, { gap: 6 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <TouchableOpacity onPress={() => setJobs(jobs.filter((_, x) => x !== i))}><Text style={{ fontSize: 12, color: '#ef4444' }}>삭제</Text></TouchableOpacity>
          </View>
          <TextInput style={s.input} value={job.period} onChangeText={(v) => upd(i, 'period', v)} placeholder="기간 * (2022.03~09)" />
          <TextInput style={s.input} value={job.companyName} onChangeText={(v) => upd(i, 'companyName', v)} placeholder="회사명 *" />
          <TextInput style={s.input} value={job.position} onChangeText={(v) => upd(i, 'position', v)} placeholder="담당 *" />
          <TextInput style={s.input} value={job.description || ''} onChangeText={(v) => upd(i, 'description', v)} placeholder="업무 내용 (선택)" />
        </View>
      ))}
      <TouchableOpacity onPress={() => setJobs([...jobs, { period: '', companyName: '', position: '', description: '' }])} style={s.addBtn}>
        <Text style={{ color: '#475569', fontWeight: '600' }}>+ 경력 추가</Text>
      </TouchableOpacity>
      {err ? <Text style={s.error}>{err}</Text> : null}
    </View>
  );
  return <EditableSection title="알바 & 멘토링 경력" view={view} edit={edit}
    onStartEdit={() => { setJobs(list.map((j) => ({ ...j }))); setErr(''); }}
    onSave={async () => {
      const cleaned = jobs.filter((j) => j.period || j.companyName || j.position || j.description);
      if (cleaned.some((j) => !j.period.trim() || !j.companyName.trim() || !j.position.trim())) { setErr('기간, 회사명, 담당은 필수입니다.'); return false; }
      setErr('');
      await save({ partTimeJobs: cleaned.map((j) => ({ ...j, description: j.description || '' })) });
    }} />;
}

// ─── 자기소개 & 지원동기 (멘토) ───────────────────────────────────────────────

export function IntroSection() {
  const { userData } = useAuth();
  const save = useSave();
  const [intro, setIntro] = useState('');
  const [motive, setMotive] = useState('');
  if (!userData) return null;
  const u = userData as any;
  const view = (
    <View style={{ gap: 12 }}>
      <Info label="자기소개" value={u.selfIntroduction} />
      <Info label="지원동기" value={u.jobMotivation} />
    </View>
  );
  const edit = (
    <View style={{ gap: 12 }}>
      <Field label={`자기소개 (${intro.length}/500)`}><TextInput style={[s.input, s.multi]} multiline maxLength={500} value={intro} onChangeText={setIntro} /></Field>
      <Field label={`지원동기 (${motive.length}/500)`}><TextInput style={[s.input, s.multi]} multiline maxLength={500} value={motive} onChangeText={setMotive} /></Field>
    </View>
  );
  return <EditableSection title="자기소개 & 지원동기" view={view} edit={edit}
    onStartEdit={() => { setIntro(u.selfIntroduction || ''); setMotive(u.jobMotivation || ''); }}
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
  const u = userData as any;
  const view = (
    <View style={s.grid}>
      <Info label="가입 경로" value={u.referralPath} />
      {u.referrerName ? <Info label="소개인" value={u.referrerName} /> : null}
    </View>
  );
  const edit = (
    <View style={{ gap: 10 }}>
      <Chips options={REFERRAL_PATHS.map((v) => ({ v, label: v }))} value={path} onChange={setPath} />
      {path === '지인 소개' && <TextInput style={s.input} value={referrer} onChangeText={setReferrer} placeholder="소개인 이름" />}
      {path === '기타' && <TextInput style={s.input} value={other} onChangeText={setOther} placeholder="어떤 경로인지" />}
    </View>
  );
  return <EditableSection title="가입 경로" view={view} edit={edit}
    onStartEdit={() => {
      const rp: string = u.referralPath || '';
      if (rp.startsWith('기타: ')) { setPath('기타'); setOther(rp.substring(4).trim()); } else { setPath(rp); setOther(''); }
      setReferrer(u.referrerName || '');
    }}
    onSave={async () => {
      await save({ referralPath: path === '기타' && other.trim() ? `기타: ${other.trim()}` : path, referrerName: path === '지인 소개' ? referrer.trim() : '' });
    }} />;
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3.84, elevation: 5,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 17, fontWeight: '600', color: '#1e293b' },
  body: { padding: 16 },
  btnOutline: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  btnOutlineText: { fontSize: 13, fontWeight: '600', color: '#334155' },
  btnPrimary: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#2563eb' },
  btnPrimaryText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  info: { width: '50%', paddingRight: 8 },
  infoLabel: { fontSize: 12, color: '#64748b', marginBottom: 3 },
  infoValue: { fontSize: 15, color: '#1e293b', fontWeight: '500' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#334155' },
  input: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', backgroundColor: '#fff' },
  multi: { minHeight: 110, textAlignVertical: 'top' },
  error: { fontSize: 12, color: '#dc2626' },
  help: { fontSize: 12, color: '#6b7280', lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  notice: { backgroundColor: '#eff6ff', borderRadius: 10, borderWidth: 1, borderColor: '#dbeafe', padding: 10, gap: 2 },
  noticeText: { fontSize: 12, color: '#1e3a8a', lineHeight: 18 },
  warnBadge: { backgroundColor: '#fef3c7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  warnBadgeText: { fontSize: 11, fontWeight: '700', color: '#92400e' },
  avatar: { width: 72, height: 72, borderRadius: 14 },
  avatarOverlay: { position: 'absolute', top: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  camera: { position: 'absolute', right: -6, bottom: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  job: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 12 },
  addBtn: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
});
