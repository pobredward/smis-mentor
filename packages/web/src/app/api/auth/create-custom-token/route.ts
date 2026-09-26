import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import {
  ProofError,
  ensureAuthUser,
  identityAuthorizesUser,
  parseProof,
  verifySocialProof,
} from '@/lib/socialProof';
import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Custom Token 발급 (소셜 로그인 / 세션 복원 / 소셜 신규가입)
 *
 * 보안 원칙
 *  - 호출자는 반드시 proof(네이버·카카오 access token 또는 Firebase ID token)로 신원을 증명해야 한다.
 *  - 발급 대상 uid는 항상 서버가 결정한다 (login: users 문서 id, signup: 서버가 만든 Auth uid).
 *    클라이언트가 임의 uid를 지정하던 existingUid 파라미터는 제거됨.
 *  - 임시 Auth 계정 삭제(deleteAuthUid)는 그 계정의 ID token으로 소유를 증명한 경우에만 허용.
 *
 * body
 *  {
 *    mode?: 'login' | 'signup'      // 기본 login
 *    userId?: string                 // login: 대상 users 문서 id
 *    proof: { kind:'naver'|'kakao', accessToken } | { kind:'firebase', idToken }
 *    deleteAuthUid?: { uid: string; idToken: string }   // 팝업으로 생긴 임시 Auth 계정 정리 (선택)
 *  }
 * response: { result: { customToken, uid, matchedBy? } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const mode = body?.mode === 'signup' ? 'signup' : 'login';
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';

    const proof = parseProof(body?.proof);
    const identity = await verifySocialProof(proof);

    const adminAuth = getAdminAuth();
    const adminDb = getAdminFirestore();

    let targetUid: string;
    let matchedBy: string | undefined;

    if (mode === 'signup') {
      // 구글/애플은 클라이언트에 Firebase 세션이 이미 있으므로 signup 토큰이 필요 없다.
      if (proof.kind === 'firebase') {
        return fail(400, 'NOT_NEEDED', '이미 Firebase 세션이 있습니다.');
      }
      if (!identity.email) {
        return fail(400, 'EMAIL_REQUIRED', '소셜 계정에서 이메일을 가져올 수 없습니다. 이메일 제공에 동의해주세요.');
      }

      // 같은 이메일의 활성 계정이 있으면 가입 불가 (로그인/연동 경로로 안내)
      const dup = await adminDb.collection('users').where('email', '==', identity.email).limit(10).get();
      if (dup.docs.some((d) => d.data().status === 'active')) {
        return fail(409, 'EMAIL_IN_USE', '이미 가입된 이메일입니다. 로그인 화면에서 로그인해주세요.');
      }

      // Auth 사용자 확보: 같은 이메일의 Auth 계정이 있고 users 문서가 없으면(중단된 가입) 재사용
      let authUser = await adminAuth.getUserByEmail(identity.email).catch((e: any) => {
        if (e?.code === 'auth/user-not-found') return null;
        throw e;
      });
      if (authUser) {
        const existingDoc = await adminDb.collection('users').doc(authUser.uid).get();
        if (existingDoc.exists && existingDoc.data()?.status === 'active') {
          return fail(409, 'EMAIL_IN_USE', '이미 가입된 이메일입니다. 로그인 화면에서 로그인해주세요.');
        }
        matchedBy = 'orphan-auth';
      } else {
        authUser = await adminAuth.createUser({
          email: identity.email,
          emailVerified: true,
          ...(identity.name && { displayName: identity.name }),
        });
        matchedBy = 'created';
      }
      targetUid = authUser.uid;
    } else {
      if (!userId) {
        return fail(400, 'INVALID_ARGUMENT', 'userId가 필요합니다.');
      }
      const userDoc = await adminDb.collection('users').doc(userId).get();
      if (!userDoc.exists) {
        return fail(404, 'NOT_FOUND', '사용자를 찾을 수 없습니다.');
      }
      const userData = userDoc.data() as Record<string, unknown>;
      if (userData.status === 'inactive' || userData.status === 'deleted') {
        return fail(403, 'ACCOUNT_DISABLED', '탈퇴하거나 삭제된 계정입니다.');
      }

      const authorized = identityAuthorizesUser(identity, userId, userData);
      if (!authorized) {
        logger.warn('🚫 Custom Token 거부 (신원 불일치):', {
          userId: userId.substring(0, 8) + '...',
          provider: identity.provider,
          hasEmail: !!identity.email,
        });
        return fail(403, 'IDENTITY_MISMATCH', '해당 계정의 소유자임을 확인할 수 없습니다.');
      }
      matchedBy = authorized;

      const docEmail = typeof userData.email === 'string' ? userData.email.toLowerCase() : undefined;
      await ensureAuthUser(userId, docEmail, typeof userData.name === 'string' ? userData.name : undefined);
      targetUid = userId;
    }

    const customToken = await adminAuth.createCustomToken(targetUid, {
      provider: identity.provider,
      ...(mode === 'signup' && { signup: true }),
    });

    // 팝업 로그인으로 생긴 임시 Auth 계정 정리 — 그 계정의 ID token 으로만 삭제 가능
    const del = body?.deleteAuthUid;
    if (del && typeof del.uid === 'string' && typeof del.idToken === 'string' && del.uid !== targetUid) {
      try {
        const own = await adminAuth.verifyIdToken(del.idToken);
        if (own.uid !== del.uid) {
          logger.warn('⚠️ deleteAuthUid: 토큰 uid 불일치 → 무시');
        } else {
          const hasDoc = (await adminDb.collection('users').doc(del.uid).get()).exists;
          if (hasDoc) {
            logger.warn('⚠️ deleteAuthUid: users 문서가 있는 계정 → 삭제하지 않음', del.uid);
          } else {
            await adminAuth.deleteUser(del.uid);
            logger.info('✅ 임시 소셜 Auth 계정 삭제:', del.uid);
          }
        }
      } catch (e: any) {
        if (e?.code !== 'auth/user-not-found') {
          logger.warn('⚠️ 임시 Auth 계정 삭제 실패 (무시):', e?.message);
        }
      }
    }

    logger.info('✅ Custom Token 발급:', { mode, uid: targetUid.substring(0, 8) + '...', provider: identity.provider, matchedBy });
    return NextResponse.json({ result: { customToken, uid: targetUid, matchedBy } });
  } catch (error) {
    if (error instanceof ProofError) {
      return fail(error.status, error.code, error.message);
    }
    logger.error('❌ Custom Token 생성 실패:', error);
    return fail(500, 'INTERNAL', 'Custom Token 생성에 실패했습니다.');
  }
}

function fail(status: number, code: string, message: string) {
  return NextResponse.json({ error: { status: code, message } }, { status });
}
