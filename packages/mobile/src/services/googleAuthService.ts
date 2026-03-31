import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../config/firebase';
import type { SocialUserData } from '@smis-mentor/shared';
import Constants from 'expo-constants';
import { logger } from '@smis-mentor/shared';

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
 * Google 로그인 직접 실행 (Hook 없이)
 * ProfileScreen 등에서 사용
 * 
 * - Development Build: Native SDK 사용 (권장)
 * - Expo Go: OAuth 2.0 사용
 */
export async function signInWithGoogleDirect(): Promise<{
  socialData: SocialUserData;
  credential: any;
}> {
  try {
    // Native SDK 사용 가능 여부 확인
    let GoogleSignin: any = null;
    try {
      const GoogleSignInModule = await import('@react-native-google-signin/google-signin');
      GoogleSignin = GoogleSignInModule.GoogleSignin;
      
      if (GoogleSignin && typeof GoogleSignin.signIn === 'function') {
        logger.info('🔵 구글 로그인 시작 (Native SDK - Development Build)');
        return await signInWithNativeGoogleSDK(GoogleSignin);
      }
    } catch (error) {
      logger.info('⚠️ Google Native SDK 불가능, OAuth 2.0 사용 (Expo Go)');
    }

    // Native SDK를 사용할 수 없으면 OAuth 2.0 사용
    logger.info('🔵 구글 로그인 시작 (OAuth 2.0 - Expo Go)');
    return await signInWithGoogleOAuth();
  } catch (error) {
    logger.error('❌ 구글 로그인 실패 (Direct):', error);
    throw error;
  }
}

/**
 * Google Native SDK 방식 (Development Build)
 */
async function signInWithNativeGoogleSDK(GoogleSignin: any): Promise<{
  socialData: SocialUserData;
  credential: any;
}> {
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();

  const idToken = response.data?.idToken || response.idToken;

  if (!idToken) {
    throw new Error('Google ID 토큰을 가져오지 못했습니다');
  }

  logger.info('✅ Google ID Token 획득 (Native SDK)');

  // Firebase Credential 생성
  const credential = GoogleAuthProvider.credential(idToken);

  // 사용자 정보
  const user = response.data?.user || response.user;

  const socialData: SocialUserData = {
    email: user.email || '',
    name: user.name || user.givenName || '',
    photoURL: user.photo,
    providerId: 'google.com',
    providerUid: user.id,
    displayName: user.name,
    idToken: idToken, // ✅ idToken 추가 (Firebase Auth 연동용)
    accessToken: undefined, // Google Native SDK는 accessToken 불필요
  };

  logger.info('✅ 구글 로그인 완료 (Native SDK):', { email: socialData.email });

  return { socialData, credential };
}

/**
 * Google OAuth 2.0 방식 (Expo Go)
 */
async function signInWithGoogleOAuth(): Promise<{
  socialData: SocialUserData;
  credential: any;
}> {
  logger.info('🔵 구글 로그인 시작 (OAuth 2.0 - Expo Go)');

  // Redirect URI
  const redirectUri = makeRedirectUri();
  
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: GOOGLE_WEB_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'id_token token',
    scope: 'openid profile email',
    nonce: Math.random().toString(36).substring(7),
  })}`;

  logger.info('📍 Redirect URI:', redirectUri);

  // 브라우저 열기
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

  if (result.type === 'cancel') {
    throw new Error('로그인이 취소되었습니다');
  }

  if (result.type !== 'success') {
    throw new Error('Google 로그인에 실패했습니다');
  }

  // URL에서 id_token 추출
  const url = result.url;
  const params = new URLSearchParams(url.split('#')[1] || '');
  const idToken = params.get('id_token');

  if (!idToken) {
    throw new Error('Google ID 토큰을 가져올 수 없습니다');
  }

  logger.info('✅ Google ID Token 획득 (OAuth 2.0)');

  // Firebase Credential 생성
  const credential = GoogleAuthProvider.credential(idToken);

  // 사용자 정보 추출 (JWT 디코딩)
  const payload = JSON.parse(
    Buffer.from(idToken.split('.')[1], 'base64').toString()
  );

  const socialData: SocialUserData = {
    email: payload.email || '',
    name: payload.name || '',
    photoURL: payload.picture,
    providerId: 'google.com',
    providerUid: payload.sub,
    displayName: payload.name,
    idToken: idToken, // ✅ idToken 추가
    accessToken: params.get('access_token') || undefined, // ✅ accessToken 추가
  };

  logger.info('✅ 구글 로그인 완료 (OAuth 2.0):', { email: socialData.email });

  return { socialData, credential };
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
    logger.error('Google 로그인 실패:', error);
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
    logger.info('🔑 Google Credential 획득 시작');
    
    // 현재 로그인된 사용자 저장
    const currentUser = auth.currentUser;
    logger.info('현재 사용자:', currentUser ? { uid: currentUser.uid, email: currentUser.email } : 'none');
    
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

    logger.info('✅ Google 팝업 완료:', {
      email: user.email,
      uid: user.uid,
      isNewUser: (result as any)._tokenResponse?.isNewUser,
    });

    if (!user.email) {
      // providerData에서 이메일 추출 시도
      let email = null;
      if (user.providerData && user.providerData.length > 0) {
        email = user.providerData[0].email;
        logger.info('📧 providerData에서 이메일 추출:', email);
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

    logger.info('✅ SocialUserData 추출 완료:', { email: socialData.email, name: socialData.name });
    logger.info('ℹ️ Google 계정이 Firebase Auth에 생성되었습니다 (정상)');
    logger.info('ℹ️ linkWithCredential이 실패하면 Firestore에만 저장됩니다');

    return { socialData, credential };
  } catch (error: any) {
    logger.error('❌ Google Credential 획득 실패:', error);
    throw error;
  }
}

// 이전 버전과의 호환성을 위한 더미 함수들
export function configureGoogleSignIn(): void {
  logger.info('✅ Expo AuthSession 사용 - 설정 불필요');
}

export async function isGoogleSignedIn(): Promise<boolean> {
  return !!auth.currentUser;
}

export async function signOutGoogle(): Promise<void> {
  // Expo AuthSession은 별도 로그아웃 불필요
  logger.info('Google 로그아웃 (Expo AuthSession)');
}

export async function revokeGoogleAccess(): Promise<void> {
  logger.info('Google 계정 연결 해제 (Expo AuthSession)');
}

export async function getCurrentGoogleUser() {
  return auth.currentUser;
}
