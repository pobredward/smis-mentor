import React, { useState } from 'react';
import { Alert, ActivityIndicator, View, StyleSheet } from 'react-native';
import { SignUpStep1Screen } from './SignUpStep1Screen';
import { SignUpStep2Screen } from './SignUpStep2Screen';
import { SignUpStep3Screen } from './SignUpStep3Screen';
import type { SocialUserData, SignUpState } from '@smis-mentor/shared';
import { activateTempAccountWithSocial } from '@smis-mentor/shared';
import { signUp, updateUser } from '../services/authService';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
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
  const [step, setStep] = useState(1);
  const [signUpData, setSignUpData] = useState<SignUpState>({
    name: initialSocialData?.name || '',
    phone: initialSocialData?.phone || '',
    isSocialSignUp: !!initialSocialData,
    socialData: initialSocialData,
    tempUserId: initialTempUserId,
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
    setSignUpData(prev => ({ 
      ...prev, 
      name: data.name,
      phone: data.phone,
      tempUserId: data.tempUserId || prev.tempUserId,
    }));

    // 소셜 로그인이면 Step 2 건너뛰기
    if (signUpData.isSocialSignUp) {
      setStep(3);
    } else {
      setStep(2);
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

      Alert.alert(
        '회원가입 완료',
        '환영합니다! 로그인해주세요.',
        [{ text: '확인', onPress: onComplete }]
      );
    } catch (error: any) {
      console.error('회원가입 실패:', error);
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
      // 소셜 로그인에서는 Step 2가 없으므로 Step 1로
      setStep(1);
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
      // temp 계정 활성화
      console.log('✅ temp 계정 활성화:', tempUserId);
      
      await activateTempAccountWithSocial(
        tempUserId,
        socialData,
        {
          phone,
          university,
          grade,
          isOnLeave,
          major1,
          major2,
          role: 'mentor', // temp_mentor → mentor
        },
        updateUser
      );
    } else {
      // 완전히 새로운 소셜 계정 생성
      console.log('✅ 새 소셜 계정 생성');
      
      const userId = doc(db, 'users').id;
      
      // providerId 정규화: 네이버/카카오는 .com 없이, 구글/애플은 .com 포함
      const normalizedProviderId = socialData.providerId === 'naver' || socialData.providerId === 'kakao'
        ? socialData.providerId
        : socialData.providerId.includes('.com') 
          ? socialData.providerId 
          : `${socialData.providerId}.com`;
      
      await setDoc(doc(db, 'users', userId), {
        userId,
        email: socialData.email,
        name,
        phone,
        university,
        grade,
        isOnLeave,
        major1,
        major2,
        role: 'mentor',
        status: 'active',
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
      role: 'mentor',
      status: 'active',
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
