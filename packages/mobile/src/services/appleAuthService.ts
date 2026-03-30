import * as AppleAuthentication from 'expo-apple-authentication';
import type { SocialUserData } from '@smis-mentor/shared';
import { Platform } from 'react-native';

/**
 * 애플 로그인 (iOS만 지원)
 * - iOS 13+ 필수
 * - Expo Go에서도 동작 (Native SDK)
 */
export async function signInWithApple(): Promise<SocialUserData> {
  try {
    // iOS가 아니거나 애플 로그인을 지원하지 않는 경우
    if (Platform.OS !== 'ios') {
      throw new Error('애플 로그인은 iOS에서만 사용할 수 있습니다.');
    }

    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('이 기기에서는 애플 로그인을 사용할 수 없습니다. (iOS 13 이상 필요)');
    }

    console.log('🟢 애플 로그인 시작');

    // 애플 로그인 요청
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    console.log('✅ 애플 로그인 credential 획득:', {
      user: credential.user,
      email: credential.email,
      fullName: credential.fullName,
    });

    // 이메일 처리 (재로그인 시 email이 null일 수 있음)
    let email = credential.email || '';
    
    // 이메일이 없는 경우 임시 이메일 생성 (Apple ID 기반)
    if (!email) {
      console.log('ℹ️ Apple 재로그인 감지 - 이메일 미제공');
      console.log('   → Apple ID로 기존 계정을 찾습니다');
      // Apple ID를 기반으로 임시 이메일 생성
      // getUserBySocialProvider가 providerUid로 실제 계정을 찾아줌
      email = `apple_${credential.user}@privaterelay.appleid.com`;
    }

    // 이름 조합 (첫 로그인 시에만 제공됨)
    let name = '';
    if (credential.fullName) {
      const { familyName, givenName } = credential.fullName;
      if (familyName && givenName) {
        name = `${familyName}${givenName}`; // 한국식: 성 + 이름
      } else if (givenName) {
        name = givenName;
      } else if (familyName) {
        name = familyName;
      }
    }

    // 이름이 없으면 기본값 사용 (실제 계정을 찾으면 DB의 이름 사용)
    if (!name) {
      name = 'Apple 사용자'; // 임시 이름 (기존 계정 찾으면 대체됨)
    }

    const socialData: SocialUserData = {
      email: email,
      name: name,
      photoURL: undefined, // 애플은 프로필 사진 제공 안 함
      providerId: 'apple.com',
      providerUid: credential.user, // 이것으로 기존 계정 찾기
      idToken: credential.identityToken || undefined,
      accessToken: credential.authorizationCode || undefined,
    };

    console.log('✅ 애플 로그인 완료:', { email: socialData.email, name: socialData.name });
    return socialData;
  } catch (error: any) {
    console.error('❌ 애플 로그인 실패:', error);
    
    // 사용자가 취소한 경우
    if (error.code === 'ERR_CANCELED' || error.code === 'ERR_REQUEST_CANCELED') {
      throw new Error('로그인이 취소되었습니다');
    }
    
    throw error;
  }
}

/**
 * 애플 로그아웃 (실제로는 credential 무효화가 필요 없음)
 */
export async function signOutApple(): Promise<void> {
  try {
    console.log('✅ 애플 로그아웃 완료');
  } catch (error) {
    console.error('애플 로그아웃 실패:', error);
    throw error;
  }
}

/**
 * 애플 로그인 사용 가능 여부 확인
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }
  
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch (error) {
    console.error('애플 로그인 사용 가능 여부 확인 실패:', error);
    return false;
  }
}
