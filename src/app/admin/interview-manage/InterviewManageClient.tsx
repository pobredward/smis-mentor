'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { JobBoard, ApplicationHistory, User } from '@/types';

type JobBoardWithId = JobBoard & { id: string };

type InterviewDateInfo = {
  jobBoardId: string;
  jobBoardTitle: string;
  date: Date;
  formattedDate: string;
  interviews: ApplicationWithUser[];
};

type ApplicationWithUser = ApplicationHistory & { 
  id: string;
  user?: User;
  jobBoardTitle?: string;
};

export function InterviewManageClient() {
  const [jobBoards, setJobBoards] = useState<JobBoardWithId[]>([]);
  const [interviewDates, setInterviewDates] = useState<InterviewDateInfo[]>([]);
  const [selectedDate, setSelectedDate] = useState<InterviewDateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationWithUser | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [interviewTime, setInterviewTime] = useState('');
  const [newSelectedDate, setNewSelectedDate] = useState('');
  
  // 데이터 로드
  useEffect(() => {
    loadJobBoards();
  }, []);

  // 채용 공고 목록 로드
  const loadJobBoards = async () => {
    try {
      setLoading(true);
      const jobBoardsRef = collection(db, 'jobBoards');
      const jobBoardsQuery = query(jobBoardsRef, where('status', '==', 'active'));
      const jobBoardsSnapshot = await getDocs(jobBoardsQuery);
      
      const jobBoardsData = jobBoardsSnapshot.docs.map(doc => ({
        ...doc.data() as JobBoard,
        id: doc.id
      }));

      setJobBoards(jobBoardsData);
      
      // 면접 일정 정보 로드
      await loadInterviewDates(jobBoardsData);
    } catch (error) {
      console.error('채용 공고 로드 오류:', error);
      toast.error('채용 공고를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 모든 면접 일정 로드
  const loadInterviewDates = async (jobBoardsData: JobBoardWithId[]) => {
    try {
      const interviewDateMap = new Map<string, InterviewDateInfo>();
      
      // '미정' 날짜를 위한 객체 생성
      const undefinedDateKey = 'undefined-date';
      interviewDateMap.set(undefinedDateKey, {
        jobBoardId: 'undefined',
        jobBoardTitle: '날짜 미정',
        date: new Date(),
        formattedDate: '날짜 미정',
        interviews: []
      });
      
      // 모든 면접 예정인 지원자 가져오기 (한 번의 쿼리로)
      const applicationsRef = collection(db, 'applicationHistories');
      const q = query(
        applicationsRef, 
        where('applicationStatus', '==', 'accepted')
      );
      
      const applicationsSnapshot = await getDocs(q);
      const applications = await Promise.all(
        applicationsSnapshot.docs.map(async (docSnapshot) => {
          const data = docSnapshot.data() as ApplicationHistory;
          
          // 채용 공고 ID 확인
          const jobBoard = jobBoardsData.find(jb => jb.id === data.refJobBoardId);
          if (!jobBoard) return null;
          
          // 사용자 정보 가져오기
          const userRef = doc(db, 'users', data.refUserId);
          const userDoc = await getDoc(userRef);
          const userData = userDoc.exists() ? userDoc.data() as User : undefined;
          
          return {
            ...data,
            id: docSnapshot.id,
            user: userData ? { ...userData, id: userDoc.id } : undefined,
            jobBoardTitle: jobBoard.title
          } as ApplicationWithUser & { jobBoardTitle: string };
        })
      );
      
      // null 값 제거
      const validApplications = applications
        .filter(app => app !== null) as (ApplicationWithUser & { jobBoardTitle: string })[];
      
      // 각 지원자의 면접일을 기준으로 그룹화
      for (const app of validApplications) {
        if (app.interviewDate) {
          // 면접일이 있는 경우
          const date = app.interviewDate.toDate();
          const dateKey = format(date, 'yyyy-MM-dd');
          const formattedDate = format(date, 'yyyy년 MM월 dd일 (eee)', { locale: ko });
          
          // 해당 날짜에 대한 면접 일정 정보가 없으면 새로 생성
          if (!interviewDateMap.has(dateKey)) {
            interviewDateMap.set(dateKey, {
              jobBoardId: app.refJobBoardId,
              jobBoardTitle: app.jobBoardTitle || '',
              date,
              formattedDate,
              interviews: []
            });
          }
          
          // 지원자 추가
          const dateInfo = interviewDateMap.get(dateKey)!;
          dateInfo.interviews.push(app);
        } else {
          // 면접일이 없는 경우 '미정' 그룹에 추가
          const undefinedDateInfo = interviewDateMap.get(undefinedDateKey)!;
          undefinedDateInfo.interviews.push(app);
        }
      }
      
      // 각 그룹 내에서 면접 시간순으로 정렬
      for (const [key, dateInfo] of interviewDateMap.entries()) {
        if (key !== undefinedDateKey) {
          dateInfo.interviews.sort((a, b) => {
            const timeA = a.interviewDate!.toDate().getTime();
            const timeB = b.interviewDate!.toDate().getTime();
            return timeA - timeB;
          });
        }
      }
      
      // 미정 그룹에 지원자가 없는 경우 제거
      if (interviewDateMap.get(undefinedDateKey)!.interviews.length === 0) {
        interviewDateMap.delete(undefinedDateKey);
      }
      
      // Map을 배열로 변환
      const interviewDatesInfo = Array.from(interviewDateMap.values());
      
      // 날짜 기준 오름차순 정렬 (미정은 항상 마지막)
      interviewDatesInfo.sort((a, b) => {
        if (a.formattedDate === '날짜 미정') return 1;
        if (b.formattedDate === '날짜 미정') return -1;
        return a.date.getTime() - b.date.getTime();
      });
      
      setInterviewDates(interviewDatesInfo);
    } catch (error) {
      console.error('면접 일정 로드 오류:', error);
      toast.error('면접 일정을 불러오는 중 오류가 발생했습니다.');
    }
  };

  // 지원자 선택
  const handleSelectApplication = (app: ApplicationWithUser) => {
    setSelectedApplication(app);
    setFeedbackText(app.interviewFeedback || '');
    
    if (app.interviewDate) {
      const time = format(app.interviewDate.toDate(), 'HH:mm');
      setInterviewTime(time);
      setNewSelectedDate(format(app.interviewDate.toDate(), 'yyyy-MM-dd'));
    } else {
      setInterviewTime('');
      setNewSelectedDate('');
    }
  };

  // 면접일 선택
  const handleSelectDate = (dateInfo: InterviewDateInfo) => {
    setSelectedDate(dateInfo);
    setSelectedApplication(null);
    setFeedbackText('');
  };

  // 면접 상태 변경
  const handleInterviewStatusChange = async (applicationId: string, newStatus: string) => {
    if (!selectedApplication) return;

    try {
      setLoading(true);
      const applicationRef = doc(db, 'applicationHistories', applicationId);
      
      // 현재 상태 확인
      const applicationDoc = await getDoc(applicationRef);
      const currentData = applicationDoc.data();
      
      // 상태 업데이트
      const updateData: Partial<ApplicationHistory> = {
        interviewStatus: newStatus as ApplicationHistory['interviewStatus'],
        updatedAt: Timestamp.fromDate(new Date())
      };
      
      // 처음 상태를 설정하는 경우 기본값도 함께 설정
      if (!currentData?.interviewStatus) {
        updateData.interviewBaseLink = '';
        updateData.interviewBaseDuration = 30;
        updateData.interviewBaseNotes = '';
      }
      
      await updateDoc(applicationRef, updateData);

      toast.success('면접 상태가 변경되었습니다.');
      
      // UI 업데이트
      if (selectedDate) {
        const updatedInterviews = selectedDate.interviews.map(interview => {
          if (interview.id === selectedApplication.id) {
            return { 
              ...interview, 
              interviewStatus: newStatus as ApplicationHistory['interviewStatus']
            };
          }
          return interview;
        });
        
        setSelectedDate({
          ...selectedDate,
          interviews: updatedInterviews
        });
        
        // 선택된 지원자 정보도 업데이트
        setSelectedApplication({
          ...selectedApplication,
          interviewStatus: newStatus as ApplicationHistory['interviewStatus']
        });
      }
      
    } catch (error) {
      console.error('면접 상태 변경 오류:', error);
      toast.error('면접 상태를 변경하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 피드백 저장
  const handleSaveFeedback = async () => {
    if (!selectedApplication) return;

    try {
      setLoading(true);
      const applicationRef = doc(db, 'applicationHistories', selectedApplication.id);
      
      await updateDoc(applicationRef, {
        interviewFeedback: feedbackText,
        updatedAt: Timestamp.fromDate(new Date())
      });

      toast.success('면접 피드백이 저장되었습니다.');
      
      // UI 업데이트
      if (selectedDate) {
        const updatedInterviews = selectedDate.interviews.map(interview => {
          if (interview.id === selectedApplication.id) {
            return { ...interview, interviewFeedback: feedbackText };
          }
          return interview;
        });
        
        setSelectedDate({
          ...selectedDate,
          interviews: updatedInterviews
        });
        
        // 선택된 지원자 정보도 업데이트
        setSelectedApplication({
          ...selectedApplication,
          interviewFeedback: feedbackText
        });
      }
      
    } catch (error) {
      console.error('피드백 저장 오류:', error);
      toast.error('면접 피드백을 저장하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 면접 시간 변경
  const handleChangeInterviewTime = async () => {
    if (!selectedApplication || !selectedDate) return;
    
    // 날짜와 시간 모두 필요
    if (!newSelectedDate) {
      toast.error('날짜를 입력해주세요.');
      return;
    }
    if (!interviewTime) {
      toast.error('시간을 입력해주세요.');
      return;
    }

    try {
      setLoading(true);
      
      // 새 날짜 + 시간 결합
      const timeValue = interviewTime;
      const dateTimeStr = `${newSelectedDate}T${timeValue}:00`;
      const dateTimeObj = new Date(dateTimeStr);
      
      const applicationRef = doc(db, 'applicationHistories', selectedApplication.id);
      
      await updateDoc(applicationRef, {
        interviewDate: Timestamp.fromDate(dateTimeObj),
        updatedAt: Timestamp.fromDate(new Date())
      });

      toast.success('면접 시간이 변경되었습니다.');
      
      // 새로운 날짜 정보 생성
      const newDateKey = format(dateTimeObj, 'yyyy-MM-dd');
      const formattedNewDate = format(dateTimeObj, 'yyyy년 MM월 dd일 (eee)', { locale: ko });
      
      // 현재 날짜의 interviews 배열에서 해당 지원자 제거
      const currentDateInterviews = selectedDate.interviews.filter(
        interview => interview.id !== selectedApplication.id
      );

      // 같은 날짜인지 확인
      const isSameDate = format(selectedDate.date, 'yyyy-MM-dd') === newDateKey;
      
      if (isSameDate) {
        // 같은 날짜인 경우, 현재 날짜의 interviews 배열에 업데이트된 지원자 정보 추가
        const updatedApplication = {
          ...selectedApplication,
          interviewDate: Timestamp.fromDate(dateTimeObj)
        };
        
        const updatedInterviews = [...currentDateInterviews, updatedApplication];
        updatedInterviews.sort((a, b) => {
          const timeA = a.interviewDate!.toDate().getTime();
          const timeB = b.interviewDate!.toDate().getTime();
          return timeA - timeB;
        });
        
        const updatedDateInfo = {
          ...selectedDate,
          interviews: updatedInterviews
        };
        
        // interviewDates 상태 업데이트
        const updatedInterviewDates = interviewDates.map(dateInfo => 
          format(dateInfo.date, 'yyyy-MM-dd') === newDateKey ? updatedDateInfo : dateInfo
        );
        
        setInterviewDates(updatedInterviewDates);
        setSelectedDate(updatedDateInfo);
        setSelectedApplication(updatedApplication);
      } else {
        // 다른 날짜로 변경하는 경우, 기존 로직 사용
        // 새 날짜의 interviews 배열 찾기 또는 생성
        let newDateInfo = interviewDates.find(
          date => format(date.date, 'yyyy-MM-dd') === newDateKey
        );
        
        if (!newDateInfo) {
          // 새 날짜 정보 생성
          newDateInfo = {
            jobBoardId: selectedApplication.refJobBoardId,
            jobBoardTitle: selectedApplication.jobBoardTitle || '',
            date: dateTimeObj,
            formattedDate: formattedNewDate,
            interviews: []
          };
        }
        
        // 업데이트된 지원자 정보
        const updatedApplication = {
          ...selectedApplication,
          interviewDate: Timestamp.fromDate(dateTimeObj)
        };
        
        // 새 날짜의 interviews 배열에 지원자 추가
        const newDateInterviews = [...(newDateInfo.interviews || []), updatedApplication];
        newDateInterviews.sort((a, b) => {
          const timeA = a.interviewDate!.toDate().getTime();
          const timeB = b.interviewDate!.toDate().getTime();
          return timeA - timeB;
        });
        
        // interviewDates 상태 업데이트
        let updatedInterviewDates = interviewDates
          .filter(dateInfo => {
            // 현재 날짜에서 지원자 제거 후 인터뷰가 없으면 해당 날짜 제거
            if (format(dateInfo.date, 'yyyy-MM-dd') === format(selectedDate.date, 'yyyy-MM-dd')) {
              return currentDateInterviews.length > 0;
            }
            // 새 날짜가 아닌 다른 날짜들은 유지
            return format(dateInfo.date, 'yyyy-MM-dd') !== newDateKey;
          })
          .map(dateInfo => {
            // 현재 날짜의 interviews 업데이트
            if (format(dateInfo.date, 'yyyy-MM-dd') === format(selectedDate.date, 'yyyy-MM-dd')) {
              return { ...dateInfo, interviews: currentDateInterviews };
            }
            return dateInfo;
          });

        // 새 날짜 정보 추가
        updatedInterviewDates = [
          ...updatedInterviewDates,
          {
            ...newDateInfo,
            interviews: newDateInterviews
          }
        ];
        
        // 날짜순 정렬
        updatedInterviewDates.sort((a, b) => {
          if (a.formattedDate === '날짜 미정') return 1;
          if (b.formattedDate === '날짜 미정') return -1;
          return a.date.getTime() - b.date.getTime();
        });
        
        // 상태 업데이트
        setInterviewDates(updatedInterviewDates);
        
        // 새 날짜 정보로 선택 상태 업데이트
        const newDateInfoFinal = {
          jobBoardId: selectedApplication.refJobBoardId,
          jobBoardTitle: selectedApplication.jobBoardTitle || '',
          date: dateTimeObj,
          formattedDate: formattedNewDate,
          interviews: newDateInterviews
        };
        
        setSelectedDate(newDateInfoFinal);
        setSelectedApplication(updatedApplication);
      }
      
    } catch (error) {
      console.error('면접 시간 변경 오류:', error);
      toast.error('면접 시간을 변경하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 면접 시간을 미정으로 변경
  const handleSetUndefinedTime = async () => {
    if (!selectedApplication) return;

    try {
      setLoading(true);
      
      const applicationRef = doc(db, 'applicationHistories', selectedApplication.id);
      
      await updateDoc(applicationRef, {
        interviewDate: null,
        updatedAt: Timestamp.fromDate(new Date())
      });

      toast.success('면접 시간이 미정으로 변경되었습니다.');
      
      // 페이지 새로고침
      await loadJobBoards();
      
      // 선택 초기화
      setSelectedApplication(null);
      setSelectedDate(null);
      setNewSelectedDate('');
      setInterviewTime('');
      
    } catch (error) {
      console.error('면접 시간 변경 오류:', error);
      toast.error('면접 시간을 변경하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 전화번호에 하이픈 추가 함수
  const formatPhoneNumber = (phoneNumber: string) => {
    if (!phoneNumber) return '';
    
    // 전화번호가 10자리인 경우와 11자리인 경우를 구분
    if (phoneNumber.length === 10) {
      return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6)}`;
    } else if (phoneNumber.length === 11) {
      return `${phoneNumber.slice(0, 3)}-${phoneNumber.slice(3, 7)}-${phoneNumber.slice(7)}`;
    }
    
    // 그 외 경우는 원래 형식 반환
    return phoneNumber;
  };

  return (
    <Layout requireAuth requireAdmin>
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">면접 관리</h1>

        {/* 면접일 토글 목록 */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            {loading ? (
              <p className="text-center py-4">로딩 중...</p>
            ) : interviewDates.length === 0 ? (
              <p className="text-center py-4 text-gray-500">등록된 면접일이 없습니다.</p>
            ) : (
              interviewDates.map((dateInfo, index) => {
                const shortDate = dateInfo.formattedDate === '날짜 미정' 
                  ? '미정' 
                  : format(dateInfo.date, 'M/d');
                
                return (
                  <button
                    key={index}
                    className={`px-4 py-2 rounded-full transition-colors ${
                      selectedDate && format(selectedDate.date, 'yyyy-MM-dd') === format(dateInfo.date, 'yyyy-MM-dd')
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                    }`}
                    onClick={() => handleSelectDate(dateInfo)}
                  >
                    {shortDate} ({dateInfo.interviews.length})
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* 왼쪽: 면접 대상자 목록 */}
          <div className="lg:w-1/3">
            {selectedDate ? (
              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b">
                  <h2 className="text-lg font-semibold">
                    {selectedDate.formattedDate} 면접 대상자
                  </h2>
                  <p className="text-sm text-gray-600">총 {selectedDate.interviews.length}명</p>
                </div>

                <div className="divide-y">
                  {selectedDate.interviews.length === 0 ? (
                    <p className="p-4 text-center text-gray-500">면접 대상자가 없습니다.</p>
                  ) : (
                    selectedDate.interviews.map((app) => (
                      <div
                        key={app.id}
                        className={`p-4 cursor-pointer transition-colors ${
                          selectedApplication?.id === app.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleSelectApplication(app)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">{app.user?.name || '이름 없음'}</div>
                            <div className="text-sm text-gray-600 mt-1">
                              {app.user?.university || app.user?.school || '학교 정보 없음'}
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              {app.interviewDate 
                                ? format(app.interviewDate.toDate(), 'HH:mm', { locale: ko }) 
                                : '시간 미정'}
                            </div>
                          </div>
                          <div>
                            {app.interviewStatus === 'pending' && (
                              <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
                                예정
                              </span>
                            )}
                            {app.interviewStatus === 'passed' && (
                              <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                                합격
                              </span>
                            )}
                            {app.interviewStatus === 'failed' && (
                              <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                                불합격
                              </span>
                            )}
                            {app.interviewStatus === '불참' && (
                              <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">
                                불참
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
                면접일을 선택하여 면접 대상자를 확인하세요.
              </div>
            )}
          </div>

          {/* 오른쪽: 선택된 지원자 상세 정보 */}
          <div className="lg:w-2/3">
            {selectedApplication && selectedDate ? (
              <div className="space-y-6">
                {/* 기본 정보 */}
                <div className="bg-white rounded-lg shadow">
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-2xl font-bold">{selectedApplication.user?.name}</h3>                      </div>
                      <div className="text-right">
                        <p className="text-gray-600">{formatPhoneNumber(selectedApplication.user?.phoneNumber || '')}</p>
                        <p className="text-gray-600 mt-1">
                          {selectedApplication.user?.age}세 · {selectedApplication.user?.gender === 'M' ? '남성' : '여성'}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-gray-600">학교</p>
                        <p className="font-medium">{selectedApplication.user?.university || selectedApplication.user?.school || '정보 없음'}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">전공</p>
                        <p className="font-medium">
                          {selectedApplication.user?.major1 || selectedApplication.user?.major || '정보 없음'}
                          {selectedApplication.user?.major2 && ` / ${selectedApplication.user.major2}`}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">학년</p>
                        <p className="font-medium">{selectedApplication.user?.grade ? `${selectedApplication.user.grade}학년` : '정보 없음'}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">주소</p>
                        <p className="font-medium">
                          {selectedApplication.user?.address
                            ? `${selectedApplication.user.address} ${selectedApplication.user.addressDetail || ''}`
                            : '정보 없음'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 면접 시간 및 상태 */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h4 className="text-lg font-semibold mb-4">면접 시간 및 상태</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <p className="text-gray-600 mb-2">면접 시간</p>
                      <div className="flex flex-col gap-2">
                        <input
                          type="date"
                          className="p-2 border border-gray-300 rounded"
                          value={newSelectedDate || (selectedDate?.formattedDate !== '날짜 미정' ? format(selectedDate?.date || new Date(), 'yyyy-MM-dd') : '')}
                          onChange={(e) => setNewSelectedDate(e.target.value)}
                        />
                        <input
                          type="time"
                          className="p-2 border border-gray-300 rounded"
                          value={interviewTime}
                          onChange={(e) => setInterviewTime(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              if (!newSelectedDate && !selectedDate) {
                                toast.error('날짜를 입력해주세요.');
                                return;
                              }
                              handleChangeInterviewTime();
                            }}
                            className="flex-1"
                            disabled={loading}
                          >
                            저장
                          </Button>
                          <Button
                            onClick={handleSetUndefinedTime}
                            className="flex-1 bg-gray-500 hover:bg-gray-600"
                            disabled={loading}
                          >
                            미정
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-gray-600 mb-2">면접 상태</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          onClick={() => handleInterviewStatusChange(selectedApplication.id, 'passed')}
                          className="bg-green-600 hover:bg-green-700"
                          disabled={loading || selectedApplication.interviewStatus === 'passed'}
                        >
                          합격
                        </Button>
                        <Button
                          onClick={() => handleInterviewStatusChange(selectedApplication.id, 'failed')}
                          className="bg-red-600 hover:bg-red-700"
                          disabled={loading || selectedApplication.interviewStatus === 'failed'}
                        >
                          불합격
                        </Button>
                        <Button
                          onClick={() => handleInterviewStatusChange(selectedApplication.id, '불참')}
                          className="bg-gray-600 hover:bg-gray-700"
                          disabled={loading || selectedApplication.interviewStatus === '불참'}
                        >
                          불참
                        </Button>
                        <Button
                          onClick={() => handleInterviewStatusChange(selectedApplication.id, 'pending')}
                          className="bg-yellow-600 hover:bg-yellow-700"
                          disabled={loading || selectedApplication.interviewStatus === 'pending'}
                        >
                          예정
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 면접 피드백 */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h4 className="text-lg font-semibold mb-4">면접 피드백</h4>
                  <textarea
                    className="w-full p-4 border border-gray-300 rounded-lg min-h-32 resize-none"
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="면접 피드백을 입력하세요..."
                  />
                  <div className="flex justify-end mt-2">
                    <Button
                      onClick={handleSaveFeedback}
                      disabled={loading}
                    >
                      피드백 저장
                    </Button>
                  </div>
                </div>

                {/* 알바 & 멘토링 경력 */}
                {(selectedApplication.user?.partTimeJobs?.length || selectedApplication.user?.schoolActivities?.length) ? (
                  <div className="bg-white rounded-lg shadow p-6">
                    <h4 className="text-lg font-semibold mb-4">알바 & 멘토링 경력</h4>
                    <div className="space-y-4">
                      {selectedApplication.user?.partTimeJobs?.map((job, index) => (
                        <div key={index} className="bg-gray-50 rounded-lg p-4">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h5 className="font-medium">{job.companyName}</h5>
                              <p className="text-sm text-gray-600">{job.position}</p>
                            </div>
                            <p className="text-sm text-gray-600">{job.period}</p>
                          </div>
                          <p className="text-sm text-gray-600 whitespace-pre-line">{job.description}</p>
                        </div>
                      ))}
                      {selectedApplication.user?.schoolActivities?.map((activity, index) => (
                        <div key={index} className="bg-gray-50 rounded-lg p-4">
                          <div className="flex justify-between items-start mb-2">
                            <h5 className="font-medium">{activity.name}</h5>
                            <p className="text-sm text-gray-600">{activity.period}</p>
                          </div>
                          <p className="text-sm text-gray-600 whitespace-pre-line">{activity.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* 자기소개서 및 지원동기 */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h4 className="text-lg font-semibold mb-4">자기소개서 및 지원동기</h4>
                  <div className="space-y-6">
                    {selectedApplication.user?.selfIntroduction && (
                      <div>
                        <h5 className="font-medium mb-2">자기소개서</h5>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-sm text-gray-600 whitespace-pre-line">
                            {selectedApplication.user.selfIntroduction}
                          </p>
                        </div>
                      </div>
                    )}
                    {selectedApplication.user?.jobMotivation && (
                      <div>
                        <h5 className="font-medium mb-2">지원동기</h5>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-sm text-gray-600 whitespace-pre-line">
                            {selectedApplication.user.jobMotivation}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
                면접 대상자를 선택하여 상세 정보를 확인하세요.
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
} 