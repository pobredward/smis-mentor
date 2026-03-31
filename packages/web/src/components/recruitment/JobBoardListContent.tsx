'use client';
import { logger } from '@smis-mentor/shared';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import { getAllJobBoards, getJobCodeById, clearJobBoardsCache } from '@/lib/firebaseService';
import { JobBoard, JobCodeWithId } from '@/types';

type JobBoardWithId = JobBoard & { id: string };

export default function JobBoardListContent() {
  const [jobBoards, setJobBoards] = useState<JobBoardWithId[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [jobCodesMap, setJobCodesMap] = useState<{[key: string]: JobCodeWithId}>({});
  const router = useRouter();

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
      } catch (error) {
        logger.error('공고 정보 로드 오류:', error);
        toast.error('공고 정보를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };
    loadJobBoards();
  }, []);

  const handleSelectBoard = (boardId: string) => {
    router.push(`/job-board/${boardId}`);
  };

  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp || !timestamp.toDate) {
      return '';
    }
    const date = timestamp.toDate();
    return format(date, 'yyyy.MM.dd(EEE)', { locale: ko });
  };

  const activeJobBoards = jobBoards.filter(board => board.status === 'active');

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
        </div>
      ) : activeJobBoards.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-lg shadow">
          <p className="text-gray-500">현재 모집 중인 공고가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {activeJobBoards.map((board) => {
            const jobCode = jobCodesMap[board.refJobCodeId];
            
            return (
              <div 
                key={board.id}
                className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer flex flex-col transform hover:scale-[1.02]"
                onClick={() => handleSelectBoard(board.id)}
              >
                <div className="p-5 sm:p-6 flex-grow">
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
                    <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full transition-colors bg-green-100 text-green-800 group-hover:bg-green-200">
                      모집중
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-bold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors line-clamp-2">
                    {board.title}
                  </h3>
                  
                  <div className="space-y-2 text-sm text-gray-600">
                    <div className="flex items-center">
                      <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="truncate">
                        {jobCode ? 
                          `${formatDate(jobCode.startDate)} ~ ${formatDate(jobCode.endDate)}` : 
                          `${formatDate(board.educationStartDate)} ~ ${formatDate(board.educationEndDate)}`
                        }
                      </span>
                    </div>
                    <div className="flex items-center">
                      <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="truncate">
                        {jobCode ? jobCode.location : (board as any).location}
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-gray-50 px-5 sm:px-6 py-4 flex justify-between items-center border-t group-hover:bg-gray-100 transition-colors">
                  <span className="text-sm font-medium text-gray-600">자세히 보기</span>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
