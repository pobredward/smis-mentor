import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import type { SocialUserData } from '@smis-mentor/shared';
import Constants from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

const NAVER_CLIENT_ID = Constants.expoConfig?.extra?.EXPO_PUBLIC_NAVER_CLIENT_ID || '';
const NAVER_CLIENT_SECRET = Constants.expoConfig?.extra?.EXPO_PUBLIC_NAVER_CLIENT_SECRET || '';

/**
 * 네이버 로그인 (자동 방식 감지)
 * - Development Build: Native SDK 사용
 * - Expo Go: OAuth 2.0 사용
 */
export async function signInWithNaver(): Promise<SocialUserData> {
  try {
    // Native SDK 사용 가능 여부 확인
    let NaverLogin: any = null;
    try {
      const NaverLoginModule = await import('@react-native-seoul/naver-login');
      NaverLogin = NaverLoginModule.default;
      
      if (NaverLogin && typeof NaverLogin.login === 'function') {
        console.log('🟢 네이버 로그인 시작 (Native SDK - Development Build)');
        return await signInWithNativeSDK(NaverLogin);
      }
    } catch (error) {
      console.log('⚠️ Native SDK 불가능, OAuth 2.0 사용 (Expo Go)');
    }

    // Native SDK를 사용할 수 없으면 OAuth 2.0 사용
    console.log('🟢 네이버 로그인 시작 (OAuth 2.0 - Expo Go)');
    return await signInWithOAuth();
  } catch (error: any) {
    console.error('❌ 네이버 로그인 실패:', error);
    throw error;
  }
}

/**
 * Native SDK 방식 (Development Build)
 */
async function signInWithNativeSDK(NaverLogin: any): Promise<SocialUserData> {
  const { failureResponse, successResponse } = await NaverLogin.login();

  if (!successResponse || !successResponse.accessToken) {
    throw new Error(failureResponse?.message || '네이버 로그인에 실패했습니다');
  }

  const { accessToken } = successResponse;
  console.log('✅ 액세스 토큰 획득 (Native SDK)');

  // 사용자 정보 가져오기
  const profileResult = await NaverLogin.getProfile(accessToken);

  if (profileResult.resultcode !== '00' || !profileResult.response) {
    throw new Error('네이버 사용자 정보를 가져올 수 없습니다');
  }

  const profile = profileResult.response;

  const socialData: SocialUserData = {
    email: profile.email || '',
    name: profile.name || profile.nickname || '',
    photoURL: profile.profile_image || undefined,
    providerId: 'naver',
    providerUid: profile.id,
    accessToken: accessToken,
  };

  console.log('✅ 네이버 로그인 완료 (Native SDK):', { email: socialData.email });
  return socialData;
}

/**
 * OAuth 2.0 방식 (Expo Go)
 */
async function signInWithOAuth(): Promise<SocialUserData> {
  // Redirect URI (Expo Auth Proxy 사용)
  const redirectUri = makeRedirectUri({
    useProxy: true,
    // 개발: https://auth.expo.io/@pobredward02/smis-mentor
    // 프로덕션: smismentor://redirect
  });

  console.log('📍 Redirect URI:', redirectUri);

  // state 파라미터 (CSRF 방지)
  const state = Math.random().toString(36).substring(7);

  // 1. Authorization Code 요청
  const authParams = new URLSearchParams({
    response_type: 'code',
    client_id: NAVER_CLIENT_ID,
    redirect_uri: redirectUri,
    state: state,
  });

  const authUrl = `https://nid.naver.com/oauth2.0/authorize?${authParams.toString()}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

  if (result.type === 'cancel') {
    throw new Error('로그인이 취소되었습니다');
  }

  if (result.type !== 'success') {
    throw new Error('네이버 로그인에 실패했습니다');
  }

  // 2. Authorization Code 추출
  const url = new URL(result.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');

  if (!code || !returnedState) {
    throw new Error('인증 코드를 가져올 수 없습니다');
  }

  if (returnedState !== state) {
    throw new Error('보안 검증에 실패했습니다');
  }

  console.log('✅ Authorization Code 획득');

  // 3. Access Token 요청
  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: NAVER_CLIENT_ID,
    client_secret: NAVER_CLIENT_SECRET,
    code: code,
    state: state,
  });

  const tokenResponse = await fetch('https://nid.naver.com/oauth2.0/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: tokenParams.toString(),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    throw new Error(tokenData.error_description || '액세스 토큰을 가져올 수 없습니다');
  }

  const accessToken = tokenData.access_token;
  console.log('✅ Access Token 획득');

  // 4. 사용자 정보 조회
  const userInfoResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const userInfoData = await userInfoResponse.json();

  if (userInfoData.resultcode !== '00') {
    throw new Error('네이버 사용자 정보를 가져올 수 없습니다');
  }

  const profile = userInfoData.response;

  const socialData: SocialUserData = {
    email: profile.email || '',
    name: profile.name || profile.nickname || '',
    photoURL: profile.profile_image || undefined,
    providerId: 'naver',
    providerUid: profile.id,
    accessToken: accessToken,
  };

  console.log('✅ 네이버 로그인 완료 (OAuth 2.0):', { email: socialData.email });
  return socialData;
}

/**
 * 네이버 로그아웃
 */
export async function signOutNaver(): Promise<void> {
  try {
    // OAuth 2.0 방식에서는 별도 로그아웃 불필요
    console.log('✅ 네이버 로그아웃 완료');
  } catch (error) {
    console.error('네이버 로그아웃 실패:', error);
    throw error;
  }
}

