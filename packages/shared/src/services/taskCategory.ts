/**
 * 업무 카테고리 (관리자가 캠프별로 등록) — web·mobile 공용. 각 앱은 자기 db 로 한 번 만들어 쓴다.
 *   export const { getTaskCategories, ... } = createTaskCategoryService(db);
 */
import { type Firestore, collection, doc, query, where, getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import type { TaskCategory } from '../types/camp';
import { logger } from '../utils/logger';

const COLLECTION = 'taskCategories';

export function createTaskCategoryService(db: Firestore) {
  /** 캠프별 카테고리 전체 (클라이언트 정렬 — 복합 인덱스 불필요) */
  const getTaskCategories = async (campCode: string): Promise<TaskCategory[]> => {
    try {
      const snapshot = await getDocs(query(collection(db, COLLECTION), where('campCode', '==', campCode)));
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as TaskCategory);
      return list.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
    } catch (error) {
      logger.error('카테고리 조회 오류:', error);
      throw error;
    }
  };

  const createTaskCategory = async (campCode: string, data: { name: string; color: string; createdBy: string }): Promise<string> => {
    try {
      const docRef = await addDoc(collection(db, COLLECTION), {
        campCode,
        name: data.name.trim(),
        color: data.color,
        createdBy: data.createdBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return docRef.id;
    } catch (error) {
      logger.error('카테고리 생성 오류:', error);
      throw error;
    }
  };

  const updateTaskCategory = async (categoryId: string, data: { name?: string; color?: string }): Promise<void> => {
    try {
      const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (data.name !== undefined) updates.name = data.name.trim();
      if (data.color !== undefined) updates.color = data.color;
      await updateDoc(doc(db, COLLECTION, categoryId), updates);
    } catch (error) {
      logger.error('카테고리 수정 오류:', error);
      throw error;
    }
  };

  const deleteTaskCategory = async (categoryId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, COLLECTION, categoryId));
    } catch (error) {
      logger.error('카테고리 삭제 오류:', error);
      throw error;
    }
  };

  return { getTaskCategories, createTaskCategory, updateTaskCategory, deleteTaskCategory };
}
