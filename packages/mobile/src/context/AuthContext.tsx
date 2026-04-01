import { logger } from '@smis-mentor/shared';
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { auth } from '../config/firebase';
import { getUserByEmail } from '../services/authService';
import { jobCodesService } from '../services';
import { User, AuthContextType } from '../types';
import {
  registerForPushNotificationsAsync,
  savePushToken,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
} from '../services/notificationService';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';

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
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

  // 네이버 SDK 초기화 (Development Build 전용)
  // Expo Go에서는 Native SDK를 사용할 수 없음!
  useEffect(() => {
    const initNaverSDK = async () => {
      try {
        const NaverLoginModule = await import('@react-native-seoul/naver-login');
        const NaverLogin = NaverLoginModule.default;

        if (!NaverLogin || typeof NaverLogin.initialize !== 'function') {
          logger.warn('⚠️ Expo Go 환경: 네이버 Native SDK를 사용할 수 없습니다');
          logger.warn('💡 Development Build에서 테스트하세요: npx expo run:ios');
          return;
        }

        const consumerKey = Constants.expoConfig?.extra?.EXPO_PUBLIC_NAVER_CLIENT_ID || '';
        const consumerSecret = Constants.expoConfig?.extra?.EXPO_PUBLIC_NAVER_CLIENT_SECRET || '';
        const appName = 'SMIS Mentor';
        const serviceUrlSchemeIOS = 'com.smis.smismentor';

        if (consumerKey && consumerSecret) {
          await NaverLogin.initialize({
            appName,
            consumerKey,
            consumerSecret,
            serviceUrlSchemeIOS,
            disableNaverAppAuthIOS: true,
          });
          logger.info('✅ 네이버 SDK 초기화 완료 (Development Build)');
        }
      } catch (error) {
        logger.warn('⚠️ 네이버 SDK 로드 실패 (Expo Go에서는 정상):', error);
      }
    };

    initNaverSDK();
  }, []);

  // Google Sign-In SDK 초기화 (Development Build)
  useEffect(() => {
    const initGoogleSDK = async () => {
      try {
        const GoogleSignInModule = await import('@react-native-google-signin/google-signin');
        const { GoogleSignin } = GoogleSignInModule;

        if (!GoogleSignin || typeof GoogleSignin.configure !== 'function') {
          logger.warn('⚠️ Expo Go 환경: Google Native SDK를 사용할 수 없습니다');
          return;
        }

        const iosClientId = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
        const webClientId = Constants.expoConfig?.extra?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';

        if (iosClientId && webClientId) {
          GoogleSignin.configure({
            iosClientId,
            webClientId,
          });
          logger.info('✅ Google Sign-In SDK 초기화 완료 (Development Build)');
        }
      } catch (error: any) {
        // Expo Go 환경: 네이티브 모듈 사용 불가 (정상)
        const errorMessage = error?.message || String(error);
        if (errorMessage.includes('RNGoogleSignin') || errorMessage.includes('TurboModuleRegistry')) {
          logger.warn('⚠️ Expo Go 환경: Google Native SDK를 사용할 수 없습니다');
        } else {
          logger.warn('⚠️ Google SDK 로드 실패 (Expo Go에서는 정상):', error);
        }
      }
    };

    initGoogleSDK();
  }, []);

  // 푸시 알림 등록 및 토큰 저장
  useEffect(() => {
    if (userData?.userId) {
      registerForPushNotificationsAsync()
        .then(token => {
          if (token) {
            savePushToken(userData.userId, token).catch(error => {
              logger.error('푸시 토큰 저장 실패:', error);
            });
          }
        })
        .catch(error => {
          logger.error('푸시 알림 등록 실패:', error);
        });
    }
  }, [userData?.userId]);

  // 알림 리스너 설정
  useEffect(() => {
    notificationListener.current = addNotificationReceivedListener(notification => {
      logger.info('알림 수신:', notification);
    });

    responseListener.current = addNotificationResponseReceivedListener(response => {
      logger.info('알림 응답:', response);
      const data = response.notification.request.content.data;
      
      if (data?.type === 'task-reminder' && data?.taskId) {
        // TasksScreen으로 이동하는 로직은 RootNavigator에서 처리
      }
    });

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

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
        logger.info('🔄 AuthContext: userData 새로고침 시작 -', currentUser.email);
        
        // Firestore에서 직접 최신 데이터 가져오기 (캐시 무시)
        const userRecord = await getUserByEmail(currentUser.email);
        
        if (userRecord) {
          logger.info('✅ AuthContext: userData 새로고침 성공');
          logger.info('  - userId:', userRecord.userId);
          logger.info('  - authProviders:', userRecord.authProviders?.length || 0);
          logger.info('  - activeJobExperienceId:', userRecord.activeJobExperienceId);
          setUserData(userRecord);
        } else {
          logger.warn('⚠️ AuthContext: 사용자 데이터를 찾을 수 없음');
        }
      } catch (error) {
        logger.error('❌ AuthContext: Failed to refresh user data:', error);
      }
    } else {
      logger.warn('⚠️ AuthContext: currentUser 또는 email이 없음');
    }
  }, [currentUser?.email]);

  // activeJobExperienceId 업데이트 함수
  const updateActiveJobCode = useCallback(async (jobCodeId: string) => {
    if (!userData?.userId) {
      throw new Error('사용자 정보가 없습니다.');
    }

    try {
      logger.info('🔄 AuthContext: activeJobCode 업데이트 시작');
      logger.info('  - userId:', userData.userId);
      logger.info('  - 새로운 jobCodeId:', jobCodeId);
      
      await jobCodesService.updateUserActiveJobCode(userData.userId, jobCodeId);
      
      logger.info('✅ AuthContext: Firestore 업데이트 완료, userData 새로고침 시작');
      await refreshUserData();
      
      logger.info('✅ AuthContext: userData 새로고침 완료');
    } catch (error) {
      logger.error('❌ AuthContext: 기수 변경 실패:', error);
      throw error;
    }
  }, [userData?.userId, refreshUserData]);

  useEffect(() => {
    // Firebase 인증 상태 변경 감지
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      logger.info(
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
              logger.info('사용자 데이터 로드 성공:', userRecord.name);
            } else if (retryCount < 2) {
              // 최대 2번까지 재시도 (조용히)
              await new Promise((resolve) => setTimeout(resolve, 1500));
              await loadUserData(retryCount + 1);
            } else {
              logger.warn('사용자 데이터를 찾을 수 없습니다:', user.email);
            }
          } catch (error) {
            if (retryCount < 2) {
              // 네트워크 오류 등의 경우 재시도 (조용히)
              await new Promise((resolve) => setTimeout(resolve, 1500));
              await loadUserData(retryCount + 1);
            } else {
              logger.error('사용자 데이터 가져오기 실패:', error);
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
      isAuthenticated: !!(currentUser || userData),
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
