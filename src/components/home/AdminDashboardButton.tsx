'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminDashboardButton() {
  const { userData } = useAuth();
  
  if (userData?.role !== 'admin') return null;
  
  return (
    <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="ml-3">
          <Link
            href="/admin"
            className="text-blue-700 hover:text-blue-800 font-medium"
          >
            관리자 대시보드 바로가기
          </Link>
        </div>
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
    </div>
  );
} 