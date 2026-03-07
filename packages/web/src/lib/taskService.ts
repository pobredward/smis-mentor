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
import { db, storage } from './firebase';
import type { Task, TaskAttachment, JobExperienceGroupRole } from '@smis-mentor/shared/types/camp';

const TASKS_COLLECTION = 'campTasks';

// Task 생성
export const createTask = async (
  campCode: string,
  taskData: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'completions'>
): Promise<string> => {
  try {
    // 날짜를 로컬 타임존의 자정으로 설정
    const localDate = new Date(taskData.date.toDate());
    localDate.setHours(0, 0, 0, 0);
    
    const docRef = await addDoc(collection(db, TASKS_COLLECTION), {
      ...taskData,
      date: Timestamp.fromDate(localDate),
      campCode,
      completions: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return docRef.id;
  } catch (error) {
    console.error('업무 생성 오류:', error);
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
    console.error('업무 목록 가져오기 오류:', error);
    throw error;
  }
};

// 특정 날짜의 업무 목록 가져오기
export const getTasksByDate = async (
  campCode: string,
  date: Date
): Promise<Task[]> => {
  try {
    // 모든 업무를 가져와서 클라이언트에서 필터링
    const allTasks = await getTasksByCampCode(campCode);
    
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    const targetTime = targetDate.getTime();
    
    const filtered = allTasks.filter(task => {
      const taskDate = new Date(task.date.toDate());
      taskDate.setHours(0, 0, 0, 0);
      return taskDate.getTime() === targetTime;
    });

    console.log('날짜별 업무 필터링:', {
      targetDate: targetDate.toISOString(),
      totalTasks: allTasks.length,
      filteredTasks: filtered.length,
      allTaskDates: allTasks.map(t => new Date(t.date.toDate()).toISOString())
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
    console.error('날짜별 업무 가져오기 오류:', error);
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
    console.error('업무 상세 가져오기 오류:', error);
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
    console.error('업무 수정 오류:', error);
    throw error;
  }
};

// 업무 삭제
export const deleteTask = async (taskId: string): Promise<void> => {
  try {
    // 첨부파일도 함께 삭제
    const task = await getTaskById(taskId);
    if (task?.attachments) {
      for (const attachment of task.attachments) {
        if (attachment.type === 'image' || attachment.type === 'file') {
          try {
            const fileRef = ref(storage, attachment.url);
            await deleteObject(fileRef);
          } catch (err) {
            console.warn('첨부파일 삭제 실패:', err);
          }
        }
      }
    }

    const docRef = doc(db, TASKS_COLLECTION, taskId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('업무 삭제 오류:', error);
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
      // 완료 취소
      await updateDoc(doc(db, TASKS_COLLECTION, taskId), {
        completions: task.completions.filter(c => c.userId !== userId),
        updatedAt: serverTimestamp(),
      });
    } else {
      // 완료 처리
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
    console.error('업무 완료 토글 오류:', error);
    throw error;
  }
};

// 이미지 업로드
export const uploadTaskImage = async (
  taskId: string,
  file: File
): Promise<TaskAttachment> => {
  try {
    const fileName = `${Date.now()}_${file.name}`;
    const storageRef = ref(storage, `tasks/${taskId}/${fileName}`);
    
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    // 썸네일 생성
    const thumbnail = await generateThumbnail(file);

    return {
      type: 'image',
      url,
      label: file.name,
      thumbnail,
    };
  } catch (error) {
    console.error('이미지 업로드 오류:', error);
    throw error;
  }
};

// 파일 업로드
export const uploadTaskFile = async (
  taskId: string,
  file: File
): Promise<TaskAttachment> => {
  try {
    const fileName = `${Date.now()}_${file.name}`;
    const storageRef = ref(storage, `tasks/${taskId}/${fileName}`);
    
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    return {
      type: 'file',
      url,
      label: file.name,
    };
  } catch (error) {
    console.error('파일 업로드 오류:', error);
    throw error;
  }
};

// 썸네일 생성 헬퍼 함수
const generateThumbnail = async (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        const MAX_SIZE = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
    // 모든 업무를 가져와서 클라이언트에서 필터링
    const allTasks = await getTasksByCampCode(campCode);
    
    const dates = new Set<string>();

    allTasks.forEach(task => {
      const taskDate = new Date(task.date.toDate());
      // 로컬 타임존으로 날짜 비교
      if (taskDate.getFullYear() === year && taskDate.getMonth() === month) {
        // YYYY-MM-DD 형식으로 저장 (로컬 타임존 기준)
        const year = taskDate.getFullYear();
        const month = String(taskDate.getMonth() + 1).padStart(2, '0');
        const day = String(taskDate.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        dates.add(dateStr);
      }
    });

    return dates;
  } catch (error) {
    console.error('월별 업무 날짜 가져오기 오류:', error);
    throw error;
  }
};
