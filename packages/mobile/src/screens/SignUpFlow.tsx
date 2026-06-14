import React, { useState } from 'react';
import { logger } from '@smis-mentor/shared';
import { Alert, ActivityIndicator, View, StyleSheet } from 'react-native';
import { SignUpStep1Screen } from './SignUpStep1Screen';
import { SignUpStep2Screen } from './SignUpStep2Screen';
import { SignUpStep3Screen } from './SignUpStep3Screen';
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
  // 소셜 가입 시 이름+전화번호가 이미 확인됨 → step 1 건너뛰기
  // mentor: step 3(학력)부터, foreign: step 1에서 completeForeignSocialSignUp 즉시 호출
  const socialHasIdentity = !!initialSocialData && !!initialSocialData.name && !!initialSocialData.phone;
  const initialStep = socialHasIdentity && role === 'mentor' ? 3 : 1;

  const [step, setStep] = useState(initialStep);
  const [signUpData, setSignUpData] = useState<SignUpState>({
    name: initialSocialData?.name || '',
    phone: initialSocialData?.phone || '',
    isSocialSignUp: !!initialSocialData,
    socialData: initialSocialData,
    tempUserId: initialTempUserId,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 원어민 소셜 가입: 이름+전화번호가 이미 확인됐으면 마운트 시 즉시 완료 처리
  React.useEffect(() => {
    if (role === 'foreign' && socialHasIdentity) {
      completeForeignSocialSignUp(signUpData);
    }
  // 마운트 시 1회만 실행
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        // 원어민 소셜 가입은 추가 학력 정보 없이 바로 완료
        completeForeignSocialSignUp(updatedData);
      } else {
        // 멘토 소셜 가입은 Step 3(학력 정보)으로
        setStep(3);
      }
    } else {
      setStep(2);
    }
  };

  /**
   * 원어민 소셜 가입 즉시 완료 처리
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
        Alert.alert(
          '회원가입 완료',
          '환영합니다! SMIS Mentor에 오신 걸 환영합니다.',
          [{ text: '확인', onPress: onComplete }]
        );
      } else {
        const { signInWithCustomToken: signInCustom } = await import('../services/authService');
        const userId = data.socialData!.firebaseAuthUid || data.socialData!.providerUid;
        const userEmail = data.socialData!.email;

        if (userId && userEmail) {
          try {
            await signInCustom(userId, userEmail);
            Alert.alert(
              '회원가입 완료',
              '환영합니다! SMIS Mentor에 오신 걸 환영합니다.',
              [{ text: '확인', onPress: onComplete }]
            );
          } catch {
            Alert.alert(
              '회원가입 완료',
              '회원가입이 완료되었습니다. 로그인해주세요.',
              [{ text: '확인', onPress: onComplete }]
            );
          }
        } else {
          Alert.alert(
            '회원가입 완료',
            '회원가입이 완료되었습니다. 로그인해주세요.',
            [{ text: '확인', onPress: onComplete }]
          );
        }
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
   * Step 3 완료: 교육 정보
   */
  const handleStep3Complete = async (data: {
    university: string;
    grade: number;
    isOnLeave: boolean | null;
    major1: string;
    major2?: string;
  }) => {
    const finalData = { ...signUpData, ...data };
    setSignUpData(finalData);

    // 회원가입 완료 처리
    setIsSubmitting(true);
    try {
      if (finalData.isSocialSignUp && finalData.socialData) {
        // 소셜 회원가입
        await handleSocialSignUp(finalData);
      } else {
        // 일반 회원가입
        await handleNormalSignUp(finalData);
      }

      const rememberEmail =
        finalData.email?.trim() || finalData.socialData?.email?.trim();
      if (rememberEmail) {
        await persistLoginRememberEmail(rememberEmail);
      }

      // 소셜 회원가입이고 Firebase Auth에 이미 로그인된 경우 → 자동 로그인
      if (finalData.isSocialSignUp && finalData.socialData) {
        const { auth: firebaseAuth } = await import('../config/firebase');
        
        if (firebaseAuth.currentUser) {
          // Google/Apple: signInWithCredential로 이미 로그인됨 → 바로 완료
          logger.info('✅ 소셜 회원가입 완료 - Firebase Auth 로그인 확인됨, 자동 진입');
          Alert.alert(
            '회원가입 완료',
            '환영합니다! SMIS Mentor에 오신 걸 환영합니다.',
            [{ text: '확인', onPress: onComplete }]
          );
        } else {
          // 네이버 등 Custom Token 방식: 가입 직후 로그인 시도
          const { signInWithCustomToken: signInCustom } = await import('../services/authService');
          const userId = finalData.socialData.firebaseAuthUid || finalData.socialData.providerUid;
          const userEmail = finalData.socialData.email;
          
          if (userId && userEmail) {
            try {
              await signInCustom(userId, userEmail);
              logger.info('✅ Custom Token 자동 로그인 완료');
              Alert.alert(
                '회원가입 완료',
                '환영합니다! SMIS Mentor에 오신 걸 환영합니다.',
                [{ text: '확인', onPress: onComplete }]
              );
            } catch (loginErr) {
              logger.warn('⚠️ 자동 로그인 실패 - 수동 로그인 필요:', loginErr);
              Alert.alert(
                '회원가입 완료',
                '회원가입이 완료되었습니다. 로그인해주세요.',
                [{ text: '확인', onPress: onComplete }]
              );
            }
          } else {
            Alert.alert(
              '회원가입 완료',
              '회원가입이 완료되었습니다. 로그인해주세요.',
              [{ text: '확인', onPress: onComplete }]
            );
          }
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
    } else if (step === 3 && signUpData.isSocialSignUp) {
      // 소셜 가입에서 Step 3이 첫 화면(이름+전화번호 이미 확인)이면 취소
      if (socialHasIdentity) {
        onCancel();
      } else {
        // 소셜 가입이나 이름/전화번호가 없는 경우(일반) → Step 1로
        setStep(1);
      }
    } else {
      setStep(step - 1);
    }
  };

  /**
   * 소셜 회원가입 처리
   */
  const handleSocialSignUp = async (data: SignUpState) => {
    const { socialData, tempUserId, phone, name, university, grade, isOnLeave, major1, major2 } = data;

    if (!socialData) {
      throw new Error('소셜 로그인 데이터가 없습니다');
    }

    if (tempUserId) {
      // temp 계정 활성화: 웹과 동일하게 새 Auth UID로 문서 생성 후 기존 temp 삭제
      // (Firestore Rules: request.auth.uid == userId 조건 충족을 위해 새 문서 생성 필요)
      logger.info('✅ temp 계정 활성화 시작 (새 UID 패턴):', tempUserId);

      const { auth: firebaseAuth } = await import('../config/firebase');
      const { signInWithCredential } = await import('firebase/auth');

      // credential이 있으면 Firebase Auth 로그인 확정
      const credential = (socialData as any)._credential;
      if (credential && !firebaseAuth.currentUser) {
        try {
          const userCred = await signInWithCredential(firebaseAuth, credential);
          logger.info('✅ Firebase Auth signInWithCredential 완료 (temp 활성화):', userCred.user.uid);
        } catch (credError: any) {
          logger.warn('⚠️ signInWithCredential 실패:', credError.message);
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
        university,
        grade,
        isOnLeave,
        major1,
        major2,
        role: role === 'foreign' ? 'foreign' : 'mentor_temp',
        status: 'active',
        agreedTerms: true,
        agreedPersonal: true,
        profileImage: socialData.photoURL || tempUserData?.profileImage || '',
        selfIntroduction: (tempUserData as any)?.selfIntroduction || '',
        jobMotivation: (tempUserData as any)?.jobMotivation || '',
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
      const { signInWithCredential } = await import('firebase/auth');
      
      // credential이 있으면 Firebase Auth에 먼저 로그인 (Android Native SDK 경로)
      const credential = (socialData as any)._credential;
      if (credential && !firebaseAuth.currentUser) {
        try {
          const userCred = await signInWithCredential(firebaseAuth, credential);
          logger.info('✅ Firebase Auth signInWithCredential 완료 (회원가입 직전):', userCred.user.uid);
        } catch (credError: any) {
          logger.warn('⚠️ signInWithCredential 실패:', credError.message);
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
        email: socialData.email,
        name,
        phone,
        phoneNumber: phone,
        university,
        grade,
        isOnLeave,
        major1,
        major2,
        role: role === 'foreign' ? 'foreign' : 'mentor_temp',
        status: 'active',
        agreedTerms: true,
        agreedPersonal: true,
        profileImage: socialData.photoURL || '',
        authProviders: [
          {
            providerId: normalizedProviderId,
            uid: socialData.providerUid,
            email: socialData.email,
            linkedAt: Timestamp.now(),
            displayName: socialData.name,
            photoURL: socialData.photoURL,
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
    const { email, password, phone, name, university, grade, isOnLeave, major1, major2 } = data;

    if (!email || !password) {
      throw new Error('이메일과 비밀번호가 필요합니다');
    }

    // 1. Firebase Auth 계정 생성
    const userCredential = await signUp(email, password);
    const userId = userCredential.user.uid;

    // 2. Firestore에 사용자 정보 저장
    // 일반 가입(이메일/비밀번호) 경로: 멘토는 mentor_temp, foreign은 foreign (즉시 활성화)
    await setDoc(doc(db, 'users', userId), {
      userId,
      email,
      name,
      phone,
      university,
      grade,
      isOnLeave,
      major1,
      major2,
      role: role === 'foreign' ? 'foreign' : 'mentor_temp',
      status: 'active',
      agreedTerms: true,
      agreedPersonal: true,
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

  // 로딩 중이면 로딩 스피너 표시
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
