import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFunctions } from 'firebase/functions';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { 
  initializeAuth, 
  getAuth,
  getReactNativePersistence 
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
let app;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

// Functions, Firestore, Storage 초기화
const functions = getFunctions(app, 'asia-northeast3');
const db = getFirestore(app);
const storage = getStorage(app);

// Auth 초기화 (React Native용 AsyncStorage persistence 사용)
// 중복 초기화 방지를 위해 try-catch 사용
let auth;
try {
  auth = getAuth(app);
} catch (error) {
  // Auth가 아직 초기화되지 않은 경우에만 initializeAuth 호출
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
}

export { app, functions, db, storage, auth };



