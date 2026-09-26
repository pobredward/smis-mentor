import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';
import { reactivateAccount, ReactivateError } from '@/lib/reactivateServer';
import { writeAuditLog } from '@/lib/auditLog';
import { logger } from '@smis-mentor/shared';

/** POST /api/admin/reactivate-user — 관리자 계정 복구 (Admin SDK, 관리자 세션은 그대로) */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  const denied = requireAdmin(auth);
  if (denied) return denied;
  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  if (!userId) return NextResponse.json({ error: 'userId 가 필요합니다.' }, { status: 400 });
  try {
    const r = await reactivateAccount(userId);
    await writeAuditLog({ action: 'USER_STATUS_CHANGE', category: 'ACCOUNT', performedBy: auth!.firebaseUid, performedByName: auth!.user.name, targetUserId: userId, metadata: { kind: 'admin-reactivate', authCreated: r.authCreated }, request });
    return NextResponse.json({ ok: true, email: r.email, resetSent: r.resetSent });
  } catch (e) {
    if (e instanceof ReactivateError) return NextResponse.json({ error: e.message }, { status: e.status });
    logger.error('❌ 관리자 계정 복구 실패:', e);
    return NextResponse.json({ error: '계정 복구에 실패했습니다.' }, { status: 500 });
  }
}
