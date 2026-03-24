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

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Firebase Admin SDK 환경 변수가 설정되지 않았습니다. FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY를 확인하세요.'
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}

/**
 * Firestore 인스턴스 가져오기 (lazy initialization)
 */
export function getAdminFirestore() {
  initializeFirebaseAdmin();
  return getFirestore();
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
