"use client";

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { signOut } from '@/lib/firebaseService';
import { useRouter, usePathname } from 'next/navigation';
import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { User } from '@/types';
import { User as FirebaseUser } from 'firebase/auth';

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

const Header = () => {
  const { currentUser, userData } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isAdmin = userData?.role === 'admin';

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }
  }, [router]);

  const toggleProfileDropdown = useCallback(() => {
    setIsProfileDropdownOpen(prev => !prev);
  }, []);
  
  const closeProfileDropdown = useCallback(() => {
    setIsProfileDropdownOpen(false);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };
    
    const handleScroll = () => {
      setIsProfileDropdownOpen(false);
    };

    document.addEventListener('click', handleClickOutside);
    window.addEventListener('scroll', handleScroll);
    
    return () => {
      document.removeEventListener('click', handleClickOutside);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(path);
  };

  const navItems = [
    { name: '홈', path: '/' },
    { name: '채용', path: '/recruitment' },
    { name: '캠프', path: '/camp' },
    { name: '설정', path: '/settings' },
    { name: '마이페이지', path: '/profile' },
  ];

  if (isAdmin) {
    navItems.push({ name: '관리자', path: '/admin' });
  }

  return (
    <header className="sticky top-0 bg-white shadow-md z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/" className="text-xl font-bold text-blue-600">
              SMIS
            </Link>
            
            {/* 데스크탑 네비게이션 메뉴 */}
            <nav className="hidden md:flex items-center ml-8 space-x-6">
              {navItems.map((item) => (
                <Link 
                  key={item.path}
                  href={item.path} 
                  className={`text-sm font-medium transition-colors ${
                    isActive(item.path)
                      ? 'text-blue-600'
                      : 'text-gray-700 hover:text-gray-900'
                  }`}
                >
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center">
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
    </header>
  );
};

export default memo(Header); 