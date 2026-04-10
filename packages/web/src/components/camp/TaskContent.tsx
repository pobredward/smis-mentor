'use client';
import { logger } from '@smis-mentor/shared';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
// @ts-ignore - date-holidays 타입 정의가 없음
import Holidays from 'date-holidays';
import {
  getTasksByCampCode,
  getTasksByDate,
  getTaskDatesInMonth,
  toggleTaskCompletion,
  deleteTask,
  createTask,
  formatTime,
  formatDuration,
} from '@/lib/taskService';
import { getUserJobCodesInfo, getUsersByJobCode } from '@/lib/firebaseService';
import type { Task, JobExperienceGroupRole, User } from '@smis-mentor/shared';
import { getTaskTargetUsers, getTaskCompletionStatus, getUserNames } from '@smis-mentor/shared';
import { JobCodeWithGroup } from '@/types';
import TaskFormModal from './TaskFormModal';
import TaskDetailModal from './TaskDetailModal';

const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];

// @ts-ignore
const hd = new Holidays('KR');

const ADDITIONAL_HOLIDAYS: Record<string, string> = {
  '2026-03-02': '삼일절 대체휴일',
  '2026-05-06': '어린이날 대체휴일',
  '2026-08-17': '광복절 대체휴일',
  '2026-10-05': '개천절 대체휴일',
};

export default function TaskContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { userData, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentGroupRole, setCurrentGroupRole] = useState<JobExperienceGroupRole | null>(null);
  const [currentCampCode, setCurrentCampCode] = useState<string>(''); // code (예: E27)
  const [currentCampCodeId, setCurrentCampCodeId] = useState<string>(''); // Firestore 문서 ID
  const [campUsers, setCampUsers] = useState<User[]>([]); // 캠프 사용자 목록
  const [mounted, setMounted] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 캘린더 상태
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [taskDates, setTaskDates] = useState<Set<string>>(new Set());
  const [selectedDateTasks, setSelectedDateTasks] = useState<Task[]>([]);

  // 모달 상태
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showTaskDetail, setShowTaskDetail] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isCopyMode, setIsCopyMode] = useState(false);

  const isAdmin = userData?.role === 'admin';

  useEffect(() => {
    setMounted(true);
  }, []);

  // URL 파라미터에서 날짜 읽기
  useEffect(() => {
    const dateParam = searchParams?.get('date');
    if (dateParam) {
      try {
        // YYYY-MM-DD 형식을 로컬 타임존으로 파싱
        const [year, month, day] = dateParam.split('-').map(Number);
        if (year && month && day) {
          const date = new Date(year, month - 1, day);
          if (!isNaN(date.getTime())) {
            setSelectedDate(date);
            setCurrentDate(date);
          }
        }
      } catch (error) {
        logger.error('날짜 파라미터 파싱 오류:', error);
      }
    }
  }, [searchParams]);

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
      if (activeExp) {
        setCurrentGroupRole(activeExp.groupRole);
      }
      
      const jobCodeInfo = jobCodesInfo[0];
      if (jobCodeInfo) {
        // jobCodeInfo.id는 Firestore 문서 ID
        logger.info('fetchActiveJobCode - jobCodeInfo:', jobCodeInfo);
        logger.info('jobCodeInfo.id (Firestore ID):', jobCodeInfo.id);
      }
      
      return jobCodeInfo || null;
    } catch (error) {
      logger.error('활성화된 직무 코드 정보 가져오기 오류:', error);
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

      logger.info('=== 업무 목록 가져오기 ===');
      logger.info('activeJobCode:', activeJobCode);
      logger.info('activeJobCode.id (Firestore ID):', activeJobCode.id);
      logger.info('generation:', activeJobCode.generation);
      logger.info('code:', activeJobCode.code);

      setCurrentCampCode(activeJobCode.code); // code: E27
      setCurrentCampCodeId(activeJobCode.id); // Firestore ID
      
      // 캠프 사용자 목록 가져오기
      if (isAdmin) {
        logger.info('관리자 - 캠프 사용자 조회 시작');
        const users = await getUsersByJobCode(activeJobCode.generation, activeJobCode.code);
        logger.info('조회된 사용자 수:', users.length);
        logger.info('사용자 목록:', users.map(u => ({ name: u.name, jobExperiences: u.jobExperiences })));
        setCampUsers(users);
      }

      const fetchedTasks = await getTasksByCampCode(activeJobCode.code);
      setTasks(fetchedTasks);

      // 월별 업무 날짜 가져오기
      await fetchTaskDatesInMonth();

      // 선택된 날짜의 업무 로드
      await loadTasksForDate(selectedDate, activeJobCode.code);
    } catch (error) {
      logger.error('업무 목록 가져오기 오류:', error);
      toast.error('업무 목록을 불러오는 중 오류가 발생했습니다.');
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
      logger.error('월별 업무 날짜 가져오기 오류:', error);
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
      logger.error('날짜별 업무 가져오기 오류:', error);
    }
  };

  // Pull to refresh 핸들러
  const handleRefresh = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      // 캠프 사용자 목록 다시 가져오기 (관리자만)
      if (isAdmin && userData?.activeJobExperienceId) {
        const jobCodesInfo = await getUserJobCodesInfo([userData.activeJobExperienceId]);
        const activeJobCode = jobCodesInfo[0];
        
        if (activeJobCode) {
          const users = await getUsersByJobCode(activeJobCode.generation, activeJobCode.code);
          logger.info('웹 - 새로고침으로 조회된 캠프 사용자 수:', users.length);
          setCampUsers(users);
        }
      }
      
      // 선택된 날짜의 업무 다시 로드
      await loadTasksForDate(selectedDate);
      
      toast.success('새로고침 완료');
    } catch (error) {
      logger.error('새로고침 오류:', error);
      toast.error('새로고침에 실패했습니다.');
    } finally {
      setIsRefreshing(false);
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

  // selectedDate가 변경될 때 해당 날짜의 업무 로드
  useEffect(() => {
    if (currentCampCode && selectedDate) {
      loadTasksForDate(selectedDate);
    }
  }, [selectedDate, currentCampCode]);

  // 페이지 포커스 시 업무 새로고침 (다른 페이지에서 돌아올 때)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && currentCampCode && selectedDate) {
        loadTasksForDate(selectedDate);
      }
    };

    const handleFocus = () => {
      if (currentCampCode && selectedDate) {
        loadTasksForDate(selectedDate);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentCampCode, selectedDate]);

  // 날짜 클릭 핸들러 - URL 업데이트
  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    loadTasksForDate(date);
    
    // URL에 날짜 파라미터 추가 (로컬 타임존 기준)
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const currentPath = pathname || '/camp/tasks';
    router.push(`${currentPath}?date=${dateStr}`, { scroll: false });
  };

  // 업무 완료 토글
  const handleToggleComplete = async (taskId: string) => {
    if (!userData) {
      toast.error('사용자 정보를 불러올 수 없습니다.');
      return;
    }

    // 관리자이거나 currentGroupRole이 있는 경우 처리
    const role = currentGroupRole || '담임' as JobExperienceGroupRole; // 관리자는 기본 역할 사용

    try {
      await toggleTaskCompletion(taskId, userData.userId, userData.name, role);
      await loadTasksForDate(selectedDate);
      toast.success('업무 상태가 변경되었습니다.');
    } catch (error) {
      logger.error('업무 완료 토글 오류:', error);
      toast.error('업무 상태 변경 중 오류가 발생했습니다.');
    }
  };

  // 업무 삭제
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('정말 이 업무를 삭제하시겠습니까?')) return;

    try {
      await deleteTask(taskId);
      setShowTaskDetail(false); // 모달 닫기
      setSelectedTask(null);
      await fetchTasks();
      toast.success('업무가 삭제되었습니다.');
    } catch (error) {
      logger.error('업무 삭제 오류:', error);
      toast.error('업무 삭제 중 오류가 발생했습니다.');
    }
  };

  // 업무 복사
  const handleCopyTask = async (task: Task) => {
    if (!userData || !currentCampCode) {
      toast.error('사용자 정보를 불러올 수 없습니다.');
      return;
    }

    const { id, createdAt, updatedAt, createdBy, completions, ...taskDataWithoutId } = task;
    setEditingTask({
      ...taskDataWithoutId,
      title: `${task.title} (복사본)`,
    } as Task);
    setIsCopyMode(true);
    setShowTaskDetail(false);
    setShowTaskForm(true);
  };

  // 업무 공유
  const handleShareTask = async (task: Task) => {
    const url = `${window.location.origin}/camp/tasks/${task.id}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: task.title,
          text: task.description || '업무를 확인해주세요',
          url: url,
        });
        toast.success('공유되었습니다.');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          logger.error('공유 오류:', error);
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast.success('링크가 클립보드에 복사되었습니다.');
      } catch (error) {
        logger.error('클립보드 복사 오류:', error);
        toast.error('링크 복사에 실패했습니다.');
      }
    }
  };

  // 공휴일 확인 함수
  const isHoliday = useMemo(() => {
    return (date: Date) => {
      const holidays = hd.isHoliday(date);
      if (holidays !== false) return true;
      
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

    const days = [];

    // 빈 칸 추가
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="h-8" />);
    }

    // 날짜 추가
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      // 로컬 타임존 기준으로 날짜 문자열 생성
      const dateYear = date.getFullYear();
      const dateMonth = String(date.getMonth() + 1).padStart(2, '0');
      const dateDay = String(date.getDate()).padStart(2, '0');
      const dateStr = `${dateYear}-${dateMonth}-${dateDay}`;
      
      const hasTask = taskDates.has(dateStr);
      const isSelected = selectedDate.toDateString() === date.toDateString();
      const isToday = new Date().toDateString() === date.toDateString();
      const dayOfWeek = date.getDay();
      const isSunday = dayOfWeek === 0;
      const isSaturday = dayOfWeek === 6;
      const isHolidayDate = isHoliday(date);

      days.push(
        <button
          key={day}
          onClick={() => handleDateClick(date)}
          className={`h-8 p-1 rounded transition-all relative ${
            isSelected
              ? 'bg-blue-500 text-white font-semibold'
              : isToday
              ? 'bg-blue-50 text-blue-600 font-semibold border border-blue-300'
              : hasTask
              ? 'bg-gray-50 hover:bg-gray-100 font-medium text-gray-900'
              : 'hover:bg-gray-50 text-gray-500'
          }`}
        >
          <span 
            className={`text-xs ${
              !isSelected && (isSunday || isHolidayDate) 
                ? 'text-red-500' 
                : !isSelected && isSaturday 
                ? 'text-blue-500' 
                : ''
            }`}
          >
            {day}
          </span>
          {hasTask && !isSelected && (
            <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />
          )}
        </button>
      );
    }

    return days;
  };

  if (!mounted) {
    return null;
  }

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent"></div>
        <p className="mt-3 text-sm">로딩 중...</p>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <p className="text-center">로그인 후 이용 가능합니다.</p>
      </div>
    );
  }

  if (!userData.activeJobExperienceId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <p className="text-center font-medium mb-1">캠프를 선택해주세요</p>
        <p className="text-center text-sm text-gray-500">마이페이지에서 활성화할 캠프를 선택하면</p>
        <p className="text-center text-sm text-gray-500">해당 캠프의 업무를 확인할 수 있습니다.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mx-auto"></div>
        <p className="mt-3 text-gray-500 text-sm">업무를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="py-4">
      {/* 캘린더 헤더 */}
      <div className="px-4 mb-3">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
            className="p-1 hover:bg-gray-100 rounded text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 className="text-base font-semibold text-gray-900">
            {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
          </h2>
          <button
            onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
            className="p-1 hover:bg-gray-100 rounded text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* 작은 캘린더 */}
        <div className="bg-white rounded-lg border border-gray-200 p-2">
          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DAYS_OF_WEEK.map((day, i) => (
              <div
                key={day}
                className={`text-center text-xs font-medium ${
                  i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'
                }`}
              >
                {day}
              </div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 gap-1">
            {renderCalendar()}
          </div>
        </div>
      </div>

      {/* Admin 업무 추가 버튼 */}
      {isAdmin && (
        <div className="px-4 mb-3">
          <button
            onClick={() => {
              setEditingTask(null);
              setShowTaskForm(true);
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-600 bg-blue-50 border border-dashed border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-all font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            업무 추가
          </button>
        </div>
      )}

      {/* 선택된 날짜의 업무 목록 */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">
            {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 ({DAYS_OF_WEEK[selectedDate.getDay()]})
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {selectedDateTasks.length}개 업무
            </span>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="새로고침"
            >
              <svg 
                className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                />
              </svg>
            </button>
          </div>
        </div>

        {selectedDateTasks.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <p className="text-gray-500">이 날짜에 등록된 업무가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedDateTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                isAdmin={isAdmin}
                currentUserId={userData.userId}
                campUsers={campUsers}
                campCode={currentCampCodeId}
                onToggle={handleToggleComplete}
                onClick={() => {
                  setSelectedTask(task);
                  setShowTaskDetail(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 업무 추가/수정 모달 */}
      {showTaskForm && userData && currentCampCode && (
        <TaskFormModal
          campCode={currentCampCode}
          createdBy={userData.userId}
          task={editingTask}
          isCopyMode={isCopyMode}
          selectedDate={selectedDate}
          onClose={() => {
            setShowTaskForm(false);
            setEditingTask(null);
            setIsCopyMode(false);
          }}
          onSuccess={() => {
            fetchTasks();
          }}
        />
      )}

      {/* 업무 상세 모달 */}
      {showTaskDetail && selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          isAdmin={isAdmin}
          campUsers={campUsers}
          campCode={currentCampCodeId}
          onClose={() => {
            setShowTaskDetail(false);
            setSelectedTask(null);
          }}
          onEdit={() => {
            setEditingTask(selectedTask);
            setShowTaskDetail(false);
            setShowTaskForm(true);
          }}
          onDelete={() => {
            handleDeleteTask(selectedTask.id);
            setShowTaskDetail(false);
            setSelectedTask(null);
          }}
          onCopy={() => {
            handleCopyTask(selectedTask);
          }}
          onShare={() => {
            handleShareTask(selectedTask);
          }}
        />
      )}
    </div>
  );
}

// 간단한 업무 카드 컴포넌트
function TaskCard({
  task,
  isAdmin,
  currentUserId,
  campUsers,
  campCode,
  onToggle,
  onClick,
}: {
  task: Task;
  isAdmin: boolean;
  currentUserId: string;
  campUsers: User[];
  campCode: string;
  onToggle: (taskId: string) => void;
  onClick: () => void;
}) {
  const isCompleted = task.completions.some((c: { userId: string }) => c.userId === currentUserId);
  const timeStr = formatTime(task.time);
  const durationStr = formatDuration(task.estimatedDuration);

  // 관리자용: 실제 완료 현황 계산
  const targetUsers = isAdmin ? getTaskTargetUsers(task, campUsers, campCode) : [];
  
  // 디버깅 로그
  if (isAdmin && campUsers.length > 0) {
    logger.info('=== TaskCard 디버깅 ===');
    logger.info('업무:', task.title);
    logger.info('campCode:', campCode);
    logger.info('task.targetRoles:', task.targetRoles);
    logger.info('task.targetGroups:', task.targetGroups);
    logger.info('전체 campUsers 수:', campUsers.length);
    logger.info('필터링된 targetUsers 수:', targetUsers.length);
    if (targetUsers.length > 0) {
      logger.info('대상 사용자:', targetUsers.map(u => ({ 
        name: u.name, 
        jobExps: u.jobExperiences?.map(exp => ({ id: exp.id, role: exp.groupRole, group: exp.group }))
      })));
    } else {
      logger.warn('대상 사용자가 0명입니다. 첫 번째 사용자 jobExperiences 확인:');
      logger.warn(campUsers[0].jobExperiences);
    }
  }
  
  const { completedUsers, incompleteUsers } = isAdmin 
    ? getTaskCompletionStatus(task, targetUsers)
    : { completedUsers: [], incompleteUsers: [] };
  
  const completedNames = getUserNames(completedUsers);
  const incompleteNames = getUserNames(incompleteUsers);

  return (
    <div
      className="bg-white border rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden"
      onClick={onClick}
    >
      <div className="flex">
        {/* 왼쪽: 업무 정보 (1/3) */}
        <div className="w-1/3 p-3 border-r">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              {/* 시간 및 소요시간 */}
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {timeStr && (
                  <span className="text-sm font-semibold text-blue-600">{timeStr}</span>
                )}
                {durationStr && (
                  <span className="text-xs text-gray-500">{durationStr}</span>
                )}
              </div>
              
              {/* 제목 */}
              <h4 className={`text-sm font-medium mb-1.5 ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                {task.title}
              </h4>
              
              {/* 대상 역할 및 첨부파일 */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">
                  {task.targetRoles.join(', ')}
                </span>
                {task.targetGroups && task.targetGroups.length > 0 && (
                  <span className="text-xs text-gray-400">
                    · {task.targetGroups.join(', ')}
                  </span>
                )}
                {task.attachments && task.attachments.length > 0 && (
                  <span className="text-xs text-gray-400">📎 {task.attachments.length}</span>
                )}
              </div>
            </div>

            {/* 일반 사용자: 체크박스 */}
            {!isAdmin && (
              <input
                type="checkbox"
                checked={isCompleted}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggle(task.id);
                }}
                className="mt-1 w-5 h-5 cursor-pointer flex-shrink-0"
              />
            )}
          </div>
        </div>

        {/* 오른쪽: 관리자 완료 현황 (2/3) */}
        {isAdmin && (
          <div className="w-2/3 p-3 bg-gray-50 space-y-1.5">
            {/* 완료한 사람 */}
            {completedNames.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold text-green-700 flex-shrink-0">✓ {completedNames.length}명:</span>
                <span className="text-xs text-green-800 leading-relaxed">
                  {completedNames.join(', ')}
                </span>
              </div>
            )}

            {/* 미완료한 사람 */}
            {incompleteNames.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold text-red-700 flex-shrink-0">✗ {incompleteNames.length}명:</span>
                <span className="text-xs text-red-800 leading-relaxed">
                  {incompleteNames.join(', ')}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
