import { logger } from '@smis-mentor/shared';
import {
  collection,
  doc,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { TaskCategory } from '@smis-mentor/shared';

const COLLECTION = 'taskCategories';

// 캠프별 카테고리 전체 조회 (클라이언트 정렬로 복합 인덱스 불필요)
export const getTaskCategories = async (campCode: string): Promise<TaskCategory[]> => {
  try {
    const q = query(
      collection(db, COLLECTION),
      where('campCode', '==', campCode)
    );
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as TaskCategory);
    // createdAt 기준 오름차순 정렬
    return list.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() ?? 0;
      const tb = b.createdAt?.toMillis?.() ?? 0;
      return ta - tb;
    });
  } catch (error) {
    logger.error('카테고리 조회 오류:', error);
    throw error;
  }
};

// 카테고리 생성
export const createTaskCategory = async (
  campCode: string,
  data: { name: string; color: string; createdBy: string }
): Promise<string> => {
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

// 카테고리 수정
export const updateTaskCategory = async (
  categoryId: string,
  data: { name?: string; color?: string }
): Promise<void> => {
  try {
    const docRef = doc(db, COLLECTION, categoryId);
    const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.color !== undefined) updates.color = data.color;
    await updateDoc(docRef, updates);
  } catch (error) {
    logger.error('카테고리 수정 오류:', error);
    throw error;
  }
};

// 카테고리 삭제
export const deleteTaskCategory = async (categoryId: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, COLLECTION, categoryId));
  } catch (error) {
    logger.error('카테고리 삭제 오류:', error);
    throw error;
  }
};
