'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { getAllJobCodes, getUsersByJobCode } from '@/lib/firebaseService';
import { JobCodeWithId, User } from '@/types';
import { formatPhoneNumber, formatPhoneNumberForMentor } from '@/utils/phoneUtils';
import { useRouter } from 'next/navigation';
import { maskRRNLast } from '@/utils/userUtils';
import { getLessonMaterials, getSections, LessonMaterialData, SectionData, getLessonMaterialTemplates, LessonMaterialTemplate } from '@/lib/lessonMaterialService';
import { getGenerationCodes, filterMaterialsByGeneration, filterSectionsWithLinks, getGroupLabel } from '@smis-mentor/shared';

type UserWithGroupInfo = User & { groupName?: string };

export default function UserCheck() {
  const router = useRouter();
  const [jobCodes, setJobCodes] = useState<JobCodeWithId[]>([]);
  const [generations, setGenerations] = useState<string[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<string>('');
  const [codesForGeneration, setCodesForGeneration] = useState<JobCodeWithId[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [users, setUsers] = useState<UserWithGroupInfo[]>([]);
  const [groupedUsers, setGroupedUsers] = useState<Record<string, UserWithGroupInfo[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showAllGenerations, setShowAllGenerations] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('mentor');
  
  const roleFilters = [
    { value: 'mentor', label: '멘토' },
    { value: 'foreign', label: '원어민' }
  ];
  
  // 그룹 순서 정의
  const groupOrder = ['manager', 'common', 'junior', 'middle', 'senior', 'spring', 'summer', 'autumn', 'winter'];
  
  // 그룹 이름 매핑 - getGroupLabel 함수 사용으로 제거 가능하지만 groupOrder와 groupColors를 위해 유지
  const groupLabels: Record<string, string> = {
    'junior': '주니어',
    'middle': '미들',
    'senior': '시니어',
    'spring': '스프링',
    'summer': '서머',
    'autumn': '어텀',
    'winter': '윈터',
    'common': '공통',
    'manager': '매니저'
  };
  
  // 그룹 색상 매핑
  const groupColors: Record<string, { bg: string, text: string }> = {
    'junior': { bg: 'bg-green-100', text: 'text-green-800' },
    'middle': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    'senior': { bg: 'bg-red-100', text: 'text-red-800' },
    'spring': { bg: 'bg-blue-100', text: 'text-blue-800' },
    'summer': { bg: 'bg-purple-100', text: 'text-purple-800' },
    'autumn': { bg: 'bg-orange-100', text: 'text-orange-800' },
    'winter': { bg: 'bg-pink-100', text: 'text-pink-800' },
    'common': { bg: 'bg-pink-100', text: 'text-gray-800' },
    'manager': { bg: 'bg-pink-100', text: 'text-black-800' },
  };
  
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
    
    // 커스텀 정렬: J, E, S, F, G, K 순서 우선, 나머지는 알파벳 순서
    const priorityOrder = ['J', 'E', 'S', 'F', 'G', 'K'];
    
    const filteredCodes = jobCodes
      .filter(code => code.generation === selectedGeneration)
      .sort((a, b) => {
        const aFirstChar = a.code.charAt(0).toUpperCase();
        const bFirstChar = b.code.charAt(0).toUpperCase();
        
        const aPriority = priorityOrder.indexOf(aFirstChar);
        const bPriority = priorityOrder.indexOf(bFirstChar);
        
        // 둘 다 우선순위에 있는 경우
        if (aPriority !== -1 && bPriority !== -1) {
          if (aPriority !== bPriority) return aPriority - bPriority;
          return a.code.localeCompare(b.code);
        }
        
        // a만 우선순위에 있는 경우
        if (aPriority !== -1) return -1;
        
        // b만 우선순위에 있는 경우
        if (bPriority !== -1) return 1;
        
        // 둘 다 우선순위에 없는 경우 알파벳 순서
        return a.code.localeCompare(b.code);
      });
    
    setCodesForGeneration(filteredCodes);
    
    // 기본 선택: 첫번째 코드 (있다면)
    if (filteredCodes.length > 0) {
      setSelectedCode(filteredCodes[0].code);
    } else {
      setSelectedCode('');
    }
  }, [selectedGeneration, jobCodes]);

  // 선택된 기수와 코드에 따라 사용자 로드 및 그룹화
  useEffect(() => {
    const loadUsers = async () => {
      if (!selectedGeneration || !selectedCode) {
        setUsers([]);
        setGroupedUsers({});
        return;
      }
      
      try {
        setIsLoading(true);
        const usersData = await getUsersByJobCode(selectedGeneration, selectedCode);
        
        // 각 사용자의 그룹 정보 가져오기
        const enrichedUsers = await Promise.all(
          usersData.map(async (user) => {
            if (user.jobExperiences && user.jobExperiences.length > 0) {
              try {
                // jobExperiences에서 현재 선택된 코드에 해당하는 경험 찾기
                let jobGroup = 'junior'; // 기본값
                
                // 새 형식 (객체 배열)인 경우
                if (typeof user.jobExperiences[0] === 'object') {
                  // 선택된 코드와 일치하는 경험 찾기
                  const relevantExperience = user.jobExperiences.find(exp => {
                    // jobCode 찾기
                    const jobCode = jobCodes.find(code => 
                      code.generation === selectedGeneration && 
                      code.code === selectedCode
                    );
                    
                    return jobCode && exp.id === jobCode.id;
                  });
                  
                  if (relevantExperience && 'group' in relevantExperience) {
                    jobGroup = relevantExperience.group;
                  }
                }
                
                // 그룹 이름 추가
                return { ...user, groupName: jobGroup };
              } catch (error) {
                console.error('사용자 그룹 정보 로드 오류:', error);
                return { ...user, groupName: 'junior' }; // 오류 시 기본값
              }
            }
            
            // 기본 그룹 할당
            return { ...user, groupName: 'junior' };
          })
        );
        
        // 사용자를 그룹별로 정렬
        const grouped: Record<string, UserWithGroupInfo[]> = {};
        
        // 그룹별 빈 배열 초기화
        groupOrder.forEach(group => {
          grouped[group] = [];
        });
        
        // role 필터링 적용 후 그룹별로 분류
        // mentor 선택 시 mentor_temp도 포함, foreign 선택 시 foreign_temp도 포함
        const filteredUsers = enrichedUsers.filter(user => {
          if (selectedRole === 'mentor') {
            return user.role === 'mentor' || user.role === 'mentor_temp';
          } else if (selectedRole === 'foreign') {
            return user.role === 'foreign' || user.role === 'foreign_temp';
          }
          return user.role === selectedRole;
        });
        
        console.log('🔍 User Check - 필터링 전 사용자 수:', enrichedUsers.length);
        console.log('🔍 User Check - selectedRole:', selectedRole);
        console.log('🔍 User Check - 필터링 후 사용자 수:', filteredUsers.length);
        console.log('🔍 User Check - 사용자 role 분포:', 
          enrichedUsers.reduce((acc: any, user) => {
            acc[user.role] = (acc[user.role] || 0) + 1;
            return acc;
          }, {})
        );
        
        // 사용자를 그룹별로 분류
        filteredUsers.forEach(user => {
          const group = user.groupName || 'junior';
          if (grouped[group]) {
            grouped[group].push(user);
          } else {
            grouped['junior'].push(user); // 알 수 없는 그룹은 기본값으로
          }
        });
        
        setUsers(filteredUsers);
        setGroupedUsers(grouped);
      } catch (error) {
        console.error('사용자 로드 오류:', error);
        toast.error('사용자 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, [selectedGeneration, selectedCode, jobCodes, selectedRole]);

  // 사용자 선택 핸들러 (모달 표시)
  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
  };

  // 모달 닫기 핸들러
  const handleCloseModal = () => {
    setSelectedUser(null);
  };

  // 사용자 카드 렌더링 함수
  const renderUserCard = (user: UserWithGroupInfo) => {
    // 현재 선택된 jobCodeId 찾기
    const jobCode = jobCodes.find(code => code.generation === selectedGeneration && code.code === selectedCode);
    const exp = user.jobExperiences?.find(exp => exp.id === jobCode?.id);
    const groupRole = exp?.groupRole;
    const classCode = exp?.classCode;
    return (
      <div
        className="bg-white rounded-lg shadow overflow-hidden cursor-pointer transform transition hover:scale-105 flex flex-col"
        onClick={() => handleSelectUser(user)}
      >
        <div className="aspect-square w-full bg-gray-200 relative">
          {user.profileImage ? (
            <img
              src={user.profileImage}
              alt={user.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
              <span className="text-4xl sm:text-5xl font-bold text-blue-300">{user.name.charAt(0)}</span>
            </div>
          )}
          <div className="absolute top-1 right-1 flex gap-1">
            {groupRole && (
              <span className="text-[9px] sm:text-xs px-1 sm:px-2 py-0.5 sm:py-1 rounded-full bg-gray-200 text-gray-700 border border-gray-300">
                {groupRole}
              </span>
            )}
            {classCode && (
              <span className="text-[9px] sm:text-xs px-1 sm:px-2 py-0.5 sm:py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                {classCode}
              </span>
            )}
          </div>
        </div>
        <div className="p-3 sm:p-4 flex-grow">
          <h3 className="font-bold text-base sm:text-lg text-gray-900">{user.name}</h3>
        </div>
      </div>
    );
  };

  // 뒤로가기 (관리자 페이지로)
  const handleGoBack = () => {
    router.back();
  };

  // 수업자료 리스트 컴포넌트
  function UserLessonMaterials({ userId }: { userId: string }) {
    const [materials, setMaterials] = useState<LessonMaterialData[]>([]);
    const [sectionsMap, setSectionsMap] = useState<Record<string, SectionData[]>>({});
    const [templates, setTemplates] = useState<LessonMaterialTemplate[]>([]);
    const [selectedGeneration, setSelectedGeneration] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      if (!userId) return;
      setIsLoading(true);
      setError(null);
      Promise.all([
        getLessonMaterials(userId),
        getLessonMaterialTemplates()
      ])
        .then(async ([materials, templates]) => {
          setTemplates(templates);
          
          // 각 대제목별 소제목(섹션) 동시 조회하고 링크가 있는 것만 필터링
          const sectionsEntries = await Promise.all(
            materials.map(async (mat) => {
              const allSections = await getSections(mat.id);
              const filteredSections = filterSectionsWithLinks(allSections);
              return [mat.id, filteredSections];
            })
          );
          
          const filteredSectionsMap = Object.fromEntries(sectionsEntries);
          setSectionsMap(filteredSectionsMap);
          
          // 링크가 있는 섹션이 있는 자료만 표시하도록 필터링
          const materialsWithLinks = materials.filter(mat => 
            filteredSectionsMap[mat.id]?.length > 0
          );
          setMaterials(materialsWithLinks);
          
          // 기수 코드 추출 및 자동 선택
          if (materialsWithLinks.length > 0) {
            const codes = getGenerationCodes(materialsWithLinks, templates as any);
            if (codes.length > 0) {
              setSelectedGeneration(codes[0]); // 가장 최근 기수 선택
            }
          }
        })
        .catch(() => {
          setError('수업 자료를 불러오는 중 오류가 발생했습니다.');
        })
        .finally(() => setIsLoading(false));
    }, [userId]);

    // 기수 코드 목록 (내림차순)
    const generationCodes = getGenerationCodes(materials, templates as any);
    
    // 선택된 기수의 자료만 필터링
    const filteredMaterials = selectedGeneration 
      ? filterMaterialsByGeneration(materials, templates as any, selectedGeneration)
      : [];

    if (isLoading) {
      return <div className="py-4 text-center text-gray-400">수업 자료 불러오는 중...</div>;
    }
    if (error) {
      return <div className="py-4 text-center text-red-500">{error}</div>;
    }
    if (!materials.length) {
      return <div className="py-4 text-center text-gray-400">링크가 업로드된 수업 자료가 없습니다.</div>;
    }
    
    return (
      <div>
        {/* 기수별 토글 (전체 제거, 내림차순) - 파란색 계열로 변경 */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {generationCodes.map(code => (
            <button
              key={code}
              className={`px-2.5 py-1 text-xs rounded-md border font-medium ${selectedGeneration === code ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              onClick={() => setSelectedGeneration(code)}
            >{code}</button>
          ))}
        </div>
        <div className="space-y-3">
          {filteredMaterials.map((mat) => {
            const sections = sectionsMap[mat.id] || [];
            if (sections.length === 0) return null;
            
            return (
              <div key={mat.id} className="border rounded-lg p-3 bg-gray-50">
                <h4 className="font-semibold text-sm mb-2">{mat.title}</h4>
                <div className="space-y-1.5">
                  {sections.map((section) => (
                    <div key={section.id} className="flex flex-col sm:flex-row sm:items-center sm:gap-2 bg-white rounded px-2.5 py-1.5 border text-sm">
                      <span className="font-medium text-gray-800 flex-1">{section.title}</span>
                      <div className="flex gap-1.5 mt-1 sm:mt-0">
                        <a
                          href={section.viewUrl || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${section.viewUrl ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}`}
                          tabIndex={section.viewUrl ? 0 : -1}
                          aria-disabled={!section.viewUrl}
                        >
                          공개보기
                        </a>
                        <a
                          href={section.originalUrl || undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${section.originalUrl ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}`}
                          tabIndex={section.originalUrl ? 0 : -1}
                          aria-disabled={!section.originalUrl}
                        >
                          원본
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-7xl mx-auto px-0 sm:px-0 lg:px-0">
        <div className="mb-6">
          <div className="flex items-center">
            <Button
              variant="secondary"
              size="sm"
              className="mr-3 text-blue-600 hover:text-blue-800 border-none shadow-none"
              onClick={handleGoBack}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </Button>
            <h1 className="text-2xl font-bold">사용자 조회</h1>
          </div>
        </div>

        {/* 필터 영역 */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="space-y-4">
            {/* Role 필터 */}
            <div>
              <div className="flex flex-wrap gap-2">
                {roleFilters.map(filter => (
                  <button
                    key={filter.value}
                    className={`px-3 py-1.5 text-sm rounded-full border font-medium ${
                      selectedRole === filter.value
                        ? 'bg-teal-100 border-teal-300 text-teal-800'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedRole(filter.value)}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            
            {/* 기수 선택 */}
            <div>
              <div className="flex flex-wrap gap-2">
                {/* 처음 3개 기수만 표시 */}
                {generations.slice(0, 3).map(gen => (
                  <button
                    key={gen}
                    className={`px-3 py-1.5 text-sm rounded-full border font-medium ${
                      selectedGeneration === gen
                        ? 'bg-blue-100 border-blue-300 text-blue-800'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedGeneration(gen)}
                  >
                    {gen}
                  </button>
                ))}
                
                {/* 숨기기/더보기 버튼 - 3개 초과시에만 표시 */}
                {generations.length > 3 && (
                  <button
                    className={`px-3 py-1.5 text-sm rounded-full border font-medium transition-all ${
                      showAllGenerations
                        ? 'bg-gray-400 border-gray-400 text-white'
                        : 'bg-gray-100 border-gray-300 text-gray-800 hover:bg-gray-200'
                    }`}
                    onClick={() => setShowAllGenerations(!showAllGenerations)}
                  >
                    {showAllGenerations ? '숨기기' : `더보기 (${generations.length - 3})`}
                  </button>
                )}
                
                {/* 나머지 기수 표시 - 토글 시에만 표시 */}
                {showAllGenerations && generations.slice(3).map(gen => (
                  <button
                    key={gen}
                    className={`px-3 py-1.5 text-sm rounded-full border font-medium ${
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
            
            {/* 코드 선택 */}
            <div>
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
                    {code.code}
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
              <div className="space-y-8">
                {groupOrder.map(group => {
                  let usersInGroup = groupedUsers[group] || [];
                  // 정렬: classCode 오름차순, 없으면 맨 뒤, 이름순 2차
                  usersInGroup = [...usersInGroup].sort((a, b) => {
                    const jobCode = jobCodes.find(code => code.generation === selectedGeneration && code.code === selectedCode);
                    const expA = a.jobExperiences?.find(exp => exp.id === jobCode?.id);
                    const expB = b.jobExperiences?.find(exp => exp.id === jobCode?.id);
                    const classCodeA = expA?.classCode;
                    const classCodeB = expB?.classCode;
                    if (classCodeA && classCodeB) {
                      if (classCodeA < classCodeB) return -1;
                      if (classCodeA > classCodeB) return 1;
                      // classCode 같으면 이름순
                      return (a.name || '').localeCompare(b.name || '');
                    }
                    if (classCodeA && !classCodeB) return -1;
                    if (!classCodeA && classCodeB) return 1;
                    // 둘 다 없으면 이름순
                    return (a.name || '').localeCompare(b.name || '');
                  });
                  
                  if (usersInGroup.length === 0) {
                    return null;
                  }
                  
                  return (
                    <div key={group} className="bg-white rounded-lg shadow-md p-4">
                      <div className="flex items-center mb-4">
                        <h2 className="text-lg font-bold">
                          {groupLabels[group]}
                        </h2>
                        <span className={`ml-2 text-sm px-2 py-0.5 rounded-full ${groupColors[group].bg} ${groupColors[group].text}`}>
                          {usersInGroup.length}명
                        </span>
                      </div>
                      
                      {/* 그리드 레이아웃: 모바일에서는 3개, 데스크탑에서는 6개 */}
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4">
                        {usersInGroup.map(user => (
                          <div key={user.userId || `user-${user.name}-${Math.random()}`}>
                            {renderUserCard(user)}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 사용자 상세 정보 모달 */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black/0 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                {/* 상단 요약(프로필, 이름, 연락처, 그룹 뱃지) */}
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
                      <p className="text-gray-600 text-sm">
                        {selectedUser.phoneNumber ? (
                          selectedUser.role === 'foreign' || selectedUser.role === 'foreign_temp' 
                            ? formatPhoneNumber(selectedUser.phoneNumber) 
                            : formatPhoneNumberForMentor(selectedUser.phoneNumber)
                        ) : '-'}
                      </p>
                      <div className="flex items-center mt-1">
                        {selectedUser && 
                          'groupName' in selectedUser && 
                          typeof selectedUser.groupName === 'string' && 
                          selectedUser.groupName && (
                            <span className={`px-2 py-0.5 text-xs rounded-full ${
                              groupColors[selectedUser.groupName as keyof typeof groupColors].bg} ${groupColors[selectedUser.groupName as keyof typeof groupColors].text
                            }`}>
                              {groupLabels[selectedUser.groupName as keyof typeof groupLabels]}
                            </span>
                        )}
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

                {/* 기본 정보 */}
                <div className="pt-3 mb-4">
                  <h3 className="text-base font-semibold mb-2">기본 정보</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">성별: </span>
                      <span className="text-gray-900">
                        {selectedUser.gender === 'M' ? '남성' : selectedUser.gender === 'F' ? '여성' : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">나이: </span>
                      <span className="text-gray-900">
                        {selectedUser.age ? `${selectedUser.age}세` : '-'}
                      </span>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <span className="text-gray-500">주민등록번호: </span>
                      <span className="text-gray-900">
                        {selectedUser.rrnFront && selectedUser.rrnLast ?
                          `${selectedUser.rrnFront}-${maskRRNLast(selectedUser.rrnLast)}` : '-'}
                      </span>
                    </div>
                    <div className="col-span-2 md:col-span-3">
                      <span className="text-gray-500">주소: </span>
                      <span className="text-gray-900">
                        {selectedUser.address ? `${selectedUser.address} ${selectedUser.addressDetail || ''}` : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 학교 정보 섹션 */}
                <div className="pt-3 mb-4">
                  <h3 className="text-base font-semibold mb-2">학교 정보</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <span className="text-gray-500">학교: </span>
                      <span className="text-gray-900">{selectedUser.university || '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">학년: </span>
                      <span className="text-gray-900">{selectedUser.grade ? (selectedUser.grade === 6 ? '졸업생' : `${selectedUser.grade}학년`) : '-'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">휴학: </span>
                      <span className="text-gray-900">{selectedUser.grade === 6 || selectedUser.isOnLeave === null ? '졸업생' : selectedUser.isOnLeave ? '휴학 중' : '재학 중'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">1전공: </span>
                      <span className="text-gray-900">{selectedUser.major1 || '-'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500">2전공/부전공: </span>
                      <span className="text-gray-900">{selectedUser.major2 || '없음'}</span>
                    </div>
                  </div>
                </div>

                {/* 업무 경력 정보 */}
                <div className="pt-3 mb-4">
                  <h3 className="text-base font-semibold mb-2">업무 경력</h3>
                  {selectedUser.jobExperiences && selectedUser.jobExperiences.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedUser.jobExperiences
                        .slice()
                        .sort((a, b) => {
                          const jobCodeA = jobCodes.find(code => code.id === a.id);
                          const jobCodeB = jobCodes.find(code => code.id === b.id);
                          const genA = jobCodeA ? parseInt(jobCodeA.generation.replace(/[^0-9]/g, '')) : -1;
                          const genB = jobCodeB ? parseInt(jobCodeB.generation.replace(/[^0-9]/g, '')) : -1;
                          return genB - genA;
                        })
                        .map((exp, idx) => {
                          const jobCode = jobCodes.find(code => code.id === exp.id);
                          return (
                            <span key={idx} className="inline-block px-2.5 py-1 rounded-md bg-gray-200 text-gray-700 text-xs font-semibold">
                              {jobCode ? jobCode.code : exp.id}
                            </span>
                          );
                        })}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">등록된 업무 경력이 없습니다.</p>
                  )}
                </div>

                {/* 수업 자료 */}
                <div className="pt-3 mb-4">
                  <h3 className="text-base font-semibold mb-2">수업 자료</h3>
                  <UserLessonMaterials userId={selectedUser.userId} />
                </div>

                <div className="mt-4 flex justify-end">
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