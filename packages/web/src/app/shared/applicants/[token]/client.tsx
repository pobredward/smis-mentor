'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import Button from '@/components/common/Button';
import { ApplicationHistory, User } from '@/types';
import { getScoreTextColor } from '@smis-mentor/shared';

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

interface Props {
  token: string;
}

export function SharedApplicantsClient({ token }: Props) {
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600 text-sm">지원자 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🔒</div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">접근할 수 없습니다</h1>
          <p className="text-gray-600 text-sm mb-6">{error}</p>
          <Button onClick={() => window.location.href = '/'}>
            홈으로 돌아가기
          </Button>
        </div>
      </div>
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-2 sm:px-4 py-4 sm:py-6">
        {/* 헤더 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4 mb-3 sm:mb-4 relative">
          {/* 링크 만료 시간 (박스 밖) */}
          <div className="absolute -top-2 right-2 sm:right-4 bg-white px-2 py-0.5 rounded shadow-sm border border-gray-200">
            <p className="text-xs text-gray-500">
              만료: {format(expiresAt, 'M/d HH:mm', { locale: ko })}
              {timeRemaining > 0 && (
                <span className="text-orange-600 ml-1">
                  ({hoursRemaining > 0 && `${hoursRemaining}h `}{minutesRemaining}m)
                </span>
              )}
            </p>
          </div>

          <div className="mb-3">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
              {data.jobBoard.title}
            </h1>
            <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
              <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full font-medium">
                {data.jobBoard.generation}
              </span>
              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full">
                {data.jobBoard.jobCode}
              </span>
            </div>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3">
            <div className="flex items-start gap-2">
              <span className="text-blue-600 text-base sm:text-lg flex-shrink-0">ℹ️</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm font-medium text-blue-900 mb-0.5">임시 공유 링크</p>
                <p className="text-xs text-blue-700">
                  임시로 공유된 지원자 정보입니다. 만료 시간 이후 자동 차단됩니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 지원자 목록 */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-gray-200">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900">
              지원자 목록
            </h2>
          </div>
          
          <div className="divide-y divide-gray-200">
            {data.applications.length === 0 ? (
              <div className="px-3 sm:px-4 py-8 text-center">
                <p className="text-gray-500 text-sm">공유된 지원자가 없습니다.</p>
              </div>
            ) : (
              data.applications.map((app) => {
                const user = app.user;
                const evaluationSummary = user?.evaluationSummary;
                
                return (
                  <div key={app.id} className="px-3 sm:px-4 py-4 border-b border-gray-200 last:border-b-0">
                    {/* 헤더: 이름과 상태 */}
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-base sm:text-lg font-bold text-gray-900">
                        {user?.name || '알 수 없음'}
                      </h3>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(app)}`}>
                        {getStatusText(app)}
                      </span>
                    </div>

                    {/* 기본 정보 섹션 */}
                    <div className="mb-4">
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        기본 정보
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm bg-gray-50 rounded-lg p-2 sm:p-3">
                        <div>
                          <span className="font-medium text-gray-600">이메일:</span>
                          <p className="text-gray-900 mt-0.5 break-all">{user?.email || '-'}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">전화번호:</span>
                          <p className="text-gray-900 mt-0.5">{user?.phoneNumber || '-'}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">나이:</span>
                          <p className="text-gray-900 mt-0.5">{user?.age ? `${user.age}세` : '-'}</p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">성별:</span>
                          <p className="text-gray-900 mt-0.5">{user?.gender === 'M' ? '남성' : user?.gender === 'F' ? '여성' : '-'}</p>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="font-medium text-gray-600">주소:</span>
                          <p className="text-gray-900 mt-0.5">
                            {user?.address || '-'}
                            {user?.addressDetail && ` (${user.addressDetail})`}
                          </p>
                        </div>
                        <div>
                          <span className="font-medium text-gray-600">지원일:</span>
                          <p className="text-gray-900 mt-0.5">
                            {format(new Date(app.applicationDate), 'yyyy.MM.dd HH:mm', { locale: ko })}
                          </p>
                        </div>
                        {app.applicationPath && (
                          <div className="sm:col-span-2">
                            <span className="font-medium text-gray-600">지원 경로:</span>
                            <p className="text-gray-900 mt-0.5">
                              {app.applicationPath}
                              {user?.referrerName && ` (추천인: ${user.referrerName})`}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 학력 정보 */}
                    {user?.university && (
                      <div className="mb-4">
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                          </svg>
                          학력 정보
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs sm:text-sm bg-gray-50 rounded-lg p-2 sm:p-3">
                          <div>
                            <span className="font-medium text-gray-600">학교:</span>
                            <p className="text-gray-900 mt-0.5">{user.university}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-600">학년:</span>
                            <p className="text-gray-900 mt-0.5">
                              {user.grade === 6 ? '졸업생' : user.grade ? `${user.grade}학년` : '-'}
                              {user.isOnLeave === true && ' (휴학)'}
                              {user.isOnLeave === false && user.grade !== 6 && ' (재학)'}
                            </p>
                          </div>
                          {user.major1 && (
                            <div className="sm:col-span-2">
                              <span className="font-medium text-gray-600">전공:</span>
                              <p className="text-gray-900 mt-0.5">
                                {user.major1}
                                {user.major2 && ` / ${user.major2}`}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 알바 경력 */}
                    {user?.partTimeJobs && user.partTimeJobs.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          알바 경력
                        </h4>
                        <div className="space-y-2">
                          {user.partTimeJobs.map((job, index) => (
                            <div key={index} className="bg-gray-50 rounded-lg p-2 sm:p-3 text-xs sm:text-sm">
                              <div className="flex items-start justify-between mb-1">
                                <p className="font-medium text-gray-900">{job.companyName}</p>
                                <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded ml-2">{job.period}</span>
                              </div>
                              <p className="text-gray-700 mb-0.5">직책: {job.position}</p>
                              <p className="text-gray-600 text-xs leading-relaxed">{job.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 멘토링 경력 */}
                    {user?.jobExperiences && user.jobExperiences.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                          </svg>
                          멘토링 경력
                        </h4>
                        <div className="space-y-1.5">
                          {user.jobExperiences.map((exp, index) => (
                            <div key={index} className="bg-gray-50 rounded-lg p-2 text-xs sm:text-sm flex items-center justify-between">
                              <div>
                                <span className="font-medium text-gray-900">{exp.groupRole}</span>
                                {exp.classCode && <span className="text-gray-600 ml-1.5">({exp.classCode})</span>}
                              </div>
                              <span className="text-xs text-gray-500 bg-white px-1.5 py-0.5 rounded">
                                {exp.group === 'junior' ? '초등' : exp.group === 'middle' ? '중등' : exp.group === 'senior' ? '고등' : exp.group}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 자기소개 및 지원동기 */}
                    <div className="mb-4">
                      <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        자기소개 및 지원동기
                      </h4>
                      <div className="space-y-2">
                        {user?.selfIntroduction && (
                          <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
                            <p className="text-xs font-medium text-gray-600 mb-1">자기소개</p>
                            <p className="text-xs sm:text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{user.selfIntroduction}</p>
                          </div>
                        )}
                        {user?.jobMotivation && (
                          <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
                            <p className="text-xs font-medium text-gray-600 mb-1">지원동기</p>
                            <p className="text-xs sm:text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{user.jobMotivation}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 평가 점수 요약 */}
                    {evaluationSummary && (
                      <div className="mb-4">
                        <h4 className="text-xs sm:text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                          평가 점수
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          {evaluationSummary.documentReview && (
                            <div className="bg-gray-50 rounded-lg p-2 sm:p-3 text-center">
                              <p className="text-xs text-gray-500 mb-1">서류 평가</p>
                              <p className={`text-xl sm:text-2xl font-bold ${getScoreTextColor(evaluationSummary.documentReview.averageScore)}`}>
                                {evaluationSummary.documentReview.averageScore.toFixed(1)}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {evaluationSummary.documentReview.totalEvaluations}회
                              </p>
                            </div>
                          )}
                          
                          {evaluationSummary.interview && (
                            <div className="bg-gray-50 rounded-lg p-2 sm:p-3 text-center">
                              <p className="text-xs text-gray-500 mb-1">면접 평가</p>
                              <p className={`text-xl sm:text-2xl font-bold ${getScoreTextColor(evaluationSummary.interview.averageScore)}`}>
                                {evaluationSummary.interview.averageScore.toFixed(1)}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {evaluationSummary.interview.totalEvaluations}회
                              </p>
                            </div>
                          )}
                          
                          {evaluationSummary.overallAverage > 0 && (
                            <div className="bg-primary/10 rounded-lg p-2 sm:p-3 text-center col-span-2">
                              <p className="text-xs text-gray-500 mb-1">전체 평균</p>
                              <p className={`text-xl sm:text-2xl font-bold ${getScoreTextColor(evaluationSummary.overallAverage)}`}>
                                {evaluationSummary.overallAverage.toFixed(1)}
                              </p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                총 {evaluationSummary.totalEvaluations}회
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 면접 일정 */}
                    {app.interviewDate && (
                      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-2 sm:p-3">
                        <p className="text-xs sm:text-sm font-semibold text-indigo-900 mb-0.5 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          면접 일정
                        </p>
                        <p className="text-xs sm:text-sm text-indigo-700 ml-5">
                          {format(new Date(app.interviewDate), 'yyyy년 M월 d일 HH:mm', { locale: ko })}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* 푸터 안내 */}
        <div className="mt-4 text-center text-xs text-gray-500">
          <p>이 페이지는 SMIS Mentor 시스템을 통해 공유되었습니다.</p>
          <p className="mt-1">개인정보 보호를 위해 링크를 타인과 공유하지 마세요.</p>
        </div>
      </div>
    </div>
  );
}
