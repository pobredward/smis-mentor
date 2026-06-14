'use client';
import { logger } from '@smis-mentor/shared';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { getUserByEmail, getUserByPhone } from '@/lib/firebaseService';
import { auth } from '@/lib/firebase';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import ProgressSteps from '@/components/common/ProgressSteps';
import { FaEnvelope, FaLock, FaInfoCircle } from 'react-icons/fa';
import { calculateAgeFromDateOfBirth } from '@smis-mentor/shared';

// 일반 가입: 이메일/비밀번호 필수
const step2SchemaDefault = z.object({
  email: z.string().email('Please enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .regex(
      /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/,
      'Password must contain letters, numbers, and special characters.'
    ),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

// 소셜 가입: 이메일/비밀번호 불필요
const step2SchemaSocial = z.object({
  email: z.string().optional(),
  password: z.string().optional(),
  confirmPassword: z.string().optional(),
});

type Step2FormValues = z.infer<typeof step2SchemaDefault>;
type Step2SocialFormValues = z.infer<typeof step2SchemaSocial>;
type Step2AnyFormValues = Step2FormValues | Step2SocialFormValues;

export default function ForeignSignUpStep2() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // URL 파라미터 디코딩
  const firstName = searchParams.get('firstName') ? decodeURIComponent(searchParams.get('firstName') as string) : null;
  const lastName = searchParams.get('lastName') ? decodeURIComponent(searchParams.get('lastName') as string) : null;
  const middleName = searchParams.get('middleName') ? decodeURIComponent(searchParams.get('middleName') as string) : null;
  const countryCode = searchParams.get('countryCode') ? decodeURIComponent(searchParams.get('countryCode') as string) : null;
  const phone = searchParams.get('phone') ? decodeURIComponent(searchParams.get('phone') as string) : null;
  const dateOfBirth = searchParams.get('dateOfBirth') ? decodeURIComponent(searchParams.get('dateOfBirth') as string) : null;
  const socialSignUp = searchParams.get('socialSignUp') === 'true';
  const tempUserId = searchParams.get('tempUserId');
  const socialProvider = searchParams.get('socialProvider');
  const socialProviderUid = searchParams.get('socialProviderUid') ? decodeURIComponent(searchParams.get('socialProviderUid') as string) : null;
  const socialDisplayName = searchParams.get('socialDisplayName') ? decodeURIComponent(searchParams.get('socialDisplayName') as string) : null;
  const socialPhotoURL = searchParams.get('socialPhotoURL') ? decodeURIComponent(searchParams.get('socialPhotoURL') as string) : null;
  // 네이버/카카오는 auth.currentUser가 없으므로 URL로 이메일 전달
  const socialEmail = searchParams.get('socialEmail') ? decodeURIComponent(searchParams.get('socialEmail') as string) : null;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Step2AnyFormValues>({
    resolver: zodResolver(socialSignUp ? step2SchemaSocial : step2SchemaDefault) as any,
  });

  if (!firstName || !lastName || !countryCode || !phone) {
    return (
      <Layout>
        <div className="max-w-md mx-auto text-center py-12">
          <h1 className="text-2xl font-bold mb-4">Error</h1>
          <p className="text-gray-600 mb-4">Required information is missing.</p>
          <Button 
            variant="primary" 
            onClick={() => {
              // startTransition을 사용하여 안전하게 페이지 전환
              import('react').then(({ startTransition }) => {
                startTransition(() => {
                  router.push('/sign-up/foreign');
                });
              });
            }}
          >
            Return to Foreign Teacher Sign Up
          </Button>
        </div>
      </Layout>
    );
  }

  const onSubmit = async (data: Step2AnyFormValues) => {
    setIsLoading(true);
    try {
      // 전화번호에 국가코드 추가
      let phoneWithoutLeadingZero = phone;
      
      // 한국 번호의 경우 맨 앞 0 제거 (010 -> 10)
      if (countryCode === '+82' && phoneWithoutLeadingZero.startsWith('0')) {
        phoneWithoutLeadingZero = phoneWithoutLeadingZero.substring(1);
      }
      
      const fullPhone = `${countryCode}${phoneWithoutLeadingZero}`;
      const fullName = middleName 
        ? `${firstName} ${middleName} ${lastName}`
        : `${firstName} ${lastName}`;

      // 소셜 가입 시 이메일 우선순위: auth.currentUser → URL socialEmail param → 폼 입력
      // 네이버/카카오는 auth.currentUser가 null이므로 URL로 전달된 소셜 이메일 사용
      const currentUser = auth.currentUser;
      const resolvedEmail = socialSignUp
        ? (currentUser?.email ?? socialEmail ?? '')
        : (data.email ?? '');

      // 전화번호로 기존 사용자 확인
      const existingUserByPhone = await getUserByPhone(fullPhone);
      
      // 이메일로 기존 사용자 확인
      const existingUserByEmail = resolvedEmail ? await getUserByEmail(resolvedEmail) : null;
      
      let userId: string;
      let isUpdatingExistingUser = false;

      // 소셜 로그인 케이스
      let tempPasswordForSocial: string | undefined;
      if (socialSignUp && socialProvider) {
        logger.info('🔗 Social sign-up flow for foreign teacher');
        
        if (!currentUser) {
          // 네이버/카카오는 Firebase Auth 계정이 없으므로 생성
          logger.info('🔐 Creating Firebase Auth account for social sign-up (Naver/Kakao)');
          const { createUserWithEmailAndPassword } = await import('firebase/auth');
          
          if (!resolvedEmail) {
            toast.error('Could not retrieve email from social account. Please try again.');
            setIsLoading(false);
            return;
          }
          
          // 임시 비밀번호 생성
          tempPasswordForSocial = `${resolvedEmail}_${Date.now()}_${Math.random().toString(36)}`;
          
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, resolvedEmail, tempPasswordForSocial);
            userId = userCredential.user.uid;
            logger.info('✅ Firebase Auth account created, UID:', userId);
          } catch (authError: any) {
            if (authError.code === 'auth/email-already-in-use') {
              logger.info('⚠️ Email already exists, trying to sign in...');
              toast.error('This email is already in use. Please sign in instead.');
              setIsLoading(false);
              return;
            } else {
              throw authError;
            }
          }
        } else {
          userId = currentUser.uid;
          logger.info('✅ Using existing social auth UID:', userId);
        }
        
        // Case 1: 전화번호로 임시 원어민(foreign_temp) 계정이 존재하는 경우
        if (existingUserByPhone && existingUserByPhone.role === 'foreign_temp' && existingUserByPhone.status === 'temp') {
          logger.info('📋 Found existing foreign_temp user, will migrate to new UID');
          isUpdatingExistingUser = true;
          
          // 이메일이 다른 계정에서 사용 중인지 확인
          if (existingUserByEmail && existingUserByEmail.userId !== userId) {
            toast.error('This email is already in use by another account.');
            setIsLoading(false);
            return;
          }
        }
        // Case 2: 이메일로 계정이 존재하는 경우 (중복)
        else if (existingUserByEmail) {
          toast.error('This email is already in use.');
          setIsLoading(false);
          return;
        }
      } else {
        // 일반 가입 케이스
        // Case 1: 전화번호로 임시 원어민(foreign_temp) 계정이 존재하는 경우
        if (existingUserByPhone && existingUserByPhone.role === 'foreign_temp' && existingUserByPhone.status === 'temp') {
          logger.info('📋 Found existing foreign_temp user, updating account...');
          
          // 이메일이 다른 계정에서 사용 중인지 확인
          if (existingUserByEmail && existingUserByEmail.userId !== existingUserByPhone.userId) {
            toast.error('This email is already in use by another account.');
            setIsLoading(false);
            return;
          }
          
          // Firebase Authentication에 이메일/비밀번호 설정
          logger.info('🔐 Creating new Firebase Auth account for temp user');
          const { createUserWithEmailAndPassword } = await import('firebase/auth');
          const { auth } = await import('@/lib/firebase');
          
          try {
            const userCredential = await createUserWithEmailAndPassword(auth, data.email!, data.password!);
            userId = userCredential.user.uid;
            isUpdatingExistingUser = true;
            logger.info('✅ Created new Firebase Auth account, will migrate temp data to UID:', userId);
          } catch (authError: any) {
            if (authError.code === 'auth/email-already-in-use') {
              toast.error('This email is already in use.');
            } else {
              throw authError;
            }
            setIsLoading(false);
            return;
          }
        }
        // Case 2: 이메일로 계정이 존재하는 경우 (중복)
        else if (existingUserByEmail) {
          toast.error('This email is already in use.');
          setIsLoading(false);
          return;
        }
        // Case 3: 완전히 새로운 사용자
        else {
          logger.info('🔐 Creating new Firebase Authentication account:', data.email);
          const { createUserWithEmailAndPassword } = await import('firebase/auth');
          const { auth } = await import('@/lib/firebase');
          const userCredential = await createUserWithEmailAndPassword(auth, data.email!, data.password!);
          userId = userCredential.user.uid;
          logger.info('✅ Firebase Authentication account created, UID:', userId);
        }
      }

      // 2. Firestore에 사용자 문서 생성 또는 업데이트
      if (!userId) {
        logger.error('❌ userId가 설정되지 않음 — Firebase Auth 계정 생성 실패');
        toast.error('Account creation failed. Please try again.');
        setIsLoading(false);
        return;
      }

      const { doc, setDoc, Timestamp } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const userData = {
        userId: userId,
        id: userId,
        name: fullName,
        email: resolvedEmail,
        phone: fullPhone,
        phoneNumber: fullPhone,
        password: '',
        address: existingUserByPhone?.address || '',
        addressDetail: existingUserByPhone?.addressDetail || '',
        role: 'foreign',
        jobExperiences: existingUserByPhone?.jobExperiences || [],
        jobCodeIds: (existingUserByPhone?.jobExperiences || []).map((exp: { id: string }) => exp.id),
        partTimeJobs: existingUserByPhone?.partTimeJobs || [],
        createdAt: existingUserByPhone?.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now(),
        agreedTerms: true,
        agreedPersonal: true,
        profileImage: '',
        status: 'active',
        isEmailVerified: false,
        isPhoneVerified: false,
        isProfileCompleted: false,
        isTermsAgreed: true,
        isPersonalAgreed: true,
        isAddressVerified: false,
        isProfileImageUploaded: false,
        jobMotivation: 'Foreign Teacher Application',
        feedback: existingUserByPhone?.feedback || '',
        ...(dateOfBirth && {
          dateOfBirth,
          age: calculateAgeFromDateOfBirth(dateOfBirth),
        }),
        foreignTeacher: {
          firstName: firstName || '',
          lastName: lastName || '',
          middleName: middleName || '',
          countryCode: countryCode || '',
          cvUrl: '',
          passportPhotoUrl: '',
          foreignIdCardUrl: '',
          applicationDate: Timestamp.now(),
        },
        ...(socialSignUp && socialProvider && {
          authProviders: [{
            providerId: socialProvider === 'naver' || socialProvider === 'kakao'
              ? socialProvider
              : `${socialProvider}.com`,
            uid: socialProviderUid || userId,
            email: resolvedEmail,
            linkedAt: Timestamp.now(),
            displayName: socialDisplayName,
            photoURL: socialPhotoURL,
          }],
          primaryAuthMethod: 'social',
          ...(tempPasswordForSocial && { _firebaseAuthPassword: tempPasswordForSocial }),
        }),
        ...(!socialSignUp && {
          authProviders: [{
            providerId: 'password',
            uid: userId,
            email: resolvedEmail,
            linkedAt: Timestamp.now(),
          }],
          primaryAuthMethod: 'password',
        }),
      };

      if (isUpdatingExistingUser && existingUserByPhone) {
        const oldTempUserId = existingUserByPhone.userId;

        logger.info('📝 Creating new Firestore document with Auth UID:', userId);
        await setDoc(doc(db, 'users', userId), userData);
        logger.info('✅ New Firestore document created');

        if (oldTempUserId !== userId) {
          logger.info('🗑️ Deleting old temp document:', oldTempUserId);
          const { deleteDoc } = await import('firebase/firestore');
          await deleteDoc(doc(db, 'users', oldTempUserId));
          logger.info('✅ Old temp document deleted');
        }

        toast.success(
          `Welcome back, ${fullName}!\n\nYour account has been activated.\nPlease upload your documents in Profile Edit.`,
          { duration: 8000 }
        );
      } else {
        logger.info('📝 Creating new Firestore user document');
        await setDoc(doc(db, 'users', userId), userData);
        logger.info('✅ Firestore user document created');

        toast.success(
          `Welcome, ${fullName}!\n\nYour account has been successfully created.\nPlease upload your documents in Profile Edit.`,
          { duration: 8000 }
        );
      }

      // 소셜 회원가입 후 하드 네비게이션으로 AuthContext를 처음부터 재초기화
      // router.push는 SPA 전환이라 onAuthStateChanged가 이미 완료된 상태에서
      // userData가 null인 경우 무한로딩이 발생할 수 있음
      setTimeout(() => {
        window.location.href = '/profile';
      }, 2000);
    } catch (error: any) {
      logger.error('Sign up error:', error);
      
      let errorMessage = 'An error occurred during sign up.';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already in use.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please use at least 8 characters.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email format.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout noPadding>
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
        <div className="max-w-2xl w-full">
          {/* 헤더 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-green-600 to-emerald-800 bg-clip-text text-transparent">
              Account & Documents
            </h1>
            <p className="text-gray-600">Upload your account information and required documents</p>
          </div>

          <div className="bg-white shadow-xl rounded-2xl lg:px-10 px-6 pt-8 pb-10">
            {/* 진행 표시기 */}
            <ProgressSteps
              currentStep={2}
              totalSteps={2}
              steps={['Personal Info', 'Account']}
            />

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Email */}
              {!socialSignUp && (
                <>
                  <div className="relative">
                    <div className="absolute left-3 top-[38px] text-gray-400">
                      <FaEnvelope className="w-5 h-5" />
                    </div>
                    <FormInput
                      label="Email"
                      type="email"
                      placeholder="example@email.com"
                      error={errors.email?.message}
                      className="pl-12"
                      {...register('email')}
                    />
                  </div>

                  {/* Password */}
                  <div className="relative">
                    <div className="absolute left-3 top-[38px] text-gray-400">
                      <FaLock className="w-5 h-5" />
                    </div>
                    <FormInput
                      label="Password"
                      type="password"
                      placeholder="8+ characters with letters, numbers & symbols"
                      error={errors.password?.message}
                      showPasswordToggle={true}
                      className="pl-12"
                      {...register('password')}
                    />
                  </div>

                  {/* Confirm Password */}
                  <div className="relative">
                    <div className="absolute left-3 top-[38px] text-gray-400">
                      <FaLock className="w-5 h-5" />
                    </div>
                    <FormInput
                      label="Confirm Password"
                      type="password"
                      placeholder="Re-enter your password"
                      error={errors.confirmPassword?.message}
                      showPasswordToggle={true}
                      className="pl-12"
                      {...register('confirmPassword')}
                    />
                  </div>
                </>
              )}

              {socialSignUp && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800 flex items-center">
                    <span className="mr-2">✓</span>
                    <span>
                      You are signing up with{' '}
                      {socialProvider === 'naver'
                        ? 'Naver'
                        : socialProvider === 'kakao'
                        ? 'Kakao'
                        : socialProvider === 'apple'
                        ? 'Apple'
                        : 'Google'}
                      . No password required.
                    </span>
                  </p>
                </div>
              )}

              <div className="border-t border-gray-200 my-8"></div>

              {/* 서류 업로드 안내 배너 */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
                <FaInfoCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-800 mb-1">Document Upload Required After Registration</p>
                  <p className="text-sm text-blue-700">
                    After completing registration, please upload the following documents in <strong>Profile Edit</strong>:
                  </p>
                  <ul className="mt-2 space-y-0.5 text-sm text-blue-700 list-disc list-inside">
                    <li>Profile Photo</li>
                    <li>CV (PDF)</li>
                    <li>Passport Photo</li>
                    <li>Alien Registration Card (if applicable)</li>
                  </ul>
                </div>
              </div>

              {/* 버튼 그룹 */}
              <div className="flex gap-3 pt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    // startTransition을 사용하여 안전하게 페이지 전환
                    import('react').then(({ startTransition }) => {
                      startTransition(() => {
                        router.back();
                      });
                    });
                  }}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isLoading}
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800"
                >
                  Complete Registration
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
