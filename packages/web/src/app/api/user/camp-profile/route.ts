import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { CampProfileError, getCampProfileStatus, saveCampProfile } from '@/lib/campProfileServer';
import { writeAuditLog } from '@/lib/auditLog';
import { logger } from '@smis-mentor/shared';

/**
 * 본인 캠프 참가 정보
 * GET  → { applies, tier, campCodes, required, missing, profile(가림본) }
 * POST { ...CampProfileInput, requireComplete?: boolean } → 저장 후 상태
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  try {
    return NextResponse.json(await getCampProfileStatus(auth.firebaseUid));
  } catch (e) {
    logger.error('캠프 참가 정보 조회 실패:', e);
    return NextResponse.json({ error: '조회에 실패했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (!auth) return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const status = await saveCampProfile(auth.firebaseUid, body ?? {}, { requireComplete: !!body?.requireComplete });
    await writeAuditLog({
      action: 'CAMP_PROFILE_UPDATE',
      category: 'PRIVACY',
      performedBy: auth.firebaseUid,
      performedByName: (auth.user as any)?.name,
      targetUserId: auth.firebaseUid,
      metadata: { fields: Object.keys(body ?? {}).filter((k) => k !== 'requireComplete' && body[k]) },
      request,
    });
    return NextResponse.json(status);
  } catch (e) {
    if (e instanceof CampProfileError) {
      return NextResponse.json({ error: e.message, fields: e.fields ?? {} }, { status: e.status });
    }
    logger.error('캠프 참가 정보 저장 실패:', e);
    return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 });
  }
}
