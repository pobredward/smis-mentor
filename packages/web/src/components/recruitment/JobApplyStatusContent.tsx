'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import Button from '@/components/common/Button';
import { getApplicationsByUserId, getJobBoardById, cancelApplication } from '@/lib/firebaseService';
import { ApplicationHistory, JobBoard } from '@/types';

type ApplicationWithJobDetails = ApplicationHistory & {
  jobBoard?: (JobBoard & { id: string }) | undefined;
};

export default function JobApplyStatusContent() {
  const [applications, setApplications] = useState<ApplicationWithJobDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(null);
  const { userData } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const loadApplications = async () => {
      try {
        setIsLoading(true);
        
        if (!userData) {
          return;
        }
        
        const userApplications = await getApplicationsByUserId(userData.userId);
        
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
  
  const formatDate = (timestamp: Timestamp | undefined) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate();
    return format(date, 'yyyy년 MM월 dd일 (EEE) HH:mm', { locale: ko });
  };
  
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
          label = '최종합격';
          break;
        case 'finalRejected':
          color = 'bg-red-100 text-red-800';
          label = '최종불합격';
          break;
        case 'finalAbsent':
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
  
  const handleCancelClick = (applicationId: string) => {
    setSelectedApplicationId(applicationId);
    setCancelModalOpen(true);
  };
  
  const handleCancelConfirm = async () => {
    if (!selectedApplicationId) return;
    
    try {
      setIsCancelling(true);
      await cancelApplication(selectedApplicationId);
      setApplications(prev => prev.filter(app => app.applicationHistoryId !== selectedApplicationId));
      toast.success('지원이 취소되었습니다.');
      setCancelModalOpen(false);
      setSelectedApplicationId(null);
    } catch (error) {
      console.error('지원 취소 오류:', error);
      toast.error('지원 취소 중 오류가 발생했습니다.');
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-500">로그인이 필요합니다.</p>
      </div>
    );
  }

  if (applications.length === 0) {
    return (
      <div className="text-center py-10 bg-white rounded-lg shadow">
        <p className="text-gray-500">지원 내역이 없습니다.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4 px-4 sm:px-6 lg:px-8">
        {applications.map((app) => (
          <div key={app.applicationHistoryId} className="bg-white shadow rounded-lg p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {app.jobBoard?.title || '삭제된 공고'}
              </h3>
              <p className="text-sm text-gray-600">{app.jobBoard?.generation}</p>
            </div>

            {app.applicationStatus === 'accepted' && app.interviewStatus === 'pending' && app.jobBoard && (
              <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-semibold text-blue-900 mb-2">면접 정보</h4>
                {app.interviewDate && (
                  <p className="text-sm text-blue-800 mb-1">
                    <span className="font-medium">면접 일시:</span> {formatDate(app.interviewDate)}
                  </p>
                )}
                {app.jobBoard.interviewBaseDuration && (
                  <p className="text-sm text-blue-800 mb-1">
                    <span className="font-medium">예상 소요 시간:</span> {app.jobBoard.interviewBaseDuration}분
                  </p>
                )}
                {app.jobBoard.interviewBaseLink && (
                  <a
                    href={app.jobBoard.interviewBaseLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    면접 참여하기
                  </a>
                )}
                {app.jobBoard.interviewBaseNotes && (
                  <p className="text-sm text-blue-800 mt-2">{app.jobBoard.interviewBaseNotes}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">서류</p>
                {getStatusBadge(app.applicationStatus, 'application')}
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">면접</p>
                {getStatusBadge(app.interviewStatus, 'interview')}
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">최종</p>
                {getStatusBadge(app.finalStatus, 'final')}
              </div>
            </div>

            {app.applicationStatus === 'pending' && (
              <Button
                variant="danger"
                onClick={() => handleCancelClick(app.applicationHistoryId)}
                className="w-full mt-2"
              >
                지원 취소
              </Button>
            )}
          </div>
        ))}
      </div>

      {cancelModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">지원 취소 확인</h3>
            <p className="text-gray-700 mb-6">
              정말로 이 지원을 취소하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setCancelModalOpen(false)}
                disabled={isCancelling}
              >
                아니오
              </Button>
              <Button
                variant="danger"
                onClick={handleCancelConfirm}
                isLoading={isCancelling}
              >
                예, 취소합니다
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
