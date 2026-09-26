'use client';
import { logger } from '@smis-mentor/shared';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import DaumPostcode, { Address } from 'react-daum-postcode';
import toast from 'react-hot-toast';
import { getUserByPhone, signUp, signUpWithSocialToken, completeSignupViaApi } from '@/lib/firebaseService';
import { getUserInfoFromRRN } from '@/utils/userUtils';
import { signupStorage, SignUpData } from '@/utils/signupStorage';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import ProgressSteps from '@/components/common/ProgressSteps';
import { Timestamp } from 'firebase/firestore';
import { auth } from '@/lib/firebase';
import { FaMapMarkerAlt, FaIdCard, FaUsers, FaCheckCircle } from 'react-icons/fa';
import { updateGeocodeIfAddressChanged } from '@/lib/geocoding';

const detailsSchema = z.object({
  address: z.string().min(1, '주소를 입력해주세요.'),
  addressDetail: z.string().min(1, '상세 주소를 입력해주세요.'),
  rrnFront: z.string().length(6, '주민번호 앞자리 6자리를 입력해주세요.'),
  // 가입 시에는 생년월일 + 뒷자리 첫 숫자(성별·세기)만 받는다. 뒷자리 전체는 캠프 배정 후 '캠프 참가 정보'에서 입력
  rrnLast: z.string().regex(/^[1-8]$/, '주민번호 뒷자리 첫 번째 숫자를 입력해주세요.'),
  gender: z.enum(['M', 'F'], {
    errorMap: () => ({ message: '성별을 선택해주세요.' }),
  }),
  referralPath: z.string().min(1, '가입 경로를 선택해주세요.'),
  referrerName: z.string().optional(),
  agreedPersonal: z.boolean().refine(val => val === true, {
    message: '개인정보 수집 및 이용에 동의해주세요.',
  }),
  otherReferralDetail: z.string().optional(),
});

type DetailsFormValues = z.infer<typeof detailsSchema>;

export default function SignUpDetails() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showPostcode, setShowPostcode] = useState(false);
  const [signupData, setSignupData] = useState(signupStorage.get());

  // 필수 정보 확인
  useEffect(() => {
    const data = signupStorage.get();
    
    const requiredFields: (keyof SignUpData)[] = data?.socialSignUp
      ? ['name', 'phoneNumber', 'email', 'university', 'grade', 'major1']
      : ['name', 'phoneNumber', 'email', 'password', 'university', 'grade', 'major1'];
    
    if (!data || !signupStorage.validate(requiredFields)) {
      toast.error('세션이 만료되었습니다. 처음부터 다시 시작해주세요.');
      router.replace('/sign-up');
      return;
    }
    
    setSignupData(data);
  }, [router]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DetailsFormValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      gender: undefined,
      referralPath: undefined,
      referrerName: '',
      agreedPersonal: false,
    },
  });

  // 주민번호 입력 값 감시
  const rrnFront = watch('rrnFront');
  const rrnLast = watch('rrnLast');

  // 주민번호가 변경될 때마다 성별 자동 설정
  useEffect(() => {
    if (rrnFront?.length === 6 && rrnLast?.length === 1) {
      const { gender } = getUserInfoFromRRN(rrnFront, rrnLast);
      if (gender) {
        setValue('gender', gender);
      }
    }
  }, [rrnFront, rrnLast, setValue]);

  const handleComplete = (data: Address) => {
    setValue('address', data.address);
    setShowPostcode(false);
  };

  const onSubmit = async (data: DetailsFormValues) => {
    if (!signupData) {
      toast.error('필수 정보가 누락되었습니다.');
      router.push('/sign-up');
      return;
    }

    setIsLoading(true);
    try {
      const { name, phoneNumber, email, password, university, grade, isOnLeave, major1, major2, socialSignUp, tempUserId, socialProvider, firebaseAuthUid, socialProviderUid, socialDisplayName, socialPhotoURL, socialAccessToken } = signupData;

      logger.info('🔍 회원가입 데이터 확인:', {
        socialSignUp,
        socialProvider,
        email,
        tempUserId,
        firebaseAuthUid,
        socialProviderUid,
        socialDisplayName,
      });

      if (!name || !phoneNumber || !email || !university || !grade || !major1) {
        toast.error('필수 정보가 누락되었습니다.');
        router.push('/sign-up');
        return;
      }

      // 소셜 로그인이 아닌 경우 비밀번호 필수
      if (!socialSignUp && !password) {
        toast.error('비밀번호가 누락되었습니다.');
        router.push('/sign-up/account');
        return;
      }

      // 주민번호를 통해 나이 계산
      const { age } = getUserInfoFromRRN(data.rrnFront, data.rrnLast);

      // 전화번호로 기존 임시 사용자 조회 (최종 확인)
      const existingUser = await getUserByPhone(phoneNumber);
      
      // 동시 가입 시도 방지: 다른 사용자가 이미 active 상태로 가입했는지 확인
      if (existingUser && existingUser.status === 'active') {
        // tempUserId가 있고, 기존 유저의 userId와 다르면 중복 가입 시도
        if (tempUserId && existingUser.userId !== tempUserId) {
          logger.error('⚠️ 동시 가입 시도 감지:', {
            tempUserId,
            existingUserId: existingUser.userId,
          });
          toast.error('이 전화번호는 이미 다른 계정으로 가입되었습니다. 잠시 후 다시 시도해주세요.');
          signupStorage.clear();
          router.push('/sign-in');
          return;
        }
        // tempUserId가 없는데 active 유저가 있으면 중복
        if (!tempUserId) {
          logger.error('⚠️ 이미 가입된 전화번호:', phoneNumber);
          toast.error('이 전화번호는 이미 가입되어 있습니다.');
          signupStorage.clear();
          router.push('/sign-in');
          return;
        }
      }
      
      // 기타 경로 상세 정보 처리
      let referralPathValue = data.referralPath;
      if (data.referralPath === '기타' && data.otherReferralDetail) {
        referralPathValue = `기타: ${data.otherReferralDetail}`;
      }
      
      const gradeNum = typeof grade === 'number' ? grade : parseInt(grade as string, 10);
      // isOnLeave 처리: null, true, false 모두 지원
      const isOnLeaveVal = isOnLeave === null ? null : Boolean(isOnLeave);

      // 서버(/api/auth/complete-signup)로 보낼 프로필 — role·캠프 배정 등 권한 필드는 서버가 정한다
      const buildProfile = async () => {
        const geo = await updateGeocodeIfAddressChanged(undefined, data.address);
        return {
          name, phoneNumber,
          address: data.address, addressDetail: data.addressDetail,
          gender: data.gender, age, agreedPersonal: data.agreedPersonal,
          referralPath: referralPathValue, referrerName: data.referrerName ?? '',
          university, grade: gradeNum, isOnLeave: isOnLeaveVal, major1, major2: major2 || '',
          rrnFront: data.rrnFront, rrnGenderDigit: data.rrnLast,
          ...(geo.geocode && { geocode: { lat: geo.geocode.lat, lng: geo.geocode.lng } }),
        };
      };
      
      if (existingUser && existingUser.status === 'temp') {
        const now = Timestamp.now();
        
        // role 결정 로직
        let finalRole: 'mentor' | 'foreign' = 'mentor';
        if (existingUser.role === 'mentor_temp') {
          finalRole = 'mentor';
        } else if (existingUser.role === 'foreign_temp') {
          finalRole = 'foreign';
        } else if (existingUser.role === 'mentor' || existingUser.role === 'foreign') {
          finalRole = existingUser.role;
        }

        let newUserId: string;
        let userCredential: any;
        
        // 🔥 소셜 가입과 일반 가입 분기 처리
        if (socialSignUp) {
          const provider = socialProvider || 'google';
          const normalizedProviderId = provider === 'naver' || provider === 'kakao'
            ? provider
            : `${provider}.com`;
          const isGoogleOrApple = provider === 'google' || provider === 'apple';
          let currentUser = auth.currentUser;

          if (isGoogleOrApple) {
            // 구글/애플: signInWithPopup으로 이미 Firebase Auth 계정이 생성되어 있음
            if (!currentUser) {
              logger.error('❌ 구글/애플 소셜 Auth 없음:', { socialProvider, email });
              toast.error('인증 상태가 올바르지 않습니다. 다시 로그인해주세요.');
              signupStorage.clear();
              router.push('/sign-in');
              setIsLoading(false);
              return;
            }
            newUserId = currentUser.uid;
            logger.info('✅ 구글/애플 temp 활성화 - Auth UID 재사용:', newUserId);
          } else {
            // 네이버/카카오: 서버가 access token 을 검증한 뒤 Auth 사용자를 만들고 Custom Token 발급
            // (임시 비밀번호를 Firestore 에 평문 저장하던 방식은 폐기)
            logger.info('🆕 네이버/카카오 temp 활성화 - 서버 검증 후 Firebase 세션 확보');
            if (!socialAccessToken || (provider !== 'naver' && provider !== 'kakao')) {
              toast.error('소셜 인증 정보가 만료되었습니다. 다시 로그인해주세요.');
              signupStorage.clear();
              router.push('/sign-in');
              setIsLoading(false);
              return;
            }
            try {
              const socialCred = await signUpWithSocialToken({ kind: provider as 'naver' | 'kakao', accessToken: socialAccessToken });
              newUserId = socialCred.user.uid;
              currentUser = socialCred.user;
              logger.info('✅ 네이버/카카오 temp 활성화 - Firebase 세션 확보:', newUserId);
            } catch (authError: any) {
              if (authError?.code === 'EMAIL_IN_USE' || authError?.status === 409) {
                toast.error('이 이메일은 이미 사용 중입니다. 로그인 페이지로 이동합니다.');
                router.push('/sign-in');
                return;
              }
              if (authError?.status === 401) {
                toast.error('소셜 인증이 만료되었습니다. 다시 로그인해주세요.');
                signupStorage.clear();
                router.push('/sign-in');
                return;
              }
              throw authError;
            }
          }

          if (!userCredential) {
            userCredential = {
              user: currentUser,
              authProviders: [{
                providerId: normalizedProviderId,
                uid: socialProviderUid || currentUser!.uid,
                email,
                linkedAt: now,
                displayName: socialDisplayName || name,
                ...(socialPhotoURL && { photoURL: socialPhotoURL }),
              }],
              primaryAuthMethod: 'social',
            };
          }
        } else {
          // 일반 가입: 새 Firebase Auth 계정 생성
          if (!password) {
            toast.error('비밀번호가 누락되었습니다.');
            router.push('/sign-up/account');
            return;
          }
          userCredential = await signUp(email, password);
          newUserId = userCredential.user.uid;
          logger.info('✅ 일반 가입 - 새 Auth 계정 생성:', newUserId);
          
          // 일반 가입도 authProviders 정보 설정
          userCredential.authProviders = [{
            providerId: 'password',
            uid: newUserId,
            email,
            linkedAt: now,
          }];
          userCredential.primaryAuthMethod = 'password';
        }

        // ✅ 서버가 temp 계정(캠프 배정 등)을 확인·이관하고 새 UID 문서를 만든다
        const p0 = userCredential.authProviders?.[0] ?? {};
        const result = await completeSignupViaApi({
          kind: 'mentor',
          tempUserId: existingUser.userId,
          rollbackAuthOnFailure: !socialSignUp,
          provider: { providerId: p0.providerId || 'password', providerUid: p0.uid, displayName: p0.displayName, photoURL: p0.photoURL },
          profile: await buildProfile(),
        });
        finalRole = (result.role === 'foreign' ? 'foreign' : 'mentor');
        logger.info('✅ 가입 완료 (temp 이관):', { uid: newUserId, claimedTemp: result.claimedTemp });

        // SessionStorage 정리
        signupStorage.clear();
        
        toast.success('회원가입이 완료되었습니다!');
        
        // 소셜 가입은 Auth 상태 변경이 없으므로 하드 네비게이션으로 AuthContext 재초기화
        // 일반 가입은 signUp() 호출로 onAuthStateChanged가 발화되어 SPA 전환으로도 안전
        if (socialSignUp) {
          setTimeout(() => {
            window.location.href = finalRole === 'mentor' ? '/profile' : '/';
          }, 500);
        } else {
          if (finalRole === 'mentor') {
            setTimeout(() => {
              toast.success('마이페이지에서 "수정" 버튼을 눌러 프로필 사진, 자기소개서 & 지원동기를 작성해주세요!', { duration: 6000 });
            }, 500);
            router.replace('/profile');
          } else {
            router.replace('/');
          }
        }
      } else {
        // 신규 가입
        const now = Timestamp.now();
        let newUserId: string;
        let authProvidersData: any = undefined;

        // 🔥 소셜 가입과 일반 가입 분기 처리
        if (socialSignUp) {
          logger.info('✅ 소셜 신규 가입 처리 시작:', { socialProvider, firebaseAuthUid });
          
          // socialProvider 동적 처리 및 정규화
          // 네이버/카카오는 .com 없이, 구글/애플은 .com 포함
          const provider = socialProvider || 'google';
          const normalizedProviderId = provider === 'naver' || provider === 'kakao' 
            ? provider 
            : `${provider}.com`;

          // 구글/애플: signInWithPopup으로 이미 Firebase Auth 계정이 생성되어 있음
          // → auth.currentUser를 재사용해 소셜 연동 유지
          const isGoogleOrApple = provider === 'google' || provider === 'apple';
          const currentUser = auth.currentUser;

          if (isGoogleOrApple && currentUser) {
            // 구글/애플: 기존 Firebase Auth 계정(소셜 UID) 재사용
            newUserId = currentUser.uid;
            logger.info('✅ 구글/애플 신규 가입 - 기존 Auth UID 재사용:', newUserId);

            authProvidersData = {
              authProviders: [{
                providerId: normalizedProviderId,
                uid: socialProviderUid || currentUser.uid,
                email,
                linkedAt: now,
                displayName: socialDisplayName || name,
                ...(socialPhotoURL && { photoURL: socialPhotoURL }),
              }],
              primaryAuthMethod: 'social',
            };
          } else {
            // 네이버/카카오: 서버가 access token 을 검증한 뒤 Auth 사용자 생성 + Custom Token 발급
            if (!socialAccessToken || (provider !== 'naver' && provider !== 'kakao')) {
              toast.error('소셜 인증 정보가 만료되었습니다. 다시 로그인해주세요.');
              signupStorage.clear();
              router.push('/sign-in');
              setIsLoading(false);
              return;
            }
            try {
              const socialCred = await signUpWithSocialToken({ kind: provider as 'naver' | 'kakao', accessToken: socialAccessToken });
              newUserId = socialCred.user.uid;
              logger.info('✅ 네이버/카카오 신규 가입 - Firebase 세션 확보:', newUserId);
            } catch (authError: any) {
              if (authError?.code === 'EMAIL_IN_USE' || authError?.status === 409) {
                toast.error('이 이메일은 이미 사용 중입니다. 로그인 페이지로 이동합니다.');
                router.push('/sign-in');
                return;
              }
              if (authError?.status === 401) {
                toast.error('소셜 인증이 만료되었습니다. 다시 로그인해주세요.');
                signupStorage.clear();
                router.push('/sign-in');
                return;
              }
              throw authError;
            }

            authProvidersData = {
              authProviders: [{
                providerId: normalizedProviderId,
                uid: socialProviderUid || newUserId,
                email,
                linkedAt: now,
                displayName: socialDisplayName || name,
                ...(socialPhotoURL && { photoURL: socialPhotoURL }),
              }],
              primaryAuthMethod: 'social',
            };
          }
        } else {
          // 일반 가입: 새 Firebase Auth 계정 생성
          if (!password) {
            toast.error('비밀번호가 누락되었습니다.');
            router.push('/sign-up/account');
            return;
          }
          const userCredential = await signUp(email, password);
          newUserId = userCredential.user.uid;
          logger.info('✅ 일반 신규 가입 - 새 Auth 계정 생성:', newUserId);
          
          // 일반 가입도 authProviders에 password provider 추가
          authProvidersData = {
            authProviders: [{
              providerId: 'password',
              uid: newUserId,
              email,
              linkedAt: now,
            }],
            primaryAuthMethod: 'password',
          };
        }

        // 서버가 users 문서 생성 + 같은 이메일의 탈퇴 계정 정리 (신규 멘토는 mentor_temp → 관리자 검토 후 승격)
        const p0 = authProvidersData?.authProviders?.[0] ?? {};
        await completeSignupViaApi({
          kind: 'mentor',
          rollbackAuthOnFailure: !socialSignUp,
          provider: { providerId: p0.providerId || 'password', providerUid: p0.uid, displayName: p0.displayName, photoURL: p0.photoURL },
          profile: await buildProfile(),
        });
        logger.info('✅ 가입 완료 (신규):', newUserId);

        // SessionStorage 정리
        signupStorage.clear();

        toast.success('회원가입이 완료되었습니다!');
        
        // 소셜 가입(특히 Apple)은 Auth 상태 변경이 없으므로 AuthContext가 새 Firestore 문서를 인식 못함
        // → 하드 네비게이션으로 AuthContext를 완전히 재초기화
        setTimeout(() => {
          window.location.href = '/profile';
        }, 500);
      }
    } catch (error) {
      logger.error('회원가입 오류:', error);
      // 서버가 준 한국어 안내(전화번호 중복 등)는 그대로 보여 준다
      const msg = String((error as Error)?.message || '');
      toast.error(/[가-힣]/.test(msg) ? msg : '회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!signupData) {
    // 로딩 스피너 표시
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">로딩 중...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout noPadding>
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
        <div className="max-w-2xl w-full">
          {/* 헤더 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
              상세 정보 입력
            </h1>
            <p className="text-gray-600">마지막 단계입니다. 조금만 더 입력해주세요!</p>
          </div>

          <div className="bg-white shadow-xl rounded-2xl lg:px-10 px-6 pt-8 pb-10">
            {/* 진행 표시기 */}
            <ProgressSteps
              currentStep={4}
              totalSteps={4}
              steps={['개인정보', '이메일', '교육정보', '상세정보']}
            />

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* 주소 검색 */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  <div className="flex items-center">
                    <FaMapMarkerAlt className="w-4 h-4 mr-2 text-gray-400" />
                    주소
                  </div>
                </label>
                <div className="flex gap-2">
                  <input
                    disabled
                    className="flex-1 px-4 py-3 border border-gray-300 rounded-lg shadow-sm bg-gray-50"
                    placeholder="주소 검색을 클릭하세요"
                    {...register('address')}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowPostcode(!showPostcode)}
                  >
                    주소 검색
                  </Button>
                </div>
                {showPostcode && (
                  <div className="mt-3 border border-gray-300 rounded-lg overflow-hidden">
                    <DaumPostcode onComplete={handleComplete} />
                  </div>
                )}
                {errors.address && <p className="mt-2 text-sm text-red-600">{errors.address.message}</p>}
              </div>

              {/* 상세 주소 */}
              <FormInput
                label="상세 주소"
                type="text"
                placeholder="동, 호수 등 상세 주소를 입력하세요"
                error={errors.addressDetail?.message}
                {...register('addressDetail')}
              />

              {/* 주민번호 */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  <div className="flex items-center">
                    <FaIdCard className="w-4 h-4 mr-2 text-gray-400" />
                    주민등록번호
                  </div>
                </label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="앞 6자리"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      {...register('rrnFront')}
                    />
                    {errors.rrnFront && <p className="mt-1 text-sm text-red-600">{errors.rrnFront.message}</p>}
                  </div>
                  <span className="flex items-center text-gray-400 text-2xl">-</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        placeholder="0"
                        className="w-14 px-3 py-3 border border-gray-300 rounded-lg shadow-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                        {...register('rrnLast')}
                      />
                      <span className="text-gray-400 tracking-widest">●●●●●●</span>
                    </div>
                    {errors.rrnLast && <p className="mt-1 text-sm text-red-600">{errors.rrnLast.message}</p>}
                    <p className="mt-1 text-xs text-gray-500">뒷자리 전체는 캠프 배정 후 입력합니다.</p>
                  </div>
                </div>
              </div>

              {/* 성별 */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-3">성별</label>
                <div className="flex gap-4">
                  <label className="flex-1 cursor-pointer">
                    <input
                      type="radio"
                      value="M"
                      className="hidden peer"
                      {...register('gender')}
                    />
                    <div className="border-2 border-gray-300 rounded-lg p-4 text-center peer-checked:border-blue-600 peer-checked:bg-blue-50 transition-all hover:border-blue-300">
                      <span className="font-medium">남성</span>
                    </div>
                  </label>
                  <label className="flex-1 cursor-pointer">
                    <input
                      type="radio"
                      value="F"
                      className="hidden peer"
                      {...register('gender')}
                    />
                    <div className="border-2 border-gray-300 rounded-lg p-4 text-center peer-checked:border-blue-600 peer-checked:bg-blue-50 transition-all hover:border-blue-300">
                      <span className="font-medium">여성</span>
                    </div>
                  </label>
                </div>
                {errors.gender && <p className="mt-2 text-sm text-red-600">{errors.gender.message}</p>}
                <p className="mt-2 text-xs text-gray-500">
                  주민번호 입력 시 자동으로 선택되지만, 필요한 경우 수정할 수 있습니다.
                </p>
              </div>

              {/* 가입 경로 */}
              <div>
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  <div className="flex items-center">
                    <FaUsers className="w-4 h-4 mr-2 text-gray-400" />
                    가입 경로
                  </div>
                </label>
                <select
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  {...register('referralPath')}
                >
                  <option value="">어떻게 알게 되셨나요?</option>
                  <option value="에브리타임">에브리타임</option>
                  <option value="학교 커뮤니티">학교 커뮤니티</option>
                  <option value="링커리어">링커리어</option>
                  <option value="캠퍼스픽">캠퍼스픽</option>
                  <option value="인스타그램">인스타그램</option>
                  <option value="페이스북">페이스북</option>
                  <option value="구글/네이버 등 검색">구글/네이버 등 검색</option>
                  <option value="지인 소개">지인 소개</option>
                  <option value="기타">기타</option>
                </select>
                {errors.referralPath && <p className="mt-2 text-sm text-red-600">{errors.referralPath.message}</p>}
              </div>

              {/* 지인 소개인 경우 */}
              {watch('referralPath') === '지인 소개' && (
                <FormInput
                  label="소개해 주신 분의 이름"
                  type="text"
                  placeholder="지인의 이름을 입력해주세요"
                  error={errors.referrerName?.message}
                  {...register('referrerName')}
                />
              )}

              {/* 기타인 경우 */}
              {watch('referralPath') === '기타' && (
                <FormInput
                  label="기타 경로 상세"
                  type="text"
                  placeholder="어떤 경로로 알게 되셨는지 입력해주세요"
                  {...register('otherReferralDetail')}
                />
              )}

              {/* 개인정보 동의 */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <label className="flex items-start cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 mt-0.5 flex-shrink-0"
                    id="agreedPersonal"
                    {...register('agreedPersonal')}
                  />
                  <div className="ml-3">
                    <span className="text-sm font-medium text-gray-900">
                      <a href="/terms-of-service" target="_blank" rel="noreferrer" className="text-blue-600 underline">이용약관</a> 및 <a href="/privacy-policy" target="_blank" rel="noreferrer" className="text-blue-600 underline">개인정보 수집·이용</a>에 동의합니다 <span className="text-red-500">*</span>
                    </span>
                    <p className="text-xs text-gray-600 mt-1">
                      회원가입을 위해 필요한 최소한의 개인정보를 수집하며, 관련 법령에 따라 안전하게 관리됩니다.
                    </p>
                  </div>
                </label>
                {errors.agreedPersonal && <p className="mt-2 text-sm text-red-600">{errors.agreedPersonal.message}</p>}
              </div>

              {/* 완료 안내 */}
              {/* <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center">
                  <FaCheckCircle className="w-6 h-6 text-blue-600 mr-3 flex-shrink-0" />
                  <div className="text-sm text-blue-900">
                    <p className="font-semibold mb-1">거의 다 끝났습니다!</p>
                    <p className="text-blue-700">가입 완료 버튼을 누르면 SMIS 멘토로 지원하실 수 있습니다.</p>
                  </div>
                </div>
              </div> */}

              {/* 버튼 그룹 */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                  className="flex-1"
                >
                  이전
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isLoading}
                  className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  가입 완료
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
} 