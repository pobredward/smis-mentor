import { auth } from './firebase';
import { logger } from '@smis-mentor/shared';

/**
 * 현재 사용자의 ID Token을 가져옴 (Auth 초기화 대기)
 */
async function getCurrentUserToken(): Promise<string> {
  // 이미 currentUser가 있으면 바로 토큰 반환
  if (auth.currentUser) {
    return auth.currentUser.getIdToken();
  }
  
  // Auth 초기화 대기 (최대 5초)
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
 * 인증된 API 요청을 보내는 헬퍼 함수
 * Firebase ID Token을 Authorization 헤더에 자동으로 추가
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  try {
    const idToken = await getCurrentUserToken();
    
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${idToken}`);
    headers.set('Content-Type', 'application/json');
    
    return fetch(url, {
      ...options,
      headers,
    });
  } catch (error) {
    logger.error('인증된 요청 실패:', error);
    throw error;
  }
}

/**
 * 인증된 POST 요청
 */
export async function authenticatedPost<T = any>(
  url: string,
  body?: any
): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'API 요청 실패' }));
    throw new Error(error.message || error.error || 'API 요청 실패');
  }
  
  return response.json();
}

/**
 * 인증된 GET 요청
 */
export async function authenticatedGet<T = any>(
  url: string
): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'GET',
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'API 요청 실패' }));
    throw new Error(error.message || error.error || 'API 요청 실패');
  }
  
  return response.json();
}

/**
 * 인증된 PUT 요청
 */
export async function authenticatedPut<T = any>(
  url: string,
  body?: any
): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'API 요청 실패' }));
    throw new Error(error.message || error.error || 'API 요청 실패');
  }
  
  return response.json();
}

/**
 * 인증된 DELETE 요청
 */
export async function authenticatedDelete<T = any>(
  url: string
): Promise<T> {
  const response = await authenticatedFetch(url, {
    method: 'DELETE',
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'API 요청 실패' }));
    throw new Error(error.message || error.error || 'API 요청 실패');
  }
  
  return response.json();
}
