import { getAdminFirestore } from '@/lib/firebase-admin';
import { getAuthenticatedUser } from '@/lib/authMiddleware';
import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';

/**
 * 가입 완료 시 admin이 선생성한 temp 문서를 정리한다.
 *
 * 클라이언트가 새 Auth uid 로 users/{uid} 문서를 만든 뒤 호출.
 * 서버는 (1) 호출자 문서가 존재하고 (2) temp 문서가 status=temp 이며
 * (3) 전화번호·이메일·원어민 이름 중 하나가 호출자와 일치할 때만 temp 문서를 삭제한다.
 * (Firestore 규칙상 클라이언트는 남의 temp 문서를 삭제할 수 없음)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth) {
      return NextResponse.json({ error: { status: 'UNAUTHENTICATED', message: '인증이 필요합니다.' } }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const tempUserId = typeof body?.tempUserId === 'string' ? body.tempUserId.trim() : '';
    if (!tempUserId || tempUserId === auth.firebaseUid) {
      return NextResponse.json({ error: { status: 'INVALID_ARGUMENT', message: 'tempUserId가 올바르지 않습니다.' } }, { status: 400 });
    }

    const db = getAdminFirestore();
    const tempRef = db.collection('users').doc(tempUserId);
    const tempDoc = await tempRef.get();
    if (!tempDoc.exists) return NextResponse.json({ success: true, deleted: false, reason: 'not-found' });

    const temp = tempDoc.data() as Record<string, any>;
    if (temp.status !== 'temp') {
      return NextResponse.json({ error: { status: 'FAILED_PRECONDITION', message: 'temp 계정이 아닙니다.' } }, { status: 409 });
    }

    const me = auth.user as Record<string, any>;
    const lower = (v: unknown) => (typeof v === 'string' ? v.toLowerCase() : '');
    const phoneMatch = !!temp.phoneNumber && temp.phoneNumber === me.phoneNumber;
    const emailMatch = !!temp.email && lower(temp.email) === lower(me.email);
    const nameMatch =
      !!temp.foreignTeacher?.firstName &&
      lower(temp.foreignTeacher.firstName) === lower(me.foreignTeacher?.firstName) &&
      lower(temp.foreignTeacher.lastName) === lower(me.foreignTeacher?.lastName);

    if (!phoneMatch && !emailMatch && !nameMatch) {
      logger.warn('🚫 temp 문서 교체 거부 (본인 확인 실패):', { tempUserId, uid: auth.firebaseUid });
      return NextResponse.json({ error: { status: 'PERMISSION_DENIED', message: '본인의 임시 계정이 아닙니다.' } }, { status: 403 });
    }

    await tempRef.delete();
    logger.info('🗑️ temp 문서 삭제 (가입 이관 완료):', { tempUserId, uid: auth.firebaseUid, by: phoneMatch ? 'phone' : emailMatch ? 'email' : 'name' });
    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    logger.error('❌ temp 문서 교체 실패:', error);
    return NextResponse.json({ error: { status: 'INTERNAL', message: '임시 계정 정리에 실패했습니다.' } }, { status: 500 });
  }
}
