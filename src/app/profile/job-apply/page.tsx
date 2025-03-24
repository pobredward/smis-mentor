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
import { getApplicationsByUserId, getJobBoardById } from '@/lib/firebaseService';
import { ApplicationHistory, JobBoard } from '@/types';

type ApplicationWithJobDetails = ApplicationHistory & {
  jobBoard?: (JobBoard & { id: string }) | undefined;
};

export default function JobApplyStatus() {
  const [applications, setApplications] = useState<ApplicationWithJobDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { userData } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const loadApplications = async () => {
      try {
        setIsLoading(true);
        
        if (!userData) {
          router.push('/login');
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
        toast.error('지원 내역을 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadApplications();
  }, [userData, router]);
  
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
        case 'passed':
          color = 'bg-green-100 text-green-800';
          label = '면접합격';
          break;
        case 'failed':
          color = 'bg-red-100 text-red-800';
          label = '면접불합격';
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
    <Layout requireAuth>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">나의 지원 현황</h1>
          <p className="mt-1 text-sm text-gray-600">내가 지원한 공고와 현재 상태를 확인할 수 있습니다.</p>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-lg shadow">
            <p className="text-gray-500">지원 내역이 없습니다.</p>
            <Button
              variant="primary"
              className="mt-4"
              onClick={() => router.push('/job-board')}
            >
              공고 보러가기
            </Button>
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
                      {app.jobBoard?.refGeneration} ({app.jobBoard?.refCode})
                    </p>
                  </div>
                  
                  {/* 날짜 정보 */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-500 font-medium">지원일</p>
                      <p className="text-sm text-gray-700">{formatDate(app.applicationDate)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 font-medium">면접 일정</p>
                      <p className="text-sm text-gray-700">{app.interviewDate ? formatDate(app.interviewDate) : '미정'}</p>
                    </div>
                  </div>
                  
                  {/* 면접 링크 버튼 (서류 합격이고 interviewLink가 있을 때만 표시) */}
                  {app.applicationStatus === 'accepted' && app.interviewStatus === 'pending' && app.interviewLink && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                      <p className="text-sm font-medium text-blue-800 mb-2">화상 면접 정보</p>
                      {app.interviewNote && (
                        <p className="text-xs text-gray-700 mb-2 whitespace-pre-line">{app.interviewNote}</p>
                      )}
                      {app.interviewDuration && (
                        <p className="text-xs text-gray-700 mb-2">예상 소요시간: {app.interviewDuration}분</p>
                      )}
                      <a 
                        href={app.interviewLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="w-full mt-2 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                          <path d="M14 6a2 2 0 012-2h2a2 2 0 012 2v8a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" />
                        </svg>
                        화상 면접 참여하기
                      </a>
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
    </Layout>
  );
} 