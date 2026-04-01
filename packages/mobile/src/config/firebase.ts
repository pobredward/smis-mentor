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

// Auth 초기화 (React Native용 AsyncStorage persistence 설정)
let auth: Auth;
try {
  // 이미 초기화된 경우 getAuth 사용
  auth = getAuth(app);
} catch {
  // 처음 초기화하는 경우 initializeAuth + AsyncStorage 사용
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

export { app, functions, db, storage, auth };



