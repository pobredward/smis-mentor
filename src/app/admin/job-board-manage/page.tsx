'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
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
import { JobBoard, ApplicationHistory, JobCode } from '@/types';

type JobBoardWithApplications = JobBoard & { 
  id: string;
  applications: (ApplicationHistory & { id: string })[];
  applicationsCount: number;
};

export default function JobBoardManage() {
  const [jobBoards, setJobBoards] = useState<JobBoardWithApplications[]>([]);
  const [jobCodes, setJobCodes] = useState<JobCode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // 공고 생성/수정 폼 상태
  const [selectedJobBoard, setSelectedJobBoard] = useState<JobBoardWithApplications | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    refJobCodeId: '',
    refGeneration: '',
    refCode: '',
    interviewDates: [''],
    customInterviewDateAllowed: false,
    interviewBaseLink: '',
    interviewBaseDuration: '',
    interviewBaseNote: '',
    status: 'active'
  });
  
  const router = useRouter();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // 업무 코드 로드
        const jobCodeData = await getAllJobCodes();
        setJobCodes(jobCodeData);
        
        // 모든 공고 로드
        const boards = await getAllJobBoards();
        
        // 각 공고의 지원 수 가져오기
        const jobBoardsWithApplications = await Promise.all(
          boards.map(async (board) => {
            try {
              const applications = await getApplicationsByJobBoardId(board.jobBoardId);
              return {
                ...board,
                applications,
                applicationsCount: applications.length
              };
            } catch (error) {
              console.error(`지원 정보 로드 오류 (${board.jobBoardId}):`, error);
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
        
        setJobBoards(sortedBoards);
        
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
      } catch (error) {
        console.error('데이터 로드 오류:', error);
        toast.error('데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [searchParams]);
  
  // 날짜 포맷팅 함수
  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return format(date, 'yyyy년 MM월 dd일 (EEE)', { locale: ko });
  };
  
  // 공고 수정 핸들러
  const handleEditJobBoard = (jobBoard: JobBoardWithApplications) => {
    setSelectedJobBoard(jobBoard);
    setIsCreating(false);
    
    // 면접 날짜를 문자열로 변환
    const interviewDatesStrings = jobBoard.interviewDates.map(timestamp => 
      formatDate(timestamp).split(' ')[0]
    );
    
    setFormData({
      title: jobBoard.title,
      description: jobBoard.description,
      refJobCodeId: jobBoard.refJobCodeId,
      refGeneration: jobBoard.refGeneration,
      refCode: jobBoard.refCode,
      interviewDates: interviewDatesStrings,
      customInterviewDateAllowed: jobBoard.customInterviewDateAllowed,
      interviewBaseLink: jobBoard.interviewBaseLink || '',
      interviewBaseDuration: jobBoard.interviewBaseDuration !== undefined ? String(jobBoard.interviewBaseDuration) : '',
      interviewBaseNote: jobBoard.interviewBaseNote || '',
      status: jobBoard.status
    });
  };
  
  // 공고 마감 핸들러
  const handleCloseJobBoard = async (jobBoard: JobBoardWithApplications) => {
    if (window.confirm('이 공고를 마감하시겠습니까?')) {
      try {
        setIsSubmitting(true);
        await updateJobBoard(jobBoard.jobBoardId, { status: 'closed' });
        
        // 상태 업데이트
        setJobBoards(prevBoards => 
          prevBoards.map(board => 
            board.jobBoardId === jobBoard.jobBoardId 
              ? { ...board, status: 'closed' } 
              : board
          )
        );
        
        toast.success('공고가 마감되었습니다.');
        
        // URL 파라미터 제거
        router.replace('/admin/job-board-manage');
      } catch (error) {
        console.error('공고 마감 오류:', error);
        toast.error('공고 마감 중 오류가 발생했습니다.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };
  
  // 공고 활성화 핸들러
  const handleActivateJobBoard = async (jobBoard: JobBoardWithApplications) => {
    if (window.confirm('이 공고를 다시 활성화하시겠습니까?')) {
      try {
        setIsSubmitting(true);
        await updateJobBoard(jobBoard.jobBoardId, { status: 'active' });
        
        // 상태 업데이트
        setJobBoards(prevBoards => 
          prevBoards.map(board => 
            board.jobBoardId === jobBoard.jobBoardId 
              ? { ...board, status: 'active' } 
              : board
          )
        );
        
        toast.success('공고가 활성화되었습니다.');
        
        // URL 파라미터 제거
        router.replace('/admin/job-board-manage');
      } catch (error) {
        console.error('공고 활성화 오류:', error);
        toast.error('공고 활성화 중 오류가 발생했습니다.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };
  
  // 면접 날짜 추가
  const addInterviewDate = () => {
    setFormData(prev => ({
      ...prev,
      interviewDates: [...prev.interviewDates, '']
    }));
  };
  
  // 면접 날짜 제거
  const removeInterviewDate = (index: number) => {
    if (formData.interviewDates.length > 1) {
      setFormData(prev => ({
        ...prev,
        interviewDates: prev.interviewDates.filter((_, i) => i !== index)
      }));
    }
  };
  
  // 폼 필드 업데이트
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };
  
  // 면접 날짜 업데이트
  const handleInterviewDateChange = (index: number, value: string) => {
    const newDates = [...formData.interviewDates];
    newDates[index] = value;
    setFormData(prev => ({ ...prev, interviewDates: newDates }));
  };
  
  // 폼 제출 핸들러
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 필수 필드 확인
    if (!formData.title.trim() || !formData.description.trim() || !formData.refJobCodeId) {
      toast.error('필수 항목을 모두 입력해주세요.');
      return;
    }
    
    // 모든 면접 날짜가 입력되었는지 확인
    if (formData.interviewDates.some(date => !date)) {
      toast.error('모든 면접 날짜를 입력해주세요.');
      return;
    }
    
    try {
      setIsSubmitting(true);
      
      // 면접 날짜를 Timestamp로 변환
      const interviewDatesTimestamps = formData.interviewDates.map(dateStr => 
        Timestamp.fromDate(new Date(dateStr))
      );
      
      // 교육 날짜 가져오기
      const selectedJobCode = jobCodes.find(code => code.id === formData.refJobCodeId);
      const eduDates = selectedJobCode?.eduDates || [];
      
      // interviewBaseDuration을 숫자로 변환
      const interviewBaseDuration = formData.interviewBaseDuration ? 
        Number(formData.interviewBaseDuration) : undefined;
      
      if (isCreating) {
        // 새 공고 생성
        await createJobBoard({
          title: formData.title,
          description: formData.description,
          refJobCodeId: formData.refJobCodeId,
          refGeneration: formData.refGeneration,
          refCode: formData.refCode,
          status: 'active',
          interviewDates: interviewDatesTimestamps,
          customInterviewDateAllowed: formData.customInterviewDateAllowed,
          refEduDates: eduDates,
          interviewBaseLink: formData.interviewBaseLink || undefined,
          interviewBaseDuration,
          interviewBaseNote: formData.interviewBaseNote || undefined
        }, 'admin');
        
        toast.success('공고가 성공적으로 생성되었습니다.');
      } else if (selectedJobBoard) {
        // 기존 공고 수정
        await updateJobBoard(selectedJobBoard.jobBoardId, {
          title: formData.title,
          description: formData.description,
          refJobCodeId: formData.refJobCodeId,
          refGeneration: formData.refGeneration,
          refCode: formData.refCode,
          interviewDates: interviewDatesTimestamps,
          customInterviewDateAllowed: formData.customInterviewDateAllowed,
          refEduDates: eduDates,
          interviewBaseLink: formData.interviewBaseLink || undefined,
          interviewBaseDuration,
          interviewBaseNote: formData.interviewBaseNote || undefined
        });
        
        toast.success('공고가 성공적으로 수정되었습니다.');
      }
      
      // 폼 리셋 및 페이지 새로고침
      setSelectedJobBoard(null);
      setFormData({
        title: '',
        description: '',
        refJobCodeId: '',
        refGeneration: '',
        refCode: '',
        interviewDates: [''],
        customInterviewDateAllowed: false,
        interviewBaseLink: '',
        interviewBaseDuration: '',
        interviewBaseNote: '',
        status: 'active'
      });
      
      // URL 파라미터 제거하고 페이지 새로고침
      router.replace('/admin/job-board-manage');
      
      // 페이지 데이터 새로고침
      window.location.reload();
    } catch (error) {
      console.error('공고 저장 오류:', error);
      toast.error('공고 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // 취소 핸들러
  const handleCancel = () => {
    setSelectedJobBoard(null);
    setIsCreating(false);
    router.replace('/admin/job-board-manage');
  };
  
  // 지원자 확인 페이지로 이동
  const viewApplicants = (jobBoardId: string) => {
    router.push(`/admin/job-board-manage/applicants/${jobBoardId}`);
  };
  
  return (
    <Layout requireAuth requireAdmin>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* 상단 헤더 */}
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
            <h1 className="text-2xl font-bold">채용 공고 관리</h1>
          </div>
          <Button 
            variant="primary" 
            onClick={() => {
              setIsCreating(true);
              setSelectedJobBoard(null);
              setFormData({
                title: '',
                description: '',
                refJobCodeId: '',
                refGeneration: '',
                refCode: '',
                interviewDates: [''],
                customInterviewDateAllowed: false,
                interviewBaseLink: '',
                interviewBaseDuration: '',
                interviewBaseNote: '',
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
                    value={formData.refJobCodeId}
                    onChange={(e) => handleChange(e)}
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

                {/* 공고 상태 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    공고 상태
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleChange(e)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="active">모집중</option>
                    <option value="closed">마감</option>
                  </select>
                </div>
              </div>

              {/* 공고 제목 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  공고 제목
                </label>
                <input
                  type="text"
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

              {/* 커스텀 면접일 허용 */}
              <div className="mb-6">
                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    name="customInterviewDateAllowed"
                    checked={formData.customInterviewDateAllowed}
                    onChange={(e) => handleChange(e)}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                  />
                  <span className="ml-2 text-gray-700">지원자 커스텀 면접 날짜 허용</span>
                </label>
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
                    name="interviewBaseNote"
                    value={formData.interviewBaseNote}
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
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">공고</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">기간</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">지원자</th>
                    <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">관리</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {jobBoards.map((board) => (
                    <tr key={board.jobBoardId} className="hover:bg-gray-50">
                      <td className="px-4 sm:px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-gray-900">{board.title}</span>
                          <span className="text-sm text-gray-500">{board.refGeneration} ({board.refCode})</span>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-500 hidden sm:table-cell">
                        {formatDate(board.createdAt)}
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
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-500">
                        {board.applicationsCount}명
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm font-medium">
                        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewApplicants(board.id)}
                          >
                            지원자
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
} 