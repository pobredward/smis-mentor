import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { saveTask, TaskApiError, type SaveTaskInput } from '@/lib/taskServer';

/**
 * POST /api/tasks/save  { campCode, taskId?, dates: ['YYYY-MM-DD'], fields }
 * 업무 생성(taskId 없음) · 수정(taskId 있음, 여러 날짜 업무면 묶음 전체).
 * 관리자 + 부매니저(내 그룹 고정 · 본인 업무만 수정)
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as SaveTaskInput;
  try {
    const result = await saveTask(auth.firebaseUid, body);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof TaskApiError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('업무 저장 오류:', e);
    return NextResponse.json({ error: '업무 저장 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
