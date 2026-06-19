'use client';

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { getUserByEmail, getUserById, updateUserActiveJobCode } from '@/lib/firebaseService';
import { removeCache, CACHE_STORE } from '@/lib/cacheUtils';
import { User } from '@/types';
import { logger, ensureActiveJobExperience } from '@smis-mentor/shared';

type AuthContextType = {
  currentUser: FirebaseUser | null;
  userData: User | null;
  loading: boolean;
  authReady: boolean;
  isAuthenticated: boolean; // Firebase Auth 또는 소셜 로그인 여부
  refreshUserData: () => Promise<void>;
  waitForAuthReady: () => Promise<void>;
  updateActiveJobCode: (jobCodeId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userData: null,
  loading: true,
  authReady: false,
  isAuthenticated: false,
  refreshUserData: async () => {},
  waitForAuthReady: async () => {},
  updateActiveJobCode: async () => {},
});

export const useAuth = () => useContext(AuthContext);

type AuthProviderProps = {
  children: ReactNode;
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  // Firestore users/{uid} 실시간 구독 cleanup 함수 ref
  const userDocUnsubscribeRef = useRef<(() => void) | null>(null);

  // 인증 준비 상태를 기다리는 함수 - useCallback으로 최적화
  const waitForAuthReady = useCallback(async (): Promise<void> => {
    if (authReady) return Promise.resolve();
    return new Promise((resolve) => {
      const checkReady = () => {
        if (authReady) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    });
  }, [authReady]);

  // 사용자 데이터 새로고침 함수 - useCallback으로 최적화
  const refreshUserData = useCallback(async () => {
    if (!currentUser) return;

    try {
      // Apple 등 이메일 없는 소셜 로그인은 UID로 조회
      const userRecord = currentUser.email
        ? await getUserByEmail(currentUser.email)
        : await getUserById(currentUser.uid);
      if (!userRecord) return;

      // mentor_temp나 foreign_temp 사용자를 자동으로 활성 상태로 업데이트
      if ((userRecord.role === 'mentor_temp' || userRecord.role === 'foreign_temp') && userRecord.status === 'temp') {
        try {
          logger.info('🔄 웹 로그인 - 임시 사용자를 활성 상태로 업데이트 중:', userRecord.email);

          const { doc, updateDoc } = await import('firebase/firestore');
          const newRole = userRecord.role === 'mentor_temp' ? 'mentor' : 'foreign';

          await updateDoc(doc(db, 'users', userRecord.userId), {
            role: newRole,
            status: 'active',
            updatedAt: new Date(),
          });

          userRecord.role = newRole as any;
          userRecord.status = 'active';

          logger.info('✅ 웹 사용자 상태 업데이트 완료:', { role: newRole, status: 'active' });
        } catch (error) {
          logger.error('❌ 웹 사용자 상태 업데이트 실패:', error);
        }
      }

      // 활성 캠프 자동 선택
      const activeJobExpId = await ensureActiveJobExperience(db, userRecord as unknown as User);
      if (activeJobExpId && !userRecord.activeJobExperienceId) {
        userRecord.activeJobExperienceId = activeJobExpId;
      }
      setUserData(userRecord as unknown as User);
    } catch (error) {
      logger.error('Failed to refresh user data:', error);
    }
  }, [currentUser]);

  // activeJobExperienceId 업데이트 함수
  const updateActiveJobCode = useCallback(async (jobCodeId: string) => {
    if (!userData?.userId) {
      throw new Error('사용자 정보가 없습니다.');
    }

    try {
      await updateUserActiveJobCode(userData.userId, jobCodeId);
      await refreshUserData();
    } catch (error) {
      logger.error('기수 변경 실패:', error);
      throw error;
    }
  }, [userData?.userId, refreshUserData]);

  // users/{uid} 실시간 구독 시작 함수
  const subscribeToUserDoc = useCallback((uid: string) => {
    // 기존 구독이 있으면 먼저 해제
    if (userDocUnsubscribeRef.current) {
      userDocUnsubscribeRef.current();
      userDocUnsubscribeRef.current = null;
    }

    logger.info('🔔 users 문서 실시간 구독 시작:', uid);

    const userRef = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(
      userRef,
      async (snapshot) => {
        if (!snapshot.exists()) {
          logger.warn('⚠️ users 문서 없음 (onSnapshot):', uid);
          return;
        }

        const updatedData = { ...snapshot.data(), userId: uid } as unknown as User;

        // IndexedDB 캐시 무효화 — 다음 getUserById 호출 시 최신 데이터를 읽도록
        await removeCache(CACHE_STORE.USERS, uid);

        // 활성 캠프 자동 선택
        const activeJobExpId = await ensureActiveJobExperience(db, updatedData);
        if (activeJobExpId && !updatedData.activeJobExperienceId) {
          updatedData.activeJobExperienceId = activeJobExpId;
        }

        setUserData(updatedData);
        logger.info('🔄 users 문서 변경 감지 → userData 갱신:', updatedData.name);
      },
      (error) => {
        logger.error('❌ users 문서 구독 오류:', error);
      }
    );

    userDocUnsubscribeRef.current = unsubscribe;
    return unsubscribe;
  }, []);

  useEffect(() => {
    // 로그아웃 이벤트 리스너
    const handleUserLogout = () => {
      logger.info('👋 로그아웃 이벤트 수신');
      // 실시간 구독 해제
      if (userDocUnsubscribeRef.current) {
        userDocUnsubscribeRef.current();
        userDocUnsubscribeRef.current = null;
      }
      setUserData(null);
      setCurrentUser(null);
    };

    window.addEventListener('user-logout', handleUserLogout);

    // Firebase 인증 상태 변경 감지
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      logger.info('Auth state changed:', user ? `로그인됨 (${user.email})` : '로그아웃됨');
      setCurrentUser(user);

      if (user) {
        // 이메일이 없는 경우 → UID로 Firestore 직접 조회 (Custom Token 로그인 시 발생 가능)
        if (!user.email) {
          logger.warn('Firebase Auth 사용자에 이메일이 없습니다. UID로 Firestore 조회를 시도합니다.', user.uid);
          try {
            const userByUid = await getUserById(user.uid);
            if (userByUid) {
              const activeJobExpId = await ensureActiveJobExperience(db, userByUid as unknown as User);
              if (activeJobExpId && !userByUid.activeJobExperienceId) {
                userByUid.activeJobExperienceId = activeJobExpId;
              }
              setUserData(userByUid as unknown as User);
              logger.info('UID로 사용자 데이터 로드 성공:', userByUid.name);
              // uid 기반으로 실시간 구독 시작
              subscribeToUserDoc(user.uid);
            } else {
              logger.warn('UID로도 사용자를 찾을 수 없습니다:', user.uid);
              setUserData(null);
            }
          } catch (err) {
            logger.error('UID로 사용자 조회 실패:', err);
            setUserData(null);
          }
          setLoading(false);
          setAuthReady(true);
          return;
        }

        try {
          const userRecord = await getUserByEmail(user.email);
          if (userRecord) {
            // 활성 캠프 자동 선택
            const activeJobExpId = await ensureActiveJobExperience(db, userRecord as unknown as User);
            if (activeJobExpId && !userRecord.activeJobExperienceId) {
              userRecord.activeJobExperienceId = activeJobExpId;
            }
            setUserData(userRecord as unknown as User);
            logger.info('사용자 데이터 로드 성공:', userRecord.name);
            // 초기 데이터 로드 후 실시간 구독 시작 (userId 또는 uid 사용)
            const docId = userRecord.userId || user.uid;
            subscribeToUserDoc(docId);
          } else {
            logger.warn('사용자 데이터를 찾을 수 없습니다:', user.email);
            // 소셜 회원가입 직후 Firestore 문서가 아직 없을 수 있으므로 재시도
            const retryWithDelay = async (delayMs: number): Promise<boolean> => {
              await new Promise(resolve => setTimeout(resolve, delayMs));
              try {
                const retryUserRecord = await getUserByEmail(user.email || '');
                if (retryUserRecord) {
                  const activeJobExpId = await ensureActiveJobExperience(db, retryUserRecord as unknown as User);
                  if (activeJobExpId && !retryUserRecord.activeJobExperienceId) {
                    retryUserRecord.activeJobExperienceId = activeJobExpId;
                  }
                  setUserData(retryUserRecord as unknown as User);
                  logger.info('재시도로 사용자 데이터 로드 성공:', retryUserRecord.name);
                  const docId = retryUserRecord.userId || user.uid;
                  subscribeToUserDoc(docId);
                  return true;
                }
              } catch (retryError) {
                logger.error('사용자 데이터 재시도 실패:', retryError);
              }
              return false;
            };

            // 1차 재시도 (1.5초 후), 2차 재시도 (추가 3초 후)
            const firstRetry = await retryWithDelay(1500);
            if (!firstRetry) {
              await retryWithDelay(3000);
            }
          }
        } catch (error) {
          logger.error('사용자 데이터 가져오기 실패:', error);
          try {
            await new Promise(resolve => setTimeout(resolve, 3000));
            const retryUserRecord = await getUserByEmail(user.email || '');
            if (retryUserRecord) {
              const activeJobExpId = await ensureActiveJobExperience(db, retryUserRecord as unknown as User);
              if (activeJobExpId && !retryUserRecord.activeJobExperienceId) {
                retryUserRecord.activeJobExperienceId = activeJobExpId;
              }
              setUserData(retryUserRecord as unknown as User);
              logger.info('재시도로 사용자 데이터 로드 성공:', retryUserRecord.name);
              const docId = retryUserRecord.userId || user.uid;
              subscribeToUserDoc(docId);
            }
          } catch (retryError) {
            logger.error('사용자 데이터 재시도 실패:', retryError);
          }
        }
      } else {
        // 로그아웃: 실시간 구독 해제
        if (userDocUnsubscribeRef.current) {
          userDocUnsubscribeRef.current();
          userDocUnsubscribeRef.current = null;
          logger.info('🔕 users 문서 실시간 구독 해제 (로그아웃)');
        }
        setUserData(null);
      }

      setLoading(false);
      setAuthReady(true);
    });

    return () => {
      window.removeEventListener('user-logout', handleUserLogout);
      unsubscribe();
      // 컴포넌트 언마운트 시 구독 해제
      if (userDocUnsubscribeRef.current) {
        userDocUnsubscribeRef.current();
        userDocUnsubscribeRef.current = null;
      }
    };
  }, [subscribeToUserDoc]);

  // Context 값을 useMemo로 메모이제이션
  const value = useMemo(() => ({
    currentUser,
    userData,
    loading,
    authReady,
    isAuthenticated: !!(currentUser || userData), // Firebase Auth 또는 소셜 로그인(세션) 여부
    refreshUserData,
    waitForAuthReady,
    updateActiveJobCode,
  }), [currentUser, userData, loading, authReady, refreshUserData, waitForAuthReady, updateActiveJobCode]);

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}; 