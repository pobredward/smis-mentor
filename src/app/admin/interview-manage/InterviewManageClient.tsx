'use client';

import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, Timestamp, setDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { db } from '@/lib/firebase';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { JobBoard, ApplicationHistory, User } from '@/types';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const [interviewDates, setInterviewDates] = useState<InterviewDateInfo[]>([]);
  const [selectedDate, setSelectedDate] = useState<InterviewDateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationWithUser | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [interviewTime, setInterviewTime] = useState('');
  const [newSelectedDate, setNewSelectedDate] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  
  // 데이터 로드
  useEffect(() => {
    loadJobBoards();
    loadScript();
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
      
      // 각 지원자의 면접일을 기준으로 그룹화 (날짜+시간)
      for (const app of validApplications) {
        if (app.interviewDate) {
          // 면접일이 있는 경우
          const date = app.interviewDate.toDate();
          // 날짜+시간으로 키 생성
          const dateTimeKey = format(date, 'yyyy-MM-dd-HH:mm');
          const formattedDate = format(date, 'yyyy년 MM월 dd일 (eee) HH:mm', { locale: ko });
          
          // 해당 날짜+시간에 대한 면접 일정 정보가 없으면 새로 생성
          if (!interviewDateMap.has(dateTimeKey)) {
            interviewDateMap.set(dateTimeKey, {
              jobBoardId: app.refJobBoardId,
              jobBoardTitle: app.jobBoardTitle || '',
              date,
              formattedDate,
              interviews: []
            });
          }
          
          // 지원자 추가
          const dateInfo = interviewDateMap.get(dateTimeKey)!;
          dateInfo.interviews.push(app);
        } else {
          // 면접일이 없는 경우 '미정' 그룹에 추가
          const undefinedDateInfo = interviewDateMap.get(undefinedDateKey)!;
          undefinedDateInfo.interviews.push(app);
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
  const handleSelectApplication = async (app: ApplicationWithUser) => {
    setSelectedApplication(app);
    setFeedbackText(app.interviewFeedback || '');
    setShowDetail(true);
    
    // 화면 최상단으로 스크롤
    window.scrollTo({ top: 0 });
    
    if (app.interviewDate) {
      const time = format(app.interviewDate.toDate(), 'HH:mm');
      setInterviewTime(time);
      setNewSelectedDate(format(app.interviewDate.toDate(), 'yyyy-MM-dd'));
    } else {
      setInterviewTime('');
      setNewSelectedDate('');
    }

    // 채용 공고의 base 정보 가져오기
    try {
      const jobBoardRef = doc(db, 'jobBoards', app.refJobBoardId);
      const jobBoardDoc = await getDoc(jobBoardRef);
      
      if (jobBoardDoc.exists()) {
        const jobBoardData = jobBoardDoc.data() as JobBoard;
        
        // 선택된 지원자 정보 업데이트
        setSelectedApplication(prev => {
          if (!prev) return prev;
          
          return {
            ...prev,
            interviewBaseLink: jobBoardData.interviewBaseLink || '',
            interviewBaseDuration: jobBoardData.interviewBaseDuration || 30,
            interviewBaseNotes: jobBoardData.interviewBaseNotes || ''
          };
        });
      }
    } catch (error) {
      console.error('채용 공고 정보 로드 오류:', error);
      toast.error('채용 공고 정보를 불러오는 중 오류가 발생했습니다.');
    }
  };

  // 면접일 선택
  const handleSelectDate = (dateInfo: InterviewDateInfo) => {
    setSelectedDate(dateInfo);
    setSelectedApplication(null);
    setFeedbackText('');
    setShowDetail(false); // 상세 보기 모드 해제
  };

  // 진행자 스크립트 로드
  const loadScript = async () => {
    try {
      // 진행자 스크립트 문서를 Firestore에서 불러오기
      const scriptRef = doc(db, 'interviewScripts', 'common');
      const scriptDoc = await getDoc(scriptRef);
      
      if (scriptDoc.exists()) {
        setScriptText(scriptDoc.data().content || '');
      } else {
        // 기본 스크립트 템플릿 설정
        setScriptText('# 진행자 스크립트\n\n## 면접 시작 인사\n안녕하세요, SMIS 면접에 참여해 주셔서 감사합니다.\n\n## 지원자 소개\n간단한 자기소개를 부탁드립니다.\n\n## 주요 질문 리스트\n1. 지원 동기가 무엇인가요?\n2. 팀 프로젝트 경험이 있다면 말씀해주세요.\n3. 어려운 상황을 극복한 경험이 있나요?\n\n## 마무리 인사\n면접에 참여해 주셔서 감사합니다. 결과는 추후 안내해 드리겠습니다.');
      }
    } catch (error) {
      console.error('진행자 스크립트 로드 오류:', error);
      toast.error('진행자 스크립트를 불러오는 중 오류가 발생했습니다.');
      setScriptText('');
    }
  };

  // 진행자 스크립트 저장
  const handleSaveScript = async () => {
    try {
      setLoading(true);
      
      // Firestore에 진행자 스크립트 저장
      const scriptRef = doc(db, 'interviewScripts', 'common');
      await setDoc(scriptRef, {
        content: scriptText,
        updatedAt: Timestamp.fromDate(new Date())
      }, { merge: true });

      toast.success('진행자 스크립트가 저장되었습니다.');
    } catch (error) {
      console.error('진행자 스크립트 저장 오류:', error);
      toast.error('진행자 스크립트를 저장하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
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

  // 서류 상태 변경
  const handleStatusChange = async (applicationId: string, newStatus: string, statusType: 'application' | 'interview' | 'final') => {
    if (!selectedApplication) return;

    try {
      setLoading(true);
      const applicationRef = doc(db, 'applicationHistories', applicationId);
      
      const updateData: Partial<ApplicationHistory> = {
        updatedAt: Timestamp.fromDate(new Date())
      };
      
      switch (statusType) {
        case 'application':
          updateData.applicationStatus = newStatus as ApplicationHistory['applicationStatus'];
          break;
        case 'interview':
          updateData.interviewStatus = newStatus as ApplicationHistory['interviewStatus'];
          break;
        case 'final':
          updateData.finalStatus = newStatus as ApplicationHistory['finalStatus'];
          break;
      }
      
      await updateDoc(applicationRef, updateData);

      toast.success('상태가 변경되었습니다.');
      
      // UI 업데이트
      if (selectedDate) {
        const updatedInterviews = selectedDate.interviews.map(interview => {
          if (interview.id === selectedApplication.id) {
            return { 
              ...interview, 
              ...updateData
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
          ...updateData
        });
      }
      
    } catch (error) {
      console.error('상태 변경 오류:', error);
      toast.error('상태를 변경하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 최종 상태 변경
  const handleFinalStatusChange = async (applicationId: string, newStatus: string) => {
    await handleStatusChange(applicationId, newStatus, 'final');
  };

  // 면접 정보 저장
  const handleSaveInterviewInfo = async () => {
    if (!selectedApplication || !newSelectedDate || !interviewTime) return;

    try {
      setLoading(true);
      
      // 새 날짜 + 시간 결합
      const timeValue = interviewTime;
      const dateTimeStr = `${newSelectedDate}T${timeValue}:00`;
      const dateTimeObj = new Date(dateTimeStr);
      
      const applicationRef = doc(db, 'applicationHistories', selectedApplication.id);
      
      // 면접 날짜/시간만 업데이트
      await updateDoc(applicationRef, {
        interviewDate: Timestamp.fromDate(dateTimeObj),
        updatedAt: Timestamp.fromDate(new Date())
      });

      toast.success('면접 날짜/시간이 저장되었습니다.');
      
      // 기존 날짜가 있었는지 확인
      const hadPreviousDate = selectedApplication.interviewDate !== undefined;
      const previousDateObj = hadPreviousDate ? selectedApplication.interviewDate!.toDate() : null;
      const previousDateKey = previousDateObj ? format(previousDateObj, 'yyyy-MM-dd') : null;
      
      // 새로운 날짜 정보 생성
      const newDateKey = format(dateTimeObj, 'yyyy-MM-dd');
      const formattedNewDate = format(dateTimeObj, 'yyyy년 MM월 dd일 (eee)', { locale: ko });
      
      // UI 상태 업데이트 로직
      if (selectedDate) {
        // 현재 선택된 날짜가 이전 날짜와 같은 경우 - 단순 시간 변경
        if (hadPreviousDate && format(selectedDate.date, 'yyyy-MM-dd') === previousDateKey && previousDateKey === newDateKey) {
          // 시간만 변경된 경우 현재 목록 업데이트
          const updatedInterviews = selectedDate.interviews.map(interview => {
            if (interview.id === selectedApplication.id) {
              return { 
                ...interview, 
                interviewDate: Timestamp.fromDate(dateTimeObj)
              };
            }
            return interview;
          });
          
          setSelectedDate({
            ...selectedDate,
            interviews: updatedInterviews
          });
        } else {
          // 날짜 자체가 변경된 경우 - 현재 목록에서 제거
          const updatedInterviews = selectedDate.interviews.filter(
            interview => interview.id !== selectedApplication.id
          );
          
          // 현재 날짜 목록 업데이트
          setSelectedDate({
            ...selectedDate,
            interviews: updatedInterviews
          });
          
          // 전체 날짜 목록 상태 업데이트
          // 1. 기존 날짜들과 동일한 날짜가 있는지 확인
          const existingDate = interviewDates.find(
            dateInfo => format(dateInfo.date, 'yyyy-MM-dd') === newDateKey
          );
          
          if (existingDate) {
            // 이미 존재하는 날짜에 추가
            const updatedDates = interviewDates.map(dateInfo => {
              if (format(dateInfo.date, 'yyyy-MM-dd') === newDateKey) {
                const updatedInterviews = [...dateInfo.interviews, {
                  ...selectedApplication,
                  interviewDate: Timestamp.fromDate(dateTimeObj)
                }];
                
                // 면접 시간순으로 정렬
                updatedInterviews.sort((a, b) => {
                  const timeA = a.interviewDate!.toDate().getTime();
                  const timeB = b.interviewDate!.toDate().getTime();
                  return timeA - timeB;
                });
                
                return {
                  ...dateInfo,
                  interviews: updatedInterviews
                };
              }
              return dateInfo;
            });
            
            setInterviewDates(updatedDates);
          } else {
            // 새로운 날짜 추가
            const newDateInfo: InterviewDateInfo = {
              jobBoardId: selectedApplication.refJobBoardId,
              jobBoardTitle: selectedApplication.jobBoardTitle || '',
              date: dateTimeObj,
              formattedDate: formattedNewDate,
              interviews: [{
                ...selectedApplication,
                interviewDate: Timestamp.fromDate(dateTimeObj)
              }]
            };
            
            // 새로운 날짜 추가하고 날짜순으로 정렬
            setInterviewDates(prev => {
              const newDates = [...prev, newDateInfo];
              newDates.sort((a, b) => {
                if (a.formattedDate === '날짜 미정') return 1;
                if (b.formattedDate === '날짜 미정') return -1;
                return a.date.getTime() - b.date.getTime();
              });
              return newDates;
            });
          }
        }
      }
      
      // 선택된 지원자 정보 업데이트
      setSelectedApplication({
        ...selectedApplication,
        interviewDate: Timestamp.fromDate(dateTimeObj)
      });
      
      // 전체 데이터 새로고침
      await loadJobBoards();
      
    } catch (error) {
      console.error('면접 날짜/시간 저장 오류:', error);
      toast.error('면접 날짜/시간을 저장하는 중 오류가 발생했습니다.');
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
      
      // UI 업데이트 - 선택된 날짜의 인터뷰 목록 업데이트
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
        
        // 전체 면접 날짜 목록의 데이터도 업데이트
        const updatedDates = interviewDates.map(dateInfo => {
          if (dateInfo.formattedDate === selectedDate.formattedDate) {
            return {
              ...dateInfo,
              interviews: updatedInterviews
            };
          } else {
            // 다른 날짜에도 동일한 지원자가 있는지 확인하고 업데이트
            const dateHasApplication = dateInfo.interviews.some(
              interview => interview.id === selectedApplication.id
            );
            
            if (dateHasApplication) {
              return {
                ...dateInfo,
                interviews: dateInfo.interviews.map(interview => {
                  if (interview.id === selectedApplication.id) {
                    return { ...interview, interviewFeedback: feedbackText };
                  }
                  return interview;
                })
              };
            }
          }
          return dateInfo;
        });
        
        setInterviewDates(updatedDates);
        
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

  // 면접 날짜 미정으로 설정
  const handleSetUndefinedDate = async () => {
    if (!selectedApplication) return;

    try {
      setLoading(true);
      const applicationRef = doc(db, 'applicationHistories', selectedApplication.id);
      
      await updateDoc(applicationRef, {
        interviewDate: null,
        updatedAt: Timestamp.fromDate(new Date())
      });

      toast.success('면접 날짜가 미정으로 변경되었습니다.');
      
      // 기존 날짜에서 지원자 제거
      if (selectedDate && selectedApplication.interviewDate) {
        const updatedInterviews = selectedDate.interviews.filter(
          interview => interview.id !== selectedApplication.id
        );
        
        setSelectedDate({
          ...selectedDate,
          interviews: updatedInterviews
        });
      }
      
      // 미정 날짜 정보 확인
      const undefinedDateInfo = interviewDates.find(date => date.formattedDate === '날짜 미정');
      
      if (undefinedDateInfo) {
        // 미정 날짜 정보가 이미 있는 경우 업데이트
        const updatedDates = interviewDates.map(dateInfo => {
          if (dateInfo.formattedDate === '날짜 미정') {
            return {
              ...dateInfo,
              interviews: [...dateInfo.interviews, {
                ...selectedApplication,
                interviewDate: undefined
              }]
            };
          }
          return dateInfo;
        });
        
        setInterviewDates(updatedDates);
      } else {
        // 미정 날짜 정보가 없는 경우 새로 생성
        const newUndefinedDateInfo: InterviewDateInfo = {
          jobBoardId: 'undefined',
          jobBoardTitle: '날짜 미정',
          date: new Date(),
          formattedDate: '날짜 미정',
          interviews: [{
            ...selectedApplication,
            interviewDate: undefined
          }]
        };
        
        // 미정 날짜는 항상 마지막에 위치하도록 정렬
        setInterviewDates(prev => {
          const newDates = [...prev, newUndefinedDateInfo];
          newDates.sort((a, b) => {
            if (a.formattedDate === '날짜 미정') return 1;
            if (b.formattedDate === '날짜 미정') return -1;
            return a.date.getTime() - b.date.getTime();
          });
          return newDates;
        });
      }
      
      // 선택된 지원자 정보 업데이트
      setSelectedApplication({
        ...selectedApplication,
        interviewDate: undefined
      });
      
      // 입력 필드 초기화
      setNewSelectedDate('');
      setInterviewTime('');
      
      // 전체 데이터 새로고침
      await loadJobBoards();
      
    } catch (error) {
      console.error('면접 날짜 변경 오류:', error);
      toast.error('면접 날짜를 변경하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 관리자 페이지로 돌아가기
  const handleGoBack = () => {
    router.back();
  };

  // 목록으로 돌아가는 함수 추가
  const handleBackToList = () => {
    setShowDetail(false);
  };

  return (
    <Layout requireAuth requireAdmin>
      <div className="container mx-auto lg:px-4 px-0">
        <div className="flex items-center mb-6">
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
          <h1 className="text-2xl font-bold">면접 관리</h1>
        </div>

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
                  : `${format(dateInfo.date, 'M/d(eee)', { locale: ko })} ${format(dateInfo.date, 'HH:mm')}`;
                
                return (
                  <button
                    key={index}
                    className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                      selectedDate && format(selectedDate.date, 'yyyy-MM-dd-HH:mm') === format(dateInfo.date, 'yyyy-MM-dd-HH:mm')
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
          <div className={`lg:w-1/3 ${showDetail ? 'hidden lg:block' : 'block'}`}>
            {selectedDate ? (
              <div className="bg-white rounded-lg shadow">
                <div className="p-4 border-b bg-gray-50">
                  <h2 className="text-lg font-semibold">
                    면접 대상자
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
                        className={`p-3 cursor-pointer transition-colors ${
                          selectedApplication?.id === app.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleSelectApplication(app)}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex items-center">
                            {/* 프로필 이미지 */}
                            <div className="flex-shrink-0 mr-3">
                              {app.user?.profileImage ? (
                                <img 
                                  src={app.user.profileImage} 
                                  alt={app.user?.name || '프로필'} 
                                  className="w-15 h-15 rounded object-cover border border-gray-100"
                                />
                              ) : (
                                <div className="w-15 h-15 rounded bg-gray-200 flex items-center justify-center text-gray-500">
                                  {app.user?.name ? app.user.name.charAt(0) : '?'}
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="font-medium">{app.user?.name ? `${app.user.name} (${app.user.age})` : app.refUserId}</div>
                              {/* <div className="text-sm text-gray-600 mt-1">
                                {formatPhoneNumber(app.user?.phoneNumber || '')}
                              </div> */}
                              <div className="text-xs text-gray-500 mt-1">
                                {app.jobBoardTitle || '캠프 정보 없음'}
                              </div>
                              <p className="text-xs text-gray-400 mt-1">
                              {app.user?.university ? `${app.user.university} ${app.user.grade}학년 ${app.user.isOnLeave ? '휴학생' : '재학생'}` : ''}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              {app.user?.major1 ? `전공: ${app.user.major1}` : ''}
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              지원경로: {app.user?.referralPath} {app.user?.referrerName ? `(${app.user.referrerName})` : ''}
                            </p>
                              {/* <div className="text-sm text-gray-500 mt-1">
                                {app.interviewDate 
                                  ? format(app.interviewDate.toDate(), 'HH:mm', { locale: ko }) 
                                  : '시간 미정'}
                              </div> */}
                            </div>
                          </div>
                          <div>
                            {app.interviewStatus === 'pending' && (
                              <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">
                                예정
                              </span>
                            )}
                            {app.interviewStatus === 'complete' && (
                              <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
                                완료
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
                            {app.interviewStatus === 'absent' && (
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

          {/* 오른쪽: 선택된 지원자 상세 정보 또는 스크립트 */}
          <div className={`lg:w-2/3 ${showDetail ? 'block' : 'hidden lg:block'}`}>
            {selectedDate ? (
              <div className="bg-white rounded-lg shadow">
                {selectedApplication ? (
                  <div className="p-4 lg:p-6">
                    {/* 모바일 화면에서만 보이는 뒤로가기 버튼 */}
                    <div className="lg:hidden mb-4">
                      <button
                        onClick={handleBackToList}
                        className="flex items-center text-blue-600 hover:text-blue-800"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                        </svg>
                        목록으로
                      </button>
                    </div>
                    <div className="mb-6 pb-6 border-b border-gray-200">
                      <div className="flex justify-between items-start">
                        <div className="flex items-start">
                          {/* 프로필 이미지 */}
                          <div className="flex-shrink-0 mr-4">
                            {selectedApplication.user?.profileImage ? (
                              <img 
                                src={selectedApplication.user.profileImage} 
                                alt={selectedApplication.user?.name || '프로필'} 
                                className="w-20 h-20 rounded object-cover border border-gray-100"
                              />
                            ) : (
                              <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xl">
                                {selectedApplication.user?.name ? selectedApplication.user.name.charAt(0) : '?'}
                              </div>
                            )}
                          </div>
                          <div>
                            <h2 className="font-bold text-gray-900">
                            {selectedApplication.user?.name ? `${selectedApplication.user.name} (${selectedApplication.user.age})` : selectedApplication.refUserId}
                            </h2>
                            {selectedApplication.user && (
                              <div className="mt-1 space-y-1 text-sm text-gray-600">
                                <p>
                                  <span className="font-medium">전화번호:</span> {selectedApplication.user.phoneNumber ? formatPhoneNumber(selectedApplication.user.phoneNumber) : ''}
                                </p>
                                {/* <p>
                                  <span className="font-medium">나이:</span> {selectedApplication.user.age}세
                                </p> */}
                                <p>
                                  <span className="font-medium">주소:</span> {selectedApplication.user.address} {selectedApplication.user.addressDetail}
                                </p>
                                <p>
                                  <span className="font-medium">학교:</span> {selectedApplication.user.university} {selectedApplication.user.grade}학년 {selectedApplication.user.isOnLeave ? '휴학생' : '재학생'}
                                </p>
                                <p>
                                  <span className="font-medium">전공1:</span> {selectedApplication.user.major1} | <span className="font-medium">전공2:</span> {selectedApplication.user.major2}
                                </p>
                                {/* <p>
                                  <span className="font-medium">지원경로:</span> {selectedApplication.user.referralPath} 
                                  {selectedApplication.user.referralPath === '지인추천' && selectedApplication.user.referrerName && 
                                    ` (추천인: ${selectedApplication.user.referrerName})`}
                                </p> */}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 상태 변경 및 피드백 */}
                    <div className="mb-6 pb-6 border-b border-gray-200">
                      {/* 상태 변경 - 모든 화면에서 가로 배치 */}
                      <div className="grid grid-cols-3 gap-2 md:gap-4 mt-4">
                        <div>
                          <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1 md:mb-2">
                            서류 상태
                          </label>
                          <select
                            value={selectedApplication.applicationStatus}
                            onChange={(e) => handleStatusChange(selectedApplication.id, e.target.value, 'application')}
                            className="w-full p-1 md:p-2 text-xs md:text-sm border border-gray-300 rounded-md"
                            disabled={loading}
                          >
                            <option value="pending">검토중</option>
                            <option value="accepted">서류합격</option>
                            <option value="rejected">서류불합격</option>
                          </select>
                        </div>
                        
                        <div>
                          <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1 md:mb-2">
                            면접 상태
                          </label>
                          <select
                            value={selectedApplication.interviewStatus || ''}
                            onChange={(e) => handleInterviewStatusChange(selectedApplication.id, e.target.value)}
                            className="w-full p-1 md:p-2 text-xs md:text-sm border border-gray-300 rounded-md"
                            disabled={loading || selectedApplication.applicationStatus !== 'accepted'}
                          >
                            <option value="">선택</option>
                            <option value="pending">면접예정</option>
                            <option value="complete">면접완료</option>
                            <option value="passed">면접합격</option>
                            <option value="failed">면접불합격</option>
                            <option value="absent">면접불참</option>
                          </select>
                        </div>
                        
                        <div>
                          <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1 md:mb-2">
                            최종 상태
                          </label>
                          <select
                            value={selectedApplication.finalStatus || ''}
                            onChange={(e) => handleFinalStatusChange(selectedApplication.id, e.target.value)}
                            className="w-full p-1 md:p-2 text-xs md:text-sm border border-gray-300 rounded-md"
                            disabled={loading || selectedApplication.interviewStatus !== 'passed'}
                          >
                            <option value="">선택</option>
                            <option value="finalAccepted">최종합격</option>
                            <option value="finalRejected">최종불합격</option>
                            <option value="absent">불참</option>
                          </select>
                        </div>
                      </div>
                      
                      {/* 면접 정보 입력 폼 */}
                      {selectedApplication?.interviewStatus === 'pending' && (
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          <input
                            type="date"
                            value={newSelectedDate}
                            onChange={(e) => setNewSelectedDate(e.target.value)}
                            className="flex-1 p-1 text-xs md:p-2 md:text-sm border border-gray-300 rounded-md min-w-[100px]"
                          />
                          <input
                            type="time"
                            value={interviewTime}
                            onChange={(e) => setInterviewTime(e.target.value)}
                            className="flex-1 p-1 text-xs md:p-2 md:text-sm border border-gray-300 rounded-md min-w-[100px]"
                          />
                          <div className="flex gap-1">
                            <Button
                              variant="primary"
                              onClick={handleSaveInterviewInfo}
                              isLoading={loading}
                              disabled={loading || !newSelectedDate || !interviewTime}
                              className="whitespace-nowrap text-xs md:text-sm p-1 md:p-2"
                            >
                              저장
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={handleSetUndefinedDate}
                              isLoading={loading}
                              disabled={loading}
                              className="whitespace-nowrap text-xs md:text-sm p-1 md:p-2"
                            >
                              미정
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
                          className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[200px] min-h-[250px] overflow-auto"
                          placeholder="면접 피드백을 입력하세요..."
                          disabled={loading}
                          style={{ height: '100px', resize: 'none' }}
                        ></textarea>
                        <div className="mt-2 flex justify-end">
                          <Button
                            variant="primary"
                            onClick={handleSaveFeedback}
                            isLoading={loading}
                            disabled={loading || !feedbackText.trim()}
                          >
                            피드백 저장
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* 알바 & 멘토링 경력 */}
                    <div className="mb-6 pb-6">
                      <h3 className="text-lg font-semibold mb-4">알바 & 멘토링 경력</h3>
                      {!selectedApplication.user?.partTimeJobs || selectedApplication.user.partTimeJobs.length === 0 ? (
                        <p className="text-gray-500">경력을 추가해주세요</p>
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
                    
                    {/* 자기소개서 및 지원동기 */}
                    {selectedApplication.user && (
                      <div className="mb-6">
                        <hr className="my-6" />
                        <div className="mb-6 pb-6">
                          <h3 className="text-lg font-semibold mb-4">자기소개서 및 지원동기</h3>
                          <div className="space-y-4">
                            <div>
                              <h4 className="font-medium mb-2">자기소개서</h4>
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
                  </div>
                ) : (
                  <div className="p-4 lg:p-6 hidden lg:block">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-bold">진행자 스크립트</h2>
                    </div>
                    
                    <div className="mb-4">
                      <textarea
                        value={scriptText}
                        onChange={(e) => setScriptText(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="진행자 스크립트를 입력하세요..."
                        disabled={loading}
                        style={{ height: '250px', resize: 'vertical' }}
                      ></textarea>
                      <div className="flex justify-end mt-2">
                        <Button
                          variant="primary"
                          onClick={handleSaveScript}
                          isLoading={loading}
                          disabled={loading}
                        >
                          스크립트 저장
                        </Button>
                      </div>
                    </div>
                    
                    <div className="whitespace-pre-wrap bg-gray-50 p-4 rounded-md border border-gray-200">
                      {scriptText || '스크립트가 작성되지 않았습니다.'}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
                면접일을 선택하여 면접 대상자를 확인하세요.
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
} 