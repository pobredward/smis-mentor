import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from '../config/firebase';
import type { SocialUserData } from '@smis-mentor/shared';
import Constants from 'expo-constants';
import { isExpoGo } from '../utils/runtime';
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
    // Expo Go에서는 네이티브 모듈을 import 하지 않는다 (import 순간 오류 화면이 뜸) → 바로 OAuth
    if (!isExpoGo()) try {
      const GoogleSignInModule = await import('@react-native-google-signin/google-signin');
      GoogleSignin = GoogleSignInModule.GoogleSignin;
      
      if (GoogleSignin && typeof GoogleSignin.signIn === 'function') {
        logger.info('🔵 구글 로그인 시작 (Native SDK - Development Build)');
        return await signInWithNativeGoogleSDK(GoogleSignin);
      }
    } catch (error: any) {
      // Expo Go 환경: 네이티브 모듈 사용 불가 (정상)
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('RNGoogleSignin') || errorMessage.includes('TurboModuleRegistry')) {
        logger.warn('⚠️ Expo Go 환경: Google Native SDK를 사용할 수 없습니다');
      } else {
        logger.warn('⚠️ Google Native SDK 불가능, OAuth 2.0 사용:', errorMessage);
      }
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
 * Google Native SDK 방식 (Development Build / Android APK)
 */
async function signInWithNativeGoogleSDK(GoogleSignin: any): Promise<{
  socialData: SocialUserData;
  credential: any;
}> {
  // configure가 아직 안 됐을 경우를 대비해 여기서도 호출 (멱등적)
  // Android는 google-services.json에서 클라이언트 ID를 자동으로 읽음
  GoogleSignin.configure({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });

  await GoogleSignin.hasPlayServices();

  // 기존 세션을 먼저 로그아웃해서 항상 계정 선택 창이 뜨도록 강제
  // (자동 선택 방지)
  try {
    await GoogleSignin.signOut();
  } catch {
    // 로그인 상태가 아닐 수 있으므로 무시
  }

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
    prompt: 'select_account', // 항상 계정 선택 창 표시
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
async function handleGoogleAuthResponse(
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







