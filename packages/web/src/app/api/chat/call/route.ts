import { NextRequest, NextResponse } from 'next/server';
import { isChatStaff, type ChatUserLike } from '@smis-mentor/shared';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import {
  ChatCallError,
  chatCallsConfigured,
  declineChatCall,
  joinChatCall,
  leaveChatCall,
  pingChatCall,
  renewChatCallToken,
  startChatCall,
} from '@/lib/chatCallServer';

/**
 * POST /api/chat/call
 *  { action: 'start', roomId, media: 'voice'|'video' } → ChatCallJoin (진행 중인 통화가 있으면 그 통화)
 *  { action: 'join', callId }                         → ChatCallJoin
 *  { action: 'leave', callId } · { action: 'decline', callId, reason?: 'declined'|'busy' }
 *  { action: 'token', callId } → { token, expiresAt } · { action: 'ping', callId } → { ended }
 * 캠프 선생님(채팅 계정)만, 그 방 사람만. Agora 키(NEXT_PUBLIC_AGORA_APP_ID · AGORA_APP_CERTIFICATE)가 없으면 503.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  const me = { ...(auth.user as unknown as ChatUserLike), userId: auth.firebaseUid };
  if (!isChatStaff(me)) return NextResponse.json({ error: '캠프 선생님만 통화를 쓸 수 있습니다.' }, { status: 403 });

  const b = (await request.json().catch(() => ({}))) as { action?: unknown; roomId?: unknown; callId?: unknown; media?: unknown; reason?: unknown };
  const id = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(v);
  const uid = auth.firebaseUid;
  const name = String(auth.user.name ?? '');
  try {
    switch (b.action) {
      case 'start': {
        if (!chatCallsConfigured()) return NextResponse.json({ error: '통화가 아직 준비되지 않았어요.' }, { status: 503 });
        if (!id(b.roomId) || (b.media !== 'voice' && b.media !== 'video')) break;
        return NextResponse.json(await startChatCall({ uid, name }, String(b.roomId), b.media));
      }
      case 'join': {
        if (!chatCallsConfigured()) return NextResponse.json({ error: '통화가 아직 준비되지 않았어요.' }, { status: 503 });
        if (!id(b.callId)) break;
        return NextResponse.json(await joinChatCall({ uid, name }, String(b.callId)));
      }
      case 'leave':
        if (!id(b.callId)) break;
        await leaveChatCall(uid, String(b.callId));
        return NextResponse.json({ ok: true });
      case 'decline':
        if (!id(b.callId)) break;
        await declineChatCall(uid, String(b.callId), b.reason === 'busy' ? 'busy' : 'declined');
        return NextResponse.json({ ok: true });
      case 'token':
        if (!id(b.callId)) break;
        return NextResponse.json(await renewChatCallToken(uid, String(b.callId)));
      case 'ping':
        if (!id(b.callId)) break;
        return NextResponse.json(await pingChatCall(uid, String(b.callId)));
      default:
        break;
    }
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  } catch (e) {
    if (e instanceof ChatCallError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('통화 처리 오류:', e);
    return NextResponse.json({ error: '통화를 처리하지 못했습니다.' }, { status: 500 });
  }
}
