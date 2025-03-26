"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Layout from '@/components/common/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveJobBoards, getJobCodeById, getRecentReviews } from '@/lib/firebaseService';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import { JobBoard, JobCodeWithId, Review } from '@/types';

type JobBoardWithId = JobBoard & { id: string };

export default function Home() {
  const { currentUser } = useAuth();
  const [jobBoards, setJobBoards] = useState<JobBoardWithId[]>([]);
  const [jobCodesMap, setJobCodesMap] = useState<{[key: string]: JobCodeWithId}>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        // 공고 데이터 가져오기
        const boards = await getActiveJobBoards();
        const sortedBoards = boards
          .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds)
          .slice(0, 3); // 최신 3개만 표시
        
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
        
        // 후기 데이터 가져오기
        const recentReviews = await getRecentReviews(3); // 최신 3개만 가져오기
        
        setJobCodesMap(jobCodesData);
        setJobBoards(sortedBoards);
        setReviews(recentReviews);
      } catch (error) {
        console.error('데이터 로드 오류:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // 날짜 포맷팅 함수
  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return format(date, 'yyyy.MM.dd(EEE)', { locale: ko });
  };

  return (
    <Layout>
      

      {/* 공고 목록 섹션 */}
      <div className="bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-3xl font-extrabold text-gray-900">
                진행중인 공고
              </h2>
              <p className="mt-2 text-lg text-gray-500">
                현재 모집중인 멘토 공고 확인하기
              </p>
            </div>
            <Link
              href="/job-board"
              className="inline-flex items-center text-blue-600 hover:text-blue-700"
            >
              모든 공고 보기
              <svg className="ml-1 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {jobBoards.map((board) => (
                <Link
                  key={board.id}
                  href={`/job-board/${board.id}`}
                  className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer flex flex-col transform hover:scale-[1.02]"
                >
                  <div className="p-6 flex-grow">
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
                    
                    <h3 className="text-xl font-semibold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors">
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
                  
                  <div className="bg-gray-50 px-6 py-4 flex justify-between items-center border-t group-hover:bg-gray-100 transition-colors">
                    <span className="text-sm font-medium text-gray-600">자세히 보기</span>
                    <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 지원 현황 섹션 */}
      <div className="bg-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-gray-900">
              지원 현황
            </h2>
            <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
              나의 지원 현황을 확인하고 관리할 수 있습니다
            </p>
          </div>
          
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-sm overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="p-8 flex flex-col justify-center">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  내 프로필 관리
                </h3>
                <p className="text-gray-600 mb-6">
                  프로필과 지원 정보를 한눈에 확인하고 관리할 수 있습니다. 개인 정보를 업데이트하고 지원 상태를 확인해보세요.
                </p>
                <div>
                  <Link
                    href="/profile"
                    className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  >
                    프로필 확인하기
                  </Link>
                </div>
              </div>
              <div className="p-8 hidden md:block">
                <div className="relative h-full">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg className="w-full h-auto text-blue-200" viewBox="0 0 200 200" fill="currentColor">
                      <path d="M100 0C44.8 0 0 44.8 0 100s44.8 100 100 100 100-44.8 100-100S155.2 0 100 0zm0 180c-44.1 0-80-35.9-80-80s35.9-80 80-80 80 35.9 80 80-35.9 80-80 80z" />
                      <path d="M100 40c-33.1 0-60 26.9-60 60s26.9 60 60 60 60-26.9 60-60-26.9-60-60-60zm0 100c-22.1 0-40-17.9-40-40s17.9-40 40-40 40 17.9 40 40-17.9 40-40 40z" />
                      <circle cx="100" cy="100" r="20" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-blue-800">내 지원서</div>
                        <div className="text-blue-600">실시간 관리</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 참여 후기 섹션 */}
      <div className="bg-gray-50 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-3xl font-extrabold text-gray-900">
                멘토 참여 후기
              </h2>
              <p className="mt-2 text-lg text-gray-500">
                실제 참여한 멘토들의 생생한 경험담을 확인하세요
              </p>
            </div>
            <Link
              href="/reviews"
              className="inline-flex items-center text-blue-600 hover:text-blue-700"
            >
              모든 후기 보기
              <svg className="ml-1 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-lg shadow">
              <p className="text-gray-500">등록된 참여 후기가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {reviews.map((review) => (
                <Link
                  key={review.id}
                  href="/reviews"
                  className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-300 p-6"
                >
                  <div className="mb-4">
                    <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full bg-blue-100 text-blue-800">
                      {review.generation}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">
                    {review.title}
                  </h3>
                  <p className="text-gray-600 mb-4 line-clamp-3">
                    {review.content?.replace(/<[^>]*>?/gm, '') || '내용 없음'}
                  </p>
                  <p className="text-sm text-gray-500">{formatDate(review.createdAt)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

    </Layout>
  );
}
