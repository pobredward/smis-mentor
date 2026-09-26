/**
 * 캠프 참가 정보 (캠프 코드 배정 후 필수 입력)
 *
 * 결정(2026-09-26):
 *  - 주민번호 뒷자리는 가입 때 받지 않고, 진행 예정 캠프 코드가 생기면 앱 접속 시 필수로 받는다.
 *  - 공통(J·E·S): 영어 닉네임, 주민번호 뒷자리, 계좌번호
 *  - S 코드 추가: 여권상 영문이름, 여권 번호, 여권 만료일자, 단체티 사이즈, 휴대폰 모델명
 *  - S 와 J/E 코드를 함께 가지면 S(범위가 더 넓음) 기준
 *  - 이후 마이페이지에서 수정 가능
 */

export type CampProfileTier = 'S' | 'JE';

export const CAMP_PROFILE_FIELDS = [
  'englishNickname',
  'rrnLast',
  'bankAccount',
  'passportName',
  'passportNumber',
  'passportExpiry',
  'shirtSize',
  'phoneModel',
  'nationality',
  'visaType',
] as const;
export type CampProfileField = (typeof CAMP_PROFILE_FIELDS)[number];

export const CAMP_PROFILE_FIELD_LABELS: Record<CampProfileField, string> = {
  englishNickname: '영어 닉네임',
  rrnLast: '주민등록번호 뒷자리',
  bankAccount: '계좌번호',
  passportName: '여권상 영문이름',
  passportNumber: '여권 번호',
  passportExpiry: '여권 만료일자',
  shirtSize: '단체티 사이즈',
  phoneModel: '휴대폰 모델명',
  nationality: '국적',
  visaType: '비자 종류',
};

/** 원어민 국적 선택지 (그 외는 Other 로 직접 입력) */
export const NATIONALITIES = [
  'United States', 'Canada', 'United Kingdom', 'Ireland', 'Australia', 'New Zealand', 'South Africa',
  'Philippines', 'India', 'Korea (South)', 'Jamaica', 'Trinidad and Tobago', 'Zimbabwe', 'Nigeria', 'Kenya', 'Singapore', 'Malaysia',
] as const;

/** 한국 체류 비자 종류 (J·E 캠프 원어민) */
export const VISA_TYPES = [
  { value: 'E-1', label: 'E-1 (Professor)' },
  { value: 'E-2', label: 'E-2 (Foreign language instructor)' },
  { value: 'F-2', label: 'F-2 (Resident)' },
  { value: 'F-3', label: 'F-3 (Accompanying family)' },
  { value: 'F-4', label: 'F-4 (Overseas Korean)' },
  { value: 'F-5', label: 'F-5 (Permanent resident)' },
  { value: 'F-6', label: 'F-6 (Marriage migrant)' },
  { value: 'H-1', label: 'H-1 (Working holiday)' },
  { value: 'D-2', label: 'D-2 (Student)' },
  { value: 'D-10', label: 'D-10 (Job seeker)' },
  { value: 'E-7', label: 'E-7 (Specially designated activities)' },
  { value: 'Korean citizen', label: 'Korean citizen' },
] as const;

/**
 * 캠프 참가 정보 입력 항목.
 * 주민번호 뒷자리는 여기서 받지 않는다 — 마이페이지 '주민등록번호' 섹션에서 입력 (2026-09-26 결정).
 * 사용 목적 안내는 rrnPurposeLines() 참고.
 */
export const CAMP_PROFILE_FIELDS_BY_TIER: Record<CampProfileTier, CampProfileField[]> = {
  JE: ['englishNickname', 'bankAccount'],
  S: ['englishNickname', 'bankAccount', 'passportName', 'passportNumber', 'passportExpiry', 'shirtSize', 'phoneModel'],
};

/** 캠프 코드별 주민등록번호 뒷자리 사용 목적 (S·J/E 를 함께 가지면 둘 다) */
export const RRN_PURPOSE_BY_TIER: Record<CampProfileTier, string> = {
  JE: '3.3% 원천징수 신고(사업소득 신고)를 위해 필요합니다.',
  S: '항공권 예약 및 해외여행자보험 가입 시 사용합니다.',
};
export function rrnPurposeLines(codes: Array<string | null | undefined>): Array<{ tier: CampProfileTier; codes: string[]; text: string }> {
  const list = codes.filter(Boolean).map((c) => String(c).trim().toUpperCase());
  const s = list.filter((c) => c.startsWith('S'));
  const je = list.filter((c) => c.startsWith('J') || c.startsWith('E'));
  const out: Array<{ tier: CampProfileTier; codes: string[]; text: string }> = [];
  if (je.length) out.push({ tier: 'JE', codes: je, text: RRN_PURPOSE_BY_TIER.JE });
  if (s.length) out.push({ tier: 'S', codes: s, text: RRN_PURPOSE_BY_TIER.S });
  return out;
}

export const SHIRT_SIZES = ['S', 'M', 'L', 'XL', '2XL'] as const;
export type ShirtSize = (typeof SHIRT_SIZES)[number];

// ── 원어민 급여 계좌 (국가별) ─────────────────────────────────────
// 급여는 주로 KB국민은행 앱 해외송금으로 보낸다. KB 안내 기준 받는 분 정보:
//  영문 이름(해외 계좌 명의와 정확히 일치)·주소·전화번호 필수, SWIFT 필수,
//  미국·캐나다·호주는 은행번호(ABA·Transit·BSB) 추가, 유럽 등은 IBAN 필수.
//  국내 계좌(한국)는 은행·계좌번호·예금주만.

export type BankRoutingKind = 'aba' | 'caTransit' | 'bsb' | 'sortCode' | 'ifsc' | 'branchCode' | null;

export interface BankCountryDef {
  code: string;
  name: string;
  nameKo: string;
  domestic?: boolean;
  routing: BankRoutingKind;
  routingRequired?: boolean;
  iban?: 'required' | 'optional';
}

export const BANK_COUNTRIES: BankCountryDef[] = [
  { code: 'KR', name: 'South Korea (Korean bank account)', nameKo: '대한민국 (국내 계좌)', domestic: true, routing: null },
  { code: 'US', name: 'United States', nameKo: '미국', routing: 'aba', routingRequired: true },
  { code: 'CA', name: 'Canada', nameKo: '캐나다', routing: 'caTransit', routingRequired: true },
  { code: 'AU', name: 'Australia', nameKo: '호주', routing: 'bsb', routingRequired: true },
  { code: 'NZ', name: 'New Zealand', nameKo: '뉴질랜드', routing: null },
  { code: 'GB', name: 'United Kingdom', nameKo: '영국', routing: 'sortCode', routingRequired: true, iban: 'optional' },
  { code: 'IE', name: 'Ireland', nameKo: '아일랜드', routing: null, iban: 'required' },
  { code: 'ZA', name: 'South Africa', nameKo: '남아프리카공화국', routing: 'branchCode' },
  { code: 'PH', name: 'Philippines', nameKo: '필리핀', routing: null },
  { code: 'IN', name: 'India', nameKo: '인도', routing: 'ifsc', routingRequired: true },
  { code: 'OTHER', name: 'Other country', nameKo: '기타 국가', routing: null, iban: 'optional' },
];

export const BANK_ROUTING_LABELS: Record<Exclude<BankRoutingKind, null>, { label: string; example: string; re: RegExp; help: string }> = {
  aba: { label: 'ABA Routing Number (Wire)', example: '256074974', re: /^\d{9}$/, help: '9 digits. If your bank shows separate ACH and Wire routing numbers, enter the Wire one.' },
  caTransit: { label: 'Institution No. + Transit No.', example: '003-12345', re: /^(\d{3}[- ]?\d{5}|\d{5}[- ]?\d{3}|0\d{8})$/, help: '3-digit institution number and 5-digit transit (branch) number, in either order (e.g. 003-12345 or 12345-003).' },
  bsb: { label: 'BSB', example: '086-136', re: /^\d{3}-?\d{3}$/, help: '6 digits.' },
  sortCode: { label: 'Sort Code', example: '12-34-56', re: /^\d{2}-?\d{2}-?\d{2}$/, help: '6 digits.' },
  ifsc: { label: 'IFSC', example: 'HDFC0001234', re: /^[A-Z]{4}0[A-Z0-9]{6}$/, help: '11 characters.' },
  branchCode: { label: 'Branch Code (optional)', example: '198765', re: /^\d{6}$/, help: '6-digit universal branch code, if your bank provides one.' },
};

export function bankCountryDef(code?: string | null): BankCountryDef | undefined {
  return BANK_COUNTRIES.find((c) => c.code === code);
}

/** 원어민 계좌 (계좌번호 원문은 accountNumberEncrypted, IBAN 원문은 ibanEncrypted 에 암호화) */
export interface IntlBankInfo {
  country: string;
  countryName?: string;
  holderName: string;
  bankName: string;
  swift?: string;
  routing?: string;
  /** 저장본은 가림본 */
  iban?: string;
  accountType?: 'Checking' | 'Savings' | '';
  bankAddress?: string;
  recipientAddress?: string;
  recipientPhone?: string;
  notes?: string;
}

/** 캠프 코드 중 한국에서 하는 J·E 캠프가 있는가 */
export const hasDomesticCamp = (codes: Array<string | null | undefined> = []) =>
  codes.some((c) => /^[JE]/i.test(String(c ?? '').trim()));

/**
 * 대상별 필수 항목
 * - 원어민: 주민번호·영어 닉네임 제외, J·E 캠프(국내)면 비자 종류 필수 (국적은 기본 정보에서)
 * - campCodes 를 주지 않으면 tier 로 J·E 여부를 판단
 */
export function requiredCampProfileFields(tier: CampProfileTier | null, audience: 'mentor' | 'foreign' = 'mentor', campCodes?: string[]): CampProfileField[] {
  if (!tier) return [];
  const base = CAMP_PROFILE_FIELDS_BY_TIER[tier];
  if (audience !== 'foreign') return base;
  const domestic = campCodes ? hasDomesticCamp(campCodes) : tier === 'JE';
  // 국적은 마이페이지 '기본 정보'에서 입력 (users.nationality) — 여기서는 필수로 두지 않는다
  return [...base.filter((f) => f !== 'rrnLast' && f !== 'englishNickname'), ...(domestic ? ['visaType' as const] : [])];
}

/** 캠프 코드(J29, E29, S29, F28 …) → 필요한 입력 범위 */
export function campProfileTierOf(codes: Array<string | null | undefined>): CampProfileTier | null {
  const letters = codes.filter(Boolean).map((c) => String(c).trim().charAt(0).toUpperCase());
  if (letters.includes('S')) return 'S';
  if (letters.includes('J') || letters.includes('E')) return 'JE';
  return null;
}

/** 캠프 참가 정보 저장 형태 (users/{uid}/private/campProfile) — 민감값은 암호화·가림본만 */
export interface CampProfileDoc {
  englishNickname?: string;
  /** 주민번호 뒷자리는 users.rrnLastEncrypted 에 저장, 여기엔 입력 여부만 */
  hasRrnLast?: boolean;
  bankName?: string;
  accountHolder?: string;
  accountNumberEncrypted?: string;
  accountNumberMasked?: string;
  passportName?: string;
  passportNumber?: string;
  passportExpiry?: string;
  passportPending?: boolean;
  shirtSize?: ShirtSize;
  phoneModel?: string;
  /** 원어민 국적 · 비자 종류(J·E 캠프) */
  nationality?: string;
  visaType?: string;
  /** 원어민 계좌 (국가별 필드) */
  intlBank?: IntlBankInfo;
  ibanEncrypted?: string;
  tier?: CampProfileTier;
  updatedAt?: unknown;
}

/** 클라이언트에 돌려주는 상태 (복호화 값 없음) */
export interface CampProfileStatus {
  tier: CampProfileTier | null;
  /** 원어민은 계좌를 국가별로 받고 주민번호·영어 닉네임은 받지 않는다 */
  audience?: 'mentor' | 'foreign';
  campCodes: string[];
  /** 진행 중·예정 캠프가 있는지 — true 일 때만 필수 입력 화면을 띄운다.
   *  false 면 campCodes 는 가장 최근(종료된) 캠프이고, 마이페이지에서 수정만 가능 */
  active?: boolean;
  required: CampProfileField[];
  missing: CampProfileField[];
  profile: Omit<CampProfileDoc, 'accountNumberEncrypted' | 'ibanEncrypted'>;
}

/** 입력값 (저장 요청) */
export interface CampProfileInput {
  englishNickname?: string;
  rrnLast?: string;
  bankName?: string;
  accountHolder?: string;
  accountNumber?: string;
  passportName?: string;
  passportNumber?: string;
  passportExpiry?: string;
  shirtSize?: string;
  phoneModel?: string;
  nationality?: string;
  visaType?: string;
  /** 원어민 계좌 (계좌번호는 accountNumber 공통 필드) */
  intlBank?: Partial<IntlBankInfo>;
}

// ── 검증 (클라이언트·서버 공용) ─────────────────────────────────

export const ENGLISH_NICKNAME_RE = /^[A-Z][A-Za-z]{0,7}$/;
export const PASSPORT_NAME_RE = /^[A-Z]+(?: [A-Z]+)+$/;
export const PASSPORT_NUMBER_RE = /^[A-Z][0-9A-Z]{7,8}$/;
/** 여권 발급/재발급 예정 */
export const PASSPORT_PENDING_NUMBER = 'M00000000';
export const PASSPORT_PENDING_EXPIRY = '0000.00.00';

export function normalizeCampProfileInput(input: CampProfileInput): CampProfileInput {
  const t = (v?: string) => (typeof v === 'string' ? v.trim() : undefined);
  return {
    englishNickname: t(input.englishNickname),
    rrnLast: t(input.rrnLast)?.replace(/[^0-9]/g, ''),
    bankName: t(input.bankName),
    accountHolder: t(input.accountHolder),
    accountNumber: t(input.accountNumber)?.replace(/[^0-9]/g, ''),
    passportName: t(input.passportName)?.toUpperCase().replace(/\s+/g, ' '),
    passportNumber: t(input.passportNumber)?.toUpperCase().replace(/\s+/g, ''),
    passportExpiry: t(input.passportExpiry)?.replace(/[-/]/g, '.'),
    shirtSize: t(input.shirtSize)?.toUpperCase(),
    phoneModel: t(input.phoneModel),
    nationality: t(input.nationality),
    visaType: t(input.visaType),
  };
}

/** 필드별 오류 메시지 (없으면 빈 객체). 제출된 필드만 검사 */
export function validateCampProfileInput(input: CampProfileInput): Partial<Record<CampProfileField, string>> {
  const e: Partial<Record<CampProfileField, string>> = {};
  if (input.englishNickname !== undefined && !ENGLISH_NICKNAME_RE.test(input.englishNickname)) {
    e.englishNickname = '첫 글자는 대문자, 띄어쓰기 없이 영문 8자 이내로 입력해주세요. (예: David)';
  }
  if (input.rrnLast !== undefined && !/^[1-8][0-9]{6}$/.test(input.rrnLast)) {
    e.rrnLast = '주민등록번호 뒷자리 7자리를 입력해주세요.';
  }
  if (!input.intlBank && (input.accountNumber !== undefined || input.bankName !== undefined || input.accountHolder !== undefined)) {
    if (!input.bankName) e.bankAccount = '은행을 입력해주세요.';
    else if (!input.accountHolder) e.bankAccount = '예금주를 입력해주세요.';
    else if (!input.accountNumber || input.accountNumber.length < 8 || input.accountNumber.length > 16) e.bankAccount = '계좌번호를 숫자로 입력해주세요.';
  }
  if (input.passportName !== undefined && !PASSPORT_NAME_RE.test(input.passportName)) {
    e.passportName = '여권과 같은 영문 대문자로, 성과 이름 사이를 띄어 입력해주세요. (예: HONG GILDONG)';
  }
  if (input.passportNumber !== undefined && input.passportNumber !== PASSPORT_PENDING_NUMBER && !PASSPORT_NUMBER_RE.test(input.passportNumber)) {
    e.passportNumber = '여권 번호를 확인해주세요. (예: M123A4567, 발급 예정이면 M00000000)';
  }
  if (input.passportExpiry !== undefined && input.passportExpiry !== PASSPORT_PENDING_EXPIRY) {
    const m = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(input.passportExpiry);
    if (!m) e.passportExpiry = 'YYYY.MM.DD 형식으로 입력해주세요. (예: 2027.01.01, 발급 예정이면 0000.00.00)';
  }
  if (input.shirtSize !== undefined && !(SHIRT_SIZES as readonly string[]).includes(input.shirtSize)) {
    e.shirtSize = '단체티 사이즈를 선택해주세요.';
  }
  if (input.phoneModel !== undefined && (input.phoneModel.length < 2 || input.phoneModel.length > 40)) {
    e.phoneModel = '휴대폰 모델명을 입력해주세요. (예: 갤럭시 S24+, 아이폰 16 Pro)';
  }
  if (input.nationality !== undefined && (input.nationality.length < 2 || input.nationality.length > 60)) {
    e.nationality = 'Select your nationality.';
  }
  if (input.visaType !== undefined && (input.visaType.length < 2 || input.visaType.length > 40)) {
    e.visaType = 'Select your visa type.';
  }
  if (input.intlBank) {
    const err = validateIntlBank(input.intlBank, input.accountNumber);
    if (err) e.bankAccount = err;
  }
  return e;
}

/** 저장된 문서 기준 미입력 항목 */
export function missingCampProfileFields(tier: CampProfileTier | null, doc: CampProfileDoc | null | undefined, hasRrnLast: boolean, audience: 'mentor' | 'foreign' = 'mentor', campCodes?: string[]): CampProfileField[] {
  if (!tier) return [];
  const d = doc ?? {};
  const intlOk = !!d.intlBank && !validateIntlBank(d.intlBank, d.accountNumberEncrypted ? '__stored__' : undefined, true);
  const has: Record<CampProfileField, boolean> = {
    englishNickname: !!d.englishNickname,
    rrnLast: hasRrnLast,
    bankAccount: audience === 'foreign'
      ? intlOk
      : !!d.accountNumberEncrypted && !!d.bankName && !!d.accountHolder,
    passportName: !!d.passportName,
    passportNumber: !!d.passportNumber,
    passportExpiry: !!d.passportExpiry,
    shirtSize: !!d.shirtSize,
    phoneModel: !!d.phoneModel,
    nationality: !!d.nationality,
    visaType: !!d.visaType,
  };
  return requiredCampProfileFields(tier, audience, campCodes).filter((f) => !has[f]);
}

/** 계좌번호 가림: 앞 3 · 뒤 3 만 */
export function maskAccountNumber(n: string): string {
  const d = n.replace(/[^0-9]/g, '');
  if (d.length <= 6) return '*'.repeat(d.length);
  return `${d.slice(0, 3)}${'*'.repeat(d.length - 6)}${d.slice(-3)}`;
}


const SWIFT_RE = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;

/** 원어민 계좌 정규화 (대문자·공백 정리) */
export function normalizeIntlBank(b: Partial<IntlBankInfo>): Partial<IntlBankInfo> {
  const t = (v?: string) => (typeof v === 'string' ? v.trim() : undefined);
  return {
    country: t(b.country),
    countryName: t(b.countryName),
    holderName: t(b.holderName)?.replace(/\s+/g, ' '),
    bankName: t(b.bankName),
    swift: t(b.swift)?.toUpperCase().replace(/\s/g, ''),
    routing: t(b.routing)?.toUpperCase().replace(/\s/g, ''),
    iban: t(b.iban)?.toUpperCase().replace(/\s/g, ''),
    accountType: (b.accountType === 'Checking' || b.accountType === 'Savings') ? b.accountType : '',
    bankAddress: t(b.bankAddress),
    recipientAddress: t(b.recipientAddress),
    recipientPhone: t(b.recipientPhone),
    notes: t(b.notes),
  };
}

/**
 * 원어민 계좌 검증 — 오류 메시지 또는 null
 * @param accountNumber 계좌번호 원문 ('__stored__' 이면 저장값 있음으로 간주)
 * @param stored 저장본 검사(IBAN 은 가림본이라 형식 검사 생략)
 */
export function validateIntlBank(b: Partial<IntlBankInfo>, accountNumber?: string, stored = false): string | null {
  const def = bankCountryDef(b.country);
  if (!def) return 'Select the country where your bank account is located.';
  if (def.domestic) {
    if (!b.bankName?.trim()) return 'Enter the bank name (은행).';
    if (!b.holderName?.trim()) return 'Enter the account holder name (예금주).';
    if (!accountNumber) return 'Enter the account number (계좌번호).';
    return null;
  }
  if (def.code === 'OTHER' && !b.countryName?.trim()) return 'Enter the country name.';
  if (!b.holderName?.trim() || !/^[A-Za-z][A-Za-z .'-]{1,69}$/.test(b.holderName.trim())) return 'Enter the account holder name in English, exactly as shown on the bank account.';
  if (!b.bankName?.trim()) return 'Enter the bank name (full official name).';
  const hasIban = !!b.iban?.trim();
  if (!accountNumber && !hasIban) return 'Enter the account number.';
  if (!b.swift?.trim() || !SWIFT_RE.test(b.swift.trim().toUpperCase())) return 'Enter a valid SWIFT/BIC code (8 or 11 characters, e.g. NEDSZAJJ). If your bank has none, ask your bank for its intermediary bank SWIFT code and write the details in Notes.';
  if (def.iban === 'required' && !hasIban) return 'IBAN is required for this country.';
  if (hasIban && !stored && !IBAN_RE.test(b.iban!.replace(/\s/g, '').toUpperCase())) return 'Check the IBAN format.';
  if (def.routing) {
    const r = BANK_ROUTING_LABELS[def.routing];
    const v = (b.routing ?? '').trim().toUpperCase();
    if (def.routingRequired && !v) return `Enter the ${r.label}.`;
    if (v && !r.re.test(v)) return `Check the ${r.label} (e.g. ${r.example}).`;
  }
  if (!b.recipientAddress?.trim() || b.recipientAddress.trim().length < 8) return 'Enter your home address (street, city, postal code, country).';
  if (!b.recipientPhone?.trim() || !/^\+?[0-9][0-9 ()-]{6,20}$/.test(b.recipientPhone.trim())) return 'Enter your phone number with country code (e.g. +27 71 700 4529).';
  return null;
}
