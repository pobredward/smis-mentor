/**
 * 특정 사용자의 authProviders 확인 스크립트
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

async function checkUser(email: string) {
  console.log(`🔍 사용자 확인: ${email}\n`);
  
  try {
    const snapshot = await db.collection('users').where('email', '==', email).get();
    
    if (snapshot.empty) {
      console.log('❌ 사용자를 찾을 수 없습니다.');
      return;
    }
    
    const userData = snapshot.docs[0].data();
    
    console.log('✅ 사용자 정보:');
    console.log('  - ID:', snapshot.docs[0].id);
    console.log('  - 이름:', userData.name);
    console.log('  - 이메일:', userData.email);
    console.log('  - 상태:', userData.status);
    console.log('  - 역할:', userData.role);
    console.log('  - primaryAuthMethod:', userData.primaryAuthMethod || 'NONE');
    console.log('\n  - authProviders:');
    
    if (userData.authProviders && userData.authProviders.length > 0) {
      userData.authProviders.forEach((provider: any, index: number) => {
        console.log(`    [${index}] providerId: ${provider.providerId}`);
        console.log(`        uid: ${provider.uid}`);
        console.log(`        email: ${provider.email}`);
        console.log(`        linkedAt: ${provider.linkedAt?.toDate?.() || provider.linkedAt}`);
      });
    } else {
      console.log('    ❌ authProviders 없음');
    }
    
  } catch (error) {
    console.error('❌ 오류:', error);
  }
}

const email = process.argv[2];

if (!email) {
  console.error('사용법: npm run check:user <email>');
  console.error('예: npm run check:user user@example.com');
  process.exit(1);
}

checkUser(email)
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('오류:', error);
    process.exit(1);
  });
