import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { makeRedirectUri } from 'expo-auth-session';
import type { SocialUserData } from '@smis-mentor/shared';
import Constants from 'expo-constants';

// WebBrowser 설정
WebBrowser.maybeCompleteAuthSession();

// 네이버 OAuth 설정
const NAVER_CLIENT_ID = Constants.expoConfig?.extra?.EXPO_PUBLIC_NAVER_CLIENT_ID || 
  'YOUR_NAVER_CLIENT_ID';

const NAVER_CLIENT_SECRET = Constants.expoConfig?.extra?.EXPO_PUBLIC_NAVER_CLIENT_SECRET || 
  'YOUR_NAVER_CLIENT_SECRET';

/**
 * 네이버 OAuth URL 생성
 */
function getNaverAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: NAVER_CLIENT_ID,
    redirect_uri: redirectUri,
    state: state,
  });

  return `https://nid.naver.com/oauth2.0/authorize?${params.toString()}`;
}

/**
 * 네이버 액세스 토큰 가져오기
 */
async function getNaverAccessToken(code: string, state: string, redirectUri: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: NAVER_CLIENT_ID,
    client_secret: NAVER_CLIENT_SECRET,
    code: code,
    state: state,
    redirect_uri: redirectUri,
  });

  const response = await fetch('https://nid.naver.com/oauth2.0/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const data = await response.json();

  if (!data.access_token) {
    throw new Error('네이버 액세스 토큰을 가져올 수 없습니다');
  }

  return data.access_token;
}

/**
 * 네이버 사용자 정보 가져오기
 */
async function getNaverUserInfo(accessToken: string): Promise<SocialUserData> {
  const response = await fetch('https://openapi.naver.com/v1/nid/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();

  if (data.resultcode !== '00') {
    throw new Error('네이버 사용자 정보를 가져올 수 없습니다');
  }

  const profile = data.response;

  return {
    email: profile.email,
    name: profile.name || profile.nickname,
    photoURL: profile.profile_image,
    providerId: 'naver',
    providerUid: profile.id,
    accessToken: accessToken,
  };
}

/**
 * 네이버 로그인 (React Native)
 */
export async function signInWithNaver(): Promise<SocialUserData> {
  try {
    console.log('🟢 네이버 로그인 시작 (React Native)');

    // 리다이렉트 URI 생성
    // 네이버는 localhost를 허용하므로 개발 시 localhost 사용
    const redirectUri = __DEV__ 
      ? 'https://auth.expo.io/@pobredward02/smis-mentor'  // 개발 환경
      : makeRedirectUri({
          native: 'smismentor://redirect',  // 프로덕션
        });

    console.log('📍 Redirect URI:', redirectUri);

    // state 파라미터 생성 (CSRF 방지)
    const state = Math.random().toString(36).substring(7);

    // 네이버 OAuth URL
    const authUrl = getNaverAuthUrl(redirectUri, state);

    // 브라우저 열기
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

    if (result.type === 'cancel') {
      throw new Error('로그인이 취소되었습니다');
    }

    if (result.type !== 'success') {
      throw new Error('네이버 로그인에 실패했습니다');
    }

    // URL에서 code와 state 추출
    const url = result.url;
    const params = new URL(url).searchParams;
    const code = params.get('code');
    const returnedState = params.get('state');

    if (!code || !returnedState) {
      throw new Error('인증 코드를 가져올 수 없습니다');
    }

    if (returnedState !== state) {
      throw new Error('보안 검증에 실패했습니다 (state mismatch)');
    }

    // 액세스 토큰 가져오기
    const accessToken = await getNaverAccessToken(code, state, redirectUri);

    // 사용자 정보 가져오기
    const socialData = await getNaverUserInfo(accessToken);

    console.log('✅ 네이버 로그인 완료:', { email: socialData.email });

    return socialData;
  } catch (error: any) {
    console.error('❌ 네이버 로그인 실패:', error);
    throw error;
  }
}
