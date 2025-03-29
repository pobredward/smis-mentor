'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import DaumPostcode, { Address } from 'react-daum-postcode';
import toast from 'react-hot-toast';
import { getUserByPhone, updateUser, createUser } from '@/lib/firebaseService';
import { getUserInfoFromRRN } from '@/utils/userUtils';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import { Timestamp } from 'firebase/firestore';
import { signUp, sendVerificationEmail } from '@/lib/firebaseService';

const detailsSchema = z.object({
  address: z.string().min(1, '주소를 입력해주세요.'),
  addressDetail: z.string().min(1, '상세 주소를 입력해주세요.'),
  rrnFront: z.string().length(6, '주민번호 앞자리 6자리를 입력해주세요.'),
  rrnLast: z.string().length(7, '주민번호 뒷자리 7자리를 입력해주세요.'),
  gender: z.enum(['M', 'F'], {
    errorMap: () => ({ message: '성별을 선택해주세요.' }),
  }),
  referralPath: z.string().min(1, '가입 경로를 선택해주세요.'),
  referrerName: z.string().optional(),
  agreedPersonal: z.boolean().refine(val => val === true, {
    message: '개인정보 수집 및 이용에 동의해주세요.',
  }),
});

type DetailsFormValues = z.infer<typeof detailsSchema>;

export default function SignUpDetails() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [showPostcode, setShowPostcode] = useState(false);

  const name = searchParams.get('name');
  const phoneNumber = searchParams.get('phone');
  const email = searchParams.get('email');
  const password = searchParams.get('password');
  const university = searchParams.get('university');
  const grade = searchParams.get('grade');
  const isOnLeave = searchParams.get('isOnLeave');
  const major1 = searchParams.get('major1');
  const major2 = searchParams.get('major2');

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
    if (rrnFront?.length === 6 && rrnLast?.length === 7) {
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

  if (!name || !phoneNumber || !email || !password || !university || !grade || !major1) {
    return (
      <Layout>
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">오류</h1>
          <p className="text-gray-600 mb-4">필수 정보가 누락되었습니다.</p>
          <Button
            variant="primary"
            onClick={() => router.push('/sign-up')}
          >
            회원가입으로 돌아가기
          </Button>
        </div>
      </Layout>
    );
  }

  const onSubmit = async (data: DetailsFormValues) => {
    setIsLoading(true);
    try {
      // 주민번호를 통해 나이 계산
      const { age } = getUserInfoFromRRN(data.rrnFront, data.rrnLast);

      // 전화번호로 기존 임시 사용자 조회
      const existingUser = await getUserByPhone(phoneNumber);
      
      if (existingUser && existingUser.status === 'temp') {
        // Firebase Auth에 사용자 등록
        const userCredential = await signUp(email, decodeURIComponent(password));
        // 이메일 인증 메일 발송
        await sendVerificationEmail(userCredential.user);
        
        const now = Timestamp.now();
        
        // 교육 정보 추가
        const gradeNum = parseInt(grade, 10);
        const isOnLeaveVal = isOnLeave === 'true';

        // 기존 임시 사용자 문서 업데이트
        await updateUser(existingUser.userId, {
          email,
          address: data.address,
          addressDetail: data.addressDetail,
          rrnFront: data.rrnFront,
          rrnLast: data.rrnLast,
          gender: data.gender,
          age,
          agreedPersonal: data.agreedPersonal,
          referralPath: data.referralPath,
          referrerName: data.referrerName,
          selfIntroduction: '',
          jobMotivation: '',
          status: 'active',
          isEmailVerified: false,
          updatedAt: now,
          lastLoginAt: now,
          university,
          grade: gradeNum,
          isOnLeave: isOnLeaveVal,
          major1,
          major2: major2 || ''
        });
        
        toast.success('회원가입이 완료되었습니다. 이메일 인증을 위한 메일을 발송했습니다.');
        router.push('/');
      } else {
        // Firebase Auth에 사용자 등록
        const userCredential = await signUp(email, decodeURIComponent(password));
        // 이메일 인증 메일 발송
        await sendVerificationEmail(userCredential.user);

        const now = Timestamp.now();

        // 교육 정보 추가
        const gradeNum = parseInt(grade, 10);
        const isOnLeaveVal = isOnLeave === 'true';

        // Firestore에 사용자 정보 저장
        await createUser({
          name,
          phoneNumber,
          email,
          password: '',  // 보안상 Firebase에만 저장
          address: data.address,
          addressDetail: data.addressDetail,
          rrnFront: data.rrnFront,
          rrnLast: data.rrnLast,
          gender: data.gender,
          age,
          agreedPersonal: data.agreedPersonal,
          referralPath: data.referralPath,
          referrerName: data.referrerName,
          profileImage: '',
          role: 'mentor',
          status: 'active',
          isEmailVerified: false,
          jobExperiences: [],
          selfIntroduction: '',
          jobMotivation: '',
          feedback: '',
          lastLoginAt: now,
          university,
          grade: gradeNum,
          isOnLeave: isOnLeaveVal,
          major1,
          major2: major2 || '',
          agreedTerms: true,
          isPhoneVerified: true,
          isProfileCompleted: false,
          isTermsAgreed: true,
          isPersonalAgreed: true,
          isAddressVerified: true,
          isProfileImageUploaded: false,
          createdAt: now,
          updatedAt: now
        });

        toast.success('회원가입이 완료되었습니다. 이메일 인증을 위한 메일을 발송했습니다.');
        router.push('/');
      }
    } catch (error) {
      console.error('회원가입 오류:', error);
      toast.error('회원가입 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-center mb-2">회원가입</h1>
        <p className="text-gray-600 text-center mb-6">상세 정보를 입력해주세요</p>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow-md rounded lg:px-8 px-4 pt-6 pb-8 mb-4">
          <div className="mb-2 text-sm font-medium text-gray-700">
            4/4 단계: 상세 정보
          </div>

          <div className="w-full mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-1">주소</label>
            <div className="flex mb-2">
              <input
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="주소 검색을 클릭하세요"
                {...register('address')}
              />
              <Button
                type="button"
                className="ml-2"
                variant="secondary"
                onClick={() => setShowPostcode(!showPostcode)}
              >
                주소 검색
              </Button>
            </div>
            {showPostcode && (
              <div className="mb-2 border border-gray-300 rounded-md">
                <DaumPostcode onComplete={handleComplete} />
              </div>
            )}
            {errors.address && <p className="mt-1 text-sm text-red-600">{errors.address.message}</p>}
          </div>

          <FormInput
            label="상세 주소"
            type="text"
            placeholder="상세 주소를 입력하세요"
            error={errors.addressDetail?.message}
            {...register('addressDetail')}
          />

          <div className="flex space-x-2">
            <div className="w-1/2">
              <FormInput
                label="주민번호 앞자리"
                type="text"
                maxLength={6}
                placeholder="앞 6자리"
                error={errors.rrnFront?.message}
                {...register('rrnFront')}
              />
            </div>
            <div className="w-1/2">
              <FormInput
                label="주민번호 뒷자리"
                type="password"
                maxLength={7}
                placeholder="뒤 7자리"
                error={errors.rrnLast?.message}
                showPasswordToggle={true}
                {...register('rrnLast')}
              />
            </div>
          </div>

          <div className="w-full mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-1">성별</label>
            <div className="flex space-x-4">
              <div className="flex items-center">
                <input
                  type="radio"
                  id="gender-male"
                  value="M"
                  className="h-4 w-4 text-blue-600 border-gray-300"
                  {...register('gender')}
                />
                <label htmlFor="gender-male" className="ml-2 block text-sm text-gray-700">
                  남성
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="radio"
                  id="gender-female"
                  value="F"
                  className="h-4 w-4 text-blue-600 border-gray-300"
                  {...register('gender')}
                />
                <label htmlFor="gender-female" className="ml-2 block text-sm text-gray-700">
                  여성
                </label>
              </div>
            </div>
            {errors.gender && <p className="mt-1 text-sm text-red-600">{errors.gender.message}</p>}
            <p className="mt-1 text-xs text-gray-500">
              주민번호 입력 시 자동으로 선택되지만, 필요한 경우 수정할 수 있습니다.
            </p>
          </div>

          <div className="w-full mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-1">가입 경로</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              {...register('referralPath')}
            >
              <option value="">선택해주세요</option>
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
            {errors.referralPath && <p className="mt-1 text-sm text-red-600">{errors.referralPath.message}</p>}
          </div>

          {watch('referralPath') === '지인 소개' && (
            <div className="w-full mb-4">
              <FormInput
                label="소개해 주신 분의 이름"
                type="text"
                placeholder="지인의 이름을 입력해주세요"
                error={errors.referrerName?.message}
                {...register('referrerName')}
              />
            </div>
          )}
          
          {watch('referralPath') === '기타' && (
            <div className="w-full mb-4">
              <FormInput
                label="기타 경로"
                type="text"
                placeholder="경로를 입력해주세요"
                error={errors.referrerName?.message}
                {...register('referrerName')}
              />
            </div>

          )}

          <div className="w-full mb-6">
            <div className="flex items-center">
              <input
                type="checkbox"
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                id="agreedPersonal"
                {...register('agreedPersonal')}
              />
              <label htmlFor="agreedPersonal" className="ml-2 block text-sm text-gray-700">
                개인정보 수집 및 이용에 동의합니다.
              </label>
            </div>
            {errors.agreedPersonal && <p className="mt-1 text-sm text-red-600">{errors.agreedPersonal.message}</p>}
          </div>

          <div className="flex items-center justify-between mt-6 space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              이전
            </Button>
            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isLoading}
            >
              가입 완료
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
} 