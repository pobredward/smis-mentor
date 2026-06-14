import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';
import { decryptRRN, isEncryptionConfigured, isPlaintextRRN } from '@/lib/encryption';

/**
 * admin 전용 주민등록번호 복호화 API
 * GET /api/admin/decrypt-rrn?userId=xxx
 *
 * - admin 역할만 접근 가능합니다.
 * - rrnLastEncrypted를 복호화하여 반환합니다.
 * - 기존 평문 rrnLast 필드가 남아있는 경우에도 처리합니다 (마이그레이션 기간 호환).
 */
export async function GET(request: NextRequest) {
  if (!isEncryptionConfigured()) {
    logger.error('❌ RRN 암호화 키가 설정되지 않았습니다.');
    return NextResponse.json(
      { error: '서버 설정 오류가 발생했습니다.' },
      { status: 500 }
    );
  }

  const authContext = await getAuthenticatedUser(request);
  const adminCheck = requireAdmin(authContext);
  if (adminCheck) return adminCheck;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId가 필요합니다.' }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return NextResponse.json({ error: '사용자를 찾을 수 없습니다.' }, { status: 404 });
    }

    const data = userDoc.data()!;
    const rrnFront: string | null = data.rrnFront ?? null;
    const rrnLastEncrypted: string | null = data.rrnLastEncrypted ?? null;
    const rrnLastPlain: string | null = data.rrnLast ?? null;

    let rrnLast: string | null = null;

    if (rrnLastEncrypted) {
      try {
        rrnLast = decryptRRN(rrnLastEncrypted);
      } catch (decryptError) {
        logger.error('❌ 복호화 실패:', { userId, error: (decryptError as Error).message });
        return NextResponse.json(
          { error: '복호화 중 오류가 발생했습니다.' },
          { status: 500 }
        );
      }
    } else if (rrnLastPlain && isPlaintextRRN(rrnLastPlain)) {
      // 마이그레이션 전 평문 데이터 — 그대로 반환하되 로그 기록
      logger.warn('⚠️ 평문 rrnLast 접근 감지 (미마이그레이션):', { userId });
      rrnLast = rrnLastPlain;
    }

    logger.info('✅ admin rrnLast 복호화 접근:', {
      adminId: authContext!.firebaseUid,
      targetUserId: userId,
    });

    return NextResponse.json({
      success: true,
      rrnFront,
      rrnLast,
      isEncrypted: !!rrnLastEncrypted,
    });
  } catch (error: any) {
    logger.error('❌ admin 복호화 API 오류:', {
      userId,
      error: error.message,
    });
    return NextResponse.json(
      { error: '처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
