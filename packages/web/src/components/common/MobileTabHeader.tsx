"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { memo } from 'react';

interface MobileTabHeaderProps {
  title: string;
  showBackButton?: boolean;
  rightButton?: React.ReactNode;
}

const MobileTabHeader = ({ title, showBackButton = false, rightButton }: MobileTabHeaderProps) => {
  const { currentUser, userData } = useAuth();
  const router = useRouter();

  return (
    <div className="md:hidden bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="flex items-center justify-between h-14 px-4">
        {/* 왼쪽: 뒤로가기 또는 프로필 */}
        <div className="w-10">
          {showBackButton ? (
            <button
              onClick={() => router.back()}
              className="p-2 rounded-full hover:bg-gray-100"
            >
              <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => router.push('/profile')}
              className="flex items-center justify-center h-8 w-8 rounded-full bg-gray-200"
            >
              {currentUser && userData?.profileImage ? (
                <img 
                  src={userData.profileImage} 
                  alt="프로필" 
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              )}
            </button>
          )}
        </div>
        
        {/* 중앙: 제목 */}
        <h1 className="text-lg font-bold text-gray-900 flex-1 text-center">{title}</h1>
        
        {/* 오른쪽: 커스텀 버튼 또는 공백 */}
        <div className="w-10 flex justify-end">
          {rightButton}
        </div>
      </div>
    </div>
  );
};

export default memo(MobileTabHeader);
