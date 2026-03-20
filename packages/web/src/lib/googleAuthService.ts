import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
  OAuthCredential
} from 'firebase/auth';
import { auth } from './firebase';
import { SocialUserData } from '@smis-mentor/shared';

const googleProvider = new GoogleAuthProvider();

// 추가 스코프 설정 (선택 사항)
googleProvider.addScope('profile');
googleProvider.addScope('email');

/**
 * Google 팝업 로그인 수행
 */
export async function signInWithGooglePopup(): Promise<SocialUserData> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    return extractSocialUserData(result.user, credential);
  } catch (error: any) {
    console.error('Google Popup 로그인 오류:', error);
    throw error;
  }
}

/**
 * Google 리다이렉트 로그인 수행 (모바일 브라우저용)
 */
export async function signInWithGoogleRedirect(): Promise<void> {
  try {
    await signInWithRedirect(auth, googleProvider);
  } catch (error: any) {
    console.error('Google Redirect 로그인 오류:', error);
    throw error;
  }
}

/**
 * 리다이렉트 결과 확인
 * 
 * 중요: 리다이렉트 후 Firebase Auth는 이미 로그인 상태입니다.
 * 이 함수는 단순히 사용자 데이터를 추출하여 반환하며,
 * Firebase Auth 로그인 상태를 변경하지 않습니다.
 */
export async function getGoogleRedirectResult(): Promise<SocialUserData | null> {
  try {
    console.log('🔍 리다이렉트 결과 확인 시작...');
    console.log('Current URL:', window.location.href);
    console.log('Current Auth State:', auth.currentUser ? 'Logged In' : 'Logged Out');
    
    const result = await getRedirectResult(auth);
    
    console.log('📦 getRedirectResult 반환값:', result);
    
    if (!result) {
      console.log('ℹ️ 리다이렉트 결과 없음 (null)');
      return null;
    }
    
    console.log('👤 리다이렉트 사용자 정보:', {
      uid: result.user.uid,
      email: result.user.email,
      displayName: result.user.displayName,
    });
    
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const socialData = extractSocialUserData(result.user, credential);
    
    console.log('✅ Redirect 결과 처리 완료 - Firebase Auth 로그인 상태 유지');
    return socialData;
  } catch (error: any) {
    console.error('❌ Google Redirect 결과 확인 오류:', error);
    console.error('Error code:', error?.code);
    console.error('Error message:', error?.message);
    throw error;
  }
}

/**
 * Firebase User와 Credential에서 SocialUserData 추출
 */
function extractSocialUserData(user: any, credential: OAuthCredential | null): SocialUserData {
  console.log('🔍 Google 로그인 사용자 데이터:', {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    providerId: user.providerId,
    providerData: user.providerData,
  });
  
  // 이메일이 없는 경우 providerData에서 추출 시도
  let email = user.email;
  if (!email && user.providerData && user.providerData.length > 0) {
    email = user.providerData[0].email;
    console.log('⚠️ user.email이 없어서 providerData에서 추출:', email);
  }
  
  if (!email) {
    console.error('❌ Google 로그인 후 이메일을 찾을 수 없습니다!');
    throw new Error('Google 계정에서 이메일 정보를 가져올 수 없습니다.');
  }
  
  const socialData: SocialUserData = {
    email: email,
    name: user.displayName || email.split('@')[0],
    photoURL: user.photoURL || undefined,
    providerId: 'google.com',
    providerUid: user.uid,
    idToken: credential?.idToken,
    accessToken: credential?.accessToken,
  };
  
  console.log('✅ 추출된 소셜 데이터:', socialData);
  return socialData;
}

/**
 * Google 로그인 에러 처리
 */
export function handleGoogleAuthError(error: any): string {
  const errorCode = error?.code || '';
  
  switch (errorCode) {
    case 'auth/popup-closed-by-user':
      return '로그인 창이 닫혔습니다. 다시 시도해주세요.';
    case 'auth/cancelled-popup-request':
      return '이미 진행 중인 로그인 요청이 있습니다.';
    case 'auth/popup-blocked':
      return '팝업이 차단되었습니다. 팝업 차단을 해제해주세요.';
    case 'auth/network-request-failed':
      return '네트워크 연결을 확인해주세요.';
    case 'auth/too-many-requests':
      return '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.';
    case 'auth/user-disabled':
      return '비활성화된 계정입니다. 관리자에게 문의해주세요.';
    case 'auth/operation-not-allowed':
      return 'Google 로그인이 비활성화되어 있습니다.';
    default:
      return error?.message || 'Google 로그인 중 오류가 발생했습니다.';
  }
}

/**
 * 모바일 환경 감지
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Google 로그인 메인 함수
 * 모바일은 redirect, 데스크톱은 popup 사용
 */
export async function signInWithGoogle(): Promise<SocialUserData | 'redirect'> {
  const isMobile = isMobileDevice();
  
  console.log('🔐 Google 로그인 시작');
  console.log('📱 모바일 감지:', isMobile);
  console.log('🌐 User Agent:', navigator.userAgent);
  
  if (isMobile) {
    // 모바일에서는 redirect 방식 사용
    console.log('🔄 Redirect 방식 사용 (모바일)');
    await signInWithGoogleRedirect();
    console.log('✅ Redirect 시작됨 - Google 로그인 페이지로 이동');
    return 'redirect'; // redirect 시작을 알림
  } else {
    // 데스크톱에서는 popup 방식 사용
    console.log('🪟 Popup 방식 사용 (데스크톱)');
    return await signInWithGooglePopup();
  }
}
