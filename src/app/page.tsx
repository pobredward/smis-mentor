"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Layout from '@/components/common/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveJobBoards, getJobCodeById, getBestReviews, getApplicationsByUserId, getJobBoardById } from '@/lib/firebaseService';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import { JobBoard, JobCodeWithId, Review, ApplicationHistory } from '@/types';

type JobBoardWithId = JobBoard & { id: string };
type ApplicationWithJobDetails = ApplicationHistory & {
  jobBoard?: (JobBoard & { id: string }) | undefined;
};

export default function Home() {
  const { currentUser, userData } = useAuth();
  const [jobBoards, setJobBoards] = useState<JobBoardWithId[]>([]);
  const [jobCodesMap, setJobCodesMap] = useState<{[key: string]: JobCodeWithId}>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [applications, setApplications] = useState<ApplicationWithJobDetails[]>([]);
  const [isLoadingApplications, setIsLoadingApplications] = useState(true);

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
        
        // Best 후기 데이터 가져오기
        const bestReviews = await getBestReviews(3); // Best 후기 3개만 가져오기
        
        setJobCodesMap(jobCodesData);
        setJobBoards(sortedBoards);
        setReviews(bestReviews);
      } catch (error) {
        console.error('데이터 로드 오류:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const loadApplications = async () => {
      if (!userData) {
        setIsLoadingApplications(false);
        return;
      }
      
      try {
        setIsLoadingApplications(true);
        
        // 사용자의 지원 내역 가져오기
        const userApplications = await getApplicationsByUserId(userData.userId);
        
        // 각 지원에 해당하는 공고 정보 가져오기
        const applicationsWithJobDetails = await Promise.all(
          userApplications.map(async (app) => {
            try {
              const jobBoard = await getJobBoardById(app.refJobBoardId);
              return {
                ...app,
                jobBoard
              } as ApplicationWithJobDetails;
            } catch (error) {
              console.error(`공고 정보 로드 오류 (${app.refJobBoardId}):`, error);
              return app as ApplicationWithJobDetails;
            }
          })
        );
        
        setApplications(applicationsWithJobDetails);
      } catch (error) {
        console.error('지원 내역 로드 오류:', error);
      } finally {
        setIsLoadingApplications(false);
      }
    };
    
    loadApplications();
  }, [userData]);

  // 날짜 포맷팅 함수
  const formatDate = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    return format(date, 'yyyy.MM.dd(EEE)', { locale: ko });
  };

  // 날짜 포맷팅 함수 (Timestamp를 yyyy년 MM월 dd일 (EEE) HH:mm 형식으로 변환)
  const formatDateTime = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate();
    return format(date, 'yyyy년 MM월 dd일 (EEE) HH:mm', { locale: ko });
  };
  
  // 지원 상태 뱃지 함수
  const getStatusBadge = (status: string | undefined, type: 'application' | 'interview' | 'final') => {
    let color = '';
    let label = '';
    
    if (type === 'application') {
      switch (status) {
        case 'pending':
          color = 'bg-yellow-100 text-yellow-800';
          label = '검토중';
          break;
        case 'accepted':
          color = 'bg-green-100 text-green-800';
          label = '서류합격';
          break;
        case 'rejected':
          color = 'bg-red-100 text-red-800';
          label = '서류불합격';
          break;
        default:
          color = 'bg-gray-100 text-gray-800';
          label = '미정';
      }
    } else if (type === 'interview') {
      switch (status) {
        case 'pending':
          color = 'bg-yellow-100 text-yellow-800';
          label = '면접예정';
          break;
        case 'passed':
          color = 'bg-green-100 text-green-800';
          label = '면접합격';
          break;
        case 'failed':
          color = 'bg-red-100 text-red-800';
          label = '면접불합격';
          break;
        case '불참':
          color = 'bg-gray-100 text-gray-800';
          label = '불참';
          break;
        default:
          color = 'bg-gray-100 text-gray-800';
          label = '미정';
      }
    } else if (type === 'final') {
      switch (status) {
        case 'finalAccepted':
          color = 'bg-green-100 text-green-800';
          label = '최종합격';
          break;
        case 'finalRejected':
          color = 'bg-red-100 text-red-800';
          label = '최종불합격';
          break;
        case '불참':
          color = 'bg-red-100 text-red-800';
          label = '불참';
          break;
        default:
          color = 'bg-gray-100 text-gray-800';
          label = '미정';
      }
    }
    
    return (
      <span className={`px-2 py-1 text-xs rounded-full ${color}`}>
        {label}
      </span>
    );
  };

  return (
    <Layout>
      

      {/* 공고 목록 섹션 */}
      <div className="bg-gray-50 py-4 md:py-8 mb-6 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6 md:mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">
              진행중인 공고
            </h2>
            <Link
              href="/job-board"
              className="inline-flex items-center text-blue-600 hover:text-blue-700"
            >
              보러가기
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {jobBoards.map((board) => (
                <Link
                  key={board.id}
                  href={`/job-board/${board.id}`}
                  className="group bg-white rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden cursor-pointer flex flex-col transform hover:scale-[1.02]"
                >
                  <div className="p-4 md:p-6 flex-grow">
                    <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-3 md:mb-4">
                      <span className="inline-flex items-center px-2 py-1 md:px-3 md:py-1.5 text-xs md:text-sm font-medium rounded-full bg-blue-100 text-blue-800 group-hover:bg-blue-200 transition-colors">
                        {board.generation}
                      </span>
                      <span className={`inline-flex items-center px-2 py-1 md:px-3 md:py-1.5 text-xs md:text-sm font-medium rounded-full transition-colors ${
                        board.korea
                          ? 'bg-green-100 text-green-800 group-hover:bg-green-200'
                          : 'bg-purple-100 text-purple-800 group-hover:bg-purple-200'
                      }`}>
                        {board.korea ? '국내' : '해외'}
                      </span>
                    </div>
                    
                    <h3 className="text-lg md:text-xl font-semibold text-gray-900 mb-3 group-hover:text-blue-600 transition-colors">
                      {board.title}
                    </h3>
                    
                    <div className="space-y-2 md:space-y-3">
                      <div className="flex items-center text-xs md:text-sm text-gray-600">
                        <svg className="w-4 h-4 md:w-5 md:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {jobCodesMap[board.refJobCodeId] ? 
                          `${formatDate(jobCodesMap[board.refJobCodeId].startDate)} ~ ${formatDate(jobCodesMap[board.refJobCodeId].endDate)}` : 
                          formatDate(board.educationStartDate) + ' ~ ' + formatDate(board.educationEndDate)
                        }
                      </div>
                      <div className="flex items-center text-xs md:text-sm text-gray-600">
                        <svg className="w-4 h-4 md:w-5 md:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  
                  <div className="bg-gray-50 px-4 md:px-6 py-3 md:py-4 flex justify-between items-center border-t group-hover:bg-gray-100 transition-colors">
                    <span className="text-xs md:text-sm font-medium text-gray-600">자세히 보기</span>
                    <svg className="w-4 h-4 md:w-5 md:h-5 text-gray-400 group-hover:text-blue-500 transform group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      <div className="bg-gray-50 py-12 md:py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6 sm:mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">
              내 지원 현황
            </h2>
            <p className="mt-1 text-sm text-gray-600">내가 지원한 공고와 현재 상태를 확인할 수 있습니다.</p>
          </div>
          
          {!currentUser ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center max-w-2xl mx-auto">
              <div className="mb-6">
                <svg className="mx-auto h-16 w-16 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">로그인이 필요합니다</h3>
              <p className="text-gray-600 mb-6">
                지원 현황을 확인하려면 로그인이 필요합니다.<br />
                로그인하시면 지원 진행 상황을 확인할 수 있습니다.
              </p>
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                로그인하기
              </Link>
            </div>
          ) : isLoadingApplications ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-lg shadow">
              <p className="text-gray-500">지원 내역이 없습니다.</p>
              <Link
                href="/job-board"
                className="inline-flex items-center justify-center px-5 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 mt-4"
              >
                공고 보러가기
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {applications.map((app) => (
                <div key={app.applicationHistoryId} className="bg-white rounded-lg shadow overflow-hidden">
                  <div className="px-4 py-5 sm:p-6">
                    {/* 공고 제목 및 정보 */}
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {app.jobBoard?.title || '삭제된 공고'}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {app.jobBoard?.generation} ({app.jobBoard?.jobCode})
                      </p>
                    </div>
                    
                    {/* 날짜 정보 */}
                    <div className="gap-4 mb-4">
                      <div>
                        <p className="text-sm text-gray-500 font-medium">지원일: {formatDateTime(app.applicationDate)}</p>
                      </div>
                    </div>
                    
                    {/* 면접 링크 버튼 (서류 합격이고 interviewStatus가 pending일 때만 표시) */}
                    {app.applicationStatus === 'accepted' && app.interviewStatus === 'pending' && app.jobBoard && (
                      <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                        <h4 className="text-sm font-medium text-blue-900 mb-3">면접 정보</h4>
                        
                        {/* 면접 일시 */}
                        {(app.interviewDate || app.interviewDateTime) && (
                          <div className="mb-2">
                            <p className="text-sm text-blue-800">
                              <span className="font-medium">면접 일시:</span>{' '}
                              {formatDateTime(app.interviewDate || app.interviewDateTime)}
                            </p>
                          </div>
                        )}

                                                {/* 면접 시간 */}
                                                {app.jobBoard.interviewBaseDuration && (
                          <div className="mb-2">
                            <p className="text-sm text-blue-800">
                              <span className="font-medium">예상 소요 시간:</span>{' '}
                              {app.jobBoard.interviewBaseDuration}분
                            </p>
                          </div>
                        )}
                        
                        {/* 면접 링크 */}
                        {app.jobBoard.interviewBaseLink && (
                          <div className="mb-2">
                            {/* <p className="text-sm text-blue-800 mb-1">
                              <span className="font-medium">면접 링크:</span>
                            </p> */}
                            <a
                              href={app.jobBoard.interviewBaseLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              면접 참여하기
                            </a>
                          </div>
                        )}

                        
                        {/* 면접 참고사항 */}
                        {app.jobBoard.interviewBaseNotes && (
                          <div className="mt-3">
                            {/* <p className="text-sm font-medium text-blue-800 mb-1">참고사항:</p> */}
                            <div className="text-sm text-blue-700 bg-blue-100 p-3 rounded-md whitespace-pre-line">
                              {app.jobBoard.interviewBaseNotes}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* 상태 표시 */}
                    <div className="border-t pt-4">
                      <p className="text-xs text-gray-500 font-medium mb-2">진행 상태</p>
                      <div className="grid grid-cols-3 gap-1 text-xs">
                        <div>
                          <span className="text-gray-500 block mb-1">서류</span>
                          {getStatusBadge(app.applicationStatus, 'application')}
                        </div>
                        <div>
                          <span className="text-gray-500 block mb-1">면접</span>
                          {app.interviewStatus 
                            ? getStatusBadge(app.interviewStatus, 'interview')
                            : <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">미정</span>}
                        </div>
                        <div>
                          <span className="text-gray-500 block mb-1">최종</span>
                          {app.finalStatus 
                            ? getStatusBadge(app.finalStatus, 'final')
                            : <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">미정</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 내 프로필 관리 섹션 */}
      <div className="bg-white py-12 md:py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">

          
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-sm overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 md:p-8 flex flex-col justify-center">
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">
                  내 프로필 관리
                </h3>
                <p className="text-gray-600 mb-6">
                  자기소개서 및 지원 동기를 작성해보세요.
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
          
            </div>
          </div>
        </div>
      </div>

      {/* 참여 후기 섹션 */}
      <div className="bg-gray-50 py-12 md:py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6 md:mb-8">
            <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">
              멘토 참여 후기
            </h2>
            <Link
              href="/reviews"
              className="inline-flex items-center text-blue-600 hover:text-blue-700"
            >
              보러가기
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
                  className="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-300 p-6 h-full flex flex-col"
                >
                  <div className="mb-4">
                    <span className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-full bg-blue-100 text-blue-800">
                      {review.generation}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-3">
                    {review.title}
                  </h3>
                  <p className="text-sm text-gray-600 mb-4 line-clamp-3 flex-grow">
                    {review.content?.replace(/<[^>]*>?/gm, '') || '내용 없음'}
                  </p>
                  {/* <p className="text-sm text-gray-500">{formatDate(review.createdAt)}</p> */}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

    </Layout>
  );
}
