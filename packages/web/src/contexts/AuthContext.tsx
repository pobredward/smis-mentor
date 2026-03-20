'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserByEmail, updateUserActiveJobCode } from '@/lib/firebaseService';
import { User } from '@/types';

type AuthContextType = {
  currentUser: FirebaseUser | null;
  userData: User | null;
  loading: boolean;
  authReady: boolean;
  refreshUserData: () => Promise<void>;
  waitForAuthReady: () => Promise<void>;
  updateActiveJobCode: (jobCodeId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userData: null,
  loading: true,
  authReady: false,
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
    if (currentUser?.email) {
      try {
        const userRecord = await getUserByEmail(currentUser.email);
        if (userRecord) {
          setUserData(userRecord as unknown as User);
        }
      } catch (error) {
        console.error('Failed to refresh user data:', error);
      }
    }
  }, [currentUser?.email]);

  // activeJobExperienceId 업데이트 함수
  const updateActiveJobCode = useCallback(async (jobCodeId: string) => {
    if (!userData?.userId) {
      throw new Error('사용자 정보가 없습니다.');
    }

    try {
      await updateUserActiveJobCode(userData.userId, jobCodeId);
      await refreshUserData();
    } catch (error) {
      console.error('기수 변경 실패:', error);
      throw error;
    }
  }, [userData?.userId, refreshUserData]);

  useEffect(() => {
    // Firebase 인증 상태 변경 감지
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('Auth state changed:', user ? `로그인됨 (${user.email})` : '로그아웃됨');
      setCurrentUser(user);
      
      if (user) {
        // 이메일이 없는 경우 (비정상 상태)
        if (!user.email) {
          console.warn('Firebase Auth 사용자에 이메일이 없습니다. 로그아웃 처리합니다.');
          setUserData(null);
          setLoading(false);
          setAuthReady(true);
          return;
        }
        
        try {
          const userRecord = await getUserByEmail(user.email);
          if (userRecord) {
            setUserData(userRecord as unknown as User);
            console.log('사용자 데이터 로드 성공:', userRecord.name);
          } else {
            console.warn('사용자 데이터를 찾을 수 없습니다:', user.email);
            console.log('회원가입 진행 중이거나 Firestore 데이터가 없는 상태일 수 있습니다.');
            // 3초 후 한 번 더 시도
            setTimeout(async () => {
              try {
                const retryUserRecord = await getUserByEmail(user.email || '');
                if (retryUserRecord) {
                  setUserData(retryUserRecord as unknown as User);
                  console.log('재시도로 사용자 데이터 로드 성공:', retryUserRecord.name);
                }
              } catch (retryError) {
                console.error('사용자 데이터 재시도 실패:', retryError);
              }
            }, 3000);
          }
        } catch (error) {
          console.error('사용자 데이터 가져오기 실패:', error);
          // 네트워크 오류 등의 경우 재시도
          setTimeout(async () => {
            try {
              const retryUserRecord = await getUserByEmail(user.email || '');
              if (retryUserRecord) {
                setUserData(retryUserRecord as unknown as User);
                console.log('재시도로 사용자 데이터 로드 성공:', retryUserRecord.name);
              }
            } catch (retryError) {
              console.error('사용자 데이터 재시도 실패:', retryError);
            }
          }, 3000);
        }
      } else {
        setUserData(null);
      }
      
      setLoading(false);
      setAuthReady(true);
    });

    return unsubscribe;
  }, []);

  // Context 값을 useMemo로 메모이제이션
  const value = useMemo(() => ({
    currentUser,
    userData,
    loading,
    authReady,
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