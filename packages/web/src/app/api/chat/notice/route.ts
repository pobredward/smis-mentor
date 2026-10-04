import { NextRequest, NextResponse } from 'next/server';
import { canBeNotice, canSetNotice, chatNoticeOf, isChatStaff, type ChatMessage, type ChatRoom, type ChatUserLike } from '@smis-mentor/shared';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { adminFieldValue, getAdminFirestore } from '@/lib/firebase-admin';

/**
 * POST /api/chat/notice  { roomId, messageId }  → 그 메시지를 방 공지로 (한 방에 하나, 바꾸면 새 공지)
 * POST /api/chat/notice  { roomId, messageId: null } → 공지 내리기
 * 캠프 방: 매니저 · 그룹방: 매니저 + 그 그룹 부매니저 · 1:1: 둘 다 (canSetNotice)
 * 공지를 올리면 방에 '공지가 등록되었어요' 알림 메시지를 남긴다 → Functions 가 알림 꺼 둔 사람에게도 푸시.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  const me = { ...(auth.user as unknown as ChatUserLike), userId: auth.firebaseUid };
  if (!isChatStaff(me)) return NextResponse.json({ error: '캠프 선생님만 채팅을 쓸 수 있습니다.' }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as { roomId?: unknown; messageId?: unknown };
  const ok = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(v);
  if (!ok(b.roomId) || (b.messageId !== null && !ok(b.messageId))) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  const roomId = String(b.roomId);
  const db = getAdminFirestore();
  const roomRef = db.collection('chatRooms').doc(roomId);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) return NextResponse.json({ error: '채팅방을 찾을 수 없습니다.' }, { status: 404 });
  const room = { id: roomId, ...(roomSnap.data() as Omit<ChatRoom, 'id'>) };
  if (!canSetNotice(room, auth.firebaseUid)) return NextResponse.json({ error: '이 방에서 공지를 올릴 수 없습니다.' }, { status: 403 });

  if (b.messageId === null) {
    await roomRef.update({ notice: null });
    return NextResponse.json({ ok: true, notice: null });
  }
  const messageId = String(b.messageId);
  const msgSnap = await roomRef.collection('messages').doc(messageId).get();
  if (!msgSnap.exists) return NextResponse.json({ error: '메시지를 찾을 수 없습니다.' }, { status: 404 });
  const m = { id: messageId, ...(msgSnap.data() as Omit<ChatMessage, 'id'>) };
  if (!canBeNotice(m)) return NextResponse.json({ error: '이 메시지는 공지로 올릴 수 없습니다.' }, { status: 400 });

  const byName = room.memberInfo?.[auth.firebaseUid]?.name || String(auth.user.name ?? '');
  const notice = { ...chatNoticeOf(m, { uid: auth.firebaseUid, name: byName }), setAt: adminFieldValue.serverTimestamp() };
  const batch = db.batch();
  batch.update(roomRef, { notice });
  batch.set(roomRef.collection('messages').doc(), {
    senderId: auth.firebaseUid,
    senderName: byName,
    kind: 'system',
    systemType: 'notice',
    noticeOf: messageId,
    text: notice.text.slice(0, 200),
    media: [],
    clientId: `notice-${messageId}`,
    createdAt: adminFieldValue.serverTimestamp(),
  });
  await batch.commit();
  return NextResponse.json({ ok: true });
}
