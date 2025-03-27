'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, getDoc, collection, query, where, getDocs, DocumentData, deleteField, FieldValue } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { ApplicationHistory, JobBoard, User } from '@/types';
import { Timestamp } from 'firebase/firestore';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';

type JobBoardWithId = JobBoard & { id: string };

type ApplicationWithUser = ApplicationHistory & { 
  id: string;
  user?: User;
};

type FilterStatus = 'all' | 'accepted' | 'interview' | 'final';

type Props = {
  jobBoardId: string;
};

export function ApplicantsManageClient({ jobBoardId }: Props) {
  const router = useRouter();
  const [applications, setApplications] = useState<ApplicationWithUser[]>([]);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationWithUser | null>(null);
  const [jobBoard, setJobBoard] = useState<JobBoardWithId | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [feedbackText, setFeedbackText] = useState('');
  const [interviewBaseLink, setInterviewBaseLink] = useState('');
  const [interviewBaseDuration, setInterviewBaseDuration] = useState('');
  const [interviewBaseNotes, setInterviewBaseNotes] = useState('');
  const [filteredApplications, setFilteredApplications] = useState<ApplicationWithUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewTime, setInterviewTime] = useState('');
  
  const loadData = async () => {
    try {
      setIsLoading(true);
      
      // 채용 공고 정보 로드
      const jobBoardRef = doc(db, 'jobBoards', jobBoardId);
      const jobBoardDoc = await getDoc(jobBoardRef);
      
      if (!jobBoardDoc.exists()) {
        toast.error('채용 공고를 찾을 수 없습니다.');
        router.push('/admin/job-board-manage');
        return;
      }
      
      const jobBoardData = {
        ...jobBoardDoc.data(),
        id: jobBoardDoc.id
      } as JobBoardWithId;
      setJobBoard(jobBoardData);
      
      // 지원자 목록 로드
      const applicationsRef = collection(db, 'applicationHistories');
      const q = query(applicationsRef, where('refJobBoardId', '==', jobBoardId));
      const applicationsSnapshot = await getDocs(q);
      
      const applicationsData = await Promise.all(
        applicationsSnapshot.docs.map(async (docSnapshot) => {
          const data = docSnapshot.data() as ApplicationHistory;
          const userRef = doc(db, 'users', data.refUserId);
          const userDoc = await getDoc(userRef);
          const userData = userDoc.exists() ? userDoc.data() as DocumentData : undefined;
          
          return {
            ...data,
            id: docSnapshot.id,
            user: userData ? { ...userData, id: userDoc.id } as User : undefined
          } as ApplicationWithUser;
        })
      );
      
      setApplications(applicationsData);
      setFilteredApplications(applicationsData);
    } catch (error) {
      console.error('데이터 로드 오류:', error);
      toast.error('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };
  
  useEffect(() => {
    loadData();
  }, [jobBoardId, router]);
  
  useEffect(() => {
    let filtered = [...applications];

    // 상태 필터링
    if (filterStatus !== 'all') {
      filtered = filtered.filter(app => {
        switch (filterStatus) {
          case 'accepted':
            return app.applicationStatus === 'accepted';
          case 'interview':
            return app.interviewStatus === 'pending';
          case 'final':
            return app.finalStatus === 'finalAccepted';
          default:
            return true;
        }
      });
    }

    // 검색어 필터링
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(app => {
        const user = app.user;
        if (!user) return false;
        
        return (
          user.name?.toLowerCase().includes(query) ||
          user.email?.toLowerCase().includes(query) ||
          user.phoneNumber?.toLowerCase().includes(query)
        );
      });
    }

    setFilteredApplications(filtered);
  }, [applications, filterStatus, searchQuery]);
  
  const handleSelectApplication = (app: ApplicationWithUser) => {
    setSelectedApplication(app);
    setFeedbackText(app.interviewFeedback || '');
    if (app.interviewDateTime) {
      const date = app.interviewDateTime.toDate();
      setInterviewDate(format(date, 'yyyy-MM-dd'));
      setInterviewTime(format(date, 'HH:mm'));
    } else {
      setInterviewDate('');
      setInterviewTime('');
    }
  };

  const formatDate = (date: Date | Timestamp | null | undefined) => {
    if (!date) return '미정';
    const dateObj = date instanceof Timestamp ? date.toDate() : date;
    return format(dateObj, 'yyyy년 MM월 dd일 HH:mm', { locale: ko });
  };

  const getStatusBadge = (status: string | undefined, statusType: 'application' | 'interview' | 'final') => {
    if (!status) return null;

    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: '검토중' },
      accepted: { bg: 'bg-green-100', text: 'text-green-800', label: '합격' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', label: '불합격' },
      passed: { bg: 'bg-green-100', text: 'text-green-800', label: '합격' },
      failed: { bg: 'bg-red-100', text: 'text-red-800', label: '불합격' },
      finalAccepted: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: '최종합격' },
      finalRejected: { bg: 'bg-red-100', text: 'text-red-800', label: '최종불합격' },
    };

    // 특별히 면접 상태가 'pending'인 경우 '면접 예정' 대신 '예정'으로 표시
    if (status === 'pending' && statusType === 'interview') {
      return (
        <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
          예정
        </span>
      );
    }

    const config = statusConfig[status];
    if (!config) return null;

    return (
      <span className={`px-2 py-1 text-xs rounded-full ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const handleStatusChange = async (applicationId: string, newStatus: string, statusType: 'application' | 'interview' | 'final') => {
    if (!selectedApplication) return;

    try {
      setIsLoading(true);
      const applicationRef = doc(db, 'applicationHistories', applicationId);
      
      // 로컬 상태 업데이트용 데이터
      const updateData: Partial<ApplicationHistory> = {
        updatedAt: Timestamp.fromDate(new Date())
      };

      // Firestore 업데이트용 데이터 (FieldValue.delete()를 사용하기 위해 별도로 관리)
      const firestoreUpdateData: Record<string, FieldValue | Timestamp | string | number | undefined> = {
        updatedAt: Timestamp.fromDate(new Date())
      };

      // 상태 타입에 따라 업데이트할 필드 설정
      switch (statusType) {
        case 'application':
          updateData.applicationStatus = newStatus as 'pending' | 'accepted' | 'rejected';
          firestoreUpdateData.applicationStatus = newStatus;
          
          // 서류 불합격 시 면접과 최종 상태 초기화
          if (newStatus === 'rejected') {
            // 로컬 상태 업데이트용
            updateData.interviewStatus = undefined;
            updateData.finalStatus = undefined;
            updateData.interviewDate = undefined;
            updateData.interviewDateTime = undefined;
            updateData.interviewFeedback = undefined;
            updateData.interviewBaseLink = undefined;
            updateData.interviewBaseDuration = undefined;
            updateData.interviewBaseNotes = undefined;
            
            // Firestore 업데이트용
            firestoreUpdateData.interviewStatus = deleteField();
            firestoreUpdateData.finalStatus = deleteField();
            firestoreUpdateData.interviewDate = deleteField();
            firestoreUpdateData.interviewDateTime = deleteField();
            firestoreUpdateData.interviewFeedback = deleteField();
            firestoreUpdateData.interviewBaseLink = deleteField();
            firestoreUpdateData.interviewBaseDuration = deleteField();
            firestoreUpdateData.interviewBaseNotes = deleteField();
          }
          break;
        case 'interview':
          updateData.interviewStatus = newStatus as 'pending' | 'passed' | 'failed';
          firestoreUpdateData.interviewStatus = newStatus;
          
          // 면접 불합격 시 최종 상태 초기화
          if (newStatus === 'failed') {
            // 로컬 상태 업데이트용
            updateData.finalStatus = undefined;
            
            // Firestore 업데이트용
            firestoreUpdateData.finalStatus = deleteField();
          }
          break;
        case 'final':
          updateData.finalStatus = newStatus as 'finalAccepted' | 'finalRejected';
          firestoreUpdateData.finalStatus = newStatus;
          break;
      }

      // Firestore 업데이트
      await updateDoc(applicationRef, firestoreUpdateData);

      // 로컬 상태 업데이트
      const updatedApplication: ApplicationWithUser = {
        ...selectedApplication,
        ...updateData
      };

      // applications 배열 업데이트
      setApplications(prevApplications => 
        prevApplications.map(app => 
          app.id === applicationId ? updatedApplication : app
        )
      );

      // 선택된 지원자 상태 업데이트
      setSelectedApplication(updatedApplication);

      toast.success('상태가 업데이트되었습니다.');
    } catch (error) {
      console.error('상태 업데이트 오류:', error);
      toast.error('상태 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInterviewStatusChange = async (applicationId: string, newStatus: string) => {
    await handleStatusChange(applicationId, newStatus, 'interview');
  };

  const handleFinalStatusChange = async (applicationId: string, newStatus: string) => {
    await handleStatusChange(applicationId, newStatus, 'final');
  };

  const handleSaveInterviewInfo = async () => {
    if (!selectedApplication || !interviewDate || !interviewTime) return;

    try {
      setIsLoading(true);
      const applicationRef = doc(db, 'applicationHistories', selectedApplication.id);
      
      const interviewDateTime = new Date(`${interviewDate}T${interviewTime}`);
      
      const updateData: Partial<ApplicationHistory> = {
        interviewDateTime: Timestamp.fromDate(interviewDateTime),
        interviewBaseLink,
        interviewBaseDuration: interviewBaseDuration ? parseInt(interviewBaseDuration) : 30,
        interviewBaseNotes,
        updatedAt: Timestamp.fromDate(new Date())
      };

      await updateDoc(applicationRef, updateData);

      // 로컬 상태 업데이트
      const updatedApplication: ApplicationWithUser = {
        ...selectedApplication,
        ...updateData
      };

      // applications 배열 업데이트
      setApplications(prevApplications => 
        prevApplications.map(app => 
          app.id === selectedApplication.id ? updatedApplication : app
        )
      );

      // 선택된 지원자 상태 업데이트
      setSelectedApplication(updatedApplication);

      toast.success('면접 정보가 저장되었습니다.');
    } catch (error) {
      console.error('면접 정보 저장 오류:', error);
      toast.error('면접 정보 저장 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveFeedback = async () => {
    if (!selectedApplication) return;

    try {
      setIsLoading(true);
      const applicationRef = doc(db, 'applicationHistories', selectedApplication.id);
      
      const updateData: Partial<ApplicationHistory> = {
        interviewFeedback: feedbackText,
        updatedAt: Timestamp.fromDate(new Date())
      };

      await updateDoc(applicationRef, updateData);

      // 로컬 상태 업데이트
      const updatedApplication: ApplicationWithUser = {
        ...selectedApplication,
        ...updateData
      };

      // applications 배열 업데이트
      setApplications(prevApplications => 
        prevApplications.map(app => 
          app.id === selectedApplication.id ? updatedApplication : app
        )
      );

      // 선택된 지원자 상태 업데이트
      setSelectedApplication(updatedApplication);

      toast.success('면접 피드백이 저장되었습니다.');
    } catch (error) {
      console.error('면접 피드백 저장 오류:', error);
      toast.error('면접 피드백 저장 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
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
          {/* {jobBoard && (
            <div className="flex flex-col">
              <div className="text-lg font-semibold text-gray-900">{jobBoard.title}</div>
              <div className="text-sm text-gray-500">{jobBoard.generation}</div>
            </div>
          )} */}
        </div>
        
        {/* 필터 및 검색 */}
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              {/* <label className="block text-sm font-medium text-gray-700 mb-2">상태 필터</label> */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    filterStatus === 'all'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  전체
                </button>
                <button
                  onClick={() => setFilterStatus('accepted')}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    filterStatus === 'accepted'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  서류 합격
                </button>
                <button
                  onClick={() => setFilterStatus('interview')}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    filterStatus === 'interview'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  면접 예정
                </button>
                <button
                  onClick={() => setFilterStatus('final')}
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    filterStatus === 'final'
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  최종 합격
                </button>
              </div>
            </div>
            <div>
              {/* <label className="block text-sm font-medium text-gray-700 mb-2">검색</label> */}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이름, 이메일, 전화번호로 검색"
                className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
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
                  <p className="text-sm text-gray-500 mt-1">
                    총 {filteredApplications.length}명
                    {filterStatus !== 'all' && ` (전체 ${applications.length}명 중)`}
                  </p>
                </div>
                <div className="divide-y overflow-y-auto max-h-[600px]">
                  {filteredApplications.map((app) => (
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
                          {/* <p className="text-sm text-gray-500">
                            면접예정일: {formatDate(app.interviewDate)}
                          </p> */}
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
                              {/* <p>
                                <span className="font-medium">이메일:</span> {selectedApplication.user.email}
                              </p> */}
                              <p>
                                <span className="font-medium">전화번호:</span> {selectedApplication.user.phoneNumber}
                              </p>
                              <p>
                                <span className="font-medium">나이:</span> {selectedApplication.user.age}세
                              </p>
                              <p>
                                <span className="font-medium">주소:</span> {selectedApplication.user.address} {selectedApplication.user.addressDetail}
                              </p>
                              <p>
                                <span className="font-medium">학교:</span> {selectedApplication.user.university} {selectedApplication.user.grade}학년 {selectedApplication.user.isOnLeave ? '휴학생' : '재학생'}
                              </p>
                              <p>
                                <span className="font-medium">전공1:</span> {selectedApplication.user.major1} | <span className="font-medium">전공2:</span> {selectedApplication.user.major2}
                              </p>
                            </div>
                          )}
                        </div>
                        {/* <div className="flex space-x-2">
                          <div className="text-right">
                            <p className="text-sm text-gray-500">
                              지원일: {formatDate(selectedApplication.applicationDate)}
                            </p>
                            <p className="text-sm text-gray-500">
                              면접예정일: {formatDate(selectedApplication.interviewDate)}
                            </p>
                          </div>
                        </div> */}
                      </div>
                    </div>

                    {/* 아르바이트 경력 */}
                    <div className="mb-6 pb-6">
                          <h3 className="text-lg font-semibold mb-4">아르바이트 경력</h3>
                          {!selectedApplication.user?.partTimeJobs || selectedApplication.user.partTimeJobs.length === 0 ? (
                            <p className="text-gray-500">등록된 아르바이트 경력이 없습니다.</p>
                          ) : (
                            <div className="space-y-4">
                              {selectedApplication.user.partTimeJobs.map((job, index) => (
                                <div key={index} className="bg-gray-50 p-4 rounded-md border border-gray-200">
                                  <div className="flex justify-between mb-2">
                                    <span className="font-medium">{job.companyName}</span>
                                    <span className="text-sm text-gray-500">{job.period}</span>
                                  </div>
                                  <div className="mb-2">
                                    <span className="text-sm text-gray-500 mr-2">담당:</span>
                                    <span>{job.position}</span>
                                  </div>
                                  <div>
                                    <span className="text-sm text-gray-500 mr-2">업무 내용:</span>
                                    <span className="text-gray-700">{job.description}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                    
                    {/* 자기소개 및 지원동기 */}
                    {selectedApplication.user && (
                      <div className="mb-6">
                        <hr className="my-6" />
                        <div className="mb-6 pb-6">
                          <h3 className="text-lg font-semibold mb-4">자기소개 및 지원동기</h3>
                          <div className="space-y-4">
                            <div>
                              <h4 className="font-medium mb-2">자기소개</h4>
                              <div className="p-4 bg-gray-50 rounded-md whitespace-pre-line">
                                {selectedApplication.user?.selfIntroduction || '내용이 없습니다.'}
                              </div>
                            </div>
                            <div>
                              <h4 className="font-medium mb-2">지원동기</h4>
                              <div className="p-4 bg-gray-50 rounded-md whitespace-pre-line">
                                {selectedApplication.user?.jobMotivation || '내용이 없습니다.'}
                              </div>
                            </div>
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
                          onChange={(e) => handleStatusChange(selectedApplication.id, e.target.value, 'application')}
                          className="w-full p-2 border border-gray-300 rounded-md"
                          disabled={isLoading}
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
                          onChange={(e) => handleInterviewStatusChange(selectedApplication.id, e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md"
                          disabled={isLoading || selectedApplication.applicationStatus !== 'accepted'}
                        >
                          <option value="">선택</option>
                          <option value="pending">면접예정</option>
                          <option value="passed">면접합격</option>
                          <option value="failed">면접불합격</option>
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          최종 상태
                        </label>
                        <select
                          value={selectedApplication.finalStatus || ''}
                          onChange={(e) => handleFinalStatusChange(selectedApplication.id, e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md"
                          disabled={isLoading || selectedApplication.interviewStatus !== 'passed'}
                        >
                          <option value="">선택</option>
                          <option value="finalAccepted">최종합격</option>
                          <option value="finalRejected">최종불합격</option>
                        </select>
                      </div>
                    </div>
                    
                    {/* 면접 정보 입력 폼 */}
                    {selectedApplication.interviewStatus === 'pending' && (
                      <div className="col-span-3 mt-4 p-4 bg-blue-50 rounded-lg">
                        <h3 className="text-md font-medium text-blue-800 mb-3">면접 정보</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              면접 날짜
                            </label>
                            <input
                              type="date"
                              value={interviewDate}
                              onChange={(e) => setInterviewDate(e.target.value)}
                              className="w-full p-2 border border-gray-300 rounded-md"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              면접 시간
                            </label>
                            <input
                              type="time"
                              value={interviewTime}
                              onChange={(e) => setInterviewTime(e.target.value)}
                              className="w-full p-2 border border-gray-300 rounded-md"
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              면접 링크
                            </label>
                            <input
                              type="text"
                              value={interviewBaseLink}
                              onChange={(e) => setInterviewBaseLink(e.target.value)}
                              className="w-full p-2 border border-gray-300 rounded-md"
                              placeholder="https://zoom.us/j/..."
                            />
                          </div>
                          
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              면접 시간 (분)
                            </label>
                            <input
                              type="number"
                              value={interviewBaseDuration}
                              onChange={(e) => setInterviewBaseDuration(e.target.value)}
                              className="w-full p-2 border border-gray-300 rounded-md"
                              placeholder="30"
                            />
                          </div>
                        </div>
                        
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            면접 참고사항
                          </label>
                          <textarea
                            value={interviewBaseNotes}
                            onChange={(e) => setInterviewBaseNotes(e.target.value)}
                            className="w-full p-2 border border-gray-300 rounded-md"
                            rows={3}
                            placeholder="면접 참고사항을 입력하세요..."
                          />
                        </div>
                        
                        <div className="flex justify-end">
                          <Button
                            variant="primary"
                            onClick={handleSaveInterviewInfo}
                            isLoading={isLoading}
                            disabled={isLoading || !interviewDate || !interviewTime}
                          >
                            면접 정보 저장
                          </Button>
                        </div>
                      </div>
                    )}
                    
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
                        disabled={isLoading}
                      ></textarea>
                      <div className="mt-2 flex justify-end">
                        <Button
                          variant="primary"
                          onClick={handleSaveFeedback}
                          isLoading={isLoading}
                          disabled={isLoading || !feedbackText.trim()}
                        >
                          피드백 저장
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
                  지원자를 선택하세요
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
} 