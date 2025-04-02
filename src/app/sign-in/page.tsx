'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import toast from 'react-hot-toast';
import { signIn } from '@/lib/firebaseService';
import Layout from '@/components/common/Layout';
import FormInput from '@/components/common/FormInput';
import Button from '@/components/common/Button';
import { FirebaseError } from 'firebase/app';

const loginSchema = z.object({
  email: z.string().email('유효한 이메일 주소를 입력해주세요.'),
  password: z.string().min(6, '비밀번호는 최소 6자 이상이어야 합니다.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function SignIn() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });
  
  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    try {
      await signIn(data.email, data.password);
      toast.success('로그인에 성공했습니다.');
      
      // URL에서 redirect 매개변수 확인
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get('redirect');
      
      // 지연 후 리디렉션
      setTimeout(() => {
        // redirectTo가 있으면 해당 경로로, 없으면 메인 페이지로 이동
        router.push(redirectTo || '/');
      }, 1000);
    } catch (error) {
      console.error('로그인 오류:', error);
      const firebaseError = error as FirebaseError;
      if (firebaseError.code === 'auth/user-not-found' || firebaseError.code === 'auth/wrong-password') {
        toast.error('이메일 또는 비밀번호가 올바르지 않습니다.');
      } else if (firebaseError.code === 'auth/too-many-requests') {
        toast.error('너무 많은 로그인 시도가 있었습니다. 나중에 다시 시도해주세요.');
      } else {
        toast.error('로그인 중 오류가 발생했습니다.');
      }
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Layout>
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-center mb-6">로그인</h1>
        
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white shadow-md rounded lg:px-8 px-4 pt-6 pb-8 mb-4">
          <FormInput
            label="이메일"
            type="email"
            placeholder="이메일 주소를 입력하세요"
            error={errors.email?.message}
            {...register('email')}
          />
          
          <FormInput
            label="비밀번호"
            type="password"
            placeholder="비밀번호를 입력하세요"
            error={errors.password?.message}
            {...register('password')}
          />
          
          <div className="flex items-center justify-between mt-6">
            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isLoading}
            >
              로그인
            </Button>
          </div>
          
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              계정이 없으신가요?{' '}
              <Link
                href="/sign-up"
                className="text-blue-600 hover:text-blue-800"
              >
                회원가입
              </Link>
            </p>
          </div>
        </form>
      </div>
    </Layout>
  );
} 