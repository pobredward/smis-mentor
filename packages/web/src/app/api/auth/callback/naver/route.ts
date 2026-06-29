import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || process.env.NEXT_PUBLIC_NAVER_CLIENT_ID!;
// Client Secret은 서버 전용 환경변수로만 사용 (NEXT_PUBLIC_ 접두사 사용 금지)
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET!;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

// www/non-www 모두 허용하는 origin 목록 (postMessage target 검증용)
const ALLOWED_ORIGINS = [
  BASE_URL,
  BASE_URL.replace('https://www.', 'https://'),
  BASE_URL.replace('https://', 'https://www.'),
  'http://localhost:3000',
].filter((v, i, arr) => arr.indexOf(v) === i); // 중복 제거

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    
    // 에러 처리
    if (error) {
      logger.error('네이버 로그인 에러:', error, errorDescription);
      return createErrorResponse(errorDescription || error);
    }
    
    if (!code || !state) {
      logger.error('필수 파라미터 누락:', { code: !!code, state: !!state });
      return createErrorResponse('필수 정보가 누락되었습니다.');
    }
    
    // state에서 origin 분리 (형식: "randomState__encodedOrigin")
    const [pureState, encodedOrigin] = state.split('__');
    const requestOrigin = encodedOrigin ? decodeURIComponent(encodedOrigin) : null;
    
    // 허용된 origin 검증 후 postMessage target 결정
    const targetOrigin = (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin))
      ? requestOrigin
      : BASE_URL;
    
    logger.info('🔐 네이버 OAuth 콜백 시작:', { 
      code: code.substring(0, 10) + '...', 
      state: pureState,
      targetOrigin,
    });
    
    // 1. Access Token 발급
    const tokenResponse = await fetch(
      'https://nid.naver.com/oauth2.0/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: NAVER_CLIENT_ID,
          client_secret: NAVER_CLIENT_SECRET,
          code: code,
          state: pureState, // origin이 제거된 순수 state 값
        }),
      }
    );
    
    const tokenData = await tokenResponse.json();
    logger.info('📝 토큰 응답:', { 
      success: !!tokenData.access_token,
      error: tokenData.error 
    });
    
    if (!tokenData.access_token) {
      logger.error('토큰 발급 실패:', tokenData);
      throw new Error(tokenData.error_description || 'Failed to get access token');
    }
    
    // 2. 사용자 정보 조회
    const profileResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });
    
    const profileData = await profileResponse.json();
    logger.info('👤 프로필 응답:', { 
      resultcode: profileData.resultcode,
      hasResponse: !!profileData.response 
    });
    
    if (profileData.resultcode !== '00') {
      logger.error('프로필 조회 실패:', profileData);
      throw new Error('Failed to get user profile');
    }
    
    const profile = profileData.response;
    logger.info('✅ 사용자 정보 수신:', {
      email: profile.email,
      name: profile.name,
      id: profile.id?.substring(0, 5) + '...'
    });
    
    // 3. SocialUserData 생성 (Google과 동일한 구조)
    const userData = {
      email: profile.email,
      name: profile.name,
      ...(profile.profile_image && { photoURL: profile.profile_image }),
      providerId: 'naver',
      providerUid: profile.id,
      ...(( profile.mobile || profile.mobile_e164) && { phoneNumber: profile.mobile || profile.mobile_e164 }),
    };
    
    // 4. 팝업 창에 메시지 전송 (Google과 동일한 방식)
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>네이버 로그인</title>
        </head>
        <body>
          <script>
            console.log('네이버 로그인 성공 - opener에게 메시지 전송');
            if (window.opener) {
              window.opener.postMessage({
                type: 'NAVER_LOGIN_SUCCESS',
                userData: ${JSON.stringify(userData)}
              }, '${targetOrigin}');
              setTimeout(() => window.close(), 500);
            } else {
              console.error('opener가 없습니다. 메인 페이지로 리다이렉트');
              window.location.href = '/sign-in';
            }
          </script>
        </body>
      </html>
      `,
      {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      }
    );
  } catch (error) {
    logger.error('❌ 네이버 콜백 처리 오류:', error);
    // state에서 origin 파싱 (catch 블록에서는 위에서 파싱한 값을 사용하지 못할 수 있으므로 재파싱)
    const stateParam = request.nextUrl.searchParams.get('state');
    const fallbackOrigin = stateParam?.includes('__')
      ? decodeURIComponent(stateParam.split('__')[1])
      : undefined;
    return createErrorResponse(
      error instanceof Error ? error.message : '알 수 없는 오류',
      ALLOWED_ORIGINS.includes(fallbackOrigin ?? '') ? fallbackOrigin : undefined
    );
  }
}

function createErrorResponse(errorMessage: string, targetOrigin?: string) {
  const resolvedOrigin = targetOrigin || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
  return new NextResponse(
    `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <title>로그인 오류</title>
      </head>
      <body>
        <script>
          console.error('네이버 로그인 오류:', '${errorMessage}');
          if (window.opener) {
            window.opener.postMessage({
              type: 'NAVER_LOGIN_ERROR',
              error: '${errorMessage}'
            }, '${resolvedOrigin}');
            setTimeout(() => window.close(), 500);
          } else {
            window.location.href = '/sign-in?error=callback_failed';
          }
        </script>
      </body>
    </html>
    `,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    }
  );
}
