'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

  // 인증 준비 상태를 기다리는 함수
  const waitForAuthReady = async (): Promise<void> => {
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
  };

  const refreshUserData = async () => {
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
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        try {
          console.log('사용자 인증 성공:', user.email);
          const userRecord = await getUserByEmail(user.email || '');
          if (userRecord) {
            console.log('Firestore 사용자 데이터 로드 성공:', userRecord.role);
            setUserData(userRecord as unknown as User);
          } else {
            console.error('Firestore에 사용자 데이터가 없음:', user.email);
            setUserData(null);
          }
        } catch (error) {
          console.error('Firestore 사용자 데이터 로드 실패:', error);
          setUserData(null);
        }
      } else {
        setUserData(null);
      }
      
      setLoading(false);
      setAuthReady(true);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userData,
    loading,
    authReady,
    refreshUserData,
    waitForAuthReady,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}; 