/**
 * 특정 사용자의 Provider ID 수정 스크립트
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
  if (fs.existsSync(serviceAccountPath)) {
    initializeApp({
      credential: cert(serviceAccountPath),
    });
  } else {
    initializeApp({
      projectId: 'smis-mentor',
    });
  }
}

const db = getFirestore();

async function fixUserProviderId(email: string, dryRun: boolean = false) {
  console.log(`🔧 사용자 Provider ID 수정: ${email}`);
  if (dryRun) {
    console.log('⚠️  DRY RUN 모드\n');
  } else {
    console.log('⚠️  실제 데이터 수정\n');
  }
  
  try {
    const snapshot = await db.collection('users').where('email', '==', email).get();
    
    if (snapshot.empty) {
      console.log('❌ 사용자를 찾을 수 없습니다.');
      return;
    }
    
    const doc = snapshot.docs[0];
    const userData = doc.data();
    
    console.log('✅ 사용자 발견:', {
      id: doc.id,
      name: userData.name,
      email: userData.email,
    });
    
    console.log('\n현재 authProviders:');
    if (userData.authProviders) {
      userData.authProviders.forEach((p: any, i: number) => {
        console.log(`  [${i}] providerId: ${p.providerId}, email: ${p.email}`);
      });
    }
    
    // 수정이 필요한지 확인
    let needsUpdate = false;
    const updatedProviders = userData.authProviders?.map((provider: any) => {
      if (provider.providerId === 'naver.com') {
        needsUpdate = true;
        return { ...provider, providerId: 'naver' };
      } else if (provider.providerId === 'kakao.com') {
        needsUpdate = true;
        return { ...provider, providerId: 'kakao' };
      }
      return provider;
    });
    
    if (!needsUpdate) {
      console.log('\n✅ 수정이 필요하지 않습니다.');
      return;
    }
    
    console.log('\n수정될 authProviders:');
    updatedProviders.forEach((p: any, i: number) => {
      console.log(`  [${i}] providerId: ${p.providerId}, email: ${p.email}`);
    });
    
    if (!dryRun) {
      await db.collection('users').doc(doc.id).update({
        authProviders: updatedProviders,
        updatedAt: Timestamp.now(),
      });
      console.log('\n✅ 업데이트 완료!');
    } else {
      console.log('\n💡 실제로 수정하려면 --fix 옵션을 추가하세요.');
    }
    
  } catch (error) {
    console.error('❌ 오류:', error);
  }
}

const email = process.argv[2];
const shouldFix = process.argv.includes('--fix');

if (!email) {
  console.error('사용법: npm run fix:user-provider <email> [--fix]');
  console.error('예: npm run fix:user-provider user@example.com');
  console.error('    npm run fix:user-provider user@example.com --fix');
  process.exit(1);
}

fixUserProviderId(email, !shouldFix)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('오류:', error);
    process.exit(1);
  });
