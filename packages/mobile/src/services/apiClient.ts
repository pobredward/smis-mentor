import Constants from 'expo-constants';
import { auth } from '../config/firebase';
import { logger } from '@smis-mentor/shared';

function getWebApiBaseUrl(): string {
  const url =
    Constants.expoConfig?.extra?.EXPO_PUBLIC_WEBSITE_URL ||
    process.env.EXPO_PUBLIC_WEBSITE_URL ||
    'https://smis-mentor.com';
  return url.replace(/\/$/, '');
}

async function getIdToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('로그인이 필요합니다.');
  }
  return user.getIdToken();
}

/**
 * 모바일 앱에서 웹 API Route를 인증된 상태로 호출합니다.
 */
export async function mobileAuthenticatedPost<T = unknown>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const baseUrl = getWebApiBaseUrl();
  const idToken = await getIdToken();

  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'API 요청 실패' }));
    throw new Error(error.error || error.message || 'API 요청 실패');
  }

  return response.json() as Promise<T>;
}

/**
 * 회원가입 후 주민등록번호를 암호화하여 서버에 저장합니다.
 */
export async function saveSensitiveInfo(params: {
  userId: string;
  rrnFront: string;
  rrnLast: string;
}): Promise<void> {
  try {
    await mobileAuthenticatedPost('/api/user/save-sensitive', params);
    logger.info('✅ 모바일 - 주민등록번호 암호화 저장 완료:', {
      userId: params.userId,
    });
  } catch (error) {
    logger.error('❌ 모바일 - 주민등록번호 저장 실패:', error);
    throw error;
  }
}
