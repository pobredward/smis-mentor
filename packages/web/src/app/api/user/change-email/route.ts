import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { logger } from '@smis-mentor/shared';
import { writeAuditLog } from '@/lib/auditLog';
import { sendVerificationEmail } from '@/lib/emailVerification';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 본인 이메일 변경 — Firebase Auth 와 users 문서를 함께 갱신한다.
 * (클라이언트가 users.email 만 바꾸면 Auth 이메일과 어긋나 로그인이 불가능해지므로 규칙에서 직접 쓰기를 막고 이 라우트로 통일)
 * body: { email: string, targetUserId?: string }  — targetUserId 는 관리자만 (다른 사용자 이메일 변경)
 */
export async function POST(request: NextRequest) {
  try {
    // 인증 메일이 오지 않아 이메일을 고치려는 미인증 사용자도 쓸 수 있어야 한다
    const auth = await getAuthenticatedUser(request, { allowUnverifiedEmail: true });
    if (!auth) {
      return NextResponse.json({ error: { status: 'UNAUTHENTICATED', message: '인증이 필요합니다.' } }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
      return NextResponse.json({ error: { status: 'INVALID_ARGUMENT', message: '올바른 이메일을 입력해주세요.' } }, { status: 400 });
    }
    // 관리자는 다른 사용자의 이메일도 바꿀 수 있다 (Auth 까지 함께 — 예전엔 문서만 바뀌어 로그인 불가 계정이 생겼다)
    const target = typeof body?.targetUserId === 'string' ? body.targetUserId.trim() : '';
    const isAdminTarget = !!target && target !== auth.firebaseUid;
    if (isAdminTarget && auth.user.role !== 'admin') {
      return NextResponse.json({ error: { status: 'PERMISSION_DENIED', message: '권한이 없습니다.' } }, { status: 403 });
    }
    const uid = isAdminTarget ? target : auth.firebaseUid;
    const current = isAdminTarget
      ? ((await getAdminFirestore().collection('users').doc(uid).get()).data()?.email as string | undefined)
      : ((auth.user as any).email as string | undefined);
    if (current && current.toLowerCase() === email) {
      return NextResponse.json({ success: true, changed: false });
    }

    const db = getAdminFirestore();
    const dup = await db.collection('users').where('email', '==', email).limit(5).get();
    if (dup.docs.some((d) => d.id !== uid && d.data().status !== 'deleted')) {
      return NextResponse.json({ error: { status: 'ALREADY_EXISTS', message: '이미 사용 중인 이메일입니다.' } }, { status: 409 });
    }

    const adminAuth = getAdminAuth();
    try {
      await adminAuth.updateUser(uid, { email, emailVerified: false });
    } catch (e: any) {
      if (e?.code === 'auth/user-not-found' && isAdminTarget) {
        // Auth 계정이 없는 사용자(temp 등)는 문서만 바꾼다
        logger.warn('⚠️ Auth 계정 없음 — 문서 이메일만 변경:', uid.substring(0, 8));
      } else if (e?.code === 'auth/email-already-exists') {
        return NextResponse.json({ error: { status: 'ALREADY_EXISTS', message: '이미 사용 중인 이메일입니다.' } }, { status: 409 });
      }
      else throw e;
    }

    const userRef = db.collection('users').doc(uid);
    const snap = await userRef.get();
    const providers = Array.isArray(snap.data()?.authProviders) ? snap.data()!.authProviders : [];
    const updatedProviders = providers.map((p: any) => (p?.providerId === 'password' ? { ...p, email } : p));
    await userRef.update({
      email,
      isEmailVerified: false,
      ...(providers.length > 0 && { authProviders: updatedProviders }),
      updatedAt: new Date(),
    });

    // 본인 변경이면 새 주소로 인증 메일 발송 (인증 전까지 앱은 인증 안내 화면만 보여 준다)
    if (!isAdminTarget) {
      const idToken = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
      if (idToken) await sendVerificationEmail(idToken, (auth.user as any)?.role === 'foreign' ? 'en' : 'ko').catch(() => false);
    }
    logger.info('✅ 이메일 변경 (Auth+Firestore):', { uid: uid.substring(0, 8) + '...' });
    await writeAuditLog({
      action: isAdminTarget ? 'ADMIN_EMAIL_CHANGE' : 'EMAIL_CHANGE',
      category: 'ACCOUNT',
      performedBy: uid,
      performedByName: (auth.user as any)?.name,
      targetUserId: uid,
      metadata: { from: current ?? null, to: email },
      request,
    });
    return NextResponse.json({ success: true, changed: true, email });
  } catch (error) {
    logger.error('❌ 이메일 변경 실패:', error);
    return NextResponse.json({ error: { status: 'INTERNAL', message: '이메일 변경에 실패했습니다.' } }, { status: 500 });
  }
}
