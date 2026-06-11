import { auth } from '../config/firebase';
import { logger } from '@smis-mentor/shared';

const WEB_API_URL = process.env.EXPO_PUBLIC_WEB_API_URL || 'http://localhost:3000';

/**
 * 현재 Firebase 로그인 사용자의 ID Token을 반환합니다.
 * Auth 초기화가 아직 완료되지 않은 경우 최대 5초 대기합니다.
 */
async function getCurrentUserToken(): Promise<string> {
  if (auth.currentUser) {
    return auth.currentUser.getIdToken();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error('인증 정보를 불러오는데 시간이 초과되었습니다. 다시 로그인해주세요.'));
    }, 5000);

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      clearTimeout(timeout);
      unsubscribe();

      if (user) {
        try {
          const token = await user.getIdToken();
          resolve(token);
        } catch (error) {
          logger.error('토큰 가져오기 실패:', error);
          reject(new Error('인증 토큰을 가져올 수 없습니다. 다시 로그인해주세요.'));
        }
      } else {
        reject(new Error('로그인이 필요합니다.'));
      }
    });
  });
}

/**
 * Firebase ID Token을 Authorization 헤더에 자동으로 추가하여 웹 API에 요청을 보냅니다.
 * path는 '/api/...' 형태의 경로를 전달합니다.
 */
export async function authenticatedFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const idToken = await getCurrentUserToken();

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${idToken}`);
  headers.set('Content-Type', 'application/json');

  return fetch(`${WEB_API_URL}${path}`, {
    ...options,
    headers,
  });
}
