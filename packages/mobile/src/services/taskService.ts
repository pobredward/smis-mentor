import { createCampTaskService, logger } from '@smis-mentor/shared';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/firebase';
import type { TaskAttachment } from '@smis-mentor/shared';

/** 캠프 업무 조회·완료 — 구현은 shared (web 과 같은 코드). 첨부 업로드만 플랫폼별로 여기에 둔다. */
export const {
  createTask,
  getTasksByCampCode,
  getTasksByDate,
  getTaskById,
  updateTask,
  getTasksByGroupId,
  updateTaskGroup,
  deleteTask,
  toggleTaskCompletion,
  getTasksInMonth,
  getTaskDatesInMonth,
} = createCampTaskService(db, storage);

export {
  formatTaskDate as formatDate,
  formatTaskTime as formatTime,
  formatTaskDuration as formatDuration,
} from '@smis-mentor/shared';

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
