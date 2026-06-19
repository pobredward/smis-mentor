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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { auth, db } from '../config/firebase';
import { getUserByEmail, getUserById } from '../services/authService';
import { jobCodesService } from '../services';
import { User, AuthContextType } from '../types';
import { ensureActiveJobExperience } from '@smis-mentor/shared';
import {
  registerPushTokenIfPermitted,
  savePushToken,
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
} from '../services/notificationService';
import { navigateToTasksTab } from './CampTabContext';
import * as Notifications from 'expo-notifications';
import { createNavigationContainerRef } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
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
  triggerDataPrefetch: () => {},
  isSharingLocation: false,
  setIsSharingLocation: () => {},
});

// 데이터 프리페칭 트리거 이벤트 (싱글톤 패턴)
let prefetchTriggerCallback: (() => void) | null = null;

export const registerPrefetchTrigger = (callback: () => void) => {
  prefetchTriggerCallback = callback;
};

export const unregisterPrefetchTrigger = () => {
  prefetchTriggerCallback = null;
};

export const useAuth = () => useContext(AuthContext);

type AuthProviderProps = {
  children: ReactNode;
};

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  // 위치 공유 상태 (LocationSharingScreen에서 동기화)
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);
  const hasPrefetchedRef = useRef(false); // 프리페칭 중복 방지
  const hasShownIncompleteProfileAlert = useRef(false);

  // 미완성 프로필 체크 함수
  const checkIncompleteProfile = (user: User) => {
    if (user.role === 'foreign' || user.role === 'foreign_temp') {
      return false; // 원어민은 체크하지 않음
    }
    
    // 멘토의 경우 프로필 이미지, 자기소개, 지원동기 체크
    const isIncomplete = !user.profileImage || !user.selfIntroduction || !user.jobMotivation;
    return isIncomplete;
  };

  // 데이터 프리페칭 트리거 함수
  const triggerDataPrefetch = useCallback(() => {
    logger.info('🎯 AuthContext: 데이터 프리페칭 트리거 호출');
    if (prefetchTriggerCallback) {
      prefetchTriggerCallback();
    } else {
      logger.warn('⚠️ 프리페칭 콜백이 등록되지 않음');
    }
  }, []);

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
        const consumerSecret = Constants.expoConfig?.extra?.NAVER_CLIENT_SECRET || '';
        const appName = 'SMIS Mentor';
        // app.config.ts scheme 및 CFBundleURLSchemes와 반드시 일치해야 iOS 로그인 후 앱 복귀 가능
        const serviceUrlSchemeIOS = 'smismentor';

        if (!consumerKey || !consumerSecret) {
          logger.error(
            '❌ 네이버 SDK 초기화 실패: EXPO_PUBLIC_NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET 환경변수가 없습니다.\n' +
            '💡 .env.local에 두 값을 모두 설정하고 EAS 환경변수도 확인하세요.'
          );
          return;
        }

        await NaverLogin.initialize({
          appName,
          consumerKey,
          consumerSecret,
          serviceUrlSchemeIOS,
          disableNaverAppAuthIOS: true,
        });
        logger.info('✅ 네이버 SDK 초기화 완료');
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

        if (webClientId) {
          // Android는 google-services.json에서 클라이언트 ID를 자동으로 읽음
          // iOS는 iosClientId 명시 필요
          GoogleSignin.configure({
            iosClientId: iosClientId || undefined,
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

  // 이미 알림 권한이 허용된 경우에만 푸시 토큰 갱신
  // Google Play 정책: 로그인 시 자동으로 requestPermissionsAsync()를 호출하지 않음
  // 권한 요청은 사용자가 알림 배너/설정에서 명시적으로 탭할 때만 수행
  useEffect(() => {
    if (userData?.userId) {
      registerPushTokenIfPermitted()
        .then(token => {
          if (token) {
            savePushToken(userData.userId, token).catch(error => {
              logger.error('푸시 토큰 저장 실패:', error);
            });
          }
        })
        .catch(error => {
          logger.error('푸시 토큰 갱신 실패:', error);
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
      
      if (data?.type === 'task-reminder') {
        // Camp 탭으로 이동 후 업무 탭 전환
        try {
          navigationRef.navigate('MainTabs' as any, { screen: 'Camp' } as any);
        } catch (e) {
          logger.warn('Camp 탭 네비게이션 실패:', e);
        }
        // 약간의 딜레이 후 업무 탭 전환 (화면 마운트 대기)
        setTimeout(() => navigateToTasksTab(), 300);
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
    if (currentUser) {
      try {
        logger.info('🔄 AuthContext: userData 새로고침 시작 -', currentUser.email || currentUser.uid);
        
        // Apple 등 이메일 없는 소셜 로그인은 UID로 조회
        const userRecord = currentUser.email
          ? await getUserByEmail(currentUser.email)
          : await getUserById(currentUser.uid);
        
        if (userRecord) {
          // mentor_temp나 foreign_temp 사용자를 자동으로 활성 상태로 업데이트
          if ((userRecord.role === 'mentor_temp' || userRecord.role === 'foreign_temp') && userRecord.status === 'temp') {
            try {
              logger.info('🔄 임시 사용자를 활성 상태로 업데이트 중:', userRecord.email);
              
              const { doc, updateDoc } = await import('firebase/firestore');
              const newRole = userRecord.role === 'mentor_temp' ? 'mentor' : 'foreign';
              
              await updateDoc(doc(db, 'users', userRecord.userId), {
                role: newRole,
                status: 'active',
                updatedAt: new Date()
              });
              
              // 로컬 상태 업데이트
              userRecord.role = newRole as any;
              userRecord.status = 'active';
              
              logger.info('✅ 사용자 상태 업데이트 완료:', { role: newRole, status: 'active' });
            } catch (error) {
              logger.error('❌ 사용자 상태 업데이트 실패:', error);
            }
          }
          
          // 활성 캠프 자동 선택
          const activeJobExpId = await ensureActiveJobExperience(db, userRecord as any);
          if (activeJobExpId && !userRecord.activeJobExperienceId) {
            userRecord.activeJobExperienceId = activeJobExpId;
          }
          
          logger.info('✅ AuthContext: userData 새로고침 성공');
          logger.info('  - userId:', userRecord.userId);
          logger.info('  - role:', userRecord.role);
          logger.info('  - status:', userRecord.status);
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
      logger.warn('⚠️ AuthContext: currentUser가 없음');
    }
  }, [currentUser]);

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
      
      // AsyncStorage에도 저장 (앱 재시작 시 복원용)
      try {
        await AsyncStorage.setItem('SMIS_LAST_ACTIVE_JOB_CODE', jobCodeId);
        logger.info('💾 마지막 캠프 코드 저장 완료');
      } catch (storageError) {
        logger.warn('⚠️ 캠프 코드 저장 실패:', storageError);
      }
      
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
            // email이 없으면 (Custom Token / Apple) UID로 직접 조회
            if (!user.email) {
              logger.warn('⚠️ Firebase Auth 사용자에 이메일이 없음. UID로 Firestore 조회:', user.uid);
              try {
                const userByUid = await getUserById(user.uid);
                if (userByUid) {
                  const activeJobExpId = await ensureActiveJobExperience(db, userByUid as any);
                  if (activeJobExpId && !userByUid.activeJobExperienceId) {
                    userByUid.activeJobExperienceId = activeJobExpId;
                  }
                  setUserData(userByUid);
                  logger.info('✅ UID로 사용자 데이터 로드 성공:', userByUid.name);
                } else if (retryCount < 2) {
                  await new Promise((resolve) => setTimeout(resolve, 1500));
                  await loadUserData(retryCount + 1);
                } else {
                  logger.warn('⚠️ UID로도 사용자를 찾을 수 없음:', user.uid);
                }
              } catch (err) {
                logger.error('UID로 사용자 조회 실패:', err);
              }
              return;
            }

            const userRecord = await getUserByEmail(user.email || '');
            if (userRecord) {
              // mentor_temp나 foreign_temp 사용자를 자동으로 활성 상태로 업데이트
              if ((userRecord.role === 'mentor_temp' || userRecord.role === 'foreign_temp') && userRecord.status === 'temp') {
                try {
                  logger.info('🔄 로그인 시 임시 사용자를 활성 상태로 업데이트 중:', userRecord.email);
                  
                  const { doc, updateDoc } = await import('firebase/firestore');
                  const newRole = userRecord.role === 'mentor_temp' ? 'mentor' : 'foreign';
                  
                  await updateDoc(doc(db, 'users', userRecord.userId), {
                    role: newRole,
                    status: 'active',
                    updatedAt: new Date()
                  });
                  
                  // 로컬 상태 업데이트
                  userRecord.role = newRole as any;
                  userRecord.status = 'active';
                  
                  logger.info('✅ 로그인 시 사용자 상태 업데이트 완료:', { role: newRole, status: 'active' });
                } catch (error) {
                  logger.error('❌ 로그인 시 사용자 상태 업데이트 실패:', error);
                }
              }
              
              // 활성 캠프 자동 선택
              const activeJobExpId = await ensureActiveJobExperience(db, userRecord as any);
              if (activeJobExpId && !userRecord.activeJobExperienceId) {
                userRecord.activeJobExperienceId = activeJobExpId;
              }
              
              setUserData(userRecord);
              logger.info('사용자 데이터 로드 성공:', userRecord.name);
              
              // 미완성 프로필 체크 (한 번만)
              if (!hasShownIncompleteProfileAlert.current && checkIncompleteProfile(userRecord)) {
                hasShownIncompleteProfileAlert.current = true;
                
                setTimeout(() => {
                  Alert.alert(
                    '프로필 완성',
                    '프로필을 완성해주세요. 프로필 이미지, 자기소개, 지원동기를 작성하시면 더 나은 서비스를 이용하실 수 있습니다.',
                    [
                      { text: '나중에', style: 'cancel' },
                      { 
                        text: '프로필 수정', 
                        onPress: () => {
                          // 프로필 수정 화면으로 이동하는 로직은 각 화면에서 처리
                          logger.info('🔄 프로필 수정 안내 완료');
                        }
                      }
                    ],
                    { cancelable: true }
                  );
                }, 2000); // 로그인 후 2초 뒤에 표시
              }
              
              // 사용자 데이터 로드 후 프리페칭 트리거 (한 번만)
              if (!hasPrefetchedRef.current && userRecord.activeJobExperienceId) {
                hasPrefetchedRef.current = true;
                logger.info('🚀 AuthContext: 로그인 완료, 데이터 프리페칭 트리거');
                
                // 약간의 딜레이를 둬서 UI가 먼저 렌더링되도록 함
                setTimeout(() => {
                  triggerDataPrefetch();
                }, 500);
              }
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
        hasPrefetchedRef.current = false;
      }

      setLoading(false);
      setAuthReady(true);
    });

    return unsubscribe;
  }, [triggerDataPrefetch]);

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
      triggerDataPrefetch,
      isSharingLocation,
      setIsSharingLocation,
    }),
    [
      currentUser,
      userData,
      loading,
      authReady,
      refreshUserData,
      waitForAuthReady,
      updateActiveJobCode,
      triggerDataPrefetch,
      isSharingLocation,
      setIsSharingLocation,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
