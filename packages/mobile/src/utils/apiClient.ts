import { auth } from '../config/firebase';
import { logger } from '@smis-mentor/shared';

const WEB_API_URL = process.env.EXPO_PUBLIC_WEB_API_URL || 'http://localhost:3000';

/**
 * 현재 Firebase 로그인 사용자의 ID Token을 반환합니다.
 * currentUser가 null이면 onAuthStateChanged로 최대 10초 대기하여 race condition을 방지합니다.
 * onAuthStateChanged는 Auth 초기화 직후 null을 emit할 수 있으므로,
 * null 콜백이 오면 추가로 최대 3초 더 기다립니다.
 */
async function getCurrentUserToken(forceRefresh = false): Promise<string> {
  if (auth.currentUser) {
    try {
      return await auth.currentUser.getIdToken(forceRefresh);
    } catch (error) {
      logger.warn('getIdToken 실패, 재시도:', error);
    }
  }

  return new Promise((resolve, reject) => {
    const TOTAL_TIMEOUT = 10000;
    const NULL_WAIT = 3000; // null 콜백 이후 추가 대기

    let totalTimer: ReturnType<typeof setTimeout>;
    let nullTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    const cleanup = () => {
      clearTimeout(totalTimer);
      if (nullTimer) clearTimeout(nullTimer);
      if (unsubscribe) unsubscribe();
    };

    totalTimer = setTimeout(() => {
      cleanup();
      reject(new Error('인증 정보를 불러오는데 시간이 초과되었습니다. 다시 로그인해주세요.'));
    }, TOTAL_TIMEOUT);

    unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        cleanup();
        try {
          const token = await user.getIdToken(forceRefresh);
          resolve(token);
        } catch (error) {
          logger.error('토큰 가져오기 실패:', error);
          reject(new Error('인증 토큰을 가져올 수 없습니다. 다시 로그인해주세요.'));
        }
      } else {
        // null이 오면 Auth가 아직 초기화 중일 수 있으므로 추가 대기
        // (이미 nullTimer가 있으면 중복 설정 방지)
        if (!nullTimer) {
          nullTimer = setTimeout(() => {
            cleanup();
            reject(new Error('로그인이 필요합니다.'));
          }, NULL_WAIT);
        }
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

  const response = await fetch(`${WEB_API_URL}${path}`, {
    ...options,
    headers,
  });

  // 401이 오면 토큰 만료일 수 있으므로 강제 갱신 후 1회 재시도
  if (response.status === 401) {
    logger.warn('401 수신 → 토큰 강제 갱신 후 재시도');
    const freshToken = await getCurrentUserToken(true);
    const retryHeaders = new Headers(options.headers);
    retryHeaders.set('Authorization', `Bearer ${freshToken}`);
    retryHeaders.set('Content-Type', 'application/json');
    return fetch(`${WEB_API_URL}${path}`, {
      ...options,
      headers: retryHeaders,
    });
  }

  return response;
}
