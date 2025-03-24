'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { getJobBoardById, createApplication } from '@/lib/firebaseService';
import { JobBoard } from '@/types';

type JobBoardWithId = JobBoard & { id: string };

export default function JobBoardDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [jobBoard, setJobBoard] = useState<JobBoardWithId | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [customDate, setCustomDate] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const { userData } = useAuth();
  const router = useRouter();

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
      } catch (error) {
        console.error('공고 정보 로드 오류:', error);
        toast.error('공고 정보를 불러오는 중 오류가 발생했습니다.');
        router.push('/job-board');
      } finally {
        setIsLoading(false);
      }
    };

    loadJobBoard();
  }, [id, router]);

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

  // 날짜 포맷팅 함수
  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return format(date, 'yyyy년 MM월 dd일 (EEE)', { locale: ko });
  };

  // 과거 날짜인지 체크하는 함수
  const isPastDate = (timestamp: Timestamp): boolean => {
    const now = new Date();
    const date = timestamp.toDate();
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
                    {jobBoard.refGeneration} ({jobBoard.refCode})
                  </span>
                </div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">{jobBoard.title}</h1>
                <div className="text-sm text-gray-500">
                  등록일: {formatDate(jobBoard.createdAt)}
                </div>
              </div>
              
              {/* 공고 본문 */}
              <div className="mb-8">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">공고 내용</h2>
                <div className="text-gray-700 whitespace-pre-line">
                  {jobBoard.description}
                </div>
              </div>
              
              {/* 면접 날짜 선택 */}
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
              
              {/* 지원 버튼 */}
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
              
              {/* 관리자 버튼 */}
              {userData?.role === 'admin' && (
                <div className="mt-8 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-500 mb-3">관리자 기능</h3>
                  <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                    <Button
                      variant="danger"
                      onClick={() => router.push(`/admin/job-board-manage?edit=${id}`)}
                      className="w-full sm:w-auto"
                    >
                      공고 수정
                    </Button>
                    {jobBoard.status === 'active' ? (
                      <Button
                        variant="secondary"
                        onClick={() => router.push(`/admin/job-board-manage?close=${id}`)}
                        className="w-full sm:w-auto"
                      >
                        공고 마감
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        onClick={() => router.push(`/admin/job-board-manage?activate=${id}`)}
                        className="w-full sm:w-auto"
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