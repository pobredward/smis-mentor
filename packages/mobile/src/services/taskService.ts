import { logger } from '@smis-mentor/shared';
import {
  collection,
  doc,
  query,
  where,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import type { Task, TaskAttachment, JobExperienceGroupRole } from '../../../shared/src/types/camp';

const TASKS_COLLECTION = 'campTasks';

// 이미지 URL을 최적화된 버전으로 변환 (Firebase Storage의 경우)
export const getOptimizedImageUrl = (url: string, width: number = 400): string => {
  // Firebase Storage URL인 경우 리사이징 파라미터 추가
  if (url.includes('firebasestorage.googleapis.com')) {
    // 이미 파라미터가 있는지 확인
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}width=${width}`;
  }
  return url;
};

// Task 생성
export const createTask = async (
  campCode: string,
  taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completions'>
): Promise<string> => {
  try {
    // 날짜를 로컬 타임존의 자정으로 설정
    const localDate = new Date(taskData.date.toDate());
    localDate.setHours(0, 0, 0, 0);
    
    // undefined 값 제거 (Firestore는 undefined를 허용하지 않음)
    const cleanedData: Record<string, any> = {
      campCode,
      date: Timestamp.fromDate(localDate),
      completions: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    
    // taskData의 나머지 필드들을 추가 (undefined가 아닌 것만)
    Object.entries(taskData).forEach(([key, value]) => {
      if (value !== undefined && key !== 'date') {
        cleanedData[key] = value;
      }
    });
    
    const docRef = await addDoc(collection(db, TASKS_COLLECTION), cleanedData);

    return docRef.id;
  } catch (error) {
    logger.error('업무 생성 오류:', error);
    throw error;
  }
};

// 캠프 코드별 업무 목록 가져오기
export const getTasksByCampCode = async (campCode: string): Promise<Task[]> => {
  try {
    const tasksQuery = query(
      collection(db, TASKS_COLLECTION),
      where('campCode', '==', campCode)
    );

    const snapshot = await getDocs(tasksQuery);
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as Task[];

    // 클라이언트에서 날짜 및 시간으로 정렬
    return tasks.sort((a, b) => {
      // 먼저 날짜로 정렬
      const dateA = a.date.toMillis();
      const dateB = b.date.toMillis();
      
      if (dateA !== dateB) {
        return dateA - dateB;
      }
      
      // 같은 날짜면 시간으로 정렬
      if (a.time && b.time) {
        return a.time.localeCompare(b.time);
      }
      
      // 시간이 있는 것이 우선
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      
      return 0;
    });
  } catch (error) {
    logger.error('업무 목록 가져오기 오류:', error);
    throw error;
  }
};

// 특정 날짜의 업무 목록 가져오기
export const getTasksByDate = async (
  campCode: string,
  date: Date
): Promise<Task[]> => {
  try {
    const allTasks = await getTasksByCampCode(campCode);
    
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const targetTime = targetDate.getTime();
    
    const filtered = allTasks.filter(task => {
      const taskDate = new Date(task.date.toDate());
      taskDate.setHours(0, 0, 0, 0);
      return taskDate.getTime() === targetTime;
    });

    // 시간 순으로 정렬
    return filtered.sort((a, b) => {
      if (a.time && b.time) {
        return a.time.localeCompare(b.time);
      }
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      return 0;
    });
  } catch (error) {
    logger.error('날짜별 업무 가져오기 오류:', error);
    throw error;
  }
};

// 업무 상세 가져오기
export const getTaskById = async (taskId: string): Promise<Task | null> => {
  try {
    const docRef = doc(db, TASKS_COLLECTION, taskId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return null;
    }

    return {
      id: docSnap.id,
      ...docSnap.data(),
    } as Task;
  } catch (error) {
    logger.error('업무 상세 가져오기 오류:', error);
    throw error;
  }
};

// 업무 수정
export const updateTask = async (
  taskId: string,
  updates: Partial<Omit<Task, 'id' | 'createdAt' | 'campCode'>>
): Promise<void> => {
  try {
    const docRef = doc(db, TASKS_COLLECTION, taskId);
    
    // undefined 값 제거
    const cleanedUpdates: Record<string, any> = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        cleanedUpdates[key] = value;
      }
    });
    
    await updateDoc(docRef, {
      ...cleanedUpdates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logger.error('업무 수정 오류:', error);
    throw error;
  }
};

// 업무 삭제
export const deleteTask = async (taskId: string): Promise<void> => {
  try {
    const task = await getTaskById(taskId);
    if (task?.attachments) {
      for (const attachment of task.attachments) {
        if (attachment.type === 'image' || attachment.type === 'file') {
          try {
            const fileRef = ref(storage, attachment.url);
            await deleteObject(fileRef);
          } catch (err) {
            logger.warn('첨부파일 삭제 실패:', err);
          }
        }
      }
    }

    const docRef = doc(db, TASKS_COLLECTION, taskId);
    await deleteDoc(docRef);
  } catch (error) {
    logger.error('업무 삭제 오류:', error);
    throw error;
  }
};

// 업무 완료 토글
export const toggleTaskCompletion = async (
  taskId: string,
  userId: string,
  userName: string,
  userRole: JobExperienceGroupRole
): Promise<void> => {
  try {
    const task = await getTaskById(taskId);
    if (!task) {
      throw new Error('업무를 찾을 수 없습니다.');
    }

    const isCompleted = task.completions.some(c => c.userId === userId);

    if (isCompleted) {
      await updateDoc(doc(db, TASKS_COLLECTION, taskId), {
        completions: task.completions.filter(c => c.userId !== userId),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, TASKS_COLLECTION, taskId), {
        completions: [
          ...task.completions,
          {
            userId,
            userName,
            userRole,
            completedAt: Timestamp.now(),
          },
        ],
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    logger.error('업무 완료 토글 오류:', error);
    throw error;
  }
};

// 이미지 업로드
export const uploadTaskImage = async (
  taskId: string,
  uri: string,
  fileName: string
): Promise<TaskAttachment> => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    
    const storageName = `${Date.now()}_${fileName}`;
    const storageRef = ref(storage, `tasks/${taskId}/${storageName}`);
    
    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);

    return {
      type: 'image',
      url,
      label: fileName,
    };
  } catch (error) {
    logger.error('이미지 업로드 오류:', error);
    throw error;
  }
};

// 파일 업로드
export const uploadTaskFile = async (
  taskId: string,
  uri: string,
  fileName: string
): Promise<TaskAttachment> => {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    
    const storageName = `${Date.now()}_${fileName}`;
    const storageRef = ref(storage, `tasks/${taskId}/${storageName}`);
    
    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);

    return {
      type: 'file',
      url,
      label: fileName,
    };
  } catch (error) {
    logger.error('파일 업로드 오류:', error);
    throw error;
  }
};

// 유틸리티: 날짜 포맷팅
export const formatDate = (date: Timestamp): string => {
  return date.toDate().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
};

// 유틸리티: 시간 포맷팅
export const formatTime = (time?: string): string | null => {
  if (!time) return null;
  
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? '오후' : '오전';
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  
  return `${ampm} ${displayHour}:${minutes}`;
};

// 유틸리티: 소요 시간 표시
export const formatDuration = (duration?: { value: number; unit: 'minutes' | 'hours' }): string | null => {
  if (!duration) return null;
  const unitText = duration.unit === 'minutes' ? '분' : '시간';
  return `${duration.value}${unitText}`;
};

// 월별 업무가 있는 날짜 가져오기
export const getTaskDatesInMonth = async (
  campCode: string,
  year: number,
  month: number
): Promise<Set<string>> => {
  try {
    const allTasks = await getTasksByCampCode(campCode);
    
    const dates = new Set<string>();

    allTasks.forEach(task => {
      const taskDate = new Date(task.date.toDate());
      if (taskDate.getFullYear() === year && taskDate.getMonth() === month) {
        const year = taskDate.getFullYear();
        const month = String(taskDate.getMonth() + 1).padStart(2, '0');
        const day = String(taskDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        dates.add(dateStr);
      }
    });

    return dates;
  } catch (error) {
    logger.error('월별 업무 날짜 가져오기 오류:', error);
    throw error;
  }
};
