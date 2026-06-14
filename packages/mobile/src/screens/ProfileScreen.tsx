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
  RefreshControl,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MainTabScreenProps } from '../navigation/types';
import { useAuth } from '../context/AuthContext';
import { signOut, getUserByPhone, signIn } from '../services/authService';
import { jobCodesService, JobCode } from '../services';
import { SignInScreen } from './SignInScreen';
import { RoleSelectionScreen } from './RoleSelectionScreen';
import { SignUpStep1Screen } from './SignUpStep1Screen';
import { SignUpStep2Screen } from './SignUpStep2Screen';
import { SignUpStep3Screen } from './SignUpStep3Screen';
import { SignUpStep4Screen } from './SignUpStep4Screen';
import { SignUpFlow } from './SignUpFlow';
import { ForeignSignUpStep1Screen } from './ForeignSignUpStep1Screen';
import { ForeignSignUpStep2Screen } from './ForeignSignUpStep2Screen';
import { signUp } from '../services/authService';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { useCampDataPrefetch } from '../hooks/useCampDataPrefetch';
import { useRecruitmentDataPrefetch } from '../hooks/useRecruitmentDataPrefetch';
import { useCampTab } from '../context/CampTabContext';
// import { getUserInfoFromRRN } from '../utils/userUtils';
import { logger, deactivateUserMobile } from '@smis-mentor/shared';
import { calculateAgeFromDateOfBirth } from '@smis-mentor/shared';
import { reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { uploadCV, uploadPassportPhoto, uploadForeignIdCard, uploadBankBook, uploadEslCert } from '../services/foreignSignUpService';
import { updateUserProfile } from '../services/profileService';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { storage } from '../config/firebase';

type Screen = 
  | 'profile' 
  | 'signin' 
  | 'role-selection'
  | 'mentor-signup-step1' 
  | 'mentor-signup-step2' 
  | 'mentor-signup-step3'
  | 'mentor-signup-step4'
  | 'foreign-signup-step1'
  | 'foreign-signup-step2'
  | 'social-signup';

export function ProfileScreen({ navigation }: MainTabScreenProps<'Profile'>) {
  const { isAuthenticated, userData, loading, updateActiveJobCode, refreshUserData, isSharingLocation } = useAuth();
  const { prefetchCampData, invalidateCampData } = useCampDataPrefetch();
  const { prefetchRecruitmentData, invalidateRecruitmentData } = useRecruitmentDataPrefetch();
  const { 
    webViewPreloadComplete, 
    setWebViewPreloadComplete, 
    webViewLoadProgress,
    preloadLinks,
  } = useCampTab();
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
    socialData?: any;
    tempUserId?: string;
    dateOfBirth?: string;
  }>({});
  const [jobCodes, setJobCodes] = useState<JobCode[]>([]);
  const [loadingJobCodes, setLoadingJobCodes] = useState(false);
  const [changingJobCode, setChangingJobCode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showOlderGenerations, setShowOlderGenerations] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [prefetchingCamp, setPrefetchingCamp] = useState(false);
  const [prefetchProgress, setPrefetchProgress] = useState(0);
  const [prefetchStage, setPrefetchStage] = useState<'cache' | 'update' | 'data' | 'recruitment' | 'webview' | 'complete'>('cache');
  const [prefetchCancelled, setPrefetchCancelled] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // 문서 업로드/삭제 상태
  const [uploadingDoc, setUploadingDoc] = useState<'cv' | 'passport' | 'idCard' | 'bankBook' | 'eslCert' | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<'cv' | 'passport' | 'idCard' | 'bankBook' | 'eslCert' | null>(null);

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

  // 전화번호 포맷팅
  const formatPhoneNumber = (phoneNumber?: string): string => {
    if (!phoneNumber) return '-';
    
    // 공백 제거
    const cleaned = phoneNumber.replace(/\s/g, '');
    
    // 한국 번호 (+82 또는 010으로 시작)
    if (cleaned.startsWith('+82')) {
      const number = cleaned.substring(3);
      
      // 010-1234-5678 형식
      if (number.startsWith('10') && number.length === 10) {
        return `+82 0${number.substring(0, 2)}-${number.substring(2, 6)}-${number.substring(6)}`;
      }
    }
    
    // 국가코드가 없는 경우 (한국 번호로 가정)
    const onlyNumbers = cleaned.replace(/\D/g, '');
    if (onlyNumbers.length === 11) {
      return `${onlyNumbers.substring(0, 3)}-${onlyNumbers.substring(3, 7)}-${onlyNumbers.substring(7)}`;
    } else if (onlyNumbers.length === 10) {
      return `${onlyNumbers.substring(0, 3)}-${onlyNumbers.substring(3, 6)}-${onlyNumbers.substring(6)}`;
    }
    
    return phoneNumber;
  };

  const handleJobCodeSelect = async (jobCodeId: string) => {
    if (userData?.activeJobExperienceId === jobCodeId) {
      return;
    }

    // 위치 공유 중이면 캠프 전환 차단
    if (isSharingLocation) {
      Alert.alert(
        '위치 공유 중',
        '위치 공유를 먼저 꺼주세요.\n위치 공유를 끈 후 활성 캠프를 변경할 수 있습니다.',
        [{ text: '확인', style: 'default' }]
      );
      return;
    }

    const startTime = Date.now();
    const isAdmin = userData?.role === 'admin';

    try {
      setChangingJobCode(true);
      setPrefetchingCamp(true);
      setPrefetchProgress(0);
      setPrefetchStage('cache');
      setWebViewPreloadComplete(false);
      setPrefetchCancelled(false);
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔄 ProfileScreen: 캠프 변경 시작');
      console.log(`   현재: ${userData?.activeJobExperienceId}`);
      console.log(`   변경: ${jobCodeId}`);
      console.log(`   관리자 모드: ${isAdmin ? '예 (임시 활성화)' : '아니오'}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // 1. 기존 캐시 무효화 (0% -> 15%)
      console.log('📍 Step 1/5: 기존 캐시 정리 중...');
      const step1Start = Date.now();
      setPrefetchStage('cache');
      await invalidateCampData();
      await invalidateRecruitmentData();
      if (prefetchCancelled) return;
      console.log(`   ✅ 완료 (${((Date.now() - step1Start) / 1000).toFixed(2)}초)`);
      setPrefetchProgress(15);
      
      // 2. 사용자 데이터 업데이트 (15% -> 30%)
      console.log('📍 Step 2/5: 캠프 변경 중...');
      const step2Start = Date.now();
      setPrefetchStage('update');
      
      if (isAdmin) {
        // 관리자는 임시 캠프 활성화 (직무 경험에 추가하지 않음)
        const { adminSetTemporaryCamp } = await import('@smis-mentor/shared');
        const { db } = await import('../config/firebase');
        
        await adminSetTemporaryCamp(db, userData.userId, jobCodeId);
        // 프론트엔드 상태도 즉시 업데이트
        await refreshUserData();
      } else {
        // 일반 사용자는 기존 로직 (직무 경험에 추가)
        await updateActiveJobCode(jobCodeId);
      }
      
      if (prefetchCancelled) return;
      console.log(`   ✅ 완료 (${((Date.now() - step2Start) / 1000).toFixed(2)}초)`);
      setPrefetchProgress(30);
      
      // 3. 새 캠프 데이터 프리페칭 시작 (30% -> 50%)
      console.log('📍 Step 3/5: 캠프 데이터 로딩 중...');
      const step3Start = Date.now();
      setPrefetchStage('data');
      
      // 프리페칭 진행률 시뮬레이션
      const progressInterval = setInterval(() => {
        setPrefetchProgress((prev) => {
          if (prev >= 45) {
            clearInterval(progressInterval);
            return 45;
          }
          return prev + 3;
        });
      }, 200);
      
      await prefetchCampData(jobCodeId);
      
      clearInterval(progressInterval);
      if (prefetchCancelled) return;
      console.log(`   ✅ 완료 (${((Date.now() - step3Start) / 1000).toFixed(2)}초)`);
      setPrefetchProgress(50);
      
      // 4. 채용 데이터 프리페칭 (50% -> 60%)
      console.log('📍 Step 4/5: 채용 데이터 로딩 중...');
      const step4Start = Date.now();
      
      await prefetchRecruitmentData();
      
      if (prefetchCancelled) return;
      console.log(`   ✅ 완료 (${((Date.now() - step4Start) / 1000).toFixed(2)}초)`);
      setPrefetchProgress(60);
      
      // Context 업데이트 완료 대기 (100ms - React 상태 전파 시간)
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 5. WebView 프리로딩 대기 (60% -> 100%)
      // 링크가 없으면 Step 5 스킵
      logger.info(`🔍 preloadLinks.length 체크: ${preloadLinks.length}개`);
      
      if (preloadLinks.length === 0) {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('⏭️  WebView 프리로드 스킵 (링크 없음)');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        setPrefetchProgress(100);
        setPrefetchStage('complete');
      } else {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📍 Step 5/5: WebView 프리로딩 대기 중...');
        console.log(`   🔗 대기할 링크 수: ${preloadLinks.length}개`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        const step5Start = Date.now();
        setPrefetchStage('webview');
        
        // WebView 프리로드 완료까지 대기
        await waitForWebViewPreload();
        
        if (prefetchCancelled) return;
        
        console.log(`   ✅ 완료 (${((Date.now() - step5Start) / 1000).toFixed(2)}초)`);
        setPrefetchProgress(100);
        setPrefetchStage('complete');
      }
      
      const totalDuration = Date.now() - startTime;
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ ProfileScreen: 모든 프리로딩 완료!');
      console.log(`⏱️  총 소요 시간: ${(totalDuration / 1000).toFixed(2)}초`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // 짧은 딜레이 후 완료 메시지
      setTimeout(() => {
        setPrefetchingCamp(false);
        Alert.alert(
          '완료', 
          '캠프가 변경되었습니다.\n\n✅ 모든 데이터 로딩 완료\n✅ 채용 데이터 프리로드 완료\n✅ 구글시트 페이지 프리로드 완료\n\n모든 페이지가 즉시 표시됩니다!'
        );
      }, 500);
      
    } catch (error) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ ProfileScreen: 캠프 변경 실패');
      console.error('💥 에러:', error);
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      Alert.alert('오류', '기수 변경에 실패했습니다.');
      setPrefetchingCamp(false);
    } finally {
      setChangingJobCode(false);
    }
  };

  /**
   * 프리페칭 중단
   */
  const handleCancelPrefetch = () => {
    Alert.alert(
      '프리로딩 중단',
      '캠프 데이터 프리로딩을 중단하시겠습니까?\n\n기본 데이터는 로드되지만 일부 페이지는 처음 접속 시 로딩이 필요할 수 있습니다.',
      [
        { text: '계속하기', style: 'cancel' },
        {
          text: '중단',
          style: 'destructive',
          onPress: () => {
            console.log('🛑 프리로딩 중단됨');
            setPrefetchCancelled(true);
            setPrefetchingCamp(false);
            setChangingJobCode(false);
            // 프리로더 중지
            invalidateCampData();
            invalidateRecruitmentData();
          },
        },
      ]
    );
  };

  /**
   * WebView 프리로드 완료 대기
   */
  const waitForWebViewPreload = async () => {
    return new Promise<void>((resolve) => {
      logger.info(`⏳ waitForWebViewPreload 시작`);
      logger.info(`   - webViewPreloadComplete: ${webViewPreloadComplete}`);
      logger.info(`   - webViewLoadProgress: ${webViewLoadProgress.loaded}/${webViewLoadProgress.total}`);
      
      // 링크가 없으면 즉시 완료
      if (webViewLoadProgress.total === 0 || webViewPreloadComplete) {
        logger.info('✅ WebView 프리로드 필요 없음 (링크 없음 또는 이미 완료)');
        resolve();
        return;
      }

      const maxWaitTime = 60000; // 최대 60초 대기 (모든 링크 로드)
      const startTime = Date.now();
      let lastLogTime = startTime;
      
      const checkInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        
        // 중단 확인
        if (prefetchCancelled) {
          clearInterval(checkInterval);
          console.log('🛑 WebView 프리로드 중단됨');
          resolve();
          return;
        }
        
        // WebView 프리로드 진행률 계산
        if (webViewLoadProgress.total > 0) {
          const progress = (webViewLoadProgress.loaded / webViewLoadProgress.total) * 100;
          const webviewProgress = 60 + (progress * 0.4); // 60% -> 100%
          setPrefetchProgress(Math.round(webviewProgress));
          
          // 3초마다 로그 출력 (스팸 방지)
          if (Date.now() - lastLogTime > 3000) {
            console.log(`📊 WebView 진행: ${webViewLoadProgress.loaded}/${webViewLoadProgress.total} (${Math.round(progress)}%) - 경과: ${(elapsed / 1000).toFixed(1)}초`);
            lastLogTime = Date.now();
          }
        }
        
        // 완료 확인
        if (webViewPreloadComplete) {
          clearInterval(checkInterval);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(`✅ WebView 프리로드 완료! (${(elapsed / 1000).toFixed(2)}초 소요)`);
          console.log(`📊 최종 진행: ${webViewLoadProgress.loaded}/${webViewLoadProgress.total}`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          resolve();
        }
        
        // 타임아웃
        if (elapsed > maxWaitTime) {
          clearInterval(checkInterval);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(`⚠️ WebView 프리로드 타임아웃 (${maxWaitTime / 1000}초 초과)`);
          console.log(`📊 최종 진행: ${webViewLoadProgress.loaded}/${webViewLoadProgress.total}`);
          console.log('💡 일부 링크는 로드되지 않았을 수 있습니다.');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          resolve();
        }
      }, 500); // 0.5초마다 체크
    });
  };

  const handleRoleSelect = (role: 'mentor' | 'foreign') => {
    setSelectedRole(role);
    if (signUpData.socialData) {
      // 소셜 회원가입 컨텍스트이면 역할 선택 후 바로 소셜 가입 플로우로 이동
      setCurrentScreen('social-signup');
    } else if (role === 'mentor') {
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
    setCurrentScreen('mentor-signup-step4');
  };

  const handleMentorSignUpStep4Next = async (data: {
    address: string;
    addressDetail: string;
    rrnFront: string;
    rrnLast: string;
    gender: 'M' | 'F';
    referralPath: string;
    referrerName?: string;
    otherReferralDetail?: string;
    agreedPersonal: boolean;
    geocode?: { lat: number; lng: number; updatedAt: Timestamp };
  }) => {
    try {
      setIsLoading(true);
      
      const completeSignUpData = { ...signUpData, ...data };
      
      // Firebase Auth 계정 생성
      const { signUp } = await import('../services/authService');
      const userCredential = await signUp(completeSignUpData.email!, completeSignUpData.password!);
      const firebaseUser = userCredential.user;
      
      // 사용자 정보에서 생년월일 추출 (주민번호 기반)
      // TODO: 나중에 주민번호에서 생년월일 추출하는 함수 구현
      const birthDate = null;
      
      // Firestore에 사용자 문서 생성
      const { doc, setDoc, Timestamp } = await import('firebase/firestore');
      const { db } = await import('../config/firebase');
      
      const userData = {
        name: completeSignUpData.name!,
        email: completeSignUpData.email!,
        phoneNumber: completeSignUpData.phone!,
        role: 'mentor_temp' as const,
        status: 'temp' as const,
        university: completeSignUpData.university!,
        grade: completeSignUpData.grade!,
        isOnLeave: completeSignUpData.isOnLeave,
        major1: completeSignUpData.major1!,
        major2: completeSignUpData.major2 || '',
        address: data.address,
        addressDetail: data.addressDetail,
        gender: data.gender,
        birthDate,
        referralPath: data.referralPath,
        referrerName: data.referrerName || '',
        otherReferralDetail: data.otherReferralDetail || '',
        agreedTerms: true,
        agreedPersonal: data.agreedPersonal,
        geocode: data.geocode,
        photoURL: '',
        userId: firebaseUser.uid,
        id: firebaseUser.uid,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      
      await setDoc(doc(db, 'users', firebaseUser.uid), userData);

      // 탈퇴(inactive) 계정이 동일 이메일로 존재하면 이메일 마스킹 처리
      try {
        const { getUserByEmailIncludeInactive } = await import('../services/authService');
        const inactiveUser = await getUserByEmailIncludeInactive(completeSignUpData.email!);
        if (inactiveUser && inactiveUser.userId !== firebaseUser.uid) {
          const { updateDoc, doc: docRef } = await import('firebase/firestore');
          await updateDoc(docRef(db, 'users', inactiveUser.userId), {
            email: `rejoined_${Date.now()}_${completeSignUpData.email}`,
          });
          logger.info('✅ 기존 탈퇴 계정 이메일 마스킹 완료:', inactiveUser.userId);
        }
      } catch (cleanupError) {
        logger.warn('⚠️ 기존 탈퇴 계정 정리 실패 (가입은 완료됨):', cleanupError);
      }

      // 주민등록번호 암호화 저장 (서버 API Route를 통해 처리)
      const { saveSensitiveInfo } = await import('../services/apiClient');
      await saveSensitiveInfo({
        userId: firebaseUser.uid,
        rrnFront: data.rrnFront,
        rrnLast: data.rrnLast,
      });
      
      // 이메일 인증 메일 발송
      const { sendEmailVerification } = await import('firebase/auth');
      await sendEmailVerification(firebaseUser);
      
      setIsLoading(false);
      
      Alert.alert(
        '회원가입 완료!',
        '회원가입이 완료되었습니다.\n이메일 인증을 완료한 후 관리자 승인을 기다려주세요.\n\n인증 메일을 확인해주세요.',
        [
          {
            text: '확인',
            onPress: () => {
              setCurrentScreen('signin');
              setSignUpData({});
            },
          },
        ]
      );
    } catch (error) {
      setIsLoading(false);
      logger.error('멘토 회원가입 실패:', error);
      Alert.alert(
        '회원가입 실패',
        '회원가입 중 오류가 발생했습니다.\n다시 시도해주세요.\n\n지속적인 문제 시 관리자에게 문의하세요.\n관리자: 010-7656-7933 (신선웅)'
      );
    }
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

  /**
   * 소셜 회원가입 핸들러
   * - role이 전달되면(SignInScreen에서 역할 선택 완료): 바로 소셜 가입 플로우로 이동
   * - role이 없으면: 역할 선택 화면으로 이동 (이전 방식 fallback)
   */
  const handleSocialSignUp = (socialData: any, tempUserId?: string, credential?: any, role?: 'mentor' | 'foreign') => {
    setSignUpData({
      ...signUpData,
      socialData: { ...socialData, _credential: credential },
      tempUserId,
      name: socialData.name,
      phone: socialData.phone,
      email: socialData.email,
    });

    if (role) {
      // SignInScreen에서 역할 선택이 완료된 경우 → 바로 소셜 가입 플로우
      setSelectedRole(role);
      setCurrentScreen('social-signup');
    } else {
      // fallback: 역할 선택 화면으로 이동
      setSelectedRole(null);
      setCurrentScreen('role-selection');
    }
  };

  const handleForeignSignUpStep2Next = async (data: {
    email: string;
    password: string;
  }) => {
    setSignUpData({ ...signUpData, ...data });

    if (!signUpData.firstName || !signUpData.lastName || !signUpData.phone || !data.email || !data.password) {
      Alert.alert('오류', '필수 정보가 누락되었습니다.');
      return;
    }

    try {
      let phoneWithoutLeadingZero = signUpData.phone || '';

      if (signUpData.countryCode === '+82' && phoneWithoutLeadingZero.startsWith('0')) {
        phoneWithoutLeadingZero = phoneWithoutLeadingZero.substring(1);
      }

      const fullPhone = `${signUpData.countryCode}${phoneWithoutLeadingZero}`;
      const fullName = signUpData.middleName
        ? `${signUpData.firstName} ${signUpData.middleName} ${signUpData.lastName}`
        : `${signUpData.firstName} ${signUpData.lastName}`;

      const existingUserByPhone = await getUserByPhone(fullPhone);
      const tempUser = existingUserByPhone?.role === 'foreign_temp' && existingUserByPhone?.status === 'temp'
        ? existingUserByPhone
        : null;

      // Firebase Auth 계정 생성 — 항상 새 UID를 받아야 Firestore 문서 ID와 일치
      const userCredential = await signUp(data.email, data.password);
      const userId = userCredential.user.uid;

      const userData = {
        userId,
        name: fullName,
        email: data.email,
        phone: fullPhone,
        phoneNumber: fullPhone,
        password: '',
        address: tempUser?.address || '',
        addressDetail: tempUser?.addressDetail || '',
        role: 'foreign',
        jobExperiences: tempUser?.jobExperiences || [],
        jobCodeIds: (tempUser?.jobExperiences || []).map((exp: { id: string }) => exp.id),
        partTimeJobs: tempUser?.partTimeJobs || [],
        createdAt: tempUser?.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now(),
        agreedTerms: true,
        agreedPersonal: true,
        profileImage: '',
        status: 'active' as const,
        isEmailVerified: false,
        isPhoneVerified: false,
        isProfileCompleted: false,
        isTermsAgreed: true,
        isPersonalAgreed: true,
        isAddressVerified: false,
        isProfileImageUploaded: false,
        jobMotivation: 'Foreign Teacher Application',
        feedback: (tempUser as any)?.feedback || '',
        ...(signUpData.dateOfBirth && {
          dateOfBirth: signUpData.dateOfBirth,
          age: calculateAgeFromDateOfBirth(signUpData.dateOfBirth),
        }),
        foreignTeacher: {
          firstName: signUpData.firstName,
          lastName: signUpData.lastName,
          middleName: signUpData.middleName || '',
          countryCode: signUpData.countryCode,
          cvUrl: '',
          passportPhotoUrl: '',
          foreignIdCardUrl: '',
          applicationDate: Timestamp.now(),
        },
      };

      // 새 Auth UID로 Firestore 문서 생성
      await setDoc(doc(db, 'users', userId), userData);

      // temp 계정이 있었으면 기존 문서 삭제 (새 문서 생성 후에 삭제)
      if (tempUser && tempUser.userId !== userId) {
        try {
          const { deleteDoc, doc: docRef } = await import('firebase/firestore');
          await deleteDoc(docRef(db, 'users', tempUser.userId));
          logger.info('🗑️ 기존 temp 문서 삭제 완료:', tempUser.userId);
        } catch (deleteError) {
          logger.warn('⚠️ 기존 temp 문서 삭제 실패 (가입은 완료됨):', deleteError);
        }
      }

      // 탈퇴(inactive) 계정이 동일 이메일로 존재하면 이메일 마스킹 처리
      try {
        const { getUserByEmailIncludeInactive } = await import('../services/authService');
        const inactiveUser = await getUserByEmailIncludeInactive(data.email);
        if (inactiveUser && inactiveUser.userId !== userId) {
          const { updateDoc, doc: docRef } = await import('firebase/firestore');
          await updateDoc(docRef(db, 'users', inactiveUser.userId), {
            email: `rejoined_${Date.now()}_${data.email}`,
          });
          logger.info('✅ 기존 탈퇴 계정 이메일 마스킹 완료:', inactiveUser.userId);
        }
      } catch (cleanupError) {
        logger.warn('⚠️ 기존 탈퇴 계정 정리 실패 (가입은 완료됨):', cleanupError);
      }

      const alertTitle = tempUser ? 'Account Activated' : 'Sign Up Complete';
      const alertMessage = tempUser
        ? `Welcome, ${fullName}!\n\nYour account has been activated.\nPlease upload your documents (Profile Photo, CV, Passport Photo) in Profile Edit.`
        : `Welcome, ${fullName}!\n\nYour account has been successfully created.\nPlease upload your documents (Profile Photo, CV, Passport Photo) in Profile Edit.`;

      Alert.alert(
        alertTitle,
        alertMessage,
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

  /**
   * Pull-to-refresh 핸들러
   */
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      console.log('🔄 ProfileScreen: Pull-to-refresh 시작');
      
      // 사용자 데이터 새로고침
      await refreshUserData();
      
      // 직무 코드 새로고침
      if (userData?.jobExperiences) {
        await loadJobCodes();
      }
      
      console.log('✅ ProfileScreen: Pull-to-refresh 완료');
    } catch (error) {
      console.error('❌ ProfileScreen: Pull-to-refresh 실패:', error);
    } finally {
      setRefreshing(false);
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

  /**
   * 회원 탈퇴 처리
   */
  // 재인증 함수
  const reauthenticateUser = async (password: string): Promise<boolean> => {
    try {
      if (!auth.currentUser || !userData?.email) {
        throw new Error('사용자 정보를 찾을 수 없습니다.');
      }
      
      const credential = EmailAuthProvider.credential(userData.email, password);
      await reauthenticateWithCredential(auth.currentUser, credential);
      logger.info('✅ 재인증 성공');
      return true;
    } catch (error: any) {
      logger.error('❌ 재인증 실패:', error);
      
      let errorMessage = '재인증에 실패했습니다.';
      if (error.code === 'auth/wrong-password') {
        errorMessage = '비밀번호가 올바르지 않습니다.';
      } else if (error.code === 'auth/invalid-credential') {
        errorMessage = '인증 정보가 올바르지 않습니다.';
      }
      
      Alert.alert('재인증 실패', errorMessage);
      return false;
    }
  };

  // 재인증 프롬프트 표시
  const showReauthPrompt = (): Promise<boolean> => {
    return new Promise((resolve) => {
      Alert.prompt(
        '재인증 필요',
        '보안을 위해 현재 비밀번호를 입력해주세요.',
        [
          {
            text: '취소',
            style: 'cancel',
            onPress: () => resolve(false)
          },
          {
            text: '확인',
            onPress: async (password?: string) => {
              if (!password) {
                Alert.alert('오류', '비밀번호를 입력해주세요.');
                resolve(false);
                return;
              }
              
              const success = await reauthenticateUser(password);
              resolve(success);
            }
          }
        ],
        'secure-text'
      );
    });
  };

  const handleDeactivateAccount = async () => {
    if (!userData) return;
    
    setIsDeactivating(true);
    try {
      await deactivateUserMobile(userData.userId, db, auth);
      
      setShowDeactivateModal(false);
      Alert.alert(
        '회원 탈퇴 완료', 
        '회원 탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.',
        [
          {
            text: '확인',
            onPress: () => {
              // 앱을 종료하거나 로그인 화면으로 이동
              setCurrentScreen('signin');
            }
          }
        ]
      );
      
      logger.info('✅ 회원 탈퇴 완료:', userData.email);
    } catch (error: any) {
      logger.error('❌ 회원 탈퇴 실패:', error);
      
      // 재인증이 필요한 경우
      if (error.message?.includes('재로그인이 필요합니다') || error.message?.includes('requires-recent-login')) {
        setIsDeactivating(false); // 로딩 상태 해제
        
        Alert.alert(
          '재인증 필요',
          '보안을 위해 재인증이 필요합니다. 계속하시겠습니까?',
          [
            { text: '취소', style: 'cancel' },
            {
              text: '재인증',
              onPress: async () => {
                const reauthSuccess = await showReauthPrompt();
                if (reauthSuccess) {
                  // 재인증 성공 시 다시 탈퇴 시도
                  await handleDeactivateAccount();
                }
              }
            }
          ]
        );
        return;
      }
      
      // 다른 에러의 경우
      Alert.alert(
        '회원 탈퇴 실패',
        error.message || '회원 탈퇴 중 오류가 발생했습니다. 다시 시도해주세요.',
        [{ text: '확인' }]
      );
    } finally {
      setIsDeactivating(false);
    }
  };

  /**
   * 소셜 계정 연동
   */
  const handleSocialLink = async (providerId: string) => {
    if (!userData) return;

    try {
      // 1. 캐시 무효화
      console.log('🗑️ 사용자 캐시 무효화:', userData.userId);
      const { removeCache, CACHE_STORE } = await import('../services/cacheUtils');
      await removeCache(CACHE_STORE.USERS, userData.userId);

      let socialData;
      let credential;

      if (providerId === 'google.com') {
        const { signInWithGoogleDirect } = await import('../services/googleAuthService');

        const result = await signInWithGoogleDirect();
        socialData = result.socialData;
        credential = result.credential;

        console.log('🔗 구글 계정 연동:', {
          currentEmail: userData.email,
          googleEmail: socialData.email,
          allowDifferentEmail: true,
        });

        // 원래 계정으로 복원
        const currentUserAfterPopup = auth.currentUser;
        if (currentUserAfterPopup?.uid !== userData.userId) {
          console.log('⚠️ 구글 팝업으로 세션 변경됨 → 원래 계정으로 복원');

          // Custom Token으로 복원
          const { signInWithCustomToken } = await import('../services/authService');
          await signInWithCustomToken(userData.userId, userData.email);
        }

        // Firebase Auth 연동 시도
        if (credential) {
          const { linkWithCredential } = await import('firebase/auth');
          try {
            await linkWithCredential(auth.currentUser!, credential);
            console.log('✅ Firebase Auth 소셜 계정 연동 완료');
          } catch (authError: any) {
            if (authError.code === 'auth/credential-already-in-use') {
              console.log('⚠️ 구글 계정이 이미 Firebase Auth에 존재 → Firestore에만 저장');
            } else {
              throw authError;
            }
          }
        }
      } else if (providerId === 'naver') {
        // OAuth 2.0 방식 (Expo Go 호환)
        const { signInWithNaver } = await import('../services/naverAuthService');
        socialData = await signInWithNaver();
      } else if (providerId === 'apple.com') {
        // Apple 연동
        const { signInWithApple } = await import('../services/appleAuthService');
        socialData = await signInWithApple();
        
        console.log('🔗 애플 계정 연동:', {
          currentEmail: userData.email,
          appleEmail: socialData.email,
          appleUserId: socialData.providerUid,
        });
        
        // ✅ Apple 팝업으로 세션 변경될 수 있음 → 원래 계정으로 복원
        const currentUserAfterApple = auth.currentUser;
        if (currentUserAfterApple?.uid !== userData.userId) {
          console.log('⚠️ Apple 팝업으로 세션 변경됨 → 원래 계정으로 복원');
          
          // Custom Token으로 원래 계정 복원
          const { signInWithCustomToken } = await import('../services/authService');
          await signInWithCustomToken(userData.userId, userData.email);
          console.log('✅ 원래 계정으로 복원 완료');
        }
        
        // ✅ Apple도 Firebase Auth 연동 시도
        if (socialData.idToken) {
          const { OAuthProvider } = await import('firebase/auth');
          const { linkWithCredential } = await import('firebase/auth');
          
          try {
            const appleProvider = new OAuthProvider('apple.com');
            credential = appleProvider.credential({
              idToken: socialData.idToken,
            });
            
            await linkWithCredential(auth.currentUser!, credential);
            console.log('✅ Firebase Auth Apple 연동 완료');
          } catch (authError: any) {
            if (authError.code === 'auth/credential-already-in-use') {
              console.log('⚠️ Apple 계정이 이미 Firebase Auth에 존재 → Firestore에만 저장');
            } else {
              console.error('⚠️ Firebase Auth Apple 연동 실패:', authError);
            }
          }
        }
      } else {
        Alert.alert('알림', '해당 소셜 로그인은 준비 중입니다.');
        return;
      }

      // Firestore에 연동 정보 추가
      const { linkSocialProvider } = await import('@smis-mentor/shared');
      const { arrayUnion } = await import('firebase/firestore');
      const { getUserById, updateUser } = await import('../services/authService');

      await linkSocialProvider(
        userData.userId,
        socialData,
        getUserById as any,
        updateUser as any,
        arrayUnion
      );

      Alert.alert('성공', '소셜 계정이 성공적으로 연동되었습니다.');

      // 사용자 데이터 새로고침 (UI 즉시 반영)
      console.log('🔄 사용자 데이터 새로고침 시작');
      await refreshUserData();
      console.log('✅ 사용자 데이터 새로고침 완료');
    } catch (error: any) {
      console.error('소셜 계정 연동 오류:', error);
      
      let errorMessage = '소셜 계정 연동 중 오류가 발생했습니다.';
      if (error.message === 'POPUP_CLOSED') {
        errorMessage = '로그인 창이 닫혔습니다.';
      } else if (error.message?.includes('취소')) {
        errorMessage = '로그인이 취소되었습니다.';
      }
      
      Alert.alert('오류', errorMessage);
    }
  };

  /**
   * 문서 업로드 (CV - PDF/DOC)
   */
  const handleUploadCV = async () => {
    if (!userData) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setUploadingDoc('cv');
      const file = result.assets[0];
      const downloadURL = await uploadCV(userData.userId, file.uri, file.name || 'cv.pdf');
      await updateUserProfile(userData.userId, {
        foreignTeacher: { ...((userData as any).foreignTeacher || {}), cvUrl: downloadURL },
      });
      await refreshUserData();
      Alert.alert('Success', 'CV uploaded successfully.');
    } catch (error) {
      logger.error('CV 업로드 오류:', error);
      Alert.alert('Error', 'Failed to upload CV.');
    } finally {
      setUploadingDoc(null);
    }
  };

  /**
   * 문서 업로드 (Passport Photo - 이미지)
   */
  const handleUploadPassportPhoto = async () => {
    if (!userData) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Photo library access is required.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setUploadingDoc('passport');
      const downloadURL = await uploadPassportPhoto(userData.userId, result.assets[0].uri);
      await updateUserProfile(userData.userId, {
        foreignTeacher: { ...((userData as any).foreignTeacher || {}), passportPhotoUrl: downloadURL },
      });
      await refreshUserData();
      Alert.alert('Success', 'Passport photo uploaded successfully.');
    } catch (error) {
      logger.error('여권 사진 업로드 오류:', error);
      Alert.alert('Error', 'Failed to upload passport photo.');
    } finally {
      setUploadingDoc(null);
    }
  };

  /**
   * 문서 업로드 (Foreign Resident ID Card - 이미지 또는 PDF)
   */
  const handleUploadIdCard = async () => {
    if (!userData) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setUploadingDoc('idCard');
      const file = result.assets[0];
      const downloadURL = await uploadForeignIdCard(userData.userId, file.uri);
      await updateUserProfile(userData.userId, {
        foreignTeacher: { ...((userData as any).foreignTeacher || {}), foreignIdCardUrl: downloadURL },
      });
      await refreshUserData();
      Alert.alert('Success', 'Foreign Resident ID Card uploaded successfully.');
    } catch (error) {
      logger.error('외국인 등록증 업로드 오류:', error);
      Alert.alert('Error', 'Failed to upload ID card.');
    } finally {
      setUploadingDoc(null);
    }
  };

  /**
   * 문서 업로드 (Bank Book - 이미지 또는 PDF)
   */
  const handleUploadBankBook = async () => {
    if (!userData) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setUploadingDoc('bankBook');
      const file = result.assets[0];
      const downloadURL = await uploadBankBook(userData.userId, file.uri, file.name || 'bankbook.pdf');
      await updateUserProfile(userData.userId, {
        foreignTeacher: { ...((userData as any).foreignTeacher || {}), bankBookUrl: downloadURL },
      });
      await refreshUserData();
      Alert.alert('Success', 'Bank Book uploaded successfully.');
    } catch (error) {
      logger.error('통장사본 업로드 오류:', error);
      Alert.alert('Error', 'Failed to upload bank book.');
    } finally {
      setUploadingDoc(null);
    }
  };

  /**
   * 문서 업로드 (ESL Certificate - PDF 또는 이미지)
   */
  const handleUploadEslCert = async () => {
    if (!userData) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setUploadingDoc('eslCert');
      const file = result.assets[0];
      const downloadURL = await uploadEslCert(userData.userId, file.uri, file.name || 'esl_cert.pdf');
      await updateUserProfile(userData.userId, {
        foreignTeacher: { ...((userData as any).foreignTeacher || {}), eslCertUrl: downloadURL },
      });
      await refreshUserData();
      Alert.alert('Success', 'ESL Certificate uploaded successfully.');
    } catch (error) {
      logger.error('ESL 자격증 업로드 오류:', error);
      Alert.alert('Error', 'Failed to upload ESL Certificate.');
    } finally {
      setUploadingDoc(null);
    }
  };

  /**
   * 문서 삭제 (Storage 파일 삭제 + Firestore URL null 처리)
   */
  const handleDeleteDoc = (
    type: 'cv' | 'passport' | 'idCard' | 'bankBook' | 'eslCert',
    url: string
  ) => {
    if (!userData) return;

    const labelMap = {
      cv: 'CV',
      passport: 'Passport Photo',
      idCard: 'Foreign Resident ID Card',
      bankBook: 'Bank Book',
      eslCert: 'ESL Certificate',
    };
    const fieldMap = {
      cv: 'cvUrl',
      passport: 'passportPhotoUrl',
      idCard: 'foreignIdCardUrl',
      bankBook: 'bankBookUrl',
      eslCert: 'eslCertUrl',
    } as const;

    Alert.alert(
      'Delete Document',
      `Are you sure you want to delete the ${labelMap[type]}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingDoc(type);
              // Storage 파일 삭제
              const fileRef = storageRef(storage, url);
              await deleteObject(fileRef).catch(() => {});
              // Firestore URL null 처리
              await updateUserProfile(userData.userId, {
                foreignTeacher: {
                  ...((userData as any).foreignTeacher || {}),
                  [fieldMap[type]]: null,
                },
              });
              await refreshUserData();
              Alert.alert('Deleted', `${labelMap[type]} has been deleted.`);
            } catch (error) {
              logger.error('문서 삭제 오류:', error);
              Alert.alert('Error', 'Failed to delete document. Please try again.');
            } finally {
              setDeletingDoc(null);
            }
          },
        },
      ]
    );
  };

  /**
   * 소셜 계정 연동 해제
   */
  const handleSocialUnlink = async (providerId: string) => {
    if (!userData) return;

    const providerName = 
      providerId === 'google.com' ? 'Google' :
      providerId === 'naver' || providerId === 'naver.com' ? (isForeign ? 'Naver' : '네이버') :
      providerId === 'kakao' ? (isForeign ? 'Kakao' : '카카오') :
      providerId === 'apple.com' ? 'Apple' : (isForeign ? 'Social' : '소셜');

    Alert.alert(
      isForeign ? 'Unlink Account' : '연동 해제',
      isForeign
        ? `Are you sure you want to unlink your ${providerName} account?`
        : `${providerName} 계정 연동을 해제하시겠습니까?`,
      [
        { text: isForeign ? 'Cancel' : '취소', style: 'cancel' },
        {
          text: isForeign ? 'Unlink' : '해제',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🗑️ 사용자 캐시 무효화:', userData.userId);
              const { removeCache, CACHE_STORE } = await import('../services/cacheUtils');
              await removeCache(CACHE_STORE.USERS, userData.userId);

              const { unlinkSocialProvider } = await import('@smis-mentor/shared');
              const { getUserById, updateUser, getUserByEmail } = await import('../services/authService');
              const { runTransaction, doc } = await import('firebase/firestore');
              const { db } = await import('../config/firebase');

              const runTransactionWrapper = async (updateFn: (user: any) => any) => {
                await runTransaction(db, async (transaction) => {
                  const userRef = doc(db, 'users', userData.userId);
                  const userDoc = await transaction.get(userRef);
                  
                  if (!userDoc.exists()) {
                    throw new Error('사용자 문서를 찾을 수 없습니다.');
                  }
                  
                  const latestUserData = userDoc.data();
                  const updates = await updateFn(latestUserData);
                  
                  transaction.update(userRef, updates);
                });
              };

              await unlinkSocialProvider(
                auth,
                providerId as any,
                userData.userId,
                getUserById as any,
                updateUser as any,
                runTransactionWrapper
              );

              Alert.alert(
                isForeign ? 'Success' : '성공',
                isForeign
                  ? `${providerName} account has been unlinked.`
                  : `${providerName} 계정 연동이 해제되었습니다.`
              );

              console.log('🔄 사용자 데이터 새로고침 시작');
              await refreshUserData();
              console.log('✅ 사용자 데이터 새로고침 완료');
            } catch (error: any) {
              console.error('연동 해제 오류:', error);
              Alert.alert(
                isForeign ? 'Error' : '오류',
                error.message || (isForeign ? 'Failed to unlink account.' : '연동 해제 중 오류가 발생했습니다.')
              );
            }
          },
        },
      ]
    );
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
  if (isAuthenticated && userData) {
    const isForeign = userData.role === 'foreign' || userData.role === 'foreign_temp';

    // 상태 및 역할 표시 헬퍼 함수들
    const getRoleColor = (role: string) => {
      switch (role) {
        case 'admin':
          return '#dc2626';
        case 'mentor':
        case 'mentor_temp':
          return '#3b82f6';
        case 'foreign':
        case 'foreign_temp':
          return '#10b981';
        default:
          return '#9ca3af';
      }
    };

    const getRoleLabel = (role: string) => {
      if (isForeign) {
        switch (role) {
          case 'foreign': return 'Foreign Teacher';
          case 'foreign_temp': return 'Foreign Teacher (Temp)';
          default: return 'User';
        }
      }
      switch (role) {
        case 'admin': return '관리자';
        case 'mentor': return '멘토';
        case 'mentor_temp': return '멘토';
        case 'foreign': return '원어민';
        case 'foreign_temp': return '원어민';
        default: return '사용자';
      }
    };

    const getStatusColor = (status: string, role: string) => {
      // mentor_temp나 foreign_temp인 경우 활성 상태로 간주
      if (role === 'mentor_temp' || role === 'foreign_temp') {
        return '#10b981'; // 활성 색상
      }
      
      switch (status) {
        case 'active':
          return '#10b981';
        case 'inactive':
          return '#ef4444';
        case 'deleted':
          return '#9ca3af';
        default:
          return '#eab308';
      }
    };

    const getStatusLabel = (status: string, role: string) => {
      if (isForeign) {
        if (role === 'foreign_temp') return 'Active';
        switch (status) {
          case 'active': return 'Active';
          case 'inactive': return 'Inactive';
          case 'deleted': return 'Deleted';
          default: return 'Temporary';
        }
      }
      if (role === 'mentor_temp' || role === 'foreign_temp') return '활성';
      switch (status) {
        case 'active': return '활성';
        case 'inactive': return '비활성';
        case 'deleted': return '삭제됨';
        default: return '임시';
      }
    };

    return (
      <ScrollView 
        style={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
            colors={['#3b82f6']}
          />
        }
      >
        {/* 캠프 데이터 프리페칭 모달 */}
        <Modal
          visible={prefetchingCamp}
          transparent
          animationType="fade"
          onRequestClose={() => {}}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderTop}>
                  <Ionicons name="rocket" size={48} color="#3b82f6" />
                  <TouchableOpacity 
                    style={styles.closeButton}
                    onPress={handleCancelPrefetch}
                  >
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalTitle}>캠프 데이터 로딩 중</Text>
                <Text style={styles.modalSubtitle}>
                  빠른 탐색을 위해 데이터를 미리 불러오는 중입니다
                </Text>
              </View>
              
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View 
                    style={[
                      styles.progressFill, 
                      { width: `${prefetchProgress}%` }
                    ]} 
                  />
                </View>
                <Text style={styles.progressText}>{prefetchProgress}%</Text>
              </View>
              
              <View style={styles.loadingSteps}>
                <View style={styles.loadingStep}>
                  <Ionicons 
                    name={prefetchStage !== 'cache' ? "checkmark-circle" : "ellipse-outline"} 
                    size={20} 
                    color={prefetchStage !== 'cache' ? "#10b981" : "#3b82f6"} 
                  />
                  <Text style={[
                    styles.loadingStepText, 
                    prefetchStage === 'cache' && styles.loadingStepTextActive,
                    prefetchStage !== 'cache' && styles.loadingStepTextDone
                  ]}>
                    기존 캐시 정리
                  </Text>
                </View>
                <View style={styles.loadingStep}>
                  <Ionicons 
                    name={prefetchStage === 'cache' ? "ellipse-outline" : prefetchStage === 'update' ? "ellipse-outline" : "checkmark-circle"} 
                    size={20} 
                    color={prefetchStage === 'cache' ? "#cbd5e1" : prefetchStage === 'update' ? "#3b82f6" : "#10b981"} 
                  />
                  <Text style={[
                    styles.loadingStepText, 
                    prefetchStage === 'update' && styles.loadingStepTextActive,
                    !['cache', 'update'].includes(prefetchStage) && styles.loadingStepTextDone
                  ]}>
                    캠프 변경
                  </Text>
                </View>
                <View style={styles.loadingStep}>
                  <Ionicons 
                    name={['cache', 'update'].includes(prefetchStage) ? "ellipse-outline" : prefetchStage === 'data' ? "ellipse-outline" : "checkmark-circle"} 
                    size={20} 
                    color={['cache', 'update'].includes(prefetchStage) ? "#cbd5e1" : prefetchStage === 'data' ? "#3b82f6" : "#10b981"} 
                  />
                  <Text style={[
                    styles.loadingStepText, 
                    prefetchStage === 'data' && styles.loadingStepTextActive,
                    ['recruitment', 'webview', 'complete'].includes(prefetchStage) && styles.loadingStepTextDone
                  ]}>
                    캠프 데이터 로딩
                  </Text>
                </View>
                <View style={styles.loadingStep}>
                  <Ionicons 
                    name={['cache', 'update', 'data'].includes(prefetchStage) ? "ellipse-outline" : prefetchStage === 'recruitment' ? "ellipse-outline" : "checkmark-circle"} 
                    size={20} 
                    color={['cache', 'update', 'data'].includes(prefetchStage) ? "#cbd5e1" : prefetchStage === 'recruitment' ? "#3b82f6" : "#10b981"} 
                  />
                  <Text style={[
                    styles.loadingStepText, 
                    prefetchStage === 'recruitment' && styles.loadingStepTextActive,
                    ['webview', 'complete'].includes(prefetchStage) && styles.loadingStepTextDone
                  ]}>
                    채용 데이터 로딩
                  </Text>
                </View>
                <View style={styles.loadingStep}>
                  <Ionicons 
                    name={prefetchStage === 'complete' ? "checkmark-circle" : "ellipse-outline"} 
                    size={20} 
                    color={prefetchStage === 'complete' ? "#10b981" : prefetchStage === 'webview' ? "#3b82f6" : "#cbd5e1"} 
                  />
                  <View style={styles.loadingStepTextContainer}>
                    <Text style={[
                      styles.loadingStepText, 
                      prefetchStage === 'webview' && styles.loadingStepTextActive,
                      prefetchStage === 'complete' && styles.loadingStepTextDone
                    ]}>
                      구글시트 프리로딩
                    </Text>
                    {prefetchStage === 'webview' && webViewLoadProgress.total > 0 && (
                      <Text style={styles.loadingStepSubtext}>
                        {webViewLoadProgress.loaded} / {webViewLoadProgress.total}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              
              <ActivityIndicator size="large" color="#3b82f6" style={{ marginTop: 16 }} />
            </View>
          </View>
        </Modal>

        {/* 회원 탈퇴 확인 모달 */}
        <Modal
          visible={showDeactivateModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDeactivateModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.deactivateModalContent}>
              <View style={styles.deactivateModalHeader}>
                <Ionicons name="warning" size={48} color="#ef4444" />
                <Text style={styles.deactivateModalTitle}>
                  {isForeign ? 'Confirm Account Deletion' : '회원 탈퇴 확인'}
                </Text>
                <Text style={styles.deactivateModalMessage}>
                  {isForeign 
                    ? 'Are you sure you want to delete your account? After deletion, you will not be able to log in with the same email, and all account information will be deactivated.'
                    : '정말로 회원 탈퇴를 진행하시겠습니까?\n\n탈퇴 후에는 동일한 이메일로 다시 로그인할 수 없으며, 모든 계정 정보가 비활성화됩니다.'
                  }
                </Text>
              </View>
              
              <View style={styles.deactivateModalButtons}>
                <TouchableOpacity
                  style={styles.deactivateModalCancelButton}
                  onPress={() => setShowDeactivateModal(false)}
                  disabled={isDeactivating}
                >
                  <Text style={styles.deactivateModalCancelText}>
                    {isForeign ? 'Cancel' : '취소'}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.deactivateModalConfirmButton,
                    isDeactivating && styles.deactivateModalConfirmButtonDisabled
                  ]}
                  onPress={handleDeactivateAccount}
                  disabled={isDeactivating}
                >
                  {isDeactivating ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.deactivateModalConfirmText}>
                      {isForeign ? 'Delete' : '탈퇴하기'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View style={styles.content}>
          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={styles.title}>{isForeign ? 'My Profile' : '내 프로필'}</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('ProfileEdit')}
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
                <View style={styles.profileStatus}>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(userData.status, userData.role) }]}>
                    <Text style={styles.statusBadgeText}>{getStatusLabel(userData.status, userData.role)}</Text>
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: getRoleColor(userData.role) }]}>
                    <Text style={styles.roleBadgeText}>{getRoleLabel(userData.role)}</Text>
                  </View>
                </View>
                <Text style={styles.profileEmail}>{userData.email}</Text>
                {(userData.phone || userData.phoneNumber) && (
                  <Text style={styles.profilePhone}>
                    {formatPhoneNumber(userData.phoneNumber || userData.phone || '')}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* SMIS 캠프 참여 이력 - 기수 선택 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {userData.role === 'admin'
                  ? '전체 캠프 코드'
                  : isForeign
                    ? 'SMIS Camp History'
                    : 'SMIS 캠프 참여 이력'}
              </Text>
            </View>
            
            {loadingJobCodes ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color="#3b82f6" />
              </View>
            ) : jobCodes.length === 0 ? (
              <Text style={styles.emptyText}>
                {isForeign
                  ? 'No camp history registered. Camp codes will appear here once assigned by an administrator.'
                  : '등록된 참여 이력이 없습니다.'}
              </Text>
            ) : userData.role === 'admin' ? (
              // Admin: generation별 뱃지 형태 (27기 이상만 표시, 26기 이하는 더보기)
              <View style={styles.adminBadgesContainer}>
                {(() => {
                  // generation별로 그룹화
                  const groupedByGeneration = jobCodes.reduce((acc: Record<string, typeof jobCodes>, job) => {
                    const gen = job.generation;
                    if (!acc[gen]) {
                      acc[gen] = [];
                    }
                    acc[gen].push(job);
                    return acc;
                  }, {});

                  // generation 순서대로 정렬 (숫자 추출하여 내림차순)
                  const sortedGenerations = Object.keys(groupedByGeneration).sort((a, b) => {
                    const numA = parseInt(a.replace(/[^0-9]/g, ''));
                    const numB = parseInt(b.replace(/[^0-9]/g, ''));
                    return numB - numA;
                  });

                  // 27기 이상과 26기 이하 분리
                  const recentGenerations = sortedGenerations.filter((gen) => {
                    const num = parseInt(gen.replace(/[^0-9]/g, ''));
                    return num >= 27;
                  });
                  const olderGenerations = sortedGenerations.filter((gen) => {
                    const num = parseInt(gen.replace(/[^0-9]/g, ''));
                    return num <= 26;
                  });

                  return (
                    <>
                      {/* 27기 이상 */}
                      {recentGenerations.map((generation) => (
                        <View key={generation} style={styles.badgeRow}>
                          {groupedByGeneration[generation].map((job) => {
                            const isActive = userData?.activeJobExperienceId === job.id;
                            const isTemporary = userData?.role === 'admin' && isActive && (userData as any).adminTempActiveCamp === job.id;
                            
                            return (
                              <TouchableOpacity
                                key={job.id}
                                onPress={() => handleJobCodeSelect(job.id)}
                                disabled={changingJobCode || isActive}
                                style={[
                                  styles.adminBadge,
                                  isActive && (isTemporary ? styles.adminBadgeTemporary : styles.adminBadgeActive),
                                  changingJobCode && !isActive && styles.adminBadgeDisabled,
                                ]}
                              >
                                <Text style={[
                                  styles.adminBadgeText,
                                  isActive && (isTemporary ? styles.adminBadgeTextTemporary : styles.adminBadgeTextActive),
                                ]}>
                                  {job.code}
                                </Text>
                                {isTemporary && (
                                  <View style={styles.tempIndicator} />
                                )}
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ))}
                      
                      {/* 26기 이하 - 더보기 토글 */}
                      {olderGenerations.length > 0 && (
                        <>
                          <TouchableOpacity
                            onPress={() => setShowOlderGenerations(!showOlderGenerations)}
                            style={styles.toggleButton}
                          >
                            <Text style={styles.toggleButtonText}>
                              {showOlderGenerations ? '26기 이하 접기' : '26기 이하 더보기'}
                            </Text>
                            <Text style={styles.toggleButtonIcon}>
                              {showOlderGenerations ? '▲' : '▼'}
                            </Text>
                          </TouchableOpacity>
                          
                          {showOlderGenerations && (
                            <View style={styles.olderGenerationsContainer}>
                              {olderGenerations.map((generation) => (
                                <View key={generation} style={styles.badgeRow}>
                                  {groupedByGeneration[generation].map((job) => {
                                    const isActive = userData?.activeJobExperienceId === job.id;
                                    const isTemporary = userData?.role === 'admin' && isActive && (userData as any).adminTempActiveCamp === job.id;
                                    
                                    return (
                                      <TouchableOpacity
                                        key={job.id}
                                        onPress={() => handleJobCodeSelect(job.id)}
                                        disabled={changingJobCode || isActive}
                                        style={[
                                          styles.adminBadge,
                                          isActive && (isTemporary ? styles.adminBadgeTemporary : styles.adminBadgeActive),
                                          changingJobCode && !isActive && styles.adminBadgeDisabled,
                                        ]}
                                      >
                                        <Text style={[
                                          styles.adminBadgeText,
                                          isActive && (isTemporary ? styles.adminBadgeTextTemporary : styles.adminBadgeTextActive),
                                        ]}>
                                          {job.code}
                                        </Text>
                                        {isTemporary && (
                                          <View style={styles.tempIndicator} />
                                        )}
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>
                              ))}
                            </View>
                          )}
                        </>
                      )}
                    </>
                  );
                })()}
              </View>
            ) : (
              // 일반 사용자: 기존 리스트 형태
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
                              <Text style={styles.activeBadgeText}>{isForeign ? 'Active' : '활성'}</Text>
                            </View>
                          )}
                          {jobCode.code && (
                            <View style={styles.codeBadge}>
                              <Text style={styles.codeBadgeText}>{jobCode.code}</Text>
                            </View>
                          )}
                          {exp?.groupRole && (
                            <View style={styles.jobRoleBadge}>
                              <Text style={styles.jobRoleBadgeText}>{exp.groupRole}</Text>
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
          </View>

          {/* 원어민 교사 정보 (Teacher Information + Personal Information 통합) */}
          {isForeign && userData.foreignTeacher && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Teacher Information</Text>
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
                  <Text style={styles.infoLabel}>Country</Text>
                  <Text style={styles.infoValue}>{userData.foreignTeacher.countryCode}</Text>
                </View>
                {userData.age && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Age</Text>
                    <Text style={styles.infoValue}>{userData.age} years old</Text>
                  </View>
                )}
                {userData.gender && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Gender</Text>
                    <Text style={styles.infoValue}>{userData.gender === 'M' ? 'Male' : 'Female'}</Text>
                  </View>
                )}
                {userData.phoneNumber && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Phone Number</Text>
                    <Text style={styles.infoValue}>{formatPhoneNumber(userData.phoneNumber)}</Text>
                  </View>
                )}
                {userData.address && (
                  <View style={[styles.infoItem, { flex: 1, width: '100%' }]}>
                    <Text style={styles.infoLabel}>Address</Text>
                    <Text style={styles.infoValue}>
                      {userData.address}{userData.addressDetail ? ` ${userData.addressDetail}` : ''}
                    </Text>
                  </View>
                )}
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
            </View>
          )}

          {/* 원어민 제출 서류 (별도 섹션) */}
          {isForeign && userData.foreignTeacher && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Submitted Documents</Text>
              </View>
              <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, gap: 10 }}>
                <DocRow
                  label="CV (Curriculum Vitae)"
                  hint="PDF or Word"
                  url={userData.foreignTeacher.cvUrl}
                  isUploading={uploadingDoc === 'cv'}
                  isDeleting={deletingDoc === 'cv'}
                  accentColor="#4F46E5"
                  uploadedBg="#EEF2FF"
                  uploadedBorder="#C7D2FE"
                  onView={() => userData.foreignTeacher?.cvUrl && Linking.openURL(userData.foreignTeacher.cvUrl)}
                  onUpload={handleUploadCV}
                  onDelete={() => userData.foreignTeacher?.cvUrl && handleDeleteDoc('cv', userData.foreignTeacher.cvUrl)}
                />
                <DocRow
                  label="Passport Photo"
                  hint="JPG / PNG"
                  url={userData.foreignTeacher.passportPhotoUrl}
                  isUploading={uploadingDoc === 'passport'}
                  isDeleting={deletingDoc === 'passport'}
                  accentColor="#16A34A"
                  uploadedBg="#F0FDF4"
                  uploadedBorder="#BBF7D0"
                  onView={() => userData.foreignTeacher?.passportPhotoUrl && Linking.openURL(userData.foreignTeacher.passportPhotoUrl)}
                  onUpload={handleUploadPassportPhoto}
                  onDelete={() => userData.foreignTeacher?.passportPhotoUrl && handleDeleteDoc('passport', userData.foreignTeacher.passportPhotoUrl)}
                />
                <DocRow
                  label="Foreign Resident ID Card"
                  hint="JPG / PNG / PDF"
                  url={userData.foreignTeacher.foreignIdCardUrl}
                  isUploading={uploadingDoc === 'idCard'}
                  isDeleting={deletingDoc === 'idCard'}
                  accentColor="#D97706"
                  uploadedBg="#FFFBEB"
                  uploadedBorder="#FDE68A"
                  onView={() => userData.foreignTeacher?.foreignIdCardUrl && Linking.openURL(userData.foreignTeacher.foreignIdCardUrl)}
                  onUpload={handleUploadIdCard}
                  onDelete={() => userData.foreignTeacher?.foreignIdCardUrl && handleDeleteDoc('idCard', userData.foreignTeacher.foreignIdCardUrl)}
                />
                <DocRow
                  label="Bank Book (통장사본)"
                  hint="JPG / PNG / PDF"
                  url={userData.foreignTeacher.bankBookUrl}
                  isUploading={uploadingDoc === 'bankBook'}
                  isDeleting={deletingDoc === 'bankBook'}
                  accentColor="#0D9488"
                  uploadedBg="#F0FDFA"
                  uploadedBorder="#99F6E4"
                  onView={() => userData.foreignTeacher?.bankBookUrl && Linking.openURL(userData.foreignTeacher.bankBookUrl)}
                  onUpload={handleUploadBankBook}
                  onDelete={() => userData.foreignTeacher?.bankBookUrl && handleDeleteDoc('bankBook', userData.foreignTeacher.bankBookUrl)}
                />
                <DocRow
                  label="ESL Certificate (TESOL/TEFL/CELTA)"
                  hint="JPG / PNG / PDF"
                  url={(userData.foreignTeacher as any).eslCertUrl}
                  isUploading={uploadingDoc === 'eslCert'}
                  isDeleting={deletingDoc === 'eslCert'}
                  accentColor="#7C3AED"
                  uploadedBg="#F5F3FF"
                  uploadedBorder="#DDD6FE"
                  onView={() => (userData.foreignTeacher as any).eslCertUrl && Linking.openURL((userData.foreignTeacher as any).eslCertUrl)}
                  onUpload={handleUploadEslCert}
                  onDelete={() => (userData.foreignTeacher as any).eslCertUrl && handleDeleteDoc('eslCert', (userData.foreignTeacher as any).eslCertUrl)}
                />
              </View>
            </View>
          )}

          {/* 소셜 계정 연동 관리 */}
          {userData.authProviders && userData.authProviders?.length > 0 && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  {isForeign ? 'Linked Accounts' : '계정 연동 관리'}
                </Text>
              </View>
              <View style={styles.socialAccountsContainer}>
                <Text style={styles.socialSectionLabel}>
                  {isForeign ? 'Currently linked accounts' : '현재 연동된 계정'}
                </Text>
                {userData.authProviders?.map((provider: any) => {
                  const isPassword = provider.providerId === 'password';
                  const canUnlink = (userData.authProviders?.length || 0) > 1 && !isPassword;
                  
                  return (
                    <View key={provider.providerId} style={styles.socialAccountItem}>
                      <View style={styles.socialAccountInfo}>
                        <Text style={styles.socialAccountIcon}>
                          {provider.providerId === 'google.com' ? '🔵' :
                           provider.providerId === 'naver' || provider.providerId === 'naver.com' ? '🟢' :
                           provider.providerId === 'kakao' ? '💬' :
                           provider.providerId === 'apple.com' ? '🍎' : '🔐'}
                        </Text>
                        <View style={styles.socialAccountDetails}>
                          <Text style={styles.socialAccountName}>
                            {provider.providerId === 'google.com' ? 'Google' :
                             provider.providerId === 'naver' || provider.providerId === 'naver.com'
                               ? (isForeign ? 'Naver' : '네이버') :
                             provider.providerId === 'kakao'
                               ? (isForeign ? 'Kakao' : '카카오') :
                             provider.providerId === 'apple.com' ? 'Apple'
                               : (isForeign ? 'Email / Password' : '이메일/비밀번호')}
                          </Text>
                          {provider.email && (
                            <Text style={styles.socialAccountEmail}>{provider.email}</Text>
                          )}
                        </View>
                      </View>
                      {canUnlink ? (
                        <TouchableOpacity
                          onPress={() => handleSocialUnlink(provider.providerId)}
                          style={styles.unlinkButton}
                        >
                          <Text style={styles.unlinkButtonText}>{isForeign ? 'Unlink' : '해제'}</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.socialAccountRequiredText}>{isForeign ? 'Primary' : '기본'}</Text>
                      )}
                    </View>
                  );
                })}
                
                <Text style={[styles.socialSectionLabel, { marginTop: 16 }]}>
                  {isForeign ? 'Available to link' : '추가 연동 가능'}
                </Text>
                
                {/* Google 연동 버튼 */}
                {!userData.authProviders?.some((p: any) => p.providerId === 'google.com') && (
                  <TouchableOpacity
                    style={styles.socialLinkButton}
                    onPress={() => handleSocialLink('google.com')}
                  >
                    <Text style={styles.socialLinkIcon}>🔵</Text>
                    <Text style={styles.socialLinkText}>{isForeign ? 'Link Google' : 'Google 연동'}</Text>
                  </TouchableOpacity>
                )}
                
                {/* 네이버 연동 버튼 - 원어민에게는 숨김 (외국인은 네이버 계정이 없음) */}
                {!isForeign && !userData.authProviders?.some((p: any) => p.providerId === 'naver' || p.providerId === 'naver.com') && (
                  <TouchableOpacity
                    style={styles.socialLinkButton}
                    onPress={() => handleSocialLink('naver')}
                  >
                    <Text style={styles.socialLinkIcon}>🟢</Text>
                    <Text style={styles.socialLinkText}>네이버 연동</Text>
                  </TouchableOpacity>
                )}
                
                {/* Apple 연동 버튼 (iOS만) */}
                {Platform.OS === 'ios' && !userData.authProviders?.some((p: any) => p.providerId === 'apple.com' || p.providerId === 'apple') && (
                  <TouchableOpacity
                    style={styles.socialLinkButton}
                    onPress={() => handleSocialLink('apple.com')}
                  >
                    <Text style={styles.socialLinkIcon}>🍎</Text>
                    <Text style={styles.socialLinkText}>{isForeign ? 'Link Apple' : 'Apple 연동'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* 설정 섹션 */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{isForeign ? 'Settings' : '설정'}</Text>
            </View>
            <TouchableOpacity
              style={styles.settingsMenuItem}
              onPress={() => navigation.navigate('Settings' as any)}
              activeOpacity={0.7}
            >
              <View style={styles.settingsMenuItemContent}>
                <Ionicons name="notifications-outline" size={20} color="#3b82f6" />
                <Text style={styles.settingsMenuItemText}>{isForeign ? 'Notification Settings' : '알림 설정'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
            </TouchableOpacity>
          </View>

          {/* 개인 정보 - 멘토만 표시 (원어민은 Teacher Information에 통합) */}
          {!isForeign && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>개인 정보</Text>
              </View>
              <View style={styles.infoGrid}>
                {userData.age && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>나이</Text>
                    <Text style={styles.infoValue}>{userData.age}세</Text>
                  </View>
                )}
                {userData.gender && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>성별</Text>
                    <Text style={styles.infoValue}>{userData.gender === 'M' ? '남성' : '여성'}</Text>
                  </View>
                )}
                {userData.phoneNumber && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>연락처</Text>
                    <Text style={styles.infoValue}>{formatPhoneNumber(userData.phoneNumber)}</Text>
                  </View>
                )}
                {userData.address && (
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>주소</Text>
                    <Text style={styles.infoValue}>
                      {userData.address}
                      {userData.addressDetail ? ` ${userData.addressDetail}` : ''}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

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

          {/* 개인정보처리방침 / 서비스 이용약관 */}
          <View style={styles.legalButtonsRow}>
            <TouchableOpacity
              style={styles.legalButton}
              onPress={() => navigation.navigate('PrivacyPolicy' as any)}
              activeOpacity={0.7}
            >
              <Ionicons name="shield-checkmark-outline" size={16} color="#64748b" />
              <Text style={styles.legalButtonText}>
                {isForeign ? 'Privacy Policy' : '개인정보처리방침'}
              </Text>
            </TouchableOpacity>
            <View style={styles.legalButtonDivider} />
            <TouchableOpacity
              style={styles.legalButton}
              onPress={() => navigation.navigate('TermsOfService' as any)}
              activeOpacity={0.7}
            >
              <Ionicons name="document-text-outline" size={16} color="#64748b" />
              <Text style={styles.legalButtonText}>
                {isForeign ? 'Terms of Service' : '서비스 이용약관'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 회원 탈퇴 / 로그아웃 */}
          <View style={styles.accountActionsRow}>
            <TouchableOpacity
              style={styles.deactivateButton}
              onPress={() => setShowDeactivateModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="person-remove-outline" size={15} color="#ef4444" />
              <Text style={styles.deactivateButtonText}>{isForeign ? 'Delete Account' : '회원 탈퇴'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={15} color="#ffffff" />
              <Text style={styles.logoutButtonText}>{isForeign ? 'Logout' : '로그아웃'}</Text>
            </TouchableOpacity>
          </View>
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
    case 'mentor-signup-step4':
      return (
        <SignUpStep4Screen
          name={signUpData.name || ''}
          phone={signUpData.phone || ''}
          email={signUpData.email || ''}
          password={signUpData.password || ''}
          university={signUpData.university || ''}
          grade={signUpData.grade || 1}
          isOnLeave={signUpData.isOnLeave || false}
          major1={signUpData.major1 || ''}
          major2={signUpData.major2 || ''}
          onNext={handleMentorSignUpStep4Next}
          onBack={() => setCurrentScreen('mentor-signup-step3')}
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
    case 'social-signup':
      return (
        <SignUpFlow
          role={selectedRole || 'mentor'}
          initialSocialData={signUpData.socialData}
          initialTempUserId={signUpData.tempUserId}
          onComplete={() => {
            Alert.alert(
              '회원가입 완료',
              '환영합니다! 로그인해주세요.',
              [{ text: '확인', onPress: () => setCurrentScreen('signin') }]
            );
          }}
          onCancel={() => setCurrentScreen('signin')}
        />
      );
    case 'signin':
    default:
      return (
        <SignInScreen
          onSignUpPress={() => setCurrentScreen('role-selection')}
          onSignInSuccess={() => setCurrentScreen('profile')}
          onSocialSignUp={handleSocialSignUp}
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
  
  // Admin 뱃지 스타일
  adminBadgesContainer: {
    padding: 16,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  adminBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  adminBadgeActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
  },
  adminBadgeDisabled: {
    opacity: 0.5,
  },
  adminBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  adminBadgeTextActive: {
    color: '#ffffff',
  },
  adminBadgeTemporary: {
    backgroundColor: '#f97316',
    borderColor: '#ea580c',
  },
  adminBadgeTextTemporary: {
    color: '#ffffff',
  },
  tempIndicator: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 8,
    height: 8,
    backgroundColor: '#fbbf24',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ffffff',
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    marginTop: -4,
    marginBottom: 4,
  },
  toggleButtonText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  toggleButtonIcon: {
    fontSize: 10,
    color: '#64748b',
  },
  olderGenerationsContainer: {
    paddingTop: 4,
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
  jobRoleBadge: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
  },
  jobRoleBadgeText: {
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
  
  // 소셜 계정 연동
  socialAccountsContainer: {
    padding: 20,
  },
  socialSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 12,
  },
  socialAccountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    marginBottom: 8,
  },
  socialAccountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  socialAccountIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  socialAccountDetails: {
    flex: 1,
  },
  socialAccountName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  socialAccountEmail: {
    fontSize: 12,
    color: '#64748b',
  },
  socialAccountUnlinkText: {
    fontSize: 12,
    color: '#64748b',
  },
  unlinkButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#fee2e2',
    borderRadius: 6,
  },
  unlinkButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dc2626',
  },
  socialAccountRequiredText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3b82f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
  },
  socialAccountHint: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
  },
  socialLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  socialLinkIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  socialLinkText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  
  // 법적 고지 버튼 (병렬 배치)
  legalButtonsRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginTop: 0,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  legalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  legalButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  legalButtonDivider: {
    width: 1,
    backgroundColor: '#e5e7eb',
  },

  // 설정 섹션 메뉴 아이템
  settingsMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  settingsMenuItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsMenuItemText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1e293b',
  },
  logoutButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 11,
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  
  // 프리페칭 모달 스타일
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 32,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: 8,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 4,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  progressContainer: {
    marginBottom: 24,
  },
  progressBar: {
    height: 12,
    backgroundColor: '#e2e8f0',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3b82f6',
    borderRadius: 6,
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
    textAlign: 'center',
  },
  loadingSteps: {
    gap: 12,
    marginBottom: 8,
  },
  loadingStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingStepTextContainer: {
    flex: 1,
  },
  loadingStepText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  loadingStepTextActive: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  loadingStepTextDone: {
    color: '#10b981',
    fontWeight: '600',
  },
  loadingStepSubtext: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  
  // 프로필 상태/역할 배지 스타일
  profileStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },

  // 회원 탈퇴 버튼 스타일
  accountActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 24,
  },
  deactivateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 8,
    paddingVertical: 11,
  },
  deactivateButtonText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },

  // 회원 탈퇴 모달 스타일
  deactivateModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 10,
  },
  deactivateModalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  deactivateModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  deactivateModalMessage: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  deactivateModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  deactivateModalCancelButton: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  deactivateModalCancelText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  deactivateModalConfirmButton: {
    flex: 1,
    backgroundColor: '#ef4444',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  deactivateModalConfirmButtonDisabled: {
    backgroundColor: '#fca5a5',
  },
  deactivateModalConfirmText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});

// ────────────────────────────────────────────────────────────
// DocRow: Submitted Documents 행 컴포넌트 (보기 + 업로드)
// ────────────────────────────────────────────────────────────
interface DocRowProps {
  label: string;
  hint: string;
  url?: string | null;
  isUploading: boolean;
  isDeleting: boolean;
  accentColor: string;
  uploadedBg: string;
  uploadedBorder: string;
  onView: () => void;
  onUpload: () => void;
  onDelete: () => void;
}

function DocRow({ label, hint, url, isUploading, isDeleting, accentColor, uploadedBg, uploadedBorder, onView, onUpload, onDelete }: DocRowProps) {
  if (isUploading || isDeleting) {
    return (
      <View style={[docStyles.row, { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB' }]}>
        <View style={docStyles.info}>
          <ActivityIndicator size="small" color={isDeleting ? '#EF4444' : accentColor} />
          <View style={{ marginLeft: 10 }}>
            <Text style={[docStyles.label, { color: '#374151' }]}>{label}</Text>
            <Text style={[docStyles.sub, { color: '#6B7280' }]}>{isDeleting ? 'Deleting...' : 'Uploading...'}</Text>
          </View>
        </View>
      </View>
    );
  }

  if (url) {
    return (
      <View style={[docStyles.row, { backgroundColor: uploadedBg, borderColor: uploadedBorder }]}>
        {/* 왼쪽: 파일 정보 */}
        <TouchableOpacity style={docStyles.info} onPress={onView} activeOpacity={0.7}>
          <Ionicons name="document-text-outline" size={20} color={accentColor} />
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={[docStyles.label, { color: accentColor }]}>{label}</Text>
            <Text style={[docStyles.sub, { color: accentColor }]}>Tap to view →</Text>
          </View>
        </TouchableOpacity>
        {/* 오른쪽: 재업로드 + 삭제 버튼 */}
        <TouchableOpacity style={[docStyles.uploadBtn, { borderColor: accentColor }]} onPress={onUpload} activeOpacity={0.7}>
          <Ionicons name="cloud-upload-outline" size={14} color={accentColor} />
          <Text style={[docStyles.uploadBtnText, { color: accentColor }]}>Replace</Text>
        </TouchableOpacity>
        <TouchableOpacity style={docStyles.deleteBtn} onPress={onDelete} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={14} color="#EF4444" />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[docStyles.row, docStyles.rowEmpty]}
      onPress={onUpload}
      activeOpacity={0.7}
    >
      <View style={docStyles.info}>
        <Ionicons name="cloud-upload-outline" size={20} color="#9CA3AF" />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={docStyles.labelEmpty}>{label}</Text>
          <Text style={docStyles.subEmpty}>{hint} · Tap to upload</Text>
        </View>
      </View>
      <View style={docStyles.uploadBadge}>
        <Text style={docStyles.uploadBadgeText}>Upload</Text>
      </View>
    </TouchableOpacity>
  );
}

const docStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  rowEmpty: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  labelEmpty: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  sub: {
    fontSize: 11,
    marginTop: 2,
  },
  subEmpty: {
    fontSize: 11,
    marginTop: 2,
    color: '#9CA3AF',
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    marginLeft: 8,
  },
  uploadBtnText: {
    fontSize: 11,
    fontWeight: '600',
  },
  uploadBadge: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  uploadBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  deleteBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    marginLeft: 6,
  },
});
