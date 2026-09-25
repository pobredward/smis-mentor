/**
 * 업무 생성 · 수정 · 삭제 · 독촉 — 웹 서버 API 경유 (관리자 · 부매니저 공용)
 * 권한 · 날짜 · 첨부 정리는 서버(web lib/taskServer.ts)가 한다.
 */
import { mobileAuthenticatedPost } from './apiClient';
import type { TaskSavePayload, TaskRemindResult } from '@smis-mentor/shared';

export const saveTaskViaApi = (payload: TaskSavePayload) =>
  mobileAuthenticatedPost<{ taskIds: string[] }>('/api/tasks/save', payload as unknown as Record<string, unknown>);

export const deleteTaskViaApi = (taskId: string, scope: 'one' | 'group') =>
  mobileAuthenticatedPost<{ deleted: number }>('/api/tasks/delete', { taskId, scope });

export const remindTaskViaApi = (taskId: string) =>
  mobileAuthenticatedPost<TaskRemindResult>('/api/tasks/remind', { taskId });
