/**
 * 가입 완료 서버 로직 (Admin SDK 전용) — /api/auth/complete-signup
 *
 * 한 번의 트랜잭션으로:
 *  1) users/{uid} 생성 (허용 필드만, 권한 필드는 서버가 결정)
 *  2) 관리자가 미리 만든 temp 계정이 있으면 캠프 배정 등을 이어받고 temp 문서 삭제
 * 트랜잭션 뒤: 같은 이메일의 탈퇴(inactive) 문서 이메일 정리.
 * 실패하면(요청 시) 방금 만든 Auth 계정을 지워 "Auth 만 있고 문서는 없는" 반쪽 계정을 남기지 않는다.
 */
import { getAdminAuth, getAdminFirestore, adminFieldValue } from '@/lib/firebase-admin';
import { sendVerificationEmail } from '@/lib/emailVerification';
import { Timestamp } from 'firebase-admin/firestore';
import {
  CONSENT_VERSION,
  normalizeNameForMatch,
  normalizePhoneForMatch,
  phoneQueryVariants,
  logger,
  type CompleteSignupInput,
  type CompleteSignupResult,
  type SignupProviderId,
} from '@smis-mentor/shared';

export class SignupError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const PROVIDERS: SignupProviderId[] = ['password', 'google.com', 'apple.com', 'naver', 'kakao'];
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const isHttps = (v: unknown) => typeof v === 'string' && /^https:\/\/\S+$/.test(v) && v.length < 2000;

/** 입력 검증·정리 — 허용한 필드만 남긴다 */
function sanitizeProfile(input: CompleteSignupInput) {
  const p = (input?.profile ?? {}) as Record<string, any>;
  const kind: 'mentor' | 'foreign' = input?.kind === 'foreign' ? 'foreign' : 'mentor';
  const name = str(p.name, 50);
  const phoneNumber = str(p.phoneNumber, 30);
  if (!name || name.length < 2) throw new SignupError(400, 'INVALID_NAME', kind === 'foreign' ? 'Please check your name.' : '이름을 확인해주세요.');
  if (!phoneNumber || normalizePhoneForMatch(phoneNumber).length < 8) throw new SignupError(400, 'INVALID_PHONE', kind === 'foreign' ? 'Please check your phone number.' : '전화번호를 확인해주세요.');

  const out: Record<string, unknown> = { name, phoneNumber, phone: phoneNumber };
  const put = (k: string, v: unknown) => { if (v !== undefined && v !== null && v !== '') out[k] = v; };
  put('address', str(p.address, 300));
  put('addressDetail', str(p.addressDetail, 200));
  if (p.gender === 'M' || p.gender === 'F') out.gender = p.gender;
  if (typeof p.age === 'number' && p.age >= 0 && p.age < 120) out.age = Math.floor(p.age);
  put('referralPath', str(p.referralPath, 100));
  put('referrerName', str(p.referrerName, 50));
  put('otherReferralDetail', str(p.otherReferralDetail, 200));
  out.agreedPersonal = p.agreedPersonal !== false;
  if (isHttps(p.profileImage)) out.profileImage = p.profileImage;
  if (p.geocode && typeof p.geocode.lat === 'number' && typeof p.geocode.lng === 'number'
    && Math.abs(p.geocode.lat) <= 90 && Math.abs(p.geocode.lng) <= 180) {
    out.geocode = { lat: p.geocode.lat, lng: p.geocode.lng, updatedAt: Timestamp.now() };
  }

  if (kind === 'mentor') {
    const rrnFront = str(p.rrnFront, 6);
    if (rrnFront && /^\d{6}$/.test(rrnFront)) out.rrnFront = rrnFront;
    const g = str(p.rrnGenderDigit, 1);
    if (g && /^[0-9]$/.test(g)) out.rrnGenderDigit = g;
    if (out.age === undefined && out.rrnFront && out.rrnGenderDigit) {
      const d = String(out.rrnGenderDigit);
      const century = ['1', '2', '5', '6'].includes(d) ? 1900 : ['3', '4', '7', '8'].includes(d) ? 2000 : 1800;
      const yy = century + Number(String(out.rrnFront).slice(0, 2));
      const mm = Number(String(out.rrnFront).slice(2, 4)) - 1;
      const dd = Number(String(out.rrnFront).slice(4, 6));
      const today = new Date();
      let age = today.getFullYear() - yy;
      if (today.getMonth() < mm || (today.getMonth() === mm && today.getDate() < dd)) age -= 1;
      if (age >= 0 && age < 120) out.age = age;
    }
    if (!out.gender && out.rrnGenderDigit) out.gender = Number(out.rrnGenderDigit) % 2 === 1 ? 'M' : 'F';
    put('university', str(p.university, 100));
    if (typeof p.grade === 'number' && p.grade >= 1 && p.grade <= 6) out.grade = p.grade;
    if (typeof p.isOnLeave === 'boolean' || p.isOnLeave === null) out.isOnLeave = p.isOnLeave;
    put('major1', str(p.major1, 100));
    out.major2 = str(p.major2, 100) ?? '';
  } else {
    const ft = (p.foreignTeacher ?? {}) as Record<string, unknown>;
    const firstName = str(ft.firstName, 50);
    const lastName = str(ft.lastName, 50);
    if (!firstName || !lastName) throw new SignupError(400, 'INVALID_NAME', 'Please enter your first and last name.');
    out.foreignTeacher = { firstName, lastName, middleName: str(ft.middleName, 50) ?? '', countryCode: str(ft.countryCode, 8) ?? '' };
    const dob = str(p.dateOfBirth, 10);
    if (dob && /^\d{4}-\d{2}-\d{2}$/.test(dob)) out.dateOfBirth = dob;
  }
  return { kind, profile: out };
}

type TempDoc = { id: string; data: Record<string, any> };

/** 관리자가 미리 만든 temp 계정 찾기 — 전화번호 + (이름 또는 원어민 이름/이메일) 일치 */
async function findTempAccount(kind: 'mentor' | 'foreign', profile: Record<string, any>, email: string, hint?: string): Promise<TempDoc | null> {
  const db = getAdminFirestore();
  const snap = await db.collection('users').where('phoneNumber', 'in', phoneQueryVariants(profile.phoneNumber)).get();
  const want = normalizePhoneForMatch(profile.phoneNumber);
  const roles = kind === 'foreign' ? ['foreign_temp'] : ['mentor_temp', 'admin'];
  const ft = profile.foreignTeacher as { firstName?: string; lastName?: string } | undefined;
  const matches = snap.docs
    .map((d) => ({ id: d.id, data: d.data() as Record<string, any> }))
    .filter(({ data }) => data.status === 'temp' && roles.includes(String(data.role)) && normalizePhoneForMatch(data.phoneNumber) === want)
    .filter(({ data }) => {
      if (kind === 'mentor') return normalizeNameForMatch(data.name) === normalizeNameForMatch(profile.name);
      const byName = !!ft && (
        (normalizeNameForMatch(data.foreignTeacher?.firstName) === normalizeNameForMatch(ft.firstName)
          && normalizeNameForMatch(data.foreignTeacher?.lastName) === normalizeNameForMatch(ft.lastName))
        || normalizeNameForMatch(data.name) === normalizeNameForMatch(`${ft.firstName}${ft.lastName}`)
        || normalizeNameForMatch(data.name) === normalizeNameForMatch(profile.name));
      const byEmail = !!data.email && String(data.email).toLowerCase() === email;
      return byName || byEmail;
    });
  if (!matches.length) {
    if (hint) logger.warn('⚠️ temp 계정 힌트가 전화번호·이름과 맞지 않아 무시:', { hint });
    return null;
  }
  return matches.find((m) => m.id === hint) ?? matches[0];
}

/** 같은 전화번호로 이미 가입된(active) 다른 계정이 있는가 */
async function phoneInUse(phoneNumber: string, uid: string): Promise<boolean> {
  const snap = await getAdminFirestore().collection('users').where('phoneNumber', 'in', phoneQueryVariants(phoneNumber)).get();
  const want = normalizePhoneForMatch(phoneNumber);
  return snap.docs.some((d) => d.id !== uid && d.data().status === 'active' && normalizePhoneForMatch(d.data().phoneNumber) === want);
}

async function rollbackAuth(uid: string) {
  try {
    const auth = getAdminAuth();
    const u = await auth.getUser(uid);
    const created = Date.parse(u.metadata.creationTime);
    // 방금(30분 안) 만든 계정만 지운다 — 오래된 계정을 실수로 지우지 않게
    if (Date.now() - created < 30 * 60 * 1000) {
      const doc = await getAdminFirestore().collection('users').doc(uid).get();
      if (!doc.exists) {
        await auth.deleteUser(uid);
        logger.info('↩️ 가입 실패 — 방금 만든 Auth 계정 삭제:', uid);
      }
    }
  } catch (e) {
    logger.warn('⚠️ Auth 계정 롤백 실패:', (e as Error)?.message);
  }
}

export async function completeSignup(uid: string, tokenEmail: string | undefined, input: CompleteSignupInput, idToken?: string): Promise<CompleteSignupResult> {
  const db = getAdminFirestore();
  const userRef = db.collection('users').doc(uid);

  // 재시도: 이미 문서가 있으면 그대로 돌려준다
  const existing = await userRef.get();
  if (existing.exists) {
    const d = existing.data() ?? {};
    return { userId: uid, role: String(d.role ?? ''), claimedTemp: false, already: true };
  }

  try {
    const { kind, profile } = sanitizeProfile(input);
    const authUser = await getAdminAuth().getUser(uid);
    let email = String(authUser.email || tokenEmail || '').toLowerCase();
    if (!email) throw new SignupError(400, 'NO_EMAIL', kind === 'foreign' ? 'No email address on this account.' : '이메일 정보가 없습니다.');

    const temp = await findTempAccount(kind, profile, email, str(input.tempUserId, 128));
    if (!temp && kind === 'mentor' && await phoneInUse(String(profile.phoneNumber), uid)) {
      throw new SignupError(409, 'PHONE_IN_USE', '이 전화번호는 이미 가입되어 있습니다.');
    }
    // Apple 비공개 릴레이 이메일이면 temp 계정의 실제 이메일을 쓴다
    if (temp?.data.email && email.endsWith('@privaterelay.appleid.com') && !String(temp.data.email).endsWith('@privaterelay.appleid.com')) {
      email = String(temp.data.email).toLowerCase();
    }

    const t = temp?.data ?? {};
    const role = temp
      ? (t.role === 'foreign_temp' ? 'foreign' : t.role === 'admin' ? 'admin' : 'mentor')
      : (kind === 'foreign' ? 'foreign' : 'mentor_temp'); // 신규 멘토는 관리자 검토 후 mentor 로 승격
    const providerId = PROVIDERS.includes(input?.provider?.providerId) ? input.provider.providerId : 'password';
    const now = Timestamp.now();
    const jobExperiences = Array.isArray(t.jobExperiences) ? t.jobExperiences : [];

    const doc: Record<string, unknown> = {
      // 기본값
      address: '', addressDetail: '', profileImage: '', selfIntroduction: '', jobMotivation: kind === 'foreign' ? 'Foreign Teacher Application' : '',
      feedback: '', partTimeJobs: [],
      // 이메일 인증: 비밀번호 가입만 필요 (구글·애플·네이버·카카오는 제공자가 확인한 이메일)
      isEmailVerified: authUser.emailVerified || providerId !== 'password', isPhoneVerified: kind === 'mentor', isProfileCompleted: false,
      isTermsAgreed: true, isPersonalAgreed: true, isAddressVerified: kind === 'mentor', isProfileImageUploaded: false,
      // temp 계정에서 이어받는 값 (관리자가 넣어 둔 것)
      ...(temp && {
        selfIntroduction: t.selfIntroduction || '', jobMotivation: t.jobMotivation || (kind === 'foreign' ? 'Foreign Teacher Application' : ''),
        feedback: t.feedback || '', partTimeJobs: Array.isArray(t.partTimeJobs) ? t.partTimeJobs : [],
        ...(t.profileImage && { profileImage: t.profileImage }),
        ...(!profile.address && t.address && { address: t.address, addressDetail: t.addressDetail || '' }),
      }),
      // 사용자 입력 (허용 필드만)
      ...profile,
      // 원어민 서류 링크는 temp 에서 유지
      ...(kind === 'foreign' && {
        foreignTeacher: {
          cvUrl: t.foreignTeacher?.cvUrl || '', passportPhotoUrl: t.foreignTeacher?.passportPhotoUrl || '',
          foreignIdCardUrl: t.foreignTeacher?.foreignIdCardUrl || '', bankBookUrl: t.foreignTeacher?.bankBookUrl || '',
          eslCertUrl: t.foreignTeacher?.eslCertUrl || '',
          ...(profile.foreignTeacher as object),
          applicationDate: t.foreignTeacher?.applicationDate || now,
        },
      }),
      ...(!profile.profileImage && isHttps(input?.provider?.photoURL) && !(temp && t.profileImage) && { profileImage: input.provider.photoURL }),
      // 서버가 정하는 값
      userId: uid,
      id: uid,
      email,
      role,
      status: 'active',
      jobExperiences,
      jobCodeIds: jobExperiences.map((e: { id?: string }) => e?.id).filter(Boolean),
      agreedTerms: true,
      consentVersion: CONSENT_VERSION,
      consentedAt: now,
      authProviders: [{
        providerId,
        uid: str(input?.provider?.providerUid, 128) || uid,
        email,
        linkedAt: now,
        ...(str(input?.provider?.displayName, 100) && { displayName: str(input.provider.displayName, 100) }),
        ...(isHttps(input?.provider?.photoURL) && { photoURL: input.provider.photoURL }),
      }],
      primaryAuthMethod: providerId === 'password' ? 'password' : 'social',
      lastLoginAt: now,
      createdAt: temp?.data.createdAt || now,
      updatedAt: now,
    };

    await db.runTransaction(async (tx) => {
      if (temp) {
        const tempSnap = await tx.get(db.collection('users').doc(temp.id));
        if (!tempSnap.exists || tempSnap.data()?.status !== 'temp') {
          throw new SignupError(409, 'TEMP_TAKEN', kind === 'foreign' ? 'This pre-registered account was just activated by another sign-up. Please try again.' : '이미 다른 계정으로 활성화된 임시 계정입니다. 잠시 후 다시 시도해주세요.');
        }
      }
      tx.create(userRef, doc);
      if (temp && temp.id !== uid) tx.delete(db.collection('users').doc(temp.id));
    });

    // 같은 이메일의 탈퇴 계정 문서가 남아 있으면 이메일을 비켜 준다 (로그인 조회 충돌 방지)
    try {
      const olds = await db.collection('users').where('email', '==', email).get();
      await Promise.all(olds.docs
        .filter((d) => d.id !== uid && ['inactive', 'deleted'].includes(String(d.data().status)))
        .map((d) => d.ref.update({ email: `rejoined_${Date.now()}_${email}`, updatedAt: adminFieldValue.serverTimestamp() })));
    } catch (e) {
      logger.warn('⚠️ 탈퇴 계정 이메일 정리 실패 (가입은 완료):', (e as Error)?.message);
    }

    // 소셜 가입인데 Auth 에 인증 표시가 없으면 맞춰 둔다
    if (providerId !== 'password' && !authUser.emailVerified) {
      await getAdminAuth().updateUser(uid, { emailVerified: true }).catch(() => undefined);
    }
    // 비밀번호 가입: 인증 메일 발송 (인증 전에는 앱이 인증 안내 화면만 보여 주고, 서버 API 도 막힌다)
    let verificationSent = false;
    if (providerId === 'password' && !authUser.emailVerified && idToken) {
      verificationSent = await sendVerificationEmail(idToken, kind === 'foreign' ? 'en' : 'ko');
    }

    logger.info('✅ 가입 완료:', { uid, role, claimedTemp: !!temp, tempId: temp?.id, verificationSent });
    return { userId: uid, role, claimedTemp: !!temp, needsEmailVerification: providerId === 'password' && !authUser.emailVerified, verificationSent };
  } catch (e) {
    if (input?.rollbackAuthOnFailure) await rollbackAuth(uid);
    throw e;
  }
}
