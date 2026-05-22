'use client';
import { logger } from '@smis-mentor/shared';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import {
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
import {
  getPersonalTasksByDate,
  getPersonalTaskDatesInMonth,
  getPersonalTasksInMonth,
  togglePersonalTaskCompletion,
  deletePersonalTask,
  deletePersonalTaskGroup,
} from '@/lib/personalTaskService';
import { getTaskCategories } from '@/lib/taskCategoryService';
import type { Task, JobExperienceGroupRole, User, PersonalTask, TaskCategory } from '@smis-mentor/shared';
import { getTaskTargetUsers, getTaskCompletionStatus, getUserNames, isKoreanHoliday } from '@smis-mentor/shared';
import { JobCodeWithGroup } from '@/types';
import TaskFormModal from './TaskFormModal';
import TaskDetailModal from './TaskDetailModal';
import PersonalTaskFormModal from './PersonalTaskFormModal';
import PersonalTaskDetailModal from './PersonalTaskDetailModal';
import TaskCategoryManager from './TaskCategoryManager';

const DAYS_OF_WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];
const DAYS_OF_WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];


export default function TaskContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { userData, loading: authLoading } = useAuth();
  // campTasks 전체 캐시는 사용하지 않음 — 날짜/월 범위 쿼리로 필요한 데이터만 읽음
  const [loading, setLoading] = useState(true);
  const [currentGroupRole, setCurrentGroupRole] = useState<JobExperienceGroupRole | null>(null);
  const [currentCampCode, setCurrentCampCode] = useState<string>(''); // code (예: E27)
  const [currentCampCodeId, setCurrentCampCodeId] = useState<string>(''); // Firestore 문서 ID
  const [campUsers, setCampUsers] = useState<User[]>([]); // 캠프 사용자 목록
  const [mounted, setMounted] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 캘린더 상태 — URL date 파라미터가 있으면 초기값으로 사용 (F5 새로고침 대응)
  const getInitialDate = () => {
    const dateParam = searchParams?.get('date');
    if (dateParam) {
      const [year, month, day] = dateParam.split('-').map(Number);
      if (year && month && day) {
        const date = new Date(year, month - 1, day);
        if (!isNaN(date.getTime())) return date;
      }
    }
    return new Date();
  };
  const [currentDate, setCurrentDate] = useState(getInitialDate);
  const [selectedDate, setSelectedDate] = useState(getInitialDate);
  const [taskDates, setTaskDates] = useState<Set<string>>(new Set());
  const [selectedDateTasks, setSelectedDateTasks] = useState<Task[]>([]);
  const [calendarView, setCalendarView] = useState<'compact' | 'full'>('compact');
  const [monthTasks, setMonthTasks] = useState<Map<string, Task[]>>(new Map());

  // full 뷰 하단 패널
  const [panelDate, setPanelDate] = useState<Date | null>(null);
  const [panelTasks, setPanelTasks] = useState<Task[]>([]);
  const [panelPersonalTasks, setPanelPersonalTasks] = useState<PersonalTask[]>([]);
  const [panelVisible, setPanelVisible] = useState(false);

  // 모달 상태
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showTaskDetail, setShowTaskDetail] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isCopyMode, setIsCopyMode] = useState(false);

  const isAdmin = userData?.role === 'admin';
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const DAYS_OF_WEEK = isForeign ? DAYS_OF_WEEK_EN : DAYS_OF_WEEK_KO;

  // 개인 업무 상태
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([]);
  const [personalTaskDates, setPersonalTaskDates] = useState<Map<string, number>>(new Map());
  const [personalMonthTasks, setPersonalMonthTasks] = useState<Map<string, PersonalTask[]>>(new Map());
  const [showPersonalTaskForm, setShowPersonalTaskForm] = useState(false);
  const [editingPersonalTask, setEditingPersonalTask] = useState<PersonalTask | null>(null);
  // 개인 업무 모달을 열 때 기준 날짜 (패널에서 열 때는 panelDate, 기본은 selectedDate)
  const [personalTaskFormDate, setPersonalTaskFormDate] = useState<Date | null>(null);
  const [showPersonalTaskDetail, setShowPersonalTaskDetail] = useState(false);
  const [selectedPersonalTask, setSelectedPersonalTask] = useState<PersonalTask | null>(null);

  // 카테고리 상태
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  // categoryId → TaskCategory 빠른 조회 맵
  const categoryMap = useMemo(
    () => new Map(categories.map(c => [c.id, c])),
    [categories]
  );

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
      return;
    }

    setLoading(true);
    try {
      const { jobCode: activeJobCode, groupRole: resolvedGroupRole } = await fetchActiveJobCode();
      if (!activeJobCode) return;

      logger.info('=== 업무 목록 가져오기 ===');
      logger.info('activeJobCode:', activeJobCode);
      logger.info('activeJobCode.id (Firestore ID):', activeJobCode.id);
      logger.info('generation:', activeJobCode.generation);
      logger.info('code:', activeJobCode.code);

      setCurrentCampCode(activeJobCode.code);
      setCurrentCampCodeId(activeJobCode.id);
      
      // 캠프 사용자 목록 가져오기 (관리자만)
      if (isAdmin) {
        logger.info('관리자 - 캠프 사용자 조회 시작');
        const users = await getUsersByJobCode(activeJobCode.generation, activeJobCode.code);
        logger.info('조회된 사용자 수:', users.length);
        logger.info('사용자 목록:', users.map(u => ({ name: u.name, jobExperiences: u.jobExperiences })));
        setCampUsers(users);
      }

      // 월별 업무 Map + 개인 업무 날짜 + 카테고리 동시 로드 (각각 필요한 범위만 읽음)
      const [, , fetchedCategories] = await Promise.all([
        fetchMonthTasks(resolvedGroupRole, isAdmin, activeJobCode.code),
        loadPersonalTaskDates(currentDate.getFullYear(), currentDate.getMonth(), activeJobCode.code),
        getTaskCategories(activeJobCode.code),
      ]);
      setCategories(fetchedCategories);

      // 선택된 날짜의 업무 로드
      await loadTasksForDate(selectedDate, activeJobCode.code);
    } catch (error) {
      logger.error('업무 목록 가져오기 오류:', error);
      toast.error(isForeign ? 'Failed to load tasks.' : '업무 목록을 불러오는 중 오류가 발생했습니다.');
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
      const [dateTasks, personalDateTasks] = await Promise.all([
        getTasksByDate(code, date),
        userData ? getPersonalTasksByDate(userData.userId, code, date) : Promise.resolve([]),
      ]);

      // 역할 필터링
      const filtered = dateTasks.filter(task => {
        if (isAdmin) return true;
        if (!currentGroupRole) return false;
        return task.targetRoles.includes(currentGroupRole);
      });

      setSelectedDateTasks(filtered);
      setPersonalTasks(personalDateTasks);
    } catch (error) {
      logger.error('날짜별 업무 가져오기 오류:', error);
    }
  };

  // 개인 업무 날짜 Set 로드 (달력 도트 표시용)
  const loadPersonalTaskDates = async (year: number, month: number, campCode?: string) => {
    const code = campCode || currentCampCode;
    if (!code || !userData) return;
    try {
      const [dates, taskMap] = await Promise.all([
        getPersonalTaskDatesInMonth(userData.userId, code, year, month),
        getPersonalTasksInMonth(userData.userId, code, year, month),
      ]);
      setPersonalTaskDates(dates);
      setPersonalMonthTasks(taskMap);
    } catch (error) {
      logger.error('개인 업무 월별 날짜 가져오기 오류:', error);
    }
  };

  // 로딩 스피너 없이 현재 월·날짜 데이터를 조용히 갱신 (업무 생성/삭제 후 호출)
  const refreshCurrentData = async () => {
    if (!currentCampCode) return;
    await Promise.all([
      fetchMonthTasks(),
      loadPersonalTaskDates(currentDate.getFullYear(), currentDate.getMonth()),
      loadTasksForDate(selectedDate),
    ]);
  };

  // Pull to refresh 핸들러 (헤더 새로고침 버튼)
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
      
      await refreshCurrentData();
      toast.success(isForeign ? 'Refreshed' : '새로고침 완료');
    } catch (error) {
      logger.error('새로고침 오류:', error);
      toast.error(isForeign ? 'Refresh failed.' : '새로고침에 실패했습니다.');
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
      loadPersonalTaskDates(currentDate.getFullYear(), currentDate.getMonth());
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
      setPanelPersonalTasks(personalMonthTasks.get(dateStr) ?? []);
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
      toast.error(isForeign ? 'Unable to load user information.' : '사용자 정보를 불러올 수 없습니다.');
      return;
    }

    const role = currentGroupRole || '담임' as JobExperienceGroupRole;

    try {
      await toggleTaskCompletion(taskId, userData.userId, userData.name, role);
      await Promise.all([
        loadTasksForDate(selectedDate),
        fetchMonthTasks(),
      ]);
      toast.success(isForeign ? 'Task status updated.' : '업무 상태가 변경되었습니다.');
    } catch (error) {
      logger.error('업무 완료 토글 오류:', error);
      toast.error(isForeign ? 'Failed to update task status.' : '업무 상태 변경 중 오류가 발생했습니다.');
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
      toast.error(isForeign ? 'Failed to update task status.' : '업무 상태 변경 중 오류가 발생했습니다.');
    }
  };

  // 패널 전용 개인 업무 토글 (optimistic update)
  const handlePanelPersonalToggle = async (task: PersonalTask) => {
    setPanelPersonalTasks(prev =>
      prev.map(t => t.id === task.id ? { ...t, isCompleted: !t.isCompleted } : t)
    );
    try {
      await togglePersonalTaskCompletion(task.id, task.isCompleted);
      if (panelDate) {
        const refreshed = await getPersonalTasksByDate(userData!.userId, currentCampCode, panelDate);
        setPanelPersonalTasks(refreshed);
        loadPersonalTaskDates(panelDate.getFullYear(), panelDate.getMonth());
      }
    } catch (error) {
      logger.error('패널 개인 업무 토글 오류:', error);
      toast.error(isForeign ? 'Failed to update status.' : '상태 변경 중 오류가 발생했습니다.');
    }
  };

  // 개인 업무 완료 토글
  const handlePersonalToggle = async (task: PersonalTask) => {
    try {
      await togglePersonalTaskCompletion(task.id, task.isCompleted);
      loadTasksForDate(selectedDate);
      loadPersonalTaskDates(selectedDate.getFullYear(), selectedDate.getMonth());
    } catch (error) {
      logger.error('개인 업무 완료 토글 오류:', error);
      toast.error(isForeign ? 'Failed to update status.' : '상태 변경 중 오류가 발생했습니다.');
    }
  };

  // 개인 업무 삭제 (groupId 있으면 그룹 전체/단일 선택)
  const handlePersonalDelete = async (task: PersonalTask) => {
    if (task.groupId) {
      const choice = confirm(
        isForeign
          ? 'This is a grouped task spanning multiple dates.\n\n[OK] Delete entire group\n[Cancel] Delete only this date'
          : '이 업무는 여러 날짜에 묶인 그룹 업무입니다.\n\n[확인] 그룹 전체 삭제\n[취소] 이 날짜만 삭제'
      );
      try {
        if (choice) {
          await deletePersonalTaskGroup(task.groupId);
        } else {
          await deletePersonalTask(task.id);
        }
        toast.success(isForeign ? 'Personal task deleted.' : '개인 업무가 삭제되었습니다.');
        loadTasksForDate(selectedDate);
        loadPersonalTaskDates(currentDate.getFullYear(), currentDate.getMonth());
      } catch (error) {
        logger.error('개인 업무 삭제 오류:', error);
        toast.error(isForeign ? 'Failed to delete task.' : '삭제 중 오류가 발생했습니다.');
      }
    } else {
      if (!confirm(isForeign ? 'Delete this personal task?' : '이 개인 업무를 삭제하시겠습니까?')) return;
      try {
        await deletePersonalTask(task.id);
        toast.success(isForeign ? 'Personal task deleted.' : '개인 업무가 삭제되었습니다.');
        loadTasksForDate(selectedDate);
        loadPersonalTaskDates(currentDate.getFullYear(), currentDate.getMonth());
      } catch (error) {
        logger.error('개인 업무 삭제 오류:', error);
        toast.error(isForeign ? 'Failed to delete task.' : '삭제 중 오류가 발생했습니다.');
      }
    }
  };

  // 업무 삭제
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm(isForeign ? 'Are you sure you want to delete this task?' : '정말 이 업무를 삭제하시겠습니까?')) return;

    try {
      await deleteTask(taskId);
      setShowTaskDetail(false); // 모달 닫기
      setSelectedTask(null);
      await refreshCurrentData();
      toast.success(isForeign ? 'Task deleted.' : '업무가 삭제되었습니다.');
    } catch (error) {
      logger.error('업무 삭제 오류:', error);
      toast.error(isForeign ? 'Failed to delete task.' : '업무 삭제 중 오류가 발생했습니다.');
    }
  };

  // 업무 복사
  const handleCopyTask = async (task: Task) => {
    if (!userData || !currentCampCode) {
      toast.error(isForeign ? 'Unable to load user information.' : '사용자 정보를 불러올 수 없습니다.');
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
          text: task.description || (isForeign ? 'Please check this task.' : '업무를 확인해주세요'),
          url: url,
        });
        toast.success(isForeign ? 'Shared successfully.' : '공유되었습니다.');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          logger.error('공유 오류:', error);
        }
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast.success(isForeign ? 'Link copied to clipboard.' : '링크가 클립보드에 복사되었습니다.');
      } catch (error) {
        logger.error('클립보드 복사 오류:', error);
        toast.error(isForeign ? 'Failed to copy link.' : '링크 복사에 실패했습니다.');
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
      const personalPendingCount = personalTaskDates.get(dateStr) ?? 0;
      const totalPendingCount = pendingCount + personalPendingCount;
      const allDone = allCompleted && personalPendingCount === 0;

      days.push(
        <button
          key={day}
          onClick={() => handleDateClick(date)}
          className="flex flex-col items-center py-1 gap-0.5 hover:bg-gray-50 rounded transition-colors"
        >
          {/* 상태 박스 */}
          <div className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold ${
            allDone
              ? 'bg-emerald-500 text-white'
              : totalPendingCount > 0
              ? 'bg-gray-200 text-gray-700'
              : 'bg-gray-100 text-transparent'
          }`}>
            {allDone ? '✓' : totalPendingCount > 0 ? totalPendingCount : '·'}
          </div>
          {/* 날짜 숫자 — 선택 시 파란 원형, 오늘은 회색 원형 배경 */}
          <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[11px] font-medium leading-none ${
            isSelected
              ? 'bg-blue-500 text-white font-bold'
              : isToday && (isSunday || isHolidayDate) ? 'bg-gray-200 text-red-600 font-bold'
              : isToday ? 'bg-gray-200 text-gray-800 font-bold'
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
      // 날짜 숫자 행과 업무 칩 행을 분리해서 렌더링
      // → 날짜 숫자는 항상 같은 수직 위치에 정렬됨
      const dateCells = [];
      const chipCells = [];

      for (let col = 0; col < 7; col++) {
        const cellIndex = row * 7 + col;
        const day = cellIndex - startDayOfWeek + 1;

        if (day < 1 || day > daysInMonth) {
          dateCells.push(<div key={`empty-date-${cellIndex}`} />);
          chipCells.push(<div key={`empty-chip-${cellIndex}`} className="min-h-[32px]" />);
          continue;
        }

        const date = new Date(year, month, day);
        const dateYear = date.getFullYear();
        const dateMonth = String(date.getMonth() + 1).padStart(2, '0');
        const dateDay = String(date.getDate()).padStart(2, '0');
        const dateStr = `${dateYear}-${dateMonth}-${dateDay}`;

        const dayTasks = monthTasks.get(dateStr) ?? [];
        const dayPersonalTasks = personalMonthTasks.get(dateStr) ?? [];
        const isToday = new Date().toDateString() === date.toDateString();
        const dayOfWeek = date.getDay();
        const isSunday = dayOfWeek === 0;
        const isSaturday = dayOfWeek === 6;
        const isHolidayDate = isKoreanHoliday(date);

        // 날짜 숫자 셀
        dateCells.push(
          <button
            key={`date-${day}`}
            onClick={() => handleDateClick(date)}
            className="flex items-center justify-center py-1 transition-colors hover:bg-gray-50 w-full"
          >
            <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[11px] font-medium ${
              (isToday && (isSunday || isHolidayDate))
                ? 'bg-gray-200 text-red-600 font-bold'
                : isToday
                ? 'bg-gray-200 text-gray-800 font-bold'
                : (isSunday || isHolidayDate)
                ? 'text-red-500'
                : isSaturday
                ? 'text-blue-500'
                : 'text-gray-700'
            }`}>
              {day}
            </span>
          </button>
        );

        // 업무 칩 셀 — 업무 수만큼 높이가 늘어남
        const allChips = [
          ...dayTasks.map(task => {
            const isDone = task.completions.some((c: { userId: string }) => c.userId === currentUserId);
            const timeLabel = task.time ? task.time.slice(0, 5) : null;
            const cat = task.categoryId ? categoryMap.get(task.categoryId) : undefined;
            const chipBg = isDone
              ? (cat ? `${cat.color}55` : '#6ee7b7')
              : '#e5e7eb';
            const chipColor = isDone
              ? (cat ? cat.color : '#065f46')
              : '#6b7280';
            return { key: task.id, bg: chipBg, color: chipColor, label: `${timeLabel ? `${timeLabel} ` : ''}${task.title}` };
          }),
          ...dayPersonalTasks.map(task => {
            const cat = task.categoryId ? categoryMap.get(task.categoryId) : undefined;
            const chipBg = task.isCompleted
              ? (cat ? `${cat.color}55` : '#6ee7b7')
              : '#e5e7eb';
            const chipColor = task.isCompleted
              ? (cat ? cat.color : '#065f46')
              : '#6b7280';
            return { key: task.id, bg: chipBg, color: chipColor, label: `${task.time ? `${task.time.slice(0, 5)} ` : ''}${task.title}` };
          }),
        ];

        chipCells.push(
          <button
            key={`chip-${day}`}
            onClick={() => handleDateClick(date)}
            className="p-0.5 pb-1.5 text-left transition-colors hover:bg-gray-50 w-full min-h-[32px] flex flex-col justify-start"
          >
            {allChips.map(chip => (
              <span
                key={chip.key}
                className="block truncate text-[8px] leading-[11px] rounded px-0.5 mb-0.5"
                style={{ backgroundColor: chip.bg, color: chip.color }}
              >
                {chip.label}
              </span>
            ))}
          </button>
        );
      }

      rows.push(
        <div key={`row-${row}`}>
          {/* 날짜 숫자 행 — 항상 고정 높이로 정렬 */}
          <div className="grid grid-cols-7">
            {dateCells}
          </div>
          {/* 업무 칩 행 — 내용에 따라 높이 자동 조절 */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {chipCells}
          </div>
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
        <p className="mt-3 text-sm">{isForeign ? 'Loading...' : '로딩 중...'}</p>
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <p className="text-center">{isForeign ? 'Please sign in to continue.' : '로그인 후 이용 가능합니다.'}</p>
      </div>
    );
  }

  if (!userData.activeJobExperienceId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-gray-500">
        <p className="text-center font-medium mb-1">{isForeign ? 'No active camp selected' : '캠프를 선택해주세요'}</p>
        {isForeign ? (
          <>
            <p className="text-center text-sm text-gray-500">Go to My Page and activate a camp</p>
            <p className="text-center text-sm text-gray-500">to view tasks for that camp.</p>
          </>
        ) : (
          <>
            <p className="text-center text-sm text-gray-500">마이페이지에서 활성화할 캠프를 선택하면</p>
            <p className="text-center text-sm text-gray-500">해당 캠프의 업무를 확인할 수 있습니다.</p>
          </>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mx-auto"></div>
        <p className="mt-3 text-gray-500 text-sm">{isForeign ? 'Loading tasks...' : '업무를 불러오는 중...'}</p>
      </div>
    );
  }

  return (
    <div className="py-4">
      {/* 캘린더 헤더 */}
      <div className="flex items-center px-4 py-2 mb-1">
        <h2 className="flex-1 text-base font-semibold text-gray-900">
          {isForeign
            ? currentDate.toLocaleString('en-US', { month: 'long', year: 'numeric' })
            : `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월`}
        </h2>
        {/* 뷰 전환 토글 */}
        <button
          onClick={() => handleCalendarViewChange(calendarView === 'compact' ? 'full' : 'compact')}
          className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-600 transition-colors mr-1"
          title={isForeign
            ? (calendarView === 'compact' ? 'Switch to full calendar' : 'Switch to compact view')
            : (calendarView === 'compact' ? '풀 캘린더 뷰로 전환' : '컴팩트 뷰로 전환')}
          aria-label={isForeign
            ? (calendarView === 'compact' ? 'Switch to full calendar' : 'Switch to compact view')
            : (calendarView === 'compact' ? '풀 캘린더 뷰로 전환' : '컴팩트 뷰로 전환')}
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
          onClick={() => {
            const next = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1);
            setCurrentDate(next);
            // 오늘이 포함된 월이면 오늘 날짜, 이전 월이므로 마지막 날 선택
            const today = new Date();
            const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0);
            const dateToSelect = (next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth())
              ? today
              : lastDay;
            setSelectedDate(dateToSelect);
          }}
          className="p-1 hover:bg-gray-100 rounded text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {/* 다음 월 */}
        <button
          onClick={() => {
            const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1);
            setCurrentDate(next);
            // 오늘이 포함된 월이면 오늘 날짜, 다음 월이므로 1일 선택
            const today = new Date();
            const dateToSelect = (next.getFullYear() === today.getFullYear() && next.getMonth() === today.getMonth())
              ? today
              : next; // next = new Date(year, month) → 1일
            setSelectedDate(dateToSelect);
          }}
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
          <div className="relative">
            {renderFullCalendar()}
            {/* 날짜 클릭 시 슬라이드업 패널 — 캘린더 컨테이너 기준 위치 */}
            {panelVisible && panelDate && (
              <div
                className="absolute inset-0 z-50"
                onClick={() => setPanelVisible(false)}
              >
                {/* 딤 배경 */}
                <div className="absolute inset-0 rounded-2xl" style={{ backgroundColor: 'rgba(0,0,0,0.18)' }} />
                {/* 패널 */}
                <div
                  className="absolute inset-x-0 bottom-0 bg-white rounded-t-2xl max-h-[88%] flex flex-col animate-slide-up"
                  onClick={e => e.stopPropagation()}
                >
                  {/* 핸들 */}
                  <div className="flex justify-center pt-2.5 pb-1.5 flex-shrink-0">
                    <div className="w-10 h-1 rounded-full bg-gray-300" />
                  </div>
                  {/* 헤더 */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
                    <span className="text-base font-bold text-gray-900">
                      {isForeign
                        ? panelDate.toLocaleString('en-US', { month: 'long', day: 'numeric', weekday: 'short' })
                        : `${panelDate.getMonth() + 1}월 ${panelDate.getDate()}일 (${DAYS_OF_WEEK[panelDate.getDay()]})`}
                    </span>
                    <div className="flex items-center gap-2">
                      {userData && currentCampCode && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPersonalTask(null);
                            setPersonalTaskFormDate(panelDate);
                            setShowPersonalTaskForm(true);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-purple-600 bg-purple-50 border border-dashed border-purple-200 rounded-lg hover:bg-purple-100 hover:border-purple-300 transition-all"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          {isForeign ? 'My Tasks' : '내 업무'}
                        </button>
                      )}
                      <button
                        onClick={() => setPanelVisible(false)}
                        className="p-1 rounded-full hover:bg-gray-100 text-gray-400"
                        aria-label="닫기"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  {/* 업무 목록 — 공통+개인 시간순 병합, 업무카드 UI */}
                  <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
                    {(() => {
                      type MergedItem =
                        | { kind: 'shared'; task: Task }
                        | { kind: 'personal'; task: PersonalTask };

                      const merged: MergedItem[] = [
                        ...panelTasks.map(t => ({ kind: 'shared' as const, task: t })),
                        ...panelPersonalTasks.map(t => ({ kind: 'personal' as const, task: t })),
                      ].sort((a, b) => {
                        const tA = a.task.time ?? '';
                        const tB = b.task.time ?? '';
                        if (tA && tB) return tA.localeCompare(tB);
                        if (tA && !tB) return -1;
                        if (!tA && tB) return 1;
                        return a.task.createdAt.toMillis() - b.task.createdAt.toMillis();
                      });

                      if (merged.length === 0) {
                        return (
                          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
                            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="text-sm">{isForeign ? 'No tasks for this day' : '등록된 업무가 없습니다'}</p>
                          </div>
                        );
                      }

                      return merged.map(item => {
                        if (item.kind === 'shared') {
                          const task = item.task;
                          const cat = task.categoryId ? categoryMap.get(task.categoryId) : undefined;
                          return (
                            <TaskCard
                              key={`panel-shared-${task.id}`}
                              task={task}
                              isAdmin={isAdmin}
                              currentUserId={userData.userId}
                              campUsers={campUsers}
                              campCode={currentCampCodeId}
                              category={cat}
                              onToggle={(id) => handlePanelToggle(id)}
                              onClick={() => { setPanelVisible(false); setSelectedTask(task); setShowTaskDetail(true); }}
                            />
                          );
                        }
                        // 개인 업무 카드
                        const p = item.task;
                        const cat = p.categoryId ? categoryMap.get(p.categoryId) : undefined;
                        const timeStr = formatTime(p.time);
                        const durationStr = formatDuration(p.estimatedDuration);
                        return (
                          <div
                            key={`panel-personal-${p.id}`}
                            className="rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden"
                            style={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb' }}
                            onClick={() => { setPanelVisible(false); setSelectedPersonalTask(p); setShowPersonalTaskDetail(true); }}
                          >
                            {timeStr && (
                              <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-purple-50 border-purple-100">
                                <svg className="w-3.5 h-3.5 flex-shrink-0 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm font-bold text-purple-600">{timeStr}</span>
                                {durationStr && <span className="text-xs text-purple-400">({durationStr})</span>}
                              </div>
                            )}
                            <div className={`flex ${p.isCompleted ? 'opacity-60' : ''}`}>
                              <div className="flex-1 py-2.5 pl-3 pr-2 min-w-0">
                                <h4 className={`text-sm font-medium mb-1 ${p.isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                  {p.title}
                                </h4>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {cat && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                                      style={{ backgroundColor: `${cat.color}22`, color: cat.color }}>
                                      {cat.name}
                                    </span>
                                  )}
                                  {p.description && (
                                    <span className="text-xs text-gray-400 truncate w-full block">{p.description.split('\n')[0]}</span>
                                  )}
                                </div>
                              </div>
                              {/* 체크박스 — 오른쪽 */}
                              <div className="flex items-center px-3 py-2.5 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={e => { e.stopPropagation(); handlePanelPersonalToggle(p); }}
                                  className="focus:outline-none"
                                  aria-label={isForeign ? (p.isCompleted ? 'Mark incomplete' : 'Mark complete') : (p.isCompleted ? '완료 취소' : '완료 처리')}
                                >
                                  {p.isCompleted ? (
                                    <svg className="w-6 h-6 text-purple-500" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.177 14.232l-4.243-4.243 1.414-1.414 2.829 2.829 5.656-5.657 1.414 1.415-7.07 7.07z" />
                                    </svg>
                                  ) : (
                                    <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
                                    </svg>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admin 업무 추가 + 카테고리 관리 버튼 */}
      {isAdmin && (
        <div className="px-4 mb-3 flex gap-2">
          <button
            onClick={() => {
              setEditingTask(null);
              setShowTaskForm(true);
            }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm text-blue-600 bg-blue-50 border border-dashed border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-all font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            {isForeign ? 'Add Task' : '업무 추가'}
          </button>
          <button
            onClick={() => setShowCategoryManager(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-gray-50 border border-dashed border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-all font-medium whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            {isForeign ? 'Categories' : '카테고리'}
          </button>
        </div>
      )}

      {/* compact 뷰: 선택된 날짜의 업무 목록 */}
      {calendarView === 'compact' && (
        <div className="px-4">
          {/* 날짜 헤더 + 개인 업무 추가 버튼 */}
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold text-gray-900">
              {isForeign
                ? selectedDate.toLocaleString('en-US', { month: 'long', day: 'numeric', weekday: 'short' })
                : `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 (${DAYS_OF_WEEK[selectedDate.getDay()]})`}
            </h3>
            {userData && currentCampCode && (
              <button
                type="button"
                onClick={() => { setEditingPersonalTask(null); setPersonalTaskFormDate(selectedDate); setShowPersonalTaskForm(true); }}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-purple-600 bg-purple-50 border border-dashed border-purple-200 rounded-lg hover:bg-purple-100 hover:border-purple-300 transition-all"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                {isForeign ? 'My Tasks' : '내 업무'}
              </button>
            )}
          </div>

          {/* 통합 목록: 공통 업무 + 개인 업무 시간순 병합 */}
          {(() => {
            // 공통 업무와 개인 업무를 시간순으로 병합
            type MergedItem =
              | { kind: 'shared'; task: import('@smis-mentor/shared').Task }
              | { kind: 'personal'; task: PersonalTask };

            const merged: MergedItem[] = [
              ...selectedDateTasks.map(t => ({ kind: 'shared' as const, task: t })),
              ...personalTasks.map(t => ({ kind: 'personal' as const, task: t })),
            ].sort((a, b) => {
              const timeA = a.task.time ?? '';
              const timeB = b.task.time ?? '';
              if (timeA && timeB) return timeA.localeCompare(timeB);
              if (timeA && !timeB) return -1;
              if (!timeA && timeB) return 1;
              return a.task.createdAt.toMillis() - b.task.createdAt.toMillis();
            });

            if (merged.length === 0) {
              return (
                <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  <p className="text-gray-500">{isForeign ? 'No tasks for this day' : '이 날짜에 등록된 업무가 없습니다'}</p>
                </div>
              );
            }

            return (
              <div className="space-y-2">
                {merged.map(item => {
                  if (item.kind === 'shared') {
                    const sharedCategory = item.task.categoryId
                      ? categoryMap.get(item.task.categoryId)
                      : undefined;
                    return (
                      <TaskCard
                        key={`shared-${item.task.id}`}
                        task={item.task}
                        isAdmin={isAdmin}
                        currentUserId={userData.userId}
                        campUsers={campUsers}
                        campCode={currentCampCodeId}
                        category={sharedCategory}
                        onToggle={handleToggleComplete}
                        onClick={() => { setSelectedTask(item.task); setShowTaskDetail(true); }}
                      />
                    );
                  }
                  // 개인 업무 카드 — 공통 업무 카드와 동일한 구조
                  const p = item.task;
                  const personalCategory = p.categoryId ? categoryMap.get(p.categoryId) : undefined;
                  const timeStr = formatTime(p.time);
                  const durationStr = formatDuration(p.estimatedDuration);
                  return (
                    <div
                      key={`personal-${p.id}`}
                      className="rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden"
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e7eb',
                      }}
                      onClick={() => { setSelectedPersonalTask(p); setShowPersonalTaskDetail(true); }}
                    >
                      {/* 시간 배너 */}
                      {timeStr && (
                        <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-purple-50 border-purple-100">
                          <svg className="w-3.5 h-3.5 flex-shrink-0 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm font-bold text-purple-600">{timeStr}</span>
                          {durationStr && <span className="text-xs text-purple-400">({durationStr})</span>}
                        </div>
                      )}
                      <div className={`flex ${p.isCompleted ? 'opacity-60' : ''}`}>
                        {/* 업무 정보 */}
                        <div className="flex-1 py-2.5 pl-3 pr-2 min-w-0">
                          <h4 className={`text-sm font-medium mb-1 ${p.isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                            {p.title}
                          </h4>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {personalCategory && (
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                                style={{ backgroundColor: `${personalCategory.color}22`, color: personalCategory.color }}
                              >
                                {personalCategory.name}
                              </span>
                            )}
                            {p.description && (
                              <span className="text-xs text-gray-400 truncate w-full block">{p.description.split('\n')[0]}</span>
                            )}
                          </div>
                        </div>
                        {/* 체크박스 — 오른쪽 */}
                        <div className="flex items-center px-3 py-2.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); handlePersonalToggle(p); }}
                            className="focus:outline-none"
                            aria-label={isForeign ? (p.isCompleted ? 'Mark incomplete' : 'Mark complete') : (p.isCompleted ? '완료 취소' : '완료 처리')}
                          >
                            {p.isCompleted ? (
                              <svg className="w-6 h-6 text-purple-500" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.177 14.232l-4.243-4.243 1.414-1.414 2.829 2.829 5.656-5.657 1.414 1.415-7.07 7.07z" />
                              </svg>
                            ) : (
                              <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <circle cx="12" cy="12" r="10" strokeWidth="1.5" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
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
          categories={categories}
          onClose={() => {
            setShowTaskForm(false);
            setEditingTask(null);
            setIsCopyMode(false);
          }}
          onSuccess={() => {
            refreshCurrentData();
          }}
        />
      )}

      {/* 개인 업무 상세 모달 */}
      {showPersonalTaskDetail && selectedPersonalTask && (
        <PersonalTaskDetailModal
          task={selectedPersonalTask}
          category={selectedPersonalTask.categoryId ? categoryMap.get(selectedPersonalTask.categoryId) : undefined}
          onClose={() => { setShowPersonalTaskDetail(false); setSelectedPersonalTask(null); }}
          onEdit={() => {
            setEditingPersonalTask(selectedPersonalTask);
            setPersonalTaskFormDate(selectedPersonalTask.date.toDate());
            setShowPersonalTaskDetail(false);
            setSelectedPersonalTask(null);
            setShowPersonalTaskForm(true);
          }}
          onDelete={() => {
            handlePersonalDelete(selectedPersonalTask);
            setShowPersonalTaskDetail(false);
            setSelectedPersonalTask(null);
          }}
        />
      )}

      {/* 개인 업무 추가/수정 모달 */}
      {showPersonalTaskForm && userData && currentCampCode && (
        <PersonalTaskFormModal
          ownerId={userData.userId}
          campCode={currentCampCode}
          selectedDate={personalTaskFormDate ?? selectedDate}
          task={editingPersonalTask}
          categories={categories}
          onClose={() => { setShowPersonalTaskForm(false); setEditingPersonalTask(null); }}
          onSuccess={() => {
            setShowPersonalTaskForm(false);
            setEditingPersonalTask(null);
            loadTasksForDate(selectedDate);
            loadPersonalTaskDates(currentDate.getFullYear(), currentDate.getMonth());
          }}
        />
      )}

      {/* 카테고리 관리 모달 (관리자 전용) */}
      {showCategoryManager && isAdmin && userData && currentCampCode && (
        <TaskCategoryManager
          campCode={currentCampCode}
          adminUserId={userData.userId}
          onCategoriesChange={async () => {
            // 카테고리 관리 모달에서 변경 시 부모의 카테고리 목록도 갱신
            const updated = await getTaskCategories(currentCampCode);
            setCategories(updated);
          }}
          onClose={() => setShowCategoryManager(false)}
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
  category,
  onToggle,
  onClick,
}: {
  task: Task;
  isAdmin: boolean;
  currentUserId: string;
  campUsers: User[];
  campCode: string;
  category?: TaskCategory;
  onToggle: (taskId: string) => void;
  onClick: () => void;
}) {
  const { userData: cardUser } = useAuth();
  const isForeign = cardUser?.role === 'foreign' || cardUser?.role === 'foreign_temp';
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
      className="rounded-lg shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden"
      style={{
        backgroundColor: '#ffffff',
        borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 4,
        borderStyle: 'solid',
        borderTopColor: '#e5e7eb', borderRightColor: '#e5e7eb', borderBottomColor: '#e5e7eb', borderLeftColor: '#3b82f6',
      }}
      onClick={onClick}
    >
      {/* 시간이 있는 경우 상단 시간 배너 */}
      {timeStr && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-blue-50 border-blue-100">
          <svg className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm font-bold text-blue-600">{timeStr}</span>
          {durationStr && <span className="text-xs text-blue-400">({durationStr})</span>}
        </div>
      )}

      <div className={`flex ${isCompleted ? 'opacity-60' : ''}`}>
        {/* 업무 정보 */}
        <div className={`${isAdmin ? 'w-2/5 border-r' : 'flex-1'} py-2.5 pl-3 pr-2 min-w-0`}>
          <h4 className={`text-sm font-medium mb-1 ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
            {task.title}
          </h4>
          <div className="flex items-center gap-1.5 flex-wrap">
            {category && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                style={{ backgroundColor: `${category.color}22`, color: category.color }}
              >
                {category.name}
              </span>
            )}
            <span className="text-xs text-gray-500">{task.targetRoles.join(', ')}</span>
            {task.targetGroups && task.targetGroups.length > 0 && (
              <span className="text-xs text-gray-400">· {task.targetGroups.join(', ')}</span>
            )}
            {task.attachments && task.attachments.length > 0 && (
              <span className="text-xs text-gray-400">📎 {task.attachments.length}</span>
            )}
          </div>
        </div>

        {/* 관리자: 완료 현황 */}
        {isAdmin && (
          <div className="flex-1 p-2.5 bg-gray-50 space-y-1">
            {completedNames.length > 0 && (
              <div className="flex items-start gap-1.5">
                <span className="text-xs font-semibold text-green-700 flex-shrink-0">✓ {completedNames.length}명:</span>
                <span className="text-xs text-green-800 leading-relaxed">{completedNames.join(', ')}</span>
              </div>
            )}
            {incompleteNames.length > 0 && (
              <div className="flex items-start gap-1.5">
                <span className="text-xs font-semibold text-red-700 flex-shrink-0">✗ {incompleteNames.length}명:</span>
                <span className="text-xs text-red-800 leading-relaxed">{incompleteNames.join(', ')}</span>
              </div>
            )}
          </div>
        )}

        {/* 체크박스 — 오른쪽 */}
        <div className="flex items-center px-3 py-2.5 flex-shrink-0">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onToggle(task.id); }}
            className="focus:outline-none"
            aria-label={isForeign ? (isCompleted ? 'Mark incomplete' : 'Mark complete') : (isCompleted ? '완료 취소' : '완료 처리')}
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
        </div>
      </div>
    </div>
  );
}
