import { logger } from '@smis-mentor/shared';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { getAuthenticatedUser, requireAdmin } from '@/lib/authMiddleware';

/**
 * jobCodeIds 마이그레이션 API
 *
 * User 문서의 jobExperiences[*].id 값을 추출해 jobCodeIds 배열에 채운다.
 * 이미 jobCodeIds가 올바르게 세팅된 문서는 건너뜀.
 *
 * dryRun=true 파라미터를 전달하면 실제 쓰기 없이 결과만 반환한다.
 *
 * 사용법:
 *   POST /api/admin/migrate-job-code-ids          → 실제 실행
 *   POST /api/admin/migrate-job-code-ids?dryRun=true → 시뮬레이션
 */
export async function POST(request: NextRequest) {
  try {
    const authContext = await getAuthenticatedUser(request);
    const adminCheck = requireAdmin(authContext);
    if (adminCheck) return adminCheck;

    const db = getAdminFirestore();
    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get('dryRun') === 'true';

    logger.info('🚀 jobCodeIds 마이그레이션 시작...');
    logger.info(`📋 모드: ${dryRun ? 'DRY RUN (시뮬레이션)' : 'PRODUCTION (실제 실행)'}`);

    const results = {
      total: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      errors: [] as { userId: string; error: string }[],
    };

    const usersSnapshot = await db.collection('users').get();
    results.total = usersSnapshot.size;

    const BATCH_SIZE = 400;
    let batch = db.batch();
    let batchCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      try {
        const data = userDoc.data();
        const jobExperiences: Array<{ id: string }> = data.jobExperiences ?? [];
        const derivedIds: string[] = jobExperiences
          .map((exp) => exp.id)
          .filter(Boolean);

        const existingIds: string[] = data.jobCodeIds ?? [];
        const isSynced =
          derivedIds.length === existingIds.length &&
          derivedIds.every((id) => existingIds.includes(id));

        if (isSynced) {
          results.skipped++;
          continue;
        }

        if (!dryRun) {
          batch.update(userDoc.ref, { jobCodeIds: derivedIds });
          batchCount++;

          if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            batch = db.batch();
            batchCount = 0;
          }
        }

        results.updated++;
      } catch (err) {
        results.failed++;
        results.errors.push({
          userId: userDoc.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!dryRun && batchCount > 0) {
      await batch.commit();
    }

    logger.info('✅ jobCodeIds 마이그레이션 완료', results);

    return NextResponse.json({
      success: true,
      dryRun,
      results,
    });
  } catch (error) {
    logger.error('❌ jobCodeIds 마이그레이션 실패:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
