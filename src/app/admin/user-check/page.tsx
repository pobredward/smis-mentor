'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { getAllJobCodes, getUsersByJobCode } from '@/lib/firebaseService';
import { JobCodeWithId, User } from '@/types';
import { formatPhoneNumber } from '@/components/common/PhoneInput';
import { useRouter } from 'next/navigation';
import { maskRRNLast } from '@/utils/userUtils';
import { getLessonMaterials, getSections, LessonMaterialData, SectionData, getLessonMaterialTemplates, LessonMaterialTemplate } from '@/lib/lessonMaterialService';

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
  const [mode, setMode] = useState<'mode1' | 'mode2'>('mode2');
  
  // 그룹 순서 정의
  const groupOrder = ['manager', 'common', 'junior', 'middle', 'senior', 'spring', 'summer', 'autumn', 'winter'];
  
  // 그룹 이름 매핑
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
        
        // 사용자를 그룹별로 분류
        enrichedUsers.forEach(user => {
          const group = user.groupName || 'junior';
          if (grouped[group]) {
            grouped[group].push(user);
          } else {
            grouped['junior'].push(user); // 알 수 없는 그룹은 기본값으로
          }
        });
        
        setUsers(enrichedUsers);
        setGroupedUsers(grouped);
      } catch (error) {
        console.error('사용자 로드 오류:', error);
        toast.error('사용자 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, [selectedGeneration, selectedCode, jobCodes]);

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
          <p className="text-xs sm:text-sm text-gray-500 truncate">{user.phoneNumber ? formatPhoneNumber(user.phoneNumber) : '-'}</p>
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
    const [selectedGeneration, setSelectedGeneration] = useState<string>('전체');
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
          setMaterials(materials);
          setTemplates(templates);
          // 각 대제목별 소제목(섹션) 동시 조회
          const sectionsEntries = await Promise.all(
            materials.map(async (mat) => [mat.id, await getSections(mat.id)])
          );
          setSectionsMap(Object.fromEntries(sectionsEntries));
        })
        .catch(() => {
          setError('수업 자료를 불러오는 중 오류가 발생했습니다.');
        })
        .finally(() => setIsLoading(false));
    }, [userId]);

    // 기수 매핑
    const materialCodeMap: Record<string, string> = {};
    materials.forEach(m => {
      if (m.templateId) {
        const tpl = templates.find(t => t.id === m.templateId);
        materialCodeMap[m.id] = tpl?.code || '미지정';
      } else {
        materialCodeMap[m.id] = '미지정';
      }
    });
    const allCodes = Array.from(new Set(Object.values(materialCodeMap)));
    const sortedCodes = allCodes.sort((a, b) => {
      if (a === '미지정') return 1;
      if (b === '미지정') return -1;
      return a.localeCompare(b);
    });
    const filteredMaterials = selectedGeneration === '전체'
      ? materials
      : materials.filter(m => materialCodeMap[m.id] === selectedGeneration);

    if (isLoading) {
      return <div className="py-4 text-center text-gray-400">수업 자료 불러오는 중...</div>;
    }
    if (error) {
      return <div className="py-4 text-center text-red-500">{error}</div>;
    }
    if (!materials.length) {
      return <div className="py-4 text-center text-gray-400">등록된 수업 자료가 없습니다.</div>;
    }
    return (
      <div>
        {/* 기수별 토글 */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            className={`px-3 py-1.5 text-sm rounded-full border ${selectedGeneration === '전체' ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            onClick={() => setSelectedGeneration('전체')}
          >전체</button>
          {sortedCodes.map(code => (
            <button
              key={code}
              className={`px-3 py-1.5 text-sm rounded-full border ${selectedGeneration === code ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
              onClick={() => setSelectedGeneration(code)}
            >{code}</button>
          ))}
        </div>
        <div className="space-y-6">
          {filteredMaterials.map((mat) => (
            <div key={mat.id} className="border rounded-lg p-4 bg-gray-50">
              <h4 className="font-semibold text-base mb-2">{mat.title}</h4>
              <div className="space-y-2">
                {(sectionsMap[mat.id] || []).map((section) => (
                  <div key={section.id} className="flex flex-col sm:flex-row sm:items-center sm:gap-4 bg-white rounded px-3 py-2 border">
                    <span className="font-medium text-gray-800 flex-1">{section.title}</span>
                    <div className="flex gap-2 mt-2 sm:mt-0">
                      <a
                        href={section.viewUrl || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`px-3 py-1 rounded text-sm font-medium border transition-colors ${section.viewUrl ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}`}
                        tabIndex={section.viewUrl ? 0 : -1}
                        aria-disabled={!section.viewUrl}
                      >
                        공개보기
                      </a>
                      <a
                        href={section.originalUrl || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`px-3 py-1 rounded text-sm font-medium border transition-colors ${section.originalUrl ? 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}`}
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
          ))}
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
          <p className="text-gray-500 mt-1">업무 코드별로 사용자를 조회합니다.</p>
        </div>

        {/* 모드 토글 */}
        <div className="flex gap-2 mb-4">
          <button
            className={`px-3 py-1.5 text-sm rounded-full border ${mode === 'mode1' ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            onClick={() => setMode('mode1')}
          >1번모드</button>
          <button
            className={`px-3 py-1.5 text-sm rounded-full border ${mode === 'mode2' ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
            onClick={() => setMode('mode2')}
          >2번모드</button>
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
                        ? 'bg-blue-100 border-blue-300 text-blue-800 text-xs'
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 text-xs'
                    }`}
                    onClick={() => setSelectedCode(code.code)}
                  >
                    {code.code} {code.name}
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
                {mode === 'mode2' ? (
                  <>
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
                          <p className="text-gray-600 text-sm">{selectedUser.phoneNumber ? formatPhoneNumber(selectedUser.phoneNumber) : '-'}</p>
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
                    {/* 수업 자료만 */}
                    <h3 className="text-lg font-semibold mb-3">수업 자료</h3>
                    <UserLessonMaterials userId={selectedUser.userId} />
                  </>
                ) : (
                  <>
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
                          <p className="text-gray-600 text-sm">{selectedUser.phoneNumber ? formatPhoneNumber(selectedUser.phoneNumber) : '-'}</p>
                          <div className="flex items-center mt-1">
                            {/* 그룹 정보 표시 */}
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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 border-t pt-4">
                      <div>
                        <p className="text-sm text-gray-500">이메일</p>
                        <p className="text-gray-900 break-words">{selectedUser.email || '-'}</p>
                      </div>
                      {/* <div>
                        <p className="text-sm text-gray-500">전화번호</p>
                        <p className="text-gray-900">
                          {selectedUser.phoneNumber ? formatPhoneNumber(selectedUser.phoneNumber) : '-'}
                        </p>
                      </div> */}
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
                        <p className="text-sm text-gray-500">주민등록번호</p>
                        <p className="text-gray-900">
                          {selectedUser.rrnFront && selectedUser.rrnLast ?
                            `${selectedUser.rrnFront}-${maskRRNLast(selectedUser.rrnLast)}` : '-'}
                        </p>
                      </div>
                      <div className="md:col-span-2">
                        <p className="text-sm text-gray-500">주소</p>
                        <p className="text-gray-900 break-words">
                          {selectedUser.address ? `${selectedUser.address} ${selectedUser.addressDetail || ''}` : '-'}
                        </p>
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
                          <p className="text-gray-900">{selectedUser.grade ? (selectedUser.grade === 6 ? '졸업생' : `${selectedUser.grade}학년`) : '-'}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">휴학 상태</p>
                          <p className="text-gray-900">{selectedUser.grade === 6 || selectedUser.isOnLeave === null ? '졸업생' : selectedUser.isOnLeave ? '휴학 중' : '재학 중'}</p>
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

                    {/* 업무 경력 정보 */}
                    <div className="mt-6 border-t pt-4">
                      <h3 className="text-lg font-semibold mb-3">업무 경력</h3>
                      {selectedUser.jobExperiences && selectedUser.jobExperiences.length > 0 ? (
                        <div className="space-y-2">
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
                              const groupRole = exp.groupRole;
                              const classCode = exp.classCode;
                              return (
                                <div key={idx} className="bg-blue-50 text-blue-800 px-3 py-2 rounded-lg">
                                  <span>
                                    {exp.group ? `[${
                                      exp.group === 'junior' ? '주니어' :
                                      exp.group === 'middle' ? '미들' :
                                      exp.group === 'senior' ? '시니어' :
                                      exp.group === 'spring' ? '스프링' :
                                      exp.group === 'summer' ? '서머' :
                                      exp.group === 'autumn' ? '어텀' :
                                      exp.group === 'winter' ? '윈터' :
                                      exp.group === 'common' ? '공통' :
                                      '매니저'}] ` : ''}
                                    {jobCode ? `${jobCode.generation} ${jobCode.name}` : exp.id}
                                  </span>
                                  {groupRole && (
                                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700 border border-gray-300">{groupRole}</span>
                                  )}
                                  {classCode && (
                                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">{classCode}</span>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <p className="text-gray-500">등록된 업무 경력이 없습니다.</p>
                      )}
                    </div>
                  </>
                )}
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