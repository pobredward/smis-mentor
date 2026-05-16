'use client';
import { logger } from '@smis-mentor/shared';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import {
  getTasksByCampCode,
  getTasksByDate,
  getTaskDatesInMonth,
  getTasksInMonth,
  toggleTaskCompletion,
  deleteTask,
  createTask,
  formatTime,
  formatDuration,
} from '@/lib/taskService';
import { getUserJobCodesInfo, getUsersByJobCode } from '@/lib/firebaseService';
import type { Task, JobExperienceGroupRole, User } from '@smis-mentor/shared';
import { getTaskTargetUsers, getTaskCompletionStatus, getUserNames, isKoreanHoliday } from '@smis-mentor/shared';
import { JobCodeWithGroup } from '@/types';
import TaskFormModal from './TaskFormModal';
import TaskDetailModal from './TaskDetailModal';

const DAYS_OF_WEEK = ['일', '월', '화', '수', '목', '금', '토'];


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
  const [calendarView, setCalendarView] = useState<'compact' | 'full'>('compact');
  const [monthTasks, setMonthTasks] = useState<Map<string, Task[]>>(new Map());

  // full 뷰 하단 패널
  const [panelDate, setPanelDate] = useState<Date | null>(null);
  const [panelTasks, setPanelTasks] = useState<Task[]>([]);
  const [panelVisible, setPanelVisible] = useState(false);

  // 모달 상태
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showTaskDetail, setShowTaskDetail] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isCopyMode, setIsCopyMode] = useState(false);

  const isAdmin = userData?.role === 'admin';

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('calendarView');
    if (saved === 'compact' || saved === 'full') setCalendarView(saved);
  }, []);

  const handleCalendarViewChange = (v: 'compact' | 'full') => {
    setCalendarView(v);
    localStorage.setItem('calendarView', v);
  };

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

  type JobCodeInfo = { id: string; generation: string; code: string; name: string };

  // 활성화된 캠프 정보 가져오기
  // groupRole을 함께 반환해 state 비동기 업데이트 이전에 즉시 사용할 수 있도록 함
  const fetchActiveJobCode = async (): Promise<{
    jobCode: JobCodeInfo | null;
    groupRole: JobExperienceGroupRole | null;
  }> => {
    if (!userData?.activeJobExperienceId) {
      return { jobCode: null, groupRole: null };
    }

    try {
      const jobCodesInfo = await getUserJobCodesInfo([userData.activeJobExperienceId]);
      const activeExp = userData.jobExperiences?.find(
        exp => exp.id === userData.activeJobExperienceId
      );
      const resolvedGroupRole = (activeExp?.groupRole as JobExperienceGroupRole) ?? null;
      if (resolvedGroupRole) {
        setCurrentGroupRole(resolvedGroupRole);
      }

      const jobCodeInfo = jobCodesInfo[0] || null;
      if (jobCodeInfo) {
        logger.info('fetchActiveJobCode - jobCodeInfo:', jobCodeInfo);
        logger.info('jobCodeInfo.id (Firestore ID):', jobCodeInfo.id);
      }

      return { jobCode: jobCodeInfo, groupRole: resolvedGroupRole };
    } catch (error) {
      logger.error('활성화된 직무 코드 정보 가져오기 오류:', error);
      return { jobCode: null, groupRole: null };
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
      const { jobCode: activeJobCode, groupRole: resolvedGroupRole } = await fetchActiveJobCode();
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

      // 월별 업무 Map 가져오기 (resolvedGroupRole을 직접 전달해 state race condition 방지)
      await fetchMonthTasks(resolvedGroupRole, isAdmin, activeJobCode.code);

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
  // groupRole, adminFlag를 직접 받아서 state 비동기 업데이트로 인한 race condition 방지
  const fetchTaskDatesInMonth = async (
    groupRole: JobExperienceGroupRole | null = currentGroupRole,
    adminFlag: boolean = isAdmin,
  ) => {
    if (!currentCampCode) return;

    try {
      const dates = await getTaskDatesInMonth(
        currentCampCode,
        currentDate.getFullYear(),
        currentDate.getMonth(),
        groupRole,
        adminFlag,
      );
      setTaskDates(dates);
    } catch (error) {
      logger.error('월별 업무 날짜 가져오기 오류:', error);
    }
  };

  // 월별 전체 업무 Map 가져오기 (풀 캘린더 뷰 및 컴팩트 뷰 뱃지용)
  const fetchMonthTasks = async (
    groupRole: JobExperienceGroupRole | null = currentGroupRole,
    adminFlag: boolean = isAdmin,
    campCode?: string,
  ) => {
    const code = campCode || currentCampCode;
    if (!code) return;

    try {
      const taskMap = await getTasksInMonth(
        code,
        currentDate.getFullYear(),
        currentDate.getMonth(),
        groupRole,
        adminFlag,
      );
      setMonthTasks(taskMap);
      setTaskDates(new Set(taskMap.keys()));
    } catch (error) {
      logger.error('월별 업무 목록 가져오기 오류:', error);
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
      fetchMonthTasks();
    }
  }, [currentDate, currentCampCode]);

  // selectedDate가 변경될 때 해당 날짜의 업무 로드 (compact 뷰에서만)
  useEffect(() => {
    if (currentCampCode && selectedDate && calendarView === 'compact') {
      loadTasksForDate(selectedDate);
    }
  }, [selectedDate, currentCampCode, calendarView]);

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

  // 날짜 클릭 핸들러
  const handleDateClick = (date: Date) => {
    if (calendarView === 'full') {
      // full 뷰: 하단 패널 표시 (Firebase 호출 없이 monthTasks 즉시 사용)
      const year = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${mm}-${dd}`;
      setPanelDate(date);
      setPanelTasks(monthTasks.get(dateStr) ?? []);
      setPanelVisible(true);
    } else {
      setSelectedDate(date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const currentPath = pathname || '/camp/tasks';
      router.push(`${currentPath}?date=${dateStr}`, { scroll: false });
    }
  };

  // 업무 완료 토글
  const handleToggleComplete = async (taskId: string) => {
    if (!userData) {
      toast.error('사용자 정보를 불러올 수 없습니다.');
      return;
    }

    const role = currentGroupRole || '담임' as JobExperienceGroupRole;

    try {
      await toggleTaskCompletion(taskId, userData.userId, userData.name, role);
      await Promise.all([
        loadTasksForDate(selectedDate),
        fetchMonthTasks(),
      ]);
      toast.success('업무 상태가 변경되었습니다.');
    } catch (error) {
      logger.error('업무 완료 토글 오류:', error);
      toast.error('업무 상태 변경 중 오류가 발생했습니다.');
    }
  };

  // 패널 전용 토글 (optimistic update)
  const handlePanelToggle = async (taskId: string) => {
    if (!userData) return;
    const userId = userData.userId;
    const role = currentGroupRole || '담임' as JobExperienceGroupRole;

    setPanelTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const done = t.completions.some(c => c.userId === userId);
      const completions = done
        ? t.completions.filter(c => c.userId !== userId)
        : [...t.completions, { userId, userName: userData.name, userRole: role, completedAt: null as unknown as import('firebase/firestore').Timestamp }];
      return { ...t, completions };
    }));

    try {
      await toggleTaskCompletion(taskId, userId, userData.name, role);
      // fetchMonthTasks와 패널 날짜 업무 재조회를 병렬로
      const [, refreshed] = await Promise.all([
        fetchMonthTasks(),
        panelDate ? getTasksByDate(currentCampCode, panelDate) : Promise.resolve(null),
      ]);
      if (refreshed) {
        const filtered = refreshed.filter(t => {
          if (isAdmin) return true;
          if (!currentGroupRole) return false;
          return t.targetRoles.includes(currentGroupRole);
        });
        setPanelTasks(filtered);
      }
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


  // 컴팩트 뷰 렌더링: 뱃지에 미완료 업무 수, 모두 완료 시 체크마크
  const renderCompactCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days = [];

    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(<div key={`empty-${i}`} className="h-10" />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateYear = date.getFullYear();
      const dateMonth = String(date.getMonth() + 1).padStart(2, '0');
      const dateDay = String(date.getDate()).padStart(2, '0');
      const dateStr = `${dateYear}-${dateMonth}-${dateDay}`;

      const dayTasks = monthTasks.get(dateStr) ?? [];
      const hasTask = dayTasks.length > 0;
      const isSelected = selectedDate.toDateString() === date.toDateString();
      const isToday = new Date().toDateString() === date.toDateString();
      const dayOfWeek = date.getDay();
      const isSunday = dayOfWeek === 0;
      const isSaturday = dayOfWeek === 6;
      const isHolidayDate = isKoreanHoliday(date);

      const currentUserId = userData?.userId ?? '';
      const pendingCount = dayTasks.filter(t => !t.completions.some(c => c.userId === currentUserId)).length;
      const allCompleted = hasTask && pendingCount === 0;

      days.push(
        <button
          key={day}
          onClick={() => handleDateClick(date)}
          className="flex flex-col items-center py-1 gap-0.5 hover:bg-gray-50 rounded transition-colors"
        >
          {/* 상태 박스 */}
          <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${
            allCompleted
              ? 'bg-emerald-500 text-white'
              : hasTask
              ? 'bg-gray-200 text-gray-700'
              : 'bg-gray-100 text-transparent'
          }`}>
            {allCompleted ? '✓' : hasTask ? pendingCount : '·'}
          </div>
          {/* 날짜 숫자 — 선택 시 파란 원형 배경 */}
          <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[11px] font-medium leading-none ${
            isSelected
              ? 'bg-blue-500 text-white font-bold'
              : isToday && (isSunday || isHolidayDate) ? 'text-red-600 font-bold'
              : isToday ? 'text-blue-600 font-bold'
              : (isSunday || isHolidayDate) ? 'text-red-500'
              : isSaturday ? 'text-blue-500'
              : 'text-gray-700'
          }`}>
            {day}
          </span>
        </button>
      );
    }

    return days;
  };

  // 풀 캘린더 뷰 렌더링: 날짜 셀에 업무 제목/시간 직접 표시
  const renderFullCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const totalCells = startDayOfWeek + daysInMonth;
    const totalRows = Math.ceil(totalCells / 7);
    const rows = [];
    const currentUserId = userData?.userId ?? '';

    for (let row = 0; row < totalRows; row++) {
      const cells = [];

      for (let col = 0; col < 7; col++) {
        const cellIndex = row * 7 + col;
        const day = cellIndex - startDayOfWeek + 1;

        if (day < 1 || day > daysInMonth) {
          cells.push(
            <div key={`empty-${cellIndex}`} className="min-h-[72px]" />
          );
          continue;
        }

        const date = new Date(year, month, day);
        const dateYear = date.getFullYear();
        const dateMonth = String(date.getMonth() + 1).padStart(2, '0');
        const dateDay = String(date.getDate()).padStart(2, '0');
        const dateStr = `${dateYear}-${dateMonth}-${dateDay}`;

        const dayTasks = monthTasks.get(dateStr) ?? [];
        const isToday = new Date().toDateString() === date.toDateString();
        const dayOfWeek = date.getDay();
        const isSunday = dayOfWeek === 0;
        const isSaturday = dayOfWeek === 6;
        const isHolidayDate = isKoreanHoliday(date);

        cells.push(
          <button
            key={day}
            onClick={() => handleDateClick(date)}
            className="min-h-[72px] p-0.5 text-left transition-colors hover:bg-gray-50 w-full overflow-hidden"
          >
            {/* 날짜 숫자 */}
            <span className={`block text-center text-xs font-medium mb-0.5 ${
              (isToday && (isSunday || isHolidayDate))
                ? 'text-red-600 font-bold'
                : isToday
                ? 'text-blue-600 font-bold'
                : (isSunday || isHolidayDate)
                ? 'text-red-500'
                : isSaturday
                ? 'text-blue-500'
                : 'text-gray-700'
            }`}>
              {day}
            </span>
            {/* 업무 칩 — 전체 표시 */}
            {dayTasks.map(task => {
              const isDone = task.completions.some((c: { userId: string }) => c.userId === currentUserId);
              const timeLabel = task.time ? task.time.slice(0, 5) : null;
              return (
                <span
                  key={task.id}
                  className={`block truncate text-[8px] leading-[11px] rounded px-0.5 mb-0.5 ${
                    isDone
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {timeLabel ? `${timeLabel} ` : ''}{task.title}
                </span>
              );
            })}
          </button>
        );
      }

      rows.push(
        <div key={`row-${row}`} className="grid grid-cols-7">
          {cells}
        </div>
      );
    }

    return rows;
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
      <div className="flex items-center px-4 py-2 mb-1">
        <h2 className="flex-1 text-base font-semibold text-gray-900">
          {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
        </h2>
        {/* 뷰 전환 토글 */}
        <button
          onClick={() => handleCalendarViewChange(calendarView === 'compact' ? 'full' : 'compact')}
          className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors mr-1"
          title={calendarView === 'compact' ? '풀 캘린더 뷰로 전환' : '컴팩트 뷰로 전환'}
          aria-label={calendarView === 'compact' ? '풀 캘린더 뷰로 전환' : '컴팩트 뷰로 전환'}
        >
          {calendarView === 'compact' ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          )}
        </button>
        {/* 이전 월 */}
        <button
          onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))}
          className="p-1 hover:bg-gray-100 rounded text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {/* 다음 월 */}
        <button
          onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))}
          className="p-1 hover:bg-gray-100 rounded text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* 달력 컨테이너 — 전체 너비, 하단 구분선만 */}
      <div className="bg-white border-b border-gray-200 pb-2 mb-2">
        {/* 요일 헤더 */}
        <div className="grid grid-cols-7">
          {DAYS_OF_WEEK.map((day, i) => (
            <div
              key={day}
              className={`text-center text-xs font-medium py-1.5 ${
                i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-600'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* 컴팩트 뷰 */}
        {calendarView === 'compact' && (
          <div className="grid grid-cols-7">
            {renderCompactCalendar()}
          </div>
        )}

        {/* 풀 캘린더 뷰 */}
        {calendarView === 'full' && (
          <div>
            {renderFullCalendar()}
          </div>
        )}
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

      {/* compact 뷰: 선택된 날짜의 업무 목록 */}
      {calendarView === 'compact' && (
        <div className="px-4">
          <div className="mb-3">
            <h3 className="text-base font-semibold text-gray-900">
              {selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일 ({DAYS_OF_WEEK[selectedDate.getDay()]})
            </h3>
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
      )}

      {/* full 뷰: 날짜 클릭 시 슬라이드업 패널 */}
      {panelVisible && panelDate && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ backgroundColor: 'rgba(0,0,0,0.18)' }}
          onClick={() => setPanelVisible(false)}
        >
          <div
            className="w-full bg-white rounded-t-2xl max-h-[88vh] flex flex-col animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* 핸들 */}
            <div className="flex justify-center pt-2.5 pb-1.5">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <span className="text-base font-bold text-gray-900">
                {panelDate.getMonth() + 1}월 {panelDate.getDate()}일 ({DAYS_OF_WEEK[panelDate.getDay()]})
              </span>
            </div>
            {/* 업무 목록 */}
            <div className="overflow-y-auto flex-1">
              {panelTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm">등록된 업무가 없습니다</p>
                </div>
              ) : (
                panelTasks.map(task => {
                  const isDone = task.completions.some(c => c.userId === userData.userId);
                  const timeStr = formatTime(task.time);
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => {
                        setPanelVisible(false);
                        setSelectedTask(task);
                        setShowTaskDetail(true);
                      }}
                    >
                      {/* 체크 */}
                      <button
                        onClick={e => { e.stopPropagation(); handlePanelToggle(task.id); }}
                        className="flex-shrink-0 w-7 h-7 flex items-center justify-center"
                      >
                        {isDone ? (
                          <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.177 14.232l-4.243-4.243 1.414-1.414 2.829 2.829 5.656-5.657 1.414 1.415-7.07 7.07z"/>
                          </svg>
                        ) : (
                          <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" strokeWidth="1.5"/>
                          </svg>
                        )}
                      </button>
                      {/* 정보 */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isDone ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {timeStr && <span className="text-xs font-semibold text-blue-500">{timeStr}</span>}
                          <span className="text-xs text-gray-400 truncate">{task.targetRoles.join(' · ')}</span>
                        </div>
                      </div>
                      {/* 상세 화살표 */}
                      <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

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
      {/* 시간이 있는 경우 상단 시간 배너 (관리자/일반 유저 공통) */}
      {timeStr && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border-b border-blue-100">
          <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-bold text-blue-600">{timeStr}</span>
          {durationStr && (
            <span className="text-xs text-blue-400">({durationStr})</span>
          )}
        </div>
      )}

      <div className="flex">
        {/* 업무 정보 — 관리자면 1/3, 일반 사용자면 전체 */}
        <div className={`${isAdmin ? 'w-1/3 border-r' : 'flex-1'} p-3`}>
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
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
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onToggle(task.id); }}
                className="mt-0.5 flex-shrink-0 focus:outline-none"
                aria-label={isCompleted ? '완료 취소' : '완료 처리'}
              >
                {isCompleted ? (
                  <svg className="w-6 h-6 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.177 14.232l-4.243-4.243 1.414-1.414 2.829 2.829 5.656-5.657 1.414 1.415-7.07 7.07z"/>
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" strokeWidth="1.5"/>
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>

        {/* 관리자: 완료 현황 (2/3) */}
        {isAdmin && (
          <div className="w-2/3 p-3 bg-gray-50 space-y-1.5">
            {completedNames.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold text-green-700 flex-shrink-0">✓ {completedNames.length}명:</span>
                <span className="text-xs text-green-800 leading-relaxed">{completedNames.join(', ')}</span>
              </div>
            )}
            {incompleteNames.length > 0 && (
              <div className="flex items-start gap-2">
                <span className="text-xs font-semibold text-red-700 flex-shrink-0">✗ {incompleteNames.length}명:</span>
                <span className="text-xs text-red-800 leading-relaxed">{incompleteNames.join(', ')}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
