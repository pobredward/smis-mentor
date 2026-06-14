import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';
import { encryptRRN, isEncryptionConfigured, isPlaintextRRN } from '@/lib/encryption';

/**
 * 기존 평문 rrnLast → rrnLastEncrypted 마이그레이션
 * POST /api/admin/migrate-rrn-encryption
 *
 * - admin 전용
 * - dryRun=true (기본값)로 실행하면 실제 변경 없이 대상 문서 수만 반환합니다.
 * - dryRun=false로 실행해야 실제 암호화 마이그레이션이 진행됩니다.
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
  const adminCheck = requireAdmin(authContext);
  if (adminCheck) return adminCheck;

  let body: { dryRun?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // body 없으면 dryRun 기본값 사용
  }

  const dryRun = body.dryRun !== false;

  logger.info(`🔄 RRN 마이그레이션 시작 (dryRun=${dryRun})`, {
    adminId: authContext!.firebaseUid,
  });

  try {
    const db = getAdminFirestore();

    // 평문 rrnLast 필드가 있는 문서만 조회
    const snapshot = await db
      .collection('users')
      .where('rrnLast', '!=', null)
      .get();

    const targets = snapshot.docs.filter((doc) => {
      const rrnLast = doc.data().rrnLast;
      return rrnLast && isPlaintextRRN(rrnLast);
    });

    logger.info(`📊 마이그레이션 대상: ${targets.length}건`);

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        targetCount: targets.length,
        message: `${targets.length}건의 문서를 마이그레이션할 수 있습니다. dryRun=false로 실행하면 실제 변경됩니다.`,
      });
    }

    // 실제 마이그레이션: 배치 단위로 처리
    let successCount = 0;
    let errorCount = 0;
    const BATCH_SIZE = 400;

    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = targets.slice(i, i + BATCH_SIZE);

      for (const docSnap of chunk) {
        try {
          const rrnLast = docSnap.data().rrnLast as string;
          const rrnLastEncrypted = encryptRRN(rrnLast);

          batch.update(docSnap.ref, {
            rrnLastEncrypted,
            rrnLast: null, // 평문 필드 제거
            updatedAt: new Date(),
          });
          successCount++;
        } catch (encryptError) {
          logger.error('❌ 개별 문서 암호화 실패:', {
            docId: docSnap.id,
            error: (encryptError as Error).message,
          });
          errorCount++;
        }
      }

      await batch.commit();
      logger.info(`✅ 배치 처리 완료: ${i + chunk.length}/${targets.length}`);
    }

    logger.info('✅ RRN 마이그레이션 완료:', { successCount, errorCount });

    return NextResponse.json({
      success: true,
      dryRun: false,
      successCount,
      errorCount,
      message: `마이그레이션 완료: ${successCount}건 성공, ${errorCount}건 실패`,
    });
  } catch (error: any) {
    logger.error('❌ RRN 마이그레이션 실패:', { error: error.message });
    return NextResponse.json(
      { error: '마이그레이션 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
