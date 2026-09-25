import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { notifyLostItem } from '@/lib/inventoryServer';

/**
 * POST /api/inventory/notify-lost  { lostItemId }
 * 분실물 등록 푸시 (문서당 1회, notify=false면 보내지 않음)
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  if (!['admin', 'mentor', 'foreign'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: '캠프 스태프만 사용할 수 있습니다.' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { lostItemId?: string };
  const lostItemId = String(body.lostItemId ?? '');
  if (!lostItemId || lostItemId.includes('/')) return NextResponse.json({ error: 'lostItemId가 필요합니다.' }, { status: 400 });
  try {
    const { sent, missed } = await notifyLostItem(lostItemId);
    return NextResponse.json({ sent, missed });
  } catch (e) {
    console.error('분실물 알림 오류:', e);
    return NextResponse.json({ error: '알림 전송 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
