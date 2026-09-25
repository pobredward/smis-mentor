import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { deleteTaskDocs, TaskApiError } from '@/lib/taskServer';

/**
 * POST /api/tasks/delete  { taskId, scope: 'one' | 'group' }
 * 관리자 + 부매니저(본인이 만든 업무만)
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { taskId?: string; scope?: string };
  const taskId = String(body.taskId ?? '');
  if (!taskId || taskId.includes('/')) return NextResponse.json({ error: 'taskId가 필요합니다.' }, { status: 400 });
  try {
    const result = await deleteTaskDocs(auth.firebaseUid, taskId, body.scope === 'group' ? 'group' : 'one');
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof TaskApiError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('업무 삭제 오류:', e);
    return NextResponse.json({ error: '업무 삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
