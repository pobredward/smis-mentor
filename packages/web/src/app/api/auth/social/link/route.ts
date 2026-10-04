import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { ProofError, parseProof, verifySocialProof } from '@/lib/socialProof';
import { IdentityError, linkIdentity } from '@/lib/authIdentity';
import { identityRefOf } from '@/lib/socialLoginServer';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { logger } from '@smis-mentor/shared';

/**
 * POST /api/auth/social/link — 로그인한 사람의 계정에 소셜 연결 (설정 화면)
 * header: Authorization: Bearer <지금 계정의 ID 토큰>
 * body: { proof } — 구글·애플은 연결할 계정의 팝업 세션 ID 토큰(kind:'firebase'), 네이버·카카오는 액세스 토큰
 * 구글·애플 팝업으로 생긴 임시 Auth 계정은 users 문서가 없으면 지운다.
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthenticatedUser(request);
  if (!ctx) return NextResponse.json({ error: { status: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' } }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await verifySocialProof(parseProof(body?.proof));
    const ref = identityRefOf(identity);
    if (!ref) throw new IdentityError(400, 'NOT_SOCIAL', '소셜 로그인 정보가 아닙니다.');
    await linkIdentity(ctx.firebaseUid, ref);
    if (identity.firebaseUid && identity.firebaseUid !== ctx.firebaseUid) {
      const hasDoc = (await getAdminFirestore().collection('users').doc(identity.firebaseUid).get()).exists;
      if (!hasDoc) await getAdminAuth().deleteUser(identity.firebaseUid).catch(() => undefined);
    }
    logger.info('🔗 소셜 연결(설정):', { provider: ref.provider, uid: ctx.firebaseUid.substring(0, 8) + '...' });
    return NextResponse.json({ result: { provider: ref.provider } });
  } catch (e) {
    if (e instanceof ProofError || e instanceof IdentityError) {
      return NextResponse.json({ error: { status: e.code, message: e.message } }, { status: e.status });
    }
    logger.error('❌ 소셜 연결 실패:', e);
    return NextResponse.json({ error: { status: 'INTERNAL', message: '계정 연결 중 오류가 발생했습니다.' } }, { status: 500 });
  }
}
