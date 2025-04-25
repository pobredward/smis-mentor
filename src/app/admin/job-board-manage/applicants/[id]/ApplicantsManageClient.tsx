'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, getDoc, collection, query, where, getDocs, DocumentData, deleteField, FieldValue } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ApplicationHistory, JobBoard, User } from '@/types';
import { Timestamp } from 'firebase/firestore';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import { 
  SMSTemplate, 
  getAllSMSTemplates, 
  getSMSTemplateByTypeAndJobBoard,
  saveSMSTemplate,
  updateSMSTemplate,
  TemplateType, 
} from '@/lib/smsTemplateService';
import { auth } from '@/lib/firebase';
import { PhoneNumber } from '@/lib/naverCloudSMS';

type JobBoardWithId = JobBoard & { id: string };

type ApplicationWithUser = ApplicationHistory & { 
  id: string;
  user?: User;
};

type FilterStatus = 'all' | 'pending' | 'complete' | 'accepted' | 'interview' | 'passed' | 'final';

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
  const [isMobile, setIsMobile] = useState(false);
  // SMS 전송 관련 상태
  const [smsTemplates, setSmsTemplates] = useState<SMSTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isSendingSMS, setIsSendingSMS] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [smsContent, setSmsContent] = useState('');
  
  // 서류 합격/불합격 메시지 관련 상태
  const [documentPassMessage, setDocumentPassMessage] = useState('');
  const [documentFailMessage, setDocumentFailMessage] = useState('');
  const [interviewPassMessage, setInterviewPassMessage] = useState('');
  const [interviewFailMessage, setInterviewFailMessage] = useState('');
  const [finalPassMessage, setFinalPassMessage] = useState('');
  const [finalFailMessage, setFinalFailMessage] = useState('');

  // 메시지 박스 표시 상태
  const [showDocumentPassMessage, setShowDocumentPassMessage] = useState(false);
  const [showDocumentFailMessage, setShowDocumentFailMessage] = useState(false);
  const [showInterviewPassMessage, setShowInterviewPassMessage] = useState(false);
  const [showInterviewFailMessage, setShowInterviewFailMessage] = useState(false);
  const [showFinalPassMessage, setShowFinalPassMessage] = useState(false);
  const [showFinalFailMessage, setShowFinalFailMessage] = useState(false);

  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  
  const [fromNumber, setFromNumber] = useState<PhoneNumber>('01067117933');
  
  // 모바일 상태 감지
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    // 초기 로드 시 체크
    checkIsMobile();
    
    // 리사이즈 이벤트 리스너 등록
    window.addEventListener('resize', checkIsMobile);
    
    // 컴포넌트 언마운트 시 리스너 제거
    return () => {
      window.removeEventListener('resize', checkIsMobile);
    };
  }, []);
  
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
      
      // 지원일 기준 내림차순 정렬 (최신순)
      applicationsData.sort((a, b) => {
        const dateA = a.applicationDate.toDate().getTime();
        const dateB = b.applicationDate.toDate().getTime();
        return dateB - dateA;
      });
      
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
          case 'pending':
            return app.applicationStatus === 'pending';
          case 'interview':
            return app.interviewStatus === 'pending';
          case 'passed':
            return app.interviewStatus === 'passed';
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

    // 지원일 기준 내림차순 정렬 (최신순)
    filtered.sort((a, b) => {
      const dateA = a.applicationDate.toDate().getTime();
      const dateB = b.applicationDate.toDate().getTime();
      return dateB - dateA; // 내림차순 정렬
    });

    setFilteredApplications(filtered);
  }, [applications, filterStatus, searchQuery]);
  
  const handleSelectApplication = (app: ApplicationWithUser) => {
    setSelectedApplication(app);
    setFeedbackText(app.interviewFeedback || '');
    
    // 화면 최상단으로 스크롤
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    if (app.interviewDate) {
      const date = app.interviewDate.toDate();
      setInterviewDate(format(date, 'yyyy-MM-dd'));
      setInterviewTime(format(date, 'HH:mm'));
    } else {
      setInterviewDate('');
      setInterviewTime('');
    }

    // 채용 공고의 base 정보 가져오기
    if (jobBoard) {
      setInterviewBaseLink(jobBoard.interviewBaseLink || '');
      setInterviewBaseDuration(jobBoard.interviewBaseDuration?.toString() || '30');
      setInterviewBaseNotes(jobBoard.interviewBaseNotes || '');
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

  const getStatusBadge = (status: string | undefined, statusType: 'application' | 'interview' | 'final') => {
    if (!status) return null;

    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: 'bg-cyan-100', text: 'text-cyan-800', label: '검토중' },
      accepted: { bg: 'bg-green-100', text: 'text-green-800', label: '합격' },
      rejected: { bg: 'bg-red-100', text: 'text-red-800', label: '불합격' },
      passed: { bg: 'bg-green-100', text: 'text-green-800', label: '합격' },
      complete: { bg: 'bg-purple-100', text: 'text-purple-800', label: '완료' },
      failed: { bg: 'bg-red-100', text: 'text-red-800', label: '불합격' },
      finalAccepted: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: '최종합격' },
      finalRejected: { bg: 'bg-red-100', text: 'text-red-800', label: '최종불합격' },
      absent: { bg: 'bg-red-100', text: 'text-red-800', label: '불참' },
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
            updateData.interviewFeedback = undefined;
            updateData.interviewBaseLink = undefined;
            updateData.interviewBaseDuration = undefined;
            updateData.interviewBaseNotes = undefined;
            
            // Firestore 업데이트용
            firestoreUpdateData.interviewStatus = deleteField();
            firestoreUpdateData.finalStatus = deleteField();
            firestoreUpdateData.interviewDate = deleteField();
            firestoreUpdateData.interviewFeedback = deleteField();
            firestoreUpdateData.interviewBaseLink = deleteField();
            firestoreUpdateData.interviewBaseDuration = deleteField();
            firestoreUpdateData.interviewBaseNotes = deleteField();
          }
          break;
        case 'interview':
          updateData.interviewStatus = newStatus as 'pending' | 'passed' | 'failed' | 'absent';
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
          updateData.finalStatus = newStatus as 'finalAccepted' | 'finalRejected' | 'finalAbsent';
          firestoreUpdateData.finalStatus = newStatus;
          break;
      }

      // Firestore 업데이트 - 비동기 작업이지만 로컬 상태 업데이트를 먼저 하기 위해 await을 사용하지 않음
      updateDoc(applicationRef, firestoreUpdateData)
        .catch((error) => {
          console.error('Firestore 업데이트 오류:', error);
          // Firestore 업데이트 오류 시 사용자에게 알림
          toast.error('상태 업데이트 중 오류가 발생했습니다. 다시 시도해주세요.');
          // 로컬 상태를 원래대로 복원하는 로직이 필요하다면 여기에 추가
        });

      // 즉시 로컬 상태 업데이트 (Firestore 응답을 기다리지 않음)
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

      // 토스트 메시지 표시
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
      
      // 날짜/시간만 업데이트
      const updateData: Partial<ApplicationHistory> = {
        interviewDate: Timestamp.fromDate(interviewDateTime),
        updatedAt: Timestamp.fromDate(new Date())
      };

      // base 정보도 함께 저장 (이미 채용 공고에서 가져온 값)
      if (interviewBaseLink) {
        updateData.interviewBaseLink = interviewBaseLink;
      }
      if (interviewBaseDuration) {
        updateData.interviewBaseDuration = parseInt(interviewBaseDuration);
      }
      if (interviewBaseNotes) {
        updateData.interviewBaseNotes = interviewBaseNotes;
      }

      // Firestore 업데이트 - 비동기 작업이지만 로컬 상태 업데이트를 먼저 하기 위해 await을 사용하지 않음
      updateDoc(applicationRef, updateData)
        .catch((error) => {
          console.error('면접 정보 저장 오류:', error);
          toast.error('면접 정보 저장 중 오류가 발생했습니다. 다시 시도해주세요.');
        });

      // 로컬 상태 즉시 업데이트
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

      toast.success('면접 날짜/시간이 저장되었습니다.');
    } catch (error) {
      console.error('면접 날짜/시간 저장 오류:', error);
      toast.error('면접 날짜/시간 저장 중 오류가 발생했습니다.');
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

      // Firestore 업데이트 - 비동기 작업이지만 로컬 상태 업데이트를 먼저 하기 위해 await을 사용하지 않음
      updateDoc(applicationRef, updateData)
        .catch((error) => {
          console.error('면접 피드백 저장 오류:', error);
          toast.error('면접 피드백 저장 중 오류가 발생했습니다. 다시 시도해주세요.');
        });

      // 로컬 상태 즉시 업데이트
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

  // 면접 날짜 미정으로 설정
  const handleSetUndefinedDate = async () => {
    if (!selectedApplication) return;

    try {
      setIsLoading(true);
      const applicationRef = doc(db, 'applicationHistories', selectedApplication.id);
      
      // 날짜 정보 삭제
      const updateData = {
        interviewDate: null,
        updatedAt: Timestamp.fromDate(new Date())
      };

      // Firestore 업데이트 - 비동기 작업이지만 로컬 상태 업데이트를 먼저 하기 위해 await을 사용하지 않음
      updateDoc(applicationRef, updateData)
        .catch((error) => {
          console.error('면접 날짜 변경 오류:', error);
          toast.error('면접 날짜 변경 중 오류가 발생했습니다. 다시 시도해주세요.');
        });

      // 로컬 상태 즉시 업데이트
      const updatedApplication: ApplicationWithUser = {
        ...selectedApplication,
        interviewDate: undefined
      };

      // applications 배열 업데이트
      setApplications(prevApplications => 
        prevApplications.map(app => 
          app.id === selectedApplication.id ? updatedApplication : app
        )
      );

      // 선택된 지원자 상태 업데이트
      setSelectedApplication(updatedApplication);
      
      // 입력 필드 초기화
      setInterviewDate('');
      setInterviewTime('');

      toast.success('면접 날짜가 미정으로 변경되었습니다.');
    } catch (error) {
      console.error('면접 날짜 변경 오류:', error);
      toast.error('면접 날짜 변경 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // 뒤로가기 처리
  const handleGoBack = () => {
    router.back();
  };
  
  // SMS 템플릿 로드
  const loadSmsTemplates = async () => {
    try {
      const templates = await getAllSMSTemplates();
      setSmsTemplates(templates);
    } catch (error) {
      console.error('SMS 템플릿 로드 오류:', error);
    }
  };
  
  useEffect(() => {
    loadSmsTemplates();
  }, []);
  
  // 템플릿 ID가 변경될 때 내용 미리보기 업데이트
  useEffect(() => {
    if (!selectedTemplateId || !selectedApplication?.user) return;
    
    const template = smsTemplates.find(t => t.id === selectedTemplateId);
    if (!template) return;
    
    // 변수 치환하지 않고 템플릿 내용 그대로 표시
    let content = template.content;
    
    // 면접 정보 변수 대체 (이 변수들은 화면에 표시될 때만 필요하므로 치환)
    if (selectedApplication.interviewDate) {
      const interviewDate = selectedApplication.interviewDate.toDate();
      content = content
        .replace(/{면접일자}/g, format(interviewDate, 'yyyy년 MM월 dd일'))
        .replace(/{면접시간}/g, format(interviewDate, 'HH:mm'));
    }
    
    // 채용 공고 정보 변수 대체 (이 변수들은 화면에 표시될 때만 필요하므로 치환)
    if (jobBoard) {
      content = content.replace(/{채용공고명}/g, jobBoard.title || '');
    }
    
    // 이름 변수는 치환하지 않음 - API에서 처리됨
    
    setSmsContent(content);
  }, [selectedTemplateId, selectedApplication, smsTemplates, jobBoard]);
  
  // SMS 전송 핸들러
  const handleSendSMS = async () => {
    if (!selectedApplication?.user?.phoneNumber || !smsContent) {
      toast.error('전화번호 또는 내용이 없습니다.');
      return;
    }
    
    try {
      setIsSendingSMS(true);
      
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: selectedApplication.user.phoneNumber,
          content: smsContent,
          userName: selectedApplication.user.name, // 사용자 이름 추가
          fromNumber // 발신번호 추가
        }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success('SMS가 성공적으로 전송되었습니다.');
        setIsTemplateModalOpen(false);
      } else {
        toast.error(`SMS 전송 실패: ${result.message}`);
      }
    } catch (error) {
      console.error('SMS 전송 오류:', error);
      toast.error('SMS 전송 중 오류가 발생했습니다.');
    } finally {
      setIsSendingSMS(false);
    }
  };
  
  // SMS 발송 버튼 핸들러
  // 이 함수는 면접 및 최종 합격 문자 등을 위해 남겨둡니다
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleOpenSmsModal = (type: 'document_pass' | 'document_fail' | 'interview_pass' | 'interview_fail' | 'final_pass' | 'final_fail') => {
    if (!selectedApplication?.user?.phoneNumber) {
      toast.error('선택된 지원자의 전화번호가 없습니다.');
      return;
    }
    
    // 유형에 맞는 템플릿 선택
    const typeTemplates = smsTemplates.filter(t => t.type === type);
    if (typeTemplates.length > 0) {
      setSelectedTemplateId(typeTemplates[0].id || '');
    } else {
      setSelectedTemplateId('');
      setSmsContent('');
    }
    
    setIsTemplateModalOpen(true);
  };
  
  // 모든 메시지 박스 닫기
  const closeAllMessageBoxes = () => {
    setShowDocumentPassMessage(false);
    setShowDocumentFailMessage(false);
    setShowInterviewPassMessage(false);
    setShowInterviewFailMessage(false);
    setShowFinalPassMessage(false);
    setShowFinalFailMessage(false);
  };

  // 상태별 템플릿 로드 함수
  const loadTemplates = async () => {
    if (!jobBoard || !jobBoard.id) return;
    
    try {
      setIsLoading(true);
      
      // document_pass 템플릿 로드
      const documentPassTemplate = await getSMSTemplateByTypeAndJobBoard('document_pass', jobBoard.id);
      if (documentPassTemplate) {
        setDocumentPassMessage(documentPassTemplate.content);
      } else {
        // 기본 서류 합격 메시지 설정
        setDocumentPassMessage(`안녕하세요, {이름}님.\n${jobBoard.title} 채용에 지원해주셔서 감사합니다.\n서류 전형 합격을 축하드립니다. 다음 면접 일정을 안내드리겠습니다.`);
      }
      
      // document_fail 템플릿 로드
      const documentFailTemplate = await getSMSTemplateByTypeAndJobBoard('document_fail', jobBoard.id);
      if (documentFailTemplate) {
        setDocumentFailMessage(documentFailTemplate.content);
      } else {
        // 기본 서류 불합격 메시지 설정
        setDocumentFailMessage(`안녕하세요, {이름}님.\n${jobBoard.title} 채용에 지원해주셔서 감사합니다.\n아쉽게도 이번 서류 전형에 합격하지 못하셨습니다. 다음 기회에 다시 만나뵙기를 희망합니다.`);
      }
      
      // interview_pass 템플릿 로드
      const interviewPassTemplate = await getSMSTemplateByTypeAndJobBoard('interview_pass', jobBoard.id);
      if (interviewPassTemplate) {
        setInterviewPassMessage(interviewPassTemplate.content);
      } else {
        // 기본 면접 합격 메시지 설정
        setInterviewPassMessage(`안녕하세요, {이름}님.\n${jobBoard.title} 면접에 참여해주셔서 감사합니다.\n면접 전형 합격을 축하드립니다. 후속 단계에 대해 안내드리겠습니다.`);
      }
      
      // interview_fail 템플릿 로드
      const interviewFailTemplate = await getSMSTemplateByTypeAndJobBoard('interview_fail', jobBoard.id);
      if (interviewFailTemplate) {
        setInterviewFailMessage(interviewFailTemplate.content);
      } else {
        // 기본 면접 불합격 메시지 설정
        setInterviewFailMessage(`안녕하세요, {이름}님.\n${jobBoard.title} 면접에 참여해주셔서 감사합니다.\n아쉽게도 이번 면접 전형에 합격하지 못하셨습니다. 다음 기회에 다시 만나뵙기를 희망합니다.`);
      }
      
      // final_pass 템플릿 로드
      const finalPassTemplate = await getSMSTemplateByTypeAndJobBoard('final_pass', jobBoard.id);
      if (finalPassTemplate) {
        setFinalPassMessage(finalPassTemplate.content);
      } else {
        // 기본 최종 합격 메시지 설정
        setFinalPassMessage(`축하합니다, {이름}님!\n${jobBoard.title}에 최종 합격하셨습니다. 입사 관련 안내사항은 추후 이메일로 전달드릴 예정입니다.`);
      }
      
      // final_fail 템플릿 로드
      const finalFailTemplate = await getSMSTemplateByTypeAndJobBoard('final_fail', jobBoard.id);
      if (finalFailTemplate) {
        setFinalFailMessage(finalFailTemplate.content);
      } else {
        // 기본 최종 불합격 메시지 설정
        setFinalFailMessage(`안녕하세요, {이름}님.\n${jobBoard.title} 채용에 지원해주셔서 감사합니다.\n아쉽게도 이번 최종 전형에 합격하지 못하셨습니다. 다음 기회에 다시 만나뵙기를 희망합니다.`);
      }
    } catch (error) {
      console.error('템플릿 로드 실패:', error);
      toast.error('템플릿을 불러오는 데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 선택된 지원자가 변경될 때 모든 템플릿 로드
  useEffect(() => {
    if (selectedApplication?.user) {
      loadTemplates();
    }
  }, [selectedApplication, jobBoard]);

  // 메시지 전송 함수
  const sendMessage = async (message: string) => {
    if (!selectedApplication?.user?.phoneNumber || !message) {
      toast.error('전화번호 또는 내용이 없습니다.');
      return;
    }
    
    try {
      setIsLoadingMessage(true);
      
      // 메시지 전송 요청을 백그라운드로 처리
      fetch('/api/send-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: selectedApplication.user.phoneNumber,
          content: message,
          userName: selectedApplication.user.name, // 사용자 이름 추가
          fromNumber // 발신번호 추가
        }),
      })
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          toast.success('SMS가 성공적으로 전송되었습니다.');
          // 메시지 박스 닫기
          closeAllMessageBoxes();
        } else {
          toast.error(`SMS 전송 실패: ${result.message}`);
        }
      })
      .catch(error => {
        console.error('SMS 전송 오류:', error);
        toast.error('SMS 전송 중 오류가 발생했습니다.');
      })
      .finally(() => {
        setIsLoadingMessage(false);
      });
      
      // 요청이 완료되기 전에 UI 상태를 업데이트하여 사용자 경험 개선
      // 메시지 전송 중임을 알리는 토스트 표시
      toast.loading('메시지를 전송 중입니다...', {
        duration: 2000, // 2초 동안 표시
      });
      
    } catch (error) {
      // 이 부분은 fetch 자체가 실패할 경우에만 실행됨 (네트워크 오류 등)
      console.error('SMS 전송 오류:', error);
      toast.error('SMS 전송 중 오류가 발생했습니다.');
      setIsLoadingMessage(false);
    }
  };

  // 템플릿 저장 함수
  const saveTemplate = async (type: TemplateType, content: string) => {
    if (!jobBoard || !jobBoard.id) return;
    
    try {
      setIsSavingTemplate(true);
      
      // 현재 로그인된 사용자의 uid 가져오기
      const currentUser = auth.currentUser;
      const createdBy = currentUser?.uid || 'system';
      
      // 기존 템플릿 확인
      const existingTemplate = await getSMSTemplateByTypeAndJobBoard(type, jobBoard.id);
      
      if (existingTemplate && existingTemplate.id) {
        // 기존 템플릿 업데이트 - 비동기 작업을 백그라운드로 수행
        updateSMSTemplate(existingTemplate.id, {
          content,
          type,
          refJobBoardId: jobBoard.id,
          title: `${type} 템플릿`,
          createdBy
        }).catch(error => {
          console.error('템플릿 업데이트 실패:', error);
          toast.error('템플릿 업데이트에 실패했습니다. 다시 시도해주세요.');
        });
      } else {
        // 새 템플릿 생성 - 비동기 작업을 백그라운드로 수행
        saveSMSTemplate({
          content,
          type,
          refJobBoardId: jobBoard.id,
          title: `${type} 템플릿`,
          createdBy
        }).catch(error => {
          console.error('템플릿 생성 실패:', error);
          toast.error('템플릿 생성에 실패했습니다. 다시 시도해주세요.');
        });
      }
      
      toast.success('템플릿이 저장되었습니다.');
      
      // 템플릿 저장 후 즉시 로컬 상태 업데이트
      // 서버에서 가져온 데이터를 기다리지 않고 입력한 내용으로 즉시 업데이트
      switch (type) {
        case 'document_pass':
          setDocumentPassMessage(content);
          break;
        case 'document_fail':
          setDocumentFailMessage(content);
          break;
        case 'interview_pass':
          setInterviewPassMessage(content);
          break;
        case 'interview_fail':
          setInterviewFailMessage(content);
          break;
        case 'final_pass':
          setFinalPassMessage(content);
          break;
        case 'final_fail':
          setFinalFailMessage(content);
          break;
      }
      
      // 백그라운드에서 최신 템플릿 데이터 로드
      // 이 부분은 필요한 경우에만 유지하세요. 즉시 UI 업데이트가 더 중요하다면 제거해도 됩니다.
      loadTemplates().catch(error => {
        console.error('템플릿 로드 실패:', error);
        // 템플릿 로드 실패는 사용자 경험에 큰 영향이 없으므로 toast 알림은 표시하지 않음
      });
      
    } catch (error) {
      console.error('템플릿 저장 실패:', error);
      toast.error('템플릿 저장에 실패했습니다.');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  // 메시지 박스 표시 함수
  const showMessageBox = (type: TemplateType) => {
    // 이미 열려있는 메시지 박스인 경우 닫기 처리
    switch(type) {
      case 'document_pass':
        if(showDocumentPassMessage) {
          setShowDocumentPassMessage(false);
          return;
        }
        break;
      case 'document_fail':
        if(showDocumentFailMessage) {
          setShowDocumentFailMessage(false);
          return;
        }
        break;
      case 'interview_pass':
        if(showInterviewPassMessage) {
          setShowInterviewPassMessage(false);
          return;
        }
        break;
      case 'interview_fail':
        if(showInterviewFailMessage) {
          setShowInterviewFailMessage(false);
          return;
        }
        break;
      case 'final_pass':
        if(showFinalPassMessage) {
          setShowFinalPassMessage(false);
          return;
        }
        break;
      case 'final_fail':
        if(showFinalFailMessage) {
          setShowFinalFailMessage(false);
          return;
        }
        break;
    }

    // 모든 메시지 박스 숨기기
    setShowDocumentPassMessage(false);
    setShowDocumentFailMessage(false);
    setShowInterviewPassMessage(false);
    setShowInterviewFailMessage(false);
    setShowFinalPassMessage(false);
    setShowFinalFailMessage(false);
    
    // 선택된 타입의 메시지 박스만 표시
    switch (type) {
      case 'document_pass':
        setShowDocumentPassMessage(true);
        break;
      case 'document_fail':
        setShowDocumentFailMessage(true);
        break;
      case 'interview_pass':
        setShowInterviewPassMessage(true);
        break;
      case 'interview_fail':
        setShowInterviewFailMessage(true);
        break;
      case 'final_pass':
        setShowFinalPassMessage(true);
        break;
      case 'final_fail':
        setShowFinalFailMessage(true);
        break;
    }
  };
  
  return (
    <Layout requireAuth requireAdmin>
      <div className="container mx-auto lg:px-4 px-0">
        {jobBoard && (
          <div className="mb-6">
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
              <div>
                <h1 className="text-2xl font-bold">캠프별 지원자 관리</h1>
                <p className="text-sm text-gray-600">{jobBoard.title}</p>
              </div>
            </div>
          </div>
        )}
        
        <div className="mb-4">
          <div className="flex flex-col gap-2">
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
                onClick={() => setFilterStatus('pending')}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  filterStatus === 'pending'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className="inline-flex items-center">
                  <span className="h-2 w-2 rounded-full bg-cyan-500 mr-1"></span>
                  <span>서류 검토중</span>
                </span>
              </button>
              <button
                onClick={() => setFilterStatus('interview')}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  filterStatus === 'interview'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className="inline-flex items-center">
                  <span className="h-2 w-2 rounded-full bg-yellow-500 mr-1"></span>
                  <span>면접 예정자</span>
                </span>
              </button>
              <button
                onClick={() => setFilterStatus('passed')}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  filterStatus === 'passed'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className="inline-flex items-center">
                  <span className="h-2 w-2 rounded-full bg-green-500 mr-1"></span>
                  <span>면접 합격자</span>
                </span>
              </button>
              <button
                onClick={() => setFilterStatus('final')}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  filterStatus === 'final'
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className="inline-flex items-center">
                  <span className="h-2 w-2 rounded-full bg-indigo-500 mr-1"></span>
                  <span>최종 합격자</span>
                </span>
              </button>
            </div>
            <div className="w-full mt-2">
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
          // 모바일 최적화 레이아웃
          <div className="flex flex-col lg:grid lg:grid-cols-5 gap-6">
            {/* 모바일 뷰에서는 상세 정보가 선택된 경우에만 지원자 목록을 숨깁니다 */}
            {(!selectedApplication || !isMobile) && (
            <div className={`${selectedApplication && isMobile ? 'hidden' : 'block'} lg:col-span-2`}>
              {/* 지원자 목록 */}
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="p-2 lg:p-4 border-b flex justify-between items-center">
                  <div>
                    <h2 className="font-medium text-gray-900">지원자 목록</h2>
                  </div>
                  
                  <div className="flex items-center">
                    <p className="text-sm text-gray-500">
                      총 {filteredApplications.length}명
                      {filterStatus !== 'all' && ` (전체 ${applications.length}명 중)`}
                    </p>
                    
                    {/* 모바일 뷰에서 상세보기에서 목록으로 돌아가는 버튼 */}
                    {selectedApplication && isMobile && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setSelectedApplication(null)}
                        className="ml-2"
                      >
                        목록으로
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="divide-y overflow-y-auto max-h-[600px]">
                  {filteredApplications.map((app) => (
                    <div 
                      key={app.id}
                      className={`p-2 lg:p-4 cursor-pointer hover:bg-gray-50 ${
                        selectedApplication?.id === app.id ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => handleSelectApplication(app)}
                    >
                      <div className="flex items-center">
                        {/* 프로필 이미지 */}
                        <div className="flex-shrink-0 mr-3">
                          {app.user?.profileImage ? (
                            <img 
                              src={app.user.profileImage} 
                              alt={app.user?.name || '프로필'} 
                              className="w-15 h-15 rounded object-cover border border-gray-100"
                              style={{ aspectRatio: '1 / 1' }}
                            />
                          ) : (
                            <div className="w-15 h-15 rounded bg-gray-200 flex items-center justify-center text-gray-500" style={{ aspectRatio: '1 / 1' }}>
                              {app.user?.name ? app.user.name.charAt(0) : '?'}
                            </div>
                          )}
                        </div>

                        {/* 지원자 정보와 상태 배지 */}
                        <div className="flex flex-1 justify-between items-center">
                          {/* 왼쪽: 지원자 기본 정보 */}
                          <div className="flex flex-col mr-2 flex-grow-0 max-w-[70%]">
                            <h3 className="font-medium text-gray-900 truncate">
                            {app.user?.name ? `${app.user.name} (${app.user.age})` : app.refUserId}
                            </h3>
                            {/* <p className="text-sm text-gray-500">
                              {app.user?.phoneNumber ? formatPhoneNumber(app.user.phoneNumber) : ''}
                            </p> */}
                            <p className="text-xs text-gray-400 mt-1 truncate">
                              {app.user?.university ? `${app.user.university} ${app.user.grade === 6 ? '졸업생' : `${app.user.grade}학년 ${app.user.isOnLeave === null ? '졸업생' : app.user.isOnLeave ? '휴학생' : '재학생'}`}` : ''}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 truncate">
                              {app.user?.major1 ? `전공: ${app.user.major1}` : ''}
                            </p>
                            <p className="text-xs text-gray-400 mt-1 truncate">
                              지원경로: {app.user?.referralPath} {app.user?.referrerName ? `(${app.user.referrerName})` : ''}
                            </p>
                          </div>
                          
                          {/* 오른쪽: 상태 배지 */}
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-500">서류:</span>
                              {getStatusBadge(app.applicationStatus, 'application')}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-500">면접:</span>
                              {app.interviewStatus 
                                ? getStatusBadge(app.interviewStatus, 'interview')
                                : <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">미정</span>}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-500">최종:</span>
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
              </div>
            </div>
            )}
            
            {/* 선택된 지원자 상세 - 모바일에서는 전체 너비 사용 */}
            {selectedApplication && (
              <div className="lg:col-span-3">
                <div className="bg-white rounded-lg shadow">
                  {/* 모바일 뷰에서만 보이는 뒤로가기 버튼 */}
                  <div className="lg:hidden p-4 border-b flex justify-between items-center">
                    <h2 className="font-medium">지원자 상세</h2>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedApplication(null)}
                    >
                      목록으로
                    </Button>
                  </div>
                  
                  <div className="p-4 lg:p-6">
                    <div className="mb-6 pb-6 border-b border-gray-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">
                            {selectedApplication.user?.name || selectedApplication.refUserId}
                          </h2>
                          {selectedApplication.user && (
                            <div className="mt-2 space-y-1 text-sm text-gray-600">
                              <p>
                                <span className="font-medium">전화번호:</span> {selectedApplication.user.phoneNumber ? formatPhoneNumber(selectedApplication.user.phoneNumber) : ''}
                              </p>
                              <p>
                                <span className="font-medium">나이:</span> {selectedApplication.user.age}세
                              </p>
                              <p>
                                <span className="font-medium">주소:</span> {selectedApplication.user.address} {selectedApplication.user.addressDetail}
                              </p>
                              <p>
                                <span className="font-medium">학교:</span> {selectedApplication.user.university} {selectedApplication.user.grade === 6 ? '졸업생' : `${selectedApplication.user.grade}학년 ${selectedApplication.user.isOnLeave === null ? '졸업생' : selectedApplication.user.isOnLeave ? '휴학생' : '재학생'}`}
                              </p>
                              <p>
                                <span className="font-medium">전공1:</span> {selectedApplication.user.major1} | <span className="font-medium">전공2:</span> {selectedApplication.user.major2}
                              </p>
                              <p>
                                <span className="font-medium">지원경로:</span> {selectedApplication.user.referralPath} 
                                {selectedApplication.user.referralPath === '지인추천' && selectedApplication.user.referrerName && 
                                  ` (추천인: ${selectedApplication.user.referrerName})`}
                              </p>
                            </div>
                          )}
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
                            disabled={isLoading}
                          >
                            <option value="pending">검토중</option>
                            <option value="accepted">서류합격</option>
                            <option value="rejected">서류불합격</option>
                          </select>

                          {/* 상태에 따라 적절한 버튼 표시 */}
                          <div className="mt-2">
                            {selectedApplication.applicationStatus === 'accepted' && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                  showMessageBox('document_pass');
                                }}
                                className="text-xs md:text-sm w-full"
                              >
                                {showDocumentPassMessage ? "메세지 내용 닫기" : "메세지 내용 열기"}
                              </Button>
                            )}
                            
                            {selectedApplication.applicationStatus === 'rejected' && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => {
                                  showMessageBox('document_fail');
                                }}
                                className="text-xs md:text-sm w-full"
                              >
                                {showDocumentFailMessage ? "메세지 내용 닫기" : "메세지 내용 열기"}
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1 md:mb-2">
                            면접 상태
                          </label>
                          <select
                            value={selectedApplication.interviewStatus || ''}
                            onChange={(e) => handleInterviewStatusChange(selectedApplication.id, e.target.value)}
                            className="w-full p-1 md:p-2 text-xs md:text-sm border border-gray-300 rounded-md"
                            disabled={isLoading || selectedApplication.applicationStatus !== 'accepted'}
                          >
                            <option value="">선택</option>
                            <option value="pending">면접예정</option>
                            <option value="complete">면접완료</option>
                            <option value="passed">면접합격</option>
                            <option value="failed">면접불합격</option>
                            <option value="absent">면접불참</option>
                          </select>

                          {/* 상태에 따라 적절한 버튼 표시 */}
                          <div className="mt-2">
                            {selectedApplication.interviewStatus === 'passed' && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => showMessageBox('interview_pass')}
                                className="text-xs md:text-sm w-full"
                              >
                                {showInterviewPassMessage ? "메세지 내용 닫기" : "메세지 내용 열기"}
                              </Button>
                            )}
                            
                            {selectedApplication.interviewStatus === 'failed' && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => showMessageBox('interview_fail')}
                                className="text-xs md:text-sm w-full"
                              >
                                {showInterviewFailMessage ? "메세지 내용 닫기" : "메세지 내용 열기"}
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-xs md:text-sm font-medium text-gray-700 mb-1 md:mb-2">
                            최종 상태
                          </label>
                          <select
                            value={selectedApplication.finalStatus || ''}
                            onChange={(e) => handleFinalStatusChange(selectedApplication.id, e.target.value)}
                            className="w-full p-1 md:p-2 text-xs md:text-sm border border-gray-300 rounded-md"
                            disabled={isLoading || selectedApplication.interviewStatus !== 'passed'}
                          >
                            <option value="">선택</option>
                            <option value="finalAccepted">최종합격</option>
                            <option value="finalRejected">최종불합격</option>
                            <option value="finalAbsent">불참</option>
                          </select>

                          {/* 상태에 따라 적절한 버튼 표시 */}
                          <div className="mt-2">
                            {selectedApplication.finalStatus === 'finalAccepted' && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => showMessageBox('final_pass')}
                                className="text-xs md:text-sm w-full"
                              >
                                {showFinalPassMessage ? "메세지 내용 닫기" : "메세지 내용 열기"}
                              </Button>
                            )}
                            
                            {selectedApplication.finalStatus === 'finalRejected' && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => showMessageBox('final_fail')}
                                className="text-xs md:text-sm w-full"
                              >
                                {showFinalFailMessage ? "메세지 내용 닫기" : "메세지 내용 열기"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* 메시지 박스 영역 - 그리드 밖으로 이동 */}
                      {/* 합격 메시지 박스 */}
                      {showDocumentPassMessage && (
                        <div className="mt-4 border border-green-200 rounded-md p-4 bg-green-50">
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-green-700">
                              서류 합격 메시지 내용
                            </label>
                            <div className="flex items-center space-x-4">
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-green-600"
                                  name="fromNumberPass"
                                  checked={fromNumber === '01067117933'}
                                  onChange={() => setFromNumber('01067117933')}
                                />
                                <span className="ml-1 text-xs text-green-700">010-6711-7933</span>
                              </label>
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-green-600"
                                  name="fromNumberPass"
                                  checked={fromNumber === '01076567933'}
                                  onChange={() => setFromNumber('01076567933')}
                                />
                                <span className="ml-1 text-xs text-green-700">010-7656-7933</span>
                              </label>
                            </div>
                          </div>
                          <textarea
                            className="w-full p-2 border border-green-300 rounded-md text-sm mb-3"
                            rows={5}
                            value={documentPassMessage}
                            onChange={(e) => setDocumentPassMessage(e.target.value)}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setShowDocumentPassMessage(false)}
                            >
                              취소
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => saveTemplate('document_pass', documentPassMessage)}
                              isLoading={isSavingTemplate}
                            >
                              저장
                            </Button>
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => sendMessage(documentPassMessage)}
                              isLoading={isLoadingMessage}
                            >
                              전송
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {/* 불합격 메시지 박스 */}
                      {showDocumentFailMessage && (
                        <div className="mt-4 border border-red-200 rounded-md p-4 bg-red-50">
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-red-700">
                              서류 불합격 메시지 내용
                            </label>
                            <div className="flex items-center space-x-4">
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-red-600"
                                  name="fromNumberFail"
                                  checked={fromNumber === '01067117933'}
                                  onChange={() => setFromNumber('01067117933')}
                                />
                                <span className="ml-1 text-xs text-red-700">010-6711-7933</span>
                              </label>
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-red-600"
                                  name="fromNumberFail"
                                  checked={fromNumber === '01076567933'}
                                  onChange={() => setFromNumber('01076567933')}
                                />
                                <span className="ml-1 text-xs text-red-700">010-7656-7933</span>
                              </label>
                            </div>
                          </div>
                          <textarea
                            className="w-full p-2 border border-red-300 rounded-md text-sm mb-3" 
                            rows={5}
                            value={documentFailMessage}
                            onChange={(e) => setDocumentFailMessage(e.target.value)}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setShowDocumentFailMessage(false)}
                            >
                              취소
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => saveTemplate('document_fail', documentFailMessage)}
                              isLoading={isSavingTemplate}
                            >
                              저장
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => sendMessage(documentFailMessage)}
                              isLoading={isLoadingMessage}
                            >
                              전송
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {/* 면접 합격 메시지 박스 */}
                      {showInterviewPassMessage && (
                        <div className="mt-4 border border-green-200 rounded-md p-4 bg-green-50">
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-green-700">
                              면접 합격 메시지 내용
                            </label>
                            <div className="flex items-center space-x-4">
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-green-600"
                                  name="fromNumberInterviewPass"
                                  checked={fromNumber === '01067117933'}
                                  onChange={() => setFromNumber('01067117933')}
                                />
                                <span className="ml-1 text-xs text-green-700">010-6711-7933</span>
                              </label>
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-green-600"
                                  name="fromNumberInterviewPass"
                                  checked={fromNumber === '01076567933'}
                                  onChange={() => setFromNumber('01076567933')}
                                />
                                <span className="ml-1 text-xs text-green-700">010-7656-7933</span>
                              </label>
                            </div>
                          </div>
                          <textarea
                            className="w-full p-2 border border-green-300 rounded-md text-sm mb-3"
                            rows={5}
                            value={interviewPassMessage}
                            onChange={(e) => setInterviewPassMessage(e.target.value)}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setShowInterviewPassMessage(false)}
                            >
                              취소
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => saveTemplate('interview_pass', interviewPassMessage)}
                              isLoading={isSavingTemplate}
                            >
                              저장
                            </Button>
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => sendMessage(interviewPassMessage)}
                              isLoading={isLoadingMessage}
                            >
                              전송
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {/* 면접 불합격 메시지 박스 */}
                      {showInterviewFailMessage && (
                        <div className="mt-4 border border-red-200 rounded-md p-4 bg-red-50">
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-red-700">
                              면접 불합격 메시지 내용
                            </label>
                            <div className="flex items-center space-x-4">
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-red-600"
                                  name="fromNumberInterviewFail"
                                  checked={fromNumber === '01067117933'}
                                  onChange={() => setFromNumber('01067117933')}
                                />
                                <span className="ml-1 text-xs text-red-700">010-6711-7933</span>
                              </label>
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-red-600"
                                  name="fromNumberInterviewFail"
                                  checked={fromNumber === '01076567933'}
                                  onChange={() => setFromNumber('01076567933')}
                                />
                                <span className="ml-1 text-xs text-red-700">010-7656-7933</span>
                              </label>
                            </div>
                          </div>
                          <textarea
                            className="w-full p-2 border border-red-300 rounded-md text-sm mb-3" 
                            rows={5}
                            value={interviewFailMessage}
                            onChange={(e) => setInterviewFailMessage(e.target.value)}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setShowInterviewFailMessage(false)}
                            >
                              취소
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => saveTemplate('interview_fail', interviewFailMessage)}
                              isLoading={isSavingTemplate}
                            >
                              저장
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => sendMessage(interviewFailMessage)}
                              isLoading={isLoadingMessage}
                            >
                              전송
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {/* 최종 합격 메시지 박스 */}
                      {showFinalPassMessage && (
                        <div className="mt-4 border border-green-200 rounded-md p-4 bg-green-50">
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-green-700">
                              최종 합격 메시지 내용
                            </label>
                            <div className="flex items-center space-x-4">
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-green-600"
                                  name="fromNumberFinalPass"
                                  checked={fromNumber === '01067117933'}
                                  onChange={() => setFromNumber('01067117933')}
                                />
                                <span className="ml-1 text-xs text-green-700">010-6711-7933</span>
                              </label>
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-green-600"
                                  name="fromNumberFinalPass"
                                  checked={fromNumber === '01076567933'}
                                  onChange={() => setFromNumber('01076567933')}
                                />
                                <span className="ml-1 text-xs text-green-700">010-7656-7933</span>
                              </label>
                            </div>
                          </div>
                          <textarea
                            className="w-full p-2 border border-green-300 rounded-md text-sm mb-3"
                            rows={5}
                            value={finalPassMessage}
                            onChange={(e) => setFinalPassMessage(e.target.value)}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setShowFinalPassMessage(false)}
                            >
                              취소
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => saveTemplate('final_pass', finalPassMessage)}
                              isLoading={isSavingTemplate}
                            >
                              저장
                            </Button>
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => sendMessage(finalPassMessage)}
                              isLoading={isLoadingMessage}
                            >
                              전송
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {/* 최종 불합격 메시지 박스 */}
                      {showFinalFailMessage && (
                        <div className="mt-4 border border-red-200 rounded-md p-4 bg-red-50">
                          <div className="flex justify-between items-center mb-2">
                            <label className="block text-sm font-medium text-red-700">
                              최종 불합격 메시지 내용
                            </label>
                            <div className="flex items-center space-x-4">
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-red-600"
                                  name="fromNumberFinalFail"
                                  checked={fromNumber === '01067117933'}
                                  onChange={() => setFromNumber('01067117933')}
                                />
                                <span className="ml-1 text-xs text-red-700">010-6711-7933</span>
                              </label>
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-red-600"
                                  name="fromNumberFinalFail"
                                  checked={fromNumber === '01076567933'}
                                  onChange={() => setFromNumber('01076567933')}
                                />
                                <span className="ml-1 text-xs text-red-700">010-7656-7933</span>
                              </label>
                            </div>
                          </div>
                          <textarea
                            className="w-full p-2 border border-red-300 rounded-md text-sm mb-3" 
                            rows={5}
                            value={finalFailMessage}
                            onChange={(e) => setFinalFailMessage(e.target.value)}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setShowFinalFailMessage(false)}
                            >
                              취소
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => saveTemplate('final_fail', finalFailMessage)}
                              isLoading={isSavingTemplate}
                            >
                              저장
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => sendMessage(finalFailMessage)}
                              isLoading={isLoadingMessage}
                            >
                              전송
                            </Button>
                          </div>
                        </div>
                      )}
                      
                      {/* 면접 정보 입력 폼 */}
                      {selectedApplication.interviewStatus === 'pending' && (
                        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                          <h3 className="text-md font-medium text-blue-800 mb-3">면접 정보</h3>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                면접 날짜 (수정 가능)
                              </label>
                              <input
                                type="date"
                                value={interviewDate}
                                onChange={(e) => setInterviewDate(e.target.value)}
                                className="w-full p-1 text-xs md:p-2 md:text-sm border border-gray-300 rounded-md"
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                면접 시간 (수정 가능)
                              </label>
                              <input
                                type="time"
                                value={interviewTime}
                                onChange={(e) => setInterviewTime(e.target.value)}
                                className="w-full p-1 text-xs md:p-2 md:text-sm border border-gray-300 rounded-md"
                              />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                면접 링크 (수정 불가)
                              </label>
                              <input
                                type="text"
                                value={interviewBaseLink}
                                readOnly
                                className="w-full p-1 text-xs md:p-2 md:text-sm border border-gray-300 rounded-md bg-gray-50"
                                placeholder="https://zoom.us/j/..."
                              />
                            </div>
                            
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">
                                면접 시간 (분) (수정 불가)
                              </label>
                              <input
                                type="number"
                                value={interviewBaseDuration}
                                readOnly
                                className="w-full p-1 text-xs md:p-2 md:text-sm border border-gray-300 rounded-md bg-gray-50"
                                placeholder="30"
                              />
                            </div>
                          </div>
                          
                          <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              면접 참고사항 (수정 불가)
                            </label>
                            <textarea
                              value={interviewBaseNotes}
                              readOnly
                              className="w-full p-1 text-xs md:p-2 md:text-sm border border-gray-300 rounded-md bg-gray-50"
                              rows={3}
                              placeholder="면접 참고사항을 입력하세요..."
                            />
                          </div>
                          
                          <div className="flex gap-2 justify-end">
                            <Button
                              variant="primary"
                              onClick={handleSaveInterviewInfo}
                              isLoading={isLoading}
                              disabled={isLoading || !interviewDate || !interviewTime}
                              className="text-xs md:text-sm"
                            >
                              면접 날짜/시간 저장
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={handleSetUndefinedDate}
                              isLoading={isLoading}
                              disabled={isLoading}
                              className="text-xs md:text-sm"
                            >
                              미정으로 설정
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
                          className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 max-h-[100px] overflow-auto"
                          placeholder="면접 피드백을 입력하세요..."
                          disabled={isLoading}
                          style={{ height: '100px', resize: 'none' }}
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
                </div>
              </div>
            )}
            
            {!selectedApplication && (
              <div className="hidden lg:block lg:col-span-2">
                <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
                  지원자를 선택하세요
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* SMS 템플릿 선택 모달 */}
        {isTemplateModalOpen && selectedApplication?.user && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-lg">
              <h3 className="text-lg font-semibold mb-4">
                문자 메시지 보내기
              </h3>
              
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  수신자: {selectedApplication.user.name} ({formatPhoneNumber(selectedApplication.user.phoneNumber || '')})
                </p>
                
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  템플릿 선택
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                >
                  <option value="">템플릿 선택...</option>
                  {smsTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  발신번호 선택
                </label>
                <div className="flex items-center space-x-4 mt-1 mb-3">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="form-radio text-blue-600"
                      name="fromNumber"
                      checked={fromNumber === '01067117933'}
                      onChange={() => setFromNumber('01067117933')}
                    />
                    <span className="ml-2">010-6711-7933</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="form-radio text-blue-600"
                      name="fromNumber"
                      checked={fromNumber === '01076567933'}
                      onChange={() => setFromNumber('01076567933')}
                    />
                    <span className="ml-2">010-7656-7933</span>
                  </label>
                </div>
              </div>
              
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  메시지 내용
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  rows={6}
                  value={smsContent}
                  onChange={(e) => setSmsContent(e.target.value)}
                  placeholder="직접 내용을 입력하거나 템플릿을 선택하세요."
                />
              </div>
              
              <div className="flex justify-between gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-1/2"
                  onClick={() => setIsTemplateModalOpen(false)}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="w-1/2"
                  isLoading={isSendingSMS}
                  onClick={handleSendSMS}
                >
                  전송
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
} 