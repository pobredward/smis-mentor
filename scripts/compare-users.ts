import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

// ES Module에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Firebase Admin 초기화
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
      console.log('📌 Application Default Credentials를 사용합니다.\n');
      
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
    console.log('   - gcloud auth application-default login\n');
    process.exit(1);
  }
}

const db = getFirestore();

interface UserData {
  [key: string]: any;
}

/**
 * 두 사용자의 Firestore 구조를 비교합니다
 */
async function compareUsers(userId1: string, userId2: string) {
  try {
    console.log('\n========================================');
    console.log('두 사용자의 Firestore 구조 비교');
    console.log('========================================\n');

    // 두 사용자 데이터 조회
    const user1Doc = await db.collection('users').doc(userId1).get();
    const user2Doc = await db.collection('users').doc(userId2).get();

    if (!user1Doc.exists) {
      console.error(`❌ 사용자 1을 찾을 수 없습니다: ${userId1}`);
      return;
    }

    if (!user2Doc.exists) {
      console.error(`❌ 사용자 2를 찾을 수 없습니다: ${userId2}`);
      return;
    }

    const user1Data = user1Doc.data() as UserData;
    const user2Data = user2Doc.data() as UserData;

    console.log(`✅ 사용자 1: ${user1Data.name || '이름 없음'} (${userId1})`);
    console.log(`✅ 사용자 2: ${user2Data.name || '이름 없음'} (${userId2})\n`);

    // 필드 비교
    const user1Fields = new Set(Object.keys(user1Data));
    const user2Fields = new Set(Object.keys(user2Data));

    const allFields = new Set([...user1Fields, ...user2Fields]);
    const commonFields = new Set([...user1Fields].filter(x => user2Fields.has(x)));
    const onlyUser1Fields = new Set([...user1Fields].filter(x => !user2Fields.has(x)));
    const onlyUser2Fields = new Set([...user2Fields].filter(x => !user1Fields.has(x)));

    console.log('📊 필드 통계:');
    console.log(`   전체 필드 수: ${allFields.size}`);
    console.log(`   공통 필드 수: ${commonFields.size}`);
    console.log(`   사용자 1만 있는 필드 수: ${onlyUser1Fields.size}`);
    console.log(`   사용자 2만 있는 필드 수: ${onlyUser2Fields.size}\n`);

    // 사용자 1만 있는 필드
    if (onlyUser1Fields.size > 0) {
      console.log('🔵 사용자 1만 있는 필드:');
      onlyUser1Fields.forEach(field => {
        const value = user1Data[field];
        const valuePreview = getValuePreview(value);
        console.log(`   - ${field}: ${valuePreview}`);
      });
      console.log();
    }

    // 사용자 2만 있는 필드
    if (onlyUser2Fields.size > 0) {
      console.log('🟢 사용자 2만 있는 필드:');
      onlyUser2Fields.forEach(field => {
        const value = user2Data[field];
        const valuePreview = getValuePreview(value);
        console.log(`   - ${field}: ${valuePreview}`);
      });
      console.log();
    }

    // 공통 필드 중 값이 다른 필드
    console.log('🔄 공통 필드 비교 (값이 다른 경우만 표시):');
    let differenceCount = 0;
    commonFields.forEach(field => {
      const value1 = user1Data[field];
      const value2 = user2Data[field];

      if (!isEqual(value1, value2)) {
        differenceCount++;
        console.log(`\n   📌 ${field}:`);
        console.log(`      사용자 1: ${getValuePreview(value1)}`);
        console.log(`      사용자 2: ${getValuePreview(value2)}`);
      }
    });

    if (differenceCount === 0) {
      console.log('   ✅ 모든 공통 필드의 값이 동일합니다.\n');
    } else {
      console.log(`\n   총 ${differenceCount}개의 필드에서 값 차이가 있습니다.\n`);
    }

    // 상세 JSON 출력
    console.log('========================================');
    console.log('사용자 1 전체 데이터 (JSON):');
    console.log('========================================');
    console.log(JSON.stringify(serializeFirestoreData(user1Data), null, 2));
    console.log('\n========================================');
    console.log('사용자 2 전체 데이터 (JSON):');
    console.log('========================================');
    console.log(JSON.stringify(serializeFirestoreData(user2Data), null, 2));

  } catch (error) {
    console.error('❌ 오류 발생:', error);
  } finally {
    process.exit(0);
  }
}

/**
 * 값의 미리보기를 생성합니다
 */
function getValuePreview(value: any): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  const type = typeof value;

  if (type === 'string') {
    return value.length > 50 ? `"${value.substring(0, 50)}..."` : `"${value}"`;
  }

  if (type === 'number' || type === 'boolean') {
    return String(value);
  }

  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }

  if (type === 'object') {
    const keys = Object.keys(value);
    return `Object(${keys.length} keys: ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''})`;
  }

  return String(value);
}

/**
 * 두 값이 동일한지 비교합니다
 */
function isEqual(value1: any, value2: any): boolean {
  // 타입이 다르면 false
  if (typeof value1 !== typeof value2) {
    return false;
  }

  // null, undefined 체크
  if (value1 === null || value1 === undefined) {
    return value1 === value2;
  }

  // Timestamp 비교
  if (value1 && typeof value1 === 'object' && 'toDate' in value1 && 
      value2 && typeof value2 === 'object' && 'toDate' in value2) {
    return value1.toDate().getTime() === value2.toDate().getTime();
  }

  // 배열 비교
  if (Array.isArray(value1) && Array.isArray(value2)) {
    if (value1.length !== value2.length) {
      return false;
    }
    return value1.every((item, index) => isEqual(item, value2[index]));
  }

  // 객체 비교
  if (typeof value1 === 'object' && typeof value2 === 'object') {
    const keys1 = Object.keys(value1);
    const keys2 = Object.keys(value2);

    if (keys1.length !== keys2.length) {
      return false;
    }

    return keys1.every(key => isEqual(value1[key], value2[key]));
  }

  // 기본 타입 비교
  return value1 === value2;
}

/**
 * Firestore 데이터를 JSON 직렬화 가능하게 변환합니다
 */
function serializeFirestoreData(data: any): any {
  if (data === null || data === undefined) {
    return data;
  }

  if (data && typeof data === 'object' && 'toDate' in data && typeof data.toDate === 'function') {
    return {
      _type: 'Timestamp',
      _value: data.toDate().toISOString()
    };
  }

  if (Array.isArray(data)) {
    return data.map(item => serializeFirestoreData(item));
  }

  if (typeof data === 'object') {
    const result: any = {};
    Object.keys(data).forEach(key => {
      result[key] = serializeFirestoreData(data[key]);
    });
    return result;
  }

  return data;
}

// 실행
const userId1 = process.argv[2] || 'bWgPGXChcGc4j6AhWl4LcDjpxeJ3';
const userId2 = process.argv[3] || '7IqQlrd6aHcaEic1sHpglySI3VT2';

compareUsers(userId1, userId2);
