import { NextRequest, NextResponse } from 'next/server';
import { isChatStaff, type ChatUserLike } from '@smis-mentor/shared';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { ChatServerError, ensureDmRoom } from '@/lib/chatServer';

/**
 * POST /api/chat/dm  { userId }  →  { roomId }
 * 1:1 대화방을 열거나 만든다 (같은 캠프였던 선생님 · 관리자).
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  const me = { ...(auth.user as unknown as ChatUserLike), userId: auth.firebaseUid };
  if (!isChatStaff(me)) return NextResponse.json({ error: '캠프 선생님만 채팅을 쓸 수 있습니다.' }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { userId?: unknown };
  const other = typeof body.userId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(body.userId) ? body.userId : '';
  if (!other) return NextResponse.json({ error: '대화 상대를 고르세요.' }, { status: 400 });
  try {
    const roomId = await ensureDmRoom(me, other);
    return NextResponse.json({ roomId });
  } catch (e) {
    if (e instanceof ChatServerError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('1:1 대화방 오류:', e);
    return NextResponse.json({ error: '대화방을 열지 못했습니다.' }, { status: 500 });
  }
}
