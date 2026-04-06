import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFunctions } from 'firebase/functions';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { 
  getAuth, 
  initializeAuth,
  getReactNativePersistence,
  type Auth 
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyA-WkaKCq_XWSuNyzoZkx__9S02WS4RIWQ',
  authDomain: 'smis-mentor.firebaseapp.com',
  projectId: 'smis-mentor',
  storageBucket: 'smis-mentor.firebasestorage.app',
  messagingSenderId: '382190683951',
  appId: '1:382190683951:ios:ab4038222658ff9064c3da',
};

// Firebase 앱 초기화 (중복 초기화 방지)
const app: FirebaseApp = getApps().length === 0 
  ? initializeApp(firebaseConfig) 
  : getApp();

// Functions, Firestore, Storage 초기화
const functions = getFunctions(app, 'asia-northeast3');
const db = getFirestore(app);
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



