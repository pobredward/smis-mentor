import React, { useState, useEffect } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { MainTabScreenProps } from '../navigation/types';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { useAuth } from '../context/AuthContext';
import { useCampTab } from '../context/CampTabContext';
import { jobCodesService, JobCode } from '../services';
import { getTasksByCampCode } from '../services/taskService';
import { getPersonalTasksByDate, getOverduePersonalTasks } from '../services/personalTaskService';
import {
  getHiddenOverdueTasks,
  hideOverdueTask,
  clearHiddenOverdueTasks,
} from '../services/cacheUtils';
import { getApplicationsByUserId } from '../services/recruitmentService';
import { getCampHomeMessage, updateCampHomeMessage } from '@smis-mentor/shared';
import { getJobBoardById } from '../services/jobBoardService';
import { db } from '../config/firebase';
import type { Task, PersonalTask } from '../../../shared/src/types/camp';
import type { ApplicationHistory } from '../../../shared/src/types';

// JobBoard 정보를 포함한 지원 내역 타입
interface ApplicationWithJobBoard extends ApplicationHistory {
  jobBoardTitle?: string;
}

export function HomeScreen({ navigation }: MainTabScreenProps<'Home'>) {
  const { userData, loading: authLoading } = useAuth();
  const { setActiveTab } = useCampTab();

  const isHomeForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const {
    permissionStatus,
    requesting: requestingPermission,
    requestPermission: handleNotificationPermission,
  } = useNotificationPermission({ isForeign: isHomeForeign });

  const [activeJobCode, setActiveJobCode] = useState<JobCode | null>(null);
  const [todayTasks, setTodayTasks] = useState<Task[]>([]);
  const [todayPersonalTasks, setTodayPersonalTasks] = useState<PersonalTask[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);
  const [overduePersonalTasks, setOverduePersonalTasks] = useState<PersonalTask[]>([]);
  const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<string>>(new Set());
  const [showHiddenOverdue, setShowHiddenOverdue] = useState(false);
  const [recentApplications, setRecentApplications] = useState<ApplicationWithJobBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mentorHomeMessage, setMentorHomeMessage] = useState('');
  const [foreignHomeMessage, setForeignHomeMessage] = useState('');
  const [isEditingMessage, setIsEditingMessage] = useState(false);
  const [isEditingForeignMessage, setIsEditingForeignMessage] = useState(false);
  const [editedMessage, setEditedMessage] = useState('');
  const [editedForeignMessage, setEditedForeignMessage] = useState('');

  // 화면 포커스 시 데이터 새로고침
  useFocusEffect(
    React.useCallback(() => {
      loadHomeData();
    }, [userData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHomeData();
    setRefreshing(false);
  };

  const loadHomeData = async () => {
    if (!userData) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // 활성 캠프 코드 정보 로드
      if (userData.activeJobExperienceId) {
        const jobCode = await jobCodesService.getJobCodeById(userData.activeJobExperienceId);
        setActiveJobCode(jobCode);

        // 캠프별 홈 메시지 로드
        if (jobCode?.code) {
          const campMessage = await getCampHomeMessage(db, jobCode.code);
          setMentorHomeMessage(campMessage?.mentorMessage || '');
          setForeignHomeMessage(campMessage?.foreignMessage || '');
        }

        // 오늘과 다가오는 업무 로드
        if (jobCode?.code) {
          const allTasks = await getTasksByCampCode(jobCode.code);
          const now = new Date();
          now.setHours(0, 0, 0, 0);
          const today = now.getTime();

          // 사용자 역할 가져오기
          const userExp = userData.jobExperiences?.find(
            exp => exp.id === userData.activeJobExperienceId
          );
          const userRole = userExp?.groupRole;

          // 역할에 맞는 업무만 필터링
          const userTasks = allTasks.filter(task => {
            if (userData.role === 'admin') return true;
            if (!userRole) return false;
            return task.targetRoles.includes(userRole as any);
          });

          const sortByTime = (a: Task, b: Task) => {
            if (a.time && b.time) return a.time.localeCompare(b.time);
            if (a.time && !b.time) return -1;
            if (!a.time && b.time) return 1;
            return 0;
          };

          // 오늘의 업무
          const todayTasksList = userTasks.filter(task => {
            const taskDate = new Date(task.date.toDate());
            taskDate.setHours(0, 0, 0, 0);
            return taskDate.getTime() === today;
          }).sort(sortByTime);

          // 연체 업무: 오늘 이전 날짜 중 본인이 미완료한 업무
          const overdueTasksList = userTasks.filter(task => {
            const taskDate = new Date(task.date.toDate());
            taskDate.setHours(0, 0, 0, 0);
            if (taskDate.getTime() >= today) return false;
            return !task.completions.some(c => c.userId === userData.userId);
          }).sort((a, b) => {
            // 날짜 오름차순, 같은 날짜면 시간순
            const dateA = new Date(a.date.toDate()).setHours(0, 0, 0, 0);
            const dateB = new Date(b.date.toDate()).setHours(0, 0, 0, 0);
            if (dateA !== dateB) return dateA - dateB;
            return sortByTime(a, b);
          });

          const [hidden, personalToday, personalOverdue] = await Promise.all([
            getHiddenOverdueTasks(),
            userData.userId
              ? getPersonalTasksByDate(userData.userId, jobCode.code, new Date())
              : Promise.resolve([] as PersonalTask[]),
            userData.userId
              ? getOverduePersonalTasks(userData.userId, jobCode.code)
              : Promise.resolve([] as PersonalTask[]),
          ]);

          setHiddenTaskIds(hidden);
          setTodayTasks(todayTasksList);
          setTodayPersonalTasks(personalToday);
          setOverdueTasks(overdueTasksList);
          setOverduePersonalTasks(personalOverdue);
        }
      }

      // 최근 지원 내역 로드
      if (userData.userId) {
        const applications = await getApplicationsByUserId(userData.userId);
        
        // JobBoard 정보를 추가로 로드
        const applicationsWithJobBoard = await Promise.all(
          applications.slice(0, 3).map(async (app) => {
            try {
              const jobBoard = await getJobBoardById(app.refJobBoardId);
              return {
                ...app,
                jobBoardTitle: jobBoard?.title || '알 수 없음',
              };
            } catch (error) {
              logger.error(`JobBoard 정보 로드 오류 (${app.refJobBoardId}):`, error);
              return {
                ...app,
                jobBoardTitle: '알 수 없음',
              };
            }
          })
        );
        
        setRecentApplications(applicationsWithJobBoard);
      }
    } catch (error) {
      logger.error('홈 데이터 로드 오류:', error);
    } finally {
      setLoading(false);
    }
  };


  const getStatusBadge = (
    status: string | undefined,
    type: 'application' | 'interview' | 'final'
  ): { label: string; color: string } => {
    let color = '#94a3b8'; // 기본 회색
    let label = '미정';

    if (type === 'application') {
      switch (status) {
        case 'pending':
          color = '#f59e0b';
          label = '검토중';
          break;
        case 'accepted':
          color = '#10b981';
          label = '서류합격';
          break;
        case 'rejected':
          color = '#ef4444';
          label = '서류불합격';
          break;
        default:
          color = '#94a3b8';
          label = '미정';
      }
    } else if (type === 'interview') {
      switch (status) {
        case 'pending':
          color = '#f59e0b';
          label = '면접예정';
          break;
        case 'complete':
          color = '#8b5cf6';
          label = '면접완료';
          break;
        case 'passed':
          color = '#10b981';
          label = '면접합격';
          break;
        case 'failed':
          color = '#ef4444';
          label = '면접불합격';
          break;
        case 'absent':
          color = '#ef4444';
          label = '불참';
          break;
        default:
          color = '#94a3b8';
          label = '미정';
      }
    } else if (type === 'final') {
      switch (status) {
        case 'finalAccepted':
          color = '#10b981';
          label = '최종합격';
          break;
        case 'finalRejected':
          color = '#ef4444';
          label = '최종불합격';
          break;
        case 'finalAbsent':
          color = '#ef4444';
          label = '불참';
          break;
        default:
          color = '#94a3b8';
          label = '미정';
      }
    }

    return { label, color };
  };

  const getDetailedApplicationStatus = (application: ApplicationWithJobBoard): { label: string; color: string } => {
    // 1단계: 서류 전형
    if (application.applicationStatus === 'pending') {
      return { label: '서류 대기', color: '#f59e0b' };
    }
    
    if (application.applicationStatus === 'rejected') {
      return { label: '서류 불합격', color: '#ef4444' };
    }

    // 2단계: 면접 전형 (서류 합격 후)
    if (application.applicationStatus === 'accepted') {
      // 최종 합격/불합격이 있으면 우선 표시
      if (application.finalStatus === 'finalAccepted') {
        return { label: '최종 합격', color: '#10b981' };
      }
      if (application.finalStatus === 'finalRejected') {
        return { label: '최종 불합격', color: '#ef4444' };
      }
      if (application.finalStatus === 'finalAbsent') {
        return { label: '최종 불참', color: '#64748b' };
      }

      // 면접 상태 확인
      if (!application.interviewStatus || application.interviewStatus === 'pending') {
        return { label: '면접 예정', color: '#3b82f6' };
      }
      if (application.interviewStatus === 'complete') {
        return { label: '면접 완료', color: '#8b5cf6' };
      }
      if (application.interviewStatus === 'passed') {
        return { label: '면접 합격', color: '#10b981' };
      }
      if (application.interviewStatus === 'failed') {
        return { label: '면접 불합격', color: '#ef4444' };
      }
      if (application.interviewStatus === 'absent') {
        return { label: '면접 불참', color: '#64748b' };
      }

      // 면접 상태가 없으면 서류 합격
      return { label: '서류 합격', color: '#10b981' };
    }

    // 기본값
    return { label: '알 수 없음', color: '#64748b' };
  };

  const getApplicationStatus = (status: string): { label: string; color: string } => {
    switch (status) {
      case 'pending':
        return { label: '대기중', color: '#f59e0b' };
      case 'accepted':
        return { label: '합격', color: '#10b981' };
      case 'rejected':
        return { label: '불합격', color: '#ef4444' };
      default:
        return { label: status, color: '#64748b' };
    }
  };

  const getCurrentTimeGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 6) return '늦은 밤이에요';
    if (hour < 12) return '좋은 아침이에요';
    if (hour < 18) return '좋은 오후에요';
    if (hour < 22) return '좋은 저녁이에요';
    return '늦은 밤이에요';
  };

  const formatTaskDateTime = (task: Pick<Task, 'date' | 'time'>): string => {
    const date = task.date.toDate();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[date.getDay()];
    
    if (task.time) {
      return `${month}/${day}(${weekday}) ${task.time}`;
    }
    return `${month}/${day}(${weekday})`;
  };

  const handleEditMessage = () => {
    setEditedMessage(mentorHomeMessage);
    setIsEditingMessage(true);
  };

  const handleCancelEdit = () => {
    setIsEditingMessage(false);
    setEditedMessage('');
  };

  const handleSaveMessage = async () => {
    if (!userData?.userId) {
      Alert.alert('오류', '사용자 정보를 찾을 수 없습니다.');
      return;
    }

    if (!activeJobCode?.code) {
      Alert.alert('오류', '활성 캠프가 없습니다. 마이페이지에서 캠프를 선택해주세요.');
      return;
    }

    try {
      await updateCampHomeMessage(
        db,
        activeJobCode.code,
        { mentorMessage: editedMessage.trim() },
        userData.userId
      );
      
      setMentorHomeMessage(editedMessage.trim());
      setIsEditingMessage(false);
      Alert.alert('성공', `[${activeJobCode.code}] 멘토 홈 메시지가 저장되었습니다.`);
    } catch (error) {
      logger.error('메시지 저장 오류:', error);
      Alert.alert('오류', '메시지 저장에 실패했습니다.');
    }
  };

  const handleEditForeignMessage = () => {
    setEditedForeignMessage(foreignHomeMessage);
    setIsEditingForeignMessage(true);
  };

  const handleCancelForeignEdit = () => {
    setIsEditingForeignMessage(false);
    setEditedForeignMessage('');
  };

  const handleSaveForeignMessage = async () => {
    if (!userData?.userId) {
      Alert.alert('오류', '사용자 정보를 찾을 수 없습니다.');
      return;
    }

    if (!activeJobCode?.code) {
      Alert.alert('오류', '활성 캠프가 없습니다. 마이페이지에서 캠프를 선택해주세요.');
      return;
    }

    try {
      await updateCampHomeMessage(
        db,
        activeJobCode.code,
        { foreignMessage: editedForeignMessage.trim() },
        userData.userId
      );
      
      setForeignHomeMessage(editedForeignMessage.trim());
      setIsEditingForeignMessage(false);
      Alert.alert('성공', `[${activeJobCode.code}] 외국인 홈 메시지가 저장되었습니다.`);
    } catch (error) {
      logger.error('메시지 저장 오류:', error);
      Alert.alert('오류', '메시지 저장에 실패했습니다.');
    }
  };

  const isMentor = (role: string) => role === 'mentor' || role === 'mentor_temp';
  const isForeign = (role: string) => role === 'foreign' || role === 'foreign_temp';
  const isAdmin = (role: string) => role === 'admin';

  if (authLoading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>로딩 중...</Text>
      </View>
    );
  }

  if (!userData) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Ionicons name="log-in-outline" size={64} color="#94a3b8" />
          <Text style={styles.emptyTitle}>로그인이 필요합니다</Text>
          <Text style={styles.emptySubtitle}>
            마이페이지에서 로그인해주세요
          </Text>
        </View>
      </View>
    );
  }

  const handleHideOverdueTask = async (taskId: string) => {
    await hideOverdueTask(taskId);
    setHiddenTaskIds(prev => new Set([...prev, taskId]));
  };

  const handleClearHiddenOverdue = async () => {
    await clearHiddenOverdueTasks();
    setHiddenTaskIds(new Set());
    setShowHiddenOverdue(false);
  };

  type MergedOverdueItem =
    | { kind: 'shared'; task: Task }
    | { kind: 'personal'; task: PersonalTask };

  const allOverdueItems: MergedOverdueItem[] = [
    ...overdueTasks.map(t => ({ kind: 'shared' as const, task: t })),
    ...overduePersonalTasks.map(t => ({ kind: 'personal' as const, task: t })),
  ].sort((a, b) => {
    const dateA = a.task.date.toMillis();
    const dateB = b.task.date.toMillis();
    if (dateA !== dateB) return dateA - dateB;
    const timeA = a.task.time ?? '';
    const timeB = b.task.time ?? '';
    if (timeA && timeB) return timeA.localeCompare(timeB);
    if (timeA && !timeB) return -1;
    if (!timeA && timeB) return 1;
    return 0;
  });

  const mergedOverdueItems = allOverdueItems.filter(i => !hiddenTaskIds.has(i.task.id));
  const hiddenOverdueItems = allOverdueItems.filter(i => hiddenTaskIds.has(i.task.id));

  type MergedTodayItem =
    | { kind: 'shared'; task: Task }
    | { kind: 'personal'; task: PersonalTask };

  const mergedTodayItems: MergedTodayItem[] = [
    ...todayTasks.map(t => ({ kind: 'shared' as const, task: t })),
    ...todayPersonalTasks.map(t => ({ kind: 'personal' as const, task: t })),
  ].sort((a, b) => {
    const timeA = a.task.time ?? '';
    const timeB = b.task.time ?? '';
    if (timeA && timeB) return timeA.localeCompare(timeB);
    if (timeA && !timeB) return -1;
    if (!timeA && timeB) return 1;
    return 0;
  });

  const completedSharedCount = todayTasks.filter(task =>
    task.completions.some(c => c.userId === userData.userId)
  ).length;
  const completedPersonalCount = todayPersonalTasks.filter(t => t.isCompleted).length;
  const completedTodayCount = completedSharedCount + completedPersonalCount;

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.content}>
        {/* 알림 권한 배너 */}
        {permissionStatus !== 'granted' && (
          <TouchableOpacity
            style={[
              styles.notificationBanner,
              permissionStatus === 'denied'
                ? styles.notificationBannerDenied
                : styles.notificationBannerUndetermined,
            ]}
            onPress={handleNotificationPermission}
            disabled={requestingPermission}
            accessibilityRole="button"
            accessibilityLabel={
              isHomeForeign
                ? permissionStatus === 'denied' ? 'Enable notifications in settings' : 'Allow notifications'
                : permissionStatus === 'denied' ? '설정에서 알림 허용하기' : '알림 허용하기'
            }
          >
            <View style={styles.notificationBannerLeft}>
              <Ionicons
                name={permissionStatus === 'denied' ? 'notifications-off-outline' : 'notifications-outline'}
                size={20}
                color={permissionStatus === 'denied' ? '#ef4444' : '#f59e0b'}
              />
              <View style={styles.notificationBannerTextWrap}>
                <Text style={[
                  styles.notificationBannerTitle,
                  permissionStatus === 'denied'
                    ? styles.notificationBannerTitleDenied
                    : styles.notificationBannerTitleUndetermined,
                ]}>
                  {isHomeForeign
                    ? permissionStatus === 'denied' ? 'Notifications Blocked' : 'Allow Notifications'
                    : permissionStatus === 'denied' ? '알림이 차단되어 있습니다' : '알림을 허용해 주세요'}
                </Text>
                <Text style={styles.notificationBannerDesc}>
                  {isHomeForeign
                    ? permissionStatus === 'denied'
                      ? 'Tap to open settings and enable notifications.'
                      : 'Tap to allow notifications for important updates.'
                    : permissionStatus === 'denied'
                      ? '탭하여 설정에서 알림을 허용하세요.'
                      : '업무 알림 등 중요한 알림을 받으려면 허용해 주세요.'}
                </Text>
              </View>
            </View>
            {requestingPermission ? (
              <ActivityIndicator size="small" color={permissionStatus === 'denied' ? '#ef4444' : '#f59e0b'} />
            ) : (
              <Ionicons
                name={permissionStatus === 'denied' ? 'settings-outline' : 'chevron-forward'}
                size={18}
                color={permissionStatus === 'denied' ? '#ef4444' : '#f59e0b'}
              />
            )}
          </TouchableOpacity>
        )}

        {/* 공지사항 (mentor/foreign 읽기 전용) */}
        {userData.role && isMentor(userData.role) && mentorHomeMessage && (
          <View style={styles.mentorMessageCard}>
            <Ionicons name="megaphone-outline" size={18} color="#3b82f6" style={styles.messageIcon} />
            <Text style={styles.mentorMessageText}>{mentorHomeMessage}</Text>
          </View>
        )}
        {userData.role && isForeign(userData.role) && foreignHomeMessage && (
          <View style={styles.foreignMessageCard}>
            <Ionicons name="megaphone-outline" size={18} color="#8b5cf6" style={styles.messageIcon} />
            <Text style={styles.foreignMessageText}>{foreignHomeMessage}</Text>
          </View>
        )}

        {/* 환영 헤더 */}
        <View style={styles.welcomeCard}>
          <View style={styles.welcomeContent}>
            <View style={styles.welcomeTextContainer}>
              <Text style={styles.welcomeGreeting}>{getCurrentTimeGreeting()},</Text>
              <Text style={styles.welcomeName}>{userData.name}님!</Text>
            </View>
            {userData.profileImage ? (
              <Image
                source={{ uri: userData.profileImage }}
                style={styles.profileImage}
              />
            ) : (
              <View style={styles.profilePlaceholder}>
                <Text style={styles.profilePlaceholderText}>
                  {userData.name.charAt(0)}
                </Text>
              </View>
            )}
          </View>
          
          {activeJobCode && (
            <View style={styles.campInfoRow}>
              <View style={styles.activeJobCodeBadge}>
                <Ionicons name="school" size={14} color="#3b82f6" />
                <Text style={styles.activeJobCodeText}>
                  {activeJobCode.generation} {activeJobCode.name}
                </Text>
              </View>
              
              {mergedTodayItems.length > 0 && (
                <View style={styles.todayProgressBadge}>
                  <Ionicons name="checkmark-circle" size={14} color="#10b981" />
                  <Text style={styles.todayProgressText}>
                    {completedTodayCount}/{mergedTodayItems.length} 완료
                  </Text>
                </View>
              )}
              {mergedOverdueItems.length > 0 && (
                <View style={styles.overdueProgressBadge}>
                  <Ionicons name="alert-circle" size={14} color="#ef4444" />
                  <Text style={styles.overdueProgressText}>
                    {mergedOverdueItems.length}건
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* role=admin: 관리자 메시지 편집 */}
        {userData.role && isAdmin(userData.role) && (
          <>
            {/* 멘토 홈 메시지 관리 */}
            <View style={styles.adminMessageCard}>
              <View style={styles.adminMessageHeader}>
                <View style={styles.adminMessageTitleRow}>
                  <Ionicons name="megaphone-outline" size={20} color="#3b82f6" />
                  <Text style={styles.adminMessageTitle}>
                    {activeJobCode?.code ? `[${activeJobCode.code}] ` : ''}멘토 홈 메시지 관리
                  </Text>
                </View>
                {!isEditingMessage && (
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={handleEditMessage}
                  >
                    <Ionicons name="create-outline" size={18} color="#ffffff" />
                    <Text style={styles.editButtonText}>편집</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              {isEditingMessage ? (
                <View style={styles.editContainer}>
                  <TextInput
                    style={styles.messageInput}
                    value={editedMessage}
                    onChangeText={setEditedMessage}
                    placeholder="멘토들에게 전달할 메시지를 입력하세요"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                  <View style={styles.editActions}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={handleCancelEdit}
                    >
                      <Text style={styles.cancelButtonText}>취소</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.saveButton}
                      onPress={handleSaveMessage}
                    >
                      <Ionicons name="checkmark" size={18} color="#ffffff" />
                      <Text style={styles.saveButtonText}>저장</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.messagePreviewContainer}>
                  {mentorHomeMessage ? (
                    <Text style={styles.messagePreviewText}>{mentorHomeMessage}</Text>
                  ) : (
                    <Text style={styles.emptyMessageText}>
                      멘토 홈 화면에 표시할 메시지가 없습니다.{'\n'}
                      편집 버튼을 눌러 메시지를 작성하세요.
                    </Text>
                  )}
                </View>
              )}
            </View>

            {/* 외국인 홈 메시지 관리 */}
            <View style={styles.adminMessageCard}>
              <View style={styles.adminMessageHeader}>
                <View style={styles.adminMessageTitleRow}>
                  <Ionicons name="megaphone-outline" size={20} color="#8b5cf6" />
                  <Text style={styles.adminMessageTitle}>
                    {activeJobCode?.code ? `[${activeJobCode.code}] ` : ''}외국인 홈 메시지 관리
                  </Text>
                </View>
                {!isEditingForeignMessage && (
                  <TouchableOpacity
                    style={[styles.editButton, { backgroundColor: '#8b5cf6' }]}
                    onPress={handleEditForeignMessage}
                  >
                    <Ionicons name="create-outline" size={18} color="#ffffff" />
                    <Text style={styles.editButtonText}>편집</Text>
                  </TouchableOpacity>
                )}
              </View>
              
              {isEditingForeignMessage ? (
                <View style={styles.editContainer}>
                  <TextInput
                    style={styles.messageInput}
                    value={editedForeignMessage}
                    onChangeText={setEditedForeignMessage}
                    placeholder="외국인들에게 전달할 메시지를 입력하세요"
                    multiline
                    numberOfLines={4}
                    textAlignVertical="top"
                  />
                  <View style={styles.editActions}>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={handleCancelForeignEdit}
                    >
                      <Text style={styles.cancelButtonText}>취소</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.saveButton, { backgroundColor: '#8b5cf6' }]}
                      onPress={handleSaveForeignMessage}
                    >
                      <Ionicons name="checkmark" size={18} color="#ffffff" />
                      <Text style={styles.saveButtonText}>저장</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.messagePreviewContainer}>
                  {foreignHomeMessage ? (
                    <Text style={styles.messagePreviewText}>{foreignHomeMessage}</Text>
                  ) : (
                    <Text style={styles.emptyMessageText}>
                      외국인 홈 화면에 표시할 메시지가 없습니다.{'\n'}
                      편집 버튼을 눌러 메시지를 작성하세요.
                    </Text>
                  )}
                </View>
              )}
            </View>
          </>
        )}

        {/* 오늘의 업무 (공통 + 개인 병합) */}
        {mergedTodayItems.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="today" size={20} color="#3b82f6" />
                <Text style={styles.sectionTitle}>오늘의 업무</Text>
              </View>
              <TouchableOpacity onPress={() => {
                setActiveTab('tasks');
                navigation.navigate('Camp');
              }}>
                <Text style={styles.sectionLink}>더보기 →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.tasksList}>
              {mergedTodayItems.map((item) => {
                const isCompleted = item.kind === 'shared'
                  ? item.task.completions.some(c => c.userId === userData.userId)
                  : item.task.isCompleted;
                return (
                  <View key={`${item.kind}-${item.task.id}`} style={styles.simpleTaskItem}>
                    <View style={styles.taskLeftSection}>
                      <View style={[
                        styles.taskBullet,
                        isCompleted && styles.taskBulletCompleted,
                        item.kind === 'personal' && !isCompleted && styles.taskBulletPersonal,
                      ]} />
                      <Text
                        style={[
                          styles.simpleTaskTitle,
                          isCompleted && styles.simpleTaskTitleCompleted,
                        ]}
                        numberOfLines={2}
                      >
                        {item.task.title}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.simpleTaskDateTime,
                        isCompleted && styles.simpleTaskDateTimeCompleted,
                      ]}
                    >
                      {formatTaskDateTime(item.task)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* 연체(미완료) 업무 */}
        {(mergedOverdueItems.length > 0 || hiddenOverdueItems.length > 0) && (
          <View style={styles.overdueCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="alert-circle" size={20} color="#ef4444" />
                <Text style={styles.overdueTitle}>미완료 업무</Text>
                {mergedOverdueItems.length > 0 && (
                  <View style={styles.overdueBadge}>
                    <Text style={styles.overdueBadgeText}>{mergedOverdueItems.length}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => {
                setActiveTab('tasks');
                navigation.navigate('Camp');
              }}>
                <Text style={styles.overdueSectionLink}>확인하기 →</Text>
              </TouchableOpacity>
            </View>

            {mergedOverdueItems.length > 0 ? (
              <View style={styles.tasksList}>
                {mergedOverdueItems.map((item) => {
                  const taskDate = item.task.date.toDate();
                  const month = taskDate.getMonth() + 1;
                  const day = taskDate.getDate();
                  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                  const weekday = weekdays[taskDate.getDay()];
                  const dateLabel = item.task.time
                    ? `${month}/${day}(${weekday}) ${item.task.time}`
                    : `${month}/${day}(${weekday})`;
                  const isPersonal = item.kind === 'personal';
                  return (
                    <View key={item.task.id} style={styles.overdueTaskItem}>
                      <View style={styles.taskLeftSection}>
                        <View style={[
                          styles.overdueTaskBullet,
                          isPersonal && { backgroundColor: '#a78bfa' },
                        ]} />
                        <Text style={styles.overdueTaskTitle} numberOfLines={2}>
                          {item.task.title}
                        </Text>
                      </View>
                      <View style={styles.overdueTaskRight}>
                        <Text style={styles.overdueTaskDateTime}>{dateLabel}</Text>
                        <TouchableOpacity
                          onPress={() => handleHideOverdueTask(item.task.id)}
                          style={styles.hideButton}
                          accessibilityLabel="이 업무 숨기기"
                          accessibilityRole="button"
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="eye-off-outline" size={16} color="#f87171" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.overdueAllHiddenText}>
                모든 미완료 업무를 숨겼습니다.
              </Text>
            )}

            {/* 숨긴 업무 표시/해제 */}
            {hiddenOverdueItems.length > 0 && (
              <View style={styles.hiddenOverdueFooter}>
                <TouchableOpacity
                  onPress={() => setShowHiddenOverdue(prev => !prev)}
                  style={styles.hiddenToggleButton}
                  accessibilityRole="button"
                >
                  <Ionicons
                    name={showHiddenOverdue ? 'eye-outline' : 'eye-off-outline'}
                    size={14}
                    color="#94a3b8"
                  />
                  <Text style={styles.hiddenToggleText}>
                    {showHiddenOverdue
                      ? `숨긴 업무 접기`
                      : `숨긴 업무 ${hiddenOverdueItems.length}건`}
                  </Text>
                </TouchableOpacity>

                {showHiddenOverdue && (
                  <>
                    <View style={styles.hiddenTasksList}>
                      {hiddenOverdueItems.map((item) => {
                        const taskDate = item.task.date.toDate();
                        const month = taskDate.getMonth() + 1;
                        const day = taskDate.getDate();
                        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                        const weekday = weekdays[taskDate.getDay()];
                        const dateLabel = item.task.time
                          ? `${month}/${day}(${weekday}) ${item.task.time}`
                          : `${month}/${day}(${weekday})`;
                        return (
                          <View key={item.task.id} style={styles.hiddenTaskItem}>
                            <Text style={styles.hiddenTaskTitle} numberOfLines={1}>
                              {item.task.title}
                            </Text>
                            <Text style={styles.hiddenTaskDate}>{dateLabel}</Text>
                          </View>
                        );
                      })}
                    </View>
                    <TouchableOpacity
                      onPress={handleClearHiddenOverdue}
                      style={styles.clearHiddenButton}
                      accessibilityRole="button"
                    >
                      <Ionicons name="refresh-outline" size={14} color="#94a3b8" />
                      <Text style={styles.clearHiddenText}>숨김 전체 해제</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </View>
        )}

        {/* 최근 지원 현황 */}
        {recentApplications.length > 0 && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="document-text" size={20} color="#f59e0b" />
                <Text style={styles.sectionTitle}>지원 현황</Text>
              </View>
              <TouchableOpacity onPress={() => {
                navigation.navigate('Recruitment', {
                  screen: 'RecruitmentList',
                  params: { openApplicationTab: true },
                } as any);
              }}>
                <Text style={styles.sectionLink}>더보기 →</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.applicationsList}>
              {recentApplications.map((application) => {
                const applicationStatusBadge = getStatusBadge(application.applicationStatus, 'application');
                const interviewStatusBadge = getStatusBadge(application.interviewStatus, 'interview');
                const finalStatusBadge = getStatusBadge(application.finalStatus, 'final');
                
                return (
                  <View key={application.applicationHistoryId} style={styles.applicationItem}>
                    <View style={styles.applicationHeader}>
                      <Text style={styles.applicationTitle} numberOfLines={1}>
                        {application.jobBoardTitle || '알 수 없음'}
                      </Text>
                      {application.applicationDate && (
                        <Text style={styles.applicationDate}>
                          지원일: {new Date(application.applicationDate.seconds * 1000).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </Text>
                      )}
                    </View>
                    <View style={styles.statusRow}>
                      <View style={styles.statusColumn}>
                        <Text style={styles.statusLabel}>서류</Text>
                        <View style={[styles.statusBadge, { backgroundColor: applicationStatusBadge.color }]}>
                          <Text style={styles.statusText}>{applicationStatusBadge.label}</Text>
                        </View>
                      </View>
                      <View style={styles.statusColumn}>
                        <Text style={styles.statusLabel}>면접</Text>
                        <View style={[styles.statusBadge, { backgroundColor: interviewStatusBadge.color }]}>
                          <Text style={styles.statusText}>{interviewStatusBadge.label}</Text>
                        </View>
                      </View>
                      <View style={styles.statusColumn}>
                        <Text style={styles.statusLabel}>최종</Text>
                        <View style={[styles.statusBadge, { backgroundColor: finalStatusBadge.color }]}>
                          <Text style={styles.statusText}>{finalStatusBadge.label}</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* 빈 상태 */}
        {!activeJobCode && todayTasks.length === 0 && recentApplications.length === 0 && (
          <View style={styles.emptyDataCard}>
            <Ionicons name="rocket-outline" size={48} color="#94a3b8" />
            <Text style={styles.emptyDataTitle}>시작하기</Text>
            <Text style={styles.emptyDataText}>
              마이페이지에서 캠프를 선택하고{'\n'}
              업무와 일정을 확인해보세요!
            </Text>
            <TouchableOpacity 
              style={styles.emptyDataButton}
              onPress={() => navigation.navigate('Profile')}
            >
              <Text style={styles.emptyDataButtonText}>캠프 선택하기</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },

  // 알림 권한 배너
  notificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
  },
  notificationBannerDenied: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  notificationBannerUndetermined: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
  },
  notificationBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  notificationBannerTextWrap: {
    flex: 1,
  },
  notificationBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  notificationBannerTitleDenied: {
    color: '#b91c1c',
  },
  notificationBannerTitleUndetermined: {
    color: '#92400e',
  },
  notificationBannerDesc: {
    fontSize: 12,
    color: '#374151',
    lineHeight: 16,
  },

  // 환영 카드
  welcomeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  welcomeContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  welcomeTextContainer: {
    flex: 1,
  },
  welcomeGreeting: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 2,
  },
  welcomeName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1e293b',
  },
  profileImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#e2e8f0',
  },
  profilePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#93c5fd',
  },
  profilePlaceholderText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  campInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  activeJobCodeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
    flex: 1,
  },
  activeJobCodeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e40af',
  },
  todayProgressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  todayProgressText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065f46',
  },
  overdueProgressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff5f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  overdueProgressText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#dc2626',
  },

  // 멘토 홈 메시지 (mentor 읽기 전용)
  mentorMessageCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#eff6ff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  mentorMessageText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: '#1e293b',
  },

  // 외국인 홈 메시지 (foreign 읽기 전용)
  foreignMessageCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#f5f3ff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#ddd6fe',
  },
  foreignMessageText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 22,
    color: '#1e293b',
  },
  messageIcon: {
    marginTop: 2,
  },

  // 관리자 메시지 관리 (admin)
  adminMessageCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  adminMessageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  adminMessageTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adminMessageTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
  },
  editContainer: {
    gap: 12,
  },
  messageInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    color: '#1e293b',
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  messagePreviewContainer: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  messagePreviewText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#1e293b',
  },
  emptyMessageText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#94a3b8',
    textAlign: 'center',
  },

  // 빠른 액션 (삭제됨)
  quickActionsCard: {
    display: 'none',
  },
  quickActionsRow: {
    display: 'none',
  },
  quickActionButton: {
    display: 'none',
  },
  quickActionText: {
    display: 'none',
  },

  // 섹션 카드
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3b82f6',
  },

  // 오늘의 업무 목록 (간단한 리스트)
  tasksList: {
    gap: 8,
  },
  simpleTaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    gap: 12,
  },
  taskLeftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  taskBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3b82f6',
    flexShrink: 0,
  },
  taskBulletCompleted: {
    backgroundColor: '#94a3b8',
  },
  taskBulletPersonal: {
    backgroundColor: '#8b5cf6',
  },
  simpleTaskTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
    flex: 1,
  },
  simpleTaskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  simpleTaskDateTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3b82f6',
    marginLeft: 8,
    flexShrink: 0,
  },
  simpleTaskDateTimeCompleted: {
    color: '#94a3b8',
  },

  // 연체 업무
  overdueCard: {
    backgroundColor: '#fff5f5',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  overdueTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#dc2626',
  },
  overdueBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  overdueBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  overdueSectionLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ef4444',
  },
  overdueTaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    gap: 12,
  },
  overdueTaskBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
    flexShrink: 0,
  },
  overdueTaskTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#7f1d1d',
    flex: 1,
  },
  overdueTaskDateTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ef4444',
    marginLeft: 8,
    flexShrink: 0,
  },
  overdueTaskRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  hideButton: {
    padding: 2,
  },
  overdueAllHiddenText: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 8,
  },
  hiddenOverdueFooter: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
    paddingTop: 10,
    gap: 8,
  },
  hiddenToggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  hiddenToggleText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  hiddenTasksList: {
    gap: 6,
  },
  hiddenTaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#fff1f2',
    borderRadius: 8,
    gap: 8,
    opacity: 0.6,
  },
  hiddenTaskTitle: {
    fontSize: 13,
    color: '#9ca3af',
    flex: 1,
    textDecorationLine: 'line-through',
  },
  hiddenTaskDate: {
    fontSize: 11,
    color: '#9ca3af',
    flexShrink: 0,
  },
  clearHiddenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-end',
    paddingVertical: 4,
  },
  clearHiddenText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },

  // 지원 내역
  applicationsList: {
    gap: 12,
  },
  applicationItem: {
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  applicationHeader: {
    marginBottom: 12,
  },
  applicationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  applicationDate: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '500',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusColumn: {
    flex: 1,
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
  },
  applicationContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  applicationCompany: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
    marginRight: 12,
  },

  // 빈 상태
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
  },
  emptyDataCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyDataTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDataText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  emptyDataButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyDataButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
});
