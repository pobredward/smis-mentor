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
  LogBox,
} from 'react-native';
import DropDownPicker from 'react-native-dropdown-picker';

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
  
  // Dropdown 상태
  const [gradeDropdownOpen, setGradeDropdownOpen] = useState(false);
  const [gradeItems, setGradeItems] = useState([
    { label: '1학년', value: 1 },
    { label: '2학년', value: 2 },
    { label: '3학년', value: 3 },
    { label: '4학년', value: 4 },
    { label: '5학년', value: 5 },
    { label: '졸업생', value: 6 },
  ]);

  useEffect(() => {
    if (grade === 6) {
      setIsOnLeave(null);
    } else if (grade && grade !== 6) {
      setIsOnLeave(false);
    }
  }, [grade]);

  useEffect(() => {
    // VirtualizedList 경고 무시 (DropDownPicker 사용 시 발생하는 알려진 이슈)
    LogBox.ignoreLogs([
      'VirtualizedLists should never be nested inside plain ScrollViews',
    ]);
  }, []);

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
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        nestedScrollEnabled={true}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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
              <View style={styles.dropdownContainer}>
                <DropDownPicker
                  open={gradeDropdownOpen}
                  value={grade || null}
                  items={gradeItems}
                  setOpen={setGradeDropdownOpen}
                  setValue={setGrade}
                  setItems={setGradeItems}
                  placeholder="학년을 선택하세요"
                  disabled={isLoading}
                  style={styles.dropdown}
                  textStyle={styles.dropdownText}
                  placeholderStyle={styles.dropdownPlaceholder}
                  dropDownContainerStyle={styles.dropdownList}
                  listItemLabelStyle={styles.dropdownItemText}
                  selectedItemLabelStyle={styles.dropdownSelectedText}
                  arrowIconStyle={styles.dropdownArrow}
                  tickIconStyle={styles.dropdownTick}
                  closeAfterSelecting={true}
                  zIndex={1000}
                  zIndexInverse={3000}
                  listMode="SCROLLVIEW"
                  scrollViewProps={{
                    nestedScrollEnabled: true,
                    showsVerticalScrollIndicator: true,
                    scrollEnabled: true,
                    contentContainerStyle: { flexGrow: 1 },
                  }}
                  itemSeparator={true}
                  itemSeparatorStyle={{
                    backgroundColor: '#f1f5f9',
                    height: 1,
                  }}
                />
              </View>
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
  dropdownContainer: {
    zIndex: 1000,
  },
  dropdown: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    minHeight: 48,
  },
  dropdownText: {
    fontSize: 16,
    color: '#1e293b',
  },
  dropdownPlaceholder: {
    fontSize: 16,
    color: '#94a3b8',
  },
  dropdownList: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    marginTop: 2,
    maxHeight: 280, // 학년 선택을 위한 충분한 높이
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 8,
    // Android에서 더 잘 보이도록 설정
    ...(Platform.OS === 'android' && {
      elevation: 10,
      borderWidth: 1.5,
      borderColor: '#cbd5e1',
      maxHeight: 300, // Android에서 더 넉넉하게
    }),
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#1e293b',
  },
  dropdownSelectedText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
  },
  dropdownArrow: {
    width: 20,
    height: 20,
  },
  dropdownTick: {
    width: 20,
    height: 20,
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
