/**
 * 회원가입 데이터를 SessionStorage에 저장/조회하는 유틸리티
 * 비밀번호를 URL에 노출하지 않기 위함
 */

export interface SignUpData {
  name: string;
  phoneNumber: string;
  email?: string;
  password?: string;
  university?: string;
  grade?: number;
  isOnLeave?: boolean | null;
  major1?: string;
  major2?: string;
  socialSignUp?: boolean;
  tempUserId?: string;
  socialProvider?: string;
  socialEmail?: string;
  firebaseAuthUid?: string;  // 네이버/카카오 소셜 로그인 시 Firebase Auth UID 저장
}

const STORAGE_KEY = 'signup_data';

export const signupStorage = {
  // 데이터 저장
  save: (data: Partial<SignUpData>): void => {
    if (typeof window === 'undefined') return;
    
    const existing = signupStorage.get();
    const updated = { ...existing, ...data };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  // 데이터 조회
  get: (): SignUpData | null => {
    if (typeof window === 'undefined') return null;
    
    const data = sessionStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  },

  // 특정 필드 조회
  getField: <K extends keyof SignUpData>(key: K): SignUpData[K] | null => {
    const data = signupStorage.get();
    return data ? data[key] ?? null : null;
  },

  // 데이터 삭제
  clear: (): void => {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(STORAGE_KEY);
  },

  // 필수 필드 검증
  validate: (requiredFields: (keyof SignUpData)[]): boolean => {
    const data = signupStorage.get();
    if (!data) return false;

    return requiredFields.every(field => {
      const value = data[field];
      return value !== null && value !== undefined && value !== '';
    });
  },
};
