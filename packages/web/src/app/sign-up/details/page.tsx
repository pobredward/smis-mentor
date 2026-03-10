'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import DaumPostcode, { Address } from 'react-daum-postcode';
import toast from 'react-hot-toast';
import { getUserByPhone, updateUser, createUser, signUp } from '@/lib/firebaseService';
import { getUserInfoFromRRN } from '@/utils/userUtils';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import ProgressSteps from '@/components/common/ProgressSteps';
import { Timestamp } from 'firebase/firestore';
import { FaMapMarkerAlt, FaIdCard, FaUsers, FaCheckCircle } from 'react-icons/fa';

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
  otherReferralDetail: z.string().optional(),
});

type DetailsFormValues = z.infer<typeof detailsSchema>;

export default function SignUpDetails() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [showPostcode, setShowPostcode] = useState(false);

  // URL 파라미터 디코딩
  const name = searchParams.get('name') ? decodeURIComponent(searchParams.get('name') as string) : null;
  const phoneNumber = searchParams.get('phone') ? decodeURIComponent(searchParams.get('phone') as string) : null;
  const email = searchParams.get('email') ? decodeURIComponent(searchParams.get('email') as string) : null;
  const password = searchParams.get('password');
  const university = searchParams.get('university') ? decodeURIComponent(searchParams.get('university') as string) : null;
  const grade = searchParams.get('grade');
  const isOnLeave = searchParams.get('isOnLeave');
  const major1 = searchParams.get('major1') ? decodeURIComponent(searchParams.get('major1') as string) : null;
  const major2 = searchParams.get('major2') ? decodeURIComponent(searchParams.get('major2') as string) : null;
  const role = searchParams.get('role') as 'mentor' | 'foreign' | null;

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
      
      // 기타 경로 상세 정보 처리
      let referralPathValue = data.referralPath;
      if (data.referralPath === '기타' && data.otherReferralDetail) {
        referralPathValue = `기타: ${data.otherReferralDetail}`;
      }
      
      if (existingUser && existingUser.status === 'temp') {
        // Firebase Auth에 사용자 등록
        const userCredential = await signUp(email, decodeURIComponent(password));
        
        const now = Timestamp.now();
        
        // 교육 정보 추가
        const gradeNum = parseInt(grade, 10);
        const isOnLeaveVal = isOnLeave === 'true';

        // role 결정 로직: 회원가입 시 선택한 role이 있으면 사용, 없으면 임시 사용자의 role을 정식 role로 변환
        let finalRole = role;
        if (!finalRole && existingUser.role) {
          // mentor_temp -> mentor, foreign_temp -> foreign 변환
          if (existingUser.role === 'mentor_temp') {
            finalRole = 'mentor';
          } else if (existingUser.role === 'foreign_temp') {
            finalRole = 'foreign';
          } else {
            finalRole = existingUser.role;
          }
        }
        if (!finalRole) finalRole = 'mentor'; // 기본값

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
          referralPath: referralPathValue,
          referrerName: data.referrerName,
          selfIntroduction: '',
          jobMotivation: '',
          status: 'active',
          role: finalRole,
          isEmailVerified: false,
          updatedAt: now,
          lastLoginAt: now,
          university,
          grade: gradeNum,
          isOnLeave: isOnLeaveVal,
          major1,
          major2: major2 || ''
        });
        
        toast.success('회원가입이 완료되었습니다!');
        
        // 멘토인 경우 프로필 작성 유도
        if (finalRole === 'mentor') {
          setTimeout(() => {
            toast.success('프로필 사진과 자기소개서 & 지원동기를 작성해주세요!', { duration: 5000 });
          }, 500);
          router.push('/profile/edit');
        } else {
          router.push('/');
        }
      } else {
        // Firebase Auth에 사용자 등록
        const userCredential = await signUp(email, decodeURIComponent(password));

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
          referralPath: referralPathValue,
          referrerName: data.referrerName,
          profileImage: '',
          role: role || 'mentor',
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

        toast.success('회원가입이 완료되었습니다!');
        
        // 멘토인 경우 프로필 작성 유도
        if (role === 'mentor') {
          setTimeout(() => {
            toast.success('프로필 사진과 자기소개서 & 지원동기를 작성해주세요!', { duration: 5000 });
          }, 500);
          router.push('/profile/edit');
        } else {
          router.push('/');
        }
      }
    } catch (error) {
      console.error('회원가입 오류:', error);
      toast.error('회원가입 중 오류가 발생했습니다.');
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
                    <FormInput
                      type="password"
                      maxLength={7}
                      placeholder="뒤 7자리"
                      error={errors.rrnLast?.message}
                      showPasswordToggle={true}
                      {...register('rrnLast')}
                    />
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
                      개인정보 수집 및 이용에 동의합니다 <span className="text-red-500">*</span>
                    </span>
                    <p className="text-xs text-gray-600 mt-1">
                      회원가입을 위해 필요한 최소한의 개인정보를 수집하며, 관련 법령에 따라 안전하게 관리됩니다.
                    </p>
                  </div>
                </label>
                {errors.agreedPersonal && <p className="mt-2 text-sm text-red-600">{errors.agreedPersonal.message}</p>}
              </div>

              {/* 완료 안내 */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center">
                  <FaCheckCircle className="w-6 h-6 text-blue-600 mr-3 flex-shrink-0" />
                  <div className="text-sm text-blue-900">
                    <p className="font-semibold mb-1">거의 다 끝났습니다!</p>
                    <p className="text-blue-700">가입 완료 버튼을 누르면 SMIS 멘토로 활동하실 수 있습니다.</p>
                  </div>
                </div>
              </div>

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