'use client';

import { useState, useEffect, useMemo } from 'react';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { getAllUsers } from '@/lib/firebaseService';
import { User } from '@/types';
import toast from 'react-hot-toast';
import dynamic from 'next/dynamic';

// Mapbox를 dynamic import로 로드 (SSR 방지)
const UserMapComponent = dynamic(
  () => import('@/components/admin/UserMapTest'),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }
);

export default function UserMapTestPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<string>('all');

  const roleFilters = [
    { value: 'all', label: '전체' },
    { value: 'mentor', label: '멘토' },
    { value: 'foreign', label: '원어민' },
    { value: 'admin', label: '관리자' },
    { value: 'mentor_temp', label: '멘토(임시)' },
    { value: 'foreign_temp', label: '원어민(임시)' },
  ];

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const fetchedUsers = await getAllUsers();
      setUsers(fetchedUsers);
    } catch (error) {
      console.error('사용자 목록 로딩 실패:', error);
      toast.error('사용자 정보를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 필터링된 사용자 목록
  const filteredUsers = useMemo(() => {
    if (selectedRole === 'all') {
      return users;
    }
    return users.filter(user => user.role === selectedRole);
  }, [users, selectedRole]);

  // 주소가 있는 사용자만 필터링
  const usersWithAddress = useMemo(() => {
    return filteredUsers.filter(user => user.address && user.address.trim() !== '');
  }, [filteredUsers]);

  return (
    <Layout requireAuth requireAdmin>
      <div className="h-screen flex flex-col">
        {/* 헤더 */}
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">사용자 지도 (테스트)</h1>
              <p className="text-sm text-gray-600">
                주소 등록: {usersWithAddress.length}명 / 전체: {filteredUsers.length}명
              </p>
            </div>
            
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.history.back()}
            >
              돌아가기
            </Button>
          </div>
          
          {/* 역할 필터 */}
          <div className="flex flex-wrap gap-2 mt-3">
            {roleFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setSelectedRole(filter.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  selectedRole === filter.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {/* 지도 영역 */}
        <div className="flex-1 relative">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-600">사용자 정보를 불러오는 중...</p>
              </div>
            </div>
          ) : usersWithAddress.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">주소 정보 없음</h3>
                <p className="mt-1 text-sm text-gray-500">
                  선택한 역할의 사용자 중 주소를 등록한 사용자가 없습니다.
                </p>
              </div>
            </div>
          ) : (
            <UserMapComponent users={usersWithAddress} />
          )}
        </div>
      </div>
    </Layout>
  );
}
