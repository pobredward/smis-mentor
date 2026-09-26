import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { notifySupply, type SupplyNotifyEvent } from '@/lib/supplyNotify';

const TYPES = ['request_created', 'buyer_assigned', 'default_buyer', 'lines_done', 'settled', 'status', 'approved', 'stock_low'];
const ok = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length < 200 && !v.includes('/');

/**
 * POST /api/inventory/notify  { type, ...ids }
 * 재고·구매 요청 푸시. 받는 사람은 서버가 현재 문서 상태로 정한다.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  if (!['admin', 'mentor', 'foreign'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: '캠프 스태프만 사용할 수 있습니다.' }, { status: 403 });
  }
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!TYPES.includes(String(b.type))) return NextResponse.json({ error: '알 수 없는 알림입니다.' }, { status: 400 });
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter(ok).slice(0, 50) as string[] : []);
  let ev: SupplyNotifyEvent;
  switch (b.type) {
    case 'buyer_assigned': ev = { type: 'buyer_assigned', requestIds: ids(b.requestIds) }; break;
    case 'default_buyer': if (!ok(b.campCode)) return NextResponse.json({ error: 'campCode' }, { status: 400 }); ev = { type: 'default_buyer', campCode: String(b.campCode) }; break;
    case 'stock_low':
      if (!ok(b.campCode) || !ok(b.itemId) || !ok(b.groupId)) return NextResponse.json({ error: 'ids' }, { status: 400 });
      ev = { type: 'stock_low', campCode: String(b.campCode), itemId: String(b.itemId), groupId: String(b.groupId) }; break;
    case 'lines_done': case 'settled':
      if (!ok(b.requestId)) return NextResponse.json({ error: 'requestId' }, { status: 400 });
      ev = { type: b.type, requestId: String(b.requestId), lineIds: ids(b.lineIds) }; break;
    default:
      if (!ok(b.requestId)) return NextResponse.json({ error: 'requestId' }, { status: 400 });
      ev = { type: b.type as 'request_created' | 'status' | 'approved', requestId: String(b.requestId) };
  }
  try {
    const { sent, missed } = await notifySupply(ev, auth.firebaseUid);
    return NextResponse.json({ sent, missed });
  } catch (e) {
    console.error('재고 알림 오류:', e);
    return NextResponse.json({ error: '알림 전송 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
