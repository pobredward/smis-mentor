import React, { useState } from 'react';
import { logger } from '@smis-mentor/shared';
import { Alert, ActivityIndicator, View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SignUpStep1Screen } from './SignUpStep1Screen';
import { SignUpStep2Screen } from './SignUpStep2Screen';
import { SignUpStep3Screen } from './SignUpStep3Screen';
import { SignUpStep4Screen } from './SignUpStep4Screen';
import type { SocialUserData, SignUpState } from '@smis-mentor/shared';
import { signUp, persistLoginRememberEmail, signUpWithSocialToken, completeSignupViaApi } from '../services/authService';
import { ConsentCheckbox } from '../components/ConsentCheckbox';

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
        // 네이버: 서버 검증 Custom Token 으로 Firebase 세션이 이미 생성되어 자동 로그인됨
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
          // 네이버: 서버 검증 Custom Token 으로 Firebase 세션이 이미 생성되어 자동 로그인됨
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

  /** providerId 정규화: 네이버/카카오는 .com 없이, 구글/애플은 .com 포함 */
  const toProviderId = (id: string) =>
    (id === 'naver' || id === 'kakao' ? id : id.includes('.com') ? id : `${id}.com`) as 'naver' | 'kakao' | 'google.com' | 'apple.com';

  /** 서버로 보낼 프로필 — role·캠프 배정 등 권한 필드는 서버가 정한다 */
  const buildProfile = (data: SignUpState) => {
    const geo = data.geocode && typeof data.geocode.lat === 'number' ? { geocode: { lat: data.geocode.lat, lng: data.geocode.lng } } : {};
    if (role === 'foreign') {
      const ft = data.foreignTeacher;
      return {
        name: data.name || [ft?.firstName, ft?.middleName, ft?.lastName].filter(Boolean).join(' '),
        phoneNumber: data.phone,
        foreignTeacher: { firstName: ft?.firstName ?? '', lastName: ft?.lastName ?? '', middleName: ft?.middleName ?? '', countryCode: ft?.countryCode ?? '' },
        agreedPersonal: true,
        ...(data.socialData?.photoURL && { profileImage: data.socialData.photoURL }),
      };
    }
    return {
      name: data.name,
      phoneNumber: data.phone,
      university: data.university ?? '',
      grade: data.grade,
      isOnLeave: data.isOnLeave ?? null,
      major1: data.major1 ?? '',
      major2: data.major2 ?? '',
      address: data.address ?? '',
      addressDetail: data.addressDetail ?? '',
      rrnFront: data.rrnFront ?? '',
      rrnGenderDigit: (data.rrnLast ?? '').slice(0, 1),
      gender: data.gender,
      referralPath: data.referralPath ?? '',
      referrerName: data.referrerName ?? '',
      otherReferralDetail: data.otherReferralDetail ?? '',
      agreedPersonal: data.agreedPersonal ?? false,
      ...(data.socialData?.photoURL && { profileImage: data.socialData.photoURL }),
      ...geo,
    };
  };

  /**
   * 소셜 가입: Firebase Auth 세션을 확보한다
   * (Google/Apple: credential 로그인 / 네이버·카카오: 서버가 access token 을 검증한 뒤 Custom Token 발급)
   */
  const ensureSocialSession = async (socialData: SocialUserData) => {
    const { auth: firebaseAuth } = await import('../config/firebase');
    if (firebaseAuth.currentUser) return firebaseAuth.currentUser.uid;
    const credential = (socialData as any)._credential;
    if (credential) {
      const { signInWithCredential } = await import('firebase/auth');
      const userCred = await signInWithCredential(firebaseAuth, credential);
      return userCred.user.uid;
    }
    if (!socialData.accessToken || (socialData.providerId !== 'naver' && socialData.providerId !== 'kakao')) {
      throw new Error('소셜 인증 정보가 만료되었습니다. 다시 로그인해주세요.');
    }
    try {
      const userCred = await signUpWithSocialToken({ kind: socialData.providerId, accessToken: socialData.accessToken });
      return userCred.user.uid;
    } catch (createError: any) {
      if (createError?.status === 409) throw new Error('이미 가입된 이메일입니다. 로그인 화면에서 로그인해주세요.');
      if (createError?.status === 401) throw new Error('소셜 인증이 만료되었습니다. 다시 로그인해주세요.');
      logger.error('❌ 소셜 Firebase 세션 확보 실패:', createError?.message);
      throw new Error('Firebase 인증에 실패했습니다. 다시 시도해주세요.');
    }
  };

  /**
   * 소셜 회원가입 처리 — users 문서 생성·temp 이관·탈퇴 계정 정리는 서버가 한 번에 (웹과 동일)
   */
  const handleSocialSignUp = async (data: SignUpState) => {
    const { socialData, tempUserId } = data;
    if (!socialData) throw new Error('소셜 로그인 데이터가 없습니다');

    // Apple 재로그인(이메일 미제공)으로 앱이 임시로 만든 apple_<id>@privaterelay 주소로는 신규 가입 불가.
    // 사용자가 '이메일 가리기'를 고른 진짜 릴레이 주소(임의 문자열@privaterelay)는 정상 가입 가능.
    // (temp 계정 이관은 서버가 temp 이메일로 대체)
    if (!tempUserId && /^apple_[^@]+@privaterelay\.appleid\.com$/i.test(socialData.email)) {
      throw new Error(
        'Apple 재로그인 감지: Apple 설정에서 SMIS Mentor 앱 연동을 삭제한 후 다시 시도하세요.\n' +
        '설정 > Apple ID > 암호 및 보안 > Apple로 로그인을 사용하는 앱'
      );
    }

    const uid = await ensureSocialSession(socialData);
    const result = await completeSignupViaApi({
      kind: role === 'foreign' ? 'foreign' : 'mentor',
      tempUserId: tempUserId || undefined,
      provider: {
        providerId: toProviderId(socialData.providerId),
        providerUid: socialData.providerUid,
        ...(socialData.name && { displayName: socialData.name }),
        ...(socialData.photoURL && { photoURL: socialData.photoURL }),
      },
      profile: buildProfile(data),
    });
    logger.info('✅ 소셜 가입 완료:', { uid, role: result.role, claimedTemp: result.claimedTemp });
  };

  /**
   * 일반 회원가입 처리 — 실패하면 서버가 방금 만든 Auth 계정을 지운다 (반쪽 계정 방지)
   */
  const handleNormalSignUp = async (data: SignUpState) => {
    const { email, password } = data;
    if (!email || !password) throw new Error('이메일과 비밀번호가 필요합니다');

    const userCredential = await signUp(email, password);
    try {
      const result = await completeSignupViaApi({
        kind: role === 'foreign' ? 'foreign' : 'mentor',
        tempUserId: data.tempUserId || undefined,
        rollbackAuthOnFailure: true,
        provider: { providerId: 'password' },
        profile: buildProfile(data),
      });
      logger.info('✅ 가입 완료:', { uid: userCredential.user.uid, role: result.role, claimedTemp: result.claimedTemp });
    } catch (e) {
      const { auth: firebaseAuth } = await import('../config/firebase');
      await firebaseAuth.signOut().catch(() => undefined);
      throw e;
    }
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
  const [agreedConsent, setAgreedConsent] = useState(false);
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

        <ConsentCheckbox checked={agreedConsent} onChange={setAgreedConsent} english />

        {/* 버튼 */}
        <View style={foreignStyles.buttonRow}>
          <TouchableOpacity style={foreignStyles.backButton} onPress={onBack}>
            <Text style={foreignStyles.backButtonText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[foreignStyles.completeButton, !agreedConsent && { opacity: 0.5 }]}
            onPress={() => {
              if (!agreedConsent) {
                Alert.alert('Consent Required', 'Please agree to the Terms of Service and Privacy Policy.');
                return;
              }
              onComplete();
            }}
          >
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
