import { logger } from '@smis-mentor/shared';
import { auth } from '../config/firebase';

const API_BASE_URL = process.env.EXPO_PUBLIC_WEB_API_URL || 'https://www.smis-mentor.com';

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

/**
 * 인증된 API 요청을 보내는 함수
 * Authorization 헤더에 Firebase ID Token을 자동으로 추가
 */
export async function authenticatedPost<T = any>(
  endpoint: string,
  data?: any
): Promise<T> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    }

    // Firebase ID Token 가져오기
    const idToken = await currentUser.getIdToken();

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(data),
    });

    // 응답 텍스트 먼저 가져오기
    const responseText = await response.text();
    
    // JSON 파싱 시도
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      logger.error('[API Client] JSON 파싱 실패:', {
        endpoint,
        status: response.status,
        responseText: responseText.substring(0, 500), // 처음 500자만
      });
      throw new Error(`서버 응답을 처리할 수 없습니다. (${response.status})`);
    }

    if (!response.ok) {
      throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
    }

    return responseData;
  } catch (error: any) {
    logger.error('[API Client] 요청 실패:', {
      endpoint,
      error: error.message,
    });
    throw error;
  }
}

/**
 * 인증된 GET 요청
 */
export async function authenticatedGet<T = any>(endpoint: string): Promise<T> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('인증이 필요합니다. 다시 로그인해주세요.');
    }

    const idToken = await currentUser.getIdToken();

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
    });

    // 응답 텍스트 먼저 가져오기
    const responseText = await response.text();
    
    // JSON 파싱 시도
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      logger.error('[API Client] JSON 파싱 실패:', {
        endpoint,
        status: response.status,
        responseText: responseText.substring(0, 500), // 처음 500자만
      });
      throw new Error(`서버 응답을 처리할 수 없습니다. (${response.status})`);
    }

    if (!response.ok) {
      throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
    }

    return responseData;
  } catch (error: any) {
    logger.error('[API Client] 요청 실패:', {
      endpoint,
      error: error.message,
    });
    throw error;
  }
}
