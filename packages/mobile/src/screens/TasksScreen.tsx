import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Linking,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import Holidays from 'date-holidays';
import { useAuth } from '../context/AuthContext';
import { Timestamp } from 'firebase/firestore';
import {
  getTasksByCampCode,
  getTasksByDate,
  getTaskDatesInMonth,
  toggleTaskCompletion,
  deleteTask,
  createTask,
  formatTime,
  formatDuration,
  uploadTaskImage,
} from '../services/taskService';
import { getUserJobCodesInfo } from '../services/authService';
import type { Task, JobExperienceGroupRole, TaskAttachment } from '../../../shared/src/types/camp';
import {
  MENTOR_GROUP_ROLES,
  FOREIGN_GROUP_ROLES,
  JOB_EXPERIENCE_GROUPS,
  type JobExperienceGroup,
  type MentorGroupRole,
  type ForeignGroupRole,
} from '../../../shared/src/types/camp';

interface JobCodeWithGroup {
  generation: string;
  code: string;
  name: string;
}

const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

const hd = new Holidays('KR');

// 대체휴무 및 임시공휴일 등 추가 공휴일 정의
const ADDITIONAL_HOLIDAYS: Record<string, string> = {
  '2026-03-02': '삼일절 대체휴일',
  '2026-05-06': '어린이날 대체휴일',
  '2026-08-17': '광복절 대체휴일',
  '2026-10-05': '개천절 대체휴일',
  // 필요에 따라 추가
};

export function TasksScreen() {
  const { userData, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentGroupRole, setCurrentGroupRole] = useState<JobExperienceGroupRole | null>(null);
  const [currentCampCode, setCurrentCampCode] = useState<string>('');

  // 캘린더 상태
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [taskDates, setTaskDates] = useState<Set<string>>(new Set());
  const [selectedDateTasks, setSelectedDateTasks] = useState<Task[]>([]);

  // 모달 상태
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const isAdmin = userData?.role === 'admin';
  const isManager = currentGroupRole === 'manager';
  const canAddTask = isAdmin || isManager;

  // 활성화된 캠프 정보 가져오기
  const fetchActiveJobCode = async () => {
    if (!userData?.activeJobExperienceId) {
      return null;
    }

    try {
      const jobCodesInfo = await getUserJobCodesInfo([userData.activeJobExperienceId]);
      const activeExp = userData.jobExperiences?.find(
        exp => exp.id === userData.activeJobExperienceId
      );
      if (activeExp && activeExp.groupRole) {
        setCurrentGroupRole(activeExp.groupRole as JobExperienceGroupRole);
      }
      return jobCodesInfo[0] || null;
    } catch (error) {
      console.error('활성화된 직무 코드 정보 가져오기 오류:', error);
      return null;
    }
  };

  // 업무 목록 가져오기
  const fetchTasks = async () => {
    if (!userData?.activeJobExperienceId) {
      setLoading(false);
      setTasks([]);
      return;
    }

    setLoading(true);
    try {
      const activeJobCode = await fetchActiveJobCode();
      if (!activeJobCode) {
        setTasks([]);
        return;
      }

      setCurrentCampCode(activeJobCode.code);
      const fetchedTasks = await getTasksByCampCode(activeJobCode.code);
      setTasks(fetchedTasks);

      // 월별 업무 날짜 가져오기
      await fetchTaskDatesInMonth();

      // 선택된 날짜의 업무 로드
      await loadTasksForDate(selectedDate, activeJobCode.code);
    } catch (error) {
      console.error('업무 목록 가져오기 오류:', error);
      Alert.alert('오류', '업무 목록을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // 월별 업무 날짜 가져오기
  const fetchTaskDatesInMonth = async () => {
    if (!currentCampCode) return;

    try {
      const dates = await getTaskDatesInMonth(
        currentCampCode,
        currentDate.getFullYear(),
        currentDate.getMonth()
      );
      setTaskDates(dates);
    } catch (error) {
      console.error('월별 업무 날짜 가져오기 오류:', error);
    }
  };

  // 특정 날짜의 업무 로드
  const loadTasksForDate = async (date: Date, campCode?: string) => {
    const code = campCode || currentCampCode;
    if (!code) return;

    try {
      const dateTasks = await getTasksByDate(code, date);
      
      // 역할 필터링
      const filtered = dateTasks.filter(task => {
        if (isAdmin) return true;
        if (!currentGroupRole) return false;
        return task.targetRoles.includes(currentGroupRole);
      });

      setSelectedDateTasks(filtered);
    } catch (error) {
      console.error('날짜별 업무 가져오기 오류:', error);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [userData]);

  useEffect(() => {
    if (currentCampCode) {
      fetchTaskDatesInMonth();
    }
  }, [currentDate, currentCampCode]);

  // 날짜 클릭 핸들러
  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    loadTasksForDate(date);
  };

  // 업무 완료 토글
  const handleToggleComplete = async (taskId: string) => {
    if (!userData) {
      Alert.alert('오류', '사용자 정보를 불러올 수 없습니다.');
      return;
    }

    // 관리자이거나 currentGroupRole이 있는 경우 처리
    const role = currentGroupRole || '담임' as JobExperienceGroupRole; // 관리자는 기본 역할 사용

    try {
      await toggleTaskCompletion(taskId, userData.userId, userData.name, role);
      await loadTasksForDate(selectedDate);
    } catch (error) {
      console.error('업무 완료 토글 오류:', error);
      Alert.alert('오류', '업무 상태 변경 중 오류가 발생했습니다.');
    }
  };

  // 공휴일 확인 함수
  const isHoliday = useMemo(() => {
    return (date: Date) => {
      // date-holidays 라이브러리 체크
      const holidays = hd.isHoliday(date);
      if (holidays !== false) return true;
      
      // 추가 공휴일 체크 (대체휴무 등)
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      return dateStr in ADDITIONAL_HOLIDAYS;
    };
  }, []);

  // 캘린더 렌더링
  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days: React.ReactElement[] = [];

    // 빈 칸 추가
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(<View key={`empty-${i}`} style={styles.calendarCell} />);
    }

    // 날짜 추가
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateYear = date.getFullYear();
      const dateMonth = String(date.getMonth() + 1).padStart(2, '0');
      const dateDay = String(date.getDate()).padStart(2, '0');
      const dateStr = `${dateYear}-${dateMonth}-${dateDay}`;
      
      const hasTask = taskDates.has(dateStr);
      const isSelected = selectedDate.toDateString() === date.toDateString();
      const isToday = new Date().toDateString() === date.toDateString();
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHolidayDate = isHoliday(date);

      days.push(
        <TouchableOpacity
          key={day}
          onPress={() => handleDateClick(date)}
          style={[
            styles.calendarCell,
            isSelected && styles.calendarCellSelected,
            isToday && !isSelected && styles.calendarCellToday,
            hasTask && !isSelected && styles.calendarCellHasTask,
          ]}
        >
          <Text
            style={[
              styles.calendarDayText,
              (isWeekend || isHolidayDate) && !isSelected && styles.calendarDayTextWeekend,
              isSelected && styles.calendarDayTextSelected,
              isToday && !isSelected && styles.calendarDayTextToday,
            ]}
          >
            {day}
          </Text>
          {hasTask && !isSelected && (
            <View style={styles.taskDot} />
          )}
        </TouchableOpacity>
      );
    }

    return days;
  };

  if (authLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>로딩 중...</Text>
      </View>
    );
  }

  if (!userData) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="lock-closed-outline" size={64} color="#cbd5e1" />
        <Text style={styles.emptyTitle}>로그인 필요</Text>
        <Text style={styles.emptyText}>로그인 후 이용 가능합니다.</Text>
      </View>
    );
  }

  if (!userData.activeJobExperienceId) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="settings-outline" size={64} color="#3b82f6" />
        <Text style={styles.emptyTitle}>캠프를 선택해주세요</Text>
        <Text style={styles.emptyText}>마이페이지에서 활성화할 캠프를 선택하면</Text>
        <Text style={styles.emptyText}>해당 캠프의 업무를 확인할 수 있습니다.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>업무를 불러오는 중...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* 캘린더 헤더 */}
        <View style={styles.calendarHeaderSection}>
          <TouchableOpacity
            onPress={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
            style={styles.navButton}
          >
            <Ionicons name="chevron-back" size={20} color="#6b7280" />
          </TouchableOpacity>
          <Text style={styles.calendarTitle}>
            {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
          </Text>
          <TouchableOpacity
            onPress={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
            style={styles.navButton}
          >
            <Ionicons name="chevron-forward" size={20} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* 달력 */}
        <View style={styles.calendarContainer}>
          {/* 요일 헤더 */}
          <View style={styles.weekDaysRow}>
            {DAYS_OF_WEEK.map((day, i) => (
              <View key={day} style={styles.weekDayCell}>
                <Text
                  style={[
                    styles.weekDayText,
                    (i === 0 || i === 6) && styles.weekDayTextWeekend,
                  ]}
                >
                  {day}
                </Text>
              </View>
            ))}
          </View>

          {/* 날짜 그리드 */}
          <View style={styles.calendarGrid}>
            {renderCalendar()}
          </View>
        </View>

        {/* 선택된 날짜의 업무 목록 */}
        <View style={styles.taskListContainer}>
          <View style={styles.taskListHeader}>
            <Text style={styles.taskListTitle}>
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 ({DAYS_OF_WEEK[selectedDate.getDay()]})
            </Text>
            <Text style={styles.taskCount}>
              {selectedDateTasks.length}개 업무
            </Text>
          </View>

          {selectedDateTasks.length === 0 ? (
            <View style={styles.emptyTaskContainer}>
              <Ionicons name="calendar-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyTaskText}>이 날짜에 등록된 업무가 없습니다</Text>
            </View>
          ) : (
            <View style={styles.taskList}>
              {selectedDateTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  currentUserId={userData.userId}
                  onToggle={handleToggleComplete}
                  onPress={() => {
                    setSelectedTask(task);
                    setShowDetailModal(true);
                  }}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* 업무 상세 모달 */}
      {selectedTask && (
        <TaskDetailModal
          visible={showDetailModal}
          task={selectedTask}
          isAdmin={isAdmin}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedTask(null);
          }}
        />
      )}

      {/* 업무 추가 FAB */}
      {canAddTask && currentCampCode && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowAddModal(true)}
        >
          <Ionicons name="add" size={28} color="#ffffff" />
        </TouchableOpacity>
      )}

      {/* 업무 추가 모달 */}
      <TaskAddModal
        visible={showAddModal}
        campCode={currentCampCode}
        initialDate={selectedDate}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false);
          fetchTasks();
        }}
      />
    </View>
  );
}

// 업무 카드 컴포넌트
function TaskCard({
  task,
  currentUserId,
  onToggle,
  onPress,
}: {
  task: Task;
  currentUserId: string;
  onToggle: (taskId: string) => void;
  onPress: () => void;
}) {
  const isCompleted = task.completions.some(c => c.userId === currentUserId);
  const timeStr = formatTime(task.time);
  const durationStr = formatDuration(task.estimatedDuration);

  return (
    <TouchableOpacity
      style={styles.taskCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.taskCardContent}>
        <View style={styles.taskInfo}>
          <View style={styles.taskMeta}>
            {timeStr && (
              <Text style={styles.taskTime}>{timeStr}</Text>
            )}
            {durationStr && (
              <Text style={styles.taskDuration}>{durationStr}</Text>
            )}
          </View>
          
          <Text
            style={[
              styles.taskTitle,
              isCompleted && styles.taskTitleCompleted,
            ]}
          >
            {task.title}
          </Text>
          
          <View style={styles.taskFooter}>
            <Text style={styles.taskRoles}>
              {task.targetRoles.join(', ')}
            </Text>
            {task.attachments && task.attachments.length > 0 && (
              <Text style={styles.taskAttachments}>
                📎 {task.attachments.length}
              </Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onToggle(task.id);
          }}
          style={styles.checkbox}
        >
          <Ionicons
            name={isCompleted ? 'checkbox' : 'square-outline'}
            size={24}
            color={isCompleted ? '#3b82f6' : '#9ca3af'}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// 업무 상세 모달 컴포넌트
function TaskDetailModal({
  visible,
  task,
  isAdmin,
  onClose,
}: {
  visible: boolean;
  task: Task;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const dateStr = task.date.toDate().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
  const timeStr = formatTime(task.time);
  const durationStr = formatDuration(task.estimatedDuration);

  // 링크와 이미지 분리
  const linkAttachments = task.attachments?.filter(a => a.type === 'link') || [];
  const imageAttachments = task.attachments?.filter(a => a.type === 'image') || [];
  const otherAttachments = task.attachments?.filter(a => a.type !== 'link' && a.type !== 'image') || [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* 헤더 */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>업무 상세</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color="#9ca3af" />
            </TouchableOpacity>
          </View>

          {/* 내용 */}
          <ScrollView style={styles.modalContent}>
            {/* 제목 */}
            <View style={styles.modalSection}>
              <Text style={styles.modalTaskTitle}>{task.title}</Text>
            </View>

            {/* 날짜 및 시간 */}
            <View style={styles.modalSection}>
              <View style={styles.infoRow}>
                <Ionicons name="calendar-outline" size={16} color="#6b7280" />
                <Text style={styles.infoText}>{dateStr}</Text>
              </View>
              {timeStr && (
                <View style={styles.infoRow}>
                  <Ionicons name="time-outline" size={16} color="#6b7280" />
                  <Text style={styles.infoText}>
                    {timeStr}
                    {durationStr && ` (${durationStr})`}
                  </Text>
                </View>
              )}
            </View>

            {/* 대상 역할 */}
            <View style={styles.modalSection}>
              <Text style={styles.sectionLabel}>대상 역할</Text>
              <View style={styles.rolesContainer}>
                {task.targetRoles.map(role => (
                  <View key={role} style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{role}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* 대상 그룹 */}
            {task.targetGroups && task.targetGroups.length > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>대상 그룹</Text>
                <View style={styles.rolesContainer}>
                  {task.targetGroups.map(group => (
                    <View key={group} style={styles.groupBadge}>
                      <Text style={styles.groupBadgeText}>{group}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* 설명 */}
            {task.description && (
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>상세 설명</Text>
                <Text style={styles.descriptionText}>{task.description}</Text>
              </View>
            )}

            {/* 링크 (최우선) */}
            {linkAttachments.length > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>링크</Text>
                {linkAttachments.map((attachment, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.attachmentItem}
                    onPress={() => Linking.openURL(attachment.url)}
                  >
                    <View style={styles.attachmentInfo}>
                      <Text style={styles.attachmentIcon}>🔗</Text>
                      <Text style={styles.attachmentLabel} numberOfLines={1}>
                        {attachment.label}
                      </Text>
                    </View>
                    <Ionicons name="open-outline" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* 이미지 */}
            {imageAttachments.length > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>이미지</Text>
                {imageAttachments.map((attachment, idx) => (
                  <View key={idx} style={styles.imageContainer}>
                    <Image
                      source={{ uri: attachment.url }}
                      style={styles.attachmentImageFull}
                      contentFit="cover"
                      transition={0}
                      cachePolicy="memory-disk"
                      priority="high"
                    />
                  </View>
                ))}
              </View>
            )}

            {/* 기타 파일 */}
            {otherAttachments.length > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>첨부파일</Text>
                {otherAttachments.map((attachment, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.attachmentItem}
                    onPress={() => Linking.openURL(attachment.url)}
                  >
                    <View style={styles.attachmentInfo}>
                      <Text style={styles.attachmentIcon}>
                        {attachment.type === 'video' && '🎥'}
                        {attachment.type === 'file' && '📎'}
                      </Text>
                      <Text style={styles.attachmentLabel} numberOfLines={1}>
                        {attachment.label}
                      </Text>
                    </View>
                    <Ionicons name="open-outline" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* 완료 현황 (Admin) */}
            {isAdmin && task.completions.length > 0 && (
              <View style={styles.modalSection}>
                <Text style={styles.sectionLabel}>
                  완료 현황 ({task.completions.length}명)
                </Text>
                <View style={styles.completionsContainer}>
                  {task.completions.map((completion, idx) => (
                    <View key={idx} style={styles.completionBadge}>
                      <Text style={styles.completionText}>
                        {completion.userName} ({completion.userRole})
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </ScrollView>

          {/* 푸터 */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.closeModalButton}
              onPress={onClose}
            >
              <Text style={styles.closeModalButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// 업무 추가 모달 컴포넌트
function TaskAddModal({
  visible,
  campCode,
  initialDate,
  onClose,
  onSuccess,
}: {
  visible: boolean;
  campCode: string;
  initialDate?: Date;
  onClose: () => void;
  onSuccess: () => void;
}) {
  // 타겟 역할 타입 (멘토용/원어민용)
  const [targetRoleType, setTargetRoleType] = useState<'mentor' | 'foreign'>('mentor');
  
  // 날짜 및 시간
  const [date, setDate] = useState(initialDate || new Date());
  const [time, setTime] = useState('');
  const [hasTime, setHasTime] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // 대상 역할
  const [targetRoles, setTargetRoles] = useState<JobExperienceGroupRole[]>([]);
  
  // 대상 그룹
  const [targetGroups, setTargetGroups] = useState<JobExperienceGroup[]>([]);
  
  // 업무 제목 & 설명
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // 소요 시간
  const [estimatedDuration, setEstimatedDuration] = useState('');
  
  // 첨부파일
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // 모달이 열릴 때 initialDate로 날짜 초기화
  useEffect(() => {
    if (visible && initialDate) {
      setDate(initialDate);
    }
  }, [visible, initialDate]);

  // roleOptions는 targetRoleType에 따라 동적으로 변경
  const getMentorRoles = (): JobExperienceGroupRole[] => Array.from(MENTOR_GROUP_ROLES);
  const getForeignRoles = (): JobExperienceGroupRole[] => Array.from(FOREIGN_GROUP_ROLES);
  const roleOptions = targetRoleType === 'mentor' ? getMentorRoles() : getForeignRoles();
  
  // 그룹 옵션
  const groupOptions: JobExperienceGroup[] = [...JOB_EXPERIENCE_GROUPS];

  // 날짜 변경 핸들러는 이제 사용 안 함 (인라인 달력 사용)

  // 달력 렌더링
  const renderCalendar = () => {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days: React.ReactElement[] = [];

    // 빈 칸 추가
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(
        <View key={`empty-${i}`} style={styles.modalCalendarDay} />
      );
    }

    // 날짜 추가
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(year, month, day);
      const isSelected = 
        date.getDate() === day && 
        date.getMonth() === month && 
        date.getFullYear() === year;
      const isToday = 
        today.getDate() === day && 
        today.getMonth() === month && 
        today.getFullYear() === year;
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      // 공휴일 체크 (라이브러리 + 추가 공휴일)
      const holidays = hd.isHoliday(currentDate);
      const yearStr = currentDate.getFullYear();
      const monthStr = String(currentDate.getMonth() + 1).padStart(2, '0');
      const dayStr = String(currentDate.getDate()).padStart(2, '0');
      const dateStr = `${yearStr}-${monthStr}-${dayStr}`;
      const isHolidayDate = holidays !== false || dateStr in ADDITIONAL_HOLIDAYS;

      days.push(
        <TouchableOpacity
          key={day}
          onPress={() => {
            setDate(currentDate);
            setShowDatePicker(false);
          }}
          style={[
            styles.modalCalendarDay,
            isSelected && styles.modalCalendarDaySelected,
            isToday && !isSelected && styles.modalCalendarDayToday,
          ]}
        >
          <Text
            style={[
              styles.modalCalendarDayText,
              (isWeekend || isHolidayDate) && !isSelected && styles.calendarDayTextWeekend,
              isSelected && styles.calendarDayTextSelected,
              isToday && !isSelected && styles.calendarDayTextToday,
            ]}
          >
            {day}
          </Text>
        </TouchableOpacity>
      );
    }

    return days;
  };

  // 이미지 선택 핸들러
  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('권한 필요', '사진 라이브러리 접근 권한이 필요합니다.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 5,
      });

      if (!result.canceled && result.assets) {
        setUploadingImage(true);
        try {
          for (const asset of result.assets) {
            const fileName = asset.fileName || `image_${Date.now()}.jpg`;
            const uploadedAttachment = await uploadTaskImage('temp', asset.uri, fileName);
            setAttachments((prev) => [...prev, uploadedAttachment]);
          }
          Alert.alert('성공', '이미지가 업로드되었습니다.');
        } catch (error) {
          console.error('이미지 업로드 오류:', error);
          Alert.alert('오류', '이미지 업로드 중 오류가 발생했습니다.');
        } finally {
          setUploadingImage(false);
        }
      }
    } catch (error) {
      console.error('이미지 선택 오류:', error);
      Alert.alert('오류', '이미지 선택 중 오류가 발생했습니다.');
    }
  };

  const handleAddLink = () => {
    if (!linkLabel.trim() || !linkUrl.trim()) {
      Alert.alert('오류', '링크 이름과 URL을 모두 입력해주세요.');
      return;
    }

    setAttachments([
      ...attachments,
      {
        type: 'link',
        url: linkUrl.trim(),
        label: linkLabel.trim(),
      },
    ]);
    setLinkLabel('');
    setLinkUrl('');
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments(attachments.filter((_, i) => i !== index));
  };

  const toggleRole = (role: JobExperienceGroupRole) => {
    setTargetRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('오류', '업무 제목을 입력해주세요.');
      return;
    }

    if (targetRoles.length === 0) {
      Alert.alert('오류', '대상 역할을 하나 이상 선택해주세요.');
      return;
    }

    if (targetGroups.length === 0) {
      Alert.alert('오류', '대상 그룹을 하나 이상 선택해주세요.');
      return;
    }

    // 시간 형식 검증
    if (hasTime && time) {
      const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timePattern.test(time)) {
        Alert.alert('오류', '시간을 24시간 형식으로 입력해주세요 (예: 14:30)');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const localDate = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        0, 0, 0, 0
      );

      const taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completions' | 'createdBy'> = {
        campCode,
        title: title.trim(),
        description: description.trim(),
        date: Timestamp.fromDate(localDate),
        time: hasTime && time ? time : undefined,
        estimatedDuration:
          estimatedDuration && !isNaN(Number(estimatedDuration))
            ? { value: Number(estimatedDuration), unit: 'minutes' }
            : undefined,
        targetRoles,
        targetGroups,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      await createTask(campCode, taskData);
      Alert.alert('성공', '업무가 추가되었습니다.');
      
      // 폼 초기화
      setTargetRoleType('mentor');
      setDate(new Date());
      setTime('');
      setHasTime(false);
      setTargetRoles([]);
      setTargetGroups([]);
      setTitle('');
      setDescription('');
      setEstimatedDuration('');
      setAttachments([]);
      
      onSuccess();
    } catch (error) {
      console.error('업무 추가 오류:', error);
      Alert.alert('오류', '업무 추가 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.addModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>새 업무 추가</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={24} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.addModalContent}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
            {/* 0. 타겟 역할 타입 선택 (mentor/foreign) - 보라색 테두리 */}
            <View style={[styles.formGroup, styles.sectionBorderPurple]}>
              <Text style={styles.formLabel}>🎯 업무 대상 선택 (멘토/원어민)</Text>
              <View style={styles.roleTypeButtons}>
                <TouchableOpacity
                  style={[
                    styles.roleTypeButton,
                    targetRoleType === 'mentor' && styles.roleTypeButtonMentorActive,
                  ]}
                  onPress={() => {
                    setTargetRoleType('mentor');
                    setTargetRoles([]);
                  }}
                >
                  <Text
                    style={[
                      styles.roleTypeButtonText,
                      targetRoleType === 'mentor' && styles.roleTypeButtonTextActive,
                    ]}
                  >
                    멘토용
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.roleTypeButton,
                    targetRoleType === 'foreign' && styles.roleTypeButtonForeignActive,
                  ]}
                  onPress={() => {
                    setTargetRoleType('foreign');
                    setTargetRoles([]);
                  }}
                >
                  <Text
                    style={[
                      styles.roleTypeButtonText,
                      targetRoleType === 'foreign' && styles.roleTypeButtonTextActive,
                    ]}
                  >
                    원어민용
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 1. 날짜 및 시간 - 파란색 테두리 */}
            <View style={[styles.formGroup, styles.sectionBorderBlue]}>
              <Text style={styles.formLabel}>
                📅 날짜 및 시간 <Text style={styles.required}>*</Text>
              </Text>
              
              {/* 날짜 선택 버튼 */}
              <TouchableOpacity
                style={styles.datePickerButton}
                onPress={() => setShowDatePicker(!showDatePicker)}
              >
                <Text style={styles.datePickerButtonText}>
                  {date.toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </Text>
                <Ionicons 
                  name={showDatePicker ? "chevron-up" : "chevron-down"} 
                  size={20} 
                  color="#6b7280" 
                />
              </TouchableOpacity>

              {/* 인라인 달력 */}
              {showDatePicker && (
                <View style={styles.modalCalendarContainer}>
                  {/* 월 네비게이션 */}
                  <View style={styles.modalCalendarHeader}>
                    <TouchableOpacity
                      style={styles.modalCalendarNavButton}
                      onPress={() => {
                        const newDate = new Date(date);
                        newDate.setMonth(date.getMonth() - 1);
                        setDate(newDate);
                      }}
                    >
                      <Ionicons name="chevron-back" size={20} color="#6b7280" />
                    </TouchableOpacity>
                    <Text style={styles.modalCalendarTitle}>
                      {date.getFullYear()}년 {date.getMonth() + 1}월
                    </Text>
                    <TouchableOpacity
                      style={styles.modalCalendarNavButton}
                      onPress={() => {
                        const newDate = new Date(date);
                        newDate.setMonth(date.getMonth() + 1);
                        setDate(newDate);
                      }}
                    >
                      <Ionicons name="chevron-forward" size={20} color="#6b7280" />
                    </TouchableOpacity>
                  </View>

                  {/* 요일 헤더 */}
                  <View style={styles.modalCalendarWeekDays}>
                    {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
                      <Text
                        key={day}
                        style={[
                          styles.modalCalendarWeekDayText,
                          (i === 0 || i === 6) && styles.weekDayTextWeekend,
                        ]}
                      >
                        {day}
                      </Text>
                    ))}
                  </View>

                  {/* 날짜 그리드 */}
                  <View style={styles.modalCalendarGrid}>
                    {renderCalendar()}
                  </View>
                </View>
              )}

              {/* 시간 지정 체크박스 */}
              <View style={styles.timeCheckboxContainer}>
                <TouchableOpacity
                  style={styles.checkboxButton}
                  onPress={() => setHasTime(!hasTime)}
                >
                  <View style={[styles.checkbox, hasTime && styles.checkboxChecked]}>
                    {hasTime && <Ionicons name="checkmark" size={14} color="#ffffff" />}
                  </View>
                  <Text style={styles.checkboxLabel}>시간 지정</Text>
                </TouchableOpacity>
              </View>

              {/* 시간 입력 */}
              {hasTime && (
                <TextInput
                  style={styles.formInput}
                  value={time}
                  onChangeText={setTime}
                  placeholder="24시간 형식 (예: 14:30)"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numbers-and-punctuation"
                />
              )}
            </View>

            {/* 2. 대상 역할 */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>
                👥 대상 역할 <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.roleButtons}>
                {roleOptions.map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.roleButton,
                      targetRoles.includes(role) && styles.roleButtonActive,
                    ]}
                    onPress={() => toggleRole(role)}
                  >
                    <Text
                      style={[
                        styles.roleButtonText,
                        targetRoles.includes(role) && styles.roleButtonTextActive,
                      ]}
                    >
                      {role}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 3. 대상 그룹 */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>
                🎯 대상 그룹 <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.roleButtons}>
                {groupOptions.map((group) => (
                  <TouchableOpacity
                    key={group}
                    style={[
                      styles.groupButton,
                      targetGroups.includes(group) && styles.groupButtonActive,
                    ]}
                    onPress={() => {
                      setTargetGroups((prev) =>
                        prev.includes(group)
                          ? prev.filter((g) => g !== group)
                          : [...prev, group]
                      );
                    }}
                  >
                    <Text
                      style={[
                        styles.groupButtonText,
                        targetGroups.includes(group) && styles.groupButtonTextActive,
                      ]}
                    >
                      {group}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 4. 업무 제목 */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>
                ✏️ 업무 제목 <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.formInput}
                value={title}
                onChangeText={setTitle}
                placeholder="예: 학생 명단 확인"
                placeholderTextColor="#9ca3af"
              />
            </View>

            {/* 5. 업무 설명 */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>📝 업무 설명</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="업무에 대한 상세 설명"
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* 6. 소요 시간 (옵션) */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>⏱️ 예상 소요시간 (선택)</Text>
              <View style={styles.durationContainer}>
                <TextInput
                  style={[styles.formInput, styles.durationInput]}
                  value={estimatedDuration}
                  onChangeText={setEstimatedDuration}
                  placeholder="0"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                />
                <Text style={styles.durationUnitLabel}>분</Text>
              </View>
            </View>

            {/* 7. 첨부파일 및 링크 */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>📎 첨부파일 및 링크</Text>
              
              {/* 업로드 버튼들 */}
              <View style={styles.uploadButtonsContainer}>
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={handlePickImage}
                  disabled={uploadingImage}
                >
                  <Ionicons name="image-outline" size={16} color="#6b7280" />
                  <Text style={styles.uploadButtonText}>이미지</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.uploadButton, styles.uploadButtonLink]}
                  onPress={() => {
                    if (!linkLabel.trim() || !linkUrl.trim()) {
                      Alert.alert('알림', '아래 링크 정보를 입력한 후 버튼을 눌러주세요.');
                      return;
                    }
                    setAttachments([
                      ...attachments,
                      {
                        type: 'link',
                        url: linkUrl.trim(),
                        label: linkLabel.trim(),
                      },
                    ]);
                    setLinkLabel('');
                    setLinkUrl('');
                  }}
                >
                  <Ionicons name="link-outline" size={16} color="#1e40af" />
                  <Text style={[styles.uploadButtonText, styles.uploadButtonTextLink]}>링크</Text>
                </TouchableOpacity>
              </View>

              {uploadingImage && (
                <View style={styles.uploadingContainer}>
                  <ActivityIndicator size="small" color="#3b82f6" />
                  <Text style={styles.uploadingText}>업로드 중...</Text>
                </View>
              )}

              {/* 링크 입력 필드 */}
              <View style={styles.linkInputContainer}>
                <TextInput
                  style={[styles.formInput, styles.linkInput]}
                  value={linkLabel}
                  onChangeText={setLinkLabel}
                  placeholder="링크 이름 (예: 구글 드라이브)"
                  placeholderTextColor="#9ca3af"
                />
                <TextInput
                  style={[styles.formInput, styles.linkInput]}
                  value={linkUrl}
                  onChangeText={setLinkUrl}
                  placeholder="URL (https://...)"
                  placeholderTextColor="#9ca3af"
                  autoCapitalize="none"
                />
              </View>

              {/* 첨부파일 목록 */}
              {attachments.length > 0 && (
                <View style={styles.attachmentsList}>
                  {attachments.map((attachment, index) => (
                    <View key={index} style={styles.attachmentPreview}>
                      <View style={styles.attachmentPreviewInfo}>
                        <Text style={styles.attachmentPreviewIcon}>
                          {attachment.type === 'image' && '🖼️'}
                          {attachment.type === 'link' && '🔗'}
                          {attachment.type === 'file' && '📎'}
                        </Text>
                        <Text style={styles.attachmentPreviewLabel} numberOfLines={1}>
                          {attachment.label}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => {
                        setAttachments(attachments.filter((_, i) => i !== index));
                      }}>
                        <Ionicons name="close-circle" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </ScrollView>

          {/* 푸터 버튼 */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelModalButton}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelModalButtonText}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitModalButton, isSubmitting && styles.submitModalButtonDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitModalButtonText}>추가하기</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6b7280',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  calendarHeaderSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#ffffff',
  },
  navButton: {
    padding: 6,
  },
  calendarTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  calendarContainer: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingVertical: 8,
  },
  weekDaysRow: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
  },
  weekDayText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },
  weekDayTextWeekend: {
    color: '#ef4444',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
  },
  calendarCell: {
    flexBasis: '14.285714%',
    flexGrow: 0,
    flexShrink: 0,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
    borderRadius: 6,
  },
  calendarCellSelected: {
    backgroundColor: '#3b82f6',
  },
  calendarCellToday: {
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  calendarCellHasTask: {
    backgroundColor: '#f3f4f6',
  },
  calendarDayText: {
    fontSize: 11,
    color: '#6b7280',
  },
  calendarDayTextWeekend: {
    color: '#ef4444',
  },
  calendarDayTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  calendarDayTextToday: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  taskDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3b82f6',
  },
  taskListContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  taskListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  taskListTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  taskCount: {
    fontSize: 12,
    color: '#6b7280',
  },
  emptyTaskContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderStyle: 'dashed',
  },
  emptyTaskText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6b7280',
  },
  taskList: {
    gap: 8,
  },
  taskCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  taskCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    marginTop: 4,
  },
  taskInfo: {
    flex: 1,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 4,
  },
  taskTime: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3b82f6',
  },
  taskDuration: {
    fontSize: 11,
    color: '#6b7280',
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#9ca3af',
  },
  taskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskRoles: {
    fontSize: 11,
    color: '#6b7280',
  },
  taskAttachments: {
    fontSize: 11,
    color: '#9ca3af',
  },
  // 모달 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '100%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    padding: 16,
    maxHeight: 500,
  },
  modalSection: {
    marginBottom: 16,
  },
  modalTaskTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: '500',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
  },
  rolesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  roleBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1e40af',
  },
  groupBadge: {
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  groupBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#065f46',
  },
  descriptionText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
  },
  attachmentImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  attachmentImageFull: {
    width: '100%',
    minHeight: 200,
    maxHeight: 500,
    borderRadius: 0,
  },
  imageContainer: {
    marginBottom: 8,
  },
  attachmentImageLabel: {
    fontSize: 11,
    color: '#6b7280',
    marginTop: 4,
  },
  attachmentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  attachmentIcon: {
    fontSize: 14,
  },
  attachmentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  completionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  completionBadge: {
    backgroundColor: '#d1fae5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  completionText: {
    fontSize: 11,
    color: '#065f46',
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  closeModalButton: {
    backgroundColor: '#f3f4f6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeModalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  // FAB 스타일
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
  },
  // 업무 추가 모달 스타일
  addModalContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    maxHeight: '95%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  addModalContent: {
    padding: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  sectionBorderPurple: {
    borderWidth: 1,
    borderColor: '#d8b4fe',
    backgroundColor: '#faf5ff',
    borderRadius: 8,
    padding: 12,
  },
  sectionBorderBlue: {
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 12,
  },
  roleTypeButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  roleTypeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  roleTypeButtonMentorActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  roleTypeButtonForeignActive: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  roleTypeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  roleTypeButtonTextActive: {
    color: '#ffffff',
  },
  timeCheckboxContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  checkboxButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  checkboxLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  datePickerButtonText: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
  },
  modalCalendarContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 8,
    marginTop: 8,
  },
  modalCalendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  modalCalendarNavButton: {
    padding: 4,
  },
  modalCalendarTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  modalCalendarWeekDays: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  modalCalendarWeekDayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },
  modalCalendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
  },
  modalCalendarDay: {
    flexBasis: '14.285714%',
    flexGrow: 0,
    flexShrink: 0,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  modalCalendarDaySelected: {
    backgroundColor: '#3b82f6',
    borderRadius: 6,
  },
  modalCalendarDayToday: {
    backgroundColor: '#dbeafe',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  modalCalendarDayText: {
    fontSize: 13,
    color: '#374151',
  },
  required: {
    color: '#ef4444',
  },
  formInput: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  formTextArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  datePreview: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '500',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
  },
  priorityButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  durationContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  durationInput: {
    flex: 1,
  },
  durationUnitLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  durationUnitButtons: {
    flexDirection: 'row',
    gap: 4,
  },
  durationUnitButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  durationUnitButtonActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  durationUnitText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  durationUnitTextActive: {
    color: '#ffffff',
  },
  groupButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  groupButtonActive: {
    backgroundColor: '#d1fae5',
    borderColor: '#10b981',
  },
  groupButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  groupButtonTextActive: {
    color: '#065f46',
  },
  attachmentsList: {
    marginTop: 8,
  },
  roleButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  roleButtonActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  roleButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  roleButtonTextActive: {
    color: '#1e40af',
  },
  linkInputContainer: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 8,
  },
  linkInput: {
    flex: 1,
  },
  uploadButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  uploadButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
  },
  uploadButtonLink: {
    backgroundColor: '#dbeafe',
    borderColor: '#93c5fd',
  },
  uploadButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  uploadButtonTextLink: {
    color: '#1e40af',
  },
  uploadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  uploadingText: {
    fontSize: 12,
    color: '#6b7280',
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  attachmentPreviewInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  attachmentPreviewIcon: {
    fontSize: 14,
  },
  attachmentPreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  cancelModalButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelModalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  submitModalButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitModalButtonDisabled: {
    opacity: 0.5,
  },
  submitModalButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
});
