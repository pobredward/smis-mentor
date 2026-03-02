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
import { getUserByEmail } from '../services/authService';

interface SignUpStep2ScreenProps {
  name: string;
  phone: string;
  onNext: (data: { email: string; password: string }) => void;
  onBack: () => void;
}

export function SignUpStep2Screen({
  name,
  phone,
  onNext,
  onBack,
}: SignUpStep2ScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [emailExists, setEmailExists] = useState(false);

  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailBlur = async () => {
    if (email && validateEmail(email)) {
      try {
        const existingUser = await getUserByEmail(email);
        setEmailExists(!!existingUser);
      } catch (error) {
        console.error('이메일 중복 확인 오류:', error);
      }
    }
  };

  const handleSubmit = async () => {
    if (!email) {
      Alert.alert('입력 오류', '이메일을 입력해주세요.');
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert('입력 오류', '유효한 이메일 주소를 입력해주세요.');
      return;
    }

    if (!password) {
      Alert.alert('입력 오류', '비밀번호를 입력해주세요.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('입력 오류', '비밀번호는 최소 8자 이상이어야 합니다.');
      return;
    }

    if (!passwordRegex.test(password)) {
      Alert.alert(
        '입력 오류',
        '비밀번호는 문자, 숫자, 특수문자를 포함해야 합니다.'
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('입력 오류', '비밀번호가 일치하지 않습니다.');
      return;
    }

    setIsLoading(true);
    try {
      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        setEmailExists(true);
        Alert.alert('입력 오류', '이미 사용 중인 이메일입니다.');
        setIsLoading(false);
        return;
      }

      onNext({ email, password });
    } catch (error) {
      console.error('계정 정보 확인 오류:', error);
      Alert.alert('오류', '계정 정보 확인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={styles.title}>회원가입</Text>
            <Text style={styles.subtitle}>계정 정보를 입력해주세요</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.stepIndicator}>2/4 단계: 계정 정보</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>이메일</Text>
              <TextInput
                style={[
                  styles.input,
                  emailExists && styles.inputError,
                ]}
                placeholder="이메일 주소를 입력하세요"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setEmailExists(false);
                }}
                onBlur={handleEmailBlur}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!isLoading}
              />
              {emailExists && (
                <Text style={styles.errorText}>이미 사용 중인 이메일입니다.</Text>
              )}
              <Text style={styles.warningText}>
                이메일에 오타가 없는지 다시 한 번 확인해주세요
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>비밀번호</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="비밀번호를 입력하세요"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  editable={!isLoading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                >
                  <Text style={styles.eyeButtonText}>
                    {showPassword ? '숨기기' : '보기'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>비밀번호 확인</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="비밀번호를 다시 입력하세요"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  editable={!isLoading}
                />
                <TouchableOpacity
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  style={styles.eyeButton}
                >
                  <Text style={styles.eyeButtonText}>
                    {showConfirmPassword ? '숨기기' : '보기'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.button, styles.buttonOutline]}
                onPress={onBack}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonOutlineText}>이전</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.button,
                  styles.buttonPrimary,
                  (isLoading || emailExists) && styles.buttonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={isLoading || emailExists}
                activeOpacity={0.7}
              >
                {isLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>다음</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
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
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 30,
    marginTop: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
  },
  form: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  stepIndicator: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
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
  inputError: {
    borderColor: '#ef4444',
  },
  errorText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
  },
  warningText: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
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
  eyeButton: {
    paddingHorizontal: 16,
  },
  eyeButtonText: {
    fontSize: 14,
    color: '#3b82f6',
    fontWeight: '600',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonOutline: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  buttonOutlineText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonPrimary: {
    backgroundColor: '#3b82f6',
  },
  buttonDisabled: {
    backgroundColor: '#94a3b8',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
