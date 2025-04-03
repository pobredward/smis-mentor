"use client";

import React, { ReactNode } from 'react';
import Header from './Header';
import Footer from './Footer';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Button from './Button';

type LayoutProps = {
  children: ReactNode;
  requireAuth?: boolean;
  requireAdmin?: boolean;
};

export default function Layout({ children, requireAuth, requireAdmin }: LayoutProps) {
  const { currentUser, userData, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // 로그인이 필요한 페이지로 리디렉션
  const redirectToLogin = () => {
    router.push(`/sign-in?redirect=${encodeURIComponent(pathname)}`);
  };

  // 로딩 중 표시
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  // 인증이 필요한 페이지에서 인증 되지 않았을 때
  if (requireAuth && !currentUser) {
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
        <Footer />
      </div>
    );
  }

  // 관리자 권한이 필요한 페이지에서 관리자가 아닐 때
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
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-grow">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  );
} 