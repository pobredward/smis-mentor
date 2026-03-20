import { 
  GoogleAuthProvider, 
  signInWithPopup, 
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
 * Firebase User와 Credential에서 SocialUserData 추출
 */
function extractSocialUserData(user: any, credential: OAuthCredential | null): SocialUserData {
  // 이메일이 없는 경우 providerData에서 추출 시도
  let email = user.email;
  if (!email && user.providerData && user.providerData.length > 0) {
    email = user.providerData[0].email;
  }
  
  if (!email) {
    throw new Error('Google 계정에서 이메일 정보를 가져올 수 없습니다.');
  }
  
  return {
    email: email,
    name: user.displayName || email.split('@')[0],
    photoURL: user.photoURL || undefined,
    providerId: 'google.com',
    providerUid: user.uid,
    idToken: credential?.idToken,
    accessToken: credential?.accessToken,
  };
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
      return '팝업이 차단되었습니다. 브라우저 설정에서 팝업 차단을 해제한 후 다시 시도해주세요.';
    case 'auth/network-request-failed':
      return '네트워크 연결을 확인해주세요.';
    case 'auth/too-many-requests':
      return '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.';
    case 'auth/user-disabled':
      return '비활성화된 계정입니다. 관리자에게 문의해주세요.';
    case 'auth/operation-not-allowed':
      return 'Google 로그인이 비활성화되어 있습니다.';
    case 'auth/unauthorized-domain':
      return '이 도메인에서는 Google 로그인을 사용할 수 없습니다.';
    default:
      if (errorCode?.includes('popup')) {
        return '소셜 로그인을 사용하려면 브라우저에서 팝업을 허용해야 합니다. 브라우저 설정을 확인해주세요.';
      }
      return error?.message || 'Google 로그인 중 오류가 발생했습니다.';
  }
}

/**
 * Google 로그인 메인 함수
 * 팝업 방식만 사용
 */
export async function signInWithGoogle(): Promise<SocialUserData> {
  return await signInWithGooglePopup();
}
