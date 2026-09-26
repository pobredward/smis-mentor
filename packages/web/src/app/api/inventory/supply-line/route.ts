import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { setSupplyLineStateServer, StockOpError } from '@/lib/inventoryServer';

/**
 * POST /api/inventory/supply-line  { requestId, lineId, action: 'hold' | 'resume' | 'cancel', note? }
 * 부분 구매 후 남은 수량(잔여 줄) — 보류 / 구매 재개 / 남은 요청 취소 (관리자 또는 구매 담당)
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as { requestId?: string; lineId?: string; action?: 'hold' | 'resume' | 'cancel'; note?: string };
  if (!b.requestId || !b.lineId || !b.action) return NextResponse.json({ error: '요청 정보가 필요합니다.' }, { status: 400 });
  try {
    return NextResponse.json(await setSupplyLineStateServer(auth.firebaseUid, { requestId: String(b.requestId), lineId: String(b.lineId), action: b.action, note: b.note }));
  } catch (e) {
    if (e instanceof StockOpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('잔여 수량 처리 오류:', e);
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
