"use client";

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { signOut } from '@/lib/firebaseService';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback, memo, forwardRef } from 'react';
import { User } from '@/types';
import { User as FirebaseUser } from 'firebase/auth';

// 프로필 드롭다운 메뉴 컴포넌트를 분리하여 최적화
const ProfileDropdown = memo(({ 
  isOpen, 
  onClose,
  currentUser, 
  userData, 
  onSignOut 
}: { 
  isOpen: boolean;
  onClose: () => void;
  currentUser: FirebaseUser | null; 
  userData: User | null; 
  onSignOut: () => void;
}) => {
  if (!isOpen) return null;
  
  return (
    <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10">
      {currentUser ? (
        <>
          <div className="px-4 py-2 border-b">
            <p className="text-sm font-medium text-gray-900 truncate">
              {userData?.name || '사용자'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {userData?.email || ''}
            </p>
          </div>
          <Link 
            href="/profile" 
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            onClick={onClose}
          >
            내 정보
          </Link>
          
          <button
            onClick={() => {
              onClose();
              onSignOut();
            }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            로그아웃
          </button>
        </>
      ) : (
        <>
          <Link 
            href="/sign-in" 
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            onClick={onClose}
          >
            로그인
          </Link>
          <Link 
            href="/sign-up" 
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
            onClick={onClose}
          >
            회원가입
          </Link>
        </>
      )}
    </div>
  );
});

ProfileDropdown.displayName = 'ProfileDropdown';

// 모바일 메뉴 컴포넌트를 분리하여 최적화 - forwardRef 사용
const MobileMenu = memo(forwardRef<HTMLDivElement, { 
  isOpen: boolean;
  onClose: () => void;
  userData: User | null;
}>(({ isOpen, onClose, userData }, ref) => {
  return (
    <div
      ref={ref}
      className={`md:hidden fixed inset-y-0 left-0 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out z-30 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600" onClick={onClose}>
            SMIS
          </Link>
          <button
            className="p-2 rounded-md text-gray-600 hover:text-gray-900 focus:outline-none"
            onClick={onClose}
          >
            <svg
              className="h-6 w-6"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
      
      <nav className="p-4">
        <div className="space-y-2">
          <Link
            href="/job-board"
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
            onClick={onClose}
          >
            공고 목록
          </Link>
          <Link
            href="/profile/job-apply"
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
            onClick={onClose}
          >
            지원 현황
          </Link>
          <Link
            href="/reviews"
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
            onClick={onClose}
          >
            참여 후기
          </Link>
          <Link
            href="/profile"
            className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
            onClick={onClose}
          >
            내 정보
          </Link>
          {userData?.role === 'admin' && (
            <Link
              href="/admin"
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
              onClick={onClose}
            >
              관리자
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}));

MobileMenu.displayName = 'MobileMenu';

const Header = () => {
  const { currentUser, userData } = useAuth();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // 로그아웃 핸들러를 useCallback으로 메모이제이션
  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }
  }, [router]);

  // 드롭다운 토글 함수 메모이제이션
  const toggleProfileDropdown = useCallback(() => {
    setIsProfileDropdownOpen(prev => !prev);
  }, []);
  
  // 드롭다운 닫기 함수 메모이제이션
  const closeProfileDropdown = useCallback(() => {
    setIsProfileDropdownOpen(false);
  }, []);
  
  // 모바일 메뉴 토글 함수 메모이제이션
  const toggleMobileMenu = useCallback(() => {
    setIsMenuOpen(prev => !prev);
  }, []);
  
  // 모바일 메뉴 닫기 함수 메모이제이션
  const closeMobileMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node) && 
          !(event.target as Element).closest('.hamburger-button')) {
        setIsMenuOpen(false);
      }
    };
    
    // 스크롤 시 메뉴 닫기
    const handleScroll = () => {
      setIsMenuOpen(false);
      setIsProfileDropdownOpen(false);
    };

    document.addEventListener('click', handleClickOutside);
    window.addEventListener('scroll', handleScroll);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <header className="bg-white shadow-md relative z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* 모바일 햄버거 메뉴 버튼 */}
          <div className="flex items-center md:hidden">
            <button
              className="hamburger-button p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none"
              onClick={toggleMobileMenu}
            >
              <svg
                className={`h-6 w-6 transition-transform duration-200 ${isMenuOpen ? 'transform rotate-90' : ''}`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>

          {/* 로고 */}
          <div className={`flex items-center ${!currentUser ? 'md:ml-0' : ''} ${currentUser ? 'md:ml-0' : ''}`}>
            <Link href="/" className="text-xl font-bold text-blue-600">
              SMIS
            </Link>
            {/* 데스크탑 네비게이션 메뉴 */}
            <nav className="hidden md:flex items-center ml-8 space-x-6">
              <Link href="/job-board" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                공고 목록
              </Link>
              <Link href="/profile/job-apply" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                지원 현황
              </Link>
              <Link href="/reviews" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                참여 후기
              </Link>
            </nav>
          </div>

          {/* 오른쪽 영역 - 로그인 관련 */}
          <div className="flex items-center">
            {/* 관리자 메뉴 */}
            <nav className="hidden md:flex items-center">
              {userData?.role === 'admin' && (
                <Link href="/admin" className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50">
                  관리자
                </Link>
              )}
            </nav>
            
            {/* 프로필 아이콘 */}
            <div className="relative ml-4" ref={dropdownRef}>
              <button
                onClick={toggleProfileDropdown}
                className="flex items-center justify-center h-8 w-8 rounded-full bg-gray-200 focus:outline-none"
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
              
              {/* 프로필 드롭다운 메뉴 */}
              <ProfileDropdown 
                isOpen={isProfileDropdownOpen} 
                onClose={closeProfileDropdown}
                currentUser={currentUser}
                userData={userData}
                onSignOut={handleSignOut}
              />
            </div>
          </div>
        </div>
      </div>
      
      {/* 모바일 메뉴 패널 */}
      <MobileMenu 
        isOpen={isMenuOpen} 
        onClose={closeMobileMenu}
        userData={userData}
        ref={mobileMenuRef}
      />
      
      {/* 배경 오버레이 (모바일 메뉴가 열려있을 때) */}
      {isMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-20"
          onClick={closeMobileMenu}
        ></div>
      )}
    </header>
  );
};

export default memo(Header); 