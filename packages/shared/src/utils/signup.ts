/**
 * 가입 완료 (web / mobile 공용 입력 형태)
 *
 * 클라이언트는 Firebase Auth 계정만 만들고, users 문서 생성·temp 계정 이관·탈퇴 계정 이메일 정리는
 * 서버(/api/auth/complete-signup)가 Admin SDK 트랜잭션으로 한 번에 처리한다.
 * role·status·jobExperiences·jobCodeIds 같은 권한 필드는 서버가 정하며, 클라이언트가 보내도 무시한다.
 */

export type SignupKind = 'mentor' | 'foreign';
export type SignupProviderId = 'password' | 'google.com' | 'apple.com' | 'naver' | 'kakao';

export interface CompleteSignupProfile {
  name: string;
  phoneNumber: string;
  address?: string;
  addressDetail?: string;
  gender?: 'M' | 'F';
  age?: number;
  /** 멘토: 주민번호 앞 6자리 + 뒷자리 첫 숫자 (뒷자리 전체는 마이페이지에서 서버 암호화 저장) */
  rrnFront?: string;
  rrnGenderDigit?: string;
  referralPath?: string;
  referrerName?: string;
  otherReferralDetail?: string;
  agreedPersonal?: boolean;
  university?: string;
  grade?: number;
  isOnLeave?: boolean | null;
  major1?: string;
  major2?: string;
  /** 원어민 */
  dateOfBirth?: string;
  foreignTeacher?: { firstName: string; lastName: string; middleName?: string; countryCode?: string };
  geocode?: { lat: number; lng: number };
  profileImage?: string;
}

export interface CompleteSignupInput {
  kind: SignupKind;
  profile: CompleteSignupProfile;
  provider: { providerId: SignupProviderId; providerUid?: string; displayName?: string; photoURL?: string };
  /** 화면에서 찾은 temp 계정 (힌트일 뿐 — 서버가 전화번호·이름으로 다시 확인) */
  tempUserId?: string;
  /** 비밀번호 가입 등 방금 만든 Auth 계정이면 true — 실패 시 서버가 Auth 계정을 지워 반쪽 계정이 남지 않게 한다 */
  rollbackAuthOnFailure?: boolean;
}

export interface CompleteSignupResult {
  userId: string;
  role: string;
  /** temp 계정(관리자가 미리 만든 계정)을 이어받았는지 */
  claimedTemp: boolean;
  /** 이미 가입 완료된 상태였는지 (재시도) */
  already?: boolean;
  /** 비밀번호 가입 — 이메일 인증 전까지 앱 사용 불가 */
  needsEmailVerification?: boolean;
  verificationSent?: boolean;
}

/** 전화번호 비교용 — 숫자만, +82 / 82 로 시작하면 0 으로 */
export function normalizePhoneForMatch(raw: string | null | undefined): string {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('82') && d.length >= 11) d = '0' + d.slice(2);
  return d;
}

/** 저장된 전화번호가 여러 형식일 수 있어 조회용 후보를 만든다 (Firestore in 쿼리 최대 10개) */
export function phoneQueryVariants(raw: string | null | undefined): string[] {
  const s = String(raw ?? '').trim();
  const digits = s.replace(/\D/g, '');
  const local = normalizePhoneForMatch(s);
  const out = new Set<string>([s, digits, local]);
  if (local.startsWith('0') && local.length >= 10) {
    const rest = local.slice(1);
    out.add(`+82${rest}`);
    out.add(`82${rest}`);
    if (local.length === 11) out.add(`${local.slice(0, 3)}-${local.slice(3, 7)}-${local.slice(7)}`);
  }
  if (digits && !s.startsWith('+')) out.add(`+${digits}`);
  return [...out].filter(Boolean).slice(0, 10);
}

/** 이름 비교용 — 공백 제거·소문자 */
export const normalizeNameForMatch = (v: string | null | undefined) => String(v ?? '').replace(/\s+/g, '').toLowerCase();
