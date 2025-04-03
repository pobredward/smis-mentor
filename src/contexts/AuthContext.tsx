'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getUserByEmail } from '@/lib/firebaseService';
import { User } from '@/types';

type AuthContextType = {
  currentUser: FirebaseUser | null;
  userData: User | null;
  loading: boolean;
  authReady: boolean;
  refreshUserData: () => Promise<void>;
  waitForAuthReady: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userData: null,
  loading: true,
  authReady: false,
  refreshUserData: async () => {},
  waitForAuthReady: async () => {},
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

  useEffect(() => {
    // Firebase 인증 상태 변경 감지
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        try {
          const userRecord = await getUserByEmail(user.email || '');
          if (userRecord) {
            setUserData(userRecord as unknown as User);
          }
        } catch (error) {
          console.error('Failed to fetch user data:', error);
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
  }), [currentUser, userData, loading, authReady, refreshUserData, waitForAuthReady]);

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}; 