import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../config/firebase';
import type { SocialUserData } from '@smis-mentor/shared';
import Constants from 'expo-constants';

// WebBrowser 설정 (로그인 완료 후 브라우저 자동 닫기)
WebBrowser.maybeCompleteAuthSession();

// .env에서 Client ID 가져오기
const GOOGLE_WEB_CLIENT_ID = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || 
  '382190683951-d213f6sqm30lokbddeth6g2gucava2en.apps.googleusercontent.com';

const GOOGLE_IOS_CLIENT_ID = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || 
  '382190683951-6qjb6jfc4ssfirqt7807ttt7b77rl8me.apps.googleusercontent.com';

const GOOGLE_ANDROID_CLIENT_ID = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || 
  '382190683951-cs53mija3pru3p0na3t8tqmqgqej8okn.apps.googleusercontent.com';

/**
 * Google Sign In 초기화 (Expo AuthSession 사용)
 * Expo Go에서 동작합니다
 */
export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
  });

  return { request, response, promptAsync };
}

/**
 * Google 인증 응답을 Firebase 로그인으로 변환
 */
export async function handleGoogleAuthResponse(
  response: any
): Promise<SocialUserData> {
  if (response?.type !== 'success') {
    if (response?.type === 'cancel') {
      throw new Error('로그인이 취소되었습니다');
    }
    throw new Error('Google 로그인에 실패했습니다');
  }

  const { id_token } = response.params;
  
  if (!id_token) {
    throw new Error('Google ID 토큰을 가져오지 못했습니다');
  }

  // Firebase credential 생성
  const credential = GoogleAuthProvider.credential(id_token);

  // Firebase Auth로 로그인
  const result = await signInWithCredential(auth, credential);

  // 사용자 정보 가져오기
  const user = result.user;

  if (!user.email) {
    throw new Error('Google 계정에서 이메일을 가져올 수 없습니다');
  }

  const socialData: SocialUserData = {
    email: user.email,
    name: user.displayName || '',
    photoURL: user.photoURL || undefined,
    providerId: 'google.com',
    providerUid: user.uid,
    idToken: id_token,
  };

  return socialData;
}

/**
 * Google 로그인 (Expo Go 호환)
 */
export async function signInWithGoogle(promptAsync: any): Promise<SocialUserData> {
  try {
    const response = await promptAsync();
    return await handleGoogleAuthResponse(response);
  } catch (error: any) {
    console.error('Google 로그인 실패:', error);
    throw error;
  }
}

/**
 * Google Credential만 가져오기 (계정 연동용)
 * 웹의 getGoogleCredential과 동일한 로직
 */
export async function getGoogleCredential(promptAsync: any): Promise<{
  socialData: SocialUserData;
  credential: any;
}> {
  try {
    console.log('🔑 Google Credential 획득 시작');
    
    // 현재 로그인된 사용자 저장
    const currentUser = auth.currentUser;
    console.log('현재 사용자:', currentUser ? { uid: currentUser.uid, email: currentUser.email } : 'none');
    
    // Google 인증 팝업
    const response = await promptAsync();
    
    if (response?.type !== 'success') {
      if (response?.type === 'cancel') {
        throw new Error('POPUP_CLOSED');
      }
      throw new Error('Google 인증에 실패했습니다');
    }

    const { id_token } = response.params;
    
    if (!id_token) {
      throw new Error('Google ID 토큰을 가져오지 못했습니다');
    }

    // Firebase credential 생성
    const credential = GoogleAuthProvider.credential(id_token);

    // ⚠️ signInWithCredential은 세션을 변경하므로 호출
    // Multiple Email Policy에서는 별도 계정으로 생성됨
    const result = await signInWithCredential(auth, credential);
    const user = result.user;

    console.log('✅ Google 팝업 완료:', {
      email: user.email,
      uid: user.uid,
      isNewUser: (result as any)._tokenResponse?.isNewUser,
    });

    if (!user.email) {
      // providerData에서 이메일 추출 시도
      let email = null;
      if (user.providerData && user.providerData.length > 0) {
        email = user.providerData[0].email;
        console.log('📧 providerData에서 이메일 추출:', email);
      }
      
      if (!email) {
        throw new Error('Google 계정에서 이메일 정보를 가져올 수 없습니다');
      }
    }

    const socialData: SocialUserData = {
      email: user.email || user.providerData[0].email || '',
      name: user.displayName || user.email?.split('@')[0] || '',
      photoURL: user.photoURL || undefined,
      providerId: 'google.com',
      providerUid: user.uid,
      idToken: id_token,
    };

    console.log('✅ SocialUserData 추출 완료:', { email: socialData.email, name: socialData.name });
    console.log('ℹ️ Google 계정이 Firebase Auth에 생성되었습니다 (정상)');
    console.log('ℹ️ linkWithCredential이 실패하면 Firestore에만 저장됩니다');

    return { socialData, credential };
  } catch (error: any) {
    console.error('❌ Google Credential 획득 실패:', error);
    throw error;
  }
}

// 이전 버전과의 호환성을 위한 더미 함수들
export function configureGoogleSignIn(): void {
  console.log('✅ Expo AuthSession 사용 - 설정 불필요');
}

export async function isGoogleSignedIn(): Promise<boolean> {
  return !!auth.currentUser;
}

export async function signOutGoogle(): Promise<void> {
  // Expo AuthSession은 별도 로그아웃 불필요
  console.log('Google 로그아웃 (Expo AuthSession)');
}

export async function revokeGoogleAccess(): Promise<void> {
  console.log('Google 계정 연결 해제 (Expo AuthSession)');
}

export async function getCurrentGoogleUser() {
  return auth.currentUser;
}
