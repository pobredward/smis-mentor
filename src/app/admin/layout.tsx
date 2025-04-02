'use client';

import React from 'react';
import Layout from '@/components/common/Layout';
import { useAuth } from '@/contexts/AuthContext';
import Loading from '@/components/common/Loading';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, authReady } = useAuth();
  
  // 로딩 상태일 때
  if (loading || !authReady) {
    return <Loading fullScreen message="관리자 페이지 로딩 중..." />;
  }
  
  // 관리자 권한을 가진 레이아웃 반환
  return <Layout requireAuth requireAdmin>{children}</Layout>;
} 