import { logger } from '@smis-mentor/shared';
import {
  collection,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import type { PersonalTask } from '@smis-mentor/shared';

const PERSONAL_TASKS_COLLECTION = 'personalTasks';

// UUID 생성 (crypto.randomUUID 미지원 환경 대비)
function generateGroupId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 개인 업무 생성
// 날짜 수에 관계없이 항상 groupId를 생성하여 추후 날짜 추가/변경이 가능하도록 함
export const createPersonalTask = async (
  ownerId: string,
  campCode: string,
  taskData: {
    title: string;
    description: string;
    dates: Date[];
    time?: string;
    estimatedDuration?: { value: number; unit: 'minutes' };
    categoryId?: string;
  }
): Promise<string[]> => {
  try {
    const ids: string[] = [];
    const groupId = generateGroupId();

    for (const date of taskData.dates) {
      const localDate = new Date(date);
      localDate.setHours(0, 0, 0, 0);

      const data: Record<string, unknown> = {
        ownerId,
        campCode,
        groupId,
        title: taskData.title.trim(),
        description: taskData.description.trim(),
        date: Timestamp.fromDate(localDate),
        isCompleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (taskData.time) data.time = taskData.time;
      if (taskData.estimatedDuration) data.estimatedDuration = taskData.estimatedDuration;
      if (taskData.categoryId) data.categoryId = taskData.categoryId;

      const docRef = await addDoc(collection(db, PERSONAL_TASKS_COLLECTION), data);
      ids.push(docRef.id);
    }

    return ids;
  } catch (error) {
    logger.error('개인 업무 생성 오류:', error);
    throw error;
  }
};

// 특정 날짜의 개인 업무 목록 가져오기
export const getPersonalTasksByDate = async (
  ownerId: string,
  campCode: string,
  date: Date
): Promise<PersonalTask[]> => {
  try {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, PERSONAL_TASKS_COLLECTION),
      where('ownerId', '==', ownerId),
      where('campCode', '==', campCode),
      where('date', '>=', Timestamp.fromDate(dayStart)),
      where('date', '<=', Timestamp.fromDate(dayEnd)),
      orderBy('date', 'asc')
    );

    const snapshot = await getDocs(q);
    const tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as PersonalTask[];

    return tasks.sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time && !b.time) return -1;
      if (!a.time && b.time) return 1;
      return a.createdAt.toMillis() - b.createdAt.toMillis();
    });
  } catch (error) {
    logger.error('개인 업무 날짜별 가져오기 오류:', error);
    throw error;
  }
};

// 월별 날짜별 개인 업무 개수 Map 가져오기 (달력 숫자 표시용)
export const getPersonalTaskDatesInMonth = async (
  ownerId: string,
  campCode: string,
  year: number,
  month: number
): Promise<Map<string, number>> => {
  try {
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const q = query(
      collection(db, PERSONAL_TASKS_COLLECTION),
      where('ownerId', '==', ownerId),
      where('campCode', '==', campCode),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd)),
      orderBy('date', 'asc')
    );

    const snapshot = await getDocs(q);
    const dates = new Map<string, number>();

    snapshot.docs.forEach(d => {
      const task = d.data() as Omit<PersonalTask, 'id'>;
      const taskDate = task.date.toDate();
      const y = taskDate.getFullYear();
      const m = String(taskDate.getMonth() + 1).padStart(2, '0');
      const day = String(taskDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      dates.set(dateStr, (dates.get(dateStr) ?? 0) + 1);
    });

    return dates;
  } catch (error) {
    logger.error('개인 업무 월별 날짜 가져오기 오류:', error);
    throw error;
  }
};

// 월별 개인 업무를 날짜별 Map으로 가져오기 (풀 캘린더 칩 표시용)
export const getPersonalTasksInMonth = async (
  ownerId: string,
  campCode: string,
  year: number,
  month: number
): Promise<Map<string, PersonalTask[]>> => {
  try {
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const q = query(
      collection(db, PERSONAL_TASKS_COLLECTION),
      where('ownerId', '==', ownerId),
      where('campCode', '==', campCode),
      where('date', '>=', Timestamp.fromDate(monthStart)),
      where('date', '<=', Timestamp.fromDate(monthEnd)),
      orderBy('date', 'asc')
    );

    const snapshot = await getDocs(q);
    const taskMap = new Map<string, PersonalTask[]>();

    snapshot.docs.forEach(d => {
      const task = { id: d.id, ...d.data() } as PersonalTask;
      const taskDate = task.date.toDate();
      const y = taskDate.getFullYear();
      const m = String(taskDate.getMonth() + 1).padStart(2, '0');
      const day = String(taskDate.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      const existing = taskMap.get(dateStr) ?? [];
      existing.push(task);
      taskMap.set(dateStr, existing);
    });

    return taskMap;
  } catch (error) {
    logger.error('개인 업무 월별 Map 가져오기 오류:', error);
    throw error;
  }
};

// 같은 groupId를 가진 개인 업무 목록 조회
export const getPersonalTasksByGroupId = async (groupId: string): Promise<PersonalTask[]> => {
  try {
    const q = query(
      collection(db, PERSONAL_TASKS_COLLECTION),
      where('groupId', '==', groupId)
    );
    const snapshot = await getDocs(q);
    const tasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as PersonalTask[];
    return tasks.sort((a, b) => a.date.toMillis() - b.date.toMillis());
  } catch (error) {
    logger.error('개인 업무 그룹 조회 오류:', error);
    throw error;
  }
};

// 단일 개인 업무 조회
export const getPersonalTaskById = async (taskId: string): Promise<PersonalTask | null> => {
  try {
    const docSnap = await getDoc(doc(db, PERSONAL_TASKS_COLLECTION, taskId));
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...docSnap.data() } as PersonalTask;
  } catch (error) {
    logger.error('개인 업무 단일 조회 오류:', error);
    throw error;
  }
};

// 개인 업무 단일 수정
export const updatePersonalTask = async (
  taskId: string,
  updates: {
    title?: string;
    description?: string;
    date?: Date;
    time?: string | null;
    estimatedDuration?: { value: number; unit: 'minutes' } | null;
    categoryId?: string | null;
  }
): Promise<void> => {
  try {
    const docRef = doc(db, PERSONAL_TASKS_COLLECTION, taskId);
    const cleanedUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };

    if (updates.title !== undefined) cleanedUpdates.title = updates.title.trim();
    if (updates.description !== undefined) cleanedUpdates.description = updates.description.trim();
    if (updates.date !== undefined) {
      const localDate = new Date(updates.date);
      localDate.setHours(0, 0, 0, 0);
      cleanedUpdates.date = Timestamp.fromDate(localDate);
    }
    if (updates.time !== undefined) cleanedUpdates.time = updates.time ?? '';
    if ('estimatedDuration' in updates) {
      cleanedUpdates.estimatedDuration = updates.estimatedDuration ?? '';
    }
    if ('categoryId' in updates) {
      cleanedUpdates.categoryId = updates.categoryId ?? '';
    }

    await updateDoc(docRef, cleanedUpdates);
  } catch (error) {
    logger.error('개인 업무 수정 오류:', error);
    throw error;
  }
};

// 그룹 개인 업무 일괄 수정
// newDates가 없으면 내용만 일괄 업데이트, 있으면 기존 문서 삭제 후 새 날짜로 재생성
export const updatePersonalTaskGroup = async (
  groupId: string,
  ownerId: string,
  campCode: string,
  updates: {
    title?: string;
    description?: string;
    time?: string | null;
    estimatedDuration?: { value: number; unit: 'minutes' } | null;
    categoryId?: string | null;
  },
  newDates?: Date[]
): Promise<void> => {
  try {
    const groupTasks = await getPersonalTasksByGroupId(groupId);

    if (!newDates) {
      const batch = writeBatch(db);
      const cleanedUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };

      if (updates.title !== undefined) cleanedUpdates.title = updates.title.trim();
      if (updates.description !== undefined) cleanedUpdates.description = updates.description.trim();
      if (updates.time !== undefined) cleanedUpdates.time = updates.time ?? '';
      if ('estimatedDuration' in updates) {
        cleanedUpdates.estimatedDuration = updates.estimatedDuration ?? '';
      }
      if ('categoryId' in updates) {
        cleanedUpdates.categoryId = updates.categoryId ?? '';
      }

      groupTasks.forEach(task => {
        batch.update(doc(db, PERSONAL_TASKS_COLLECTION, task.id), cleanedUpdates);
      });

      await batch.commit();
    } else {
      const batch = writeBatch(db);
      groupTasks.forEach(task => {
        batch.delete(doc(db, PERSONAL_TASKS_COLLECTION, task.id));
      });
      await batch.commit();

      const baseTask = groupTasks[0];
      const resolvedTime = updates.time !== undefined
        ? (updates.time === null ? undefined : updates.time)
        : baseTask.time;
      const resolvedDuration = 'estimatedDuration' in updates
        ? (updates.estimatedDuration === null ? undefined : updates.estimatedDuration)
        : baseTask.estimatedDuration;
      const resolvedCategoryId = 'categoryId' in updates
        ? (updates.categoryId === null ? undefined : updates.categoryId)
        : baseTask.categoryId;

      for (const date of newDates) {
        const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
        const data: Record<string, unknown> = {
          ownerId,
          campCode,
          groupId,
          title: updates.title?.trim() ?? baseTask.title,
          description: updates.description?.trim() ?? baseTask.description,
          date: Timestamp.fromDate(localDate),
          isCompleted: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if (resolvedTime) data.time = resolvedTime;
        if (resolvedDuration) data.estimatedDuration = resolvedDuration;
        if (resolvedCategoryId) data.categoryId = resolvedCategoryId;

        await addDoc(collection(db, PERSONAL_TASKS_COLLECTION), data);
      }
    }
  } catch (error) {
    logger.error('개인 업무 그룹 수정 오류:', error);
    throw error;
  }
};

// 그룹 개인 업무 전체 삭제
export const deletePersonalTaskGroup = async (groupId: string): Promise<void> => {
  try {
    const groupTasks = await getPersonalTasksByGroupId(groupId);
    const batch = writeBatch(db);
    groupTasks.forEach(task => {
      batch.delete(doc(db, PERSONAL_TASKS_COLLECTION, task.id));
    });
    await batch.commit();
  } catch (error) {
    logger.error('개인 업무 그룹 삭제 오류:', error);
    throw error;
  }
};

// 개인 업무 삭제
export const deletePersonalTask = async (taskId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, PERSONAL_TASKS_COLLECTION, taskId));
  } catch (error) {
    logger.error('개인 업무 삭제 오류:', error);
    throw error;
  }
};

// 개인 업무 완료 토글
export const togglePersonalTaskCompletion = async (taskId: string, currentState: boolean): Promise<void> => {
  try {
    await updateDoc(doc(db, PERSONAL_TASKS_COLLECTION, taskId), {
      isCompleted: !currentState,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    logger.error('개인 업무 완료 토글 오류:', error);
    throw error;
  }
};
