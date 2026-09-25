import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { remindTask, TaskApiError } from '@/lib/taskServer';

/**
 * POST /api/tasks/remind  { taskId }
 * 미완료자에게 업무 알림. 관리자는 전체, 부매니저는 내 그룹 사람에게만.
 * @returns { sent, incomplete, missed: [{ name, state }] }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { taskId?: string };
  const taskId = String(body.taskId ?? '');
  if (!taskId || taskId.includes('/')) return NextResponse.json({ error: 'taskId가 필요합니다.' }, { status: 400 });
  try {
    return NextResponse.json(await remindTask(auth.firebaseUid, taskId));
  } catch (e) {
    if (e instanceof TaskApiError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('업무 알림 오류:', e);
    return NextResponse.json({ error: '알림 전송 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
