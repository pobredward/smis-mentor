import React, { useState, useEffect, useMemo } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DropDownPicker from 'react-native-dropdown-picker';
import { AdminStackScreenProps } from '../navigation/types';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  Timestamp,
  setDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { InterviewLinksManager } from '../components/InterviewLinksManager';
import { SMSMessageBox } from '../components/SMSMessageBox';
import EvaluationStageCards from '../components/EvaluationStageCards';
import EvaluationForm from '../components/EvaluationForm';
import { getInterviewLinks, InterviewLinks } from '../services/interviewLinksService';
import { sendCustomSMS } from '../services/smsService';
import type { JobBoard, ApplicationHistory, User } from '@smis-mentor/shared';
import { TemplateType, getSMSTemplateByTypeAndJobBoard, saveSMSTemplate, EvaluationStage } from '@smis-mentor/shared';
import { auth } from '../config/firebase';

type JobBoardWithId = JobBoard & { id: string };

type InterviewDateInfo = {
  jobBoardId: string;
  jobBoardTitle: string;
  date: Date;
  formattedDate: string;
  interviews: ApplicationWithUser[];
  recordingUrl?: string;
};

type ApplicationWithUser = ApplicationHistory & {
  id: string;
  user?: User;
  jobBoardTitle?: string;
  jobCode?: string;
};

export function InterviewManageScreen({
  navigation,
}: AdminStackScreenProps<'InterviewManage'>) {
  const [interviewDates, setInterviewDates] = useState<InterviewDateInfo[]>([]);
  const [selectedDate, setSelectedDate] = useState<InterviewDateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDates, setLoadingDates] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationWithUser | null>(null);
  const [showPastDates, setShowPastDates] = useState(false);
  const [showLinksManager, setShowLinksManager] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [scriptText, setScriptText] = useState('');
  const [isEditingScript, setIsEditingScript] = useState(false);
  const [interviewLinks, setInterviewLinks] = useState<InterviewLinks>({
    zoomUrl: '',
    canvaUrl: '',
  });
  const [interviewTime, setInterviewTime] = useState('');
  const [newSelectedDate, setNewSelectedDate] = useState('');

  // SMS 관련 상태
  const [showSMSMessage, setShowSMSMessage] = useState<Record<TemplateType, boolean>>({
    document_pass: false,
    document_fail: false,
    interview_scheduled: false,
    interview_pass: false,
    interview_fail: false,
    final_pass: false,
    final_fail: false,
  });
  const [smsMessages, setSmsMessages] = useState<Record<TemplateType, string>>({
    document_pass: '',
    document_fail: '',
    interview_scheduled: '',
    interview_pass: '',
    interview_fail: '',
    final_pass: '',
    final_fail: '',
  });
  const [fromNumber, setFromNumber] = useState<'01076567933' | '01067117933'>('01076567933');
  const [isSendingSMS, setIsSendingSMS] = useState(false);
  const [isSavingSMS, setIsSavingSMS] = useState(false);
  const [showProfileImageModal, setShowProfileImageModal] = useState(false);

  // 드롭다운 관련 상태
  const [openApplicationStatus, setOpenApplicationStatus] = useState(false);
  const [openInterviewStatus, setOpenInterviewStatus] = useState(false);
  const [openFinalStatus, setOpenFinalStatus] = useState(false);

  // 평가 모달 상태
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [selectedEvaluationStage, setSelectedEvaluationStage] = useState<EvaluationStage | null>(null);
  const [currentUser, setCurrentUser] = useState<{ name: string; userId: string } | null>(null);
  const [evaluationRefreshKey, setEvaluationRefreshKey] = useState(0);

  // 채용 공고 필터링
  const [jobCodes, setJobCodes] = useState<{ code: string; count: number }[]>([]);
  const [selectedJobBoard, setSelectedJobBoard] = useState<string>('전체');

  // 지원자별 지원 장소 정보
  const [appliedCampsMap, setAppliedCampsMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    loadInitialData();
    loadScript();
    loadInterviewLinks();
    loadCurrentUser();
  }, []);

  // 초기 데이터 로드
  const loadInitialData = async () => {
    try {
      setLoadingDates(true);
      const jobBoardsRef = collection(db, 'jobBoards');
      const jobBoardsSnapshot = await getDocs(jobBoardsRef);

      const jobBoardsData = jobBoardsSnapshot.docs.map((doc) => ({
        ...doc.data() as JobBoard,
        id: doc.id,
      }));

      await loadInterviewDates(jobBoardsData);
    } catch (error) {
      logger.error('채용 공고 로드 오류:', error);
      Alert.alert('오류', '채용 공고를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoadingDates(false);
      setLoading(false);
    }
  };

  // 모든 면접 일정 로드
  const loadInterviewDates = async (jobBoardsData: JobBoardWithId[]) => {
    try {
      const interviewDateMap = new Map<string, InterviewDateInfo>();

      const now = new Date();
      const fiveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const fiveMonthsAgoTimestamp = Timestamp.fromDate(fiveMonthsAgo);

      const undefinedDateKey = 'undefined-date';
      interviewDateMap.set(undefinedDateKey, {
        jobBoardId: 'undefined',
        jobBoardTitle: '날짜 미정',
        date: new Date(),
        formattedDate: '날짜 미정',
        interviews: [],
      });

      const applicationsRef = collection(db, 'applicationHistories');
      const q = query(
        applicationsRef,
        where('applicationStatus', '==', 'accepted'),
        where('interviewDate', '>=', fiveMonthsAgoTimestamp)
      );

      const qNoDate = query(
        applicationsRef,
        where('applicationStatus', '==', 'accepted'),
        where('interviewDate', '==', null)
      );

      const [applicationsSnapshot, noDateSnapshot] = await Promise.all([
        getDocs(q),
        getDocs(qNoDate),
      ]);

      const allDocs = [...applicationsSnapshot.docs, ...noDateSnapshot.docs];

      const userIds = [...new Set(allDocs.map((doc) => doc.data().refUserId))];
      const usersMap = new Map<string, User & { id: string }>();

      const userBatches = [];
      for (let i = 0; i < userIds.length; i += 30) {
        userBatches.push(userIds.slice(i, i + 30));
      }

      await Promise.all(
        userBatches.map(async (batch) => {
          const usersQuery = query(
            collection(db, 'users'),
            where('__name__', 'in', batch)
          );
          const usersSnapshot = await getDocs(usersQuery);
          usersSnapshot.docs.forEach((doc) => {
            usersMap.set(doc.id, { ...doc.data() as User, id: doc.id });
          });
        })
      );

      const applications = allDocs.map((docSnapshot) => {
        const data = docSnapshot.data() as ApplicationHistory;

        const jobBoard = jobBoardsData.find((jb) => jb.id === data.refJobBoardId);
        if (!jobBoard) return null;

        const userData = usersMap.get(data.refUserId);

        return {
          ...data,
          id: docSnapshot.id,
          user: userData,
          jobBoardTitle: jobBoard.title,
          jobCode: jobBoard.jobCode,
        } as ApplicationWithUser & { jobBoardTitle: string; jobCode: string };
      });

      const validApplications = applications.filter((app) => app !== null) as (ApplicationWithUser & {
        jobBoardTitle: string;
        jobCode: string;
      })[];

      for (const app of validApplications) {
        if (app.interviewDate) {
          const date = app.interviewDate.toDate();
          const dateTimeKey = format(date, 'yyyy-MM-dd-HH:mm');
          const formattedDate = format(date, 'yyyy년 MM월 dd일 (eee) HH:mm', { locale: ko });

          if (!interviewDateMap.has(dateTimeKey)) {
            interviewDateMap.set(dateTimeKey, {
              jobBoardId: app.refJobBoardId,
              jobBoardTitle: app.jobBoardTitle || '',
              date,
              formattedDate,
              interviews: [],
            });
          }

          const dateInfo = interviewDateMap.get(dateTimeKey)!;
          const existingUserInterview = dateInfo.interviews.find(
            (interview) => interview.user?.id === app.user?.id
          );

          if (existingUserInterview) {
            existingUserInterview.jobBoardTitle = `${existingUserInterview.jobBoardTitle} / ${app.jobBoardTitle}`;
          } else {
            dateInfo.interviews.push(app);
          }
        } else {
          if (!app.interviewStatus || app.interviewStatus === 'pending') {
            const undefinedDateInfo = interviewDateMap.get(undefinedDateKey)!;
            const existingUserInterview = undefinedDateInfo.interviews.find(
              (interview) => interview.user?.id === app.user?.id
            );

            if (existingUserInterview) {
              existingUserInterview.jobBoardTitle = `${existingUserInterview.jobBoardTitle} / ${app.jobBoardTitle}`;
            } else {
              undefinedDateInfo.interviews.push(app);
            }
          }
        }
      }

      if (interviewDateMap.get(undefinedDateKey)!.interviews.length === 0) {
        interviewDateMap.delete(undefinedDateKey);
      }

      const interviewDatesInfo = Array.from(interviewDateMap.values());

      interviewDatesInfo.sort((a, b) => {
        if (a.formattedDate === '날짜 미정') return 1;
        if (b.formattedDate === '날짜 미정') return -1;
        return b.date.getTime() - a.date.getTime();
      });

      setInterviewDates(interviewDatesInfo);

      const allUserIds = new Set<string>();
      interviewDatesInfo.forEach((dateInfo) => {
        dateInfo.interviews.forEach((app) => {
          if (app.refUserId) {
            allUserIds.add(app.refUserId);
          }
        });
      });

      await Promise.all(
        Array.from(allUserIds).map((userId) => loadUserAppliedCampsForAll(userId))
      );
    } catch (error) {
      logger.error('면접 일정 로드 오류:', error);
      Alert.alert('오류', '면접 일정을 불러오는 중 오류가 발생했습니다.');
    }
  };

  // 사용자의 지원 정보 로드
  const loadUserAppliedCampsForAll = async (userId: string) => {
    try {
      const applicationsRef = collection(db, 'applicationHistories');
      const q = query(applicationsRef, where('refUserId', '==', userId));
      const applicationsSnapshot = await getDocs(q);

      const jobBoardIds = applicationsSnapshot.docs.map((doc) => doc.data().refJobBoardId);
      const uniqueJobBoardIds = [...new Set(jobBoardIds)];

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

      const filteredCodes = jobCodes.filter((code) => code !== null) as string[];
      const uniqueCodes = [...new Set(filteredCodes)];

      setAppliedCampsMap((prev) => ({
        ...prev,
        [userId]: uniqueCodes,
      }));
    } catch (error) {
      logger.error('지원 캠프 로드 오류:', error);
      setAppliedCampsMap((prev) => ({
        ...prev,
        [userId]: [],
      }));
    }
  };

  // 진행자 스크립트 로드
  const loadScript = async () => {
    try {
      const scriptRef = doc(db, 'interviewScripts', 'common');
      const scriptDoc = await getDoc(scriptRef);

      if (scriptDoc.exists()) {
        setScriptText(scriptDoc.data().content || '');
      } else {
        setScriptText(
          '# 진행자 스크립트\n\n## 면접 시작 인사\n안녕하세요, SMIS 면접에 참여해 주셔서 감사합니다.\n\n## 지원자 소개\n간단한 자기소개를 부탁드립니다.\n\n## 주요 질문 리스트\n1. 지원 동기가 무엇인가요?\n2. 팀 프로젝트 경험이 있다면 말씀해주세요.\n3. 어려운 상황을 극복한 경험이 있나요?\n\n## 마무리 인사\n면접에 참여해 주셔서 감사합니다. 결과는 추후 안내해 드리겠습니다.'
        );
      }
    } catch (error) {
      logger.error('진행자 스크립트 로드 오류:', error);
      Alert.alert('오류', '진행자 스크립트를 불러오는 중 오류가 발생했습니다.');
      setScriptText('');
    }
  };

  // 진행자 스크립트 저장
  const handleSaveScript = async () => {
    try {
      setLoading(true);

      const scriptRef = doc(db, 'interviewScripts', 'common');
      await setDoc(
        scriptRef,
        {
          content: scriptText,
          updatedAt: Timestamp.fromDate(new Date()),
        },
        { merge: true }
      );

      Alert.alert('성공', '진행자 스크립트가 저장되었습니다.');
    } catch (error) {
      logger.error('진행자 스크립트 저장 오류:', error);
      Alert.alert('오류', '진행자 스크립트를 저장하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 면접 링크 로드
  const loadInterviewLinks = async () => {
    try {
      const links = await getInterviewLinks();
      setInterviewLinks(links);
    } catch (error) {
      logger.error('면접 링크 로드 오류:', error);
      Alert.alert('오류', '면접 링크를 불러오는 중 오류가 발생했습니다.');
    }
  };

  // 면접일 선택
  const handleSelectDate = (dateInfo: InterviewDateInfo) => {
    setSelectedDate(dateInfo);
    setSelectedApplication(null);

    if (dateInfo.interviews.length > 0) {
      const jobCodeCountMap = new Map<string, number>();

      jobCodeCountMap.set('전체', dateInfo.interviews.length);

      dateInfo.interviews.forEach((app) => {
        const jobCode = app.jobCode || (app.jobBoardTitle ? app.jobBoardTitle.split(' ')[0] : '미정');
        const count = jobCodeCountMap.get(jobCode) || 0;
        jobCodeCountMap.set(jobCode, count + 1);
      });

      const jobCodesList = Array.from(jobCodeCountMap.entries()).map(([code, count]) => ({
        code,
        count,
      }));

      setJobCodes(jobCodesList);
      setSelectedJobBoard('전체');
    } else {
      setJobCodes([{ code: '전체', count: 0 }]);
    }
  };

  // 지원자 선택
  const handleSelectApplication = async (app: ApplicationWithUser) => {
    setSelectedApplication(app);

    if (app.interviewDate) {
      const time = format(app.interviewDate.toDate(), 'HH:mm');
      setInterviewTime(time);
      setNewSelectedDate(format(app.interviewDate.toDate(), 'yyyy-MM-dd'));
    } else {
      setInterviewTime('');
      setNewSelectedDate('');
    }

    try {
      const jobBoardRef = doc(db, 'jobBoards', app.refJobBoardId);
      const jobBoardDoc = await getDoc(jobBoardRef);

      if (jobBoardDoc.exists()) {
        const jobBoardData = jobBoardDoc.data() as JobBoard;

        setSelectedApplication((prev) => {
          if (!prev) return prev;

          return {
            ...prev,
            interviewBaseLink: jobBoardData.interviewBaseLink || '',
            interviewBaseDuration: jobBoardData.interviewBaseDuration || 30,
            interviewBaseNotes: jobBoardData.interviewBaseNotes || '',
          };
        });
      }
    } catch (error) {
      logger.error('채용 공고 정보 로드 오류:', error);
      Alert.alert('오류', '채용 공고 정보를 불러오는 중 오류가 발생했습니다.');
    }
  };

  // 피드백 저장
  // 상태 변경
  const handleStatusChange = async (
    applicationId: string,
    newStatus: string,
    statusType: 'application' | 'interview' | 'final'
  ) => {
    if (!selectedApplication) return;

    try {
      setLoading(true);

      const applicationRef = doc(db, 'applicationHistories', applicationId);

      const updateData: Partial<ApplicationHistory> & { updatedAt: Timestamp } = {
        updatedAt: Timestamp.fromDate(new Date()),
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

      Alert.alert('성공', '상태가 변경되었습니다.');

      if (selectedDate) {
        const updatedInterviews = selectedDate.interviews.map((interview) => {
          if (interview.id === applicationId) {
            return {
              ...interview,
              ...updateData,
            };
          }
          return interview;
        });

        setSelectedDate({
          ...selectedDate,
          interviews: updatedInterviews,
        });

        setSelectedApplication({
          ...selectedApplication,
          ...updateData,
        });
      }
    } catch (error) {
      logger.error('상태 변경 오류:', error);
      Alert.alert('오류', '상태를 변경하는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 현재 사용자 로드
  const loadCurrentUser = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setCurrentUser({ name: userData.name, userId: user.uid });
        }
      }
    } catch (error) {
      logger.error('사용자 정보 로드 오류:', error);
    }
  };

  // 평가 추가 핸들러
  const handleAddEvaluation = (stage: EvaluationStage) => {
    setSelectedEvaluationStage(stage);
    setShowEvaluationModal(true);
  };

  // 평가 성공 핸들러
  const handleEvaluationSuccess = () => {
    setShowEvaluationModal(false);
    setSelectedEvaluationStage(null);
    setEvaluationRefreshKey((prev) => prev + 1);
    Alert.alert('성공', '평가가 저장되었습니다.');
  };

  // 링크 업데이트 핸들러
  const handleLinksUpdate = (updatedLinks: InterviewLinks) => {
    setInterviewLinks(updatedLinks);
  };

  // SMS 메시지 박스 토글
  const toggleSMSMessage = (type: TemplateType) => {
    setShowSMSMessage(prev => ({
      ...prev,
      [type]: !prev[type],
    }));

    // 처음 열 때만 템플릿 로드
    if (!showSMSMessage[type] && !smsMessages[type]) {
      loadSMSTemplate(type);
    }
  };

  // SMS 템플릿 로드
  const loadSMSTemplate = async (type: TemplateType) => {
    if (!selectedApplication) return;

    try {
      const jobBoardId = selectedApplication.refJobBoardId;
      const template = await getSMSTemplateByTypeAndJobBoard(db, type, jobBoardId);

      if (template) {
        setSmsMessages(prev => ({
          ...prev,
          [type]: template.content,
        }));
      } else {
        setSmsMessages(prev => ({
          ...prev,
          [type]: getDefaultSMSMessage(type),
        }));
      }
    } catch (error) {
      logger.error('SMS 템플릿 로드 오류:', error);
      setSmsMessages(prev => ({
        ...prev,
        [type]: getDefaultSMSMessage(type),
      }));
    }
  };

  // 기본 SMS 메시지 가져오기
  const getDefaultSMSMessage = (type: TemplateType): string => {
    const jobBoardTitle = selectedApplication?.jobBoardTitle || '';
    const userName = selectedApplication?.user?.name || '{이름}';

    const defaultMessages: Record<TemplateType, string> = {
      document_pass: `안녕하세요, ${userName}님.\n${jobBoardTitle} 채용에 지원해주셔서 감사합니다.\n서류 전형 합격을 축하드립니다.`,
      document_fail: `안녕하세요, ${userName}님.\n${jobBoardTitle} 채용에 지원해주셔서 감사합니다.\n아쉽게도 이번 서류 전형에 합격하지 못하셨습니다.`,
      interview_scheduled: `안녕하세요, ${userName}님.\n${jobBoardTitle} 서류 전형 합격을 축하드립니다.\n\n면접 일정을 안내드립니다.`,
      interview_pass: `안녕하세요, ${userName}님.\n${jobBoardTitle} 면접에 참여해주셔서 감사합니다.\n면접 전형 합격을 축하드립니다.`,
      interview_fail: `안녕하세요, ${userName}님.\n${jobBoardTitle} 면접에 참여해주셔서 감사합니다.\n아쉽게도 이번 면접 전형에 합격하지 못하셨습니다.`,
      final_pass: `축하합니다, ${userName}님!\n${jobBoardTitle}에 최종 합격하셨습니다.`,
      final_fail: `안녕하세요, ${userName}님.\n${jobBoardTitle} 채용 전형에 참여해주셔서 감사합니다.\n아쉽게도 이번 최종 전형에 합격하지 못하셨습니다.`,
    };

    return defaultMessages[type];
  };

  // SMS 전송
  const handleSendSMS = async (type: TemplateType) => {
    if (!selectedApplication || !selectedApplication.user?.phoneNumber) {
      Alert.alert('오류', '전화번호가 없습니다.');
      return;
    }

    try {
      setIsSendingSMS(true);

      // 변수 치환
      let finalMessage = smsMessages[type];
      if (selectedApplication.user?.name) {
        finalMessage = finalMessage.replace(/{이름}/g, selectedApplication.user.name);
      }

      const response = await sendCustomSMS(
        selectedApplication.user.phoneNumber,
        finalMessage,
        selectedApplication.user.name,
        fromNumber
      );

      if (response.success) {
        Alert.alert('성공', 'SMS가 전송되었습니다.');
        setShowSMSMessage(prev => ({ ...prev, [type]: false }));
      } else {
        Alert.alert('오류', response.message || 'SMS 전송에 실패했습니다.');
      }
    } catch (error) {
      logger.error('SMS 전송 오류:', error);
      Alert.alert('오류', 'SMS 전송 중 오류가 발생했습니다.');
    } finally {
      setIsSendingSMS(false);
    }
  };

  // SMS 템플릿 저장
  const handleSaveSMSTemplate = async (type: TemplateType) => {
    if (!selectedApplication) return;

    try {
      setIsSavingSMS(true);

      const jobBoardId = selectedApplication.refJobBoardId;
      await saveSMSTemplate(db, type, smsMessages[type], jobBoardId);

      Alert.alert('성공', '템플릿이 저장되었습니다.');
    } catch (error) {
      logger.error('템플릿 저장 오류:', error);
      Alert.alert('오류', '템플릿 저장에 실패했습니다.');
    } finally {
      setIsSavingSMS(false);
    }
  };

  // 필터링된 면접 대상자
  const getFilteredInterviews = useMemo(() => {
    if (!selectedDate) return [];

    if (selectedJobBoard === '전체') {
      return selectedDate.interviews;
    } else {
      return selectedDate.interviews.filter((app) => {
        const jobCode = app.jobCode || '미정';
        return jobCode === selectedJobBoard;
      });
    }
  }, [selectedDate, selectedJobBoard]);

  // 현재 날짜 기준으로 과거/미래 면접일 필터링
  const filterInterviewDates = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // 2개월 전 날짜 계산
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, now.getDate());
    // 5개월 전 날짜 계산
    const fiveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, now.getDate());

    // 미래 날짜 + 2개월 이내 과거 날짜 (기본 표시)
    const futureDates = interviewDates.filter((dateInfo) => {
      // '날짜 미정'은 항상 표시
      if (dateInfo.formattedDate === '날짜 미정') return true;
      // 오늘 이후 날짜 또는 2개월 이내 과거 날짜
      return dateInfo.date.getTime() >= twoMonthsAgo.getTime();
    });

    // 2개월 이전 ~ 5개월 이내 과거 날짜 (토글로 표시)
    const pastDates = interviewDates.filter((dateInfo) => {
      // '날짜 미정'은 제외
      if (dateInfo.formattedDate === '날짜 미정') return false;
      // 2개월 이전이고 5개월 이내의 과거 날짜만 필터링
      return (
        dateInfo.date.getTime() < twoMonthsAgo.getTime() &&
        dateInfo.date.getTime() >= fiveMonthsAgo.getTime()
      );
    });

    return { futureDates, pastDates };
  }, [interviewDates]);

  // 새로고침
  const onRefresh = async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>면접 관리</Text>
      </View>

      <View style={styles.headerButtons}>
        <TouchableOpacity
          style={[styles.headerButton, styles.headerButtonZoom]}
          onPress={() => {
            // Zoom 링크 열기
          }}
        >
          <Text style={styles.headerButtonText}>Zoom</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerButton, styles.headerButtonCanva]}
          onPress={() => {
            // 캔바 링크 열기
          }}
        >
          <Text style={styles.headerButtonText}>캔바</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerButton, styles.headerButtonScript]}
          onPress={() => setShowScriptModal(true)}
        >
          <Text style={styles.headerButtonText}>스크립트</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerButton, styles.headerButtonLinks]}
          onPress={() => setShowLinksManager(true)}
        >
          <Text style={styles.headerButtonText}>링크 관리</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderDateTabs = () => (
    <View style={styles.dateTabsContainer}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dateTabsContent}
      >
        {loadingDates ? (
          <ActivityIndicator size="small" color="#3b82f6" />
        ) : interviewDates.length === 0 ? (
          <Text style={styles.emptyText}>등록된 면접일이 없습니다.</Text>
        ) : (
          <>
            {/* 기본 표시: 미래 + 2개월 이내 과거 면접일 */}
            {filterInterviewDates.futureDates.map((dateInfo, index) => {
              const shortDate =
                dateInfo.formattedDate === '날짜 미정'
                  ? '미정'
                  : `${format(dateInfo.date, 'M/d(eee)', { locale: ko })} ${format(
                      dateInfo.date,
                      'HH:mm'
                    )}`;

              const now = new Date();
              const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const isPast = dateInfo.formattedDate !== '날짜 미정' && dateInfo.date.getTime() < today.getTime();

              const isSelected =
                selectedDate &&
                format(selectedDate.date, 'yyyy-MM-dd-HH:mm') ===
                  format(dateInfo.date, 'yyyy-MM-dd-HH:mm');

              return (
                <TouchableOpacity
                  key={`future-${index}`}
                  style={[
                    styles.dateTab,
                    isPast && styles.dateTabPast,
                    isSelected && (isPast ? styles.dateTabPastSelected : styles.dateTabSelected),
                  ]}
                  onPress={() => handleSelectDate(dateInfo)}
                >
                  <Text
                    style={[
                      styles.dateTabText,
                      isPast && styles.dateTabTextPast,
                      isSelected && styles.dateTabTextSelected,
                    ]}
                  >
                    {shortDate} ({dateInfo.interviews.length})
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* 과거 면접일 토글 버튼 - 2개월 이전 날짜가 있을 때만 표시 */}
            {filterInterviewDates.pastDates.length > 0 && (
              <TouchableOpacity
                style={[
                  styles.dateTab,
                  showPastDates && styles.dateTabPastSelected,
                ]}
                onPress={() => setShowPastDates(!showPastDates)}
              >
                <Text
                  style={[
                    styles.dateTabText,
                    showPastDates && styles.dateTabTextSelected,
                  ]}
                >
                  {showPastDates
                    ? '숨기기'
                    : `2개월 이전 (${filterInterviewDates.pastDates.length})`}
                </Text>
              </TouchableOpacity>
            )}

            {/* 과거 면접일 표시 - 토글 시에만 표시 */}
            {showPastDates &&
              filterInterviewDates.pastDates.map((dateInfo, index) => {
                const shortDate = `${format(dateInfo.date, 'M/d(eee)', { locale: ko })} ${format(
                  dateInfo.date,
                  'HH:mm'
                )}`;

                const isSelected =
                  selectedDate &&
                  format(selectedDate.date, 'yyyy-MM-dd-HH:mm') ===
                    format(dateInfo.date, 'yyyy-MM-dd-HH:mm');

                return (
                  <TouchableOpacity
                    key={`past-${index}`}
                    style={[
                      styles.dateTab,
                      styles.dateTabPast,
                      isSelected && styles.dateTabPastSelected,
                    ]}
                    onPress={() => handleSelectDate(dateInfo)}
                  >
                    <Text
                      style={[
                        styles.dateTabText,
                        styles.dateTabTextPast,
                        isSelected && styles.dateTabTextSelected,
                      ]}
                    >
                      {shortDate} ({dateInfo.interviews.length})
                    </Text>
                  </TouchableOpacity>
                );
              })}
          </>
        )}
      </ScrollView>
    </View>
  );

  const renderJobBoardFilter = () => {
    if (!selectedDate || jobCodes.length === 0) return null;

    return (
      <View style={styles.jobBoardFilterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.jobBoardFilterContent}
        >
          {jobCodes.map((item) => (
            <TouchableOpacity
              key={item.code}
              style={[
                styles.jobBoardFilterTab,
                selectedJobBoard === item.code && styles.jobBoardFilterTabSelected,
              ]}
              onPress={() => setSelectedJobBoard(item.code)}
            >
              <Text
                style={[
                  styles.jobBoardFilterText,
                  selectedJobBoard === item.code && styles.jobBoardFilterTextSelected,
                ]}
              >
                {item.code} ({item.count})
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderApplicationList = () => {
    if (!selectedDate) {
      return (
        <View style={styles.emptyContainer}>
          <Ionicons name="calendar-outline" size={64} color="#9ca3af" />
          <Text style={styles.emptyText}>면접일을 선택하여 면접 대상자를 확인하세요.</Text>
        </View>
      );
    }

    const interviews = getFilteredInterviews;

    return (
      <ScrollView
        style={styles.applicationList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {interviews.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>해당 조건에 맞는 면접 대상자가 없습니다.</Text>
          </View>
        ) : (
          interviews.map((app, index) => (
            <TouchableOpacity
              key={app.id}
              style={[
                styles.applicationCard,
                selectedApplication?.id === app.id && styles.applicationCardSelected,
              ]}
              onPress={() => {
                // 카드 클릭 시 ApplicantDetail 화면으로 네비게이션
                navigation.navigate('ApplicantDetail', {
                  applicationId: app.id,
                  jobBoardId: app.refJobBoardId,
                });
              }}
            >
              <View style={styles.applicationCardInner}>
                {/* 프로필 이미지 - 사용자 관리 상세로 이동 */}
                <TouchableOpacity
                  style={styles.profileImageContainer}
                  onPress={() => {
                    if (app.user) {
                      navigation.navigate('UserManageDetail', { user: app.user });
                    }
                  }}
                >
                  {app.user?.profileImage ? (
                    <Image
                      source={{ uri: app.user.profileImage }}
                      style={styles.profileImage}
                    />
                  ) : (
                    <View style={styles.profileImagePlaceholder}>
                      <Text style={styles.profileImagePlaceholderText}>
                        {app.user?.name ? app.user.name.charAt(0) : '?'}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>

                {/* 지원자 정보 */}
                <View style={styles.applicationCardContent}>
                  <View style={styles.applicationCardHeader}>
                    <Text style={styles.applicationName}>
                      {app.user?.name
                        ? `${app.user.name} (${app.user.age})`
                        : app.refUserId}
                    </Text>
                    {/* 상태 뱃지 */}
                    <View style={styles.applicationStatusBadge}>
                      {app.interviewStatus === 'pending' && (
                        <View style={[styles.statusBadge, styles.statusBadgePending]}>
                          <Text style={styles.statusBadgeText}>예정</Text>
                        </View>
                      )}
                      {app.interviewStatus === 'complete' && (
                        <View style={[styles.statusBadge, styles.statusBadgeComplete]}>
                          <Text style={styles.statusBadgeText}>완료</Text>
                        </View>
                      )}
                      {app.interviewStatus === 'passed' && (
                        <View style={[styles.statusBadge, styles.statusBadgeSuccess]}>
                          <Text style={styles.statusBadgeText}>합격</Text>
                        </View>
                      )}
                      {app.interviewStatus === 'failed' && (
                        <View style={[styles.statusBadge, styles.statusBadgeDanger]}>
                          <Text style={styles.statusBadgeText}>불합격</Text>
                        </View>
                      )}
                      {app.interviewStatus === 'absent' && (
                        <View style={[styles.statusBadge, styles.statusBadgeDanger]}>
                          <Text style={styles.statusBadgeText}>불참</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <Text style={styles.applicationInfoTextSmall}>
                    연락처: {app.user?.phoneNumber || '-'}
                  </Text>

                  {app.user?.university && (
                    <Text style={styles.applicationInfoTextSmall}>
                      {app.user.university}{' '}
                      {app.user.grade === 6
                        ? '졸업생'
                        : `${app.user.grade}학년 ${
                            app.user.isOnLeave === null
                              ? '졸업생'
                              : app.user.isOnLeave
                              ? '휴학생'
                              : '재학생'
                          }`}
                    </Text>
                  )}

                  <Text style={styles.applicationInfoTextSmall}>
                    지원경로: {app.user?.referralPath}{' '}
                    {app.user?.referrerName ? `(${app.user.referrerName})` : ''}
                  </Text>

                  <Text style={styles.applicationInfoTextSmall}>
                    <Text style={styles.labelBold}>지원 장소:</Text>{' '}
                    {appliedCampsMap[app.refUserId]?.length > 0
                      ? appliedCampsMap[app.refUserId].join(' / ')
                      : '정보 없음'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    );
  };

  if (loading && !loadingDates) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>로딩 중...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      {renderDateTabs()}
      {renderJobBoardFilter()}
      {renderApplicationList()}

      {/* 링크 관리 모달 */}
      <InterviewLinksManager
        isOpen={showLinksManager}
        onClose={() => setShowLinksManager(false)}
        onUpdate={handleLinksUpdate}
      />

      {/* 스크립트 모달 */}
      <Modal
        visible={showScriptModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowScriptModal(false);
          setIsEditingScript(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalHeaderTitle}>진행자 스크립트</Text>
              <View style={styles.modalHeaderButtons}>
                <TouchableOpacity
                  style={[
                    styles.modalHeaderButton,
                    isEditingScript && styles.modalHeaderButtonActive,
                  ]}
                  onPress={() => setIsEditingScript(!isEditingScript)}
                >
                  <Text
                    style={[
                      styles.modalHeaderButtonText,
                      isEditingScript && styles.modalHeaderButtonTextActive,
                    ]}
                  >
                    {isEditingScript ? '보기 모드' : '수정 모드'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setShowScriptModal(false);
                    setIsEditingScript(false);
                  }}
                  style={styles.closeButton}
                >
                  <Ionicons name="close" size={24} color="#6b7280" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView style={styles.modalBody}>
              {isEditingScript ? (
                <TextInput
                  value={scriptText}
                  onChangeText={setScriptText}
                  style={styles.scriptInput}
                  multiline
                  placeholder="스크립트를 입력하세요..."
                  placeholderTextColor="#9ca3af"
                  textAlignVertical="top"
                />
              ) : (
                <Text style={styles.scriptText}>{scriptText}</Text>
              )}
            </ScrollView>

            {isEditingScript && (
              <View style={styles.modalFooter}>
                <TouchableOpacity
                  style={styles.saveScriptButton}
                  onPress={handleSaveScript}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.saveScriptButtonText}>저장</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* SMS 전송 모달 */}
      {showProfileImageModal && selectedApplication?.user?.profileImage && (
        <Modal
          visible={showProfileImageModal}
          animationType="fade"
          transparent={true}
          onRequestClose={() => setShowProfileImageModal(false)}
        >
          <View style={styles.imageModalOverlay}>
            <TouchableOpacity
              style={styles.imageModalClose}
              onPress={() => setShowProfileImageModal(false)}
            >
              <Ionicons name="close" size={32} color="#ffffff" />
            </TouchableOpacity>
            <Image
              source={{ uri: selectedApplication.user.profileImage }}
              style={styles.imageModalImage}
              resizeMode="contain"
            />
          </View>
        </Modal>
      )}

      {/* 평가 작성 모달 */}
      {showEvaluationModal && selectedEvaluationStage && selectedApplication && currentUser && (
        <Modal
          visible={showEvaluationModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            setShowEvaluationModal(false);
            setSelectedEvaluationStage(null);
          }}
        >
          <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
            <View style={styles.modalHeader}>
              <TouchableOpacity
                onPress={() => {
                  setShowEvaluationModal(false);
                  setSelectedEvaluationStage(null);
                }}
              >
                <Ionicons name="close" size={28} color="#111827" />
              </TouchableOpacity>
              <Text style={styles.modalHeaderTitle}>평가 작성</Text>
              <View style={{ width: 28 }} />
            </View>
            <EvaluationForm
              targetUserId={selectedApplication.user?.userId || selectedApplication.refUserId}
              targetUserName={selectedApplication.user?.name || ''}
              evaluatorId={currentUser.userId}
              evaluatorName={currentUser.name}
              evaluationStage={selectedEvaluationStage}
              onSuccess={handleEvaluationSuccess}
              onCancel={() => {
                setShowEvaluationModal(false);
                setSelectedEvaluationStage(null);
              }}
            />
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  headerButtonZoom: {
    backgroundColor: '#3b82f6',
  },
  headerButtonCanva: {
    backgroundColor: '#3b82f6',
  },
  headerButtonScript: {
    backgroundColor: '#3b82f6',
  },
  headerButtonLinks: {
    backgroundColor: '#10b981',
  },
  headerButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  dateTabsContainer: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 12,
  },
  dateTabsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  dateTab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  dateTabSelected: {
    backgroundColor: '#3b82f6',
  },
  dateTabPast: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    backgroundColor: '#f9fafb',
  },
  dateTabPastSelected: {
    backgroundColor: '#6b7280',
    borderStyle: 'solid',
  },
  dateTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  dateTabTextSelected: {
    color: '#ffffff',
  },
  dateTabTextPast: {
    color: '#6b7280',
  },
  jobBoardFilterContainer: {
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  jobBoardFilterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  jobBoardFilterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  jobBoardFilterTabSelected: {
    backgroundColor: '#dbeafe',
  },
  jobBoardFilterText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
  },
  jobBoardFilterTextSelected: {
    color: '#1e40af',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 12,
  },
  applicationList: {
    flex: 1,
  },
  applicationCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  applicationCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  applicationName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  applicationBadges: {
    flexDirection: 'row',
    gap: 4,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#dbeafe',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1e40af',
  },
  applicationInfo: {
    marginBottom: 8,
  },
  applicationInfoText: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 2,
  },
  statusContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#fef3c7',
  },
  statusBadgeSuccess: {
    backgroundColor: '#d1fae5',
  },
  statusBadgeDanger: {
    backgroundColor: '#fee2e2',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#92400e',
  },
  detailContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  detailHeaderTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginLeft: 12,
  },
  detailSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  detailInfoRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  detailInfoLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    width: 100,
  },
  detailInfoValue: {
    fontSize: 14,
    color: '#111827',
    flex: 1,
  },
  statusButtonGroup: {
    marginBottom: 16,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  statusButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  statusButtonSuccess: {
    borderColor: '#10b981',
  },
  statusButtonDanger: {
    borderColor: '#ef4444',
  },
  statusButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  statusButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  statusButtonTextActive: {
    color: '#ffffff',
  },
  smsButtonGroup: {
    marginTop: 16,
  },
  smsButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  smsButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
  },
  smsButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#ffffff',
  },
  feedbackInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 120,
    marginBottom: 12,
  },
  saveFeedbackButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveFeedbackButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalHeaderButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
  },
  modalHeaderButtonActive: {
    backgroundColor: '#3b82f6',
  },
  modalHeaderButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  modalHeaderButtonTextActive: {
    color: '#ffffff',
  },
  modalBody: {
    padding: 20,
    maxHeight: 500,
  },
  scriptInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: '#111827',
    minHeight: 400,
  },
  scriptText: {
    fontSize: 14,
    color: '#111827',
    lineHeight: 22,
  },
  modalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  saveScriptButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveScriptButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  closeButton: {
    padding: 4,
  },
  // 지원자 카드 스타일 (프로필 이미지 포함)
  applicationCardInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  profileImageContainer: {
    marginRight: 12,
  },
  profileImage: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  profileImagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImagePlaceholderText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#6b7280',
  },
  applicationCardContent: {
    flex: 1,
  },
  applicationCardSelected: {
    backgroundColor: '#eff6ff',
    borderColor: '#3b82f6',
  },
  applicationInfoTextSmall: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 2,
  },
  labelBold: {
    fontWeight: '600',
  },
  applicationStatusBadge: {
    marginLeft: 8,
  },
  statusBadgePending: {
    backgroundColor: '#fef3c7',
  },
  statusBadgeComplete: {
    backgroundColor: '#e9d5ff',
  },
  // 상세 화면 스타일
  profileSection: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  profileImageLargeContainer: {
    marginRight: 16,
  },
  profileImageLarge: {
    width: 96,
    height: 96,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  profileImageLargePlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 12,
    backgroundColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImageLargePlaceholderText: {
    fontSize: 40,
    fontWeight: '600',
    color: '#6b7280',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  profileDetailText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 4,
  },
  statusRow: {
    marginBottom: 16,
  },
  statusRowMarginTop: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  statusPickerContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  statusOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    alignItems: 'center',
  },
  statusOptionSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  statusOptionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  statusOptionTextSelected: {
    color: '#ffffff',
  },
  smsToggleButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  smsToggleButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    padding: 10,
  },
  imageModalImage: {
    width: '90%',
    height: '80%',
  },
  // 상태 그리드 레이아웃
  statusGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  statusColumn: {
    flex: 1,
  },
  statusColumnLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  statusOptionsVertical: {
    gap: 6,
  },
  statusOptionsScrollable: {
    maxHeight: 180,
  },
  statusOptionSmall: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusOptionTextSmall: {
    fontSize: 11,
    fontWeight: '500',
    color: '#374151',
  },
  smsToggleButtonSmall: {
    backgroundColor: '#3b82f6',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  smsToggleButtonTextSmall: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  // 드롭다운 스타일
  dropdown: {
    borderColor: '#d1d5db',
    borderRadius: 6,
    minHeight: 36,
    backgroundColor: '#ffffff',
  },
  dropdownContainer: {
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  dropdownText: {
    fontSize: 11,
    color: '#374151',
  },
  // 모달 헤더 스타일
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
});
