/**
 * Provider ID 정규화 마이그레이션 스크립트
 * 
 * 잘못 저장된 providerId를 수정합니다:
 * - "naver.com" → "naver"
 * - "kakao.com" → "kakao"
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');

if (getApps().length === 0) {
  try {
    if (fs.existsSync(serviceAccountPath)) {
      console.log('✅ serviceAccountKey.json 파일 사용');
      initializeApp({
        credential: cert(serviceAccountPath),
      });
    } else {
      console.log('⚠️  serviceAccountKey.json 파일이 없습니다.');
      console.log('📌 Application Default Credentials를 사용합니다.');
      initializeApp({
        projectId: 'smis-mentor',
      });
    }
  } catch (error) {
    console.error('❌ Firebase 초기화 실패:', error);
    process.exit(1);
  }
}

const db = getFirestore();

interface AuthProvider {
  providerId: string;
  uid: string;
  email: string;
  linkedAt: any;
  displayName?: string;
  photoURL?: string;
}

interface User {
  id: string;
  userId?: string;
  name?: string;
  email?: string;
  authProviders?: AuthProvider[];
}

async function normalizeProviderIds(dryRun: boolean = false) {
  console.log('🚀 Provider ID 정규화 마이그레이션 시작...');
  if (dryRun) {
    console.log('⚠️  DRY RUN 모드: 실제 데이터는 변경되지 않습니다.\n');
  } else {
    console.log('⚠️  실제 데이터베이스를 수정합니다.\n');
  }

  try {
    const usersSnapshot = await db.collection('users').get();
    
    let totalUsers = 0;
    let migratedUsers = 0;
    let skippedUsers = 0;
    
    const migrationLog: Array<{
      id: string;
      name: string;
      email: string;
      changes: string;
    }> = [];

    console.log(`📊 총 ${usersSnapshot.size}명의 사용자 발견\n`);

    const batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500;

    for (const doc of usersSnapshot.docs) {
      totalUsers++;
      const userData = doc.data() as User;
      const userId = doc.id;
      const authProviders = userData.authProviders || [];

      if (authProviders.length === 0) {
        skippedUsers++;
        continue;
      }

      // 수정이 필요한 provider 확인
      let needsUpdate = false;
      const updatedProviders = authProviders.map(provider => {
        if (provider.providerId === 'naver.com') {
          needsUpdate = true;
          return { ...provider, providerId: 'naver' };
        } else if (provider.providerId === 'kakao.com') {
          needsUpdate = true;
          return { ...provider, providerId: 'kakao' };
        }
        return provider;
      });

      if (needsUpdate) {
        const changes = authProviders
          .filter(p => p.providerId === 'naver.com' || p.providerId === 'kakao.com')
          .map(p => `${p.providerId} → ${p.providerId.replace('.com', '')}`)
          .join(', ');

        migrationLog.push({
          id: userId,
          name: userData.name || 'Unknown',
          email: userData.email || 'Unknown',
          changes,
        });

        if (!dryRun) {
          const userRef = db.collection('users').doc(userId);
          batch.update(userRef, {
            authProviders: updatedProviders,
            updatedAt: Timestamp.now(),
          });

          batchCount++;

          if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            console.log(`✅ ${batchCount}개의 사용자 업데이트 완료 (진행: ${migratedUsers + batchCount}/${totalUsers})`);
            migratedUsers += batchCount;
            batchCount = 0;
          }
        }
      } else {
        skippedUsers++;
      }
    }

    // 남은 배치 커밋
    if (!dryRun && batchCount > 0) {
      await batch.commit();
      console.log(`✅ 마지막 ${batchCount}개의 사용자 업데이트 완료`);
      migratedUsers += batchCount;
    } else if (dryRun) {
      migratedUsers = migrationLog.length;
    }

    // 결과 출력
    console.log('\n' + '='.repeat(80));
    console.log('📈 마이그레이션 결과 요약');
    console.log('='.repeat(80));
    console.log(`총 사용자 수: ${totalUsers}`);
    console.log(`마이그레이션된 사용자: ${migratedUsers}`);
    console.log(`건너뛴 사용자: ${skippedUsers}`);
    console.log('='.repeat(80) + '\n');

    if (migrationLog.length > 0) {
      console.log('📝 마이그레이션된 사용자 목록:\n');
      console.log('ID\t\t\t이름\t\t\t이메일\t\t\t\t변경 내용');
      console.log('-'.repeat(120));
      
      migrationLog.forEach((log) => {
        console.log(
          `${log.id.substring(0, 10)}...\t${log.name.substring(0, 12).padEnd(12)}\t${log.email.substring(0, 24).padEnd(24)}\t${log.changes}`
        );
      });
    } else {
      console.log('✅ 정규화가 필요한 사용자가 없습니다.');
    }

    console.log('\n✅ 마이그레이션 완료!');
    
    if (dryRun && migrationLog.length > 0) {
      console.log('\n💡 실제로 마이그레이션을 실행하려면 --dry-run 옵션 없이 다시 실행하세요:');
      console.log('   npm run migrate:normalize-provider-ids');
    }
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    throw error;
  }
}

const isDryRun = process.argv.includes('--dry-run');

normalizeProviderIds(isDryRun)
  .then(() => {
    console.log('\n프로그램 종료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n프로그램 오류:', error);
    process.exit(1);
  });
