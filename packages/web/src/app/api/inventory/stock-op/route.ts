import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { runStockOp, StockOpError, type StockOp } from '@/lib/inventoryServer';

/**
 * POST /api/inventory/stock-op  { op: 'restock' | 'adjust' | 'transfer', ... }
 * 부매니저의 자기 그룹 재고 입고 · 조정 · 이동 (이동은 양방향 — 한쪽이 내 그룹이면 된다).
 * 관리자도 쓸 수 있지만, 관리자 화면은 기존처럼 앱에서 바로 쓴다.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as StockOp;
  if (!['restock', 'adjust', 'transfer'].includes(String(body.op))) {
    return NextResponse.json({ error: '알 수 없는 작업입니다.' }, { status: 400 });
  }
  try {
    return NextResponse.json(await runStockOp(auth.firebaseUid, body));
  } catch (e) {
    if (e instanceof StockOpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('재고 처리 오류:', e);
    return NextResponse.json({ error: '재고 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
