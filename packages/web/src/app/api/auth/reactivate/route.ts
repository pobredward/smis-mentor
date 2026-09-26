import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { reactivateAccount, verifyOwner, maskEmail, ReactivateError } from '@/lib/reactivateServer';
import { writeAuditLog } from '@/lib/auditLog';
import { logger } from '@smis-mentor/shared';

/**
 * POST /api/auth/reactivate — 본인 탈퇴·삭제 계정 복구 (가입 화면, 비로그인)
 * body: { userId, phoneNumber, name } — 전화번호·원래 이름이 모두 맞아야 복구하고,
 * 로그인은 원래 이메일로 온 비밀번호 재설정 메일(또는 연결된 소셜 계정)로만 가능하다.
 */
const hits = new Map<string, { n: number; t: number }>();
function limited(ip: string) {
  const now = Date.now();
  const cur = hits.get(ip);
  if (!cur || now - cur.t > 10 * 60_000) { hits.set(ip, { n: 1, t: now }); return false; }
  cur.n += 1;
  return cur.n > 5;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (limited(ip)) return NextResponse.json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
  const phoneNumber = typeof body?.phoneNumber === 'string' ? body.phoneNumber : '';
  const name = typeof body?.name === 'string' ? body.name : '';
  if (!userId || !phoneNumber || !name) return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 });

  try {
    const snap = await getAdminFirestore().collection('users').doc(userId).get();
    if (!snap.exists || !verifyOwner(snap.data() as Record<string, any>, phoneNumber, name)) {
      return NextResponse.json({ error: '본인 확인에 실패했습니다. 관리자에게 문의해주세요.' }, { status: 403 });
    }
    const r = await reactivateAccount(userId);
    await writeAuditLog({ action: 'USER_STATUS_CHANGE', category: 'ACCOUNT', performedBy: userId, targetUserId: userId, metadata: { kind: 'self-reactivate', authCreated: r.authCreated }, request });
    return NextResponse.json({ ok: true, email: maskEmail(r.email), resetSent: r.resetSent });
  } catch (e) {
    if (e instanceof ReactivateError) return NextResponse.json({ error: e.message }, { status: e.status });
    logger.error('❌ 본인 계정 복구 실패:', e);
    return NextResponse.json({ error: '계정 복구에 실패했습니다.' }, { status: 500 });
  }
}
