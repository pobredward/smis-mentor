/**
 * User Role 마이그레이션 스크립트
 * 
 * 기존 'user' role을 새로운 role 체계로 변환합니다:
 * - status = 'temp' && role = 'user' → role = 'mentor_temp'
 * - status = 'active' && role = 'user' → role = 'mentor'
 * - status = 'temp' && role = 'foreign' → role = 'foreign_temp' (이미 foreign인 경우)
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

interface User {
  id: string;
  role?: string;
  status?: string;
  name?: string;
  email?: string;
}

async function migrateUserRoles(dryRun: boolean = false) {
  console.log('🚀 User Role 마이그레이션 시작...');
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
    const migrationLog: Array<{
      id: string;
      name: string;
      email: string;
      oldRole: string;
      newRole: string;
      status: string;
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
      const currentRole = userData.role || '';
      const status = userData.status || 'active';

      let newRole: string | null = null;

      // 마이그레이션 로직
      if (currentRole === 'user') {
        if (status === 'temp') {
          newRole = 'mentor_temp';
        } else if (status === 'active') {
          newRole = 'mentor';
        }
      } else if (currentRole === 'foreign' && status === 'temp') {
        // foreign인데 temp인 경우 foreign_temp로 변환
        newRole = 'foreign_temp';
      }

      if (newRole) {
        // 마이그레이션 필요
        migrationLog.push({
          id: userId,
          name: userData.name || 'Unknown',
          email: userData.email || 'Unknown',
          oldRole: currentRole,
          newRole,
          status,
        });

        if (!dryRun) {
          const userRef = db.collection('users').doc(userId);
          batch.update(userRef, {
            role: newRole,
            updatedAt: new Date(),
          });

          batchCount++;

          // 배치 크기에 도달하면 커밋
          if (batchCount >= BATCH_SIZE) {
            await batch.commit();
            console.log(`✅ ${batchCount}개의 사용자 업데이트 완료 (진행: ${migratedUsers}/${totalUsers})`);
            batchCount = 0;
          }
        }

        migratedUsers++;
      } else {
        skippedUsers++;
      }
    }

    // 남은 배치 커밋
    if (!dryRun && batchCount > 0) {
      await batch.commit();
      console.log(`✅ 마지막 ${batchCount}개의 사용자 업데이트 완료`);
    }

    // 결과 출력
    console.log('\n' + '='.repeat(60));
    console.log('📈 마이그레이션 결과 요약');
    console.log('='.repeat(60));
    console.log(`총 사용자 수: ${totalUsers}`);
    console.log(`마이그레이션된 사용자: ${migratedUsers}`);
    console.log(`건너뛴 사용자: ${skippedUsers}`);
    console.log('='.repeat(60) + '\n');

    if (migrationLog.length > 0) {
      console.log('📝 마이그레이션된 사용자 목록:\n');
      console.log('ID\t\t\t이름\t\t이메일\t\t\t이전 Role\t새 Role\t\tStatus');
      console.log('-'.repeat(120));
      migrationLog.forEach((log) => {
        console.log(
          `${log.id.substring(0, 8)}...\t${log.name.padEnd(12)}\t${log.email.substring(0, 20).padEnd(20)}\t${log.oldRole.padEnd(12)}\t${log.newRole.padEnd(12)}\t${log.status}`
        );
      });
    }

    console.log('\n✅ 마이그레이션 완료!');
  } catch (error) {
    console.error('❌ 마이그레이션 실패:', error);
    throw error;
  }
}

// 스크립트 실행
const isDryRun = process.argv.includes('--dry-run');

migrateUserRoles(isDryRun)
  .then(() => {
    console.log('\n프로그램 종료');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n프로그램 오류:', error);
    process.exit(1);
  });
