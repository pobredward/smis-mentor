'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import ProgressSteps from '@/components/common/ProgressSteps';
import { FaUniversity, FaGraduationCap, FaBook } from 'react-icons/fa';

const educationSchema = z.object({
  university: z.string().min(1, '학교명을 입력해주세요.'),
  grade: z.number({
    required_error: '학년을 선택해주세요.',
    invalid_type_error: '학년을 선택해주세요.',
  }).min(1, '학년을 선택해주세요.').max(7, '유효한 학년을 선택해주세요.'),
  isOnLeave: z.boolean().nullable(),
  major1: z.string().min(1, '전공을 입력해주세요.'),
  major2: z.string().optional(),
});

type EducationFormValues = z.infer<typeof educationSchema>;

export default function SignUpEducation() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  // URL 파라미터 디코딩
  const name = searchParams.get('name') ? decodeURIComponent(searchParams.get('name') as string) : null;
  const phoneNumber = searchParams.get('phone') ? decodeURIComponent(searchParams.get('phone') as string) : null;
  const email = searchParams.get('email') ? decodeURIComponent(searchParams.get('email') as string) : null;
  const password = searchParams.get('password');

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
    setValue,
  } = useForm<EducationFormValues>({
    resolver: zodResolver(educationSchema),
    defaultValues: {
      university: '',
      grade: undefined,
      isOnLeave: false,
      major1: '',
      major2: '',
    },
  });

  // 학년 값을 감시
  const grade = useWatch({
    control,
    name: 'grade',
  });

  // 졸업생일 경우 isOnLeave 값을 null로 설정
  useEffect(() => {
    if (grade === 6) {
      setValue('isOnLeave', null);
    } else if (grade && grade !== 6) {
      // 다른 학년으로 변경되었다면 기본값으로 복원
      setValue('isOnLeave', false);
    }
  }, [grade, setValue]);

  if (!name || !phoneNumber || !email || !password) {
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

  const onSubmit = async (data: EducationFormValues) => {
    setIsLoading(true);
    try {
      // 졸업생인 경우 isOnLeave를 null로 설정
      if (data.grade === 6) {
        data.isOnLeave = null;
      }
      
      // 다음 단계로 이동
      router.push(`/sign-up/details?name=${encodeURIComponent(name || '')}&phone=${encodeURIComponent(phoneNumber || '')}&email=${encodeURIComponent(email || '')}&password=${encodeURIComponent(password || '')}&university=${encodeURIComponent(data.university)}&grade=${data.grade}&isOnLeave=${data.isOnLeave}&major1=${encodeURIComponent(data.major1)}&major2=${encodeURIComponent(data.major2 || '')}`);
    } catch (error) {
      console.error('교육 정보 확인 오류:', error);
      toast.error('교육 정보 확인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout noPadding>
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
        <div className="max-w-lg w-full">
          {/* 헤더 */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
              교육 정보 입력
            </h1>
            <p className="text-gray-600">재학 중인 대학교와 전공 정보를 입력하세요</p>
          </div>

          <div className="bg-white shadow-xl rounded-2xl lg:px-10 px-6 pt-8 pb-10">
            {/* 진행 표시기 */}
            <ProgressSteps
              currentStep={3}
              totalSteps={4}
              steps={['개인정보', '이메일', '교육정보', '상세정보']}
            />

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* 학교 입력 */}
              <div className="relative">
                <div className="absolute left-3 top-[38px] text-gray-400">
                  <FaUniversity className="w-5 h-5" />
                </div>
                <FormInput
                  label="학교"
                  type="text"
                  placeholder="예: 서울대학교"
                  error={errors.university?.message}
                  className="pl-12"
                  {...register('university')}
                />
              </div>

              {/* 학년 선택 */}
              <div className="relative">
                <label className="block text-gray-700 text-sm font-medium mb-2">
                  <div className="flex items-center">
                    <FaGraduationCap className="w-4 h-4 mr-2 text-gray-400" />
                    학년
                  </div>
                </label>
                <select
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  {...register('grade', { valueAsNumber: true })}
                >
                  <option value="">학년 선택</option>
                  <option value="1">1학년</option>
                  <option value="2">2학년</option>
                  <option value="3">3학년</option>
                  <option value="4">4학년</option>
                  <option value="5">5학년</option>
                  <option value="6">졸업생</option>
                </select>
                {errors.grade && <p className="mt-2 text-sm text-red-600">{errors.grade.message}</p>}
              </div>

              {/* 학년이 졸업생(6)이 아닐 때만 휴학 중 토글 표시 */}
              {grade !== 6 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 transition-all"
                      id="isOnLeave"
                      {...register('isOnLeave')}
                    />
                    <span className="ml-3 text-sm font-medium text-blue-900">
                      현재 휴학 중입니다
                    </span>
                  </label>
                </div>
              )}

              {/* 1전공 입력 */}
              <div className="relative">
                <div className="absolute left-3 top-[38px] text-gray-400">
                  <FaBook className="w-5 h-5" />
                </div>
                <FormInput
                  label="전공 (1전공)"
                  type="text"
                  placeholder="예: 컴퓨터공학"
                  error={errors.major1?.message}
                  className="pl-12"
                  {...register('major1')}
                />
              </div>

              {/* 2전공 입력 */}
              <div className="relative">
                <div className="absolute left-3 top-[38px] text-gray-400">
                  <FaBook className="w-5 h-5" />
                </div>
                <FormInput
                  label="전공 (2전공/부전공)"
                  type="text"
                  placeholder="2전공이 있는 경우 입력하세요 (선택사항)"
                  error={errors.major2?.message}
                  className="pl-12"
                  {...register('major2')}
                />
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
                  className="flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                >
                  다음
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
} 