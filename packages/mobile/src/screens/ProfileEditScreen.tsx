import React, { useState, useEffect } from 'react';
import { logger, updateGeocodeIfAddressChanged } from '@smis-mentor/shared';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../context/AuthContext';
import {
  uploadProfileImage,
  updateUserProfile,
  checkEmailExists,
  checkPhoneExists,
} from '../services/profileService';
import { compressImage, uriToBlob } from '../utils';
import { DaumPostcode } from '../components/DaumPostcode';
import { getPhonePlaceholder } from '../utils/phoneUtils';
import Constants from 'expo-constants';

type ProfileEditNavigationProp = NativeStackNavigationProp<RootStackParamList, 'ProfileEdit'>;

const countryCodes = [
  { code: '+82', country: 'South Korea', flag: '🇰🇷' },
  { code: '+1', country: 'USA/Canada', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+353', country: 'Ireland', flag: '🇮🇪' },
  { code: '+61', country: 'Australia', flag: '🇦🇺' },
  { code: '+64', country: 'New Zealand', flag: '🇳🇿' },
  { code: '+27', country: 'South Africa', flag: '🇿🇦' },
];

// 멘토용 스키마
const profileSchemaMentor = z.object({
  name: z.string().min(2, '이름은 최소 2자 이상이어야 합니다.'),
  dateOfBirth: z.string().optional(),
  phoneNumber: z.string().min(8, '유효한 휴대폰 번호를 입력해주세요.'),
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  address: z.string().min(1, '주소를 입력해주세요.'),
  addressDetail: z.string().min(1, '상세 주소를 입력해주세요.'),
  gender: z.enum(['M', 'F'], {
    errorMap: () => ({ message: '성별을 선택해주세요.' }),
  }),
  selfIntroduction: z.string().max(500, '자기소개는 500자 이내로 작성해주세요.').optional(),
  jobMotivation: z.string().max(500, '지원 동기는 500자 이내로 작성해주세요.').optional(),
  university: z.string().min(1, '학교명을 입력해주세요.'),
  grade: z.number({
    required_error: '학년을 선택해주세요.',
    invalid_type_error: '학년을 선택해주세요.',
  }).min(1, '학년을 선택해주세요.').max(6, '유효한 학년을 선택해주세요.'),
  isOnLeave: z.boolean(),
  major1: z.string().min(1, '전공을 입력해주세요.'),
  major2: z.string().optional(),
});

// 원어민용 스키마: firstName/lastName/middleName 분화, name 자동합성이므로 optional, 학교정보 불필요
const profileSchemaForeign = z.object({
  name: z.string().optional(),
  firstName: z.string().min(1, 'Please enter your First Name.'),
  lastName: z.string().min(1, 'Please enter your Last Name.'),
  middleName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  phoneNumber: z.string().min(8, 'Please enter a valid phone number.'),
  email: z.string().email('Please enter a valid email address.'),
  address: z.string().optional(),
  addressDetail: z.string().optional(),
  gender: z.enum(['M', 'F'], {
    errorMap: () => ({ message: 'Please select your gender.' }),
  }),
  selfIntroduction: z.string().optional(),
  jobMotivation: z.string().optional(),
  university: z.string().optional(),
  grade: z.number().optional(),
  isOnLeave: z.boolean().optional(),
  major1: z.string().optional(),
  major2: z.string().optional(),
});

type MentorFormValues = z.infer<typeof profileSchemaMentor>;
type ForeignFormValues = z.infer<typeof profileSchemaForeign>;
type ProfileFormValues = MentorFormValues & Partial<ForeignFormValues>;

interface PartTimeJob {
  period: string;
  companyName: string;
  position: string;
  description: string;
}

export function ProfileEditScreen() {
  const navigation = useNavigation<ProfileEditNavigationProp>();
  const insets = useSafeAreaInsets();
  const { userData, refreshUserData } = useAuth();
  const isForeign = userData?.role === 'foreign' || userData?.role === 'foreign_temp';
  const [isLoading, setIsLoading] = useState(false);
  const [profileImageUrl, setProfileImageUrl] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [emailExists, setEmailExists] = useState(false);
  const [phoneExists, setPhoneExists] = useState(false);
  const [partTimeJobs, setPartTimeJobs] = useState<PartTimeJob[]>([]);
  const [isAddressModalVisible, setIsAddressModalVisible] = useState(false);
  const [countryCode, setCountryCode] = useState('+82');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeSchema: any = isForeign ? profileSchemaForeign : profileSchemaMentor;
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(activeSchema),
    defaultValues: {
      name: '',
      firstName: '',
      lastName: '',
      middleName: '',
      dateOfBirth: '',
      phoneNumber: '',
      email: '',
      address: '',
      addressDetail: '',
      gender: undefined,
      selfIntroduction: '',
      jobMotivation: '',
      university: '',
      grade: undefined,
      isOnLeave: false,
      major1: '',
      major2: '',
    },
  });

  const currentEmail = watch('email');
  const currentPhone = watch('phoneNumber');
  const currentSelfIntro = watch('selfIntroduction') || '';
  const currentJobMotivation = watch('jobMotivation') || '';

  // 사용자 데이터로 폼 초기화
  useEffect(() => {
    if (userData) {
      const isForeignUser = userData.role === 'foreign' || userData.role === 'foreign_temp';
      
      // 전화번호 처리
      let extractedCountryCode = '+82';
      let phoneWithoutCode = userData.phoneNumber || '';
      
      if (isForeignUser && userData.phoneNumber) {
        // 원어민: 국가코드에서 분리
        const foundCode = countryCodes.find(cc => userData.phoneNumber?.startsWith(cc.code));
        if (foundCode) {
          extractedCountryCode = foundCode.code;
          phoneWithoutCode = userData.phoneNumber.substring(foundCode.code.length);
          
          // 한국 번호의 경우 0 추가 (10 -> 010)
          if (extractedCountryCode === '+82' && phoneWithoutCode.length === 10 && !phoneWithoutCode.startsWith('0')) {
            phoneWithoutCode = '0' + phoneWithoutCode;
          }
        }
      } else {
        // 멘토: 국가코드 없이 그대로 사용
        phoneWithoutCode = userData.phoneNumber || '';
      }
      
      setCountryCode(extractedCountryCode);

      // 생년월일 처리 (YYYY-MM-DD 형식)
      let dateOfBirthValue = '';
      if (userData.dateOfBirth) {
        dateOfBirthValue = String(userData.dateOfBirth).substring(0, 10);
      }

      reset({
        name: userData.name,
        firstName: userData.foreignTeacher?.firstName || '',
        lastName: userData.foreignTeacher?.lastName || '',
        middleName: userData.foreignTeacher?.middleName || '',
        dateOfBirth: dateOfBirthValue,
        phoneNumber: phoneWithoutCode,
        email: userData.email,
        address: userData.address || '',
        addressDetail: userData.addressDetail || '',
        gender: userData.gender as 'M' | 'F',
        selfIntroduction: userData.selfIntroduction || '',
        jobMotivation: userData.jobMotivation || '',
        university: userData.university || '',
        grade: userData.grade || undefined,
        isOnLeave: userData.isOnLeave || false,
        major1: userData.major1 || '',
        major2: userData.major2 || '',
      });

      if (userData.profileImage) {
        setProfileImageUrl(userData.profileImage);
      }

      setPartTimeJobs(userData.partTimeJobs || []);
    }
  }, [userData, reset]);

  // 이미지 선택 및 업로드
  const handleImagePick = async () => {
    try {
      // 권한 요청
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert(isForeign ? 'Permission Required' : '권한 필요', isForeign ? 'Photo library access permission is required.' : '사진 라이브러리 접근 권한이 필요합니다.');
        return;
      }

      // 이미지 선택
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      logger.error('이미지 선택 오류:', error);
      Alert.alert('오류', '이미지 선택 중 오류가 발생했습니다.');
    }
  };

  // 이미지 업로드
  const uploadImage = async (uri: string) => {
    if (!userData) return;

    try {
      setIsUploading(true);
      setUploadProgress(0);

      // 이미지 압축
      const compressed = await compressImage(uri, 0.8);
      const blob = await uriToBlob(compressed.uri);

      // Firebase Storage에 업로드
      const downloadURL = await uploadProfileImage(
        userData.userId,
        blob,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      // Firestore에 프로필 이미지 URL 저장
      await updateUserProfile(userData.userId, {
        profileImage: downloadURL,
      });

      setProfileImageUrl(downloadURL);
      await refreshUserData();
      Alert.alert(isForeign ? 'Success' : '성공', isForeign ? 'Profile image has been updated.' : '프로필 이미지가 변경되었습니다.');
    } catch (error) {
      logger.error('이미지 업로드 오류:', error);
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'An error occurred while uploading the image.' : '이미지 업로드 중 오류가 발생했습니다.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // 이메일 중복 확인
  const handleEmailBlur = async () => {
    if (currentEmail && currentEmail !== userData?.email && !errors.email) {
      try {
        const exists = await checkEmailExists(currentEmail, userData?.userId);
        setEmailExists(exists);
      } catch (error) {
        logger.error('이메일 검증 오류:', error);
        setEmailExists(false);
      }
    } else {
      setEmailExists(false);
    }
  };

  // 전화번호 중복 확인
  const handlePhoneBlur = async () => {
    if (currentPhone && currentPhone !== userData?.phoneNumber && !errors.phoneNumber) {
      try {
        const exists = await checkPhoneExists(currentPhone, userData?.userId);
        setPhoneExists(exists);
      } catch (error) {
        logger.error('전화번호 검증 오류:', error);
        setPhoneExists(false);
      }
    } else {
      setPhoneExists(false);
    }
  };

  // 알바 경력 추가
  const addPartTimeJob = () => {
    const newJob: PartTimeJob = {
      period: '',
      companyName: '',
      position: '',
      description: '',
    };
    setPartTimeJobs([...partTimeJobs, newJob]);
  };

  // 알바 경력 삭제
  const removePartTimeJob = (index: number) => {
    const updatedJobs = [...partTimeJobs];
    updatedJobs.splice(index, 1);
    setPartTimeJobs(updatedJobs);
  };

  // 알바 경력 업데이트
  const updatePartTimeJob = (index: number, field: keyof PartTimeJob, value: string) => {
    const updatedJobs = [...partTimeJobs];
    updatedJobs[index] = { ...updatedJobs[index], [field]: value };
    setPartTimeJobs(updatedJobs);
  };

  // 폼 제출
  const onSubmit = async (data: ProfileFormValues) => {
    if (!userData) return;

    setIsLoading(true);
    try {
      // 전화번호 처리 - 원어민만 국가코드 적용
      let finalPhoneNumber: string;
      
      if (isForeign) {
        // 원어민: 국가코드 + 전화번호 (0 제거)
        let phoneWithoutLeadingZero = data.phoneNumber;
        
        // 한국 번호의 경우 맨 앞 0 제거 (010 -> 10)
        if (countryCode === '+82' && phoneWithoutLeadingZero.startsWith('0')) {
          phoneWithoutLeadingZero = phoneWithoutLeadingZero.substring(1);
        }
        
        finalPhoneNumber = `${countryCode}${phoneWithoutLeadingZero}`;
      } else {
        // 멘토: 국가코드 없이 그대로 저장
        finalPhoneNumber = data.phoneNumber;
      }
      
      // 이메일 중복 확인
      if (data.email !== userData.email) {
        const existsEmail = await checkEmailExists(data.email, userData.userId);
        if (existsEmail) {
          setEmailExists(true);
          Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'This email is already in use.' : '이미 사용 중인 이메일입니다.');
          setIsLoading(false);
          return;
        }
      }

      // 전화번호 중복 확인
      if (finalPhoneNumber !== userData.phoneNumber) {
        const existsPhone = await checkPhoneExists(finalPhoneNumber, userData.userId);
        if (existsPhone) {
          setPhoneExists(true);
          Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'This phone number is already in use.' : '이미 사용 중인 전화번호입니다.');
          setIsLoading(false);
          return;
        }
      }

      // 업데이트할 데이터 준비
      const updateData: Record<string, unknown> = {};

      if (isForeign) {
        // 원어민: firstName/lastName/middleName으로 name 합성
        const firstName = (data.firstName ?? '').trim();
        const lastName = (data.lastName ?? '').trim();
        const middleName = (data.middleName ?? '').trim();
        const fullName = middleName
          ? `${firstName} ${middleName} ${lastName}`
          : `${firstName} ${lastName}`;
        updateData.name = fullName;

        // foreignTeacher 서브 필드 동기화
        updateData.foreignTeacher = {
          ...(userData.foreignTeacher || {}),
          firstName,
          lastName,
          middleName,
          countryCode,
        };
      } else {
        updateData.name = data.name;
        // 멘토 전용: 학교 정보
        updateData.university = data.university;
        if (data.grade !== undefined) updateData.grade = data.grade;
        updateData.isOnLeave = data.isOnLeave ?? false;
        updateData.major1 = data.major1;
        updateData.major2 = data.major2 || '';
        updateData.partTimeJobs = partTimeJobs;
        updateData.selfIntroduction = data.selfIntroduction || '';
        updateData.jobMotivation = data.jobMotivation || '';
      }

      // 공통 필드
      if (data.dateOfBirth) updateData.dateOfBirth = data.dateOfBirth;
      updateData.phoneNumber = finalPhoneNumber;
      updateData.email = data.email;
      updateData.address = data.address || '';
      updateData.addressDetail = data.addressDetail || '';
      updateData.gender = data.gender;

      // 주소가 변경되었으면 자동으로 좌표 업데이트
      if (data.address !== userData.address) {
        logger.info('📍 프로필 수정 - 주소 변경 감지:', data.address);
        const kakaoApiKey = Constants.expoConfig?.extra?.kakaoRestApiKey;
        const geocodeUpdate = await updateGeocodeIfAddressChanged(
          userData.address,
          data.address,
          kakaoApiKey
        );
        Object.assign(updateData, geocodeUpdate);
      }

      // 사용자 정보 업데이트
      await updateUserProfile(userData.userId, updateData);
      await refreshUserData();

      Alert.alert(
        isForeign ? 'Success' : '성공',
        isForeign ? 'Profile has been updated successfully.' : '프로필이 성공적으로 업데이트되었습니다.',
        [{ text: isForeign ? 'OK' : '확인', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      logger.error('프로필 업데이트 오류:', error);
      Alert.alert(isForeign ? 'Error' : '오류', isForeign ? 'An error occurred while updating profile.' : '프로필 업데이트 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 주소 검색 완료 처리
  const handleAddressComplete = (data: { address: string; zonecode: string }) => {
    logger.info('📱 주소 검색 완료 (프로필 수정):', data);
    
    setValue('address', data.address, { shouldValidate: true });
    
    // 주소 선택 완료 알림
    setTimeout(() => {
      Alert.alert(
        isForeign ? 'Address Selected' : '주소 선택 완료', 
        isForeign ? 'Address has been selected. Please enter detailed address.' : '주소가 선택되었습니다. 상세 주소를 입력해주세요.',
        [{ text: isForeign ? 'OK' : '확인' }]
      );
    }, 300);
  };

  // 주소 검색 모달 닫기
  const handleAddressCancel = () => {
    setIsAddressModalVisible(false);
  };

  if (!userData) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{isForeign ? 'Unable to load user information.' : '사용자 정보를 불러올 수 없습니다.'}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
        {/* 헤더 */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{isForeign ? 'Edit Profile' : '프로필 수정'}</Text>
          <TouchableOpacity
            style={[styles.headerSaveButton, (isLoading || emailExists || phoneExists) && styles.headerSaveButtonDisabled]}
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading || emailExists || phoneExists}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.headerSaveButtonText}>{isForeign ? 'Save' : '저장'}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          {/* 프로필 이미지 */}
          <View style={styles.imageSection}>
            <Text style={styles.label}>{isForeign ? 'Profile Image' : '프로필 이미지'}</Text>
            <View style={styles.imageContainer}>
              {profileImageUrl ? (
                <Image source={{ uri: profileImageUrl }} style={styles.profileImage} />
              ) : (
                <View style={styles.placeholderImage}>
                  <Text style={styles.placeholderText}>{userData.name.charAt(0)}</Text>
                </View>
              )}
              {isUploading && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="large" color="#ffffff" />
                  <Text style={styles.uploadProgressText}>{uploadProgress.toFixed(0)}%</Text>
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.changeImageButton}
              onPress={handleImagePick}
              disabled={isUploading}
            >
              <Text style={styles.changeImageButtonText}>{isForeign ? 'Change Image' : '이미지 변경'}</Text>
            </TouchableOpacity>
          </View>


          {/* 개인 정보 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{isForeign ? 'Personal Information' : '개인 정보'}</Text>

            {isForeign ? (
              <>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>First Name *</Text>
                  <Controller
                    control={control}
                    name="firstName"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        style={[styles.input, (errors as Record<string, {message?: string}>).firstName && styles.inputError]}
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value ?? ''}
                        placeholder="Enter your First Name"
                        autoCapitalize="words"
                      />
                    )}
                  />
                  {(errors as Record<string, {message?: string}>).firstName && (
                    <Text style={styles.errorMessage}>{(errors as Record<string, {message?: string}>).firstName?.message}</Text>
                  )}
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Middle Name <Text style={styles.optionalLabel}>(optional)</Text></Text>
                  <Controller
                    control={control}
                    name="middleName"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        style={styles.input}
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value ?? ''}
                        placeholder="Enter your Middle Name"
                        autoCapitalize="words"
                      />
                    )}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Last Name *</Text>
                  <Controller
                    control={control}
                    name="lastName"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        style={[styles.input, (errors as Record<string, {message?: string}>).lastName && styles.inputError]}
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value ?? ''}
                        placeholder="Enter your Last Name"
                        autoCapitalize="words"
                      />
                    )}
                  />
                  {(errors as Record<string, {message?: string}>).lastName && (
                    <Text style={styles.errorMessage}>{(errors as Record<string, {message?: string}>).lastName?.message}</Text>
                  )}
                </View>
              </>
            ) : (
              <View style={styles.formGroup}>
                <Text style={styles.label}>이름 *</Text>
                <Controller
                  control={control}
                  name="name"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.input, errors.name && styles.inputError]}
                      onBlur={onBlur}
                      onChangeText={onChange}
                      value={value ?? ''}
                      placeholder="이름을 입력하세요"
                    />
                  )}
                />
                {errors.name && <Text style={styles.errorMessage}>{errors.name.message}</Text>}
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.label}>{isForeign ? 'Date of Birth' : '생년월일'}</Text>
              <Controller
                control={control}
                name="dateOfBirth"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={styles.input}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value ?? ''}
                    placeholder="YYYY-MM-DD"
                    keyboardType="numeric"
                    maxLength={10}
                  />
                )}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{isForeign ? 'Email *' : '이메일 *'}</Text>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[
                      styles.input,
                      (errors.email || emailExists) && styles.inputError,
                    ]}
                    onBlur={() => {
                      onBlur();
                      handleEmailBlur();
                    }}
                    onChangeText={onChange}
                    value={value}
                    placeholder={isForeign ? 'Enter your email' : '이메일 주소를 입력하세요'}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                )}
              />
              {emailExists && <Text style={styles.errorMessage}>{isForeign ? 'This email is already in use.' : '이미 사용 중인 이메일입니다.'}</Text>}
              {errors.email && <Text style={styles.errorMessage}>{errors.email.message}</Text>}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{isForeign ? 'Phone Number *' : '휴대폰 번호 *'}</Text>
              {isForeign ? (
                // 원어민: 국가코드 선택 + 전화번호
                <View style={styles.phoneRow}>
                  <TouchableOpacity
                    style={styles.countryCodeButton}
                    onPress={() => setShowCountryPicker(true)}
                  >
                    <Text style={styles.countryCodeText}>
                      {countryCodes.find(c => c.code === countryCode)?.flag} {countryCode}
                    </Text>
                    <Text style={styles.countryCodeArrow}>▼</Text>
                  </TouchableOpacity>
                  <Controller
                    control={control}
                    name="phoneNumber"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        style={[
                          styles.phoneInput,
                          (errors.phoneNumber || phoneExists) && styles.inputError,
                        ]}
                        onBlur={() => {
                          onBlur();
                          handlePhoneBlur();
                        }}
                        onChangeText={onChange}
                        value={value}
                        placeholder={getPhonePlaceholder(countryCode)}
                        keyboardType="phone-pad"
                      />
                    )}
                  />
                </View>
              ) : (
                // 멘토: 전화번호만
                <Controller
                  control={control}
                  name="phoneNumber"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[
                        styles.input,
                        (errors.phoneNumber || phoneExists) && styles.inputError,
                      ]}
                      onBlur={() => {
                        onBlur();
                        handlePhoneBlur();
                      }}
                      onChangeText={onChange}
                      value={value}
                      placeholder="-없이 입력하세요"
                      keyboardType="phone-pad"
                    />
                  )}
                />
              )}
              {phoneExists && <Text style={styles.errorMessage}>{isForeign ? 'This phone number is already in use.' : '이미 사용 중인 휴대폰 번호입니다.'}</Text>}
              {errors.phoneNumber && <Text style={styles.errorMessage}>{errors.phoneNumber.message}</Text>}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                {isForeign ? (
                  <>{'Address '}<Text style={styles.optionalLabel}>(optional)</Text></>
                ) : '주소 *'}
              </Text>
              <View style={styles.addressRow}>
                <Controller
                  control={control}
                  name="address"
                  render={({ field: { value } }) => (
                    <TextInput
                      style={[styles.addressInput, errors.address && styles.inputError]}
                      value={value}
                      placeholder={isForeign ? 'Click search button' : '주소 검색 버튼을 클릭하세요'}
                      editable={false}
                    />
                  )}
                />
                <TouchableOpacity
                  style={styles.searchButton}
                  onPress={() => setIsAddressModalVisible(true)}
                >
                  <Text style={styles.searchButtonText}>{isForeign ? 'Search' : '검색'}</Text>
                </TouchableOpacity>
              </View>
              {errors.address && <Text style={styles.errorMessage}>{errors.address.message}</Text>}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>
                {isForeign ? (
                  <>{'Detailed Address '}<Text style={styles.optionalLabel}>(optional)</Text></>
                ) : '상세 주소 *'}
              </Text>
              <Controller
                control={control}
                name="addressDetail"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, errors.addressDetail && styles.inputError]}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    placeholder={isForeign ? 'Enter detailed address' : '상세 주소를 입력하세요'}
                  />
                )}
              />
              {errors.addressDetail && <Text style={styles.errorMessage}>{errors.addressDetail.message}</Text>}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>{isForeign ? 'Gender *' : '성별 *'}</Text>
              <Controller
                control={control}
                name="gender"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.radioGroup}>
                    <TouchableOpacity
                      style={styles.radioButton}
                      onPress={() => onChange('M')}
                    >
                      <View style={[styles.radioCircle, value === 'M' && styles.radioCircleSelected]}>
                        {value === 'M' && <View style={styles.radioDot} />}
                      </View>
                      <Text style={styles.radioLabel}>{isForeign ? 'Male' : '남성'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.radioButton}
                      onPress={() => onChange('F')}
                    >
                      <View style={[styles.radioCircle, value === 'F' && styles.radioCircleSelected]}>
                        {value === 'F' && <View style={styles.radioDot} />}
                      </View>
                      <Text style={styles.radioLabel}>{isForeign ? 'Female' : '여성'}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
              {errors.gender && <Text style={styles.errorMessage}>{errors.gender.message}</Text>}
            </View>

            {!isForeign && (
            <>
            <View style={styles.formGroup}>
              <View style={styles.labelWithCount}>
                <Text style={styles.label}>자기소개</Text>
                <Text style={styles.charCount}>{currentSelfIntro.length}/500자</Text>
              </View>
              <Controller
                control={control}
                name="selfIntroduction"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.textarea, errors.selfIntroduction && styles.inputError]}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    placeholder="간단한 자기소개를 입력하세요"
                    multiline
                    maxLength={500}
                  />
                )}
              />
            </View>

            <View style={styles.formGroup}>
              <View style={styles.labelWithCount}>
                <Text style={styles.label}>지원 동기</Text>
                <Text style={styles.charCount}>{currentJobMotivation.length}/500자</Text>
              </View>
              <Controller
                control={control}
                name="jobMotivation"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.textarea, errors.jobMotivation && styles.inputError]}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    placeholder="업무 지원 동기를 입력하세요"
                    multiline
                    maxLength={500}
                  />
                )}
              />
            </View>
            </>
            )}
          </View>

          {/* 학교 정보 - 원어민은 숨기기 */}
          {!isForeign && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>학교 정보</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>학교 *</Text>
              <Controller
                control={control}
                name="university"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, errors.university && styles.inputError]}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    placeholder="학교명을 입력하세요"
                  />
                )}
              />
              {errors.university && <Text style={styles.errorMessage}>{errors.university.message}</Text>}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>학년 *</Text>
              <Controller
                control={control}
                name="grade"
                render={({ field: { onChange, value } }) => (
                  <View style={styles.gradeButtons}>
                    {[1, 2, 3, 4, 5, 6].map((grade) => (
                      <TouchableOpacity
                        key={grade}
                        style={[
                          styles.gradeButton,
                          value === grade && styles.gradeButtonSelected,
                        ]}
                        onPress={() => onChange(grade)}
                      >
                        <Text
                          style={[
                            styles.gradeButtonText,
                            value === grade && styles.gradeButtonTextSelected,
                          ]}
                        >
                          {grade === 6 ? '졸업생' : `${grade}학년`}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              />
              {errors.grade && <Text style={styles.errorMessage}>{errors.grade.message}</Text>}
            </View>

            <View style={styles.formGroup}>
              <Controller
                control={control}
                name="isOnLeave"
                render={({ field: { onChange, value } }) => (
                  <TouchableOpacity
                    style={styles.checkboxButton}
                    onPress={() => onChange(!value)}
                  >
                    <View style={[styles.checkbox, value && styles.checkboxChecked]}>
                      {value && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.checkboxLabel}>현재 휴학 중</Text>
                  </TouchableOpacity>
                )}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>전공 (1전공) *</Text>
              <Controller
                control={control}
                name="major1"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, errors.major1 && styles.inputError]}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    placeholder="1전공을 입력하세요"
                  />
                )}
              />
              {errors.major1 && <Text style={styles.errorMessage}>{errors.major1.message}</Text>}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>전공 (2전공/부전공)</Text>
              <Controller
                control={control}
                name="major2"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={styles.input}
                    onBlur={onBlur}
                    onChangeText={onChange}
                    value={value}
                    placeholder="2전공이 있는 경우 입력하세요 (선택사항)"
                  />
                )}
              />
            </View>
          </View>
          )}

          {/* 알바 & 멘토링 경력 - 원어민은 숨기기 */}
          {!isForeign && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>알바 & 멘토링 경력</Text>
              <TouchableOpacity onPress={addPartTimeJob} style={styles.addButton}>
                <Text style={styles.addButtonText}>+ 경력 추가</Text>
              </TouchableOpacity>
            </View>

            {partTimeJobs.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>알바 & 멘토링 경력을 추가해보세요.</Text>
              </View>
            ) : (
              <View style={styles.jobsList}>
                {partTimeJobs.map((job, index) => (
                  <View key={index} style={styles.jobItem}>
                    <TouchableOpacity
                      style={styles.removeJobButton}
                      onPress={() => removePartTimeJob(index)}
                    >
                      <Text style={styles.removeJobButtonText}>×</Text>
                    </TouchableOpacity>

                    <TextInput
                      style={styles.jobInput}
                      placeholder="기간 (예: 2022.03 - 2022.09)"
                      value={job.period}
                      onChangeText={(text) => updatePartTimeJob(index, 'period', text)}
                    />
                    <TextInput
                      style={styles.jobInput}
                      placeholder="회사명"
                      value={job.companyName}
                      onChangeText={(text) => updatePartTimeJob(index, 'companyName', text)}
                    />
                    <TextInput
                      style={styles.jobInput}
                      placeholder="담당/직무"
                      value={job.position}
                      onChangeText={(text) => updatePartTimeJob(index, 'position', text)}
                    />
                    <TextInput
                      style={styles.jobInput}
                      placeholder="간략한 업무 내용"
                      value={job.description}
                      onChangeText={(text) => updatePartTimeJob(index, 'description', text)}
                    />
                  </View>
                ))}
              </View>
            )}
          </View>
          )}

        </View>
      </ScrollView>
      
      {/* 주소 검색 모달 */}
      <DaumPostcode
        visible={isAddressModalVisible}
        onComplete={handleAddressComplete}
        onClose={handleAddressCancel}
      />

      {/* Country Code Picker Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showCountryPicker}
        onRequestClose={() => setShowCountryPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isForeign ? 'Select Country Code' : '국가 코드 선택'}</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.countryList}>
              {countryCodes.map((country) => (
                <TouchableOpacity
                  key={country.code}
                  style={[
                    styles.countryItem,
                    countryCode === country.code && styles.countryItemSelected
                  ]}
                  onPress={() => {
                    setCountryCode(country.code);
                    setShowCountryPicker(false);
                  }}
                >
                  <Text style={styles.countryFlag}>{country.flag}</Text>
                  <Text style={styles.countryName}>{country.country}</Text>
                  <Text style={styles.countryCodeInList}>{country.code}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  backButton: {
    marginRight: 12,
    minWidth: 32,
  },
  backButtonText: {
    fontSize: 24,
    color: '#3b82f6',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  headerSaveButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  headerSaveButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  headerSaveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  errorText: {
    textAlign: 'center',
    color: '#ef4444',
    marginTop: 20,
  },

  // 이미지 섹션
  imageSection: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
  },
  imageContainer: {
    position: 'relative',
    marginVertical: 16,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
  },
  placeholderImage: {
    width: 120,
    height: 120,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 48,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadProgressText: {
    color: '#ffffff',
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  changeImageButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  changeImageButtonText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '500',
  },

  // 섹션
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 16,
  },
  
  // 폼 그룹
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  optionalLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#9ca3af',
  },
  labelWithCount: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  charCount: {
    fontSize: 12,
    color: '#6b7280',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1f2937',
  },
  inputError: {
    borderColor: '#ef4444',
  },
  addressRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addressInput: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1f2937',
  },
  searchButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  textarea: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1f2937',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  errorMessage: {
    fontSize: 12,
    color: '#ef4444',
    marginTop: 4,
  },

  // 라디오 버튼
  radioGroup: {
    flexDirection: 'row',
    gap: 24,
  },
  radioButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  radioCircleSelected: {
    borderColor: '#3b82f6',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3b82f6',
  },
  radioLabel: {
    fontSize: 15,
    color: '#374151',
  },

  // 체크박스
  checkboxButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
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
    fontSize: 15,
    color: '#374151',
  },

  // 학년 버튼
  gradeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gradeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  gradeButtonSelected: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
  },
  gradeButtonText: {
    fontSize: 14,
    color: '#374151',
  },
  gradeButtonTextSelected: {
    color: '#ffffff',
    fontWeight: '600',
  },

  // 경력 관리
  addButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
  },
  addButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '500',
  },
  emptyBox: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6b7280',
    fontSize: 14,
  },
  jobsList: {
    gap: 12,
  },
  jobItem: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 16,
    position: 'relative',
  },
  removeJobButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeJobButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  jobInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 8,
  },

  // 저장 버튼
  submitButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  // 전화번호 관련
  phoneRow: {
    flexDirection: 'row',
    gap: 8,
  },
  countryCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    minWidth: 100,
  },
  countryCodeText: {
    fontSize: 14,
    color: '#111827',
    marginRight: 4,
  },
  countryCodeArrow: {
    fontSize: 10,
    color: '#6b7280',
  },
  phoneInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
  },

  // 국가코드 선택 모달
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalCloseButton: {
    fontSize: 24,
    color: '#6b7280',
    fontWeight: '300',
  },
  countryList: {
    maxHeight: 400,
  },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  countryItemSelected: {
    backgroundColor: '#eff6ff',
  },
  countryFlag: {
    fontSize: 24,
    marginRight: 12,
  },
  countryName: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  countryCodeInList: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },

  // 파일 업로드 관련
  filePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 8,
  },
  filePreviewText: {
    flex: 1,
    fontSize: 14,
    color: '#16a34a',
    fontWeight: '500',
  },
  changeFileButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
  },
  changeFileButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  uploadButton: {
    padding: 12,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 8,
    alignItems: 'center',
  },
  uploadButtonText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '500',
  },

});
