import * as admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * Firebase Admin SDK 초기화 (런타임에만 실행)
 * Vercel 빌드 시점에는 환경 변수가 없을 수 있으므로 lazy initialization 사용
 */
function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.apps[0];
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  // 환경 변수 존재 여부만 로깅 (실제 값은 보안상 로깅하지 않음)
  console.log('🔥 Firebase Admin SDK 초기화 시도:', {
    env: process.env.NODE_ENV,
    hasProjectId: !!projectId,
    hasClientEmail: !!clientEmail,
    hasPrivateKey: !!privateKey,
    privateKeyLength: privateKey?.length || 0,
  });

  if (!projectId || !clientEmail || !privateKey) {
    const missing = [];
    if (!projectId) missing.push('FIREBASE_PROJECT_ID');
    if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
    if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
    
    throw new Error(
      `Firebase Admin SDK 환경 변수가 설정되지 않았습니다. 누락된 변수: ${missing.join(', ')}`
    );
  }

  try {
    const app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
    
    console.log('✅ Firebase Admin SDK 초기화 성공');
    return app;
  } catch (error) {
    console.error('❌ Firebase Admin SDK 초기화 실패:', error);
    throw error;
  }
}

/**
 * Firestore 인스턴스 가져오기 (lazy initialization)
 */
export function getAdminFirestore() {
  initializeFirebaseAdmin();
  const firestore = getFirestore();
  
  // undefined 값을 Firestore에 저장하지 않도록 설정
  firestore.settings({
    ignoreUndefinedProperties: true,
  });
  
  return firestore;
}

/**
 * Auth 인스턴스 가져오기 (lazy initialization)
 */
export function getAdminAuth() {
  initializeFirebaseAdmin();
  return getAuth();
}

/**
 * Admin SDK 인스턴스 가져오기
 */
export function getAdminApp() {
  return initializeFirebaseAdmin();
}

/**
 * FieldValue (서버 타임스탬프 등)
 */
export const adminFieldValue = admin.firestore.FieldValue;
