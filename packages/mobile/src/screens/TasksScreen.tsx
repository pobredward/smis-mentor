import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Linking,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
  Animated,
  Dimensions,
  Pressable,
  BackHandler,
  unstable_batchedUpdates,
} from 'react-native';
import { ScrollView, GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { Timestamp } from 'firebase/firestore';
import {
  getTasksByDate,
  getTaskDatesInMonth,
  getTasksInMonth,
  getTaskById,
  toggleTaskCompletion,
  deleteTask,
  createTask,
  updateTask,
  updateTaskGroup,
  getTasksByGroupId,
  formatTime,
  formatDuration,
  uploadTaskImage,
} from '../services/taskService';
import {
  getPersonalTasksByDate,
  getPersonalTaskDatesInMonth,
  getPersonalTasksInMonth,
  getPersonalTaskById,
  getPersonalTasksByGroupId,
  createPersonalTask,
  updatePersonalTaskGroup,
  deletePersonalTask,
  deletePersonalTaskGroup,
  togglePersonalTaskCompletion,
} from '../services/personalTaskService';
import { getTaskCategories, createTaskCategory, updateTaskCategory, deleteTaskCategory } from '../services/taskCategoryService';
import { getUserJobCodesInfo } from '../services/authService';
import { getUsersByJobCode } from '../services/userService';
import type { Task, JobExperienceGroupRole, TaskAttachment, User, PersonalTask, TaskCategory } from '../../../shared/src/types';
import { getTaskTargetUsers, getTaskCompletionStatus, getUserNames, isKoreanHoliday, getKoreanHolidaySet } from '@smis-mentor/shared';
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

const DAYS_OF_WEEK_KO = ['일', '월', '화', '수', '목', '금', '토'];
const DAYS_OF_WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_OF_WEEK = DAYS_OF_WEEK_KO; // 기본값 — 컴포넌트 내부에서 isForeign에 따라 분기


export function TasksScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { userData, loading: authLoading } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const daysOfWeek = isForeign ? DAYS_OF_WEEK_EN : DAYS_OF_WEEK_KO;
  // campTasks 전체 캐시는 사용하지 않음 — 날짜/월 범위 쿼리로 필요한 데이터만 읽음
  const [loading, setLoading] = useState(true);
  const [currentGroupRole, setCurrentGroupRole] = useState<JobExperienceGroupRole | null>(null);
  const [currentCampCode, setCurrentCampCode] = useState<string>(''); // code (E27)
  const [currentCampCodeId, setCurrentCampCodeId] = useState<string>(''); // Firestore 문서 ID
  const [campUsers, setCampUsers] = useState<User[]>([]); // 캠프 사용자 목록
  const [refreshing, setRefreshing] = useState(false);

  // 캘린더 상태
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  // selectedDate를 ref로도 유지 — useMemo 의존성 없이 최신 선택 날짜 참조
  const selectedDateRef = useRef(new Date());
  // 선택된 날짜 문자열 — compactCalendarCells useMemo의 의존성으로 사용
  // selectedDate(Date 객체) 대신 문자열을 의존성으로 써서 동일한 날짜 재선택 시 리렌더 방지
  const [selectedDateStr, setSelectedDateStr] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [taskDates, setTaskDates] = useState<Set<string>>(new Set());
  const [selectedDateTasks, setSelectedDateTasks] = useState<Task[]>([]);
  const [calendarView, setCalendarView] = useState<'compact' | 'full'>('compact');

  // 앱 시작 시 저장된 뷰 모드 복원
  useEffect(() => {
    AsyncStorage.getItem('calendarView').then(saved => {
      if (saved === 'compact' || saved === 'full') {
        setCalendarView(saved);
      }
    });
  }, []);

  const handleCalendarViewChange = (v: 'compact' | 'full') => {
    setCalendarView(v);
    AsyncStorage.setItem('calendarView', v);
  };
  const [monthTasks, setMonthTasks] = useState<Map<string, Task[]>>(new Map());
  const monthTasksRef = useRef<Map<string, Task[]>>(new Map());

  // 월 데이터 메모리 캐시 — 스와이프 시 즉시 표시를 위해 인접 달을 미리 저장
  const MONTH_CACHE_TTL_MS = 5 * 60 * 1000; // 5분
  interface MonthCacheEntry {
    tasks: Map<string, Task[]>;
    personalDates: Map<string, number>;
    personalTasks: Map<string, PersonalTask[]>;
    fetchedAt: number;
  }
  const monthCacheRef = useRef<Map<string, MonthCacheEntry>>(new Map());

  // selectedDate, selectedDateStr, selectedDateRef를 함께 업데이트하는 헬퍼
  const applySelectedDate = useCallback((date: Date) => {
    const str = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    selectedDateRef.current = date;
    unstable_batchedUpdates(() => {
      setSelectedDate(date);
      setSelectedDateStr(str);
    });
  }, []);

  // 4개 달력 state를 한 번의 렌더로 일괄 업데이트 — unstable_batchedUpdates 보장
  const applyMonthData = (data: MonthCacheEntry) => {
    unstable_batchedUpdates(() => {
      monthTasksRef.current = data.tasks;
      setMonthTasks(data.tasks);
      setTaskDates(new Set(data.tasks.keys()));
      setPersonalTaskDates(data.personalDates);
      personalMonthTasksRef.current = data.personalTasks;
      setPersonalMonthTasks(data.personalTasks);
    });
  };

  // 모달 상태
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // 풀 캘린더 날짜 클릭 바텀시트
  const SCREEN_HEIGHT = Dimensions.get('window').height;
  const [sheetVisible, setSheetVisible] = useState(false);
  // date/tasks는 ref로 관리해 setState 횟수 최소화
  const sheetDateRef = useRef<Date | null>(null);
  const sheetTasksRef = useRef<Task[]>([]);
  const sheetPersonalTasksRef = useRef<PersonalTask[]>([]);
  const [sheetRenderKey, setSheetRenderKey] = useState(0);
  const sheetAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const sheetDragY = useRef(new Animated.Value(0)).current;

  // ref 기반 접근자 (렌더 내에서 사용)
  const sheetDate = sheetDateRef.current;
  const sheetTasks = sheetTasksRef.current;
  const sheetPersonalTasks = sheetPersonalTasksRef.current;

  const openSheet = useCallback((date: Date, dayTasks: Task[], dayPersonalTasks: PersonalTask[] = []) => {
    // ref 업데이트 (리렌더 없음)
    sheetDateRef.current = date;
    sheetTasksRef.current = dayTasks;
    sheetPersonalTasksRef.current = dayPersonalTasks;
    // 애니메이션 초기 위치 세팅
    sheetAnim.setValue(SCREEN_HEIGHT);
    sheetDragY.setValue(0);
    // visible + renderKey를 한 번에 배치 업데이트
    setSheetVisible(true);
    setSheetRenderKey(k => k + 1);
    // Android에서 Animated.View가 마운트되기 전에 애니메이션이 시작되면
    // 뷰가 이미 최종 위치에 도달한 채로 팍 뜨는 현상이 발생함.
    // requestAnimationFrame으로 다음 프레임까지 미뤄 Native 뷰 마운트 후 시작.
    requestAnimationFrame(() => {
      Animated.timing(sheetAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });
  }, [sheetAnim, sheetDragY, SCREEN_HEIGHT]);

  const closeSheet = useCallback(() => {
    sheetDragY.setValue(0);
    Animated.timing(sheetAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setSheetVisible(false));
  }, [sheetAnim, sheetDragY, SCREEN_HEIGHT]);

  // Android 뒤로가기 버튼으로 바텀시트 닫기
  useEffect(() => {
    if (!sheetVisible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSheet();
      return true; // 기본 뒤로가기 동작(화면 이탈) 차단
    });
    return () => subscription.remove();
  }, [sheetVisible, closeSheet]);

  const sheetScrollOffsetY = useRef(0);

  const sheetPanGesture = Gesture.Pan()
    .runOnJS(true)
    // 아래로 10px 이상 이동할 때만 시트 드래그 활성화 (위 스크롤과 구분)
    .activeOffsetY([10, 10])
    .failOffsetX([-25, 25])
    .onStart(() => {
      // 스크롤이 맨 위가 아니면 제스처 즉시 실패 처리 → ScrollView가 처리
      if (sheetScrollOffsetY.current > 2) {
        // Pan 제스처를 실패시켜 ScrollView가 스크롤을 처리하도록 위임
        return;
      }
    })
    .onUpdate((e) => {
      // 스크롤이 맨 위이고 아래로 드래그할 때만 시트 이동
      if (e.translationY > 0 && sheetScrollOffsetY.current <= 2) {
        sheetDragY.setValue(e.translationY);
      }
    })
    .onEnd((e) => {
      if (
        sheetScrollOffsetY.current <= 2 &&
        (e.translationY > 60 || e.velocityY > 500)
      ) {
        // 현재 드래그 위치를 sheetAnim에 흡수해 튀어오름 없이 자연스럽게 닫기
        const currentDrag = Math.max(e.translationY, 0);
        sheetAnim.setValue(currentDrag);
        sheetDragY.setValue(0);
        Animated.timing(sheetAnim, {
          toValue: SCREEN_HEIGHT,
          duration: 240,
          useNativeDriver: true,
        }).start(() => setSheetVisible(false));
      } else {
        // 임계값 미달 → 원위치 복귀
        Animated.spring(sheetDragY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          stiffness: 280,
          mass: 0.8,
        }).start();
      }
    });

  const isAdmin = userData?.role === 'admin';
  const isManager = currentGroupRole === '매니저' || currentGroupRole === 'Manager';
  const canAddTask = isAdmin || isManager;

  // 개인 업무 상태
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([]);
  const [personalTaskDates, setPersonalTaskDates] = useState<Map<string, number>>(new Map());
  const [personalMonthTasks, setPersonalMonthTasks] = useState<Map<string, PersonalTask[]>>(new Map());
  const personalMonthTasksRef = useRef<Map<string, PersonalTask[]>>(new Map());
  const [showPersonalTaskModal, setShowPersonalTaskModal] = useState(false);
  const [editingPersonalTask, setEditingPersonalTask] = useState<PersonalTask | null>(null);
  const [personalTaskTitle, setPersonalTaskTitle] = useState('');
  const [personalTaskDesc, setPersonalTaskDesc] = useState('');
  const [personalTaskHasTime, setPersonalTaskHasTime] = useState(false);
  const [personalTaskTime, setPersonalTaskTime] = useState('');
  // 소요시간 — 분 단위 고정
  const [personalTaskDuration, setPersonalTaskDuration] = useState('');
  // 날짜 — 복수 선택 지원
  const [personalTaskSelectedDates, setPersonalTaskSelectedDates] = useState<Date[]>([selectedDate]);
  // 달력 월 탐색용
  const [personalTaskCalMonth, setPersonalTaskCalMonth] = useState(selectedDate.getMonth());
  const [personalTaskCalYear, setPersonalTaskCalYear] = useState(selectedDate.getFullYear());
  const [personalTaskCategoryId, setPersonalTaskCategoryId] = useState('');
  const [isSubmittingPersonal, setIsSubmittingPersonal] = useState(false);
  const [loadingPersonalGroupDates, setLoadingPersonalGroupDates] = useState(false);

  // 카테고리 상태
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);

  // categoryId → TaskCategory 빠른 조회 맵
  const categoryMap = useMemo(
    () => new Map(categories.map(c => [c.id, c])),
    [categories]
  );

  // 달력 좌우 스와이프로 월 이동 — gesture-handler로 ScrollView와 네이티브 레벨에서 협력
  const swipeGesture = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-10, 10])   // 수평 10px 이상 이동 시 이 제스처 활성화
    .failOffsetY([-15, 15])     // 수직 15px 이상이면 실패 → ScrollView가 처리
    .onEnd((event) => {
      // translationX(누적 이동량) 대신 velocityX(손을 뗄 때 속도)로 방향 판단
      // → 수평으로 가다가 방향을 틀어도 마지막 속도 방향으로만 결정
      const VELOCITY_THRESHOLD = 300;
      if (event.velocityX < -VELOCITY_THRESHOLD) {
        setCurrentDate(prev => {
          const next = new Date(prev.getFullYear(), prev.getMonth() + 1);
          // useEffect를 기다리지 않고 캐시 데이터를 즉시 동기 적용 — 체감 딜레이 제거
          const key = `${next.getFullYear()}-${next.getMonth()}-${currentCampCode}`;
          const cached = monthCacheRef.current.get(key);
          if (cached && Date.now() - cached.fetchedAt < MONTH_CACHE_TTL_MS) applyMonthData(cached);
          applySelectedDate(next);
          return next;
        });
      } else if (event.velocityX > VELOCITY_THRESHOLD) {
        setCurrentDate(prev => {
          const next = new Date(prev.getFullYear(), prev.getMonth() - 1);
          // useEffect를 기다리지 않고 캐시 데이터를 즉시 동기 적용 — 체감 딜레이 제거
          const key = `${next.getFullYear()}-${next.getMonth()}-${currentCampCode}`;
          const cached = monthCacheRef.current.get(key);
          if (cached && Date.now() - cached.fetchedAt < MONTH_CACHE_TTL_MS) applyMonthData(cached);
          applySelectedDate(next);
          return next;
        });
      }
    });

  // route params에서 selectedDate 및 refresh, editTaskId 가져오기
  useEffect(() => {
    const params = route.params as any;
    logger.info('TasksScreen received params:', params);
    
    // params가 중첩된 경우 처리
    const actualParams = params?.params || params;
    
    if (actualParams?.selectedDate) {
      try {
        const date = new Date(actualParams.selectedDate);
        if (!isNaN(date.getTime())) {
          applySelectedDate(date);
          setCurrentDate(date);
        }
      } catch (error) {
        logger.error('날짜 파라미터 파싱 오류:', error);
      }
    }
    
    // editTaskId 처리 (getTaskById로 직접 조회)
    if (actualParams?.editTaskId && !editingTask) {
      logger.info('editTaskId found:', actualParams.editTaskId);
      getTaskById(actualParams.editTaskId).then(taskToEdit => {
        logger.info('taskToEdit:', taskToEdit);
        if (taskToEdit) {
          setEditingTask(taskToEdit);
          setShowAddModal(true);
        }
      });
      navigation.setParams({ 
        params: { ...actualParams, editTaskId: undefined } 
      } as any);
    }
    
    // copyTaskId 처리 (getTaskById로 직접 조회)
    if (actualParams?.copyTaskId && !editingTask) {
      logger.info('copyTaskId found:', actualParams.copyTaskId);
      getTaskById(actualParams.copyTaskId).then(taskToCopy => {
        logger.info('taskToCopy:', taskToCopy);
        if (taskToCopy) {
          const { id, createdAt, updatedAt, createdBy, completions, ...taskDataWithoutId } = taskToCopy;
          setEditingTask(taskDataWithoutId as any);
          setShowAddModal(true);
        }
      });
      navigation.setParams({ 
        params: { ...actualParams, copyTaskId: undefined } 
      } as any);
    }
    
    // editPersonalTaskId 처리 — 파라미터를 먼저 지워 중복 실행 방지
    if (actualParams?.editPersonalTaskId) {
      const targetId = actualParams.editPersonalTaskId;
      navigation.setParams({
        params: { ...actualParams, editPersonalTaskId: undefined },
      } as any);
      getPersonalTaskById(targetId).then(personalTask => {
        if (personalTask) {
          openPersonalTaskModal(personalTask);
        }
      });
    }

    if (actualParams?.refresh) {
      fetchTasks();
    }
  }, [route.params]);

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
      return { jobCode: jobCodesInfo[0] || null, groupRole: resolvedGroupRole };
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
    // 캠프 코드가 변경될 수 있으므로 기존 월 캐시 전체 초기화
    monthCacheRef.current.clear();

    try {
      const { jobCode: activeJobCode, groupRole: resolvedGroupRole } = await fetchActiveJobCode();
      if (!activeJobCode) return;

      setCurrentCampCode(activeJobCode.code);
      setCurrentCampCodeId(activeJobCode.id);
      
      // 캠프 사용자 목록 가져오기 (관리자만)
      if (isAdmin) {
        const users = await getUsersByJobCode(activeJobCode.generation, activeJobCode.code);
        logger.info('모바일 - 조회된 캠프 사용자 수:', users.length);
        setCampUsers(users);
      }

      // 월별 업무 + 개인 업무 + 카테고리 동시 로드 (loadMonthData로 캐시에 저장)
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const commonOpts = {
        force: true,
        campCode: activeJobCode.code,
        groupRole: resolvedGroupRole,
        adminFlag: isAdmin,
      };
      const [data, , fetchedCategories] = await Promise.all([
        loadMonthData(year, month, commonOpts),
        Promise.resolve(), // 자리 맞춤
        getTaskCategories(activeJobCode.code),
      ]);
      setCategories(fetchedCategories);

      if (data) applyMonthData(data);

      // 선택된 날짜의 업무 로드
      await loadTasksForDate(selectedDate, activeJobCode.code);

      // 인접 달 백그라운드 프리패치 — campCode/groupRole을 직접 전달해 state 반영 대기 없이 즉시 시작
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      loadMonthData(prevYear, prevMonth, { ...commonOpts, force: false }).catch(() => {});
      loadMonthData(nextYear, nextMonth, { ...commonOpts, force: false }).catch(() => {});
    } catch (error) {
      logger.error('업무 목록 가져오기 오류:', error);
      Alert.alert('오류', '업무 목록을 불러오는 중 오류가 발생했습니다.');
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
      monthTasksRef.current = taskMap;
      setMonthTasks(taskMap);

      // taskDates도 Map에서 파생
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

  // 개인 업무 월별 날짜 + 풀 캘린더용 Map 로드
  const loadPersonalTaskDates = async (year: number, month: number, campCode?: string) => {
    const code = campCode || currentCampCode;
    if (!code || !userData) return;
    try {
      const [dates, taskMap] = await Promise.all([
        getPersonalTaskDatesInMonth(userData.userId, code, year, month),
        getPersonalTasksInMonth(userData.userId, code, year, month),
      ]);
      setPersonalTaskDates(dates);
      personalMonthTasksRef.current = taskMap;
      setPersonalMonthTasks(taskMap);
    } catch (error) {
      logger.error('개인 업무 월별 날짜 가져오기 오류:', error);
    }
  };

  // 월 데이터를 캐시에서 즉시 반환하거나 Firestore에서 조회 후 캐시에 저장
  // force=true 이면 캐시를 무시하고 항상 재조회 (업무 추가/수정/삭제 후 호출)
  const loadMonthData = async (
    year: number,
    month: number,
    options?: { force?: boolean; campCode?: string; groupRole?: JobExperienceGroupRole | null; adminFlag?: boolean }
  ): Promise<MonthCacheEntry | null> => {
    const code = options?.campCode ?? currentCampCode;
    const role = options?.groupRole !== undefined ? options.groupRole : currentGroupRole;
    const admin = options?.adminFlag !== undefined ? options.adminFlag : isAdmin;

    if (!code || !userData) return null;

    const key = `${year}-${month}-${code}`;
    const cached = monthCacheRef.current.get(key);
    const now = Date.now();

    if (!options?.force && cached && now - cached.fetchedAt < MONTH_CACHE_TTL_MS) {
      return cached;
    }

    try {
      const [taskMap, personalDates, personalTaskMap] = await Promise.all([
        getTasksInMonth(code, year, month, role, admin),
        getPersonalTaskDatesInMonth(userData.userId, code, year, month),
        getPersonalTasksInMonth(userData.userId, code, year, month),
      ]);

      const entry: MonthCacheEntry = {
        tasks: taskMap,
        personalDates,
        personalTasks: personalTaskMap,
        fetchedAt: Date.now(),
      };
      monthCacheRef.current.set(key, entry);
      return entry;
    } catch (error) {
      logger.error(`월 데이터 로드 오류 (${year}-${month + 1}):`, error);
      return null;
    }
  };

  // Pull to refresh 핸들러
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      // 전체 월 캐시 초기화 → 강제 재조회
      monthCacheRef.current.clear();

      // 캠프 사용자 목록 다시 가져오기 (관리자만)
      if (isAdmin && userData?.activeJobExperienceId) {
        const jobCodesInfo = await getUserJobCodesInfo([userData.activeJobExperienceId]);
        const activeJobCode = jobCodesInfo[0];
        
        if (activeJobCode) {
          const users = await getUsersByJobCode(activeJobCode.generation, activeJobCode.code);
          logger.info('모바일 - 새로고침으로 조회된 캠프 사용자 수:', users.length);
          setCampUsers(users);
        }
      }
      
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const [data] = await Promise.all([
        loadMonthData(year, month, { force: true }),
        loadTasksForDate(selectedDate),
      ]);
      if (data) applyMonthData(data);
    } catch (error) {
      logger.error('새로고침 오류:', error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [userData]);

  // 달력 월 변경 시: 캐시 히트면 즉시 표시, 이후 최신 데이터로 갱신 + 인접 달 백그라운드 프리패치
  useEffect(() => {
    if (!currentCampCode) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const key = `${year}-${month}-${currentCampCode}`;
    const cached = monthCacheRef.current.get(key);
    const now = Date.now();

    const isCacheValid = !!(cached && now - cached.fetchedAt < MONTH_CACHE_TTL_MS);

    // 유효한 캐시가 있으면 즉시 상태에 반영 — applyMonthData로 단일 리렌더 보장
    if (isCacheValid && cached) {
      applyMonthData(cached);
    } else {
      // 캐시 만료 시 Firestore 재조회 후 반영
      loadMonthData(year, month).then(data => {
        if (data) applyMonthData(data);
      });
    }

    // 인접 달(이전/다음) 백그라운드 프리패치 — 에러는 무시
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    loadMonthData(prevYear, prevMonth).catch(() => {});
    loadMonthData(nextYear, nextMonth).catch(() => {});
  }, [currentDate, currentCampCode]);

  // selectedDate가 변경될 때 해당 날짜의 업무 로드 (컴팩트 뷰에서만)
  useEffect(() => {
    if (currentCampCode && selectedDate && calendarView === 'compact') {
      loadTasksForDate(selectedDate);
    }
  }, [selectedDate, currentCampCode, calendarView]);

  // 화면 포커스 시 업무 새로고침 (다른 화면에서 돌아올 때)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (currentCampCode && selectedDate) {
        // TaskDetail/PersonalTaskDetail 에서 수정·삭제 후 돌아올 수 있으므로 현재 달 캐시 무효화
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const key = `${year}-${month}-${currentCampCode}`;
        monthCacheRef.current.delete(key);

        loadTasksForDate(selectedDate);
        loadMonthData(year, month).then(data => {
          if (data) applyMonthData(data);
        });
      }
      // 세부 페이지에서 돌아올 때 시트 업무 목록 갱신
      const cachedDate = sheetDateRef.current;
      if (sheetVisible && cachedDate) {
        const year = cachedDate.getFullYear();
        const mm = String(cachedDate.getMonth() + 1).padStart(2, '0');
        const dd = String(cachedDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${mm}-${dd}`;
        Promise.all([
          getTasksByDate(currentCampCode, cachedDate),
          userData ? getPersonalTasksByDate(userData.userId, currentCampCode, cachedDate) : Promise.resolve([]),
        ]).then(([refreshed, refreshedPersonal]) => {
          sheetTasksRef.current = refreshed;
          sheetPersonalTasksRef.current = refreshedPersonal;
          setSheetRenderKey(k => k + 1);
        }).catch(() => {
          sheetTasksRef.current = monthTasks.get(dateStr) ?? [];
          sheetPersonalTasksRef.current = personalMonthTasks.get(dateStr) ?? [];
          setSheetRenderKey(k => k + 1);
        });
      }
    });

    return unsubscribe;
  }, [navigation, currentCampCode, selectedDate, openSheet, monthTasks, currentDate]);

  // 날짜 클릭 핸들러
  // monthTasks/personalMonthTasks는 useMemo 클로저 stale 문제를 피하기 위해 ref로 참조
  const handleDateClick = useCallback((date: Date) => {
    if (calendarView === 'full') {
      const year = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${mm}-${dd}`;
      const dayTasks = monthTasksRef.current.get(dateStr) ?? [];
      const dayPersonalTasks = personalMonthTasksRef.current.get(dateStr) ?? [];
      openSheet(date, dayTasks, dayPersonalTasks);
    } else {
      applySelectedDate(date);
    }
  }, [calendarView, openSheet, applySelectedDate]);

  // 업무 완료 토글
  const handleToggleComplete = async (taskId: string) => {
    if (!userData) {
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Unable to load user information.' : '사용자 정보를 불러올 수 없습니다.');
      return;
    }

    const role = currentGroupRole || '담임' as JobExperienceGroupRole;

    try {
      await toggleTaskCompletion(taskId, userData.userId, userData.name, role);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const [data] = await Promise.all([
        loadMonthData(year, month, { force: true }),
        loadTasksForDate(selectedDate),
      ]);
      if (data) applyMonthData(data);
    } catch (error) {
      logger.error('업무 완료 토글 오류:', error);
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Failed to update task status.' : '업무 상태 변경 중 오류가 발생했습니다.');
    }
  };

  // 개인 업무 핸들러
  const openPersonalTaskModal = (task?: PersonalTask) => {
    if (task) {
      const taskDate = task.date.toDate();
      setEditingPersonalTask(task);
      setPersonalTaskTitle(task.title);
      setPersonalTaskDesc(task.description);
      setPersonalTaskHasTime(!!task.time);
      setPersonalTaskTime(task.time ?? '');
      setPersonalTaskDuration(
        task.estimatedDuration ? String(task.estimatedDuration.value) : ''
      );
      setPersonalTaskSelectedDates([taskDate]);
      setPersonalTaskCalMonth(taskDate.getMonth());
      setPersonalTaskCalYear(taskDate.getFullYear());
      setPersonalTaskCategoryId(task.categoryId ?? '');
      setShowPersonalTaskModal(true);

      // groupId가 있으면 그룹의 모든 날짜를 비동기로 로드
      if (task.groupId) {
        setLoadingPersonalGroupDates(true);
        getPersonalTasksByGroupId(task.groupId)
          .then(groupTasks => {
            if (groupTasks.length > 0) {
              const groupDates = groupTasks.map(t => t.date.toDate());
              setPersonalTaskSelectedDates(groupDates);
              setPersonalTaskCalMonth(groupDates[0].getMonth());
              setPersonalTaskCalYear(groupDates[0].getFullYear());
            }
          })
          .catch(err => logger.error('그룹 날짜 로드 오류:', err))
          .finally(() => setLoadingPersonalGroupDates(false));
      }
    } else {
      setEditingPersonalTask(null);
      setPersonalTaskTitle('');
      setPersonalTaskDesc('');
      setPersonalTaskHasTime(false);
      setPersonalTaskTime('');
      setPersonalTaskDuration('');
      setPersonalTaskSelectedDates([selectedDate]);
      setPersonalTaskCalMonth(selectedDate.getMonth());
      setPersonalTaskCalYear(selectedDate.getFullYear());
      setPersonalTaskCategoryId('');
      setShowPersonalTaskModal(true);
    }
  };

  const handlePersonalTaskSubmit = async () => {
    if (!personalTaskTitle.trim()) {
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Please enter a task title.' : '업무 제목을 입력해주세요.');
      return;
    }
    if (personalTaskSelectedDates.length === 0) {
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Please select a date.' : '날짜를 선택해주세요.');
      return;
    }

    const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
    if (personalTaskHasTime && personalTaskTime && !timePattern.test(personalTaskTime)) {
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Please enter time in 24-hour format (e.g. 14:30)' : '시간을 24시간 형식으로 입력해주세요 (예: 14:30)');
      return;
    }

    if (!userData || !currentCampCode) return;

    // 분 단위 고정
    const parsedDuration =
      personalTaskDuration && !isNaN(Number(personalTaskDuration)) && Number(personalTaskDuration) > 0
        ? { value: Number(personalTaskDuration), unit: 'minutes' as const }
        : undefined;

    setIsSubmittingPersonal(true);
    try {
      if (editingPersonalTask) {
        // 모든 업무는 groupId를 가지므로 항상 그룹 수정 API 사용
        const originalDates = await getPersonalTasksByGroupId(editingPersonalTask.groupId!)
          .then(tasks => tasks.map(t => t.date.toDate()));
        const datesChanged =
          originalDates.length !== personalTaskSelectedDates.length ||
          !originalDates.every(od =>
            personalTaskSelectedDates.some(
              nd =>
                nd.getFullYear() === od.getFullYear() &&
                nd.getMonth() === od.getMonth() &&
                nd.getDate() === od.getDate()
            )
          );
        await updatePersonalTaskGroup(
          editingPersonalTask.groupId!,
          userData.userId,
          currentCampCode,
          {
            title: personalTaskTitle.trim(),
            description: personalTaskDesc.trim(),
            time: personalTaskHasTime && personalTaskTime ? personalTaskTime : null,
            estimatedDuration: parsedDuration ?? null,
            categoryId: personalTaskCategoryId || null,
          },
          datesChanged ? personalTaskSelectedDates : undefined
        );
      } else {
        await createPersonalTask(userData.userId, currentCampCode, {
          title: personalTaskTitle.trim(),
          description: personalTaskDesc.trim(),
          dates: personalTaskSelectedDates,
          time: personalTaskHasTime && personalTaskTime ? personalTaskTime : undefined,
          estimatedDuration: parsedDuration,
          categoryId: personalTaskCategoryId || undefined,
        });
      }
      setShowPersonalTaskModal(false);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const [data] = await Promise.all([
        loadMonthData(year, month, { force: true }),
        loadTasksForDate(selectedDate),
      ]);
      if (data) applyMonthData(data);
    } catch (error) {
      logger.error('개인 업무 저장 오류:', error);
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Failed to save task.' : '저장 중 오류가 발생했습니다.');
    } finally {
      setIsSubmittingPersonal(false);
    }
  };

  const handlePersonalTaskToggle = async (task: PersonalTask) => {
    try {
      await togglePersonalTaskCompletion(task.id, task.isCompleted);
      await loadTasksForDate(selectedDate);
    } catch (error) {
      logger.error('개인 업무 완료 토글 오류:', error);
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Failed to update status.' : '상태 변경 중 오류가 발생했습니다.');
    }
  };

  const handlePersonalTaskDelete = (taskId: string) => {
    Alert.alert(isForeign ? 'Confirm Delete' : '삭제 확인', isForeign ? 'Delete this personal task?' : '이 개인 업무를 삭제하시겠습니까?', [
      { text: isForeign ? 'Cancel' : '취소', style: 'cancel' },
      {
        text: isForeign ? 'Delete' : '삭제',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePersonalTask(taskId);
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth();
            const [data] = await Promise.all([
              loadMonthData(year, month, { force: true }),
              loadTasksForDate(selectedDate),
            ]);
            if (data) applyMonthData(data);
          } catch (error) {
            logger.error('개인 업무 삭제 오류:', error);
            Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Failed to delete task.' : '삭제 중 오류가 발생했습니다.');
          }
        },
      },
    ]);
  };

  // 바텀시트 전용 토글: optimistic update로 즉시 UI 반영 후 서버 동기화
  const handleSheetToggle = async (taskId: string) => {
    if (!userData) return;
    const userId = userData.userId;
    const role = currentGroupRole || '담임' as JobExperienceGroupRole;

    // optimistic: ref 직접 변경 후 renderKey로 리렌더 유발
    const prev = sheetTasksRef.current;
    sheetTasksRef.current = prev.map(t => {
      if (t.id !== taskId) return t;
      const alreadyDone = t.completions.some(c => c.userId === userId);
      const newCompletions = alreadyDone
        ? t.completions.filter(c => c.userId !== userId)
        : [...t.completions, {
            userId,
            userName: userData.name,
            userRole: role,
            completedAt: null as unknown as import('firebase/firestore').Timestamp,
          }];
      return { ...t, completions: newCompletions };
    });
    setSheetRenderKey(k => k + 1);

    try {
      await toggleTaskCompletion(taskId, userId, userData.name, role);
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();
      const data = await loadMonthData(year, month, { force: true });
      if (data) applyMonthData(data);
    } catch (error) {
      logger.error('업무 완료 토글 오류:', error);
      // 실패 시 원복
      const date = sheetDateRef.current;
      if (date) {
        const year = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const updated = monthTasks.get(`${year}-${mm}-${dd}`) ?? [];
        sheetTasksRef.current = [...updated];
        setSheetRenderKey(k => k + 1);
      }
      Alert.alert('오류', '업무 상태 변경 중 오류가 발생했습니다.');
    }
  };

  // 바텀시트 전용 개인 업무 토글 (optimistic update)
  const handleSheetPersonalToggle = async (task: PersonalTask) => {
    // optimistic: ref 직접 변경
    sheetPersonalTasksRef.current = sheetPersonalTasksRef.current.map(t =>
      t.id === task.id ? { ...t, isCompleted: !t.isCompleted } : t
    );
    setSheetRenderKey(k => k + 1);

    try {
      await togglePersonalTaskCompletion(task.id, task.isCompleted);
      // 갱신: 해당 날짜 개인 업무 재조회 + 월 캐시 무효화
      const date = sheetDateRef.current;
      if (date && userData) {
        const [refreshed, data] = await Promise.all([
          getPersonalTasksByDate(userData.userId, currentCampCode, date),
          loadMonthData(date.getFullYear(), date.getMonth(), { force: true }),
        ]);
        sheetPersonalTasksRef.current = refreshed;
        setSheetRenderKey(k => k + 1);
        if (data) applyMonthData(data);
      }
    } catch (error) {
      logger.error('시트 개인 업무 토글 오류:', error);
      // 실패 시 원복
      const date = sheetDateRef.current;
      if (date) {
        const year = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        sheetPersonalTasksRef.current = personalMonthTasks.get(`${year}-${mm}-${dd}`) ?? [];
        setSheetRenderKey(k => k + 1);
      }
      Alert.alert('오류', '상태 변경 중 오류가 발생했습니다.');
    }
  };

  // 컴팩트 뷰 렌더링: 큰 박스(숫자/체크) + 아래에 작은 날짜
  const compactCalendarCells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days: React.ReactElement[] = [];
    const currentUserId = userData?.userId ?? '';

    // 31번 isKoreanHoliday 호출 대신 월 전체 Set을 한 번만 생성
    const holidaySet = getKoreanHolidaySet(year, month);

    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(<View key={`empty-${i}`} style={styles.compactCell} />);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateYear = date.getFullYear();
      const dateMonth = String(date.getMonth() + 1).padStart(2, '0');
      const dateDay = String(date.getDate()).padStart(2, '0');
      const dateStr = `${dateYear}-${dateMonth}-${dateDay}`;

      const dayTasks = monthTasks.get(dateStr) ?? [];
      const hasTask = dayTasks.length > 0;
      // selectedDateStr(문자열 비교)으로 동일 객체 참조 없이 선택 상태 판단
      const isSelected = selectedDateStr === dateStr;
      const isToday = new Date().toDateString() === date.toDateString();
      const dayOfWeek = date.getDay();
      const isSunday = dayOfWeek === 0;
      const isSaturday = dayOfWeek === 6;
      const isHolidayDate = holidaySet.has(dateStr);

      const pendingCount = dayTasks.filter(t => !t.completions.some(c => c.userId === currentUserId)).length;
      const allCompleted = hasTask && pendingCount === 0;
      const personalPendingCount = personalTaskDates.get(dateStr) ?? 0;
      const totalPendingCount = pendingCount + personalPendingCount;
      const allDone = allCompleted && personalPendingCount === 0;

      // 박스 색상 결정 (공통+개인 합산 기준)
      const boxStyle = (() => {
        if (allDone) return styles.compactBoxCompleted;
        if (totalPendingCount > 0) return styles.compactBoxPending;
        return styles.compactBoxEmpty;
      })();

      // 날짜 라벨 색상 (선택 시 크고 굵은 검정 원형 배경으로 강조)
      const dayLabelStyle = (() => {
        if (isSelected && isToday) return styles.compactDayLabelTodaySelected;
        if (isSelected) return styles.compactDayLabelSelected;
        // 오늘이면서 일요일/공휴일이면 빨간색+굵게 (파란색에 덮이지 않도록 먼저 처리)
        if (isToday && (isSunday || isHolidayDate)) return styles.compactDayLabelTodaySunday;
        if (isToday) return styles.compactDayLabelToday;
        if (isSunday || isHolidayDate) return styles.compactDayLabelSunday;
        if (isSaturday) return styles.compactDayLabelSaturday;
        return null;
      })();

      days.push(
        <TouchableOpacity
          key={day}
          onPress={() => handleDateClick(date)}
          style={styles.compactCell}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${month + 1}월 ${day}일${totalPendingCount > 0 ? `, 남은 업무 ${totalPendingCount}개` : allDone ? ', 모든 업무 완료' : ''}`}
        >
          {/* 큰 박스 */}
          <View style={[styles.compactBox, boxStyle]}>
            {allDone ? (
              <Ionicons name="checkmark" size={14} color="#ffffff" />
            ) : totalPendingCount > 0 ? (
              <Text style={styles.compactBoxNumber}>{totalPendingCount}</Text>
            ) : null}
          </View>
          {/* 날짜 숫자 — 선택 시 원형 배경으로 강조 */}
          <View style={[
            styles.compactDayLabelWrap,
            isSelected && (isToday ? styles.compactDayLabelWrapTodaySelected : styles.compactDayLabelWrapSelected),
            !isSelected && isToday && styles.compactDayLabelWrapToday,
          ]}>
            <Text style={[styles.compactDayLabel, dayLabelStyle]}>
              {day}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    return days;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate, monthTasks, selectedDateStr, personalTaskDates, userData?.userId]);

  // 풀 캘린더 뷰 렌더링: 날짜 셀에 업무 제목/시간 직접 표시
  // sheetVisible 등 바텀시트 상태가 바뀌어도 달력 재계산을 막기 위해 useMemo로 캐싱
  const fullCalendarRows = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    // 31번 isKoreanHoliday 호출 대신 월 전체 Set을 한 번만 생성
    const holidaySet = getKoreanHolidaySet(year, month);

    // 주 단위 행으로 구성
    const totalCells = startDayOfWeek + daysInMonth;
    const totalRows = Math.ceil(totalCells / 7);
    const rows: React.ReactElement[] = [];

    for (let row = 0; row < totalRows; row++) {
      const cells: React.ReactElement[] = [];

      for (let col = 0; col < 7; col++) {
        const cellIndex = row * 7 + col;
        const day = cellIndex - startDayOfWeek + 1;

        if (day < 1 || day > daysInMonth) {
          cells.push(<View key={`empty-${cellIndex}`} style={styles.fullCalendarCell} />);
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
        const isHolidayDate = holidaySet.has(dateStr);
        const currentUserId = userData?.userId ?? '';

        cells.push(
          <TouchableOpacity
            key={day}
            onPress={() => handleDateClick(date)}
            style={[
              styles.fullCalendarCell,
              isToday && styles.fullCalendarCellToday,
            ]}
            activeOpacity={0.7}
          >
            {/* 날짜 숫자 — 오늘은 회색 원형 배경 */}
            <View style={[
              styles.fullCalendarDayNumWrap,
              isToday && styles.fullCalendarDayNumWrapToday,
            ]}>
              <Text style={[
                styles.fullCalendarDayNum,
                (isSunday || isHolidayDate) && styles.calendarDayTextSundayHoliday,
                isSaturday && styles.calendarDayTextSaturday,
                isToday && !(isSunday || isHolidayDate) && styles.calendarDayTextTodayDark,
                isToday && (isSunday || isHolidayDate) && styles.calendarDayTextTodaySunday,
              ]}>
                {day}
              </Text>
            </View>
            {/* 공통 업무 칩 */}
            {dayTasks.map(task => {
              const isDone = task.completions.some(c => c.userId === currentUserId);
              const timeLabel = task.time ? task.time.slice(0, 5) : null;
              const cat = task.categoryId ? categoryMap.get(task.categoryId) : undefined;
              const chipBg = isDone
                ? (cat ? `${cat.color}55` : '#6ee7b7')
                : '#e5e7eb';
              const chipTextColor = isDone
                ? (cat ? cat.color : '#065f46')
                : '#6b7280';
              return (
                <View key={task.id} style={[styles.fullCalendarChip, { backgroundColor: chipBg }]}>
                  <Text style={[styles.fullCalendarChipText, { color: chipTextColor }]} numberOfLines={1}>
                    {timeLabel ? `${timeLabel} ` : ''}{task.title}
                  </Text>
                </View>
              );
            })}
            {/* 개인 업무 칩 */}
            {dayPersonalTasks.map(task => {
              const cat = task.categoryId ? categoryMap.get(task.categoryId) : undefined;
              const chipBg = task.isCompleted
                ? (cat ? `${cat.color}55` : '#6ee7b7')
                : '#e5e7eb';
              const chipTextColor = task.isCompleted
                ? (cat ? cat.color : '#065f46')
                : '#6b7280';
              return (
                <View key={task.id} style={[styles.fullCalendarChip, { backgroundColor: chipBg }]}>
                  <Text style={[styles.fullCalendarChipText, { color: chipTextColor }]} numberOfLines={1}>
                    {task.time ? `${task.time.slice(0, 5)} ` : ''}{task.title}
                  </Text>
                </View>
              );
            })}
          </TouchableOpacity>
        );
      }

      rows.push(
        <View key={`row-${row}`} style={styles.fullCalendarRow}>
          {cells}
        </View>
      );
    }

    return rows;
  }, [currentDate, monthTasks, personalMonthTasks, categoryMap, userData, handleDateClick]);

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
        <Text style={styles.loadingText}>{isForeign ? 'Loading tasks...' : '업무를 불러오는 중...'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
        alwaysBounceVertical={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
            colors={["#3b82f6"]}
            title={isForeign ? 'Refreshing...' : '새로고침 중...'}
            titleColor="#6b7280"
          />
        }
      >
        {/* 캘린더 헤더 */}
        <View style={styles.calendarHeaderSection}>
          <Text style={styles.calendarTitle}>
            {isForeign
              ? `${new Date(currentDate.getFullYear(), currentDate.getMonth()).toLocaleString('en-US', { month: 'long' })} ${currentDate.getFullYear()}`
              : `${currentDate.getFullYear()}년 ${currentDate.getMonth() + 1}월`}
          </Text>
          {/* 뷰 전환 토글 버튼 */}
          <TouchableOpacity
            onPress={() => handleCalendarViewChange(calendarView === 'compact' ? 'full' : 'compact')}
            style={styles.viewToggleButton}
            accessibilityLabel={isForeign
              ? (calendarView === 'compact' ? 'Switch to full calendar' : 'Switch to compact view')
              : (calendarView === 'compact' ? '풀 캘린더 뷰로 전환' : '컴팩트 뷰로 전환')}
            accessibilityRole="button"
          >
            <Ionicons
              name={calendarView === 'compact' ? 'calendar-outline' : 'grid-outline'}
              size={20}
              color="#3b82f6"
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCurrentDate(prev => {
              const next = new Date(prev.getFullYear(), prev.getMonth() - 1);
              const key = `${next.getFullYear()}-${next.getMonth()}-${currentCampCode}`;
              const cached = monthCacheRef.current.get(key);
              if (cached && Date.now() - cached.fetchedAt < MONTH_CACHE_TTL_MS) applyMonthData(cached);
              applySelectedDate(next);
              return next;
            })}
            style={styles.navButton}
          >
            <Ionicons name="chevron-back" size={20} color="#6b7280" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setCurrentDate(prev => {
              const next = new Date(prev.getFullYear(), prev.getMonth() + 1);
              const key = `${next.getFullYear()}-${next.getMonth()}-${currentCampCode}`;
              const cached = monthCacheRef.current.get(key);
              if (cached && Date.now() - cached.fetchedAt < MONTH_CACHE_TTL_MS) applyMonthData(cached);
              applySelectedDate(next);
              return next;
            })}
            style={styles.navButton}
          >
            <Ionicons name="chevron-forward" size={20} color="#6b7280" />
          </TouchableOpacity>
        </View>

        {/* 달력 — 좌우 스와이프로 월 이동 (GestureDetector가 ScrollView와 네이티브 레벨 협력) */}
        <GestureDetector gesture={swipeGesture}>
        <View
          style={calendarView === 'full' ? styles.fullCalendarContainer : styles.calendarContainer}
        >
          {/* 요일 헤더 */}
          <View style={styles.weekDaysRow}>
            {daysOfWeek.map((day, i) => (
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
          {calendarView === 'compact' ? (
            <View style={styles.compactGrid}>
              {compactCalendarCells}
            </View>
          ) : (
            <View style={styles.fullCalendarGrid}>
              {fullCalendarRows}
            </View>
          )}
        </View>
        </GestureDetector>

        {/* 컴팩트 뷰: 통합 업무 목록 (공통 + 개인 시간순) */}
        {calendarView === 'compact' && (
          <View style={styles.taskListContainer}>
            {/* 헤더 */}
            <View style={styles.taskListHeader}>
              <Text style={styles.taskListTitle}>
                {isForeign
                  ? selectedDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'short' })
                  : `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일 (${DAYS_OF_WEEK_KO[selectedDate.getDay()]})`}
              </Text>
              <TouchableOpacity
                onPress={() => openPersonalTaskModal()}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#d8b4fe', borderRadius: 8 }}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={13} color="#7c3aed" />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#7c3aed' }}>{isForeign ? 'My Task' : '내 업무'}</Text>
              </TouchableOpacity>
            </View>

            {/* 시간순 병합 목록 */}
            {(() => {
              type MergedItem =
                | { kind: 'shared'; task: Task }
                | { kind: 'personal'; task: PersonalTask };

              const merged: MergedItem[] = [
                ...selectedDateTasks.map(t => ({ kind: 'shared' as const, task: t })),
                ...personalTasks.map(t => ({ kind: 'personal' as const, task: t })),
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
                  <View style={styles.emptyTaskContainer}>
                    <Ionicons name="calendar-outline" size={48} color="#cbd5e1" />
                    <Text style={styles.emptyTaskText}>{isForeign ? 'No tasks for this date' : '이 날짜에 등록된 업무가 없습니다'}</Text>
                  </View>
                );
              }

              return (
                <View style={styles.taskList}>
                  {merged.map(item => {
                    if (item.kind === 'shared') {
                      const sharedCat = item.task.categoryId
                        ? categoryMap.get(item.task.categoryId)
                        : undefined;
                      return (
                        <TaskCard
                          key={`shared-${item.task.id}`}
                          task={item.task}
                          isAdmin={isAdmin}
                          currentUserId={userData.userId}
                          campUsers={campUsers}
                          campCodeId={currentCampCodeId}
                          category={sharedCat}
                          onToggle={handleToggleComplete}
                          onPress={() => {
                            const taskDate = selectedDate.toISOString().split('T')[0];
                            (navigation as any).navigate('TaskDetail', { taskId: item.task.id, taskDate });
                          }}
                        />
                      );
                    }
                    // 개인 업무 카드 — 공통 업무 카드(TaskCard)와 동일한 구조
                    const p = item.task;
                    const personalCat = p.categoryId ? categoryMap.get(p.categoryId) : undefined;
                    const timeStr = formatTime(p.time);
                    const durationStr = formatDuration(p.estimatedDuration);
                    return (
                      <TouchableOpacity
                        key={`personal-${p.id}`}
                        activeOpacity={0.7}
                        onPress={() => {
                          const taskDate = selectedDate.toISOString().split('T')[0];
                          (navigation as any).navigate('PersonalTaskDetail', { taskId: p.id, taskDate });
                        }}
                        accessibilityLabel={isForeign ? `Personal task: ${p.title}` : `개인 업무: ${p.title}`}
                        accessibilityRole="button"
                        style={[
                          styles.taskCard,
                          { opacity: p.isCompleted ? 0.6 : 1 },
                        ]}
                      >
                        {/* 시간 배너 */}
                        {timeStr ? (
                          <View style={[styles.taskTimeBanner, styles.taskTimeBannerPurple]}>
                            <Ionicons name="time-outline" size={13} color="#a855f7" />
                            <Text style={[styles.taskTimeBannerText, styles.taskTimeBannerTextPurple]}>{timeStr}</Text>
                            {durationStr ? (
                              <Text style={[styles.taskTimeBannerDuration, styles.taskTimeBannerDurationPurple]}>({durationStr})</Text>
                            ) : null}
                          </View>
                        ) : null}

                        <View style={styles.taskCardContent}>
                          {/* 왼쪽: 업무 정보 */}
                          <View style={styles.taskInfo}>
                            {personalCat && (
                              <View style={{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: `${personalCat.color}22`, marginBottom: 4, alignSelf: 'flex-start' }}>
                                <Text style={{ fontSize: 9, fontWeight: '700', color: personalCat.color }}>{personalCat.name}</Text>
                              </View>
                            )}
                            <Text
                              style={[styles.taskTitle, p.isCompleted && styles.taskTitleCompleted]}
                              numberOfLines={2}
                            >
                              {p.title}
                            </Text>
                            {p.description ? (
                              <Text style={[styles.taskRoles, { marginTop: 1 }]} numberOfLines={1}>{p.description.split('\n')[0]}</Text>
                            ) : null}
                          </View>

                          {/* 오른쪽: 체크박스 */}
                          <TouchableOpacity
                            onPress={e => { e.stopPropagation?.(); handlePersonalTaskToggle(p); }}
                            style={styles.taskCheckbox}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityLabel={isForeign
                              ? (p.isCompleted ? 'Mark incomplete' : 'Mark complete')
                              : (p.isCompleted ? '완료 취소' : '완료 처리')}
                            accessibilityRole="checkbox"
                          >
                            <Ionicons
                              name={p.isCompleted ? 'checkmark-circle' : 'ellipse-outline'}
                              size={26}
                              color={p.isCompleted ? '#a855f7' : '#d1d5db'}
                            />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })()}
          </View>
        )}
      </ScrollView>

      {/* 업무 추가 FAB + 카테고리 관리 버튼 */}
      {canAddTask && currentCampCode && (
        <View style={{ position: 'absolute', right: 20, bottom: 20, alignItems: 'center', gap: 12 }}>
          {/* 카테고리 관리 버튼 (관리자 전용) */}
          {isAdmin && (
            <TouchableOpacity
              style={styles.categoryFab}
              onPress={() => setShowCategoryManager(true)}
              accessibilityLabel={isForeign ? 'Manage categories' : '카테고리 관리'}
              accessibilityRole="button"
            >
              <Ionicons name="pricetag-outline" size={20} color="#6b7280" />
            </TouchableOpacity>
          )}
          {/* 업무 추가 FAB */}
          <TouchableOpacity
            style={styles.fab}
            onPress={() => setShowAddModal(true)}
            accessibilityLabel={isForeign ? 'Add task' : '업무 추가'}
            accessibilityRole="button"
          >
            <Ionicons name="add" size={28} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      {/* 업무 추가/수정 모달 */}
      <TaskAddModal
        visible={showAddModal}
        campCode={currentCampCode}
        initialDate={selectedDate}
        editingTask={editingTask}
        categories={categories}
        onClose={() => {
          setShowAddModal(false);
          setEditingTask(null);
        }}
        onSuccess={() => {
          setShowAddModal(false);
          setEditingTask(null);
          fetchTasks();
        }}
      />

      {/* 카테고리 관리 모달 (관리자 전용) */}
      {isAdmin && userData && currentCampCode && (
        <CategoryManagerModal
          visible={showCategoryManager}
          campCode={currentCampCode}
          adminUserId={userData.userId}
          onCategoriesChange={async () => {
            const updated = await getTaskCategories(currentCampCode);
            setCategories(updated);
          }}
          onClose={() => setShowCategoryManager(false)}
        />
      )}

      {/* 개인 업무 추가/수정 모달 */}
      <Modal
        visible={showPersonalTaskModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowPersonalTaskModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.keyboardAvoidingView}
          >
            <View style={styles.addModalContainer}>
              {/* 헤더 */}
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={styles.modalTitle}>
                    {isForeign
                      ? (editingPersonalTask ? 'Edit Personal Task' : 'Add Personal Task')
                      : (editingPersonalTask ? '개인 업무 수정' : '개인 업무 추가')}
                  </Text>
                  <View style={{ backgroundColor: '#f3e8ff', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 11, color: '#7c3aed', fontWeight: '600' }}>{isForeign ? 'Only you' : '나만 보임'}</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setShowPersonalTaskModal(false)}
                  style={styles.closeButton}
                  accessibilityLabel={isForeign ? 'Close' : '닫기'}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={24} color="#9ca3af" />
                </TouchableOpacity>
              </View>

              {/* 폼 */}
              <ScrollView style={styles.addModalContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true}>

                {/* 1. 날짜 및 시간 */}
                <View style={{ marginBottom: 14, borderWidth: 1, borderColor: '#e9d5ff', backgroundColor: 'rgba(245,240,255,0.4)', borderRadius: 10, padding: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#111827', marginBottom: (editingPersonalTask && !editingPersonalTask.groupId) ? 4 : 10 }}>
                    📅 {isForeign ? 'Date & Time' : '날짜 및 시간'} <Text style={{ color: '#ef4444' }}>*</Text>
                  </Text>
                  {editingPersonalTask && !editingPersonalTask.groupId && (
                    <Text style={{ fontSize: 11, color: '#7c3aed', marginBottom: 10 }}>
                      {isForeign ? 'Only one date can be selected when editing.' : '수정 시 날짜는 하나만 선택할 수 있습니다'}
                    </Text>
                  )}
                  {loadingPersonalGroupDates && (
                    <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>
                      {isForeign ? 'Loading group dates...' : '그룹 날짜 불러오는 중...'}
                    </Text>
                  )}

                  {/* 달력 헤더 — 월 탐색 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <TouchableOpacity
                      onPress={() => {
                        if (personalTaskCalMonth === 0) {
                          setPersonalTaskCalMonth(11);
                          setPersonalTaskCalYear(y => y - 1);
                        } else {
                          setPersonalTaskCalMonth(m => m - 1);
                        }
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="chevron-back" size={18} color="#6b7280" />
                    </TouchableOpacity>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>
                      {isForeign
                        ? `${new Date(personalTaskCalYear, personalTaskCalMonth).toLocaleString('en-US', { month: 'long' })} ${personalTaskCalYear}`
                        : `${personalTaskCalYear}년 ${personalTaskCalMonth + 1}월`}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        if (personalTaskCalMonth === 11) {
                          setPersonalTaskCalMonth(0);
                          setPersonalTaskCalYear(y => y + 1);
                        } else {
                          setPersonalTaskCalMonth(m => m + 1);
                        }
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="chevron-forward" size={18} color="#6b7280" />
                    </TouchableOpacity>
                  </View>

                  {/* 요일 헤더 */}
                  <View style={{ flexDirection: 'row', marginBottom: 4 }}>
                    {daysOfWeek.map((d, i) => (
                      <Text
                        key={d}
                        style={{
                          width: `${100 / 7}%` as unknown as number,
                          textAlign: 'center',
                          fontSize: 11,
                          fontWeight: '600',
                          color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : '#9ca3af',
                        }}
                      >
                        {d}
                      </Text>
                    ))}
                  </View>

                  {/* 날짜 그리드 */}
                  {(() => {
                    const daysInMonth = new Date(personalTaskCalYear, personalTaskCalMonth + 1, 0).getDate();
                    const firstDayOfMonth = new Date(personalTaskCalYear, personalTaskCalMonth, 1).getDay();
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const cells: React.ReactElement[] = [];

                    // 빈 칸
                    for (let i = 0; i < firstDayOfMonth; i++) {
                      cells.push(<View key={`e${i}`} style={{ width: `${100 / 7}%` as unknown as number, height: 32 }} />);
                    }

                    for (let day = 1; day <= daysInMonth; day++) {
                      const date = new Date(personalTaskCalYear, personalTaskCalMonth, day);
                      const isSelected = personalTaskSelectedDates.some(
                        d =>
                          d.getFullYear() === date.getFullYear() &&
                          d.getMonth() === date.getMonth() &&
                          d.getDate() === date.getDate()
                      );
                      const isToday =
                        today.getFullYear() === date.getFullYear() &&
                        today.getMonth() === date.getMonth() &&
                        today.getDate() === date.getDate();
                      const dayOfWeek = date.getDay();
                      const isSunday = dayOfWeek === 0;
                      const isSaturday = dayOfWeek === 6;

                      cells.push(
                        <TouchableOpacity
                          key={day}
                          style={{ width: `${100 / 7}%` as unknown as number, height: 32, alignItems: 'center', justifyContent: 'center' }}
                          disabled={loadingPersonalGroupDates}
                          onPress={() => {
                            // 그룹 날짜 로드 중에는 날짜 선택 불가 (로드 완료 후 덮어씌워짐 방지)
                            if (loadingPersonalGroupDates) return;
                            const idx = personalTaskSelectedDates.findIndex(
                              d =>
                                d.getFullYear() === date.getFullYear() &&
                                d.getMonth() === date.getMonth() &&
                                d.getDate() === date.getDate()
                            );
                            if (idx >= 0) {
                              if (personalTaskSelectedDates.length > 1) {
                                setPersonalTaskSelectedDates(prev => prev.filter((_, i) => i !== idx));
                              }
                            } else {
                              setPersonalTaskSelectedDates(prev => [...prev, date]);
                            }
                          }}
                        >
                          <View
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 6,
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: loadingPersonalGroupDates ? 0.35 : 1,
                              backgroundColor: isSelected ? '#7c3aed' : isToday ? '#f3e8ff' : 'transparent',
                              borderWidth: isToday && !isSelected ? 1 : 0,
                              borderColor: '#a78bfa',
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: isSelected || isToday ? '700' : '400',
                                color: isSelected
                                  ? '#fff'
                                  : isToday
                                  ? '#7c3aed'
                                  : isSunday
                                  ? '#ef4444'
                                  : isSaturday
                                  ? '#3b82f6'
                                  : '#374151',
                              }}
                            >
                              {day}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }

                    return (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                        {cells}
                      </View>
                    );
                  })()}

                  {/* 선택된 날짜 태그 */}
                  {personalTaskSelectedDates.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                      {[...personalTaskSelectedDates]
                        .sort((a, b) => a.getTime() - b.getTime())
                        .map((d, i) => (
                          <TouchableOpacity
                            key={i}
                            onPress={() => {
                              if (personalTaskSelectedDates.length > 1) {
                                setPersonalTaskSelectedDates(prev =>
                                  prev.filter(
                                    existing =>
                                      !(
                                        existing.getFullYear() === d.getFullYear() &&
                                        existing.getMonth() === d.getMonth() &&
                                        existing.getDate() === d.getDate()
                                      )
                                  )
                                );
                              }
                            }}
                            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ede9fe', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, gap: 4 }}
                          >
                            <Text style={{ fontSize: 11, color: '#7c3aed', fontWeight: '600' }}>
                              {isForeign
                                ? d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', weekday: 'short' })
                                : `${d.getMonth() + 1}/${d.getDate()} (${DAYS_OF_WEEK_KO[d.getDay()]})`}
                            </Text>
                            <Text style={{ fontSize: 12, color: '#a78bfa' }}>×</Text>
                          </TouchableOpacity>
                        ))}
                    </View>
                  )}

                  {/* 시간 지정 */}
                  <View style={{ marginTop: 10 }}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}
                      onPress={() => {
                        setPersonalTaskHasTime(prev => !prev);
                        if (personalTaskHasTime) setPersonalTaskTime('');
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: personalTaskHasTime ? '#7c3aed' : '#d1d5db', backgroundColor: personalTaskHasTime ? '#7c3aed' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                        {personalTaskHasTime && <Ionicons name="checkmark" size={12} color="#fff" />}
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280' }}>{isForeign ? 'Set time' : '시간 지정'}</Text>
                    </TouchableOpacity>
                    {personalTaskHasTime && (
                      <TextInput
                        style={{ paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, fontSize: 14, color: '#111827' }}
                        value={personalTaskTime}
                        onChangeText={setPersonalTaskTime}
                        placeholder={isForeign ? '24h format (e.g. 14:30)' : '24시간 형식 (예: 14:30)'}
                        placeholderTextColor="#9ca3af"
                        keyboardType="numbers-and-punctuation"
                      />
                    )}
                  </View>
                </View>

                {/* 3. 예상 소요시간 — 분 단위 고정 */}
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 6 }}>⏱️ {isForeign ? 'Estimated duration (optional)' : '예상 소요시간 (선택)'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TextInput
                      style={{ width: 80, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, fontSize: 14, color: '#111827', textAlign: 'center' }}
                      value={personalTaskDuration}
                      onChangeText={setPersonalTaskDuration}
                      placeholder="0"
                      placeholderTextColor="#9ca3af"
                      keyboardType="numeric"
                    />
                    <Text style={{ fontSize: 13, color: '#6b7280', fontWeight: '600' }}>{isForeign ? 'min' : '분'}</Text>
                  </View>
                </View>

                {/* 4. 카테고리 선택 (카테고리 있는 경우만) */}
                {categories.length > 0 && (
                  <View style={{ marginBottom: 14 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 6 }}>🏷️ {isForeign ? 'Category (optional)' : '카테고리 (선택)'}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {/* 없음 버튼 */}
                      <TouchableOpacity
                        onPress={() => setPersonalTaskCategoryId('')}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 6,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: personalTaskCategoryId === '' ? '#374151' : '#d1d5db',
                          backgroundColor: personalTaskCategoryId === '' ? '#374151' : '#fff',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: personalTaskCategoryId === '' ? '#fff' : '#6b7280' }}>{isForeign ? 'None' : '없음'}</Text>
                      </TouchableOpacity>
                      {categories.map(cat => (
                        <TouchableOpacity
                          key={cat.id}
                          onPress={() => setPersonalTaskCategoryId(cat.id)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: personalTaskCategoryId === cat.id ? cat.color : `${cat.color}60`,
                            backgroundColor: personalTaskCategoryId === cat.id ? cat.color : `${cat.color}18`,
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: personalTaskCategoryId === cat.id ? '#fff' : cat.color }}>
                            {cat.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* 4-1. 업무 제목 */}
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 6 }}>
                    ✏️ {isForeign ? 'Task title' : '업무 제목'} <Text style={{ color: '#ef4444' }}>*</Text>
                  </Text>
                  <TextInput
                    style={{ paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, fontSize: 14, color: '#111827' }}
                    value={personalTaskTitle}
                    onChangeText={setPersonalTaskTitle}
                    placeholder={isForeign ? 'e.g. Student feedback review' : '예: 학생 피드백 정리'}
                    placeholderTextColor="#9ca3af"
                  />
                </View>

                {/* 5. 업무 설명 */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 6 }}>📝 {isForeign ? 'Description' : '업무 설명'}</Text>
                  <TextInput
                    style={{ paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, fontSize: 14, color: '#111827', minHeight: 72, textAlignVertical: 'top' }}
                    value={personalTaskDesc}
                    onChangeText={setPersonalTaskDesc}
                    placeholder={isForeign ? 'Detailed description of the task' : '업무에 대한 상세 설명'}
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={3}
                  />
                </View>

                {/* 저장 버튼 */}
                <TouchableOpacity
                  onPress={handlePersonalTaskSubmit}
                  disabled={isSubmittingPersonal}
                  style={{ paddingVertical: 14, backgroundColor: isSubmittingPersonal ? '#c4b5fd' : '#7c3aed', borderRadius: 12, alignItems: 'center', marginBottom: 8 }}
                  activeOpacity={0.8}
                >
                  {isSubmittingPersonal ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>
                      {isForeign
                        ? (editingPersonalTask ? 'Save' : 'Add')
                        : (editingPersonalTask ? '수정하기' : '추가하기')}
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* 풀 캘린더 날짜 클릭 바텀시트 */}
      {sheetVisible && (
        <Animated.View
          style={[
            styles.sheetOverlay,
            {
              opacity: sheetAnim.interpolate({
                inputRange: [0, SCREEN_HEIGHT],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}
          pointerEvents="box-none"
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
          <Animated.View
            style={[
              styles.sheetContainer,
              {
                transform: [
                  {
                    translateY: Animated.add(sheetAnim, sheetDragY),
                  },
                ],
              },
            ]}
          >
              {/* 핸들+헤더 — GestureDetector를 이 영역으로만 제한해 Android에서 카드 탭이 Pan에 선점되지 않도록 함 */}
              <GestureDetector gesture={sheetPanGesture}>
              <View>
                {/* 핸들 — 드래그 영역 */}
                <View style={styles.sheetHandleArea}>
                  <View style={styles.sheetHandle} />
                </View>

                {/* 헤더 */}
                <View style={styles.sheetHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sheetTitle}>
                      {sheetDate
                        ? (isForeign
                            ? sheetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'short' })
                            : `${sheetDate.getMonth() + 1}월 ${sheetDate.getDate()}일 (${DAYS_OF_WEEK_KO[sheetDate.getDay()]})`)
                        : ''}
                    </Text>
                    <Text style={styles.sheetCount}>{isForeign ? `${sheetTasks.length + sheetPersonalTasks.length} task(s)` : `${sheetTasks.length + sheetPersonalTasks.length}개 업무`}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      if (sheetDate) {
                        setEditingPersonalTask(null);
                        setPersonalTaskTitle('');
                        setPersonalTaskDesc('');
                        setPersonalTaskHasTime(false);
                        setPersonalTaskTime('');
                        setPersonalTaskDuration('');
                        setPersonalTaskSelectedDates([sheetDate]);
                        setPersonalTaskCalMonth(sheetDate.getMonth());
                        setPersonalTaskCalYear(sheetDate.getFullYear());
                        setPersonalTaskCategoryId('');
                        setShowPersonalTaskModal(true);
                      }
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#faf5ff', borderWidth: 1, borderColor: '#d8b4fe', borderRadius: 8 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={13} color="#7c3aed" />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#7c3aed' }}>{isForeign ? 'My Task' : '내 업무'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              </GestureDetector>

              {/* 업무 목록 — GestureDetector 범위 밖이므로 Android에서도 터치 이벤트가 정상 전달됨 */}
              <ScrollView
                key={sheetRenderKey}
                style={styles.sheetScrollView}
                contentContainerStyle={styles.sheetScrollContentCard}
                showsVerticalScrollIndicator={false}
                bounces={true}
                scrollEventThrottle={16}
                onScroll={(e) => {
                  sheetScrollOffsetY.current = e.nativeEvent.contentOffset.y;
                }}
                onScrollBeginDrag={() => {
                  sheetScrollOffsetY.current = Math.max(sheetScrollOffsetY.current, 1);
                }}
                onScrollEndDrag={(e) => {
                  sheetScrollOffsetY.current = e.nativeEvent.contentOffset.y;
                }}
              >
                <SheetTaskList
                  sheetTasks={sheetTasks}
                  sheetPersonalTasks={sheetPersonalTasks}
                  isAdmin={isAdmin}
                  userData={userData}
                  campUsers={campUsers}
                  currentCampCodeId={currentCampCodeId}
                  categoryMap={categoryMap}
                  sheetDate={sheetDate}
                  selectedDate={selectedDate}
                  onSheetToggle={handleSheetToggle}
                  onSheetPersonalToggle={handleSheetPersonalToggle}
                  onNavigateTask={(taskId, taskDate) => {
                    closeSheet();
                    (navigation as any).navigate('TaskDetail', { taskId, taskDate });
                  }}
                  onNavigatePersonal={(taskId, taskDate) => {
                    closeSheet();
                    (navigation as any).navigate('PersonalTaskDetail', { taskId, taskDate });
                  }}
                />
              </ScrollView>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  );
}

// 바텀시트 업무 목록 컴포넌트 — 별도 컴포넌트로 분리해 렌더 격리
function SheetTaskList({
  sheetTasks,
  sheetPersonalTasks,
  isAdmin,
  userData,
  campUsers,
  currentCampCodeId,
  categoryMap,
  sheetDate,
  selectedDate,
  onSheetToggle,
  onSheetPersonalToggle,
  onNavigateTask,
  onNavigatePersonal,
}: {
  sheetTasks: Task[];
  sheetPersonalTasks: PersonalTask[];
  isAdmin: boolean;
  userData: { userId: string; name: string; role?: string } | null;
  campUsers: User[];
  currentCampCodeId: string;
  categoryMap: Map<string, TaskCategory>;
  sheetDate: Date | null;
  selectedDate: Date;
  onSheetToggle: (taskId: string) => void;
  onSheetPersonalToggle: (task: PersonalTask) => void;
  onNavigateTask: (taskId: string, taskDate: string) => void;
  onNavigatePersonal: (taskId: string, taskDate: string) => void;
}) {
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  type MergedItem =
    | { kind: 'shared'; task: Task }
    | { kind: 'personal'; task: PersonalTask };

  const merged: MergedItem[] = [
    ...sheetTasks.map(t => ({ kind: 'shared' as const, task: t })),
    ...sheetPersonalTasks.map(t => ({ kind: 'personal' as const, task: t })),
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
      <View style={styles.sheetEmpty}>
        <Ionicons name="calendar-outline" size={40} color="#cbd5e1" />
        <Text style={styles.sheetEmptyText}>{isForeign ? 'No tasks registered' : '등록된 업무가 없습니다'}</Text>
      </View>
    );
  }

  const baseDateStr = sheetDate
    ? sheetDate.toISOString().split('T')[0]
    : selectedDate.toISOString().split('T')[0];

  return (
    <>
      {merged.map((item, idx) => {
        if (item.kind === 'shared') {
          const task = item.task;
          const cat = task.categoryId ? categoryMap.get(task.categoryId) : undefined;
          return (
            <View key={`sheet-shared-${task.id}`} style={idx > 0 ? { marginTop: 8 } : undefined}>
              <TaskCard
                task={task}
                isAdmin={isAdmin}
                currentUserId={userData?.userId ?? ''}
                campUsers={campUsers}
                campCodeId={currentCampCodeId}
                category={cat}
                onToggle={onSheetToggle}
                onPress={() => onNavigateTask(task.id, baseDateStr)}
              />
            </View>
          );
        }
        const p = item.task;
        const cat = p.categoryId ? categoryMap.get(p.categoryId) : undefined;
        const timeStr = formatTime(p.time);
        const durationStr = formatDuration(p.estimatedDuration);
        return (
          <TouchableOpacity
            key={`sheet-personal-${p.id}`}
            style={[styles.taskCard, idx > 0 ? { marginTop: 8 } : undefined, { opacity: p.isCompleted ? 0.6 : 1 }]}
            onPress={() => onNavigatePersonal(p.id, baseDateStr)}
            activeOpacity={0.7}
          >
            {timeStr ? (
              <View style={[styles.taskTimeBanner, styles.taskTimeBannerPurple]}>
                <Ionicons name="time-outline" size={13} color="#a855f7" />
                <Text style={[styles.taskTimeBannerText, styles.taskTimeBannerTextPurple]}>{timeStr}</Text>
                {durationStr ? (
                  <Text style={[styles.taskTimeBannerDuration, styles.taskTimeBannerDurationPurple]}>({durationStr})</Text>
                ) : null}
              </View>
            ) : null}
            <View style={styles.taskCardContent}>
              <View style={styles.taskInfo}>
                {cat && (
                  <View style={{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: `${cat.color}22`, marginBottom: 4, alignSelf: 'flex-start' }}>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: cat.color }}>{cat.name}</Text>
                  </View>
                )}
                <Text style={[styles.taskTitle, p.isCompleted && styles.taskTitleCompleted]} numberOfLines={2}>
                  {p.title}
                </Text>
                {p.description ? (
                  <Text style={styles.taskRoles} numberOfLines={1}>{p.description.split('\n')[0]}</Text>
                ) : null}
              </View>
              {/* 오른쪽: 체크박스 */}
              <TouchableOpacity
                onPress={() => onSheetPersonalToggle(p)}
                style={styles.taskCheckbox}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={isForeign
                  ? (p.isCompleted ? 'Mark incomplete' : 'Mark complete')
                  : (p.isCompleted ? '완료 취소' : '완료 처리')}
                accessibilityRole="checkbox"
              >
                <Ionicons
                  name={p.isCompleted ? 'checkmark-circle' : 'ellipse-outline'}
                  size={26}
                  color={p.isCompleted ? '#a855f7' : '#d1d5db'}
                />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        );
      })}
    </>
  );
}

// 업무 카드 컴포넌트
function TaskCard({
  task,
  isAdmin,
  currentUserId,
  campUsers,
  campCodeId,
  category,
  onToggle,
  onPress,
}: {
  task: Task;
  isAdmin: boolean;
  currentUserId: string;
  campUsers: User[];
  campCodeId: string;
  category?: TaskCategory;
  onToggle: (taskId: string) => void;
  onPress: () => void;
}) {
  const isCompleted = task.completions.some(c => c.userId === currentUserId);
  const timeStr = formatTime(task.time);
  const durationStr = formatDuration(task.estimatedDuration);

  // 관리자용 완료 현황
  let adminCompletionStatus = null;
  if (isAdmin && campCodeId) {
    const targetUsers = getTaskTargetUsers(task, campUsers, campCodeId);
    const { completedCount, totalCount } = getTaskCompletionStatus(task, targetUsers);
    const completedNames = getUserNames(
      targetUsers.filter(u => task.completions.some(c => c.userId === u.userId))
    );
    const incompleteNames = getUserNames(
      targetUsers.filter(u => !task.completions.some(c => c.userId === u.userId))
    );

    adminCompletionStatus = {
      completedCount,
      totalCount,
      completedNames,
      incompleteNames,
    };
  }

  return (
    <TouchableOpacity
      style={[
        styles.taskCard,
        {
          borderLeftWidth: 4,
          borderLeftColor: '#3b82f6',
          opacity: isCompleted ? 0.6 : 1,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* 시간 배너 — 항상 파란색 고정 */}
      {timeStr ? (
        <View style={styles.taskTimeBanner}>
          <Ionicons name="time-outline" size={13} color="#3b82f6" />
          <Text style={styles.taskTimeBannerText}>{timeStr}</Text>
          {durationStr ? (
            <Text style={styles.taskTimeBannerDuration}>({durationStr})</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.taskCardContent}>
        {/* 왼쪽: 업무 정보 */}
        <View style={[styles.taskInfo, isAdmin && adminCompletionStatus && styles.taskInfoWithAdmin]}>
          {/* 카테고리 배지 */}
          {category && (
            <View style={{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: `${category.color}22`, marginBottom: 4, alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 9, fontWeight: '700', color: category.color }}>{category.name}</Text>
            </View>
          )}
          <Text style={[styles.taskTitle, isCompleted && styles.taskTitleCompleted]}>
            {task.title}
          </Text>
          <View style={styles.taskFooter}>
            <Text style={styles.taskRoles}>{task.targetRoles.join(', ')}</Text>
            {task.attachments && task.attachments.length > 0 && (
              <Text style={styles.taskAttachments}>📎 {task.attachments.length}</Text>
            )}
          </View>
        </View>

        {/* 가운데: 관리자용 완료 현황 */}
        {isAdmin && adminCompletionStatus && (
          <View style={styles.adminCompletionArea}>
            <View style={styles.adminCompletionNames}>
              {adminCompletionStatus.completedNames.length > 0 && (
                <Text style={styles.adminCompletionTextCompleted}>
                  ✓ {adminCompletionStatus.completedCount}명: {adminCompletionStatus.completedNames.join(', ')}
                </Text>
              )}
              {adminCompletionStatus.incompleteNames.length > 0 && (
                <Text style={styles.adminCompletionTextIncomplete}>
                  ✗ {adminCompletionStatus.incompleteNames.length}명: {adminCompletionStatus.incompleteNames.join(', ')}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* 오른쪽: 체크박스 */}
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onToggle(task.id);
          }}
          style={styles.taskCheckbox}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={isCompleted ? '완료 취소' : '완료 처리'}
          accessibilityRole="checkbox"
        >
          <Ionicons
            name={isCompleted ? 'checkmark-circle' : 'ellipse-outline'}
            size={26}
            color={isCompleted ? '#3b82f6' : '#d1d5db'}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// 프리셋 색상 (웹과 동일)
const PRESET_COLORS = [
  '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c',
  '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c',
  '#fcd34d', '#fbbf24', '#f59e0b', '#d97706', '#b45309',
  '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d',
  '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e',
  '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8',
  '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9',
  '#f9a8d4', '#f472b6', '#ec4899', '#db2777', '#be185d',
];

// 카테고리 관리 모달 컴포넌트
function CategoryManagerModal({
  visible,
  campCode,
  adminUserId,
  onCategoriesChange,
  onClose,
}: {
  visible: boolean;
  campCode: string;
  adminUserId: string;
  onCategoriesChange: () => void;
  onClose: () => void;
}) {
  const { userData: authUser } = useAuth();
  const isForeign = authUser?.role === 'foreign' || authUser?.role === 'foreign_temp';
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[27]);
  const [isAdding, setIsAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const load = async () => {
      try {
        setLoadingCategories(true);
        const list = await getTaskCategories(campCode);
        setCategories(list);
      } catch (error) {
        logger.error('카테고리 로드 오류:', error);
        Alert.alert('오류', '카테고리를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoadingCategories(false);
      }
    };
    load();
  }, [visible, campCode]);

  const refreshCategories = async () => {
    try {
      const list = await getTaskCategories(campCode);
      setCategories(list);
      onCategoriesChange();
    } catch (error) {
      logger.error('카테고리 갱신 오류:', error);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Please enter a category name.' : '카테고리 이름을 입력해주세요.');
      return;
    }
    setIsAdding(true);
    try {
      await createTaskCategory(campCode, { name: newName, color: newColor, createdBy: adminUserId });
      Alert.alert(isForeign ? 'Done' : '완료', isForeign ? `Category "${newName}" has been added.` : `"${newName}" 카테고리가 추가되었습니다.`);
      setNewName('');
      setNewColor(PRESET_COLORS[27]);
      await refreshCategories();
    } catch (error) {
      logger.error('카테고리 추가 오류:', error);
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Failed to add category.' : '카테고리 추가 중 오류가 발생했습니다.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) {
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Please enter a category name.' : '카테고리 이름을 입력해주세요.');
      return;
    }
    setIsSaving(true);
    try {
      await updateTaskCategory(editingId, { name: editName, color: editColor });
      Alert.alert(isForeign ? 'Done' : '완료', isForeign ? 'Category has been updated.' : '카테고리가 수정되었습니다.');
      setEditingId(null);
      await refreshCategories();
    } catch (error) {
      logger.error('카테고리 수정 오류:', error);
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Failed to update category.' : '카테고리 수정 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (cat: TaskCategory) => {
    Alert.alert(
      isForeign ? 'Delete Category' : '카테고리 삭제',
      isForeign
        ? `Delete "${cat.name}"?\nExisting tasks using this category will be shown without a category.`
        : `"${cat.name}" 카테고리를 삭제할까요?\n해당 카테고리가 지정된 기존 업무는 카테고리 없음으로 표시됩니다.`,
      [
        { text: isForeign ? 'Cancel' : '취소', style: 'cancel' },
        {
          text: isForeign ? 'Delete' : '삭제',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTaskCategory(cat.id);
              Alert.alert(isForeign ? 'Done' : '완료', isForeign ? `Category "${cat.name}" has been deleted.` : `"${cat.name}" 카테고리가 삭제되었습니다.`);
              await refreshCategories();
            } catch (error) {
              logger.error('카테고리 삭제 오류:', error);
              Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Failed to delete category.' : '카테고리 삭제 중 오류가 발생했습니다.');
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ width: '100%', maxHeight: '90%' }}
        >
          <Pressable
            style={{
              backgroundColor: '#fff',
              borderRadius: 16,
              width: '100%',
              maxHeight: '100%',
              flexDirection: 'column',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 8,
              elevation: 5,
            }}
            onPress={() => {}}
          >
            {/* 헤더 */}
            <View style={[styles.modalHeader, { flexShrink: 0 }]}>
              <View>
                <Text style={styles.modalTitle}>{isForeign ? 'Manage Categories' : '카테고리 관리'}</Text>
                <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{isForeign ? 'Applies to both shared and personal tasks' : '공통/개인 업무 모두 적용됩니다'}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityLabel={isForeign ? 'Close' : '닫기'} accessibilityRole="button">
                <Ionicons name="close" size={24} color="#9ca3af" />
              </TouchableOpacity>
            </View>

            {/* 카테고리 목록 — flex: 1로 남은 공간 차지, 스크롤 가능 */}
            <ScrollView
              style={{ flexGrow: 1, flexShrink: 1, paddingHorizontal: 16, paddingTop: 8 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {loadingCategories ? (
                <Text style={{ textAlign: 'center', color: '#9ca3af', fontSize: 14, paddingVertical: 24 }}>{isForeign ? 'Loading...' : '불러오는 중...'}</Text>
              ) : categories.length === 0 ? (
                <Text style={{ textAlign: 'center', color: '#9ca3af', fontSize: 14, paddingVertical: 24 }}>{isForeign ? 'No categories registered.' : '등록된 카테고리가 없습니다.'}</Text>
              ) : null}

              {categories.map(cat => (
                <View key={cat.id} style={{ marginBottom: 8 }}>
                  {editingId === cat.id ? (
                    // 수정 폼
                    <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 10 }}>
                      <TextInput
                        style={[styles.formInput, { marginBottom: 0 }]}
                        value={editName}
                        onChangeText={setEditName}
                        autoFocus
                        placeholder={isForeign ? 'Category name' : '카테고리 이름'}
                        placeholderTextColor="#9ca3af"
                      />
                      {/* 색상 선택 */}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {PRESET_COLORS.map(c => (
                          <TouchableOpacity
                            key={c}
                            style={[
                              { width: 28, height: 28, borderRadius: 14, backgroundColor: c },
                              editColor === c && { borderWidth: 2.5, borderColor: '#374151' },
                            ]}
                            onPress={() => setEditColor(c)}
                            accessibilityLabel={c}
                          />
                        ))}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity
                          style={{ flex: 1, paddingVertical: 9, backgroundColor: '#f3f4f6', borderRadius: 8, alignItems: 'center' }}
                          onPress={() => setEditingId(null)}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#6b7280' }}>{isForeign ? 'Cancel' : '취소'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[{ flex: 1, paddingVertical: 9, backgroundColor: '#3b82f6', borderRadius: 8, alignItems: 'center' }, isSaving && { opacity: 0.5 }]}
                          onPress={handleSaveEdit}
                          disabled={isSaving}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>{isSaving ? (isForeign ? 'Saving...' : '저장 중...') : (isForeign ? 'Save' : '저장')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    // 카테고리 행
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#f3f4f6', borderRadius: 12 }}>
                      <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: cat.color, flexShrink: 0 }} />
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: '500', color: '#1f2937' }} numberOfLines={1}>{cat.name}</Text>
                      <TouchableOpacity
                        style={{ padding: 8 }}
                        onPress={() => { setEditingId(cat.id); setEditName(cat.name); setEditColor(cat.color); }}
                        accessibilityLabel={isForeign ? 'Edit' : '수정'}
                        accessibilityRole="button"
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="pencil-outline" size={17} color="#9ca3af" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ padding: 8 }}
                        onPress={() => handleDelete(cat)}
                        accessibilityLabel={isForeign ? 'Delete' : '삭제'}
                        accessibilityRole="button"
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                      >
                        <Ionicons name="trash-outline" size={17} color="#9ca3af" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>

            {/* 새 카테고리 추가 — 항상 하단에 고정 */}
            <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#f3f4f6', gap: 10, flexShrink: 0 }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#6b7280' }}>{isForeign ? 'Add New Category' : '새 카테고리 추가'}</Text>
              <TextInput
                style={styles.formInput}
                value={newName}
                onChangeText={setNewName}
                placeholder={isForeign ? 'Category name (e.g. Class Prep)' : '카테고리 이름 (예: 수업 준비)'}
                placeholderTextColor="#9ca3af"
                returnKeyType="done"
                onSubmitEditing={handleAdd}
              />
              {/* 색상 선택 */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {PRESET_COLORS.map(c => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      { width: 28, height: 28, borderRadius: 14, backgroundColor: c },
                      newColor === c && { borderWidth: 2.5, borderColor: '#374151' },
                    ]}
                    onPress={() => setNewColor(c)}
                    accessibilityLabel={c}
                  />
                ))}
              </View>
              {/* 미리보기 */}
              {newName.trim() !== '' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: `${newColor}18` }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: newColor }} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: newColor }}>{newName}</Text>
                </View>
              )}
              <TouchableOpacity
                style={[{ paddingVertical: 12, backgroundColor: '#3b82f6', borderRadius: 12, alignItems: 'center' }, (isAdding || !newName.trim()) && { opacity: 0.5 }]}
                onPress={handleAdd}
                disabled={isAdding || !newName.trim()}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>{isAdding ? (isForeign ? 'Adding...' : '추가 중...') : (isForeign ? 'Add Category' : '카테고리 추가')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// 업무 추가/수정 모달 컴포넌트
function TaskAddModal({
  visible,
  campCode,
  initialDate,
  editingTask,
  categories = [],
  onClose,
  onSuccess,
}: {
  visible: boolean;
  campCode: string;
  initialDate?: Date;
  editingTask?: Task | null;
  categories?: TaskCategory[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { userData: authUser } = useAuth();
  const isForeign = authUser?.role === 'foreign' || authUser?.role === 'foreign_temp';
  const isEdit = !!editingTask?.id;
  const isCopy = !!editingTask && !editingTask.id;
  
  // 타겟 역할 타입 (멘토용/원어민용)
  const [targetRoleType, setTargetRoleType] = useState<'mentor' | 'foreign'>('mentor');
  
  // 날짜 및 시간
  const [selectedDates, setSelectedDates] = useState<Date[]>([initialDate || new Date()]);
  const [loadingGroupDates, setLoadingGroupDates] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(initialDate || new Date());
  const [time, setTime] = useState('');
  const [hasTime, setHasTime] = useState(false);

  // 카테고리
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  
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

  // 모달이 열릴 때 초기화 또는 수정/복사 데이터 로드
  useEffect(() => {
    if (visible) {
      if (editingTask) {
        // 수정 또는 복사 모드: 기존 업무 데이터 로드
        setSelectedDates([editingTask.date.toDate()]);
        setCalendarMonth(editingTask.date.toDate());
        
        // 시간 설정
        if (editingTask.time) {
          setHasTime(true);
          setTime(editingTask.time);
        } else {
          setHasTime(false);
          setTime('');
        }
        
        // 역할 타입 설정
        const firstRole = editingTask.targetRoles[0];
        const isForeignRole = Array.from(FOREIGN_GROUP_ROLES).includes(firstRole as any);
        setTargetRoleType(isForeignRole ? 'foreign' : 'mentor');
        
        // 대상 역할 및 그룹 설정
        setTargetRoles(editingTask.targetRoles);
        setTargetGroups(editingTask.targetGroups || []);
        
        // 제목, 설명, 소요시간 설정
        setTitle(editingTask.title);
        setDescription(editingTask.description || '');
        setEstimatedDuration(editingTask.estimatedDuration ? String(editingTask.estimatedDuration.value) : '');
        
        // 첨부파일 설정
        setAttachments(editingTask.attachments || []);

        // 카테고리 설정
        setSelectedCategoryId(editingTask.categoryId ?? '');

        // 수정 모드이고 groupId가 있으면 그룹의 모든 날짜 로드
        if (isEdit && editingTask.groupId) {
          setLoadingGroupDates(true);
          getTasksByGroupId(editingTask.groupId)
            .then(groupTasks => {
              if (groupTasks.length > 0) {
                const groupDates = groupTasks.map(t => t.date.toDate());
                setSelectedDates(groupDates);
                setCalendarMonth(groupDates[0]);
              }
            })
            .catch(error => {
              logger.error('그룹 날짜 로드 오류:', error);
            })
            .finally(() => {
              setLoadingGroupDates(false);
            });
        }
      } else {
        // 추가 모드: 초기화
        if (initialDate) {
          setSelectedDates([initialDate]);
          setCalendarMonth(initialDate);
        }
        setHasTime(false);
        setTime('');
        setTargetRoleType('mentor');
        setTargetRoles([]);
        setTargetGroups([]);
        setTitle('');
        setDescription('');
        setEstimatedDuration('');
        setAttachments([]);
        setLinkLabel('');
        setLinkUrl('');
        setSelectedCategoryId('');
      }
    }
  }, [visible, editingTask, initialDate]);

  // roleOptions는 targetRoleType에 따라 동적으로 변경
  const getMentorRoles = (): JobExperienceGroupRole[] => Array.from(MENTOR_GROUP_ROLES);
  const getForeignRoles = (): JobExperienceGroupRole[] => Array.from(FOREIGN_GROUP_ROLES);
  const roleOptions = targetRoleType === 'mentor' ? getMentorRoles() : getForeignRoles();
  
  // 그룹 옵션
  const groupOptions: JobExperienceGroup[] = [...JOB_EXPERIENCE_GROUPS];

  // 날짜 선택/해제 핸들러
  const toggleDateSelection = (dateToToggle: Date) => {
    const dateStr = dateToToggle.toISOString().split('T')[0];
    const existingIndex = selectedDates.findIndex(
      d => d.toISOString().split('T')[0] === dateStr
    );

    if (existingIndex >= 0) {
      // 이미 선택된 경우 제거
      setSelectedDates(selectedDates.filter((_, i) => i !== existingIndex));
    } else {
      // 선택되지 않은 경우 추가
      setSelectedDates([...selectedDates, dateToToggle]);
    }
  };

  // 드래그 선택을 위한 state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartDate, setDragStartDate] = useState<Date | null>(null);

  // 드래그 시작
  const handlePressIn = (date: Date) => {
    setIsDragging(true);
    setDragStartDate(date);
    toggleDateSelection(date);
  };

  // 드래그 중
  const handleDragMove = (date: Date) => {
    if (!isDragging || !dragStartDate) return;
    
    const dateStr = date.toISOString().split('T')[0];
    const isAlreadySelected = selectedDates.some(
      d => d.toISOString().split('T')[0] === dateStr
    );
    
    if (!isAlreadySelected) {
      setSelectedDates([...selectedDates, date]);
    }
  };

  // 드래그 종료
  const handlePressOut = () => {
    setIsDragging(false);
    setDragStartDate(null);
  };

  // 달력 렌더링
  const renderCalendar = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    
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
      const dateStr = currentDate.toISOString().split('T')[0];
      const isSelected = selectedDates.some(
        d => d.toISOString().split('T')[0] === dateStr
      );
      const isToday = 
        today.getDate() === day && 
        today.getMonth() === month && 
        today.getFullYear() === year;
      const dayOfWeek = currentDate.getDay();
      const isSunday = dayOfWeek === 0;
      const isSaturday = dayOfWeek === 6;
      
      const isHolidayDate = isKoreanHoliday(currentDate);

      days.push(
        <View
          key={day}
          style={styles.modalCalendarDay}
          onStartShouldSetResponder={() => true}
          onResponderGrant={() => handlePressIn(currentDate)}
          onResponderMove={() => handleDragMove(currentDate)}
          onResponderRelease={handlePressOut}
        >
          <View
            style={[
              styles.modalCalendarDayInner,
              isSelected && styles.modalCalendarDaySelected,
              isToday && !isSelected && styles.modalCalendarDayToday,
            ]}
          >
            <Text
              style={[
                styles.modalCalendarDayText,
                (isSunday || isHolidayDate) && !isSelected && styles.calendarDayTextSundayHoliday,
                isSaturday && !isSelected && styles.calendarDayTextSaturday,
                isSelected && styles.calendarDayTextSelected,
                // 오늘이면서 일요일/공휴일이면 빨간색이 유지되어야 하므로 파란색 적용 안 함
                isToday && !isSelected && !(isSunday || isHolidayDate) && styles.calendarDayTextToday,
              ]}
            >
              {day}
            </Text>
          </View>
        </View>
      );
    }

    return days;
  };

  // 이미지 선택 핸들러
  const handlePickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert(isForeign ? 'Permission Required' : '권한 필요', isForeign ? 'Photo library access permission is required.' : '사진 라이브러리 접근 권한이 필요합니다.');
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
          Alert.alert(isForeign ? 'Success' : '성공', isForeign ? 'Image uploaded successfully.' : '이미지가 업로드되었습니다.');
        } catch (error) {
          logger.error('이미지 업로드 오류:', error);
          Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Failed to upload image.' : '이미지 업로드 중 오류가 발생했습니다.');
        } finally {
          setUploadingImage(false);
        }
      }
    } catch (error) {
      logger.error('이미지 선택 오류:', error);
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Failed to select image.' : '이미지 선택 중 오류가 발생했습니다.');
    }
  };

  const handleAddLink = () => {
    if (!linkLabel.trim() || !linkUrl.trim()) {
      Alert.alert(isForeign ? 'Notice' : '알림', isForeign ? 'Please enter both a link label and URL below before pressing the button.' : '아래 링크 정보를 입력한 후 버튼을 눌러주세요.');
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
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Please enter a task title.' : '업무 제목을 입력해주세요.');
      return;
    }

    if (targetRoles.length === 0) {
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Please select at least one target role.' : '대상 역할을 하나 이상 선택해주세요.');
      return;
    }

    if (targetGroups.length === 0) {
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Please select at least one target group.' : '대상 그룹을 하나 이상 선택해주세요.');
      return;
    }

    if (selectedDates.length === 0) {
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Please select at least one date.' : '날짜를 하나 이상 선택해주세요.');
      return;
    }

    // 시간 형식 검증 — 값이 있을 때만
    if (time) {
      const timePattern = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timePattern.test(time)) {
        Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'Please enter time in 24-hour format (e.g. 14:30)' : '시간을 24시간 형식으로 입력해주세요 (예: 14:30)');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const commonUpdates = {
        title: title.trim(),
        description: description.trim(),
        time: time || undefined,
        estimatedDuration:
          estimatedDuration && !isNaN(Number(estimatedDuration))
            ? { value: Number(estimatedDuration), unit: 'minutes' as const }
            : undefined,
        targetRoles,
        targetGroups,
        categoryId: selectedCategoryId || undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      };

      if (isEdit && editingTask) {
        if (editingTask.groupId) {
          // 그룹 수정: 날짜 변경 여부 확인
          const groupTasks = await getTasksByGroupId(editingTask.groupId);
          const originalDateStrs = new Set(
            groupTasks.map(t => {
              const d = t.date.toDate();
              return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            })
          );
          const newDateStrs = new Set(
            selectedDates.map(d => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
          );
          const datesChanged =
            originalDateStrs.size !== newDateStrs.size ||
            [...newDateStrs].some(s => !originalDateStrs.has(s));

          if (datesChanged) {
            await updateTaskGroup(campCode, editingTask.groupId, commonUpdates, selectedDates);
          } else {
            await updateTaskGroup(campCode, editingTask.groupId, commonUpdates);
          }
          Alert.alert(isForeign ? 'Success' : '성공', isForeign ? 'Group task has been updated.' : '그룹 업무가 수정되었습니다.');
        } else {
          // 그룹 없는 단일 Task 수정
          const localDate = new Date(
            selectedDates[0].getFullYear(),
            selectedDates[0].getMonth(),
            selectedDates[0].getDate(),
            0, 0, 0, 0
          );
          const taskData: Partial<Task> = {
            ...commonUpdates,
            date: Timestamp.fromDate(localDate),
          };
          await updateTask(editingTask.id, taskData);
          Alert.alert(isForeign ? 'Success' : '성공', isForeign ? 'Task has been updated.' : '업무가 수정되었습니다.');
        }
      } else {
        // 추가 모드: 날짜 2개 이상이면 공유 groupId 부여
        const newGroupId = selectedDates.length >= 2
          ? `group_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
          : undefined;

        for (const date of selectedDates) {
          const localDate = new Date(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            0, 0, 0, 0
          );

          const taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completions'> = {
            campCode,
            createdBy: '',
            ...commonUpdates,
            date: Timestamp.fromDate(localDate),
            ...(newGroupId ? { groupId: newGroupId } : {}),
          };

          await createTask(campCode, taskData, newGroupId);
        }

        Alert.alert(isForeign ? 'Success' : '성공', isForeign ? `${selectedDates.length} task(s) have been added.` : `${selectedDates.length}개의 업무가 추가되었습니다.`);
      }
      
      // 폼 초기화
      setTargetRoleType('mentor');
      setSelectedDates([new Date()]);
      setCalendarMonth(new Date());
      setTime('');
      setHasTime(false);
      setTargetRoles([]);
      setTargetGroups([]);
      setTitle('');
      setDescription('');
      setEstimatedDuration('');
      setAttachments([]);
      setSelectedCategoryId('');
      
      onSuccess();
    } catch (error) {
      logger.error('업무 처리 오류:', error);
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? `Failed to ${isEdit ? 'update' : 'add'} task.` : `업무 ${isEdit ? '수정' : '추가'} 중 오류가 발생했습니다.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
        >
          <View style={styles.addModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {isForeign
                  ? (isEdit ? 'Edit Task' : isCopy ? 'Copy Task' : 'Add New Task')
                  : (isEdit ? '업무 수정' : isCopy ? '업무 복사' : '새 업무 추가')}
              </Text>
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
              <Text style={styles.formLabel}>🎯 {isForeign ? 'Target (Mentor/Foreign)' : '업무 대상 선택 (멘토/원어민)'}</Text>
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
                    {isForeign ? 'Mentor' : '멘토용'}
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
                    {isForeign ? 'Foreign' : '원어민용'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 1. 날짜 및 시간 - 파란색 테두리 */}
            <View style={[styles.formGroup, styles.sectionBorderBlue]}>
              <Text style={styles.formLabel}>
                📅 {isForeign ? 'Date & Time' : '날짜 및 시간'} <Text style={styles.required}>*</Text>
              </Text>

              {/* 그룹 업무 안내 */}
              {isEdit && editingTask?.groupId && (
                <View style={styles.groupInfoBanner}>
                  <Text style={styles.groupInfoText}>
                    {isForeign
                      ? 'This is a grouped task. Changing dates will update all dates in the group.'
                      : '이 업무는 여러 날짜에 묶인 그룹 업무입니다. 날짜를 변경하면 그룹의 모든 날짜가 함께 변경됩니다.'}
                  </Text>
                </View>
              )}

              {/* 선택된 날짜 태그 목록 */}
              {!loadingGroupDates && selectedDates.length > 0 && (
                <View style={styles.selectedDateTagsContainer}>
                  {[...selectedDates]
                    .sort((a, b) => a.getTime() - b.getTime())
                    .map((d, idx) => (
                      <View key={idx} style={styles.selectedDateTag}>
                        <Text style={styles.selectedDateTagText}>
                          {d.getMonth() + 1}/{d.getDate()}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            if (selectedDates.length > 1) {
                              setSelectedDates(prev =>
                                prev.filter(
                                  existing =>
                                    !(
                                      existing.getFullYear() === d.getFullYear() &&
                                      existing.getMonth() === d.getMonth() &&
                                      existing.getDate() === d.getDate()
                                    )
                                )
                              );
                            }
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel={`${d.getMonth() + 1}월 ${d.getDate()}일 제거`}
                          accessibilityRole="button"
                        >
                          <Text style={styles.selectedDateTagRemove}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                </View>
              )}

              {/* 인라인 달력 - 항상 표시 */}
              <View style={styles.modalCalendarContainer}>
                {/* 월 네비게이션 */}
                <View style={styles.modalCalendarHeader}>
                  <TouchableOpacity
                    style={styles.modalCalendarNavButton}
                    onPress={() => {
                      const newDate = new Date(calendarMonth);
                      newDate.setMonth(calendarMonth.getMonth() - 1);
                      setCalendarMonth(newDate);
                    }}
                  >
                    <Ionicons name="chevron-back" size={20} color="#6b7280" />
                  </TouchableOpacity>
                  <Text style={styles.modalCalendarTitle}>
                    {isForeign
                      ? `${new Date(calendarMonth.getFullYear(), calendarMonth.getMonth()).toLocaleString('en-US', { month: 'long' })} ${calendarMonth.getFullYear()}`
                      : `${calendarMonth.getFullYear()}년 ${calendarMonth.getMonth() + 1}월`}
                  </Text>
                  <TouchableOpacity
                    style={styles.modalCalendarNavButton}
                    onPress={() => {
                      const newDate = new Date(calendarMonth);
                      newDate.setMonth(calendarMonth.getMonth() + 1);
                      setCalendarMonth(newDate);
                    }}
                  >
                    <Ionicons name="chevron-forward" size={20} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                {/* 요일 헤더 */}
                <View style={styles.modalCalendarWeekDays}>
                  {(isForeign ? DAYS_OF_WEEK_EN : DAYS_OF_WEEK_KO).map((day, i) => (
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
                <View style={[styles.modalCalendarGrid, loadingGroupDates && { opacity: 0.5 }]}>
                  {renderCalendar()}
                </View>
                {loadingGroupDates ? (
                  <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 4 }}>{isForeign ? 'Loading dates...' : '날짜 불러오는 중...'}</Text>
                ) : (
                  <Text style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 4 }}>{isForeign ? 'Tap or drag to select multiple dates' : '탭 또는 드래그로 여러 날짜를 선택할 수 있습니다'}</Text>
                )}
              </View>

              {/* 시간 지정 & 예상 소요시간 (선택) */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                {/* 시간 지정 */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#9ca3af', marginBottom: 5 }}>
                    🕐 {isForeign ? 'Set time (optional)' : '시간 지정 (선택)'}
                  </Text>
                  <TextInput
                    style={[styles.formInput, { marginBottom: 0 }]}
                    value={time}
                    onChangeText={val => {
                      setTime(val);
                      setHasTime(val.length > 0);
                    }}
                    placeholder={isForeign ? 'e.g. 14:30' : '예: 14:30'}
                    placeholderTextColor="#9ca3af"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                {/* 예상 소요시간 */}
                <View style={{ width: 100 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#9ca3af', marginBottom: 5 }}>
                    ⏱️ {isForeign ? 'Duration (optional)' : '소요시간 (선택)'}
                  </Text>
                  <View style={styles.durationContainer}>
                    <TextInput
                      style={[styles.formInput, styles.durationInput, { marginBottom: 0 }]}
                      value={estimatedDuration}
                      onChangeText={setEstimatedDuration}
                      placeholder="0"
                      placeholderTextColor="#9ca3af"
                      keyboardType="numeric"
                    />
                    <Text style={styles.durationUnitLabel}>{isForeign ? 'min' : '분'}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* 2. 카테고리 (선택) */}
            {categories.length > 0 && (
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>🏷️ {isForeign ? 'Category (optional)' : '카테고리 (선택)'}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <TouchableOpacity
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: selectedCategoryId === '' ? '#374151' : '#d1d5db',
                      backgroundColor: selectedCategoryId === '' ? '#374151' : '#fff',
                    }}
                    onPress={() => setSelectedCategoryId('')}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '600', color: selectedCategoryId === '' ? '#fff' : '#6b7280' }}>{isForeign ? 'None' : '없음'}</Text>
                  </TouchableOpacity>
                  {categories.map(cat => (
                    <TouchableOpacity
                      key={cat.id}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: selectedCategoryId === cat.id ? cat.color : `${cat.color}60`,
                        backgroundColor: selectedCategoryId === cat.id ? cat.color : `${cat.color}18`,
                      }}
                      onPress={() => setSelectedCategoryId(cat.id)}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '600', color: selectedCategoryId === cat.id ? '#fff' : cat.color }}>
                        {cat.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* 3. 대상 역할 */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>
                👥 {isForeign ? 'Target role' : '대상 역할'} <Text style={styles.required}>*</Text>
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
                🎯 {isForeign ? 'Target group' : '대상 그룹'} <Text style={styles.required}>*</Text>
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
                ✏️ {isForeign ? 'Task title' : '업무 제목'} <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.formInput}
                value={title}
                onChangeText={setTitle}
                placeholder={isForeign ? 'e.g. Check student list' : '예: 학생 명단 확인'}
                placeholderTextColor="#9ca3af"
              />
            </View>

            {/* 5. 업무 설명 */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>📝 {isForeign ? 'Description' : '업무 설명'}</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={description}
                onChangeText={setDescription}
                placeholder={isForeign ? 'Detailed description of the task' : '업무에 대한 상세 설명'}
                placeholderTextColor="#9ca3af"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* 6. 첨부파일 및 링크 */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>📎 {isForeign ? 'Attachments & Links' : '첨부파일 및 링크'}</Text>
              
              {/* 업로드 버튼들 */}
              <View style={styles.uploadButtonsContainer}>
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={handlePickImage}
                  disabled={uploadingImage}
                >
                  <Ionicons name="image-outline" size={16} color="#6b7280" />
                  <Text style={styles.uploadButtonText}>{isForeign ? 'Image' : '이미지'}</Text>
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
                  <Text style={[styles.uploadButtonText, styles.uploadButtonTextLink]}>{isForeign ? 'Link' : '링크'}</Text>
                </TouchableOpacity>
              </View>

              {uploadingImage && (
                <View style={styles.uploadingContainer}>
                  <ActivityIndicator size="small" color="#3b82f6" />
                  <Text style={styles.uploadingText}>{isForeign ? 'Uploading...' : '업로드 중...'}</Text>
                </View>
              )}

              {/* 링크 입력 필드 */}
              <View style={styles.linkInputContainer}>
                <TextInput
                  style={[styles.formInput, styles.linkInput]}
                  value={linkLabel}
                  onChangeText={setLinkLabel}
                  placeholder={isForeign ? 'Link label (e.g. Google Drive)' : '링크 이름 (예: 구글 드라이브)'}
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
              <Text style={styles.cancelModalButtonText}>{isForeign ? 'Cancel' : '취소'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitModalButton, isSubmitting && styles.submitModalButtonDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitModalButtonText}>
                  {isForeign
                    ? (isEdit ? 'Save' : isCopy ? 'Copy' : 'Add')
                    : (isEdit ? '수정하기' : isCopy ? '복사하기' : '추가하기')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
        </KeyboardAvoidingView>
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
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: 100,
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
    marginLeft: 4,
  },
  calendarTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    textAlign: 'left',
  },
  viewToggleButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    marginLeft: 8,
  },
  // 컴팩트 뷰 그리드
  compactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 0,
    paddingBottom: 6,
  },
  compactCell: {
    flexBasis: '14.285714%',
    flexGrow: 0,
    flexShrink: 0,
    alignItems: 'center',
    paddingVertical: 4,
  },
  // 큰 박스
  compactBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  compactBoxEmpty: {
    backgroundColor: '#e5e7eb',
  },
  compactBoxPending: {
    backgroundColor: '#e9ebee',
  },
  compactBoxCompleted: {
    backgroundColor: '#10b981',
  },
  compactBoxSelected: {
    backgroundColor: '#1d4ed8',
  },
  compactBoxTodaySelected: {
    backgroundColor: '#111827',
  },
  compactBoxNumber: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6b7280',
    lineHeight: 14,
  },
  compactBoxNumberSelected: {
    color: '#ffffff',
  },
  // 아주 작은 날짜 라벨
  compactDayLabel: {
    fontSize: 9,
    color: '#9ca3af',
    fontWeight: '400',
  },
  compactDayLabelToday: {
    color: '#111827',
    fontWeight: '700',
  },
  compactDayLabelTodaySunday: {
    color: '#ef4444',
    fontWeight: '700',
  },
  compactDayLabelWrapToday: {
    backgroundColor: '#e5e7eb',
  },
  compactDayLabelSelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  compactDayLabelSunday: {
    color: '#ef4444',
  },
  compactDayLabelSaturday: {
    color: '#60a5fa',
  },
  compactDayLabelWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  compactDayLabelWrapSelected: {
    backgroundColor: '#1d4ed8',
  },
  compactDayLabelWrapTodaySelected: {
    backgroundColor: '#111827',
  },
  compactDayLabelTodaySelected: {
    color: '#ffffff',
    fontWeight: '700',
  },
  // 풀 캘린더 컨테이너
  fullCalendarContainer: {
    backgroundColor: '#ffffff',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 8,
  },
  fullCalendarGrid: {
    paddingHorizontal: 0,
  },
  fullCalendarRow: {
    flexDirection: 'row',
  },
  fullCalendarCell: {
    flex: 1,
    minHeight: 72,
    paddingTop: 4,
    paddingHorizontal: 1,
    paddingBottom: 4,
    backgroundColor: '#ffffff',
  },
  fullCalendarCellSelected: {
    backgroundColor: '#ffffff',
  },
  fullCalendarCellToday: {
    backgroundColor: '#ffffff',
  },
  fullCalendarDayNum: {
    fontSize: 11,
    fontWeight: '500',
    color: '#374151',
    textAlign: 'center',
  },
  fullCalendarDayNumSelected: {
    color: '#1d4ed8',
    fontWeight: '700',
  },
  fullCalendarChip: {
    borderRadius: 2,
    paddingHorizontal: 2,
    paddingVertical: 0,
    marginBottom: 1,
  },
  fullCalendarChipText: {
    fontSize: 8,
    lineHeight: 11,
  },
  fullCalendarMore: {
    fontSize: 8,
    color: '#6b7280',
    paddingHorizontal: 3,
    marginTop: 1,
  },
  calendarContainer: {
    backgroundColor: '#ffffff',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 8,
  },
  weekDaysRow: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingHorizontal: 0,
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
  calendarDayTextSundayHoliday: {
    color: '#ef4444',
  },
  calendarDayTextSaturday: {
    color: '#3b82f6',
  },
  calendarDayTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },
  calendarDayTextToday: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  calendarDayTextTodayDark: {
    color: '#111827',
    fontWeight: '700',
  },
  calendarDayTextTodaySunday: {
    color: '#ef4444',
    fontWeight: '700',
  },
  fullCalendarDayNumWrap: {
    alignSelf: 'center',
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    marginBottom: 2,
  },
  fullCalendarDayNumWrapToday: {
    backgroundColor: '#e5e7eb',
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
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  taskTimeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#eff6ff',
    borderBottomWidth: 1,
    borderBottomColor: '#dbeafe',
  },
  taskTimeBannerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563eb',
  },
  taskTimeBannerDuration: {
    fontSize: 11,
    color: '#60a5fa',
  },
  taskTimeBannerPurple: {
    backgroundColor: '#faf5ff',
    borderBottomColor: '#e9d5ff',
  },
  taskTimeBannerTextPurple: {
    color: '#9333ea',
  },
  taskTimeBannerDurationPurple: {
    color: '#c084fc',
  },
  taskCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 12,
  },
  taskCheckbox: {
    marginTop: 4,
    padding: 4,
  },
  taskInfo: {
    flex: 1,
  },
  taskInfoWithAdmin: {
    flex: 1, // 1/3 정도
  },
  adminCompletionArea: {
    flex: 2, // 2/3 정도
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: '#e5e7eb',
  },
  adminCompletionNames: {
    gap: 4,
  },
  adminCompletionTextCompleted: {
    fontSize: 11,
    color: '#059669', // 초록색 (완료)
    lineHeight: 16,
  },
  adminCompletionTextIncomplete: {
    fontSize: 11,
    color: '#dc2626', // 빨강색 (미완료)
    lineHeight: 16,
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  keyboardAvoidingView: {
    maxWidth: 500,
    width: '100%',
    maxHeight: '90%',
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
  categoryFab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 4,
  },
  // 업무 추가 모달 스타일
  addModalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxHeight: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
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
  timeCheckbox: {
    width: 20,
    height: 20,
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
  groupInfoBanner: {
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  groupInfoText: {
    fontSize: 11,
    color: '#2563eb',
    lineHeight: 16,
  },
  selectedDateTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  selectedDateTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 3,
  },
  selectedDateTagText: {
    fontSize: 12,
    color: '#1d4ed8',
    fontWeight: '500',
  },
  selectedDateTagRemove: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
    lineHeight: 16,
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
  },
  modalCalendarWeekDayText: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },
  modalCalendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  modalCalendarDay: {
    width: `${100 / 7}%`,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCalendarDayInner: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
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

  // 풀 캘린더 바텀시트
  sheetOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
    justifyContent: 'flex-end',
    zIndex: 100,
  },
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: Dimensions.get('window').height * 0.88,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  sheetHandleArea: {
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'center',
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  sheetCount: {
    fontSize: 13,
    color: '#6b7280',
  },
  sheetScrollView: {
    maxHeight: Dimensions.get('window').height * 0.65,
  },
  sheetScrollContent: {
    paddingVertical: 8,
  },
  sheetScrollContentCard: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 20,
  },
  sheetEmpty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  sheetEmptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },

  // 바텀시트 업무 행
  sheetTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 12,
  },
  sheetTaskCheck: {
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTaskInfo: {
    flex: 1,
    gap: 4,
  },
  sheetTaskTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    lineHeight: 20,
  },
  sheetTaskTitleDone: {
    textDecorationLine: 'line-through',
    color: '#9ca3af',
  },
  sheetTaskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetTaskTime: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3b82f6',
  },
  sheetTaskRoles: {
    fontSize: 12,
    color: '#9ca3af',
    flex: 1,
  },
});
