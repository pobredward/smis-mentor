"use client";

import React, { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';
import BottomNavigation from './BottomNavigation';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Button from './Button';

type LayoutProps = {
  children: ReactNode;
  requireAuth?: boolean;
  requireAdmin?: boolean;
  noPadding?: boolean;
};

export default function Layout({ children, requireAuth, requireAdmin, noPadding }: LayoutProps) {
  const { isAuthenticated, userData, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const redirectToLogin = () => {
    router.push(`/sign-in?redirect=${encodeURIComponent(pathname)}`);
  };

  const shouldHideFooter = pathname.startsWith('/camp') || pathname.startsWith('/admin');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-gray-900">접근 권한이 없습니다</h1>
            <p className="mt-2 text-sm text-gray-500">로그인 후 이용해 주세요.</p>
            <div className="mt-6">
              <Button
                variant="primary"
                onClick={redirectToLogin}
              >
                로그인하기
              </Button>
            </div>
          </div>
        </div>
        {!shouldHideFooter && <Footer />}
      </div>
    );
  }

  if (requireAdmin && userData?.role !== 'admin') {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="max-w-7xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-gray-900">관리자 권한이 필요합니다</h1>
            <p className="mt-2 text-sm text-gray-500">이 페이지는 관리자만 접근할 수 있습니다.</p>
          </div>
        </div>
        {!shouldHideFooter && <Footer />}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow pb-20 md:pb-0">
        {noPadding ? (
          children
        ) : (
          <div className={`max-w-7xl mx-auto ${
            pathname.startsWith('/admin') 
              ? 'py-3 px-2 sm:py-4 sm:px-4 lg:px-8' 
              : 'py-6 px-4 sm:px-6 lg:px-8'
          }`}>
            {children}
          </div>
        )}
      </main>
      {!shouldHideFooter && <Footer />}
      <BottomNavigation />
    </div>
  );
} 