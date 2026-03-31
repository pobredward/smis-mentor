import { Timestamp } from 'firebase/firestore';
import type { User } from './legacy';

/**
 * 소셜 로그인 제공자 타입
 */
export type SocialProvider = 'google.com' | 'apple.com' | 'kakao' | 'naver';

/**
 * 인증 방법 타입
 */
export type AuthMethod = 'email' | 'social';

/**
 * 소셜 로그인 사용자 데이터
 */
export interface SocialUserData {
  email: string;
  name: string;
  photoURL?: string;
  providerId: SocialProvider;
  providerUid: string;
  idToken?: string;
  accessToken?: string;
  phone?: string;
  firebaseAuthUid?: string;  // Firebase Auth UID (네이버/카카오 Custom Token용)
}

/**
 * 인증 제공자 정보 (Firestore에 저장)
 */
export interface AuthProvider {
  providerId: SocialProvider | 'password' | 'apple'; // 'apple' 정규화 전 값 허용
  uid: string;
  email?: string;
  linkedAt: Timestamp;
  displayName?: string;
  photoURL?: string;
}

/**
 * 소셜 로그인 결과 타입
 */
export type SocialLoginAction = 
  | 'LOGIN'              // 기존 계정으로 즉시 로그인
  | 'SIGNUP'             // 신규 회원가입 필요
  | 'LINK_ACTIVE'        // 기존 active 계정 연동 필요
  | 'LINK_TEMP'          // @deprecated temp 계정은 이메일이 없으므로 이 액션은 실제로 발생하지 않음
  | 'NEED_PHONE';        // 전화번호 입력 필요 (temp 계정 확인용)

export interface SocialLoginResult {
  action: SocialLoginAction;
  user?: User; // User 타입 (from legacy.ts)
  socialData?: SocialUserData;
  tempUserId?: string;
  requiresPhone?: boolean;
  nameMatches?: boolean;
}

/**
 * 회원가입 상태 (플로우 관리용)
 */
export interface SignUpState {
  // Step 1: 개인정보
  name: string;
  phone: string;
  
  // Step 2: 계정정보 (소셜 로그인 시 생략)
  email?: string;
  password?: string;
  
  // Step 3: 교육정보
  university?: string;
  grade?: number;
  isOnLeave?: boolean | null;
  major1?: string;
  major2?: string;
  
  // Step 4: 직무정보
  selfIntroduction?: string;
  jobMotivation?: string;
  partTimeJobs?: Array<{
    period: string;
    companyName: string;
    position: string;
    description: string;
  }>;
  
  // 원어민 전용
  foreignTeacher?: {
    firstName: string;
    lastName: string;
    middleName?: string;
    countryCode: string;
  };
  
  // 소셜 로그인 관련
  isSocialSignUp?: boolean;
  socialData?: SocialUserData;
  tempUserId?: string;
}

/**
 * 계정 연동 확인 결과
 */
export interface AccountLinkConfirmation {
  confirmed: boolean;
  password?: string;
  linkType: 'temp' | 'active' | 'new';
}

/**
 * temp 계정 매칭 결과
 */
export interface TempAccountMatchResult {
  found: boolean;
  user?: User;
  nameMatches?: boolean;
  jobCodes?: Array<{
    generation: string;
    code: string;
    name: string;
  }>;
  isActive?: boolean;      // active 계정인지 여부
  needsLink?: boolean;     // 계정 연동이 필요한지 여부
}
