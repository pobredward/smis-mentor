import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getAuthenticatedUser, requireSelfOrAdmin } from '@/lib/authMiddleware';
import { encryptRRN, isEncryptionConfigured } from '@/lib/encryption';

/**
 * 회원가입 완료 후 민감 정보(주민등록번호)를 암호화해서 Firestore에 저장합니다.
 * POST /api/user/save-sensitive
 *
 * - 인증된 본인만 자신의 민감 정보를 저장할 수 있습니다.
 * - rrnLast는 암호화하여 rrnLastEncrypted 필드로 저장합니다.
 * - rrnFront는 성별/나이 계산에 사용되는 생년월일이므로 함께 저장합니다.
 *   (rrnFront 자체는 생년월일과 동일한 정보로, 별도 암호화 없이 저장합니다.)
 */
export async function POST(request: NextRequest) {
  if (!isEncryptionConfigured()) {
    logger.error('❌ RRN 암호화 키가 설정되지 않았습니다.');
    return NextResponse.json(
      { error: '서버 설정 오류가 발생했습니다.' },
      { status: 500 }
    );
  }

  const authContext = await getAuthenticatedUser(request);
  if (!authContext) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }

  let body: { userId?: string; rrnFront?: string; rrnLast?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 });
  }

  const { userId, rrnFront, rrnLast } = body;

  if (!userId || !rrnFront || !rrnLast) {
    return NextResponse.json(
      { error: 'userId, rrnFront, rrnLast는 필수입니다.' },
      { status: 400 }
    );
  }

  // 본인 또는 관리자만 민감 정보 저장 가능
  const accessError = requireSelfOrAdmin(authContext, userId);
  if (accessError) {
    logger.warn('⚠️ 민감 정보 저장 권한 없음:', {
      requester: authContext.firebaseUid,
      requesterRole: authContext.user.role,
      target: userId,
    });
    return accessError;
  }

  // 입력값 검증
  if (!/^\d{6}$/.test(rrnFront)) {
    return NextResponse.json(
      { error: 'rrnFront는 숫자 6자리여야 합니다.' },
      { status: 400 }
    );
  }
  if (!/^\d{7}$/.test(rrnLast)) {
    return NextResponse.json(
      { error: 'rrnLast는 숫자 7자리여야 합니다.' },
      { status: 400 }
    );
  }

  try {
    const db = getAdminFirestore();
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { error: '사용자를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const rrnLastEncrypted = encryptRRN(rrnLast);

    await db.collection('users').doc(userId).update({
      rrnFront,
      rrnLastEncrypted,
      // 평문 rrnLast 필드 제거 (마이그레이션 시 기존 값 삭제)
      rrnLast: null,
      updatedAt: new Date(),
    });

    logger.info('✅ 주민등록번호 암호화 저장 완료:', { userId });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    logger.error('❌ 민감 정보 저장 실패:', {
      userId,
      error: error.message,
    });
    return NextResponse.json(
      { error: '저장 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
