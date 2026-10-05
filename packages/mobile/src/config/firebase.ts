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

// Firebase 웹 앱 설정 (smiscamp 프로젝트 — 공개 값). EXPO_PUBLIC_FIREBASE_* 환경 변수가 있으면 그 값 (에뮬레이터 · 다른 프로젝트 시험용)
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBRYCardl7mH2ft866rhTst7EZ5GceQv8o',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'smiscamp-bacba.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'smiscamp-bacba',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'smiscamp-bacba.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '628518329710',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:628518329710:web:0cf51dcf656ec3e7e2b57f',
};

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



