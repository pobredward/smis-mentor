/**
 * 학부모 API (웹 서버 /api/parent/*) — 아이 등록 · 캠프 신청. 읽기는 Firestore 규칙(parentIds)으로 바로.
 */
import type { OpenCamp } from '@smis-mentor/shared';
import { authenticatedFetch } from '../utils/apiClient';

export async function parentCall<T = any>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const res = await authenticatedFetch(path, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || '처리하지 못했습니다.');
  return data as T;
}

export async function getOpenCamps(): Promise<OpenCamp[]> {
  const r = await parentCall<{ camps: OpenCamp[] }>('GET', '/api/parent/camps');
  return r.camps ?? [];
}
