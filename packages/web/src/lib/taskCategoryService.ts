import { createTaskCategoryService } from '@smis-mentor/shared';
import { db } from './firebase';

/** 업무 카테고리 — 구현은 shared (mobile 과 같은 코드) */
export const { getTaskCategories, createTaskCategory, updateTaskCategory, deleteTaskCategory } = createTaskCategoryService(db);
