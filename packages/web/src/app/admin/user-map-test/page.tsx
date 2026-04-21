'use client';
import { logger } from '@smis-mentor/shared';

import { useState, useEffect, useMemo } from 'react';
import Layout from '@/components/common/Layout';
import { getAllUsers, getUserJobCodesInfo } from '@/lib/firebaseService';
import { User, JobCodeWithGroup } from '@/types';
import toast from 'react-hot-toast';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Timestamp } from 'firebase/firestore';
import { getGroupLabel } from '@smis-mentor/shared';
import EvaluationStageCards from '@/components/evaluation/EvaluationStageCards';
import { formatPhoneNumber, formatPhoneNumberForMentor } from '@smis-mentor/shared';

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
  const [mapHeight, setMapHeight] = useState<number>(600);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userJobCodes, setUserJobCodes] = useState<JobCodeWithGroup[]>([]);
  const [isLoadingJobCodes, setIsLoadingJobCodes] = useState(false);
  const router = useRouter();

  const roleFilters = [
    { value: 'all', label: '전체' },
    { value: 'mentor', label: '멘토' },
    { value: 'foreign', label: '원어민' },
    { value: 'admin', label: '관리자' },
  ];

  // 동적으로 지도 높이 계산
  useEffect(() => {
    const calculateMapHeight = () => {
      const headerHeight = 140;
      const bottomNavHeight = window.innerWidth < 768 ? 80 : 0;
      const safeArea = 20;
      const availableHeight = window.innerHeight - headerHeight - bottomNavHeight - safeArea;
      setMapHeight(Math.max(400, availableHeight));
    };

    calculateMapHeight();
    window.addEventListener('resize', calculateMapHeight);
    
    return () => window.removeEventListener('resize', calculateMapHeight);
  }, []);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const fetchedUsers = await getAllUsers();
      setUsers(fetchedUsers);
    } catch (error) {
      logger.error('사용자 목록 로딩 실패:', error);
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

  // 날짜 포맷팅 함수
  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return '-';
    return format(new Date(timestamp.seconds * 1000), 'yyyy-MM-dd HH:mm');
  };

  // 선택된 사용자가 변경될 때 직무 경험 로드
  useEffect(() => {
    const loadJobCodes = async () => {
      if (selectedUser && selectedUser.jobExperiences && selectedUser.jobExperiences.length > 0) {
        setIsLoadingJobCodes(true);
        try {
          const jobCodesInfo = await getUserJobCodesInfo(selectedUser.jobExperiences);
          setUserJobCodes(jobCodesInfo);
        } catch (error) {
          logger.error('직무 경험 정보 로드 오류:', error);
        } finally {
          setIsLoadingJobCodes(false);
        }
      } else {
        setUserJobCodes([]);
      }
    };

    loadJobCodes();
  }, [selectedUser]);

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-7xl mx-auto px-2 sm:px-4">
        {/* 헤더 */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => router.back()}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="뒤로가기"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg md:text-2xl font-bold text-gray-900">사용자 지도</h1>
              <p className="text-xs md:text-sm text-gray-600">
                총 {usersWithAddress.length}명
              </p>
            </div>
          </div>
          
          {/* 역할 필터 */}
          <div className="flex flex-wrap gap-1">
            {roleFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setSelectedRole(filter.value)}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
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
        <div 
          className="relative bg-white rounded-lg shadow overflow-hidden" 
          style={{ height: `${mapHeight}px` }}
        >
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
            <UserMapComponent 
              users={usersWithAddress} 
              onUserClick={(user) => setSelectedUser(user)}
            />
          )}
        </div>

        {/* 사용자 상세 모달 - 전체 정보 */}
        {selectedUser && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000] p-4"
            onClick={() => setSelectedUser(null)}
          >
            <div 
              className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 모달 헤더 - 고정 */}
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
                <h2 className="text-xl font-bold">사용자 상세 정보</h2>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* 모달 바디 - 스크롤 가능 */}
              <div className="overflow-y-auto flex-1 p-4">
                {/* 프로필 섹션 */}
                <div className="flex items-center mb-4 pb-4 border-b">
                  {selectedUser.profileImage ? (
                    <img
                      src={selectedUser.profileImage}
                      alt={selectedUser.name}
                      className="h-14 w-14 rounded-full mr-3 object-cover"
                    />
                  ) : (
                    <div className="h-14 w-14 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                      <span className="text-gray-500 text-xl">{selectedUser.name.charAt(0)}</span>
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-bold mb-1">{selectedUser.name}</h3>
                    <div className="flex gap-2">
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                        selectedUser.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                        selectedUser.role === 'mentor' ? 'bg-blue-100 text-blue-800' :
                        selectedUser.role === 'foreign' ? 'bg-teal-100 text-teal-800' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {selectedUser.role === 'admin' ? '관리자' :
                         selectedUser.role === 'mentor' ? '멘토' :
                         selectedUser.role === 'foreign' ? '원어민' : '사용자'}
                      </span>
                      <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                        selectedUser.status === 'active' ? 'bg-green-100 text-green-800' :
                        selectedUser.status === 'inactive' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {selectedUser.status === 'active' ? '활성' : 
                         selectedUser.status === 'inactive' ? '비활성' : '임시'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 기본 정보 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 text-sm">
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">이메일</p>
                    <p className="text-gray-900 break-words">{selectedUser.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">전화번호</p>
                    <p className="text-gray-900">
                      {selectedUser.role === 'foreign' || selectedUser.role === 'foreign_temp' 
                        ? formatPhoneNumber(selectedUser.phoneNumber) 
                        : formatPhoneNumberForMentor(selectedUser.phoneNumber)}
                    </p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-xs text-gray-500 mb-0.5">주소</p>
                    <p className="text-gray-900 break-words">
                      {selectedUser.address} {selectedUser.addressDetail}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">성별</p>
                    <p className="text-gray-900">
                      {selectedUser.gender === 'M' ? '남성' : selectedUser.gender === 'F' ? '여성' : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">나이</p>
                    <p className="text-gray-900">{selectedUser.age ? `${selectedUser.age}세` : '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">지원 경로</p>
                    <p className="text-gray-900">
                      {selectedUser.referralPath ? (
                        selectedUser.referralPath.startsWith('기타: ') ? (
                          selectedUser.referralPath
                        ) : selectedUser.referralPath === '지인 소개' && selectedUser.referrerName ? (
                          `${selectedUser.referralPath} (${selectedUser.referrerName})`
                        ) : (
                          selectedUser.referralPath
                        )
                      ) : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">주민등록번호</p>
                    <p className="text-gray-900">
                      {selectedUser.rrnFront && selectedUser.rrnLast ? 
                        `${selectedUser.rrnFront}-${selectedUser.rrnLast}` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">이메일 인증</p>
                    <p className="text-gray-900">
                      {selectedUser.isEmailVerified ? '인증됨' : '미인증'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-0.5">가입일</p>
                    <p className="text-gray-900">{formatDate(selectedUser.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">정보 업데이트</p>
                    <p className="text-gray-900">{formatDate(selectedUser.updatedAt)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">DB 아이디</p>
                    <p className="text-gray-900 text-xs break-all">{selectedUser.id}</p>
                  </div>
                </div>

                {/* 직무 경험 */}
                {(userJobCodes.length > 0 || isLoadingJobCodes) && (
                  <div className="mb-4 pb-4 border-t pt-4">
                    <h3 className="text-base font-semibold mb-2">직무 경험</h3>
                    {isLoadingJobCodes ? (
                      <div className="py-2">
                        <div className="animate-pulse h-4 bg-gray-200 rounded w-24"></div>
                      </div>
                    ) : userJobCodes.length === 0 ? (
                      <p className="text-sm text-gray-500">등록된 직무 경험이 없습니다.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {userJobCodes.map(jobCode => {
                          const exp = selectedUser?.jobExperiences?.find(exp => exp.id === jobCode.id);
                          const groupRole = exp?.groupRole;
                          const classCode = exp?.classCode;
                          return (
                            <div key={jobCode.id} className="flex items-center bg-blue-50 text-blue-800 px-2.5 py-1 rounded-full text-xs">
                              <span className="mr-1">
                                {jobCode.generation} {jobCode.name}
                              </span>
                              {jobCode.group && (
                                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                                  jobCode.group === 'junior' ? 'bg-green-100 text-yellow-800' :
                                  jobCode.group === 'middle' ? 'bg-yellow-100 text-green-800' :
                                  jobCode.group === 'senior' ? 'bg-red-100 text-purple-800' :
                                  jobCode.group === 'spring' ? 'bg-blue-100 text-yellow-800' :
                                  jobCode.group === 'summer' ? 'bg-purple-100 text-green-800' :
                                  jobCode.group === 'autumn' ? 'bg-orange-100 text-red-800' :
                                  jobCode.group === 'winter' ? 'bg-pink-100 text-purple-800' :
                                  jobCode.group === 'common' ? 'bg-gray-100 text-gray-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {getGroupLabel(jobCode.group || '')}
                                </span>
                              )}
                              {groupRole && (
                                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700 border border-gray-300">{groupRole}</span>
                              )}
                              {classCode && (
                                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">{classCode}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 평가 점수 */}
                <div className="mb-4 pb-4 border-t pt-4">
                  <h3 className="text-base font-semibold mb-2">평가 점수</h3>
                  {selectedUser.id || selectedUser.userId ? (
                    <EvaluationStageCards 
                      userId={selectedUser.id || selectedUser.userId}
                      targetUserName={selectedUser.name}
                      evaluatorName=""
                      onEvaluationSuccess={() => {}}
                    />
                  ) : (
                    <p className="text-sm text-gray-500">사용자 ID가 없어 평가를 불러올 수 없습니다.</p>
                  )}
                </div>

                {/* 학교 정보 */}
                <div className="mb-4 pb-4 border-t pt-4">
                  <h3 className="text-base font-semibold mb-2">학교 정보</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">학교</p>
                      <p className="text-gray-900">{selectedUser.university || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">학년</p>
                      <p className="text-gray-900">
                        {selectedUser.grade ? (selectedUser.grade === 6 ? '졸업생' : `${selectedUser.grade}학년`) : '-'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">휴학 상태</p>
                      <p className="text-gray-900">
                        {selectedUser.isOnLeave === null ? '졸업생' : selectedUser.isOnLeave ? '휴학 중' : '재학 중'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-0.5">전공 (1전공)</p>
                      <p className="text-gray-900">{selectedUser.major1 || '-'}</p>
                    </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">전공 (2전공/부전공)</p>
                      <p className="text-gray-900">{selectedUser.major2 || '없음'}</p>
                    </div>
                  </div>
                </div>

                {/* 자기소개 및 지원동기 */}
                <div className="mb-6 pb-6 border-t pt-6">
                  <h3 className="text-lg font-semibold mb-4">자기소개 및 지원동기</h3>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-500 mb-2">자기소개</p>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-gray-900 whitespace-pre-line min-h-[60px]">
                          {selectedUser.selfIntroduction || '-'}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500 mb-2">지원 동기</p>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <p className="text-gray-900 whitespace-pre-line min-h-[60px]">
                          {selectedUser.jobMotivation || '-'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 알바 & 멘토링 경력 */}
                <div className="mb-6 pb-6 border-t pt-6">
                  <h3 className="text-lg font-semibold mb-4">알바 & 멘토링 경력</h3>
                  {!selectedUser.partTimeJobs || selectedUser.partTimeJobs.length === 0 ? (
                    <p className="text-gray-500">등록된 알바 & 멘토링 경력이 없습니다.</p>
                  ) : (
                    <div className="space-y-3">
                      {selectedUser.partTimeJobs.map((job, index) => (
                        <div key={index} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                          <div className="flex justify-between mb-2">
                            <span className="font-medium text-gray-900">{job.companyName}</span>
                            <span className="text-sm text-gray-500">{job.period}</span>
                          </div>
                          <div className="mb-2">
                            <span className="text-sm text-gray-500 mr-2">담당:</span>
                            <span className="text-gray-900">{job.position}</span>
                          </div>
                          <div>
                            <span className="text-sm text-gray-500 mr-2">업무 내용:</span>
                            <span className="text-gray-700">{job.description}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 모달 푸터 - 고정 */}
              <div className="sticky bottom-0 bg-white border-t px-6 py-4">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
