'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { ApplicationHistory, User, JobBoard } from '@/types';
import { getScoreTextColor, getGroupLabel } from '@smis-mentor/shared';

type ApplicationWithUser = ApplicationHistory & {
  id: string;
  user?: User | null;
};

type SharedData = {
  jobBoard: {
    id: string;
    title: string;
    generation: string;
    jobCode: string;
  };
  applications: ApplicationWithUser[];
  expiresAt: string;
};

export default function SharedApplicantsPage() {
  const params = useParams();
  const token = params.token as string;
  
  const [data, setData] = useState<SharedData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`/api/share-applicants/${token}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || '데이터를 불러오는데 실패했습니다.');
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    if (token) {
      fetchData();
    }
  }, [token]);

  const getStatusText = (app: ApplicationWithUser) => {
    if (app.finalStatus === 'finalAccepted') return '최종 합격';
    if (app.finalStatus === 'finalRejected') return '최종 불합격';
    if (app.finalStatus === 'finalAbsent') return '최종 불참';
    
    if (app.interviewStatus === 'passed') return '면접 합격';
    if (app.interviewStatus === 'failed') return '면접 불합격';
    if (app.interviewStatus === 'absent') return '면접 불참';
    if (app.interviewStatus === 'complete') return '면접 완료';
    if (app.interviewStatus === 'pending') return '면접 대기';
    
    if (app.applicationStatus === 'accepted') return '서류 합격';
    if (app.applicationStatus === 'rejected') return '서류 불합격';
    
    return '서류 검토 중';
  };

  const getStatusColor = (app: ApplicationWithUser) => {
    if (app.finalStatus === 'finalAccepted') return 'text-green-600 bg-green-50';
    if (app.finalStatus === 'finalRejected') return 'text-red-600 bg-red-50';
    if (app.finalStatus === 'finalAbsent') return 'text-gray-600 bg-gray-50';
    
    if (app.interviewStatus === 'passed') return 'text-blue-600 bg-blue-50';
    if (app.interviewStatus === 'failed') return 'text-orange-600 bg-orange-50';
    if (app.interviewStatus === 'absent') return 'text-gray-600 bg-gray-50';
    if (app.interviewStatus === 'complete') return 'text-purple-600 bg-purple-50';
    if (app.interviewStatus === 'pending') return 'text-indigo-600 bg-indigo-50';
    
    if (app.applicationStatus === 'accepted') return 'text-teal-600 bg-teal-50';
    if (app.applicationStatus === 'rejected') return 'text-red-600 bg-red-50';
    
    return 'text-yellow-600 bg-yellow-50';
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600">지원자 정보를 불러오는 중...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">🔒</div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">접근할 수 없습니다</h1>
            <p className="text-gray-600 mb-6">{error}</p>
            <Button onClick={() => window.location.href = '/'}>
              홈으로 돌아가기
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return null;
  }

  const expiresAt = new Date(data.expiresAt);
  const timeRemaining = expiresAt.getTime() - new Date().getTime();
  const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 헤더 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {data.jobBoard.title}
              </h1>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <span className="px-3 py-1 bg-primary/10 text-primary rounded-full font-medium">
                  {data.jobBoard.generation}기
                </span>
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full">
                  {data.jobBoard.jobCode}
                </span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500 mb-1">링크 만료</p>
              <p className="text-sm font-medium text-gray-900">
                {format(expiresAt, 'yyyy년 M월 d일 HH:mm', { locale: ko })}
              </p>
              {timeRemaining > 0 && (
                <p className="text-xs text-orange-600 mt-1">
                  {hoursRemaining > 0 && `${hoursRemaining}시간 `}
                  {minutesRemaining}분 남음
                </p>
              )}
            </div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="text-blue-600 text-xl">ℹ️</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 mb-1">임시 공유 링크</p>
                <p className="text-sm text-blue-700">
                  이 페이지는 임시로 공유된 지원자 정보입니다. 
                  링크는 만료 시간 이후 자동으로 접근이 차단됩니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 지원자 목록 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              지원자 목록 ({data.applications.length}명)
            </h2>
          </div>
          
          <div className="divide-y divide-gray-200">
            {data.applications.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-gray-500">공유된 지원자가 없습니다.</p>
              </div>
            ) : (
              data.applications.map((app) => {
                const user = app.user;
                const evaluationSummary = user?.evaluationSummary;
                
                return (
                  <div key={app.id} className="px-6 py-5 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {user?.name || '알 수 없음'}
                          </h3>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(app)}`}>
                            {getStatusText(app)}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm">
                          <div className="flex items-center gap-2 text-gray-600">
                            <span className="font-medium">이메일:</span>
                            <span>{user?.email || '-'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <span className="font-medium">전화번호:</span>
                            <span>{user?.phoneNumber || '-'}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <span className="font-medium">지원일:</span>
                            <span>
                              {format(app.applicationDate.toDate(), 'yyyy.MM.dd HH:mm', { locale: ko })}
                            </span>
                          </div>
                        </div>

                        {user?.university && (
                          <div className="mt-2 text-sm text-gray-600">
                            <span className="font-medium">학교:</span> {user.university}
                            {user.major1 && ` | 전공: ${user.major1}`}
                            {user.grade && ` | ${user.grade}학년`}
                          </div>
                        )}

                        {/* 평가 점수 요약 */}
                        {evaluationSummary && (
                          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {evaluationSummary.documentReview && (
                              <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-xs text-gray-500 mb-1">서류 평가</p>
                                <p className={`text-lg font-bold ${getScoreTextColor(evaluationSummary.documentReview.averageScore)}`}>
                                  {evaluationSummary.documentReview.averageScore.toFixed(1)}점
                                </p>
                                <p className="text-xs text-gray-400">
                                  {evaluationSummary.documentReview.totalEvaluations}회 평가
                                </p>
                              </div>
                            )}
                            
                            {evaluationSummary.interview && (
                              <div className="bg-gray-50 rounded-lg p-3">
                                <p className="text-xs text-gray-500 mb-1">면접 평가</p>
                                <p className={`text-lg font-bold ${getScoreTextColor(evaluationSummary.interview.averageScore)}`}>
                                  {evaluationSummary.interview.averageScore.toFixed(1)}점
                                </p>
                                <p className="text-xs text-gray-400">
                                  {evaluationSummary.interview.totalEvaluations}회 평가
                                </p>
                              </div>
                            )}
                            
                            {evaluationSummary.overallAverage > 0 && (
                              <div className="bg-primary/5 rounded-lg p-3 sm:col-span-2">
                                <p className="text-xs text-gray-500 mb-1">전체 평균</p>
                                <p className={`text-lg font-bold ${getScoreTextColor(evaluationSummary.overallAverage)}`}>
                                  {evaluationSummary.overallAverage.toFixed(1)}점
                                </p>
                                <p className="text-xs text-gray-400">
                                  총 {evaluationSummary.totalEvaluations}회 평가
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* 면접 일정 */}
                        {app.interviewDate && (
                          <div className="mt-3 p-3 bg-indigo-50 rounded-lg">
                            <p className="text-sm font-medium text-indigo-900 mb-1">면접 일정</p>
                            <p className="text-sm text-indigo-700">
                              {format(app.interviewDate.toDate(), 'yyyy년 M월 d일 HH:mm', { locale: ko })}
                            </p>
                          </div>
                        )}

                        {/* 지원 경로 */}
                        {app.applicationPath && (
                          <div className="mt-2 text-sm text-gray-600">
                            <span className="font-medium">지원 경로:</span> {app.applicationPath}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 푸터 안내 */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>이 페이지는 SMIS Mentor 시스템을 통해 공유되었습니다.</p>
          <p className="mt-1">개인정보 보호를 위해 링크를 타인과 공유하지 마세요.</p>
        </div>
      </div>
    </Layout>
  );
}
