import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import { MainTabScreenProps } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { signOut, getUserByPhone } from '../services/authService';
import { jobCodesService, JobCode } from '../services';
import { SignInScreen } from './SignInScreen';
import { RoleSelectionScreen } from './RoleSelectionScreen';
import { SignUpStep1Screen } from './SignUpStep1Screen';
import { SignUpStep2Screen } from './SignUpStep2Screen';
import { SignUpStep3Screen } from './SignUpStep3Screen';
import { ForeignSignUpStep1Screen } from './ForeignSignUpStep1Screen';
import { ForeignSignUpStep2Screen } from './ForeignSignUpStep2Screen';
import { ProfileEditScreen } from './ProfileEditScreen';
import { signUp } from '../services/authService';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import {
  uploadForeignProfileImage,
  uploadCV,
  uploadPassportPhoto,
  uploadForeignIdCard,
} from '../services/foreignSignUpService';
import { formatPhoneNumber } from '../utils/phoneUtils';

type Screen = 
  | 'profile' 
  | 'signin' 
  | 'role-selection'
  | 'mentor-signup-step1' 
  | 'mentor-signup-step2' 
  | 'mentor-signup-step3'
  | 'foreign-signup-step1'
  | 'foreign-signup-step2'
  | 'profile-edit';

export function ProfileScreen({ navigation }: MainTabScreenProps<'Profile'>) {
  const { currentUser, userData, loading, updateActiveJobCode } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('signin');
  const [selectedRole, setSelectedRole] = useState<'mentor' | 'foreign' | null>(null);
  const [signUpData, setSignUpData] = useState<{
    name?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    countryCode?: string;
    email?: string;
    password?: string;
    university?: string;
    grade?: number;
    isOnLeave?: boolean | null;
    major1?: string;
    major2?: string;
    profileImage?: string;
    cvFile?: any;
    passportPhoto?: string;
    foreignIdCard?: string;
  }>({});
  const [jobCodes, setJobCodes] = useState<JobCode[]>([]);
  const [loadingJobCodes, setLoadingJobCodes] = useState(false);
  const [changingJobCode, setChangingJobCode] = useState(false);
  const [jobCodesExpanded, setJobCodesExpanded] = useState(true);

  useEffect(() => {
    if (userData) {
      loadJobCodes();
    }
  }, [userData]);

  const loadJobCodes = async () => {
    if (!userData) {
      return;
    }

    try {
      setLoadingJobCodes(true);
      let codes: JobCode[] = [];
      
      // 관리자는 모든 캠프 코드 조회
      if (userData.role === 'admin') {
        codes = await jobCodesService.getAllJobCodes();
      } 
      // 일반 사용자는 자신의 캠프 코드만 조회
      else if (userData.jobExperiences && userData.jobExperiences.length > 0) {
        codes = await jobCodesService.getJobCodesByIds(userData.jobExperiences);
      }
      
      // 기수별 내림차순 정렬 (27기, 26기, ... 순서)
      const sortedCodes = codes.sort((a, b) => {
        const aGen = parseInt(a.generation.replace(/\D/g, '')) || 0;
        const bGen = parseInt(b.generation.replace(/\D/g, '')) || 0;
        return bGen - aGen;
      });
      
      setJobCodes(sortedCodes);
    } catch (error) {
      console.error('기수 정보 로드 실패:', error);
    } finally {
      setLoadingJobCodes(false);
    }
  };

  const handleJobCodeSelect = async (jobCodeId: string) => {
    if (userData?.activeJobExperienceId === jobCodeId) {
      return;
    }

    try {
      setChangingJobCode(true);
      console.log('🔄 ProfileScreen: 기수 변경 요청');
      console.log('  - 현재 activeJobExperienceId:', userData?.activeJobExperienceId);
      console.log('  - 새로운 jobCodeId:', jobCodeId);
      
      await updateActiveJobCode(jobCodeId);
      
      console.log('✅ ProfileScreen: 기수 변경 완료');
      Alert.alert('성공', '기수가 변경되었습니다.\n캠프 탭에서 해당 기수의 자료를 확인하세요.');
    } catch (error) {
      console.error('❌ ProfileScreen: 기수 변경 실패:', error);
      Alert.alert('오류', '기수 변경에 실패했습니다.');
    } finally {
      setChangingJobCode(false);
    }
  };

  const handleRoleSelect = (role: 'mentor' | 'foreign') => {
    setSelectedRole(role);
    if (role === 'mentor') {
      setCurrentScreen('mentor-signup-step1');
    } else {
      setCurrentScreen('foreign-signup-step1');
    }
  };

  const handleMentorSignUpStep1Next = (data: { name: string; phone: string }) => {
    setSignUpData({ ...signUpData, ...data });
    setCurrentScreen('mentor-signup-step2');
  };

  const handleMentorSignUpStep2Next = (data: { email: string; password: string }) => {
    setSignUpData({ ...signUpData, ...data });
    setCurrentScreen('mentor-signup-step3');
  };

  const handleMentorSignUpStep3Next = (data: {
    university: string;
    grade: number;
    isOnLeave: boolean | null;
    major1: string;
    major2?: string;
  }) => {
    setSignUpData({ ...signUpData, ...data });
    Alert.alert(
      '회원가입 진행',
      '회원가입 4단계는 웹에서 진행해주세요.\n현재는 로그인 기능만 모바일에서 지원됩니다.',
      [
        {
          text: '확인',
          onPress: () => setCurrentScreen('signin'),
        },
      ]
    );
  };

  const handleForeignSignUpStep1Next = (data: {
    firstName: string;
    lastName: string;
    middleName?: string;
    countryCode: string;
    phone: string;
  }) => {
    setSignUpData({ ...signUpData, ...data });
    setCurrentScreen('foreign-signup-step2');
  };

  const handleForeignSignUpStep2Next = async (data: {
    email: string;
    password: string;
    profileImage?: string;
    cvFile?: any;
    passportPhoto?: string;
    foreignIdCard?: string;
  }) => {
    setSignUpData({ ...signUpData, ...data });
    
    // 입력 데이터 검증
    if (!signUpData.firstName || !signUpData.lastName || !signUpData.phone || !data.email || !data.password) {
      Alert.alert('오류', '필수 정보가 누락되었습니다.');
      return;
    }

    // 필수 파일 검증
    if (!data.profileImage) {
      Alert.alert('오류', '프로필 사진을 업로드해주세요.');
      return;
    }
    if (!data.cvFile) {
      Alert.alert('오류', 'CV (PDF)를 업로드해주세요.');
      return;
    }
    if (!data.passportPhoto) {
      Alert.alert('오류', '여권 사진을 업로드해주세요.');
      return;
    }

    // 로딩 시작
    Alert.alert(
      'Sign Up in Progress',
      'Uploading files and creating your account.\nPlease wait...',
      [],
      { cancelable: false }
    );

    try {
      const fullPhone = `${signUpData.countryCode}${signUpData.phone}`;
      const fullName = signUpData.middleName 
        ? `${signUpData.firstName} ${signUpData.middleName} ${signUpData.lastName}`
        : `${signUpData.firstName} ${signUpData.lastName}`;

      // 전화번호로 기존 사용자 확인
      const existingUserByPhone = await getUserByPhone(fullPhone);
      
      let userId: string;
      let isUpdatingExistingUser = false;

      // Case 1: 전화번호로 임시 원어민(foreign_temp) 계정이 존재하는 경우
      if (existingUserByPhone && existingUserByPhone.role === 'foreign_temp' && existingUserByPhone.status === 'temp') {
        console.log('📋 기존 foreign_temp 사용자 발견, 계정 업데이트 진행...');
        
        // 기존 계정의 userId 사용
        userId = existingUserByPhone.userId;
        isUpdatingExistingUser = true;
        
        // Firebase Authentication 계정이 이미 있을 수 있으므로 체크
        console.log('🔐 Firebase Authentication 계정 생성/확인 시작:', data.email);
        try {
          const userCredential = await signUp(data.email, data.password);
          console.log('✅ Firebase Authentication 계정 생성 완료');
        } catch (authError: any) {
          if (authError.code === 'auth/email-already-in-use') {
            console.log('⚠️ Firebase Auth 이미 존재, Firestore만 업데이트');
          } else {
            throw authError;
          }
        }
      }
      // Case 2: 완전히 새로운 사용자
      else {
        console.log('🔐 Firebase Authentication 계정 생성 시작:', data.email);
        const userCredential = await signUp(data.email, data.password);
        userId = userCredential.user.uid;
        console.log('✅ Firebase Authentication 계정 생성 완료, UID:', userId);
      }

      // 2. 파일 업로드
      console.log('📤 파일 업로드 시작...');
      let profileImageUrl = '';
      let cvUrl = '';
      let passportPhotoUrl = '';
      let foreignIdCardUrl = '';

      try {
        // 프로필 이미지 업로드
        console.log('  - 프로필 이미지 업로드 중...');
        profileImageUrl = await uploadForeignProfileImage(userId, data.profileImage);
        console.log('  ✅ 프로필 이미지 업로드 완료');

        // CV 업로드
        console.log('  - CV 업로드 중...');
        cvUrl = await uploadCV(userId, data.cvFile.uri, data.cvFile.name);
        console.log('  ✅ CV 업로드 완료');

        // 여권 사진 업로드
        console.log('  - 여권 사진 업로드 중...');
        passportPhotoUrl = await uploadPassportPhoto(userId, data.passportPhoto);
        console.log('  ✅ 여권 사진 업로드 완료');

        // 외국인 등록증 업로드 (선택사항)
        if (data.foreignIdCard) {
          console.log('  - 외국인 등록증 업로드 중...');
          foreignIdCardUrl = await uploadForeignIdCard(userId, data.foreignIdCard);
          console.log('  ✅ 외국인 등록증 업로드 완료');
        }

        console.log('✅ 모든 파일 업로드 완료');
      } catch (uploadError) {
        console.error('❌ 파일 업로드 실패:', uploadError);
        throw new Error('파일 업로드에 실패했습니다. 관리자에게 문의해주세요.');
      }

      // 3. Firestore에 사용자 문서 생성 또는 업데이트
      const userData = {
        userId: userId,
        name: fullName,
        email: data.email,
        phone: fullPhone,
        phoneNumber: fullPhone,
        password: '', // 보안상 저장하지 않음
        address: existingUserByPhone?.address || '',
        addressDetail: existingUserByPhone?.addressDetail || '',
        role: 'foreign', // 원어민은 바로 활성화
        jobExperiences: existingUserByPhone?.jobExperiences || [],
        partTimeJobs: existingUserByPhone?.partTimeJobs || [],
        createdAt: existingUserByPhone?.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now(),
        agreedTerms: true,
        agreedPersonal: true,
        profileImage: profileImageUrl,
        status: 'active' as const, // 원어민은 바로 활성 상태
        isEmailVerified: false,
        isPhoneVerified: false,
        isProfileCompleted: true, // 모든 정보 입력 완료
        isTermsAgreed: true,
        isPersonalAgreed: true,
        isAddressVerified: false,
        isProfileImageUploaded: true,
        jobMotivation: 'Foreign Teacher Application',
        feedback: existingUserByPhone?.feedback || '',
        // 원어민 특화 정보
        foreignTeacher: {
          firstName: signUpData.firstName,
          lastName: signUpData.lastName,
          middleName: signUpData.middleName || '',
          countryCode: signUpData.countryCode,
          cvUrl: cvUrl,
          passportPhotoUrl: passportPhotoUrl,
          foreignIdCardUrl: foreignIdCardUrl || '',
          applicationDate: Timestamp.now(),
        }
      };

      if (isUpdatingExistingUser) {
        console.log('📝 Firestore 사용자 문서 업데이트 시작');
        await setDoc(doc(db, 'users', userId), userData, { merge: true });
        console.log('✅ Firestore 사용자 문서 업데이트 완료 (foreign_temp → foreign)');
        
        Alert.alert(
          'Account Activated',
          `Welcome, ${fullName}!\n\n✅ Your account has been activated.\n✅ All documents have been uploaded.\n\nYou can now log in to the platform.`,
          [
            {
              text: 'OK',
              onPress: () => {
                setCurrentScreen('signin');
                setSelectedRole(null);
                setSignUpData({});
              },
            },
          ]
        );
      } else {
        console.log('📝 Firestore 사용자 문서 생성 시작');
        await setDoc(doc(db, 'users', userId), userData);
        console.log('✅ Firestore 사용자 문서 생성 완료');
        
        Alert.alert(
          'Sign Up Complete',
          `Welcome, ${fullName}!\n\n✅ Your account has been successfully created.\n✅ All documents have been uploaded.\n\nYou can now log in to the platform.`,
          [
            {
              text: 'OK',
              onPress: () => {
                setCurrentScreen('signin');
                setSelectedRole(null);
                setSignUpData({});
              },
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('❌ 원어민 회원가입 오류:', error);
      
      let errorMessage = error.message || 'An error occurred during sign up.';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already in use.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use at least 8 characters.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email format.';
      }

      Alert.alert('Sign Up Error', errorMessage);
    }
  };

  const handleLogout = async () => {
    Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
      {
        text: '취소',
        style: 'cancel',
      },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            Alert.alert('로그아웃', '로그아웃되었습니다.');
          } catch (error) {
            console.error('로그아웃 오류:', error);
            Alert.alert('오류', '로그아웃 중 오류가 발생했습니다.');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>로딩 중...</Text>
      </View>
    );
  }

  // 로그인된 상태
  if (currentUser && userData) {
    // 프로필 수정 화면
    if (currentScreen === 'profile-edit') {
      return <ProfileEditScreen onBack={() => setCurrentScreen('profile')} />;
    }

    const isForeign = userData.role === 'foreign' || userData.role === 'foreign_temp';

    return (
      <ScrollView style={styles.container}>
        <View style={styles.content}>
          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={styles.title}>{isForeign ? 'My Profile' : '내 프로필'}</Text>
            <TouchableOpacity
              onPress={() => setCurrentScreen('profile-edit')}
              style={styles.editButton}
            >
              <Text style={styles.editButtonText}>{isForeign ? 'Edit' : '수정'}</Text>
            </TouchableOpacity>
          </View>

          {/* 프로필 카드 */}
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              {userData.profileImage ? (
                <Image
                  source={{ uri: userData.profileImage }}
                  style={styles.avatarImage}
                />
              ) : (
                <View style={styles.avatarContainer}>
                  <Text style={styles.avatarText}>
                    {userData.name.charAt(0)}
                  </Text>
                </View>
              )}
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{userData.name}</Text>
                <Text style={styles.profileEmail}>{userData.email}</Text>
                {userData.phone && (
                  <Text style={styles.profilePhone}>{formatPhoneNumber(userData.phone)}</Text>
                )}
              </View>
            </View>
          </View>

          {/* 원어민 교사 정보 및 제출 서류 */}
          {isForeign && userData.foreignTeacher && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Teacher Information & Submitted Documents</Text>
              </View>
              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>First Name</Text>
                  <Text style={styles.infoValue}>{userData.foreignTeacher.firstName}</Text>
                </View>
                {userData.foreignTeacher.middleName && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Middle Name</Text>
                    <Text style={styles.infoValue}>{userData.foreignTeacher.middleName}</Text>
                  </View>
                )}
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Last Name</Text>
                  <Text style={styles.infoValue}>{userData.foreignTeacher.lastName}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Country Code</Text>
                  <Text style={styles.infoValue}>{userData.foreignTeacher.countryCode}</Text>
                </View>
                {userData.foreignTeacher.applicationDate && (
                  <View style={[styles.infoItem, { flex: 1, width: '100%' }]}>
                    <Text style={styles.infoLabel}>Application Date</Text>
                    <Text style={styles.infoValue}>
                      {userData.foreignTeacher.applicationDate.toDate
                        ? userData.foreignTeacher.applicationDate.toDate().toLocaleDateString('en-US')
                        : new Date((userData.foreignTeacher.applicationDate as any).seconds * 1000).toLocaleDateString('en-US')}
                    </Text>
                  </View>
                )}
              </View>
              
              <View style={styles.divider} />
              <Text style={styles.subsectionTitle}>Submitted Documents</Text>
              
              {userData.foreignTeacher.cvUrl && (
                <TouchableOpacity
                  style={[styles.fileLink, { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' }]}
                  onPress={() => userData.foreignTeacher?.cvUrl && Linking.openURL(userData.foreignTeacher.cvUrl)}
                >
                  <View style={styles.fileLinkContent}>
                    <Text style={[styles.fileLinkTitle, { color: '#3730A3' }]}>CV (Curriculum Vitae)</Text>
                    <Text style={[styles.fileLinkSubtitle, { color: '#4F46E5' }]}>Click to view</Text>
                  </View>
                  <Text style={{ color: '#4F46E5', fontSize: 18 }}>→</Text>
                </TouchableOpacity>
              )}
              
              {userData.foreignTeacher.passportPhotoUrl && (
                <TouchableOpacity
                  style={[styles.fileLink, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
                  onPress={() => userData.foreignTeacher?.passportPhotoUrl && Linking.openURL(userData.foreignTeacher.passportPhotoUrl)}
                >
                  <View style={styles.fileLinkContent}>
                    <Text style={[styles.fileLinkTitle, { color: '#14532D' }]}>Passport Photo</Text>
                    <Text style={[styles.fileLinkSubtitle, { color: '#16A34A' }]}>Click to view</Text>
                  </View>
                  <Text style={{ color: '#16A34A', fontSize: 18 }}>→</Text>
                </TouchableOpacity>
              )}
              
              {userData.foreignTeacher.foreignIdCardUrl && (
                <TouchableOpacity
                  style={[styles.fileLink, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}
                  onPress={() => userData.foreignTeacher?.foreignIdCardUrl && Linking.openURL(userData.foreignTeacher.foreignIdCardUrl)}
                >
                  <View style={styles.fileLinkContent}>
                    <Text style={[styles.fileLinkTitle, { color: '#78350F' }]}>Foreign Resident ID Card</Text>
                    <Text style={[styles.fileLinkSubtitle, { color: '#D97706' }]}>Click to view</Text>
                  </View>
                  <Text style={{ color: '#D97706', fontSize: 18 }}>→</Text>
                </TouchableOpacity>
              )}
              
              {!userData.foreignTeacher.cvUrl && !userData.foreignTeacher.passportPhotoUrl && !userData.foreignTeacher.foreignIdCardUrl && (
                <Text style={styles.emptyText}>No documents submitted.</Text>
              )}
            </View>
          )}

          {/* SMIS 캠프 참여 이력 - 기수 선택 - 원어민은 숨기기 */}
          {!isForeign && (
          <View style={styles.sectionCard}>
            <TouchableOpacity 
              style={styles.sectionHeader}
              onPress={() => setJobCodesExpanded(!jobCodesExpanded)}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderContent}>
                <Text style={styles.sectionTitle}>
                  {userData.role === 'admin' ? '전체 캠프 코드' : 'SMIS 캠프 참여 이력'}
                </Text>
                {jobCodes.length > 0 && (
                  <Text style={styles.expandIcon}>
                    {jobCodesExpanded ? '▼' : '▶'}
                  </Text>
                )}
              </View>
              {!jobCodesExpanded && jobCodes.length > 0 && (
                <View style={styles.collapsedCodesContainer}>
                  {jobCodes.slice(0, 10).map((jobCode) => (
                    <View key={jobCode.id} style={styles.collapsedCodeBadge}>
                      <Text style={styles.collapsedCodeText}>{jobCode.code}</Text>
                    </View>
                  ))}
                  {jobCodes.length > 10 && (
                    <Text style={styles.moreCodesText}>+{jobCodes.length - 10}</Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
            
            {jobCodesExpanded && (
              <>
                {loadingJobCodes ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#3b82f6" />
                  </View>
                ) : jobCodes.length === 0 ? (
                  <Text style={styles.emptyText}>등록된 참여 이력이 없습니다.</Text>
                ) : (
                  <View style={styles.jobCodesContainer}>
                    {jobCodes.map((jobCode) => {
                      const exp = userData.jobExperiences?.find(e => e.id === jobCode.id);
                      const isActive = userData.activeJobExperienceId === jobCode.id;
                      
                      return (
                        <TouchableOpacity
                          key={jobCode.id}
                          style={[
                            styles.jobCodeItem,
                            isActive && styles.jobCodeItemActive,
                          ]}
                          onPress={() => handleJobCodeSelect(jobCode.id)}
                          disabled={changingJobCode || isActive}
                        >
                          <View style={styles.jobCodeMain}>
                            <Text style={styles.jobCodeText}>
                              {jobCode.generation} {jobCode.name}
                            </Text>
                            <View style={styles.jobCodeBadges}>
                              {isActive && (
                                <View style={styles.activeBadge}>
                                  <Text style={styles.activeBadgeText}>활성</Text>
                                </View>
                              )}
                              {jobCode.code && (
                                <View style={styles.codeBadge}>
                                  <Text style={styles.codeBadgeText}>{jobCode.code}</Text>
                                </View>
                              )}
                              {exp?.groupRole && (
                                <View style={styles.roleBadge}>
                                  <Text style={styles.roleBadgeText}>{exp.groupRole}</Text>
                                </View>
                              )}
                              {exp?.classCode && (
                                <View style={styles.classBadge}>
                                  <Text style={styles.classBadgeText}>{exp.classCode}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </>
            )}
          </View>
          )}

          {/* 개인 정보 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{isForeign ? 'Personal Information' : '개인 정보'}</Text>
            </View>
            <View style={styles.infoGrid}>
              {userData.age && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>{isForeign ? 'Age' : '나이'}</Text>
                  <Text style={styles.infoValue}>{userData.age}{isForeign ? ' years old' : '세'}</Text>
                </View>
              )}
              {userData.gender && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>{isForeign ? 'Gender' : '성별'}</Text>
                  <Text style={styles.infoValue}>
                    {isForeign
                      ? (userData.gender === 'M' ? 'Male' : 'Female')
                      : (userData.gender === 'M' ? '남성' : '여성')}
                  </Text>
                </View>
              )}
              {userData.phoneNumber && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>{isForeign ? 'Phone Number' : '연락처'}</Text>
                  <Text style={styles.infoValue}>{formatPhoneNumber(userData.phoneNumber)}</Text>
                </View>
              )}
              {userData.address && (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>{isForeign ? 'Address' : '주소'}</Text>
                  <Text style={styles.infoValue}>
                    {userData.address}
                    {userData.addressDetail ? ` ${userData.addressDetail}` : ''}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* 학교 정보 - 원어민은 숨기기 */}
          {!isForeign && (userData.school || userData.university) && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>학교 정보</Text>
              </View>
              <View style={styles.infoGrid}>
                {(userData.university || userData.school) && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>학교</Text>
                    <Text style={styles.infoValue}>{userData.university || userData.school}</Text>
                  </View>
                )}
                {userData.grade && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>학년</Text>
                    <Text style={styles.infoValue}>
                      {userData.grade === 6 ? '졸업생' : `${userData.grade}학년`}
                      {userData.isOnLeave ? ' (휴학 중)' : ''}
                    </Text>
                  </View>
                )}
                {(userData.major1 || userData.major) && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>전공</Text>
                    <Text style={styles.infoValue}>
                      {userData.major1 || userData.major}
                      {userData.major2 ? ` / ${userData.major2}` : ''}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* 알바 & 멘토링 경력 - 원어민은 숨기기 */}
          {!isForeign && userData.partTimeJobs && userData.partTimeJobs.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>알바 & 멘토링 경력</Text>
              </View>
              <View style={styles.experienceContainer}>
                {userData.partTimeJobs.map((job, index) => (
                  <View key={index} style={styles.experienceItem}>
                    <View style={styles.experienceHeader}>
                      <Text style={styles.experienceCompany}>{job.companyName}</Text>
                      <Text style={styles.experiencePeriod}>{job.period}</Text>
                    </View>
                    <Text style={styles.experiencePosition}>{job.position}</Text>
                    {job.description && (
                      <Text style={styles.experienceDescription}>{job.description}</Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* 자기소개 & 지원동기 - 원어민은 숨기기 */}
          {!isForeign && (userData.selfIntroduction || userData.jobMotivation) && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>자기소개 & 지원동기</Text>
              </View>
              <View style={styles.infoGrid}>
                {userData.selfIntroduction && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>자기소개</Text>
                    <Text style={styles.infoValueMultiline}>{userData.selfIntroduction}</Text>
                  </View>
                )}
                {userData.jobMotivation && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>지원동기</Text>
                    <Text style={styles.infoValueMultiline}>{userData.jobMotivation}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* 로그아웃 버튼 */}
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <Text style={styles.logoutButtonText}>{isForeign ? 'Logout' : '로그아웃'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  // 로그인되지 않은 상태 - 화면 전환
  switch (currentScreen) {
    case 'role-selection':
      return (
        <RoleSelectionScreen
          onRoleSelect={handleRoleSelect}
          onBack={() => setCurrentScreen('signin')}
        />
      );
    case 'mentor-signup-step1':
      return (
        <SignUpStep1Screen
          onNext={handleMentorSignUpStep1Next}
          onSignInPress={() => setCurrentScreen('signin')}
        />
      );
    case 'mentor-signup-step2':
      return (
        <SignUpStep2Screen
          name={signUpData.name || ''}
          phone={signUpData.phone || ''}
          onNext={handleMentorSignUpStep2Next}
          onBack={() => setCurrentScreen('mentor-signup-step1')}
        />
      );
    case 'mentor-signup-step3':
      return (
        <SignUpStep3Screen
          name={signUpData.name || ''}
          phone={signUpData.phone || ''}
          email={signUpData.email || ''}
          password={signUpData.password || ''}
          onNext={handleMentorSignUpStep3Next}
          onBack={() => setCurrentScreen('mentor-signup-step2')}
        />
      );
    case 'foreign-signup-step1':
      return (
        <ForeignSignUpStep1Screen
          onNext={handleForeignSignUpStep1Next}
          onBack={() => setCurrentScreen('role-selection')}
        />
      );
    case 'foreign-signup-step2':
      return (
        <ForeignSignUpStep2Screen
          firstName={signUpData.firstName || ''}
          lastName={signUpData.lastName || ''}
          middleName={signUpData.middleName}
          countryCode={signUpData.countryCode || '+82'}
          phone={signUpData.phone || ''}
          onNext={handleForeignSignUpStep2Next}
          onBack={() => setCurrentScreen('foreign-signup-step1')}
        />
      );
    case 'signin':
    default:
      return (
        <SignInScreen
          onSignUpPress={() => setCurrentScreen('role-selection')}
          onSignInSuccess={() => setCurrentScreen('profile')}
        />
      );
  }
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
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  
  // 프로필 카드
  profileCard: {
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
    marginBottom: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarImage: {
    width: 64,
    height: 64,
    borderRadius: 8,
    marginRight: 16,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  profilePhone: {
    fontSize: 14,
    color: '#64748b',
  },
  
  // 섹션 카드
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    marginBottom: 16,
    overflow: 'hidden',
  },
  sectionHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  sectionHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  collapsedCodesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  collapsedCodeBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  collapsedCodeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  moreCodesText: {
    fontSize: 11,
    color: '#64748b',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  expandIcon: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  
  // 기수 목록
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: '#64748b',
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  jobCodesContainer: {
    padding: 16,
  },
  jobCodeItem: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
  },
  jobCodeItemActive: {
    borderColor: '#3b82f6',
    borderWidth: 2,
    backgroundColor: '#eff6ff',
  },
  jobCodeMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  jobCodeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e293b',
    flex: 1,
  },
  jobCodeBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  activeBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ffffff',
  },
  codeBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  codeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  roleBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748b',
  },
  classBadge: {
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#93c5fd',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  classBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1e40af',
  },
  
  // 학교 정보
  infoGrid: {
    padding: 20,
  },
  infoItem: {
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    color: '#1e293b',
    fontWeight: '500',
  },
  infoValueMultiline: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
  },
  
  // 경력
  experienceContainer: {
    padding: 20,
  },
  experienceItem: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  experienceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  experienceCompany: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  experiencePeriod: {
    fontSize: 13,
    color: '#64748b',
  },
  experiencePosition: {
    fontSize: 14,
    color: '#3b82f6',
    marginBottom: 6,
  },
  experienceDescription: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  
  // 파일 링크 스타일
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 16,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 12,
  },
  fileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  fileLinkContent: {
    flex: 1,
  },
  fileLinkTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  fileLinkSubtitle: {
    fontSize: 12,
  },
  
  // 로그아웃 버튼
  logoutButton: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
