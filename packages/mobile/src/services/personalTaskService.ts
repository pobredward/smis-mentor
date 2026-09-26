import { createPersonalTaskService } from '@smis-mentor/shared';
import { db, auth } from '../config/firebase';

/** 개인 업무 — 구현은 shared (web 과 같은 코드) */
export const {
  createPersonalTask,
  getOverduePersonalTasks,
  getPersonalTasksByDate,
  getPersonalTaskDatesInMonth,
  getPersonalTasksInMonth,
  getPersonalTasksByGroupId,
  updatePersonalTask,
  updatePersonalTaskGroup,
  deletePersonalTaskGroup,
  getPersonalTaskById,
  deletePersonalTask,
  togglePersonalTaskCompletion,
} = createPersonalTaskService(db, auth);
