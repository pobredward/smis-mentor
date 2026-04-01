import { auth } from './firebase';
import { signInWithCustomTokenFromFunction } from './firebaseService';

/**
 * 소셜 로그인 사용자를 Firebase Auth에 로그인시키는 헬퍼
 */
async function ensureFirebaseAuth(): Promise<string> {
  console.log('🔐 ensureFirebaseAuth 시작');
  
  // 이미 Firebase Auth에 로그인되어 있으면 토큰 반환
  if (auth.currentUser) {
    console.log('✅ Firebase Auth 사용자 확인:', {
      uid: auth.currentUser.uid,
      email: auth.currentUser.email,
    });
    const token = await auth.currentUser.getIdToken();
    console.log('✅ ID 토큰 발급 성공 (길이:', token.length, ')');
    return token;
  }
  
  console.log('⚠️ Firebase Auth 사용자 없음, 소셜 로그인 확인 중...');
  
  // 소셜 로그인 사용자인지 확인
  const socialUserStr = sessionStorage.getItem('social_user');
  if (socialUserStr) {
    try {
      const socialUser = JSON.parse(socialUserStr);
      console.log('📱 소셜 로그인 사용자 발견:', {
        userId: socialUser.userId,
        email: socialUser.email,
        name: socialUser.name,
      });
      
      // Firebase Custom Token으로 로그인
      console.log('🔑 Custom Token 생성 요청 중...');
      const userCredential = await signInWithCustomTokenFromFunction(
        socialUser.userId,
        socialUser.email
      );
      
      console.log('✅ Custom Token 로그인 성공:', {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
      });
      
      // ID 토큰 반환
      const token = await userCredential.user.getIdToken();
      console.log('✅ ID 토큰 발급 성공 (길이:', token.length, ')');
      return token;
    } catch (error: any) {
      console.error('❌ 소셜 로그인 사용자 Firebase Auth 연동 실패:', {
        error: error.message,
        code: error.code,
        stack: error.stack?.split('\n').slice(0, 3),
      });
      throw new Error('인증 처리에 실패했습니다. 다시 로그인해주세요.');
    }
  }
  
  console.error('❌ 로그인 정보 없음 (Firebase Auth, 소셜 로그인 모두 없음)');
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
