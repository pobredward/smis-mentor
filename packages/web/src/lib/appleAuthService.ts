import { 
  OAuthProvider,
  signInWithPopup,
  OAuthCredential
} from 'firebase/auth';
import { auth } from './firebase';
import { SocialUserData, logger } from '@smis-mentor/shared';

const appleProvider = new OAuthProvider('apple.com');

// 추가 스코프 설정 (이름, 이메일 필수)
appleProvider.addScope('email');
appleProvider.addScope('name');

/**
 * Apple 팝업 로그인 수행
 */
export async function signInWithApplePopup(): Promise<SocialUserData> {
  try {
    const result = await signInWithPopup(auth, appleProvider);
    const credential = OAuthProvider.credentialFromResult(result);
    
    return extractSocialUserData(result.user, credential);
  } catch (error: any) {
    logger.error('Apple Popup 로그인 오류:', error);
    throw error;
  }
}

/**
 * Firebase User와 Credential에서 SocialUserData 추출
 */
function extractSocialUserData(user: any, credential: OAuthCredential | null): SocialUserData {
  logger.info('🔍 Apple SocialUserData 추출 시작:', {
    userEmail: user.email,
    userUid: user.uid,
    providerData: user.providerData,
    credentialIdToken: credential?.idToken ? 'exists' : 'missing',
  });
  
  // 1. user.email에서 추출
  let email = user.email;
  let name = user.displayName;
  let appleUserId = '';
  
  // 2. providerData에서 실제 Apple User ID 추출 (중요!)
  if (user.providerData && user.providerData.length > 0) {
    const appleProviderData = user.providerData.find((p: any) => p.providerId === 'apple.com');
    if (appleProviderData) {
      appleUserId = appleProviderData.uid; // ✅ 실제 Apple User ID
      email = email || appleProviderData.email;
      name = name || appleProviderData.displayName;
      logger.info('🍎 providerData에서 Apple User ID 추출:', appleUserId);
    }
  }
  
  // 3. credential의 ID 토큰에서 추출
  if (!email && credential?.idToken) {
    try {
      const payload = JSON.parse(atob(credential.idToken.split('.')[1]));
      email = payload.email;
      appleUserId = appleUserId || payload.sub; // JWT의 sub가 실제 Apple User ID
      logger.info('📧 ID 토큰에서 정보 추출:', { email, appleUserId });
    } catch (e) {
      logger.error('ID 토큰 파싱 실패:', e);
    }
  }
  
  if (!email) {
    logger.error('❌ 이메일을 가져올 수 없음:', { user, credential });
    throw new Error('Apple 계정에서 이메일 정보를 가져올 수 없습니다. Apple 계정 설정에서 이메일 공개를 허용해주세요.');
  }
  
  // ⚠️ providerUid는 Firebase Auth UID가 아닌 실제 Apple User ID를 사용해야 함
  if (!appleUserId) {
    logger.warn('⚠️ Apple User ID를 찾을 수 없음, Firebase UID 사용');
    appleUserId = user.uid;
  }
  
  // 이름이 없으면 이메일 앞부분 사용
  if (!name) {
    name = email.split('@')[0];
  }
  
  logger.info('✅ Apple SocialUserData 추출 완료:', { email, name, appleUserId });
  
  return {
    email: email,
    name: name,
    photoURL: user.photoURL || undefined, // Apple은 프로필 사진 제공 안 함
    providerId: 'apple.com',
    providerUid: appleUserId, // ✅ 실제 Apple User ID 사용
    idToken: credential?.idToken,
    accessToken: credential?.accessToken,
  };
}

/**
 * Apple 로그인 에러 처리
 */
export function handleAppleAuthError(error: any): string {
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
      return 'Apple 로그인이 비활성화되어 있습니다.';
    case 'auth/unauthorized-domain':
      return '이 도메인에서는 Apple 로그인을 사용할 수 없습니다.';
    case 'auth/invalid-credential':
      return 'Apple 인증에 실패했습니다. 다시 시도해주세요.';
    default:
      if (errorCode?.includes('popup')) {
        return '소셜 로그인을 사용하려면 브라우저에서 팝업을 허용해야 합니다. 브라우저 설정을 확인해주세요.';
      }
      return error?.message || 'Apple 로그인 중 오류가 발생했습니다.';
  }
}

/**
 * Apple Credential만 가져오기 (계정 연동용)
 * 기존 로그인 상태를 유지하면서 Apple credential만 획득
 */
export async function getAppleCredential(): Promise<{
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
    
    logger.info('🔑 Apple Credential 획득 시작:', currentUserData);
    
    // 2. Apple 팝업 열기 (임시로 로그인됨)
    const result = await signInWithPopup(auth, appleProvider);
    const credential = OAuthProvider.credentialFromResult(result);
    
    if (!credential) {
      throw new Error('Apple credential을 가져올 수 없습니다.');
    }
    
    logger.info('✅ Apple 팝업 완료:', {
      email: result.user.email,
      uid: result.user.uid,
      isNewUser: currentUserData?.uid !== result.user.uid,
    });
    
    // 3. SocialUserData 추출
    const socialData = extractSocialUserData(result.user, credential);
    
    // 4. Firebase Auth에 Apple 계정이 생성되어도 괜찮음
    logger.info('ℹ️ Apple 계정이 Firebase Auth에 생성되었습니다 (정상)');
    logger.info('ℹ️ linkWithCredential이 실패하면 Firestore에만 저장됩니다');
    
    return { socialData, credential };
  } catch (error: any) {
    logger.error('Apple Credential 획득 오류:', error);
    throw error;
  }
}

/**
 * Apple 로그인 메인 함수
 * 팝업 방식만 사용
 */
export async function signInWithApple(): Promise<SocialUserData> {
  return await signInWithApplePopup();
}
