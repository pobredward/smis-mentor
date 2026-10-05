import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFunctions } from 'firebase/functions';
import { initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { 
  getAuth, 
  initializeAuth,
  type Auth,
  type Persistence
} from 'firebase/auth';
// SDK 57 / Firebase 11: getReactNativePersistence가 firebase/auth 타입에서 제거됨
// 런타임에서는 정상 동작하므로 타입 캐스팅으로 처리
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const { getReactNativePersistence } = require('firebase/auth') as { getReactNativePersistence: (storage: unknown) => Persistence };
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase 웹 앱 설정 — EAS 환경 변수 (웹의 NEXT_PUBLIC_FIREBASE_* 와 같은 값). 공개 값이지만 프로젝트마다 다르므로 코드에 두지 않는다
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  // 빌드 환경 변수가 빠졌을 때 엉뚱한 프로젝트에 붙지 않도록 바로 알린다
  console.error('[firebase] EXPO_PUBLIC_FIREBASE_* 환경 변수가 없습니다 (EAS 환경 변수 확인)');
}

// Firebase 앱 초기화 (중복 초기화 방지)
const app: FirebaseApp = getApps().length === 0 
  ? initializeApp(firebaseConfig) 
  : getApp();

// Functions, Firestore, Storage 초기화
const functions = getFunctions(app, 'asia-northeast3');
const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
const storage = getStorage(app);

// Auth 초기화: 반드시 initializeAuth를 먼저 시도해야 AsyncStorage 영속화가 적용됨.
// getAuth만 호출하면 RN에서 기본 persistence로 열리며, 앱 재시작 시 세션이 유지되지 않을 수 있음.
let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

export { app, functions, db, storage, auth };



