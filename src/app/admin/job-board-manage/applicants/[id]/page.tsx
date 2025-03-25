'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { 
  getJobBoardById, 
  getApplicationsByJobBoardId, 
  updateApplication,
  getUserById
} from '@/lib/firebaseService';
import { JobBoard, ApplicationHistory, User } from '@/types';

type ApplicationWithUser = ApplicationHistory & { 
  id: string;
  user?: User;
};

export default function ApplicantsManage({ params }: { params: Promise<{ id: string }> }) {
  const [jobBoard, setJobBoard] = useState<JobBoard & { id: string } | null>(null);
  const [applications, setApplications] = useState<ApplicationWithUser[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationWithUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [interviewLink, setInterviewLink] = useState('');
  const [interviewDuration, setInterviewDuration] = useState<number | ''>('');
  const [interviewNote, setInterviewNote] = useState('');
  
  const router = useRouter();
  // Next.js 15에서는 params가 Promise이므로 use()로 unwrap
  const { id } = use(params);
  
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        
        // 공고 정보 로드
        const boardData = await getJobBoardById(id);
        if (!boardData) {
          toast.error('공고를 찾을 수 없습니다.');
          router.push('/admin/job-board-manage');
          return;
        }
        setJobBoard(boardData);
        
        // 지원자 정보 로드
        const applicationsData = await getApplicationsByJobBoardId(id);
        
        // 각 지원자의 사용자 정보 추가
        const applicationsWithUsers = await Promise.all(
          applicationsData.map(async (app) => {
            try {
              const userData = await getUserById(app.refUserId);
              return {
                ...app,
                user: userData || undefined
              } as ApplicationWithUser;
            } catch (error) {
              console.error(`사용자 정보 로드 오류 (${app.refUserId}):`, error);
              return app as ApplicationWithUser;
            }
          })
        );
        
        setApplications(applicationsWithUsers);
      } catch (error) {
        console.error('데이터 로드 오류:', error);
        toast.error('데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [id, router]);
  
  // 선택된 지원자가 변경될 때 면접 정보 업데이트
  useEffect(() => {
    if (selectedApplication) {
      setFeedbackText(selectedApplication.interviewFeedback || '');
      setInterviewLink(selectedApplication.interviewLink || '');
      setInterviewDuration(selectedApplication.interviewDuration || '');
      setInterviewNote(selectedApplication.interviewNote || '');
    }
  }, [selectedApplication]);
  
  // 날짜 포맷팅 함수
  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate();
    return format(date, 'yyyy년 MM월 dd일 (EEE)', { locale: ko });
  };
  
  // 지원 상태 변경 핸들러
  const handleStatusChange = async (
    applicationId: string, 
    field: 'applicationStatus' | 'interviewStatus' | 'finalStatus',
    value: string
  ) => {
    try {
      setIsSubmitting(true);
      
      // 면접 상태가 pending으로 변경될 때 기본 면접 정보를 자동으로 적용
      if (field === 'interviewStatus' && value === 'pending' && jobBoard) {
        const updateData: Partial<ApplicationHistory> = { 
          [field]: value as 'pending'
        };
        
        // 공고에 저장된 기본 면접 정보가 있으면 적용
        if (jobBoard.interviewBaseLink) {
          updateData.interviewLink = jobBoard.interviewBaseLink;
          setInterviewLink(jobBoard.interviewBaseLink);
        }
        
        if (jobBoard.interviewBaseDuration) {
          updateData.interviewDuration = jobBoard.interviewBaseDuration;
          setInterviewDuration(jobBoard.interviewBaseDuration);
        }
        
        if (jobBoard.interviewBaseNote) {
          updateData.interviewNote = jobBoard.interviewBaseNote;
          setInterviewNote(jobBoard.interviewBaseNote);
        }
        
        await updateApplication(applicationId, updateData);
        
        // 상태 업데이트
        setApplications(prev => 
          prev.map(app => 
            app.id === applicationId 
              ? { 
                  ...app, 
                  [field]: value,
                  interviewLink: updateData.interviewLink,
                  interviewDuration: updateData.interviewDuration,
                  interviewNote: updateData.interviewNote
                } as ApplicationWithUser
              : app
          )
        );
        
        if (selectedApplication?.id === applicationId) {
          setSelectedApplication(prev => 
            prev ? { 
              ...prev, 
              [field]: value,
              interviewLink: updateData.interviewLink,
              interviewDuration: updateData.interviewDuration,
              interviewNote: updateData.interviewNote
            } as ApplicationWithUser : null
          );
        }
      } else {
        await updateApplication(applicationId, { [field]: value });
        
        // 상태 업데이트
        setApplications(prev => 
          prev.map(app => 
            app.id === applicationId 
              ? { ...app, [field]: value } 
              : app
          )
        );
        
        if (selectedApplication?.id === applicationId) {
          setSelectedApplication(prev => 
            prev ? { ...prev, [field]: value } : null
          );
        }
      }
      
      toast.success('지원자 상태가 변경되었습니다.');
    } catch (error) {
      console.error('지원자 상태 변경 오류:', error);
      toast.error('지원자 상태 변경 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // 면접 피드백 저장 핸들러
  const handleSaveFeedback = async () => {
    if (!selectedApplication) return;
    
    try {
      setIsSubmitting(true);
      await updateApplication(selectedApplication.id, { interviewFeedback: feedbackText });
      
      // 상태 업데이트
      setApplications(prev => 
        prev.map(app => 
          app.id === selectedApplication.id 
            ? { ...app, interviewFeedback: feedbackText } 
            : app
        )
      );
      
      setSelectedApplication(prev => 
        prev ? { ...prev, interviewFeedback: feedbackText } : null
      );
      
      toast.success('면접 피드백이 저장되었습니다.');
    } catch (error) {
      console.error('피드백 저장 오류:', error);
      toast.error('피드백 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // 지원자 선택 핸들러
  const handleSelectApplication = (application: ApplicationWithUser) => {
    setSelectedApplication(application);
    setFeedbackText(application.interviewFeedback || '');
  };
  
  // 면접 정보 저장 핸들러
  const handleSaveInterviewInfo = async () => {
    if (!selectedApplication) return;
    
    try {
      setIsSubmitting(true);
      await updateApplication(selectedApplication.id, { 
        interviewLink, 
        interviewDuration: interviewDuration ? Number(interviewDuration) : undefined,
        interviewNote
      });
      
      // 상태 업데이트
      setApplications(prev => 
        prev.map(app => 
          app.id === selectedApplication.id 
            ? { 
                ...app, 
                interviewLink,
                interviewDuration: interviewDuration ? Number(interviewDuration) : undefined,
                interviewNote
              } 
            : app
        )
      );
      
      setSelectedApplication(prev => 
        prev ? { 
          ...prev, 
          interviewLink,
          interviewDuration: interviewDuration ? Number(interviewDuration) : undefined,
          interviewNote
        } : null
      );
      
      toast.success('면접 정보가 저장되었습니다.');
    } catch (error) {
      console.error('면접 정보 저장 오류:', error);
      toast.error('면접 정보 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // 지원 상태 표시 함수
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
          label = '해당없음';
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
    <Layout requireAuth requireAdmin>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:justify-between sm:items-center">
          <div className="mb-4 sm:mb-0">
            <div className="flex items-center">
              <button
                onClick={() => router.push('/admin/job-board-manage')}
                className="mr-3 text-blue-600 hover:text-blue-800 focus:outline-none flex items-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
              </button>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">지원 유저 관리</h1>
            </div>
            <p className="mt-1 text-sm text-gray-600">지원자 정보와 지원 현황을 관리할 수 있습니다.</p>
          </div>
          {jobBoard && (
            <div className="flex flex-col">
              <div className="text-lg font-semibold text-gray-900">{jobBoard.title}</div>
              <div className="text-sm text-gray-500">{jobBoard.refGeneration} {jobBoard.refCode}</div>
            </div>
          )}
        </div>
        
        {isLoading ? (
          <div className="flex justify-center py-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-lg shadow">
            <p className="text-gray-500">지원자가 없습니다.</p>
            <Button
              variant="secondary"
              className="mt-4"
              onClick={() => router.push('/admin/job-board-manage')}
            >
              공고 관리로 돌아가기
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 지원자 목록 */}
            <div className="md:col-span-1">
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="p-4 border-b">
                  <h2 className="font-medium text-gray-900">지원자 목록</h2>
                </div>
                <div className="divide-y overflow-y-auto max-h-[600px]">
                  {applications.map((app) => (
                    <div 
                      key={app.id}
                      className={`p-4 cursor-pointer hover:bg-gray-50 ${
                        selectedApplication?.id === app.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => handleSelectApplication(app)}
                    >
                      <div className="flex flex-col space-y-3">
                        {/* 지원자 기본 정보 */}
                        <div>
                          <h3 className="font-medium text-gray-900">
                            {app.user?.name || app.refUserId}
                          </h3>
                          <p className="text-sm text-gray-500">
                            지원일: {formatDate(app.applicationDate)}
                          </p>
                          <p className="text-sm text-gray-500">
                            면접예정일: {formatDate(app.interviewDate)}
                          </p>
                        </div>
                        
                        {/* 지원 상태 표시 */}
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
                  ))}
                </div>
              </div>
            </div>
            
            {/* 선택된 지원자 상세 */}
            <div className="md:col-span-2">
              {selectedApplication ? (
                <div className="bg-white rounded-lg shadow">
                  <div className="p-6">
                    <div className="mb-6 pb-6 border-b border-gray-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">
                            {selectedApplication.user?.name || selectedApplication.refUserId}
                          </h2>
                          {selectedApplication.user && (
                            <div className="mt-2 space-y-1 text-sm text-gray-600">
                              <p>
                                <span className="font-medium">이메일:</span> {selectedApplication.user.email}
                              </p>
                              <p>
                                <span className="font-medium">전화번호:</span> {selectedApplication.user.phoneNumber}
                              </p>
                              <p>
                                <span className="font-medium">나이:</span> {selectedApplication.user.age}세
                              </p>
                              <p>
                                <span className="font-medium">주소:</span> {selectedApplication.user.address} {selectedApplication.user.addressDetail}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          <div className="text-right">
                            <p className="text-sm text-gray-500">
                              지원일: {formatDate(selectedApplication.applicationDate)}
                            </p>
                            <p className="text-sm text-gray-500">
                              면접예정일: {formatDate(selectedApplication.interviewDate)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* 자기소개 및 지원동기 */}
                    {selectedApplication.user && (
                      <div className="mb-6">
                        <div className="mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">자기소개</h3>
                          <div className="text-gray-700 bg-gray-50 p-4 rounded-lg whitespace-pre-line">
                            {selectedApplication.user.selfIntroduction || '(자기소개 없음)'}
                          </div>
                        </div>
                        
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">지원동기</h3>
                          <div className="text-gray-700 bg-gray-50 p-4 rounded-lg whitespace-pre-line">
                            {selectedApplication.user.jobMotivation || '(지원동기 없음)'}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* 상태 변경 및 피드백 */}
                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          서류 상태
                        </label>
                        <select
                          value={selectedApplication.applicationStatus}
                          onChange={(e) => handleStatusChange(
                            selectedApplication.id, 
                            'applicationStatus',
                            e.target.value
                          )}
                          className="w-full p-2 border border-gray-300 rounded-md"
                          disabled={isSubmitting}
                        >
                          <option value="pending">검토중</option>
                          <option value="accepted">서류합격</option>
                          <option value="rejected">서류불합격</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          면접 상태
                        </label>
                        <select
                          value={selectedApplication.interviewStatus || ''}
                          onChange={(e) => handleStatusChange(
                            selectedApplication.id, 
                            'interviewStatus',
                            e.target.value
                          )}
                          className="w-full p-2 border border-gray-300 rounded-md"
                          disabled={isSubmitting || selectedApplication.applicationStatus !== 'accepted'}
                        >
                          <option value="">선택</option>
                          <option value="pending">면접예정</option>
                          <option value="passed">면접합격</option>
                          <option value="failed">면접불합격</option>
                        </select>
                      </div>
                      
                      {/* 면접 정보 입력 폼 (면접 상태가 pending일 때만 표시) */}
                      {selectedApplication.interviewStatus === 'pending' && (
                        <div className="col-span-3 mt-4 p-4 bg-blue-50 rounded-lg">
                          <h3 className="text-md font-medium text-blue-800 mb-3">면접 정보 설정</h3>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                줌 미팅 링크
                              </label>
                              <input
                                type="text"
                                value={interviewLink}
                                onChange={(e) => setInterviewLink(e.target.value)}
                                placeholder="https://zoom.us/j/..."
                                className="w-full p-2 border border-gray-300 rounded-md"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                예상 소요시간(분)
                              </label>
                              <input
                                type="number"
                                value={interviewDuration}
                                onChange={(e) => setInterviewDuration(e.target.value ? Number(e.target.value) : '')}
                                className="w-full p-2 border border-gray-300 rounded-md"
                              />
                            </div>
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              면접 안내사항
                            </label>
                            <textarea
                              value={interviewNote}
                              onChange={(e) => setInterviewNote(e.target.value)}
                              rows={3}
                              className="w-full p-2 border border-gray-300 rounded-md"
                              placeholder="면접 준비사항이나 추가 안내사항을 입력하세요..."
                            />
                          </div>
                          
                          <div className="mt-4 flex justify-end">
                            <Button
                              variant="primary"
                              onClick={handleSaveInterviewInfo}
                              isLoading={isSubmitting}
                            >
                              면접 정보 저장
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          최종 상태
                        </label>
                        <select
                          value={selectedApplication.finalStatus || ''}
                          onChange={(e) => handleStatusChange(
                            selectedApplication.id, 
                            'finalStatus',
                            e.target.value
                          )}
                          className="w-full p-2 border border-gray-300 rounded-md"
                          disabled={isSubmitting || selectedApplication.interviewStatus !== 'passed'}
                        >
                          <option value="">선택</option>
                          <option value="finalAccepted">최종합격</option>
                          <option value="finalRejected">최종불합격</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* 면접 피드백 */}
                    <div className="mt-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        면접 피드백
                      </label>
                      <textarea
                        value={feedbackText}
                        onChange={(e) => setFeedbackText(e.target.value)}
                        rows={5}
                        className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="면접 피드백을 입력하세요..."
                        disabled={isSubmitting}
                      ></textarea>
                      <div className="mt-2 flex justify-end">
                        <Button
                          variant="primary"
                          onClick={handleSaveFeedback}
                          isLoading={isSubmitting}
                          disabled={isSubmitting || !feedbackText.trim()}
                        >
                          피드백 저장
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-10 text-center">
                  <p className="text-gray-500">왼쪽에서 지원자를 선택해 주세요.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
} 