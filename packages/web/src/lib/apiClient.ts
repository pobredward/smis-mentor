import { auth } from './firebase';

/**
 * 인증된 API 요청을 보내는 헬퍼 함수
 * Firebase ID Token을 Authorization 헤더에 자동으로 추가
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const currentUser = auth.currentUser;
  
  if (!currentUser) {
    throw new Error('로그인이 필요합니다.');
  }
  
  const idToken = await currentUser.getIdToken();
  
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
