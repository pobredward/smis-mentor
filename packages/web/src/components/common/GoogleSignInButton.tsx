'use client';

import { useState } from 'react';
import { FcGoogle } from 'react-icons/fc';
import Button from './Button';

interface GoogleSignInButtonProps {
  onSuccess: (socialData: any) => void;
  onError: (error: any) => void;
  text?: string;
  fullWidth?: boolean;
}

export default function GoogleSignInButton({
  onSuccess,
  onError,
  text = 'Google로 계속하기',
  fullWidth = true,
}: GoogleSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      console.log('🔵 Google 로그인 버튼 클릭');
      console.log('User Agent:', navigator.userAgent);
      
      const { signInWithGoogle } = await import('@/lib/googleAuthService');
      console.log('⏳ signInWithGoogle 실행 중...');
      
      const result = await signInWithGoogle();
      console.log('📦 signInWithGoogle 결과:', result);
      
      if (result === 'redirect') {
        // 리다이렉트가 시작되었으므로 로딩 상태 유지
        console.log('🔄 리다이렉트 모드 - Google 로그인 페이지로 이동 중...');
        return;
      }
      
      // 팝업 방식의 경우 즉시 결과 전달
      console.log('✅ 팝업 모드 - 로그인 성공');
      onSuccess(result);
    } catch (error) {
      console.error('❌ Google 로그인 오류:', error);
      onError(error);
      setIsLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      fullWidth={fullWidth}
      onClick={handleGoogleSignIn}
      isLoading={isLoading}
      className="!border-2 !border-gray-300 hover:!border-gray-400 !bg-white hover:!bg-gray-50 !text-gray-700 !font-medium !py-3"
    >
      {!isLoading && (
        <div className="flex items-center justify-center gap-3">
          <FcGoogle className="w-5 h-5" />
          <span>{text}</span>
        </div>
      )}
    </Button>
  );
}
