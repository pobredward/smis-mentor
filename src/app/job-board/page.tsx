'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
// import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import Layout from '@/components/common/Layout';
// import Button from '@/components/common/Button';
import { getActiveJobBoards, getJobCodeById } from '@/lib/firebaseService';
import { JobBoard, JobCodeWithId } from '@/types';

type JobBoardWithId = JobBoard & { id: string };

export default function JobBoardList() {
  const [jobBoards, setJobBoards] = useState<JobBoardWithId[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<'all' | 'korea' | 'overseas'>('all');
  const [jobCodesMap, setJobCodesMap] = useState<{[key: string]: JobCodeWithId}>({});
  // const { userData } = useAuth();
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
        
        // JobCode 정보도 함께 가져오기
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
    return format(date, 'yyyy.MM.dd(EEE)', { locale: ko });
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-4 sm:mb-8">
          <div className="mb-4">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">업무 공고</h1>
            <p className="mt-1 text-sm text-gray-600">현재 모집 중인 업무 공고를 확인하고 지원해보세요.</p>
          </div>
          
          <div className="mt-4 flex gap-3">
            <div 
              onClick={() => setSelectedLocation('all')}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-all duration-300 ${
                selectedLocation === 'all'
                  ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-500'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="text-sm font-medium">전체</span>
            </div>
            
            <div 
              onClick={() => setSelectedLocation('korea')}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-all duration-300 ${
                selectedLocation === 'korea'
                  ? 'bg-green-100 text-green-800 ring-1 ring-green-500'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="text-sm font-medium">국내 캠프</span>
            </div>
            
            <div 
              onClick={() => setSelectedLocation('overseas')}
              className={`px-4 py-2 rounded-lg cursor-pointer transition-all duration-300 ${
                selectedLocation === 'overseas'
                  ? 'bg-purple-100 text-purple-800 ring-1 ring-purple-500'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span className="text-sm font-medium">해외 캠프</span>
            </div>
          </div>
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
            {jobBoards
              .filter(board => {
                if (selectedLocation === 'all') return true;
                if (selectedLocation === 'korea') return board.korea;
                return !board.korea;
              })
              .map((board) => (
                <div 
                  key={board.id}
                  className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer flex flex-col transform hover:scale-[1.02]"
                  onClick={() => handleSelectBoard(board.id)}
                >
                  <div className="p-5 sm:p-6 flex-grow">
                    <div className="flex items-center gap-3 mb-4">
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
                    <span className="text-sm font-medium text-gray-600">자세히 보기</span>
                    <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </Layout>
  );
} 