#!/usr/bin/env node

/**
 * Firebase 설정 확인 스크립트
 * 
 * 사용법: node check-firebase-setup.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Firebase 설정을 확인하는 중...\n');

let hasErrors = false;
let hasWarnings = false;

// 1. serviceAccountKey.json 확인
console.log('1️⃣  서비스 계정 키 파일 확인');
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    if (serviceAccount.project_id === 'smis-mentor') {
      console.log('   ✅ serviceAccountKey.json 파일이 올바르게 설정되었습니다.');
    } else {
      console.log('   ⚠️  프로젝트 ID가 일치하지 않습니다.');
      hasWarnings = true;
    }
  } catch (error) {
    console.log('   ❌ serviceAccountKey.json 파일을 읽을 수 없습니다.');
    hasErrors = true;
  }
} else {
  console.log('   ❌ serviceAccountKey.json 파일이 없습니다.');
  hasErrors = true;
}

// 2. storage.rules 확인
console.log('\n2️⃣  Storage Rules 파일 확인');
const storageRulesPath = path.join(__dirname, 'storage.rules');
if (fs.existsSync(storageRulesPath)) {
  const storageRules = fs.readFileSync(storageRulesPath, 'utf8');
  if (storageRules.includes('rules_version')) {
    console.log('   ✅ storage.rules 파일이 존재합니다.');
  } else {
    console.log('   ⚠️  storage.rules 파일 형식이 올바르지 않을 수 있습니다.');
    hasWarnings = true;
  }
} else {
  console.log('   ❌ storage.rules 파일이 없습니다.');
  hasErrors = true;
}

// 3. cors.json 확인
console.log('\n3️⃣  CORS 설정 파일 확인');
const corsPath = path.join(__dirname, 'cors.json');
if (fs.existsSync(corsPath)) {
  try {
    const cors = JSON.parse(fs.readFileSync(corsPath, 'utf8'));
    if (Array.isArray(cors) && cors.length > 0) {
      console.log('   ✅ cors.json 파일이 올바르게 설정되었습니다.');
    } else {
      console.log('   ⚠️  cors.json 파일 형식이 올바르지 않습니다.');
      hasWarnings = true;
    }
  } catch (error) {
    console.log('   ❌ cors.json 파일을 읽을 수 없습니다.');
    hasErrors = true;
  }
} else {
  console.log('   ❌ cors.json 파일이 없습니다.');
  hasErrors = true;
}

// 4. firebase.json 확인
console.log('\n4️⃣  Firebase 설정 파일 확인');
const firebaseJsonPath = path.join(__dirname, 'firebase.json');
if (fs.existsSync(firebaseJsonPath)) {
  try {
    const firebaseJson = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
    if (firebaseJson.storage && firebaseJson.storage.rules === 'storage.rules') {
      console.log('   ✅ firebase.json이 storage.rules를 참조하고 있습니다.');
    } else {
      console.log('   ⚠️  firebase.json에서 storage.rules를 참조하지 않고 있습니다.');
      console.log('      현재 값:', firebaseJson.storage?.rules || 'undefined');
      hasWarnings = true;
    }
  } catch (error) {
    console.log('   ❌ firebase.json 파일을 읽을 수 없습니다.');
    hasErrors = true;
  }
} else {
  console.log('   ⚠️  firebase.json 파일이 없습니다. (선택사항)');
  hasWarnings = true;
}

// 5. .gitignore 확인
console.log('\n5️⃣  .gitignore 확인');
const gitignorePath = path.join(__dirname, '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignore = fs.readFileSync(gitignorePath, 'utf8');
  if (gitignore.includes('serviceAccountKey.json')) {
    console.log('   ✅ serviceAccountKey.json이 .gitignore에 추가되었습니다.');
  } else {
    console.log('   ⚠️  serviceAccountKey.json이 .gitignore에 없습니다!');
    console.log('      보안을 위해 추가하는 것을 권장합니다.');
    hasWarnings = true;
  }
} else {
  console.log('   ⚠️  .gitignore 파일이 없습니다.');
  hasWarnings = true;
}

// 6. 환경 변수 확인
console.log('\n6️⃣  Firebase 환경 변수 확인');
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const requiredEnvVars = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_APP_ID'
  ];
  
  const missingVars = requiredEnvVars.filter(varName => !envContent.includes(varName));
  
  if (missingVars.length === 0) {
    console.log('   ✅ 필수 환경 변수가 모두 설정되었습니다.');
  } else {
    console.log('   ⚠️  누락된 환경 변수:', missingVars.join(', '));
    hasWarnings = true;
  }
} else {
  console.log('   ⚠️  .env.local 파일이 없습니다.');
  hasWarnings = true;
}

// 결과 요약
console.log('\n' + '='.repeat(60));
console.log('📊 검사 결과\n');

if (!hasErrors && !hasWarnings) {
  console.log('✅ 모든 설정이 올바르게 완료되었습니다!');
  console.log('\n다음 단계:');
  console.log('1. firebase deploy --only storage:rules');
  console.log('2. gsutil cors set cors.json gs://smis-mentor.firebasestorage.app');
  console.log('3. 서비스 계정 권한 확인');
  console.log('   https://console.cloud.google.com/iam-admin/iam?project=smis-mentor');
} else {
  if (hasErrors) {
    console.log('❌ 오류가 발견되었습니다. 위의 메시지를 확인하세요.');
  }
  if (hasWarnings) {
    console.log('⚠️  경고가 있습니다. 위의 메시지를 확인하세요.');
  }
  console.log('\n자세한 설정 방법은 다음 파일을 참고하세요:');
  console.log('- FIREBASE_SETUP.md (상세 가이드)');
  console.log('- QUICK_FIX.md (빠른 해결 방법)');
}

console.log('='.repeat(60));

process.exit(hasErrors ? 1 : 0);

