import React, { ReactNode } from 'react';
import Header from './Header';
import { useAuth } from '@/contexts/AuthContext';

type LayoutProps = {
  children: ReactNode;
  requireAuth?: boolean;
  requireAdmin?: boolean;
};

export default function Layout({ children, requireAuth, requireAdmin }: LayoutProps) {
  const { currentUser, userData, loading } = useAuth();

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
          </div>
        </div>
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
      <footer className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            &copy; {new Date().getFullYear()} SMIS 채용 플랫폼. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
} 