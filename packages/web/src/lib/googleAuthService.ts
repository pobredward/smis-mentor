import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  OAuthCredential
} from 'firebase/auth';
import { auth } from './firebase';
import { SocialUserData } from '@smis-mentor/shared';

const googleProvider = new GoogleAuthProvider();

// 추가 스코프 설정 (이메일 필수)
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');

// ✅ 이메일 정보를 반드시 요청하도록 설정
googleProvider.setCustomParameters({
  prompt: 'select_account', // 계정 선택 화면 표시
});

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
  console.log('🔍 SocialUserData 추출 시작:', {
    userEmail: user.email,
    providerData: user.providerData,
    credentialIdToken: credential?.idToken ? 'exists' : 'missing',
  });
  
  // 1. user.email에서 추출
  let email = user.email;
  
  // 2. providerData에서 추출
  if (!email && user.providerData && user.providerData.length > 0) {
    email = user.providerData[0].email;
    console.log('📧 providerData에서 이메일 추출:', email);
  }
  
  // 3. credential의 ID 토큰에서 추출 (JWT 디코딩)
  if (!email && credential?.idToken) {
    try {
      const payload = JSON.parse(atob(credential.idToken.split('.')[1]));
      email = payload.email;
      console.log('📧 ID 토큰에서 이메일 추출:', email);
    } catch (e) {
      console.error('ID 토큰 파싱 실패:', e);
    }
  }
  
  if (!email) {
    console.error('❌ 이메일을 가져올 수 없음:', { user, credential });
    throw new Error('Google 계정에서 이메일 정보를 가져올 수 없습니다. 구글 계정 설정에서 이메일 공개를 허용해주세요.');
  }
  
  console.log('✅ SocialUserData 추출 완료:', { email, name: user.displayName });
  
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
 * Google Credential만 가져오기 (계정 연동용)
 * 기존 로그인 상태를 유지하면서 Google credential만 획득
 */
export async function getGoogleCredential(): Promise<{
  socialData: SocialUserData;
  credential: OAuthCredential;
}> {
  try {
    // 1. 현재 로그인된 사용자 저장
    const currentUser = auth.currentUser;
    const currentUserData = currentUser ? {
      uid: currentUser.uid,
      email: currentUser.email,
    } : null;
    
    console.log('🔑 Google Credential 획득 시작:', currentUserData);
    
    // 2. Google 팝업 열기 (임시로 로그인됨)
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    if (!credential) {
      throw new Error('Google credential을 가져올 수 없습니다.');
    }
    
    console.log('✅ Google 팝업 완료:', {
      email: result.user.email,
      uid: result.user.uid,
      isNewUser: currentUserData?.uid !== result.user.uid,
    });
    
    // 3. SocialUserData 추출
    const socialData = extractSocialUserData(result.user, credential);
    
    // 4. ✅ 수정: 임시 계정 삭제하지 않음
    // → Firebase Auth에 구글 계정이 생성되어도 괜찮음
    // → linkWithCredential에서 credential-already-in-use 에러 발생 시 Firestore에만 저장
    console.log('ℹ️ Google 계정이 Firebase Auth에 생성되었습니다 (정상)');
    console.log('ℹ️ linkWithCredential이 실패하면 Firestore에만 저장됩니다');
    
    return { socialData, credential };
  } catch (error: any) {
    console.error('Google Credential 획득 오류:', error);
    throw error;
  }
}

/**
 * Google 로그인 메인 함수
 * 팝업 방식만 사용
 */
export async function signInWithGoogle(): Promise<SocialUserData> {
  return await signInWithGooglePopup();
}
