/**
 * 생년월일(YYYY-MM-DD)로 만 나이 계산
 * 만 나이 기준: 올해 생일이 지났으면 (올해 - 출생연도), 아직이면 -1
 */
export function calculateAgeFromDateOfBirth(dateOfBirth: string): number {
  const today = new Date();
  const birth = new Date(dateOfBirth);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

/**
 * 생년월일(YYYY-MM-DD)이 유효한 날짜인지 검증
 * - 형식: YYYY-MM-DD
 * - 합리적인 범위: 1900-01-01 ~ 오늘
 */
export function isValidDateOfBirth(dateOfBirth: string): boolean {
  if (!dateOfBirth) return false;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateOfBirth)) return false;

  const date = new Date(dateOfBirth);
  if (isNaN(date.getTime())) return false;

  const today = new Date();
  const minDate = new Date('1900-01-01');
  return date >= minDate && date <= today;
}

// ==================== 날짜 키 (YYYY-MM-DD) ====================
// toISOString() 은 UTC 기준이라 한국 시간 자정~오전 9시에 하루 전 날짜가 나온다.
// 날짜를 문자열로 주고받을 때는 반드시 아래 함수를 쓴다.

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 기기 로컬 날짜 기준 'YYYY-MM-DD' */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 'YYYY-MM-DD' → 로컬 자정 Date (new Date('YYYY-MM-DD') 는 UTC 자정이라 쓰지 않는다) */
export function fromDateKey(key: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key);
  if (!m) return new Date(NaN);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** 오늘 'YYYY-MM-DD' (기기 로컬) */
export const todayDateKey = (): string => toDateKey(new Date());

/** 같은 날짜인가 (시각 무시) */
export const isSameDateKey = (a: Date, b: Date): boolean => toDateKey(a) === toDateKey(b);
