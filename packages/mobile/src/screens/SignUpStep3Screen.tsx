import React, { useState, useEffect } from 'react';
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

interface SignUpStep3ScreenProps {
  name: string;
  phone: string;
  email: string;
  password: string;
  onNext: (data: {
    university: string;
    grade: number;
    isOnLeave: boolean | null;
    major1: string;
    major2?: string;
  }) => void;
  onBack: () => void;
}

export function SignUpStep3Screen({
  name,
  phone,
  email,
  password,
  onNext,
  onBack,
}: SignUpStep3ScreenProps) {
  const [university, setUniversity] = useState('');
  const [grade, setGrade] = useState<number | undefined>(undefined);
  const [isOnLeave, setIsOnLeave] = useState<boolean | null>(false);
  const [major1, setMajor1] = useState('');
  const [major2, setMajor2] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (grade === 6) {
      setIsOnLeave(null);
    } else if (grade && grade !== 6) {
      setIsOnLeave(false);
    }
  }, [grade]);

  const handleSubmit = async () => {
    if (!university) {
      Alert.alert('입력 오류', '학교명을 입력해주세요.');
      return;
    }

    if (!grade) {
      Alert.alert('입력 오류', '학년을 선택해주세요.');
      return;
    }

    if (!major1) {
      Alert.alert('입력 오류', '전공을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      onNext({
        university,
        grade,
        isOnLeave,
        major1,
        major2,
      });
    } catch (error) {
      logger.error('교육 정보 확인 오류:', error);
      Alert.alert('오류', '교육 정보 확인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGradeSelect = () => {
    Alert.alert(
      '학년 선택',
      '',
      [
        { text: '1학년', onPress: () => setGrade(1) },
        { text: '2학년', onPress: () => setGrade(2) },
        { text: '3학년', onPress: () => setGrade(3) },
        { text: '4학년', onPress: () => setGrade(4) },
        { text: '5학년', onPress: () => setGrade(5) },
        { text: '졸업생', onPress: () => setGrade(6) },
        { text: '취소', style: 'cancel' },
      ]
    );
  };

  const getGradeLabel = (gradeValue?: number) => {
    if (!gradeValue) return '학년을 선택하세요';
    if (gradeValue === 6) return '졸업생';
    return `${gradeValue}학년`;
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
            <Text style={styles.subtitle}>교육 정보를 입력해주세요</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.stepIndicator}>3/4 단계: 교육 정보</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>학교</Text>
              <TextInput
                style={styles.input}
                placeholder="학교명을 입력하세요"
                value={university}
                onChangeText={setUniversity}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>학년</Text>
              <TouchableOpacity
                style={styles.picker}
                onPress={handleGradeSelect}
                disabled={isLoading}
              >
                <Text style={grade ? styles.pickerText : styles.pickerPlaceholder}>
                  {getGradeLabel(grade)}
                </Text>
                <Text style={styles.pickerArrow}>▼</Text>
              </TouchableOpacity>
            </View>

            {grade !== 6 && (
              <View style={styles.inputGroup}>
                <TouchableOpacity
                  style={styles.checkboxContainer}
                  onPress={() => setIsOnLeave(!isOnLeave)}
                  disabled={isLoading}
                >
                  <View style={[styles.checkbox, isOnLeave && styles.checkboxChecked]}>
                    {isOnLeave && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.checkboxLabel}>현재 휴학 중</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>전공 (1전공)</Text>
              <TextInput
                style={styles.input}
                placeholder="1전공을 입력하세요"
                value={major1}
                onChangeText={setMajor1}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>전공 (2전공/부전공)</Text>
              <TextInput
                style={styles.input}
                placeholder="2전공이 있는 경우 입력하세요 (선택사항)"
                value={major2}
                onChangeText={setMajor2}
                editable={!isLoading}
              />
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
                  isLoading && styles.buttonDisabled,
                ]}
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
  picker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pickerText: {
    fontSize: 16,
    color: '#1e293b',
  },
  pickerPlaceholder: {
    fontSize: 16,
    color: '#94a3b8',
  },
  pickerArrow: {
    fontSize: 12,
    color: '#64748b',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  checkboxChecked: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#1e293b',
  },
  helperText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
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
