import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { IdentityError, identityProviderOf, unlinkIdentity } from '@/lib/authIdentity';
import { logger } from '@smis-mentor/shared';

/**
 * POST /api/auth/social/unlink — 로그인한 사람의 소셜 연결 해제 (설정 화면)
 * body: { provider: 'google' | 'google.com' | 'apple' | 'naver' | 'kakao' } — 마지막 로그인 방법은 해제할 수 없다
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedUser(request);
  if (!ctx) return NextResponse.json({ error: { status: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' } }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const provider = identityProviderOf(body?.provider);
    if (!provider) throw new IdentityError(400, 'INVALID_ARGUMENT', '연결 해제할 제공자를 확인해주세요.');
    await unlinkIdentity(ctx.firebaseUid, provider);
    logger.info('🔓 소셜 연결 해제:', { provider, uid: ctx.firebaseUid.substring(0, 8) + '...' });
    return NextResponse.json({ result: { provider } });
  } catch (e) {
    if (e instanceof IdentityError) {
      return NextResponse.json({ error: { status: e.code, message: e.message } }, { status: e.status });
    }
    logger.error('❌ 소셜 연결 해제 실패:', e);
    return NextResponse.json({ error: { status: 'INTERNAL', message: '연결 해제 중 오류가 발생했습니다.' } }, { status: 500 });
  }
}
