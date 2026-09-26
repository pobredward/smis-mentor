import { createCampTaskService, logger } from '@smis-mentor/shared';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import type { TaskAttachment } from '@smis-mentor/shared';

/** 캠프 업무 조회·완료 — 구현은 shared (mobile 와 같은 코드). 첨부 업로드만 플랫폼별로 여기에 둔다. */
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
    logger.error('이미지 업로드 오류:', error);
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
    logger.error('파일 업로드 오류:', error);
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
