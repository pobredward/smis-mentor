import React, { useState } from 'react';
import { logger } from '@smis-mentor/shared';
import { Alert, ActivityIndicator, View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SignUpStep1Screen } from './SignUpStep1Screen';
import { SignUpStep2Screen } from './SignUpStep2Screen';
import { SignUpStep3Screen } from './SignUpStep3Screen';
import { SignUpStep4Screen } from './SignUpStep4Screen';
import type { SocialUserData, SignUpState } from '@smis-mentor/shared';
import { signUp, updateUser, persistLoginRememberEmail, getUserById, getUserByEmailIncludeInactive } from '../services/authService';
import { doc, setDoc, deleteDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';

interface SignUpFlowProps {
  role: 'mentor' | 'foreign';
  initialSocialData?: SocialUserData;
  initialTempUserId?: string;
  onComplete: () => void;
  onCancel: () => void;
}

export function SignUpFlow({
  role,
  initialSocialData,
  initialTempUserId,
  onComplete,
  onCancel,
}: SignUpFlowProps) {
  const socialHasIdentity = !!initialSocialData && !!initialSocialData.name && !!initialSocialData.phone;

  // 소셜 가입 시 이름+전화번호가 이미 확인됨 → step 1 건너뛰기
  // mentor: step 3(학력)부터, foreign: step 5(Account & Documents 확인)로 바로 이동
  const getInitialStep = () => {
    if (!socialHasIdentity) return 1;
    if (role === 'mentor') return 3;
    if (role === 'foreign') return 5; // Account & Documents 확인 화면
    return 1;
  };

  const [step, setStep] = useState(getInitialStep);
  const [signUpData, setSignUpData] = useState<SignUpState>({
    name: initialSocialData?.name || '',
    phone: initialSocialData?.phone || '',
    isSocialSignUp: !!initialSocialData,
    socialData: initialSocialData,
    tempUserId: initialTempUserId,
    // ForeignPhoneInputModal에서 전달된 foreignTeacher 정보 초기화
    foreignTeacher: (initialSocialData as any)?.foreignTeacher,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Step 1 완료: 이름 + 전화번호
   */
  const handleStep1Complete = (data: { 
    name: string; 
    phone: string;
    tempUserId?: string;
  }) => {
    const updatedData: SignUpState = {
      ...signUpData,
      name: data.name,
      phone: data.phone,
      tempUserId: data.tempUserId || signUpData.tempUserId,
    };
    setSignUpData(updatedData);

    if (signUpData.isSocialSignUp) {
      if (role === 'foreign') {
        // 원어민 소셜 가입: Account & Documents 확인 화면(step 5)으로
        setStep(5);
      } else {
        // 멘토 소셜 가입: Step 3(학력 정보)으로
        setStep(3);
      }
    } else {
      setStep(2);
    }
  };

  /**
   * 원어민 소셜 가입 Account & Documents 확인 후 최종 완료 처리 (웹의 /account 페이지와 동일)
   */
  const completeForeignSocialSignUp = async (data: SignUpState) => {
    setIsSubmitting(true);
    try {
      await handleSocialSignUp(data);

      const rememberEmail = data.email?.trim() || data.socialData?.email?.trim();
      if (rememberEmail) {
        await persistLoginRememberEmail(rememberEmail);
      }

      const { auth: firebaseAuth } = await import('../config/firebase');

      if (firebaseAuth.currentUser) {
        // Google/Apple: signInWithCredential로 로그인됨
        // 네이버: signUp(임시 비번)으로 createUserWithEmailAndPassword 후 자동 로그인됨
        Alert.alert(
          '회원가입 완료',
          '환영합니다! SMIS Mentor에 오신 걸 환영합니다.',
          [{ text: '확인', onPress: onComplete }]
        );
      } else {
        // 예외 케이스: Auth 세션 없음 → 로그인 안내
        Alert.alert(
          '회원가입 완료',
          '회원가입이 완료되었습니다. 로그인해주세요.',
          [{ text: '확인', onPress: onComplete }]
        );
      }
    } catch (error: any) {
      logger.error('원어민 소셜 회원가입 실패:', error);
      Alert.alert('오류', error.message || '회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Step 2 완료: 이메일 + 비밀번호 (일반 회원가입만)
   */
  const handleStep2Complete = (data: { email: string; password: string }) => {
    setSignUpData(prev => ({ ...prev, ...data }));
    setStep(3);
  };

  /**
   * Step 3 완료: 교육 정보 → step 4(상세정보)로 이동
   */
  const handleStep3Complete = (data: {
    university: string;
    grade: number;
    isOnLeave: boolean | null;
    major1: string;
    major2?: string;
  }) => {
    setSignUpData(prev => ({ ...prev, ...data }));
    // 소셜/일반 가입 모두 step 4(상세정보)로 이동
    setStep(4);
  };

  /**
   * Step 4 완료: 상세 정보 (주소, 주민번호, 가입경로) → 회원가입 완료
   */
  const handleStep4Complete = async (data: {
    address: string;
    addressDetail: string;
    rrnFront: string;
    rrnLast: string;
    gender: 'M' | 'F';
    referralPath: string;
    referrerName?: string;
    otherReferralDetail?: string;
    agreedPersonal: boolean;
    geocode?: any;
  }) => {
    const finalData = { ...signUpData, ...data };
    setSignUpData(finalData);

    setIsSubmitting(true);
    try {
      if (finalData.isSocialSignUp && finalData.socialData) {
        await handleSocialSignUp(finalData);
      } else {
        await handleNormalSignUp(finalData);
      }

      const rememberEmail =
        finalData.email?.trim() || finalData.socialData?.email?.trim();
      if (rememberEmail) {
        await persistLoginRememberEmail(rememberEmail);
      }

      if (finalData.isSocialSignUp && finalData.socialData) {
        const { auth: firebaseAuth } = await import('../config/firebase');

        if (firebaseAuth.currentUser) {
          // Google/Apple: signInWithCredential로 로그인됨
          // 네이버: signUp(임시 비번)으로 createUserWithEmailAndPassword 후 자동 로그인됨
          logger.info('✅ 소셜 회원가입 완료 - Firebase Auth 로그인 확인됨');
          Alert.alert(
            '회원가입 완료',
            '환영합니다! SMIS Mentor에 오신 걸 환영합니다.',
            [{ text: '확인', onPress: onComplete }]
          );
        } else {
          // 예외 케이스: Auth 세션 없음 → 로그인 안내
          Alert.alert(
            '회원가입 완료',
            '회원가입이 완료되었습니다. 로그인해주세요.',
            [{ text: '확인', onPress: onComplete }]
          );
        }
      } else {
        Alert.alert(
          '회원가입 완료',
          '환영합니다! 로그인해주세요.',
          [{ text: '확인', onPress: onComplete }]
        );
      }
    } catch (error: any) {
      logger.error('회원가입 실패:', error);
      Alert.alert('오류', error.message || '회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * 이전 단계로
   */
  const handleBack = () => {
    if (step === 1) {
      onCancel();
    } else if (step === 5 && role === 'foreign' && socialHasIdentity) {
      // foreign 소셜 가입: Account 확인 화면(step 5)에서 뒤로 → 취소
      onCancel();
    } else if (step === 3 && signUpData.isSocialSignUp && socialHasIdentity) {
      // 멘토 소셜 가입: Step 3이 첫 화면이면 취소
      onCancel();
    } else if (step === 4 && signUpData.isSocialSignUp && socialHasIdentity && role === 'mentor') {
      // 멘토 소셜 가입: Step 4(상세정보)에서 뒤로 → Step 3(교육정보)
      setStep(3);
    } else {
      setStep(step - 1);
    }
  };

  /**
   * 소셜 회원가입 처리
   */
  const handleSocialSignUp = async (data: SignUpState) => {
    const {
      socialData, tempUserId, phone, name,
      university, grade, isOnLeave, major1, major2, foreignTeacher,
      address, addressDetail, rrnFront, rrnLast, gender,
      referralPath, referrerName, otherReferralDetail, agreedPersonal, geocode,
    } = data;

    if (!socialData) {
      throw new Error('소셜 로그인 데이터가 없습니다');
    }

    if (tempUserId) {
      // temp 계정 활성화: 웹과 동일하게 새 Auth UID로 문서 생성 후 기존 temp 삭제
      // (Firestore Rules: request.auth.uid == userId 조건 충족을 위해 새 문서 생성 필요)
      logger.info('✅ temp 계정 활성화 시작 (새 UID 패턴):', tempUserId);

      const { auth: firebaseAuth } = await import('../config/firebase');
      const credential = (socialData as any)._credential;

      if (credential) {
        // Google/Apple: credential로 Firebase Auth 로그인
        const { signInWithCredential } = await import('firebase/auth');
        if (!firebaseAuth.currentUser) {
          try {
            const userCred = await signInWithCredential(firebaseAuth, credential);
            logger.info('✅ Firebase Auth signInWithCredential 완료 (temp 활성화):', userCred.user.uid);
          } catch (credError: any) {
            logger.warn('⚠️ signInWithCredential 실패:', credError.message);
          }
        }
      } else {
        // 네이버: 임시 비밀번호로 Firebase Auth 계정 신규 생성 (웹과 동일)
        logger.info('🔑 네이버 temp 활성화: 임시 비밀번호로 Firebase Auth 계정 생성');
        if (!firebaseAuth.currentUser) {
          try {
            const tempPw = `${socialData.email}_${Date.now()}_${Math.random().toString(36)}`;
            const userCred = await signUp(socialData.email, tempPw);
            (socialData as any).firebaseAuthUid = userCred.user.uid;
            logger.info('✅ 네이버 Firebase Auth 계정 생성 완료 (temp 활성화):', userCred.user.uid);
          } catch (createError: any) {
            if (createError.code === 'auth/email-already-in-use') {
              logger.warn('⚠️ 네이버 temp 활성화: 이메일 이미 사용 중');
              throw new Error('이미 가입된 이메일입니다. 로그인 화면에서 로그인해주세요.');
            }
            logger.error('❌ 네이버 Firebase Auth 계정 생성 실패 (temp 활성화):', createError.message);
            throw new Error('Firebase 인증에 실패했습니다. 다시 시도해주세요.');
          }
        }
      }

      const newUserId = firebaseAuth.currentUser?.uid || socialData.firebaseAuthUid;
      if (!newUserId) {
        throw new Error('Firebase Auth 로그인이 필요합니다. 다시 시도해주세요.');
      }

      // 기존 temp 문서에서 필요한 정보 가져오기
      const tempUserData = await getUserById(tempUserId);

      // Apple 임시 이메일 처리: 기존 temp 계정 이메일 유지
      let finalEmail = socialData.email;
      if (socialData.email.includes('@privaterelay.appleid.com') && tempUserData?.email && !tempUserData.email.includes('@privaterelay.appleid.com')) {
        finalEmail = tempUserData.email;
        logger.info('✅ Apple 임시 이메일 → temp 계정 이메일 사용:', finalEmail);
      }

      // providerId 정규화
      const normalizedProviderId = socialData.providerId === 'naver' || socialData.providerId === 'kakao'
        ? socialData.providerId
        : socialData.providerId.includes('.com')
          ? socialData.providerId
          : `${socialData.providerId}.com`;

      // 새 Auth UID로 Firestore 문서 생성
      // foreign 소셜 가입: role='foreign' + status='active' (일반 가입과 동일)
      // mentor 소셜 가입: role='mentor_temp' + status='active' (학교 검토 후 승격)
      await setDoc(doc(db, 'users', newUserId), {
        userId: newUserId,
        id: newUserId,
        email: finalEmail,
        name: tempUserData?.name || name,
        phone: phone || tempUserData?.phone || '',
        phoneNumber: phone || tempUserData?.phone || '',
        // 역할별 전용 필드 분리 (undefined → Firestore 오류 방지)
        ...(role !== 'foreign' && {
          university: university ?? '',
          grade: grade ?? 0,
          isOnLeave: isOnLeave ?? null,
          major1: major1 ?? '',
          major2: major2 ?? '',
          address: address ?? '',
          addressDetail: addressDetail ?? '',
          rrnFront: rrnFront ?? '',
          rrnLast: rrnLast ?? '',
          gender: gender ?? 'M',
          referralPath: referralPath ?? '',
          ...(referrerName && { referrerName }),
          ...(otherReferralDetail && { otherReferralDetail }),
          agreedPersonal: agreedPersonal ?? false,
          ...(geocode && { geocode }),
        }),
        ...(role === 'foreign' && {
          jobMotivation: 'Foreign Teacher Application',
          foreignTeacher: {
            firstName: foreignTeacher?.firstName ?? '',
            lastName: foreignTeacher?.lastName ?? '',
            middleName: foreignTeacher?.middleName ?? '',
            countryCode: foreignTeacher?.countryCode ?? '',
            cvUrl: (tempUserData as any)?.foreignTeacher?.cvUrl ?? '',
            passportPhotoUrl: (tempUserData as any)?.foreignTeacher?.passportPhotoUrl ?? '',
            foreignIdCardUrl: (tempUserData as any)?.foreignTeacher?.foreignIdCardUrl ?? '',
            applicationDate: Timestamp.now(),
          },
        }),
        role: role === 'foreign' ? 'foreign' : 'mentor_temp',
        status: 'active',
        agreedTerms: true,
        agreedPersonal: agreedPersonal ?? true,
        profileImage: socialData.photoURL || tempUserData?.profileImage || '',
        selfIntroduction: (tempUserData as any)?.selfIntroduction || '',
        feedback: (tempUserData as any)?.feedback || '',
        jobExperiences: (tempUserData as any)?.jobExperiences || [],
        authProviders: [
          {
            providerId: normalizedProviderId,
            uid: socialData.providerUid,
            email: finalEmail,
            linkedAt: Timestamp.now(),
            ...(socialData.name && { displayName: socialData.name }),
            ...(socialData.photoURL && { photoURL: socialData.photoURL }),
          },
        ],
        primaryAuthMethod: 'social',
        createdAt: tempUserData?.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      logger.info('✅ 새 Auth UID로 문서 생성 완료:', newUserId);

      // 기존 temp 문서 삭제 (새 문서가 생성된 이후에 삭제)
      if (newUserId !== tempUserId) {
        await deleteDoc(doc(db, 'users', tempUserId));
        logger.info('🗑️ 기존 temp 문서 삭제 완료:', tempUserId);
      }

      // 탈퇴(inactive) 계정이 동일 이메일로 존재하면 이메일 마스킹
      try {
        const inactiveUser = await getUserByEmailIncludeInactive(finalEmail);
        if (inactiveUser && inactiveUser.userId !== newUserId) {
          await updateDoc(doc(db, 'users', inactiveUser.userId), {
            email: `rejoined_${Date.now()}_${finalEmail}`,
          });
          logger.info('✅ 기존 탈퇴 계정 이메일 마스킹 완료:', inactiveUser.userId);
        }
      } catch (cleanupError) {
        logger.warn('⚠️ 기존 탈퇴 계정 정리 실패 (가입은 완료됨):', cleanupError);
      }
    } else {
      // 완전히 새로운 소셜 계정 생성
      logger.info('✅ 새 소셜 계정 생성');
      
      // ✅ Apple 임시 이메일로 신규 가입 불가
      if (socialData.email.includes('@privaterelay.appleid.com')) {
        throw new Error(
          'Apple 재로그인 감지: Apple 설정에서 SMIS Mentor 앱 연동을 삭제한 후 다시 시도하세요.\n' +
          '설정 > Apple ID > 암호 및 보안 > Apple로 로그인을 사용하는 앱'
        );
      }
      
      // Firebase Auth UID를 Firestore document ID로 사용 (일관성 보장)
      const { auth: firebaseAuth } = await import('../config/firebase');
      const credential = (socialData as any)._credential;

      if (credential) {
        // Google/Apple: credential로 Firebase Auth 로그인
        const { signInWithCredential } = await import('firebase/auth');
        if (!firebaseAuth.currentUser) {
          try {
            const userCred = await signInWithCredential(firebaseAuth, credential);
            logger.info('✅ Firebase Auth signInWithCredential 완료 (회원가입 직전):', userCred.user.uid);
          } catch (credError: any) {
            logger.warn('⚠️ signInWithCredential 실패:', credError.message);
          }
        }
      } else {
        // 네이버 등 credential 없는 경우: 임시 비밀번호로 Firebase Auth 계정 신규 생성
        // (웹과 동일한 방식: createUserWithEmailAndPassword → UID 확보 → setDoc)
        logger.info('🔑 네이버 신규 가입: 임시 비밀번호로 Firebase Auth 계정 생성');
        if (!firebaseAuth.currentUser) {
          try {
            const tempPw = `${socialData.email}_${Date.now()}_${Math.random().toString(36)}`;
            const userCred = await signUp(socialData.email, tempPw);
            (socialData as any).firebaseAuthUid = userCred.user.uid;
            logger.info('✅ 네이버 Firebase Auth 계정 생성 완료:', userCred.user.uid);
          } catch (createError: any) {
            if (createError.code === 'auth/email-already-in-use') {
              // 이미 Firebase Auth 계정이 있는 경우 → signIn으로 처리 불가
              // Firestore에서 기존 계정 조회가 필요한 케이스 (재가입 시나리오)
              logger.warn('⚠️ 네이버 가입: 이메일 이미 사용 중 (기존 Auth 계정 존재)');
              throw new Error('이미 가입된 이메일입니다. 로그인 화면에서 로그인해주세요.');
            }
            logger.error('❌ 네이버 Firebase Auth 계정 생성 실패:', createError.message);
            throw new Error('Firebase 인증에 실패했습니다. 다시 시도해주세요.');
          }
        }
      }
      
      const currentFirebaseUser = firebaseAuth.currentUser;
      const userId = currentFirebaseUser?.uid || socialData.firebaseAuthUid || socialData.providerUid;
      
      if (!userId) {
        throw new Error('Firebase Auth 로그인이 필요합니다. 다시 시도해주세요.');
      }
      
      logger.info('✅ 소셜 회원가입 userId 결정:', {
        currentUserUid: currentFirebaseUser?.uid,
        firebaseAuthUid: socialData.firebaseAuthUid,
        providerUid: socialData.providerUid,
        finalUserId: userId,
      });
      
      // providerId 정규화: 네이버/카카오는 .com 없이, 구글/애플은 .com 포함
      const normalizedProviderId = socialData.providerId === 'naver' || socialData.providerId === 'kakao'
        ? socialData.providerId
        : socialData.providerId.includes('.com') 
          ? socialData.providerId 
          : `${socialData.providerId}.com`;
      
      // foreign 소셜 가입: role='foreign' + status='active' (일반 가입과 동일)
      // mentor 소셜 가입: role='mentor_temp' + status='active' (학교 검토 후 승격)
      await setDoc(doc(db, 'users', userId), {
        userId,
        id: userId,
        email: socialData.email.toLowerCase(),
        name,
        phone,
        phoneNumber: phone,
        // 역할별 전용 필드 분리 (undefined → Firestore 오류 방지)
        ...(role !== 'foreign' && {
          university: university ?? '',
          grade: grade ?? 0,
          isOnLeave: isOnLeave ?? null,
          major1: major1 ?? '',
          major2: major2 ?? '',
          address: address ?? '',
          addressDetail: addressDetail ?? '',
          rrnFront: rrnFront ?? '',
          rrnLast: rrnLast ?? '',
          gender: gender ?? 'M',
          referralPath: referralPath ?? '',
          ...(referrerName && { referrerName }),
          ...(otherReferralDetail && { otherReferralDetail }),
          agreedPersonal: agreedPersonal ?? false,
          ...(geocode && { geocode }),
        }),
        ...(role === 'foreign' && {
          jobMotivation: 'Foreign Teacher Application',
          foreignTeacher: {
            firstName: foreignTeacher?.firstName ?? '',
            lastName: foreignTeacher?.lastName ?? '',
            middleName: foreignTeacher?.middleName ?? '',
            countryCode: foreignTeacher?.countryCode ?? '',
            cvUrl: '',
            passportPhotoUrl: '',
            foreignIdCardUrl: '',
            applicationDate: Timestamp.now(),
          },
        }),
        role: role === 'foreign' ? 'foreign' : 'mentor_temp',
        status: 'active',
        agreedTerms: true,
        agreedPersonal: agreedPersonal ?? (role === 'foreign' ? true : false),
        profileImage: socialData.photoURL || '',
        authProviders: [
          {
            providerId: normalizedProviderId,
            uid: socialData.providerUid,
            email: socialData.email,
            linkedAt: Timestamp.now(),
            ...(socialData.name && { displayName: socialData.name }),
            ...(socialData.photoURL && { photoURL: socialData.photoURL }),
          },
        ],
        primaryAuthMethod: 'social',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      
      logger.info('✅ Firestore 사용자 문서 생성 완료:', userId);

      // 탈퇴(inactive) 계정이 동일 이메일로 존재하면 이메일 마스킹
      try {
        const inactiveUser = await getUserByEmailIncludeInactive(socialData.email);
        if (inactiveUser && inactiveUser.userId !== userId) {
          await updateDoc(doc(db, 'users', inactiveUser.userId), {
            email: `rejoined_${Date.now()}_${socialData.email}`,
          });
          logger.info('✅ 기존 탈퇴 계정 이메일 마스킹 완료:', inactiveUser.userId);
        }
      } catch (cleanupError) {
        logger.warn('⚠️ 기존 탈퇴 계정 정리 실패 (가입은 완료됨):', cleanupError);
      }
    }
  };

  /**
   * 일반 회원가입 처리
   */
  const handleNormalSignUp = async (data: SignUpState) => {
    const {
      email, password, phone, name,
      university, grade, isOnLeave, major1, major2,
      address, addressDetail, rrnFront, rrnLast, gender,
      referralPath, referrerName, otherReferralDetail, agreedPersonal, geocode,
    } = data;

    if (!email || !password) {
      throw new Error('이메일과 비밀번호가 필요합니다');
    }

    // 1. Firebase Auth 계정 생성
    const userCredential = await signUp(email, password);
    const userId = userCredential.user.uid;

    // 2. Firestore에 사용자 정보 저장
    await setDoc(doc(db, 'users', userId), {
      userId,
      email: email.toLowerCase(),
      name,
      phone,
      university,
      grade,
      isOnLeave,
      major1,
      major2,
      address: address ?? '',
      addressDetail: addressDetail ?? '',
      rrnFront: rrnFront ?? '',
      rrnLast: rrnLast ?? '',
      gender: gender ?? 'M',
      referralPath: referralPath ?? '',
      ...(referrerName && { referrerName }),
      ...(otherReferralDetail && { otherReferralDetail }),
      agreedPersonal: agreedPersonal ?? false,
      ...(geocode && { geocode }),
      role: role === 'foreign' ? 'foreign' : 'mentor_temp',
      status: 'active',
      agreedTerms: true,
      profileImage: '',
      authProviders: [
        {
          providerId: 'password',
          uid: userId,
          email,
          linkedAt: Timestamp.now(),
        },
      ],
      primaryAuthMethod: 'email',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  };

  if (isSubmitting) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  // Step별 렌더링
  switch (step) {
    case 1:
      return (
        <SignUpStep1Screen
          onNext={handleStep1Complete}
          onSignInPress={onCancel}
          onBack={onCancel}
        />
      );

    case 2:
      // 소셜 로그인에서는 표시되지 않음
      return (
        <SignUpStep2Screen
          name={signUpData.name!}
          phone={signUpData.phone!}
          onNext={handleStep2Complete}
          onBack={handleBack}
        />
      );

    case 3:
      return (
        <SignUpStep3Screen
          name={signUpData.name!}
          phone={signUpData.phone!}
          email={signUpData.email || signUpData.socialData?.email || ''}
          password={signUpData.password || ''}
          onNext={handleStep3Complete}
          onBack={handleBack}
        />
      );

    case 4:
      // 멘토 회원가입 4단계: 상세정보 (주소, 주민번호, 가입경로)
      return (
        <SignUpStep4Screen
          name={signUpData.name!}
          phone={signUpData.phone!}
          email={signUpData.email || signUpData.socialData?.email || ''}
          password={signUpData.password || ''}
          university={signUpData.university || ''}
          grade={signUpData.grade || 1}
          isOnLeave={signUpData.isOnLeave ?? null}
          major1={signUpData.major1 || ''}
          major2={signUpData.major2}
          onNext={handleStep4Complete}
          onBack={handleBack}
        />
      );

    case 5:
      // Foreign 소셜 가입 전용: Account & Documents 확인 화면 (웹 /sign-up/foreign/account 동일)
      return (
        <ForeignAccountScreen
          name={signUpData.name}
          socialProvider={signUpData.socialData?.providerId ?? null}
          onComplete={() => completeForeignSocialSignUp(signUpData)}
          onBack={handleBack}
        />
      );

    default:
      return null;
  }
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
});

/**
 * Foreign 소셜 가입 - Account & Documents 확인 화면
 * 웹의 /sign-up/foreign/account 페이지와 동일한 역할
 */
function ForeignAccountScreen({
  name,
  socialProvider,
  onComplete,
  onBack,
}: {
  name: string;
  socialProvider: string | null;
  onComplete: () => void;
  onBack: () => void;
}) {
  const providerLabel =
    socialProvider === 'naver' ? 'Naver' :
    socialProvider === 'kakao' ? 'Kakao' :
    socialProvider === 'apple' ? 'Apple' : 'Google';

  return (
    <View style={foreignStyles.container}>
      <View style={foreignStyles.header}>
        <Text style={foreignStyles.title}>Account & Documents</Text>
        <Text style={foreignStyles.subtitle}>Upload your account information and required documents</Text>
      </View>

      <View style={foreignStyles.card}>
        {/* 진행 표시 */}
        <View style={foreignStyles.progressRow}>
          <Text style={foreignStyles.progressText}>단계 2/2</Text>
        </View>
        <View style={foreignStyles.progressBar}>
          <View style={foreignStyles.progressFill} />
        </View>

        {/* 소셜 로그인 알림 */}
        {socialProvider && (
          <View style={foreignStyles.socialBanner}>
            <Text style={foreignStyles.socialBannerText}>
              ✓ You are signing up with {providerLabel}. No password required.
            </Text>
          </View>
        )}

        <View style={foreignStyles.divider} />

        {/* 서류 업로드 안내 */}
        <View style={foreignStyles.infoBanner}>
          <Text style={foreignStyles.infoBannerTitle}>Document Upload Required After Registration</Text>
          <Text style={foreignStyles.infoBannerBody}>
            After completing registration, please upload the following documents in{' '}
            <Text style={foreignStyles.bold}>Profile Edit</Text>:
          </Text>
          <View style={foreignStyles.docList}>
            <Text style={foreignStyles.docItem}>• Profile Photo</Text>
            <Text style={foreignStyles.docItem}>• CV (PDF)</Text>
            <Text style={foreignStyles.docItem}>• Passport Photo</Text>
            <Text style={foreignStyles.docItem}>• Alien Registration Card (if applicable)</Text>
          </View>
        </View>

        {/* 버튼 */}
        <View style={foreignStyles.buttonRow}>
          <TouchableOpacity style={foreignStyles.backButton} onPress={onBack}>
            <Text style={foreignStyles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity style={foreignStyles.completeButton} onPress={onComplete}>
            <Text style={foreignStyles.completeButtonText}>Complete Registration</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const foreignStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  progressRow: {
    marginBottom: 6,
  },
  progressText: {
    fontSize: 12,
    color: '#6b7280',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    marginBottom: 20,
  },
  progressFill: {
    height: 6,
    width: '100%',
    backgroundColor: '#2563eb',
    borderRadius: 3,
  },
  socialBanner: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  socialBannerText: {
    fontSize: 13,
    color: '#166534',
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginBottom: 16,
  },
  infoBanner: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    padding: 14,
    marginBottom: 24,
  },
  infoBannerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 6,
  },
  infoBannerBody: {
    fontSize: 12,
    color: '#1d4ed8',
    marginBottom: 8,
  },
  bold: {
    fontWeight: '700',
  },
  docList: {
    gap: 4,
  },
  docItem: {
    fontSize: 12,
    color: '#1d4ed8',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  completeButton: {
    flex: 1,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  completeButtonText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '600',
  },
});
