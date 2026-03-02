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
import { getUserByPhone, getUserJobCodesInfo } from '../services/authService';

interface SignUpStep1ScreenProps {
  onNext: (data: { name: string; phone: string }) => void;
  onSignInPress: () => void;
}

export function SignUpStep1Screen({
  onNext,
  onSignInPress,
}: SignUpStep1ScreenProps) {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name || name.length < 2) {
      Alert.alert('입력 오류', '이름은 최소 2자 이상이어야 합니다.');
      return;
    }

    if (!phoneNumber || phoneNumber.length < 10 || phoneNumber.length > 11) {
      Alert.alert('입력 오류', '유효한 휴대폰 번호를 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      const userByPhone = await getUserByPhone(phoneNumber);

      if (userByPhone) {
        const { name: userName, status, jobExperiences } = userByPhone;

        if (name === userName) {
          if (status === 'temp' && jobExperiences && jobExperiences.length > 0) {
            // 임시 사용자이고 jobExperiences가 있는 경우
            const jobCodes = await getUserJobCodesInfo(jobExperiences);

            if (jobCodes.length === 0) {
              Alert.alert(
                '오류',
                '직무 정보를 불러오는데 실패했습니다. 관리자에게 문의하세요.'
              );
              setIsLoading(false);
              return;
            }

            const jobCodesText = jobCodes
              .map((job) => `${job.generation} ${job.code} - ${job.name}`)
              .join('\n');

            Alert.alert(
              '멘토 정보 확인',
              `${jobCodesText}\n\n위 업무에 참여하신 ${userName} 멘토가 맞습니까?`,
              [
                {
                  text: '아니오',
                  onPress: () => {
                    Alert.alert(
                      '정보 확인',
                      '관리자가 정보를 잘못 입력했네요. 일단 회원가입을 이어서 진행하시고, 잘못된 정보는 관리자에게 카톡이나 문자 주시면 바로 수정하겠습니다. 관리자 번호: 010-7656-7933 신선웅',
                      [
                        {
                          text: '예',
                          onPress: () => onNext({ name, phone: phoneNumber }),
                        },
                      ]
                    );
                  },
                },
                {
                  text: '예',
                  onPress: () => {
                    Alert.alert(
                      '환영합니다',
                      '다시 돌아온 것을 환영합니다. 회원가입을 이어서 진행 바랍니다'
                    );
                    onNext({ name, phone: phoneNumber });
                  },
                },
              ]
            );
          } else if (status === 'active') {
            // 이미 active 상태인 경우
            Alert.alert(
              '가입 정보 확인',
              '이미 가입된 유저입니다. 회원 정보를 잊으셨으면 관리자에게 카톡이나 문자 바랍니다. 관리자 번호: 010-7656-7933 신선웅',
              [
                {
                  text: '예',
                  onPress: onSignInPress,
                },
              ]
            );
          } else {
            // temp 상태이지만 jobExperiences가 없는 경우
            Alert.alert(
              '환영합니다',
              `환영합니다 ${name}님, SMIS와 함께 하게 되어 영광입니다. 나머지 정보를 채워주세요.`
            );
            onNext({ name, phone: phoneNumber });
          }
        } else {
          // 이름이 일치하지 않는 경우
          Alert.alert(
            '환영합니다',
            `환영합니다 ${name}님, SMIS와 함께 하게 되어 영광입니다. 나머지 정보를 채워주세요.`
          );
          onNext({ name, phone: phoneNumber });
        }
      } else {
        // 전화번호로 사용자를 찾을 수 없는 경우
        Alert.alert(
          '환영합니다',
          `환영합니다 ${name}님, SMIS와 함께 하게 되어 영광입니다. 나머지 정보를 채워주세요.`
        );
        onNext({ name, phone: phoneNumber });
      }
    } catch (error) {
      console.error('사용자 정보 확인 오류:', error);
      Alert.alert('오류', '사용자 정보 확인 중 오류가 발생했습니다.');
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
            <Text style={styles.subtitle}>개인 정보를 입력해주세요</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.stepIndicator}>1/4 단계: 개인 정보</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>이름</Text>
              <TextInput
                style={styles.input}
                placeholder="실명을 입력하세요"
                value={name}
                onChangeText={setName}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>휴대폰 번호</Text>
              <TextInput
                style={styles.input}
                placeholder="'-' 없이 입력하세요"
                value={phoneNumber}
                onChangeText={setPhoneNumber}
                keyboardType="phone-pad"
                editable={!isLoading}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={isLoading}
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
  button: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
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
