import { NextRequest, NextResponse } from 'next/server';

const NAVER_CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_CLIENT_ID!;
const NAVER_CLIENT_SECRET = process.env.NEXT_PUBLIC_NAVER_CLIENT_SECRET!;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    
    // 에러 처리
    if (error) {
      console.error('네이버 로그인 에러:', error, errorDescription);
      return createErrorResponse(errorDescription || error);
    }
    
    if (!code || !state) {
      console.error('필수 파라미터 누락:', { code: !!code, state: !!state });
      return createErrorResponse('필수 정보가 누락되었습니다.');
    }
    
    console.log('🔐 네이버 OAuth 콜백 시작:', { code: code.substring(0, 10) + '...', state });
    
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
          state: state,
        }),
      }
    );
    
    const tokenData = await tokenResponse.json();
    console.log('📝 토큰 응답:', { 
      success: !!tokenData.access_token,
      error: tokenData.error 
    });
    
    if (!tokenData.access_token) {
      console.error('토큰 발급 실패:', tokenData);
      throw new Error(tokenData.error_description || 'Failed to get access token');
    }
    
    // 2. 사용자 정보 조회
    const profileResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });
    
    const profileData = await profileResponse.json();
    console.log('👤 프로필 응답:', { 
      resultcode: profileData.resultcode,
      hasResponse: !!profileData.response 
    });
    
    if (profileData.resultcode !== '00') {
      console.error('프로필 조회 실패:', profileData);
      throw new Error('Failed to get user profile');
    }
    
    const profile = profileData.response;
    console.log('✅ 사용자 정보 수신:', {
      email: profile.email,
      name: profile.name,
      id: profile.id?.substring(0, 5) + '...'
    });
    
    // 3. SocialUserData 생성 (Google과 동일한 구조)
    const userData = {
      email: profile.email,
      name: profile.name,
      photoURL: profile.profile_image || undefined,
      providerId: 'naver',
      providerUid: profile.id,
      phoneNumber: profile.mobile || profile.mobile_e164 || undefined,
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
              }, '${BASE_URL}');
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
    console.error('❌ 네이버 콜백 처리 오류:', error);
    return createErrorResponse(error instanceof Error ? error.message : '알 수 없는 오류');
  }
}

function createErrorResponse(errorMessage: string) {
  const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  
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
            }, '${BASE_URL}');
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
