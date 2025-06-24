'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { 
  getAllJobBoards, 
  getApplicationsByJobBoardId, 
  updateJobBoard, 
  createJobBoard,
  getAllJobCodes
} from '@/lib/firebaseService';
import { JobBoardWithId, ApplicationHistoryWithId, JobCodeWithId } from '@/types';

type JobBoardWithApplications = JobBoardWithId & { 
  applications: ApplicationHistoryWithId[];
  applicationsCount: number;
};

export default function JobBoardManage() {
  const [jobBoards, setJobBoards] = useState<JobBoardWithApplications[]>([]);
  const [jobCodes, setJobCodes] = useState<JobCodeWithId[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  // 공고 생성/수정 폼 상태
  const [selectedJobBoard, setSelectedJobBoard] = useState<JobBoardWithApplications | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    refJobCodeId: '',
    generation: '',
    jobCode: '',
    korea: true,
    interviewDates: [''],
    interviewBaseLink: '',
    interviewBaseDuration: '',
    interviewBaseNotes: '',
    status: 'active'
  });
  
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // 마운트 상태 관리
  useEffect(() => {
    setIsMounted(true);
    return () => {
      setIsMounted(false);
      // 상태 초기화
      setJobBoards([]);
      setJobCodes([]);
      setSelectedJobBoard(null);
      setIsCreating(false);
      setIsSubmitting(false);
    };
  }, []);

  // 안전한 상태 업데이트 함수
  const safeSetJobBoards = (value: JobBoardWithApplications[]) => {
    if (isMounted) setJobBoards(value);
  };
  const safeSetJobCodes = (value: JobCodeWithId[]) => {
    if (isMounted) setJobCodes(value);
  };
  const safeSetIsLoading = (value: boolean) => {
    if (isMounted) setIsLoading(value);
  };
  const safeSetIsSubmitting = (value: boolean) => {
    if (isMounted) setIsSubmitting(value);
  };
  const safeSetSelectedJobBoard = (value: JobBoardWithApplications | null) => {
    if (isMounted) setSelectedJobBoard(value);
  };
  const safeSetIsCreating = (value: boolean) => {
    if (isMounted) setIsCreating(value);
  };
  const safeSetFormData = (value: typeof formData) => {
    if (isMounted) setFormData(value);
  };
  
  // 데이터 로드 함수
  const loadData = async () => {
    try {
      safeSetIsLoading(true);
      
      // 업무 코드 로드
      const jobCodeData = await getAllJobCodes();
      
      // 기수별 내림차순 정렬
      const sortedJobCodes = jobCodeData.sort((a, b) => {
        // generation이 문자열인 경우 숫자로 변환하여 비교
        const generationA = typeof a.generation === 'string' 
          ? parseInt(a.generation.replace(/[^0-9]/g, '')) || 0
          : Number(a.generation) || 0;
        const generationB = typeof b.generation === 'string' 
          ? parseInt(b.generation.replace(/[^0-9]/g, '')) || 0
          : Number(b.generation) || 0;
        
        return generationB - generationA; // 내림차순 (높은 기수부터)
      });
      
      safeSetJobCodes(sortedJobCodes);
      
      // 모든 공고 로드
      const boards = await getAllJobBoards();
      
      // 각 공고의 지원 수 가져오기
      const jobBoardsWithApplications = await Promise.all(
        boards.map(async (board) => {
          try {
            const applications = await getApplicationsByJobBoardId(board.id);
            return {
              ...board,
              applications,
              applicationsCount: applications.length
            };
          } catch (error) {
            console.error(`지원 정보 로드 오류 (${board.id}):`, error);
            return {
              ...board,
              applications: [],
              applicationsCount: 0
            };
          }
        })
      );
      
      // 최신순 정렬
      const sortedBoards = jobBoardsWithApplications.sort((a, b) => 
        b.createdAt.seconds - a.createdAt.seconds
      );
      
      safeSetJobBoards(sortedBoards);
      
      return sortedBoards;
    } catch (error) {
      console.error('데이터 로드 오류:', error);
      toast.error('데이터를 불러오는 중 오류가 발생했습니다.');
      return [];
    } finally {
      safeSetIsLoading(false);
    }
  };
  
  useEffect(() => {
    const handleUrlParams = async () => {
      const sortedBoards = await loadData();
      
      // URL 파라미터 처리
      const editId = searchParams.get('edit');
      const closeId = searchParams.get('close');
      const activateId = searchParams.get('activate');
      
      if (editId) {
        const boardToEdit = sortedBoards.find(board => board.id === editId);
        if (boardToEdit) {
          handleEditJobBoard(boardToEdit);
        }
      } else if (closeId) {
        const boardToClose = sortedBoards.find(board => board.id === closeId);
        if (boardToClose && boardToClose.status === 'active') {
          handleCloseJobBoard(boardToClose);
        }
      } else if (activateId) {
        const boardToActivate = sortedBoards.find(board => board.id === activateId);
        if (boardToActivate && boardToActivate.status === 'closed') {
          handleActivateJobBoard(boardToActivate);
        }
      }
    };
    
    handleUrlParams();
  }, [searchParams]);
  
  // 날짜 포맷팅 함수
  const formatDate = (timestamp: Timestamp) => {
    if (!timestamp || typeof timestamp.toDate !== 'function') {
      return '날짜 없음';
    }
    const date = timestamp.toDate();
    // 로컬 시간대로 변환
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return localDate.toISOString().split('T')[0];
  };
  
  // 공고 수정 핸들러
  const handleEditJobBoard = (jobBoard: JobBoardWithApplications) => {
    console.log('Editing job board:', jobBoard);
    safeSetSelectedJobBoard(jobBoard);
    safeSetIsCreating(false);
    
    // interviewDates 안전하게 처리
    const safeInterviewDates = Array.isArray(jobBoard.interviewDates) && jobBoard.interviewDates.length > 0
      ? jobBoard.interviewDates.map(date => {
          try {
            return formatDate(date.start);
          } catch (error) {
            console.error('Interview date formatting error:', error);
            return '';
          }
        })
      : [''];
    
    safeSetFormData({
      title: jobBoard.title || '',
      description: jobBoard.description || '',
      refJobCodeId: jobBoard.refJobCodeId || '',
      generation: jobBoard.generation || '',
      jobCode: jobBoard.jobCode || '',
      korea: Boolean(jobBoard.korea),
      interviewDates: safeInterviewDates,
      interviewBaseLink: jobBoard.interviewBaseLink || '',
      interviewBaseDuration: jobBoard.interviewBaseDuration ? String(jobBoard.interviewBaseDuration) : '',
      interviewBaseNotes: jobBoard.interviewBaseNotes || '',
      status: jobBoard.status || 'active'
    });
  };
  
  // 공고 마감 핸들러
  const handleCloseJobBoard = async (jobBoard: JobBoardWithApplications) => {
    if (window.confirm('이 공고를 마감하시겠습니까?')) {
      try {
        safeSetIsSubmitting(true);
        await updateJobBoard(jobBoard.id, { status: 'closed' });
        
        // 상태 업데이트
        if (isMounted) {
          setJobBoards(prevBoards => 
            prevBoards.map(board => 
              board.id === jobBoard.id 
                ? { ...board, status: 'closed' } 
                : board
            )
          );
        }
        
        toast.success('공고가 마감되었습니다.');
        
        // URL 파라미터 제거
        router.replace('/admin/job-board-manage');
      } catch (error) {
        console.error('공고 마감 오류:', error);
        toast.error('공고 마감 중 오류가 발생했습니다.');
      } finally {
        safeSetIsSubmitting(false);
      }
    }
  };
  
  // 공고 활성화 핸들러
  const handleActivateJobBoard = async (jobBoard: JobBoardWithApplications) => {
    if (window.confirm('이 공고를 다시 활성화하시겠습니까?')) {
      try {
        safeSetIsSubmitting(true);
        await updateJobBoard(jobBoard.id, { status: 'active' });
        
        // 상태 업데이트
        if (isMounted) {
          setJobBoards(prevBoards => 
            prevBoards.map(board => 
              board.id === jobBoard.id 
                ? { ...board, status: 'active' } 
                : board
            )
          );
        }
        
        toast.success('공고가 활성화되었습니다.');
        
        // URL 파라미터 제거
        router.replace('/admin/job-board-manage');
      } catch (error) {
        console.error('공고 활성화 오류:', error);
        toast.error('공고 활성화 중 오류가 발생했습니다.');
      } finally {
        safeSetIsSubmitting(false);
      }
    }
  };
  
  // 면접 날짜 추가
  const addInterviewDate = () => {
    if (isMounted) {
      setFormData(prev => ({
        ...prev,
        interviewDates: [...prev.interviewDates, '']
      }));
    }
  };
  
  // 면접 날짜 제거
  const removeInterviewDate = (index: number) => {
    if (formData.interviewDates.length > 1 && isMounted) {
      setFormData(prev => ({
        ...prev,
        interviewDates: prev.interviewDates.filter((_, i) => i !== index)
      }));
    }
  };
  
  // 폼 필드 업데이트
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (isMounted) {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // korea 필드 업데이트
  const handleKoreaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isMounted) {
      setFormData(prev => ({ ...prev, korea: e.target.value === 'true' }));
    }
  };
  
  // 면접 날짜 변경
  const handleInterviewDateChange = (index: number, value: string) => {
    if (isMounted) {
      const newDates = [...formData.interviewDates];
      newDates[index] = value;
      setFormData(prev => ({ ...prev, interviewDates: newDates }));
    }
  };
  
  // 폼 제출 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    // 입력값 검증
    if (!formData.title.trim()) {
      toast.error('제목을 입력해주세요.');
      return;
    }
    
    if (!formData.description.trim()) {
      toast.error('설명을 입력해주세요.');
      return;
    }
    
    if (!formData.refJobCodeId) {
      toast.error('업무 구분을 선택해주세요.');
      return;
    }
    
    // 유효한 면접 날짜만 필터링
    const validInterviewDates = formData.interviewDates
      .filter(date => date && date.trim() !== '')
      .map(date => {
        try {
          const localDate = new Date(date);
          if (isNaN(localDate.getTime())) {
            throw new Error('Invalid date');
          }
          // UTC 시간으로 변환
          const utcDate = new Date(localDate.getTime() + (localDate.getTimezoneOffset() * 60000));
          return {
            start: Timestamp.fromDate(utcDate),
            end: Timestamp.fromDate(utcDate)
          };
        } catch (error) {
          console.error('Date conversion error:', error, 'for date:', date);
          return null;
        }
      })
      .filter(date => date !== null);
    
    if (validInterviewDates.length === 0) {
      toast.error('최소 하나 이상의 유효한 면접 날짜를 입력해주세요.');
      return;
    }
    
    try {
      safeSetIsSubmitting(true);
      
      if (isCreating) {
        // 새 공고 생성
        await createJobBoard({
          title: formData.title.trim(),
          description: formData.description.trim(),
          refJobCodeId: formData.refJobCodeId,
          generation: formData.generation,
          jobCode: formData.jobCode,
          korea: formData.korea,
          interviewDates: validInterviewDates,
          interviewBaseLink: formData.interviewBaseLink?.trim() || '',
          interviewBaseDuration: formData.interviewBaseDuration ? parseInt(formData.interviewBaseDuration) : 0,
          interviewBaseNotes: formData.interviewBaseNotes?.trim() || '',
          interviewPassword: '',
          educationStartDate: Timestamp.now(),
          educationEndDate: Timestamp.now(),
          status: formData.status as 'active' | 'closed',
          updatedAt: Timestamp.now()
        });
        
        toast.success('공고가 성공적으로 생성되었습니다.');
      } else if (selectedJobBoard) {
        // 기존 공고 수정
        await updateJobBoard(selectedJobBoard.id, {
          title: formData.title.trim(),
          description: formData.description.trim(),
          refJobCodeId: formData.refJobCodeId,
          generation: formData.generation,
          jobCode: formData.jobCode,
          korea: formData.korea,
          interviewDates: validInterviewDates,
          interviewBaseLink: formData.interviewBaseLink?.trim() || '',
          interviewBaseDuration: formData.interviewBaseDuration ? parseInt(formData.interviewBaseDuration) : 0,
          interviewBaseNotes: formData.interviewBaseNotes?.trim() || '',
          updatedAt: Timestamp.now()
        });
        
        toast.success('공고가 성공적으로 수정되었습니다.');
      }
      
      // 폼 리셋 및 데이터 새로고침
      safeSetSelectedJobBoard(null);
      safeSetIsCreating(false);
      safeSetFormData({
        title: '',
        description: '',
        refJobCodeId: '',
        generation: '',
        jobCode: '',
        korea: true,
        interviewDates: [''],
        interviewBaseLink: '',
        interviewBaseDuration: '',
        interviewBaseNotes: '',
        status: 'active'
      });
      
      // URL 파라미터 제거
      router.replace('/admin/job-board-manage');
      
      // 데이터 안전하게 다시 로드
      setTimeout(() => {
        loadData();
      }, 100);
    } catch (error) {
      console.error('공고 저장 오류:', error);
      toast.error('공고 저장 중 오류가 발생했습니다.');
    } finally {
      safeSetIsSubmitting(false);
    }
  };
  
  // 취소 핸들러
  const handleCancel = () => {
    safeSetSelectedJobBoard(null);
    safeSetIsCreating(false);
    safeSetFormData({
      title: '',
      description: '',
      refJobCodeId: '',
      generation: '',
      jobCode: '',
      korea: true,
      interviewDates: [''],
      interviewBaseLink: '',
      interviewBaseDuration: '',
      interviewBaseNotes: '',
      status: 'active'
    });
    
    // URL 파라미터 제거
    router.replace('/admin/job-board-manage');
  };
  
  // 지원자 확인 페이지로 이동
  const viewApplicants = (jobBoardId: string) => {
    router.push(`/admin/job-board-manage/applicants/${jobBoardId}`);
  };
  
  // 뒤로가기 (관리자 페이지로)
  const handleGoBack = () => {
    router.back();
  };
  
  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-7xl mx-auto lg:px-4 px-0">
        {/* 상단 헤더 */}
        <div className="flex items-center justify-between mb-6">
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
            <h1 className="text-2xl font-bold">지원 유저 관리</h1>
          </div>
          <Button 
            variant="primary" 
            onClick={() => {
              safeSetIsCreating(true);
              safeSetSelectedJobBoard(null);
              safeSetFormData({
                title: '',
                description: '',
                refJobCodeId: '',
                generation: '',
                jobCode: '',
                korea: true,
                interviewDates: [''],
                interviewBaseLink: '',
                interviewBaseDuration: '',
                interviewBaseNotes: '',
                status: 'active'
              });
            }}
          >
            새 공고 생성
          </Button>
        </div>
        
        {/* 공고 생성/수정 폼 */}
        {(isCreating || selectedJobBoard) && (
          <div className="mb-8 bg-white rounded-lg shadow-lg p-4 sm:p-6">
            <form onSubmit={handleSubmit}>
              <div className="mb-6">
                <h2 className="text-lg font-bold text-gray-900 mb-2">
                  {isCreating ? '새 공고 생성' : '공고 수정'}
                </h2>
                <p className="text-sm text-gray-600">
                  {isCreating ? '새로운 업무 공고를 생성합니다.' : '선택한 업무 공고를 수정합니다.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {/* 업무 구분 선택 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    업무 구분
                  </label>
                  <select
                    name="refJobCodeId"
                    value={formData.refJobCodeId}
                    onChange={handleChange}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">선택해주세요</option>
                    {jobCodes.map((code) => (
                      <option key={code.id} value={code.id}>
                        {code.generation} - {code.name} ({code.code})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 국내/해외 선택 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    근무 지역
                  </label>
                  <select
                    name="korea"
                    value={formData.korea.toString()}
                    onChange={handleKoreaChange}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="true">국내</option>
                    <option value="false">해외</option>
                  </select>
                </div>
              </div>

              {/* 공고 상태 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  공고 상태
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={(e) => handleChange(e)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="active">모집중</option>
                  <option value="closed">마감</option>
                </select>
              </div>

              {/* 공고 제목 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  공고 제목
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={(e) => handleChange(e)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="공고 제목을 입력하세요"
                  required
                />
              </div>

              {/* 공고 내용 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  공고 내용
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={(e) => handleChange(e)}
                  rows={6}
                  className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="공고 내용을 입력하세요"
                  required
                />
              </div>

              {/* 면접 날짜 선택 */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-gray-700">면접 날짜</label>
                  <button 
                    type="button" 
                    className="text-sm text-blue-600 hover:text-blue-800"
                    onClick={addInterviewDate}
                  >
                    + 날짜 추가
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.interviewDates.map((date, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => handleInterviewDateChange(index, e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                      {index > 0 && (
                        <button
                          type="button"
                          onClick={() => removeInterviewDate(index)}
                          className="p-1 text-red-500 hover:text-red-700"
                          aria-label="날짜 삭제"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 면접 기본 정보 섹션 */}
              <div className="mb-6 border-t pt-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">면접 기본 정보</h3>
                <p className="text-sm text-gray-500 mb-4">
                  아래 정보는 면접 상태가 &apos;면접예정&apos;으로 변경될 때 기본값으로 사용됩니다. 각 지원자별로 나중에 수정할 수 있습니다.
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">기본 줌 미팅 링크</label>
                    <input
                      type="text"
                      name="interviewBaseLink"
                      value={formData.interviewBaseLink}
                      onChange={(e) => handleChange(e)}
                      placeholder="https://zoom.us/j/..."
                      className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">기본 예상 소요시간(분)</label>
                    <input
                      type="number"
                      name="interviewBaseDuration"
                      value={formData.interviewBaseDuration}
                      onChange={(e) => handleChange(e)}
                      className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">기본 면접 안내사항</label>
                  <textarea
                    name="interviewBaseNotes"
                    value={formData.interviewBaseNotes}
                    onChange={(e) => handleChange(e)}
                    rows={3}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="면접 준비사항이나 추가 안내사항을 입력하세요..."
                  ></textarea>
                </div>
              </div>

              {/* 폼 제출/취소 버튼 */}
              <div className="flex justify-end gap-3 mt-6">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancel}
                  className="w-full sm:w-auto"
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmitting}
                  className="w-full sm:w-auto"
                >
                  {isCreating ? '공고 등록' : '공고 수정'}
                </Button>
              </div>
            </form>
          </div>
        )}
        
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          </div>
        ) : jobBoards.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-lg shadow">
            <p className="text-gray-500">등록된 공고가 없습니다.</p>
          </div>
        ) : (
          // 데스크탑에서는 테이블, 모바일에서는 카드 형태로 표시

      
          <>
            {/* 데스크탑 뷰 */}
            <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">공고</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">지역</th>
                      <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">지원자</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {jobBoards.map((board) => {
                      // 상태별 지원자 수 계산
                      const pendingCount = board.applications.filter(app => app.applicationStatus === 'pending').length;
                      const interviewCount = board.applications.filter(app => app.interviewStatus === 'pending').length;
                      const completeCount = board.applications.filter(app => app.interviewStatus === 'complete').length;
                      const passedCount = board.applications.filter(app => app.interviewStatus === 'passed').length;
                      const finalAcceptedCount = board.applications.filter(app => app.finalStatus === 'finalAccepted').length;
                      
                      return (
                      <tr 
                        key={board.id} 
                        className="hover:bg-gray-50 cursor-pointer transition-colors duration-150" 
                        onClick={() => viewApplicants(board.id)}
                      >
                        <td className="px-4 sm:px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-medium text-gray-900">{board.title}</span>
                            <span className="text-sm text-gray-500">{board.generation} ({board.jobCode})</span>
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            board.status === 'active' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {board.status === 'active' ? '모집중' : '마감'}
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            board.korea
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-purple-100 text-purple-800'
                          }`}>
                            {board.korea ? '국내' : '해외'}
                          </span>
                        </td>
                        <td className="px-4 sm:px-6 py-4 text-sm">
                          <div className="flex flex-col gap-1">
                            <div className="text-gray-700 font-medium">총 {board.applicationsCount}명</div>
                            <div className="flex flex-col sm:flex-row gap-2 text-xs">
                              <span className="inline-flex items-center">
                                <span className="h-2 w-2 rounded-full bg-cyan-500 mr-1"></span>
                                <span>서류 검토중: {pendingCount}명</span>
                              </span>
                              <span className="inline-flex items-center">
                                <span className="h-2 w-2 rounded-full bg-yellow-500 mr-1"></span>
                                <span>면접 예정자: {interviewCount}명</span>
                              </span>
                              <span className="inline-flex items-center">
                                <span className="h-2 w-2 rounded-full bg-purple-500 mr-1"></span>
                                <span>면접 완료자: {completeCount}명</span>
                              </span>
                              <span className="inline-flex items-center">
                                <span className="h-2 w-2 rounded-full bg-green-500 mr-1"></span>
                                <span>면접 합격자: {passedCount}명</span>
                              </span>
                              <span className="inline-flex items-center">
                                <span className="h-2 w-2 rounded-full bg-indigo-500 mr-1"></span>
                                <span>최종 합격자: {finalAcceptedCount}명</span>
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 모바일 뷰 - 카드 형태 */}
            <div className="md:hidden space-y-4">
              {jobBoards.map((board) => {
                // 상태별 지원자 수 계산
                const pendingCount = board.applications.filter(app => app.applicationStatus === 'pending').length;
                const interviewCount = board.applications.filter(app => app.interviewStatus === 'pending').length;
                const completeCount = board.applications.filter(app => app.interviewStatus === 'complete').length;
                const passedCount = board.applications.filter(app => app.interviewStatus === 'passed').length;
                const finalAcceptedCount = board.applications.filter(app => app.finalStatus === 'finalAccepted').length;
                
                return (
                <div 
                  key={board.id} 
                  className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow duration-200" 
                  onClick={() => viewApplicants(board.id)}
                >
                  <div className="mb-3">
                    <h3 className="font-medium text-gray-900">{board.title}</h3>
                    <p className="text-sm text-gray-500">{board.generation} ({board.jobCode})</p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mb-3">
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      board.status === 'active' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {board.status === 'active' ? '모집중' : '마감'}
                    </span>
                    
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      board.korea
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                    }`}>
                      {board.korea ? '국내' : '해외'}
                    </span>
                  </div>
                  
                  <div className="border-t pt-3 mt-2">
                    <div className="flex items-center gap-1 mb-2">
                      <span className="font-medium text-gray-700">총 지원자:</span>
                      <span className="bg-gray-100 px-2 py-0.5 rounded-full text-sm">{board.applicationsCount}명</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
                      <div className="flex gap-2 items-center">
                        <span className="h-2 w-2 rounded-full bg-cyan-500"></span>
                        <span>서류 검토중: {pendingCount}명</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
                        <span>면접 예정자: {interviewCount}명</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="h-2 w-2 rounded-full bg-purple-500"></span>
                        <span>면접 완료자: {completeCount}명</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="h-2 w-2 rounded-full bg-green-500"></span>
                        <span>면접 합격자: {passedCount}명</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                        <span>최종 합격자: {finalAcceptedCount}명</span>
                      </div>
                    </div>
                  </div>
                </div>
              )})}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
} 