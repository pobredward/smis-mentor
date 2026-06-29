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
import { logger } from '@smis-mentor/shared';

const STORAGE_KEYS = {
  REMEMBER_ME: '@smis_remember_me',
  SAVED_EMAIL: '@smis_saved_email',
  LOGIN_EXPIRY: '@smis_login_expiry',
} as const;

/** 로그인 화면 이메일 자동 입력 유지 기간 (Firebase 리프레시 토큰과 별개) */
const LOGIN_REMEMBER_EXPIRY_YEARS = 25;

/**
 * 로그인 성공 시 이메일 자동 입력을 장기간 저장 (로그아웃 시 삭제)
 */
export async function persistLoginRememberEmail(email: string): Promise<void> {
  const expiryDate = new Date();
  expiryDate.setFullYear(expiryDate.getFullYear() + LOGIN_REMEMBER_EXPIRY_YEARS);
  await Promise.all([
    AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_ME, 'true'),
    AsyncStorage.setItem(STORAGE_KEYS.SAVED_EMAIL, email),
    AsyncStorage.setItem(STORAGE_KEYS.LOGIN_EXPIRY, expiryDate.toISOString()),
  ]);
}

export async function clearLoginRememberEmail(): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(STORAGE_KEYS.REMEMBER_ME),
    AsyncStorage.removeItem(STORAGE_KEYS.SAVED_EMAIL),
    AsyncStorage.removeItem(STORAGE_KEYS.LOGIN_EXPIRY),
  ]);
}

/**
 * 저장된 이메일 자동 입력 정보 (만료·미설정 시 null)
 */
export async function getPersistedLoginRememberEmail(): Promise<{
  email: string;
} | null> {
  const [savedRememberMe, savedEmail, loginExpiry] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEYS.REMEMBER_ME),
    AsyncStorage.getItem(STORAGE_KEYS.SAVED_EMAIL),
    AsyncStorage.getItem(STORAGE_KEYS.LOGIN_EXPIRY),
  ]);

  if (savedRememberMe !== 'true' || !savedEmail) {
    return null;
  }

  if (loginExpiry) {
    if (new Date(loginExpiry) <= new Date()) {
      await clearLoginRememberEmail();
      return null;
    }
  }

  return { email: savedEmail };
}

// 사용자 조회
export const getUserByEmail = async (email: string): Promise<User | null> => {
  try {
    if (!email || typeof email !== 'string') {
      return null;
    }

    // Firebase Auth는 항상 소문자로 정규화하므로, Firestore 조회도 소문자로 통일
    const normalizedEmail = email.toLowerCase();
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', normalizedEmail));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    // deleted, inactive 상태 제외 (탈퇴/삭제된 계정)
    // inactive = 본인 탈퇴, deleted = 관리자 삭제
    const activeDocs = querySnapshot.docs.filter(
      d => d.data().status !== 'deleted' && d.data().status !== 'inactive'
    );

    if (activeDocs.length === 0) {
      return null;
    }

    // 여러 문서가 있을 경우 우선순위: active > temp
    if (activeDocs.length > 1) {
      logger.warn('⚠️ 동일한 이메일로 여러 사용자 발견 (deleted/inactive 제외):', {
        email,
        count: activeDocs.length,
      });

      const activeDoc = activeDocs.find(d => d.data().status === 'active');
      if (activeDoc) return { ...activeDoc.data(), userId: activeDoc.id } as User;

      const tempDoc = activeDocs.find(d => d.data().status === 'temp');
      if (tempDoc) return { ...tempDoc.data(), userId: tempDoc.id } as User;
    }

    const first = activeDocs[0];
    return { ...first.data(), userId: first.id } as User;
  } catch (error) {
    logger.error('사용자 조회 실패:', error);
    throw error;
  }
};

export const getUserByPhone = async (phone: string): Promise<User | null> => {
  try {
    const usersRef = collection(db, 'users');

    // deleted, inactive 제외하고 첫 번째 활성 문서 반환
    const pickActive = (docs: Array<{ data: () => Record<string, unknown>; id: string }>) => {
      const active = docs.filter(d => {
        const s = d.data().status;
        return s !== 'deleted' && s !== 'inactive';
      });
      if (active.length === 0) return null;
      return { ...active[0].data(), userId: active[0].id } as User;
    };

    // phoneNumber 필드 우선 조회
    const snap1 = await getDocs(query(usersRef, where('phoneNumber', '==', phone)));
    if (!snap1.empty) {
      const result = pickActive(snap1.docs);
      if (result) return result;
    }

    // phone 필드로 재시도 (하위 호환성)
    const snap2 = await getDocs(query(usersRef, where('phone', '==', phone)));
    if (!snap2.empty) {
      const result = pickActive(snap2.docs);
      if (result) return result;
    }

    return null;
  } catch (error) {
    logger.error('전화번호로 사용자 조회 실패:', error);
    throw error;
  }
};

// 탈퇴(inactive)/삭제(deleted) 포함 전화번호 조회 — 재가입 시 복구 흐름 안내용
export const getUserByPhoneIncludeInactive = async (phone: string): Promise<User | null> => {
  try {
    const usersRef = collection(db, 'users');

    const findFirst = (docs: Array<{ data: () => Record<string, unknown>; id: string }>) => {
      if (docs.length === 0) return null;
      // 우선순위: active > temp > inactive > deleted
      const priority = (s: unknown) => ({ active: 1, temp: 2, inactive: 3, deleted: 4 }[s as string] ?? 99);
      const sorted = [...docs].sort((a, b) => priority(a.data().status) - priority(b.data().status));
      return { ...sorted[0].data(), userId: sorted[0].id } as User;
    };

    const snap1 = await getDocs(query(usersRef, where('phoneNumber', '==', phone)));
    if (!snap1.empty) {
      const result = findFirst(snap1.docs);
      if (result) return result;
    }

    const snap2 = await getDocs(query(usersRef, where('phone', '==', phone)));
    if (!snap2.empty) {
      const result = findFirst(snap2.docs);
      if (result) return result;
    }

    return null;
  } catch (error) {
    logger.error('전화번호로 탈퇴 포함 사용자 조회 실패:', error);
    return null;
  }
};

// 탈퇴(inactive)/삭제(deleted) 포함 이메일 조회 — 재가입 완료 후 기존 문서 마스킹용
export const getUserByEmailIncludeInactive = async (email: string): Promise<User | null> => {
  try {
    if (!email || typeof email !== 'string') return null;

    const normalizedEmail = email.toLowerCase();
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', normalizedEmail));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const inactiveDoc = snapshot.docs.find(d => {
      const s = d.data().status;
      return s === 'inactive' || s === 'deleted';
    });

    return inactiveDoc ? ({ ...inactiveDoc.data(), userId: inactiveDoc.id } as User) : null;
  } catch (error) {
    logger.error('이메일로 탈퇴 사용자 조회 실패:', error);
    return null;
  }
};

/**
 * authProviders에서 소셜 제공자로 사용자 조회
 * Multiple Email Policy 지원
 */
export const getUserBySocialProvider = async (
  providerId: string,
  providerUid: string
): Promise<User | null> => {
  try {
    logger.info('🔍 소셜 제공자로 사용자 검색:', { providerId, providerUid });

    // active + temp 상태 모두 조회 (temp 계정에 소셜이 미리 연동된 케이스 포함)
    const [activeSnapshot, tempSnapshot] = await Promise.all([
      getDocs(query(collection(db, 'users'), where('status', '==', 'active'))),
      getDocs(query(collection(db, 'users'), where('status', '==', 'temp'))),
    ]);

    const normalizedSearchId = providerId.replace('.com', '');

    // active 우선, 그 다음 temp 순서로 반환
    for (const snapshot of [activeSnapshot, tempSnapshot]) {
      for (const doc of snapshot.docs) {
        const userData = doc.data() as User;
        const authProviders = userData.authProviders || [];

        const matchedProvider = authProviders.find((p: any) => {
          const normalizedStoredId = p.providerId.replace('.com', '');
          return normalizedStoredId === normalizedSearchId && p.uid === providerUid;
        });

        if (matchedProvider) {
          logger.info('✅ 소셜 제공자로 사용자 발견:', {
            userId: userData.userId,
            status: userData.status,
            email: userData.email,
            providerId: matchedProvider.providerId,
          });
          return { ...userData, userId: doc.id } as User;
        }
      }
    }

    logger.info('❌ 소셜 제공자로 사용자를 찾을 수 없음');
    return null;
  } catch (error) {
    logger.error('소셜 제공자로 사용자 조회 실패:', error);
    return null;
  }
};

export const getUserById = async (userId: string): Promise<User | null> => {
  try {
    // userId 유효성 검사
    if (!userId || typeof userId !== 'string') {
      logger.error('유효하지 않은 userId:', userId);
      return null;
    }

    // 캐시에서 데이터 확인
    const cachedUser = await getCache<User>(CACHE_STORE.USERS, userId);
    if (cachedUser) {
      logger.info('캐시에서 사용자 정보 로드:', userId);
      return cachedUser;
    }

    // 캐시에 없는 경우 Firestore에서 조회
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      logger.warn('사용자를 찾을 수 없음:', userId);
      return null;
    }
    
    const userData = { ...userDoc.data(), userId: userDoc.id } as User;
    
    // 캐시에 저장 (1시간 유효)
    await setCache(CACHE_STORE.USERS, userData, CACHE_TTL.MEDIUM);
    
    return userData;
  } catch (error) {
    logger.error('사용자 조회 실패:', error);
    return null; // throw 대신 null 반환
  }
};

export const getUserJobCodesInfo = async (
  jobExperiences: string[]
): Promise<{ id: string; generation: string; code: string; name: string }[]> => {
  try {
    const jobCodesInfo: { id: string; generation: string; code: string; name: string }[] =
      [];

    for (const jobExperience of jobExperiences) {
      const jobDocRef = doc(db, 'jobCodes', jobExperience);
      const jobDoc = await getDoc(jobDocRef);

      if (jobDoc.exists()) {
        const data = jobDoc.data();
        jobCodesInfo.push({
          id: jobDoc.id, // Firestore 문서 ID 추가
          generation: data.generation || '',
          code: data.code || '',
          name: data.name || '',
        });
        logger.info(`모바일 - jobCode 조회: id=${jobDoc.id}, code=${data.code}, generation=${data.generation}`);
      }
    }

    return jobCodesInfo;
  } catch (error) {
    logger.error('직무 코드 정보 조회 실패:', error);
    throw error;
  }
};

// 원어민 이름(First + Last)으로 사용자 조회
export const getUserByForeignName = async (
  firstName: string,
  lastName: string
): Promise<User | null> => {
  try {
    if (!firstName || !lastName) return null;

    const q = query(
      collection(db, 'users'),
      where('foreignTeacher.firstName', '==', firstName),
      where('foreignTeacher.lastName', '==', lastName)
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const activeDocs = snapshot.docs.filter(d => d.data().status !== 'deleted');
    if (activeDocs.length === 0) return null;

    // 우선순위: active > temp > inactive
    const sorted = activeDocs.sort((a, b) => {
      const order = { active: 0, temp: 1, inactive: 2 };
      const aOrder = order[(a.data().status as keyof typeof order)] ?? 3;
      const bOrder = order[(b.data().status as keyof typeof order)] ?? 3;
      return aOrder - bOrder;
    });

    return { ...sorted[0].data(), userId: sorted[0].id } as User;
  } catch (error) {
    logger.error('원어민 이름 조회 실패:', error);
    return null;
  }
};

// 사용자 업데이트
export const updateUser = async (
  userId: string,
  data: Partial<User>
): Promise<void> => {
  try {
    const userRef = doc(db, 'users', userId);

    // Firestore는 undefined 값을 허용하지 않으므로 top-level undefined 필드 제거
    const sanitized = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined)
    );

    await updateDoc(userRef, {
      ...sanitized,
      updatedAt: Timestamp.now(),
    });
    
    // 캐시 무효화
    await removeCache(CACHE_STORE.USERS, userId);
    logger.info('✅ 사용자 정보 업데이트 완료 (캐시 무효화):', userId);
  } catch (error) {
    logger.error('사용자 업데이트 실패:', error);
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
      // 탈퇴/삭제된 계정 차단
      if (userRecord.status === 'inactive') {
        await firebaseSignOut(auth);
        throw new Error('ACCOUNT_INACTIVE');
      }
      if (userRecord.status === 'deleted') {
        await firebaseSignOut(auth);
        throw new Error('ACCOUNT_DELETED');
      }

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
    logger.error('로그인 실패:', error);
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
    logger.error('회원가입 실패:', error);
    throw error;
  }
};

/**
 * Custom Token으로 Firebase Auth 로그인
 * 웹 API Route(/api/auth/create-custom-token)를 통해 Custom Token 생성 후 로그인
 * Cloud Functions CORS/배포 문제를 우회하기 위해 Next.js API Route 방식으로 변경
 */
export const signInWithCustomToken = async (userId: string, email: string, existingUid?: string) => {
  try {
    logger.info('🔑 Custom Token 생성 요청:', { userId, email });

    // 웹 API Route를 통해 Custom Token 생성 (Cloud Functions 대체)
    const apiBaseUrl = (process.env.EXPO_PUBLIC_WEB_API_URL || 'https://smis-mentor.com')
      .replace('https://www.', 'https://'); // www 리디렉션 시 POST 손실 방지
    
    const response = await fetch(`${apiBaseUrl}/api/auth/create-custom-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, email, existingUid }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Custom Token 생성 실패');
    }

    const responseData = await response.json();
    const { customToken } = responseData.result as { customToken: string; uid: string };
    logger.info('✅ Custom Token 획득');

    // Custom Token으로 Firebase Auth 로그인
    const { signInWithCustomToken: firebaseSignInWithCustomToken } = await import('firebase/auth');
    const userCredential = await firebaseSignInWithCustomToken(auth, customToken);

    logger.info('✅ Custom Token 로그인 성공:', {
      uid: userCredential.user.uid,
      email: userCredential.user.email,
    });

    return userCredential;
  } catch (error) {
    logger.error('❌ Custom Token 로그인 실패:', error);
    throw error;
  }
};

export const sendVerificationEmail = async (user: FirebaseUser) => {
  try {
    await sendEmailVerification(user);
    return true;
  } catch (error) {
    logger.error('이메일 인증 메일 발송 실패:', error);
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
    logger.info('비밀번호 재설정 메일 발송 성공:', email);
    return true;
  } catch (error: any) {
    logger.error('비밀번호 재설정 메일 발송 실패:', error);
    
    // Firebase Auth 에러 코드 처리
    if (error?.code === 'auth/user-not-found') {
      throw new Error('등록되지 않은 이메일입니다. 회원가입을 진행해주세요.');
    }
    
    throw error;
  }
};

export const signOut = async () => {
  try {
    await firebaseSignOut(auth);
    await clearLoginRememberEmail();
  } catch (error) {
    logger.error('로그아웃 실패:', error);
    throw error;
  }
};

