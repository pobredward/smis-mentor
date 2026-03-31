'use client';
import { logger } from '@smis-mentor/shared';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import Layout from '@/components/common/Layout';
import { getAllJobBoards, getJobCodeById, clearJobBoardsCache, createJobBoard, updateJobBoard, getAllJobCodes } from '@/lib/firebaseService';
import { JobBoard, JobCodeWithId } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

type JobBoardWithId = JobBoard & { id: string };

export default function JobBoardListClient() {
  const { userData } = useAuth();
  const [jobBoards, setJobBoards] = useState<JobBoardWithId[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'closed'>('active');
  const [jobCodesMap, setJobCodesMap] = useState<{[key: string]: JobCodeWithId}>({});
  const [isCreating, setIsCreating] = useState(false);
  const [allJobCodes, setAllJobCodes] = useState<JobCodeWithId[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  
  const isAdmin = userData?.role === 'admin';
  
  // 폼 상태
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    refJobCodeId: '',
    selectedGeneration: '',
  });

  useEffect(() => {
    const loadJobBoards = async () => {
      try {
        setIsLoading(true);
        await clearJobBoardsCache();
        const boards = await getAllJobBoards();
        const sortedBoards = boards.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        const jobCodeIds = sortedBoards.map(board => board.refJobCodeId);
        const uniqueJobCodeIds = [...new Set(jobCodeIds)];
        const jobCodesData: {[key: string]: JobCodeWithId} = {};
        for (const id of uniqueJobCodeIds) {
          const jobCode = await getJobCodeById(id);
          if (jobCode) {
            jobCodesData[id] = jobCode;
          }
        }
        setJobCodesMap(jobCodesData);
        setJobBoards(sortedBoards);
        
        // 모든 job codes 로드 (관리자용)
        if (isAdmin) {
          const codes = await getAllJobCodes();
          setAllJobCodes(codes);
        }
      } catch (error) {
        logger.error('공고 정보 로드 오류:', error);
        toast.error('공고 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };
    loadJobBoards();
  }, [isAdmin]);

  const handleSelectBoard = (boardId: string) => {
    router.push(`/job-board/${boardId}`);
  };

  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return format(date, 'yyyy.MM.dd(EEE)', { locale: ko });
  };

  const handleToggleStatus = async (boardId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'active' ? 'closed' : 'active';
      await updateJobBoard(boardId, { status: newStatus });
      setJobBoards(prev => prev.map(board => 
        board.id === boardId ? { ...board, status: newStatus } : board
      ));
      toast.success(`공고가 ${newStatus === 'active' ? '모집중' : '마감'}으로 변경되었습니다.`);
    } catch (error) {
      logger.error('공고 상태 변경 오류:', error);
      toast.error('공고 상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handleCreateJobBoard = () => {
    setIsCreating(true);
    setFormData({
      title: '',
      description: '',
      refJobCodeId: '',
      selectedGeneration: '',
    });
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setFormData({
      title: '',
      description: '',
      refJobCodeId: '',
      selectedGeneration: '',
    });
  };

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.refJobCodeId || !formData.title || !formData.description) {
      toast.error('모든 필수 항목을 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedJobCode = allJobCodes.find(code => code.id === formData.refJobCodeId);
      if (!selectedJobCode) {
        toast.error('선택한 업무 코드를 찾을 수 없습니다.');
        return;
      }

      const jobBoardData = {
        refJobCodeId: formData.refJobCodeId,
        title: formData.title,
        description: formData.description,
        generation: selectedJobCode.generation,
        code: selectedJobCode.code,
        korea: selectedJobCode.location?.includes('한국') || selectedJobCode.location?.includes('국내') || false,
        jobCode: selectedJobCode.code,
        educationStartDate: selectedJobCode.startDate,
        educationEndDate: selectedJobCode.endDate,
        interviewDates: [],
        interviewBaseLink: '',
        interviewBaseDuration: 30,
        interviewBaseNotes: '',
        interviewPassword: '',
        status: 'active',
      };

      await createJobBoard(jobBoardData as any);
      toast.success('공고가 성공적으로 생성되었습니다.');
      
      // 목록 새로고침
      await clearJobBoardsCache();
      const boards = await getAllJobBoards();
      const sortedBoards = boards.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
      setJobBoards(sortedBoards);
      
      handleCancelCreate();
    } catch (error) {
      logger.error('공고 생성 오류:', error);
      toast.error('공고 생성 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 필터링된 공고 목록 (일반 유저는 active만, 관리자는 선택한 상태)
  const filteredBoards = jobBoards.filter(board => {
    if (!isAdmin) {
      return board.status === 'active';
    }
    if (selectedStatus === 'all') return true;
    return board.status === selectedStatus;
  });
  
  // 기수별로 필터링된 업무 코드
  const filteredJobCodes = formData.selectedGeneration
    ? allJobCodes.filter(code => code.generation === formData.selectedGeneration)
    : [];
  
  // 기수 목록
  const generations = Array.from(new Set(allJobCodes.map(code => code.generation))).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''));
    const numB = parseInt(b.replace(/\D/g, ''));
    return numB - numA;
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "홈", "item": "https://www.smis-mentor.com" },
            { "@type": "ListItem", "position": 2, "name": "채용공고", "item": "https://www.smis-mentor.com/job-board" }
          ]
        })
      }} />
      
      <Layout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {!isCreating ? (
            <>
              <div className="mb-4 sm:mb-8">
                <div className="mb-4 flex justify-between items-center">
                  <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">업무 공고</h1>
                    <p className="mt-1 text-sm text-gray-600">업무 공고를 확인하고 지원해보세요.</p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={handleCreateJobBoard}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                      </svg>
                      공고 작성
                    </button>
                  )}
                </div>
                {isAdmin && (
                  <div className="mt-4 flex gap-3">
                    <div 
                      onClick={() => setSelectedStatus('all')}
                      className={`px-4 py-2 rounded-lg cursor-pointer transition-all duration-300 ${
                        selectedStatus === 'all'
                          ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-500'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <span className="text-sm font-medium">전체</span>
                    </div>
                    <div 
                      onClick={() => setSelectedStatus('active')}
                      className={`px-4 py-2 rounded-lg cursor-pointer transition-all duration-300 ${
                        selectedStatus === 'active'
                          ? 'bg-green-100 text-green-800 ring-1 ring-green-500'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <span className="text-sm font-medium">모집중인 공고</span>
                    </div>
                    <div 
                      onClick={() => setSelectedStatus('closed')}
                      className={`px-4 py-2 rounded-lg cursor-pointer transition-all duration-300 ${
                        selectedStatus === 'closed'
                          ? 'bg-red-100 text-red-800 ring-1 ring-red-500'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <span className="text-sm font-medium">마감인 공고</span>
                    </div>
                  </div>
                )}
              </div>
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
                </div>
              ) : filteredBoards.length === 0 ? (
                <div className="text-center py-10 bg-white rounded-lg shadow">
                  <p className="text-gray-500">
                    {!isAdmin ? '현재 모집 중인 공고가 없습니다.' :
                     selectedStatus === 'active' ? '현재 모집 중인 공고가 없습니다.' : 
                     selectedStatus === 'closed' ? '마감된 공고가 없습니다.' : 
                     '등록된 공고가 없습니다.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {filteredBoards.map((board) => (
                      <div 
                        key={board.id}
                        className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col transform hover:scale-[1.02]"
                      >
                        <div 
                          className="p-5 sm:p-6 flex-grow cursor-pointer"
                          onClick={() => handleSelectBoard(board.id)}
                        >
                          <div className="flex items-center gap-3 mb-4 flex-wrap">
                            <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full bg-blue-100 text-blue-800 group-hover:bg-blue-200 transition-colors">
                              {board.generation}
                            </span>
                            <span className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                              board.korea
                                ? 'bg-green-100 text-green-800 group-hover:bg-green-200'
                                : 'bg-purple-100 text-purple-800 group-hover:bg-purple-200'
                            }`}>
                              {board.korea ? '국내' : '해외'}
                            </span>
                            <span className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full transition-colors ${
                              board.status === 'active'
                                ? 'bg-emerald-100 text-emerald-800 group-hover:bg-emerald-200'
                                : 'bg-gray-100 text-gray-800 group-hover:bg-gray-200'
                            }`}>
                              {board.status === 'active' ? '모집중' : '마감'}
                            </span>
                          </div>
                          <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors">
                            {board.title}
                          </h3>
                          <div className="space-y-3">
                            <div className="flex items-center text-sm text-gray-600">
                              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {jobCodesMap[board.refJobCodeId] ? 
                                `${formatDate(jobCodesMap[board.refJobCodeId].startDate)} ~ ${formatDate(jobCodesMap[board.refJobCodeId].endDate)}` : 
                                formatDate(board.educationStartDate) + ' ~ ' + formatDate(board.educationEndDate)
                              }
                            </div>
                            <div className="flex items-center text-sm text-gray-600">
                              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              {jobCodesMap[board.refJobCodeId] ? 
                                jobCodesMap[board.refJobCodeId].location : 
                                board.jobCode
                              }
                            </div>
                          </div>
                        </div>
                        <div className="bg-gray-50 px-5 sm:px-6 py-4 flex justify-between items-center border-t group-hover:bg-gray-100 transition-colors">
                          {isAdmin ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleStatus(board.id, board.status);
                              }}
                              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                                board.status === 'active'
                                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                  : 'bg-green-100 text-green-700 hover:bg-green-200'
                              }`}
                            >
                              {board.status === 'active' ? '마감으로 변경' : '모집중으로 변경'}
                            </button>
                          ) : (
                            <span className="text-sm font-medium text-gray-600">자세히 보기</span>
                          )}
                          <svg 
                            className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all cursor-pointer" 
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                            onClick={() => handleSelectBoard(board.id)}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </>
          ) : (
            <div className="mb-8">
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">공고 작성</h1>
                <p className="mt-1 text-sm text-gray-600">새로운 업무 공고를 작성합니다.</p>
              </div>
              
              <form onSubmit={handleSubmitCreate} className="bg-white rounded-lg shadow p-6 space-y-6">
                {/* 기수 선택 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    기수 선택 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.selectedGeneration}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        selectedGeneration: e.target.value,
                        refJobCodeId: '',
                      });
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">기수를 선택하세요</option>
                    {generations.map(gen => (
                      <option key={gen} value={gen}>{gen}</option>
                    ))}
                  </select>
                </div>

                {/* 업무 코드 선택 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    업무 코드 <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.refJobCodeId}
                    onChange={(e) => setFormData({ ...formData, refJobCodeId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={!formData.selectedGeneration}
                    required
                  >
                    <option value="">업무 코드를 선택하세요</option>
                    {filteredJobCodes.map(code => (
                      <option key={code.id} value={code.id}>
                        {code.code} - {code.name} ({code.location})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 제목 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    제목 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="공고 제목을 입력하세요"
                    required
                  />
                </div>

                {/* 설명 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    설명 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[120px]"
                    placeholder="공고 설명을 입력하세요"
                    required
                  />
                </div>

                {/* 버튼 */}
                <div className="flex gap-3 justify-end pt-4 border-t">
                  <button
                    type="button"
                    onClick={handleCancelCreate}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                    disabled={isSubmitting}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? '생성 중...' : '공고 작성'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </Layout>
    </>
  );
} 