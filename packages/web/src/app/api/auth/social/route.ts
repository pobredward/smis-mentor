import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { ProofError, parseProof, verifySocialProof } from '@/lib/socialProof';
import { IdentityError } from '@/lib/authIdentity';
import { resolveSocialLogin } from '@/lib/socialLoginServer';
import { logger } from '@smis-mentor/shared';

/**
 * POST /api/auth/social — 소셜 로그인 판정 (새 흐름 · 서버가 사용자를 찾는다)
 * body: { proof: { kind:'naver'|'kakao', accessToken } | { kind:'firebase', idToken } }
 * 팝업(구글·애플)으로 생긴 임시 Auth 계정은 결과가 그 계정이 아니면 서버가 지운다 (users 문서가 없는 경우만).
 * 결과: lib/socialLoginServer.ts SocialResolveResult
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await verifySocialProof(parseProof(body?.proof));
    const result = await resolveSocialLogin(identity);

    // 팝업 세션이 결과 계정이 아니면 그 임시 Auth 계정 정리 (users 문서가 없는 것만)
    const keepPopup = result.action === 'NEED_PHONE' || (result.action === 'LOGIN' && result.alreadySignedIn);
    if (identity.firebaseUid && !keepPopup) {
      try {
        const hasDoc = (await getAdminFirestore().collection('users').doc(identity.firebaseUid).get()).exists;
        if (!hasDoc) await getAdminAuth().deleteUser(identity.firebaseUid);
      } catch (e) {
        if ((e as { code?: string })?.code !== 'auth/user-not-found') logger.warn('임시 Auth 계정 정리 실패(무시):', (e as Error)?.message);
      }
    }
    logger.info('🔐 소셜 로그인 판정:', { provider: identity.provider, action: result.action });
    return NextResponse.json({ result });
  } catch (e) {
    if (e instanceof ProofError || e instanceof IdentityError) {
      return NextResponse.json({ error: { status: e.code, message: e.message } }, { status: e.status });
    }
    logger.error('❌ 소셜 로그인 판정 실패:', e);
    return NextResponse.json({ error: { status: 'INTERNAL', message: '로그인 처리 중 오류가 발생했습니다.' } }, { status: 500 });
  }
}
