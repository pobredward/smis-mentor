'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Loading from '@/components/common/Loading';
import Header from '@/components/common/Header';
import Footer from '@/components/common/Footer';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, authReady, userData, currentUser } = useAuth();
  
  // 디버깅 로그
  console.log('Admin Layout 렌더링:', {
    loading,
    authReady,
    hasCurrentUser: !!currentUser,
    hasUserData: !!userData,
    userRole: userData?.role || 'no role'
  });
  
  // 로딩 상태일 때
  if (loading || !authReady) {
    return <Loading fullScreen message="관리자 페이지 로딩 중..." />;
  }
  
  // 관리자가 아닐 때
  if (!userData || userData.role !== 'admin') {
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
  
  // 관리자인 경우 레이아웃 표시
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