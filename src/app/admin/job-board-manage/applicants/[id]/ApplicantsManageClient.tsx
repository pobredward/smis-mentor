'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, getDoc, collection, query, where, getDocs, DocumentData, deleteField, FieldValue } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { ApplicationHistory, JobBoard, User, JobCodeWithId, JobGroup, JobCodeWithGroup } from '@/types';
import EvaluationStageCards from '@/components/evaluation/EvaluationStageCards';
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
import { onAuthStateChanged } from 'firebase/auth';
import { PhoneNumber } from '@/lib/naverCloudSMS';
import { cancelApplication, getAllJobCodes, addUserJobCode, getUserJobCodesInfo, updateUser } from '@/lib/firebaseService';
import { getScoreTextColor } from '@/utils/scoreColorUtils';

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
  // 새로 추가: 사용자가 지원한 모든 캠프 제목 저장
  // const [userAppliedCamps, setUserAppliedCamps] = useState<string[]>([]);
  
  // 지원자별 지원 장소 정보를 저장하는 맵 추가
  const [appliedCampsMap, setAppliedCampsMap] = useState<Record<string, string[]>>({});
  
  // 서류 합격/불합격 메시지 관련 상태
  const [documentPassMessage, setDocumentPassMessage] = useState('');
  const [documentFailMessage, setDocumentFailMessage] = useState('');
  const [interviewScheduledMessage, setInterviewScheduledMessage] = useState('');
  const [interviewPassMessage, setInterviewPassMessage] = useState('');
  const [interviewFailMessage, setInterviewFailMessage] = useState('');
  const [finalPassMessage, setFinalPassMessage] = useState('');
  const [finalFailMessage, setFinalFailMessage] = useState('');

  // 메시지 박스 표시 상태
  const [showDocumentPassMessage, setShowDocumentPassMessage] = useState(false);
  const [showDocumentFailMessage, setShowDocumentFailMessage] = useState(false);
  const [showInterviewScheduledMessage, setShowInterviewScheduledMessage] = useState(false);
  const [showInterviewPassMessage, setShowInterviewPassMessage] = useState(false);
  const [showInterviewFailMessage, setShowInterviewFailMessage] = useState(false);
  const [showFinalPassMessage, setShowFinalPassMessage] = useState(false);
  const [showFinalFailMessage, setShowFinalFailMessage] = useState(false);

  const [isLoadingMessage, setIsLoadingMessage] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  
  const [fromNumber, setFromNumber] = useState<PhoneNumber>('01076567933');
  
  const [showProfileImageModal, setShowProfileImageModal] = useState(false);
  const [currentAdminName, setCurrentAdminName] = useState<string>('관리자');
  const [evaluationKey, setEvaluationKey] = useState(0);
  
  // 직무 경험 추가 관련 상태
  const [allJobCodes, setAllJobCodes] = useState<JobCodeWithId[]>([]);
  const [selectedJobCodeId, setSelectedJobCodeId] = useState<string>('');
  const [selectedGroup, setSelectedGroup] = useState<JobGroup>('junior');
  const [selectedGroupRole, setSelectedGroupRole] = useState<'담임' | '수업' | '서포트' | '리더'>('담임');
  const [classCodeInput, setClassCodeInput] = useState<string>('');
  const [allGenerations, setAllGenerations] = useState<string[]>([]);
  const [selectedGeneration, setSelectedGeneration] = useState<string>('');
  const [filteredJobCodes, setFilteredJobCodes] = useState<JobCodeWithId[]>([]);
  const [showJobCodeForm, setShowJobCodeForm] = useState<string | null>(null); // 어떤 지원자의 직무 경험 추가 폼을 보여줄지
  const [userJobCodesMap, setUserJobCodesMap] = useState<Record<string, JobCodeWithGroup[]>>({}); // 각 사용자의 직무 경험 정보
  const [isLoadingJobCodes, setIsLoadingJobCodes] = useState<Record<string, boolean>>({}); // 각 사용자별 로딩 상태
  
  // 직무 경험 관련 상수
  const jobGroups = [
    { value: 'junior', label: '주니어' },
    { value: 'middle', label: '미들' },
    { value: 'senior', label: '시니어' },
    { value: 'spring', label: '스프링' },
    { value: 'summer', label: '서머' },
    { value: 'autumn', label: '어텀' },
    { value: 'winter', label: '윈터' },
    { value: 'common', label: '공통' },
    { value: 'manager', label: '매니저' },
  ];

  const groupRoleOptions = [
    { value: '담임', label: '담임' },
    { value: '수업', label: '수업' },
    { value: '서포트', label: '서포트' },
    { value: '리더', label: '리더' },
    { value: '매니저', label: '매니저' },
    { value: '부매니저', label: '부매니저' },
  ];
  
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
  
  const loadData = useCallback(async () => {
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
      
      // 모든 지원자의 지원 장소 정보를 로드
      await Promise.all(
        applicationsData.map(async (app) => {
          await loadUserAppliedCampsForList(app.refUserId);
        })
      );

      // 각 사용자의 직무 경험 정보 로드
      await Promise.all(
        applicationsData.map(async (app) => {
          if (app.user?.jobExperiences) {
            await loadUserJobCodes(app.user.userId, app.user.jobExperiences);
          }
        })
      );
    } catch (error) {
      console.error('데이터 로드 오류:', error);
      toast.error('데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [jobBoardId, router]);
  
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auth 상태 변경 시 관리자 이름 로드
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        loadCurrentAdminName();
      }
    });

    return () => unsubscribe();
  }, []);

  // 직무 코드 로딩
  useEffect(() => {
    const loadAllJobCodes = async () => {
      try {
        const jobCodes = await getAllJobCodes();
        setAllJobCodes(jobCodes);
        
        // 기수 목록 추출 및 정렬
        const generations = Array.from(new Set(jobCodes.map(code => code.generation)))
          .sort((a, b) => {
            const numA = parseInt(a.replace(/[^0-9]/g, ''));
            const numB = parseInt(b.replace(/[^0-9]/g, ''));
            return numB - numA; // 내림차순 정렬
          });
        setAllGenerations(generations);
      } catch (error) {
        console.error('직무 코드 로딩 실패:', error);
      }
    };
    
    loadAllJobCodes();
  }, []);

  // 선택된 generation이 변경될 때 코드 필터링
  useEffect(() => {
    if (!selectedGeneration) {
      setFilteredJobCodes([]);
      return;
    }
    
    const filtered = allJobCodes.filter(code => code.generation === selectedGeneration);
    
    // 코드 기준으로 정렬
    filtered.sort((a, b) => {
      if (a.code < b.code) return -1;
      if (a.code > b.code) return 1;
      return 0;
    });
    
    setFilteredJobCodes(filtered);
    setSelectedJobCodeId(''); // 선택 초기화
  }, [selectedGeneration, allJobCodes]);

  // 현재 관리자 이름 로드 (이메일 기준으로 찾기)
  const loadCurrentAdminName = async () => {
    try {
      const currentUser = auth.currentUser;
      console.log('🔍 Current user in applicants:', currentUser?.uid, currentUser?.email);
      
      if (currentUser && currentUser.email) {
        // 이메일을 기준으로 users 컬렉션에서 사용자 찾기
        console.log('📧 Searching for user by email in applicants:', currentUser.email);
        
        try {
          const usersSnapshot = await getDocs(collection(db, 'users'));
          const userByEmail = usersSnapshot.docs.find(doc => {
            const data = doc.data() as User;
            return data.email === currentUser.email;
          });
          
          if (userByEmail) {
            const userData = userByEmail.data() as User;
            console.log('✅ Found user by email in applicants:', { 
              docId: userByEmail.id,
              name: userData.name, 
              email: userData.email,
              hasName: !!userData.name,
              nameLength: userData.name?.length || 0,
              nameType: typeof userData.name
            });
            
            if (userData.name && typeof userData.name === 'string' && userData.name.trim().length > 0) {
              console.log('✅ Using users.name from email search in applicants:', userData.name);
              setCurrentAdminName(userData.name.trim());
              return;
            } else {
              console.log('❌ users.name is empty or invalid in applicants:', userData.name);
            }
          } else {
            console.log('❌ No user found by email in users collection (applicants)');
          }
        } catch (emailSearchError) {
          console.error('Email search error in applicants:', emailSearchError);
        }
        
        // UID로도 시도해보기 (백업 방법)
        console.log('🔄 Trying UID as backup in applicants:', currentUser.uid);
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          console.log('📄 Found user by UID in applicants:', { 
            name: userData.name, 
            email: userData.email 
          });
          
          if (userData.name && typeof userData.name === 'string' && userData.name.trim().length > 0) {
            console.log('✅ Using users.name from UID search in applicants:', userData.name);
            setCurrentAdminName(userData.name.trim());
            return;
          }
        }
        
        // Firebase Auth의 displayName 사용
        if (currentUser.displayName) {
          console.log('✅ Using auth.displayName in applicants:', currentUser.displayName);
          setCurrentAdminName(currentUser.displayName);
          return;
        }
        
        // 이메일에서 이름 부분 추출 (최후의 수단)
        const emailName = currentUser.email.split('@')[0];
        console.log('⚠️ Using email name as fallback in applicants:', emailName);
        setCurrentAdminName(emailName);
      } else {
        console.log('❌ No current user or email in applicants');
        setCurrentAdminName('관리자');
      }
    } catch (error) {
      console.error('관리자 이름 로드 오류:', error);
      setCurrentAdminName('관리자');
    }
  };
  
  useEffect(() => {
    let filtered = [...applications];

    // 상태 필터링
    if (filterStatus !== 'all') {
      filtered = filtered.filter(app => {
        switch (filterStatus) {
          case 'pending':
            return app.applicationStatus === 'pending';
          case 'complete':
            return app.interviewStatus === 'complete';
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
    
    // 사용자 관련 데이터가 아직 로드되지 않았다면 로드
    if (!appliedCampsMap[app.refUserId]) {
      loadUserAppliedCamps(app.refUserId);
    }
  };
  
  // 사용자가 지원한 모든 캠프 제목 불러오기
  const loadUserAppliedCamps = async (userId: string) => {
    try {
      // 사용자의 모든 지원 이력 조회
      const applicationsRef = collection(db, 'applicationHistories');
      const q = query(applicationsRef, where('refUserId', '==', userId));
      const applicationsSnapshot = await getDocs(q);
      
      // 지원한 모든 jobBoard ID 수집
      const jobBoardIds = applicationsSnapshot.docs.map(doc => doc.data().refJobBoardId);
      
      // 중복 제거
      const uniqueJobBoardIds = [...new Set(jobBoardIds)];
      
      // 각 jobBoard의 jobCode만 가져오기
      const jobCodes = await Promise.all(
        uniqueJobBoardIds.map(async (id) => {
          const jobBoardRef = doc(db, 'jobBoards', id);
          const jobBoardDoc = await getDoc(jobBoardRef);
          
          if (jobBoardDoc.exists()) {
            const data = jobBoardDoc.data();
            return data.jobCode;
          }
          return null;
        })
      );
      
      // null 값 제거하고 중복 제거 후 설정
      const filteredCodes = jobCodes.filter(code => code !== null) as string[];
      const uniqueCodes = [...new Set(filteredCodes)];
      
      // 사용자 ID와 지원 장소 매핑 정보 업데이트
      setAppliedCampsMap(prev => ({
        ...prev,
        [userId]: uniqueCodes
      }));
    } catch (error) {
      console.error('지원 캠프 로드 오류:', error);
      setAppliedCampsMap(prev => ({
        ...prev,
        [userId]: []
      }));
    }
  };
  
  // 사용자가 지원한 모든 캠프 제목 불러오기 (목록용)
  const loadUserAppliedCampsForList = async (userId: string) => {
    try {
      // 사용자의 모든 지원 이력 조회
      const applicationsRef = collection(db, 'applicationHistories');
      const q = query(applicationsRef, where('refUserId', '==', userId));
      const applicationsSnapshot = await getDocs(q);
      
      // 지원한 모든 jobBoard ID 수집
      const jobBoardIds = applicationsSnapshot.docs.map(doc => doc.data().refJobBoardId);
      
      // 중복 제거
      const uniqueJobBoardIds = [...new Set(jobBoardIds)];
      
      // 각 jobBoard의 jobCode만 가져오기
      const jobCodes = await Promise.all(
        uniqueJobBoardIds.map(async (id) => {
          const jobBoardRef = doc(db, 'jobBoards', id);
          const jobBoardDoc = await getDoc(jobBoardRef);
          
          if (jobBoardDoc.exists()) {
            const data = jobBoardDoc.data();
            return data.jobCode;
          }
          return null;
        })
      );
      
      // null 값 제거하고 중복 제거 후 설정
      const filteredCodes = jobCodes.filter(code => code !== null) as string[];
      const uniqueCodes = [...new Set(filteredCodes)];
      
      // 사용자 ID와 지원 장소 매핑 정보 업데이트
      setAppliedCampsMap(prev => ({
        ...prev,
        [userId]: uniqueCodes
      }));
    } catch (error) {
      console.error('지원 캠프 로드 오류:', error);
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
      finalAccepted: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: '합격' },
      finalRejected: { bg: 'bg-red-100', text: 'text-red-800', label: '불합격' },
      finalAbsent: { bg: 'bg-red-100', text: 'text-red-800', label: '불참' },
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

  // 직무 경험 추가 핸들러
  const handleAddJobCode = async (userId: string) => {
    if (!selectedJobCodeId) {
      toast.error('직무 코드를 선택해주세요.');
      return;
    }
    
    try {
      const updatedJobExperiences = await addUserJobCode(
        userId,
        selectedJobCodeId,
        selectedGroup,
        selectedGroupRole,
        classCodeInput.trim() || undefined
      );
      
      // 지원자 목록 업데이트
      setApplications(prevApps => prevApps.map(app =>
        app.user?.userId === userId
          ? { ...app, user: { ...app.user!, jobExperiences: updatedJobExperiences } }
          : app
      ));
      
      setFilteredApplications(prevApps => prevApps.map(app =>
        app.user?.userId === userId
          ? { ...app, user: { ...app.user!, jobExperiences: updatedJobExperiences } }
          : app
      ));
      
      // 직무 경험 정보 다시 로드
      await loadUserJobCodes(userId, updatedJobExperiences);
      
      // 폼 초기화
      setSelectedJobCodeId('');
      setSelectedGeneration('');
      setSelectedGroupRole('담임');
      setClassCodeInput('');
      setShowJobCodeForm(null);
      
      toast.success('직무 코드가 추가되었습니다.');
    } catch (error) {
      console.error('직무 코드 추가 실패:', error);
      toast.error('직무 코드 추가에 실패했습니다.');
    }
  };

  // 직무 경험 추가 폼 토글
  const toggleJobCodeForm = (userId: string) => {
    if (showJobCodeForm === userId) {
      setShowJobCodeForm(null);
      // 폼 초기화
      setSelectedJobCodeId('');
      setSelectedGeneration('');
      setSelectedGroupRole('담임');
      setClassCodeInput('');
    } else {
      setShowJobCodeForm(userId);
    }
  };


  // 사용자의 직무 경험 정보 로드
  const loadUserJobCodes = async (userId: string, jobExperiences?: Array<{id: string, group: JobGroup, groupRole: string, classCode?: string}>) => {
    if (!jobExperiences || jobExperiences.length === 0) {
      setUserJobCodesMap(prev => ({ ...prev, [userId]: [] }));
      return;
    }

    setIsLoadingJobCodes(prev => ({ ...prev, [userId]: true }));
    try {
      const jobCodes = await getUserJobCodesInfo(jobExperiences);
      setUserJobCodesMap(prev => ({ ...prev, [userId]: jobCodes }));
    } catch (error) {
      console.error('직무 경험 정보 로드 실패:', error);
      setUserJobCodesMap(prev => ({ ...prev, [userId]: [] }));
    } finally {
      setIsLoadingJobCodes(prev => ({ ...prev, [userId]: false }));
    }
  };

  // 직무 경험 삭제 핸들러
  const handleRemoveJobCode = async (userId: string, jobCodeId: string) => {
    const user = applications.find(app => app.user?.userId === userId)?.user;
    if (!user) return;
    
    try {
      const updatedJobExperiences = user.jobExperiences?.filter(exp => 
        exp.id !== jobCodeId
      ) || [];
      
      await updateUser(userId, { jobExperiences: updatedJobExperiences });
      
      // 지원자 목록 업데이트
      setApplications(prevApps => prevApps.map(app =>
        app.user?.userId === userId
          ? { ...app, user: { ...app.user!, jobExperiences: updatedJobExperiences } }
          : app
      ));
      
      setFilteredApplications(prevApps => prevApps.map(app =>
        app.user?.userId === userId
          ? { ...app, user: { ...app.user!, jobExperiences: updatedJobExperiences } }
          : app
      ));

      // 직무 경험 정보 다시 로드
      await loadUserJobCodes(userId, updatedJobExperiences);
      
      toast.success('직무 경험이 삭제되었습니다.');
    } catch (error) {
      console.error('직무 경험 삭제 실패:', error);
      toast.error('직무 경험 삭제에 실패했습니다.');
    }
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
    setShowInterviewScheduledMessage(false);
    setShowInterviewPassMessage(false);
    setShowInterviewFailMessage(false);
    setShowFinalPassMessage(false);
    setShowFinalFailMessage(false);
  };

  // 상태별 템플릿 로드 함수
  const loadTemplates = useCallback(async () => {
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
      
      // interview_scheduled 템플릿 로드
      const interviewScheduledTemplate = await getSMSTemplateByTypeAndJobBoard('interview_scheduled', jobBoard.id);
      if (interviewScheduledTemplate) {
        setInterviewScheduledMessage(interviewScheduledTemplate.content);
      } else {
        // 기본 면접 예정 메시지 설정
        setInterviewScheduledMessage(`안녕하세요, {이름}님.\n${jobBoard.title} 서류 전형 합격을 축하드립니다.\n\n면접 일정을 안내드립니다.\n• 면접 일시: {면접일자} {면접시간}\n• 면접 링크: {면접링크}\n• 면접 시간: {면접시간} (약 {면접소요시간}분)\n\n준비사항: {면접참고사항}\n\n면접에 참석해주시기 바랍니다.`);
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
  }, [jobBoard]);

  // 선택된 지원자가 변경될 때 모든 템플릿 로드
  useEffect(() => {
    if (selectedApplication?.user) {
      loadTemplates();
    }
  }, [selectedApplication, loadTemplates]);

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
        case 'interview_scheduled':
          setInterviewScheduledMessage(content);
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
      case 'interview_scheduled':
        if(showInterviewScheduledMessage) {
          setShowInterviewScheduledMessage(false);
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
    setShowInterviewScheduledMessage(false);
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
      case 'interview_scheduled':
        setShowInterviewScheduledMessage(true);
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
                onClick={() => setFilterStatus('complete')}
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  filterStatus === 'complete'
                    ? 'bg-purple-100 text-purple-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className="inline-flex items-center">
                  <span className="h-2 w-2 rounded-full bg-purple-500 mr-1"></span>
                  <span>면접 완료자</span>
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
        
        {isLoading && !selectedApplication ? (
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
                          {/* 왼쪽: 지원자 기본 정보 (너비 제한) */}
                          <div className="flex flex-col mr-2 flex-grow-0 max-w-[60%] min-w-0 overflow-hidden">
                            <h3 className="text-sm font-medium text-gray-900 truncate">
                            {app.user?.name ? `${app.user.name} (${app.user.age})` : app.refUserId}
                            </h3>
                            <p className="text-xs text-gray-500 truncate">
                              연락처: {app.user?.phoneNumber ? formatPhoneNumber(app.user.phoneNumber) : ''}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {app.user?.university ? `${app.user.university} ${app.user.grade === 6 ? '졸업생' : `${app.user.grade}학년 ${app.user.isOnLeave === null ? '졸업생' : app.user.isOnLeave ? '휴학생' : '재학생'}`}` : ''}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              경로: {app.user?.referralPath} {app.user?.referrerName ? `(${app.user.referrerName})` : ''}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              <span className="font-medium">지원 장소:</span> {appliedCampsMap[app.refUserId]?.length > 0 
                                ? appliedCampsMap[app.refUserId].join(' / ') 
                                : '정보 없음'}
                            </p>
                          </div>
                          
                          {/* 오른쪽: 상태 배지 (고정 너비) */}
                          <div className="flex flex-col items-end gap-1 flex-shrink-0 min-w-[40%]">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-500">서류:</span>
                              {getStatusBadge(app.applicationStatus, 'application')}
                              {app.user?.evaluationSummary?.documentReview && (
                                <span className={`text-xs font-medium ${getScoreTextColor(app.user.evaluationSummary.documentReview.averageScore, 10)}`}>
                                  ({app.user.evaluationSummary.documentReview.averageScore.toFixed(1)})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-500">면접:</span>
                              {app.interviewStatus 
                                ? getStatusBadge(app.interviewStatus, 'interview')
                                : <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">미정</span>}
                              {app.user?.evaluationSummary?.interview && (
                                <span className={`text-xs font-medium ${getScoreTextColor(app.user.evaluationSummary.interview.averageScore, 10)}`}>
                                  ({app.user.evaluationSummary.interview.averageScore.toFixed(1)})
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-gray-500">최종:</span>
                              {app.finalStatus 
                                ? getStatusBadge(app.finalStatus, 'final')
                                : <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800">미정</span>}
                              {app.user?.evaluationSummary?.faceToFaceEducation && (
                                <span className={`text-xs font-medium ${getScoreTextColor(app.user.evaluationSummary.faceToFaceEducation.averageScore, 10)}`}>
                                  ({app.user.evaluationSummary.faceToFaceEducation.averageScore.toFixed(1)})
                                </span>
                              )}
                            </div>
                            {/* 직무 경험 코드 및 캠프 점수 표시 */}
                            {app.user?.jobExperiences && app.user.jobExperiences.length > 0 && userJobCodesMap[app.user.userId] && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-gray-500">캠프:</span>
                                <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700 font-medium">
                                  {userJobCodesMap[app.user.userId]?.map(jobCode => jobCode.code).join(', ')}
                                </span>
                                {app.user?.evaluationSummary?.campLife && (
                                  <span className={`text-xs font-medium ${getScoreTextColor(app.user.evaluationSummary.campLife.averageScore, 10)}`}>
                                    ({app.user.evaluationSummary.campLife.averageScore.toFixed(1)})
                                  </span>
                                )}
                              </div>
                            )}
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
                          <div className="flex items-center">
                            <h2 className="text-xl font-bold text-gray-900">
                              {selectedApplication.user?.name || selectedApplication.refUserId}
                            </h2>
                            {selectedApplication.user?.profileImage && (
                              <button
                                onClick={() => setShowProfileImageModal(true)}
                                className="ml-2 p-1 text-blue-600 hover:text-blue-800 rounded-full hover:bg-blue-100 transition-colors duration-150"
                                title="프로필 이미지 크게 보기"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </button>
                            )}
                          </div>
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
                              <p>
                                <span className="font-medium">지원 장소:</span> {appliedCampsMap[selectedApplication.refUserId]?.length > 0 
                                  ? appliedCampsMap[selectedApplication.refUserId].join(' / ') 
                                  : '정보 없음'}
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
                            {selectedApplication.interviewStatus === 'pending' && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => showMessageBox('interview_scheduled')}
                                className="text-xs md:text-sm w-full"
                              >
                                {showInterviewScheduledMessage ? "메세지 내용 닫기" : "메세지 내용 열기"}
                              </Button>
                            )}
                            
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
                          <label className="block text-sm font-medium text-green-700 mb-2">
                            서류 합격 메시지 내용
                          </label>
                          <textarea
                            className="w-full p-2 border border-green-300 rounded-md text-sm mb-3"
                            rows={5}
                            value={documentPassMessage}
                            onChange={(e) => setDocumentPassMessage(e.target.value)}
                          />
                          <div className="mb-3">
                            <label className="block text-sm font-medium text-green-700 mb-2">
                              발신번호 선택
                            </label>
                            <div className="flex items-center space-x-4">
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-green-600"
                                  name="fromNumberPass"
                                  checked={fromNumber === '01076567933'}
                                  onChange={() => setFromNumber('01076567933')}
                                />
                                <span className="ml-2 text-sm">010-7656-7933</span>
                              </label>
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-green-600"
                                  name="fromNumberPass"
                                  checked={fromNumber === '01067117933'}
                                  onChange={() => setFromNumber('01067117933')}
                                />
                                <span className="ml-2 text-sm">010-6711-7933</span>
                              </label>
                            </div>
                          </div>
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
                          <label className="block text-sm font-medium text-red-700 mb-2">
                            서류 불합격 메시지 내용
                          </label>
                          <textarea
                            className="w-full p-2 border border-red-300 rounded-md text-sm mb-3" 
                            rows={5}
                            value={documentFailMessage}
                            onChange={(e) => setDocumentFailMessage(e.target.value)}
                          />
                          <div className="mb-3">
                            <label className="block text-sm font-medium text-red-700 mb-2">
                              발신번호 선택
                            </label>
                            <div className="flex items-center space-x-4">
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-red-600"
                                  name="fromNumberFail"
                                  checked={fromNumber === '01076567933'}
                                  onChange={() => setFromNumber('01076567933')}
                                />
                                <span className="ml-2 text-sm">010-7656-7933</span>
                              </label>
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-red-600"
                                  name="fromNumberFail"
                                  checked={fromNumber === '01067117933'}
                                  onChange={() => setFromNumber('01067117933')}
                                />
                                <span className="ml-2 text-sm">010-6711-7933</span>
                              </label>
                            </div>
                          </div>
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
                      
                      {/* 면접 예정 메시지 박스 */}
                      {showInterviewScheduledMessage && (
                        <div className="mt-4 border border-blue-200 rounded-md p-4 bg-blue-50">
                          <label className="block text-sm font-medium text-blue-700 mb-2">
                            면접 예정 메시지 내용
                          </label>
                          <textarea
                            className="w-full p-2 border border-blue-300 rounded-md text-sm mb-3"
                            rows={8}
                            value={interviewScheduledMessage}
                            onChange={(e) => setInterviewScheduledMessage(e.target.value)}
                          />
                          <div className="mb-3">
                            <label className="block text-sm font-medium text-blue-700 mb-2">
                              발신번호 선택
                            </label>
                            <div className="flex items-center space-x-4">
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-blue-600"
                                  name="fromNumberScheduled"
                                  checked={fromNumber === '01076567933'}
                                  onChange={() => setFromNumber('01076567933')}
                                />
                                <span className="ml-2 text-sm">010-7656-7933</span>
                              </label>
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-blue-600"
                                  name="fromNumberScheduled"
                                  checked={fromNumber === '01067117933'}
                                  onChange={() => setFromNumber('01067117933')}
                                />
                                <span className="ml-2 text-sm">010-6711-7933</span>
                              </label>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => setShowInterviewScheduledMessage(false)}
                            >
                              취소
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => saveTemplate('interview_scheduled', interviewScheduledMessage)}
                              isLoading={isSavingTemplate}
                            >
                              저장
                            </Button>
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => sendMessage(interviewScheduledMessage)}
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
                          <label className="block text-sm font-medium text-green-700 mb-2">
                            면접 합격 메시지 내용
                          </label>
                          <textarea
                            className="w-full p-2 border border-green-300 rounded-md text-sm mb-3"
                            rows={5}
                            value={interviewPassMessage}
                            onChange={(e) => setInterviewPassMessage(e.target.value)}
                          />
                          <div className="mb-3">
                            <label className="block text-sm font-medium text-green-700 mb-2">
                              발신번호 선택
                            </label>
                            <div className="flex items-center space-x-4">
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-green-600"
                                  name="fromNumberInterviewPass"
                                  checked={fromNumber === '01076567933'}
                                  onChange={() => setFromNumber('01076567933')}
                                />
                                <span className="ml-2 text-sm">010-7656-7933</span>
                              </label>
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-green-600"
                                  name="fromNumberInterviewPass"
                                  checked={fromNumber === '01067117933'}
                                  onChange={() => setFromNumber('01067117933')}
                                />
                                <span className="ml-2 text-sm">010-6711-7933</span>
                              </label>
                            </div>
                          </div>
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
                          <label className="block text-sm font-medium text-red-700 mb-2">
                            면접 불합격 메시지 내용
                          </label>
                          <textarea
                            className="w-full p-2 border border-red-300 rounded-md text-sm mb-3" 
                            rows={5}
                            value={interviewFailMessage}
                            onChange={(e) => setInterviewFailMessage(e.target.value)}
                          />
                          <div className="mb-3">
                            <label className="block text-sm font-medium text-red-700 mb-2">
                              발신번호 선택
                            </label>
                            <div className="flex items-center space-x-4">
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-red-600"
                                  name="fromNumberInterviewFail"
                                  checked={fromNumber === '01076567933'}
                                  onChange={() => setFromNumber('01076567933')}
                                />
                                <span className="ml-2 text-sm">010-7656-7933</span>
                              </label>
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-red-600"
                                  name="fromNumberInterviewFail"
                                  checked={fromNumber === '01067117933'}
                                  onChange={() => setFromNumber('01067117933')}
                                />
                                <span className="ml-2 text-sm">010-6711-7933</span>
                              </label>
                            </div>
                          </div>
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
                          <label className="block text-sm font-medium text-green-700 mb-2">
                            최종 합격 메시지 내용
                          </label>
                          <textarea
                            className="w-full p-2 border border-green-300 rounded-md text-sm mb-3"
                            rows={5}
                            value={finalPassMessage}
                            onChange={(e) => setFinalPassMessage(e.target.value)}
                          />
                          <div className="mb-3">
                            <label className="block text-sm font-medium text-green-700 mb-2">
                              발신번호 선택
                            </label>
                            <div className="flex items-center space-x-4">
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-green-600"
                                  name="fromNumberFinalPass"
                                  checked={fromNumber === '01076567933'}
                                  onChange={() => setFromNumber('01076567933')}
                                />
                                <span className="ml-2 text-sm">010-7656-7933</span>
                              </label>
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-green-600"
                                  name="fromNumberFinalPass"
                                  checked={fromNumber === '01067117933'}
                                  onChange={() => setFromNumber('01067117933')}
                                />
                                <span className="ml-2 text-sm">010-6711-7933</span>
                              </label>
                            </div>
                          </div>
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
                          <label className="block text-sm font-medium text-red-700 mb-2">
                            최종 불합격 메시지 내용
                          </label>
                          <textarea
                            className="w-full p-2 border border-red-300 rounded-md text-sm mb-3" 
                            rows={5}
                            value={finalFailMessage}
                            onChange={(e) => setFinalFailMessage(e.target.value)}
                          />
                          <div className="mb-3">
                            <label className="block text-sm font-medium text-red-700 mb-2">
                              발신번호 선택
                            </label>
                            <div className="flex items-center space-x-4">
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-red-600"
                                  name="fromNumberFinalFail"
                                  checked={fromNumber === '01076567933'}
                                  onChange={() => setFromNumber('01076567933')}
                                />
                                <span className="ml-2 text-sm">010-7656-7933</span>
                              </label>
                              <label className="inline-flex items-center">
                                <input
                                  type="radio"
                                  className="form-radio text-red-600"
                                  name="fromNumberFinalFail"
                                  checked={fromNumber === '01067117933'}
                                  onChange={() => setFromNumber('01067117933')}
                                />
                                <span className="ml-2 text-sm">010-6711-7933</span>
                              </label>
                            </div>
                          </div>
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
                      
                    </div>

                    {/* 직무 경험 관리 섹션 */}
                    {selectedApplication.finalStatus === 'finalAccepted' && selectedApplication.user && (
                      <div className="mb-6 pb-6 border-b border-gray-200">
                        <div className="flex justify-between items-center mb-4">
                          <h3 className="text-lg font-semibold">직무 경험 관리</h3>
                          <Button
                            onClick={() => toggleJobCodeForm(selectedApplication.user!.userId)}
                            className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-md"
                          >
                            {showJobCodeForm === selectedApplication.user.userId ? '취소' : '직무 추가'}
                          </Button>
                        </div>
                        
                        {/* 기존 직무 경험 목록 */}
                        {isLoadingJobCodes[selectedApplication.user.userId] ? (
                          <div className="py-4">
                            <div className="animate-pulse h-4 bg-gray-200 rounded w-32"></div>
                          </div>
                        ) : userJobCodesMap[selectedApplication.user.userId]?.length === 0 ? (
                          <p className="text-gray-500 mb-4">등록된 직무 경험이 없습니다.</p>
                          ) : (
                            <div className="space-y-3 mb-4">
                              {userJobCodesMap[selectedApplication.user.userId]?.map(jobCode => {
                                const exp = selectedApplication.user?.jobExperiences?.find(exp => exp.id === jobCode.id);
                                const groupRole = exp?.groupRole;
                                const classCode = exp?.classCode;
                                return (
                                  <div key={jobCode.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1 min-w-0">
                                        {/* 메인 정보 */}
                                        <div className="flex items-center gap-2 mb-2">
                                          <h4 className="text-sm font-medium text-gray-900 truncate">
                                            {jobCode.generation} {jobCode.name}
                                          </h4>
                                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                            {jobCode.code}
                                          </span>
                                        </div>
                                        
                                        {/* 배지들 */}
                                        <div className="flex flex-wrap gap-2">
                                          {jobCode.group && (
                                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                              jobCode.group === 'junior' ? 'bg-green-100 text-green-700' :
                                              jobCode.group === 'middle' ? 'bg-yellow-100 text-yellow-700' :
                                              jobCode.group === 'senior' ? 'bg-red-100 text-red-700' :
                                              jobCode.group === 'spring' ? 'bg-blue-100 text-blue-700' :
                                              jobCode.group === 'summer' ? 'bg-purple-100 text-purple-700' :
                                              jobCode.group === 'autumn' ? 'bg-orange-100 text-orange-700' :
                                              jobCode.group === 'winter' ? 'bg-pink-100 text-pink-700' :
                                              jobCode.group === 'common' ? 'bg-gray-100 text-gray-700' :
                                              jobCode.group === 'manager' ? 'bg-indigo-100 text-indigo-700' :
                                              'bg-gray-100 text-gray-700'
                                            }`}>
                                              {jobCode.group === 'junior' ? '주니어' :
                                               jobCode.group === 'middle' ? '미들' :
                                               jobCode.group === 'senior' ? '시니어' :
                                               jobCode.group === 'spring' ? '스프링' :
                                               jobCode.group === 'summer' ? '서머' :
                                               jobCode.group === 'autumn' ? '어텀' :
                                               jobCode.group === 'winter' ? '윈터' :
                                               jobCode.group === 'common' ? '공통' :
                                               '매니저'}
                                            </span>
                                          )}
                                          {groupRole && (
                                            <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                                              {groupRole}
                                            </span>
                                          )}
                                          {classCode && (
                                            <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
                                              {classCode}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      
                                      {/* 삭제 버튼 */}
                                      <button
                                        onClick={() => handleRemoveJobCode(selectedApplication.user!.userId, jobCode.id)}
                                        className="ml-3 flex-shrink-0 p-1 text-gray-400 hover:text-red-500 focus:outline-none focus:text-red-500 transition-colors"
                                        aria-label="직무 경험 삭제"
                                      >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                        {/* 직무 경험 추가 폼 */}
                        {showJobCodeForm === selectedApplication.user?.userId && (
                          <div className="mt-4 p-3 sm:p-4 bg-gray-50 rounded-lg border">
                            <h4 className="text-sm sm:text-md font-medium text-gray-700 mb-3 sm:mb-4">직무 경험 추가</h4>
                            
                            <div className="space-y-3 sm:space-y-4">
                              {/* 기수 선택 */}
                              <div>
                                <label className="block text-sm text-gray-600 mb-1 sm:mb-2">기수</label>
                                <select
                                  value={selectedGeneration}
                                  onChange={(e) => setSelectedGeneration(e.target.value)}
                                  className="w-full p-2 sm:p-3 text-sm sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                  <option value="">기수 선택...</option>
                                  {allGenerations.map(gen => (
                                    <option key={gen} value={gen}>
                                      {gen}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              
                              {/* 직무 코드 선택 */}
                              <div>
                                <label className="block text-sm text-gray-600 mb-1 sm:mb-2">직무 코드</label>
                                <select
                                  value={selectedJobCodeId}
                                  onChange={(e) => setSelectedJobCodeId(e.target.value)}
                                  className="w-full p-2 sm:p-3 text-sm sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  disabled={!selectedGeneration || filteredJobCodes.length === 0}
                                >
                                  <option value="">직무 코드 선택...</option>
                                  {filteredJobCodes.map(jobCode => (
                                    <option 
                                      key={jobCode.id} 
                                      value={jobCode.id}
                                      title={`${jobCode.code} - ${jobCode.name}`}
                                    >
                                      {jobCode.code} - {jobCode.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              
                              {/* 모바일: 세로 배치, 데스크톱: 가로 배치 */}
                              <div className="space-y-3 sm:space-y-0 sm:grid sm:grid-cols-3 sm:gap-4">
                                {/* 그룹 선택 */}
                                <div>
                                  <label className="block text-sm text-gray-600 mb-1 sm:mb-2">그룹</label>
                                  <select
                                    value={selectedGroup}
                                    onChange={(e) => setSelectedGroup(e.target.value as JobGroup)}
                                    className="w-full p-2 sm:p-3 text-sm sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    {jobGroups.map((group, index) => (
                                      <option key={`group-option-${group.value}-${index}`} value={group.value}>
                                        {group.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                
                                {/* 역할 선택 */}
                                <div>
                                  <label className="block text-sm text-gray-600 mb-1 sm:mb-2">역할</label>
                                  <select
                                    value={selectedGroupRole}
                                    onChange={(e) => setSelectedGroupRole(e.target.value as '담임' | '수업' | '서포트' | '리더')}
                                    className="w-full p-2 sm:p-3 text-sm sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  >
                                    {groupRoleOptions.map((role) => (
                                      <option key={role.value} value={role.value}>{role.label}</option>
                                    ))}
                                  </select>
                                </div>
                                
                                {/* 반 코드 입력 */}
                                <div>
                                  <label className="block text-sm text-gray-600 mb-1 sm:mb-2">반 코드</label>
                                  <input
                                    type="text"
                                    value={classCodeInput}
                                    onChange={e => setClassCodeInput(e.target.value)}
                                    placeholder="반 코드 입력"
                                    className="w-full p-2 sm:p-3 text-sm sm:text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    maxLength={32}
                                  />
                                </div>
                              </div>
                              
                              {/* 버튼들 - 모바일에서 세로 배치 */}
                              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
                                <Button
                                  onClick={() => handleAddJobCode(selectedApplication.user!.userId)}
                                  disabled={!selectedJobCodeId}
                                  className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300"
                                >
                                  추가
                                </Button>
                                <Button
                                  onClick={() => toggleJobCodeForm(selectedApplication.user!.userId)}
                                  className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400"
                                >
                                  취소
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 평가 점수 현황 */}
                    {selectedApplication.user && (
                      <div className="mb-6 pb-6 border-b border-gray-200">
                        <h3 className="text-lg font-semibold mb-4">평가 점수 현황</h3>
                        <EvaluationStageCards 
                          key={evaluationKey} 
                          userId={selectedApplication.user.id}
                          targetUserName={selectedApplication.user.name}
                          evaluatorName={currentAdminName}
                          refApplicationId={selectedApplication.id}
                          refJobBoardId={jobBoard?.id}
                          onEvaluationSuccess={() => setEvaluationKey(prev => prev + 1)}
                        />
                      </div>
                    )}

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
                          <div className="mt-6 flex justify-end">
                            <Button
                              variant="danger"
                              size="sm"
                              isLoading={isLoading}
                              onClick={async () => {
                                if (!selectedApplication) return;
                                if (!window.confirm('정말로 이 지원자를 지원 취소시키시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
                                setIsLoading(true);
                                try {
                                  await cancelApplication(selectedApplication.id);
                                  setApplications(prev => prev.filter(app => app.id !== selectedApplication.id));
                                  setSelectedApplication(null);
                                  toast.success('지원이 성공적으로 취소되었습니다.');
                                } catch {
                                  toast.error('지원 취소에 실패했습니다.');
                                } finally {
                                  setIsLoading(false);
                                }
                              }}
                            >
                              지원 취소시키기
                            </Button>
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
          <div className="fixed inset-0 bg-black bg-black/0 flex items-center justify-center z-50 p-4">
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
                      checked={fromNumber === '01076567933'}
                      onChange={() => setFromNumber('01076567933')}
                    />
                    <span className="ml-2">010-7656-7933</span>
                  </label>
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
        

        {/* 프로필 이미지 모달 */}
        {showProfileImageModal && selectedApplication?.user?.profileImage && (
          <div className="fixed inset-0 bg-black bg-black/0 flex items-center justify-center z-50 p-4">
            <div className="relative bg-white rounded-lg p-1 max-w-2xl max-h-[90vh] overflow-hidden">
              <button
                onClick={() => setShowProfileImageModal(false)}
                className="absolute top-2 right-2 bg-gray-200 text-gray-800 rounded-full p-1 hover:bg-gray-300 transition-colors duration-150 focus:outline-none"
                aria-label="닫기"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="w-full h-full max-h-[calc(90vh-2rem)] overflow-hidden">
                <img
                  src={selectedApplication.user.profileImage}
                  alt={selectedApplication.user.name || '프로필 이미지'}
                  className="w-full h-auto object-contain"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
} 