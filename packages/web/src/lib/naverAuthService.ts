import { SocialUserData } from '@smis-mentor/shared';
import { logger } from '@smis-mentor/shared';

const NAVER_CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID!;
const NAVER_CALLBACK_URL = process.env.NEXT_PUBLIC_NAVER_CALLBACK_URL!;
const NAVER_STATE_KEY = 'naver_oauth_state';

/**
 * 네이버 로그인 URL 생성
 */
export function getNaverLoginUrl(): string {
  // CSRF 방지를 위한 state 생성
  const state = Math.random().toString(36).substring(2, 15);
  
  // state를 sessionStorage에 저장
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(NAVER_STATE_KEY, state);
  }
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: NAVER_CLIENT_ID,
    redirect_uri: NAVER_CALLBACK_URL,
    state: state,
  });
  
  return `https://nid.naver.com/oauth2.0/authorize?${params.toString()}`;
}

/**
 * 네이버 팝업 로그인
 */
export async function signInWithNaverPopup(): Promise<SocialUserData> {
  return new Promise((resolve, reject) => {
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const loginUrl = getNaverLoginUrl();
    logger.info('🟢 네이버 로그인 URL:', loginUrl);
    
    const popup = window.open(
      loginUrl,
      'Naver Login',
      `width=${width},height=${height},left=${left},top=${top}`
    );
    
    if (!popup) {
      logger.error('❌ 팝업이 차단되었습니다');
      reject(new Error('POPUP_BLOCKED'));
      return;
    }
    
    logger.info('✅ 팝업 창이 열렸습니다');
    
    // 팝업에서 메시지 수신
    const messageHandler = (event: MessageEvent) => {
      logger.info('📨 메시지 수신:', {
        origin: event.origin,
        windowOrigin: window.location.origin,
        type: event.data?.type,
      });
      
      // 보안: origin 체크
      if (event.origin !== window.location.origin) {
        logger.warn('⚠️ Origin 불일치, 무시:', event.origin);
        return;
      }
      
      if (event.data.type === 'NAVER_LOGIN_SUCCESS') {
        logger.info('✅ 네이버 로그인 성공:', event.data.userData);
        window.removeEventListener('message', messageHandler);
        clearInterval(checkClosed);
        popup.close();
        resolve(event.data.userData);
      } else if (event.data.type === 'NAVER_LOGIN_ERROR') {
        logger.error('❌ 네이버 로그인 에러:', event.data.error);
        window.removeEventListener('message', messageHandler);
        clearInterval(checkClosed);
        popup.close();
        reject(new Error(event.data.error));
      }
    };
    
    window.addEventListener('message', messageHandler);
    
    // 팝업이 닫혔는지 체크
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        logger.warn('⚠️ 팝업이 닫혔습니다 (사용자가 닫았거나 콜백 실패)');
        clearInterval(checkClosed);
        window.removeEventListener('message', messageHandler);
        reject(new Error('POPUP_CLOSED'));
      }
    }, 500);
  });
}

/**
 * 네이버 로그인 메인 함수 (Google과 동일한 구조)
 */
export async function signInWithNaver(): Promise<SocialUserData> {
  return await signInWithNaverPopup();
}

/**
 * 네이버 로그인 에러 처리 (Google과 동일한 구조)
 */
export function handleNaverAuthError(error: any): string {
  const errorMessage = error?.message || '';
  
  if (errorMessage === 'POPUP_BLOCKED') {
    return '팝업이 차단되었습니다. 브라우저 설정에서 팝업 차단을 해제한 후 다시 시도해주세요.';
  } else if (errorMessage === 'POPUP_CLOSED') {
    return '로그인 창이 닫혔습니다. 다시 시도해주세요.';
  } else if (errorMessage.includes('network')) {
    return '네트워크 연결을 확인해주세요.';
  } else if (errorMessage.includes('cancelled')) {
    return '로그인이 취소되었습니다.';
  }
  
  return error?.message || '네이버 로그인 중 오류가 발생했습니다.';
}
