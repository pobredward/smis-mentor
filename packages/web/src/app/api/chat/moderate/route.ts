import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { adminFieldValue, getAdminFirestore } from '@/lib/firebase-admin';
import { writeAuditLog } from '@/lib/auditLog';

/**
 * POST /api/chat/moderate  { roomId, messageId }
 * 관리자 — 신고된 채팅 메시지를 모두에게서 삭제한다 (관리자가 들어가 있지 않은 끼리 방 포함).
 * 사진·동영상 파일은 Functions(chatOnMessageUpdated)가 지운다. 그 메시지의 신고는 '처리됨'으로.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  if (auth.user.role !== 'admin') return NextResponse.json({ error: '관리자만 할 수 있습니다.' }, { status: 403 });
  const b = (await request.json().catch(() => ({}))) as { roomId?: unknown; messageId?: unknown };
  const ok = (v: unknown) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(v);
  if (!ok(b.roomId) || !ok(b.messageId)) return NextResponse.json({ error: '메시지를 찾을 수 없습니다.' }, { status: 400 });
  const roomId = String(b.roomId);
  const messageId = String(b.messageId);
  const db = getAdminFirestore();
  const ref = db.collection('chatRooms').doc(roomId).collection('messages').doc(messageId);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: '메시지를 찾을 수 없습니다.' }, { status: 404 });
  if (!snap.data()?.deleted) {
    await ref.update({ deleted: true, deletedAt: adminFieldValue.serverTimestamp(), text: '', media: [], deletedBy: auth.firebaseUid });
  }
  const reports = await db.collection('reports').where('messageId', '==', messageId).get();
  const batch = db.batch();
  reports.docs.filter((d) => d.data().roomId === roomId).forEach((d) => batch.update(d.ref, { status: 'resolved', resolvedAt: adminFieldValue.serverTimestamp(), resolvedBy: auth.firebaseUid }));
  if (!reports.empty) await batch.commit();
  await writeAuditLog({
    action: 'COMMUNITY_REPORT_RESOLVE',
    category: 'COMMUNITY',
    performedBy: auth.firebaseUid,
    performedByName: auth.user.name,
    targetUserId: String(snap.data()?.senderId ?? '') || undefined,
    targetLabel: `채팅 메시지 삭제 ${roomId}/${messageId}`,
    metadata: { roomId, messageId, kind: 'chatMessage' },
    request,
  });
  return NextResponse.json({ ok: true });
}
