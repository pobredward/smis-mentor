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

interface SignUpStep4ScreenProps {
  name: string;
  phone: string;
  email: string;
  password: string;
  university: string;
  grade: number;
  isOnLeave: boolean | null;
  major1: string;
  major2?: string;
  onNext: (data: {
    address: string;
    addressDetail: string;
    rrnFront: string;
    rrnLast: string;
    gender: 'M' | 'F';
    referralPath: string;
    referrerName?: string;
    otherReferralDetail?: string;
    agreedPersonal: boolean;
  }) => void;
  onBack: () => void;
}

export function SignUpStep4Screen({
  name,
  phone,
  email,
  password,
  university,
  grade,
  isOnLeave,
  major1,
  major2,
  onNext,
  onBack,
}: SignUpStep4ScreenProps) {
  const [address, setAddress] = useState('');
  const [addressDetail, setAddressDetail] = useState('');
  const [rrnFront, setRrnFront] = useState('');
  const [rrnLast, setRrnLast] = useState('');
  const [gender, setGender] = useState<'M' | 'F' | ''>('');
  const [referralPath, setReferralPath] = useState('');
  const [referrerName, setReferrerName] = useState('');
  const [otherReferralDetail, setOtherReferralDetail] = useState('');
  const [agreedPersonal, setAgreedPersonal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Dropdown 상태들
  const [genderDropdownOpen, setGenderDropdownOpen] = useState(false);
  const [referralDropdownOpen, setReferralDropdownOpen] = useState(false);

  // 다른 dropdown이 열릴 때 나머지 닫기
  const handleGenderDropdownOpen = (open: boolean) => {
    if (open) {
      setReferralDropdownOpen(false);
    }
    setGenderDropdownOpen(open);
  };

  const handleReferralDropdownOpen = (open: boolean) => {
    if (open) {
      setGenderDropdownOpen(false);
    }
    setReferralDropdownOpen(open);
  };
  const [genderItems, setGenderItems] = useState([
    { label: '남성', value: 'M' },
    { label: '여성', value: 'F' },
  ]);
  const [referralItems, setReferralItems] = useState([
    { label: '지인추천', value: '지인추천' },
    { label: '인스타그램', value: '인스타그램' },
    { label: '페이스북', value: '페이스북' },
    { label: '카카오톡', value: '카카오톡' },
    { label: '구글검색', value: '구글검색' },
    { label: '네이버검색', value: '네이버검색' },
    { label: '대학교 공지', value: '대학교 공지' },
    { label: '기타', value: '기타' },
  ]);

  // 주민번호가 변경될 때마다 성별 자동 설정
  useEffect(() => {
    if (rrnFront.length === 6 && rrnLast.length === 7) {
      const genderCode = rrnLast.charAt(0);
      if (genderCode === '1' || genderCode === '3') {
        setGender('M');
      } else if (genderCode === '2' || genderCode === '4') {
        setGender('F');
      }
    }
  }, [rrnFront, rrnLast]);

  useEffect(() => {
    // VirtualizedList 경고 무시 (DropDownPicker 사용 시 발생하는 알려진 이슈)
    LogBox.ignoreLogs([
      'VirtualizedLists should never be nested inside plain ScrollViews',
    ]);
  }, []);

  const handleSubmit = async () => {
    // 입력 검증
    if (!address) {
      Alert.alert('입력 오류', '주소를 입력해주세요.');
      return;
    }

    if (!addressDetail) {
      Alert.alert('입력 오류', '상세 주소를 입력해주세요.');
      return;
    }

    if (rrnFront.length !== 6) {
      Alert.alert('입력 오류', '주민번호 앞자리 6자리를 입력해주세요.');
      return;
    }

    if (rrnLast.length !== 7) {
      Alert.alert('입력 오류', '주민번호 뒷자리 7자리를 입력해주세요.');
      return;
    }

    if (!gender) {
      Alert.alert('입력 오류', '성별을 선택해주세요.');
      return;
    }

    if (!referralPath) {
      Alert.alert('입력 오류', '가입 경로를 선택해주세요.');
      return;
    }

    if (referralPath === '지인추천' && !referrerName.trim()) {
      Alert.alert('입력 오류', '추천인을 입력해주세요.');
      return;
    }

    if (referralPath === '기타' && !otherReferralDetail.trim()) {
      Alert.alert('입력 오류', '기타 경로를 입력해주세요.');
      return;
    }

    if (!agreedPersonal) {
      Alert.alert('약관 동의', '개인정보 수집 및 이용에 동의해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      onNext({
        address,
        addressDetail,
        rrnFront,
        rrnLast,
        gender,
        referralPath,
        referrerName: referralPath === '지인추천' ? referrerName : undefined,
        otherReferralDetail: referralPath === '기타' ? otherReferralDetail : undefined,
        agreedPersonal,
      });
    } catch (error) {
      logger.error('상세 정보 확인 오류:', error);
      Alert.alert('오류', '상세 정보 확인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };



  // 주소 입력 안내 (실제 주소 API 연동은 나중에 구현)
  const handleAddressInput = () => {
    Alert.alert(
      '주소 입력',
      '현재 모바일에서는 직접 주소를 입력해주세요.\n예: 서울특별시 강남구 테헤란로 123',
      [{ text: '확인' }]
    );
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
            <Text style={styles.subtitle}>상세 정보를 입력해주세요</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.stepIndicator}>4/4 단계: 상세 정보</Text>

            {/* 주소 입력 */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>주소</Text>
              <TouchableOpacity
                style={styles.addressInput}
                onPress={handleAddressInput}
              >
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="주소를 입력하세요"
                  value={address}
                  onChangeText={setAddress}
                  editable={!isLoading}
                />
                <Text style={styles.addressButton}>📍</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>상세 주소</Text>
              <TextInput
                style={styles.input}
                placeholder="상세 주소를 입력하세요"
                value={addressDetail}
                onChangeText={setAddressDetail}
                editable={!isLoading}
              />
            </View>

            {/* 주민번호 입력 */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>주민번호</Text>
              <View style={styles.rrnContainer}>
                <TextInput
                  style={[styles.input, styles.rrnInput]}
                  placeholder="000000"
                  value={rrnFront}
                  onChangeText={(text) => setRrnFront(text.replace(/\D/g, '').slice(0, 6))}
                  keyboardType="numeric"
                  maxLength={6}
                  editable={!isLoading}
                />
                <Text style={styles.rrnDash}>-</Text>
                <TextInput
                  style={[styles.input, styles.rrnInput]}
                  placeholder="0000000"
                  value={rrnLast}
                  onChangeText={(text) => setRrnLast(text.replace(/\D/g, '').slice(0, 7))}
                  keyboardType="numeric"
                  maxLength={7}
                  secureTextEntry
                  editable={!isLoading}
                />
              </View>
            </View>

            {/* 성별 선택 */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>성별</Text>
              <View style={styles.dropdownContainer}>
                <DropDownPicker
                  open={genderDropdownOpen}
                  value={gender || null}
                  items={genderItems}
                  setOpen={handleGenderDropdownOpen}
                  setValue={setGender}
                  setItems={setGenderItems}
                  placeholder="성별을 선택하세요"
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
                  zIndex={2000}
                  zIndexInverse={1000}
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
              {rrnFront.length === 6 && rrnLast.length === 7 && (
                <Text style={styles.helperText}>주민번호로 자동 설정됩니다</Text>
              )}
            </View>

            {/* 가입 경로 */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>가입 경로</Text>
              <View style={styles.dropdownContainer}>
                <DropDownPicker
                  open={referralDropdownOpen}
                  value={referralPath || null}
                  items={referralItems}
                  setOpen={handleReferralDropdownOpen}
                  setValue={setReferralPath}
                  setItems={setReferralItems}
                  placeholder="가입 경로를 선택하세요"
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
                  zIndexInverse={2000}
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

            {/* 추천인 입력 (지인추천 선택 시) */}
            {referralPath === '지인추천' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>추천인</Text>
                <TextInput
                  style={styles.input}
                  placeholder="추천인 이름을 입력하세요"
                  value={referrerName}
                  onChangeText={setReferrerName}
                  editable={!isLoading}
                />
              </View>
            )}

            {/* 기타 경로 입력 (기타 선택 시) */}
            {referralPath === '기타' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>기타 경로</Text>
                <TextInput
                  style={styles.input}
                  placeholder="구체적인 가입 경로를 입력하세요"
                  value={otherReferralDetail}
                  onChangeText={setOtherReferralDetail}
                  editable={!isLoading}
                />
              </View>
            )}

            {/* 개인정보 동의 */}
            <View style={styles.inputGroup}>
              <TouchableOpacity
                style={styles.checkboxContainer}
                onPress={() => setAgreedPersonal(!agreedPersonal)}
                disabled={isLoading}
              >
                <View style={[styles.checkbox, agreedPersonal && styles.checkboxChecked]}>
                  {agreedPersonal && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>
                  개인정보 수집 및 이용에 동의합니다 (필수)
                </Text>
              </TouchableOpacity>
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
                  <Text style={styles.buttonText}>회원가입 완료</Text>
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
  addressInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  addressButton: {
    fontSize: 18,
    marginLeft: 8,
  },
  rrnContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rrnInput: {
    flex: 1,
  },
  rrnDash: {
    fontSize: 18,
    color: '#64748b',
    marginHorizontal: 8,
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
    maxHeight: 200, // 기본 높이
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
      maxHeight: 250, // Android에서 더 넉넉하게
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
    flex: 1,
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