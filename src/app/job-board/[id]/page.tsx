'use client';

import { useState, useEffect, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { getJobBoardById, deleteJobBoard, getJobCodeById, getAllJobCodes, createApplication } from '@/lib/firebaseService';
import { JobBoardWithId, JobCodeWithId, ApplicationHistory } from '@/types';
import RichTextEditor from '@/components/common/RichTextEditor';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import FormInput from '@/components/common/FormInput';

// 날짜 포맷팅 함수
const formatDateOnly = (timestamp: Timestamp | null | undefined): string => {
  if (!timestamp?.toDate) return '-';
  return format(timestamp.toDate(), 'yyyy년 MM월 dd일 (EEE)', { locale: ko });
};

const formatDateTime = (timestamp: Timestamp | null | undefined): string => {
  if (!timestamp?.toDate) return '-';
  return format(timestamp.toDate(), 'yyyy년 MM월 dd일 (EEE) HH:mm', { locale: ko });
};

export default function JobBoardDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [jobBoard, setJobBoard] = useState<JobBoardWithId | null>(null);
  const [jobCode, setJobCode] = useState<JobCodeWithId | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editedDescription, setEditedDescription] = useState('');
  const [editedTitle, setEditedTitle] = useState('');
  const [editedStatus, setEditedStatus] = useState<'active' | 'closed'>('active');
  const [editedInterviewDates, setEditedInterviewDates] = useState<{ start: string; end: string }[]>([]);
  const [editedInterviewBaseDuration, setEditedInterviewBaseDuration] = useState(30);
  const [editedInterviewBaseLink, setEditedInterviewBaseLink] = useState('');
  const [editedInterviewBaseNotes, setEditedInterviewBaseNotes] = useState('');
  const [selectedInterviewDate, setSelectedInterviewDate] = useState<string | null>(null);
  const [jobCodes, setJobCodes] = useState<JobCodeWithId[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<string>('');
  const [filteredJobCodes, setFilteredJobCodes] = useState<JobCodeWithId[]>([]);
  const [editedJobCodeId, setEditedJobCodeId] = useState('');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isProfileErrorModalOpen, setIsProfileErrorModalOpen] = useState(false);
  const [profileErrorType, setProfileErrorType] = useState<'image' | 'selfIntro' | 'jobMotivation' | null>(null);

  const { userData } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const board = await getJobBoardById(id);
        
        if (!board) {
          toast.error('존재하지 않는 공고입니다.');
          router.push('/job-board');
          return;
        }
        
        if (board.status !== 'active' && userData?.role !== 'admin') {
          toast.error('마감된 공고입니다.');
          router.push('/job-board');
          return;
        }
        
        setJobBoard(board);
        setEditedTitle(board.title);
        setEditedStatus(board.status);
        setEditedDescription(board.description);
        setEditedJobCodeId(board.refJobCodeId);
        
        // 면접 기본정보 초기화
        setEditedInterviewBaseLink(board.interviewBaseLink || '');
        setEditedInterviewBaseDuration(board.interviewBaseDuration || 30);
        setEditedInterviewBaseNotes(board.interviewBaseNotes || '');

        // jobCode 정보 로드
        if (board.refJobCodeId) {
          const jobCodeData = await getJobCodeById(board.refJobCodeId);
          setJobCode(jobCodeData);
          if (jobCodeData) {
            setSelectedGeneration(jobCodeData.generation);
          }
        }

        // 모든 업무 코드 로드
        const codes = await getAllJobCodes();
        setJobCodes(codes);
        
        // 현재 기수의 업무 코드 필터링
        if (jobCode) {
          const filtered = codes.filter(code => code.generation === jobCode.generation);
          setFilteredJobCodes(filtered);
        }

        // interviewDates 설정
        if (board.interviewDates && Array.isArray(board.interviewDates)) {
          const formattedDates = board.interviewDates
            .filter(date => date && date.start && date.end)
            .map(date => {
              try {
                const startDate = date.start instanceof Timestamp ? 
                  date.start.toDate() : 
                  new Date(date.start);
                
                const endDate = date.end instanceof Timestamp ? 
                  date.end.toDate() : 
                  new Date(date.end);

                // 날짜 및 시간을 로컬 시간대 기준으로 포맷팅 (YYYY-MM-DDTHH:MM 형식)
                const padZero = (num: number) => String(num).padStart(2, '0');
                
                const startYear = startDate.getFullYear();
                const startMonth = padZero(startDate.getMonth() + 1);
                const startDay = padZero(startDate.getDate());
                const startHours = padZero(startDate.getHours());
                const startMinutes = padZero(startDate.getMinutes());
                
                const endYear = endDate.getFullYear();
                const endMonth = padZero(endDate.getMonth() + 1);
                const endDay = padZero(endDate.getDate());
                const endHours = padZero(endDate.getHours());
                const endMinutes = padZero(endDate.getMinutes());

                return {
                  start: `${startYear}-${startMonth}-${startDay}T${startHours}:${startMinutes}`,
                  end: `${endYear}-${endMonth}-${endDay}T${endHours}:${endMinutes}`
                };
              } catch (error) {
                console.error('날짜 변환 오류:', error);
                return null;
              }
            })
            .filter(date => date !== null);

          setEditedInterviewDates(formattedDates);
        } else {
          setEditedInterviewDates([]);
        }

        // URL에 edit=true가 있으면 수정 모드로 전환
        if (searchParams.get('edit') === 'true' && userData?.role === 'admin') {
          setIsEditing(true);
        }
      } catch (error) {
        console.error('공고 정보 로드 오류:', error);
        toast.error('공고 정보를 불러오는 중 오류가 발생했습니다.');
        router.push('/job-board');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id, router, searchParams, userData?.role]);

  // 동적 메타데이터 설정을 위한 useEffect 추가
  useEffect(() => {
    if (jobBoard) {
      document.title = `${jobBoard.title} | SMIS 멘토 채용 플랫폼`;
      
      // 기존 메타 태그 제거
      const existingDescription = document.querySelector('meta[name="description"]');
      if (existingDescription) {
        existingDescription.remove();
      }
      
      // 새로운 메타 태그 추가
      const metaDescription = document.createElement('meta');
      metaDescription.name = 'description';
      metaDescription.content = jobBoard.description?.slice(0, 100) || 'SMIS 멘토 채용 플랫폼 채용공고';
      document.head.appendChild(metaDescription);
    }
  }, [jobBoard]);

  // 기수 선택 핸들러
  const handleGenerationChange = (generation: string) => {
    setSelectedGeneration(generation);
    const filtered = jobCodes.filter(code => code.generation === generation);
    setFilteredJobCodes(filtered);
    setEditedJobCodeId('');
    setJobCode(null);
  };

  // 업무 코드 선택 핸들러
  const handleJobCodeChange = async (jobCodeId: string) => {
    setEditedJobCodeId(jobCodeId);
    if (jobCodeId) {
      const selectedJobCode = await getJobCodeById(jobCodeId);
      setJobCode(selectedJobCode);
    } else {
      setJobCode(null);
    }
  };

  const handleSave = async () => {
    if (!jobBoard || !jobCode) return;

    try {
      const docRef = doc(db, 'jobBoards', id);
      await updateDoc(docRef, {
        title: editedTitle,
        description: editedDescription,
        status: editedStatus,
        refJobCodeId: editedJobCodeId,
        generation: jobCode.generation,
        jobCode: jobCode.code,
        interviewDates: editedInterviewDates
          .filter(date => date.start && date.end)
          .map(date => ({
            start: Timestamp.fromDate(new Date(date.start)),
            end: Timestamp.fromDate(new Date(date.end))
          })),
        interviewBaseDuration: Number(editedInterviewBaseDuration) || 30,
        interviewBaseLink: editedInterviewBaseLink || '',
        interviewBaseNotes: editedInterviewBaseNotes || '',
        interviewPassword: jobBoard.interviewPassword || '',
        educationStartDate: jobCode.startDate,
        educationEndDate: jobCode.endDate,
        updatedAt: Timestamp.now()
      });

      const updatedDocSnap = await getDoc(docRef);
      if (updatedDocSnap.exists()) {
        const data = updatedDocSnap.data();
        setJobBoard({ id: updatedDocSnap.id, ...data } as JobBoardWithId);
      }
      
      setIsEditing(false);
      toast.success('공고가 수정되었습니다.');
      
      // URL에서 edit 파라미터 제거
      router.replace(`/job-board/${id}`);
    } catch (error) {
      console.error('공고 수정 오류:', error);
      toast.error('공고 수정 중 오류가 발생했습니다.');
    }
  };

  const handleDelete = async () => {
    if (!jobBoard || !confirm('정말로 이 공고를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

    try {
      setIsLoading(true);
      await deleteJobBoard(jobBoard.id);
      toast.success('공고가 성공적으로 삭제되었습니다.');
      router.push('/admin/job-board-write');
    } catch (error) {
      console.error('공고 삭제 오류:', error);
      toast.error('공고 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (jobBoard) {
      setEditedTitle(jobBoard.title);
      setEditedStatus(jobBoard.status);
      setEditedDescription(jobBoard.description);
      setEditedJobCodeId(jobBoard.refJobCodeId);
      
      // 면접 기본정보 초기화
      setEditedInterviewBaseLink(jobBoard.interviewBaseLink || '');
      setEditedInterviewBaseDuration(jobBoard.interviewBaseDuration || 30);
      setEditedInterviewBaseNotes(jobBoard.interviewBaseNotes || '');
      
      // interviewDates 초기화
      if (jobBoard.interviewDates && Array.isArray(jobBoard.interviewDates)) {
        const formattedDates = jobBoard.interviewDates
          .filter(date => date && date.start && date.end)
          .map(date => {
            try {
              const startDate = date.start instanceof Timestamp ? 
                date.start.toDate() : 
                new Date(date.start);
              
              const endDate = date.end instanceof Timestamp ? 
                date.end.toDate() : 
                new Date(date.end);

              // 날짜 및 시간을 로컬 시간대 기준으로 포맷팅 (YYYY-MM-DDTHH:MM 형식)
              const padZero = (num: number) => String(num).padStart(2, '0');
              
              const startYear = startDate.getFullYear();
              const startMonth = padZero(startDate.getMonth() + 1);
              const startDay = padZero(startDate.getDate());
              const startHours = padZero(startDate.getHours());
              const startMinutes = padZero(startDate.getMinutes());
              
              const endYear = endDate.getFullYear();
              const endMonth = padZero(endDate.getMonth() + 1);
              const endDay = padZero(endDate.getDate());
              const endHours = padZero(endDate.getHours());
              const endMinutes = padZero(endDate.getMinutes());

              return {
                start: `${startYear}-${startMonth}-${startDay}T${startHours}:${startMinutes}`,
                end: `${endYear}-${endMonth}-${endDay}T${endHours}:${endMinutes}`
              };
            } catch (error) {
              console.error('날짜 변환 오류:', error);
              return null;
            }
          })
          .filter(date => date !== null);

        setEditedInterviewDates(formattedDates);
      } else {
        setEditedInterviewDates([]);
      }
    }
    router.replace(`/job-board/${id}`);
  };

  const handleApply = async () => {
    if (!userData || !jobBoard) {
      toast.error('로그인이 필요합니다.');
      router.push('/sign-in');
      return;
    }

    // 프로필 이미지 확인
    if (!userData.profileImage) {
      setProfileErrorType('image');
      setIsProfileErrorModalOpen(true);
      return;
    }

    // 자기소개서 확인
    if (!userData.selfIntroduction) {
      setProfileErrorType('selfIntro');
      setIsProfileErrorModalOpen(true);
      return;
    }

    // 지원동기 확인
    if (!userData.jobMotivation) {
      setProfileErrorType('jobMotivation');
      setIsProfileErrorModalOpen(true);
      return;
    }

    // 확인 모달 열기
    setIsConfirmModalOpen(true);
  };

  const confirmApply = async () => {
    if (!userData || !jobBoard) return;

    try {
      setIsSubmitting(true);

      const now = Timestamp.now();
      
      // applicationData 기본 데이터 설정
      const applicationData: Partial<Omit<ApplicationHistory, 'applicationHistoryId' | 'applicationDate'>> = {
        refJobBoardId: jobBoard.id,
        refUserId: userData.userId,
        applicationStatus: 'pending',
        createdAt: now,
        updatedAt: now
      };

      // 면접 일정이 선택된 경우에만 interviewDate 필드 추가
      if (selectedInterviewDate) {
        const [startMillis] = selectedInterviewDate.split('-').map(Number);
        applicationData.interviewDate = new Timestamp(Math.floor(startMillis / 1000), 0);
      }
      
      await createApplication(applicationData as Omit<ApplicationHistory, 'applicationHistoryId' | 'applicationDate'>);

      setIsConfirmModalOpen(false);
      toast.success('지원이 완료되었습니다.');
      router.push('/profile/job-apply');
    } catch (error) {
      console.error('지원 오류:', error);
      toast.error('지원 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoBack = () => {
    router.back();
  };

  return (
    <Layout>
      <div className="container mx-auto px-0 sm:px-6 lg:px-8">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
          </div>
        ) : !jobBoard ? (
          <div className="text-center py-20">
            <p className="text-gray-500">공고를 찾을 수 없습니다.</p>
            <Button 
              variant="secondary" 
              className="mt-4"
              onClick={() => router.push('/job-board')}
            >
              공고 목록으로 돌아가기
            </Button>
          </div>
        ) : (
          <div className="bg-white overflow-hidden">
            <div className="p-4 sm:p-6">
              {isEditing ? (
                <div className="space-y-6">
                  <div className="mb-6">
                    <h2 className="text-xl font-bold mb-4">공고 수정</h2>
                    
                    {/* 기수 및 업무 선택 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-gray-700 text-sm font-medium mb-2">기수 선택</label>
                        <select
                          value={selectedGeneration}
                          onChange={(e) => handleGenerationChange(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {Array.from(new Set(jobCodes.map(code => code.generation)))
                            .sort((a, b) => {
                              const numA = parseInt(a.replace(/\D/g, ''));
                              const numB = parseInt(b.replace(/\D/g, ''));
                              return numB - numA;
                            })
                            .map((generation) => (
                              <option key={generation} value={generation}>
                                {generation}
                              </option>
                            ))
                          }
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-gray-700 text-sm font-medium mb-2">업무 선택</label>
                        <select
                          value={editedJobCodeId}
                          onChange={(e) => handleJobCodeChange(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">업무를 선택해주세요</option>
                          {filteredJobCodes.map((code) => (
                            <option key={code.id} value={code.id}>
                              {code.code} - {code.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* 선택된 업무 정보 */}
                    {jobCode && (
                      <div className="mb-4 p-3 bg-gray-50 rounded-md">
                        <h3 className="font-medium text-gray-700 mb-2">선택된 업무 정보</h3>
                        <p><span className="font-medium">기수:</span> {jobCode.generation}</p>
                        <p><span className="font-medium">코드:</span> {jobCode.code}</p>
                        <p><span className="font-medium">이름:</span> {jobCode.name}</p>
                        <p><span className="font-medium">기간:</span> {formatDateOnly(jobCode.startDate)} ~ {formatDateOnly(jobCode.endDate)}</p>
                        <p><span className="font-medium">위치:</span> {jobCode.location}</p>
                        <div>
                          <p className="font-medium">교육 날짜:</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {jobCode.eduDates.map((date, index) => (
                              <span key={index} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded">
                                {formatDateOnly(date)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 공고 제목 및 상태 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <FormInput
                        label="공고 제목"
                        type="text"
                        value={editedTitle}
                        onChange={(e) => setEditedTitle(e.target.value)}
                        placeholder="공고 제목을 입력하세요"
                      />

                      <div>
                        <label className="block text-gray-700 text-sm font-medium mb-2">공고 상태</label>
                        <select
                          value={editedStatus}
                          onChange={(e) => setEditedStatus(e.target.value as 'active' | 'closed')}
                          className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="active">모집중</option>
                          <option value="closed">마감</option>
                        </select>
                      </div>
                    </div>

                    {/* 공고 내용 */}
                    <div className="mb-4">
                      <label className="block text-gray-700 text-sm font-medium mb-2">공고 내용</label>
                      <RichTextEditor
                        content={editedDescription}
                        onChange={setEditedDescription}
                      />
                    </div>

                    {/* 면접 일정 */}
                    <div>
                      <h3 className="text-lg font-medium mb-2">면접 일정</h3>
                      {editedInterviewDates.map((date, index) => (
                        <div key={index} className="flex gap-2 mb-2">
                          <input
                            type="datetime-local"
                            value={date.start}
                            onChange={(e) => {
                              const newDates = [...editedInterviewDates];
                              newDates[index] = { ...newDates[index], start: e.target.value };
                              setEditedInterviewDates(newDates);
                            }}
                            className="border rounded px-2 py-1"
                          />
                          <span className="self-center">~</span>
                          <input
                            type="datetime-local"
                            value={date.end}
                            onChange={(e) => {
                              const newDates = [...editedInterviewDates];
                              newDates[index] = { ...newDates[index], end: e.target.value };
                              setEditedInterviewDates(newDates);
                            }}
                            className="border rounded px-2 py-1"
                          />
                          <Button
                            variant="danger"
                            onClick={() => {
                              const newDates = editedInterviewDates.filter((_, i) => i !== index);
                              setEditedInterviewDates(newDates);
                            }}
                          >
                            삭제
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setEditedInterviewDates([
                            ...editedInterviewDates,
                            { start: '', end: '' }
                          ]);
                        }}
                        className="mt-2"
                      >
                        면접 일정 추가
                      </Button>
                    </div>

                    {/* 면접 정보 */}
                    <div className="mt-6">
                      <h3 className="text-lg font-medium mb-4">면접 정보</h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            면접 링크
                          </label>
                          <input
                            type="text"
                            value={editedInterviewBaseLink}
                            onChange={(e) => setEditedInterviewBaseLink(e.target.value)}
                            className="w-full p-2 border rounded"
                            placeholder="https://zoom.us/j/..."
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            면접 시간 (분)
                          </label>
                          <input
                            type="number"
                            value={editedInterviewBaseDuration}
                            onChange={(e) => setEditedInterviewBaseDuration(Number(e.target.value))}
                            className="w-full p-2 border rounded"
                            placeholder="30"
                          />
                        </div>
                      </div>

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          면접 안내사항
                        </label>
                        <textarea
                          value={editedInterviewBaseNotes}
                          onChange={(e) => setEditedInterviewBaseNotes(e.target.value)}
                          rows={3}
                          className="w-full p-2 border rounded"
                          placeholder="면접 준비사항 등을 입력하세요..."
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 mt-6">
                      <Button variant="secondary" onClick={handleCancel}>
                        취소
                      </Button>
                      <Button variant="primary" onClick={handleSave}>
                        저장
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* 공고 헤더 */}
                  <div className="flex items-center justify-between mb-6 pb-6 border-b border-gray-200">
                    <div className="flex items-center">
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mr-3 text-blue-600 hover:text-blue-800 border-none shadow-none"
                        onClick={handleGoBack}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                      </Button>
                      <h1 className="text-lg font-semibold text-gray-900">{jobBoard.generation} {jobBoard.title}</h1>
                    </div>
                  </div>

                  {/* 캠프 정보 */}
                  {jobCode && (
                    <div className="mb-8 p-4 bg-gray-50 rounded-lg">
                      <h2 className="text-lg font-semibold text-gray-900 mb-4">캠프 정보</h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-600 mb-1">캠프 이름</p>
                          <p className="font-medium">{jobCode.name}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600 mb-1">캠프 위치</p>
                          <p className="font-medium">{jobCode.location}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600 mb-1">캠프 기간</p>
                          <p className="font-medium">
                            {formatDateOnly(jobCode.startDate)} ~ {formatDateOnly(jobCode.endDate)}
                          </p>
                        </div>
                        <div className="sm:col-span-2">
                          <p className="text-sm text-gray-600 mb-1">교육 일정</p>
                          <div className="flex flex-wrap gap-2">
                            {jobCode.eduDates.map((date, index) => (
                              <span 
                                key={index}
                                className="inline-block px-2 py-1 bg-blue-50 text-blue-700 text-sm rounded"
                              >
                                {formatDateOnly(date)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 공고 본문 */}
                  <div className="mb-8">
                    <div
                      className="prose prose-slate max-w-none [&>h1]:text-4xl [&>h1]:font-bold [&>h1]:mb-4 [&>h2]:text-3xl [&>h2]:font-bold [&>h2]:mb-3 [&>h3]:text-2xl [&>h3]:font-bold [&>h3]:mb-2 [&>p]:whitespace-pre-wrap [&>p:empty]:h-[1em] [&>p:empty]:block [&>p]:min-h-[1.5em] [&>ul]:list-disc [&>ul]:pl-[1.625em] [&>ol]:list-decimal [&>ol]:pl-[1.625em]"
                      dangerouslySetInnerHTML={{ __html: jobBoard.description }}
                    />
                  </div>

                  {/* 면접 일정 */}
                  {jobBoard.interviewDates && Array.isArray(jobBoard.interviewDates) && jobBoard.interviewDates.length > 0 && (
                    <div className="mb-8">
                      <h2 className="text-lg font-semibold text-gray-900 mb-4">면접 일정 선택</h2>
                      <div className="grid grid-cols-1 gap-2">
                        {jobBoard.interviewDates
                          .filter(date => date && date.start && date.end)
                          .map((date, index) => {
                            try {
                              const startDate = date.start instanceof Timestamp ? 
                                date.start : 
                                Timestamp.fromDate(new Date(date.start));
                              
                              const endDate = date.end instanceof Timestamp ? 
                                date.end : 
                                Timestamp.fromDate(new Date(date.end));

                              const dateKey = `${startDate.toMillis()}-${endDate.toMillis()}`;
                              
                              return (
                                <div 
                                  key={index}
                                  className={`p-3 border rounded-lg transition-colors cursor-pointer ${
                                    selectedInterviewDate === dateKey
                                      ? 'bg-blue-50 border-blue-500'
                                      : 'hover:bg-gray-50'
                                  }`}
                                  onClick={() => setSelectedInterviewDate(dateKey)}
                                >
                                  <div className="flex items-center gap-3">
                                    <input
                                      type="radio"
                                      name="interviewDate"
                                      checked={selectedInterviewDate === dateKey}
                                      onChange={() => setSelectedInterviewDate(dateKey)}
                                      className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                                    />
                                    <div>
                                      <p className="font-medium">
                                        {formatDateTime(startDate)} ~ {formatDateTime(endDate)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              );
                            } catch (error) {
                              console.error('날짜 렌더링 오류:', error);
                              return null;
                            }
                          })
                          .filter(Boolean)}
                      </div>
                      
                      {/* 모든 일정 참석 불가능한 지원자를 위한 안내 */}
                      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <div className="flex items-start">
                          <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div className="ml-3">
                            <h3 className="text-sm font-medium text-yellow-800">모든 면접 일정에 참석할 수 없을 시</h3>
                            <div className="mt-2 text-sm text-yellow-700">
                              <p>지원하기 버튼 클릭 후 상기 지원 문의 번호로 카카오톡&문자 전송 후 별도로 면접 일정 조율</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 지원하기 섹션 */}
                  <div className="flex justify-center w-full mt-6">
                    <Button
                      variant="primary"
                      onClick={handleApply}
                      disabled={isSubmitting}
                      className="w-full py-3 bg-blue-300 hover:bg-blue-400"
                    >
                      {isSubmitting ? '지원 중...' : '지원하기'}
                    </Button>
                  </div>
                  
                  {/* 확인 모달 */}
                  {isConfirmModalOpen && (
                    <div className="fixed inset-0 bg-black/0 flex items-center justify-center z-50 p-4">
                      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">지원 확인</h3>
                        {!selectedInterviewDate ? (
                          <p className="text-gray-700 mb-4">면접 일정을 선택하지 않았습니다. 담당자에게 별도로 연락하여 면접 일정을 조율해 주세요</p>
                        ) : (
                          <p className="text-gray-700 mb-4"></p>
                        )}
                        <p className="text-gray-700 mb-6">정말 지원하시겠습니까? 서류전형 합/불 여부가 결정되면 지원을 취소할 수 없습니다</p>
                        <div className="flex justify-end gap-3">
                          <Button
                            variant="outline"
                            onClick={() => setIsConfirmModalOpen(false)}
                          >
                            취소
                          </Button>
                          <Button
                            variant="primary"
                            onClick={confirmApply}
                            isLoading={isSubmitting}
                          >
                            예
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* 프로필 정보 오류 모달 */}
                  {isProfileErrorModalOpen && (
                    <div className="fixed inset-0 bg-black bg-black/0 flex items-center justify-center z-50 p-4">
                      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                          {profileErrorType === 'image' 
                            ? '프로필 이미지가 필요합니다' 
                            : profileErrorType === 'selfIntro' 
                              ? '자기소개서가 필요합니다' 
                              : '지원 동기가 필요합니다'}
                        </h3>
                        <p className="text-gray-700 mb-6">
                          {profileErrorType === 'image' 
                            ? '지원하기 전에 프로필 이미지를 업로드해주세요.' 
                            : profileErrorType === 'selfIntro' 
                              ? '지원하기 전에 자기소개서를 작성해주세요.' 
                              : '지원하기 전에 지원 동기를 작성해주세요.'}
                        </p>
                        <div className="flex justify-end gap-3">
                          <Button
                            variant="outline"
                            onClick={() => setIsProfileErrorModalOpen(false)}
                          >
                            닫기
                          </Button>
                          <Button
                            variant="primary"
                            onClick={() => router.push('/profile/edit')}
                          >
                            내 정보 수정하기
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {userData && jobBoard.status === 'active' && (
                    <div className="mt-4 pt-8">
                      <div className="mb-6">
                        {/* <h2 className="text-lg font-semibold text-gray-900 mb-2">지원하기</h2> */}
                        <div className="bg-blue-50 p-4 rounded-lg mb-6">
                          <div className="flex items-start">
                            <div className="flex-shrink-0">
                              <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <div className="ml-3">
                              <h3 className="text-sm font-medium text-blue-800">지원 전 확인사항</h3>
                              <div className="mt-2 text-sm text-blue-700">
                                <p className="mb-1">• <button onClick={() => router.push('/profile')} className="text-green-600 hover:text-green-800 font-medium">내 정보</button>에서 프로필 이미지 업로드, 자기소개서 & 지원동기를 작성해주세요.</p>
                                <p className="mb-1">• 면접 일정을 반드시 선택해주세요.</p>
                                <p>• 지원 후에는 <button onClick={() => router.push('/profile/job-apply')} className="text-green-600 hover:text-green-800 font-medium">지원 현황</button>에서 진행 상태를 확인할 수 있습니다.</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {!userData.selfIntroduction || !userData.jobMotivation ? (
                          <div className="text-center py-6 bg-gray-50 rounded-lg">
                            <p className="text-gray-600 mb-4">지원하기 전에 자기소개서와 지원동기를 작성해주세요.</p>
                            <Button
                              variant="primary"
                              onClick={() => router.push('/profile')}
                            >
                              내 정보 작성하기
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-6">
                            <div>
                              <h3 className="text-sm font-medium text-gray-900 mb-2">자기소개서 미리보기</h3>
                              <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-line text-sm text-gray-700">
                                {userData.selfIntroduction}
                              </div>
                            </div>
                            <div>
                              <h3 className="text-sm font-medium text-gray-900 mb-2">지원동기 미리보기</h3>
                              <div className="bg-gray-50 p-4 rounded-lg whitespace-pre-line text-sm text-gray-700">
                                {userData.jobMotivation}
                              </div>
                            </div>
                        
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!userData && jobBoard.status === 'active' && (
                    <div className="mt-8 pt-8 border-t border-gray-200">
                      <div className="text-center py-8 bg-gray-50 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                        <h3 className="text-lg font-medium text-gray-900 mb-2">지원하려면 로그인이 필요합니다</h3>
                        <p className="text-gray-600 mb-6">
                          로그인 후 이 공고에 지원할 수 있습니다.<br />
                          아직 회원이 아니신가요? 가입 후 멘토로 활동해보세요!
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                          <Button
                            variant="primary"
                            onClick={() => router.push('/sign-in')}
                          >
                            로그인하기
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => router.push('/sign-up')}
                          >
                            회원가입하기
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {userData?.role === 'admin' && (
                    <div className="mt-8 pt-6 border-t border-gray-200">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="success"
                          onClick={() => setIsEditing(true)}
                          className="px-4"
                        >
                          수정
                        </Button>
                        <Button
                          variant="danger"
                          onClick={handleDelete}
                          className="px-4"
                        >
                          삭제
                        </Button>
                        {jobBoard.status === 'active' ? (
                          <Button
                            variant="danger-dark"
                            onClick={() => router.push(`/admin/job-board-manage?close=${id}`)}
                            className="px-4"
                          >
                            공고 마감
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            onClick={() => router.push(`/admin/job-board-manage?activate=${id}`)}
                            className="px-4"
                          >
                            공고 활성화
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
} 