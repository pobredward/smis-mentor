"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { getApplicationsByUserId, getJobBoardById } from '@/lib/firebaseService';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import { ApplicationHistory, JobBoard } from '@/types';

type ApplicationWithJobDetails = ApplicationHistory & {
  jobBoard?: (JobBoard & { id: string }) | undefined;
};

export default function ApplicationSection() {
  const { currentUser, userData } = useAuth();
  const [applications, setApplications] = useState<ApplicationWithJobDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadApplications = async () => {
      try {
        setIsLoading(true);
        
        if (!userData) {
          return;
        }
        
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
        setIsLoading(false);
      }
    };
    
    loadApplications();
  }, [userData]);

  // 날짜 포맷팅 함수
  const formatDate = (timestamp: Timestamp | undefined) => {
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
        case 'complete':
          color = 'bg-purple-100 text-purple-800';
          label = '면접완료';
          break;
        case 'passed':
          color = 'bg-green-100 text-green-800';
          label = '면접합격';
          break;
        case 'failed':
          color = 'bg-red-100 text-red-800';
          label = '면접불합격';
          break;
        case 'absent':
          color = 'bg-red-100 text-red-800';
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
          label = '합격';
          break;
        case 'finalRejected':
          color = 'bg-red-100 text-red-800';
          label = '최종불합격';
          break;
        case 'absent':
          color = 'bg-gray-100 text-gray-800';
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
        ) : isLoading ? (
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
                  <div className="mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {app.jobBoard?.title || '삭제된 공고'}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {app.jobBoard?.generation}
                    </p>
                  </div>
                  
                  {/* 날짜 정보 */}
                  {/* <div className="mb-2">
                    <div>
                      <p className="text-sm text-gray-500 font-medium">지원일: {formatDate(app.applicationDate)}</p>
                    </div>
                  </div> */}
                  
                  {/* 면접 링크 버튼 (서류 합격이고 interviewBaseLink가 있을 때만 표시) */}
                  {app.applicationStatus === 'accepted' && app.interviewStatus === 'pending' && app.jobBoard && (
                    <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                      <h4 className="text-sm font-medium text-blue-900 mb-3">면접 정보</h4>
                      
                      {/* 면접 일시 */}
                      {(app.interviewDate) && (
                        <div className="mb-2">
                          <p className="text-sm text-blue-800">
                            <span className="font-medium">면접 일시:</span>{' '}
                            {formatDate(app.interviewDate)}
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
                          <div className="text-sm text-blue-700 bg-blue-100 p-3 rounded-md whitespace-pre-line">
                            {app.jobBoard.interviewBaseNotes}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* 상태 표시 */}
                  <div className="border-t border-gray-200 pt-4">
                    {/* <p className="text-xs text-gray-500 font-medium mb-2">진행 상태</p> */}
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
                  
                  {/* 상세 보기 링크 (프로필 페이지로 이동) */}
                  <Link 
                    href="/profile/job-apply" 
                    className="text-blue-600 hover:text-blue-800 text-sm flex items-center mt-4"
                  >
                    상세보기
                    <svg className="ml-1 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 