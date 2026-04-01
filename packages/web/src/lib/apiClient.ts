import { auth } from './firebase';
import { signInWithCustomTokenFromFunction } from './firebaseService';

/**
 * 소셜 로그인 사용자를 Firebase Auth에 로그인시키는 헬퍼
 */
async function ensureFirebaseAuth(): Promise<string> {
  // 이미 Firebase Auth에 로그인되어 있으면 토큰 반환
  if (auth.currentUser) {
    return await auth.currentUser.getIdToken();
  }
  
  // 소셜 로그인 사용자인지 확인
  const socialUserStr = sessionStorage.getItem('social_user');
  if (socialUserStr) {
    try {
      const socialUser = JSON.parse(socialUserStr);
      
      // Firebase Custom Token으로 로그인
      const userCredential = await signInWithCustomTokenFromFunction(
        socialUser.userId,
        socialUser.email
      );
      
      // ID 토큰 반환
      return await userCredential.user.getIdToken();
    } catch (error) {
      console.error('소셜 로그인 사용자 Firebase Auth 연동 실패:', error);
      throw new Error('인증 처리에 실패했습니다. 다시 로그인해주세요.');
    }
  }
  
  throw new Error('로그인이 필요합니다.');
}

/**
 * 인증된 API 요청을 보내는 헬퍼 함수
 * Firebase ID Token을 Authorization 헤더에 자동으로 추가
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const idToken = await ensureFirebaseAuth();
  
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${idToken}`);
  headers.set('Content-Type', 'application/json');
  
  return fetch(url, {
    ...options,
    headers,
  });
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
