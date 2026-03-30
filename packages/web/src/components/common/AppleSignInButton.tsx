'use client';

import { useState } from 'react';
import { FaApple } from 'react-icons/fa';
import Button from './Button';

interface AppleSignInButtonProps {
  onSuccess: (socialData: any) => void;
  onError: (error: any) => void;
  text?: string;
  fullWidth?: boolean;
  disabled?: boolean;
}

export default function AppleSignInButton({
  onSuccess,
  onError,
  text = 'Apple로 계속하기',
  fullWidth = true,
  disabled = false,
}: AppleSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleAppleSignIn = async () => {
    if (disabled) return;
    
    setIsLoading(true);
    try {
      const { signInWithApple } = await import('@/lib/appleAuthService');
      const result = await signInWithApple();
      
      setIsLoading(false);
      onSuccess(result);
    } catch (error) {
      console.error('Apple 로그인 오류:', error);
      setIsLoading(false);
      onError(error);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      fullWidth={fullWidth}
      onClick={handleAppleSignIn}
      isLoading={isLoading}
      disabled={disabled || isLoading}
      className="!border-2 !border-black hover:!border-gray-800 !bg-black hover:!bg-gray-900 !text-white !font-medium !py-3"
    >
      {!isLoading && (
        <div className="flex items-center justify-center gap-3">
          <FaApple className="w-5 h-5" />
          <span>{text}</span>
        </div>
      )}
    </Button>
  );
}
