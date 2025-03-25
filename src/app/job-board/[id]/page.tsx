'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { getJobBoardById, createApplication, updateJobBoard, deleteJobBoard, getJobCodeById } from '@/lib/firebaseService';
import { JobBoard, JobCode } from '@/types';
import RichTextEditor from '@/components/common/RichTextEditor';

type JobBoardWithId = JobBoard & { id: string };

export default function JobBoardDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [jobBoard, setJobBoard] = useState<JobBoardWithId | null>(null);
  const [jobCode, setJobCode] = useState<JobCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [customDate, setCustomDate] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const { userData } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isEditing, setIsEditing] = useState(false);
  const [editedDescription, setEditedDescription] = useState('');

  useEffect(() => {
    const loadJobBoard = async () => {
      try {
        setIsLoading(true);
        const board = await getJobBoardById(id);
        
        if (!board) {
          toast.error('존재하지 않는 공고입니다.');
          router.push('/job-board');
          return;
        }
        
        if (board.status !== 'active') {
          toast.error('마감된 공고입니다.');
          router.push('/job-board');
          return;
        }
        
        setJobBoard(board);
        setEditedDescription(board.description);

        // 업무 코드 정보 로드
        const code = await getJobCodeById(board.refJobCodeId);
        if (code) {
          setJobCode(code);
        }

        // URL에 edit=true가 있으면 수정 모드로 전환
        if (searchParams.get('edit') === 'true' && userData?.role === 'admin') {
          setIsEditing(true);
        }
      } catch (error) {
        console.error('공고 정보 로드 오류:', error);
        toast.error('공고 정보를 불러오는 중 오류가 발생했습니다.');
        router.push('/job-board');
      } finally {
        setIsLoading(false);
      }
    };

    loadJobBoard();
  }, [id, router, searchParams, userData?.role]);

  // 날짜 선택 핸들러
  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    if (date === 'custom') {
      setCustomDate('');
    }
  };

  // 지원 핸들러
  const handleApply = async () => {
    if (!userData) {
      toast.error('로그인 후 지원할 수 있습니다.');
      router.push('/login');
      return;
    }

    if (!jobBoard) {
      toast.error('공고 정보가 없습니다.');
      return;
    }

    if (!selectedDate) {
      toast.error('면접 희망 날짜를 선택해주세요.');
      return;
    }

    // 자기소개 및 지원 동기 작성 여부 확인 메시지
    if (!confirm('자기소개 및 지원 동기는 프로필에서 완전히 수정한 후에 지원해야 합니다. 한 번 지원하면 되돌릴 수 없습니다. 계속하시겠습니까?')) {
      return;
    }

    // 선택된 날짜 처리
    let interviewDate: Timestamp | undefined;
    if (selectedDate === 'custom') {
      if (!customDate) {
        toast.error('커스텀 면접 날짜를 입력해주세요.');
        return;
      }
      interviewDate = Timestamp.fromDate(new Date(customDate));
    } else {
      const selectedDateIndex = parseInt(selectedDate, 10);
      interviewDate = jobBoard.interviewDates[selectedDateIndex];
    }

    try {
      setIsApplying(true);
      
      // 지원 정보 생성
      await createApplication({
        applicationStatus: 'pending',
        refJobBoardId: jobBoard.jobBoardId,
        refUserId: userData.userId,
        interviewDate,
      });
      
      toast.success('신청이 완료되었습니다. 검토 후 개별 연락 드리겠습니다.');
      setHasApplied(true);
      router.push('/profile/job-apply'); // 지원 내역 페이지로 이동
    } catch (error) {
      console.error('지원 오류:', error);
      toast.error('지원 중 오류가 발생했습니다.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleSave = async () => {
    if (!jobBoard) return;

    try {
      setIsLoading(true);
      await updateJobBoard(jobBoard.jobBoardId, {
        description: editedDescription,
        interviewDates: jobBoard.interviewDates // 기존 면접 일정 유지
      });
      
      setJobBoard({
        ...jobBoard,
        description: editedDescription
      });
      setIsEditing(false);
      toast.success('공고가 성공적으로 수정되었습니다.');
      
      // URL에서 edit 파라미터 제거
      router.replace(`/job-board/${id}`);
    } catch (error) {
      console.error('공고 수정 오류:', error);
      toast.error('공고 수정 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!jobBoard || !confirm('정말로 이 공고를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

    try {
      setIsLoading(true);
      await deleteJobBoard(jobBoard.jobBoardId);
      toast.success('공고가 성공적으로 삭제되었습니다.');
      router.push('/admin/job-board-write');
    } catch (error) {
      console.error('공고 삭제 오류:', error);
      toast.error('공고 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedDescription(jobBoard?.description || '');
    router.replace(`/job-board/${id}`);
  };

  // 날짜 포맷팅 함수 (시간 포함)
  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return format(date, 'yyyy년 MM월 dd일 (EEE) HH:mm', { locale: ko });
  };

  // 날짜만 포맷팅하는 함수
  const formatDateOnly = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return format(date, 'yyyy년 MM월 dd일 (EEE)', { locale: ko });
  };

  // 과거 날짜인지 체크하는 함수
  const isPastDate = (timestamp: Timestamp): boolean => {
    const now = new Date();
    const date = timestamp.toDate();
    // 현재 시간과 비교할 때 분 단위까지 고려
    now.setSeconds(0, 0);
    date.setSeconds(0, 0);
    return date < now;
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          </div>
        ) : !jobBoard ? (
          <div className="text-center py-20">
            <p className="text-gray-500">공고를 찾을 수 없습니다.</p>
            <Button 
              variant="secondary" 
              className="mt-4"
              onClick={() => router.push('/job-board')}
            >
              공고 목록으로 돌아가기
            </Button>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="p-4 sm:p-6">
              {/* 공고 헤더 */}
              <div className="mb-6 pb-6 border-b border-gray-200">
                <div className="mb-2">
                  <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 text-xs rounded-full">
                    {jobBoard.refGeneration}
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">{jobBoard.title}</h1>
                <div className="text-sm text-gray-500">
                  등록일: {formatDate(jobBoard.createdAt)}
                </div>
              </div>
              
              {/* 업무 정보 */}
              {jobCode && !isEditing && (
                <div className="mb-8 p-4 bg-gray-50 rounded-lg">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">업무 정보</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">캠프 이름</p>
                      <p className="font-medium">{jobCode.name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">업무 코드</p>
                      <p className="font-medium">{jobCode.code}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">캠프 기간</p>
                      <p className="font-medium">
                        {formatDateOnly(jobCode.startDate)} ~ {formatDateOnly(jobCode.endDate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">캠프 위치</p>
                      <p className="font-medium">{jobCode.location}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-sm text-gray-600 mb-1">교육 일정</p>
                      <div className="flex flex-wrap gap-2">
                        {jobCode.eduDates.map((date, index) => (
                          <span 
                            key={index}
                            className="inline-block px-2 py-1 bg-blue-50 text-blue-700 text-sm rounded"
                          >
                            {formatDateOnly(date)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* 공고 본문 */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">공고 내용</h2>
                {isEditing ? (
                  <div className="mb-4">
                    <RichTextEditor
                      content={editedDescription}
                      onChange={setEditedDescription}
                      placeholder="공고 내용을 입력하세요"
                    />
                    <div className="flex justify-end gap-2 mt-4">
                      <Button
                        variant="secondary"
                        onClick={handleCancel}
                      >
                        취소
                      </Button>
                      <Button
                        variant="primary"
                        onClick={handleSave}
                        isLoading={isLoading}
                      >
                        저장
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="prose prose-slate max-w-none [&>h1]:text-4xl [&>h1]:font-bold [&>h1]:mb-4 [&>h2]:text-3xl [&>h2]:font-bold [&>h2]:mb-3 [&>h3]:text-2xl [&>h3]:font-bold [&>h3]:mb-2 [&>p]:whitespace-pre-wrap [&>p:empty]:h-[1em] [&>p:empty]:block [&>p]:min-h-[1.5em]"
                    dangerouslySetInnerHTML={{ __html: jobBoard.description }}
                  >
                  </div>
                )}
              </div>
              
              {/* 면접 날짜 선택 */}
              {!isEditing && (
                <div className="mb-8">
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">면접 일정</h2>
                  
                  {jobBoard.interviewDates.length === 0 ? (
                    <div className="text-gray-500">면접 일정이 없습니다.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {jobBoard.interviewDates.map((date, index) => (
                        <div 
                          key={index}
                          className={`border rounded-md p-3 ${
                            selectedDate === index.toString()
                              ? 'border-blue-500 bg-blue-50' 
                              : 'border-gray-300 hover:border-gray-400'
                          } 
                          ${isPastDate(date) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          onClick={() => !isPastDate(date) && handleDateSelect(index.toString())}
                        >
                          <div className="flex items-center">
                            <div className={`w-4 h-4 rounded-full mr-2 ${
                              selectedDate === index.toString() ? 'bg-blue-500' : 'bg-gray-300'
                            }`}></div>
                            <div className="flex-1">
                              <div className="text-sm font-medium">{formatDate(date)}</div>
                              {isPastDate(date) && (
                                <span className="text-xs text-red-600">지난 일정</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {/* 지원 버튼 */}
              {!isEditing && (
                <>
                  {userData && jobBoard.status === 'active' ? (
                    <div className="mt-6 flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4">
                      <Button 
                        variant="primary" 
                        onClick={handleApply}
                        disabled={!selectedDate || isApplying || hasApplied || (selectedDate !== 'custom' && selectedDate !== '' && isPastDate(jobBoard.interviewDates[parseInt(selectedDate, 10)]))}
                        className="w-full sm:w-auto"
                      >
                        {isApplying ? '처리 중...' : hasApplied ? '이미 지원됨' : '지원하기'}
                      </Button>
                      <Button 
                        variant="secondary"
                        onClick={() => router.push('/job-board')}
                        className="w-full sm:w-auto"
                      >
                        목록으로 돌아가기
                      </Button>
                    </div>
                  ) : !userData ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mb-6">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3 flex flex-col sm:flex-row sm:items-center">
                          {/* <h3 className="text-sm font-medium text-yellow-800 mr-2">로그인 후 지원하기</h3> */}
                          <Button 
                            variant="secondary"
                            size="sm"
                            onClick={() => router.push('/sign-in')}
                            className="mt-2 sm:mt-0"
                          >
                            로그인 후 지원
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : jobBoard.status !== 'active' ? (
                    <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-red-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-red-800">지원 마감된 공고입니다</h3>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
              
              {/* 관리자 버튼 */}
              {userData?.role === 'admin' && !isEditing && (
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-500 mb-3">관리자 기능</h3>
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                    <Button
                      variant="primary"
                      onClick={() => setIsEditing(true)}
                    >
                      공고 수정
                    </Button>
                    <Button
                      variant="danger"
                      onClick={handleDelete}
                    >
                      공고 삭제
                    </Button>
                    {jobBoard.status === 'active' ? (
                      <Button
                        variant="secondary"
                        onClick={() => router.push(`/admin/job-board-manage?close=${id}`)}
                      >
                        공고 마감
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => router.push(`/admin/job-board-manage?activate=${id}`)}
                      >
                        공고 활성화
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
} 