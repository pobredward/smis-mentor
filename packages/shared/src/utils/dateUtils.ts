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
