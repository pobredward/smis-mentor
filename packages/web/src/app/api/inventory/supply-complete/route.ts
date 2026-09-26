import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { completeSupplyLinesServer, StockOpError } from '@/lib/inventoryServer';
import { notifySupply } from '@/lib/supplyNotify';

/**
 * POST /api/inventory/supply-complete
 *   { requestId, lines: [{ lineId, quantity?, unitPrice?, amount?, payTo?, stockQty?, groupId? }] }
 * 요청 품목 구매 완료 (관리자 또는 구매 담당, 승인된 요청만)
 * - 요청보다 적게 샀으면 남은 수량은 새 줄로 요청에 남는다
 * - 캠프 공용은 재고 품목을 바로 입고
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { requestId?: string; lines?: Array<{ lineId: string; quantity?: number; unitPrice?: number; amount?: number; payTo?: string; stockQty?: number; groupId?: string; rest?: 'continue' | 'hold' | 'cancel'; restNote?: string }> };
  const lines = Array.isArray(body.lines) ? body.lines.filter(l => l && typeof l.lineId === 'string').slice(0, 100) : [];
  if (!body.requestId || lines.length === 0) return NextResponse.json({ error: '요청 정보가 필요합니다.' }, { status: 400 });
  try {
    const result = await completeSupplyLinesServer(auth.firebaseUid, { requestId: String(body.requestId), lines });
    await notifySupply({ type: 'lines_done', requestId: String(body.requestId), lineIds: lines.map(l => l.lineId) }, auth.firebaseUid).catch(e => console.error('구매 완료 알림 오류:', e));
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof StockOpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('구매 완료·입고 오류:', e);
    return NextResponse.json({ error: '구매 완료 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
