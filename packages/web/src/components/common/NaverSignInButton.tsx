'use client';
import { logger } from '@smis-mentor/shared';

import { useState } from 'react';
import { SiNaver } from 'react-icons/si';
import Button from './Button';

interface NaverSignInButtonProps {
  onSuccess: (socialData: any) => void;
  onError: (error: any) => void;
  text?: string;
  fullWidth?: boolean;
  disabled?: boolean;
}

export default function NaverSignInButton({
  onSuccess,
  onError,
  text = '네이버로 계속하기',
  fullWidth = true,
  disabled = false,
}: NaverSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleNaverSignIn = async () => {
    if (disabled) return; // ✅ disabled 상태면 무시
    
    setIsLoading(true);
    try {
      const { signInWithNaver } = await import('@/lib/naverAuthService');
      const result = await signInWithNaver();
      
      setIsLoading(false);
      onSuccess(result);
    } catch (error) {
      logger.error('네이버 로그인 오류:', error);
      setIsLoading(false);
      onError(error);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      fullWidth={fullWidth}
      onClick={handleNaverSignIn}
      isLoading={isLoading}
      disabled={disabled || isLoading} // ✅ disabled 또는 loading 중이면 비활성화
      className="!border-2 !border-[#03C75A] hover:!border-[#02B350] !bg-[#03C75A] hover:!bg-[#02B350] !text-white !font-medium !py-3"
    >
      {!isLoading && (
        <div className="flex items-center justify-center gap-3">
          <SiNaver className="w-5 h-5" />
          <span>{text}</span>
        </div>
      )}
    </Button>
  );
}
