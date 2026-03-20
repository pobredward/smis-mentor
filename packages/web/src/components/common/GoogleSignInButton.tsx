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
      const { signInWithGoogle } = await import('@/lib/googleAuthService');
      const result = await signInWithGoogle();
      
      setIsLoading(false);
      onSuccess(result);
    } catch (error) {
      console.error('Google 로그인 오류:', error);
      setIsLoading(false);
      onError(error);
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
