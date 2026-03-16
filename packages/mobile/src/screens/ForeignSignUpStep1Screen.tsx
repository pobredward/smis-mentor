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
import { getUserByPhone } from '../services/authService';

interface ForeignSignUpStep1ScreenProps {
  onNext: (data: {
    firstName: string;
    lastName: string;
    middleName?: string;
    countryCode: string;
    phone: string;
  }) => void;
  onBack: () => void;
}

const countryCodes = [
  { code: '+82', country: 'South Korea', flag: '🇰🇷' },
  { code: '+1', country: 'USA/Canada', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+353', country: 'Ireland', flag: '🇮🇪' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+64', country: 'New Zealand', flag: '🇳🇿' },
  { code: '+27', country: 'South Africa', flag: '🇿🇦' },
];

export function ForeignSignUpStep1Screen({
  onNext,
  onBack,
}: ForeignSignUpStep1ScreenProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [countryCode, setCountryCode] = useState('+82');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!firstName || firstName.length < 1) {
      Alert.alert('Input Error', 'Please enter your First Name.');
      return;
    }

    if (!lastName || lastName.length < 1) {
      Alert.alert('Input Error', 'Please enter your Last Name.');
      return;
    }

    if (!phoneNumber || phoneNumber.length < 8) {
      Alert.alert('Input Error', 'Please enter a valid phone number.');
      return;
    }

    setIsLoading(true);
    try {
      const fullPhone = `${countryCode}${phoneNumber}`;
      const userByPhone = await getUserByPhone(fullPhone);

      if (userByPhone) {
        const { status, role, name: existingName, foreignTeacher } = userByPhone;
        
        // 입력된 이름 조합
        const inputFullName = middleName 
          ? `${firstName} ${middleName} ${lastName}`
          : `${firstName} ${lastName}`;
        
        // 기존 사용자가 임시 원어민(foreign_temp)인 경우
        if (role === 'foreign_temp' && status === 'temp') {
          // 이름 비교 (DB에 저장된 name 또는 foreignTeacher 정보와 비교)
          let namesMatch = false;
          
          // 1. 기본 name 필드와 비교
          if (existingName === inputFullName) {
            namesMatch = true;
          }
          
          // 2. foreignTeacher 정보가 있으면 그것으로도 비교
          if (foreignTeacher) {
            const dbFullName = foreignTeacher.middleName
              ? `${foreignTeacher.firstName} ${foreignTeacher.middleName} ${foreignTeacher.lastName}`
              : `${foreignTeacher.firstName} ${foreignTeacher.lastName}`;
            
            if (dbFullName === inputFullName) {
              namesMatch = true;
            }
          }
          
          if (namesMatch) {
            // 이름이 일치하는 임시 원어민 → 기존 계정 활성화 안내
            Alert.alert(
              'Welcome',
              `Welcome back, ${inputFullName}!\n\nPlease continue your registration to activate your account.`
            );
            onNext({
              firstName,
              lastName,
              middleName: middleName || undefined,
              countryCode,
              phone: phoneNumber,
            });
            return;
          } else {
            // 이름이 불일치 → 관리자가 다른 사람을 등록해둔 것
            Alert.alert(
              'Account Error',
              `The phone number is registered to a different person (${existingName || 'Unknown'}).\n\nPlease contact the administrator or use a different phone number.`
            );
            return;
          }
        }
        
        // 이미 활성화된 원어민(foreign)인 경우
        if (role === 'foreign' && status === 'active') {
          Alert.alert(
            'Account Information',
            'This account already exists. Please return to the login page.'
          );
          return;
        }
        
        // 임시 멘토인 경우
        if (role === 'mentor_temp' && status === 'temp') {
          Alert.alert(
            'Wrong Sign-up Type',
            'This phone number is registered as a mentor. Please use the mentor sign-up option.'
          );
          return;
        }
        
        // 활성 멘토인 경우
        if (role === 'mentor' && status === 'active') {
          Alert.alert(
            'Account Information',
            'This account already exists. Please return to the login page.'
          );
          return;
        }
        
        // 기타 상태 (일반 user 등) → 신규 가입 진행
        Alert.alert(
          'Welcome',
          `Welcome ${firstName}! We're honored to have you with SMIS. Please complete the remaining information.`
        );
        onNext({
          firstName,
          lastName,
          middleName: middleName || undefined,
          countryCode,
          phone: phoneNumber,
        });
      } else {
        // 전화번호로 사용자를 찾을 수 없는 경우 → 신규 가입
        Alert.alert(
          'Welcome',
          `Welcome ${firstName}! We're honored to have you with SMIS. Please complete the remaining information.`
        );
        onNext({
          firstName,
          lastName,
          middleName: middleName || undefined,
          countryCode,
          phone: phoneNumber,
        });
      }
    } catch (error) {
      console.error('User information verification error:', error);
      Alert.alert('Error', 'An error occurred while verifying user information.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCountryCodeSelect = () => {
    Alert.alert(
      'Select Country Code',
      '',
      countryCodes.map((item) => ({
        text: `${item.flag} ${item.code}`,
        onPress: () => setCountryCode(item.code),
      })).concat([{ text: 'Cancel', style: 'cancel' }])
    );
  };

  const getSelectedCountryFlag = () => {
    const selected = countryCodes.find(item => item.code === countryCode);
    return selected ? selected.flag : '🌐';
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
            <Text style={styles.subtitle}>Please enter your personal information</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.stepIndicator}>Step 1/2: Personal Information</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={styles.input}
                placeholder="First Name"
                value={firstName}
                onChangeText={setFirstName}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Last Name"
                value={lastName}
                onChangeText={setLastName}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Middle Name (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="Middle Name (Optional)"
                value={middleName}
                onChangeText={setMiddleName}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number</Text>
              <View style={styles.phoneContainer}>
                <TouchableOpacity
                  style={styles.countryCodeButton}
                  onPress={handleCountryCodeSelect}
                  disabled={isLoading}
                >
                  <Text style={styles.countryFlag}>{getSelectedCountryFlag()}</Text>
                  <Text style={styles.countryCodeText}>{countryCode}</Text>
                  <Text style={styles.dropdownIcon}>▼</Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="Phone Number"
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  keyboardType="phone-pad"
                  editable={!isLoading}
                />
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
                  isLoading && styles.buttonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                {isLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>Next</Text>
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
  phoneContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  countryCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
    minWidth: 100,
  },
  countryFlag: {
    fontSize: 20,
  },
  countryCodeText: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '500',
  },
  dropdownIcon: {
    fontSize: 10,
    color: '#64748b',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1e293b',
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
