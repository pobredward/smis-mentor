/**
 * AuthProviders 마이그레이션 스크립트
 * 
 * 기존 사용자들에게 authProviders 배열을 추가합니다:
 * - authProviders가 없거나 비어있는 경우
 * - 이메일이 있는 active 사용자 → password provider 추가
 * - primaryAuthMethod 설정
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ES Module에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase Admin 초기화
const serviceAccountPath = path.join(__dirname, '../serviceAccountKey.json');

// 이미 초기화된 앱이 있는지 확인
if (getApps().length === 0) {
  try {
    // serviceAccountKey.json이 있는 경우
    if (fs.existsSync(serviceAccountPath)) {
      console.log('✅ serviceAccountKey.json 파일 사용');
      initializeApp({
        credential: cert(serviceAccountPath),
      });
    } else {
      // Application Default Credentials 사용 (gcloud auth application-default login)
      console.log('⚠️  serviceAccountKey.json 파일이 없습니다.');
      console.log('📌 Application Default Credentials를 사용합니다.');
      console.log('   gcloud auth application-default login 명령으로 인증하세요.\n');
      
      initializeApp({
        projectId: 'smis-mentor',
      });
    }
  } catch (error) {
    console.error('❌ Firebase 초기화 실패:', error);
    console.log('\n해결 방법:');
    console.log('1. Firebase Console에서 서비스 계정 키 다운로드');
    console.log('   - Firebase Console → 프로젝트 설정 → 서비스 계정');
    console.log('   - "새 비공개 키 생성" 클릭');
    console.log('   - 다운로드한 파일을 프로젝트 루트에 serviceAccountKey.json으로 저장');
    console.log('\n2. 또는 Google Cloud CLI 사용:');
    console.log('   - gcloud auth application-default login');
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
  role?: string;
  status?: string;
  name?: string;
  email?: string;
  authProviders?: AuthProvider[];
  primaryAuthMethod?: string;
}

async function migrateAuthProviders(dryRun: boolean = false) {
  console.log('🚀 AuthProviders 마이그레이션 시작...');
  if (dryRun) {
    console.log('⚠️  DRY RUN 모드: 실제 데이터는 변경되지 않습니다.\n');
  } else {
    console.log('⚠️  실제 데이터베이스를 수정합니다.\n');
  }

  try {
    // 모든 사용자 조회
    const usersSnapshot = await db.collection('users').get();
    
    let totalUsers = 0;
    let migratedUsers = 0;
    let skippedUsers = 0;
    let alreadyHasProviders = 0;
    let tempUsers = 0;
    let noEmailUsers = 0;
    
    const migrationLog: Array<{
      id: string;
      name: string;
      email: string;
      status: string;
      role: string;
      reason: string;
    }> = [];

    console.log(`📊 총 ${usersSnapshot.size}명의 사용자 발견\n`);

    // 배치 처리를 위한 배열
    const batch = db.batch();
    let batchCount = 0;
    const BATCH_SIZE = 500;

    for (const doc of usersSnapshot.docs) {
      totalUsers++;
      const userData = doc.data() as User;
      const userId = doc.id;
      const userEmail = userData.email || '';
      const status = userData.status || 'active';
      const role = userData.role || '';
      const userName = userData.name || 'Unknown';
      const authProviders = userData.authProviders || [];

      // 건너뛸 조건들
      
      // 1. 이미 authProviders가 있는 경우
      if (authProviders && authProviders.length > 0) {
        alreadyHasProviders++;
        skippedUsers++;
        continue;
      }

      // 2. temp 계정인 경우 (temp 계정은 아직 완성되지 않음)
      if (status === 'temp') {
        tempUsers++;
        skippedUsers++;
        continue;
      }

      // 3. 이메일이 없는 경우
      if (!userEmail) {
        noEmailUsers++;
        skippedUsers++;
        migrationLog.push({
          id: userId,
          name: userName,
          email: 'NO EMAIL',
          status,
          role,
          reason: 'SKIPPED: No email',
        });
        continue;
      }

      // 4. active 상태가 아닌 경우 (inactive, deleted)
      if (status !== 'active') {
        skippedUsers++;
        continue;
      }

      // ✅ 마이그레이션 대상: active 상태이고 이메일이 있으며 authProviders가 없는 경우
      const newAuthProvider: AuthProvider = {
        providerId: 'password',
        uid: userData.userId || userId,
        email: userEmail,
        linkedAt: Timestamp.now(),
      };

      migrationLog.push({
        id: userId,
        name: userName,
        email: userEmail,
        status,
        role,
        reason: 'MIGRATED: Added password provider',
      });

      if (!dryRun) {
        const userRef = db.collection('users').doc(userId);
        batch.update(userRef, {
          authProviders: [newAuthProvider],
          primaryAuthMethod: 'password',
          updatedAt: Timestamp.now(),
        });

        batchCount++;

        // 배치 크기에 도달하면 커밋
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          console.log(`✅ ${batchCount}개의 사용자 업데이트 완료 (진행: ${migratedUsers + batchCount}/${totalUsers})`);
          migratedUsers += batchCount;
          batchCount = 0;
        }
      }
    }

    // 남은 배치 커밋
    if (!dryRun && batchCount > 0) {
      await batch.commit();
      console.log(`✅ 마지막 ${batchCount}개의 사용자 업데이트 완료`);
      migratedUsers += batchCount;
    } else if (dryRun) {
      migratedUsers = migrationLog.filter(log => log.reason.startsWith('MIGRATED')).length;
    }

    // 결과 출력
    console.log('\n' + '='.repeat(80));
    console.log('📈 마이그레이션 결과 요약');
    console.log('='.repeat(80));
    console.log(`총 사용자 수: ${totalUsers}`);
    console.log(`마이그레이션된 사용자: ${migratedUsers}`);
    console.log(`건너뛴 사용자: ${skippedUsers}`);
    console.log(`  - 이미 authProviders 있음: ${alreadyHasProviders}`);
    console.log(`  - temp 계정: ${tempUsers}`);
    console.log(`  - 이메일 없음: ${noEmailUsers}`);
    console.log(`  - 기타 (inactive/deleted): ${skippedUsers - alreadyHasProviders - tempUsers - noEmailUsers}`);
    console.log('='.repeat(80) + '\n');

    if (migrationLog.length > 0) {
      console.log('📝 마이그레이션 로그 (처리된 사용자):\n');
      console.log('ID\t\t\t이름\t\t\t이메일\t\t\t\t상태\t\t역할\t\t\t처리');
      console.log('-'.repeat(140));
      
      // 마이그레이션된 사용자만 먼저 표시
      const migratedLogs = migrationLog.filter(log => log.reason.startsWith('MIGRATED'));
      const skippedLogs = migrationLog.filter(log => log.reason.startsWith('SKIPPED'));
      
      if (migratedLogs.length > 0) {
        console.log('\n✅ 마이그레이션 완료:');
        migratedLogs.slice(0, 50).forEach((log) => {
          console.log(
            `${log.id.substring(0, 10)}...\t${log.name.substring(0, 12).padEnd(12)}\t${log.email.substring(0, 24).padEnd(24)}\t${log.status.padEnd(8)}\t${log.role.padEnd(12)}\t${log.reason}`
          );
        });
        if (migratedLogs.length > 50) {
          console.log(`... 그 외 ${migratedLogs.length - 50}명`);
        }
      }
      
      if (skippedLogs.length > 0) {
        console.log('\n⚠️  이메일 없어서 건너뛴 사용자:');
        skippedLogs.slice(0, 20).forEach((log) => {
          console.log(
            `${log.id.substring(0, 10)}...\t${log.name.substring(0, 12).padEnd(12)}\t${log.email.substring(0, 24).padEnd(24)}\t${log.status.padEnd(8)}\t${log.role.padEnd(12)}\t${log.reason}`
          );
        });
        if (skippedLogs.length > 20) {
          console.log(`... 그 외 ${skippedLogs.length - 20}명`);
        }
      }
    }

    console.log('\n✅ 마이그레이션 완료!');
    
    if (dryRun) {
      console.log('\n💡 실제로 마이그레이션을 실행하려면 --dry-run 옵션 없이 다시 실행하세요:');
      console.log('   npm run migrate:auth-providers');
    }
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    throw error;
  }
}

// 스크립트 실행
const isDryRun = process.argv.includes('--dry-run');

migrateAuthProviders(isDryRun)
  .then(() => {
    console.log('\n프로그램 종료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n프로그램 오류:', error);
    process.exit(1);
  });
