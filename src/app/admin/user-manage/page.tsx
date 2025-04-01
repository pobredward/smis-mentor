'use client';

import { useState, useEffect } from 'react';
import React from 'react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import FormInput from '@/components/common/FormInput';
import PhoneInput, { formatPhoneNumber } from '@/components/common/PhoneInput';
import { getAllUsers, updateUser, deleteUser, getAllJobCodes, getUserJobCodesInfo, addUserJobCode, reactivateUser } from '@/lib/firebaseService';
import { JobCodeWithId, JobCodeWithGroup, JobGroup, User, PartTimeJob } from '@/types';
import { Timestamp } from 'firebase/firestore';

type EditFormData = {
  name?: string;
  email?: string;
  phoneNumber?: string;
  address?: string;
  addressDetail?: string;
  role?: User['role'];
  status?: User['status'];
  university?: string;
  grade?: number;
  isOnLeave?: boolean;
  major1?: string;
  major2?: string;
  feedback?: string;
  selfIntroduction?: string;
  jobMotivation?: string;
  gender?: User['gender'];
  rrnFront?: string;
  rrnLast?: string;
  partTimeJobs?: PartTimeJob[];
  age?: number;
  referralPath?: string;
  referrerName?: string;
  otherReferralDetail?: string;
};

export default function UserManage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState<EditFormData>({});
  const [allJobCodes, setAllJobCodes] = useState<JobCodeWithId[]>([]);
  const [userJobCodes, setUserJobCodes] = useState<JobCodeWithGroup[]>([]);
  const [selectedJobCodeId, setSelectedJobCodeId] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<JobGroup>('junior');
  const [allGenerations, setAllGenerations] = useState<string[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<string>('');
  const [filteredJobCodes, setFilteredJobCodes] = useState<JobCodeWithId[]>([]);
  const [showUserList, setShowUserList] = useState(true);
  const [isLoadingJobCodes, setIsLoadingJobCodes] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('all');

  const jobGroups = [
    { value: 'junior', label: '주니어' },
    { value: 'middle', label: '미들' },
    { value: 'senior', label: '시니어' },
    { value: 'spring', label: '스프링' },
    { value: 'summer', label: '서머' },
    { value: 'autumn', label: '어텀' },
    { value: 'winter', label: '윈터' },
    { value: 'common', label: '공통' },
    { value: 'manager', label: '매니저' },
  ];

  const roleFilters = [
    { value: 'all', label: '전체' },
    { value: 'user', label: '사용자' },
    { value: 'mentor', label: '멘토' },
    { value: 'admin', label: '관리자' }
  ];

  // 사용자 목록 불러오기
  useEffect(() => {
    const loadUsers = async () => {
      setIsLoading(true);
      try {
        const fetchedUsers = await getAllUsers();
        
        // 가입일시를 기준으로 오름차순 정렬 (가장 오래된 순)
        const sortedUsers = [...fetchedUsers].sort((a, b) => {
          const dateA = a.createdAt?.toDate?.() || new Date(0);
          const dateB = b.createdAt?.toDate?.() || new Date(0);
          return dateB.getTime() - dateA.getTime();
        });
        
        setUsers(sortedUsers);
        setFilteredUsers(sortedUsers);
      } catch (error) {
        console.error('사용자 목록 로딩 실패:', error);
        toast.error('사용자 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };
    loadUsers();
  }, []);

  // 검색어 및 역할 필터링 적용
  useEffect(() => {
    let filtered = [...users];
    
    // 역할 필터링
    if (selectedRole !== 'all') {
      filtered = filtered.filter(user => user.role === selectedRole);
    }
    
    // 검색어 필터링
    if (searchTerm.trim()) {
      filtered = filtered.filter(user => 
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.phoneNumber.includes(searchTerm)
      );
    }
    
    setFilteredUsers(filtered);
  }, [searchTerm, users, selectedRole]);

  // 화면 너비에 따라 사용자 목록 표시 여부 결정
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) { // md 브레이크포인트
        setShowUserList(true);
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // 초기 로드 시 실행
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 사용자 선택 핸들러
  const handleSelectUser = async (user: User) => {
    setSelectedUser(user);
    setIsEditing(false);
    
    // 모바일에서는 사용자 선택 시 목록 숨기기
    if (window.innerWidth < 768) {
      setShowUserList(false);
    }
    
    // 선택 초기화
    setSelectedJobCodeId('');
    setSelectedGeneration('');
    
    // 사용자의 직무 경험 정보 로드
    if (user.jobExperiences && user.jobExperiences.length > 0) {
      setIsLoadingJobCodes(true);
      try {
        const jobCodesInfo = await getUserJobCodesInfo(user.jobExperiences);
        setUserJobCodes(jobCodesInfo);
      } catch (error) {
        console.error('직무 경험 정보 로드 오류:', error);
        toast.error('직무 경험 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoadingJobCodes(false);
      }
    } else {
      setUserJobCodes([]);
    }
  };

  // 사용자 편집 모드 시작
  const handleStartEdit = () => {
    if (!selectedUser) return;
    
    initEditForm(selectedUser);
    
    setIsEditing(true);
  };

  // 편집 폼 초기화
  const initEditForm = (user: User) => {
    setEditFormData({
      name: user.name,
      email: user.email || '',
      phoneNumber: user.phoneNumber,
      address: user.address || '',
      addressDetail: user.addressDetail || '',
      role: user.role,
      status: user.status,
      gender: user.gender as 'M' | 'F' | undefined,
      rrnFront: user.rrnFront || '',
      rrnLast: user.rrnLast || '',
      university: user.university || '',
      grade: user.grade,
      isOnLeave: user.isOnLeave || false,
      major1: user.major1 || '',
      major2: user.major2 || '',
      selfIntroduction: user.selfIntroduction || '',
      jobMotivation: user.jobMotivation || '',
      partTimeJobs: user.partTimeJobs || [],
      age: user.age,
      referralPath: user.referralPath ? (
        user.referralPath.startsWith('기타: ') ? '기타' : user.referralPath
      ) : '',
      referrerName: user.referrerName || '',
      otherReferralDetail: user.referralPath?.startsWith('기타: ') ? 
        user.referralPath.substring(4).trim() : '',
    });
  };

  // 수정 폼 데이터 변경 핸들러
  const handleEditFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement> | { target: { name: string; value: string | boolean | number } }) => {
    const { name, value } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 사용자 업데이트 핸들러
  const handleUpdateUser = async () => {
    if (!selectedUser) return;
    
    try {
      // editFormData에서 undefined 값 제거
      const cleanedData: Record<string, unknown> = {};
      
      // 기존 editFormData에서 undefined가 아닌 값만 복사
      Object.entries(editFormData).forEach(([key, value]) => {
        if (value !== undefined && key !== 'otherReferralDetail') {
          cleanedData[key] = value;
        }
      });
      
      // 지원 경로 처리
      if (editFormData.referralPath === '기타' && editFormData.otherReferralDetail) {
        cleanedData.referralPath = `기타: ${editFormData.otherReferralDetail}`;
      }
      
      // role이 'admin'으로 변경되는 경우 필수 필드 설정
      if (editFormData.role === 'admin' && selectedUser.role !== 'admin') {
        // 필수 필드 기본값 제공
        if (selectedUser.grade === undefined) cleanedData.grade = 1;
        if (selectedUser.isOnLeave === undefined) cleanedData.isOnLeave = false;
        if (selectedUser.major1 === undefined) cleanedData.major1 = '';
        if (selectedUser.major2 === undefined) cleanedData.major2 = '';
        if (selectedUser.university === undefined) cleanedData.university = '';
        if (selectedUser.gender === undefined) cleanedData.gender = 'M';
        if (selectedUser.selfIntroduction === undefined) cleanedData.selfIntroduction = '';
        if (selectedUser.jobMotivation === undefined) cleanedData.jobMotivation = '';
      }
      
      await updateUser(selectedUser.userId, cleanedData);
      
      // 상태 업데이트
      const updatedUsers = users.map(user => 
        user.userId === selectedUser.userId 
          ? { ...user, ...cleanedData } 
          : user
      );
      
      setUsers(updatedUsers);
      setSelectedUser(prev => prev ? { ...prev, ...cleanedData } : null);
      setIsEditing(false);
      
      toast.success('사용자 정보가 업데이트되었습니다.');
    } catch (error) {
      console.error('사용자 업데이트 오류:', error);
      toast.error('사용자 정보 업데이트 중 오류가 발생했습니다.');
    }
  };

  // 사용자 삭제 핸들러
  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    if (!window.confirm(`정말로 ${selectedUser.name} 사용자를 삭제하시겠습니까?`)) {
      return;
    }
    
    try {
      await deleteUser(selectedUser.userId);
      
      // 상태 업데이트
      const updatedUsers = users.filter(user => user.userId !== selectedUser.userId);
      setUsers(updatedUsers);
      setSelectedUser(null);
      
      toast.success('사용자가 삭제되었습니다.');
    } catch (error) {
      console.error('사용자 삭제 오류:', error);
      toast.error('사용자 삭제 중 오류가 발생했습니다.');
    }
  };

  // 모든 직무 코드 로드 (수정)
  useEffect(() => {
    const loadAllJobCodes = async () => {
      try {
        const codes = await getAllJobCodes();
        setAllJobCodes(codes);
        
        // 모든 generation 추출 (중복 제거 및 정렬)
        const generations = Array.from(new Set(codes.map(code => code.generation)));
        // 정렬 (예: G25, G24, ... 내림차순)
        generations.sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, ''));
          const numB = parseInt(b.replace(/\D/g, ''));
          return numB - numA; // 내림차순 정렬
        });
        
        setAllGenerations(generations);
      } catch (error) {
        console.error('직무 코드 로드 오류:', error);
      }
    };
    
    loadAllJobCodes();
  }, []);

  // 선택된 generation이 변경될 때 코드 필터링
  useEffect(() => {
    if (!selectedGeneration) {
      setFilteredJobCodes([]);
      return;
    }
    
    const filtered = allJobCodes.filter(code => code.generation === selectedGeneration);
    
    // 코드 기준으로 정렬
    filtered.sort((a, b) => {
      if (a.code < b.code) return -1;
      if (a.code > b.code) return 1;
      return 0;
    });
    
    setFilteredJobCodes(filtered);
    setSelectedJobCodeId(''); // 선택 초기화
  }, [selectedGeneration, allJobCodes]);

  // 직무 경험 추가 핸들러
  const handleAddJobCode = async () => {
    if (!selectedUser || !selectedJobCodeId) return;
    
    try {
      const updatedJobExperiences = await addUserJobCode(selectedUser.userId, selectedJobCodeId, selectedGroup);
      
      // 사용자 목록 업데이트
      setUsers(prevUsers => prevUsers.map(user => 
        user.userId === selectedUser.userId 
          ? { ...user, jobExperiences: updatedJobExperiences }
          : user
      ));
      
      // 선택된 사용자 업데이트
      setSelectedUser(prev => prev ? {
        ...prev,
        jobExperiences: updatedJobExperiences
      } : null);
      
      // 직무 코드 목록 새로고침
      const jobCodes = await getUserJobCodesInfo(updatedJobExperiences);
      setUserJobCodes(jobCodes);
      
      // 선택 초기화
      setSelectedJobCodeId('');
      setSelectedGeneration('');
      
      toast.success('직무 코드가 추가되었습니다.');
    } catch (error) {
      console.error('직무 코드 추가 실패:', error);
      toast.error('직무 코드 추가에 실패했습니다.');
    }
  };

  // 직무 경험 삭제 핸들러
  const handleRemoveJobCode = async (jobCodeId: string) => {
    if (!selectedUser) return;
    
    try {
      const updatedJobExperiences = selectedUser.jobExperiences?.filter(exp => 
        exp.id !== jobCodeId
      ) || [];
      
      await updateUser(selectedUser.userId, { jobExperiences: updatedJobExperiences });
      
      // 사용자 목록 업데이트
      setUsers(prevUsers => prevUsers.map(user => 
        user.userId === selectedUser.userId 
          ? { ...user, jobExperiences: updatedJobExperiences }
          : user
      ));
      
      // 선택된 사용자 업데이트
      setSelectedUser(prev => prev ? {
        ...prev,
        jobExperiences: updatedJobExperiences
      } : null);
      
      // 직무 코드 목록 새로고침
      const jobCodes = await getUserJobCodesInfo(updatedJobExperiences);
      setUserJobCodes(jobCodes);
      
      toast.success('직무 코드가 제거되었습니다.');
    } catch (error) {
      console.error('직무 코드 제거 실패:', error);
      toast.error('직무 코드 제거에 실패했습니다.');
    }
  };

  // 뒤로 가기 핸들러
  const handleBackToList = () => {
    setShowUserList(true);
  };

  // 날짜 포맷팅 함수
  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return '-';
    return format(new Date(timestamp.seconds * 1000), 'yyyy-MM-dd HH:mm');
  };

  // 직무 경험 섹션 UI
  const renderJobExperiencesSection = () => {
    return (
      <div className="mt-4 border-t pt-4">
        <div className="flex justify-between items-center mb-2">
          <p className="text-sm text-gray-500">직무 경험</p>
        </div>
        
        {isLoadingJobCodes ? (
          <div className="py-2">
            <div className="animate-pulse h-4 bg-gray-200 rounded w-24"></div>
          </div>
        ) : userJobCodes.length === 0 ? (
          <p className="text-gray-500">등록된 직무 경험이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2 mb-4">
            {userJobCodes.map(jobCode => (
              <div key={jobCode.id} className="flex items-center bg-blue-50 text-blue-800 px-3 py-1 rounded-full text-sm max-w-full group relative">
                <div className="flex items-center">
                  <span className="truncate mr-1" title={`${jobCode.generation} ${jobCode.code} - ${jobCode.name}`}>
                    {jobCode.generation} {jobCode.name}
                  </span>
                  {jobCode.group && (
                    <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                      jobCode.group === 'junior' ? 'bg-green-100 text-yellow-800' :
                      jobCode.group === 'middle' ? 'bg-yellow-100 text-green-800' :
                      jobCode.group === 'senior' ? 'bg-red-100 text-purple-800' :
                      jobCode.group === 'spring' ? 'bg-blue-100 text-yellow-800' :
                      jobCode.group === 'summer' ? 'bg-purple-100 text-green-800' :
                      jobCode.group === 'autumn' ? 'bg-orange-100 text-red-800' :
                      jobCode.group === 'winter' ? 'bg-pink-100 text-purple-800' :
                      jobCode.group === 'common' ? 'bg-gray-100 text-gray-800' :
                      jobCode.group === 'manager' ? 'bg-black-100 text-black-800' :
                      'bg-black-100 text-black-800'
                    }`}>
                      {jobCode.group === 'junior' ? '주니어' :
                       jobCode.group === 'middle' ? '미들' :
                       jobCode.group === 'senior' ? '시니어' :
                       jobCode.group === 'spring' ? '스프링' :
                       jobCode.group === 'summer' ? '서머' :
                       jobCode.group === 'autumn' ? '어텀' :
                       jobCode.group === 'winter' ? '윈터' :
                       jobCode.group === 'common' ? '공통' :
                       '매니저'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleRemoveJobCode(jobCode.id)}
                  className="ml-auto flex-shrink-0 text-blue-600 hover:text-blue-800 focus:outline-none"
                  aria-label="직무 경험 삭제"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                {/* 모바일에서 호버 시 전체 텍스트 보기 */}
                <div className="absolute hidden group-hover:block left-0 bottom-full mb-1 bg-gray-800 text-white p-2 rounded text-xs whitespace-normal max-w-xs z-10">
                  {jobCode.generation} {jobCode.code} - {jobCode.name}
                  {jobCode.group && (
                    <span className="ml-1">
                      ({jobCode.group === 'junior' ? '주니어' :
                       jobCode.group === 'middle' ? '미들' :
                       jobCode.group === 'senior' ? '시니어' :
                       jobCode.group === 'spring' ? '스프링' :
                       jobCode.group === 'summer' ? '서머' :
                       jobCode.group === 'autumn' ? '어텀' :
                       jobCode.group === 'winter' ? '윈터' :
                       jobCode.group === 'common' ? '공통' :
                       '매니저'})
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* 직무 경험 추가 UI */}
        <div className="flex flex-col gap-2 mt-3">
          {/* 기수 선택 */}
          <div className="w-full">
            <select
              value={selectedGeneration}
              onChange={(e) => setSelectedGeneration(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">기수 선택...</option>
              {allGenerations.map(gen => (
                <option key={gen} value={gen}>
                  {gen}
                </option>
              ))}
            </select>
          </div>
          
          {/* 직무 코드 선택 및 그룹 선택 */}
          <div className="flex flex-col md:flex-row gap-2">
            <div className="w-full md:w-1/2">
              <select
                value={selectedJobCodeId}
                onChange={(e) => setSelectedJobCodeId(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-ellipsis"
                disabled={!selectedGeneration || filteredJobCodes.length === 0}
                style={{ maxWidth: '100%', textOverflow: 'ellipsis' }}
              >
                <option value="">직무 코드 선택...</option>
                {filteredJobCodes.map(jobCode => (
                  <option 
                    key={jobCode.id} 
                    value={jobCode.id}
                    title={`${jobCode.code} - ${jobCode.name}`}
                  >
                    {jobCode.code} - {jobCode.name}
                  </option>
                ))}
              </select>
            </div>
            
            {/* 그룹 선택 */}
            <div className="w-full md:w-1/4">
              <select
                value={selectedGroup}
                onChange={(e) => setSelectedGroup(e.target.value as JobGroup)}
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {jobGroups.map((group, index) => (
                  <option key={`group-option-${group.value}-${index}`} value={group.value}>
                    {group.label}
                  </option>
                ))}
              </select>
            </div>
            
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddJobCode}
              disabled={!selectedJobCodeId}
              className="whitespace-nowrap md:w-1/4"
            >
              추가
            </Button>
          </div>
          
          {filteredJobCodes.length === 0 && selectedGeneration && (
            <p className="text-sm text-gray-500" key="no-jobs-message">선택한 기수에 해당하는 직무가 없습니다.</p>
          )}
        </div>
      </div>
    );
  };

  // 역할 필터 변경 핸들러
  const handleRoleFilterChange = (role: string) => {
    setSelectedRole(role);
  };

  // 계정 복구 핸들러 추가
  const handleReactivateUser = async () => {
    if (!selectedUser) return;
    
    try {
      await reactivateUser(selectedUser.userId);
      toast.success('사용자 계정이 복구되었습니다.');
      
      // 사용자 목록과 선택된 사용자 정보 새로고침
      const updatedUsers = await getAllUsers();
      
      // 가입일시를 기준으로 오름차순 정렬 (가장 오래된 순)
      const sortedUsers = [...updatedUsers].sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(0);
        const dateB = b.createdAt?.toDate?.() || new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
      
      setUsers(sortedUsers);
      
      // 선택된 사용자 정보 업데이트
      const updatedUser = sortedUsers.find(user => user.userId === selectedUser.userId);
      if (updatedUser) {
        setSelectedUser(updatedUser);
      }
      
      // 검색어 필터링 다시 적용
      setFilteredUsers(sortedUsers.filter(user => 
        selectedRole === 'all' || user.role === selectedRole
      ).filter(user => 
        !searchTerm.trim() || 
        user.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.phoneNumber.includes(searchTerm)
      ));
    } catch (error) {
      console.error('사용자 계정 복구 실패:', error);
      toast.error('사용자 계정 복구에 실패했습니다.');
    }
  };

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-7xl mx-auto lg:px-4 px-0">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <button
              onClick={() => window.location.href = '/admin'}
              className="mr-3 text-blue-600 hover:text-blue-800 focus:outline-none flex items-center"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <h1 className="text-xl md:text-2xl font-bold">사용자 관리</h1>
          </div>
        </div>

        <div className={`${showUserList ? 'block' : 'hidden md:block'} mb-6`}>
          <div className="relative mb-4">
            <input
              type="text"
              placeholder="이름, 이메일 또는 전화번호로 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-3 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
          
          {/* 역할 필터 토글 버튼 */}
          <div className="flex flex-wrap gap-2 mb-4">
            {roleFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => handleRoleFilterChange(filter.value)}
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

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          </div>
        ) : (
          <div className="md:grid md:grid-cols-3 md:gap-6">
            {/* 사용자 목록 */}
            <div className={`md:col-span-1 ${showUserList ? 'block' : 'hidden md:block'}`}>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="p-4 border-b flex justify-between items-center">
                  <h2 className="font-medium text-gray-900">사용자 목록</h2>
                  <span className="text-sm text-gray-500">{filteredUsers.length}명</span>
                </div>
                
                {filteredUsers.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    {searchTerm || selectedRole !== 'all' ? '검색 결과가 없습니다.' : '사용자가 없습니다.'}
                  </div>
                ) : (
                  <div className="divide-y overflow-y-auto max-h-[calc(100vh-250px)]">
                    {filteredUsers.map((user, index) => (
                      <div 
                        key={user.userId || `user-${user.name}-${user.phoneNumber}-${index}`}
                        className={`p-4 cursor-pointer hover:bg-gray-50 ${
                          selectedUser?.userId === user.userId ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => handleSelectUser(user)}
                      >
                        <div className="flex items-start">
                          {user.profileImage ? (
                            <img 
                              src={user.profileImage} 
                              alt={user.name}
                              className="h-10 w-10 rounded-full mr-3 object-cover"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center mr-3">
                              <span className="text-gray-500">{user.name.charAt(0)}</span>
                            </div>
                          )}
                          <div className="flex-grow min-w-0">
                            <h3 className="font-medium text-gray-900 truncate">{user.name}</h3>
                            <p className="text-sm text-gray-500 truncate">{user.email || user.phoneNumber}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span key={`role-${user.userId || index}`} className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                                user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                user.role === 'mentor' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {user.role === 'admin' ? '관리자' : 
                                  user.role === 'mentor' ? '멘토' : '사용자'}
                              </span>
                              <span key={`status-${user.userId || index}`} className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                                user.status === 'active' ? 'bg-green-100 text-green-800' :
                                user.status === 'inactive' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {user.status === 'active' ? '활성' : 
                                  user.status === 'inactive' ? '비활성' : '임시'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 사용자 상세 정보 */}
            <div className={`md:col-span-2 ${showUserList ? 'hidden md:block' : 'block'}`}>
              {selectedUser ? (
                <div className="bg-white rounded-lg shadow">
                  <div className="p-4 border-b sm:px-6 sm:py-5 flex items-center justify-between">
                    <h3 className="text-lg font-medium">사용자 정보</h3>
                    <div className="flex space-x-2">
                      {selectedUser.status === 'inactive' && (
                        <Button
                          variant="success"
                          size="sm"
                          onClick={handleReactivateUser}
                          className="text-xs px-2 py-1"
                        >
                          계정 복구
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleBackToList}
                        className="text-xs px-2 py-1 md:hidden"
                      >
                        목록
                      </Button>
                    </div>
                  </div>
                  
                  {isEditing ? (
                    // 편집 폼 - 모바일 최적화
                    <div className="p-4 md:p-6">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-lg md:text-xl font-bold text-gray-900">사용자 정보 편집</h2>
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsEditing(false)}
                          >
                            취소
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={handleUpdateUser}
                          >
                            저장
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormInput
                          label="이름"
                          name="name"
                          type="text"
                          value={editFormData.name || ''}
                          onChange={handleEditFormChange}
                        />
                        <FormInput
                          label="이메일"
                          name="email"
                          type="email"
                          value={editFormData.email || ''}
                          onChange={handleEditFormChange}
                        />
                        <PhoneInput
                          label="전화번호"
                          name="phoneNumber"
                          value={editFormData.phoneNumber || ''}
                          onChange={(value) => handleEditFormChange({ target: { name: 'phoneNumber', value } })}
                        />
                        <div className="mb-4">
                          <label className="block text-gray-700 text-sm font-medium mb-2">나이</label>
                          <input
                            type="number"
                            name="age"
                            value={editFormData.age || ''}
                            onChange={(e) => {
                              const value = e.target.value ? parseInt(e.target.value, 10) : '';
                              handleEditFormChange({ target: { name: 'age', value } });
                            }}
                            min="0"
                            max="120"
                            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div className="mb-4">
                          <label className="block text-gray-700 text-sm font-medium mb-2">지원 경로</label>
                          <select
                            name="referralPath"
                            value={editFormData.referralPath || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">선택해주세요</option>
                            <option value="에브리타임">에브리타임</option>
                            <option value="학교 커뮤니티">학교 커뮤니티</option>
                            <option value="링커리어">링커리어</option>
                            <option value="캠퍼스픽">캠퍼스픽</option>
                            <option value="인스타그램">인스타그램</option>
                            <option value="페이스북">페이스북</option>
                            <option value="구글/네이버 등 검색">구글/네이버 등 검색</option>
                            <option value="지인 소개">지인 소개</option>
                            <option value="기타">기타</option>
                          </select>
                        </div>
                        
                        {editFormData.referralPath === '지인 소개' && (
                          <div className="mb-4">
                            <FormInput
                              label="소개해 주신 분의 이름"
                              name="referrerName"
                              type="text"
                              placeholder="지인의 이름을 입력해주세요"
                              value={editFormData.referrerName || ''}
                              onChange={handleEditFormChange}
                            />
                          </div>
                        )}
                        
                        {editFormData.referralPath === '기타' && (
                          <div className="mb-4">
                            <FormInput
                              label="기타 경로 상세"
                              name="otherReferralDetail"
                              type="text"
                              placeholder="어떤 경로로 알게 되셨는지 입력해주세요"
                              value={editFormData.otherReferralDetail || ''}
                              onChange={handleEditFormChange}
                            />
                          </div>
                        )}
                        
                        <div className="md:col-span-2">
                          <FormInput
                            label="주소"
                            name="address"
                            type="text"
                            value={editFormData.address || ''}
                            onChange={handleEditFormChange}
                          />
                        </div>
                        
                        <FormInput
                          label="상세 주소"
                          name="addressDetail"
                          type="text"
                          value={editFormData.addressDetail || ''}
                          onChange={handleEditFormChange}
                        />
                        
                        <div className="mb-4">
                          <label className="block text-gray-700 text-sm font-medium mb-2">역할</label>
                          <select
                            name="role"
                            value={editFormData.role}
                            onChange={handleEditFormChange}
                            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="user">사용자</option>
                            <option value="mentor">멘토</option>
                            <option value="admin">관리자</option>
                          </select>
                        </div>

                        <div className="mb-4">
                          <label className="block text-gray-700 text-sm font-medium mb-2">상태</label>
                          <select
                            name="status"
                            value={editFormData.status}
                            onChange={handleEditFormChange}
                            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="active">활성</option>
                            <option value="inactive">비활성</option>
                            <option value="temp">임시</option>
                          </select>
                        </div>

                        <div className="mb-4">
                          <label className="block text-gray-700 text-sm font-medium mb-2">성별</label>
                          <select
                            name="gender"
                            value={editFormData.gender || ''}
                            onChange={handleEditFormChange}
                            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">선택</option>
                            <option value="M">남성</option>
                            <option value="F">여성</option>
                          </select>
                        </div>

                        <div className="mb-4">
                          <label className="block text-gray-700 text-sm font-medium mb-2">주민등록번호 앞자리</label>
                          <input
                            type="text"
                            name="rrnFront"
                            value={editFormData.rrnFront || ''}
                            onChange={handleEditFormChange}
                            maxLength={6}
                            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div className="mb-4">
                          <label className="block text-gray-700 text-sm font-medium mb-2">주민등록번호 뒷자리</label>
                          <input
                            type="text"
                            name="rrnLast"
                            value={editFormData.rrnLast || ''}
                            onChange={handleEditFormChange}
                            maxLength={7}
                            className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {/* 학교 정보 */}
                      <div className="mt-6 border-t pt-4">
                        <h3 className="text-lg font-semibold mb-3">학교 정보</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormInput
                            label="학교"
                            name="university"
                            type="text"
                            value={editFormData.university || ''}
                            onChange={handleEditFormChange}
                          />

                          <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-medium mb-2">학년</label>
                            <select
                              name="grade"
                              value={editFormData.grade || ''}
                              onChange={handleEditFormChange}
                              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">선택</option>
                              <option value="1">1학년</option>
                              <option value="2">2학년</option>
                              <option value="3">3학년</option>
                              <option value="4">4학년</option>
                            </select>
                          </div>

                          <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-medium mb-2">휴학 상태</label>
                            <select
                              name="isOnLeave"
                              value={editFormData.isOnLeave?.toString() || 'false'}
                              onChange={(e) => handleEditFormChange({
                                target: {
                                  name: 'isOnLeave',
                                  value: e.target.value === 'true'
                                }
                              })}
                              className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="false">재학 중</option>
                              <option value="true">휴학 중</option>
                            </select>
                          </div>

                          <FormInput
                            label="전공 (1전공)"
                            name="major1"
                            type="text"
                            value={editFormData.major1 || ''}
                            onChange={handleEditFormChange}
                          />

                          <FormInput
                            label="전공 (2전공/부전공)"
                            name="major2"
                            type="text"
                            value={editFormData.major2 || ''}
                            onChange={handleEditFormChange}
                          />
                        </div>
                      </div>

                      {/* 자기소개/지원동기 섹션 */}
                      <div className="mt-6 border-t pt-4">
                        <h3 className="text-lg font-semibold mb-3">자기소개서 및 지원동기</h3>
                        <div className="space-y-4">
                          <div>
                            <p className="text-sm text-gray-500">자기소개서</p>
                            <p className="text-gray-900 whitespace-pre-line bg-gray-50 p-3 rounded mt-1 min-h-[60px]">
                              {editFormData.selfIntroduction || ''}
                            </p>
                          </div>

                          <div>
                            <p className="text-sm text-gray-500">지원 동기</p>
                            <p className="text-gray-900 whitespace-pre-line bg-gray-50 p-3 rounded mt-1 min-h-[60px]">
                              {editFormData.jobMotivation || ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // 상세 정보 보기 - 모바일 최적화
                    <div className="p-4 md:p-6">
                      <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-6 gap-4">
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
                          <div className="min-w-0">
                            <h2 className="text-xl font-bold text-gray-900 truncate">{selectedUser.name}</h2>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span key={`detail-role-${selectedUser.userId}`} className={`inline-block px-2 py-0.5 text-xs rounded-full ${
                                selectedUser.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                                selectedUser.role === 'mentor' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {selectedUser.role === 'admin' ? '관리자' : 
                                 selectedUser.role === 'mentor' ? '멘토' : '사용자'}
                              </span>
                              <span key={`detail-status-${selectedUser.userId}`} className={`inline-block px-2 py-0.5 text-xs rounded-full ${
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
                        <div className="flex gap-2 self-end md:self-start">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleStartEdit}
                          >
                            수정
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={handleDeleteUser}
                          >
                            삭제
                          </Button>
                        </div>
                      </div>

                      {/* 직무 경험 섹션 - 모바일 최적화 */}
                      {renderJobExperiencesSection()}

                      <div className="grid grid-cols-1 md:grid-cols-2 mt-4 gap-y-4 border-t pt-4">
                        <div>
                          <p className="text-sm text-gray-500">이메일</p>
                          <p className="text-gray-900 break-words">{selectedUser.email || '-'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">전화번호</p>
                          <p className="text-gray-900">
                            {selectedUser.phoneNumber ? formatPhoneNumber(selectedUser.phoneNumber) : '-'}
                          </p>
                        </div>
                        <div className="md:col-span-2">
                          <p className="text-sm text-gray-500">주소</p>
                          <p className="text-gray-900 break-words">
                            {selectedUser.address ? `${selectedUser.address} ${selectedUser.addressDetail || ''}` : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">성별</p>
                          <p className="text-gray-900">
                            {selectedUser.gender === 'M' ? '남성' : selectedUser.gender === 'F' ? '여성' : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">나이</p>
                          <p className="text-gray-900">
                            {selectedUser.age ? `${selectedUser.age}세` : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">지원 경로</p>
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
                          <p className="text-sm text-gray-500">주민등록번호</p>
                          <p className="text-gray-900">
                            {selectedUser.rrnFront && selectedUser.rrnLast ? 
                              `${selectedUser.rrnFront}-${selectedUser.rrnLast}` : '-'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">이메일 인증</p>
                          <p className="text-gray-900">
                            {selectedUser.isEmailVerified ? '인증됨' : '미인증'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">가입일</p>
                          <p className="text-gray-900">{formatDate(selectedUser.createdAt)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">정보 업데이트</p>
                          <p className="text-gray-900">{formatDate(selectedUser.updatedAt)}</p>
                        </div>
                      </div>

                      {/* 학교 정보 섹션 */}
                      <div className="mt-6 border-t pt-4">
                        <h3 className="text-lg font-semibold mb-3">학교 정보</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4">
                          <div>
                            <p className="text-sm text-gray-500">학교</p>
                            <p className="text-gray-900">{selectedUser.university || '-'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">학년</p>
                            <p className="text-gray-900">{selectedUser.grade ? `${selectedUser.grade}학년` : '-'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">휴학 상태</p>
                            <p className="text-gray-900">{selectedUser.isOnLeave ? '휴학 중' : '재학 중'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">전공 (1전공)</p>
                            <p className="text-gray-900">{selectedUser.major1 || '-'}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">전공 (2전공/부전공)</p>
                            <p className="text-gray-900">{selectedUser.major2 || '없음'}</p>
                          </div>
                        </div>
                      </div>

                      {/* 자기소개/지원동기 섹션 */}
                      <div className="mt-6 border-t pt-4">
                        <h3 className="text-lg font-semibold mb-3">자기소개 및 지원동기</h3>
                        <div className="space-y-4">
                          <div>
                            <p className="text-sm text-gray-500">자기소개</p>
                            <p className="text-gray-900 whitespace-pre-line bg-gray-50 p-3 rounded mt-1 min-h-[60px]">
                              {selectedUser.selfIntroduction || '-'}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">지원 동기</p>
                            <p className="text-gray-900 whitespace-pre-line bg-gray-50 p-3 rounded mt-1 min-h-[60px]">
                              {selectedUser.jobMotivation || '-'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 알바 & 멘토링 경력 섹션 */}
                      <div className="mt-6 border-t pt-4">
                        <h3 className="text-lg font-semibold mb-3">알바 & 멘토링 경력</h3>
                        {!selectedUser.partTimeJobs || selectedUser.partTimeJobs.length === 0 ? (
                          <p className="text-gray-500">등록된 알바 & 멘토링 경력이 없습니다.</p>
                        ) : (
                          <div className="space-y-4">
                            {selectedUser.partTimeJobs.map((job, index) => (
                              <div key={index} className="bg-gray-50 p-4 rounded-md border border-gray-200">
                                <div className="flex justify-between mb-2">
                                  <span className="font-medium">{job.companyName}</span>
                                  <span className="text-sm text-gray-500">{job.period}</span>
                                </div>
                                <div className="mb-2">
                                  <span className="text-sm text-gray-500 mr-2">담당:</span>
                                  <span>{job.position}</span>
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

                      {/* 피드백 섹션 */}
                      <div className="mt-6 border-t pt-4">
                        <h3 className="text-lg font-semibold mb-3">피드백</h3>
                        <p className="text-gray-900 whitespace-pre-line bg-gray-50 p-3 rounded min-h-[80px]">
                          {selectedUser.feedback || '-'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-6 md:p-10 text-center">
                  <p className="text-gray-500">
                    {window.innerWidth < 768 ? 
                      "사용자를 선택해 주세요." : 
                      "좌측에서 사용자를 선택해 주세요."}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
} 