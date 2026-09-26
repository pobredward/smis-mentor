import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { reconcileDoseLedger } from '@/lib/inventoryServer';

/**
 * POST /api/inventory/sync-dose  { recordId, campCode?, source?: 'patient' | 'staff' }
 * 환자 기록(또는 선생님 약 사용 기록)의 약 사용을 재고 원장과 맞춘다 (여러 번 호출해도 안전)
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  if (!['admin', 'mentor', 'foreign'].includes(String(auth.user.role))) {
    return NextResponse.json({ error: '캠프 스태프만 사용할 수 있습니다.' }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { recordId?: string; campCode?: string; source?: string };
  const recordId = String(body.recordId ?? '');
  if (!recordId || recordId.includes('/')) return NextResponse.json({ error: 'recordId가 필요합니다.' }, { status: 400 });
  try {
    const changed = await reconcileDoseLedger(recordId, body.campCode, body.source === 'staff' ? 'staff' : 'patient');
    return NextResponse.json({ changed });
  } catch (e) {
    console.error('재고 원장 정산 오류:', e);
    return NextResponse.json({ error: '재고 정산 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
