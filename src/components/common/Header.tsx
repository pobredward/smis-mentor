import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { signOut } from '@/lib/firebaseService';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

export default function Header() {
  const { currentUser, userData } = useAuth();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/');
    } catch (error) {
      console.error('로그아웃 오류:', error);
    }
  };

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
          <div className="flex items-center">
            {/* 햄버거 메뉴 버튼 (모바일) - 왼쪽으로 이동 */}
            <button
              className="md:hidden hamburger-button p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
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
          
          {/* 데스크탑 네비게이션 */}
          <nav className="hidden md:flex items-center space-x-4">
            <Link href="/job-board" className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50">
              공고 목록
            </Link>
            {userData?.role === 'admin' && (
              <Link href="/admin" className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50">
                관리자 대시보드
              </Link>
            )}
            {currentUser && userData?.role !== 'admin' && (
              <Link href="/profile/job-apply" className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50">
                지원 현황
              </Link>
            )}
          </nav>
          
          <div className="flex items-center">
            {/* 프로필 아이콘 (로그인 상태일 때) */}
            {currentUser ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                  className="flex items-center justify-center h-8 w-8 rounded-full bg-gray-200 focus:outline-none"
                >
                  {userData?.profileImage ? (
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
                {isProfileDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-10">
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
                      onClick={() => setIsProfileDropdownOpen(false)}
                    >
                      내 정보
                    </Link>
                    <Link 
                      href="/profile/job-apply" 
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setIsProfileDropdownOpen(false)}
                    >
                      지원 현황
                    </Link>
                    <button
                      onClick={() => {
                        setIsProfileDropdownOpen(false);
                        handleSignOut();
                      }}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      로그아웃
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="hidden md:flex space-x-4">
                <Link
                  href="/sign-in"
                  className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                >
                  로그인
                </Link>
                <Link
                  href="/sign-up"
                  className="px-3 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700"
                >
                  회원가입
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* 모바일 메뉴 패널 */}
      <div
        ref={mobileMenuRef}
        className={`md:hidden fixed inset-y-0 left-0 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out z-30 ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-xl font-bold text-blue-600" onClick={() => setIsMenuOpen(false)}>
              SMIS
            </Link>
            <button
              className="p-2 rounded-md text-gray-600 hover:text-gray-900 focus:outline-none"
              onClick={() => setIsMenuOpen(false)}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <nav className="p-4">
          <ul className="space-y-2">
            <li>
              <Link
                href="/job-board"
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                onClick={() => setIsMenuOpen(false)}
              >
                공고 목록
              </Link>
            </li>
            {userData?.role === 'admin' && (
              <li>
                <Link
                  href="/admin"
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                  onClick={() => setIsMenuOpen(false)}
                >
                  관리자 대시보드
                </Link>
              </li>
            )}
            {currentUser && userData?.role !== 'admin' && (
              <li>
                <Link
                  href="/profile/job-apply"
                  className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                  onClick={() => setIsMenuOpen(false)}
                >
                  지원 현황
                </Link>
              </li>
            )}
            {!currentUser ? (
              <>
                <li>
                  <Link
                    href="/sign-in"
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    로그인
                  </Link>
                </li>
                <li>
                  <Link
                    href="/sign-up"
                    className="block px-3 py-2 rounded-md text-base font-medium bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    회원가입
                  </Link>
                </li>
              </>
            ) : (
              <li>
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    handleSignOut();
                  }}
                  className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                >
                  로그아웃
                </button>
              </li>
            )}
          </ul>
        </nav>
      </div>
      
      {/* 배경 오버레이 (모바일 메뉴가 열려있을 때) */}
      {isMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black bg-opacity-50 z-20"
          onClick={() => setIsMenuOpen(false)}
        ></div>
      )}
    </header>
  );
} 