'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getUserJobCodesInfo, deactivateUser, getUserById, getUserByEmail, updateUser, signIn, signInWithCustomTokenFromFunction, uploadForeignCV, uploadForeignPassportPhoto, uploadForeignIdCard, uploadForeignBankBook, uploadForeignEslCert, deleteForeignDocUrl } from '@/lib/firebaseService';
import { reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import Layout from '@/components/common/Layout';
import Button from '@/components/common/Button';
import LinkedAccountsDisplay from '@/components/settings/LinkedAccountsDisplay';
import { JobCodeWithId } from '@/types';
import { SocialProvider } from '@smis-mentor/shared';
import { unlinkSocialProvider, getSocialProviderName } from '@smis-mentor/shared';
import toast from 'react-hot-toast';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useCampDataPrefetch } from '@/hooks/useCampDataPrefetch';
import NotificationSettingsCard from '@/components/profile/NotificationSettingsCard';
import LanguageSettingCard from '@/components/profile/LanguageSettingCard';
import { BasicInfoSection, CampProfileSection, RrnSection, AddressSection, EducationSection, ExperienceSection, IntroSection, ReferralSection } from '@/components/profile/ProfileSections';
import { L } from '@smis-mentor/shared';

export default function ProfilePage() {
  const { userData, waitForAuthReady, refreshUserData, updateActiveJobCode } = useAuth();
  const router = useRouter();
  const { prefetchCampData, invalidateCampData } = useCampDataPrefetch();
  const [jobCodes, setJobCodes] = useState<JobCodeWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [showOlderGenerations, setShowOlderGenerations] = useState(false);
  const [changingJobCode, setChangingJobCode] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [prefetchingCamp, setPrefetchingCamp] = useState(false);
  const [prefetchProgress, setPrefetchProgress] = useState(0);
  const [prefetchStage, setPrefetchStage] = useState<'cache' | 'update' | 'data' | 'complete'>('cache');

  // 문서 업로드/삭제 상태
  const [uploadingDoc, setUploadingDoc] = useState<'cv' | 'passport' | 'idCard' | 'bankBook' | 'eslCert' | null>(null);
  const [deletingDoc, setDeletingDoc] = useState<'cv' | 'passport' | 'idCard' | 'bankBook' | 'eslCert' | null>(null);

  useEffect(() => {
    let cancelled = false;
    const checkAuthAndLoadData = async () => {
      try {
        setAuthChecking(true);
        await waitForAuthReady();
        
        // userData가 없으면 한 번만 새로고침 시도 (네이버/카카오 포함)
        if (!userData) {
          await refreshUserData();
        }

        if (!cancelled) setAuthChecking(false);
      } catch (error) {
        console.error('인증 상태 확인 오류:', error);
        if (!cancelled) setAuthChecking(false);
      }
    };

    checkAuthAndLoadData();
    return () => { cancelled = true; };
  // userData를 의존성에서 제거 → refreshUserData 후 userData 변경으로 인한 무한루프 방지
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitForAuthReady, refreshUserData]);

  useEffect(() => {
    const fetchJobCodes = async () => {
      if (userData) {
        try {
          let jobCodesInfo: any[] = [];
          
          // 관리자는 모든 캠프 코드 조회
          if (userData.role === 'admin') {
            const { getAllJobCodes } = await import('@/lib/firebaseService');
            jobCodesInfo = await getAllJobCodes();
          } 
          // 일반 사용자(멘토, 원어민)는 자신의 캠프 코드만 조회
          else if (userData.jobExperiences && userData.jobExperiences.length > 0) {
            jobCodesInfo = await getUserJobCodesInfo(userData.jobExperiences);
          }
          
          // generation 기준으로 정렬 (generation은 문자열이므로 숫자로 변환하여 정렬)
          const sortedJobCodes = [...jobCodesInfo].sort((a, b) => {
            // generation에서 숫자만 추출 (예: "1기" -> 1, "10기" -> 10)
            const genA = parseInt(a.generation.replace(/[^0-9]/g, ''));
            const genB = parseInt(b.generation.replace(/[^0-9]/g, ''));
            return genB - genA; // 내림차순 정렬 (최신 기수가 위로)
          });
          setJobCodes(sortedJobCodes);
        } catch (error) {
          console.error('업무 정보 불러오기 오류:', error);
        }
      }
      setLoading(false);
    };

    if (!authChecking) {
      if (userData) {
        fetchJobCodes();
      } else {
        // authChecking이 끝났는데 userData가 없으면 로딩 해제 (Layout의 requireAuth가 리다이렉트 처리)
        setLoading(false);
      }
    }
  }, [userData, authChecking]);

  const handleJobCodeSelect = async (jobCodeId: string) => {
    if (userData?.activeJobExperienceId === jobCodeId) {
      return;
    }

    const startTime = Date.now();
    const isAdmin = userData?.role === 'admin';

    try {
      setChangingJobCode(true);
      setPrefetchingCamp(true);
      setPrefetchProgress(0);
      setPrefetchStage('cache');
      
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔄 ProfilePage: 캠프 변경 시작');
      console.log(`   현재: ${userData?.activeJobExperienceId}`);
      console.log(`   변경: ${jobCodeId}`);
      console.log(`   관리자 모드: ${isAdmin ? '예 (임시 활성화)' : '아니오'}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // 1. 기존 캐시 무효화 (0% -> 20%)
      console.log('📍 Step 1/3: 기존 캐시 정리 중...');
      const step1Start = Date.now();
      setPrefetchStage('cache');
      await invalidateCampData();
      console.log(`   ✅ 완료 (${((Date.now() - step1Start) / 1000).toFixed(2)}초)`);
      setPrefetchProgress(20);
      
      // 2. 사용자 데이터 업데이트 (20% -> 40%)
      console.log('📍 Step 2/3: 캠프 변경 중...');
      const step2Start = Date.now();
      setPrefetchStage('update');
      
      if (isAdmin) {
        // 관리자는 임시 캠프 활성화 (직무 경험에 추가하지 않음)
        const { adminSetTemporaryCamp } = await import('@smis-mentor/shared');
        const { db } = await import('@/lib/firebase');
        
        await adminSetTemporaryCamp(db, userData.userId, jobCodeId);
        // 프론트엔드 상태도 즉시 업데이트
        await refreshUserData();
      } else {
        // 일반 사용자는 기존 로직 (직무 경험에 추가)
        await updateActiveJobCode(jobCodeId);
      }
      
      console.log(`   ✅ 완료 (${((Date.now() - step2Start) / 1000).toFixed(2)}초)`);
      setPrefetchProgress(40);
      
      // 3. 새 캠프 데이터 프리페칭 (40% -> 100%)
      console.log('📍 Step 3/3: 캠프 데이터 로딩 중...');
      const step3Start = Date.now();
      setPrefetchStage('data');
      
      // 프리페칭 진행률 시뮬레이션
      const progressInterval = setInterval(() => {
        setPrefetchProgress((prev) => {
          if (prev >= 95) {
            clearInterval(progressInterval);
            return 95;
          }
          return prev + 5;
        });
      }, 200);
      
      await prefetchCampData(jobCodeId);
      
      clearInterval(progressInterval);
      console.log(`   ✅ 완료 (${((Date.now() - step3Start) / 1000).toFixed(2)}초)`);
      setPrefetchProgress(100);
      setPrefetchStage('complete');
      
      const totalDuration = Date.now() - startTime;
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('✅ ProfilePage: 모든 프리로딩 완료!');
      console.log(`⏱️  총 소요 시간: ${(totalDuration / 1000).toFixed(2)}초`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      
      // 짧은 딜레이 후 완료 메시지
      setTimeout(() => {
        setPrefetchingCamp(false);
        toast.success(L('misc.campGenerationChanged'));
      }, 500);
      
    } catch (error) {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('❌ ProfilePage: 캠프 변경 실패');
      console.error('💥 에러:', error);
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      toast.error(L('profile.failedToChangeTheCamp'));
      setPrefetchingCamp(false);
    } finally {
      setChangingJobCode(false);
    }
  };

  // 재인증 함수
  const reauthenticateUser = async (password: string): Promise<boolean> => {
    try {
      if (!auth.currentUser || !userData?.email) {
        throw new Error(L('home.userInformationNotFound'));
      }
      
      const credential = EmailAuthProvider.credential(userData.email, password);
      await reauthenticateWithCredential(auth.currentUser, credential);
      console.log('✅ 재인증 성공');
      return true;
    } catch (error: any) {
      console.error('❌ 재인증 실패:', error);
      
      let errorMessage = L('profile.reAuthenticationFailed2');
      if (error.code === 'auth/wrong-password') {
        errorMessage = L('profile.incorrectPassword');
      } else if (error.code === 'auth/invalid-credential') {
        errorMessage = L('profile.invalidCredentials');
      }
      
      toast.error(errorMessage);
      return false;
    }
  };

  // 재인증 프롬프트 표시
  const showReauthPrompt = (): Promise<boolean> => {
    return new Promise((resolve) => {
      const password = window.prompt('보안을 위해 현재 비밀번호를 입력해주세요:');
      
      if (!password) {
        resolve(false);
        return;
      }
      
      reauthenticateUser(password).then(resolve);
    });
  };

  const handleDeactivateAccount = async () => {
    if (!userData) return;
    
    try {
      setDeactivating(true);
      await deactivateUser(userData.userId);
      toast.success(L('misc.yourAccountHasBeenDeleted'));
      
      // 로그아웃 처리
      await signOut(auth);
      
      // 로그인 페이지로 이동
      router.push('/sign-in');
    } catch (error: any) {
      console.error('회원 탈퇴 오류:', error);
      
      // 재인증이 필요한 경우
      if (error.message?.includes('재로그인이 필요합니다') || error.message?.includes('requires-recent-login')) {
        setDeactivating(false); // 로딩 상태 해제
        setShowDeactivateModal(false); // 모달 닫기
        
        if (window.confirm(L('profile.forSecurityYouNeedTo'))) {
          const reauthSuccess = await showReauthPrompt();
          if (reauthSuccess) {
            // 재인증 성공 시 다시 탈퇴 시도
            setShowDeactivateModal(true); // 모달 다시 열기
            await handleDeactivateAccount();
          }
        }
        return;
      }
      
      // 다른 에러의 경우
      let errorMessage = L('misc.anErrorOccurredWhileDeleting');
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setDeactivating(false);
      setShowDeactivateModal(false);
    }
  };

  // 소셜 계정 연동 핸들러
  const handleLink = async (providerId: SocialProvider) => {
    if (!userData?.userId) {
      toast.error(L('home.userInformationNotFound'));
      return;
    }

    // 현재 로그인된 Firebase Auth 사용자 확인
    const currentUser = auth.currentUser;
    if (!currentUser) {
      // ✅ 세션 만료 - 명확한 안내 및 리다이렉트
      toast.error(L('misc.yourSessionHasExpiredPlease'));
      setTimeout(() => {
        router.push('/sign-in?redirect=/profile');
      }, 2000);
      return;
    }
    
    // ✅ 원래 사용자 정보 저장 (구글 팝업으로 세션 변경될 수 있음)
    const originalUserEmail = currentUser.email;
    const originalUserUid = currentUser.uid;
    // 팝업 후 원래 계정으로 복원할 때 서버에 제출할 신원 증명 (원래 세션의 ID token)
    const originalIdToken = await currentUser.getIdToken(true);

    setIsLinking(true);
    try {
      let socialData;
      let credential;
      let tempFirebaseUid: string | null = null; // 서버에서 삭제할 임시 계정 UID

      // 1. 소셜 로그인 팝업 열기
      if (providerId === 'google.com') {
        const { getGoogleCredential } = await import('@/lib/googleAuthService');
        const result = await getGoogleCredential();
        socialData = result.socialData;
        credential = result.credential;
        tempFirebaseUid = result.tempFirebaseUid;

        console.log('🔗 구글 계정 연동:', {
          currentEmail: userData.email,
          googleEmail: socialData.email,
          tempFirebaseUid,
        });
      } else if (providerId === 'naver') {
        // 캐시 무효화 후 네이버 OAuth 진행
        const { removeCache: removeCacheNav, CACHE_STORE: CACHE_STORE_NAV } = await import('@/lib/cacheUtils');
        await removeCacheNav(CACHE_STORE_NAV.USERS, userData.userId);

        const { signInWithNaver } = await import('@/lib/naverAuthService');
        socialData = await signInWithNaver();

        // 네이버는 Firebase Auth 연동 불가 (커스텀 OAuth) → Firestore에만 저장
        const { linkSocialProvider: linkSocialProviderNaver } = await import('@smis-mentor/shared');
        const { arrayUnion: arrayUnionNaver, updateDoc, doc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');

        await linkSocialProviderNaver(
          userData.userId,
          socialData,
          getUserById,
          updateUser as any,
          arrayUnionNaver
        );

        // (구 방식) 임시 비밀번호 생성·저장 제거 — 네이버 재로그인은 서버 검증 Custom Token 으로 처리

        toast.success(L('misc.naverAccountLinkedSuccessfully'));
        await refreshUserData();
        return;
      } else if (providerId === 'apple.com') {
        const { getAppleCredential } = await import('@/lib/appleAuthService');
        const result = await getAppleCredential();
        socialData = result.socialData;
        credential = result.credential;
        tempFirebaseUid = result.tempFirebaseUid;

        console.log('🔗 애플 계정 연동:', {
          currentEmail: userData.email,
          appleEmail: socialData.email,
          appleUserId: socialData.providerUid,
          tempFirebaseUid,
        });
      } else if (providerId === 'kakao') {
        toast.error(L('misc.kakaoLinkingIsComingSoon'));
        return;
      } else {
        toast.error(L('misc.unsupportedSocialProvider'));
        return;
      }

      // 2. 팝업으로 세션이 변경됐으면 원래 계정으로 복원
      //    이때 tempFirebaseUid가 있으면 서버(Admin SDK)에서 임시 계정을 삭제하여
      //    클라이언트 onAuthStateChanged(null) 이벤트를 방지한다.
      const currentUserAfterPopup = auth.currentUser;
      if (currentUserAfterPopup?.uid !== originalUserUid) {
        console.log('⚠️ 팝업으로 세션 변경됨 → 원래 계정으로 복원 필요');

        try {
          console.log('🔑 Custom Token으로 재로그인 (원래 세션 증명 + 임시 계정 서버 삭제)');
          // 임시 팝업 계정은 그 계정의 ID token 으로만 삭제 가능 (현재 세션이 임시 계정)
          let tempIdToken: string | null = null;
          if (tempFirebaseUid && currentUserAfterPopup?.uid === tempFirebaseUid) {
            try { tempIdToken = await currentUserAfterPopup.getIdToken(); } catch { tempIdToken = null; }
          }
          await signInWithCustomTokenFromFunction(
            userData.userId,
            { kind: 'firebase', idToken: originalIdToken },
            tempFirebaseUid && tempIdToken
              ? { deleteAuthUid: { uid: tempFirebaseUid, idToken: tempIdToken } }
              : undefined
          );
          tempFirebaseUid = null; // 서버에서 정리됨(또는 정리 대상 없음)
          console.log('✅ 원래 계정으로 복원 완료');
        } catch (restoreError) {
          console.error('⚠️ 원래 계정 복원 실패 (무시하고 계속):', restoreError);
        }
      }

      // 3. Firebase Auth에 소셜 계정 연동 (Google, Apple)
      if (credential) {
        const { linkWithCredential } = await import('firebase/auth');
        const freshCurrentUser = auth.currentUser;

        console.log('🔗 Firebase Auth 연동 시도:', {
          currentUserUid: freshCurrentUser?.uid,
          originalUserUid,
          providerId,
        });

        if (!freshCurrentUser) {
          console.warn('⚠️ 로그인 상태 아님 (복원 실패) → Firestore에만 저장');
        } else {
          try {
            await linkWithCredential(freshCurrentUser, credential);
            console.log('✅ Firebase Auth 소셜 계정 연동 완료 (통합됨)');
          } catch (authError: any) {
            console.error('❌ Firebase Auth 연동 실패:', authError);

            if (authError.code === 'auth/credential-already-in-use') {
              const providerName = providerId === 'google.com' ? '구글' : '애플';
              console.warn(`⚠️ ${providerName} credential 이미 사용 중 → Firestore에만 저장`);
            } else if (authError.code === 'auth/provider-already-linked') {
              throw new Error(L('misc.thisProviderIsAlreadyLinked'));
            } else if (authError.code === 'auth/email-already-in-use') {
              throw new Error(L('misc.thisEmailIsAlreadyUsed'));
            } else {
              throw authError;
            }
          }
        }
      }

      // 4. 캐시 무효화
      console.log('🗑️ 사용자 캐시 무효화:', userData.userId);
      const { removeCache, CACHE_STORE } = await import('@/lib/cacheUtils');
      await removeCache(CACHE_STORE.USERS, userData.userId);

      // 5. Firestore에 연동 정보 추가 (arrayUnion 사용)
      const { linkSocialProvider } = await import('@smis-mentor/shared');
      const { arrayUnion } = await import('firebase/firestore');

      await linkSocialProvider(
        userData.userId,
        socialData,
        getUserById,
        updateUser as any,
        arrayUnion
      );

      toast.success(L('profile.socialAccountLinkedSuccessfully'));
      
      // 5. 사용자 데이터 새로고침
      await refreshUserData();
    } catch (error: any) {
      console.error('소셜 계정 연동 오류:', error);
      
      let errorMessage = L('misc.anErrorOccurredWhileLinking');
      
      if (error.message === 'POPUP_BLOCKED') {
        errorMessage = L('misc.thePopupWasBlockedAllow');
      } else if (error.message === 'POPUP_CLOSED') {
        errorMessage = L('misc.theLoginWindowWasClosed');
      } else if (error.message?.includes('이미')) {
        errorMessage = error.message;
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = L('misc.forSecurityPleaseLogIn');
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLinking(false);
    }
  };

  // 원어민 문서 업로드 핸들러 (in-place)
  const handleDocUpload = async (
    type: 'cv' | 'passport' | 'idCard' | 'bankBook' | 'eslCert',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!userData || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    // input 초기화 (같은 파일 재선택 허용)
    e.target.value = '';

    const imageTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    const docTypes = [...imageTypes, 'application/pdf'];
    const wordTypes = [...imageTypes, 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

    const allowedTypes = type === 'cv' ? wordTypes : docTypes;
    if (!allowedTypes.includes(file.type)) {
      toast.error(type === 'cv' ? 'Please upload a PDF, Word, or image file.' : 'Please upload a JPEG, PNG, or PDF file.');
      return;
    }

    try {
      setUploadingDoc(type);
      let downloadURL = '';
      const progress = () => {};

      if (type === 'cv') downloadURL = await uploadForeignCV(userData.userId, file, progress);
      else if (type === 'passport') downloadURL = await uploadForeignPassportPhoto(userData.userId, file, progress);
      else if (type === 'idCard') downloadURL = await uploadForeignIdCard(userData.userId, file, progress);
      else if (type === 'bankBook') downloadURL = await uploadForeignBankBook(userData.userId, file, progress);
      else if (type === 'eslCert') downloadURL = await uploadForeignEslCert(userData.userId, file, progress);

      const fieldMap = {
        cv: 'cvUrl',
        passport: 'passportPhotoUrl',
        idCard: 'foreignIdCardUrl',
        bankBook: 'bankBookUrl',
        eslCert: 'eslCertUrl',
      } as const;

      await updateUser(userData.userId, {
        foreignTeacher: {
          ...(userData.foreignTeacher || { firstName: '', lastName: '', countryCode: '' }),
          [fieldMap[type]]: downloadURL,
        },
      });

      await refreshUserData();
      toast.success('Document uploaded successfully.');
    } catch (error) {
      console.error('문서 업로드 오류:', error);
      toast.error('Failed to upload document. Please try again.');
    } finally {
      setUploadingDoc(null);
    }
  };

  // 원어민 문서 삭제 핸들러
  const handleDocDelete = async (
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

    const confirmed = window.confirm(`Are you sure you want to delete the ${labelMap[type]}? This action cannot be undone.`);
    if (!confirmed) return;

    const fieldMap = {
      cv: 'cvUrl',
      passport: 'passportPhotoUrl',
      idCard: 'foreignIdCardUrl',
      bankBook: 'bankBookUrl',
      eslCert: 'eslCertUrl',
    } as const;

    try {
      setDeletingDoc(type);
      await deleteForeignDocUrl(userData.userId, fieldMap[type], url);
      await refreshUserData();
      toast.success(`${labelMap[type]} has been deleted.`);
    } catch (error) {
      console.error('문서 삭제 오류:', error);
      toast.error('Failed to delete document. Please try again.');
    } finally {
      setDeletingDoc(null);
    }
  };

  // 소셜 계정 연동 해제 핸들러
  const handleUnlink = async (providerId: SocialProvider) => {
    console.log('🔓 연동 해제 시작:', {
      providerId,
      userData: userData ? {
        userId: userData.userId,
        email: userData.email,
        authProviders: userData.authProviders?.map(p => p.providerId),
      } : null,
    });

    if (!userData?.userId || !userData?.email) {
      toast.error(L('misc.userInformationNotFoundPlease'));
      return;
    }

    const providerName = getSocialProviderName(providerId);
    
    if (!confirm(L('profile.areYouSureYouWant', { v0: providerName }))) {
      return;
    }

    setIsUnlinking(true);
    try {
      // 1. 캐시 무효화 (최신 데이터 보장)
      console.log('🗑️ 사용자 캐시 무효화:', userData.userId);
      const { removeCache, CACHE_STORE } = await import('@/lib/cacheUtils');
      await removeCache(CACHE_STORE.USERS, userData.userId);
      
      // 2. 이메일로 사용자 재조회
      console.log('📧 이메일로 사용자 재조회:', userData.email);
      const userByEmail = await getUserByEmail(userData.email);
      
      if (!userByEmail) {
        throw new Error(L('home.userInformationNotFound'));
      }
      
      console.log('✅ 이메일로 사용자 발견:', {
        userId: userByEmail.userId,
        authProviders: userByEmail.authProviders?.map((p: any) => p.providerId),
      });

      // 실제 Firestore 문서 ID 사용
      const actualUserId = userByEmail.userId || userByEmail.id;
      
      console.log('📤 unlinkSocialProvider 호출:', {
        actualUserId,
        providerId,
      });

      // ✅ Transaction 함수 생성
      const { doc, runTransaction } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      
      const runTransactionWrapper = async (updateFn: (user: any) => any) => {
        await runTransaction(db, async (transaction) => {
          const userRef = doc(db, 'users', actualUserId);
          const userDoc = await transaction.get(userRef);
          
          if (!userDoc.exists()) {
            throw new Error(L('profile.userDocumentNotFound'));
          }
          
          const latestUserData = userDoc.data();
          const updates = await updateFn(latestUserData);
          
          transaction.update(userRef, updates);
        });
      };

      await unlinkSocialProvider(
        auth,
        providerId,
        actualUserId, // 실제 Firestore 문서 ID 전달
        getUserById,
        updateUser as any,
        runTransactionWrapper // ✅ Transaction 함수 전달 (동시성 안전)
      );
      
      // ✅ 구글/애플 연동 해제 시 Firebase Auth에서 고아 계정 즉시 삭제
      let showSuccessToast = true;
      
      if (providerId === 'google.com' || providerId === 'apple.com') {
        const socialProviderBeforeUnlink = userByEmail.authProviders?.find(
          (p: any) => p.providerId === providerId
        );
        const providerDisplayName = providerId === 'google.com' ? 'Google' : 'Apple';
        
        if (socialProviderBeforeUnlink?.email && socialProviderBeforeUnlink.email !== userData.email) {
          console.log(`🗑️ Firebase Auth 고아 계정 삭제 시도 (${providerDisplayName}):`, socialProviderBeforeUnlink.email);
          
          let restoreIdToken: string | null = null;
          try {
            // ⏳ 로딩 토스트
            toast.loading(L('misc.cleaningUpFirebaseAuthAccount'), { id: 'delete-orphan' });
            
            // 1. 현재 사용자 정보 저장 (+ 복원용 ID token)
            const originalUser = auth.currentUser;
            if (!originalUser) throw new Error(L('misc.noCurrentUser'));
            restoreIdToken = await originalUser.getIdToken(true);
            
            // 2. 소셜 계정으로 임시 로그인
            const { signInWithPopup } = await import('firebase/auth');
            
            if (providerId === 'google.com') {
              const { GoogleAuthProvider } = await import('firebase/auth');
              const googleProvider = new GoogleAuthProvider();
              googleProvider.setCustomParameters({ login_hint: socialProviderBeforeUnlink.email });
              
              const tempResult = await signInWithPopup(auth, googleProvider);
              const tempUser = tempResult.user;
              
              console.log('✅ Google 계정 임시 로그인:', {
                uid: tempUser.uid,
                email: tempUser.email,
              });
              
              // 3. 임시 로그인된 계정 삭제
              await tempUser.delete();
              console.log('✅ Firebase Auth 고아 계정 삭제 완료:', tempUser.email);
            } else if (providerId === 'apple.com') {
              const { OAuthProvider } = await import('firebase/auth');
              const appleProvider = new OAuthProvider('apple.com');
              appleProvider.addScope('email');
              appleProvider.addScope('name');
              appleProvider.setCustomParameters({ login_hint: socialProviderBeforeUnlink.email });
              
              const tempResult = await signInWithPopup(auth, appleProvider);
              const tempUser = tempResult.user;
              
              console.log('✅ Apple 계정 임시 로그인:', {
                uid: tempUser.uid,
                email: tempUser.email,
              });
              
              // 3. 임시 로그인된 계정 삭제
              await tempUser.delete();
              console.log('✅ Firebase Auth 고아 계정 삭제 완료:', tempUser.email);
            }
            
            // 4. 원래 사용자로 다시 로그인 (원래 세션의 ID token 을 증명으로 제출)
            await signInWithCustomTokenFromFunction(userData.userId, { kind: 'firebase', idToken: restoreIdToken });
            console.log('✅ 원래 계정 복원:', userData.email);
            
            toast.dismiss('delete-orphan');
            toast.success(
              L('misc.accountHasBeenFullyUnlinked', { v0: providerDisplayName }) +
              L('misc.itWasAlsoRemovedFrom'),
              { duration: 4000 }
            );
            showSuccessToast = false;
          } catch (deleteError: any) {
            toast.dismiss('delete-orphan');
            console.error(`⚠️ Firebase Auth 고아 계정 삭제 실패 (${providerDisplayName}):`, deleteError);
            
            // 실패 시 원래 계정 복원 시도 (원래 세션의 ID token 으로)
            try {
              if (auth.currentUser?.uid !== userData.userId) {
                if (!restoreIdToken) throw new Error(L('misc.noSessionProofForRestore'));
                await signInWithCustomTokenFromFunction(userData.userId, { kind: 'firebase', idToken: restoreIdToken });
              }
            } catch (restoreError) {
              console.error('⚠️ 원래 계정 복원 실패:', restoreError);
            }
            
            toast(
              L('misc.accountHasBeenUnlinked', { v0: providerDisplayName }) +
              L('misc.inFirebaseAuth', { v0: socialProviderBeforeUnlink.email }) +
              L('misc.isCleanedUpAutomaticallyEvery'),
              { 
                icon: 'ℹ️',
                duration: 5000 
              }
            );
            showSuccessToast = false;
          }
        }
      }
      
      if (showSuccessToast) {
        toast.success(L('profile.v0AccountHasBeenUnlinked', { v0: providerName }));
      }
      
      // 사용자 데이터 새로고침
      await refreshUserData();
    } catch (error: any) {
      console.error('연동 해제 오류:', error);
      toast.error(error.message || L('misc.anErrorOccurredWhileUnlinking'));
    } finally {
      setIsUnlinking(false);
    }
  };

  // 인증 상태 확인 중이면 로딩 표시
  if (authChecking || !userData) {
    return (
      <Layout requireAuth>
        <div className="flex justify-center items-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      </Layout>
    );
  }

  const isForeign = userData.role === 'foreign' || userData.role === 'foreign_temp';

  return (
    <>
      <Layout requireAuth>
      <div className="max-w-2xl mx-auto lg:px-4 px-0">
        {/* 프리페칭 모달 */}
        {prefetchingCamp && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-8 m-4">
              <div className="flex flex-col items-center">
                <div className="mb-4">
                  <svg className="w-16 h-16 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{L('profile.loadingCampData')}</h3>
                <p className="text-gray-600 text-center mb-6">
                  {L('profile.preloadingDataForFasterBrowsing')}
                </p>
                
                {/* 진행률 바 */}
                <div className="w-full mb-4">
                  <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 transition-all duration-300 ease-out"
                      style={{ width: `${prefetchProgress}%` }}
                    />
                  </div>
                  <p className="text-center text-lg font-semibold text-blue-500 mt-2">
                    {prefetchProgress}%
                  </p>
                </div>
                
                {/* 로딩 단계 */}
                <div className="w-full space-y-3">
                  <div className="flex items-center gap-3">
                    {prefetchStage !== 'cache' ? (
                      <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    )}
                    <span className={`text-sm ${prefetchStage === 'cache' ? 'text-blue-600 font-semibold' : (prefetchStage === 'update' || prefetchStage === 'data' || prefetchStage === 'complete') ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                      {L('profile.clearingOldCache')}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {prefetchStage === 'update' ? (
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    ) : (prefetchStage === 'data' || prefetchStage === 'complete') ? (
                      <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />
                    )}
                    <span className={`text-sm ${prefetchStage === 'update' ? 'text-blue-600 font-semibold' : (prefetchStage === 'data' || prefetchStage === 'complete') ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                      {L('profile.changingCamp')}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {prefetchStage === 'data' ? (
                      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    ) : prefetchStage === 'complete' ? (
                      <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <div className="w-5 h-5 border-2 border-gray-300 rounded-full" />
                    )}
                    <span className={`text-sm ${prefetchStage === 'data' ? 'text-blue-600 font-semibold' : prefetchStage === 'complete' ? 'text-green-600 font-semibold' : 'text-gray-400'}`}>
                      {L('profile.loadingCampData2')}
                    </span>
                  </div>
                </div>
                
                <div className="mt-6">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mb-4">
          <h1 className="text-xl sm:text-2xl font-bold">{L('common.myPage')}</h1>
        </div>

        {/* 기본 정보 (사진·이름·연락처) */}
        <BasicInfoSection />

        {/* SMIS 캠프 참여 이력 */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
          <div className="border-b px-4 sm:px-6 py-3">
            <h2 className="text-lg font-semibold">
              {userData.role === 'admin'
                ? L('profile.allCampCodes')
                : L('common.smisCampHistory')}
            </h2>
          </div>
          
          <div className="px-4 sm:px-6 py-4">
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              </div>
            ) : jobCodes.length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                {L('common.noCampHistoryRegisteredCamp')}
              </p>
            ) : userData.role === 'admin' ? (
              // Admin: generation별 뱃지 형태 (27기 이상만 표시, 26기 이하는 더보기)
              <div className="space-y-3">
                {(() => {
                  // generation별로 그룹화
                  const groupedByGeneration = jobCodes.reduce((acc, job) => {
                    const gen = job.generation;
                    if (!acc[gen]) {
                      acc[gen] = [];
                    }
                    acc[gen].push(job);
                    return acc;
                  }, {} as Record<string, typeof jobCodes>);

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
                        <div key={generation} className="flex gap-1.5 flex-wrap">
                          {groupedByGeneration[generation].map((job) => {
                            const isActive = userData?.activeJobExperienceId === job.id;
                            const isTemporary = userData?.role === 'admin' && isActive && (userData as any).adminTempActiveCamp === job.id;
                            
                            return (
                              <button
                                key={job.id}
                                onClick={() => handleJobCodeSelect(job.id as string)}
                                disabled={changingJobCode || isActive}
                                className={`text-xs px-2 py-1 rounded-full font-semibold whitespace-nowrap transition-all relative ${
                                  isActive
                                    ? isTemporary
                                      ? 'bg-orange-500 text-white border border-orange-600 cursor-default'
                                      : 'bg-blue-500 text-white border border-blue-600 cursor-default'
                                    : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 hover:border-gray-400 cursor-pointer'
                                } ${changingJobCode && !isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                                title={isTemporary ? L('misc.temporarilyActivatedNotAddedTo') : undefined}
                              >
                                {job.code}
                                {isTemporary && (
                                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full border border-white"></span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ))}
                      
                      {/* 26기 이하 - 더보기 토글 */}
                      {olderGenerations.length > 0 && (
                        <>
                          <button
                            onClick={() => setShowOlderGenerations(!showOlderGenerations)}
                            className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 transition-colors"
                          >
                            {showOlderGenerations ? (
                              <>
                                <span>{L('profile.collapseCampsUpTo26th')}</span>
                                <span className="text-xs">▲</span>
                              </>
                            ) : (
                              <>
                                <span>{L('profile.showCampsUpTo26th')}</span>
                                <span className="text-xs">▼</span>
                              </>
                            )}
                          </button>
                          
                          {showOlderGenerations && (
                            <div className="space-y-3 pt-1">
                              {olderGenerations.map((generation) => (
                                <div key={generation} className="flex gap-1.5 flex-wrap">
                                  {groupedByGeneration[generation].map((job) => {
                                    const isActive = userData?.activeJobExperienceId === job.id;
                                    const isTemporary = userData?.role === 'admin' && isActive && (userData as any).adminTempActiveCamp === job.id;
                                    
                                    return (
                                      <button
                                        key={job.id}
                                        onClick={() => handleJobCodeSelect(job.id as string)}
                                        disabled={changingJobCode || isActive}
                                        className={`text-xs px-2 py-1 rounded-full font-semibold whitespace-nowrap transition-all relative ${
                                          isActive
                                            ? isTemporary
                                              ? 'bg-orange-500 text-white border border-orange-600 cursor-default'
                                              : 'bg-blue-500 text-white border border-blue-600 cursor-default'
                                            : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 hover:border-gray-400 cursor-pointer'
                                        } ${changingJobCode && !isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                                        title={isTemporary ? L('misc.temporarilyActivatedNotAddedTo') : undefined}
                                      >
                                        {job.code}
                                        {isTemporary && (
                                          <span className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full border border-white"></span>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              // 일반 사용자: 기존 리스트 형태
              <div className="space-y-2">
                {jobCodes.map((job) => {
                  const exp = userData?.jobExperiences?.find(exp => exp.id === job.id);
                  const isActive = userData?.activeJobExperienceId === job.id;
                  return (
                    <button
                      key={job.id as string}
                      onClick={() => handleJobCodeSelect(job.id as string)}
                      disabled={changingJobCode || isActive}
                      className={`w-full flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 py-1.5 px-2.5 rounded-lg transition-all ${
                        isActive 
                          ? 'bg-blue-50 border-2 border-blue-200 cursor-default' 
                          : 'border border-gray-200 hover:bg-gray-50 hover:border-gray-300 cursor-pointer'
                      } ${changingJobCode && !isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="hidden sm:block flex-shrink-0 min-w-0 font-medium text-gray-900 text-sm">
                        {job.generation} {job.name}
                      </div>
                      {/* 모바일: 양쪽 정렬로 활성 뱃지 오른쪽 */}
                      <div className="flex justify-between sm:hidden items-center gap-x-1.5 flex-wrap">
                        <div className="flex gap-x-1.5 flex-wrap">
                          {job.code && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-300 font-semibold">
                              {job.code}
                            </span>
                          )}
                          {exp?.groupRole && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-300">
                              {exp.groupRole}
                            </span>
                          )}
                          {exp?.classCode && (
                            <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 font-semibold">
                              {exp.classCode}
                            </span>
                          )}
                        </div>
                        {isActive && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-blue-500 text-white font-semibold flex-shrink-0">
                            {L('common.active')}
                          </span>
                        )}
                      </div>
                      {/* 데스크탑: 활성 뱃지 맨 앞 */}
                      <div className="hidden sm:flex items-center gap-x-1.5 flex-wrap">
                        {isActive && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-500 text-white font-semibold flex-shrink-0">
                            {L('common.active')}
                          </span>
                        )}
                        {job.code && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-300 font-semibold">
                            {job.code}
                          </span>
                        )}
                        {exp?.groupRole && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-300">
                            {exp.groupRole}
                          </span>
                        )}
                        {exp?.classCode && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 font-semibold">
                            {exp.classCode}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 캠프 참가 정보 (캠프 코드가 있는 멘토·원어민) */}
        <CampProfileSection />

        {/* 원어민 주소 */}
        {isForeign && <AddressSection />}

        {/* 원어민 제출 서류 (in-place 업로드) */}
        {isForeign && userData.foreignTeacher && (
          <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
            <div className="border-b px-4 sm:px-6 py-3">
              <h2 className="text-lg font-semibold">Submitted Documents</h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              {(
                [
                  { type: 'cv', label: 'CV (Curriculum Vitae)', hint: 'PDF / Word', url: userData.foreignTeacher.cvUrl, accept: '.pdf,.doc,.docx,image/jpeg,image/png', accent: 'indigo' },
                  { type: 'passport', label: 'Passport Photo', hint: 'JPG / PNG', url: userData.foreignTeacher.passportPhotoUrl, accept: 'image/jpeg,image/png', accent: 'green' },
                  { type: 'idCard', label: 'Foreign Resident ID Card', hint: 'JPG / PNG / PDF', url: userData.foreignTeacher.foreignIdCardUrl, accept: 'image/jpeg,image/png,application/pdf', accent: 'amber' },
                  { type: 'bankBook', label: L('profile.bankBook'), hint: 'JPG / PNG / PDF', url: userData.foreignTeacher.bankBookUrl, accept: 'image/jpeg,image/png,application/pdf', accent: 'teal' },
                  { type: 'eslCert', label: 'ESL Certificate (TESOL/TEFL/CELTA)', hint: 'JPG / PNG / PDF', url: userData.foreignTeacher.eslCertUrl, accept: 'image/jpeg,image/png,application/pdf', accent: 'violet' },
                ] as const
              ).map(({ type, label, hint, url, accept, accent }) => {
                const isUploading = uploadingDoc === type;
                const colorMap = {
                  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', hover: 'hover:bg-indigo-100', text: 'text-indigo-900', sub: 'text-indigo-600', btnBg: 'bg-indigo-500 hover:bg-indigo-600', emptyBorder: 'border-indigo-300', emptyText: 'text-indigo-500' },
                  green:  { bg: 'bg-green-50',  border: 'border-green-200',  hover: 'hover:bg-green-100',  text: 'text-green-900',  sub: 'text-green-600',  btnBg: 'bg-green-500 hover:bg-green-600',  emptyBorder: 'border-green-300',  emptyText: 'text-green-500' },
                  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  hover: 'hover:bg-amber-100',  text: 'text-amber-900',  sub: 'text-amber-600',  btnBg: 'bg-amber-500 hover:bg-amber-600',  emptyBorder: 'border-amber-300',  emptyText: 'text-amber-500' },
                  teal:   { bg: 'bg-teal-50',   border: 'border-teal-200',   hover: 'hover:bg-teal-100',   text: 'text-teal-900',   sub: 'text-teal-600',   btnBg: 'bg-teal-500 hover:bg-teal-600',   emptyBorder: 'border-teal-300',   emptyText: 'text-teal-500' },
                  violet: { bg: 'bg-violet-50', border: 'border-violet-200', hover: 'hover:bg-violet-100', text: 'text-violet-900', sub: 'text-violet-600', btnBg: 'bg-violet-500 hover:bg-violet-600', emptyBorder: 'border-violet-300', emptyText: 'text-violet-500' },
                } as const;
                const c = colorMap[accent];

                const isDeleting = deletingDoc === type;

                if (isUploading || isDeleting) {
                  return (
                    <div key={type} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-blue-500 flex-shrink-0"></div>
                      <div className="flex-grow">
                        <p className="text-sm font-medium text-gray-700">{label}</p>
                        <p className="text-xs text-gray-500">{isDeleting ? 'Deleting...' : 'Uploading...'}</p>
                      </div>
                    </div>
                  );
                }

                if (url) {
                  return (
                    <div key={type} className={`flex items-center gap-3 p-3 ${c.bg} ${c.border} border rounded-lg`}>
                      <a href={url} target="_blank" rel="noopener noreferrer" className={`flex-grow flex items-center gap-2 min-w-0 ${c.hover} rounded transition-colors`}>
                        <div className="min-w-0">
                          <p className={`text-sm font-medium ${c.text}`}>{label}</p>
                          <p className={`text-xs ${c.sub}`}>Click to view →</p>
                        </div>
                      </a>
                      <label className={`cursor-pointer flex-shrink-0 px-3 py-1.5 ${c.btnBg} text-white text-xs font-medium rounded-md transition-colors`}>
                        Replace
                        <input type="file" accept={accept} onChange={(e) => handleDocUpload(type, e)} disabled={!!(uploadingDoc || deletingDoc)} className="hidden" />
                      </label>
                      <button
                        onClick={() => handleDocDelete(type, url)}
                        disabled={!!(uploadingDoc || deletingDoc)}
                        className="flex-shrink-0 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-md border border-red-200 transition-colors disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  );
                }

                return (
                  <label key={type} className={`flex items-center gap-3 p-3 bg-gray-50 border border-dashed ${c.emptyBorder} rounded-lg cursor-pointer hover:bg-gray-100 transition-colors`}>
                    <div className="flex-grow">
                      <p className={`text-sm font-medium ${c.emptyText}`}>{label}</p>
                      <p className="text-xs text-gray-400">{hint} · Click to upload</p>
                    </div>
                    <span className="flex-shrink-0 px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs font-medium rounded-md transition-colors">Upload</span>
                    <input type="file" accept={accept} onChange={(e) => handleDocUpload(type, e)} disabled={!!uploadingDoc} className="hidden" />
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* 멘토 — 섹션별 제자리 수정 */}
        {!isForeign && (
          <>
            <RrnSection />
            <AddressSection />
            <EducationSection />
            <ExperienceSection />
            <IntroSection />
            <ReferralSection />
          </>
        )}

        {/* 소셜 계정 연동 관리 */}
        {userData.authProviders && userData.authProviders.length > 0 ? (
          <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
            <div className="px-4 sm:px-6 py-4">
              <LinkedAccountsDisplay
                authProviders={userData.authProviders}
                onUnlink={handleUnlink}
                onLink={handleLink}
                isUnlinking={isUnlinking}
                isLinking={isLinking}
                isForeign={isForeign}
              />
            </div>
          </div>
        ) : (
          <div className="bg-white shadow-md rounded-lg overflow-hidden mb-6">
            <div className="px-4 sm:px-6 py-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                {L('common.linkedAccounts')}
              </h3>
              <p className="text-sm text-gray-500">
                {L('misc.noLinkedSocialAccounts')}
              </p>
            </div>
          </div>
        )}

        {/* 알림 설정 섹션 */}
        <LanguageSettingCard />
        <NotificationSettingsCard />

        {/* 회원 탈퇴 섹션 */}
        <div className="mt-8 mb-12 text-center">
          <button
            onClick={() => setShowDeactivateModal(true)}
            className="text-red-500 text-sm underline hover:text-red-700"
          >
            {L('common.deleteAccount')}
          </button>
        </div>
        </div>
      </Layout>
      
      {/* 회원 탈퇴 확인 모달 */}
      {showDeactivateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              {L('common.confirmAccountDeletion')}
            </h3>
            <p className="text-gray-700 mb-4">
              {L('misc.areYouSureYouWant')}
            </p>
            <p className="text-gray-700 mb-6 text-sm">
              {L('misc.ifNecessaryYouCanRecover')}
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowDeactivateModal(false)}
                disabled={deactivating}
              >
                {L('common.cancel')}
              </Button>
              <Button
                variant="danger"
                onClick={handleDeactivateAccount}
                isLoading={deactivating}
              >
                {L('common.delete2')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
