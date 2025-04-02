'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { getUserByEmail } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';

// 비밀번호 검증 정규식
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;

const accountSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  password: z.string()
    .min(8, '비밀번호는 최소 8자 이상이어야 합니다.')
    .regex(passwordRegex, '비밀번호는 문자, 숫자, 특수문자를 포함해야 합니다.'),
  confirmPassword: z.string()
    .min(8, '비밀번호 확인은 최소 8자 이상이어야 합니다.'),
}).refine((data) => data.password === data.confirmPassword, {
  message: '비밀번호가 일치하지 않습니다.',
  path: ['confirmPassword'],
});

type AccountFormValues = z.infer<typeof accountSchema>;

export default function SignUpAccount() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [emailExists, setEmailExists] = useState(false);

  const name = searchParams.get('name');
  const phoneNumber = searchParams.get('phone');

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
  });

  // 현재 입력된 이메일을 실시간으로 감시
  const currentEmail = watch('email');

  // 이메일 입력 필드에서 focus가 벗어났을 때 중복 확인
  const handleEmailBlur = async () => {
    if (currentEmail && !errors.email) {
      try {
        const existingUser = await getUserByEmail(currentEmail);
        setEmailExists(!!existingUser);
      } catch (error) {
        console.error('이메일 중복 확인 오류:', error);
      }
    }
  };

  const onSubmit = async (data: AccountFormValues) => {
    setIsLoading(true);
    try {
      // 마지막으로 이메일 중복 확인
      const existingUser = await getUserByEmail(data.email);
      if (existingUser) {
        setEmailExists(true);
        setIsLoading(false);
        return;
      }

      // 다음 단계로 이동
      router.push(`/sign-up/education?name=${name}&phone=${phoneNumber}&email=${data.email}&password=${encodeURIComponent(data.password)}`);
    } catch (error) {
      console.error('계정 정보 확인 오류:', error);
      toast.error('계정 정보 확인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!name || !phoneNumber) {
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

  return (
    <Layout>
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-center mb-2">회원가입</h1>
        <p className="text-gray-600 text-center mb-6">계정 정보를 입력해주세요</p>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow-md rounded lg:px-8 px-4 pt-6 pb-8 mb-4">
          <div className="mb-2 text-sm font-medium text-gray-700">
            2/4 단계: 계정 정보
          </div>

          
          <FormInput
            label="이메일"
            type="email"
            placeholder="이메일 주소를 입력하세요"
            error={emailExists ? '이미 사용 중인 이메일입니다.' : errors.email?.message}
            {...register('email', {
              onBlur: handleEmailBlur
            })}
          />
          <p className="text-xs text-red-500 mt-0 mb-3">이메일에 오타가 없는지 다시 한 번 확인해주세요</p>

          <div className="mb-2">
            <FormInput
              label="비밀번호"
              type="password"
              placeholder="비밀번호를 입력하세요"
              error={errors.password?.message}
              showPasswordToggle={true}
              {...register('password')}
            />
            <p className="text-xs text-red-500 mt-1">
              비밀번호는 8자 이상, 문자, 숫자, 특수문자를 포함해야 합니다
            </p>
          </div>

          <FormInput
            label="비밀번호 확인"
            type="password"
            placeholder="비밀번호를 다시 입력하세요"
            error={errors.confirmPassword?.message}
            showPasswordToggle={true}
            {...register('confirmPassword')}
          />

          <div className="flex items-center justify-between mt-6 space-x-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/sign-up')}
            >
              이전
            </Button>
            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isLoading}
              disabled={emailExists}
            >
              다음
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
} 