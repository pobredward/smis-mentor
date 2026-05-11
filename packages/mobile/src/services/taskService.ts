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
  writeBatch,
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
  taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completions'>,
  groupId?: string
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

    if (groupId) {
      cleanedData.groupId = groupId;
    }
    
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
      
      // 둘 다 시간 없으면 생성일 오름차순
      return a.createdAt.toMillis() - b.createdAt.toMillis();
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
      // 둘 다 시간 없으면 생성일 오름차순
      return a.createdAt.toMillis() - b.createdAt.toMillis();
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

// 같은 groupId를 가진 업무 목록 조회
export const getTasksByGroupId = async (groupId: string): Promise<Task[]> => {
  try {
    const groupQuery = query(
      collection(db, TASKS_COLLECTION),
      where('groupId', '==', groupId)
    );
    const snapshot = await getDocs(groupQuery);
    const tasks = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as Task[];

    return tasks.sort((a, b) => a.date.toMillis() - b.date.toMillis());
  } catch (error) {
    logger.error('그룹 업무 목록 가져오기 오류:', error);
    throw error;
  }
};

// 그룹 업무 일괄 수정
// newDates가 없으면 내용만 일괄 업데이트, 있으면 기존 문서 삭제 후 새 날짜로 재생성
export const updateTaskGroup = async (
  campCode: string,
  groupId: string,
  updates: Partial<Omit<Task, 'id' | 'createdAt' | 'campCode' | 'date' | 'groupId' | 'completions'>>,
  newDates?: Date[]
): Promise<void> => {
  try {
    const groupTasks = await getTasksByGroupId(groupId);

    if (!newDates) {
      // 날짜 변경 없음: 모든 그룹 문서의 내용만 일괄 업데이트
      const batch = writeBatch(db);
      const cleanedUpdates: Record<string, any> = { updatedAt: serverTimestamp() };
      Object.entries(updates).forEach(([key, value]) => {
        if (value !== undefined) {
          cleanedUpdates[key] = value;
        }
      });

      groupTasks.forEach(task => {
        batch.update(doc(db, TASKS_COLLECTION, task.id), cleanedUpdates);
      });

      await batch.commit();
    } else {
      // 날짜 변경: 기존 그룹 문서 삭제 후 새 날짜로 재생성
      const batch = writeBatch(db);

      // 첨부파일이 있는 문서들의 Storage 파일 삭제 (병렬 처리)
      await Promise.all(
        groupTasks.map(async task => {
          if (task.attachments) {
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
          batch.delete(doc(db, TASKS_COLLECTION, task.id));
        })
      );

      await batch.commit();

      // 기존 Task에서 공통 필드 추출 (첫 번째 문서 기준)
      const baseTask = groupTasks[0];
      const baseData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completions' | 'date'> = {
        campCode,
        title: updates.title ?? baseTask.title,
        description: updates.description ?? baseTask.description,
        targetRoles: updates.targetRoles ?? baseTask.targetRoles,
        targetGroups: updates.targetGroups ?? baseTask.targetGroups,
        time: updates.time !== undefined ? updates.time : baseTask.time,
        estimatedDuration: updates.estimatedDuration !== undefined
          ? updates.estimatedDuration
          : baseTask.estimatedDuration,
        attachments: updates.attachments !== undefined
          ? updates.attachments
          : baseTask.attachments,
        groupId,
        createdBy: baseTask.createdBy,
      };

      // 새 날짜들로 재생성
      for (const date of newDates) {
        const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
        const cleanedData: Record<string, any> = {
          ...baseData,
          date: Timestamp.fromDate(localDate),
          completions: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        // undefined 값 제거
        Object.keys(cleanedData).forEach(key => {
          if (cleanedData[key] === undefined) {
            delete cleanedData[key];
          }
        });

        await addDoc(collection(db, TASKS_COLLECTION), cleanedData);
      }
    }
  } catch (error) {
    logger.error('그룹 업무 수정 오류:', error);
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

// 월별 업무가 있는 날짜 가져오기 (현재 사용자의 역할에 해당하는 업무만 포함)
export const getTaskDatesInMonth = async (
  campCode: string,
  year: number,
  month: number,
  groupRole: JobExperienceGroupRole | null,
  isAdmin: boolean
): Promise<Set<string>> => {
  try {
    const allTasks = await getTasksByCampCode(campCode);
    
    const dates = new Set<string>();

    allTasks.forEach(task => {
      const taskDate = new Date(task.date.toDate());
      if (taskDate.getFullYear() !== year || taskDate.getMonth() !== month) return;

      // admin은 모든 업무 날짜 표시, 일반 사용자는 자신의 역할이 포함된 업무만 표시
      if (!isAdmin) {
        if (!groupRole || !task.targetRoles.includes(groupRole)) return;
      }

      const y = taskDate.getFullYear();
      const m = String(taskDate.getMonth() + 1).padStart(2, '0');
      const d = String(taskDate.getDate()).padStart(2, '0');
      dates.add(`${y}-${m}-${d}`);
    });

    return dates;
  } catch (error) {
    logger.error('월별 업무 날짜 가져오기 오류:', error);
    throw error;
  }
};
