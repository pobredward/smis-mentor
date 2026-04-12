import React, { useState, useEffect, useCallback } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DropDownPicker from 'react-native-dropdown-picker';
import { db, auth } from '../config/firebase';
import {
  getApplicationsByJobBoardId,
  updateApplication,
  getUserById,
  canChangeInterviewStatus,
  canChangeFinalStatus,
  getInterviewStatusChangeWarning,
  getFinalStatusChangeWarning,
  getScoreColor,
  EvaluationStage,
  getSMSTemplateByTypeAndJobBoard,
  replaceTemplateVariables,
  DEFAULT_SMS_TEMPLATES,
  TemplateType,
  saveSMSTemplate,
  updateSMSTemplate,
} from '@smis-mentor/shared';
import { AdminStackScreenProps } from '../navigation/types';
import { EvaluationStageCards, EvaluationForm, SMSMessageBox } from '../components';
import { sendCustomSMS } from '../services';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Timestamp } from 'firebase/firestore';

interface User {
  id: string;
  userId: string;
  name: string;
  email: string;
  phoneNumber: string;
  age?: number;
  gender?: string;
  profileImage?: string;
  university?: string;
  grade?: number;
  isOnLeave?: boolean | null;
  referralPath?: string;
  referrerName?: string;
  selfIntroduction?: string;
  jobMotivation?: string;
  address?: string;
  addressDetail?: string;
  major1?: string;
  major2?: string;
  feedback?: string;
  partTimeJobs?: Array<{
    companyName: string;
    period: string;
    position: string;
    description: string;
  }>;
}

interface ApplicationWithUser {
  id: string;
  applicationStatus: string;
  interviewStatus?: string;
  finalStatus?: string;
  refUserId: string;
  refJobBoardId: string;
  applicationDate: any;
  interviewDate?: any;
  interviewFeedback?: string;
  interviewBaseLink?: string;
  interviewBaseDuration?: number;
  interviewBaseNotes?: string;
  user?: User;
}

export function ApplicantDetailScreen({
  route,
  navigation,
}: AdminStackScreenProps<'ApplicantDetail'>) {
  const { applicationId, jobBoardId } = route.params;
  const [application, setApplication] = useState<ApplicationWithUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [appliedCamps, setAppliedCamps] = useState<string[]>([]);

  // 현재 로그인한 사용자 정보
  const [currentUser, setCurrentUser] = useState<{ name: string } | null>(null);

  // 평가 폼 상태
  const [showEvaluationForm, setShowEvaluationForm] = useState(false);
  const [selectedEvaluationStage, setSelectedEvaluationStage] = useState<EvaluationStage | null>(null);

  // 드롭다운 상태
  const [documentStatus, setDocumentStatus] = useState<string>('');
  const [interviewStatus, setInterviewStatus] = useState<string>('');
  const [finalStatus, setFinalStatus] = useState<string>('');

  // 드롭다운 open 상태 (react-native-dropdown-picker용)
  const [documentOpen, setDocumentOpen] = useState(false);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [finalOpen, setFinalOpen] = useState(false);

  // 드롭다운 items
  const [documentItems, setDocumentItems] = useState([
    { label: '검토중', value: 'pending' },
    { label: '합격', value: 'accepted' },
    { label: '불합격', value: 'rejected' },
  ]);
  const [interviewItems, setInterviewItems] = useState([
    { label: '미정', value: '' },
    { label: '예정', value: 'pending' },
    { label: '완료', value: 'complete' },
    { label: '합격', value: 'passed' },
    { label: '불합격', value: 'failed' },
    { label: '면접불참', value: 'absent' },
  ]);
  const [finalItems, setFinalItems] = useState([
    { label: '미정', value: '' },
    { label: '합격', value: 'finalAccepted' },
    { label: '불합격', value: 'finalRejected' },
  ]);

  // 메시지 관련 상태
  const [showDocumentPassMessage, setShowDocumentPassMessage] = useState(false);
  const [showDocumentFailMessage, setShowDocumentFailMessage] = useState(false);
  const [showInterviewScheduledMessage, setShowInterviewScheduledMessage] = useState(false);
  const [showInterviewPassMessage, setShowInterviewPassMessage] = useState(false);
  const [showInterviewFailMessage, setShowInterviewFailMessage] = useState(false);
  const [showFinalPassMessage, setShowFinalPassMessage] = useState(false);
  const [showFinalFailMessage, setShowFinalFailMessage] = useState(false);
  
  const [documentPassMessage, setDocumentPassMessage] = useState('');
  const [documentFailMessage, setDocumentFailMessage] = useState('');
  const [interviewScheduledMessage, setInterviewScheduledMessage] = useState('');
  const [interviewPassMessage, setInterviewPassMessage] = useState('');
  const [interviewFailMessage, setInterviewFailMessage] = useState('');
  const [finalPassMessage, setFinalPassMessage] = useState('');
  const [finalFailMessage, setFinalFailMessage] = useState('');
  
  // 발신번호 선택 (기본값: 01076567933)
  const [fromNumber, setFromNumber] = useState<'01076567933' | '01067117933'>('01076567933');
  
  // 템플릿 로딩/저장 상태
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isSendingSMS, setIsSendingSMS] = useState(false);

  // 면접 정보 설정
  const [showInterviewSettings, setShowInterviewSettings] = useState(false);
  const [interviewDate, setInterviewDate] = useState(''); // yyyy-MM-dd 형식
  const [interviewTime, setInterviewTime] = useState(''); // HH:mm 형식
  const [interviewLink, setInterviewLink] = useState('');
  const [interviewDuration, setInterviewDuration] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('');

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const applications = await getApplicationsByJobBoardId(db, jobBoardId);
      const app = applications.find((a: any) => a.id === applicationId);

      if (!app) {
        Alert.alert('오류', '지원자를 찾을 수 없습니다.');
        navigation.goBack();
        return;
      }

      const userData = await getUserById(db, app.refUserId);
      const appWithUser = { ...app, user: userData };
      setApplication(appWithUser);

      // 현재 상태 설정
      setDocumentStatus(app.applicationStatus || 'pending');
      setInterviewStatus(app.interviewStatus || '');
      setFinalStatus(app.finalStatus || '');

      // 면접 정보 설정
      if (app.interviewDate) {
        // Firestore Timestamp를 Date로 변환
        const date = app.interviewDate.toDate();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        setInterviewDate(`${year}-${month}-${day}`);
        setInterviewTime(`${hours}:${minutes}`);
      } else {
        setInterviewDate('');
        setInterviewTime('');
      }
      
      // 면접 base 정보 설정
      if (app.interviewBaseLink) {
        setInterviewLink(app.interviewBaseLink);
      } else {
        setInterviewLink('https://us06web.zoom.us/j/3016520037?pwd=dd11bOqRxjjdq5ptzbnyHXmZjPTEXe.1');
      }
      
      if (app.interviewBaseDuration) {
        setInterviewDuration(String(app.interviewBaseDuration));
      } else {
        setInterviewDuration('60');
      }
      
      if (app.interviewBaseNotes) {
        setInterviewNotes(app.interviewBaseNotes);
      } else {
        setInterviewNotes('회의 ID: 301 652 0037\n비밀번호: 1234\n면접 시작 5분 전 접속 바랍니다.');
      }

      // 지원 장소 로드
      await loadUserAppliedCamps(app.refUserId);
    } catch (error) {
      logger.error('데이터 로드 오류:', error);
      Alert.alert('오류', '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [applicationId, jobBoardId, navigation]);

  // 사용자가 지원한 모든 캠프 코드 불러오기
  const loadUserAppliedCamps = async (userId: string) => {
    try {
      const { collection, query, where, getDocs, doc, getDoc } = await import('firebase/firestore');
      
      // 사용자의 모든 지원 이력 조회
      const applicationsRef = collection(db, 'applicationHistories');
      const q = query(applicationsRef, where('refUserId', '==', userId));
      const applicationsSnapshot = await getDocs(q);

      // 지원한 모든 jobBoard ID 수집
      const jobBoardIds = applicationsSnapshot.docs.map(docSnap => docSnap.data().refJobBoardId);

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

      setAppliedCamps(uniqueCodes);
    } catch (error) {
      logger.error('지원 캠프 로드 오류:', error);
      setAppliedCamps([]);
    }
  };

  useEffect(() => {
    loadData();
    loadCurrentUser();
  }, [loadData]);

  // 템플릿 로드 함수 (웹과 동일한 로직)
  const loadTemplates = useCallback(async () => {
    if (!jobBoardId) return;
    
    try {
      setIsLoadingTemplates(true);
      
      // document_pass 템플릿 로드
      const documentPassTemplate = await getSMSTemplateByTypeAndJobBoard(db, 'document_pass', jobBoardId);
      if (documentPassTemplate) {
        setDocumentPassMessage(documentPassTemplate.content);
      } else {
        setDocumentPassMessage(DEFAULT_SMS_TEMPLATES['document_pass']);
      }
      
      // document_fail 템플릿 로드
      const documentFailTemplate = await getSMSTemplateByTypeAndJobBoard(db, 'document_fail', jobBoardId);
      if (documentFailTemplate) {
        setDocumentFailMessage(documentFailTemplate.content);
      } else {
        setDocumentFailMessage(DEFAULT_SMS_TEMPLATES['document_fail']);
      }
      
      // interview_scheduled 템플릿 로드
      const interviewScheduledTemplate = await getSMSTemplateByTypeAndJobBoard(db, 'interview_scheduled', jobBoardId);
      if (interviewScheduledTemplate) {
        setInterviewScheduledMessage(interviewScheduledTemplate.content);
      } else {
        setInterviewScheduledMessage(DEFAULT_SMS_TEMPLATES['interview_scheduled']);
      }
      
      // interview_pass 템플릿 로드
      const interviewPassTemplate = await getSMSTemplateByTypeAndJobBoard(db, 'interview_pass', jobBoardId);
      if (interviewPassTemplate) {
        setInterviewPassMessage(interviewPassTemplate.content);
      } else {
        setInterviewPassMessage(DEFAULT_SMS_TEMPLATES['interview_pass']);
      }
      
      // interview_fail 템플릿 로드
      const interviewFailTemplate = await getSMSTemplateByTypeAndJobBoard(db, 'interview_fail', jobBoardId);
      if (interviewFailTemplate) {
        setInterviewFailMessage(interviewFailTemplate.content);
      } else {
        setInterviewFailMessage(DEFAULT_SMS_TEMPLATES['interview_fail']);
      }
      
      // final_pass 템플릿 로드
      const finalPassTemplate = await getSMSTemplateByTypeAndJobBoard(db, 'final_pass', jobBoardId);
      if (finalPassTemplate) {
        setFinalPassMessage(finalPassTemplate.content);
      } else {
        setFinalPassMessage(DEFAULT_SMS_TEMPLATES['final_pass']);
      }
      
      // final_fail 템플릿 로드
      const finalFailTemplate = await getSMSTemplateByTypeAndJobBoard(db, 'final_fail', jobBoardId);
      if (finalFailTemplate) {
        setFinalFailMessage(finalFailTemplate.content);
      } else {
        setFinalFailMessage(DEFAULT_SMS_TEMPLATES['final_fail']);
      }
    } catch (error) {
      logger.error('템플릿 로드 실패:', error);
      // 실패 시 기본 템플릿 사용 (사용자에게 알림 없이)
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [jobBoardId]);

  // jobBoardId가 변경되면 템플릿 로드
  useEffect(() => {
    if (jobBoardId) {
      loadTemplates();
    }
  }, [jobBoardId, loadTemplates]);

  // 현재 로그인한 사용자 정보 로드
  const loadCurrentUser = async () => {
    try {
      const currentAuthUser = auth.currentUser;
      if (currentAuthUser) {
        const userData = await getUserById(db, currentAuthUser.uid);
        if (userData && userData.name) {
          setCurrentUser({ name: userData.name });
        } else {
          setCurrentUser({ name: '관리자' });
        }
      } else {
        setCurrentUser({ name: '관리자' });
      }
    } catch (error) {
      logger.error('현재 사용자 정보 로드 오류:', error);
      setCurrentUser({ name: '관리자' });
    }
  };

  // 서류 상태 변경
  const handleDocumentStatusChange = async (newStatus: string) => {
    if (newStatus === application?.applicationStatus) return;

    // 로컬 상태 즉시 업데이트
    setApplication(prev => prev ? { ...prev, applicationStatus: newStatus } : prev);
    setDocumentStatus(newStatus);
    
    // 합격/불합격 시 메시지 박스도 표시
    if (newStatus === 'accepted') {
      setShowDocumentPassMessage(true);
    } else if (newStatus === 'rejected') {
      setShowDocumentFailMessage(true);
    }

    // DB 업데이트는 백그라운드로
    try {
      await updateApplication(db, applicationId, { applicationStatus: newStatus });
    } catch (error) {
      logger.error('상태 업데이트 오류:', error);
      Alert.alert('오류', '상태 변경 중 오류가 발생했습니다.');
      // 실패 시 롤백
      if (application) {
        setApplication(prev => prev ? { ...prev, applicationStatus: application.applicationStatus } : prev);
        setDocumentStatus(application.applicationStatus || 'pending');
      }
    }
  };

  // 면접 상태 변경
  const handleInterviewStatusChange = async (newStatus: string) => {
    if (newStatus === application?.interviewStatus) return;

    // 면접 예정으로 변경 시 - 로컬 상태 즉시 업데이트
    if (newStatus === 'pending') {
      // 로컬 상태 즉시 업데이트
      setApplication(prev => prev ? { ...prev, interviewStatus: 'pending' } : prev);
      setInterviewStatus('pending');
      
      // 면접 정보 기본값 설정 (자동으로 박스를 열지는 않음)
      if (!interviewLink) {
        setInterviewLink(application?.interviewBaseLink || 'https://us06web.zoom.us/j/3016520037?pwd=dd11bOqRxjjdq5ptzbnyHXmZjPTEXe.1');
      }
      if (!interviewDuration) {
        setInterviewDuration(application?.interviewBaseDuration ? String(application.interviewBaseDuration) : '60');
      }
      if (!interviewNotes) {
        setInterviewNotes(application?.interviewBaseNotes || '회의 ID: 301 652 0037\n비밀번호: 1234\n면접 전 미리 Zoom에 접속하여 테스트해주시기 바랍니다.');
      }
      
      // DB 업데이트는 백그라운드로
      try {
        await updateApplication(db, applicationId, { interviewStatus: 'pending' });
      } catch (error) {
        logger.error('면접 상태 업데이트 오류:', error);
        Alert.alert('오류', '면접 상태 변경 중 오류가 발생했습니다.');
        // 실패 시 롤백
        if (application) {
          setApplication(prev => prev ? { ...prev, interviewStatus: application.interviewStatus } : prev);
          setInterviewStatus(application.interviewStatus || '');
        }
      }
      return;
    }
    
    // 다른 면접 상태는 로컬 상태 즉시 업데이트 후 메시지 박스 표시
    setApplication(prev => prev ? { ...prev, interviewStatus: newStatus } : prev);
    setInterviewStatus(newStatus);
    
    // 면접 정보 박스 닫기
    setShowInterviewSettings(false);
    
    // 상태에 따라 메시지 박스 표시
    if (newStatus === 'passed') {
      setShowInterviewPassMessage(true);
    } else if (newStatus === 'failed') {
      setShowInterviewFailMessage(true);
    }
    
    // DB 업데이트는 백그라운드로
    try {
      await updateApplication(db, applicationId, { interviewStatus: newStatus });
    } catch (error) {
      logger.error('면접 상태 업데이트 오류:', error);
      Alert.alert('오류', '면접 상태 변경 중 오류가 발생했습니다.');
      // 실패 시 롤백
      if (application) {
        setApplication(prev => prev ? { ...prev, interviewStatus: application.interviewStatus } : prev);
        setInterviewStatus(application.interviewStatus || '');
      }
    }
  };

  // 최종 상태 변경
  const handleFinalStatusChange = async (newStatus: string) => {
    if (newStatus === application?.finalStatus) return;
    
    // 로컬 상태 즉시 업데이트
    setApplication(prev => prev ? { ...prev, finalStatus: newStatus } : prev);
    setFinalStatus(newStatus);
    
    // 합격/불합격 시 메시지 박스도 표시
    if (newStatus === 'finalAccepted') {
      setShowFinalPassMessage(true);
    } else if (newStatus === 'finalRejected') {
      setShowFinalFailMessage(true);
    }
    
    // DB 업데이트는 백그라운드로
    try {
      await updateApplication(db, applicationId, { finalStatus: newStatus });
    } catch (error) {
      logger.error('최종 상태 업데이트 오류:', error);
      Alert.alert('오류', '최종 상태 변경 중 오류가 발생했습니다.');
      // 실패 시 롤백
      if (application) {
        setApplication(prev => prev ? { ...prev, finalStatus: application.finalStatus } : prev);
        setFinalStatus(application.finalStatus || '');
      }
    }
  };
  
  // 메시지 박스 토글 (웹과 동일한 로직)
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
  
  // 템플릿 저장만 수행
  const saveTemplate = async (
    type: TemplateType,
    content: string
  ) => {
    try {
      setIsSavingTemplate(true);
      
      // 템플릿 저장 또는 업데이트
      const existingTemplate = await getSMSTemplateByTypeAndJobBoard(db, type, jobBoardId);
      
      if (auth.currentUser) {
        if (existingTemplate && existingTemplate.id) {
          // 기존 템플릿 업데이트
          await updateSMSTemplate(db, existingTemplate.id, {
            content,
            type,
            refJobBoardId: jobBoardId,
          });
        } else {
          // 새 템플릿 저장
          await saveSMSTemplate(db, {
            title: `${type} 템플릿`,
            content,
            type,
            refJobBoardId: jobBoardId,
            createdBy: auth.currentUser.uid,
          });
        }
      }
      
      Alert.alert('성공', '템플릿이 저장되었습니다.');
      
      // 로컬 상태 업데이트
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
      
      // 백그라운드에서 최신 템플릿 로드
      loadTemplates().catch(error => {
        logger.error('템플릿 로드 실패:', error);
      });
    } catch (error) {
      logger.error('템플릿 저장 실패:', error);
      Alert.alert('오류', '템플릿 저장에 실패했습니다.');
    } finally {
      setIsSavingTemplate(false);
    }
  };
  
  // SMS 전송만 수행 (상태는 이미 드롭다운에서 업데이트됨)
  const sendSMS = async (
    type: TemplateType,
    content: string,
    applicationStatus?: string,
    interviewStatus?: string,
    finalStatus?: string
  ) => {
    if (!application?.user?.phoneNumber) {
      Alert.alert('오류', '전화번호가 없습니다.');
      return;
    }
    
    try {
      setIsSendingSMS(true);
      
      // 변수 치환
      const variables: Record<string, string> = {
        이름: application.user.name || '',
      };
      
      const messageContent = replaceTemplateVariables(content, variables);
      
      // SMS 전송
      const result = await sendCustomSMS(
        application.user.phoneNumber,
        messageContent,
        application.user.name,
        fromNumber
      );
      
      if (result.success) {
        Alert.alert('성공', 'SMS가 성공적으로 전송되었습니다.');
        
        // 메시지 박스 닫기
        setShowDocumentPassMessage(false);
        setShowDocumentFailMessage(false);
        setShowInterviewScheduledMessage(false);
        setShowInterviewPassMessage(false);
        setShowInterviewFailMessage(false);
        setShowFinalPassMessage(false);
        setShowFinalFailMessage(false);
        
        // 데이터 새로고침
        await loadData();
      } else {
        Alert.alert('오류', `SMS 전송 실패: ${result.message}`);
      }
    } catch (error) {
      logger.error('SMS 전송 실패:', error);
      Alert.alert('오류', 'SMS 전송 중 오류가 발생했습니다.');
    } finally {
      setIsSendingSMS(false);
    }
  };

  const formatPhoneNumber = (phone?: string): string => {
    if (!phone) return '-';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp || !timestamp.seconds) return '-';
    const date = new Date(timestamp.seconds * 1000);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(
      date.getDate()
    ).padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f59e0b" />
          <Text style={styles.loadingText}>정보를 불러오는 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!application) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>지원자를 찾을 수 없습니다.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* 헤더 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>{application.user?.name || '지원자 정보'}</Text>
          <Text style={styles.headerSubtitle}>지원일: {formatDate(application.applicationDate)}</Text>
        </View>
      </View>

      <ScrollView style={styles.content}>
        {/* 기본 정보 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>기본 정보</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>신상</Text>
            <Text style={styles.infoValue}>
              {application.user?.name || '-'} / {application.user?.age ? `${application.user.age}세` : '-'} / {application.user?.gender || '-'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>전화번호</Text>
            <TouchableOpacity
              onPress={() =>
                application.user?.phoneNumber && Linking.openURL(`tel:${application.user.phoneNumber}`)
              }
            >
              <Text style={[styles.infoValue, styles.infoValueLink]}>
                {formatPhoneNumber(application.user?.phoneNumber)}
              </Text>
            </TouchableOpacity>
          </View>

          {application.user?.address && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>주소</Text>
              <Text style={styles.infoValue} numberOfLines={2}>
                {application.user.address} {application.user.addressDetail || ''}
              </Text>
            </View>
          )}

          {application.user?.university && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>학교</Text>
              <Text style={styles.infoValue} numberOfLines={2}>
                {application.user.university}{' '}
                {application.user.grade === 6
                  ? '졸업생'
                  : `${application.user.grade}학년 ${
                      application.user.isOnLeave === null
                        ? '졸업생'
                        : application.user.isOnLeave
                        ? '휴학생'
                        : '재학생'
                    }`}
              </Text>
            </View>
          )}

          {(application.user?.major1 || application.user?.major2) && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>전공</Text>
              <Text style={styles.infoValue} numberOfLines={2}>
                {application.user?.major1 || '-'} | {application.user?.major2 || '-'}
              </Text>
            </View>
          )}

          {application.user?.referralPath && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>지원경로</Text>
              <Text style={styles.infoValue} numberOfLines={2}>
                {application.user.referralPath}
                {application.user.referralPath === '지인추천' && application.user.referrerName
                  ? ` (추천인: ${application.user.referrerName})`
                  : application.user.referrerName
                  ? ` (${application.user.referrerName})`
                  : ''}
              </Text>
            </View>
          )}

          {appliedCamps.length > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>지원 장소</Text>
              <Text style={styles.infoValue} numberOfLines={2}>
                {appliedCamps.join(' / ')}
              </Text>
            </View>
          )}
        </View>

        {/* 평가 점수 현황 - Interactive */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>평가 점수 현황</Text>
          {application.user && (
            <EvaluationStageCards
              userId={application.user.userId}
              onAddEvaluation={(stage) => {
                setSelectedEvaluationStage(stage);
                setShowEvaluationForm(true);
              }}
            />
          )}
        </View>

        {/* 상태 관리 섹션 - 3열 배치 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>상태 관리</Text>
          <View style={styles.statusGridContainer}>
            {/* 서류 상태 */}
            <View style={styles.statusColumn}>
              <Text style={styles.statusColumnLabel}>서류</Text>
              <DropDownPicker
                open={documentOpen}
                value={documentStatus}
                items={documentItems}
                setOpen={(open) => {
                  if (open) {
                    setInterviewOpen(false);
                    setFinalOpen(false);
                  }
                  setDocumentOpen(open);
                }}
                setValue={setDocumentStatus}
                setItems={setDocumentItems}
                onSelectItem={(item) => {
                  handleDocumentStatusChange(item.value as string);
                }}
                placeholder="선택"
                style={styles.dropdown}
                textStyle={styles.dropdownText}
                dropDownContainerStyle={styles.dropdownContainer}
                listMode="SCROLLVIEW"
                scrollViewProps={{
                  nestedScrollEnabled: true,
                }}
                zIndex={9000}
                zIndexInverse={1000}
              />
              
              {/* 서류 메시지 열기/닫기 버튼 */}
              {application?.applicationStatus === 'accepted' && (
                <TouchableOpacity
                  style={styles.statusMessageButton}
                  onPress={() => showMessageBox('document_pass')}
                >
                  <Text style={styles.statusMessageButtonText}>
                    {showDocumentPassMessage ? '메시지 닫기' : '메시지 열기'}
                  </Text>
                </TouchableOpacity>
              )}
              
              {application?.applicationStatus === 'rejected' && (
                <TouchableOpacity
                  style={styles.statusMessageButton}
                  onPress={() => showMessageBox('document_fail')}
                >
                  <Text style={styles.statusMessageButtonText}>
                    {showDocumentFailMessage ? '메시지 닫기' : '메시지 열기'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 면접 상태 */}
            <View style={styles.statusColumn}>
              <Text style={styles.statusColumnLabel}>면접</Text>
              <DropDownPicker
                open={interviewOpen}
                value={interviewStatus}
                items={interviewItems}
                setOpen={(open) => {
                  // 서류 합격이 아니면 드롭다운 열지 않음
                  if (open && !canChangeInterviewStatus(documentStatus as any)) {
                    const warning = getInterviewStatusChangeWarning(documentStatus as any);
                    if (warning) {
                      Alert.alert('알림', warning);
                    }
                    return;
                  }
                  if (open) {
                    setDocumentOpen(false);
                    setFinalOpen(false);
                  }
                  setInterviewOpen(open);
                }}
                setValue={setInterviewStatus}
                setItems={setInterviewItems}
                onSelectItem={(item) => {
                  handleInterviewStatusChange(item.value as string);
                }}
                placeholder="선택"
                style={[
                  styles.dropdown,
                  !canChangeInterviewStatus(documentStatus as any) && styles.dropdownDisabled,
                ]}
                textStyle={[
                  styles.dropdownText,
                  !canChangeInterviewStatus(documentStatus as any) && styles.dropdownTextDisabled,
                ]}
                dropDownContainerStyle={styles.dropdownContainer}
                listMode="SCROLLVIEW"
                scrollViewProps={{
                  nestedScrollEnabled: true,
                }}
                zIndex={8000}
                zIndexInverse={2000}
                disabled={!canChangeInterviewStatus(documentStatus as any)}
              />
              
              {/* 면접 메시지 열기/닫기 버튼 */}
              {application?.interviewStatus === 'pending' && (
                <TouchableOpacity
                  style={styles.statusMessageButton}
                  onPress={() => showMessageBox('interview_scheduled')}
                >
                  <Text style={styles.statusMessageButtonText}>
                    {showInterviewScheduledMessage ? '메시지 닫기' : '메시지 열기'}
                  </Text>
                </TouchableOpacity>
              )}
              
              {application?.interviewStatus === 'passed' && (
                <TouchableOpacity
                  style={styles.statusMessageButton}
                  onPress={() => showMessageBox('interview_pass')}
                >
                  <Text style={styles.statusMessageButtonText}>
                    {showInterviewPassMessage ? '메시지 닫기' : '메시지 열기'}
                  </Text>
                </TouchableOpacity>
              )}
              
              {application?.interviewStatus === 'failed' && (
                <TouchableOpacity
                  style={styles.statusMessageButton}
                  onPress={() => showMessageBox('interview_fail')}
                >
                  <Text style={styles.statusMessageButtonText}>
                    {showInterviewFailMessage ? '메시지 닫기' : '메시지 열기'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 최종 상태 */}
            <View style={styles.statusColumn}>
              <Text style={styles.statusColumnLabel}>최종</Text>
              <DropDownPicker
                open={finalOpen}
                value={finalStatus}
                items={finalItems}
                setOpen={(open) => {
                  // 면접 합격이 아니면 드롭다운 열지 않음
                  if (open && !canChangeFinalStatus(interviewStatus as any)) {
                    const warning = getFinalStatusChangeWarning(interviewStatus as any);
                    if (warning) {
                      Alert.alert('알림', warning);
                    }
                    return;
                  }
                  if (open) {
                    setDocumentOpen(false);
                    setInterviewOpen(false);
                  }
                  setFinalOpen(open);
                }}
                setValue={setFinalStatus}
                setItems={setFinalItems}
                onSelectItem={(item) => {
                  handleFinalStatusChange(item.value as string);
                }}
                placeholder="선택"
                style={[
                  styles.dropdown,
                  !canChangeFinalStatus(interviewStatus as any) && styles.dropdownDisabled,
                ]}
                textStyle={[
                  styles.dropdownText,
                  !canChangeFinalStatus(interviewStatus as any) && styles.dropdownTextDisabled,
                ]}
                dropDownContainerStyle={styles.dropdownContainer}
                listMode="SCROLLVIEW"
                scrollViewProps={{
                  nestedScrollEnabled: true,
                }}
                zIndex={7000}
                zIndexInverse={3000}
                disabled={!canChangeFinalStatus(interviewStatus as any)}
              />
              
              {/* 최종 메시지 열기/닫기 버튼 */}
              {application?.finalStatus === 'finalAccepted' && (
                <TouchableOpacity
                  style={styles.statusMessageButton}
                  onPress={() => showMessageBox('final_pass')}
                >
                  <Text style={styles.statusMessageButtonText}>
                    {showFinalPassMessage ? '메시지 닫기' : '메시지 열기'}
                  </Text>
                </TouchableOpacity>
              )}
              
              {application?.finalStatus === 'finalRejected' && (
                <TouchableOpacity
                  style={styles.statusMessageButton}
                  onPress={() => showMessageBox('final_fail')}
                >
                  <Text style={styles.statusMessageButtonText}>
                    {showFinalFailMessage ? '메시지 닫기' : '메시지 열기'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* 서류 메시지 박스들 - 전체 너비 */}
          {showDocumentPassMessage && (
            <SMSMessageBox
              type="document_pass"
              currentJobBoardId={jobBoardId}
              message={documentPassMessage}
              onMessageChange={setDocumentPassMessage}
              fromNumber={fromNumber}
              onFromNumberChange={setFromNumber}
              onSave={() => saveTemplate('document_pass', documentPassMessage)}
              onSend={() => sendSMS('document_pass', documentPassMessage, 'accepted')}
              onCancel={() => {
                setShowDocumentPassMessage(false);
                setDocumentStatus(application?.applicationStatus || 'pending');
              }}
              isSaving={isSavingTemplate}
              isSending={isSendingSMS}
              backgroundColor="#d1fae5"
              buttonColor="#10b981"
              title="서류 합격 메시지 내용"
            />
          )}

          {showDocumentFailMessage && (
            <SMSMessageBox
              type="document_fail"
              currentJobBoardId={jobBoardId}
              message={documentFailMessage}
              onMessageChange={setDocumentFailMessage}
              fromNumber={fromNumber}
              onFromNumberChange={setFromNumber}
              onSave={() => saveTemplate('document_fail', documentFailMessage)}
              onSend={() => sendSMS('document_fail', documentFailMessage, 'rejected')}
              onCancel={() => {
                setShowDocumentFailMessage(false);
                setDocumentStatus(application?.applicationStatus || 'pending');
              }}
              isSaving={isSavingTemplate}
              isSending={isSendingSMS}
              backgroundColor="#fee2e2"
              buttonColor="#ef4444"
              title="서류 불합격 메시지 내용"
            />
          )}
          
          {/* 면접 메시지 박스들 - 전체 너비 */}
          {showInterviewScheduledMessage && (
            <SMSMessageBox
              type="interview_scheduled"
              currentJobBoardId={jobBoardId}
              message={interviewScheduledMessage}
              onMessageChange={setInterviewScheduledMessage}
              fromNumber={fromNumber}
              onFromNumberChange={setFromNumber}
              onSave={() => saveTemplate('interview_scheduled', interviewScheduledMessage)}
              onSend={() => sendSMS('interview_scheduled', interviewScheduledMessage, undefined, 'pending')}
              onCancel={() => {
                setShowInterviewScheduledMessage(false);
              }}
              isSaving={isSavingTemplate}
              isSending={isSendingSMS}
              backgroundColor="#dbeafe"
              buttonColor="#3b82f6"
              title="면접 예정 메시지 내용"
            />
          )}
          
          {showInterviewPassMessage && (
            <SMSMessageBox
              type="interview_pass"
              currentJobBoardId={jobBoardId}
              message={interviewPassMessage}
              onMessageChange={setInterviewPassMessage}
              fromNumber={fromNumber}
              onFromNumberChange={setFromNumber}
              onSave={() => saveTemplate('interview_pass', interviewPassMessage)}
              onSend={() => sendSMS('interview_pass', interviewPassMessage, undefined, 'passed')}
              onCancel={() => {
                setShowInterviewPassMessage(false);
                setInterviewStatus(application?.interviewStatus || '');
              }}
              isSaving={isSavingTemplate}
              isSending={isSendingSMS}
              backgroundColor="#d1fae5"
              buttonColor="#10b981"
              title="면접 합격 메시지 내용"
            />
          )}
          
          {showInterviewFailMessage && (
            <SMSMessageBox
              type="interview_fail"
              currentJobBoardId={jobBoardId}
              message={interviewFailMessage}
              onMessageChange={setInterviewFailMessage}
              fromNumber={fromNumber}
              onFromNumberChange={setFromNumber}
              onSave={() => saveTemplate('interview_fail', interviewFailMessage)}
              onSend={() => sendSMS('interview_fail', interviewFailMessage, undefined, 'failed')}
              onCancel={() => {
                setShowInterviewFailMessage(false);
                setInterviewStatus(application?.interviewStatus || '');
              }}
              isSaving={isSavingTemplate}
              isSending={isSendingSMS}
              backgroundColor="#fee2e2"
              buttonColor="#ef4444"
              title="면접 불합격 메시지 내용"
            />
          )}
          
          {/* 최종 메시지 박스들 - 전체 너비 */}
          {showFinalPassMessage && (
            <SMSMessageBox
              type="final_pass"
              currentJobBoardId={jobBoardId}
              message={finalPassMessage}
              onMessageChange={setFinalPassMessage}
              fromNumber={fromNumber}
              onFromNumberChange={setFromNumber}
              onSave={() => saveTemplate('final_pass', finalPassMessage)}
              onSend={() => sendSMS('final_pass', finalPassMessage, undefined, undefined, 'finalAccepted')}
              onCancel={() => {
                setShowFinalPassMessage(false);
                setFinalStatus(application?.finalStatus || '');
              }}
              isSaving={isSavingTemplate}
              isSending={isSendingSMS}
              backgroundColor="#d1fae5"
              buttonColor="#10b981"
              title="최종 합격 메시지 내용"
            />
          )}
          
          {showFinalFailMessage && (
            <SMSMessageBox
              type="final_fail"
              currentJobBoardId={jobBoardId}
              message={finalFailMessage}
              onMessageChange={setFinalFailMessage}
              fromNumber={fromNumber}
              onFromNumberChange={setFromNumber}
              onSave={() => saveTemplate('final_fail', finalFailMessage)}
              onSend={() => sendSMS('final_fail', finalFailMessage, undefined, undefined, 'finalRejected')}
              onCancel={() => {
                setShowFinalFailMessage(false);
                setFinalStatus(application?.finalStatus || '');
              }}
              isSaving={isSavingTemplate}
              isSending={isSendingSMS}
              backgroundColor="#fee2e2"
              buttonColor="#ef4444"
              title="최종 불합격 메시지 내용"
            />
          )}
        </View>

        {/* 면접 일자 수정 */}
        {application?.interviewStatus === 'pending' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>면접 일자</Text>
            <View style={styles.interviewDateContainer}>
              <View style={styles.dateInputButtonRow}>
                <TextInput
                  style={styles.dateInput}
                  value={interviewDate}
                  onChangeText={setInterviewDate}
                  placeholder="2026-01-01"
                  placeholderTextColor="#9ca3af"
                  keyboardType="default"
                />
                <TextInput
                  style={styles.timeInput}
                  value={interviewTime}
                  onChangeText={setInterviewTime}
                  placeholder="14:00"
                  placeholderTextColor="#9ca3af"
                  keyboardType="default"
                />
                <TouchableOpacity
                  style={[
                    styles.dateChangeButton,
                    (!interviewDate || !interviewTime) && styles.dateChangeButtonDisabled,
                  ]}
                  onPress={async () => {
                    if (!interviewDate || !interviewTime) {
                      Alert.alert('알림', '날짜와 시간을 모두 입력해주세요.');
                      return;
                    }
                    try {
                      const dateTimeStr = `${interviewDate} ${interviewTime}`;
                      const dateTimeObj = new Date(dateTimeStr);
                      
                      if (isNaN(dateTimeObj.getTime())) {
                        Alert.alert('오류', '올바른 날짜/시간 형식이 아닙니다.');
                        return;
                      }

                      await updateApplication(db, application.id, {
                        interviewDate: Timestamp.fromDate(dateTimeObj),
                      });

                      Alert.alert('성공', '면접 일자가 변경되었습니다.');
                      loadData();
                    } catch (error) {
                      logger.error('면접 일자 변경 오류:', error);
                      Alert.alert('오류', '면접 일자 변경에 실패했습니다.');
                    }
                  }}
                  disabled={!interviewDate || !interviewTime}
                >
                  <Text style={styles.dateChangeButtonText}>변경</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.dateUnsetButton}
                  onPress={async () => {
                    try {
                      await updateApplication(db, application.id, {
                        interviewDate: null,
                      });
                      Alert.alert('성공', '면접 일자가 미정으로 변경되었습니다.');
                      loadData();
                    } catch (error) {
                      logger.error('면접 일자 미정 변경 오류:', error);
                      Alert.alert('오류', '면접 일자 변경에 실패했습니다.');
                    }
                  }}
                >
                  <Text style={styles.dateUnsetButtonText}>미정</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.currentDateInfo}>
                현재: {application.interviewDate
                  ? format(application.interviewDate.toDate(), 'yyyy-MM-dd (E) HH:mm', { locale: ko })
                  : '날짜 미정'}
              </Text>
            </View>
          </View>
        )}

        {/* 자기소개서 */}
        {application.user?.selfIntroduction && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>자기소개서</Text>
            <View style={styles.textBox}>
              <Text style={styles.textBoxContent}>{application.user.selfIntroduction}</Text>
            </View>
          </View>
        )}

        {/* 지원동기 */}
        {application.user?.jobMotivation && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>지원동기</Text>
            <View style={styles.textBox}>
              <Text style={styles.textBoxContent}>{application.user.jobMotivation}</Text>
            </View>
          </View>
        )}

        {/* 경력 */}
        {application.user?.partTimeJobs && application.user.partTimeJobs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>알바 & 멘토링 경력</Text>
            {application.user.partTimeJobs.map((job, index) => (
              <View key={index} style={styles.jobCard}>
                <View style={styles.jobCardHeader}>
                  <Text style={styles.jobCardTitle}>{job.companyName}</Text>
                  <Text style={styles.jobCardPeriod}>{job.period}</Text>
                </View>
                <Text style={styles.jobCardPosition}>담당: {job.position}</Text>
                <Text style={styles.jobCardDescription}>업무: {job.description}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* 평가 폼 모달 */}
      {showEvaluationForm && selectedEvaluationStage && application.user && (
        <Modal
          visible={showEvaluationForm}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowEvaluationForm(false)}
        >
          <EvaluationForm
            targetUserId={application.user.userId}
            targetUserName={application.user.name}
            evaluatorId={auth.currentUser?.uid || ''}
            evaluatorName={currentUser?.name || '관리자'}
            evaluationStage={selectedEvaluationStage}
            refApplicationId={application.id}
            refJobBoardId={application.refJobBoardId}
            onSuccess={() => {
              setShowEvaluationForm(false);
              setSelectedEvaluationStage(null);
              loadData();
            }}
            onCancel={() => {
              setShowEvaluationForm(false);
              setSelectedEvaluationStage(null);
            }}
          />
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
    width: 80,
    flexShrink: 0,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    flex: 1,
    textAlign: 'right',
  },
  infoValueLink: {
    color: '#3b82f6',
    textDecorationLine: 'underline',
  },
  evaluationContainer: {
    gap: 12,
  },
  evaluationCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  evaluationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  evaluationTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  evaluationScore: {
    fontSize: 18,
    fontWeight: '700',
  },
  evaluationCount: {
    fontSize: 12,
    color: '#6b7280',
  },
  messageBox: {
    marginTop: 16,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  messageBoxSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  messageBoxDanger: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  messageBoxInfo: {
    backgroundColor: '#eff6ff',
    borderColor: '#93c5fd',
  },
  messageBoxTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  fromNumberSection: {
    marginTop: 12,
    marginBottom: 12,
  },
  fromNumberLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  radioGroup: {
    flexDirection: 'row',
    gap: 16,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#6b7280',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3b82f6',
  },
  radioLabel: {
    fontSize: 14,
    color: '#374151',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    color: '#111827',
  },
  messageInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    height: 100,
    textAlignVertical: 'top',
  },
  messageBoxButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  messageButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  messageButtonCancel: {
    backgroundColor: '#f3f4f6',
  },
  messageButtonSuccess: {
    backgroundColor: '#22c55e',
  },
  messageButtonDanger: {
    backgroundColor: '#ef4444',
  },
  messageButtonInfo: {
    backgroundColor: '#3b82f6',
  },
  messageButtonTextCancel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  messageButtonTextSuccess: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  messageButtonTextDanger: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  messageButtonTextInfo: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  saveButton: {
    backgroundColor: '#6b7280',
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  messageButtonPrimary: {
    backgroundColor: '#3b82f6',
  },
  messageButtonTextPrimary: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  messageButtonSecondary: {
    backgroundColor: '#9ca3af',
  },
  messageButtonTextSecondary: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  statusMessageButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  statusMessageButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  textBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  textBoxContent: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 22,
  },
  textInputReadonly: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 20,
  },
  jobCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 10,
  },
  jobCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  jobCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  jobCardPeriod: {
    fontSize: 13,
    color: '#6b7280',
  },
  jobCardPosition: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 4,
  },
  jobCardDescription: {
    fontSize: 13,
    color: '#6b7280',
  },
  statusGridContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  statusColumn: {
    flex: 1,
    zIndex: 1,
  },
  statusColumnLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  dropdown: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    minHeight: 40,
  },
  dropdownDisabled: {
    backgroundColor: '#f3f4f6',
    opacity: 0.6,
  },
  dropdownText: {
    fontSize: 13,
    color: '#111827',
  },
  dropdownTextDisabled: {
    color: '#9ca3af',
  },
  dropdownContainer: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  interviewDateContainer: {
    marginTop: 12,
  },
  dateInputButtonRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
    alignItems: 'center',
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: '#ffffff',
    color: '#111827',
    width: 105,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: '#ffffff',
    color: '#111827',
    width: 70,
  },
  dateChangeButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  dateChangeButtonDisabled: {
    backgroundColor: '#d1d5db',
    opacity: 0.6,
  },
  dateChangeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  dateUnsetButton: {
    backgroundColor: '#6b7280',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  dateUnsetButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  currentDateInfo: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
});

