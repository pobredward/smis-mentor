'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';

const educationSchema = z.object({
  university: z.string().min(1, '학교명을 입력해주세요.'),
  grade: z.number({
    required_error: '학년을 선택해주세요.',
    invalid_type_error: '학년을 선택해주세요.',
  }).min(1, '학년을 선택해주세요.').max(6, '유효한 학년을 선택해주세요.'),
  isOnLeave: z.boolean(),
  major1: z.string().min(1, '전공을 입력해주세요.'),
  major2: z.string().optional(),
});

type EducationFormValues = z.infer<typeof educationSchema>;

export default function SignUpEducation() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);

  const name = searchParams.get('name');
  const phoneNumber = searchParams.get('phone');
  const email = searchParams.get('email');
  const password = searchParams.get('password');

  const {
    register,
    handleSubmit,
    formState: { errors },
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
      // 다음 단계로 이동
      router.push(`/sign-up/details?name=${name}&phone=${phoneNumber}&email=${email}&password=${password}&university=${encodeURIComponent(data.university)}&grade=${data.grade}&isOnLeave=${data.isOnLeave}&major1=${encodeURIComponent(data.major1)}&major2=${encodeURIComponent(data.major2 || '')}`);
    } catch (error) {
      console.error('교육 정보 확인 오류:', error);
      toast.error('교육 정보 확인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-center mb-2">회원가입</h1>
        <p className="text-gray-600 text-center mb-6">교육 정보를 입력해주세요</p>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow-md rounded lg:px-8 px-4 pt-6 pb-8 mb-4">
          <div className="mb-2 text-sm font-medium text-gray-700">
            3/4 단계: 교육 정보
          </div>

          <FormInput
            label="학교"
            type="text"
            placeholder="학교명을 입력하세요"
            error={errors.university?.message}
            {...register('university')}
          />

          <div className="w-full mb-4">
            <label className="block text-gray-700 text-sm font-medium mb-1">학년</label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              {...register('grade', { valueAsNumber: true })}
            >
              <option value="">학년 선택</option>
              <option value="1">1학년</option>
              <option value="2">2학년</option>
              <option value="3">3학년</option>
              <option value="4">4학년</option>
              <option value="5">5학년</option>
              <option value="6">6학년</option>
            </select>
            {errors.grade && <p className="mt-1 text-sm text-red-600">{errors.grade.message}</p>}
          </div>

          <div className="w-full mb-4">
            <div className="flex items-center">
              <input
                type="checkbox"
                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                id="isOnLeave"
                {...register('isOnLeave')}
              />
              <label htmlFor="isOnLeave" className="ml-2 block text-sm text-gray-700">
                현재 휴학 중
              </label>
            </div>
          </div>

          <FormInput
            label="전공 (1전공)"
            type="text"
            placeholder="1전공을 입력하세요"
            error={errors.major1?.message}
            {...register('major1')}
          />

          <FormInput
            label="전공 (2전공/부전공)"
            type="text"
            placeholder="2전공이 있는 경우 입력하세요 (선택사항)"
            error={errors.major2?.message}
            {...register('major2')}
          />

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
              다음
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
} 