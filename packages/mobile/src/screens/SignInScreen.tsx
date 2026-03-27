import React, { useState } from 'react';
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
} from 'react-native';
import Checkbox from 'expo-checkbox';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../context/AuthContext';
import { signIn, resetPassword, getUserByPhone } from '../services/authService';
import { GoogleSignInButton, PhoneInputModal, PasswordInputModal, NaverSignInButton } from '../components';
import { 
  handleSocialLogin, 
  checkTempAccountByPhone,
  linkSocialToExistingAccount,
  handleSocialAuthError,
  getSocialProviderName,
} from '@smis-mentor/shared';
import type { SocialUserData } from '@smis-mentor/shared';

interface SignInScreenProps {
  onSignUpPress: () => void;
  onSignInSuccess: () => void;
  onSocialSignUp?: (socialData: SocialUserData, tempUserId?: string) => void;
}

const STORAGE_KEYS = {
  REMEMBER_ME: '@smis_remember_me',
  SAVED_EMAIL: '@smis_saved_email',
  LOGIN_EXPIRY: '@smis_login_expiry',
} as const;

const LOGIN_EXPIRY_DAYS = 30; // 30일 동안 로그인 유지

export function SignInScreen({
  onSignUpPress,
  onSignInSuccess,
  onSocialSignUp,
}: SignInScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  
  // 소셜 로그인 관련 상태
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [socialData, setSocialData] = useState<SocialUserData | null>(null);
  const [existingUserEmail, setExistingUserEmail] = useState('');

  // 컴포넌트 마운트 시 저장된 로그인 정보 확인
  React.useEffect(() => {
    checkSavedLogin();
  }, []);

  const checkSavedLogin = async () => {
    try {
      const [savedRememberMe, savedEmail, loginExpiry] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.REMEMBER_ME),
        AsyncStorage.getItem(STORAGE_KEYS.SAVED_EMAIL),
        AsyncStorage.getItem(STORAGE_KEYS.LOGIN_EXPIRY),
      ]);

      if (savedRememberMe === 'true' && savedEmail) {
        const expiryDate = loginExpiry ? new Date(loginExpiry) : null;
        const now = new Date();

        // 만료 시간 확인
        if (expiryDate && expiryDate > now) {
          setEmail(savedEmail);
          setRememberMe(true);
        } else {
          // 만료된 경우 저장된 정보 삭제
          await clearSavedLogin();
        }
      }
    } catch (error) {
      console.error('저장된 로그인 정보 확인 실패:', error);
    }
  };

  const saveLoginInfo = async (emailToSave: string) => {
    try {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + LOGIN_EXPIRY_DAYS);

      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEYS.REMEMBER_ME, 'true'),
        AsyncStorage.setItem(STORAGE_KEYS.SAVED_EMAIL, emailToSave),
        AsyncStorage.setItem(STORAGE_KEYS.LOGIN_EXPIRY, expiryDate.toISOString()),
      ]);
    } catch (error) {
      console.error('로그인 정보 저장 실패:', error);
    }
  };

  const clearSavedLogin = async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.REMEMBER_ME),
        AsyncStorage.removeItem(STORAGE_KEYS.SAVED_EMAIL),
        AsyncStorage.removeItem(STORAGE_KEYS.LOGIN_EXPIRY),
      ]);
    } catch (error) {
      console.error('저장된 로그인 정보 삭제 실패:', error);
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
      
      // 로그인 성공 시 "로그인 저장" 체크 여부에 따라 처리
      if (rememberMe) {
        await saveLoginInfo(email);
      } else {
        await clearSavedLogin();
      }
      
      Alert.alert('로그인 성공', '환영합니다!');
      onSignInSuccess();
    } catch (error: any) {
      // 인증 실패는 Alert로만 표시 (console.error 제거)
      if (
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
        console.error('로그인 오류:', error);
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
      console.error('비밀번호 재설정 오류:', error);
      
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
  const handleGoogleSignInSuccess = async (socialUserData: SocialUserData) => {
    try {
      const { getUserByEmail } = await import('../services/authService');
      
      const result = await handleSocialLogin(socialUserData, getUserByEmail);
      
      switch (result.action) {
        case 'LOGIN':
          // 기존 active 계정 → 즉시 로그인
          Alert.alert('로그인 성공', '환영합니다!');
          onSignInSuccess();
          break;
          
        case 'NEED_PHONE':
          // 전화번호 입력 필요
          setSocialData(socialUserData);
          setShowPhoneModal(true);
          break;
          
        case 'LINK_TEMP':
          // temp 계정 (이메일 있음 - 드문 케이스)
          setSocialData(socialUserData);
          setShowPhoneModal(true);
          break;
          
        default:
          Alert.alert('오류', '알 수 없는 오류가 발생했습니다.');
      }
    } catch (error: any) {
      console.error('소셜 로그인 처리 실패:', error);
      Alert.alert('오류', handleSocialAuthError(error));
    }
  };

  /**
   * Google 로그인 에러 핸들러
   */
  const handleGoogleSignInError = (error: Error) => {
    console.error('Google 로그인 실패:', error);
    Alert.alert('로그인 실패', handleSocialAuthError(error));
  };

  /**
   * 네이버 로그인 성공 핸들러
   */
  const handleNaverSignInSuccess = async (socialUserData: SocialUserData) => {
    try {
      const { getUserByEmail } = await import('../services/authService');
      
      const result = await handleSocialLogin(socialUserData, getUserByEmail);
      
      switch (result.action) {
        case 'LOGIN':
          // 기존 active 계정 → 즉시 로그인
          Alert.alert('로그인 성공', '환영합니다!');
          onSignInSuccess();
          break;
          
        case 'NEED_PHONE':
          // 전화번호 입력 필요
          setSocialData(socialUserData);
          setShowPhoneModal(true);
          break;
          
        case 'LINK_TEMP':
          // temp 계정 (이메일 있음 - 드문 케이스)
          setSocialData(socialUserData);
          setShowPhoneModal(true);
          break;
          
        default:
          Alert.alert('오류', '알 수 없는 오류가 발생했습니다.');
      }
    } catch (error: any) {
      console.error('소셜 로그인 처리 실패:', error);
      Alert.alert('오류', handleSocialAuthError(error));
    }
  };

  /**
   * 네이버 로그인 에러 핸들러
   */
  const handleNaverSignInError = (error: Error) => {
    console.error('네이버 로그인 실패:', error);
    Alert.alert('로그인 실패', handleSocialAuthError(error));
  };

  /**
   * 전화번호 입력 후 처리
   */
  const handlePhoneSubmit = async (phone: string) => {
    if (!socialData) return;
    
    setIsLoading(true);
    try {
      const { getUserJobCodesInfo } = await import('../services/authService');
      
      const result = await checkTempAccountByPhone(
        phone,
        socialData,
        getUserByPhone,
        getUserJobCodesInfo
      );
      
      if (result.found && result.user) {
        const user = result.user;
        
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
                    // 소셜 회원가입으로 이동
                    if (onSocialSignUp) {
                      onSocialSignUp(socialData);
                    } else {
                      onSignUpPress();
                    }
                  },
                },
                {
                  text: '연동하기',
                  onPress: () => {
                    setShowPhoneModal(false);
                    // temp 계정 연동 후 회원가입 플로우로 이동
                    if (onSocialSignUp) {
                      onSocialSignUp(socialData, user.userId || user.id);
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
              `소셜 계정 이름은 "${socialData.name}"입니다.\n\n` +
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
                    // 소셜 회원가입으로 이동
                    if (onSocialSignUp) {
                      onSocialSignUp(socialData);
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
        // 소셜 회원가입으로 이동
        if (onSocialSignUp) {
          onSocialSignUp(socialData);
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
                  const existingUser = await getUserByPhone(phone);
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
        console.error('전화번호 확인 중 오류:', error);
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
      const { getUserByEmail, getUserById, updateUser } = await import('../services/authService');
      
      await linkSocialToExistingAccount(
        auth,
        existingUserEmail,
        password,
        socialData,
        signIn,
        getUserByEmail,
        getUserById,
        updateUser
      );
      
      setShowPasswordModal(false);
      Alert.alert(
        '연결 완료',
        `${getSocialProviderName(socialData.providerId)} 계정이 연결되었습니다.\n` +
        '다음부터는 소셜 로그인도 사용할 수 있습니다.',
        [{ text: '확인', onPress: onSignInSuccess }]
      );
    } catch (error: any) {
      console.error('계정 연결 실패:', error);
      
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

            {/* 로그인 저장 체크박스 */}
            <TouchableOpacity
              style={styles.rememberMeContainer}
              onPress={() => setRememberMe(!rememberMe)}
              activeOpacity={0.7}
            >
              <Checkbox
                value={rememberMe}
                onValueChange={setRememberMe}
                color={rememberMe ? '#3b82f6' : undefined}
                style={styles.checkbox}
              />
              <Text style={styles.rememberMeText}>로그인 저장 (30일)</Text>
            </TouchableOpacity>

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
          </View>
        </View>
      </ScrollView>
      
      {/* 전화번호 입력 모달 */}
      <PhoneInputModal
        visible={showPhoneModal}
        socialProviderName={socialData ? getSocialProviderName(socialData.providerId) : 'Google'}
        onSubmit={handlePhoneSubmit}
        onCancel={() => setShowPhoneModal(false)}
      />
      
      {/* 비밀번호 입력 모달 (계정 연동용) */}
      <PasswordInputModal
        visible={showPasswordModal}
        email={existingUserEmail}
        onSubmit={handlePasswordSubmit}
        onCancel={() => setShowPasswordModal(false)}
        onForgotPassword={handleForgotPasswordFromModal}
      />
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
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    marginRight: 8,
  },
  rememberMeText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
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
});
