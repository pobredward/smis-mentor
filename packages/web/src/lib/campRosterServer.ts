/**
 * 관리자 캠프 인원 표 (/admin/user-check) — 행 만들기 + 셀 단위 수정 (Admin SDK 전용)
 * 셀 하나를 고치면 그 값이 실제로 저장되는 곳(users 문서 / 캠프 참가 정보 / 캠프 배정 / 암호화 필드)으로 보낸다.
 */
import { getAdminAuth, getAdminFirestore, adminFieldValue } from '@/lib/firebase-admin';
import { encryptRRN } from '@/lib/encryption';
import { privateRef, revealCampProfile, audienceOf } from '@/lib/campProfileServer';
import {
  BANK_COUNTRIES,
  ENGLISH_NICKNAME_RE,
  SHIRT_SIZES,
  bankCountryDef,
  maskAccountNumber,
  missingCampProfileFields,
  type CampProfileDoc,
  type CampProfileTier,
} from '@smis-mentor/shared';

export class RosterEditError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Snap = FirebaseFirestore.DocumentSnapshot;

export async function buildRosterRow(d: Snap, jobCodeId: string, code: string, tier: CampProfileTier | null, reveal: boolean) {
  const u = (d.data() ?? {}) as Record<string, any>;
  const p = ((await privateRef(d.id).get()).data() ?? {}) as CampProfileDoc;
  const hasRrnLast = !!u.rrnLastEncrypted || (typeof u.rrnLast === 'string' && u.rrnLast.length === 7);
  const secrets = reveal ? await revealCampProfile(d.id) : null;
  const exp = (u.jobExperiences ?? []).find((e: any) => e?.id === jobCodeId) ?? {};
  const ib = p.intlBank;
  const audience = audienceOf(u.role);
  return {
    userId: d.id,
    role: audience === 'foreign' ? '원어민' : '멘토',
    name: u.name ?? '',
    phoneNumber: u.phoneNumber ?? '',
    email: u.email ?? '',
    gender: u.gender === 'M' ? '남' : u.gender === 'F' ? '여' : '',
    age: u.age != null ? String(u.age) : '',
    university: u.university ?? '',
    grade: u.grade ? (u.grade === 6 ? '졸업' : `${u.grade}학년`) + (u.isOnLeave ? '(휴학)' : '') : '',
    major: [u.major1, u.major2].filter(Boolean).join(' / '),
    address: [u.address, u.addressDetail].filter(Boolean).join(' '),
    classCode: exp.classCode ?? '',
    group: exp.group ?? '',
    groupRole: exp.groupRole ?? '',
    englishNickname: p.englishNickname ?? u.englishNickname ?? '',
    rrnFront: u.rrnFront ?? '',
    rrnLast: secrets?.rrnLast ?? (hasRrnLast ? '●●●●●●●' : ''),
    bankName: p.bankName ?? '',
    accountHolder: p.accountHolder ?? '',
    accountNumber: secrets?.accountNumber ?? p.accountNumberMasked ?? '',
    passportName: p.passportName ?? '',
    passportNumber: p.passportNumber ?? '',
    passportExpiry: p.passportExpiry ?? '',
    shirtSize: p.shirtSize ?? '',
    phoneModel: p.phoneModel ?? '',
    bankCountry: ib ? (ib.country === 'OTHER' ? ib.countryName ?? '' : bankCountryDef(ib.country)?.name ?? ib.country) : '',
    swift: ib?.swift ?? '',
    routing: ib?.routing ?? '',
    iban: secrets?.iban ?? ib?.iban ?? '',
    accountType: ib?.accountType ?? '',
    bankAddress: ib?.bankAddress ?? '',
    recipientAddress: ib?.recipientAddress ?? '',
    recipientPhone: ib?.recipientPhone ?? '',
    bankNotes: ib?.notes ?? '',
    nationality: u.nationality ?? (p as any).nationality ?? '',
    visaType: p.visaType ?? '',
    missing: missingCampProfileFields(tier, p, hasRrnLast, audience, [code]),
  };
}

/** 표에서 고칠 수 있는 열 (나이·학년·구분·미입력은 계산값이라 제외) */
export const EDITABLE_ROSTER_FIELDS = [
  'name', 'phoneNumber', 'email', 'gender', 'university', 'major', 'address', 'classCode', 'group', 'groupRole',
  'englishNickname', 'rrnFront', 'rrnLast', 'bankName', 'accountHolder', 'accountNumber',
  'bankCountry', 'swift', 'routing', 'iban', 'accountType', 'recipientAddress', 'recipientPhone', 'bankAddress', 'bankNotes',
  'passportName', 'passportNumber', 'passportExpiry', 'shirtSize', 'phoneModel', 'nationality', 'visaType',
] as const;
export const SENSITIVE_ROSTER_FIELDS = new Set(['rrnFront', 'rrnLast', 'accountNumber', 'iban']);

const INTL_KEYS: Record<string, string> = {
  swift: 'swift', routing: 'routing', accountType: 'accountType', recipientAddress: 'recipientAddress',
  recipientPhone: 'recipientPhone', bankAddress: 'bankAddress', bankNotes: 'notes',
};

/** 셀 하나 저장 — 빈 값이면 그 항목을 지운다 */
export async function applyRosterEdit(uid: string, jobCodeId: string, field: string, raw: unknown) {
  if (!(EDITABLE_ROSTER_FIELDS as readonly string[]).includes(field)) throw new RosterEditError(400, '이 칸은 여기서 수정할 수 없습니다.');
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (value.length > 300) throw new RosterEditError(400, '값이 너무 깁니다.');
  const db = getAdminFirestore();
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new RosterEditError(404, '사용자를 찾을 수 없습니다.');
  const u = userSnap.data() as Record<string, any>;
  const priv = privateRef(uid);
  const p = ((await priv.get()).data() ?? {}) as CampProfileDoc;
  const now = adminFieldValue.serverTimestamp();
  const del = adminFieldValue.delete();
  const setUser = (o: Record<string, unknown>) => userRef.update({ ...o, updatedAt: now });
  const setPriv = (o: Record<string, unknown>) => priv.set({ ...o, updatedAt: now }, { merge: true });
  const setIntl = (o: Record<string, unknown>) => setPriv({ intlBank: { ...(p.intlBank ?? {}), ...o } });

  switch (field) {
    case 'name':
      if (value.length < 2 || value.length > 50) throw new RosterEditError(400, '이름은 2~50자로 입력해주세요.');
      return setUser({ name: value });
    case 'phoneNumber':
      if (value && value.replace(/\D/g, '').length < 8) throw new RosterEditError(400, '전화번호를 확인해주세요.');
      return setUser({ phoneNumber: value, phone: value });
    case 'email': {
      const email = value.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RosterEditError(400, '올바른 이메일을 입력해주세요.');
      const dup = await db.collection('users').where('email', '==', email).limit(5).get();
      if (dup.docs.some((d) => d.id !== uid && d.data().status !== 'deleted')) throw new RosterEditError(409, '이미 사용 중인 이메일입니다.');
      try { await getAdminAuth().updateUser(uid, { email }); } catch (e: any) {
        if (e?.code === 'auth/email-already-exists') throw new RosterEditError(409, '이미 사용 중인 이메일입니다.');
        if (e?.code !== 'auth/user-not-found') throw e;
      }
      return setUser({ email });
    }
    case 'gender': {
      const g = /^(남|m|male|남자|남성)$/i.test(value) ? 'M' : /^(여|f|female|여자|여성)$/i.test(value) ? 'F' : '';
      if (!g) throw new RosterEditError(400, '성별은 남 또는 여로 입력해주세요.');
      return setUser({ gender: g });
    }
    case 'university': return setUser({ university: value });
    case 'major': {
      const [m1, m2] = value.split('/').map((s) => s.trim());
      return setUser({ major1: m1 ?? '', major2: m2 ?? '' });
    }
    case 'address': return setUser({ address: value, addressDetail: '' });
    case 'nationality': return setUser({ nationality: value });
    case 'classCode': case 'group': case 'groupRole': {
      const list: any[] = Array.isArray(u.jobExperiences) ? [...u.jobExperiences] : [];
      const i = list.findIndex((e) => e?.id === jobCodeId);
      if (i < 0) throw new RosterEditError(400, '이 캠프 배정 정보가 없습니다.');
      list[i] = { ...list[i], [field]: value || null };
      if (!value) delete list[i][field];
      return setUser({ jobExperiences: list });
    }
    case 'englishNickname':
      if (value && !ENGLISH_NICKNAME_RE.test(value)) throw new RosterEditError(400, '첫 글자 대문자, 띄어쓰기 없이 영문 8자 이내 (예: David)');
      await setUser({ englishNickname: value || del });
      return setPriv({ englishNickname: value || del });
    case 'rrnFront':
      if (value && !/^\d{6}$/.test(value)) throw new RosterEditError(400, '주민번호 앞자리 6자리 숫자로 입력해주세요.');
      return setUser({ rrnFront: value });
    case 'rrnLast': {
      const v = value.replace(/\D/g, '');
      if (value && !/^[1-8]\d{6}$/.test(v)) throw new RosterEditError(400, '주민번호 뒷자리 7자리 숫자로 입력해주세요.');
      return setUser(v ? { rrnLastEncrypted: encryptRRN(v), rrnGenderDigit: v[0], rrnLast: del } : { rrnLastEncrypted: del, rrnLast: del });
    }
    case 'bankName':
      await setPriv({ bankName: value });
      return p.intlBank ? setIntl({ bankName: value }) : undefined;
    case 'accountHolder':
      await setPriv({ accountHolder: value });
      return p.intlBank ? setIntl({ holderName: value }) : undefined;
    case 'accountNumber': {
      const v = value.replace(/\s/g, '');
      if (value && !/^[0-9A-Za-z-]{4,40}$/.test(v)) throw new RosterEditError(400, '계좌번호를 확인해주세요.');
      return setPriv(v ? { accountNumberEncrypted: encryptRRN(v), accountNumberMasked: maskAccountNumber(v.replace(/-/g, '')) } : { accountNumberEncrypted: del, accountNumberMasked: del });
    }
    case 'iban': {
      const v = value.replace(/\s/g, '').toUpperCase();
      if (!v) { await setPriv({ ibanEncrypted: del }); return setIntl({ iban: '' }); }
      if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(v)) throw new RosterEditError(400, 'IBAN 형식을 확인해주세요.');
      await setPriv({ ibanEncrypted: encryptRRN(v) });
      return setIntl({ iban: `${v.slice(0, 4)}${'*'.repeat(Math.max(v.length - 8, 4))}${v.slice(-4)}` });
    }
    case 'bankCountry': {
      const hit = BANK_COUNTRIES.find((c) => c.code.toLowerCase() === value.toLowerCase() || c.name.toLowerCase() === value.toLowerCase() || c.nameKo === value);
      return setIntl(hit ? { country: hit.code } : { country: 'OTHER', countryName: value });
    }
    case 'swift': return setIntl({ swift: value.toUpperCase() });
    case 'routing': case 'accountType': case 'recipientAddress': case 'recipientPhone': case 'bankAddress': case 'bankNotes':
      return setIntl({ [INTL_KEYS[field]]: value });
    case 'passportName': return setPriv({ passportName: value.toUpperCase().replace(/\s+/g, ' ') });
    case 'passportNumber': return setPriv({ passportNumber: value.toUpperCase().replace(/\s+/g, '') });
    case 'passportExpiry': {
      const v = value.replace(/[-/]/g, '.');
      if (value && !/^\d{4}\.\d{2}\.\d{2}$/.test(v)) throw new RosterEditError(400, 'YYYY.MM.DD 형식으로 입력해주세요.');
      return setPriv({ passportExpiry: v });
    }
    case 'shirtSize': {
      const v = value.toUpperCase();
      if (value && !(SHIRT_SIZES as readonly string[]).includes(v)) throw new RosterEditError(400, `사이즈는 ${SHIRT_SIZES.join(', ')} 중 하나입니다.`);
      return setPriv({ shirtSize: v });
    }
    case 'phoneModel': return setPriv({ phoneModel: value });
    case 'visaType': return setPriv({ visaType: value });
  }
}
