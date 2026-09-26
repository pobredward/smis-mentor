/**
 * 캠프 참가 정보 서버 로직 (Admin SDK 전용)
 * 저장 위치: users/{uid}/private/campProfile (규칙: 본인·관리자 읽기, 클라이언트 쓰기 불가)
 *           주민번호 뒷자리는 기존대로 users/{uid}.rrnLastEncrypted
 */
import { getAdminFirestore, adminFieldValue } from '@/lib/firebase-admin';
import { encryptRRN, decryptRRN } from '@/lib/encryption';
import {
  campProfileTierOf,
  missingCampProfileFields,
  normalizeCampProfileInput,
  validateCampProfileInput,
  maskAccountNumber,
  normalizeIntlBank,
  validateIntlBank,
  requiredCampProfileFields,
  PASSPORT_PENDING_NUMBER,
  type CampProfileDoc,
  type CampProfileInput,
  type CampProfileStatus,
  type CampProfileTier,
} from '@smis-mentor/shared';

/** 캠프 참가 정보 입력 대상 역할 — 멘토·원어민 (관리자 제외) */
export const CAMP_PROFILE_ROLES = ['mentor', 'foreign'];
export const audienceOf = (role: unknown): 'mentor' | 'foreign' => (role === 'foreign' ? 'foreign' : 'mentor');

export const privateRef = (uid: string) =>
  getAdminFirestore().collection('users').doc(uid).collection('private').doc('campProfile');

/**
 * 캠프 코드 판정
 * - active: 진행 중·예정 캠프 코드 (종료일이 오늘 이후인 jobCode) — 있으면 필수 입력 대상
 * - latest: 진행 예정 캠프가 없을 때 가장 최근에 끝난 캠프 코드 1개 — 마이페이지에서 입력·수정만 가능
 */
export async function campCodesOf(jobCodeIds: string[]): Promise<{ active: string[]; latest: string[] }> {
  if (!jobCodeIds.length) return { active: [], latest: [] };
  const db = getAdminFirestore();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const snaps = await Promise.all(jobCodeIds.slice(0, 30).map((id) => db.collection('jobCodes').doc(id).get()));
  const rows = snaps
    .filter((s) => s.exists)
    .map((s) => ({ code: String(s.data()?.code ?? ''), end: s.data()?.endDate?.toDate?.() as Date | undefined }))
    .filter((r) => r.code);
  const active = rows.filter((r) => !r.end || r.end >= today).map((r) => r.code);
  if (active.length) return { active, latest: [] };
  const last = rows.sort((a, b) => (b.end?.getTime() ?? 0) - (a.end?.getTime() ?? 0))[0];
  return { active: [], latest: last ? [last.code] : [] };
}

/** 진행 중·예정 캠프 코드 (종료일이 오늘 이후인 jobCode) */
export async function activeCampCodesOf(jobCodeIds: string[]): Promise<string[]> {
  return (await campCodesOf(jobCodeIds)).active;
}

export async function getCampProfileStatus(uid: string): Promise<CampProfileStatus & { applies: boolean }> {
  const db = getAdminFirestore();
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.data() ?? {};
  const applies = CAMP_PROFILE_ROLES.includes(String(user.role)) && user.status === 'active';
  const ids: string[] = Array.isArray(user.jobCodeIds)
    ? user.jobCodeIds
    : Array.isArray(user.jobExperiences) ? user.jobExperiences.map((e: any) => e?.id).filter(Boolean) : [];
  const codes = applies ? await campCodesOf(ids) : { active: [], latest: [] };
  const active = codes.active.length > 0;
  const campCodes = active ? codes.active : codes.latest;
  const tier = applies ? campProfileTierOf(campCodes) : null;
  const doc = ((await privateRef(uid).get()).data() ?? {}) as CampProfileDoc;
  const hasRrnLast = !!user.rrnLastEncrypted || (typeof user.rrnLast === 'string' && user.rrnLast.length === 7);
  const { accountNumberEncrypted: _omit, ibanEncrypted: _omit2, ...profile } = doc;
  const audience = audienceOf(user.role);
  return {
    applies,
    audience,
    tier,
    campCodes,
    active,
    required: requiredCampProfileFields(tier, audience, campCodes),
    missing: missingCampProfileFields(tier, doc, hasRrnLast, audience, campCodes),
    profile: { ...profile, hasRrnLast },
  };
}

export class CampProfileError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

/**
 * 저장 — 보낸 항목만 갱신 (마이페이지 수정은 일부만 보낼 수 있음)
 * requireTier 가 주어지면 그 범위의 미입력 항목이 남지 않아야 한다 (필수 입력 화면)
 */
export async function saveCampProfile(uid: string, raw: CampProfileInput, opts: { requireComplete?: boolean } = {}) {
  const input = normalizeCampProfileInput(raw);
  // 빈 문자열은 "보내지 않음" 으로 취급
  const provided = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== '')) as CampProfileInput;
  const existing = ((await privateRef(uid).get()).data() ?? {}) as CampProfileDoc;
  const userRole = (await getAdminFirestore().collection('users').doc(uid).get()).data()?.role;
  const isForeign = audienceOf(userRole) === 'foreign';
  // 원어민 계좌: 국가별 필드. 계좌번호를 새로 안 보냈으면 저장된 값이 있는 것으로 검증 (주소만 고치는 경우 등)
  const intl = isForeign && raw.intlBank ? normalizeIntlBank(raw.intlBank) : undefined;
  if (intl) provided.intlBank = intl;
  // 주민번호 뒷자리는 캠프 참가 정보에서 받지 않는다 (마이페이지 '주민등록번호' 섹션 → /api/user/save-sensitive)
  delete provided.rrnLast;
  delete provided.nationality; // 국적은 users.nationality (기본 정보)
  if (isForeign) { delete provided.englishNickname; } else { delete provided.visaType; }
  const errors = validateCampProfileInput({ ...provided, intlBank: undefined });
  if (intl) {
    const accountForCheck = provided.accountNumber || (existing.accountNumberEncrypted ? '__stored__' : undefined);
    const ibanForCheck = intl.iban || (existing.ibanEncrypted ? 'STORED' : undefined);
    const err = validateIntlBank({ ...intl, iban: ibanForCheck }, accountForCheck, !intl.iban && !!existing.ibanEncrypted);
    if (err) (errors as Record<string, string>).bankAccount = err;
  }
  if (Object.keys(errors).length > 0) throw new CampProfileError(400, '입력값을 확인해주세요.', errors as Record<string, string>);

  const db = getAdminFirestore();
  const userRef = db.collection('users').doc(uid);
  const update: Record<string, unknown> = { updatedAt: adminFieldValue.serverTimestamp() };
  if (provided.englishNickname) update.englishNickname = provided.englishNickname;
  if (intl) {
    const { iban, ...rest } = intl;
    const stored: Record<string, unknown> = { ...rest };
    if (iban) {
      update.ibanEncrypted = encryptRRN(iban);
      stored.iban = `${iban.slice(0, 4)}${'*'.repeat(Math.max(iban.length - 8, 4))}${iban.slice(-4)}`;
    } else if (existing.intlBank?.iban) {
      stored.iban = existing.intlBank.iban;
    }
    update.intlBank = Object.fromEntries(Object.entries(stored).filter(([, v]) => v !== undefined && v !== ''));
    update.bankName = intl.bankName;
    update.accountHolder = intl.holderName;
    if (provided.accountNumber) {
      const acct = String(raw.accountNumber ?? '').trim().replace(/\s/g, '');
      update.accountNumberEncrypted = encryptRRN(acct);
      update.accountNumberMasked = acct.length > 6 ? `${acct.slice(0, 3)}${'*'.repeat(acct.length - 6)}${acct.slice(-3)}` : '*'.repeat(acct.length);
    }
  } else if (provided.bankName && provided.accountHolder && provided.accountNumber) {
    update.bankName = provided.bankName;
    update.accountHolder = provided.accountHolder;
    update.accountNumberEncrypted = encryptRRN(provided.accountNumber);
    update.accountNumberMasked = maskAccountNumber(provided.accountNumber);
  }
  if (provided.passportName) update.passportName = provided.passportName;
  if (provided.passportNumber) {
    update.passportNumber = provided.passportNumber;
    update.passportPending = provided.passportNumber === PASSPORT_PENDING_NUMBER;
  }
  if (provided.passportExpiry) update.passportExpiry = provided.passportExpiry;
  if (provided.shirtSize) update.shirtSize = provided.shirtSize;
  if (provided.phoneModel) update.phoneModel = provided.phoneModel;
  if (provided.visaType) update.visaType = provided.visaType;

  const status = await getCampProfileStatus(uid);
  if (status.tier) update.tier = status.tier as CampProfileTier;
  await privateRef(uid).set(update, { merge: true });

  const userUpdate: Record<string, unknown> = {};
  if (provided.rrnLast) {
    userUpdate.rrnLastEncrypted = encryptRRN(provided.rrnLast);
    userUpdate.rrnLast = adminFieldValue.delete();
  }
  // 명찰용 영어 닉네임은 캠프 화면(명단·숙소 등)에서도 쓰므로 users 문서에도 공개 필드로 둔다
  if (provided.englishNickname) userUpdate.englishNickname = provided.englishNickname;
  if (Object.keys(userUpdate).length > 0) {
    userUpdate.updatedAt = adminFieldValue.serverTimestamp();
    await userRef.update(userUpdate);
  }

  const after = await getCampProfileStatus(uid);
  if (opts.requireComplete && after.missing.length > 0) {
    throw new CampProfileError(400, '필수 항목을 모두 입력해주세요.', Object.fromEntries(after.missing.map((f) => [f, '필수 입력 항목입니다.'])));
  }
  return after;
}

/** 관리자용 원본 조회 (감사 로그는 호출부에서) */
export async function revealCampProfile(uid: string): Promise<{ rrnLast: string | null; accountNumber: string | null; iban: string | null }> {
  const db = getAdminFirestore();
  const [userSnap, privSnap] = await Promise.all([db.collection('users').doc(uid).get(), privateRef(uid).get()]);
  const u = userSnap.data() ?? {};
  const p = (privSnap.data() ?? {}) as CampProfileDoc;
  let rrnLast: string | null = null;
  if (u.rrnLastEncrypted) { try { rrnLast = decryptRRN(u.rrnLastEncrypted); } catch { rrnLast = null; } }
  else if (typeof u.rrnLast === 'string' && u.rrnLast.length === 7) rrnLast = u.rrnLast;
  let accountNumber: string | null = null;
  if (p.accountNumberEncrypted) { try { accountNumber = decryptRRN(p.accountNumberEncrypted); } catch { accountNumber = null; } }
  let iban: string | null = null;
  if (p.ibanEncrypted) { try { iban = decryptRRN(p.ibanEncrypted); } catch { iban = null; } }
  return { rrnLast, accountNumber, iban };
}
