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
  Switch,
} from 'react-native';
import { saveSensitiveInfo } from '../services/apiClient';
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
  referralPath: z.string().optional(),
  referrerName: z.string().optional(),
  otherReferralDetail: z.string().optional(),
  rrnFront: z.string().optional(),
  rrnLast: z.string().optional(),
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
  const [showRrnLast, setShowRrnLast] = useState(false);
  const [hasExistingRRN, setHasExistingRRN] = useState(false);
  

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
      referralPath: '',
      referrerName: '',
      otherReferralDetail: '',
      rrnFront: '',
      rrnLast: '',
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
        referralPath: (userData.referralPath || '').startsWith('기타: ')
          ? '기타'
          : (userData.referralPath || ''),
        referrerName: userData.referrerName || '',
        otherReferralDetail: (userData.referralPath || '').startsWith('기타: ')
          ? (userData.referralPath || '').substring(4).trim()
          : '',
        rrnFront: userData.rrnFront || '',
        rrnLast: '',
      });

      const hasRRN = !!(userData.rrnFront && ((userData as any).rrnLastEncrypted || userData.rrnLast));
      setHasExistingRRN(hasRRN);

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

        // 가입 경로 처리
        let referralPath = data.referralPath || '';
        if (data.referralPath === '기타' && (data as any).otherReferralDetail) {
          referralPath = `기타: ${(data as any).otherReferralDetail}`;
        }
        updateData.referralPath = referralPath;
        updateData.referrerName = (data as any).referrerName || '';
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

      // 주민번호 변경이 있을 경우 암호화 API 호출
      if (!isForeign) {
        const rrnFront = (data as any).rrnFront as string | undefined;
        const rrnLast = (data as any).rrnLast as string | undefined;
        if (rrnFront && rrnLast && /^\d{6}$/.test(rrnFront) && /^\d{7}$/.test(rrnLast)) {
          try {
            await saveSensitiveInfo({ userId: userData.userId, rrnFront, rrnLast });
          } catch (rrnErr) {
            logger.error('주민번호 저장 실패:', rrnErr);
            Alert.alert('오류', '주민번호 저장에 실패했습니다. 다시 시도해주세요.');
            setIsLoading(false);
            return;
          }
        }
      }

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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 56 : 0}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 44 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {/* 헤더 */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{isForeign ? 'Edit Profile' : '프로필 수정'}</Text>
          <TouchableOpacity
            style={[styles.saveButton, (isLoading || emailExists || phoneExists) && styles.saveButtonDisabled]}
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading || emailExists || phoneExists}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.saveButtonText}>{isForeign ? 'Save' : '저장'}</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.content}>

          {/* ━━━ 1. 개인 정보 ━━━ */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{isForeign ? 'Personal Information' : '개인 정보'}</Text>
            </View>

            {/* 프로필 이미지 (인라인) */}
            <View style={styles.imageRow}>
              <TouchableOpacity onPress={handleImagePick} disabled={isUploading} style={styles.imageWrapper}>
                {profileImageUrl ? (
                  <Image source={{ uri: profileImageUrl }} style={styles.profileImage} />
                ) : (
                  <View style={styles.profileImagePlaceholder}>
                    <Text style={styles.profileImagePlaceholderText}>{userData.name.charAt(0)}</Text>
                  </View>
                )}
                {isUploading && (
                  <View style={styles.uploadOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.uploadProgressText}>{uploadProgress.toFixed(0)}%</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={handleImagePick} disabled={isUploading} style={styles.changeImageBtn}>
                <Text style={styles.changeImageBtnText}>{isForeign ? 'Change Image' : '이미지 변경'}</Text>
              </TouchableOpacity>
            </View>

            {/* 이름 + 성별 (2열) */}
            {isForeign ? (
              <>
                <View style={styles.row2}>
                  <View style={styles.col}>
                    <Text style={styles.label}>First Name *</Text>
                    <Controller control={control} name="firstName"
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput style={[styles.input, (errors as any).firstName && styles.inputError]}
                          onBlur={onBlur} onChangeText={onChange} value={value ?? ''} placeholder="First Name" autoCapitalize="words" />
                      )} />
                    {(errors as any).firstName && <Text style={styles.errorMsg}>{(errors as any).firstName.message}</Text>}
                  </View>
                  <View style={styles.col}>
                    <Text style={styles.label}>Last Name *</Text>
                    <Controller control={control} name="lastName"
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput style={[styles.input, (errors as any).lastName && styles.inputError]}
                          onBlur={onBlur} onChangeText={onChange} value={value ?? ''} placeholder="Last Name" autoCapitalize="words" />
                      )} />
                    {(errors as any).lastName && <Text style={styles.errorMsg}>{(errors as any).lastName.message}</Text>}
                  </View>
                </View>
                <View style={[styles.formGroup, styles.formGroupLast]}>
                  <Text style={styles.label}>Middle Name <Text style={styles.optional}>(optional)</Text></Text>
                  <Controller control={control} name="middleName"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput style={styles.input} onBlur={onBlur} onChangeText={onChange} value={value ?? ''} placeholder="Middle Name" autoCapitalize="words" />
                    )} />
                </View>
              </>
            ) : (
              <View style={styles.row2}>
                <View style={styles.col}>
                  <Text style={styles.label}>이름 *</Text>
                  <Controller control={control} name="name"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput style={[styles.input, errors.name && styles.inputError]}
                        onBlur={onBlur} onChangeText={onChange} value={value ?? ''} placeholder="이름" />
                    )} />
                  {errors.name && <Text style={styles.errorMsg}>{errors.name.message}</Text>}
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>성별</Text>
                  <Controller control={control} name="gender"
                    render={({ field: { onChange, value } }) => (
                      <View style={styles.genderRow}>
                        {(['M', 'F'] as const).map(g => (
                          <TouchableOpacity key={g} onPress={() => onChange(g)}
                            style={[styles.genderBtn, value === g && styles.genderBtnActive]}>
                            <Text style={[styles.genderBtnText, value === g && styles.genderBtnTextActive]}>
                              {g === 'M' ? '남성' : '여성'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )} />
                  {errors.gender && <Text style={styles.errorMsg}>{errors.gender.message}</Text>}
                </View>
              </View>
            )}

            {/* 이메일 (1열) */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>{isForeign ? 'Email *' : '이메일 *'}</Text>
              <Controller control={control} name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    style={[styles.input, (errors.email || emailExists) && styles.inputError]}
                    onBlur={() => { onBlur(); handleEmailBlur(); }}
                    onChangeText={onChange} value={value}
                    placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" />
                )} />
              {emailExists && <Text style={styles.errorMsg}>이미 사용 중</Text>}
              {errors.email && <Text style={styles.errorMsg}>{errors.email.message}</Text>}
            </View>

            {/* 전화번호 (1열) */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>{isForeign ? 'Phone *' : '전화번호 *'}</Text>
              {isForeign ? (
                <View style={styles.phoneRow}>
                  <TouchableOpacity style={styles.countryCodeBtn} onPress={() => setShowCountryPicker(true)}>
                    <Text style={styles.countryCodeText}>{countryCodes.find(c => c.code === countryCode)?.flag} {countryCode} ▼</Text>
                  </TouchableOpacity>
                  <Controller control={control} name="phoneNumber"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput style={[styles.phoneInput, (errors.phoneNumber || phoneExists) && styles.inputError]}
                        onBlur={() => { onBlur(); handlePhoneBlur(); }}
                        onChangeText={onChange} value={value} placeholder={getPhonePlaceholder(countryCode)} keyboardType="phone-pad" />
                    )} />
                </View>
              ) : (
                <Controller control={control} name="phoneNumber"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput style={[styles.input, (errors.phoneNumber || phoneExists) && styles.inputError]}
                      onBlur={() => { onBlur(); handlePhoneBlur(); }}
                      onChangeText={onChange} value={value} placeholder="01012345678" keyboardType="phone-pad" />
                  )} />
              )}
              {phoneExists && <Text style={styles.errorMsg}>이미 사용 중</Text>}
              {errors.phoneNumber && <Text style={styles.errorMsg}>{errors.phoneNumber.message}</Text>}
            </View>

            {/* 원어민 성별 + 생년월일 (2열) */}
            {isForeign && (
              <View style={[styles.row2, styles.row2Last]}>
                <View style={styles.col}>
                  <Text style={styles.label}>Gender</Text>
                  <Controller control={control} name="gender"
                    render={({ field: { onChange, value } }) => (
                      <View style={styles.genderRow}>
                        {(['M', 'F'] as const).map(g => (
                          <TouchableOpacity key={g} onPress={() => onChange(g)}
                            style={[styles.genderBtn, value === g && styles.genderBtnActive]}>
                            <Text style={[styles.genderBtnText, value === g && styles.genderBtnTextActive]}>
                              {g === 'M' ? 'Male' : 'Female'}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )} />
                  {errors.gender && <Text style={styles.errorMsg}>{errors.gender.message}</Text>}
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>Date of Birth <Text style={styles.optional}>(optional)</Text></Text>
                  <Controller control={control} name="dateOfBirth"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        style={styles.input}
                        onBlur={onBlur}
                        onChangeText={(text) => {
                          const digits = text.replace(/[^0-9]/g, '');
                          let formatted = digits;
                          if (digits.length >= 5) {
                            formatted = `${digits.substring(0, 4)}-${digits.substring(4)}`;
                          }
                          if (digits.length >= 7) {
                            formatted = `${digits.substring(0, 4)}-${digits.substring(4, 6)}-${digits.substring(6, 8)}`;
                          }
                          onChange(formatted);
                        }}
                        value={value ?? ''}
                        placeholder="YYYY-MM-DD"
                        keyboardType="number-pad"
                        maxLength={10}
                      />
                    )} />
                  <Text style={styles.hint}>YYYY-MM-DD</Text>
                  {(errors as any).dateOfBirth && <Text style={styles.errorMsg}>{(errors as any).dateOfBirth.message}</Text>}
                </View>
              </View>
            )}

            {/* 주민등록번호 (멘토 전용) */}
            {!isForeign && (
              <View style={[styles.formGroup, styles.dividerTop]}>
                <View style={styles.rrnHeader}>
                  <Text style={styles.subSectionTitle}>주민등록번호</Text>
                  <View style={styles.rrnBadge}>
                    <Text style={styles.rrnBadgeText}>🔒 암호화 저장{hasExistingRRN ? ' · 변경 시에만 입력' : ''}</Text>
                  </View>
                </View>
                {/* 앞자리 */}
                <Text style={styles.label}>앞자리 (6자리)</Text>
                <Controller control={control} name={'rrnFront' as any}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.rrnInput, (errors as any).rrnFront && styles.inputError]}
                      onBlur={onBlur}
                      onChangeText={t => onChange(t.replace(/\D/g, '').slice(0, 6))}
                      value={value ?? ''}
                      placeholder="000000" keyboardType="numeric" maxLength={6} />
                  )} />
                {(errors as any).rrnFront && <Text style={styles.errorMsg}>{(errors as any).rrnFront.message}</Text>}
                {/* 뒷자리 */}
                <View style={[styles.rrnLastHeader, { marginTop: 10 }]}>
                  <Text style={styles.label}>뒷자리 (7자리)</Text>
                  <TouchableOpacity onPress={() => setShowRrnLast(!showRrnLast)}>
                    <Text style={styles.rrnToggle}>{showRrnLast ? '숨기기' : '보기'}</Text>
                  </TouchableOpacity>
                </View>
                <Controller control={control} name={'rrnLast' as any}
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                      style={[styles.rrnInput, (errors as any).rrnLast && styles.inputError]}
                      onBlur={onBlur}
                      onChangeText={t => onChange(t.replace(/\D/g, '').slice(0, 7))}
                      value={value ?? ''}
                      placeholder="0000000" keyboardType="numeric" maxLength={7}
                      secureTextEntry={!showRrnLast} />
                  )} />
                {(errors as any).rrnLast && <Text style={styles.errorMsg}>{(errors as any).rrnLast.message}</Text>}
                {hasExistingRRN && !watch('rrnFront' as any) && (
                  <Text style={[styles.hint, { paddingHorizontal: 0, paddingBottom: 0, marginTop: 6 }]}>비워두면 기존 저장 정보가 유지됩니다.</Text>
                )}
              </View>
            )}

            {/* 가입 경로 (멘토 전용) */}
            {!isForeign && (
              <View style={[styles.formGroup, styles.dividerTop, styles.formGroupLast]}>
                <Text style={styles.subSectionTitle}>가입 경로</Text>
                <View style={styles.referralGrid}>
                  {['에브리타임','학교 커뮤니티','링커리어','캠퍼스픽','인스타그램','페이스북','구글/네이버 등 검색','지인 소개','기타'].map(option => (
                    <Controller key={option} control={control} name={'referralPath' as any}
                      render={({ field: { onChange, value } }) => (
                        <TouchableOpacity
                          style={[styles.referralChip, value === option && styles.referralChipActive]}
                          onPress={() => onChange(option)}>
                          <Text style={[styles.referralChipText, value === option && styles.referralChipTextActive]}>{option}</Text>
                        </TouchableOpacity>
                      )} />
                  ))}
                </View>
                {watch('referralPath' as any) === '지인 소개' && (
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>소개인 이름</Text>
                    <Controller control={control} name={'referrerName' as any}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput style={styles.input} onBlur={onBlur} onChangeText={onChange} value={value ?? ''} placeholder="지인의 이름" />
                      )} />
                  </View>
                )}
                {watch('referralPath' as any) === '기타' && (
                  <View style={styles.formGroup}>
                    <Text style={styles.label}>기타 상세</Text>
                    <Controller control={control} name={'otherReferralDetail' as any}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput style={styles.input} onBlur={onBlur} onChangeText={onChange} value={value ?? ''} placeholder="어떤 경로인지 입력해주세요" />
                      )} />
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ━━━ 2. 학교 정보 (멘토 전용) ━━━ */}
          {!isForeign && (
            <View style={styles.section}>
              <View style={[styles.sectionHeader, { borderLeftColor: '#a855f7' }]}>
                <Text style={styles.sectionTitle}>학교 정보</Text>
              </View>

              {/* 학교 + 학년 (2열) */}
              <View style={styles.row2}>
                <View style={styles.col}>
                  <Text style={styles.label}>학교 *</Text>
                  <Controller control={control} name="university"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput style={[styles.input, errors.university && styles.inputError]}
                        onBlur={onBlur} onChangeText={onChange} value={value} placeholder="학교명" />
                    )} />
                  {errors.university && <Text style={styles.errorMsg}>{errors.university.message}</Text>}
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>학년 *</Text>
                  <Controller control={control} name="grade"
                    render={({ field: { onChange, value } }) => (
                      <View style={styles.gradeGrid}>
                        {[1, 2, 3, 4, 5, 6].map(g => (
                          <TouchableOpacity key={g} onPress={() => onChange(g)}
                            style={[styles.gradeBtn, value === g && styles.gradeBtnActive]}>
                            <Text style={[styles.gradeBtnText, value === g && styles.gradeBtnTextActive]}>
                              {g === 6 ? '졸업' : `${g}학년`}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )} />
                  {errors.grade && <Text style={styles.errorMsg}>{errors.grade.message}</Text>}
                </View>
              </View>

              {/* 전공 (2열) */}
              <View style={styles.row2Last}>
                <View style={styles.col}>
                  <Text style={styles.label}>1전공 *</Text>
                  <Controller control={control} name="major1"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput style={[styles.input, errors.major1 && styles.inputError]}
                        onBlur={onBlur} onChangeText={onChange} value={value} placeholder="1전공" />
                    )} />
                  {errors.major1 && <Text style={styles.errorMsg}>{errors.major1.message}</Text>}
                </View>
                <View style={styles.col}>
                  <Text style={styles.label}>2전공/부전공</Text>
                  <Controller control={control} name="major2"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput style={styles.input} onBlur={onBlur} onChangeText={onChange} value={value} placeholder="2전공 (선택)" />
                    )} />
                </View>
              </View>

              {/* 휴학 */}
              <Controller control={control} name="isOnLeave"
                render={({ field: { onChange, value } }) => (
                  <TouchableOpacity style={[styles.checkRow, { borderTopWidth: 1, borderTopColor: '#f1f5f9' }]} onPress={() => onChange(!value)}>
                    <View style={[styles.checkbox, value && styles.checkboxChecked]}>
                      {value && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.checkLabel}>현재 휴학 중</Text>
                  </TouchableOpacity>
                )} />
            </View>
          )}

          {/* ━━━ 3. 주소 ━━━ */}
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { borderLeftColor: '#22c55e' }]}>
              <Text style={styles.sectionTitle}>{isForeign ? 'Address' : '주소'}</Text>
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.label}>
                {isForeign ? 'Address (optional)' : '주소 *'}
              </Text>
              <View style={styles.addressRow}>
                <Controller control={control} name="address"
                  render={({ field: { value } }) => (
                    <TextInput style={styles.addressInput} value={value}
                      placeholder={isForeign ? 'Tap search button' : '주소 검색 버튼을 누르세요'} editable={false} />
                  )} />
                <TouchableOpacity style={styles.searchBtn} onPress={() => setIsAddressModalVisible(true)}>
                  <Text style={styles.searchBtnText}>{isForeign ? 'Search' : '검색'}</Text>
                </TouchableOpacity>
              </View>
              {errors.address && <Text style={styles.errorMsg}>{errors.address.message}</Text>}
            </View>
            <View style={[styles.formGroup, styles.formGroupLast]}>
              <Text style={styles.label}>{isForeign ? 'Detailed Address (optional)' : '상세 주소 *'}</Text>
              <Controller control={control} name="addressDetail"
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput style={[styles.input, errors.addressDetail && styles.inputError]}
                    onBlur={onBlur} onChangeText={onChange} value={value}
                    placeholder={isForeign ? 'Detailed address' : '상세 주소'} />
                )} />
              {errors.addressDetail && <Text style={styles.errorMsg}>{errors.addressDetail.message}</Text>}
            </View>
          </View>

          {/* ━━━ 4. 자기소개 & 지원 동기 (멘토 전용) ━━━ */}
          {!isForeign && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>자기소개 & 지원 동기</Text>
              </View>
              <View style={styles.formGroup}>
                <View style={styles.textareaHeader}>
                  <Text style={styles.label}>자기소개</Text>
                  <Text style={styles.charCount}>{currentSelfIntro.length}/500</Text>
                </View>
                <Controller control={control} name="selfIntroduction"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput style={styles.textarea} onBlur={onBlur} onChangeText={onChange} value={value}
                      placeholder="간단한 자기소개를 입력해주세요." multiline scrollEnabled={false} maxLength={500} textAlignVertical="top" />
                  )} />
              </View>
              <View style={[styles.formGroup, styles.formGroupLast]}>
                <View style={styles.textareaHeader}>
                  <Text style={styles.label}>지원 동기</Text>
                  <Text style={styles.charCount}>{currentJobMotivation.length}/500</Text>
                </View>
                <Controller control={control} name="jobMotivation"
                  render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput style={styles.textarea} onBlur={onBlur} onChangeText={onChange} value={value}
                      placeholder="지원 동기를 입력해주세요." multiline scrollEnabled={false} maxLength={500} textAlignVertical="top" />
                  )} />
              </View>
            </View>
          )}

          {/* ━━━ 5. 알바 & 멘토링 경력 (멘토 전용) ━━━ */}
          {!isForeign && (
            <View style={styles.section}>
              <View style={[styles.sectionHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderLeftColor: '#f97316' }]}>
                <Text style={styles.sectionTitle}>알바 & 멘토링 경력</Text>
                <TouchableOpacity onPress={addPartTimeJob} style={styles.addBtn}>
                  <Text style={styles.addBtnText}>+ 경력 추가</Text>
                </TouchableOpacity>
              </View>
              {partTimeJobs.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>경력을 추가해보세요</Text>
                </View>
              ) : (
                partTimeJobs.map((job, index) => (
                  <View key={index} style={[styles.jobItem, index === partTimeJobs.length - 1 && styles.jobItemLast]}>
                    <TouchableOpacity style={styles.removeJobBtn} onPress={() => removePartTimeJob(index)}>
                      <Text style={styles.removeJobBtnText}>×</Text>
                    </TouchableOpacity>
                    <View style={styles.jobRow}>
                      <View style={styles.col}>
                        <Text style={styles.labelSm}>기간 *</Text>
                        <TextInput style={styles.inputSm} placeholder="2022.03~09"
                          value={job.period} onChangeText={t => updatePartTimeJob(index, 'period', t)} />
                      </View>
                      <View style={styles.col}>
                        <Text style={styles.labelSm}>회사명 *</Text>
                        <TextInput style={styles.inputSm} placeholder="회사명"
                          value={job.companyName} onChangeText={t => updatePartTimeJob(index, 'companyName', t)} />
                      </View>
                    </View>
                    <View style={[styles.jobRow, { marginTop: 8 }]}>
                      <View style={styles.col}>
                        <Text style={styles.labelSm}>담당 *</Text>
                        <TextInput style={styles.inputSm} placeholder="담당"
                          value={job.position} onChangeText={t => updatePartTimeJob(index, 'position', t)} />
                      </View>
                      <View style={styles.col}>
                        <Text style={styles.labelSm}>업무내용</Text>
                        <TextInput style={styles.inputSm} placeholder="내용(선택)"
                          value={job.description} onChangeText={t => updatePartTimeJob(index, 'description', t)} />
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

        </View>
      </ScrollView>

      {/* 주소 검색 모달 */}
      <DaumPostcode visible={isAddressModalVisible} onComplete={handleAddressComplete} onClose={handleAddressCancel} />

      {/* 국가 코드 선택 모달 */}
      <Modal animationType="slide" transparent visible={showCountryPicker} onRequestClose={() => setShowCountryPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{isForeign ? 'Select Country Code' : '국가 코드 선택'}</Text>
              <TouchableOpacity onPress={() => setShowCountryPicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {countryCodes.map(c => (
                <TouchableOpacity key={c.code} style={[styles.countryItem, countryCode === c.code && styles.countryItemActive]}
                  onPress={() => { setCountryCode(c.code); setShowCountryPicker(false); }}>
                  <Text style={styles.countryFlag}>{c.flag}</Text>
                  <Text style={styles.countryName}>{c.country}</Text>
                  <Text style={styles.countryCode}>{c.code}</Text>
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
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  scrollView: { flex: 1 },
  errorText: { textAlign: 'center', color: '#ef4444', marginTop: 20 },

  // 헤더
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  backButton: { marginRight: 10, minWidth: 28 },
  backButtonText: { fontSize: 22, color: '#3b82f6' },
  title: { flex: 1, fontSize: 17, fontWeight: 'bold', color: '#1e293b' },
  saveButton: {
    backgroundColor: '#3b82f6', paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 8, minWidth: 52, alignItems: 'center',
  },
  saveButtonDisabled: { backgroundColor: '#9ca3af' },
  saveButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // 콘텐츠 래퍼
  content: { padding: 12, paddingBottom: 0, gap: 10 },

  // 섹션 카드
  section: {
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#e5e7eb', overflow: 'hidden',
  },
  sectionHeader: {
    paddingHorizontal: 14, paddingVertical: 9,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
    borderLeftWidth: 3, borderLeftColor: '#3b82f6',
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151' },

  // 폼 공통 — 카드 내부 가로 패딩 14, 상단 12, 하단은 다음 formGroup 상단이 담당
  formGroup: { paddingHorizontal: 14, paddingTop: 12 },
  // 마지막 formGroup 은 하단 여백 추가
  formGroupLast: { paddingBottom: 14 },
  dividerTop: { borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 4 },

  // 2열 행 — 내부 col들이 formGroup 역할 겸함
  row2: { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 12, gap: 10 },
  // row2 의 마지막 행
  row2Last: { flexDirection: 'row', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 10 },
  col: { flex: 1 },
  label: { fontSize: 12, fontWeight: '500', color: '#374151', marginBottom: 5 },
  optional: { fontSize: 11, fontWeight: '400', color: '#9ca3af' },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 7,
    paddingHorizontal: 10, paddingVertical: 9,
    fontSize: 13, color: '#1f2937', backgroundColor: '#fff',
  },
  inputError: { borderColor: '#ef4444' },
  errorMsg: { fontSize: 11, color: '#ef4444', marginTop: 3 },
  hint: { fontSize: 11, color: '#9ca3af', marginTop: 4, paddingHorizontal: 14, paddingBottom: 10 },
  subSectionTitle: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 8 },

  // 이미지
  imageRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  imageWrapper: { position: 'relative' },
  profileImage: { width: 52, height: 52, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  profileImagePlaceholder: {
    width: 52, height: 52, borderRadius: 10,
    backgroundColor: '#3b82f6', justifyContent: 'center', alignItems: 'center',
  },
  profileImagePlaceholderText: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  uploadOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  uploadProgressText: { color: '#fff', fontSize: 10, marginTop: 2 },
  changeImageBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: '#eff6ff', borderRadius: 8,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  changeImageBtnText: { color: '#2563eb', fontSize: 12, fontWeight: '500' },

  // 성별
  genderRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  genderBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 7,
    borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center',
  },
  genderBtnActive: { borderColor: '#3b82f6', backgroundColor: '#eff6ff' },
  genderBtnText: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  genderBtnTextActive: { color: '#2563eb', fontWeight: '600' },

  // 주민번호
  rrnHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  rrnBadge: { backgroundColor: '#fef2f2', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  rrnBadgeText: { fontSize: 10, color: '#dc2626' },
  rrnInput: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 7,
    paddingHorizontal: 10, paddingVertical: 9,
    fontSize: 14, color: '#1f2937', letterSpacing: 2, backgroundColor: '#fff',
  },
  rrnLastHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  rrnToggle: { fontSize: 11, color: '#6b7280' },

  // 가입경로
  referralGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 4 },
  referralChip: {
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 14, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#f9fafb',
  },
  referralChipActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  referralChipText: { fontSize: 12, color: '#374151' },
  referralChipTextActive: { color: '#fff', fontWeight: '600' },

  // 학년
  gradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 2 },
  gradeBtn: {
    paddingHorizontal: 9, paddingVertical: 6,
    borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db', backgroundColor: '#fff',
  },
  gradeBtnActive: { borderColor: '#7c3aed', backgroundColor: '#f5f3ff' },
  gradeBtnText: { fontSize: 11, color: '#6b7280' },
  gradeBtnTextActive: { color: '#6d28d9', fontWeight: '600' },

  // 휴학
  checkRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  checkbox: {
    width: 18, height: 18, borderRadius: 4,
    borderWidth: 2, borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  checkboxChecked: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  checkLabel: { fontSize: 13, color: '#374151' },

  // 주소
  addressRow: { flexDirection: 'row', gap: 8 },
  addressInput: {
    flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 7,
    paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: '#6b7280', backgroundColor: '#f9fafb',
  },
  searchBtn: {
    backgroundColor: '#3b82f6', paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 7, justifyContent: 'center',
  },
  searchBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // 경력
  addBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#fff7ed', borderRadius: 6 },
  addBtnText: { color: '#ea580c', fontSize: 12, fontWeight: '500' },
  emptyBox: {
    marginHorizontal: 14, marginTop: 10, marginBottom: 14,
    borderWidth: 1, borderColor: '#fed7aa', borderStyle: 'dashed',
    borderRadius: 8, padding: 18, alignItems: 'center',
  },
  emptyText: { color: '#9ca3af', fontSize: 12 },
  jobItem: {
    marginHorizontal: 14, marginTop: 10,
    backgroundColor: '#fff7ed', borderRadius: 8,
    borderWidth: 1, borderColor: '#fed7aa', padding: 12,
  },
  jobItemLast: { marginBottom: 16 },
  removeJobBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', zIndex: 1,
  },
  removeJobBtnText: { color: '#fff', fontSize: 14, fontWeight: 'bold', lineHeight: 16 },
  labelSm: { fontSize: 11, fontWeight: '500', color: '#6b7280', marginBottom: 4 },
  inputSm: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 7, fontSize: 12, color: '#1f2937', backgroundColor: '#fff',
  },
  // jobItem 내부 2열 행 (paddingHorizontal 없음, jobItem padding으로 대체)
  jobRow: { flexDirection: 'row', gap: 8 },

  // 자기소개/지원동기
  textareaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  charCount: { fontSize: 11, color: '#9ca3af' },
  textarea: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 7,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: '#1f2937',
    minHeight: 110, backgroundColor: '#fff',
    textAlignVertical: 'top',
  },

  // 전화번호
  phoneRow: { flexDirection: 'row', gap: 6 },
  countryCodeBtn: {
    paddingHorizontal: 9, paddingVertical: 9,
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 7, backgroundColor: '#f9fafb', justifyContent: 'center',
  },
  countryCodeText: { fontSize: 12, color: '#374151' },
  phoneInput: {
    flex: 1, borderWidth: 1, borderColor: '#d1d5db', borderRadius: 7,
    paddingHorizontal: 10, paddingVertical: 9, fontSize: 13, color: '#1f2937', backgroundColor: '#fff',
  },

  // 국가코드 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  modalTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  modalClose: { fontSize: 22, color: '#6b7280' },
  countryItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  countryItemActive: { backgroundColor: '#eff6ff' },
  countryFlag: { fontSize: 22, marginRight: 10 },
  countryName: { flex: 1, fontSize: 14, color: '#111827' },
  countryCode: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
});
