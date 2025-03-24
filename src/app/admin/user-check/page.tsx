'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { getAllJobCodes, getUsersByJobCode } from '@/lib/firebaseService';
import { JobCode, User } from '@/types';

export default function UserCheck() {
  const [jobCodes, setJobCodes] = useState<JobCode[]>([]);
  const [generations, setGenerations] = useState<string[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<string>('');
  const [codesForGeneration, setCodesForGeneration] = useState<JobCode[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // 모든 JobCode 및 Generation 로드
  useEffect(() => {
    const loadJobCodes = async () => {
      try {
        setIsLoading(true);
        const codes = await getAllJobCodes();
        setJobCodes(codes);
        
        // 기수 목록 추출 (중복 제거)
        const uniqueGenerations = Array.from(
          new Set(codes.map(code => code.generation))
        ).sort((a, b) => {
          // 숫자만 추출하여 내림차순 정렬 (예: "25기" -> 25)
          const numA = parseInt(a.replace(/[^0-9]/g, ''));
          const numB = parseInt(b.replace(/[^0-9]/g, ''));
          return numB - numA; // 내림차순 (최신순)
        });
        
        setGenerations(uniqueGenerations);
        
        // 기본 선택: 가장 최근 기수 (있다면)
        if (uniqueGenerations.length > 0) {
          setSelectedGeneration(uniqueGenerations[0]);
        }
      } catch (error) {
        console.error('업무 코드 로드 오류:', error);
        toast.error('업무 코드를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadJobCodes();
  }, []);

  // 선택된 기수에 따라 코드 필터링
  useEffect(() => {
    if (!selectedGeneration) {
      setCodesForGeneration([]);
      return;
    }
    
    const filteredCodes = jobCodes.filter(
      code => code.generation === selectedGeneration
    );
    
    setCodesForGeneration(filteredCodes);
    
    // 기본 선택: 첫번째 코드 (있다면)
    if (filteredCodes.length > 0) {
      setSelectedCode(filteredCodes[0].code);
    } else {
      setSelectedCode('');
    }
  }, [selectedGeneration, jobCodes]);

  // 선택된 기수와 코드에 따라 사용자 로드
  useEffect(() => {
    const loadUsers = async () => {
      if (!selectedGeneration || !selectedCode) {
        setUsers([]);
        return;
      }
      
      try {
        setIsLoading(true);
        const usersData = await getUsersByJobCode(selectedGeneration, selectedCode);
        setUsers(usersData);
      } catch (error) {
        console.error('사용자 로드 오류:', error);
        toast.error('사용자 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, [selectedGeneration, selectedCode]);

  // 사용자 선택 핸들러 (모달 표시)
  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
  };

  // 모달 닫기 핸들러
  const handleCloseModal = () => {
    setSelectedUser(null);
  };

  // 날짜 포맷팅 함수
  const formatDate = (timestamp: { seconds: number } | undefined) => {
    if (!timestamp) return '-';
    return format(new Date(timestamp.seconds * 1000), 'yyyy-MM-dd');
  };

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">사용자 조회</h1>
          <p className="text-gray-500 mt-1">업무 코드별로 사용자를 조회합니다.</p>
        </div>

        {/* 필터 영역 */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">기수 선택</label>
              <div className="flex flex-wrap gap-2">
                {generations.map(gen => (
                  <button
                    key={gen}
                    className={`px-3 py-1.5 text-sm rounded-full border ${
                      selectedGeneration === gen
                        ? 'bg-blue-100 border-blue-300 text-blue-800'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedGeneration(gen)}
                  >
                    {gen}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">코드 선택</label>
              <div className="flex flex-wrap gap-2">
                {codesForGeneration.map(code => (
                  <button
                    key={code.id}
                    className={`px-3 py-1.5 text-sm rounded-full border ${
                      selectedCode === code.code
                        ? 'bg-blue-100 border-blue-300 text-blue-800'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedCode(code.code)}
                  >
                    {code.code} - {code.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 사용자 카드 리스트 */}
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <div>
            {users.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-lg shadow">
                <p className="text-gray-500">해당 업무 코드에 맞는 사용자가 없습니다.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {users.map(user => (
                  <div
                    key={user.userId}
                    className="bg-white rounded-lg shadow overflow-hidden cursor-pointer transform transition hover:scale-105"
                    onClick={() => handleSelectUser(user)}
                  >
                    <div className="h-48 bg-gray-200 relative">
                      {user.profileImage ? (
                        <img
                          src={user.profileImage}
                          alt={user.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
                          <span className="text-5xl font-bold text-blue-300">{user.name.charAt(0)}</span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                          user.role === 'mentor' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {user.role === 'admin' ? '관리자' : 
                           user.role === 'mentor' ? '멘토' : '사용자'}
                        </span>
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-bold text-lg text-gray-900">{user.name}</h3>
                      <p className="text-sm text-gray-500 truncate">{user.email || user.phoneNumber}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 사용자 상세 정보 모달 */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center">
                    {selectedUser.profileImage ? (
                      <img 
                        src={selectedUser.profileImage} 
                        alt={selectedUser.name}
                        className="h-16 w-16 rounded-full mr-4 object-cover"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-full bg-gray-200 flex items-center justify-center mr-4">
                        <span className="text-gray-500 text-xl">{selectedUser.name.charAt(0)}</span>
                      </div>
                    )}
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">{selectedUser.name}</h2>
                      <div className="flex items-center mt-1">
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          selectedUser.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                          selectedUser.role === 'mentor' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {selectedUser.role === 'admin' ? '관리자' : 
                           selectedUser.role === 'mentor' ? '멘토' : '사용자'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    className="text-gray-400 hover:text-gray-600"
                    onClick={handleCloseModal}
                  >
                    <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 border-t pt-4">
                  <div>
                    <p className="text-sm text-gray-500">이메일</p>
                    <p className="text-gray-900">{selectedUser.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">전화번호</p>
                    <p className="text-gray-900">{selectedUser.phoneNumber || '-'}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-500">주소</p>
                    <p className="text-gray-900">
                      {selectedUser.address ? `${selectedUser.address} ${selectedUser.addressDetail || ''}` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">성별</p>
                    <p className="text-gray-900">
                      {selectedUser.gender === 'M' ? '남성' : 
                       selectedUser.gender === 'F' ? '여성' : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">나이</p>
                    <p className="text-gray-900">{selectedUser.age || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">가입일</p>
                    <p className="text-gray-900">{formatDate(selectedUser.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">마지막 로그인</p>
                    <p className="text-gray-900">{formatDate(selectedUser.lastLoginAt)}</p>
                  </div>
                  <div className="md:col-span-2 mt-2">
                    <p className="text-sm text-gray-500">자기소개</p>
                    <p className="text-gray-900 whitespace-pre-line">
                      {selectedUser.selfIntroduction || '-'}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-500">지원 동기</p>
                    <p className="text-gray-900 whitespace-pre-line">
                      {selectedUser.jobMotivation || '-'}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <Button
                    variant="secondary"
                    onClick={handleCloseModal}
                  >
                    닫기
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
} 