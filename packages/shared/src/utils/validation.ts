/**
 * 이메일 형식 검증
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 전화번호 형식 검증 (한국)
 */
export function validatePhoneNumber(phone: string): boolean {
  const phoneRegex = /^01[0-9]{8,9}$/;
  return phoneRegex.test(phone.replace(/-/g, ''));
}

/**
 * 이름 검증
 */
export function validateName(name: string): boolean {
  return name.trim().length >= 2;
}

/**
 * 나이 검증
 */
export function validateAge(age: number): boolean {
  return age >= 15 && age <= 100;
}

/**
 * 주소 검증
 */
export function validateAddress(address: string): boolean {
  return address.trim().length >= 5;
}
