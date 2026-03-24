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
    // Firebase Auth 사용자
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
    // 소셜 로그인 사용자 (세션 스토리지)
    else {
      const socialUserStr = sessionStorage.getItem('social_user');
      if (socialUserStr) {
        try {
          const socialUser = JSON.parse(socialUserStr);
          const userRecord = await getUserByEmail(socialUser.email);
          if (userRecord) {
            setUserData(userRecord as unknown as User);
          }
        } catch (error) {
          console.error('Failed to refresh social user data:', error);
        }
      } else {
        // 세션이 없으면 userData 초기화
        setUserData(null);
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
    // 세션 스토리지에서 소셜 로그인 정보 확인 (네이버/카카오)
    const checkSocialSession = async () => {
      const socialUserStr = sessionStorage.getItem('social_user');
      if (socialUserStr) {
        try {
          const socialUser = JSON.parse(socialUserStr);
          console.log('✅ 세션 스토리지에서 소셜 사용자 발견:', socialUser);
          
          // Firestore에서 사용자 데이터 가져오기
          const userRecord = await getUserByEmail(socialUser.email);
          if (userRecord) {
            setUserData(userRecord as unknown as User);
            console.log('✅ 네이버/카카오 사용자 데이터 로드 성공:', userRecord.name);
            setLoading(false);
            setAuthReady(true);
            return true;
          }
        } catch (error) {
          console.error('세션 스토리지 사용자 데이터 로드 실패:', error);
        }
      }
      return false;
    };

    // 소셜 로그인 성공 이벤트 리스너
    const handleSocialLoginSuccess = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('🎉 소셜 로그인 성공 이벤트 수신:', customEvent.detail);
      checkSocialSession();
    };
    
    // 로그아웃 이벤트 리스너
    const handleUserLogout = () => {
      console.log('👋 로그아웃 이벤트 수신');
      setUserData(null);
      setCurrentUser(null);
    };
    
    window.addEventListener('social-login-success', handleSocialLoginSuccess);
    window.addEventListener('user-logout', handleUserLogout);

    // 먼저 세션 스토리지 확인
    checkSocialSession().then((hasSocialSession) => {
      if (hasSocialSession) {
        // 네이버/카카오 로그인된 상태면 Firebase Auth는 무시
        return;
      }

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

      // Cleanup 함수 등록
      return unsubscribe;
    });

    // 페이지 표시될 때마다 세션 확인 (다른 탭에서 로그인한 경우 대응)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkSocialSession();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('social-login-success', handleSocialLoginSuccess);
      window.removeEventListener('user-logout', handleUserLogout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

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