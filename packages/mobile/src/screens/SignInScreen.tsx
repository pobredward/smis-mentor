import React, { useState } from 'react';
import { logger } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import {
  signIn as _signIn,
  resetPassword,
  getUserByPhone as _getUserByPhone,
  getUserByEmail as _getUserByEmail,
  getUserBySocialProvider as _getUserBySocialProvider,
  updateUser as _updateUser,
  getUserById as _getUserById,
  persistLoginRememberEmail,
  getPersistedLoginRememberEmail,
} from '../services/authService';
import { GoogleSignInButton, PhoneInputModal, ForeignPhoneInputModal, PasswordInputModal, NaverSignInButton, AppleSignInButton } from '../components';
import { 
  handleSocialLogin, 
  checkTempAccountByPhone,
  linkSocialToExistingAccount,
  handleSocialAuthError,
  getSocialProviderName,
} from '@smis-mentor/shared';
import { getUserByForeignName } from '../services/authService';
import type { SocialUserData } from '@smis-mentor/shared';
import type { User as LegacyUser } from '@smis-mentor/shared';

// shared가 기대하는 legacy.User 타입과 mobile.User 간의 타입 호환 래퍼
const getUserByEmail = _getUserByEmail as (email: string) => Promise<LegacyUser | null>;
const getUserBySocialProvider = _getUserBySocialProvider as (
  providerId: string,
  providerUid: string
) => Promise<LegacyUser | null>;
const getUserByPhone = _getUserByPhone as (phone: string) => Promise<LegacyUser | null>;
const updateUser = _updateUser as (userId: string, data: Partial<LegacyUser>) => Promise<void>;
const getUserById = _getUserById as (userId: string) => Promise<LegacyUser | null>;

// linkSocialToExistingAccount가 기대하는 Promise<void> 시그니처 래퍼
const signInVoid = async (email: string, password: string): Promise<void> => {
  await _signIn(email, password);
};
const signIn = _signIn;

interface SignInScreenProps {
  onSignUpPress: () => void;
  onSignInSuccess: () => void;
  onSocialSignUp?: (socialData: SocialUserData, tempUserId?: string, credential?: any, role?: 'mentor' | 'foreign') => void;
  onBack?: () => void;
}

export function SignInScreen({
  onSignUpPress,
  onSignInSuccess,
  onSocialSignUp,
  onBack,
}: SignInScreenProps) {
  const { refreshUserData } = useAuth(); // AuthContext에서 refreshUserData 가져오기
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  // 소셜 로그인 관련 상태
  const [showRoleSelectionModal, setShowRoleSelectionModal] = useState(false);
  const [selectedSocialRole, setSelectedSocialRole] = useState<'mentor' | 'foreign' | null>(null);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showForeignPhoneModal, setShowForeignPhoneModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [socialData, setSocialData] = useState<SocialUserData | null>(null);
  const [googleCredential, setGoogleCredential] = useState<any>(null);
  const [appleCredential, setAppleCredential] = useState<any>(null);
  const [existingUserEmail, setExistingUserEmail] = useState('');

  // 컴포넌트 마운트 시 저장된 로그인 정보 확인
  React.useEffect(() => {
    checkSavedLogin();
  }, []);

  const checkSavedLogin = async () => {
    try {
      const persisted = await getPersistedLoginRememberEmail();
      if (persisted) {
        setEmail(persisted.email);
      }
    } catch (error) {
      logger.error('저장된 로그인 정보 확인 실패:', error);
    }
  };

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('입력 오류', '이메일과 비밀번호를 입력해주세요.');
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert('입력 오류', '유효한 이메일 주소를 입력해주세요.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('입력 오류', '비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setIsLoading(true);
    try {
      await signIn(email, password);
      await persistLoginRememberEmail(email);

      onSignInSuccess();
    } catch (error: any) {
      // 인증 실패는 Alert로만 표시 (logger.error 제거)
      if (error.message === 'ACCOUNT_INACTIVE') {
        Alert.alert('로그인 불가', '탈퇴한 계정입니다. 재가입이 필요합니다.');
      } else if (error.message === 'ACCOUNT_DELETED') {
        Alert.alert('로그인 불가', '삭제된 계정입니다. 관리자에게 문의하세요.');
      } else if (
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential'
      ) {
        Alert.alert('로그인 실패', '이메일 또는 비밀번호가 올바르지 않습니다.');
      } else if (error.code === 'auth/too-many-requests') {
        Alert.alert(
          '로그인 실패',
          '너무 많은 로그인 시도가 있었습니다. 나중에 다시 시도해주세요.'
        );
      } else {
        logger.error('로그인 오류:', error);
        Alert.alert('로그인 실패', '로그인 중 오류가 발생했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const emailToReset = resetEmail || email;
    
    if (!emailToReset) {
      Alert.alert('입력 오류', '이메일 주소를 입력해주세요.');
      return;
    }

    if (!validateEmail(emailToReset)) {
      Alert.alert('입력 오류', '유효한 이메일 주소를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      await resetPassword(emailToReset);
      Alert.alert(
        '이메일 전송 완료',
        '비밀번호 재설정 이메일이 발송되었습니다. 메일함(스팸함 포함)을 확인해주세요.'
      );
      setShowResetForm(false);
      setResetEmail('');
    } catch (error: any) {
      logger.error('비밀번호 재설정 오류:', error);
      
      if (error.code === 'auth/user-not-found') {
        Alert.alert('오류', '해당 이메일로 등록된 계정이 없습니다.');
      } else if (error.code === 'auth/invalid-email') {
        Alert.alert('오류', '유효하지 않은 이메일 주소입니다.');
      } else if (error.code === 'auth/too-many-requests') {
        Alert.alert('오류', '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.');
      } else {
        Alert.alert('오류', '비밀번호 재설정 이메일 발송 중 오류가 발생했습니다. 나중에 다시 시도해주세요.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ========== 소셜 로그인 핸들러 ==========

  /**
   * Google 로그인 성공 핸들러
   */
  const handleGoogleSignInSuccess = async (socialUserData: SocialUserData, credential?: any) => {
    try {
      setIsLoading(true); // 로딩 시작

      const result = await handleSocialLogin(
        socialUserData, 
        getUserByEmail,
        getUserBySocialProvider,
        updateUser
      );
      
      switch (result.action) {
        case 'LOGIN': {
          if (!result.user) {
            Alert.alert('오류', '로그인 처리 중 사용자 정보를 찾을 수 없습니다.');
            break;
          }
          // 기존 active 계정 → credential이 있으면 signInWithCredential, 없으면 Custom Token
          logger.info('✅ Google 로그인 성공 - Firebase Auth 로그인 시작:', {
            email: socialUserData.email,
            userId: result.user.userId,
            hasCredential: !!credential,
          });

          try {
            const { auth: firebaseAuth } = await import('../config/firebase');

            if (credential) {
              // Google/Apple: credential로 직접 Firebase Auth 로그인 (권장)
              const { signInWithCredential } = await import('firebase/auth');
              try {
                await signInWithCredential(firebaseAuth, credential);
                logger.info('✅ signInWithCredential 완료 (Google)');
              } catch (credError: any) {
                // credential-already-in-use: 이미 다른 계정에 연결된 경우
                // 이 경우에도 로그인은 성공이므로 currentUser 확인 후 진행
                if (credError.code === 'auth/credential-already-in-use' || 
                    credError.code === 'auth/email-already-in-use') {
                  logger.warn('⚠️ signInWithCredential 충돌, currentUser 확인:', credError.code);
                  if (!firebaseAuth.currentUser) throw credError;
                } else {
                  throw credError;
                }
              }
            } else {
              // 네이버 등 credential 없는 경우: Custom Token 사용
              const { signInWithCustomToken } = await import('../services/authService');
              await signInWithCustomToken(result.user.userId, result.user.email);
              logger.info('✅ Custom Token 로그인 완료');
            }

            await persistLoginRememberEmail(result.user.email);
            onSignInSuccess();
          } catch (authError: any) {
            logger.error('❌ Firebase Auth 로그인 실패:', authError);
            Alert.alert('오류', 'Firebase 인증에 실패했습니다.');
          }
          break;
        }
        
        case 'LINK_ACTIVE': {
          if (!result.user) {
            Alert.alert('오류', '계정 연동 처리 중 사용자 정보를 찾을 수 없습니다.');
            break;
          }
          // 기존 active 계정에 Google 연동 필요
          logger.info('🔗 Google 연동 필요');
          const hasPassword = result.user.authProviders?.some(
            (p: any) => p.providerId === 'password'
          );
          if (!hasPassword) {
            // 비밀번호 없는 소셜 전용 계정 → 기존 소셜로 로그인 안내
            const existingProviders = (result.user.authProviders || [])
              .filter((p: any) => p.providerId !== 'password')
              .map((p: any) => getSocialProviderName(p.providerId))
              .join(', ');
            Alert.alert(
              '다른 소셜 계정으로 가입된 이메일',
              `이 이메일은 이미 ${existingProviders}(으)로 가입되어 있습니다.\n해당 소셜 계정으로 로그인한 후 Google을 연동해주세요.`
            );
            break;
          }
          setSocialData(socialUserData);
          setGoogleCredential(credential || null);
          setExistingUserEmail(result.user.email);
          setShowPasswordModal(true);
          break;
        }
          
        case 'NEED_PHONE':
        case 'LINK_TEMP':
          // 역할 선택 먼저 → 이후 본인 확인 (웹과 동일한 순서)
          setSocialData(socialUserData);
          setGoogleCredential(credential || null);
          setSelectedSocialRole(null);
          setShowRoleSelectionModal(true);
          break;
          
        default:
          Alert.alert('오류', '알 수 없는 오류가 발생했습니다.');
      }
    } catch (error: any) {
      logger.error('소셜 로그인 처리 실패:', error);
      Alert.alert('오류', handleSocialAuthError(error));
    } finally {
      setIsLoading(false); // 로딩 종료
    }
  };

  /**
   * Google 로그인 에러 핸들러
   */
  const handleGoogleSignInError = (error: Error) => {
    logger.error('Google 로그인 실패:', error);
    Alert.alert('로그인 실패', handleSocialAuthError(error));
  };

  /**
   * 네이버 로그인 성공 핸들러
   */
  const handleNaverSignInSuccess = async (socialUserData: SocialUserData) => {
    try {
      setIsLoading(true); // 로딩 시작

      const result = await handleSocialLogin(
        socialUserData, 
        getUserByEmail,
        getUserBySocialProvider,
        updateUser
      );
      
      switch (result.action) {
        case 'LOGIN': {
          if (!result.user) {
            Alert.alert('오류', '로그인 처리 중 사용자 정보를 찾을 수 없습니다.');
            break;
          }
          // 기존 active 계정 → Firebase Auth로 로그인
          logger.info('✅ 네이버 로그인 성공 - Firebase Auth 로그인 시작:', {
            email: socialUserData.email,
            userId: result.user.userId,
          });

          try {
            const { signInWithCustomToken } = await import('../services/authService');
            await signInWithCustomToken(result.user.userId, result.user.email);
            await persistLoginRememberEmail(result.user.email);

            logger.info('✅ Firebase Auth 로그인 완료');
            onSignInSuccess();
          } catch (authError: any) {
            logger.error('❌ Firebase Auth 로그인 실패:', authError);
            Alert.alert('오류', 'Firebase 인증에 실패했습니다.');
          }
          break;
        }
        
        case 'LINK_ACTIVE': {
          if (!result.user) {
            Alert.alert('오류', '계정 연동 처리 중 사용자 정보를 찾을 수 없습니다.');
            break;
          }
          // 기존 active 계정에 네이버 연동 필요
          logger.info('🔗 네이버 연동 필요');
          const hasPassword = result.user.authProviders?.some(
            (p: any) => p.providerId === 'password'
          );
          if (!hasPassword) {
            const existingProviders = (result.user.authProviders || [])
              .filter((p: any) => p.providerId !== 'password')
              .map((p: any) => getSocialProviderName(p.providerId))
              .join(', ');
            Alert.alert(
              '다른 소셜 계정으로 가입된 이메일',
              `이 이메일은 이미 ${existingProviders}(으)로 가입되어 있습니다.\n해당 소셜 계정으로 로그인한 후 네이버를 연동해주세요.`
            );
            break;
          }
          setSocialData(socialUserData);
          setExistingUserEmail(result.user.email);
          setShowPasswordModal(true);
          break;
        }
          
        case 'NEED_PHONE':
        case 'LINK_TEMP':
          // 역할 선택 먼저 → 이후 본인 확인 (웹과 동일한 순서)
          setSocialData(socialUserData);
          setSelectedSocialRole(null);
          setShowRoleSelectionModal(true);
          break;
          
        default:
          Alert.alert('오류', '알 수 없는 오류가 발생했습니다.');
      }
    } catch (error: any) {
      logger.error('소셜 로그인 처리 실패:', error);
      Alert.alert('오류', handleSocialAuthError(error));
    } finally {
      setIsLoading(false); // 로딩 종료
    }
  };

  /**
   * 네이버 로그인 에러 핸들러
   */
  const handleNaverSignInError = (error: Error) => {
    logger.error('네이버 로그인 실패:', error);
    Alert.alert('로그인 실패', handleSocialAuthError(error));
  };

  /**
   * Apple 로그인 성공 핸들러
   */
  const handleAppleSignInSuccess = async (socialUserData: SocialUserData, credential?: any) => {
    try {
      setIsLoading(true); // 로딩 시작

      const result = await handleSocialLogin(
        socialUserData, 
        getUserByEmail,
        getUserBySocialProvider,
        updateUser
      );
      
      switch (result.action) {
        case 'LOGIN': {
          if (!result.user) {
            Alert.alert('오류', '로그인 처리 중 사용자 정보를 찾을 수 없습니다.');
            break;
          }
          // 기존 active 계정 → credential이 있으면 signInWithCredential, 없으면 Custom Token
          logger.info('✅ Apple 로그인 성공 - Firebase Auth 로그인 시작:', {
            email: socialUserData.email,
            userId: result.user.userId,
            hasCredential: !!credential,
          });

          try {
            const { auth: firebaseAuth } = await import('../config/firebase');

            if (credential) {
              // Apple: credential로 직접 Firebase Auth 로그인 (권장)
              const { signInWithCredential } = await import('firebase/auth');
              try {
                await signInWithCredential(firebaseAuth, credential);
                logger.info('✅ signInWithCredential 완료 (Apple)');
              } catch (credError: any) {
                if (credError.code === 'auth/credential-already-in-use' || 
                    credError.code === 'auth/email-already-in-use') {
                  logger.warn('⚠️ signInWithCredential 충돌, currentUser 확인:', credError.code);
                  if (!firebaseAuth.currentUser) throw credError;
                } else {
                  throw credError;
                }
              }
            } else {
              const { signInWithCustomToken } = await import('../services/authService');
              await signInWithCustomToken(result.user.userId, result.user.email);
              logger.info('✅ Custom Token 로그인 완료');
            }

            await persistLoginRememberEmail(result.user.email);
            onSignInSuccess();
          } catch (authError: any) {
            logger.error('❌ Firebase Auth 로그인 실패:', authError);
            Alert.alert('오류', 'Firebase 인증에 실패했습니다.');
          }
          break;
        }
        
        case 'LINK_ACTIVE': {
          if (!result.user) {
            Alert.alert('오류', '계정 연동 처리 중 사용자 정보를 찾을 수 없습니다.');
            break;
          }
          // 기존 active 계정에 Apple 연동 필요
          logger.info('🔗 Apple 연동 필요');
          const hasPassword = result.user.authProviders?.some(
            (p: any) => p.providerId === 'password'
          );
          if (!hasPassword) {
            const existingProviders = (result.user.authProviders || [])
              .filter((p: any) => p.providerId !== 'password')
              .map((p: any) => getSocialProviderName(p.providerId))
              .join(', ');
            Alert.alert(
              '다른 소셜 계정으로 가입된 이메일',
              `이 이메일은 이미 ${existingProviders}(으)로 가입되어 있습니다.\n해당 소셜 계정으로 로그인한 후 Apple을 연동해주세요.`
            );
            break;
          }
          setSocialData(socialUserData);
          setAppleCredential(credential || null);
          setExistingUserEmail(result.user.email);
          setShowPasswordModal(true);
          break;
        }
          
        case 'NEED_PHONE':
        case 'LINK_TEMP':
          // 역할 선택 먼저 → 이후 본인 확인 (웹과 동일한 순서)
          setSocialData(socialUserData);
          setAppleCredential(credential || null);
          setSelectedSocialRole(null);
          setShowRoleSelectionModal(true);
          break;
          
        default:
          Alert.alert('오류', '알 수 없는 오류가 발생했습니다.');
      }
    } catch (error: any) {
      logger.error('소셜 로그인 처리 실패:', error);
      Alert.alert('오류', handleSocialAuthError(error));
    } finally {
      setIsLoading(false); // 로딩 종료
    }
  };

  /**
   * Apple 로그인 에러 핸들러
   */
  const handleAppleSignInError = (error: Error) => {
    logger.error('Apple 로그인 실패:', error);
    Alert.alert('로그인 실패', handleSocialAuthError(error));
  };

  /**
   * 역할 선택 후 처리 (웹의 NEED_PHONE → RoleSelectionModal 흐름과 동일)
   * mentor: PhoneInputModal(이름+전화번호)
   * foreign: ForeignPhoneInputModal(성명+전화번호+국가코드)
   */
  const handleSocialRoleSelect = (role: 'mentor' | 'foreign') => {
    setSelectedSocialRole(role);
    setShowRoleSelectionModal(false);
    if (role === 'mentor') {
      setShowPhoneModal(true);
    } else {
      setShowForeignPhoneModal(true);
    }
  };

  /**
   * 원어민 본인 확인 처리
   */
  const handleForeignPhoneSubmit = async (data: {
    firstName: string;
    lastName: string;
    middleName?: string;
    countryCode: string;
    phoneNumber: string;
  }) => {
    if (!socialData) return;

    const currentCredential = googleCredential || appleCredential;
    const fullName = data.middleName
      ? `${data.firstName} ${data.middleName} ${data.lastName}`
      : `${data.firstName} ${data.lastName}`;

    let cleanPhone = data.phoneNumber.replace(/[^0-9]/g, '');
    if (data.countryCode === '+82' && cleanPhone.startsWith('0')) {
      cleanPhone = cleanPhone.substring(1);
    }

    setIsLoading(true);
    try {
      logger.info('🔍 원어민 계정 검색:', { firstName: data.firstName, lastName: data.lastName });
      const existingUser = await getUserByForeignName(data.firstName, data.lastName);

      if (existingUser) {
        const role = existingUser.role;
        logger.info('👤 원어민 계정 발견:', { role, status: existingUser.status });

        // active 원어민 계정
        if (role === 'foreign' && existingUser.status === 'active') {
          if (existingUser.email !== socialData.email) {
            // 이메일 다름 → 비밀번호 연동 모달
            setShowForeignPhoneModal(false);
            setSocialData({ ...socialData, name: fullName });
            setExistingUserEmail(existingUser.email);
            setShowPasswordModal(true);
            return;
          } else {
            // 이메일 같음 → 소셜 계정 연동 후 로그인
            // (handleSocialLogin에서 이미 LOGIN을 반환했어야 하지만, 방어 코드로 처리)
            setShowForeignPhoneModal(false);
            try {
              const { signInWithCustomToken: signInCustom } = await import('../services/authService');
              await signInCustom(existingUser.userId || (existingUser as any).id, existingUser.email);
              await persistLoginRememberEmail(existingUser.email);
              onSignInSuccess();
            } catch (loginError) {
              logger.error('❌ 원어민 재로그인 실패:', loginError);
              Alert.alert('오류', 'Login failed. Please try again or contact the administrator.');
            }
            return;
          }
        }

        // foreign_temp → 활성화 진행 (소셜 가입 플로우로)
        if (role === 'foreign_temp' && existingUser.status === 'temp') {
          logger.info('✅ foreign_temp 계정 발견 - 활성화 진행');
          setShowForeignPhoneModal(false);
          const updatedSocialData = {
            ...socialData,
            name: fullName,
            phone: `${data.countryCode}${cleanPhone}`,
            countryCode: data.countryCode,
            foreignTeacher: {
              firstName: data.firstName,
              lastName: data.lastName,
              middleName: data.middleName ?? '',
              countryCode: data.countryCode,
            },
          };
          if (onSocialSignUp) {
            onSocialSignUp(updatedSocialData, existingUser.userId || (existingUser as any).id, currentCredential, 'foreign');
          }
          return;
        }

        // mentor/mentor_temp 이름 충돌
        if (role === 'mentor_temp' || role === 'mentor') {
          Alert.alert(
            'Account Conflict',
            'This name is registered as a mentor account. Please contact the administrator.\n\nAdministrator: 010-7656-7933 (Shin Sunwoong)'
          );
          return;
        }

        Alert.alert(
          'Account Conflict',
          `This name is already registered with a different role. Please contact the administrator.\n\nAdministrator: 010-7656-7933 (Shin Sunwoong)`
        );
        return;
      }

      // 신규 원어민 가입
      logger.info('🆕 신규 원어민 가입');
      setShowForeignPhoneModal(false);
      const updatedSocialData = {
        ...socialData,
        name: fullName,
        phone: `${data.countryCode}${cleanPhone}`,
        countryCode: data.countryCode,
        // foreignTeacher 필드: ProfileScreen → SignUpFlow로 전달
        foreignTeacher: {
          firstName: data.firstName,
          lastName: data.lastName,
          middleName: data.middleName ?? '',
          countryCode: data.countryCode,
        },
      };
      if (onSocialSignUp) {
        onSocialSignUp(updatedSocialData, undefined, currentCredential, 'foreign');
      } else {
        onSignUpPress();
      }
    } catch (error: any) {
      logger.error('원어민 본인 확인 오류:', error);
      Alert.alert('Error', 'An error occurred while verifying your account.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 이름과 전화번호 입력 후 처리
   */
  const handlePhoneSubmit = async (data: { name: string; phone: string }) => {
    if (!socialData) return;
    
    // 현재 소셜 제공자의 credential (Google, Apple 등)
    const currentCredential = googleCredential || appleCredential;
    
    setIsLoading(true);
    try {
      const { getUserJobCodesInfo } = await import('../services/authService');
      
      const result = await checkTempAccountByPhone(
        data.phone,
        socialData,
        getUserByPhone as (phone: string) => Promise<import('@smis-mentor/shared').User | null>,
        getUserJobCodesInfo
      );
      
      if (result.found && result.user) {
        const user = result.user;
        
        if (user.status === 'active') {
          // active 계정 발견 - 연동 필요
          if (result.needsLink) {
            // 이메일이 다른 active 계정 - 비밀번호 입력 후 연동
            setShowPhoneModal(false);
            setExistingUserEmail(user.email);
            setShowPasswordModal(true);
            return;
          }
        }
        
        if (user.status === 'temp') {
          // temp 계정 발견
          if (result.nameMatches) {
            // 이름 일치 → 연동 확인
            const jobCodesText = result.jobCodes
              ? result.jobCodes.map(j => `- ${j.generation} ${j.code} - ${j.name}`).join('\n')
              : '(직무 정보 없음)';
            
            Alert.alert(
              '기존 계정 발견',
              `${user.name}님의 계정을 찾았습니다.\n\n` +
              `담당 업무:\n${jobCodesText}\n\n` +
              `${getSocialProviderName(socialData.providerId)} 계정과 연동하시겠습니까?`,
              [
                {
                  text: '새 계정 만들기',
                  style: 'cancel',
                  onPress: () => {
                    setShowPhoneModal(false);
                    if (onSocialSignUp) {
                      onSocialSignUp({ ...socialData, name: data.name, phone: data.phone }, undefined, currentCredential, 'mentor');
                    } else {
                      onSignUpPress();
                    }
                  },
                },
                {
                  text: '연동하기',
                  onPress: () => {
                    setShowPhoneModal(false);
                    if (onSocialSignUp) {
                      onSocialSignUp({ ...socialData, name: data.name, phone: data.phone }, user.userId || user.id, currentCredential, 'mentor');
                    } else {
                      Alert.alert(
                        '안내',
                        '연동 후 추가 정보를 입력해주세요.',
                        [{ text: '확인', onPress: onSignUpPress }]
                      );
                    }
                  },
                },
              ]
            );
          } else {
            // 이름 불일치
            Alert.alert(
              '이름 불일치',
              `전화번호로 "${user.name}"님의 계정이 있습니다.\n` +
              `입력한 이름은 "${data.name}"입니다.\n\n` +
              `관리자가 정보를 잘못 입력했을 수 있습니다.`,
              [
                {
                  text: '관리자 문의',
                  onPress: () => {
                    Alert.alert(
                      '관리자 연락처',
                      '010-7656-7933 (신선웅)',
                      [{ text: '확인' }]
                    );
                  },
                },
                {
                  text: '새 계정 만들기',
                  onPress: () => {
                    setShowPhoneModal(false);
                    if (onSocialSignUp) {
                      onSocialSignUp({ ...socialData, name: data.name, phone: data.phone }, undefined, currentCredential, 'mentor');
                    } else {
                      onSignUpPress();
                    }
                  },
                },
              ]
            );
          }
        }
      } else {
        // 전화번호로 계정 없음 → 신규 회원가입
        setShowPhoneModal(false);
        if (onSocialSignUp) {
          onSocialSignUp({ ...socialData, name: data.name, phone: data.phone }, undefined, currentCredential, 'mentor');
        } else {
          onSignUpPress();
        }
      }
    } catch (error: any) {
      if (error.message === 'ALREADY_REGISTERED') {
        // 이미 active 계정 존재 → 연동 제안
        Alert.alert(
          '기존 계정 발견',
          '해당 전화번호로 이미 가입된 계정이 있습니다.\n' +
          '소셜 계정을 기존 계정에 연결하시겠습니까?',
          [
            {
              text: '취소',
              style: 'cancel',
              onPress: () => setShowPhoneModal(false),
            },
            {
              text: '계정 연결',
              onPress: async () => {
                setShowPhoneModal(false);
                // 기존 계정 정보 가져오기
                try {
                  const existingUser = await getUserByPhone(data.phone);
                  if (existingUser && existingUser.email) {
                    setExistingUserEmail(existingUser.email);
                    setShowPasswordModal(true);
                  }
                } catch (err) {
                  Alert.alert('오류', '계정 정보를 가져올 수 없습니다.');
                }
              },
            },
          ]
        );
      } else {
        logger.error('전화번호 확인 중 오류:', error);
        Alert.alert('오류', '계정 확인 중 오류가 발생했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 비밀번호 입력 후 기존 계정 연동
   */
  const handlePasswordSubmit = async (password: string) => {
    if (!socialData || !existingUserEmail) return;
    
    setIsLoading(true);
    try {
      const { auth } = await import('../config/firebase');
      const { arrayUnion } = await import('firebase/firestore'); // ✅ arrayUnion import

      // Google/Apple: signInWithCredential로 생성된 소셜 임시 계정을 linkWithCredential 전에 먼저 삭제한다.
      // 임시 계정이 살아있는 상태에서 linkWithCredential을 시도하면 credential이 이미 임시 계정에
      // 연결되어 있으므로 auth/credential-already-in-use 에러가 발생한다.
      const currentAuthUser = auth.currentUser;
      const currentCredential = googleCredential || appleCredential;
      if (currentAuthUser && currentCredential) {
        try {
          logger.info('🗑️ credential-already-in-use 방지 - 소셜 임시 계정 선제 삭제:', currentAuthUser.uid);
          await currentAuthUser.delete();
        } catch (deleteError) {
          logger.warn('⚠️ 소셜 임시 계정 삭제 실패 (계속 진행):', deleteError);
        }
      }

      await linkSocialToExistingAccount(
        auth,
        existingUserEmail,
        password,
        socialData,
        signInVoid,
        getUserByEmail,
        getUserById,
        updateUser,
        arrayUnion // ✅ arrayUnion 전달
      );

      await persistLoginRememberEmail(existingUserEmail);

      setShowPasswordModal(false);
      
      // ✅ 연동 완료 즉시 새로고침 (Alert 전)
      logger.info('🔄 계정 연동 완료 - 즉시 새로고침');
      try {
        // 1. 캐시 무효화
        const { removeCache, CACHE_STORE } = await import('../services/cacheUtils');
        const currentUserBefore = auth.currentUser;
        if (currentUserBefore?.uid) {
          logger.info('🗑️ 캐시 무효화:', currentUserBefore.uid);
          await removeCache(CACHE_STORE.USERS, currentUserBefore.uid);
        }
        
        // 2. Firestore 전파 대기
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 3. ✅ onAuthStateChanged가 실행될 때까지 대기 (최대 3초)
        logger.info('⏳ onAuthStateChanged 대기 중...');
        let attempts = 0;
        const maxAttempts = 30; // 3초
        
        while (attempts < maxAttempts) {
          const currentUserNow = auth.currentUser;
          if (currentUserNow?.email === existingUserEmail) {
            logger.info('✅ onAuthStateChanged 감지됨:', currentUserNow.email);
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        if (attempts >= maxAttempts) {
          logger.warn('⚠️ onAuthStateChanged 타임아웃 (무시하고 계속)');
        }
        
        // 4. ✅ AuthContext.refreshUserData 호출
        await refreshUserData();
        logger.info('✅ refreshUserData 완료');
        
        // 5. React 상태 업데이트 대기
        await new Promise(resolve => setTimeout(resolve, 300));
        logger.info('✅ React 상태 업데이트 대기 완료');
      } catch (error) {
        logger.error('❌ 즉시 새로고침 실패:', error);
      }
      
      // Alert 후 화면 전환
      Alert.alert(
        '연결 완료',
        `${getSocialProviderName(socialData.providerId)} 계정이 연결되었습니다.\n` +
        '다음부터는 소셜 로그인도 사용할 수 있습니다.',
        [{ 
          text: '확인', 
          onPress: () => {
            logger.info('✅ 화면 전환 (데이터 이미 최신화됨)');
            onSignInSuccess();
          }
        }]
      );
    } catch (error: any) {
      logger.error('계정 연결 실패:', error);
      
      if (error.code === 'auth/wrong-password') {
        Alert.alert(
          '비밀번호 오류',
          '비밀번호가 일치하지 않습니다.',
          [
            {
              text: '다시 시도',
              onPress: () => {
                // 모달 열린 상태 유지
              },
            },
            {
              text: '비밀번호 찾기',
              onPress: () => {
                setShowPasswordModal(false);
                setResetEmail(existingUserEmail);
                setShowResetForm(true);
              },
            },
          ]
        );
      } else {
        Alert.alert('오류', handleSocialAuthError(error));
        setShowPasswordModal(false);
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * 비밀번호 찾기 (모달에서)
   */
  const handleForgotPasswordFromModal = () => {
    setShowPasswordModal(false);
    setResetEmail(existingUserEmail);
    setShowResetForm(true);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          {/* 뒤로가기 버튼 */}
          {onBack && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={onBack}
              accessibilityLabel="뒤로가기"
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={24} color="#64748b" />
            </TouchableOpacity>
          )}

          {/* 로고/타이틀 */}
          <View style={styles.header}>
            <Text style={styles.title}>SMIS</Text>
            <Text style={styles.subtitle}>
              SMIS English Camp Recruiting Page
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>이메일 / Email</Text>
              <TextInput
                style={styles.input}
                placeholder="이메일을 입력해주세요"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>비밀번호 / Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="비밀번호를 입력해주세요"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color="#64748b"
                  />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.loginButton,
                isLoading && styles.loginButtonDisabled,
              ]}
              onPress={handleLogin}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              {isLoading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.loginButtonText}>로그인</Text>
              )}
            </TouchableOpacity>

            {/* 비밀번호 찾기 / 회원가입 버튼 */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                onPress={() => setShowResetForm(!showResetForm)}
                style={styles.actionButton}
              >
                <Text style={styles.forgotPasswordText}>
                  비밀번호 찾기
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity onPress={onSignUpPress} style={styles.actionButton}>
                <Text style={styles.signUpLink}>회원가입 / Sign Up</Text>
              </TouchableOpacity>
            </View>

            {showResetForm && (
              <View style={styles.resetForm}>
                <Text style={styles.resetFormLabel}>
                  비밀번호 재설정 이메일 받기
                </Text>
                <View style={styles.resetFormInputContainer}>
                  <TextInput
                    style={styles.resetFormInput}
                    placeholder="이메일 주소"
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                  <TouchableOpacity
                    style={styles.resetFormButton}
                    onPress={handleForgotPassword}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <ActivityIndicator size="small" color="#3b82f6" />
                    ) : (
                      <Text style={styles.resetFormButtonText}>전송</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
            
            {/* 소셜 로그인 구분선 */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>또는</Text>
              <View style={styles.dividerLine} />
            </View>
            
            {/* Google 로그인 버튼 */}
            <GoogleSignInButton
              onSuccess={handleGoogleSignInSuccess}
              onError={handleGoogleSignInError}
              disabled={isLoading}
            />
            
            {/* 네이버 로그인 버튼 */}
            <NaverSignInButton
              onSuccess={handleNaverSignInSuccess}
              onError={handleNaverSignInError}
              disabled={isLoading}
            />
            
            {/* Apple 로그인 버튼 (iOS만) */}
            <AppleSignInButton
              onSuccess={handleAppleSignInSuccess}
              onError={handleAppleSignInError}
              disabled={isLoading}
            />
          </View>
        </View>
      </ScrollView>
      
      {/* 역할 선택 모달 (소셜 신규 회원가입 시 가장 먼저 표시) */}
      <SocialRoleSelectionModal
        visible={showRoleSelectionModal}
        onRoleSelect={handleSocialRoleSelect}
        onCancel={() => setShowRoleSelectionModal(false)}
      />

      {/* 멘토 본인 확인 모달 (이름 + 전화번호) */}
      <PhoneInputModal
        visible={showPhoneModal}
        socialProviderName={socialData ? getSocialProviderName(socialData.providerId) : 'Google'}
        defaultName={socialData?.name || ''}
        onSubmit={handlePhoneSubmit}
        onCancel={() => setShowPhoneModal(false)}
      />

      {/* 원어민 본인 확인 모달 (성명 + 국가코드 + 전화번호) */}
      <ForeignPhoneInputModal
        visible={showForeignPhoneModal}
        socialProviderName={socialData ? getSocialProviderName(socialData.providerId) : 'Google'}
        defaultName={socialData?.name || ''}
        onSubmit={handleForeignPhoneSubmit}
        onCancel={() => setShowForeignPhoneModal(false)}
      />
      
      {/* 비밀번호 입력 모달 (계정 연동용) */}
      <PasswordInputModal
        visible={showPasswordModal}
        email={existingUserEmail}
        onSubmit={handlePasswordSubmit}
        onCancel={() => setShowPasswordModal(false)}
        onForgotPassword={handleForgotPasswordFromModal}
      />

      {/* 로딩 오버레이 */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3b82f6" />
            <Text style={styles.loadingText}>로그인 처리 중...</Text>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 8,
    padding: 4,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#2563eb',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  form: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
  },
  passwordToggle: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  loginButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    paddingTop: 16,
  },
  actionButton: {
    padding: 4,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  signUpLink: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  resetForm: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  resetFormLabel: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
    fontWeight: '500',
  },
  resetFormInputContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  resetFormInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  resetFormButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    justifyContent: 'center',
    minWidth: 60,
  },
  resetFormButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '500',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '500',
  },
});

// ========== 역할 선택 모달 (소셜 회원가입 전용) ==========

interface SocialRoleSelectionModalProps {
  visible: boolean;
  onRoleSelect: (role: 'mentor' | 'foreign') => void;
  onCancel: () => void;
}

function SocialRoleSelectionModal({ visible, onRoleSelect, onCancel }: SocialRoleSelectionModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={roleModalStyles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity
          style={roleModalStyles.backdrop}
          activeOpacity={1}
          onPress={onCancel}
        />
        <View style={roleModalStyles.card}>
          <View style={roleModalStyles.header}>
            <Ionicons name="person-add-outline" size={28} color="#3b82f6" />
            <Text style={roleModalStyles.title}>회원가입</Text>
            <Text style={roleModalStyles.subtitle}>어떤 역할로 가입하시겠습니까?</Text>
          </View>

          <TouchableOpacity
            style={roleModalStyles.roleCard}
            onPress={() => onRoleSelect('mentor')}
            activeOpacity={0.75}
          >
            <View style={[roleModalStyles.iconBox, { backgroundColor: '#eff6ff' }]}>
              <Ionicons name="school" size={32} color="#3b82f6" />
            </View>
            <View style={roleModalStyles.roleTextBox}>
              <Text style={roleModalStyles.roleName}>멘토</Text>
              <Text style={roleModalStyles.roleDesc}>학생들을 가르치고 지도하는 멘토</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity
            style={roleModalStyles.roleCard}
            onPress={() => onRoleSelect('foreign')}
            activeOpacity={0.75}
          >
            <View style={[roleModalStyles.iconBox, { backgroundColor: '#ecfdf5' }]}>
              <Ionicons name="globe" size={32} color="#10b981" />
            </View>
            <View style={roleModalStyles.roleTextBox}>
              <Text style={roleModalStyles.roleName}>Foreign Teacher</Text>
              <Text style={roleModalStyles.roleDesc}>Sign up as a foreign language teacher</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity style={roleModalStyles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
            <Text style={roleModalStyles.cancelText}>취소</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const roleModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  card: {
    width: '88%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 12,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleTextBox: {
    flex: 1,
  },
  roleName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 2,
  },
  roleDesc: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
  },
  cancelBtn: {
    marginTop: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
});
