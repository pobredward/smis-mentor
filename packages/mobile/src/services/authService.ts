import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../config/firebase';
import { User } from '../types';
import { getCache, setCache, CACHE_STORE, CACHE_TTL, removeCache } from './cacheUtils';

const STORAGE_KEYS = {
  REMEMBER_ME: '@smis_remember_me',
  SAVED_EMAIL: '@smis_saved_email',
  LOGIN_EXPIRY: '@smis_login_expiry',
} as const;

// 사용자 조회
export const getUserByEmail = async (email: string): Promise<User | null> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    return { ...doc.data(), userId: doc.id } as User;
  } catch (error) {
    console.error('사용자 조회 실패:', error);
    throw error;
  }
};

export const getUserByPhone = async (phone: string): Promise<User | null> => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('phone', '==', phone));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    return { ...doc.data(), userId: doc.id } as User;
  } catch (error) {
    console.error('전화번호로 사용자 조회 실패:', error);
    throw error;
  }
};

export const getUserById = async (userId: string): Promise<User | null> => {
  try {
    // userId 유효성 검사
    if (!userId || typeof userId !== 'string') {
      console.error('유효하지 않은 userId:', userId);
      return null;
    }

    // 캐시에서 데이터 확인
    const cachedUser = await getCache<User>(CACHE_STORE.USERS, userId);
    if (cachedUser) {
      console.log('캐시에서 사용자 정보 로드:', userId);
      return cachedUser;
    }

    // 캐시에 없는 경우 Firestore에서 조회
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      console.warn('사용자를 찾을 수 없음:', userId);
      return null;
    }
    
    const userData = { ...userDoc.data(), userId: userDoc.id } as User;
    
    // 캐시에 저장 (1시간 유효)
    await setCache(CACHE_STORE.USERS, userData, CACHE_TTL.MEDIUM);
    
    return userData;
  } catch (error) {
    console.error('사용자 조회 실패:', error);
    return null; // throw 대신 null 반환
  }
};

export const getUserJobCodesInfo = async (
  jobExperiences: string[]
): Promise<{ generation: string; code: string; name: string }[]> => {
  try {
    const jobCodesInfo: { generation: string; code: string; name: string }[] =
      [];

    for (const jobExperience of jobExperiences) {
      const jobDocRef = doc(db, 'jobCodes', jobExperience);
      const jobDoc = await getDoc(jobDocRef);

      if (jobDoc.exists()) {
        const data = jobDoc.data();
        jobCodesInfo.push({
          generation: data.generation || '',
          code: data.code || '',
          name: data.name || '',
        });
      }
    }

    return jobCodesInfo;
  } catch (error) {
    console.error('직무 코드 정보 조회 실패:', error);
    throw error;
  }
};

// 사용자 업데이트
export const updateUser = async (
  userId: string,
  data: Partial<User>
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      ...data,
      updatedAt: Timestamp.now(),
    });
    
    // 캐시 무효화
    await removeCache(CACHE_STORE.USERS, userId);
    console.log('✅ 사용자 정보 업데이트 완료 (캐시 무효화):', userId);
  } catch (error) {
    console.error('사용자 업데이트 실패:', error);
    throw error;
  }
};

// Auth 관련 함수
export const signIn = async (email: string, password: string) => {
  try {
    // 회원가입 직후 로그인 문제 해결을 위해 지연 시간 증가
    await new Promise((resolve) => setTimeout(resolve, 800));

    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    // Firebase 인증 상태가 반영될 시간을 확보
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 로그인 성공 시 마지막 로그인 시간 업데이트
    const userRecord = await getUserByEmail(email);
    if (userRecord) {
      await updateUser(userRecord.userId, {
        lastLoginAt: Timestamp.now(),
      });

      // 사용자 정보 업데이트 후 상태 반영을 위한 짧은 지연
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return userCredential.user;
  } catch (error: any) {
    // 인증 실패는 사용자에게 보여줄 에러이므로 로그 레벨을 낮춤
    if (error.code === 'auth/invalid-credential' || 
        error.code === 'auth/user-not-found' || 
        error.code === 'auth/wrong-password') {
      // 사용자 입력 오류는 조용히 처리
      throw error;
    }
    // 네트워크 오류 등 예상치 못한 오류만 로그
    console.error('로그인 실패:', error);
    throw error;
  }
};

export const signUp = async (email: string, password: string) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    return userCredential;
  } catch (error) {
    console.error('회원가입 실패:', error);
    throw error;
  }
};

export const sendVerificationEmail = async (user: FirebaseUser) => {
  try {
    await sendEmailVerification(user);
    return true;
  } catch (error) {
    console.error('이메일 인증 메일 발송 실패:', error);
    throw error;
  }
};

export const resetPassword = async (email: string) => {
  try {
    // 1. Firestore에서 사용자 확인
    const user = await getUserByEmail(email);
    if (!user) {
      throw new Error('등록되지 않은 이메일입니다. 회원가입을 진행해주세요.');
    }

    // 2. 비밀번호 재설정 메일 발송
    await sendPasswordResetEmail(auth, email);
    console.log('비밀번호 재설정 메일 발송 성공:', email);
    return true;
  } catch (error: any) {
    console.error('비밀번호 재설정 메일 발송 실패:', error);
    
    // Firebase Auth 에러 코드 처리
    if (error?.code === 'auth/user-not-found') {
      throw new Error('등록되지 않은 이메일입니다. 회원가입을 진행해주세요.');
    }
    
    throw error;
  }
};

export const signOut = async () => {
  try {
    // Firebase 로그아웃
    await firebaseSignOut(auth);
    
    // 저장된 로그인 정보 삭제 (단, 사용자가 명시적으로 로그아웃하는 경우에만)
    // "로그인 저장" 기능은 유지하되, 로그아웃 시에는 세션을 완전히 종료
    // 다음 로그인 시 다시 "로그인 저장"을 선택할 수 있음
  } catch (error) {
    console.error('로그아웃 실패:', error);
    throw error;
  }
};

