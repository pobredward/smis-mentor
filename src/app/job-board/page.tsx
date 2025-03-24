'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { getActiveJobBoards } from '@/lib/firebaseService';
import { JobBoard } from '@/types';

type JobBoardWithId = JobBoard & { id: string };

export default function JobBoardList() {
  const [jobBoards, setJobBoards] = useState<JobBoardWithId[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { userData } = useAuth();
  const router = useRouter();

  // 공고 목록 불러오기
  useEffect(() => {
    const loadJobBoards = async () => {
      try {
        setIsLoading(true);
        const boards = await getActiveJobBoards();
        
        // 최신순 정렬
        const sortedBoards = boards.sort((a, b) => 
          b.createdAt.seconds - a.createdAt.seconds
        );
        
        setJobBoards(sortedBoards);
      } catch (error) {
        console.error('공고 정보 로드 오류:', error);
        toast.error('공고 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    loadJobBoards();
  }, []);

  // 공고 선택 핸들러
  const handleSelectBoard = (boardId: string) => {
    router.push(`/job-board/${boardId}`);
  };

  // 날짜 포맷팅 함수
  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return format(date, 'yyyy년 MM월 dd일 (EEE)', { locale: ko });
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-4 sm:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center">
          <div className="mb-4 sm:mb-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">업무 공고</h1>
            <p className="mt-1 text-sm text-gray-600">현재 모집 중인 업무 공고를 확인하고 지원해보세요.</p>
          </div>
          {userData?.role === 'admin' && (
            <Button
              variant="primary"
              onClick={() => router.push('/admin/job-board-write')}
              className="w-full sm:w-auto"
            >
              공고 생성 & 수정
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          </div>
        ) : jobBoards.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-lg shadow">
            <p className="text-gray-500">현재 모집 중인 공고가 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {jobBoards.map((board) => (
              <div 
                key={board.jobBoardId}
                className="bg-white rounded-lg shadow overflow-hidden cursor-pointer hover:shadow-lg transition-shadow duration-200 flex flex-col"
                onClick={() => handleSelectBoard(board.jobBoardId)}
              >
                <div className="p-4 sm:p-6 flex-grow">
                  <div className="mb-2">
                    <span className="inline-block bg-blue-100 text-blue-800 px-2 py-1 text-xs rounded-full">
                      {board.refGeneration} ({board.refCode})
                    </span>
                  </div>
                  <h3 className="font-medium text-lg sm:text-xl text-gray-900 mb-2">{board.title}</h3>
                  <p className="text-gray-500 text-sm mb-4 line-clamp-3">{board.description}</p>
                  <div className="flex flex-col sm:flex-row justify-between text-sm mt-auto">
                    <div className="text-gray-500 mb-1 sm:mb-0">
                      면접 일정: {board.interviewDates.length}개
                    </div>
                    <div className="text-gray-500">
                      등록일: {formatDate(board.createdAt).split(' ').slice(0, 3).join(' ')}
                    </div>
                  </div>
                </div>
                <div className="bg-gray-50 px-4 sm:px-6 py-3 text-right">
                  <span className="text-blue-600 font-medium">상세 보기 &rarr;</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
} 