import React, { useEffect, useState } from 'react';
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
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
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
} from '../services/taskService';
import { getUserJobCodesInfo } from '../services/authService';
import type { Task, JobExperienceGroupRole } from '../../../shared/src/types/camp';

interface JobCodeWithGroup {
  generation: string;
  code: string;
  name: string;
}

const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

const priorityConfig = {
  high: { color: '#ef4444', label: '중요', icon: '🔴' },
  medium: { color: '#eab308', label: '보통', icon: '🟡' },
  low: { color: '#6b7280', label: '낮음', icon: '⚪' },
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

  const isAdmin = userData?.role === 'admin';

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
    if (!userData || !currentGroupRole) {
      Alert.alert('오류', '사용자 정보를 불러올 수 없습니다.');
      return;
    }

    try {
      await toggleTaskCompletion(taskId, userData.userId, userData.name, currentGroupRole);
      await loadTasksForDate(selectedDate);
    } catch (error) {
      console.error('업무 완료 토글 오류:', error);
      Alert.alert('오류', '업무 상태 변경 중 오류가 발생했습니다.');
    }
  };

  // 캘린더 렌더링
  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days: JSX.Element[] = [];

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
        <View style={styles.calendarHeader}>
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
                    i === 0 && styles.weekDayTextSunday,
                    i === 6 && styles.weekDayTextSaturday,
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
  const priorityInfo = priorityConfig[task.priority];
  const timeStr = formatTime(task.time);
  const durationStr = formatDuration(task.estimatedDuration);

  return (
    <TouchableOpacity
      style={styles.taskCard}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.taskCardContent}>
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

        <View style={styles.taskInfo}>
          <View style={styles.taskMeta}>
            {timeStr && (
              <Text style={styles.taskTime}>{timeStr}</Text>
            )}
            <View style={styles.priorityBadge}>
              <Text style={styles.priorityIcon}>{priorityInfo.icon}</Text>
              <Text style={[styles.priorityLabel, { color: priorityInfo.color }]}>
                {priorityInfo.label}
              </Text>
            </View>
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
  const priorityInfo = priorityConfig[task.priority];
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
            {/* 제목 및 우선순위 */}
            <View style={styles.modalSection}>
              <View style={styles.priorityRow}>
                <Text style={[styles.priorityIcon, { color: priorityInfo.color }]}>
                  {priorityInfo.icon}
                </Text>
                <Text style={[styles.priorityText, { color: priorityInfo.color }]}>
                  우선순위: {priorityInfo.label}
                </Text>
              </View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
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
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
  },
  navButton: {
    padding: 8,
  },
  calendarTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  calendarContainer: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 8,
  },
  weekDaysRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekDayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  weekDayTextSunday: {
    color: '#ef4444',
  },
  weekDayTextSaturday: {
    color: '#3b82f6',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: `${100 / 7}%`,
    height: 36, // aspectRatio 대신 고정 높이
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    borderRadius: 6,
    position: 'relative',
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
    fontSize: 12,
    color: '#6b7280',
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
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priorityIcon: {
    fontSize: 12,
  },
  priorityLabel: {
    fontSize: 11,
    fontWeight: '600',
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
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
  priorityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  priorityIcon: {
    fontSize: 20,
  },
  priorityText: {
    fontSize: 12,
    fontWeight: '600',
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
});
