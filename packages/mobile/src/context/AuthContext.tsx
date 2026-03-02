import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useMemo,
} from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '../config/firebase';
import { getUserByEmail } from '../services/authService';
import { jobCodesService } from '../services';
import { User, AuthContextType } from '../types';

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

  // 인증 준비 상태를 기다리는 함수
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

  // 사용자 데이터 새로고침 함수
  const refreshUserData = useCallback(async () => {
    if (currentUser?.email) {
      try {
        console.log('🔄 AuthContext: userData 새로고침 시작 -', currentUser.email);
        const userRecord = await getUserByEmail(currentUser.email);
        if (userRecord) {
          console.log('✅ AuthContext: userData 새로고침 성공');
          console.log('  - activeJobExperienceId:', userRecord.activeJobExperienceId);
          setUserData(userRecord);
        }
      } catch (error) {
        console.error('❌ AuthContext: Failed to refresh user data:', error);
      }
    }
  }, [currentUser?.email]);

  // activeJobExperienceId 업데이트 함수
  const updateActiveJobCode = useCallback(async (jobCodeId: string) => {
    if (!userData?.userId) {
      throw new Error('사용자 정보가 없습니다.');
    }

    try {
      console.log('🔄 AuthContext: activeJobCode 업데이트 시작');
      console.log('  - userId:', userData.userId);
      console.log('  - 새로운 jobCodeId:', jobCodeId);
      
      await jobCodesService.updateUserActiveJobCode(userData.userId, jobCodeId);
      
      console.log('✅ AuthContext: Firestore 업데이트 완료, userData 새로고침 시작');
      await refreshUserData();
      
      console.log('✅ AuthContext: userData 새로고침 완료');
    } catch (error) {
      console.error('❌ AuthContext: 기수 변경 실패:', error);
      throw error;
    }
  }, [userData?.userId, refreshUserData]);

  useEffect(() => {
    // Firebase 인증 상태 변경 감지
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log(
        'Auth state changed:',
        user ? `로그인됨 (${user.email})` : '로그아웃됨'
      );
      setCurrentUser(user);

      if (user) {
        const loadUserData = async (retryCount = 0) => {
          try {
            const userRecord = await getUserByEmail(user.email || '');
            if (userRecord) {
              setUserData(userRecord);
              console.log('사용자 데이터 로드 성공:', userRecord.name);
            } else if (retryCount < 2) {
              // 최대 2번까지 재시도 (조용히)
              await new Promise((resolve) => setTimeout(resolve, 1500));
              await loadUserData(retryCount + 1);
            } else {
              console.warn('사용자 데이터를 찾을 수 없습니다:', user.email);
            }
          } catch (error) {
            if (retryCount < 2) {
              // 네트워크 오류 등의 경우 재시도 (조용히)
              await new Promise((resolve) => setTimeout(resolve, 1500));
              await loadUserData(retryCount + 1);
            } else {
              console.error('사용자 데이터 가져오기 실패:', error);
            }
          }
        };

        await loadUserData();
      } else {
        setUserData(null);
      }

      setLoading(false);
      setAuthReady(true);
    });

    return unsubscribe;
  }, []);

  // Context 값을 useMemo로 메모이제이션
  const value = useMemo(
    () => ({
      currentUser,
      userData,
      loading,
      authReady,
      refreshUserData,
      waitForAuthReady,
      updateActiveJobCode,
    }),
    [
      currentUser,
      userData,
      loading,
      authReady,
      refreshUserData,
      waitForAuthReady,
      updateActiveJobCode,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
