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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getUserByEmail } from '../services/authService';

interface ForeignSignUpStep2ScreenProps {
  firstName: string;
  lastName: string;
  middleName?: string;
  countryCode: string;
  phone: string;
  onNext: (data: {
    email: string;
    password: string;
  }) => void;
  onBack: () => void;
}

export function ForeignSignUpStep2Screen({
  firstName,
  lastName,
  middleName,
  countryCode,
  phone,
  onNext,
  onBack,
}: ForeignSignUpStep2ScreenProps) {
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
        logger.error('Email duplicate check error:', error);
      }
    }
  };

  const handleSubmit = async () => {
    if (!email) {
      Alert.alert('Input Error', 'Please enter your email.');
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert('Input Error', 'Please enter a valid email address.');
      return;
    }

    if (!password) {
      Alert.alert('Input Error', 'Please enter your password.');
      return;
    }

    if (password.length < 8) {
      Alert.alert('Input Error', 'Password must be at least 8 characters long.');
      return;
    }

    if (!passwordRegex.test(password)) {
      Alert.alert(
        'Input Error',
        'Password must contain letters, numbers, and special characters.'
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Input Error', 'Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const existingUser = await getUserByEmail(email);
      if (existingUser) {
        setEmailExists(true);
        Alert.alert('Input Error', 'This email is already in use.');
        setIsLoading(false);
        return;
      }

      onNext({ email, password });
    } catch (error) {
      logger.error('Account information verification error:', error);
      Alert.alert('Error', 'An error occurred while verifying account information.');
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
            <Text style={styles.title}>Foreign Teacher Sign Up</Text>
            <Text style={styles.subtitle}>Set up your account credentials</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.stepIndicator}>Step 2/2: Account Information</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[
                  styles.input,
                  emailExists && styles.inputError,
                ]}
                placeholder="Enter your email address"
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
                <Text style={styles.errorText}>This email is already in use.</Text>
              )}
              <Text style={styles.warningText}>
                Please double-check your email for any typos
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Enter your password"
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
                    {showPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.passwordContainer}>
                <TextInput
                  style={styles.passwordInput}
                  placeholder="Re-enter your password"
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
                    {showConfirmPassword ? 'Hide' : 'Show'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.divider} />

            {/* 서류 업로드 안내 */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color="#3b82f6" style={styles.infoIcon} />
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>Document Upload Required After Registration</Text>
                <Text style={styles.infoText}>
                  After completing registration, please upload the following documents in <Text style={styles.infoTextBold}>Profile Edit</Text>:
                </Text>
                <Text style={styles.infoItem}>• Profile Photo</Text>
                <Text style={styles.infoItem}>• CV (PDF)</Text>
                <Text style={styles.infoItem}>• Passport Photo</Text>
                <Text style={styles.infoItem}>• Alien Registration Card (if applicable)</Text>
              </View>
            </View>

            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.button, styles.buttonOutline]}
                onPress={onBack}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                <Text style={styles.buttonOutlineText}>Back</Text>
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
                  <Text style={styles.buttonText}>Complete</Text>
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
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 20,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    padding: 14,
    marginBottom: 24,
  },
  infoIcon: {
    marginRight: 10,
    marginTop: 1,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e40af',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#1d4ed8',
    marginBottom: 6,
    lineHeight: 18,
  },
  infoTextBold: {
    fontWeight: '700',
  },
  infoItem: {
    fontSize: 13,
    color: '#1d4ed8',
    lineHeight: 20,
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
    backgroundColor: '#10b981',
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
