import admin from 'firebase-admin';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Firebase Admin 초기화
let app: admin.app.App;

try {
  const serviceAccountPath = join(__dirname, '..', 'serviceAccountKey.json');
  const serviceAccountData = readFileSync(serviceAccountPath, 'utf8');
  const serviceAccount = JSON.parse(serviceAccountData);

  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  console.log('✅ Firebase Admin이 serviceAccountKey.json으로 초기화되었습니다.');
} catch (error) {
  console.error('❌ Firebase 초기화 실패:', error);
  console.log('\nserviceAccountKey.json 파일을 프로젝트 루트에 배치해주세요.');
  process.exit(1);
}

const db = admin.firestore();

interface MigrationStats {
  total: number;
  withoutIdField: number;
  updated: number;
  failed: number;
  skipped: number;
}

/**
 * id 필드가 없는 사용자들의 id 필드를 userId와 동일하게 설정
 */
async function migrateUserIdField(dryRun: boolean = true): Promise<void> {
  console.log('\n🔄 사용자 id 필드 마이그레이션 시작...');
  console.log(`모드: ${dryRun ? '🔍 DRY RUN (실제 변경 없음)' : '✍️  LIVE RUN (실제 변경 적용)'}\n`);

  const stats: MigrationStats = {
    total: 0,
    withoutIdField: 0,
    updated: 0,
    failed: 0,
    skipped: 0
  };

  try {
    // 모든 사용자 조회
    const usersSnapshot = await db.collection('users').get();
    stats.total = usersSnapshot.size;

    console.log(`📊 총 ${stats.total}명의 사용자를 확인합니다...\n`);

    const batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500; // Firestore batch 최대 크기

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const docId = userDoc.id;

      // userId가 없으면 document ID를 userId로 사용
      const userId = userData.userId || docId;

      // id 필드가 없거나 userId와 다른 경우
      if (!userData.id || userData.id !== userId) {
        stats.withoutIdField++;

        console.log(`🔧 [${stats.withoutIdField}] ${userData.name || '이름없음'}`);
        console.log(`   Document ID: ${docId}`);
        console.log(`   userId: ${userData.userId || '없음 (Document ID 사용)'}`);
        console.log(`   기존 id: ${userData.id || '없음'}`);
        console.log(`   → 새로운 id: ${userId}`);

        if (!dryRun) {
          try {
            // userId가 없었다면 함께 설정
            const updateData: any = {
              id: userId,
              updatedAt: admin.firestore.Timestamp.now()
            };

            if (!userData.userId) {
              updateData.userId = userId;
              console.log(`   ℹ️  userId도 함께 설정: ${userId}`);
            }

            batch.update(userDoc.ref, updateData);

            batchCount++;
            stats.updated++;

            // 500개마다 batch 커밋
            if (batchCount >= BATCH_SIZE) {
              await batch.commit();
              console.log(`   ✅ Batch committed (${stats.updated} updated so far)`);
              batchCount = 0;
            }
          } catch (error) {
            console.error(`   ❌ 업데이트 실패:`, error);
            stats.failed++;
          }
        } else {
          stats.updated++;
        }

        console.log('');
      } else {
        stats.skipped++;
      }
    }

    // 남은 batch 커밋
    if (!dryRun && batchCount > 0) {
      await batch.commit();
      console.log(`✅ 마지막 batch committed\n`);
    }

    // 결과 출력
    console.log('\n' + '='.repeat(60));
    console.log('📊 마이그레이션 결과 요약');
    console.log('='.repeat(60));
    console.log(`총 사용자 수: ${stats.total}명`);
    console.log(`id 필드 없음/다름: ${stats.withoutIdField}명`);
    console.log(`${dryRun ? '업데이트 예정' : '업데이트 완료'}: ${stats.updated}명`);
    console.log(`건너뜀 (이미 정상): ${stats.skipped}명`);
    console.log(`실패: ${stats.failed}명`);
    console.log('='.repeat(60));

    if (dryRun) {
      console.log('\n⚠️  이것은 DRY RUN입니다. 실제 변경사항이 적용되지 않았습니다.');
      console.log('실제로 적용하려면 다음 명령어를 실행하세요:');
      console.log('npm run migrate:user-id-field');
    } else {
      console.log('\n✅ 마이그레이션이 완료되었습니다!');
    }

  } catch (error) {
    console.error('\n❌ 마이그레이션 중 오류 발생:', error);
    throw error;
  }
}

// 스크립트 실행
const dryRun = process.argv.includes('--dry-run');

migrateUserIdField(dryRun)
  .then(() => {
    console.log('\n✨ 스크립트 실행 완료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 스크립트 실행 실패:', error);
    process.exit(1);
  });
