/**
 * 업무 생성 · 수정 · 삭제 · 독촉 — 서버 API 경유 (관리자 · 부매니저 공용)
 * 권한 · 날짜 · 첨부 정리는 서버(lib/taskServer.ts)가 한다.
 */
import { authenticatedPost } from './apiClient';
import type { TaskSavePayload, TaskRemindResult } from '@smis-mentor/shared';

export const saveTaskViaApi = (payload: TaskSavePayload) =>
  authenticatedPost<{ taskIds: string[] }>('/api/tasks/save', payload);

export const deleteTaskViaApi = (taskId: string, scope: 'one' | 'group') =>
  authenticatedPost<{ deleted: number }>('/api/tasks/delete', { taskId, scope });

export const remindTaskViaApi = (taskId: string) =>
  authenticatedPost<TaskRemindResult>('/api/tasks/remind', { taskId });
